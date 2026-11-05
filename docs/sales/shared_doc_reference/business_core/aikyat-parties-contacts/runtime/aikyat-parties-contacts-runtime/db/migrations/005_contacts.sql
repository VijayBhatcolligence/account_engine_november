-- 005 · Contacts: capacity, contact_party_association, contact_point,
--       route_use, handler, representation, principal_binding.
--
-- Model §6.
--
-- CAPACITY HAS TWO LEVELS, like purpose. The model defines
-- contact_party_association.capacity_code as a "governed OR workspace-defined
-- business capacity". A platform-only catalogue could not express the second
-- half, and the model says no physical choice may erase a distinction it
-- records. purpose_type / purpose is the model's own precedent for the shape:
--
--     pc.capacity_type   platform, governed            (001)
--     pc.capacity        workspace-defined, may map to a capacity_type
--
-- An association always names a workspace capacity. When that capacity maps
-- to a governed type, the type's kind rules apply. An unmapped workspace
-- capacity is valid for human use, and products must not infer canonical
-- behaviour from its name. pc.capacity has no field table in either model;
-- its fields mirror pc.purpose.
--
-- SHAPES THE MODEL NAMES BUT DOES NOT SPECIFY. `scope` and `authority_scope`
-- are "territory, location, or other admitted scope" with no grammar given,
-- so each is one JSON object, refused when it is not an object or is empty.
-- `purpose_refs` is a set of references and lives in link tables (006), so
-- its foreign keys hold.
--
-- PERIODS THAT MAY NOT OVERLAP: one Principal resolves to at most one Contact
-- per period (earlier model). Enforced only where both bounds are known; see
-- the header of 003 for why.

-- ── capacity (workspace-defined) ─────────────────────────────────────────────

CREATE TABLE pc.capacity (
  workspace_id       text        NOT NULL,
  capacity_code      text        NOT NULL,
  capacity_type_code text        NULL,
  name               text        NOT NULL,
  aliases            text[]      NULL,
  description        text        NULL,
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT capacity_pkey PRIMARY KEY (workspace_id, capacity_code),
  CONSTRAINT capacity_type_fkey
    FOREIGN KEY (capacity_type_code) REFERENCES pc.capacity_type (capacity_type_code),
  CONSTRAINT capacity_code_not_blank CHECK (btrim(capacity_code) <> ''),
  CONSTRAINT capacity_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT capacity_aliases_not_empty CHECK (aliases IS NULL OR cardinality(aliases) > 0),
  CONSTRAINT capacity_description_not_blank CHECK (btrim(description) <> '')
);
COMMENT ON TABLE pc.capacity IS
  'Workspace vocabulary of business capacities in which a Contact is associated with a Party. capacity_type_code optionally maps an entry to the governed platform meaning. This is the WORKSPACE-DEFINED half of contact_party_association.capacity_code.';

CREATE TRIGGER capacity_clocks
  BEFORE UPDATE ON pc.capacity
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at_and_touch_updated_at();

SELECT pc.isolate_by_workspace('pc.capacity');

-- ── contact_party_association ────────────────────────────────────────────────

CREATE TABLE pc.contact_party_association (
  association_id uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id   text        NOT NULL,
  contact_id     uuid        NOT NULL,
  party_id       uuid        NOT NULL,
  capacity_code  text        NOT NULL,
  scope          jsonb       NULL,
  since          date        NULL,
  until          date        NULL,
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_party_association_pkey PRIMARY KEY (association_id),
  CONSTRAINT contact_party_association_contact_fkey
    FOREIGN KEY (workspace_id, contact_id) REFERENCES pc.contact (workspace_id, contact_id),
  CONSTRAINT contact_party_association_party_fkey
    FOREIGN KEY (workspace_id, party_id) REFERENCES pc.party (workspace_id, party_id),
  CONSTRAINT contact_party_association_capacity_fkey
    FOREIGN KEY (workspace_id, capacity_code) REFERENCES pc.capacity (workspace_id, capacity_code),
  -- An association is not used to connect a Person to their own Party facet.
  -- The two facets of one identity carry the same value, so this is exact.
  CONSTRAINT contact_party_association_is_not_to_own_party_facet
    CHECK (contact_id <> party_id),
  CONSTRAINT contact_party_association_scope_is_an_object
    CHECK (jsonb_typeof(scope) = 'object' AND scope <> '{}'::jsonb),
  CONSTRAINT contact_party_association_period_is_ordered CHECK (since < until),
  CONSTRAINT contact_party_association_workspace_identity_key UNIQUE (workspace_id, association_id),
  -- What route_use references, so a route use can only name an association
  -- of the route's own Contact.
  CONSTRAINT contact_party_association_workspace_contact_identity_key
    UNIQUE (workspace_id, contact_id, association_id)
);
COMMENT ON TABLE pc.contact_party_association IS
  'An accepted connection between a Contact and a Party in a stated business capacity. It explains a business connection; it does not prove representation, authorship, permission or authority. Distinct from System and Destination accountability.';

