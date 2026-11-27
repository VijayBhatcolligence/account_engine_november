# Upload an invoice: from a document to an entry

> **WITHDRAWN 27-Nov-2026 (REC, Vijay):** the invoice reader, the upload and the engine's proposed entry are removed from the app ("no parsing, no rule here: the accountant types the entry, like Tally"). Everything below describes the app up to rev 21; the code is on the local branch `archive/ae-engine-rev21`.

The app reads an invoice (PDF, scan or photo), checks it against our masters, proposes its accounting entry with the engine's own rules, and books it through the normal approval.

## Inputs

| Date | Who | What | Effect |
|---|---|---|---|
| 25-Nov-2026 | Vijay | "I upload a random invoice; Python parses it; it maps to ledgers by our rules; a ledger that is not there is proposed, named proposed; a customer not registered shows red, and I choose: register first, or create and post; measure how much it gets right" | The feature |
| 25-Nov-2026 | Vijay | "Forget Manoj's things; modify app/sales; the DB follows the same schema" | No schema change (rev 18 stays) |
| 25-Nov-2026 | Vijay | "A random invoice from Google; the format won't change that much" | A label-based reader, tested on 5 common layouts + the CA's 43 specimens |
| 26-Nov-2026 | Vijay | "The parsed values should fill the screen, editable, with warnings (new customer, ledger does not exist); the AE checks and modifies; not a separate screen" | App rev 20: the upload opens the voucher itself (§2a) |
| 26-Nov-2026 | Vijay | "Production grade; the DB stays as it is. Customer not there → the create-customer screen, no draft left. The Dashboard task opens the form already filled from the event; the accountant fills what is missing; manual creation is different. Seed the default ledgers. Invoice, credit note, debit note, customer: end to end" | App rev 21: §3 rewritten, §3a notes, the shortcut removed, ledgers seeded |

## 1. The flow

```
 the file (PDF · scan · phone photo)
   │
   ▼  1 READ      Python reader (app/sales/parser/extract.py): number, date, both GSTINs (checksum), place of supply,
   │              the item table (HSN, qty, rate, taxable, GST %), the totals; an e-invoice's signed QR when there is one
   ▼  2 CHECK     against our masters: is the seller us? is the customer registered? are the items ours? do the totals agree?
   │              red = cannot post as it is · amber = check · green = matched
   ▼  3 PROPOSE   the engine's rule SALES_INVOICE v1: lines by role → each ledger from the mapping (rev 17)
   │              (the same rules as Billing's invoices; nothing special for uploads)
   ▼  4 BOOK      a sales voucher → Submit → Rajan approves → posted to the journal
```

The upload itself posts nothing. Only the approved voucher posts, as for every invoice.

## 2a. One screen (app rev 20)

```
 Upload an invoice (a small dialog: drop a file, or a sample) → read → the VOUCHER opens at once, prefilled
 ┌──────────────────┬─────────────────────────────────────────────┬──────────────────────┐
 │ the file (PDF or │ Read from the invoice: every value editable │ Checks (K1 …)        │
 │ photo), beside   │   ● confidence per value · "n corrected"    │ What Submit sends    │
 │ the values       │   customer account: matched / pick one /    │ Submit to Rajan      │
 │ (hide / open)    │   not registered (red: register · create)   │ Save draft           │
 │                  │   item lines: edit · add · remove           │ Set the upload aside │
 │                  │ Warnings: red to fix · amber to check       │                      │
 │                  │ The entry: every ledger editable; type a    │                      │
 │                  │   name not in the chart → proposed (new)    │                      │
 └──────────────────┴─────────────────────────────────────────────┴──────────────────────┘
```

| The AE does | What happens | Business answer | Engineer answer |
|---|---|---|---|
| Corrects a value (number, date, GSTIN, a line) | The voucher is rebuilt from the corrected reading; the ledgers the AE chose stay, their amounts follow | The paper wins; the reader only helps | `correctUpload` → `reviewOf` → `voucherLinesOf`; `v.upload.corrections` + `demo.upload.corrections` (a value typed back to the read one is no correction) |
| Picks the customer account | That account is used, kept through later corrections; "Automatic" goes back to the match | The AE knows the customer when the paper's name differs | `pickCustomerFor`; `upload.customerPicked`; history line "picked by hand" |
| Customer not registered | Red box beside the customer: "Create the customer (T12) →" (the form filled from the document, §3) · or pick an account. The entry shows as a preview; Submit is replaced by "Create the customer" (K1) | Nothing posts to an unknown customer | `pendingCustomer`; K1 `DEBTOR_ACCOUNT_NOT_FOUND` |
| Types a ledger name that is not in the chart | "Propose a new ledger" on a revenue line → code 4011xx, marked proposed; amber warning "does not exist in the chart yet" | A new ledger is the CA's to confirm (S2) | `proposeLedgerFor(id, name, lineId)`; `fin.ledger_account` "(proposed in the app)"; the line keeps `determined_ledger_code` + `override_reason` |
| The number was not read | The voucher still opens; red "not read: type it"; Submit stopped until typed | — | `missing` → `MISSING_REQUIRED_DETAILS` |

