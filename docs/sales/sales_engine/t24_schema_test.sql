-- T24 + T25 + T26 · the schema proved on PostgreSQL (rev 19, 27-Nov-2026): fin.sales_invoice / _line / _history, the TWIN of Manoj's
-- purchase voucher (fin.purchase_invoice / _line / _history), posting into the shared fin.journal_entry / fin.journal_line.
-- Rev 15: the sale also posts its COST in the same entry (rule R13): Dr 501040 Cost of Goods Sold · Cr 106020 Finished Goods per
-- lot (FIFO), from inv.stock_lot (a stub of inventory; lot costs illustrative); the lots go down at approval.
-- Rev 16 (S1 part 1): the book and its dated settings; the voucher reads inventory_mode and costing_method in force on its
-- invoice date and stamps them.
-- Rev 17 (S1 part 2: line roles, posting rules, the ledger mapping, the 7 trace columns on the lines): REMOVED in rev 19,
-- with its seeds and its proofs (N43–N62, N77, N78).
-- Rev 18 (T25, T26): credit and debit notes in the same family (document_type, against_sales_invoice_id, note_reason):
-- scenario B4-06 (a return, after Stores' receipt D-05), B4-07 (a scheme discount with GST, goodwill without), B4-08 (late
-- freight); the stock back posted by the receipt (the CA's E1) or by the note (the other setting).
-- Rev 19 (REC-D2, 27-Nov-2026): no posting rules, no mapping: the AE picks each ledger and types Dr / Cr (as Tally). The
-- lines below name the same ledgers the rev 17 mapping gave, so every entry, balance and stock figure is the same as rev 18.
-- Billing raises the invoice; the Accounts Executive books its entry; the Accounts Manager approves; it posts.
-- Run after out.sql on an empty database:  psql -v ON_ERROR_STOP=1 -f out.sql -f t24_schema_test.sql
-- 1. Seeds the smallest master data (scenario names; ids are fixed test values).
-- 2. Walks scenario B4-01 (Billing's KA/INV/2627/0143 → Sri Lakshmi Distributors, ₹7,48,125.00): submitted → approved → posted.
-- 3. Tries 56 wrong rows (N1–N42, N63–N76; N63–N76 at the end, once the notes exist): each must be refused by the named CHECK, key,
--    EXCLUDE, trigger or foreign key. Rev 19 removed N43–N62, N77, N78 (rev 17's rules and mapping); the others keep their numbers
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
-- The other ledgers of the app's chart (catalogue.ts; proposed, G18) and a closed year FY 2025-26 (seeded in rev 17; kept: chart
-- rows and a year). Rev 19: rev 17's 12 line roles, the rule SALES_INVOICE v1 and the 19 mapping rows are removed.
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
-- Rev 18 · T25 / T26: the two ledgers the notes need (assumed to exist: S2 creates the chart; codes proposed, G45) and the
-- book's setting return_stock_posting (stores_receipt: the CA's E1). (Its roles, rules and 2 mapping rows: removed in rev 19.)
INSERT INTO fin.ledger_account (account_code, display_name, kind, parent_account_code, is_group, account_type) VALUES
  ('401090', 'Sales Returns', 'income', '401000', false, NULL),
  ('506000', 'Other Expenses – Selling (group: test seed)', 'expense', '500000', true, NULL),
  ('506020', 'Discount Allowed', 'expense', '506000', false, NULL);
INSERT INTO fin.setting_definition (setting_code, display_name, allowed_values, owner_task, read_by) VALUES
  ('return_stock_posting', 'Who posts the stock back on a sales return', '{stores_receipt,with_credit_note}', 'T25 (rev 18); S4 owns it', 'T25 rule R5, SALES_RETURN_RECEIPT');
INSERT INTO fin.book_setting (workspace_id, book_id, setting_code, setting_value, effective_from, reason, approved_by_contact_id, approved_at) VALUES
  ('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'return_stock_posting', 'stores_receipt', '2026-04-01', 'The CA''s E1: Stock back (GRN) is its own event (illustrative until the CA confirms)', 'c0000000-0000-4000-8000-000000000002', now());
INSERT INTO fin.document_sequence (workspace_id, operated_party_id, document_type, last_number) VALUES
  ('aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', 'sales_invoice', 11);

-- ---------------------------------------------------------------- 2 · B4-01: submitted → approved → posted
-- Submit (Teja): the voucher is created at Submit (as his), number SV-0012; the lines the AE typed (each ledger picked, as Tally).
UPDATE fin.document_sequence SET last_number = last_number + 1 WHERE document_type = 'sales_invoice';
INSERT INTO fin.sales_invoice (sales_invoice_id, workspace_id, operated_party_id, branch_id, debtor_account_id, internal_ref_no, amends_sales_invoice_id, original_sales_invoice_id, revision_no, posting_date, invoice_no, invoice_date, due_date, narration, stage, submitted_by_contact_id, submitted_at) VALUES ('51000000-0000-4000-8000-000000000012', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'da000000-0000-4000-8000-000000000001', 'SV-0012', NULL, '51000000-0000-4000-8000-000000000012', 0, '2026-10-07', 'KA/INV/2627/0143', '2026-10-07', '2026-11-06', 'Being goods sold', 'submitted', 'c0000000-0000-4000-8000-000000000001', now());
-- Rev 16: the settings in force on the invoice date, stamped (perpetual + FIFO: so the cost lines below are FIFO lots).
UPDATE fin.sales_invoice SET inventory_mode = pg_temp.setting(operated_party_id, 'inventory_mode', invoice_date),
                             costing_method = pg_temp.setting(operated_party_id, 'costing_method', invoice_date) WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000012';
-- Rev 19: the AE picks each ledger (rev 17's role, case and mapping row are removed); the customer line names the account.
INSERT INTO fin.sales_invoice_line (workspace_id, sales_invoice_id, line_no, side, ledger_account_code, debtor_account_id, inventory_item_code, quantity, stock_lot_id, amount) VALUES
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000012', 1, 'Dr', NULL, 'da000000-0000-4000-8000-000000000001', NULL, NULL, NULL, 748125.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000012', 2, 'Cr', '401010', NULL, NULL, NULL, NULL, 712500.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000012', 3, 'Cr', '206011', NULL, NULL, NULL, NULL, 17812.50),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000012', 4, 'Cr', '206012', NULL, NULL, NULL, NULL, 17812.50),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000012', 5, 'Dr', '501040', NULL, NULL, NULL, NULL, 558000.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000012', 6, 'Cr', '106020', NULL, 'FG-101', 300, '5a000000-0000-4000-8000-000000000001', 162000.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000012', 7, 'Cr', '106020', NULL, 'FG-101', 300, '5a000000-0000-4000-8000-000000000002', 168000.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000012', 8, 'Cr', '106020', NULL, 'FG-102', 300, '5a000000-0000-4000-8000-000000000003', 228000.00);
INSERT INTO fin.sales_invoice_history (workspace_id, sales_invoice_id, version_number, operation, row_snapshot, performer_contact_id, reason)
  SELECT 'aikyat-biscuits', sales_invoice_id, 1, 'submit', to_jsonb(x), 'c0000000-0000-4000-8000-000000000001', NULL FROM fin.sales_invoice x WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000012';
-- Approve (Rajan) → PostJournalEntry: one journal line per voucher line; the customer line on its account's ledger (107100), naming the account;
-- in the same transaction the lots go down (FIFO: G-2604 300 → 0, G-2608 2,000 → 1,700, C-2607 1,500 → 1,200).
INSERT INTO fin.journal_entry (journal_entry_id, workspace_id, operated_party_id, fiscal_year_id, branch_id, posting_date, voucher_type, source_document_id, source_ref_no, narration, posted_by_contact_id) VALUES
  ('7e000000-0000-4000-8000-000000000233', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-1026-4f0e-8a51-5c0b7a002026', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', '2026-10-07', 'sales', '51000000-0000-4000-8000-000000000012', 'SV-0012', 'Being goods sold to Sri Lakshmi Distributors', 'c0000000-0000-4000-8000-000000000002');
-- One journal line per voucher line.
INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, debtor_account_id, branch_id, debit, credit)
SELECT l.workspace_id, '7e000000-0000-4000-8000-000000000233', l.line_no, coalesce(l.ledger_account_code, a.ledger_account_code), l.debtor_account_id, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001',
       CASE l.side WHEN 'Dr' THEN l.amount ELSE 0 END, CASE l.side WHEN 'Cr' THEN l.amount ELSE 0 END
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

