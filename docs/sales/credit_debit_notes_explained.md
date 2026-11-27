# Credit note (T25) and debit note (T26): start to end, in the app and in the database

> **Changed 27-Nov-2026 (REC):** the notes' posting rules (SALES_CREDIT_NOTE / SALES_DEBIT_NOTE v1) are removed: the AE TYPES the note's entry (the shapes below stay the CA's answer: E1–E4); the note's checks (N1–N4, a return waits for Stores' receipt, C-17) and the calculated amounts stay.

Schema rev 18 · 25-Nov-2026 · the scenario's own numbers (B4-06, B4-08, D-05). The database tables are in
`docs/sales/sales_engine/customer_onboarding_schema.dbml`, drawn on the ER page (task step 6).

---

## 1. The idea in one picture

```
  Customer complains ──▶ Nisha (Sales Manager) approves the adjustment
                                   │
              (a return only)      ▼
  Stores takes the goods back ──▶ Billing ISSUES the note against a posted invoice   ← a handoff, like the invoice
  (return receipt, D-05)                   │
                                           ▼
                         Teja (AE) BOOKS its entry ── the rule suggests every line (automatic)
                                           │          Teja may pick another ledger (manual, with a reason)
                                           ▼
                         Rajan (Accounts Manager) approves ──▶ it POSTS to the journal
```

| | Credit note | Debit note |
|---|---|---|
| Says | "You owe us **less**" | "You owe us **more**" |
| Customer line | **Cr** customer | **Dr** customer |
| Number series | KA/CN/2627/0001 … | KA/DN/2627/0001 … |
| Rule (code) | SALES_CREDIT_NOTE v1 | SALES_DEBIT_NOTE v1 |

**One table for all three documents.** An invoice, a credit note and a debit note are all rows of `fin.sales_invoice`.
The column `document_type` tells them apart, and `against_sales_invoice_id` points a note to its invoice.
No new voucher tables were needed.

---

## 2. The tables involved and how they connect

```
                         fin.sales_invoice  (one row per document)
          ┌───────────────────────────────────────────────────────────────┐
          │ SV-0012  document_type = invoice      KA/INV/2627/0143  posted │◀────────────┐
          │ SV-0015  document_type = credit_note  KA/CN/2627/0001          │ against_    │
          │          against_sales_invoice_id ────────────────────────────────────────────┘ sales_invoice_id
          │          note_reason = return,  stock_return_id ─────┐         │
          └───────┬───────────────────────────┬──────────────────│─────────┘
                  │ 1 : many                   │ journal_entry_id │
                  ▼                            ▼                  ▼
       fin.sales_invoice_line        fin.journal_entry       inv.stock_return  (Stores' return receipt)
       (the PROPOSED lines,          (the POSTED entry)      SRR-0001: 40 FG-101 from batch G-2608
        by role, before approval)          │ 1 : many         from_stock_lot_id ─▶ inv.stock_lot (G-2608, KA-FG)
                  │                        ▼                  to_stock_lot_id ───▶ inv.stock_lot (G-2608, KA-QC)
                  │   copied 1:1 at ─▶ fin.journal_line       journal_entry_id ──▶ the "Stock back" entry
                  │   approval             │
                  └────────────┬───────────┘
                               │ each line names:
                               ▼
       rule_code + rule_version + rule_case ──▶ fin.posting_rule / _case  (which code wrote it)
       line_role_code                       ──▶ fin.line_role             (what the line is for)
       account_determination_id            ──▶ fin.account_determination (which mapping row chose the ledger)
       debtor_account_id                    ──▶ fin.debtor_account        (the customer, on the customer line)
```

| Table | What it holds for a note | Who writes it |
|---|---|---|
| `fin.sales_invoice` | The note itself: its number, date, customer, the invoice it corrects, the reason, its stage | The AE's Submit, Rajan's decision |
| `fin.sales_invoice_line` | The lines the rule proposed (and the AE's choices), before approval | Submit (replaced whole each time) |
| `fin.sales_invoice_history` | One row per step: submit, decide | Submit, decide |
| `fin.journal_entry` / `fin.journal_line` | The posted entry: the books | Rajan's approval (copied from the proposal) |
| `inv.stock_return` | Stores' return receipt: what came back, from which batch, at what cost | Stores (D-05) |
| `inv.stock_lot` | Where the returned goods are now (a new lot in KA-QC if damaged) | Stores (D-05) |
| `fin.account_determination` | The ledger mapping: role → ledger (Sales Returns, Discount Allowed …) | Setup (maker + checker) |
| `fin.book_setting` | `return_stock_posting`: who posts the stock back | Setup |

---

## 3. Credit note for a return, step by step (scenario B4-06)

**The story:** Sri Lakshmi Distributors bought 600 cartons of Glucose biscuit (FG-101) on invoice KA/INV/2627/0143
(SV-0012, 07-Oct). 40 cartons arrived damaged and come back. Value 40 × ₹700 = ₹28,000, GST 5%.

### Step 0 · The invoice exists and is posted

| In the app | In the database |
|---|---|
| Tasks → Sales → Sri Lakshmi → Submit to Rajan → Rajan approves | `fin.sales_invoice` SV-0012: `document_type` = **invoice**, `stage` = **posted** |
| | Its `fin.journal_line`: Dr Sri Lakshmi ₹7,48,125 · Cr Sales ₹7,12,500 · Cr GST · Dr COGS · Cr Finished Goods (lots G-2604, **G-2608 at ₹560**, C-2607) |

A note can only correct a **posted** invoice: the database refuses anything else (trigger `sales_note_against_invoice`).

### Step 1 · Stores takes the goods back (D-05)

| In the app | In the database |
|---|---|
| **Mock: Stores records a return** → "D-05 · 40 cartons of FG-101, batch G-2608, damaged" | **`inv.stock_return`** (new row) |

| Column | Value | Meaning |
|---|---|---|
| `return_no` | SRR-0001 | Stores' receipt number |
| `against_sales_invoice_id` | → SV-0012 | the invoice the goods were sold on |
| `item_code` · `quantity` | FG-101 · 40 | what came back |
| `from_stock_lot_id` | → lot G-2608 (KA-FG) | the batch they left from |
| `condition` | damaged | damaged → quarantine |
| `to_stock_lot_id` | → a new lot G-2608 in **KA-QC** | where they are now |
| `unit_cost` | ₹560 | the cost they **left** at (from the invoice's cost line), never the selling price |
| `journal_entry_id` | → the Stock back entry (below) | only when the setting says the receipt posts it |

And **`inv.stock_lot`** gets a new row: KA-QC · FG-101 · G-2608 · 40 left · ₹560.

**Who posts the stock back?** The book's setting `return_stock_posting` decides (switch in the app's two mock dialogs):

| Setting | What happens now | What the credit note does later |
|---|---|---|
| **stores_receipt** (default, the CA's E1) | The receipt posts its own entry now: `fin.journal_entry` type **stock_return**: **Dr Finished Goods 106020 ₹22,400 · Cr COGS 501040 ₹22,400** (rule SALES_RETURN_RECEIPT v1 · R1) | Money only |
| **with_credit_note** | Nothing is posted now | Carries the two stock lines itself (rule R5) |

If Stores has not recorded the return yet, the credit note **waits**: the check "Waiting for the return receipt" stops
Submit (scenario C-17). When Stores records it, the note picks it up by itself.

### Step 2 · Billing hands over the credit note

| In the app | In the database |
|---|---|
| **Mock: Billing sends a note** → "B4-06 · Credit note: 40 cartons returned" | Nothing yet (a document becomes a row at **Submit**, as for invoices) |
| The note opens: "credit note KA/CN/2627/0001 against KA/INV/2627/0143 (goods returned)". Tabs: Accounting entry · Credit note from Billing (the printed CREDIT NOTE, naming the invoice) · Why each value · Approval & history | |

The note copies from the invoice: the customer, the branch (GSTIN), the place of supply, the rate. So the GST split
is the **same** as the invoice's (CGST + SGST here).

### Step 3 · The AE books the entry: automatic or manual

**Automatic (the rule suggests, Teja keeps it).** The code writes each line **by role**; the mapping turns each role into a ledger:

| # | Dr / Cr | Role (code decides) | Ledger (mapping decides) | ₹ | Why |
|---|---|---|---|---|---|
| 1 | Dr | `sales_return` | 401090 Sales Returns | 28,000 | the sale undone (rule R1) |
| 2 | Dr | `output_cgst` | 206011 Output CGST | 700 | the invoice's GST given back |
| 3 | Dr | `output_sgst` | 206012 Output SGST | 700 | |
| 4 | Cr | `customer` | 107100 (Sri Lakshmi's own receivable ledger) | 29,400 | the customer owes less |

**Manual (Teja picks another ledger).** Every ledger is a suggestion. Teja may click a line and pick another ledger,
or switch on "Change amounts / add lines" and give a reason. The customer and GST amounts stay locked to the note's amounts.
Rajan sees "Ledgers changed".

How the database tells them apart, on each line:

| Column | Automatic | Manual (Teja picked 401010 instead of 401090) |
|---|---|---|
| `determined_ledger_code` | 401090 (what the mapping gave) | 401090 (what the mapping gave) |
| `ledger_account_code` | 401090 (what posts) | **401010** (what posts) |
| `override_reason` | empty | **required**: "Ledger picked by the AE …" |

The database **refuses** a line whose ledger differs from the mapping's without a reason
(CHECK `sales_invoice_line_override_has_reason`, and the same on `journal_line`).

### Step 4 · Submit (Teja)

| In the app | In the database |
|---|---|
| Checks must be clear: against a posted invoice · the receipt exists · Dr = Cr · the GST time limit (a warning within 60 days of 30-Nov after the invoice's year) | **`fin.sales_invoice`** row SV-0015 |
| "Submit to Rajan" | **`fin.sales_invoice_line`** × 4 (the table above) |
| | **`fin.sales_invoice_history`** (operation submit) |

The `fin.sales_invoice` row for the note:

| Column | Value |
|---|---|
| `internal_ref_no` · `invoice_no` | SV-0015 · KA/CN/2627/0001 |
| **`document_type`** | **credit_note** |
| **`against_sales_invoice_id`** | → SV-0012 (KA/INV/2627/0143) |
| **`note_reason`** | **return** |
| **`stock_return_id`** | → SRR-0001 |
| **`return_stock_posting`** | stores_receipt (stamped from the book's setting) |
| `debtor_account_id` · `branch_id` | Sri Lakshmi · KA-01 (must be the invoice's: the trigger checks) |
| `stage` · `submitted_by_contact_id` | submitted · Teja |

Each line also carries its trace: `rule_code` SALES_CREDIT_NOTE · `rule_version` 1 · `rule_case` R1 · `line_role_code`
sales_return · `account_determination_id` (the Sales Returns mapping row) · `determined_ledger_code` 401090.

### Step 5 · Rajan approves → it posts

| In the app | In the database |
|---|---|
| Approval & history → "Rajan approves" (the maker can never approve: K19) | **`fin.journal_entry`**: type sales, `source_document_id` → SV-0015 |
| | **`fin.journal_line`** × 4: the same lines, copied 1:1 **with the trace** |
| | `fin.sales_invoice` SV-0015: `stage` **posted**, `decided_by_contact_id` Rajan, `journal_entry_id` set |
| | `fin.sales_invoice_history` (operation decide) |

Above ₹1,00,000 a credit note also needs Usha (Finance Controller). A scheme discount also needs Venkat (Compliance).
The app holds every approval; the database keeps the final decider and one history row per step.

### Step 6 · The result

| What | Before | After |
|---|---|---|
| Sri Lakshmi owes | ₹7,48,125 | **₹7,18,725** (−₹29,400) |
| Output GST payable | ₹35,625 | ₹34,225 |
| Finished Goods (stock) | — | +₹22,400 (the 40 cartons back, in KA-QC) |
| Day book (Forms → Books) | | "SRR-0001 · Stock back" and "KA/CN/2627/0001 · Credit note" |

"Why was this posted?" is one query: the journal line → its rule and case (code) → its mapping row (configuration) →
the note → the invoice it corrects → Stores' receipt.

---

## 4. Debit note, step by step (scenario B4-08)

**The story:** Namma Bakes' invoice KA/INV/2627/0141 (₹75,600) left out the freight. Nisha approves; Billing issues a
debit note for late freight: ₹6,000 + GST 5% (the goods' rate) = ₹6,300. No goods move, no receipt needed.

| Step | In the app | In the database |
|---|---|---|
| 1 Billing hands it over | **Mock: Billing sends a note** → "B4-08 · Debit note: late freight" → KA/DN/2627/0001 | nothing yet |
| 2 The AE books it | Entry suggested (automatic), ledgers pickable (manual), as above | |
| 3 Submit | | `fin.sales_invoice`: `document_type` **debit_note**, `against_sales_invoice_id` → KA/INV/2627/0141, `note_reason` **additional_charge** · its 4 lines · history |
| 4 Rajan approves | | `fin.journal_entry` + 4 `fin.journal_line`, stage posted |

The entry: an **extra** entry, not a reversal (the scenario says so).

| # | Dr / Cr | Role | Ledger (mapping) | ₹ | Rule |
|---|---|---|---|---|---|
| 1 | Dr | `customer` | 107010 (Namma Bakes' receivable ledger) | 6,300 | |
| 2 | Cr | `revenue` (a charge line) | 401070 Freight Recovered | 6,000 | SALES_DEBIT_NOTE R2 |
| 3 | Cr | `output_cgst` | 206011 | 150 | |
| 4 | Cr | `output_sgst` | 206012 | 150 | |

Namma Bakes now owes ₹75,600 + ₹6,300 = **₹81,900**. A price increase works the same (reason `price_increase`, rule R1,
revenue on Sale of Products, as the CA's E4).

---

## 5. All the kinds, side by side

| Kind (`note_reason`) | Example (scenario) | Value line (role → ledger) | GST lines | Stock lines | Approvers |
|---|---|---|---|---|---|
| Credit · `return` | B4-06: 40 cartons back, ₹29,400 | `sales_return` → Sales Returns | yes, given back | by the receipt or by the note (setting) | Rajan |
| Credit · `scheme_discount` | B4-07(a): rebate under SCH-26-Q2, ₹52,500 | `discount_allowed` → Discount Allowed | yes (agreed before supply, s.15(3)(b)) | no | Rajan + Venkat |
| Credit · `goodwill` | B4-07(c): ₹5,000, no scheme | `discount_allowed` → Discount Allowed | **no** (s.15(3)) | no | Rajan |
| Credit · `price_correction` | B4-07(d): ₹3,000 + ₹150 | `revenue` → the ledger the invoice used | yes | no | Rajan |
| Debit · `additional_charge` | B4-08: late freight ₹6,300 | `revenue` → Freight Recovered | yes | no | Rajan |
| Debit · `price_increase` | the CA's E4 | `revenue` → Sale of Products | yes | no | Rajan |

`scheme_reference` must be filled for a scheme discount and must be empty otherwise (scenario C-19).

---

## 6. The new fields, one by one

**`fin.sales_invoice`** (added in rev 18)

| Field | Values | Rule |
|---|---|---|
| `document_type` | invoice · credit_note · debit_note | default invoice |
| `against_sales_invoice_id` | → another `sales_invoice` row | required on a note, empty on an invoice; must be a **posted invoice** of the **same customer and branch**, not dated after the note |
| `note_reason` | return · scheme_discount · price_correction · goodwill (credit) · price_increase · additional_charge (debit) | required on a note; must suit its type |
| `scheme_reference` | SCH-26-Q2 | only, and always, on a scheme discount |
| `stock_return_id` | → `inv.stock_return` | only, and always, on a return |
| `return_stock_posting` | stores_receipt · with_credit_note | only on a return: the setting it used |

**`inv.stock_return`** (new table, a stub: Stores' record): `return_no`, `received_on`, `debtor_account_id`,
`against_sales_invoice_id`, `item_code`, `from_stock_lot_id`, `quantity`, `condition` (saleable · damaged),
`to_stock_lot_id`, `unit_cost`, `journal_entry_id`, `recorded_by_contact_id`.

**The rule tables** (rows added, no new tables): `fin.posting_rule` SALES_CREDIT_NOTE v1, SALES_DEBIT_NOTE v1,
SALES_RETURN_RECEIPT v1, their cases (R1 … R5) and roles; `fin.line_role` + `sales_return`, `discount_allowed`;
`fin.account_determination` + 2 rows (Sales Returns 401090, Discount Allowed 506020: codes proposed, the CA confirms).

---

## 7. What the database refuses (so a wrong note never gets in)

| Wrong thing | Refused by |
|---|---|
| A note with no invoice, or an invoice that names an invoice | CHECK `sales_invoice_note_names_its_invoice` |
| A note against a draft, an amended invoice or another note | trigger `sales_note_against_invoice` |
| A note for another customer or GSTIN than its invoice, or dated before it | trigger `sales_note_against_invoice` |
| A credit note with a debit-note reason | CHECK `sales_invoice_credit_note_reason_valid` |
| A return note without Stores' receipt (C-17) | CHECK `sales_invoice_return_needs_receipt` |
| A scheme discount without its reference, or goodwill claiming one (C-19) | CHECK `sales_invoice_scheme_needs_reference` |
| More back than the invoice took from that batch (Part C) | trigger `stock_return_not_more_than_sold` |
| The customer debited on a credit note | trigger `sales_invoice_line_customer_side` |
| A ledger other than the mapping's, with no reason | CHECK `…_override_has_reason` |
| A role the note's rule never writes | foreign key to `fin.posting_rule_role` |

All are proved on PostgreSQL (`t24_schema_test.sql`, tests N63–N78).

---

## 8. See it yourself

In the app: **Rules → Backend view** shows each table read back from PostgreSQL. Or in SQL:

```sql
-- every note, the invoice it corrects, and its lines with the rule and the mapping
SELECT n.invoice_no, n.document_type, n.note_reason, i.invoice_no AS against, l.line_no, l.side,
       coalesce(l.ledger_account_code, '(customer)') AS ledger, l.amount, l.rule_code, l.rule_case, l.line_role_code
  FROM fin.sales_invoice n
  JOIN fin.sales_invoice i ON i.sales_invoice_id = n.against_sales_invoice_id
  JOIN fin.sales_invoice_line l ON l.sales_invoice_id = n.sales_invoice_id
 ORDER BY n.invoice_no, l.line_no;

-- what a customer owes after the notes
SELECT a.account_name, sum(l.debit - l.credit) AS owes
  FROM fin.journal_line l JOIN fin.debtor_account a USING (debtor_account_id) GROUP BY 1;

-- the returns and who posted the stock back
SELECT r.return_no, r.quantity, r.item_code, r.condition, r.unit_cost, e.voucher_type AS stock_back_by
  FROM inv.stock_return r LEFT JOIN fin.journal_entry e USING (journal_entry_id);
```

---

## 9. Not built yet (logged)

| Gap | What |
|---|---|
| G46 | A note never above what is left on its invoice: parked (the Accounts Manager approves) |
| G45 | Sales Returns and Discount Allowed codes: proposed, the CA confirms; price correction ledger: no CA specimen |
| G47 | `inv.stock_return` is Stores' record: ours is a stub |
| G48 | The default for who posts the stock back: the CA confirms (stores_receipt, as E1) |
| G42 | One family for all sales documents: built; Manoj to agree (his purchase side keeps a table set per type) |
| (process) | Nisha's approval of the adjustment, and Billing's own screen, are outside this app: mocked by the buttons |
