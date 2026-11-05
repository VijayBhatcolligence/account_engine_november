# 03 · Gaps

Everything found that the current task does not cover. Each gap gets a **kind** and a **home**, and stays here until it is covered or found not needed.

**Kinds:**
- **In a task (Tn):** a task on the card is the home. If Tn is built, it is fixed in a new revision of Tn; if not, it is solved when Tn is built.
- **New task:** no task on the card does this work. It is a candidate task (S1–S4 in the register): ask, don't add.
- **Other owner:** another team owns the fact (Business Core, the accounting lead). We ask them, then read their answer.

**Status:** open · covered (task and revision) · not needed (with the reason)

## Summary

| ID | Gap | Kind | Home | Raised | Touches done work? | Status |
|---|---|---|---|---|---|---|
| G1 | More than one book per company | New task | S1 Set up the books | Team, 3-Nov | `fin.book` stub only | open |
| G2 | Books-from date vs go-live date | New task | S1 (+ opening-balance migration) | Team, 3-Nov | `fin.book` stub only | open |
| G3 | Inventory settings | New task | S4 Inventory setup; used by T8, T9, T11, T20 | Team, 3-Nov | No | open · **not analysed yet** |
| G4 | Accounting framework (Ind AS / AS) | New task | S1; policies: the accounting lead | Team, 3-Nov | No | open |
| G5 | Customer groups (e.g. Tata Group) | Other owner | Business Core | Team, 4-Nov | No | open |
| G6 | A control account per debtor category | In a task | **T12** (+ S2 for the accounts) | Team, 4-Nov | **Yes:** T12 | open |
| G7 | Our company's own branches | New task | S3; used by T24 and the journal | Swasthik, 15-Oct | No | open |
| G8 | GSTIN ↔ place of business in Business Core | Other owner | Business Core | Swasthik, 15-Oct | Yes, small: `fin.customer_branch` | open |
| G9 | Credit Controller and Compliance Officer approvals at onboarding | In a task | **T12** | Walkthrough, 3-Nov | **Yes:** T12 | covered in schema rev 3 (`customer_request_approval`) · confirm with the role owner |
| G10 | GST portal check of the GSTIN | In a task | **T12** | Walkthrough, 3-Nov | **Yes:** T12 | open |
| G11 | The schema and walkthrough lag the CA's form (UI rev 3) | In a task | **T12** | Vijay, 5-Nov | **Yes:** T12 | schema covered (rev 3) · the Customer Backend Walkthrough is still open |
| G12 | The sales invoice's receivable codes don't match the CA's chart | In a task | **T24** | Found 5-Nov (schema rev 3) | **Yes:** the T24 UI | open |

**Counts:** 12 gaps · in a task 5 (T12: 4, T24: 1) · new task 5 · other owner 2.

## Each gap

### G1 · More than one book per company
- **Update 5-Nov (schema rev 3):** `fin.book` is removed; the company key is `operated_party_id`, as on the vendor side. Task S1 adds the book table with `book_id`; accounts stay keyed to the company.
- **Problem (as raised):** the key of `fin.book` is `book_party_id`, so a company can have only one book. Ind AS books and tax books need two (Oracle: primary and secondary ledgers).
- **Direction:** a new key `book_id`; keep `book_party_id` as the owning company; add `book_code` and `ledger_type` (primary / secondary). Journal lines carry `book_id`.
- **T12:** no change. A customer account belongs to the company, not to one book (ABC owes the same ₹ in every book).
- **Evidence:** `customer_onboarding_schema.dbml`: `fin.book`, open point 1.

### G2 · Books-from date vs go-live date
- **Problem:** `fin.book.books_from` exists; the date the application went live does not.
- **Direction:** `books_from` = the earliest records kept; records brought over in a migration keep their original dates; add a separate go-live date.
- **Note:** opening-balance migration is one-time, not a task (task card §9).

### G3 · Inventory settings
- **Problem raised:** TallyPrime asks per company whether to maintain inventory and whether to integrate it with accounts. Oracle Fusion holds inventory organisations (warehouses, plants) tied to a legal entity and its primary ledger. Valuation method, godowns, stock groups, items, units, batches and movements are also asked about.
- **Not analysed yet:** the full repository search was stopped (4-Nov). Analyse it when S4 or T8 opens, and compare against the official TallyPrime and Oracle Fusion documentation then.
- **The card already depends on it:** T11 runs only "when the company uses Periodic inventory accounting"; T20 is for items at standard cost; T8 holds an item's costing fields. Nobody sets these yet.
- **Direction (proposal):** hold the settings per inventory organisation (godown), linked to the company and its primary book (G1). Swasthik's Branch Design already lists a `godown` table.

### G4 · Accounting framework (Ind AS / AS)
- **Problem:** nothing says which framework a company follows. Frameworks treat leases, borrowing costs, depreciation and inventory valuation differently.
- **Direction:** the company has a default framework (effective date, version, evidence of applicability) that its books inherit. A book may override it only for parallel reporting, with approval and an audit trail. The framework (Ind AS / AS) is kept separate from the Schedule III division (I / II), which is about presentation (S2).
- **Owner:** Accounting. P&C supplies the legal facts used to decide applicability.