-- ---------------------------------------------------------------- 3 · 42 wrong rows (N1–N42), each refused
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
    $q$UPDATE fin.sales_invoice_line SET side = 'Cr' WHERE line_no = 1$q$, 'sales_invoice_line_customer_side')),
  (pg_temp.expect('N16 a line of 0',
    $q$UPDATE fin.sales_invoice_line SET amount = 0 WHERE line_no = 2$q$, 'sales_invoice_line_amount_positive')),
  (pg_temp.expect('N17 a side that is not Dr or Cr',
    $q$UPDATE fin.sales_invoice_line SET side = 'X' WHERE line_no = 2$q$, 'sales_invoice_line_side_valid')),
  (pg_temp.expect('N18 a ledger not in the chart',
    $q$UPDATE fin.sales_invoice_line SET ledger_account_code = '999999' WHERE line_no = 2$q$, '23503')),
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
    $q$UPDATE fin.sales_invoice_line SET inventory_item_code = 'FG-101', quantity = 1 WHERE line_no = 5$q$, 'sales_invoice_line_stock_side')),
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
    $q$UPDATE fin.sales_invoice SET inventory_mode = 'hybrid', costing_method = NULL$q$, 'sales_invoice_inventory_mode_valid'))
) AS t(r);

-- ---------------------------------------------------------------- 4 · accepted, as his
\echo '--- a correction of the posted SV-0012 (Sale of Services instead of Sale of Products): SV-0012-1, same invoice, one chain'
INSERT INTO fin.sales_invoice (sales_invoice_id, workspace_id, operated_party_id, branch_id, debtor_account_id, internal_ref_no, amends_sales_invoice_id, original_sales_invoice_id, revision_no, posting_date, invoice_no, invoice_date, due_date, narration, stage, submitted_by_contact_id, submitted_at) VALUES ('51000000-0000-4000-8000-000000000112', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'da000000-0000-4000-8000-000000000001', 'SV-0012-1', '51000000-0000-4000-8000-000000000012', '51000000-0000-4000-8000-000000000012', 1, '2026-10-07', 'KA/INV/2627/0143', '2026-10-07', '2026-11-06', 'Being goods sold', 'submitted', 'c0000000-0000-4000-8000-000000000001', now());
UPDATE fin.sales_invoice SET inventory_mode = pg_temp.setting(operated_party_id, 'inventory_mode', invoice_date),
                             costing_method = pg_temp.setting(operated_party_id, 'costing_method', invoice_date) WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000112';
