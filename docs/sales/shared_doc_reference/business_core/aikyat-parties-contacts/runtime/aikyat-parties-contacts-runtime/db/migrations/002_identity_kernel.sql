-- 002 · Identity kernel: private_anchor, party, contact, identity_merge.
--
-- Model §4. One workspace-local private identity, and the two public facets
-- it may carry. This file also defines the conventions every later file uses,
-- because this is the first file with workspace-owned rows.
--
-- ── conventions for every workspace-owned table ──────────────────────────────
--
-- WORKSPACE. Every row carries workspace_id, text, the type Control Plane's
-- own workspace key has. Every reference to another workspace-owned row is a
-- COMPOSITE foreign key that carries workspace_id, so a row can only ever
-- point at a row of its own workspace. Row-level security alone would not
-- give that: foreign-key checks do not go through policies.
--
-- ROW-LEVEL SECURITY. Enabled AND forced, failing closed on a per-request
-- setting, the pattern Chat's schema uses and the only one in the estate:
--
--     SELECT set_config('app.current_workspace', '<workspace id>', true);
--
-- With the setting absent the policy compares against NULL and matches no
-- row. One refinement over Chat's text: the setting is passed through
-- NULLIF(.., ''). Once a session has set a custom setting, Postgres reports
-- it as an EMPTY STRING rather than NULL after the transaction ends, and the
-- NULLIF makes that case fail closed too instead of depending on no row
-- ever having an empty workspace_id.
--
-- A SUPERUSER, AND ANY ROLE WITH BYPASSRLS, IGNORES ALL OF THIS, forced or
-- not. The API must reach these tables as a role that is neither. Which role
-- that is, and how the API takes it, is decided with the first read (Step 4).
--
-- TWO CLOCKS. since / until describe the business world. recorded_at and
-- updated_at describe what Aikyat knows and when.
--   since, until   date, both optional. A half-open period [since, until).
--                  Empty means NOT KNOWN: never "from forever", never "still
--                  current", never "inactive".
--   recorded_at    when Aikyat first recorded this row. Immutable.
--   updated_at     when the row was last changed. Maintained by trigger.
-- Two meanings, two columns. A recorded_at refreshed on update would stop
-- meaning "when we learned it".
--
-- NO status AND NO is_active COLUMN, ANYWHERE. Whether something is current
-- is derived from since / until.
--
-- KEYS. uuid, generated here. party_id, contact_id and anchor_id are THE SAME
-- VALUE for one identity: party and contact do not generate keys, they take
-- their anchor's.
--
-- TRIGGER-ENFORCED RULES RAISE check_violation (SQLSTATE 23514) AND NAME
-- THEMSELVES, the same way a declared CHECK does, so a caller and a test can
-- tell which rule refused the row without reading message text.

-- ── helpers ──────────────────────────────────────────────────────────────────

CREATE FUNCTION pc.isolate_by_workspace(target regclass) RETURNS void
LANGUAGE plpgsql AS $function$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
  EXECUTE format(
    'CREATE POLICY workspace_isolation ON %s '
    'USING (workspace_id = NULLIF(current_setting(''app.current_workspace'', true), '''')) '
    'WITH CHECK (workspace_id = NULLIF(current_setting(''app.current_workspace'', true), ''''))',
    target);
END;
$function$;
COMMENT ON FUNCTION pc.isolate_by_workspace(regclass) IS
  'Puts one workspace-owned table under fail-closed row-level security. Called once per table by the migration that creates it.';

CREATE FUNCTION pc.keep_recorded_at_and_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.recorded_at IS DISTINCT FROM OLD.recorded_at THEN
    RAISE EXCEPTION 'recorded_at is when Aikyat first recorded this % row and cannot be changed', TG_TABLE_NAME
      USING ERRCODE = 'check_violation', CONSTRAINT = 'recorded_at_is_immutable',
            SCHEMA = TG_TABLE_SCHEMA, TABLE = TG_TABLE_NAME, COLUMN = 'recorded_at';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE FUNCTION pc.keep_recorded_at() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.recorded_at IS DISTINCT FROM OLD.recorded_at THEN
    RAISE EXCEPTION 'recorded_at is when Aikyat first recorded this % row and cannot be changed', TG_TABLE_NAME
      USING ERRCODE = 'check_violation', CONSTRAINT = 'recorded_at_is_immutable',
            SCHEMA = TG_TABLE_SCHEMA, TABLE = TG_TABLE_NAME, COLUMN = 'recorded_at';
  END IF;
  RETURN NEW;
