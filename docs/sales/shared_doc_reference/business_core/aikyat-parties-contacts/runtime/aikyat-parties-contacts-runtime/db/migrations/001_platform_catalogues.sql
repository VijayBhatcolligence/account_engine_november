-- 001 · Platform catalogues.
--
-- Governed reference data shared by every workspace. These tables carry NO
-- workspace_id and get NO row-level security policy: a legal form or an
-- identifier scheme means the same thing in every workspace, and a tenant
-- column here would let two workspaces disagree about what "GSTIN" is.
--
-- WHERE THE FIELDS COME FROM. model/logical-model.md retains four of these
-- families "from the earlier model" and does not restate their fields. The
-- earlier model is the previous version of that same file:
--
--     git show 7621949:model/logical-model.md
--
-- legal_form, identifier_scheme, identifier_scheme_standing and purpose_type
-- are taken from it field for field. The three type catalogues below them are
-- the earlier model's too, translated to the current vocabulary:
--
--     party_role_type               -> party_standing_type
--     party_relationship_type       -> party_relationship_type   (unchanged)
--     actor_party_affiliation_type  -> capacity_type
--
-- A CATALOGUE HOLDS VOCABULARY WHOSE MEANING IS DATA. An enum holds values
-- whose meaning requires product code. That is the earlier model's rule, and
-- it is why these are tables while contact_point.channel_kind is a CHECK.
--
-- EVERY TABLE HERE IS CREATED EMPTY. The earlier model names seed codes --
-- four standing types, three relationship types, four capacity types, six
-- purpose types, one identifier scheme with four standings -- but does not
-- give the display names, labels or definitions those rows require, and the
-- charter gives none either. Wording a definition is deciding a meaning, so
-- the rows arrive in their own migration once the wording is signed off.
--
-- An empty string is never a value. Every required text column refuses it,
-- so "not known" has exactly one representation where NULL is allowed and no
-- representation at all where it is not.

-- ── legal identity vocabulary ────────────────────────────────────────────────

CREATE TABLE pc.legal_form (
  legal_form_code   text NOT NULL,
  jurisdiction_code text NOT NULL,
  display_name      text NOT NULL,
  CONSTRAINT legal_form_pkey PRIMARY KEY (legal_form_code),
  CONSTRAINT legal_form_code_not_blank CHECK (btrim(legal_form_code) <> ''),
  CONSTRAINT legal_form_jurisdiction_code_not_blank CHECK (btrim(jurisdiction_code) <> ''),
  CONSTRAINT legal_form_display_name_not_blank CHECK (btrim(display_name) <> '')
);
COMMENT ON TABLE pc.legal_form IS
  'Platform catalogue of jurisdiction-specific legal forms, for example IN_HUF or DE_GMBH. "Individual" is an anchor kind, not a legal form. No workspace_id, no row-level security.';

CREATE TABLE pc.identifier_scheme (
  scheme_code       text NOT NULL,
  jurisdiction_code text NOT NULL,
  display_name      text NOT NULL,
  CONSTRAINT identifier_scheme_pkey PRIMARY KEY (scheme_code),
  CONSTRAINT identifier_scheme_code_not_blank CHECK (btrim(scheme_code) <> ''),
  CONSTRAINT identifier_scheme_jurisdiction_code_not_blank CHECK (btrim(jurisdiction_code) <> ''),
  CONSTRAINT identifier_scheme_display_name_not_blank CHECK (btrim(display_name) <> '')
);
COMMENT ON TABLE pc.identifier_scheme IS
  'Platform catalogue of identifiers that identify a legal subject or evidence an authority registration, for example IN_PAN or IN_CIN. Normalisation, valid scope levels and whether a scheme supports standing are scheme behaviours implemented in code, not columns here.';

CREATE TABLE pc.identifier_scheme_standing (
  scheme_code    text    NOT NULL,
  standing_code  text    NOT NULL,
  display_name   text    NOT NULL,
  definition     text    NOT NULL,
  requires_value boolean NOT NULL,
  CONSTRAINT identifier_scheme_standing_pkey PRIMARY KEY (scheme_code, standing_code),
  CONSTRAINT identifier_scheme_standing_scheme_fkey
    FOREIGN KEY (scheme_code) REFERENCES pc.identifier_scheme (scheme_code),
  CONSTRAINT identifier_scheme_standing_code_not_blank CHECK (btrim(standing_code) <> ''),
  CONSTRAINT identifier_scheme_standing_display_name_not_blank CHECK (btrim(display_name) <> ''),
  CONSTRAINT identifier_scheme_standing_definition_not_blank CHECK (btrim(definition) <> '')
);
COMMENT ON TABLE pc.identifier_scheme_standing IS
  'Scheme-specific vocabulary for authority standing. requires_value says whether an identifier value is required; when false the value is prohibited. pc.party_identifier enforces that.';

-- ── purpose vocabulary ───────────────────────────────────────────────────────