-- The correction: the line is a service → the AE picks 401020 Sale of Services.
INSERT INTO fin.sales_invoice_line (workspace_id, sales_invoice_id, line_no, side, ledger_account_code, debtor_account_id, inventory_item_code, quantity, stock_lot_id, amount) VALUES
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000112', 1, 'Dr', NULL, 'da000000-0000-4000-8000-000000000001', NULL, NULL, NULL, 748125.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000112', 2, 'Cr', '401020', NULL, NULL, NULL, NULL, 712500.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000112', 3, 'Cr', '206011', NULL, NULL, NULL, NULL, 17812.50),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000112', 4, 'Cr', '206012', NULL, NULL, NULL, NULL, 17812.50),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000112', 5, 'Dr', '501040', NULL, NULL, NULL, NULL, 558000.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000112', 6, 'Cr', '106020', NULL, 'FG-101', 300, '5a000000-0000-4000-8000-000000000001', 162000.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000112', 7, 'Cr', '106020', NULL, 'FG-101', 300, '5a000000-0000-4000-8000-000000000002', 168000.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000112', 8, 'Cr', '106020', NULL, 'FG-102', 300, '5a000000-0000-4000-8000-000000000003', 228000.00);
INSERT INTO fin.sales_invoice_history (workspace_id, sales_invoice_id, version_number, operation, row_snapshot, performer_contact_id, reason)
  SELECT 'aikyat-biscuits', sales_invoice_id, 1, 'submit', to_jsonb(x), 'c0000000-0000-4000-8000-000000000001', NULL FROM fin.sales_invoice x WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000112';
-- Approve: the old entry reversed (its exact mirror), the new one posted, the old voucher amended.
INSERT INTO fin.journal_entry (journal_entry_id, workspace_id, operated_party_id, fiscal_year_id, branch_id, posting_date, voucher_type, source_document_id, source_ref_no, reverses_journal_entry_id, narration, posted_by_contact_id) VALUES
  ('7e000000-0000-4000-8000-000000000234', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-1026-4f0e-8a51-5c0b7a002026', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', '2026-10-07', 'sales', '51000000-0000-4000-8000-000000000112', 'SV-0012-1', '7e000000-0000-4000-8000-000000000233', 'SV-0012 replaced by SV-0012-1', 'c0000000-0000-4000-8000-000000000002'),
  ('7e000000-0000-4000-8000-000000000235', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-1026-4f0e-8a51-5c0b7a002026', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', '2026-10-07', 'sales', '51000000-0000-4000-8000-000000000112', 'SV-0012-1', NULL, 'Being goods sold to Sri Lakshmi Distributors', 'c0000000-0000-4000-8000-000000000002');
-- The reversal copies the original lines: the exact mirror.
INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, debtor_account_id, branch_id, debit, credit)
SELECT workspace_id, '7e000000-0000-4000-8000-000000000234', line_no, ledger_account_code, debtor_account_id, branch_id, credit, debit
  FROM fin.journal_line WHERE journal_entry_id = '7e000000-0000-4000-8000-000000000233' ORDER BY line_no;
INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, debtor_account_id, branch_id, debit, credit)
SELECT l.workspace_id, '7e000000-0000-4000-8000-000000000235', l.line_no, coalesce(l.ledger_account_code, a.ledger_account_code), l.debtor_account_id, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001',
       CASE l.side WHEN 'Dr' THEN l.amount ELSE 0 END, CASE l.side WHEN 'Cr' THEN l.amount ELSE 0 END
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
-- Paid by UPI → the AE picks 108030 UPI / Card Clearing.
INSERT INTO fin.sales_invoice_line (workspace_id, sales_invoice_id, line_no, side, ledger_account_code, debtor_account_id, inventory_item_code, quantity, stock_lot_id, amount) VALUES
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000013', 1, 'Dr', '108030', NULL, NULL, NULL, NULL, 11800.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000013', 2, 'Cr', '401010', NULL, NULL, NULL, NULL, 10000.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000013', 3, 'Cr', '206011', NULL, NULL, NULL, NULL, 900.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000013', 4, 'Cr', '206012', NULL, NULL, NULL, NULL, 900.00);
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

-- ---------------------------------------------------------------- 5 · rev 18: T25 / T26, the notes
\echo '--- rev 18 · D-05 (20-Oct): Stores takes back 40 cartons of FG-101, batch G-2608, damaged → KA-QC at the ₹560 they left at;'
\echo '    the book says stores_receipt: the RECEIPT posts the Stock back (the CA''s E1, its own event)'
INSERT INTO inv.stock_lot (stock_lot_id, workspace_id, branch_id, godown_code, item_code, lot_no, received_on, quantity_received, quantity_left, unit_cost) VALUES
  ('5a000000-0000-4000-8000-000000000004', 'aikyat-biscuits', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'KA-QC', 'FG-101', 'G-2608', '2026-10-20', 40, 40, 560);
