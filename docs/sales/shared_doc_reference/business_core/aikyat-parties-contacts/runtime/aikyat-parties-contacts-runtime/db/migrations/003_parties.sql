-- 003 · Parties: operated_party, party_trade_name, party_standing,
--       business_location, party_relationship.
--
-- Model §5. party_trade_name is created before party_standing because a
-- standing may be held under a trade name.
--
-- PERIODS THAT MAY NOT OVERLAP. The earlier model says accepted periods for
-- the same standing may not overlap, and that current relationship rows are
-- unique for the same endpoints and type. The current model does not restate
-- either and does not contradict them, so they carry over.
--
-- They are enforced ONLY WHERE BOTH BOUNDS ARE KNOWN. An exclusion constraint
-- over a period with a missing bound would have to treat the missing bound as
-- open-ended, and that asserts knowledge nobody has: "since is empty" would
-- come to mean "since forever", which is exactly what "empty means not known"
-- forbids, and a legacy import with unknown start dates would be rejected as
-- overlapping itself. So:
--
--   both bounds known    overlap is refused by the database
--   either bound empty   NOT CHECKED. The row is accepted.
--
-- Enforce what can be proved. The unchecked case is the write path's to
-- handle, and it is recorded as open in the plan.

-- Equality on text and uuid inside a GiST exclusion constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── operated_party ───────────────────────────────────────────────────────────

CREATE TABLE pc.operated_party (
  operated_party_id uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id      text        NOT NULL,
  party_id          uuid        NOT NULL,
  since             date        NULL,
  until             date        NULL,
  recorded_at       timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operated_party_pkey PRIMARY KEY (operated_party_id),
  CONSTRAINT operated_party_party_fkey
    FOREIGN KEY (workspace_id, party_id) REFERENCES pc.party (workspace_id, party_id),
  CONSTRAINT operated_party_period_is_ordered CHECK (since < until),
  CONSTRAINT operated_party_workspace_identity_key UNIQUE (workspace_id, operated_party_id)
);
COMMENT ON TABLE pc.operated_party IS
  'States that the workspace operates the business of a Party for an effective period. It does not mean employee, department, workspace member or unrestricted administrator.';

CREATE TRIGGER operated_party_clocks
  BEFORE UPDATE ON pc.operated_party
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at_and_touch_updated_at();

-- To follow each reference from the other side. Leads with workspace_id,
-- as every index on a workspace-owned table does.
CREATE INDEX operated_party_party_id_idx ON pc.operated_party (workspace_id, party_id);

SELECT pc.isolate_by_workspace('pc.operated_party');

-- ── party_trade_name ─────────────────────────────────────────────────────────

CREATE TABLE pc.party_trade_name (
  trade_name_id uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id  text        NOT NULL,
  party_id      uuid        NOT NULL,
  name          text        NOT NULL,
  since         date        NULL,
  until         date        NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT party_trade_name_pkey PRIMARY KEY (trade_name_id),
  CONSTRAINT party_trade_name_party_fkey
    FOREIGN KEY (workspace_id, party_id) REFERENCES pc.party (workspace_id, party_id),
  CONSTRAINT party_trade_name_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT party_trade_name_period_is_ordered CHECK (since < until),
  -- What party_standing references, so a standing can only be held under a
  -- trade name of the Party that bears the standing.
  CONSTRAINT party_trade_name_workspace_party_identity_key UNIQUE (workspace_id, party_id, trade_name_id)
);
COMMENT ON TABLE pc.party_trade_name IS
  'A durable name under which a Party conducts business. Not another Party or Contact. A rename changes name on the same row; a genuinely separate concurrent trade name is another row.';

CREATE TRIGGER party_trade_name_clocks
  BEFORE UPDATE ON pc.party_trade_name
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at_and_touch_updated_at();

SELECT pc.isolate_by_workspace('pc.party_trade_name');

-- ── party_standing ───────────────────────────────────────────────────────────