END;
$function$;

-- For rows that are never changed once written. The constraint name is the
-- trigger's argument, so each table reports its own rule.
CREATE FUNCTION pc.refuse_change() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION '% rows are not changed once written (% refused)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'check_violation', CONSTRAINT = TG_ARGV[0],
          SCHEMA = TG_TABLE_SCHEMA, TABLE = TG_TABLE_NAME;
END;
$function$;

-- A reference to a Contact that only some Contact kinds may fill.
--   TG_ARGV[0]  the referencing column
--   TG_ARGV[1]  the permitted contact kinds, comma separated
--   TG_ARGV[2]  the name this rule reports
-- contact_kind cannot change after insert (it is bound to an immutable
-- anchor), so checking when the reference is written is the whole check.
CREATE FUNCTION pc.require_contact_kind() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE
  v_contact_id uuid;
  v_kind       text;
BEGIN
  EXECUTE format('SELECT ($1).%I', TG_ARGV[0]) USING NEW INTO v_contact_id;
  IF v_contact_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT contact_kind INTO v_kind FROM pc.contact WHERE contact_id = v_contact_id;
  IF NOT FOUND THEN
    RETURN NEW;  -- a missing Contact is the foreign key's to report
  END IF;
  IF NOT (v_kind = ANY (string_to_array(TG_ARGV[1], ','))) THEN
    RAISE EXCEPTION '%.% must refer to a % contact, and this one is a %',
        TG_TABLE_NAME, TG_ARGV[0], replace(TG_ARGV[1], ',', ' or '), v_kind
      USING ERRCODE = 'check_violation', CONSTRAINT = TG_ARGV[2],
            SCHEMA = TG_TABLE_SCHEMA, TABLE = TG_TABLE_NAME, COLUMN = TG_ARGV[0];
  END IF;
  RETURN NEW;
END;
$function$;

-- ── private_anchor ───────────────────────────────────────────────────────────

CREATE TABLE pc.private_anchor (
  anchor_id    uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id text        NOT NULL,
  anchor_kind  text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT private_anchor_pkey PRIMARY KEY (anchor_id),
  CONSTRAINT private_anchor_kind_valid
    CHECK (anchor_kind IN ('person', 'organization', 'system', 'destination')),
  -- What party and contact reference: workspace, identity and kind together.
  CONSTRAINT private_anchor_workspace_identity_kind_key UNIQUE (workspace_id, anchor_id, anchor_kind),
  CONSTRAINT private_anchor_workspace_identity_key UNIQUE (workspace_id, anchor_id)
);
COMMENT ON TABLE pc.private_anchor IS
  'One workspace-local canonical identity, used internally to keep the Party and Contact facets coherent. NEVER exposed: not as an API resource, a reference type, a partner identifier or a user-facing concept. Consumers use PartyRef or ContactRef. created_at is its recording time.';
COMMENT ON COLUMN pc.private_anchor.anchor_kind IS
  'person, organization, system or destination. Immutable. Kind correction is an exceptional governed repair, not a business lifecycle, and is not an UPDATE of this column.';

-- The anchor never changes: not its kind, not its workspace, not its identity.
CREATE TRIGGER private_anchor_is_immutable
  BEFORE UPDATE ON pc.private_anchor
  FOR EACH ROW EXECUTE FUNCTION pc.refuse_change('private_anchor_is_immutable');

SELECT pc.isolate_by_workspace('pc.private_anchor');

-- ── party ────────────────────────────────────────────────────────────────────