INSERT INTO fin.journal_entry (journal_entry_id, workspace_id, operated_party_id, fiscal_year_id, branch_id, posting_date, voucher_type, source_document_id, source_ref_no, narration, posted_by_contact_id) VALUES
  ('7e000000-0000-4000-8000-000000000301', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-1026-4f0e-8a51-5c0b7a002026', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', '2026-10-20', 'stock_return', '5e000000-0000-4000-8000-000000000001', 'SRR-0001', 'Stock back: 40 FG-101 returned by Sri Lakshmi (damaged, KA-QC)', 'c0000000-0000-4000-8000-000000000003');
INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, branch_id, debit, credit) VALUES
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000301', 1, '106020', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 22400.00, 0),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000301', 2, '501040', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 22400.00);
INSERT INTO inv.stock_return (stock_return_id, workspace_id, return_no, branch_id, received_on, debtor_account_id, against_sales_invoice_id, item_code, from_stock_lot_id, quantity, condition, to_stock_lot_id, unit_cost, journal_entry_id, recorded_by_contact_id) VALUES
  ('5e000000-0000-4000-8000-000000000001', 'aikyat-biscuits', 'SRR-0001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', '2026-10-20', 'da000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000112', 'FG-101', '5a000000-0000-4000-8000-000000000002', 40, 'damaged', '5a000000-0000-4000-8000-000000000004', 560, '7e000000-0000-4000-8000-000000000301', 'c0000000-0000-4000-8000-000000000003');

\echo '--- rev 18 · B4-06 (21-Oct): the credit note for the return, KA/CN/2627/0001: 40 × ₹700 = ₹28,000 + CGST ₹700 + SGST ₹700 = ₹29,400 (no stock lines: the receipt posted them)'
INSERT INTO fin.sales_invoice (sales_invoice_id, workspace_id, operated_party_id, branch_id, debtor_account_id, internal_ref_no, original_sales_invoice_id, revision_no, posting_date, invoice_no, invoice_date, due_date, narration, stage, submitted_by_contact_id, submitted_at, document_type, against_sales_invoice_id, note_reason, stock_return_id, return_stock_posting) VALUES
  ('51000000-0000-4000-8000-000000000015', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'da000000-0000-4000-8000-000000000001', 'SV-0015', '51000000-0000-4000-8000-000000000015', 0, '2026-10-21', 'KA/CN/2627/0001', '2026-10-21', '2026-10-21', 'Against KA/INV/2627/0143', 'submitted', 'c0000000-0000-4000-8000-000000000001', now(), 'credit_note', '51000000-0000-4000-8000-000000000112', 'return', '5e000000-0000-4000-8000-000000000001', 'stores_receipt');
INSERT INTO fin.sales_invoice_line (workspace_id, sales_invoice_id, line_no, side, ledger_account_code, debtor_account_id, inventory_item_code, quantity, stock_lot_id, amount) VALUES
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000015', 1, 'Dr', '401090', NULL, NULL, NULL, NULL, 28000.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000015', 2, 'Dr', '206011', NULL, NULL, NULL, NULL, 700.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000015', 3, 'Dr', '206012', NULL, NULL, NULL, NULL, 700.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000015', 4, 'Cr', NULL, 'da000000-0000-4000-8000-000000000001', NULL, NULL, NULL, 29400.00);
INSERT INTO fin.journal_entry (journal_entry_id, workspace_id, operated_party_id, fiscal_year_id, branch_id, posting_date, voucher_type, source_document_id, source_ref_no, narration, posted_by_contact_id) VALUES
  ('7e000000-0000-4000-8000-000000000302', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-1026-4f0e-8a51-5c0b7a002026', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', '2026-10-21', 'sales', '51000000-0000-4000-8000-000000000015', 'SV-0015', 'Against KA/INV/2627/0143', 'c0000000-0000-4000-8000-000000000002');
INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, debtor_account_id, branch_id, debit, credit)
SELECT l.workspace_id, '7e000000-0000-4000-8000-000000000302', l.line_no, coalesce(l.ledger_account_code, a.ledger_account_code), l.debtor_account_id, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001',
       CASE l.side WHEN 'Dr' THEN l.amount ELSE 0 END, CASE l.side WHEN 'Cr' THEN l.amount ELSE 0 END
  FROM fin.sales_invoice_line l LEFT JOIN fin.debtor_account a ON a.debtor_account_id = l.debtor_account_id
 WHERE l.sales_invoice_id = '51000000-0000-4000-8000-000000000015' ORDER BY l.line_no;
UPDATE fin.sales_invoice SET stage = 'posted', decided_by_contact_id = 'c0000000-0000-4000-8000-000000000002', decided_at = now(), journal_entry_id = '7e000000-0000-4000-8000-000000000302', version_number = 2 WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000015';

