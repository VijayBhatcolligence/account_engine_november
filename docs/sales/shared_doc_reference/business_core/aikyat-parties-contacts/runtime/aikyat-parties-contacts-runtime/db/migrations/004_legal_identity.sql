-- 004 · Legal identity: party_identifier.
--
-- The workspace's accepted authority identifier for a Party, scope and
-- period -- or its positively established absence. Fields from the earlier
-- model (git show 7621949:model/logical-model.md), which the current model
-- retains without restating.
--
-- An identifier is evidence and a Party fact. It is never the Party identity.
--
-- ── WHAT THE DATABASE ENFORCES, AND WHAT IT DOES NOT ─────────────────────────
--
-- "It is in a comment" and "the database enforces it" are different promises.
-- This table makes both, and this is which is which.
--
-- ENFORCED HERE -- structural, and true for every scheme:
--   * the Party, the scheme and the scheme's standing exist;
--   * the standing belongs to the row's own scheme;
--   * jurisdiction_scope_code has the form of a country (IN) or a
--     subdivision (IN-KA);
--   * the period is ordered;
--   * value is present exactly when the standing requires one: required
--     when the standing requires it or when no standing is recorded,
--     PROHIBITED when the standing says requires_value = false;
--   * there is deliberately NO uniqueness on (scheme, value). Suspected
--     duplicates may hold the same identifier while they await review, and a
--     hard uniqueness constraint would destroy that reviewability.
--
-- NOT ENFORCED HERE -- scheme-specific or cross-row, and left to the first
-- write path, which does not exist yet:
--   * a national none_held row may not overlap an active numbered
--     registration anywhere in that country, nor a subdivision-scoped one in
--     that subdivision;
--   * for numbered IN_GST, `cancelled` holds if and only if `until` is set;
--   * the scope is valid for the scheme;
--   * the value is normalised the way the scheme requires.
-- Each of these depends on what a particular scheme's standings mean, and
-- scheme behaviour is code, not catalogue data. Until that code exists these
-- four rules are UNENFORCED.

CREATE TABLE pc.party_identifier (
  party_identifier_id     uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id            text        NOT NULL,
  party_id                uuid        NOT NULL,
  scheme_code             text        NOT NULL,
  jurisdiction_scope_code text        NOT NULL,
  value                   text        NULL,
  standing_code           text        NULL,
  since                   date        NULL,
  until                   date        NULL,
  recorded_at             timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT party_identifier_pkey PRIMARY KEY (party_identifier_id),
  CONSTRAINT party_identifier_party_fkey
    FOREIGN KEY (workspace_id, party_id) REFERENCES pc.party (workspace_id, party_id),
  CONSTRAINT party_identifier_scheme_fkey
    FOREIGN KEY (scheme_code) REFERENCES pc.identifier_scheme (scheme_code),
  -- Composite, so a standing can only be one of the row's own scheme's.
  CONSTRAINT party_identifier_standing_belongs_to_scheme
    FOREIGN KEY (scheme_code, standing_code)
    REFERENCES pc.identifier_scheme_standing (scheme_code, standing_code),
  CONSTRAINT party_identifier_jurisdiction_scope_code_is_iso_3166
    CHECK (jurisdiction_scope_code ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'),
  CONSTRAINT party_identifier_value_not_blank CHECK (btrim(value) <> ''),
  CONSTRAINT party_identifier_period_is_ordered CHECK (since < until)
);
COMMENT ON TABLE pc.party_identifier IS
  'Workspace-accepted authority identifier, or positively established absence fact, for a Party, scope and period. No row means unknown. A none_held standing means absence was positively established. Matching identifiers may propose duplicate review but never merge identities. See the migration header for which rules are enforced here and which are not.';

-- Lookup for duplicate review. NOT unique, on purpose.
CREATE INDEX party_identifier_scheme_value_idx
  ON pc.party_identifier (workspace_id, scheme_code, value);

-- value is present exactly when the standing requires one.
CREATE FUNCTION pc.party_identifier_value_fits_standing() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE
  v_requires_value boolean;
BEGIN
  IF NEW.standing_code IS NULL THEN
    v_requires_value := true;  -- absent only when a selected standing permits it
  ELSE
    SELECT requires_value INTO v_requires_value
      FROM pc.identifier_scheme_standing
     WHERE scheme_code = NEW.scheme_code AND standing_code = NEW.standing_code;
    IF NOT FOUND THEN
      RETURN NEW;  -- an unknown standing is the foreign key's to report
    END IF;
  END IF;
  IF v_requires_value AND NEW.value IS NULL THEN
    RAISE EXCEPTION 'a % identifier needs a value unless its standing permits a numberless fact', NEW.scheme_code
      USING ERRCODE = 'check_violation', CONSTRAINT = 'party_identifier_value_required',
            SCHEMA = 'pc', TABLE = 'party_identifier', COLUMN = 'value';
  END IF;
  IF NOT v_requires_value AND NEW.value IS NOT NULL THEN
    RAISE EXCEPTION 'standing % of scheme % records an absence and may not carry a value',
        NEW.standing_code, NEW.scheme_code
      USING ERRCODE = 'check_violation', CONSTRAINT = 'party_identifier_value_prohibited',
            SCHEMA = 'pc', TABLE = 'party_identifier', COLUMN = 'value';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER party_identifier_value_fits_standing
  BEFORE INSERT OR UPDATE OF value, standing_code, scheme_code ON pc.party_identifier
  FOR EACH ROW EXECUTE FUNCTION pc.party_identifier_value_fits_standing();

CREATE TRIGGER party_identifier_clocks
  BEFORE UPDATE ON pc.party_identifier
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at_and_touch_updated_at();

-- To follow each reference from the other side. Leads with workspace_id,
-- as every index on a workspace-owned table does.
CREATE INDEX party_identifier_party_id_idx ON pc.party_identifier (workspace_id, party_id);

SELECT pc.isolate_by_workspace('pc.party_identifier');