## 2. Every automatic value, answered twice

| Value | Business answer (CA) | Engineer answer |
|---|---|---|
| Invoice number, date | Read from the labels "Invoice No.", "Dated", "Bill No" … | `extract.py`: label → nearest value; the date in any common format |
| Seller is us? Which branch | Our GSTINs are KA-01 (29…A1ZQ) and TN-01 (33…A1Z1). Another seller: amber; the demo books it as our sale from our branch in the seller's state, else KA-01 | `intake.ts branchByGstin`; flag `SELLER_NOT_OURS` |
| Customer | Found by GSTIN, then PAN, then name. Not found: **red**, nothing posts; the customer is created through T12 (§3) | `matchCustomer` → `debtor_account`; flag `CUSTOMER_NOT_REGISTERED`; check K1 stops Submit |
| Place of supply | As printed ("Place of Supply: Karnataka (29)"); else the buyer's GSTIN state | `place_of_supply.state_code` ?? `buyer.state_code` |
| Tax split | **Our** branch's state vs the place of supply. Same state: CGST + SGST; else IGST. If that differs from the paper (seller and buyer in Maharashtra, booked from Karnataka), amber: same rate and total, only the split changes | `reviewOf`: `retaxed()`; flag `TAX_SPLIT_FROM_OUR_BRANCH` |
| Goods or service, per line | HSN starting 99 (SAC) = service; "freight", "reimbursement" words; else goods | `lineKindOf` |
| Sales ledger | By the mapping: goods → Sale of Products 401010; services → Sale of Services 401020; freight charged → 401070 | `postingFor` (roles) → `fin.account_determination` |
| Proposed product ledger | Goods not in our item master may go to a new "Sale of <goods>" ledger (by HSN chapter, e.g. 94 → Furniture). Optional, one click; shown as **proposed (new)** | `productLedgerName`; code 4011xx; `fin.ledger_account` "(proposed in the app)"; the line keeps `determined_ledger_code` 401010 + `override_reason` |
| Output GST ledgers | 206011 CGST · 206012 SGST · 206013 IGST: seeded by default (Vijay, 26-Nov; the CA may renumber, G18) | the mapping; `LEDGERS[k].seeded` |
| Paid at once? | "Paid by UPI / card / cash" on the invoice → Dr UPI / card clearing or Cash, not the customer | `hints.paid` → settlement (R8) |
| Revenue in advance | "Subscription", "in advance", or a date range "10-Nov-2026 to 09-Nov-2027" → Contract liability, not revenue | `PERIOD` → deferred (the CA's B6) |
| Round off | As printed; else the paise between the lines and the total | `round_off` |
| Same invoice twice | The same file: the first reading comes back. The same number: refused | sha256 in `demo.upload`; the number in the vouchers |
| Posting date | The invoice's date when its month is open; else today's date, with the printed date kept (see G55) | `periodOf(docDate)` · `invoice_date` vs `posting_date` |

## 3. Customer not registered: Create a customer (T12), automatic (rev 21)

No shortcut: a customer is created only through T12 and its approvals. No draft is left behind without a customer.

```
 upload → the voucher (red: customer not registered) → the AE checks the values
   → "Create the customer (T12) →"        or, on close, "Create the customer later"
   → the T12 form, OPENED AND FILLED BY THE EVENT (sales.invoice.uploaded), the invoice beside it
        fields from the invoice: tagged "from the invoice" (name, GSTIN, PAN, state, address, city, PIN …)
        what an invoice never shows: flagged missing (categories, contact, credit terms, TCS …) → the accountant fills them
   → submit → Rajan · Farid · Venkat approve → the customer is active
   → the invoice comes back to "To book" by itself (a notice: "Ready to book") → submit → Rajan → posted
 meanwhile the invoice waits OUTSIDE the voucher list (Sales: "Waiting for a customer"; Dashboard tile)
```

| | Automatic (an event) | Manual |
|---|---|---|
| How it starts | An uploaded document names a customer we do not have | Sales hands over a paper form; the AE presses "New customer from a paper form" |
| The form | Filled from the document; the filled fields tagged; the rest flagged | Blank; typed from the paper |
| Dashboard | "Create customer · <name>" · *Automatic · filled from <invoice>* | "New customer · <name>" · *Manual · paper form <no>* |
| Stored | `customer_request.paper_form_number` "UPL <no>", `remarks` "Opened automatically by sales.invoice.uploaded …" | the paper form number |

| Value | Business answer | Engineer answer |
|---|---|---|
| Which fields the event fills | Only what the invoice says: who the customer is and where. The categories (they decide the receivable ledger), contact and credit terms are the accountant's decision | `holdForCustomer` → `createRequest` + `setValue`; `request.source.filled` |
| When the invoice comes back | The moment its customer is active, on any screen | a store subscription on the accounts → `linkPendingCustomers` (by the T12 request's account, else GSTIN) |
| The form discarded | The invoice keeps waiting; "Create the customer again" or discard it | `held` keeps it; `holdForCustomer` opens a fresh request |

## 3a. Credit and debit notes, uploaded (rev 21)

| Value | Business answer | Engineer answer |
|---|---|---|
| A note, not an invoice | "Credit note" / "Debit note" printed at the top; the AE can change the document kind | `doc_type` → `docKindOf` |
| Its own number | "Credit Note#", "Document no.", "Debit Note No." — never the invoice number it names | `extract.py number_of(note=True)` |
| The invoice it corrects | "Against invoice …", "Original invoice no.", or Zoho's "Invoice#": matched to a **posted** invoice of the same customer; else red, the AE picks it | `against_of` / `invoice_ref_of` → `againstFor`; check N1 |
| Why | The printed reason and the lines: return · scheme discount · price correction · goodwill (credit); price increase · extra charge (debit); editable | `noteFactsOf` (+ `reason`) → `noteReason`; N3 needs the scheme reference |
| A return | Stores receives the goods back first (C-17); the note waits for the receipt. Goods not in our item master have no batch: **a return of them cannot post** (G56): pick the reason that fits | N2; the schema's `sales_invoice_return_needs_receipt` |
| GST time limit | 30 November after the invoice's year, counted from the dates **printed** on both documents | N4 on `docDate` |

## 4. Measured (npm run eval:invoices, 25-Nov-2026)

| What | Result |
|---|---|
| Read: the CA's 43 specimens (number, tax by head, total) | **43 / 43** |
| Read: 7 sample layouts (Tally style, Zoho style, a services bill, a shop bill, a phone photo by OCR, a Zoho credit note, a Tally debit note) on 11–13 fields | **7 / 7** all fields |
| Entry: the 28 specimens that are a sales invoice or a note (T24–T26), read → facts → entry, vs the CA's answer key line by line | **28 / 28** exactly the CA's |

**Read this honestly:**
- The 5 sample layouts were **made by us** to look like common Indian invoices (fictional names, valid-checksum GSTINs). They are not downloads.
- A real invoice from the web may still miss a field. Every value can be corrected on the screen, and each correction is kept (`demo.upload.corrections`) so we learn where the reader fails.
- Not tested: multi-page item tables, handwritten bills, non-English invoices. A photo takes about 10–20 seconds (OCR).

## 5. Where it is stored

| What | Table |
|---|---|
| The file, what was read, the corrections, the voucher it became | `demo.upload` (the app's own schema, not the engine's) |
| The voucher, its lines by role, the rule and mapping row | `fin.sales_invoice` (`invoice_date` = printed, `posting_date` = booked), `fin.sales_invoice_line` |
| The entry | `fin.journal_entry`, `fin.journal_line` (+ `determined_ledger_code`, `override_reason` for a proposed ledger) |
| A proposed ledger | `fin.ledger_account` "… (proposed in the app)" |

## 6. The six questions (CLAUDE.md §6)

| | |
|---|---|
| 1. Slice | Sales (the AE books it). Upload is a second way the invoice reaches the AE, beside Billing's handover |
| 2. Event | `sales.invoice.uploaded` (logged) → the voucher submitted → approved → posted |
| 3. Recognised? | Only when posted. The upload and the reading post nothing |
| 4. Rule | `SALES_INVOICE` v1, its case by the facts (R1 goods local, R2 inter-state, R3 services, R8 paid at once …) |
| 5. Entry | Dr the customer (or UPI / cash) · Cr Sales by role · Cr Output GST by head · ± Round off |
| 6. Exception | Customer not registered (red, K1) · totals differ (amber) · seller not ours (amber) · cess / TCS not in the rules (flagged, G18) |

## 7. Limits (to know before a demo)

- **Another company's invoice is a purchase in real life.** The demo books it as our sale to show the engine (G54).
- **A return of goods not in our item master cannot post** (G56): Stores has no batch to receive them (C-17, the schema). Our own goods return normally.
- **Goods not in our item master** post no cost of goods sold: there is no stock record (T8).
- **Cess and TCS** are flagged, not posted (G18).
- A voucher waiting for its customer shows GST ₹0 until the customer is known; its tax appears once linked.

## 8. Run it

```
npm run parser:setup      (once: Python environment for the reader)
npm run db:start          (the local PostgreSQL)
npm run dev               → http://localhost:5174 → Tasks → Sales → "Upload an invoice"
npm run eval:invoices     (the measurement above)
npm test                  (upload.test.ts: 22 tests, real reader output: T12 from the event, held and back, notes against the invoice, a return with Stores' receipt)
```