\echo '--- rev 18 · B4-07(a): a scheme rebate under SCH-26-Q2 (agreed before supply): ₹50,000 + CGST ₹1,250 + SGST ₹1,250, GST reduced (the CA''s E2)'
INSERT INTO fin.sales_invoice (sales_invoice_id, workspace_id, operated_party_id, branch_id, debtor_account_id, internal_ref_no, original_sales_invoice_id, revision_no, posting_date, invoice_no, invoice_date, due_date, narration, stage, submitted_by_contact_id, submitted_at, document_type, against_sales_invoice_id, note_reason, scheme_reference) VALUES
  ('51000000-0000-4000-8000-000000000016', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'da000000-0000-4000-8000-000000000001', 'SV-0016', '51000000-0000-4000-8000-000000000016', 0, '2026-10-21', 'KA/CN/2627/0002', '2026-10-21', '2026-10-21', 'Against KA/INV/2627/0143', 'submitted', 'c0000000-0000-4000-8000-000000000001', now(), 'credit_note', '51000000-0000-4000-8000-000000000112', 'scheme_discount', 'SCH-26-Q2');
INSERT INTO fin.sales_invoice_line (workspace_id, sales_invoice_id, line_no, side, ledger_account_code, debtor_account_id, inventory_item_code, quantity, stock_lot_id, amount) VALUES
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000016', 1, 'Dr', '506020', NULL, NULL, NULL, NULL, 50000.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000016', 2, 'Dr', '206011', NULL, NULL, NULL, NULL, 1250.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000016', 3, 'Dr', '206012', NULL, NULL, NULL, NULL, 1250.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000016', 4, 'Cr', NULL, 'da000000-0000-4000-8000-000000000001', NULL, NULL, NULL, 52500.00);
INSERT INTO fin.journal_entry (journal_entry_id, workspace_id, operated_party_id, fiscal_year_id, branch_id, posting_date, voucher_type, source_document_id, source_ref_no, narration, posted_by_contact_id) VALUES
  ('7e000000-0000-4000-8000-000000000303', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-1026-4f0e-8a51-5c0b7a002026', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', '2026-10-21', 'sales', '51000000-0000-4000-8000-000000000016', 'SV-0016', 'Against KA/INV/2627/0143', 'c0000000-0000-4000-8000-000000000002');
INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, debtor_account_id, branch_id, debit, credit)
SELECT l.workspace_id, '7e000000-0000-4000-8000-000000000303', l.line_no, coalesce(l.ledger_account_code, a.ledger_account_code), l.debtor_account_id, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001',
       CASE l.side WHEN 'Dr' THEN l.amount ELSE 0 END, CASE l.side WHEN 'Cr' THEN l.amount ELSE 0 END
  FROM fin.sales_invoice_line l LEFT JOIN fin.debtor_account a ON a.debtor_account_id = l.debtor_account_id
 WHERE l.sales_invoice_id = '51000000-0000-4000-8000-000000000016' ORDER BY l.line_no;
UPDATE fin.sales_invoice SET stage = 'posted', decided_by_contact_id = 'c0000000-0000-4000-8000-000000000002', decided_at = now(), journal_entry_id = '7e000000-0000-4000-8000-000000000303', version_number = 2 WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000016';

\echo '--- rev 18 · B4-07(c): goodwill, no scheme: ₹5,000, GST NOT reduced (s.15(3); the CA''s E3). Illustrative: on Sri Lakshmi here (the scenario: C-05)'
INSERT INTO fin.sales_invoice (sales_invoice_id, workspace_id, operated_party_id, branch_id, debtor_account_id, internal_ref_no, original_sales_invoice_id, revision_no, posting_date, invoice_no, invoice_date, due_date, narration, stage, submitted_by_contact_id, submitted_at, document_type, against_sales_invoice_id, note_reason) VALUES
  ('51000000-0000-4000-8000-000000000017', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'da000000-0000-4000-8000-000000000001', 'SV-0017', '51000000-0000-4000-8000-000000000017', 0, '2026-10-21', 'KA/CN/2627/0003', '2026-10-21', '2026-10-21', 'Against KA/INV/2627/0143', 'submitted', 'c0000000-0000-4000-8000-000000000001', now(), 'credit_note', '51000000-0000-4000-8000-000000000112', 'goodwill');
INSERT INTO fin.sales_invoice_line (workspace_id, sales_invoice_id, line_no, side, ledger_account_code, debtor_account_id, inventory_item_code, quantity, stock_lot_id, amount) VALUES
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000017', 1, 'Dr', '506020', NULL, NULL, NULL, NULL, 5000.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000017', 2, 'Cr', NULL, 'da000000-0000-4000-8000-000000000001', NULL, NULL, NULL, 5000.00);
INSERT INTO fin.journal_entry (journal_entry_id, workspace_id, operated_party_id, fiscal_year_id, branch_id, posting_date, voucher_type, source_document_id, source_ref_no, narration, posted_by_contact_id) VALUES
  ('7e000000-0000-4000-8000-000000000304', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-1026-4f0e-8a51-5c0b7a002026', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', '2026-10-21', 'sales', '51000000-0000-4000-8000-000000000017', 'SV-0017', 'Against KA/INV/2627/0143', 'c0000000-0000-4000-8000-000000000002');
INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, debtor_account_id, branch_id, debit, credit)
SELECT l.workspace_id, '7e000000-0000-4000-8000-000000000304', l.line_no, coalesce(l.ledger_account_code, a.ledger_account_code), l.debtor_account_id, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001',
       CASE l.side WHEN 'Dr' THEN l.amount ELSE 0 END, CASE l.side WHEN 'Cr' THEN l.amount ELSE 0 END
  FROM fin.sales_invoice_line l LEFT JOIN fin.debtor_account a ON a.debtor_account_id = l.debtor_account_id
 WHERE l.sales_invoice_id = '51000000-0000-4000-8000-000000000017' ORDER BY l.line_no;
