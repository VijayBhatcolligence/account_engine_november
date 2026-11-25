-- T24 · the schema proved on PostgreSQL (rev 17, 24-Nov-2026): fin.sales_invoice / _line / _history, the TWIN of Manoj's
-- purchase voucher (fin.purchase_invoice / _line / _history), posting into the shared fin.journal_entry / fin.journal_line.
-- Rev 15: the sale also posts its COST in the same entry (rule R13): Dr 501040 Cost of Goods Sold · Cr 106020 Finished Goods per
-- lot (FIFO), from inv.stock_lot (a stub of inventory; lot costs illustrative); the lots go down at approval.
-- Rev 16 (S1 part 1): the book and its dated settings; the voucher reads inventory_mode and costing_method in force on its
-- invoice date and stamps them.
-- Rev 17 (S1 part 2): the code writes each line's ROLE (and case); the mapping (fin.account_determination, looked up by
-- fin.determine_ledger on the posting date) gives its ledger; the line keeps the rule, version, case, role and mapping row,
-- and the journal line copies them: "why was this posted?" is a query.
-- Billing raises the invoice; the Accounts Executive books its entry; the Accounts Manager approves; it posts.
-- Run after out.sql on an empty database:  psql -v ON_ERROR_STOP=1 -f out.sql -f t24_schema_test.sql
-- 1. Seeds the smallest master data (scenario names; ids are fixed test values).
-- 2. Walks scenario B4-01 (Billing's KA/INV/2627/0143 → Sri Lakshmi Distributors, ₹7,48,125.00): submitted → approved → posted.
-- 3. Tries 62 wrong rows (N1–N62): each must be refused by the named CHECK, key, EXCLUDE or foreign key
--    (23503 = a foreign key; 428C9 = a generated column).
-- 4. Accepted, as his: a correction of a posted voucher (SV-0012-1: the old entry reversed, the new one posted, same invoice
--    number in one chain); a voucher sent back and sent again; a B2C sale paid by UPI (no customer line).
-- Everything runs in one transaction and is rolled back at the end.

\set ON_ERROR_STOP 1
SET client_min_messages = warning;
BEGIN;

-- ---------------------------------------------------------------- 1 · masters (P&C, T12, the books core)
INSERT INTO pc.private_anchor (anchor_id, workspace_id, anchor_kind, created_at) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'aikyat-biscuits', 'organization', now()),  -- P-OUR Aikyat Biscuits
  ('a0000000-0000-4000-8000-000000000002', 'aikyat-biscuits', 'organization', now()),  -- P-1 Sri Lakshmi Distributors
  ('a0000000-0000-4000-8000-000000000003', 'aikyat-biscuits', 'organization', now()),  -- P-2 Namma Bakes
  ('c0000000-0000-4000-8000-000000000001', 'aikyat-biscuits', 'person', now()),        -- Teja (AE)
  ('c0000000-0000-4000-8000-000000000002', 'aikyat-biscuits', 'person', now()),        -- Rajan (AM)
  ('c0000000-0000-4000-8000-000000000003', 'aikyat-biscuits', 'person', now()),        -- Latha (Stores)
  ('c0000000-0000-4000-8000-000000000004', 'aikyat-biscuits', 'person', now());        -- Arun (Sales)
INSERT INTO pc.party (party_id, workspace_id, party_kind, legal_name) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'aikyat-biscuits', 'organization', 'Aikyat Biscuits Private Limited'),
  ('a0000000-0000-4000-8000-000000000002', 'aikyat-biscuits', 'organization', 'Sri Lakshmi Distributors'),
  ('a0000000-0000-4000-8000-000000000003', 'aikyat-biscuits', 'organization', 'Namma Bakes');
INSERT INTO pc.operated_party (operated_party_id, workspace_id, party_id) VALUES
  ('0f000000-0000-4000-8000-000000000001', 'aikyat-biscuits', 'a0000000-0000-4000-8000-000000000001');
INSERT INTO pc.contact (contact_id, workspace_id, contact_kind, display_name) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'aikyat-biscuits', 'person', 'Teja'),
  ('c0000000-0000-4000-8000-000000000002', 'aikyat-biscuits', 'person', 'Rajan'),
  ('c0000000-0000-4000-8000-000000000003', 'aikyat-biscuits', 'person', 'Latha'),
  ('c0000000-0000-4000-8000-000000000004', 'aikyat-biscuits', 'person', 'Arun');
INSERT INTO pc.business_location (business_location_id, workspace_id, party_id, display_name, locality, administrative_area_code, postal_code, country_code) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'aikyat-biscuits', 'a0000000-0000-4000-8000-000000000001', 'Bengaluru plant and HQ', 'Bengaluru', 'IN-KA', '560058', 'IN'),
  ('b0000000-0000-4000-8000-000000000002', 'aikyat-biscuits', 'a0000000-0000-4000-8000-000000000001', 'Hosur unit', 'Hosur', 'IN-TN', '635126', 'IN'),
  ('b0000000-0000-4000-8000-000000000003', 'aikyat-biscuits', 'a0000000-0000-4000-8000-000000000002', 'Bengaluru', 'Bengaluru', 'IN-KA', '560002', 'IN'),
  ('b0000000-0000-4000-8000-000000000004', 'aikyat-biscuits', 'a0000000-0000-4000-8000-000000000003', 'Namma Bakes, Mysuru', 'Mysuru', 'IN-KA', '570001', 'IN');
INSERT INTO pc.party_identifier (party_identifier_id, workspace_id, party_id, scheme_code, jurisdiction_scope_code, value, standing_code) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'aikyat-biscuits', 'a0000000-0000-4000-8000-000000000001', 'IN_GST', 'IN', '29AAECA0000A1ZQ', 'active'),
  ('d0000000-0000-4000-8000-000000000002', 'aikyat-biscuits', 'a0000000-0000-4000-8000-000000000001', 'IN_GST', 'IN', '33AAECA0000A1Z1', 'active'),
  ('d0000000-0000-4000-8000-000000000003', 'aikyat-biscuits', 'a0000000-0000-4000-8000-000000000002', 'IN_GST', 'IN', '29AAKFS0000S1Z2', 'active'),
  ('d0000000-0000-4000-8000-000000000004', 'aikyat-biscuits', 'a0000000-0000-4000-8000-000000000003', 'IN_GST', 'IN', '29AAACN0000N1Z5', 'active');

INSERT INTO fin.gst_state_code (gst_code, iso_3166_2, display_name) VALUES
  ('29', 'IN-KA', 'Karnataka'), ('33', 'IN-TN', 'Tamil Nadu'), ('96', NULL, 'Other Countries');
INSERT INTO fin.ledger_account (account_code, display_name, kind, parent_account_code, is_group, account_type) VALUES
  ('100000', 'Assets', 'asset', NULL, true, NULL),
  ('107000', 'Trade Receivables', 'asset', '100000', true, NULL),
  ('107010', 'Trade Receivables – Domestic', 'asset', '107000', false, 'receivable'),
  ('107100', 'Trade Receivables – Dealer/Distributor', 'asset', '107000', false, 'receivable'),
  ('400000', 'Income', 'income', NULL, true, NULL),
  ('401000', 'Revenue from Operations', 'income', '400000', true, NULL),
  ('401010', 'Sale of Products', 'income', '401000', false, NULL),
  ('401020', 'Sale of Services', 'income', '401000', false, NULL),
  ('401030', 'Export Sales', 'income', '401000', false, NULL),
  ('200000', 'Liabilities', 'liability', NULL, true, NULL),
  ('206000', 'Other Current Liabilities', 'liability', '200000', true, NULL),
  ('206010', 'Statutory Dues Payable', 'liability', '206000', true, NULL),
  ('206011', 'Output CGST', 'liability', '206010', false, 'output_cgst'),
  ('206012', 'Output SGST', 'liability', '206010', false, 'output_sgst'),
  ('206013', 'Output IGST', 'liability', '206010', false, 'output_igst'),
  ('206014', 'TCS Payable', 'liability', '206010', false, 'tcs_payable'),
  ('108000', 'Cash & Bank Balances', 'asset', '100000', true, NULL),
  ('108030', 'UPI / Card Clearing', 'asset', '108000', false, NULL),
  ('500000', 'Expenses', 'expense', NULL, true, NULL),
  ('505000', 'Other Expenses – Administrative', 'expense', '500000', true, NULL),
  ('505120', 'Round Off', 'expense', '505000', false, 'round_off');
INSERT INTO fin.debtor_category (debtor_category_code, display_name, ledger_account_code, sort_order) VALUES
  ('DOMESTIC_B2B_REGULAR', 'Domestic B2B Trade Debtor – Regular', '107010', 1),
  ('DEALER_DISTRIBUTOR', 'Dealer / Distributor Debtor', '107100', 11);
INSERT INTO fin.customer_request (request_id, workspace_id, operated_party_id, paper_form_number, handed_over_by_contact_id, created_by_contact_id, stage) VALUES
  ('e0000000-0000-4000-8000-000000000101', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', 'CRF-0011', 'c0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'active'),
  ('e0000000-0000-4000-8000-000000000102', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', 'CRF-0012', 'c0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'active');
INSERT INTO fin.debtor_account (debtor_account_id, workspace_id, operated_party_id, party_id, opened_from_request_id, customer_code, account_name,
    debtor_category_code, ledger_account_code, customer_type_code, resident_status, e_invoice_applicable, tcs_applicability_confirmed,
    credit_or_cash, payment_terms_code, credit_days, po_reference_rule, invoice_delivery_channel, opened_at) VALUES
  ('da000000-0000-4000-8000-000000000001', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000101',
   'C000001', 'Sri Lakshmi Distributors', 'DEALER_DISTRIBUTOR', '107100', 'b2b', 'resident', 'yes', 'no', 'credit', 'net_30', 30, 'every_invoice', 'email', '2026-04-01'),
  ('da000000-0000-4000-8000-000000000002', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000102',
   'C000002', 'Namma Bakes', 'DOMESTIC_B2B_REGULAR', '107010', 'b2b', 'resident', 'yes', 'no', 'credit', 'net_15', 15, 'none', 'email', '2026-04-01');
