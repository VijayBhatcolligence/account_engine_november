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
| G1 | More than one book per company | New task | S1 Set up the books | Team, 3-Nov | No (`fin.book` was removed in T12 rev 3) | open · **part covered (rev 16, S1 part 1):** `fin.book` exists, one primary book per company; a secondary book is still open |
| G2 | Books-from date vs go-live date | New task | S1 (+ opening-balance migration) | Team, 3-Nov | No (`fin.book` was removed in T12 rev 3) | open |
| G3 | Inventory settings · rev 15 (20-Nov): **for the CA:** (1) the default costing method, FIFO or weighted average (LIFO is not allowed, Ind AS 2); (2) the real lot costs (the demo's are illustrative); (3) the Cost of Goods Sold ledger (the CA's key says "COGS"; 501040 proposed, the chart has 501030 Change in Inventory); (4) perpetual for a normal sale (the CA's A1 posts no cost line) | New task | S4 Inventory setup; used by T8, T9, T11, T20, T24 (R13) | Team, 3-Nov · Vijay, 20-Nov | No | open · T24 offers FIFO / weighted average as a demo setting meanwhile · **home built (rev 16):** `fin.book_setting` holds `inventory_mode` and `costing_method`, dated; the VALUES are still the CA's |
| G4 | Accounting framework (Ind AS / AS) | New task | S1; policies: the accounting lead | Team, 3-Nov | No | open |
| G5 | Customer groups (e.g. Tata Group) | Other owner | Business Core | Team, 4-Nov | No | open |
| G6 | A control account per debtor category | In a task | **T12** (+ S2 for the accounts) | Team, 4-Nov | **Yes:** T12 | open |
| G7 | Our company's own branches | New task | S3; used by T24 and the journal | Swasthik, 15-Oct | No | **partly covered** (16-Nov): Manoj built `fin.branch` (KA-01, TN-01); T24 rev 2 issues from it, series in `fin.document_series`. S3 owns the rest |
| G8 | GSTIN ↔ place of business in Business Core | Other owner | Business Core | Swasthik, 15-Oct | Yes, small: `fin.customer_branch` | open |
| G9 | Credit Controller and Compliance Officer approvals at onboarding | In a task | **T12** | Walkthrough, 3-Nov | **Yes:** T12 | **reopened 6-Nov:** rev 3/4 have three parts (as the app); Manoj's merged ER has the Accounts Manager alone. Agree with Manoj |
| G10 | GST portal check of the GSTIN | In a task | **T12** | Walkthrough, 3-Nov | **Yes:** T12 | open |
| G11 | The schema and walkthrough lag the CA's form (UI rev 3) | In a task | **T12** | Vijay, 5-Nov | **Yes:** T12 | schema covered (rev 3) · the Customer Backend Walkthrough is still open |
| G12 | The sales invoice's receivable codes don't match the CA's chart | In a task | **T24** | Found 5-Nov (schema rev 3) | **Yes:** the T24 UI | **covered** (T24 rev 2, built: the customer line posts to `debtor_account.ledger_account_code`) |
| G13 | One rule for both sides, to agree with Manoj: a GSTIN with no address, column names, paper form fields, blocked columns, `legacy` | In a task | **T12** + T7 (vendor) | Merged ER review, 6-Nov | **Yes:** T12 names | open |
| G14 | `fin.outbox`: kept by us (the event is the only link), removed in the merged ER | Other owner | The team lead | Merged ER review, 6-Nov | No | open · **16-Nov:** the built engine has no outbox (approval posts directly); T24 rev 2 follows it; adding the outbox later is additive |
| G15 | The customer's bank account: verified before the first refund; who owns the table (Manoj's Q1) | In a task | **T12** (+ whoever pays refunds: not on this card) | Vijay, 6-Nov | No (added in rev 4) | open |
| G16 | P&C seeds and one rule: `IN_UDYAM`; the contact's name when the form gives no contact person (placeholder: the customer name) | Other owner | Business Core | Rev 4, 6-Nov | No | open |
| G17 | Our AATO as a dated company setting: e-invoice (> ₹5 cr), IRP 30-day limit (≥ ₹10 cr), HSN digits | New task | S1 | T24 design, 6-Nov | No | open |
| G18 | The CA's ledgers the invoice needs: Output CGST / SGST / IGST (the chart has one 206010), round off, TCS payable (with it, the invoice's tcs_amount column: removed in rev 10 until the rate is confirmed), an inter-state sales split, the SEZ sales ledger | Other owner | The CA | T24 design, 6-Nov | No | open |
| G19 | The LUT is ours (per GSTIN, per FY, Rule 96A); the customer form keeps a copy | In a task | T12 + S3 | T24 design, 6-Nov | Yes, small: T12 | open |
| G20 | The tax master (HSN → GST rate by date, rates from 22-9-2025) and who overrides a rate | Other owner | Compliance Officer | T24 design, 6-Nov | No | open |
| G21 | A voucher the AE fills himself (Vijay, 6-Nov) vs "no orphan document" (scope): a goods line still picks its challan line | In a task | **T24** | T24 design, 6-Nov | No | open · confirm with Vijay |
| G22 | Owners of the company switches: DC on/off, integrated mode, inventory method, billing combined | Other owner | The team lead | T24 design, 6-Nov | No | open |
| G23 | The IRN offline fallback (challans released during a portal outage, B4-05) | In a task | T24 + Compliance | T24 design, 6-Nov | No | open |
| G24 | An IRP refusal for buyer data after the number is issued (the buyer copy is not renewed) | In a task | **T24** | Earlier method (case_engine G15) | No | **covered** (T24 rev 2): stage issued, number kept, nothing posted, `fin.e_invoice` attempts and error, RetryEInvoice |
| G25 | The exchange rate on an export invoice: which rate and which date | Other owner | The CA | T24 design, 6-Nov | No | open |
| G26 | Services: the notional challan and their 30-day ageing on the unbilled list | In a task | **T24** | Earlier method (case_engine G6) | No | open |
| G27 | Month-level period close (soft / hard): the books core closes whole years only | New task | S1 (books and periods) | T24 rev 2, 16-Nov | No | open |
| G28 | One chart: Manoj's placeholder codes clash with the CA's; all 16 debtor categories seeded on 107010 | Other owner | Manoj + the CA | T24 rev 2, 16-Nov | No | open |
| G29 | Receipts and bill-wise allocation (receipt or advance → invoice) | New task | Not on this card (treasury / collections): ask | T24 rev 2, 16-Nov | No | open |
| G30 | **The Stores delivery challan task:** recording the challan, its release, the stock movement and its cost entry (perpetual: Dr 501030 · Cr 106020, rule GOODS_ISSUE), with its own UI, schema ownership, posting rule and proof. T24 holds no challan table (rev 8 removed the stubs): G30 designs its own; the invoice is independent (rev 5) | New task | Stores (Vijay, 18-Nov: built separately, after T24) | T24 rev 2, 16-Nov · rev 4, rev 5, 18-Nov | No | open · **re-scoped 20-Nov (rev 15):** the cost of goods sold is now posted by the invoice (T24, R13: Dr 501040 · Cr 106020 from the lots). G30 keeps the physical challan (goods on approval, job work, transfers: the CA's D1, D3) |
| G31 | Screen field G5 "sent to the customer": no record yet (the send is not built) | In a task | **T24** (a later revision) | T24 rev 2 check 1, 16-Nov | No | open |
| G32 | E-commerce sale (the CA's D5): the debtor is the marketplace, the bill-to is the consumer; settlement with TCS, TDS and commission | New task | Ask (marketplace sales; settlement is receipts, G29) | T24 rev 3, 16-Nov | No | open |
| G33 | The monthly release of deferred revenue (the CA's B6: Dr Contract Liability · Cr Revenue each month) | New task | Period end (a scheduled event): ask | T24 rev 3, 16-Nov | No | open |
| G35 | T12's billing instruction "PO number on every invoice" (the CA's customer form) is no longer checked on the invoice: none of the CA's 43 invoices prints a customer PO, so T24 rev 5 removed it. Today the PO can be typed as the buyer's order reference (optional). Should the invoice require it for those customers, and print it? | Other owner | The CA | T24 rev 5, 18-Nov | No | open |
| G36 | The AE may pick another receivable ledger for the customer line (Vijay, 18-Nov: every ledger is a suggestion). Manoj's built journal refuses that: its commit check `ACCOUNT_NOT_ON_ITS_LEDGER` posts a customer line only to the account's own `ledger_account_code` (the subledger ties to the ledger). To agree: allow it (and keep the tie by the line's ledger), or keep his rule and offer only the account's ledger | Other owner | Manoj (team lead decides) | T24 rev 5, 18-Nov | No | open |
| G34 | Questions for the CA from his specimens: the proposed ledgers; separate revenue ledgers (B2C, deemed, merchant, export services, SEZ); round off absorbed into revenue (B4) or to Round Off; whose task are a high sea sale (C9) and a fixed-asset sale (A10) | Other owner | The CA | T24 rev 3, 16-Nov | No | open |

**Counts:** 38 gaps (G38 closed, rev 14) · in a task 13 (T12: 6, T24: 6, T12 + S3: 1) · new task 11 · other owner 14 · covered 2 (G12, G24) · partly covered 1 (G7). Rev 12 (18-Nov): G31 moves to Billing; G37 added. G32–G34: `task_list/T24_sales_voucher_entry.md` §14. Details of G17–G26: `task_list/T24_sales_voucher_entry.md` §10; G27–G31: §13.7.

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

### G13 · One rule for both sides (to agree with Manoj)
- **Found:** 6-Nov, comparing our customer side with Manoj's merged vendor + customer ER.
- **Differences (decisions, not faults):** a GSTIN with no address (we write no place until the address comes; his vendor side writes one) · names (`created_by_contact_id` / `constitution_code` here, `created_by` / `legal_form_code` there) · paper form fields (ours only) · `posting_blocked` / `sales_blocked` and `legacy` (kept by us, removed there).
- **Direction:** agree one rule each, then both schemas follow. Nothing changed until agreed.

### G14 · The outbox
- **Problem:** the merged ER removes `fin.outbox` on both sides. Our engine model (CLAUDE.md §3) makes the event the only link to the engine. Opening an account posts nothing, so nothing breaks today; but the engine has no record that the account exists.
- **Owner:** the team lead decides.

### G15 · The customer's bank account
- **Added in rev 4 (Vijay, 6-Nov), optional, not on the CA form:** Manoj's shared `fin.party_bank_account` (one row per party) + `debtor_account.refund_bank_account_id`.
- **Open:** verification (penny-drop) before the first refund is paid; refunds are paid outside this card (ask who). The table's owner: Finance for now; Manoj's Q1 (P&C keeps bank accounts out of its model).

### G16 · P&C seeds and one rule
- **Seeds:** `IN_UDYAM` (with the standing types and capacities already listed in the schema).
- **Rule:** `pc.contact.display_name` is required, but the CA form's Contact Person is optional. Placeholder: the customer name. Confirm with P&C.

## Adding a gap

Add one summary row and one section: the problem, the kind and home (placed with the README's table), who raised it and when, whether it touches done work, the direction (marked as a proposal), and the evidence (file and table or line).

### G27 · Month-level period close
- **Problem:** the app closes months (Sep soft, earlier hard: K7, K8); the books core built by Manoj has `fin.fiscal_year.is_closed` only.
- **Home:** S1 (books and periods). T24 keeps the month check as a gate on a placeholder setting.

### G28 · One chart of accounts
- **Found 16-Nov** (T24 rev 2, reading the CA's chart against the engine seed). His placeholder codes mean other things in the CA's chart (Indian GAAP sheet):
  - 2010nn → 201010 is Term Loans (the CA's payables are 205010–205180);
  - 103010 / 103020 → Goodwill / Software (the CA's stock is 106010–106030);
  - 108010–108030 → Cash, Bank (the CA's GST input is 109030);
  - 203010 → Provision for Gratuity;
  - 501010–501030 → Raw Material Consumed, Purchase – Traded Goods, Change in Inventory.
- **Also:** all 16 debtor categories are seeded on 107010 ("until the workbook arrives"), but the CA's chart has 107010–107130 (rows 54–66).
- **Direction:** one chart, the CA's. Agree with Manoj; nothing of his is changed by us.

### G29 · Receipts and bill-wise allocation
- **Problem:** the open item is the invoice and its journal line (Manoj's subledger view); applying a receipt or an advance (T13) to an invoice needs an allocation record. No task on this card raises receipts.

### G30 · The challan and the order are stubs
- **Problem:** `sales.delivery_challan`, `_line` hold only what the invoice reads (the order's number, date and rate ride on them). The Sales / Stores slice owns them.

### G31 · "Sent to the customer" (G5)
- **Problem:** release check 1 found the one screen field with no column. The send is not built. Home: a later T24 revision (a delivery log on the invoice).

### Rev 12 (18-Nov): the AE books the voucher; the invoice is Billing's

| Gap | What | Kind | Home | Found | Blocks | Status |
|---|---|---|---|---|---|---|
| G37 | **Billing's invoice task and its handover event.** The invoice (number series, IRN, e-way bill, lines, LUT) is raised by Billing, not by the AE. T24 needs its event `sales.invoice.issued` to carry: invoice no., date, branch, customer account, taxable, CGST, SGST, IGST, total, the kind of each line (goods / service / charge / reimbursement / exempt / period) and the settlement (credit / paid now). The 29-Oct card combined Billing with this role; Vijay's 18-Nov decision splits them | Other owner | Billing (Sales) · the event schema with the team lead | T24 rev 12, 18-Nov | No (the app mocks the handover) | open |

G31 ("sent to the customer") is now Billing's: the AE never sends the invoice.

### Rev 13 (18-Nov): one voucher design

| Gap | What | Kind | Home | Found | Blocks | Status |
|---|---|---|---|---|---|---|
| G38 | **One voucher design for every type** (Vijay, 18-Nov): `fin.voucher` / `voucher_line` / `voucher_history` (+ `voucher_gst`). Manoj's built `fin.purchase_invoice` / `_line` / `_history` would become voucher_type `purchase` (+ `voucher_gst`); `journal_entry.source_document_id` then gets a real foreign key to `fin.voucher`. Until agreed both stand; nothing of his is changed | Other owner (to agree) | Manoj · the team lead | T24 rev 13, 18-Nov | No | **closed 18-Nov (rev 14):** Vijay chose Manoj's model; T24 is `fin.sales_invoice` / `_line` / `_history`, his tables on the customer side |

### Rev 16 (23-Nov): S1 part 1, the book and its dated settings

| Gap | What | Kind | Home | Found | Blocks | Status |
|---|---|---|---|---|---|---|
| G39 | `fin.journal_entry.book_id`: Manoj's journal keys an entry to the company only; a second book (Ind AS + IFRS) needs the book on the entry. Proposal: nullable, default the company's primary book | Other owner | Manoj (books core) | S1 part 1, 23-Nov | Yes: his journal (not changed until agreed) | open · to agree |
| G40 | Periodic inventory: the voucher posts no cost (rev 16), so the month's cost of goods sold must be posted by T11; and the app has a FIFO / WAM switch but no perpetual / periodic switch (a UI change: only on Vijay's ask) | In a task (T11) + app | T11 · T24 app | S1 part 1, 23-Nov | No | open |

### 24-Nov: the engine's shape (Vijay: event-driven intake, industry approach)

| Gap | What | Kind | Home | Found | Blocks | Status |
|---|---|---|---|---|---|---|
| G41 | **Event intake and traceability:** one general `fin.accounting_event` table (every slice's events, once; outcome posted / ignored / exception) + an `fin.event_type` catalogue (a new event = a row, never a table); `journal_entry` + `event_id`, `rule_version` (CLAUDE.md §3: "why was this posted?") · **rev 17: the rule half is built** on `journal_line` (rule, version, case, role, mapping row); `event_id` remains. Industry: Oracle XLA_EVENTS, CloudEvents. Shown as PROPOSED cards on the ER page's block view | Other owner | The accounting engine core: Manoj + the team lead (with G14, the outbox) | ER block view, 24-Nov | Yes: his journal (not changed until agreed) | open · to agree |
| G43 | **The app still maps roles to ledgers in code** (`catalogue.ts` LEDGERS, `engine.ts` caseOf). Rev 17 put the mapping in `fin.account_determination` (19 seed rows = the app's ledgers, proved 19 / 19). To do: `postingFor` outputs roles; the ledgers come from the seed rows; the casebook runs against the seeded mapping; a mapping screen (maker + checker) | App (only on Vijay's ask) | T24 app · S1 part 2 | Rev 17, 24-Nov | Yes: the app (fixed until asked) | open |
| G44 | **Manoj's side on the same model:** his purchase rules use `ITEM_LEDGER` (code) and "the first ledger of an account_type"; `journal_line` now has 7 nullable trace columns. To agree: his rule register (PURCHASE_INVOICE v1), roles (vendor, input_cgst …) and mapping rows; `PostJournalEntry` copies the trace | Other owner | Manoj (with G41) | Rev 17, 24-Nov | Yes: his journal_line (additive, nullable) | open · to agree |
| G45 | **The mapping's day-one values are the app's, not yet the CA's:** e.g. a separate Sales Returns ledger for T25, an inter-state sales ledger (401011), SEZ sales (401030?), COGS (501040 vs 501030). Each is a mapping row, not code | Other owner | The CA (with G18) | Rev 17, 24-Nov | No | open |
| G42 | **Sales documents as one family:** `fin.sales_invoice` + `document_type` (invoice · credit_note · debit_note) + `original_document_id`, as Oracle AR (RA_CUSTOMER_TRX) and SAP billing (VBRK); T25 / T26 then add no tables. Differs from one table set per type (Manoj's purchase side); the name would mean "sales document" | In a task (T25, T26) + other owner | T25 / T26, agreed with Manoj | ER block view, 24-Nov | Yes: T24's tables (additive) | open · to agree before T25 |