CREATE TABLE pc.party_standing (
  party_standing_id  uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id       text        NOT NULL,
  party_id           uuid        NOT NULL,
  -- NOT NULL is the point. It is what makes "customer of WHICH of our
  -- businesses" answerable.
  operated_party_id  uuid        NOT NULL,
  standing_type_code text        NOT NULL,
  trade_name_id      uuid        NULL,
  since              date        NULL,
  until              date        NULL,
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT party_standing_pkey PRIMARY KEY (party_standing_id),
  CONSTRAINT party_standing_party_fkey
    FOREIGN KEY (workspace_id, party_id) REFERENCES pc.party (workspace_id, party_id),
  CONSTRAINT party_standing_operated_party_fkey
    FOREIGN KEY (workspace_id, operated_party_id)
    REFERENCES pc.operated_party (workspace_id, operated_party_id),
  CONSTRAINT party_standing_type_fkey
    FOREIGN KEY (standing_type_code) REFERENCES pc.party_standing_type (standing_type_code),
  -- The trade name, when present, belongs to the Party bearing the standing.
  CONSTRAINT party_standing_trade_name_belongs_to_party
    FOREIGN KEY (workspace_id, party_id, trade_name_id)
    REFERENCES pc.party_trade_name (workspace_id, party_id, trade_name_id),
  CONSTRAINT party_standing_period_is_ordered CHECK (since < until),
  -- See the header: enforced only where both bounds are known. Two
  -- constraints because "no trade name asserted" is its own case, and
  -- distinct trade-name standings may coexist.
  CONSTRAINT party_standing_known_periods_do_not_overlap
    EXCLUDE USING gist (
      workspace_id WITH =, party_id WITH =, operated_party_id WITH =,
      standing_type_code WITH =, daterange(since, until, '[)') WITH &&
    ) WHERE (since IS NOT NULL AND until IS NOT NULL AND trade_name_id IS NULL),
  CONSTRAINT party_standing_known_periods_per_trade_name_do_not_overlap
    EXCLUDE USING gist (
      workspace_id WITH =, party_id WITH =, operated_party_id WITH =,
      standing_type_code WITH =, trade_name_id WITH =, daterange(since, until, '[)') WITH &&
    ) WHERE (since IS NOT NULL AND until IS NOT NULL AND trade_name_id IS NOT NULL)
);
COMMENT ON TABLE pc.party_standing IS
  'Reusable accepted standing of a Party relative to an operated Party, such as customer or supplier. Standing does not create the customer account, supplier account, payroll record, ledger, workflow, permission or consent that another product owns.';

CREATE TRIGGER party_standing_clocks
  BEFORE UPDATE ON pc.party_standing
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at_and_touch_updated_at();

-- To follow each reference from the other side. Leads with workspace_id,
-- as every index on a workspace-owned table does.
CREATE INDEX party_standing_party_id_idx ON pc.party_standing (workspace_id, party_id);
CREATE INDEX party_standing_operated_party_id_idx ON pc.party_standing (workspace_id, operated_party_id);

SELECT pc.isolate_by_workspace('pc.party_standing');

-- ── business_location ────────────────────────────────────────────────────────
--
-- The model's `address` is "structured or ordered postal address when known".
-- The earlier model gives the structure, and it is taken as written: ordered
-- lines, locality, ISO 3166-2 subdivision, postal code, ISO 3166-1 country.
-- The model's `purposes` is a set of references and lives in
-- pc.business_location_purpose (006).