INSERT INTO fin.debtor_tax_registration (debtor_tax_registration_id, workspace_id, debtor_account_id, party_identifier_id, registration_type, is_default) VALUES
  ('d7000000-0000-4000-8000-000000000001', 'aikyat-biscuits', 'da000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'regular', true),
  ('d7000000-0000-4000-8000-000000000002', 'aikyat-biscuits', 'da000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000004', 'regular', true);
INSERT INTO fin.debtor_location (debtor_location_id, workspace_id, debtor_account_id, business_location_id, usage, debtor_tax_registration_id, is_primary, since) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'aikyat-biscuits', 'da000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'bill_to', 'd7000000-0000-4000-8000-000000000001', true, '2026-04-01'),
  ('d1000000-0000-4000-8000-000000000002', 'aikyat-biscuits', 'da000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000004', 'bill_to', 'd7000000-0000-4000-8000-000000000002', true, '2026-04-01');

INSERT INTO fin.branch (branch_id, workspace_id, operated_party_id, branch_code, display_name, business_location_id, gst_identifier_id, since) VALUES
  ('6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', 'KA-01', 'Bengaluru plant and HQ', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', '2020-04-01'),
  ('6b1d0a52-0002-4f0e-8a51-5c0b7a000002', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', 'TN-01', 'Hosur unit', 'b0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', '2020-04-01');
INSERT INTO fin.fiscal_year (fiscal_year_id, workspace_id, operated_party_id, label, start_date, end_date) VALUES
  ('6b1d0a52-1026-4f0e-8a51-5c0b7a002026', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', 'FY 2026-27', '2026-04-01', '2027-03-31');
-- Rev 15: the stock and cost ledgers (501040 proposed, G18) and the lots on 07-Oct (scenario quantities; costs and dates illustrative).
INSERT INTO fin.ledger_account (account_code, display_name, kind, parent_account_code, is_group, account_type) VALUES
  ('106000', 'Inventories', 'asset', '100000', true, NULL),
  ('106020', 'Finished Goods', 'asset', '106000', false, 'stock'),
  ('501000', 'Cost of Goods Sold (group: test seed)', 'expense', '500000', true, NULL),
  ('501040', 'Cost of Goods Sold', 'expense', '501000', false, NULL);
INSERT INTO inv.stock_lot (stock_lot_id, workspace_id, branch_id, godown_code, item_code, lot_no, received_on, quantity_received, quantity_left, unit_cost) VALUES
  ('5a000000-0000-4000-8000-000000000001', 'aikyat-biscuits', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'KA-FG', 'FG-101', 'G-2604', '2026-04-14', 300, 300, 540),
  ('5a000000-0000-4000-8000-000000000002', 'aikyat-biscuits', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'KA-FG', 'FG-101', 'G-2608', '2026-08-12', 2000, 2000, 560),
  ('5a000000-0000-4000-8000-000000000003', 'aikyat-biscuits', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'KA-FG', 'FG-102', 'C-2607', '2026-07-16', 1500, 1500, 760);
-- Rev 16 · S1 part 1: Aikyat's primary book, the 2 settings T24 needs, and its values (ILLUSTRATIVE: the CA decides, G3).
INSERT INTO fin.book (book_id, workspace_id, operated_party_id, book_code, display_name, is_primary) VALUES
  ('0b000000-0000-4000-8000-000000000001', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', 'PRIMARY', 'Aikyat Biscuits · primary book', true);
INSERT INTO fin.setting_definition (setting_code, display_name, allowed_values, owner_task, read_by) VALUES
  ('inventory_mode', 'Inventory accounting', '{perpetual,periodic}', 'S1 part 1 (for T24); S4 owns it', 'T24 rule R13, T11'),
  ('costing_method', 'Costing method', '{fifo,weighted_average}', 'S1 part 1 (for T24); S4 owns it', 'T24 rule R13, T9');
INSERT INTO fin.book_setting (workspace_id, book_id, setting_code, setting_value, effective_from, reason, approved_by_contact_id, approved_at) VALUES
  ('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'inventory_mode', 'perpetual', '2026-04-01', 'First setting (illustrative)', 'c0000000-0000-4000-8000-000000000002', now()),
  ('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'costing_method', 'fifo', '2026-04-01', 'First setting (illustrative)', 'c0000000-0000-4000-8000-000000000002', now());
-- What the rule reads: the company's primary book, the setting in force on a date.
CREATE FUNCTION pg_temp.setting(company uuid, code text, on_date date) RETURNS text LANGUAGE sql AS $$
  SELECT s.setting_value FROM fin.book_setting s JOIN fin.book b ON b.book_id = s.book_id
   WHERE b.operated_party_id = company AND b.is_primary AND s.setting_code = code
     AND s.effective_from <= on_date AND (s.effective_until IS NULL OR on_date < s.effective_until) $$;
-- Rev 17 · S1 part 2: the ledgers the rules use that the test had not seeded (the app's catalogue.ts; proposed, G18), a closed
-- year (for the backdating test), the 12 line roles, the rule SALES_INVOICE v1 (its 13 cases, its 12 roles) and the mapping for
-- the primary book: 19 rows = the app's ledgers today (engine.ts caseOf + catalogue.ts LEDGERS), each made by Teja, checked by Rajan.
INSERT INTO fin.ledger_account (account_code, display_name, kind, parent_account_code, is_group, account_type) VALUES
  ('401011', 'Sale of Products – Inter-state', 'income', '401000', false, NULL),
  ('401050', 'Sales – Exempt / Nil-rated / Non-GST', 'income', '401000', false, NULL),
  ('401070', 'Freight Recovered', 'income', '401000', false, NULL),
  ('206040', 'Contract Liability (Income Received in Advance)', 'liability', '206000', false, NULL),
  ('108010', 'Cash in Hand', 'asset', '108000', false, NULL),
  ('109040', 'IGST Refund Receivable', 'asset', '100000', false, NULL),
  ('110030', 'Expenses Recoverable (pure agent)', 'asset', '100000', false, NULL),
  ('501030', 'Change in Inventory', 'expense', '501000', false, NULL);
INSERT INTO fin.fiscal_year (fiscal_year_id, workspace_id, operated_party_id, label, start_date, end_date, is_closed, closed_by_contact_id, closed_at) VALUES
  ('6b1d0a52-1025-4f0e-8a51-5c0b7a002025', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', 'FY 2025-26', '2025-04-01', '2026-03-31', true, 'c0000000-0000-4000-8000-000000000002', now());
INSERT INTO fin.line_role (line_role_code, display_name, ledger_source, required_kind, required_account_type) VALUES
  ('customer', 'The customer: what it owes', 'party_account', 'asset', 'receivable'),
  ('settlement', 'Paid at once: cash, UPI or card (R8)', 'determination', 'asset', NULL),
  ('revenue', 'Revenue from the line', 'determination', 'income', NULL),
  ('deferred_revenue', 'Revenue received in advance (R12)', 'determination', 'liability', NULL),
  ('recoverable_expense', 'Expense recovered as pure agent (R11)', 'determination', 'asset', NULL),
  ('igst_refund', 'IGST paid by us, to claim back (R5, R6)', 'determination', 'asset', NULL),
  ('output_cgst', 'Output CGST', 'determination', 'liability', 'output_cgst'),
  ('output_sgst', 'Output SGST', 'determination', 'liability', 'output_sgst'),
  ('output_igst', 'Output IGST', 'determination', 'liability', 'output_igst'),
  ('round_off', 'Round off', 'determination', 'expense', 'round_off'),
  ('cogs', 'Cost of goods sold (R13)', 'determination', 'expense', NULL),
  ('stock', 'Stock that leaves (R13)', 'determination', 'asset', 'stock');
INSERT INTO fin.posting_rule (rule_code, version, document_type, display_name, effective_from, code_ref, casebook_ref, change_note) VALUES
  ('SALES_INVOICE', 1, 'sales_invoice', 'Sales invoice: the customer, revenue, GST and the cost of goods sold', '2026-04-01',
   'app/sales/src/sales/engine.ts postingFor()', 'casebook.test.ts + docs/sales/shared_doc_reference/expected_postings.json', 'First version (R13 added in rev 15, before go-live)');
INSERT INTO fin.posting_rule_case (rule_code, version, case_code, display_name) VALUES
  ('SALES_INVOICE', 1, 'R1', 'Goods, domestic, local (place of supply = our branch''s state)'),
  ('SALES_INVOICE', 1, 'R2', 'Goods, domestic, inter-state'),
  ('SALES_INVOICE', 1, 'R3', 'Service line (SAC)'),
  ('SALES_INVOICE', 1, 'R4', 'Export under LUT: no GST'),
  ('SALES_INVOICE', 1, 'R5', 'Export with IGST: the IGST claimed back'),
  ('SALES_INVOICE', 1, 'R6', 'SEZ supply, under LUT or with IGST'),
  ('SALES_INVOICE', 1, 'R7', 'TCS item (scrap, luxury …): not computed yet'),
  ('SALES_INVOICE', 1, 'R8', 'Paid at once: cash, UPI or card'),
  ('SALES_INVOICE', 1, 'R9', 'Nil-rated, exempt or non-GST line'),
  ('SALES_INVOICE', 1, 'R10', 'Freight charged to the buyer'),
  ('SALES_INVOICE', 1, 'R11', 'Expense paid as pure agent'),
  ('SALES_INVOICE', 1, 'R12', 'Period service billed in advance'),
  ('SALES_INVOICE', 1, 'R13', 'Goods sold: their cost, from inventory (FIFO or weighted average)');
INSERT INTO fin.posting_rule_role (rule_code, version, line_role_code) SELECT 'SALES_INVOICE', 1, line_role_code FROM fin.line_role;
INSERT INTO fin.account_determination (account_determination_id, workspace_id, book_id, document_type, line_role_code, party_kind, supply_scope, line_kind, taxability, settlement_mode, ledger_account_code, effective_from, status, reason, made_by_contact_id, made_at, checked_by_contact_id, checked_at) VALUES
  ('de000000-0000-4000-8000-000000000001', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'sales_invoice', 'revenue', 'domestic', NULL, 'goods', 'taxable', NULL, '401010', '2026-04-01', 'approved', 'R1, R2: goods sold in India (day one = the app''s ledgers; illustrative until the CA confirms, G18)', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()),
  ('de000000-0000-4000-8000-000000000002', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'sales_invoice', 'revenue', 'domestic', NULL, 'service', 'taxable', NULL, '401020', '2026-04-01', 'approved', 'R3: services (day one = the app''s ledgers; illustrative until the CA confirms, G18)', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()),
  ('de000000-0000-4000-8000-000000000003', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'sales_invoice', 'revenue', 'domestic', NULL, 'charge', 'taxable', NULL, '401070', '2026-04-01', 'approved', 'R10: freight charged to the buyer (day one = the app''s ledgers; illustrative until the CA confirms, G18)', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()),
  ('de000000-0000-4000-8000-000000000004', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'sales_invoice', 'revenue', 'export', NULL, NULL, 'taxable', NULL, '401030', '2026-04-01', 'approved', 'R4, R5: exports (day one = the app''s ledgers; illustrative until the CA confirms, G18)', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()),
  ('de000000-0000-4000-8000-000000000005', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'sales_invoice', 'revenue', 'sez', NULL, NULL, 'taxable', NULL, '401030', '2026-04-01', 'approved', 'R6: SEZ supplies (401030 to confirm, G18) (day one = the app''s ledgers; illustrative until the CA confirms, G18)', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()),
  ('de000000-0000-4000-8000-000000000006', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'sales_invoice', 'revenue', NULL, NULL, NULL, 'nil_rated', NULL, '401050', '2026-04-01', 'approved', 'R9: nil-rated (day one = the app''s ledgers; illustrative until the CA confirms, G18)', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()),
  ('de000000-0000-4000-8000-000000000007', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'sales_invoice', 'revenue', NULL, NULL, NULL, 'exempt', NULL, '401050', '2026-04-01', 'approved', 'R9: exempt (day one = the app''s ledgers; illustrative until the CA confirms, G18)', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()),
  ('de000000-0000-4000-8000-000000000008', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'sales_invoice', 'revenue', NULL, NULL, NULL, 'non_gst', NULL, '401050', '2026-04-01', 'approved', 'R9: non-GST (day one = the app''s ledgers; illustrative until the CA confirms, G18)', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()),
  ('de000000-0000-4000-8000-000000000009', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', NULL, 'deferred_revenue', NULL, NULL, NULL, NULL, NULL, '206040', '2026-04-01', 'approved', 'R12: a period service billed in advance (day one = the app''s ledgers; illustrative until the CA confirms, G18)', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()),
  ('de000000-0000-4000-8000-000000000010', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', NULL, 'recoverable_expense', NULL, NULL, NULL, NULL, NULL, '110030', '2026-04-01', 'approved', 'R11: expense paid as pure agent (day one = the app''s ledgers; illustrative until the CA confirms, G18)', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()),
  ('de000000-0000-4000-8000-000000000011', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', NULL, 'igst_refund', NULL, NULL, NULL, NULL, NULL, '109040', '2026-04-01', 'approved', 'R5, R6: IGST paid by us, claimed back (day one = the app''s ledgers; illustrative until the CA confirms, G18)', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()),
  ('de000000-0000-4000-8000-000000000012', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', NULL, 'settlement', NULL, NULL, NULL, NULL, 'cash', '108010', '2026-04-01', 'approved', 'R8: paid in cash (day one = the app''s ledgers; illustrative until the CA confirms, G18)', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()),
  ('de000000-0000-4000-8000-000000000013', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', NULL, 'settlement', NULL, NULL, NULL, NULL, 'upi_card', '108030', '2026-04-01', 'approved', 'R8: paid by UPI or card (day one = the app''s ledgers; illustrative until the CA confirms, G18)', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()),
  ('de000000-0000-4000-8000-000000000014', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', NULL, 'output_cgst', NULL, NULL, NULL, NULL, NULL, '206011', '2026-04-01', 'approved', 'Output CGST, every document (day one = the app''s ledgers; illustrative until the CA confirms, G18)', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()),
  ('de000000-0000-4000-8000-000000000015', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', NULL, 'output_sgst', NULL, NULL, NULL, NULL, NULL, '206012', '2026-04-01', 'approved', 'Output SGST, every document (day one = the app''s ledgers; illustrative until the CA confirms, G18)', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()),
  ('de000000-0000-4000-8000-000000000016', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', NULL, 'output_igst', NULL, NULL, NULL, NULL, NULL, '206013', '2026-04-01', 'approved', 'Output IGST, every document (day one = the app''s ledgers; illustrative until the CA confirms, G18)', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()),
  ('de000000-0000-4000-8000-000000000017', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', NULL, 'round_off', NULL, NULL, NULL, NULL, NULL, '505120', '2026-04-01', 'approved', 'Round off (day one = the app''s ledgers; illustrative until the CA confirms, G18)', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()),
  ('de000000-0000-4000-8000-000000000018', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', NULL, 'cogs', NULL, NULL, NULL, NULL, NULL, '501040', '2026-04-01', 'approved', 'R13: cost of goods sold (501040 proposed, G18) (day one = the app''s ledgers; illustrative until the CA confirms, G18)', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()),
  ('de000000-0000-4000-8000-000000000019', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', NULL, 'stock', NULL, NULL, NULL, NULL, NULL, '106020', '2026-04-01', 'approved', 'R13: finished goods that leave (day one = the app''s ledgers; illustrative until the CA confirms, G18)', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now());
INSERT INTO fin.account_determination_history (workspace_id, account_determination_id, operation, row_snapshot, performer_contact_id, reason)
  SELECT workspace_id, account_determination_id, op, to_jsonb(d), CASE op WHEN 'propose' THEN made_by_contact_id ELSE checked_by_contact_id END, 'Day-one mapping'
    FROM fin.account_determination d CROSS JOIN (VALUES ('propose'), ('approve')) AS o(op);
-- What the engine asks for each line the code wrote: the mapping row and its ledger (the customer line: none, its account's own).
CREATE FUNCTION pg_temp.det(role text, on_date date, pk text, sc text, lk text, tx text, st text, OUT id uuid, OUT ledger text) LANGUAGE plpgsql AS $$
BEGIN
  IF role = 'customer' THEN RETURN; END IF;
  id := fin.determine_ledger('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'sales_invoice', role, on_date, pk, sc, lk, tx, st);
  SELECT ledger_account_code INTO ledger FROM fin.account_determination WHERE account_determination_id = id;
END $$;
INSERT INTO fin.document_sequence (workspace_id, operated_party_id, document_type, last_number) VALUES
  ('aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', 'sales_invoice', 11);

-- ---------------------------------------------------------------- 2 · B4-01: submitted → approved → posted
-- Submit (Teja): the voucher is created at Submit (as his), number SV-0012; the lines the rule R1 proposed, kept as they are.
UPDATE fin.document_sequence SET last_number = last_number + 1 WHERE document_type = 'sales_invoice';
INSERT INTO fin.sales_invoice (sales_invoice_id, workspace_id, operated_party_id, branch_id, debtor_account_id, internal_ref_no, amends_sales_invoice_id, original_sales_invoice_id, revision_no, posting_date, invoice_no, invoice_date, due_date, narration, stage, submitted_by_contact_id, submitted_at) VALUES ('51000000-0000-4000-8000-000000000012', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'da000000-0000-4000-8000-000000000001', 'SV-0012', NULL, '51000000-0000-4000-8000-000000000012', 0, '2026-10-07', 'KA/INV/2627/0143', '2026-10-07', '2026-11-06', 'Being goods sold', 'submitted', 'c0000000-0000-4000-8000-000000000001', now());
-- Rev 16: the settings in force on the invoice date, stamped (perpetual + FIFO: so the cost lines below are FIFO lots).
UPDATE fin.sales_invoice SET inventory_mode = pg_temp.setting(operated_party_id, 'inventory_mode', invoice_date),
                             costing_method = pg_temp.setting(operated_party_id, 'costing_method', invoice_date) WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000012';
-- Rev 17: the code (postingFor) writes each line's role and case and the invoice's facts (domestic, local, taxable, on credit);
-- the mapping gives the ledger on the posting date; the customer line takes its account's own ledger.
INSERT INTO fin.sales_invoice_line (workspace_id, sales_invoice_id, line_no, side, ledger_account_code, debtor_account_id, inventory_item_code, quantity, stock_lot_id, amount,
    rule_code, rule_version, rule_case, line_role_code, account_determination_id, determined_ledger_code)
SELECT 'aikyat-biscuits', v.sales_invoice_id, p.no, p.side, d.ledger, p.debtor, p.item, p.qty, p.lot, p.amount, 'SALES_INVOICE', 1, p.rule_case, p.role, d.id, d.ledger
  FROM (VALUES
    (1, 'Dr', 'customer', NULL, NULL, 'da000000-0000-4000-8000-000000000001'::uuid, NULL, NULL::numeric, NULL::uuid, 748125.00),
    (2, 'Cr', 'revenue', 'R1', 'goods', NULL::uuid, NULL, NULL::numeric, NULL::uuid, 712500.00),
    (3, 'Cr', 'output_cgst', NULL, 'goods', NULL::uuid, NULL, NULL::numeric, NULL::uuid, 17812.50),
    (4, 'Cr', 'output_sgst', NULL, 'goods', NULL::uuid, NULL, NULL::numeric, NULL::uuid, 17812.50),
    (5, 'Dr', 'cogs', 'R13', 'goods', NULL::uuid, NULL, NULL::numeric, NULL::uuid, 558000.00),
    (6, 'Cr', 'stock', 'R13', 'goods', NULL::uuid, 'FG-101', 300::numeric, '5a000000-0000-4000-8000-000000000001'::uuid, 162000.00),
    (7, 'Cr', 'stock', 'R13', 'goods', NULL::uuid, 'FG-101', 300::numeric, '5a000000-0000-4000-8000-000000000002'::uuid, 168000.00),
    (8, 'Cr', 'stock', 'R13', 'goods', NULL::uuid, 'FG-102', 300::numeric, '5a000000-0000-4000-8000-000000000003'::uuid, 228000.00)) AS p(no, side, role, rule_case, line_kind, debtor, item, qty, lot, amount)
  CROSS JOIN (SELECT sales_invoice_id, posting_date FROM fin.sales_invoice WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000012') v
  CROSS JOIN LATERAL pg_temp.det(p.role, v.posting_date, 'domestic', 'intra_state', p.line_kind, 'taxable', 'credit') d
;
INSERT INTO fin.sales_invoice_history (workspace_id, sales_invoice_id, version_number, operation, row_snapshot, performer_contact_id, reason)
  SELECT 'aikyat-biscuits', sales_invoice_id, 1, 'submit', to_jsonb(x), 'c0000000-0000-4000-8000-000000000001', NULL FROM fin.sales_invoice x WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000012';
-- Approve (Rajan) → PostJournalEntry: one journal line per voucher line; the customer line on its account's ledger (107100), naming the account;
-- in the same transaction the lots go down (FIFO: G-2604 300 → 0, G-2608 2,000 → 1,700, C-2607 1,500 → 1,200).
INSERT INTO fin.journal_entry (journal_entry_id, workspace_id, operated_party_id, fiscal_year_id, branch_id, posting_date, voucher_type, source_document_id, source_ref_no, narration, posted_by_contact_id) VALUES
  ('7e000000-0000-4000-8000-000000000233', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-1026-4f0e-8a51-5c0b7a002026', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', '2026-10-07', 'sales', '51000000-0000-4000-8000-000000000012', 'SV-0012', 'Being goods sold to Sri Lakshmi Distributors', 'c0000000-0000-4000-8000-000000000002');
-- Rev 17: one journal line per voucher line, the 7 trace columns copied as they are.
INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, debtor_account_id, branch_id, debit, credit,
    rule_code, rule_version, rule_case, line_role_code, account_determination_id, determined_ledger_code, override_reason)
SELECT l.workspace_id, '7e000000-0000-4000-8000-000000000233', l.line_no, coalesce(l.ledger_account_code, a.ledger_account_code), l.debtor_account_id, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001',
       CASE l.side WHEN 'Dr' THEN l.amount ELSE 0 END, CASE l.side WHEN 'Cr' THEN l.amount ELSE 0 END,
       l.rule_code, l.rule_version, l.rule_case, l.line_role_code, l.account_determination_id, l.determined_ledger_code, l.override_reason
  FROM fin.sales_invoice_line l LEFT JOIN fin.debtor_account a ON a.debtor_account_id = l.debtor_account_id
 WHERE l.sales_invoice_id = '51000000-0000-4000-8000-000000000012' ORDER BY l.line_no;
UPDATE inv.stock_lot SET quantity_left = quantity_left - 300, updated_at = now() WHERE stock_lot_id IN ('5a000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000003');
UPDATE fin.sales_invoice SET stage = 'posted', decided_by_contact_id = 'c0000000-0000-4000-8000-000000000002', decided_at = now(), journal_entry_id = '7e000000-0000-4000-8000-000000000233', version_number = 2 WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000012';
INSERT INTO fin.sales_invoice_history (workspace_id, sales_invoice_id, version_number, operation, row_snapshot, performer_contact_id, reason)
  SELECT 'aikyat-biscuits', sales_invoice_id, 2, 'decide', to_jsonb(x), 'c0000000-0000-4000-8000-000000000002', NULL FROM fin.sales_invoice x WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000012';

\echo '--- B4-01 posted: the voucher (with its 2 generated columns), what the customer owes (its journal lines), the trial balance'
SELECT internal_ref_no, invoice_no, invoice_key, invoice_financial_year, stage, due_date, inventory_mode, costing_method FROM fin.sales_invoice;
SELECT a.account_name, a.ledger_account_code, sum(l.debit - l.credit) AS owes
  FROM fin.journal_line l JOIN fin.debtor_account a ON a.debtor_account_id = l.debtor_account_id GROUP BY 1, 2;
SELECT ledger_account_code, sum(debit) AS dr, sum(credit) AS cr FROM fin.journal_line GROUP BY 1 ORDER BY 1;
\echo '--- the cost came from inventory: the lots now, and the stock that left = Cr Finished Goods'
SELECT lot_no, item_code, quantity_left, unit_cost, quantity_left * unit_cost AS value FROM inv.stock_lot ORDER BY received_on;
SELECT 2422000 - sum(quantity_left * unit_cost) AS stock_value_out,
       (SELECT sum(credit - debit) FROM fin.journal_line WHERE ledger_account_code = '106020') AS finished_goods_credited,
       (SELECT sum(debit - credit) FROM fin.journal_line WHERE ledger_account_code = '501040') AS cost_of_goods_sold,
       712500 - (SELECT sum(debit - credit) FROM fin.journal_line WHERE ledger_account_code = '501040') AS margin
  FROM inv.stock_lot;

-- ---------------------------------------------------------------- 3 · 33 wrong rows, each refused
CREATE FUNCTION pg_temp.expect(label text, stmt text, want text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE got text; st text; msg text;
BEGIN
  BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS got = CONSTRAINT_NAME, st = RETURNED_SQLSTATE, msg = MESSAGE_TEXT;
    IF msg = 'ACCEPTED' THEN got := '(accepted!)'; END IF;
  END;
  got := coalesce(nullif(got, ''), st);
  RETURN format('%s · %s · want %s · got %s', CASE WHEN got = want OR st = want THEN 'PASS' ELSE 'FAIL' END, label, want, got);
END $$;

SELECT r FROM (VALUES
  (pg_temp.expect('N1 the maker approves his own voucher',
    $q$UPDATE fin.sales_invoice SET decided_by_contact_id = submitted_by_contact_id$q$, 'sales_invoice_maker_may_not_decide')),
  (pg_temp.expect('N2 posted without a journal entry',
    $q$UPDATE fin.sales_invoice SET journal_entry_id = NULL$q$, 'sales_invoice_posted_has_journal')),
  (pg_temp.expect('N3 posted without a decider',
    $q$UPDATE fin.sales_invoice SET decided_by_contact_id = NULL$q$, 'sales_invoice_decided_has_decider')),
  (pg_temp.expect('N4 an unknown stage',
    $q$UPDATE fin.sales_invoice SET stage = 'returned'$q$, 'sales_invoice_stage_valid')),
  (pg_temp.expect('N5 the same Billing invoice booked again (other case and spaces)',
    $q$INSERT INTO fin.sales_invoice (sales_invoice_id, workspace_id, operated_party_id, branch_id, debtor_account_id, internal_ref_no, amends_sales_invoice_id, original_sales_invoice_id, revision_no, posting_date, invoice_no, invoice_date, due_date, narration, stage, submitted_by_contact_id, submitted_at) VALUES ('51000000-0000-4000-8000-000000000099', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'da000000-0000-4000-8000-000000000001', 'SV-0099', NULL, '51000000-0000-4000-8000-000000000099', 0, '2026-10-07', 'ka/inv/2627/ 0143', '2026-10-07', '2026-11-06', 'Being goods sold', 'submitted', 'c0000000-0000-4000-8000-000000000001', now())$q$, 'sales_invoice_never_twice')),
  (pg_temp.expect('N6 the same SV number twice',
    $q$INSERT INTO fin.sales_invoice (sales_invoice_id, workspace_id, operated_party_id, branch_id, debtor_account_id, internal_ref_no, amends_sales_invoice_id, original_sales_invoice_id, revision_no, posting_date, invoice_no, invoice_date, due_date, narration, stage, submitted_by_contact_id, submitted_at) VALUES ('51000000-0000-4000-8000-000000000098', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'da000000-0000-4000-8000-000000000001', 'SV-0012', NULL, '51000000-0000-4000-8000-000000000098', 0, '2026-10-07', 'KA/INV/2627/0198', '2026-10-07', '2026-11-06', 'Being goods sold', 'submitted', 'c0000000-0000-4000-8000-000000000001', now())$q$, 'sales_invoice_internal_ref_no_key')),
  (pg_temp.expect('N7 a due date before the invoice date',
    $q$UPDATE fin.sales_invoice SET due_date = '2026-10-01'$q$, 'sales_invoice_due_after_invoice')),
  (pg_temp.expect('N8 a blank invoice number',
    $q$UPDATE fin.sales_invoice SET invoice_no = '  '$q$, 'sales_invoice_invoice_no_not_blank')),
  (pg_temp.expect('N9 an amendment with revision 0',
    $q$INSERT INTO fin.sales_invoice (sales_invoice_id, workspace_id, operated_party_id, branch_id, debtor_account_id, internal_ref_no, amends_sales_invoice_id, original_sales_invoice_id, revision_no, posting_date, invoice_no, invoice_date, due_date, narration, stage, submitted_by_contact_id, submitted_at) VALUES ('51000000-0000-4000-8000-000000000097', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'da000000-0000-4000-8000-000000000001', 'SV-0097', '51000000-0000-4000-8000-000000000012', '51000000-0000-4000-8000-000000000097', 0, '2026-10-07', 'KA/INV/2627/0197', '2026-10-07', '2026-11-06', 'Being goods sold', 'submitted', 'c0000000-0000-4000-8000-000000000001', now())$q$, 'sales_invoice_revision_matches_amends')),
  (pg_temp.expect('N10 a first voucher whose chain starts elsewhere',
    $q$INSERT INTO fin.sales_invoice (sales_invoice_id, workspace_id, operated_party_id, branch_id, debtor_account_id, internal_ref_no, amends_sales_invoice_id, original_sales_invoice_id, revision_no, posting_date, invoice_no, invoice_date, due_date, narration, stage, submitted_by_contact_id, submitted_at) VALUES ('51000000-0000-4000-8000-000000000096', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'da000000-0000-4000-8000-000000000001', 'SV-0096', NULL, '51000000-0000-4000-8000-000000000012', 0, '2026-10-07', 'KA/INV/2627/0196', '2026-10-07', '2026-11-06', 'Being goods sold', 'submitted', 'c0000000-0000-4000-8000-000000000001', now())$q$, 'sales_invoice_original_is_itself')),
  (pg_temp.expect('N11 two open corrections of one voucher',
    $q$INSERT INTO fin.sales_invoice (sales_invoice_id, workspace_id, operated_party_id, branch_id, debtor_account_id, internal_ref_no, amends_sales_invoice_id, original_sales_invoice_id, revision_no, posting_date, invoice_no, invoice_date, due_date, narration, stage, submitted_by_contact_id, submitted_at) SELECT id, 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'da000000-0000-4000-8000-000000000001', ref, '51000000-0000-4000-8000-000000000012', '51000000-0000-4000-8000-000000000012', rev, '2026-10-07', 'KA/INV/2627/0143', '2026-10-07', '2026-11-06', NULL, 'submitted', 'c0000000-0000-4000-8000-000000000001', now() FROM (VALUES ('51000000-0000-4000-8000-000000000095'::uuid, 'SV-0012-8', 8), ('51000000-0000-4000-8000-000000000094'::uuid, 'SV-0012-9', 9)) AS t(id, ref, rev)$q$, 'sales_invoice_one_open_amendment')),
  (pg_temp.expect('N12 the never-twice key typed by hand',
    $q$UPDATE fin.sales_invoice SET invoice_key = 'X'$q$, '428C9')),
  (pg_temp.expect('N13 a line with a ledger AND the customer',
    $q$UPDATE fin.sales_invoice_line SET ledger_account_code = '107100' WHERE line_no = 1$q$, 'sales_invoice_line_ledger_or_customer')),
  (pg_temp.expect('N14 a line with neither',
    $q$UPDATE fin.sales_invoice_line SET ledger_account_code = NULL WHERE line_no = 2$q$, 'sales_invoice_line_ledger_or_customer')),
  (pg_temp.expect('N15 the customer credited on a sale',
    $q$UPDATE fin.sales_invoice_line SET side = 'Cr' WHERE line_no = 1$q$, 'sales_invoice_line_customer_is_debit')),
  (pg_temp.expect('N16 a line of 0',
    $q$UPDATE fin.sales_invoice_line SET amount = 0 WHERE line_no = 2$q$, 'sales_invoice_line_amount_positive')),
  (pg_temp.expect('N17 a side that is not Dr or Cr',
    $q$UPDATE fin.sales_invoice_line SET side = 'X' WHERE line_no = 2$q$, 'sales_invoice_line_side_valid')),
  (pg_temp.expect('N18 a ledger not in the chart',
    $q$UPDATE fin.sales_invoice_line SET ledger_account_code = '999999', override_reason = 'rev 17: a reason, so the FK is what refuses' WHERE line_no = 2$q$, '23503')),
  (pg_temp.expect('N19 a customer we have no account for',
    $q$UPDATE fin.sales_invoice_line SET debtor_account_id = gen_random_uuid() WHERE line_no = 1$q$, '23503')),
  (pg_temp.expect('N20 a history row nobody did',
    $q$UPDATE fin.sales_invoice_history SET performer_contact_id = NULL WHERE version_number = 1$q$, 'sales_invoice_history_has_an_actor')),
  (pg_temp.expect('N21 an unknown history operation',
    $q$UPDATE fin.sales_invoice_history SET operation = 'xyz' WHERE version_number = 1$q$, 'sales_invoice_history_operation_valid')),
  (pg_temp.expect('N22 two history rows for one version',
    $q$UPDATE fin.sales_invoice_history SET version_number = 1$q$, 'sales_invoice_history_one_per_version')),
  (pg_temp.expect('N23 a journal entry of an unknown voucher type',
    $q$UPDATE fin.journal_entry SET voucher_type = 'xyz'$q$, 'journal_entry_voucher_type_valid')),
  (pg_temp.expect('N24 a second forward entry for the same voucher',
    $q$INSERT INTO fin.journal_entry (workspace_id, operated_party_id, fiscal_year_id, branch_id, posting_date, voucher_type, source_document_id) VALUES ('aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-1026-4f0e-8a51-5c0b7a002026', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', '2026-10-07', 'sales', '51000000-0000-4000-8000-000000000012')$q$, 'journal_entry_one_forward_entry_per_document')),
  (pg_temp.expect('N25 a quantity with no item',
    $q$UPDATE fin.sales_invoice_line SET quantity = 5 WHERE line_no = 2$q$, 'sales_invoice_line_item_has_quantity')),
  (pg_temp.expect('N26 a cost line of quantity 0',
    $q$UPDATE fin.sales_invoice_line SET quantity = 0 WHERE line_no = 6$q$, 'sales_invoice_line_quantity_positive')),
  (pg_temp.expect('N27 a lot on a line with no item',
    $q$UPDATE fin.sales_invoice_line SET stock_lot_id = '5a000000-0000-4000-8000-000000000001' WHERE line_no = 2$q$, 'sales_invoice_line_lot_needs_item')),
  (pg_temp.expect('N28 an item on a debit line',
    $q$UPDATE fin.sales_invoice_line SET inventory_item_code = 'FG-101', quantity = 1 WHERE line_no = 5$q$, 'sales_invoice_line_item_on_a_stock_credit')),
  (pg_temp.expect('N29 a lot that does not exist',
    $q$UPDATE fin.sales_invoice_line SET stock_lot_id = gen_random_uuid() WHERE line_no = 6$q$, '23503')),
  (pg_temp.expect('N30 an unknown costing method (LIFO)',
    $q$UPDATE fin.sales_invoice SET costing_method = 'lifo'$q$, 'sales_invoice_costing_method_valid')),
  (pg_temp.expect('N31 more left in a lot than was received',
    $q$UPDATE inv.stock_lot SET quantity_left = quantity_received + 1$q$, 'stock_lot_quantity_left_in_range')),
  (pg_temp.expect('N32 the same lot twice',
    $q$INSERT INTO inv.stock_lot (workspace_id, branch_id, godown_code, item_code, lot_no, received_on, quantity_received, quantity_left, unit_cost) VALUES ('aikyat-biscuits', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'KA-FG', 'FG-101', 'G-2604', '2026-04-14', 1, 1, 1)$q$, 'stock_lot_lot_key')),
  (pg_temp.expect('N33 a negative cost',
    $q$UPDATE inv.stock_lot SET unit_cost = -1$q$, 'stock_lot_unit_cost_not_negative')),
  (pg_temp.expect('N34 a second primary book for the company',
    $q$INSERT INTO fin.book (workspace_id, operated_party_id, book_code, display_name, is_primary) VALUES ('aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', 'IFRS', 'IFRS book', true)$q$, 'book_one_primary_per_company')),
  (pg_temp.expect('N35 a book for a company we do not run',
    $q$INSERT INTO fin.book (workspace_id, operated_party_id, book_code, display_name, is_primary) VALUES ('aikyat-biscuits', gen_random_uuid(), 'PRIMARY', 'x', true)$q$, '23503')),
  (pg_temp.expect('N36 a setting value not allowed (LIFO)',
    $q$INSERT INTO fin.book_setting (workspace_id, book_id, setting_code, setting_value, effective_from, approved_by_contact_id, approved_at) VALUES ('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'costing_method', 'lifo', '2027-04-01', 'c0000000-0000-4000-8000-000000000002', now())$q$, 'book_setting_value_allowed')),
  (pg_temp.expect('N37 a setting nobody defined',
    $q$INSERT INTO fin.book_setting (workspace_id, book_id, setting_code, setting_value, effective_from, approved_by_contact_id, approved_at) VALUES ('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'tax_mode', 'x', '2027-04-01', 'c0000000-0000-4000-8000-000000000002', now())$q$, 'book_setting_value_allowed')),
  (pg_temp.expect('N38 two methods in force on the same day',
    $q$INSERT INTO fin.book_setting (workspace_id, book_id, setting_code, setting_value, effective_from, approved_by_contact_id, approved_at) VALUES ('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'costing_method', 'weighted_average', '2026-10-01', 'c0000000-0000-4000-8000-000000000002', now())$q$, 'book_setting_no_overlap')),
  (pg_temp.expect('N39 a setting that ends before it starts',
    $q$UPDATE fin.book_setting SET effective_until = '2026-03-01'$q$, 'book_setting_period_is_ordered')),
  (pg_temp.expect('N40 a periodic voucher that still names a costing method',
    $q$UPDATE fin.sales_invoice SET inventory_mode = 'periodic'$q$, 'sales_invoice_method_only_when_perpetual')),
  (pg_temp.expect('N41 a perpetual voucher with no costing method',
    $q$UPDATE fin.sales_invoice SET costing_method = NULL$q$, 'sales_invoice_method_only_when_perpetual')),
  (pg_temp.expect('N42 an unknown inventory mode',
    $q$UPDATE fin.sales_invoice SET inventory_mode = 'hybrid', costing_method = NULL$q$, 'sales_invoice_inventory_mode_valid')),
  (pg_temp.expect('N43 Output CGST mapped to the SGST ledger',
    $q$INSERT INTO fin.account_determination (workspace_id, book_id, document_type, line_role_code, party_kind, line_kind, ledger_account_code, effective_from, status, reason, made_by_contact_id, made_at, checked_by_contact_id, checked_at) VALUES ('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', NULL, 'output_cgst', NULL, NULL, '206012', '2026-04-01', 'proposed', 'x', 'c0000000-0000-4000-8000-000000000001', now(), NULL, NULL)$q$, 'account_determination_guard')),
  (pg_temp.expect('N44 revenue mapped to a group (401000)',
    $q$INSERT INTO fin.account_determination (workspace_id, book_id, document_type, line_role_code, party_kind, line_kind, ledger_account_code, effective_from, status, reason, made_by_contact_id, made_at, checked_by_contact_id, checked_at) VALUES ('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'sales_invoice', 'revenue', 'domestic', 'goods', '401000', '2026-04-01', 'proposed', 'x', 'c0000000-0000-4000-8000-000000000001', now(), NULL, NULL)$q$, 'account_determination_guard')),
  (pg_temp.expect('N45 the customer role mapped (it takes its account''s own ledger)',
    $q$INSERT INTO fin.account_determination (workspace_id, book_id, document_type, line_role_code, party_kind, line_kind, ledger_account_code, effective_from, status, reason, made_by_contact_id, made_at, checked_by_contact_id, checked_at) VALUES ('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', NULL, 'customer', NULL, NULL, '107100', '2026-04-01', 'proposed', 'x', 'c0000000-0000-4000-8000-000000000001', now(), NULL, NULL)$q$, 'account_determination_guard')),
  (pg_temp.expect('N46 a second approved row for the same role and conditions, overlapping',
    $q$INSERT INTO fin.account_determination (workspace_id, book_id, document_type, line_role_code, party_kind, line_kind, ledger_account_code, effective_from, status, reason, made_by_contact_id, made_at, checked_by_contact_id, checked_at) VALUES ('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', NULL, 'output_cgst', NULL, NULL, '206011', '2026-06-01', 'approved', 'x', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now())$q$, 'account_determination_no_overlap')),
  (pg_temp.expect('N47 the maker checks her own row',
    $q$INSERT INTO fin.account_determination (workspace_id, book_id, document_type, line_role_code, party_kind, line_kind, ledger_account_code, effective_from, status, reason, made_by_contact_id, made_at, checked_by_contact_id, checked_at) VALUES ('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'sales_invoice', 'output_cgst', NULL, NULL, '206011', '2026-06-01', 'approved', 'x', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000001', now())$q$, 'account_determination_checker_not_maker')),
  (pg_temp.expect('N48 approved without a checker',
    $q$INSERT INTO fin.account_determination (workspace_id, book_id, document_type, line_role_code, party_kind, line_kind, ledger_account_code, effective_from, status, reason, made_by_contact_id, made_at, checked_by_contact_id, checked_at) VALUES ('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'sales_invoice', 'output_cgst', NULL, NULL, '206011', '2026-06-01', 'approved', 'x', 'c0000000-0000-4000-8000-000000000001', now(), NULL, NULL)$q$, 'account_determination_decided_has_checker')),
  (pg_temp.expect('N49 an approved row edited (its ledger changed)',
    $q$UPDATE fin.account_determination SET ledger_account_code = '401020' WHERE account_determination_id = 'de000000-0000-4000-8000-000000000001'$q$, 'account_determination_guard')),
  (pg_temp.expect('N50 a row closed before a posted line that used it',
    $q$UPDATE fin.account_determination SET effective_until = '2026-10-01' WHERE account_determination_id = 'de000000-0000-4000-8000-000000000001'$q$, 'account_determination_guard')),
  (pg_temp.expect('N51 a row starting in a closed year (FY 2025-26)',
    $q$INSERT INTO fin.account_determination (workspace_id, book_id, document_type, line_role_code, party_kind, line_kind, ledger_account_code, effective_from, status, reason, made_by_contact_id, made_at, checked_by_contact_id, checked_at) VALUES ('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'sales_invoice', 'output_cgst', NULL, NULL, '206011', '2026-01-01', 'proposed', 'x', 'c0000000-0000-4000-8000-000000000001', now(), NULL, NULL)$q$, 'account_determination_guard')),
  (pg_temp.expect('N52 an unknown condition value',
    $q$INSERT INTO fin.account_determination (workspace_id, book_id, document_type, line_role_code, party_kind, line_kind, ledger_account_code, effective_from, status, reason, made_by_contact_id, made_at, checked_by_contact_id, checked_at) VALUES ('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'sales_invoice', 'revenue', 'foreign', NULL, '401030', '2026-06-01', 'proposed', 'x', 'c0000000-0000-4000-8000-000000000001', now(), NULL, NULL)$q$, 'account_determination_party_kind_valid')),
  (pg_temp.expect('N53 a journal line on another ledger than the mapping gave, no reason',
    $q$INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, branch_id, debit, credit, rule_code, rule_version, rule_case, line_role_code, account_determination_id, determined_ledger_code, override_reason) VALUES ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000233', 99, '401020', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 1, 'SALES_INVOICE', 1, 'R1', 'revenue', 'de000000-0000-4000-8000-000000000001', '401010', NULL)$q$, 'journal_line_override_has_reason')),
  (pg_temp.expect('N54 a journal line claiming a ledger its mapping row does not give',
    $q$INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, branch_id, debit, credit, rule_code, rule_version, rule_case, line_role_code, account_determination_id, determined_ledger_code, override_reason) VALUES ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000233', 99, '401020', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 1, 'SALES_INVOICE', 1, 'R1', 'revenue', 'de000000-0000-4000-8000-000000000001', '401020', NULL)$q$, '23503')),
  (pg_temp.expect('N55 a journal line with a role its rule never writes',
    $q$INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, branch_id, debit, credit, rule_code, rule_version, rule_case, line_role_code, account_determination_id, determined_ledger_code, override_reason) VALUES ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000233', 99, '401010', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 1, 'SALES_INVOICE', 1, NULL, 'vendor', NULL, NULL, NULL)$q$, '23503')),
  (pg_temp.expect('N56 a journal line with a case its rule does not have',
    $q$INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, branch_id, debit, credit, rule_code, rule_version, rule_case, line_role_code, account_determination_id, determined_ledger_code, override_reason) VALUES ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000233', 99, '401010', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 1, 'SALES_INVOICE', 1, 'R99', 'revenue', NULL, NULL, NULL)$q$, '23503')),
  (pg_temp.expect('N57 a rule with no version',
    $q$INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, branch_id, debit, credit, rule_code, rule_version, rule_case, line_role_code, account_determination_id, determined_ledger_code, override_reason) VALUES ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000233', 99, '401010', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 1, 'SALES_INVOICE', NULL, NULL, 'revenue', NULL, NULL, NULL)$q$, 'journal_line_rule_has_version')),
  (pg_temp.expect('N58 the customer role on a ledger line',
    $q$UPDATE fin.sales_invoice_line SET line_role_code = 'customer' WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000012' AND line_no = 2$q$, 'sales_invoice_line_customer_role_is_the_customer')),
  (pg_temp.expect('N59 two versions of a rule in force on the same day',
    $q$INSERT INTO fin.posting_rule (rule_code, version, document_type, display_name, effective_from, code_ref, casebook_ref) VALUES ('SALES_INVOICE', 2, 'sales_invoice', 'x', '2026-10-01', 'x', 'x')$q$, 'posting_rule_no_overlap')),
  (pg_temp.expect('N60 no mapping row on the date (before go-live): ACCOUNT_NOT_DETERMINED',
    $q$SELECT fin.determine_ledger('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'sales_invoice', 'revenue', '2026-03-31', 'domestic', 'intra_state', 'goods', 'taxable', 'credit')$q$, 'account_not_determined')),
  (pg_temp.expect('N61 two equally specific rows match: ACCOUNT_AMBIGUOUS, never a guess',
    $q$DO $d$ BEGIN INSERT INTO fin.account_determination (workspace_id, book_id, document_type, line_role_code, party_kind, line_kind, ledger_account_code, effective_from, status, reason, made_by_contact_id, made_at, checked_by_contact_id, checked_at) VALUES ('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', NULL, 'round_off', 'export', NULL, '505120', '2026-04-01', 'approved', 'x', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()); INSERT INTO fin.account_determination (workspace_id, book_id, document_type, line_role_code, party_kind, line_kind, ledger_account_code, effective_from, status, reason, made_by_contact_id, made_at, checked_by_contact_id, checked_at) VALUES ('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', NULL, 'round_off', NULL, 'charge', '505120', '2026-04-01', 'approved', 'x', 'c0000000-0000-4000-8000-000000000001', now(), 'c0000000-0000-4000-8000-000000000002', now()); PERFORM fin.determine_ledger('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'sales_invoice', 'round_off', '2026-10-07', 'export', NULL, 'charge', 'taxable', 'credit'); END $d$$q$, 'account_ambiguous')),
  (pg_temp.expect('N62 an unknown history step',
    $q$INSERT INTO fin.account_determination_history (workspace_id, account_determination_id, operation, row_snapshot, performer_contact_id) VALUES ('aikyat-biscuits', 'de000000-0000-4000-8000-000000000001', 'edit', '{}', 'c0000000-0000-4000-8000-000000000001')$q$, 'account_determination_history_operation_valid'))
) AS t(r);

-- ---------------------------------------------------------------- 4 · accepted, as his
\echo '--- a correction of the posted SV-0012 (Sale of Services instead of Sale of Products): SV-0012-1, same invoice, one chain'
INSERT INTO fin.sales_invoice (sales_invoice_id, workspace_id, operated_party_id, branch_id, debtor_account_id, internal_ref_no, amends_sales_invoice_id, original_sales_invoice_id, revision_no, posting_date, invoice_no, invoice_date, due_date, narration, stage, submitted_by_contact_id, submitted_at) VALUES ('51000000-0000-4000-8000-000000000112', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'da000000-0000-4000-8000-000000000001', 'SV-0012-1', '51000000-0000-4000-8000-000000000012', '51000000-0000-4000-8000-000000000012', 1, '2026-10-07', 'KA/INV/2627/0143', '2026-10-07', '2026-11-06', 'Being goods sold', 'submitted', 'c0000000-0000-4000-8000-000000000001', now());
UPDATE fin.sales_invoice SET inventory_mode = pg_temp.setting(operated_party_id, 'inventory_mode', invoice_date),
                             costing_method = pg_temp.setting(operated_party_id, 'costing_method', invoice_date) WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000112';
-- Rev 17: the corrected facts (the line is a service) → case R3 → the mapping gives 401020 (no override needed).
INSERT INTO fin.sales_invoice_line (workspace_id, sales_invoice_id, line_no, side, ledger_account_code, debtor_account_id, inventory_item_code, quantity, stock_lot_id, amount,
    rule_code, rule_version, rule_case, line_role_code, account_determination_id, determined_ledger_code)
SELECT 'aikyat-biscuits', v.sales_invoice_id, p.no, p.side, d.ledger, p.debtor, p.item, p.qty, p.lot, p.amount, 'SALES_INVOICE', 1, p.rule_case, p.role, d.id, d.ledger
  FROM (VALUES
    (1, 'Dr', 'customer', NULL, NULL, 'da000000-0000-4000-8000-000000000001'::uuid, NULL, NULL::numeric, NULL::uuid, 748125.00),
    (2, 'Cr', 'revenue', 'R3', 'service', NULL::uuid, NULL, NULL::numeric, NULL::uuid, 712500.00),
    (3, 'Cr', 'output_cgst', NULL, 'service', NULL::uuid, NULL, NULL::numeric, NULL::uuid, 17812.50),
    (4, 'Cr', 'output_sgst', NULL, 'service', NULL::uuid, NULL, NULL::numeric, NULL::uuid, 17812.50),
    (5, 'Dr', 'cogs', 'R13', 'goods', NULL::uuid, NULL, NULL::numeric, NULL::uuid, 558000.00),
    (6, 'Cr', 'stock', 'R13', 'goods', NULL::uuid, 'FG-101', 300::numeric, '5a000000-0000-4000-8000-000000000001'::uuid, 162000.00),
    (7, 'Cr', 'stock', 'R13', 'goods', NULL::uuid, 'FG-101', 300::numeric, '5a000000-0000-4000-8000-000000000002'::uuid, 168000.00),
    (8, 'Cr', 'stock', 'R13', 'goods', NULL::uuid, 'FG-102', 300::numeric, '5a000000-0000-4000-8000-000000000003'::uuid, 228000.00)) AS p(no, side, role, rule_case, line_kind, debtor, item, qty, lot, amount)
  CROSS JOIN (SELECT sales_invoice_id, posting_date FROM fin.sales_invoice WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000112') v
  CROSS JOIN LATERAL pg_temp.det(p.role, v.posting_date, 'domestic', 'intra_state', p.line_kind, 'taxable', 'credit') d
;
INSERT INTO fin.sales_invoice_history (workspace_id, sales_invoice_id, version_number, operation, row_snapshot, performer_contact_id, reason)
  SELECT 'aikyat-biscuits', sales_invoice_id, 1, 'submit', to_jsonb(x), 'c0000000-0000-4000-8000-000000000001', NULL FROM fin.sales_invoice x WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000112';
-- Approve: the old entry reversed (its exact mirror), the new one posted, the old voucher amended.
INSERT INTO fin.journal_entry (journal_entry_id, workspace_id, operated_party_id, fiscal_year_id, branch_id, posting_date, voucher_type, source_document_id, source_ref_no, reverses_journal_entry_id, narration, posted_by_contact_id) VALUES
  ('7e000000-0000-4000-8000-000000000234', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-1026-4f0e-8a51-5c0b7a002026', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', '2026-10-07', 'sales', '51000000-0000-4000-8000-000000000112', 'SV-0012-1', '7e000000-0000-4000-8000-000000000233', 'SV-0012 replaced by SV-0012-1', 'c0000000-0000-4000-8000-000000000002'),
  ('7e000000-0000-4000-8000-000000000235', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-1026-4f0e-8a51-5c0b7a002026', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', '2026-10-07', 'sales', '51000000-0000-4000-8000-000000000112', 'SV-0012-1', NULL, 'Being goods sold to Sri Lakshmi Distributors', 'c0000000-0000-4000-8000-000000000002');
-- Rev 17: the reversal copies the original lines (ledger AND trace), never looked up again: the exact mirror.
INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, debtor_account_id, branch_id, debit, credit,
    rule_code, rule_version, rule_case, line_role_code, account_determination_id, determined_ledger_code, override_reason)
SELECT workspace_id, '7e000000-0000-4000-8000-000000000234', line_no, ledger_account_code, debtor_account_id, branch_id, credit, debit,
       rule_code, rule_version, rule_case, line_role_code, account_determination_id, determined_ledger_code, override_reason
  FROM fin.journal_line WHERE journal_entry_id = '7e000000-0000-4000-8000-000000000233' ORDER BY line_no;
INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, debtor_account_id, branch_id, debit, credit,
    rule_code, rule_version, rule_case, line_role_code, account_determination_id, determined_ledger_code, override_reason)
SELECT l.workspace_id, '7e000000-0000-4000-8000-000000000235', l.line_no, coalesce(l.ledger_account_code, a.ledger_account_code), l.debtor_account_id, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001',
       CASE l.side WHEN 'Dr' THEN l.amount ELSE 0 END, CASE l.side WHEN 'Cr' THEN l.amount ELSE 0 END,
       l.rule_code, l.rule_version, l.rule_case, l.line_role_code, l.account_determination_id, l.determined_ledger_code, l.override_reason
  FROM fin.sales_invoice_line l LEFT JOIN fin.debtor_account a ON a.debtor_account_id = l.debtor_account_id
 WHERE l.sales_invoice_id = '51000000-0000-4000-8000-000000000112' ORDER BY l.line_no;
-- The stock: the reversal puts the 900 cartons back, the new entry takes them again from the same lots: no net change.
UPDATE fin.sales_invoice SET stage = 'amended', version_number = 3 WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000012';
INSERT INTO fin.sales_invoice_history (workspace_id, sales_invoice_id, version_number, operation, row_snapshot, performer_contact_id, reason)
  SELECT 'aikyat-biscuits', sales_invoice_id, 3, 'amended', to_jsonb(x), 'c0000000-0000-4000-8000-000000000002', 'Replaced by SV-0012-1' FROM fin.sales_invoice x WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000012';
UPDATE fin.sales_invoice SET stage = 'posted', decided_by_contact_id = 'c0000000-0000-4000-8000-000000000002', decided_at = now(), journal_entry_id = '7e000000-0000-4000-8000-000000000235', version_number = 2 WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000112';
INSERT INTO fin.sales_invoice_history (workspace_id, sales_invoice_id, version_number, operation, row_snapshot, performer_contact_id, reason)
  SELECT 'aikyat-biscuits', sales_invoice_id, 2, 'decide', to_jsonb(x), 'c0000000-0000-4000-8000-000000000002', NULL FROM fin.sales_invoice x WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000112';
SELECT internal_ref_no, revision_no, stage, invoice_no FROM fin.sales_invoice ORDER BY internal_ref_no;
SELECT a.account_name, sum(l.debit - l.credit) AS owes FROM fin.journal_line l JOIN fin.debtor_account a USING (debtor_account_id) GROUP BY 1;
SELECT ledger_account_code, sum(debit - credit) AS net FROM fin.journal_line GROUP BY 1 ORDER BY 1;

\echo '--- sent back by Rajan (draft), sent again by Teja: accepted'
INSERT INTO fin.sales_invoice (sales_invoice_id, workspace_id, operated_party_id, branch_id, debtor_account_id, internal_ref_no, amends_sales_invoice_id, original_sales_invoice_id, revision_no, posting_date, invoice_no, invoice_date, due_date, narration, stage, submitted_by_contact_id, submitted_at) VALUES ('51000000-0000-4000-8000-000000000014', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'da000000-0000-4000-8000-000000000001', 'SV-0014', NULL, '51000000-0000-4000-8000-000000000014', 0, '2026-10-07', 'KA/INV/2627/0145', '2026-10-07', '2026-11-06', 'Being goods sold', 'submitted', 'c0000000-0000-4000-8000-000000000001', now());
UPDATE fin.sales_invoice SET stage = 'draft', decided_by_contact_id = 'c0000000-0000-4000-8000-000000000002', decided_at = now(), decision_reason = 'Wrong sales ledger', version_number = 2 WHERE internal_ref_no = 'SV-0014';
UPDATE fin.sales_invoice SET stage = 'submitted', decided_by_contact_id = NULL, decided_at = NULL, decision_reason = NULL, version_number = 3 WHERE internal_ref_no = 'SV-0014';
SELECT internal_ref_no, stage, version_number FROM fin.sales_invoice WHERE internal_ref_no = 'SV-0014';

\echo '--- a B2C counter sale paid by UPI, no customer account (the CA''s A3): accepted'
INSERT INTO fin.sales_invoice (sales_invoice_id, workspace_id, operated_party_id, branch_id, debtor_account_id, internal_ref_no, amends_sales_invoice_id, original_sales_invoice_id, revision_no, posting_date, invoice_no, invoice_date, due_date, narration, stage, submitted_by_contact_id, submitted_at) VALUES ('51000000-0000-4000-8000-000000000013', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', NULL, 'SV-0013', NULL, '51000000-0000-4000-8000-000000000013', 0, '2026-10-07', 'KA/INV/2627/0144', '2026-10-07', '2026-10-07', 'Being goods sold', 'submitted', 'c0000000-0000-4000-8000-000000000001', now());
-- Rev 17: paid by UPI → the settlement role (R8) → 108030 from the mapping.
INSERT INTO fin.sales_invoice_line (workspace_id, sales_invoice_id, line_no, side, ledger_account_code, debtor_account_id, inventory_item_code, quantity, stock_lot_id, amount,
    rule_code, rule_version, rule_case, line_role_code, account_determination_id, determined_ledger_code)
SELECT 'aikyat-biscuits', v.sales_invoice_id, p.no, p.side, d.ledger, p.debtor, p.item, p.qty, p.lot, p.amount, 'SALES_INVOICE', 1, p.rule_case, p.role, d.id, d.ledger
  FROM (VALUES
    (1, 'Dr', 'settlement', 'R8', NULL, NULL::uuid, NULL, NULL::numeric, NULL::uuid, 11800.00),
    (2, 'Cr', 'revenue', 'R1', 'goods', NULL::uuid, NULL, NULL::numeric, NULL::uuid, 10000.00),
    (3, 'Cr', 'output_cgst', NULL, 'goods', NULL::uuid, NULL, NULL::numeric, NULL::uuid, 900.00),
    (4, 'Cr', 'output_sgst', NULL, 'goods', NULL::uuid, NULL, NULL::numeric, NULL::uuid, 900.00)) AS p(no, side, role, rule_case, line_kind, debtor, item, qty, lot, amount)
  CROSS JOIN (SELECT sales_invoice_id, posting_date FROM fin.sales_invoice WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000013') v
  CROSS JOIN LATERAL pg_temp.det(p.role, v.posting_date, 'domestic', 'intra_state', p.line_kind, 'taxable', 'upi_card') d
;
SELECT internal_ref_no, debtor_account_id IS NULL AS no_customer, stage FROM fin.sales_invoice WHERE internal_ref_no = 'SV-0013';

\echo '--- rev 16 · a change of method (Ind AS 8): FIFO closed on 31-Mar-2027, weighted average from 01-Apr-2027: accepted'
UPDATE fin.book_setting SET effective_until = '2027-04-01' WHERE setting_code = 'costing_method' AND effective_until IS NULL;
INSERT INTO fin.book_setting (workspace_id, book_id, setting_code, setting_value, effective_from, reason, approved_by_contact_id, approved_at) VALUES
  ('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'costing_method', 'weighted_average', '2027-04-01', 'Policy change approved (illustrative)', 'c0000000-0000-4000-8000-000000000002', now());
SELECT d AS on_date, pg_temp.setting('0f000000-0000-4000-8000-000000000001', 'inventory_mode', d) AS inventory_mode,
       pg_temp.setting('0f000000-0000-4000-8000-000000000001', 'costing_method', d) AS costing_method
  FROM (VALUES ('2026-10-07'::date), ('2027-03-31'::date), ('2027-05-01'::date)) AS t(d);

\echo '--- rev 16 · a periodic sale: no costing method on the voucher, no cost lines (T11 posts the month''s cost): accepted'
UPDATE fin.sales_invoice SET inventory_mode = 'periodic', costing_method = NULL WHERE internal_ref_no = 'SV-0014';
SELECT internal_ref_no, inventory_mode, costing_method, (SELECT count(*) FROM fin.sales_invoice_line l WHERE l.sales_invoice_id = v.sales_invoice_id AND l.ledger_account_code IN ('501040', '106020')) AS cost_lines
  FROM fin.sales_invoice v WHERE internal_ref_no = 'SV-0014';

\echo '--- rev 17 · why was this posted? SV-0012-1''s entry, line by line: the rule (code), the case, the role, the mapping row (configuration)'
SELECT l.line_no, l.ledger_account_code AS ledger, l.debit, l.credit, l.rule_code || ' v' || l.rule_version AS rule, l.rule_case AS "case",
       l.line_role_code AS role,
       CASE WHEN l.account_determination_id IS NULL THEN '(the customer account''s own ledger)'
            ELSE concat_ws(' · ', a.document_type, a.party_kind, a.supply_scope, a.line_kind, a.taxability, a.settlement_mode, 'specificity ' || a.specificity) END AS mapping_row
  FROM fin.journal_line l LEFT JOIN fin.account_determination a ON a.account_determination_id = l.account_determination_id
 WHERE l.journal_entry_id = '7e000000-0000-4000-8000-000000000235' ORDER BY l.line_no;

\echo '--- rev 17 · the mapping gives every case the ledger the app gives today (engine.ts caseOf + catalogue.ts LEDGERS)'
SELECT x.case_code AS "case", x.role, concat_ws(' · ', x.pk, x.sc, x.lk, x.tx, x.st) AS facts, d.ledger AS mapped, x.app AS app_today,
       CASE WHEN d.ledger = x.app THEN 'PASS' ELSE 'FAIL' END AS same
  FROM (VALUES
    ('R1', 'revenue', 'domestic', 'intra_state', 'goods', 'taxable', 'credit', '401010'),
    ('R2', 'revenue', 'domestic', 'inter_state', 'goods', 'taxable', 'credit', '401010'),
    ('R2', 'output_igst', 'domestic', 'inter_state', 'goods', 'taxable', 'credit', '206013'),
    ('R3', 'revenue', 'domestic', 'intra_state', 'service', 'taxable', 'credit', '401020'),
    ('R4', 'revenue', 'export', NULL, 'goods', 'taxable', 'credit', '401030'),
    ('R5', 'igst_refund', 'export', NULL, 'goods', 'taxable', 'credit', '109040'),
    ('R6', 'revenue', 'sez', NULL, 'service', 'taxable', 'credit', '401030'),
    ('R8', 'settlement', 'domestic', 'intra_state', 'goods', 'taxable', 'cash', '108010'),
    ('R8', 'settlement', 'domestic', 'intra_state', 'goods', 'taxable', 'upi_card', '108030'),
    ('R9', 'revenue', 'domestic', 'intra_state', 'goods', 'exempt', 'credit', '401050'),
    ('R9', 'revenue', 'export', NULL, 'goods', 'nil_rated', 'credit', '401050'),
    ('R10', 'revenue', 'domestic', 'intra_state', 'charge', 'taxable', 'credit', '401070'),
    ('R11', 'recoverable_expense', 'domestic', 'intra_state', 'reimbursement', 'non_gst', 'credit', '110030'),
    ('R12', 'deferred_revenue', 'domestic', 'intra_state', 'service', 'taxable', 'credit', '206040'),
    ('R13', 'cogs', 'domestic', 'intra_state', 'goods', 'taxable', 'credit', '501040'),
    ('R13', 'stock', 'domestic', 'intra_state', 'goods', 'taxable', 'credit', '106020'),
    ('(all)', 'output_cgst', 'domestic', 'intra_state', 'goods', 'taxable', 'credit', '206011'),
    ('(all)', 'output_sgst', 'domestic', 'intra_state', 'goods', 'taxable', 'credit', '206012'),
    ('(all)', 'round_off', 'domestic', 'intra_state', 'goods', 'taxable', 'credit', '505120')) AS x(case_code, role, pk, sc, lk, tx, st, app)
  CROSS JOIN LATERAL pg_temp.det(x.role, '2026-10-07', x.pk, x.sc, x.lk, x.tx, x.st) d;

\echo '--- rev 17 · completeness: every role SALES_INVOICE v1 writes is mapped in the primary book (0 missing) …'
SELECT count(*) AS missing FROM fin.account_determination_gaps('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', '2026-10-07');
\echo '--- … and a new Ind AS book with no mapping yet: its 11 mapped roles are missing, so it cannot go live'
INSERT INTO fin.book (book_id, workspace_id, operated_party_id, book_code, display_name, is_primary) VALUES
  ('0b000000-0000-4000-8000-000000000002', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', 'IND_AS', 'Aikyat Biscuits · Ind AS book (test)', false);
SELECT string_agg(line_role_code, ', ') AS missing_roles, count(*) FROM fin.account_determination_gaps('aikyat-biscuits', '0b000000-0000-4000-8000-000000000002', '2026-10-07');

\echo '--- rev 17 · a mapping change, maker then checker: from 01-Nov-2026 inter-state goods go to 401011 (more specific: it wins)'
INSERT INTO fin.account_determination (account_determination_id, workspace_id, book_id, document_type, line_role_code, party_kind, supply_scope, line_kind, taxability, ledger_account_code, effective_from, status, reason, made_by_contact_id, made_at) VALUES
  ('de000000-0000-4000-8000-000000000020', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'sales_invoice', 'revenue', 'domestic', 'inter_state', 'goods', 'taxable', '401011', '2026-11-01', 'proposed', 'A separate ledger for inter-state sales (illustrative)', 'c0000000-0000-4000-8000-000000000001', now());
INSERT INTO fin.account_determination_history (workspace_id, account_determination_id, operation, row_snapshot, performer_contact_id, reason)
  SELECT workspace_id, account_determination_id, 'propose', to_jsonb(d), 'c0000000-0000-4000-8000-000000000001', reason FROM fin.account_determination d WHERE account_determination_id = 'de000000-0000-4000-8000-000000000020';
UPDATE fin.account_determination SET status = 'approved', checked_by_contact_id = 'c0000000-0000-4000-8000-000000000002', checked_at = now() WHERE account_determination_id = 'de000000-0000-4000-8000-000000000020';
INSERT INTO fin.account_determination_history (workspace_id, account_determination_id, operation, row_snapshot, performer_contact_id, reason)
  SELECT workspace_id, account_determination_id, 'approve', to_jsonb(d), 'c0000000-0000-4000-8000-000000000002', 'Agreed' FROM fin.account_determination d WHERE account_determination_id = 'de000000-0000-4000-8000-000000000020';
SELECT t.on_date, t.scope, d.ledger, a.specificity
  FROM (VALUES ('2026-10-07'::date, 'inter_state'), ('2026-11-15'::date, 'inter_state'), ('2026-11-15'::date, 'intra_state')) AS t(on_date, scope)
  CROSS JOIN LATERAL pg_temp.det('revenue', t.on_date, 'domestic', t.scope, 'goods', 'taxable', 'credit') d
  JOIN fin.account_determination a ON a.account_determination_id = d.id;

\echo '--- rev 17 · a ledger replaced: COGS 501040 closed on 31-Mar-2027, 501030 from 01-Apr-2027 (illustrative); SV-0012 keeps its row'
UPDATE fin.account_determination SET effective_until = '2027-04-01' WHERE account_determination_id = 'de000000-0000-4000-8000-000000000018';
INSERT INTO fin.account_determination (account_determination_id, workspace_id, book_id, line_role_code, ledger_account_code, effective_from, status, reason, replaces_account_determination_id, made_by_contact_id, made_at) VALUES
  ('de000000-0000-4000-8000-000000000021', 'aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'cogs', '501030', '2027-04-01', 'proposed', 'Schedule III presentation (illustrative)', 'de000000-0000-4000-8000-000000000018', 'c0000000-0000-4000-8000-000000000001', now());
UPDATE fin.account_determination SET status = 'approved', checked_by_contact_id = 'c0000000-0000-4000-8000-000000000002', checked_at = now() WHERE account_determination_id = 'de000000-0000-4000-8000-000000000021';
INSERT INTO fin.account_determination_history (workspace_id, account_determination_id, operation, row_snapshot, performer_contact_id, reason)
  SELECT workspace_id, account_determination_id, op, to_jsonb(d), 'c0000000-0000-4000-8000-000000000002', 'Replaced by the 501030 row' FROM fin.account_determination d, (VALUES ('close')) o(op) WHERE account_determination_id = 'de000000-0000-4000-8000-000000000018'
  UNION ALL SELECT workspace_id, account_determination_id, op, to_jsonb(d), CASE op WHEN 'propose' THEN 'c0000000-0000-4000-8000-000000000001'::uuid ELSE 'c0000000-0000-4000-8000-000000000002'::uuid END, reason FROM fin.account_determination d, (VALUES ('propose'), ('approve')) o(op) WHERE account_determination_id = 'de000000-0000-4000-8000-000000000021';
SELECT t.on_date, d.ledger FROM (VALUES ('2026-10-07'::date), ('2027-05-01'::date)) AS t(on_date) CROSS JOIN LATERAL pg_temp.det('cogs', t.on_date, NULL, NULL, NULL, NULL, NULL) d;
SELECT l.line_no, l.ledger_account_code, l.account_determination_id = 'de000000-0000-4000-8000-000000000018' AS still_names_its_row FROM fin.journal_line l
 WHERE l.journal_entry_id = '7e000000-0000-4000-8000-000000000233' AND l.line_role_code = 'cogs';
SELECT operation, count(*) FROM fin.account_determination_history GROUP BY 1 ORDER BY 1;

\echo '--- rev 17 · an override by the AE, with its reason (accepted; Rajan sees determined vs used at approval)'
UPDATE fin.sales_invoice_line SET ledger_account_code = '401011', override_reason = 'Illustrative: the AE posts another ledger, with a reason'
 WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000013' AND line_no = 2;
SELECT line_no, line_role_code, determined_ledger_code AS determined, ledger_account_code AS used, override_reason
  FROM fin.sales_invoice_line WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000013' AND line_no = 2;

ROLLBACK;
