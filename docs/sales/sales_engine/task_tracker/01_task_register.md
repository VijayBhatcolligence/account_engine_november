# 01 · Task register

Every task on the Accounts Executive's task card, and whether the engine supports it. Updated when a task opens or closes.

**Source:** the task card `docs/tasks/01_accounts_executive_tasks_and_responsibilities.md` (T1–T23).
**Difference D1:** this repo's card is the 26-Oct revision (23 tasks). The later revision (29-Oct, Vijay: Billing combined with this role) adds **T24–T27**, so **27 tasks**. The app already shows T24. Listed here: 27. This repo's card is still to be brought up to date.

**Build order:** the 31 tasks (4 setup S1–S4 + 27) in the order we build them, with clear names, are in `docs/sales/task_copy/01_accounts_executive_tasks_and_responsibilities.md`, section "Build order". That order wins; this register tracks status.

**Status:** ✅ built · 🟡 part built · ⬜ not started

## Summary

| Status | Tasks | Count |
|---|---|---|
| ✅ Built | — | 0 |
| 🟡 Part built | T12 · T24 (rev 15, 20-Nov: the cost of goods sold from inventory in the same entry, FIFO or weighted average; rev 14, 18-Nov: Manoj's model, his 3 purchase-voucher tables on the customer side; rev 13: one voucher design (withdrawn); rev 12: the AE books the accounting voucher of Billing's invoice; rev 5: the CA's specimens; app + schema proved on PostgreSQL and against the CA's 24 answer keys; waits for the CA's review, then the hand-over to Manoj) | 2 |
| ⬜ Not started (engine) | the other 25 | 25 |
| **Total** | | **27** |

## The tasks

| ID | Task | Area | Engine | Docs (sales_engine) | Notes |
|---|---|---|---|---|---|
| T1 | Post a purchase voucher | Purchase | ⬜ | — | Purchase side: a teammate's |
| T2 | Post a service bill against a Works Order | Purchase | ⬜ | — | |
| T3 | Allocate landed cost | Purchase | ⬜ | — | |
| T4 | Raise a debit note to a vendor | Purchase | ⬜ | — | |
| T5 | Book a supplier credit note | Purchase | ⬜ | — | |
| T6 | Request a tax or TDS override | Purchase | ⬜ | — | |
| T7 | Complete and maintain vendor finance fields | Purchase | ⬜ | — | The vendor side of onboarding: the teammate's Vendor Backend Walkthrough (Manoj), the model T12 follows |
| T8 | Create or edit an item's accounting fields | Inventory | ⬜ | — | Needs G3 (costing method) |
| T9 | Resolve stock reconciliation breaks | Inventory | ⬜ | — | Needs G3 |
| T10 | Draft the slow-moving, expired and NRV provision | Inventory | ⬜ | — | |
| T11 | Post the periodic close entries | Inventory | ⬜ | — | Only "when the company uses Periodic inventory accounting": needs G3 |
| T12 | Maintain customer finance fields | Sales | 🟡 | customer_onboarding_schema.dbml (rev 5: synced with Manoj's build) · Customer Creation Walkthrough.html · Customer Backend Walkthrough.html (older flow, G11) | See below |
| T13 | Record an advance against a sales order | Sales | ⬜ | — | Uses T12's customer account |
| T14 | Match 26AS/AIS | AR/AP | ⬜ | — | |
| T15 | Draft the AR/AP provision run | AR/AP | ⬜ | — | |
| T16 | Prepare a netting document | AR/AP | ⬜ | — | Needs a Business Core party link (see G5) |
| T17 | Maintain a vendor's Udyam (MSME) data | AR/AP | ⬜ | — | |
| T18 | Run the AR/AP reconciliation | AR/AP | ⬜ | — | Uses T12's sub-ledger accounts |
| T19 | Book the GRN-not-invoiced provision | Purchase | ⬜ | — | |
| T20 | Review standard cost variances | Inventory | ⬜ | — | Only for items at standard cost: needs G3 |
| T21 | Prepare the bank stock statement | Inventory | ⬜ | — | |
| T22 | Book the ITC reversal on written-off stock | Inventory | ⬜ | — | |
| T23 | Draft the FX revaluation run | AR/AP | ⬜ | — | |
| T24 | Book a sales voucher (the accounting entry of Billing's invoice; rev 12) | Sales | 🟡 | task_list/T24_sales_voucher_entry.md (§20 rev 15) · customer_onboarding_schema.dbml rev 15 (Manoj's model: sales_invoice / _line / _history; + the cost of goods sold from inventory, inv.stock_lot) · t24_example_data.md · out.sql · t24_schema_test.sql · Customer Creation Walkthrough.html (Part 2) | **Rev 2 (16-Nov): built the way Manoj built the purchase voucher (T1). Rev 3 (16-Nov): the CA's 43 specimens: F1 (export / SEZ with IGST) and F2 (third-party ship-to) corrected; Bill of Supply, B2C and paid at once, freight, pure agent, deferred services, incoterm, advance link added; 24 / 24 CA answer keys pass; 25 / 25 wrong rows refused. Rev 4 (18-Nov, Vijay): T24 is the invoice only; the challan is a read-only source, its recording, stock and cost entry are the Stores task G30; the invoice opens full screen; schema notes only. Rev 5 (18-Nov, Vijay): the invoice is independent, typed as the CA's 43 specimens (no challan, order or PO); fields on none of them removed (listed); discount, transport, payment reference added; schema rev 7 (+3 columns, +2 CHECKs); 27 / 27 refused.** App: branches, the AM's three decisions, IRP refusal and retry, IRN cancel ≤ 24 h, check codes; 53 tests. Schema: 9 new tables + his books core + 2 stubs; runs on PostgreSQL 18, B4-01 posts, 19 / 19 wrong rows refused. Next: the code in the engine repo (hand-over in the dbml) |
| T25 | Issue a sales credit note | Sales | ⬜ | — | 29-Oct revision |
| T26 | Issue a sales debit note | Sales | ⬜ | — | 29-Oct revision |
| T27 | Book the dispatched-not-billed accrual | Sales | ⬜ | — | 29-Oct revision |

## T12 in detail

| | |
|---|---|
| **Built** | Rev 1: a new customer from Sales' paper form. Rev 2: the customer's branches. Rev 3 (5-Nov): Manoj's names and one-transaction flow, 23 tables. **Rev 4 (6-Nov): our faults F1–F5 corrected (shipping stored, contact foreign keys, Submit checks written, B1 status and default, contacts list) + the optional bank account; 24 tables, 301 columns, 47 refs.** **Rev 5 (16-Nov, with T24): synced with Manoj's build: `ledger_account_code` (no control ledger), `account_type`, identity keys, clocks; 3 faults in our rev 4 export fixed (partial indexes, the anchor links, `iso_3166_2`)** |
| **Not built yet** | The card's other triggers: a credit-limit edit (the Credit Controller's recommendation), a change of credit days, ledger or billing instructions. Closing or blocking a customer. T12's own screens still say "control account": rename to "receivable ledger" in T12's next revision (rev 5 changed only its schema) |
| **Uses (stubs)** | `fin.ledger_account` (with `account_type`), `fin.debtor_category`, `fin.gst_state_code`, `fin.party_bank_account` (shared with the vendor side); P&C's 11 tables, joined by foreign keys `(workspace_id, id)` |
| **Gives to later tasks** | `fin.debtor_account` + its `ledger_account_code` (T13, T15, T18, T24) · `fin.debtor_location` bill_to / ship_to (T24: GSTIN, addresses, place of supply) · `refund_bank_account_id` (the refund task verifies it first) |
| **Open gaps** | G6, G9, G10, G11, G13, G15 (in T12) · G8, G16 (Business Core) · G14 (team lead) |
| **UI** | Rev 3 (5-Nov): the CA's Customer Master form, A–F + B1 (52 fields, many GSTINs), on Sunny's FD-06 transaction-workspace. Rev 4 (6-Nov): shipping city / state / PIN, more contacts, optional bank section |

**T12 in the engine model (CLAUDE.md §3):**

| Question | Answer |
|---|---|
| 1. Slice | Sales: the Accounts Executive types in Sales' paper form |
| 2. Business event | `CustomerApproved` → `CustomerRecorded` (P&C) → `CustomerOpened` |
| 3. Recognised? | **No.** A master record, not a transaction: logged as seen, nothing posts |
| 4. Posting rule | None |
| 5. Entry | None. The account opens with a nil balance under Sundry Debtors |
| 6. Exception | `CustomerRegistrationFailed`, `CustomerOpenFailed` → the request is held for the Accounts Executive |

## Candidate tasks not on the card (from the gaps: ask, don't add)

| ID | Candidate | Gaps it would cover | Owner |
|---|---|---|---|
| S1 | Set up the company's books (book, framework, books-from and go-live dates) | G1, G2, G4 | To ask (not this role's card) |
| S2 | Chart of accounts and Schedule III layout | G4 (presentation), G6 (the control accounts themselves) | To ask |
| S3 | Our company's branches and GST registrations | G7 | To ask (the Branch Design, Swasthik) |
| S4 | Inventory setup (maintain / integrate, valuation, godowns) | G3 | To ask |