-- When the capacity maps to a governed type, the endpoints must be of the
-- kinds that type permits.
CREATE FUNCTION pc.association_fits_its_capacity_type() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE
  v_from_required text;
  v_to_required   text;
  v_contact_kind  text;
  v_party_kind    text;
BEGIN
  SELECT t.from_contact_kind, t.to_party_kind INTO v_from_required, v_to_required
    FROM pc.capacity c
    JOIN pc.capacity_type t ON t.capacity_type_code = c.capacity_type_code
   WHERE c.workspace_id = NEW.workspace_id AND c.capacity_code = NEW.capacity_code;
  IF NOT FOUND THEN
    RETURN NEW;  -- an unmapped workspace capacity carries no kind rule
  END IF;
  SELECT contact_kind INTO v_contact_kind FROM pc.contact WHERE contact_id = NEW.contact_id;
  SELECT party_kind INTO v_party_kind FROM pc.party WHERE party_id = NEW.party_id;
  IF v_contact_kind IS NOT NULL AND v_contact_kind <> v_from_required THEN
    RAISE EXCEPTION 'capacity % is for a % contact, and this one is a %',
        NEW.capacity_code, v_from_required, v_contact_kind
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'contact_party_association_contact_kind_fits_capacity_type',
            SCHEMA = 'pc', TABLE = 'contact_party_association', COLUMN = 'contact_id';
  END IF;
  IF v_to_required IS NOT NULL AND v_party_kind IS NOT NULL AND v_party_kind <> v_to_required THEN
    RAISE EXCEPTION 'capacity % is toward a % party, and this one is a %',
        NEW.capacity_code, v_to_required, v_party_kind
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'contact_party_association_party_kind_fits_capacity_type',
            SCHEMA = 'pc', TABLE = 'contact_party_association', COLUMN = 'party_id';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER contact_party_association_fits_its_capacity_type
  BEFORE INSERT OR UPDATE OF contact_id, party_id, capacity_code ON pc.contact_party_association
  FOR EACH ROW EXECUTE FUNCTION pc.association_fits_its_capacity_type();

CREATE TRIGGER contact_party_association_clocks
  BEFORE UPDATE ON pc.contact_party_association
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at_and_touch_updated_at();

-- To follow each reference from the other side. Leads with workspace_id,
-- as every index on a workspace-owned table does.
CREATE INDEX contact_party_association_party_id_idx ON pc.contact_party_association (workspace_id, party_id);
CREATE INDEX contact_party_association_capacity_code_idx ON pc.contact_party_association (workspace_id, capacity_code);

SELECT pc.isolate_by_workspace('pc.contact_party_association');

-- ── contact_point ────────────────────────────────────────────────────────────
--
-- channel_kind is an ENUM, not a catalogue: adding a channel means building
-- its sender, receiver, validation and matching, so its meaning is code. The
-- four values are the earlier model's. The current model also names an
-- "Aikyat application route" and gives it no value name and no route shape;
-- it is admitted when it is built.
--
-- The model's route_value is "channel-specific value or typed subordinate
-- reference". A postal route is the reference case: it points at a
-- pc.business_location and does not duplicate the address. So the one
-- logical field is two columns, exactly one of which is filled.