UPDATE fin.sales_invoice SET stage = 'posted', decided_by_contact_id = 'c0000000-0000-4000-8000-000000000002', decided_at = now(), journal_entry_id = '7e000000-0000-4000-8000-000000000304', version_number = 2 WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000017';

\echo '--- rev 18 · B4-08: a debit note for late freight, ₹6,000 + GST 5% ₹300 (the CA''s E4 shape). Illustrative: on Sri Lakshmi here (the scenario: C-05)'
INSERT INTO fin.sales_invoice (sales_invoice_id, workspace_id, operated_party_id, branch_id, debtor_account_id, internal_ref_no, original_sales_invoice_id, revision_no, posting_date, invoice_no, invoice_date, due_date, narration, stage, submitted_by_contact_id, submitted_at, document_type, against_sales_invoice_id, note_reason) VALUES
  ('51000000-0000-4000-8000-000000000018', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'da000000-0000-4000-8000-000000000001', 'SV-0018', '51000000-0000-4000-8000-000000000018', 0, '2026-10-21', 'KA/DN/2627/0001', '2026-10-21', '2026-10-21', 'Against KA/INV/2627/0143', 'submitted', 'c0000000-0000-4000-8000-000000000001', now(), 'debit_note', '51000000-0000-4000-8000-000000000112', 'additional_charge');
INSERT INTO fin.sales_invoice_line (workspace_id, sales_invoice_id, line_no, side, ledger_account_code, debtor_account_id, inventory_item_code, quantity, stock_lot_id, amount) VALUES
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000018', 1, 'Dr', NULL, 'da000000-0000-4000-8000-000000000001', NULL, NULL, NULL, 6300.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000018', 2, 'Cr', '401070', NULL, NULL, NULL, NULL, 6000.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000018', 3, 'Cr', '206011', NULL, NULL, NULL, NULL, 150.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000018', 4, 'Cr', '206012', NULL, NULL, NULL, NULL, 150.00);
INSERT INTO fin.journal_entry (journal_entry_id, workspace_id, operated_party_id, fiscal_year_id, branch_id, posting_date, voucher_type, source_document_id, source_ref_no, narration, posted_by_contact_id) VALUES
  ('7e000000-0000-4000-8000-000000000305', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-1026-4f0e-8a51-5c0b7a002026', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', '2026-10-21', 'sales', '51000000-0000-4000-8000-000000000018', 'SV-0018', 'Against KA/INV/2627/0143', 'c0000000-0000-4000-8000-000000000002');
INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, debtor_account_id, branch_id, debit, credit)
SELECT l.workspace_id, '7e000000-0000-4000-8000-000000000305', l.line_no, coalesce(l.ledger_account_code, a.ledger_account_code), l.debtor_account_id, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001',
       CASE l.side WHEN 'Dr' THEN l.amount ELSE 0 END, CASE l.side WHEN 'Cr' THEN l.amount ELSE 0 END
  FROM fin.sales_invoice_line l LEFT JOIN fin.debtor_account a ON a.debtor_account_id = l.debtor_account_id
 WHERE l.sales_invoice_id = '51000000-0000-4000-8000-000000000018' ORDER BY l.line_no;
UPDATE fin.sales_invoice SET stage = 'posted', decided_by_contact_id = 'c0000000-0000-4000-8000-000000000002', decided_at = now(), journal_entry_id = '7e000000-0000-4000-8000-000000000305', version_number = 2 WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000018';

\echo '--- rev 18 · the other setting (illustrative): from 22-Oct the NOTE posts the stock back. 10 FG-102 return saleable to batch C-2607;'
\echo '    the receipt posts nothing; the credit note carries Dr Finished Goods · Cr COGS ₹7,600 (10 × ₹760) in its own entry (R5)'
UPDATE fin.book_setting SET effective_until = '2026-10-22' WHERE setting_code = 'return_stock_posting' AND effective_until IS NULL;
INSERT INTO fin.book_setting (workspace_id, book_id, setting_code, setting_value, effective_from, reason, approved_by_contact_id, approved_at) VALUES
  ('aikyat-biscuits', '0b000000-0000-4000-8000-000000000001', 'return_stock_posting', 'with_credit_note', '2026-10-22', 'Illustrative: the other way, to prove it', 'c0000000-0000-4000-8000-000000000002', now());