## T24 in detail (rev 2, 16-Nov)

| | |
|---|---|
| **Built** | Rev 1 (6-Nov): the design (72 fields, 19 checks, R1–R7) and the screen. **Rev 2 (16-Nov): the twin of Manoj's built purchase voucher.** App: issuer branch (KA-01 / TN-01, series per branch), the receivable ledger, approve / send back / reject with re-checks, IRP refusal → issued → retry, IRN cancel ≤ 24 h (mirror entry), the credit-note mock leaves it posted, a code on every check; 53 tests pass, build clean, screens checked. Schema: `fin.sales_invoice`, `_line`, `_entry_line`, `_history`, `fin.e_invoice`, `fin.e_way_bill`, `fin.document_series`, `fin.posting_rule`, `fin.export_lut` (stub) + `sales.delivery_challan`, `_line` (stubs) on his books core; 86 CHECKs; run on PostgreSQL 18 |
| **Not built yet** | The code in the engine repo (`sales_invoice.py`, migration 0007: the hand-over list in the dbml). The send to the customer (G31). The services' notional challan and ageing (G26). TCS amounts (G18) |
| **Uses (stubs)** | Manoj's `fin.branch` (S3), `fin.fiscal_year` (S1), `fin.export_lut` (S3, G19), `sales.delivery_challan` (Sales / Stores slice, G30); items and the tax master in code (T8, G20) |
| **Gives to later tasks** | T25 / T26: invoice_no, date, lines, irn · T13: the invoice as the item to adjust (allocation G29) · T18: `journal_line` by customer = the receivable ledgers · GSTR-1: lines by HSN, supply type, buyer GSTIN · T27: challan lines − invoiced |
| **Open gaps** | G14 (outbox, team lead) · G18 (CA ledgers) · G20 (tax master) · G21 (typed voucher vs no orphan) · G23 (IRN offline fallback) · G25 (FX rate) · G26 · G27–G31 |

**T24 in the engine model (CLAUDE.md §3):**

| Question | Answer |
|---|---|
| 1. Slice | Sales (billing combined with the AE, 29-Oct) |
| 2. Business event | The invoice approved → issued (number) → registered (IRN) → posted; IRN cancelled ≤ 24 h |
| 3. Recognised? | **Yes**, once registered: the first posting (the challan posts the cost; the order nothing) |
| 4. Posting rule | `SALES_INVOICE` v1 (`fin.posting_rule`), cases R1–R7 by supply type, local / inter-state, service, export, SEZ, TCS |
| 5. Entry | Dr the customer (its receivable ledger, naming the account) · Cr Sales · Cr Output GST by head · ± Round off |
| 6. Exception | IRP refuses → issued, Compliance retries · a check fails again at approval · period or year closed · the AE's edited entry (to Rajan) |

**T24 rev 3 · how we work now (Vijay, 16-Nov):** we build each task ourselves (UI, schema, proof) and hand it to Manoj to merge. A task is complete when the CA's answer keys in its scope pass as tests, the schema runs on PostgreSQL, the UI shows every path, the CA has reviewed it, and the hand-over pack is ready. T24 waits for the CA's review (G34).