CREATE TABLE pc.contact_point (
  contact_point_id     uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id         text        NOT NULL,
  contact_id           uuid        NOT NULL,
  channel_kind         text        NOT NULL,
  route_value          text        NULL,
  business_location_id uuid        NULL,
  since                date        NULL,
  until                date        NULL,
  recorded_at          timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_point_pkey PRIMARY KEY (contact_point_id),
  CONSTRAINT contact_point_contact_fkey
    FOREIGN KEY (workspace_id, contact_id) REFERENCES pc.contact (workspace_id, contact_id),
  CONSTRAINT contact_point_business_location_fkey
    FOREIGN KEY (workspace_id, business_location_id)
    REFERENCES pc.business_location (workspace_id, business_location_id),
  CONSTRAINT contact_point_channel_kind_valid
    CHECK (channel_kind IN ('email', 'phone', 'url', 'postal')),
  -- A postal route is a reference to a business location and nothing else is.
  CONSTRAINT contact_point_postal_route_is_a_location
    CHECK ((channel_kind = 'postal') = (business_location_id IS NOT NULL)),
  -- Every other channel carries its value, and a postal route carries none.
  CONSTRAINT contact_point_other_routes_carry_a_value
    CHECK ((channel_kind = 'postal') = (route_value IS NULL)),
  CONSTRAINT contact_point_route_value_not_blank CHECK (btrim(route_value) <> ''),
  CONSTRAINT contact_point_period_is_ordered CHECK (since < until),
  -- What route_use and handler reference, so each can only name a route of
  -- the Contact it is about.
  CONSTRAINT contact_point_workspace_contact_identity_key
    UNIQUE (workspace_id, contact_id, contact_point_id)
);
COMMENT ON TABLE pc.contact_point IS
  'A deliberately accepted technical route belonging to exactly one Contact. Route replacement ends the old route and creates another. Equal technical values are matching evidence, never identity proof and never unique: there is deliberately no uniqueness on route_value.';

-- Lookup for matching. NOT unique, on purpose.
CREATE INDEX contact_point_channel_value_idx
  ON pc.contact_point (workspace_id, channel_kind, route_value);

CREATE TRIGGER contact_point_clocks
  BEFORE UPDATE ON pc.contact_point
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at_and_touch_updated_at();

-- To follow each reference from the other side. Leads with workspace_id,
-- as every index on a workspace-owned table does.
CREATE INDEX contact_point_business_location_id_idx ON pc.contact_point (workspace_id, business_location_id);

SELECT pc.isolate_by_workspace('pc.contact_point');

-- ── route_use ────────────────────────────────────────────────────────────────

CREATE TABLE pc.route_use (
  route_use_id     uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id     text        NOT NULL,
  contact_point_id uuid        NOT NULL,
  -- NOT a model field. The Contact that owns the route, repeated here so the
  -- two keys below can prove that the association, when one is named, is an
  -- association OF THE SAME CONTACT. It carries no meaning of its own.
  contact_id       uuid        NOT NULL,
  association_id   uuid        NULL,
  scope            jsonb       NULL,
  since            date        NULL,
  until            date        NULL,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT route_use_pkey PRIMARY KEY (route_use_id),
  CONSTRAINT route_use_contact_point_belongs_to_contact
    FOREIGN KEY (workspace_id, contact_id, contact_point_id)
    REFERENCES pc.contact_point (workspace_id, contact_id, contact_point_id),
  CONSTRAINT route_use_association_is_of_the_same_contact
    FOREIGN KEY (workspace_id, contact_id, association_id)
    REFERENCES pc.contact_party_association (workspace_id, contact_id, association_id),
  CONSTRAINT route_use_scope_is_an_object
    CHECK (jsonb_typeof(scope) = 'object' AND scope <> '{}'::jsonb),
  CONSTRAINT route_use_period_is_ordered CHECK (since < until),
  CONSTRAINT route_use_workspace_identity_key UNIQUE (workspace_id, route_use_id)
);
COMMENT ON TABLE pc.route_use IS
  'States the capacity and purpose in which a contact point applies. An absent association means the Contact''s unqualified route; it does NOT mean the route applies to every Party the Contact may represent.';

CREATE TRIGGER route_use_clocks
  BEFORE UPDATE ON pc.route_use
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at_and_touch_updated_at();