CREATE TABLE pc.business_location (
  business_location_id     uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id             text        NOT NULL,
  party_id                 uuid        NOT NULL,
  display_name             text        NOT NULL,
  address_lines            text[]      NULL,
  locality                 text        NULL,
  administrative_area_code text        NULL,
  postal_code              text        NULL,
  country_code             text        NULL,
  since                    date        NULL,
  until                    date        NULL,
  recorded_at              timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_location_pkey PRIMARY KEY (business_location_id),
  CONSTRAINT business_location_party_fkey
    FOREIGN KEY (workspace_id, party_id) REFERENCES pc.party (workspace_id, party_id),
  CONSTRAINT business_location_display_name_not_blank CHECK (btrim(display_name) <> ''),
  CONSTRAINT business_location_address_lines_not_empty
    CHECK (address_lines IS NULL OR cardinality(address_lines) > 0),
  CONSTRAINT business_location_locality_not_blank CHECK (btrim(locality) <> ''),
  CONSTRAINT business_location_postal_code_not_blank CHECK (btrim(postal_code) <> ''),
  -- Full ISO 3166-2 subdivision code, for example IN-KA.
  CONSTRAINT business_location_administrative_area_code_is_iso_3166_2
    CHECK (administrative_area_code ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'),
  -- ISO 3166-1 alpha-2 country code, for example IN.
  CONSTRAINT business_location_country_code_is_iso_3166_1
    CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT business_location_period_is_ordered CHECK (since < until),
  CONSTRAINT business_location_workspace_identity_key UNIQUE (workspace_id, business_location_id)
);
COMMENT ON TABLE pc.business_location IS
  'The thin shared identity of a durable physical business presence of a Party. Inventory, Manufacturing, HR, Taxation or Accounting may reference it without it becoming their warehouse, plant, workplace, registration or branch. Names and addresses are not uniqueness keys.';

CREATE TRIGGER business_location_clocks
  BEFORE UPDATE ON pc.business_location
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at_and_touch_updated_at();

-- To follow each reference from the other side. Leads with workspace_id,
-- as every index on a workspace-owned table does.
CREATE INDEX business_location_party_id_idx ON pc.business_location (workspace_id, party_id);

SELECT pc.isolate_by_workspace('pc.business_location');

-- ── party_relationship ───────────────────────────────────────────────────────

CREATE TABLE pc.party_relationship (
  party_relationship_id  uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id           text        NOT NULL,
  from_party_id          uuid        NOT NULL,
  to_party_id            uuid        NOT NULL,
  relationship_type_code text        NOT NULL,
  since                  date        NULL,
  until                  date        NULL,
  recorded_at            timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT party_relationship_pkey PRIMARY KEY (party_relationship_id),
  CONSTRAINT party_relationship_from_party_fkey
    FOREIGN KEY (workspace_id, from_party_id) REFERENCES pc.party (workspace_id, party_id),
  CONSTRAINT party_relationship_to_party_fkey
    FOREIGN KEY (workspace_id, to_party_id) REFERENCES pc.party (workspace_id, party_id),
  CONSTRAINT party_relationship_type_fkey
    FOREIGN KEY (relationship_type_code)
    REFERENCES pc.party_relationship_type (relationship_type_code),
  -- A relationship is between two Parties.
  CONSTRAINT party_relationship_joins_two_parties CHECK (from_party_id <> to_party_id),
  CONSTRAINT party_relationship_period_is_ordered CHECK (since < until),
  -- See the header: enforced only where both bounds are known.
  CONSTRAINT party_relationship_known_periods_do_not_overlap
    EXCLUDE USING gist (
      workspace_id WITH =, from_party_id WITH =, to_party_id WITH =,
      relationship_type_code WITH =, daterange(since, until, '[)') WITH &&
    ) WHERE (since IS NOT NULL AND until IS NOT NULL)
);
COMMENT ON TABLE pc.party_relationship IS
  'An accepted, typed, effective-dated legal or business relationship between two Parties. A relationship never grants resource access or action authority by itself.';

-- The endpoint kinds must satisfy the catalogue. party_kind cannot change
-- after insert, so checking when the relationship is written is the whole
-- check.
CREATE FUNCTION pc.party_relationship_endpoints_fit_the_type() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE
  v_from_required text;
  v_to_required   text;
  v_from          text;
  v_to            text;
BEGIN
  SELECT from_party_kind, to_party_kind INTO v_from_required, v_to_required
    FROM pc.party_relationship_type WHERE relationship_type_code = NEW.relationship_type_code;
  IF NOT FOUND THEN
    RETURN NEW;  -- an unknown type is the foreign key's to report
  END IF;
  SELECT party_kind INTO v_from FROM pc.party WHERE party_id = NEW.from_party_id;
  SELECT party_kind INTO v_to FROM pc.party WHERE party_id = NEW.to_party_id;
  IF v_from_required IS NOT NULL AND v_from IS NOT NULL AND v_from <> v_from_required THEN
    RAISE EXCEPTION 'relationship type % runs from a % party, and this one is a %',
        NEW.relationship_type_code, v_from_required, v_from
      USING ERRCODE = 'check_violation', CONSTRAINT = 'party_relationship_from_party_kind_fits_type',
            SCHEMA = 'pc', TABLE = 'party_relationship', COLUMN = 'from_party_id';
  END IF;
  IF v_to_required IS NOT NULL AND v_to IS NOT NULL AND v_to <> v_to_required THEN
    RAISE EXCEPTION 'relationship type % runs to a % party, and this one is a %',
        NEW.relationship_type_code, v_to_required, v_to
      USING ERRCODE = 'check_violation', CONSTRAINT = 'party_relationship_to_party_kind_fits_type',
            SCHEMA = 'pc', TABLE = 'party_relationship', COLUMN = 'to_party_id';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER party_relationship_endpoints_fit_the_type
  BEFORE INSERT OR UPDATE OF from_party_id, to_party_id, relationship_type_code ON pc.party_relationship
  FOR EACH ROW EXECUTE FUNCTION pc.party_relationship_endpoints_fit_the_type();

CREATE TRIGGER party_relationship_clocks
  BEFORE UPDATE ON pc.party_relationship
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at_and_touch_updated_at();

-- To follow each reference from the other side. Leads with workspace_id,
-- as every index on a workspace-owned table does.
CREATE INDEX party_relationship_from_party_id_idx ON pc.party_relationship (workspace_id, from_party_id);
CREATE INDEX party_relationship_to_party_id_idx ON pc.party_relationship (workspace_id, to_party_id);

SELECT pc.isolate_by_workspace('pc.party_relationship');