UPDATE inv.stock_lot SET quantity_left = quantity_left + 10, updated_at = now() WHERE stock_lot_id = '5a000000-0000-4000-8000-000000000003';
INSERT INTO inv.stock_return (stock_return_id, workspace_id, return_no, branch_id, received_on, debtor_account_id, against_sales_invoice_id, item_code, from_stock_lot_id, quantity, condition, to_stock_lot_id, unit_cost, recorded_by_contact_id) VALUES
  ('5e000000-0000-4000-8000-000000000002', 'aikyat-biscuits', 'SRR-0002', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', '2026-10-22', 'da000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000112', 'FG-102', '5a000000-0000-4000-8000-000000000003', 10, 'saleable', '5a000000-0000-4000-8000-000000000003', 760, 'c0000000-0000-4000-8000-000000000003');
INSERT INTO fin.sales_invoice (sales_invoice_id, workspace_id, operated_party_id, branch_id, debtor_account_id, internal_ref_no, original_sales_invoice_id, revision_no, posting_date, invoice_no, invoice_date, due_date, narration, stage, submitted_by_contact_id, submitted_at, document_type, against_sales_invoice_id, note_reason, stock_return_id, return_stock_posting, inventory_mode, costing_method) VALUES
  ('51000000-0000-4000-8000-000000000019', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'da000000-0000-4000-8000-000000000001', 'SV-0019', '51000000-0000-4000-8000-000000000019', 0, '2026-10-22', 'KA/CN/2627/0004', '2026-10-22', '2026-10-22', 'Against KA/INV/2627/0143', 'submitted', 'c0000000-0000-4000-8000-000000000001', now(), 'credit_note', '51000000-0000-4000-8000-000000000112', 'return', '5e000000-0000-4000-8000-000000000002', 'with_credit_note', 'perpetual', 'fifo');
INSERT INTO fin.sales_invoice_line (workspace_id, sales_invoice_id, line_no, side, ledger_account_code, debtor_account_id, inventory_item_code, quantity, stock_lot_id, amount) VALUES
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000019', 1, 'Dr', '401090', NULL, NULL, NULL, NULL, 9750.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000019', 2, 'Dr', '206011', NULL, NULL, NULL, NULL, 243.75),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000019', 3, 'Dr', '206012', NULL, NULL, NULL, NULL, 243.75),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000019', 4, 'Cr', NULL, 'da000000-0000-4000-8000-000000000001', NULL, NULL, NULL, 10237.50),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000019', 5, 'Dr', '106020', NULL, 'FG-102', 10, '5a000000-0000-4000-8000-000000000003', 7600.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000019', 6, 'Cr', '501040', NULL, NULL, NULL, NULL, 7600.00);
INSERT INTO fin.journal_entry (journal_entry_id, workspace_id, operated_party_id, fiscal_year_id, branch_id, posting_date, voucher_type, source_document_id, source_ref_no, narration, posted_by_contact_id) VALUES
  ('7e000000-0000-4000-8000-000000000306', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-1026-4f0e-8a51-5c0b7a002026', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', '2026-10-22', 'sales', '51000000-0000-4000-8000-000000000019', 'SV-0019', 'Against KA/INV/2627/0143', 'c0000000-0000-4000-8000-000000000002');
INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, debtor_account_id, branch_id, debit, credit)
SELECT l.workspace_id, '7e000000-0000-4000-8000-000000000306', l.line_no, coalesce(l.ledger_account_code, a.ledger_account_code), l.debtor_account_id, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001',
       CASE l.side WHEN 'Dr' THEN l.amount ELSE 0 END, CASE l.side WHEN 'Cr' THEN l.amount ELSE 0 END
  FROM fin.sales_invoice_line l LEFT JOIN fin.debtor_account a ON a.debtor_account_id = l.debtor_account_id
 WHERE l.sales_invoice_id = '51000000-0000-4000-8000-000000000019' ORDER BY l.line_no;
UPDATE fin.sales_invoice SET stage = 'posted', decided_by_contact_id = 'c0000000-0000-4000-8000-000000000002', decided_at = now(), journal_entry_id = '7e000000-0000-4000-8000-000000000306', version_number = 2 WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000019';

\echo '--- rev 18 · the notes as booked: each line, its ledger (the AE''s pick) and amount'
SELECT v.internal_ref_no, v.invoice_no, v.document_type, v.note_reason, l.line_no, l.side, coalesce(l.ledger_account_code, '(customer)') AS ledger, l.amount
  FROM fin.sales_invoice v JOIN fin.sales_invoice_line l USING (sales_invoice_id)
 WHERE v.document_type <> 'invoice' ORDER BY v.internal_ref_no, l.line_no;
\echo '--- the return receipts, and the Stock back entry the first one posted'
SELECT r.return_no, r.received_on, r.item_code, r.quantity, r.condition, s.godown_code || ' ' || s.lot_no AS now_in, r.unit_cost, r.quantity * r.unit_cost AS cost_back,
       coalesce(e.voucher_type || ' ' || e.source_ref_no, '(the note posts it)') AS stock_back_by
  FROM inv.stock_return r JOIN inv.stock_lot s ON s.stock_lot_id = r.to_stock_lot_id LEFT JOIN fin.journal_entry e ON e.journal_entry_id = r.journal_entry_id ORDER BY 1;