CREATE TABLE pc.party (
  party_id        uuid        NOT NULL,
  workspace_id    text        NOT NULL,
  party_kind      text        NOT NULL,
  legal_name      text        NULL,
  legal_form_code text        NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT party_pkey PRIMARY KEY (party_id),
  CONSTRAINT party_kind_valid CHECK (party_kind IN ('person', 'organization')),
  -- Same value as the anchor, same workspace, and a kind that agrees with it.
  -- Because party_kind is person or organization only, this one key is also
  -- what stops a System or Destination anchor from ever having a Party.
  CONSTRAINT party_is_its_anchor_and_agrees_on_kind
    FOREIGN KEY (workspace_id, party_id, party_kind)
    REFERENCES pc.private_anchor (workspace_id, anchor_id, anchor_kind),
  CONSTRAINT party_legal_form_fkey
    FOREIGN KEY (legal_form_code) REFERENCES pc.legal_form (legal_form_code),
  -- "Individual" is an anchor kind, not a legal form. The earlier model
  -- prohibits a legal form on a Person; the current one says it is absent
  -- when "unknown or inapplicable", and a Person is the inapplicable case.
  CONSTRAINT party_legal_form_is_organization_only
    CHECK (party_kind = 'organization' OR legal_form_code IS NULL),
  CONSTRAINT party_legal_name_not_blank CHECK (btrim(legal_name) <> ''),
  CONSTRAINT party_workspace_identity_key UNIQUE (workspace_id, party_id)
);
COMMENT ON TABLE pc.party IS
  'A Person or Organization with accepted business or legal standing, rights or obligations of its own. party_id is the same value as the private anchor. Every Organization is a Party; a Person becomes one only when a standing fact earns it.';

CREATE TRIGGER party_clocks
  BEFORE UPDATE ON pc.party
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at_and_touch_updated_at();

SELECT pc.isolate_by_workspace('pc.party');

-- ── contact ──────────────────────────────────────────────────────────────────

CREATE TABLE pc.contact (
  contact_id           uuid        NOT NULL,
  workspace_id         text        NOT NULL,
  contact_kind         text        NOT NULL,
  display_name         text        NOT NULL,
  accountable_party_id uuid        NULL,
  destination_role     text        NULL,
  recorded_at          timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_pkey PRIMARY KEY (contact_id),
  -- There is NO organization contact. An Organization is never a Contact.
  CONSTRAINT contact_kind_valid CHECK (contact_kind IN ('person', 'system', 'destination')),
  -- Same value as the anchor, same workspace, and a kind that agrees with it.
  -- Because contact_kind is never organization, this one key is also what
  -- stops an Organization anchor from ever having a Contact.
  CONSTRAINT contact_is_its_anchor_and_agrees_on_kind
    FOREIGN KEY (workspace_id, contact_id, contact_kind)
    REFERENCES pc.private_anchor (workspace_id, anchor_id, anchor_kind),
  CONSTRAINT contact_accountable_party_fkey
    FOREIGN KEY (workspace_id, accountable_party_id)
    REFERENCES pc.party (workspace_id, party_id),
  -- Required for System and Destination, prohibited for Person. A Person is
  -- accountable for themselves.
  CONSTRAINT contact_accountable_party_iff_not_person
    CHECK ((contact_kind = 'person') = (accountable_party_id IS NULL)),
  CONSTRAINT contact_destination_role_valid CHECK (destination_role IN ('general', 'qualified')),
  -- Every Destination is general or qualified; nothing else has a role.
  CONSTRAINT contact_destination_role_iff_destination
    CHECK ((contact_kind = 'destination') = (destination_role IS NOT NULL)),
  CONSTRAINT contact_display_name_not_blank CHECK (btrim(display_name) <> ''),
  CONSTRAINT contact_workspace_identity_key UNIQUE (workspace_id, contact_id)
);
COMMENT ON TABLE pc.contact IS
  'A stable business-interaction identity that may be reached, may perform attributable actions, or both: a Person, a System or a Destination. contact_id is the same value as the private anchor. An Organization is never a Contact.';
COMMENT ON COLUMN pc.contact.display_name IS
  'Current interaction-facing label. Not proof of legal identity.';