-- To follow each reference from the other side. Leads with workspace_id,
-- as every index on a workspace-owned table does.
CREATE INDEX route_use_contact_point_id_idx ON pc.route_use (workspace_id, contact_point_id);
CREATE INDEX route_use_association_id_idx ON pc.route_use (workspace_id, association_id);

SELECT pc.isolate_by_workspace('pc.route_use');

-- ── handler ──────────────────────────────────────────────────────────────────

CREATE TABLE pc.handler (
  handler_id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id           text        NOT NULL,
  destination_contact_id uuid        NOT NULL,
  handler_contact_id     uuid        NOT NULL,
  contact_point_id       uuid        NULL,
  scope                  jsonb       NULL,
  since                  date        NULL,
  until                  date        NULL,
  recorded_at            timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT handler_pkey PRIMARY KEY (handler_id),
  CONSTRAINT handler_destination_contact_fkey
    FOREIGN KEY (workspace_id, destination_contact_id) REFERENCES pc.contact (workspace_id, contact_id),
  CONSTRAINT handler_handler_contact_fkey
    FOREIGN KEY (workspace_id, handler_contact_id) REFERENCES pc.contact (workspace_id, contact_id),
  -- The optional route-specific scope is a route of the handled Destination.
  CONSTRAINT handler_contact_point_belongs_to_destination
    FOREIGN KEY (workspace_id, destination_contact_id, contact_point_id)
    REFERENCES pc.contact_point (workspace_id, contact_id, contact_point_id),
  CONSTRAINT handler_scope_is_an_object
    CHECK (jsonb_typeof(scope) = 'object' AND scope <> '{}'::jsonb),
  CONSTRAINT handler_period_is_ordered CHECK (since < until)
);
COMMENT ON TABLE pc.handler IS
  'An accepted relationship that a Person or System Contact reads, operates or responds for a Destination Contact. Handling does not establish authorship of every interaction, representation of an associated Party, or authority to bind that Party.';

CREATE TRIGGER handler_destination_is_a_destination
  BEFORE INSERT OR UPDATE OF destination_contact_id ON pc.handler
  FOR EACH ROW EXECUTE FUNCTION pc.require_contact_kind(
    'destination_contact_id', 'destination', 'handler_destination_is_a_destination');

CREATE TRIGGER handler_handler_is_person_or_system
  BEFORE INSERT OR UPDATE OF handler_contact_id ON pc.handler
  FOR EACH ROW EXECUTE FUNCTION pc.require_contact_kind(
    'handler_contact_id', 'person,system', 'handler_handler_is_person_or_system');

CREATE TRIGGER handler_clocks
  BEFORE UPDATE ON pc.handler
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at_and_touch_updated_at();

-- To follow each reference from the other side. Leads with workspace_id,
-- as every index on a workspace-owned table does.
CREATE INDEX handler_destination_contact_id_idx ON pc.handler (workspace_id, destination_contact_id);
CREATE INDEX handler_handler_contact_id_idx ON pc.handler (workspace_id, handler_contact_id);

SELECT pc.isolate_by_workspace('pc.handler');

-- ── representation ───────────────────────────────────────────────────────────
--
-- representation_kind_code keeps its column and has NO catalogue. The model
-- defers "representation-kind vocabulary and legal-basis detail" by name
-- (§11), so there is nothing governed to reference yet.

CREATE TABLE pc.representation (
  representation_id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id              text        NOT NULL,
  representative_contact_id uuid        NOT NULL,
  represented_party_id      uuid        NOT NULL,
  representation_kind_code  text        NULL,
  authority_scope           jsonb       NULL,
  since                     date        NULL,
  until                     date        NULL,
  recorded_at               timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT representation_pkey PRIMARY KEY (representation_id),
  CONSTRAINT representation_representative_contact_fkey
    FOREIGN KEY (workspace_id, representative_contact_id) REFERENCES pc.contact (workspace_id, contact_id),
  CONSTRAINT representation_represented_party_fkey
    FOREIGN KEY (workspace_id, represented_party_id) REFERENCES pc.party (workspace_id, party_id),
  CONSTRAINT representation_kind_code_not_blank CHECK (btrim(representation_kind_code) <> ''),
  CONSTRAINT representation_authority_scope_is_an_object
    CHECK (jsonb_typeof(authority_scope) = 'object' AND authority_scope <> '{}'::jsonb),
  CONSTRAINT representation_period_is_ordered CHECK (since < until)
);
COMMENT ON TABLE pc.representation IS
  'The workspace''s accepted, scoped understanding that a Person or System Contact may communicate or act for a Party. Stronger than association, and distinct from access authorization and from actual action. No transitive delegation is inferred.';