CREATE TABLE pc.purpose_type (
  purpose_type_code text   NOT NULL,
  display_name      text   NOT NULL,
  aliases           text[] NULL,
  definition        text   NOT NULL,
  CONSTRAINT purpose_type_pkey PRIMARY KEY (purpose_type_code),
  CONSTRAINT purpose_type_code_not_blank CHECK (btrim(purpose_type_code) <> ''),
  CONSTRAINT purpose_type_display_name_not_blank CHECK (btrim(display_name) <> ''),
  CONSTRAINT purpose_type_definition_not_blank CHECK (btrim(definition) <> ''),
  -- No aliases recorded is NULL. An empty list would be a second way to say it.
  CONSTRAINT purpose_type_aliases_not_empty CHECK (aliases IS NULL OR cardinality(aliases) > 0)
);
COMMENT ON TABLE pc.purpose_type IS
  'Platform catalogue of canonical business functions, such as sales or order intake. The workspace vocabulary pc.purpose may map to one of these. A label alone never creates product behaviour.';

-- ── type catalogues behind the _code fields ──────────────────────────────────

CREATE TABLE pc.party_standing_type (
  standing_type_code text NOT NULL,
  display_name       text NOT NULL,
  definition         text NOT NULL,
  CONSTRAINT party_standing_type_pkey PRIMARY KEY (standing_type_code),
  CONSTRAINT party_standing_type_code_not_blank CHECK (btrim(standing_type_code) <> ''),
  CONSTRAINT party_standing_type_display_name_not_blank CHECK (btrim(display_name) <> ''),
  CONSTRAINT party_standing_type_definition_not_blank CHECK (btrim(definition) <> '')
);
COMMENT ON TABLE pc.party_standing_type IS
  'Platform catalogue of reusable standing meanings: what a Party is to an operated Party. The earlier model''s party_role_type, renamed. Its named seeds are customer, supplier, employee and prospect; none is inserted here.';

CREATE TABLE pc.party_relationship_type (
  relationship_type_code text NOT NULL,
  forward_label          text NOT NULL,
  inverse_label          text NOT NULL,
  definition             text NOT NULL,
  from_party_kind        text NULL,
  to_party_kind          text NULL,
  CONSTRAINT party_relationship_type_pkey PRIMARY KEY (relationship_type_code),
  CONSTRAINT party_relationship_type_code_not_blank CHECK (btrim(relationship_type_code) <> ''),
  CONSTRAINT party_relationship_type_forward_label_not_blank CHECK (btrim(forward_label) <> ''),
  CONSTRAINT party_relationship_type_inverse_label_not_blank CHECK (btrim(inverse_label) <> ''),
  CONSTRAINT party_relationship_type_definition_not_blank CHECK (btrim(definition) <> ''),
  -- Empty permits either Party kind. It does not mean "none".
  CONSTRAINT party_relationship_type_from_party_kind_valid
    CHECK (from_party_kind IN ('person', 'organization')),
  CONSTRAINT party_relationship_type_to_party_kind_valid
    CHECK (to_party_kind IN ('person', 'organization'))
);
COMMENT ON TABLE pc.party_relationship_type IS
  'Platform catalogue of directional Party-to-Party relationship vocabulary. from_party_kind and to_party_kind restrict the endpoints when set; empty permits either kind. pc.party_relationship enforces them.';

CREATE TABLE pc.capacity_type (
  capacity_type_code text NOT NULL,
  forward_label      text NOT NULL,
  inverse_label      text NOT NULL,
  definition         text NOT NULL,
  from_contact_kind  text NOT NULL,
  to_party_kind      text NULL,
  CONSTRAINT capacity_type_pkey PRIMARY KEY (capacity_type_code),
  CONSTRAINT capacity_type_code_not_blank CHECK (btrim(capacity_type_code) <> ''),
  CONSTRAINT capacity_type_forward_label_not_blank CHECK (btrim(forward_label) <> ''),
  CONSTRAINT capacity_type_inverse_label_not_blank CHECK (btrim(inverse_label) <> ''),
  CONSTRAINT capacity_type_definition_not_blank CHECK (btrim(definition) <> ''),
  CONSTRAINT capacity_type_from_contact_kind_valid
    CHECK (from_contact_kind IN ('person', 'system', 'destination')),
  CONSTRAINT capacity_type_to_party_kind_valid
    CHECK (to_party_kind IN ('person', 'organization'))
);
COMMENT ON TABLE pc.capacity_type IS
  'Platform catalogue of governed business capacities in which a Contact is associated with a Party. The earlier model''s actor_party_affiliation_type, translated: the association generalised affiliation, so from_contact_kind may be any Contact kind. The earlier model''s four seeds (affiliated_with, works_for, assists, commercial_agent_for) are all Person-only; none is inserted here. This is the GOVERNED half of contact_party_association.capacity_code. The workspace-defined half is pc.capacity.';