### G5 · Customer groups (e.g. Tata Group)
- **Problem:** TCS and Tata Communications are separate customers; management wants totals across the group.
- **Business Core may already support it:** `pc.party_relationship` (from_party_id, to_party_id, relationship_type_code, since, until). See `shared_doc_reference/business_core/aikyat-parties-contacts/model/logical-model.md` §party_relationship and `…/db/migrations/003_parties.sql:196`. Its vocabulary is `pc.party_relationship_type` (`001_platform_catalogues.sql:110`), which has no seeds yet.
- **Direction:** ask P&C for a "member of group" relationship type; the group is a party too, and chained links give more levels. Finance adds no table; reports total by `party_id`. `fin.debtor_category` is a classification, not a group.

### G6 · A control account per debtor category (ours)
- **Problem:** every customer sits under one Sundry Debtors account. Some businesses want Corporate Debtors and Domestic Debtors as separate lines in the trial balance.
- **Home:** T12. Its card names "ledger mapping" as one of the customer's finance fields. S2 creates the control accounts themselves.
- **Direction:** `fin.debtor_category` + `control_account_id`, optional: empty means the shared Sundry Debtors. The customer's control mapping becomes dated (from, until), never overwritten, so a balance is never counted twice. Moving an account that has a balance needs a transfer entry (posted by the engine).
- **Decide:** who may change a category's mapping (the Accounts Manager or the CA).
- **Evidence:** schema open point 3; the walkthrough's open "Under (header)" field.
- **Decision 4-Nov:** logged; T12 not changed now.

### G7 · Our company's own branches
- **Problem:** the Branch Design (Swasthik, 15-Oct) puts a balancing branch tag on every journal line. It links our branches to our GST registrations, keeps a number series per GSTIN, and clears inter-branch balances by the system only.
- **Not T12:** `fin.customer_branch` is the **customer's** branch (where we bill), not ours.
- **Used by:** T24 (the invoice picks our branch and its number series) and the journal.

### G8 · GSTIN ↔ place of business in Business Core
- **Problem:** the Branch Design proposes `registration_place` (a registration × a location; principal / additional). Today P&C does not link a GSTIN to a location, so `fin.customer_branch.gst_registration_id` fills that gap.
- **If P&C adopts it:** the GSTIN becomes a P&C read, and `fin.customer_branch` keeps only the billing choice (is_default, since, until).
- **Evidence:** schema open point 5.

### G9 · Credit Controller and Compliance Officer approvals at onboarding
- **Problem:** the app routes the credit limit to the Credit Controller and the GST / TCS tagging to the Compliance Officer. The walkthrough keeps one decision, as the vendor walkthrough does.
- **Home:** T12. Its card has the Credit Controller check a credit-limit edit.
- **Evidence:** schema open point 2; the walkthrough, Step 5. Open with the role owner.

### G10 · GST portal check of the GSTIN
- **Problem:** the portal gates (GSTIN checked, cancelled, suspended, name differs) are deferred.
- **Home:** T12 (a `gstin_check` table arrives with it).
- **Evidence:** schema open point 4; the walkthrough "GST portal gates: deferred".

### G11 · The schema and walkthrough lag the CA's form (UI rev 3)
- **Problem:** the app now follows the CA's Customer Master onboarding form: 52 customer fields against the walkthrough's 23.
  - **New:** customer category; GST registered and registration type; export and SEZ; e-invoice; TCS confirmed; GST treatment, TCS section and rate; payment terms; security deposit; collection owner; shipping address; section E (6 fields); section F (4 fields).
  - **B1:** any number of extra GSTINs, each with an optional branch address, and the default billing GSTIN.
- **Direction:**
  - `fin.customer_request` gets the new typed fields, plus a child table (or jsonb) for the B1 rows.
  - At activation, each B1 row with an address becomes a P&C location and a `fin.customer_branch` row. This replaces schema open point 5 ("the form carries one branch").
  - The Debtor Category Master fills `fin.debtor_category`, with its ledger, GST, TCS and credit-period columns.
  - The walkthrough's field count and gates follow: the B1 PAN match, the listed-twice check, and the billing-GSTIN address.
- **Touches done work:** yes, T12's schema (more columns and one child table) and the walkthrough's text. Nothing else.
- **Evidence:** `app/sales/src/onboarding/rules.ts` (the field list), `screenSpec.ts` (form row → field, 54 rows).

### G12 · The sales invoice's receivable codes don't match the CA's chart
- **Problem:** `app/sales/src/sales/catalogue.ts` maps the headers to codes the CA's chart (Swasthik, Indian GAAP sheet) gives to other ledgers:
  - Export & SEZ → 107030, which is Trade Receivables – Government in the chart;
  - Related Parties → 107050, which is Trade Receivables – SEZ;
  - Other → 107140, which is Provision for Doubtful Debts, a contra-asset.
  - Only Domestic (107010) is right.
- **Direction:** once T24 is built, its posting reads `debtor_account.control_ledger_code`, which comes from `debtor_category.ledger_account_code`, so no header-to-code map is left in the UI.
- **Evidence:** `1. Global_Chart_of_Accounts_Updated_1.xls`, sheet 4, rows 55–68.

## Adding a gap

Add one summary row and one section: the problem, the kind and home (placed with the README's table), who raised it and when, whether it touches done work, the direction (marked as a proposal), and the evidence (file and table or line).