COMMENT ON COLUMN pc.representation.representation_kind_code IS
  'Governed kind of representation. The vocabulary is deferred by the model (§11): no catalogue exists and nothing constrains the value yet.';

-- A Destination never represents a Party.
CREATE TRIGGER representation_representative_is_not_a_destination
  BEFORE INSERT OR UPDATE OF representative_contact_id ON pc.representation
  FOR EACH ROW EXECUTE FUNCTION pc.require_contact_kind(
    'representative_contact_id', 'person,system', 'representation_representative_is_not_a_destination');

CREATE TRIGGER representation_clocks
  BEFORE UPDATE ON pc.representation
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at_and_touch_updated_at();

-- To follow each reference from the other side. Leads with workspace_id,
-- as every index on a workspace-owned table does.
CREATE INDEX representation_representative_contact_id_idx ON pc.representation (workspace_id, representative_contact_id);
CREATE INDEX representation_represented_party_id_idx ON pc.representation (workspace_id, represented_party_id);

SELECT pc.isolate_by_workspace('pc.representation');

-- ── principal_binding ────────────────────────────────────────────────────────

CREATE TABLE pc.principal_binding (
  principal_binding_id   uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id           text        NOT NULL,
  identity_principal_ref text        NOT NULL,
  contact_id             uuid        NOT NULL,
  assurance              jsonb       NULL,
  since                  date        NULL,
  until                  date        NULL,
  recorded_at            timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT principal_binding_pkey PRIMARY KEY (principal_binding_id),
  CONSTRAINT principal_binding_contact_fkey
    FOREIGN KEY (workspace_id, contact_id) REFERENCES pc.contact (workspace_id, contact_id),
  CONSTRAINT principal_binding_identity_principal_ref_not_blank
    CHECK (btrim(identity_principal_ref) <> ''),
  CONSTRAINT principal_binding_assurance_is_an_object
    CHECK (jsonb_typeof(assurance) = 'object' AND assurance <> '{}'::jsonb),
  CONSTRAINT principal_binding_period_is_ordered CHECK (since < until),
  -- One Principal resolves to at most one Contact per period. Enforced only
  -- where both bounds are known.
  CONSTRAINT principal_binding_known_periods_do_not_overlap
    EXCLUDE USING gist (
      workspace_id WITH =, identity_principal_ref WITH =, daterange(since, until, '[)') WITH &&
    ) WHERE (since IS NOT NULL AND until IS NOT NULL)
);
COMMENT ON TABLE pc.principal_binding IS
  'The workspace''s accepted business mapping from an Identity-owned Principal to a Person or System Contact. Authentication proves control of a Principal, not human identity, affiliation, representation, Party standing or business authority.';
COMMENT ON COLUMN pc.principal_binding.identity_principal_ref IS
  'Opaque Principal reference owned by Aikyat Identity. Text, the type of Identity''s own principal key. Never a foreign key: Identity is another module.';

-- A Destination is never bound to a Principal.
CREATE TRIGGER principal_binding_contact_is_not_a_destination
  BEFORE INSERT OR UPDATE OF contact_id ON pc.principal_binding
  FOR EACH ROW EXECUTE FUNCTION pc.require_contact_kind(
    'contact_id', 'person,system', 'principal_binding_contact_is_not_a_destination');

CREATE TRIGGER principal_binding_clocks
  BEFORE UPDATE ON pc.principal_binding
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at_and_touch_updated_at();

-- To follow each reference from the other side. Leads with workspace_id,
-- as every index on a workspace-owned table does.
CREATE INDEX principal_binding_contact_id_idx ON pc.principal_binding (workspace_id, contact_id);
CREATE INDEX principal_binding_identity_principal_ref_idx ON pc.principal_binding (workspace_id, identity_principal_ref);

SELECT pc.isolate_by_workspace('pc.principal_binding');
