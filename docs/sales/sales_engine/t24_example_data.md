# T24 Sales voucher: example data for the 4 main tables

Rev 14 · 19-Nov-2026 · schema `customer_onboarding_schema.dbml` (Manoj's model, customer side)

| Ours (T24) | Manoj's twin (purchase) | Holds |
|---|---|---|
| `fin.sales_invoice` | `fin.purchase_invoice` | the voucher: one row per Billing invoice the AE books |
| `fin.sales_invoice_line` | `fin.purchase_invoice_line` | the Dr / Cr lines the AE sends |
| `fin.journal_entry` | shared | the posted entry (written once at approval) |
| `fin.journal_line` | shared | its Dr / Cr lines: the books |

Plus `fin.sales_invoice_history` (one row per version; section 5).

**Source of every value:** the rows `t24_schema_test.sql` writes on PostgreSQL 18, from scenario B4-01 and the test cases. Nothing here is typed by hand.
- Ids are uuids in the database. Here they are shown short: `SI-12` = the voucher SV-0012, `JE-233` = a journal entry.
- Times written by `now()` in the test are shown as "time sent" and "time approved".

---

## The 3 examples

| # | Case | Voucher | Billing's invoice | Result |
|---|---|---|---|---|
| A | B4-01: goods sold to Sri Lakshmi Distributors (dealer), Karnataka → Karnataka (local) | SV-0012 | KA/INV/2627/0143 · ₹7,48,125.00 | posted as JE-233 |
| B | A correction of A: the AE used Sale of Products; it should be Sale of Services | SV-0012-1 | the same invoice | JE-233 reversed by JE-234; JE-235 posted; SV-0012 becomes `amended` |
| C | A B2C counter sale paid by UPI: no customer account | SV-0013 | KA/INV/2627/0144 · ₹11,800.00 | submitted, waiting for Rajan (no entry yet) |

The people: **Teja** = Accounts Executive (maker) · **Rajan** = Accounts Manager (checker). Our branch: **KA-01**, GSTIN 29AAECA0000A1ZQ.

---

## 1 · `fin.sales_invoice`: the voucher (26 fields)

### Example A in full (SV-0012, as it stood once posted)

| Field | Example | Meaning |
|---|---|---|
| `sales_invoice_id` | SI-12 | the id of this row |
| `workspace_id` | aikyat-biscuits | which company workspace |
| `operated_party_id` | OP-1 | our company (Aikyat Biscuits Pvt Ltd) |
| `branch_id` | BR-KA01 | our branch that issued the invoice (GSTIN 29…) |
| `debtor_account_id` | DA-SL | the customer: Sri Lakshmi Distributors (T12 account) |
| `internal_ref_no` | SV-0012 | our voucher number (series `sales_invoice`, as his PV-0001) |
| `amends_sales_invoice_id` | *empty* | not a correction |
| `original_sales_invoice_id` | SI-12 | the first voucher of its chain: itself |
| `revision_no` | 0 | 0 = the first |
| `posting_date` | 07-Oct-2026 | the date the entry posts on |
| `invoice_no` | KA/INV/2627/0143 | Billing's invoice number |
| `invoice_key` | KA/INV/2627/0143 | generated: upper case, no spaces (the never-twice key) |
| `invoice_date` | 07-Oct-2026 | Billing's invoice date |
| `due_date` | 06-Nov-2026 | invoice date + the customer's 30 credit days |
| `invoice_financial_year` | 2026 | generated: FY 2026-27 |
| `narration` | Being goods sold | copied to the journal entry |
| `stage` | posted | submitted → posted |
| `version_number` | 2 | 1 at Submit, 2 at the decision |
| `submitted_by_contact_id` | C-TEJA | the maker |
| `submitted_at` | time sent | |
| `decided_by_contact_id` | C-RAJAN | the checker (never the maker) |
| `decided_at` | time approved | |
| `decision_reason` | *empty* | only for a rejection or a send-back |
| `journal_entry_id` | JE-233 | the entry it posted |
| `recorded_at` | time sent | when the row was written |
| `updated_at` | time approved | when it last changed |

### All vouchers at the end of the test

| internal_ref_no | revision_no | original | amends | customer | invoice_no | invoice_date | due_date | stage | version | decided_by | journal_entry_id |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SV-0012 | 0 | SI-12 | – | DA-SL | KA/INV/2627/0143 | 07-Oct-2026 | 06-Nov-2026 | **amended** | 3 | C-RAJAN | JE-233 |
| SV-0012-1 | 1 | SI-12 | SI-12 | DA-SL | KA/INV/2627/0143 | 07-Oct-2026 | 06-Nov-2026 | **posted** | 2 | C-RAJAN | JE-235 |
| SV-0013 | 0 | SI-13 | – | *empty* (B2C) | KA/INV/2627/0144 | 07-Oct-2026 | 07-Oct-2026 | **submitted** | 1 | – | – |

- **The same invoice number twice** (SV-0012 and SV-0012-1) is allowed because both are one chain (same `original`). A new voucher for KA/INV/2627/0143 is refused (`sales_invoice_never_twice`; test N5).
- **SV-0013:** paid at once, so the due date is the invoice date and there is no customer.

---

## 2 · `fin.sales_invoice_line`: the lines the AE sends (8 fields)

Each line is **either a ledger or the customer**, never both.

| Voucher | line_no | side | ledger_account_code | debtor_account_id | amount | In words |
|---|---|---|---|---|---|---|
| SV-0012 | 1 | Dr | – | DA-SL | ₹7,48,125.00 | the customer owes the invoice total |
| SV-0012 | 2 | Cr | 401010 | – | ₹7,12,500.00 | Sale of Products (taxable value) |
| SV-0012 | 3 | Cr | 206011 | – | ₹17,812.50 | Output CGST (2.5%) |
| SV-0012 | 4 | Cr | 206012 | – | ₹17,812.50 | Output SGST (2.5%) |
| SV-0012-1 | 1 | Dr | – | DA-SL | ₹7,48,125.00 | the same |
| SV-0012-1 | 2 | Cr | **401020** | – | ₹7,12,500.00 | **Sale of Services** (the corrected ledger) |
| SV-0012-1 | 3 | Cr | 206011 | – | ₹17,812.50 | the same |
| SV-0012-1 | 4 | Cr | 206012 | – | ₹17,812.50 | the same |
| SV-0013 | 1 | Dr | 108030 | – | ₹11,800.00 | UPI / Card Clearing (paid at once) |
| SV-0013 | 2 | Cr | 401010 | – | ₹10,000.00 | Sale of Products |
| SV-0013 | 3 | Cr | 206011 | – | ₹900.00 | Output CGST |
| SV-0013 | 4 | Cr | 206012 | – | ₹900.00 | Output SGST |

Not shown: `sales_invoice_line_id` (the row's id), `workspace_id`, and `sales_invoice_id` (= the voucher in the first column).

- **Dr = Cr on every voucher:** 7,48,125 = 7,12,500 + 17,812.50 + 17,812.50, and 11,800 = 10,000 + 900 + 900.
- **GST is only lines.** There is no GST column; ledgers 206011 and 206012 have `account_type` output_cgst and output_sgst (as his Input GST).
- **The customer line has no ledger.** At Post it goes to the customer account's own ledger, 107100 (section 4).

---

## 3 · `fin.journal_entry`: the posted entry (13 fields)

Written once at approval by `PostJournalEntry`, never edited.

| journal_entry_id | posting_date | voucher_type | source_document_id | source_ref_no | reverses_journal_entry_id | narration | posted_by |
|---|---|---|---|---|---|---|---|
| JE-233 | 07-Oct-2026 | sales | SI-12 (SV-0012) | SV-0012 | – | Being goods sold to Sri Lakshmi Distributors | C-RAJAN |
| JE-234 | 07-Oct-2026 | sales | SI-12-1 (SV-0012-1) | SV-0012-1 | **JE-233** | SV-0012 replaced by SV-0012-1 | C-RAJAN |
| JE-235 | 07-Oct-2026 | sales | SI-12-1 (SV-0012-1) | SV-0012-1 | – | Being goods sold to Sri Lakshmi Distributors | C-RAJAN |

Same on all 3 rows: `workspace_id` aikyat-biscuits · `operated_party_id` OP-1 · `fiscal_year_id` FY-2627 (FY 2026-27, open) · `branch_id` BR-KA01 · `posted_at` = time approved.

- **JE-234 is the exact mirror of JE-233** (Dr and Cr swapped). An entry is never changed; it is reversed.
- **One forward entry per voucher:** a second non-reversal entry for SV-0012 is refused (`journal_entry_one_forward_entry_per_document`; test N24).
- No SV-0013 entry: it is not approved yet.

---

## 4 · `fin.journal_line`: the books (10 fields)

| Entry | line_no | ledger_account_code | debtor_account_id | debit | credit |
|---|---|---|---|---|---|
| JE-233 | 1 | 107100 Trade Receivables – Dealer | DA-SL | 7,48,125.00 | 0 |
| JE-233 | 2 | 401010 Sale of Products | – | 0 | 7,12,500.00 |
| JE-233 | 3 | 206011 Output CGST | – | 0 | 17,812.50 |
| JE-233 | 4 | 206012 Output SGST | – | 0 | 17,812.50 |
| JE-234 | 1 | 107100 | DA-SL | 0 | 7,48,125.00 |
| JE-234 | 2 | 401010 | – | 7,12,500.00 | 0 |
| JE-234 | 3 | 206011 | – | 17,812.50 | 0 |
| JE-234 | 4 | 206012 | – | 17,812.50 | 0 |
| JE-235 | 1 | 107100 | DA-SL | 7,48,125.00 | 0 |
| JE-235 | 2 | 401020 Sale of Services | – | 0 | 7,12,500.00 |
| JE-235 | 3 | 206011 | – | 0 | 17,812.50 |
| JE-235 | 4 | 206012 | – | 0 | 17,812.50 |

Same on every row: `workspace_id` aikyat-biscuits · `branch_id` BR-KA01 · `creditor_account_id` empty (no vendor). Not shown: `journal_line_id` (the row's id).

**What the 12 lines add up to** (the test's own query):

| Ledger | Net (Dr − Cr) | Business meaning |
|---|---|---|
| 107100 (Sri Lakshmi) | **+7,48,125.00** | the customer owes the invoice total, once |
| 401010 Sale of Products | 0.00 | the wrong ledger, fully reversed |
| 401020 Sale of Services | −7,12,500.00 | the revenue, on the corrected ledger |
| 206011 Output CGST | −17,812.50 | GST owed to the government |
| 206012 Output SGST | −17,812.50 | GST owed to the government |

- **What a customer owes** = Σ(debit − credit) of the lines naming `DA-SL` = ₹7,48,125.00. It is not stored anywhere else.

---

## 5 · `fin.sales_invoice_history`: every version (10 fields)

| Voucher | version_number | operation | performer | reason | row_snapshot (stage) |
|---|---|---|---|---|---|
| SV-0012 | 1 | submit | C-TEJA | – | submitted |
| SV-0012 | 2 | decide | C-RAJAN | – | posted |
| SV-0012 | 3 | amended | C-RAJAN | Replaced by SV-0012-1 | amended |
| SV-0012-1 | 1 | submit | C-TEJA | – | submitted |
| SV-0012-1 | 2 | decide | C-RAJAN | – | posted |

`row_snapshot` holds the whole voucher row as it then stood (JSON); only its stage is shown here. `acting_on_event_id` is empty on every row: a person acted. The test writes no history for SV-0013 (a schema test, not the app's flow); in the app, its Submit writes version 1.

---

## How the 4 tables connect (example A)

```
sales_invoice  SV-0012 ──< sales_invoice_line × 4      (what Teja sent)
      │ journal_entry_id = JE-233
      ▼
journal_entry  JE-233  ──< journal_line × 4            (what the books hold)
      source_document_id = SV-0012's id · source_ref_no = SV-0012
```

Re-run: `psql -v ON_ERROR_STOP=1 -f out.sql -f t24_schema_test.sql` on an empty PostgreSQL 18 database (it rolls back at the end).