\echo '--- Sri Lakshmi after the notes: 7,48,125 − 29,400 − 52,500 − 5,000 + 6,300 − 10,237.50 = 6,57,287.50; the books still balance'
SELECT a.account_name, sum(l.debit - l.credit) AS owes FROM fin.journal_line l JOIN fin.debtor_account a USING (debtor_account_id) GROUP BY 1;
SELECT sum(debit) AS total_dr, sum(credit) AS total_cr, sum(debit) = sum(credit) AS balanced FROM fin.journal_line;
\echo '--- stock vs books (T9): what left the lots = Finished Goods credited, after both returns'
SELECT 2422000 - sum(quantity_left * unit_cost) AS stock_value_out, (SELECT sum(credit - debit) FROM fin.journal_line WHERE ledger_account_code = '106020') AS finished_goods_credited FROM inv.stock_lot;
\echo '--- rev 18 · 14 wrong rows about the notes (N63–N76), each refused'
SELECT r FROM (VALUES
  (pg_temp.expect('N63 a credit note that names no invoice',
    $q$UPDATE fin.sales_invoice SET against_sales_invoice_id = NULL WHERE internal_ref_no = 'SV-0015'$q$, 'sales_invoice_note_names_its_invoice')),
  (pg_temp.expect('N64 an invoice that names an invoice',
    $q$UPDATE fin.sales_invoice SET against_sales_invoice_id = '51000000-0000-4000-8000-000000000112' WHERE internal_ref_no = 'SV-0014'$q$, 'sales_invoice_note_names_its_invoice')),
  (pg_temp.expect('N65 a credit note with a debit-note reason',
    $q$UPDATE fin.sales_invoice SET note_reason = 'price_increase' WHERE internal_ref_no = 'SV-0016'$q$, 'sales_invoice_credit_note_reason_valid')),
  (pg_temp.expect('N66 a return note without Stores return receipt (C-17)',
    $q$UPDATE fin.sales_invoice SET stock_return_id = NULL WHERE internal_ref_no = 'SV-0015'$q$, 'sales_invoice_return_needs_receipt')),
  (pg_temp.expect('N67 a scheme discount with no scheme reference (C-19)',
    $q$UPDATE fin.sales_invoice SET scheme_reference = NULL WHERE internal_ref_no = 'SV-0016'$q$, 'sales_invoice_scheme_needs_reference')),
  (pg_temp.expect('N68 goodwill (no GST) claiming a scheme reference (C-19)',
    $q$UPDATE fin.sales_invoice SET scheme_reference = 'SCH-26-Q2' WHERE internal_ref_no = 'SV-0017'$q$, 'sales_invoice_scheme_needs_reference')),
  (pg_temp.expect('N69 a note against a credit note',
    $q$UPDATE fin.sales_invoice SET against_sales_invoice_id = '51000000-0000-4000-8000-000000000015' WHERE internal_ref_no = 'SV-0017'$q$, 'sales_note_against_invoice')),
  (pg_temp.expect('N70 a note against the amended SV-0012 (no longer posted)',
    $q$UPDATE fin.sales_invoice SET against_sales_invoice_id = '51000000-0000-4000-8000-000000000012' WHERE internal_ref_no = 'SV-0017'$q$, 'sales_note_against_invoice')),
  (pg_temp.expect('N71 a note for another customer than its invoice',
    $q$UPDATE fin.sales_invoice SET debtor_account_id = 'da000000-0000-4000-8000-000000000002' WHERE internal_ref_no = 'SV-0017'$q$, 'sales_note_against_invoice')),
  (pg_temp.expect('N72 a note dated before its invoice',
    $q$UPDATE fin.sales_invoice SET invoice_date = '2026-10-01', posting_date = '2026-10-01' WHERE internal_ref_no = 'SV-0017'$q$, 'sales_note_against_invoice')),
  (pg_temp.expect('N73 more back than the invoice took from that batch (Part C)',
    $q$INSERT INTO inv.stock_return (workspace_id, return_no, branch_id, received_on, debtor_account_id, against_sales_invoice_id, item_code, from_stock_lot_id, quantity, condition, to_stock_lot_id, unit_cost, recorded_by_contact_id) VALUES ('aikyat-biscuits', 'SRR-0009', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', '2026-10-23', 'da000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000112', 'FG-101', '5a000000-0000-4000-8000-000000000002', 261, 'damaged', '5a000000-0000-4000-8000-000000000004', 560, 'c0000000-0000-4000-8000-000000000003')$q$, 'stock_return_not_more_than_sold')),
  (pg_temp.expect('N74 a return in an unknown condition',
    $q$INSERT INTO inv.stock_return (workspace_id, return_no, branch_id, received_on, debtor_account_id, against_sales_invoice_id, item_code, from_stock_lot_id, quantity, condition, to_stock_lot_id, unit_cost, recorded_by_contact_id) VALUES ('aikyat-biscuits', 'SRR-0009', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', '2026-10-23', 'da000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000112', 'FG-101', '5a000000-0000-4000-8000-000000000002', 1, 'lost', '5a000000-0000-4000-8000-000000000004', 560, 'c0000000-0000-4000-8000-000000000003')$q$, 'stock_return_condition_valid')),
  (pg_temp.expect('N75 a journal entry of an unknown type (refund)',
    $q$INSERT INTO fin.journal_entry (workspace_id, operated_party_id, fiscal_year_id, branch_id, posting_date, voucher_type) VALUES ('aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-1026-4f0e-8a51-5c0b7a002026', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', '2026-10-23', 'refund')$q$, 'journal_entry_voucher_type_valid')),
  (pg_temp.expect('N76 the customer debited on a credit note',
    $q$UPDATE fin.sales_invoice_line SET side = 'Dr' WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000015' AND line_no = 4$q$, 'sales_invoice_line_customer_side'))
) AS t(r);

ROLLBACK;
