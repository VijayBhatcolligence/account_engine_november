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
| 🟡 Part built | T12 | 1 |
| ⬜ Not started (engine) | the other 26 | 26 |
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
| T12 | Maintain customer finance fields | Sales | 🟡 | Customer Backend Walkthrough.html · customer_onboarding_schema.dbml | See below |
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
| T24 | Raise a sales invoice | Sales | ⬜ | — | UI built in `app/sales`. Must carry `customer_branch_id` (from T12) and our own branch (G7) |
| T25 | Issue a sales credit note | Sales | ⬜ | — | 29-Oct revision |
| T26 | Issue a sales debit note | Sales | ⬜ | — | 29-Oct revision |
| T27 | Book the dispatched-not-billed accrual | Sales | ⬜ | — | 29-Oct revision |

## T12 in detail

| | |
|---|---|
| **Built** | Rev 1: a new customer from Sales' paper form (Draft → Submitted → Approved → Active). Rev 2: the customer's branches (one account, many branches, one GSTIN per branch) |
| **Not built yet** | The card's other triggers: a credit-limit edit (the Credit Controller's recommendation), a change of credit days, ledger or billing instructions. Closing or blocking a customer |
| **Uses (stubs)** | `fin.book`, `fin.account` (Sundry Debtors only), `fin.debtor_category`, `fin.gst_state_code`; P&C's 5 tables, read by id (see the history) |
| **Gives to later tasks** | `fin.customer_account` (T13, T15, T18, T24) · `fin.customer_branch` (T24 copies the branch's GSTIN and address when the invoice is issued) |
| **Open gaps** | G6, G9, G10, G11 (in T12) · G8 (Business Core) |
| **UI** | Rev 3 (5-Nov): the CA's Customer Master form, A–F + B1 (52 fields, many GSTINs), on Sunny's FD-06 transaction-workspace |

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
