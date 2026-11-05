-- 009 · Restore the approved Indian legal-identity catalogue vocabulary.
--
-- The earlier approved model (git show 7621949:model/logical-model.md) made
-- IN_GST and its active, suspended, cancelled and none_held standings the MEP
-- seed set. Migration 001 created the catalogue tables empty because complete
-- display names and definitions had not then been approved. Those meanings
-- are now explicit in the current logical model, so this forward migration
-- installs them without changing any table or workspace-owned record.
--
-- IN_PAN has no standing vocabulary in the MEP. CIN is not seeded yet.

INSERT INTO pc.legal_form (
  legal_form_code, jurisdiction_code, display_name
) VALUES (
  'IN_PVT_LTD', 'IN', 'Private limited company'
);

INSERT INTO pc.identifier_scheme (
  scheme_code, jurisdiction_code, display_name
) VALUES
  ('IN_PAN', 'IN', 'Permanent Account Number (PAN)'),
  ('IN_GST', 'IN', 'Goods and Services Tax Identification Number (GSTIN)');

INSERT INTO pc.identifier_scheme_standing (
  scheme_code, standing_code, display_name, definition, requires_value
) VALUES
  (
    'IN_GST',
    'active',
    'Active',
    'The authority currently records this GST registration as active.',
    true
  ),
  (
    'IN_GST',
    'suspended',
    'Suspended',
    'The authority currently records this GST registration as suspended.',
    true
  ),
  (
    'IN_GST',
    'cancelled',
    'Cancelled',
    'The authority records this GST registration as cancelled.',
    true
  ),
  (
    'IN_GST',
    'none_held',
    'None held',
    'It has been positively established that the Party holds no GST registration for the stated jurisdiction scope and effective period.',
    false
  );