-- At most one general Destination per accountable Party. Further
-- undifferentiated routes belong to that same Destination.
CREATE UNIQUE INDEX contact_one_general_destination_per_party
  ON pc.contact (workspace_id, accountable_party_id)
  WHERE destination_role = 'general';

CREATE TRIGGER contact_clocks
  BEFORE UPDATE ON pc.contact
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at_and_touch_updated_at();

-- To follow each reference from the other side. Leads with workspace_id,
-- as every index on a workspace-owned table does.
CREATE INDEX contact_accountable_party_id_idx ON pc.contact (workspace_id, accountable_party_id);

SELECT pc.isolate_by_workspace('pc.contact');

-- ── which facets an anchor must have ─────────────────────────────────────────
--
--   Person         Contact required   Party optional
--   Organization   Party required     Contact prohibited
--   System         Contact required   Party prohibited
--   Destination    Contact required   Party prohibited
--
-- "Prohibited" is the two composite keys above. "Required" cannot be a key,
-- because the anchor is written before its facet. It is checked when the
-- transaction commits: an anchor and its required facet are created together
-- or not at all.

CREATE FUNCTION pc.anchor_has_its_required_facet() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE
  v_kind text;
BEGIN
  SELECT anchor_kind INTO v_kind FROM pc.private_anchor WHERE anchor_id = NEW.anchor_id;
  IF NOT FOUND THEN
    RETURN NULL;  -- created and removed again in the same transaction
  END IF;
  IF v_kind = 'organization' THEN
    IF NOT EXISTS (SELECT 1 FROM pc.party WHERE party_id = NEW.anchor_id) THEN
      RAISE EXCEPTION 'organization anchor % has no party row; every Organization is a Party', NEW.anchor_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'organization_anchor_requires_party',
              SCHEMA = 'pc', TABLE = 'private_anchor';
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM pc.contact WHERE contact_id = NEW.anchor_id) THEN
    RAISE EXCEPTION '% anchor % has no contact row; every Person, System and Destination is a Contact', v_kind, NEW.anchor_id
      USING ERRCODE = 'check_violation', CONSTRAINT = v_kind || '_anchor_requires_contact',
            SCHEMA = 'pc', TABLE = 'private_anchor';
  END IF;
  RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER anchor_has_its_required_facet
  AFTER INSERT ON pc.private_anchor
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION pc.anchor_has_its_required_facet();

-- The same rule from the other side: a required facet cannot be removed
-- while its anchor remains.
CREATE FUNCTION pc.removed_party_was_not_required() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM pc.private_anchor
              WHERE anchor_id = OLD.party_id AND anchor_kind = 'organization')
     AND NOT EXISTS (SELECT 1 FROM pc.party WHERE party_id = OLD.party_id) THEN
    RAISE EXCEPTION 'organization anchor % would be left with no party row', OLD.party_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'organization_anchor_requires_party',
            SCHEMA = 'pc', TABLE = 'party';
  END IF;
  RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER removed_party_was_not_required
  AFTER DELETE ON pc.party
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION pc.removed_party_was_not_required();

CREATE FUNCTION pc.removed_contact_was_not_required() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE
  v_kind text;
BEGIN
  SELECT anchor_kind INTO v_kind FROM pc.private_anchor WHERE anchor_id = OLD.contact_id;
  IF FOUND AND NOT EXISTS (SELECT 1 FROM pc.contact WHERE contact_id = OLD.contact_id) THEN
    RAISE EXCEPTION '% anchor % would be left with no contact row', v_kind, OLD.contact_id
      USING ERRCODE = 'check_violation', CONSTRAINT = v_kind || '_anchor_requires_contact',
            SCHEMA = 'pc', TABLE = 'contact';
  END IF;
  RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER removed_contact_was_not_required
  AFTER DELETE ON pc.contact
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION pc.removed_contact_was_not_required();

-- ── identity_merge ───────────────────────────────────────────────────────────

