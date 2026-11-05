# 02 · Engine history

How the engine grew, task by task. One row per change. A row says what was added or changed, and whether any done work had to change.

## The log

| # | Date | Task · rev | Input (who) | Engine change | Done work changed? |
|---|---|---|---|---|---|
| H0 | 3-Nov-2026 | Method | Vijay: follow the Vendor Backend Walkthrough and backend modeling (Manoj). The team: our company's P&C `party_id` is the accounting key, with no `legal_entity_id` | Two owners: Finance (schema `fin`) and Parties and Contacts (schema `pc`). P&C ids kept as plain values, with no foreign key | — |
| H1 | 3-Nov-2026 | T12 rev 1 · create a customer | Task card T12; the app `app/sales` (sections A–F, 23 fields) | `Customer Backend Walkthrough.html` + `customer_onboarding_schema.dbml`. **16 tables:** 5 P&C stubs + 11 `fin` (book, account, debtor_category, gst_state_code, customer_request, customer_request_history, customer_account, customer_account_history, outbox, handled_event, action_receipt) | — (first task) |
| H2 | 3-Nov-2026 | T12 rev 2 · branches | A pasted task: "Customer Onboarding – Multiple Branches and GST Registrations" | **+1 table** `fin.customer_branch` (12 columns): which P&C location we bill, under which P&C GSTIN. `pc.business_location` stub +3 columns (display_name, since, until). History +4 actions (add, change, deactivate, set default branch). Outbox +3 events (CustomerBranchAdded, CustomerBranchChanged, CustomerBranchDeactivated). App: a Branches section on the customer; the invoice (T24 UI) picks the branch. Tests 30/30 | **No.** Still one account per customer; an account without branch rows counts as one default branch |
| H3 | 4-Nov-2026 | Gap review | 6 gaps from the team discussion (3–4 Nov) + Swasthik's Aikyat — Branch Design (15-Oct) | **No table change.** Gaps G1–G10 logged in `03_gaps.md`; this tracker started | No. Decision (Vijay): T12 stays as built; each gap is solved when its home task is built |
| H4 | 5-Nov-2026 | T12 · UI rev 3 (app only) | Vijay: follow the CA's Customer Master onboarding form (Swasthik, `shared_by_swasthik/1. Customer_Master_Onboarding_Form_1.xls`) and Sunny's task-to-screen formula | **App only, no table change.** The customer form goes from 24 to 52 fields, in the form's order (A · system suggestions · B · B1 · C · D · billing · E · F), with any number of extra GSTINs (B1). The Debtor Category Master (16 rows) drives ledger, GST, TCS, credit period and related party. Screen: FD-06 Structured Editor · transaction-workspace, with a "Built with" panel. Tests 34/34 | No: done UI kept (same layout, sales invoice untouched). **The schema and the walkthrough now lag the UI: G11** |
| H5 | 5-Nov-2026 | T12 rev 3 · schema | Vijay: AI-friendly names; standard ERPs (ERPNext, Odoo, SAP, Oracle); Manoj's vendor schema (`Vendor Creation Walkthrough_manoj_schema.html`); keep our extras. CA's chart of accounts (Swasthik) for ledger codes | `customer_onboarding_schema.dbml` rewritten + **new** `Customer Creation Walkthrough.html`. **23 tables** (11 P&C, 12 fin), 276 columns, 39 refs. Names mirror the vendor side: `customer_account` → `debtor_account`; `customer_branch` → `debtor_tax_registration` + `debtor_billing_location`; `fin.account` → `fin.ledger_account` (shared). **Added:** `customer_request_approval` (3 parts, as the app), `debtor_credit_limit` (dated). **Removed:** `fin.book`, `handled_event`, `action_receipt`. One transaction on the last approval (Manoj's flow) | **Yes, T12 only:** the company key `book_party_id` → `operated_party_id` (the same key as the vendor side, so AR and AP share it); stages lose `approved` and the hold. The app is unchanged |

## The engine now (after H5)

| | Tables | Columns |
|---|---|---|
| `pc` (Business Core's tables we read or write, not ours) | 11 | 80 |
| `fin` (ours) | 12 | 196 |
| **Total** | **23** | **276** · 39 refs |

Counted with the dbml parser (@dbml/core 11.0.1); its PostgreSQL export parses (pglast), 5-Nov-2026.

## Stubs: what will be replaced, and by which task

| Stub | What it holds now | Replaced by |
|---|---|---|
| (no book table) | The company key is `pc.operated_party.operated_party_id` | S1 Set up the books adds the book (G1, G2, G4) |
| `fin.ledger_account` | Shared with the vendor side; seeded from the CA's chart (107010–107130 / 110010–110130) | S2 Chart of accounts (G4: which framework's codes) |
| `fin.debtor_category` | The CA's 16 categories, each naming its ledger | S2 / T12 (G6) |
| `fin.gst_state_code` | Shared with the vendor side (41 rows) | A reference list; owner open |
| `pc.*` (11 tables) | Our copy of P&C's columns that we read or write | Never ours: Business Core's model wins |

## Hand-offs promised to later tasks

| From | To | Promise |
|---|---|---|
| T12 rev 3 | T24 | The invoice line carries `debtor_account_id`, `control_ledger_code` and `debtor_billing_location_id`, and copies that place's GSTIN and address when issued. It reads GST / TCS from `debtor_category` |
