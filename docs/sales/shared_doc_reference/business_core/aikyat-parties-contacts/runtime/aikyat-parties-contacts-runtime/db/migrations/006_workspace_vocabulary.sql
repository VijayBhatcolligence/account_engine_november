-- 006 · Workspace vocabulary: purpose, and where purposes are used.
--
-- pc.purpose is the workspace's own vocabulary of business functions. Fields
-- from the earlier model (git show 7621949:model/logical-model.md), which
-- the current model retains without restating.
--
-- THE THREE LINK TABLES ARE NOT MODEL RECORDS. The model has three fields
-- that are sets of purpose references:
--
--     contact_party_association.purpose_refs
--     route_use.purpose_refs
--     business_location.purposes
--
-- A set of references is held as rows, one per member, so each member is a
-- real foreign key: a purpose that does not exist, or that belongs to another
-- workspace, cannot be referenced. An array column would have made the same
-- promise only in a comment. No member means the set is not known or empty;
-- the model does not distinguish the two.

CREATE TABLE pc.purpose (
  purpose_id        uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id      text        NOT NULL,
  purpose_type_code text        NULL,
  name              text        NOT NULL,
  aliases           text[]      NULL,
  description       text        NULL,
  recorded_at       timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purpose_pkey PRIMARY KEY (purpose_id),
  CONSTRAINT purpose_type_fkey
    FOREIGN KEY (purpose_type_code) REFERENCES pc.purpose_type (purpose_type_code),
  CONSTRAINT purpose_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT purpose_aliases_not_empty CHECK (aliases IS NULL OR cardinality(aliases) > 0),
  CONSTRAINT purpose_description_not_blank CHECK (btrim(description) <> ''),
  CONSTRAINT purpose_workspace_identity_key UNIQUE (workspace_id, purpose_id)
);
COMMENT ON TABLE pc.purpose IS
  'Workspace vocabulary for business functions. purpose_type_code optionally maps an entry to the canonical platform meaning. Unmapped local purposes are valid for human use, but products must not infer canonical behaviour from their names.';

CREATE TRIGGER purpose_clocks
  BEFORE UPDATE ON pc.purpose
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at_and_touch_updated_at();

SELECT pc.isolate_by_workspace('pc.purpose');

-- ── contact_party_association.purpose_refs ───────────────────────────────────

CREATE TABLE pc.contact_party_association_purpose (
  workspace_id   text        NOT NULL,
  association_id uuid        NOT NULL,
  purpose_id     uuid        NOT NULL,
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_party_association_purpose_pkey PRIMARY KEY (workspace_id, association_id, purpose_id),
  CONSTRAINT contact_party_association_purpose_association_fkey
    FOREIGN KEY (workspace_id, association_id)
    REFERENCES pc.contact_party_association (workspace_id, association_id) ON DELETE CASCADE,
  CONSTRAINT contact_party_association_purpose_purpose_fkey
    FOREIGN KEY (workspace_id, purpose_id) REFERENCES pc.purpose (workspace_id, purpose_id)
);
COMMENT ON TABLE pc.contact_party_association_purpose IS
  'The members of contact_party_association.purpose_refs: the business functions of an association. Not a model record; the physical form of a logical set.';

CREATE TRIGGER contact_party_association_purpose_clocks
  BEFORE UPDATE ON pc.contact_party_association_purpose
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at();

-- To follow each reference from the other side. Leads with workspace_id,
-- as every index on a workspace-owned table does.
CREATE INDEX contact_party_association_purpose_purpose_id_idx ON pc.contact_party_association_purpose (workspace_id, purpose_id);

SELECT pc.isolate_by_workspace('pc.contact_party_association_purpose');

-- ── route_use.purpose_refs ───────────────────────────────────────────────────

CREATE TABLE pc.route_use_purpose (
  workspace_id text        NOT NULL,
  route_use_id uuid        NOT NULL,
  purpose_id   uuid        NOT NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT route_use_purpose_pkey PRIMARY KEY (workspace_id, route_use_id, purpose_id),
  CONSTRAINT route_use_purpose_route_use_fkey
    FOREIGN KEY (workspace_id, route_use_id)
    REFERENCES pc.route_use (workspace_id, route_use_id) ON DELETE CASCADE,
  CONSTRAINT route_use_purpose_purpose_fkey
    FOREIGN KEY (workspace_id, purpose_id) REFERENCES pc.purpose (workspace_id, purpose_id)
);
COMMENT ON TABLE pc.route_use_purpose IS
  'The members of route_use.purpose_refs: the business purposes a route applies to. Not a model record; the physical form of a logical set.';

CREATE TRIGGER route_use_purpose_clocks
  BEFORE UPDATE ON pc.route_use_purpose
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at();

-- To follow each reference from the other side. Leads with workspace_id,
-- as every index on a workspace-owned table does.
CREATE INDEX route_use_purpose_purpose_id_idx ON pc.route_use_purpose (workspace_id, purpose_id);

SELECT pc.isolate_by_workspace('pc.route_use_purpose');

-- ── business_location.purposes ───────────────────────────────────────────────

CREATE TABLE pc.business_location_purpose (
  workspace_id         text        NOT NULL,
  business_location_id uuid        NOT NULL,
  purpose_id           uuid        NOT NULL,
  recorded_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_location_purpose_pkey PRIMARY KEY (workspace_id, business_location_id, purpose_id),
  CONSTRAINT business_location_purpose_business_location_fkey
    FOREIGN KEY (workspace_id, business_location_id)
    REFERENCES pc.business_location (workspace_id, business_location_id) ON DELETE CASCADE,
  CONSTRAINT business_location_purpose_purpose_fkey
    FOREIGN KEY (workspace_id, purpose_id) REFERENCES pc.purpose (workspace_id, purpose_id)
);
COMMENT ON TABLE pc.business_location_purpose IS
  'The members of business_location.purposes: sourced location purposes, when accepted. Not a model record; the physical form of a logical set.';

CREATE TRIGGER business_location_purpose_clocks
  BEFORE UPDATE ON pc.business_location_purpose
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at();

-- To follow each reference from the other side. Leads with workspace_id,
-- as every index on a workspace-owned table does.
CREATE INDEX business_location_purpose_purpose_id_idx ON pc.business_location_purpose (workspace_id, purpose_id);

SELECT pc.isolate_by_workspace('pc.business_location_purpose');