CREATE TABLE pc.identity_merge (
  merged_anchor_id   uuid        NOT NULL,
  workspace_id       text        NOT NULL,
  survivor_anchor_id uuid        NOT NULL,
  decision_ref       jsonb       NOT NULL,
  accepted_at        timestamptz NOT NULL DEFAULT now(),
  -- One redirect per merged identity: it is merged away once.
  CONSTRAINT identity_merge_pkey PRIMARY KEY (merged_anchor_id),
  CONSTRAINT identity_merge_merged_anchor_fkey
    FOREIGN KEY (workspace_id, merged_anchor_id)
    REFERENCES pc.private_anchor (workspace_id, anchor_id),
  CONSTRAINT identity_merge_survivor_anchor_fkey
    FOREIGN KEY (workspace_id, survivor_anchor_id)
    REFERENCES pc.private_anchor (workspace_id, anchor_id),
  CONSTRAINT identity_merge_survivor_is_another_identity
    CHECK (merged_anchor_id <> survivor_anchor_id),
  CONSTRAINT identity_merge_decision_ref_is_a_reference
    CHECK (jsonb_typeof(decision_ref) = 'object' AND decision_ref <> '{}'::jsonb)
);
COMMENT ON TABLE pc.identity_merge IS
  'An accepted identity-wide redirect: two same-kind private anchors in one workspace established as the same real subject. accepted_at is its recording time. The merge moves Party and Contact facets together. NOT enforced here and left to the write path: cycles and chains, the survivor having Party before a Person merge completes, and resolving a reference before each new write.';
COMMENT ON COLUMN pc.identity_merge.decision_ref IS
  'Typed reference to the governed acceptance decision and its evidence. The model names the field and not its grammar, so it is held as a JSON object.';

-- Both anchors are the same kind, and the kind is one whose merge the model
-- defines. System and Destination identity merge policy is deferred (§11),
-- so those kinds are refused here rather than merged by an undecided rule.
CREATE FUNCTION pc.identity_merge_joins_one_kind() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE
  v_merged   text;
  v_survivor text;
BEGIN
  SELECT anchor_kind INTO v_merged FROM pc.private_anchor WHERE anchor_id = NEW.merged_anchor_id;
  SELECT anchor_kind INTO v_survivor FROM pc.private_anchor WHERE anchor_id = NEW.survivor_anchor_id;
  IF v_merged IS NULL OR v_survivor IS NULL THEN
    RETURN NEW;  -- a missing anchor is the foreign key's to report
  END IF;
  IF v_merged <> v_survivor THEN
    RAISE EXCEPTION 'a % identity cannot be merged into a % identity', v_merged, v_survivor
      USING ERRCODE = 'check_violation', CONSTRAINT = 'identity_merge_same_kind',
            SCHEMA = 'pc', TABLE = 'identity_merge';
  END IF;
  IF v_merged NOT IN ('person', 'organization') THEN
    RAISE EXCEPTION '% identity merge is deferred by the model and is not accepted', v_merged
      USING ERRCODE = 'check_violation', CONSTRAINT = 'identity_merge_person_or_organization_only',
            SCHEMA = 'pc', TABLE = 'identity_merge';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER identity_merge_joins_one_kind
  BEFORE INSERT OR UPDATE ON pc.identity_merge
  FOR EACH ROW EXECUTE FUNCTION pc.identity_merge_joins_one_kind();

-- accepted_at is the merge's recording time, and a recording time is not edited.
CREATE TRIGGER identity_merge_accepted_at_is_immutable
  BEFORE UPDATE OF accepted_at ON pc.identity_merge
  FOR EACH ROW EXECUTE FUNCTION pc.refuse_change('identity_merge_accepted_at_is_immutable');

-- To follow each reference from the other side. Leads with workspace_id,
-- as every index on a workspace-owned table does.
CREATE INDEX identity_merge_merged_anchor_id_idx ON pc.identity_merge (workspace_id, merged_anchor_id);
CREATE INDEX identity_merge_survivor_anchor_id_idx ON pc.identity_merge (workspace_id, survivor_anchor_id);

SELECT pc.isolate_by_workspace('pc.identity_merge');
