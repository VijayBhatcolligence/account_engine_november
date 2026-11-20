-- T24 · the schema proved on PostgreSQL (rev 15, 20-Nov-2026): fin.sales_invoice / _line / _history, the TWIN of Manoj's
-- purchase voucher (fin.purchase_invoice / _line / _history), posting into the shared fin.journal_entry / fin.journal_line.
-- Rev 15: the sale also posts its COST in the same entry (rule R13): Dr 501040 Cost of Goods Sold · Cr 106020 Finished Goods per
-- lot (FIFO), from inv.stock_lot (a stub of inventory; lot costs illustrative); the lots go down at approval.
-- Billing raises the invoice; the Accounts Executive books its entry; the Accounts Manager approves; it posts.
-- Run after out.sql on an empty database:  psql -v ON_ERROR_STOP=1 -f out.sql -f t24_schema_test.sql
-- 1. Seeds the smallest master data (scenario names; ids are fixed test values).
-- 2. Walks scenario B4-01 (Billing's KA/INV/2627/0143 → Sri Lakshmi Distributors, ₹7,48,125.00): submitted → approved → posted.
-- 3. Tries 33 wrong rows (N1–N33): each must be refused by the named CHECK, key, EXCLUDE or foreign key
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
INSERT INTO fin.document_sequence (workspace_id, operated_party_id, document_type, last_number) VALUES
  ('aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', 'sales_invoice', 11);

-- ---------------------------------------------------------------- 2 · B4-01: submitted → approved → posted
-- Submit (Teja): the voucher is created at Submit (as his), number SV-0012; the lines the rule R1 proposed, kept as they are.
UPDATE fin.document_sequence SET last_number = last_number + 1 WHERE document_type = 'sales_invoice';
INSERT INTO fin.sales_invoice (sales_invoice_id, workspace_id, operated_party_id, branch_id, debtor_account_id, internal_ref_no, amends_sales_invoice_id, original_sales_invoice_id, revision_no, posting_date, invoice_no, invoice_date, due_date, narration, stage, submitted_by_contact_id, submitted_at) VALUES ('51000000-0000-4000-8000-000000000012', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'da000000-0000-4000-8000-000000000001', 'SV-0012', NULL, '51000000-0000-4000-8000-000000000012', 0, '2026-10-07', 'KA/INV/2627/0143', '2026-10-07', '2026-11-06', 'Being goods sold', 'submitted', 'c0000000-0000-4000-8000-000000000001', now());
UPDATE fin.sales_invoice SET costing_method = 'fifo' WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000012';
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
INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, debtor_account_id, branch_id, debit, credit) VALUES
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000233', 1, '107100', 'da000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 748125.00, 0),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000233', 2, '401010', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 712500.00),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000233', 3, '206011', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 17812.50),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000233', 4, '206012', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 17812.50),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000233', 5, '501040', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 558000.00, 0),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000233', 6, '106020', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 162000.00),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000233', 7, '106020', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 168000.00),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000233', 8, '106020', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 228000.00);
UPDATE inv.stock_lot SET quantity_left = quantity_left - 300, updated_at = now() WHERE stock_lot_id IN ('5a000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000003');
UPDATE fin.sales_invoice SET stage = 'posted', decided_by_contact_id = 'c0000000-0000-4000-8000-000000000002', decided_at = now(), journal_entry_id = '7e000000-0000-4000-8000-000000000233', version_number = 2 WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000012';
INSERT INTO fin.sales_invoice_history (workspace_id, sales_invoice_id, version_number, operation, row_snapshot, performer_contact_id, reason)
  SELECT 'aikyat-biscuits', sales_invoice_id, 2, 'decide', to_jsonb(x), 'c0000000-0000-4000-8000-000000000002', NULL FROM fin.sales_invoice x WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000012';

\echo '--- B4-01 posted: the voucher (with its 2 generated columns), what the customer owes (its journal lines), the trial balance'
SELECT internal_ref_no, invoice_no, invoice_key, invoice_financial_year, stage, due_date FROM fin.sales_invoice;
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
    $q$UPDATE inv.stock_lot SET unit_cost = -1$q$, 'stock_lot_unit_cost_not_negative'))
) AS t(r);

-- ---------------------------------------------------------------- 4 · accepted, as his
\echo '--- a correction of the posted SV-0012 (Sale of Services instead of Sale of Products): SV-0012-1, same invoice, one chain'
INSERT INTO fin.sales_invoice (sales_invoice_id, workspace_id, operated_party_id, branch_id, debtor_account_id, internal_ref_no, amends_sales_invoice_id, original_sales_invoice_id, revision_no, posting_date, invoice_no, invoice_date, due_date, narration, stage, submitted_by_contact_id, submitted_at) VALUES ('51000000-0000-4000-8000-000000000112', 'aikyat-biscuits', '0f000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 'da000000-0000-4000-8000-000000000001', 'SV-0012-1', '51000000-0000-4000-8000-000000000012', '51000000-0000-4000-8000-000000000012', 1, '2026-10-07', 'KA/INV/2627/0143', '2026-10-07', '2026-11-06', 'Being goods sold', 'submitted', 'c0000000-0000-4000-8000-000000000001', now());
UPDATE fin.sales_invoice SET costing_method = 'fifo' WHERE sales_invoice_id = '51000000-0000-4000-8000-000000000112';
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
INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, debtor_account_id, branch_id, debit, credit) VALUES
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000234', 1, '107100', 'da000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 748125.00),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000234', 2, '401010', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 712500.00, 0),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000234', 3, '206011', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 17812.50, 0),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000234', 4, '206012', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 17812.50, 0),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000234', 5, '501040', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 558000.00),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000234', 6, '106020', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 162000.00, 0),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000234', 7, '106020', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 168000.00, 0),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000234', 8, '106020', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 228000.00, 0);
INSERT INTO fin.journal_line (workspace_id, journal_entry_id, line_no, ledger_account_code, debtor_account_id, branch_id, debit, credit) VALUES
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000235', 1, '107100', 'da000000-0000-4000-8000-000000000001', '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 748125.00, 0),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000235', 2, '401020', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 712500.00),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000235', 3, '206011', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 17812.50),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000235', 4, '206012', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 17812.50),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000235', 5, '501040', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 558000.00, 0),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000235', 6, '106020', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 162000.00),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000235', 7, '106020', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 168000.00),
  ('aikyat-biscuits', '7e000000-0000-4000-8000-000000000235', 8, '106020', NULL, '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', 0, 228000.00);
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
INSERT INTO fin.sales_invoice_line (workspace_id, sales_invoice_id, line_no, side, ledger_account_code, debtor_account_id, inventory_item_code, quantity, stock_lot_id, amount) VALUES
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000013', 1, 'Dr', '108030', NULL, NULL, NULL, NULL, 11800.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000013', 2, 'Cr', '401010', NULL, NULL, NULL, NULL, 10000.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000013', 3, 'Cr', '206011', NULL, NULL, NULL, NULL, 900.00),
  ('aikyat-biscuits', '51000000-0000-4000-8000-000000000013', 4, 'Cr', '206012', NULL, NULL, NULL, NULL, 900.00);
SELECT internal_ref_no, debtor_account_id IS NULL AS no_customer, stage FROM fin.sales_invoice WHERE internal_ref_no = 'SV-0013';

ROLLBACK;
