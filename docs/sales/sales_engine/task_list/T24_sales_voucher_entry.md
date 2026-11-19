# T24 · Sales voucher entry (Raise a sales invoice)

The design of the screen and its fields, and (rev 2) the database built from it. Rev 1 · 6-Nov-2026 (the design) · **Rev 2 · 16-Nov-2026: built the way Manoj built the purchase voucher: the app, the schema (16 tables) and the proof on PostgreSQL, §13** · **Rev 3 · 16-Nov-2026: checked against the CA's 43 specimen invoices; 2 faults corrected, the missing cases added, §14** · **Rev 4 · 18-Nov-2026: only the sales invoice; the challan's stock and cost moved to the Stores task G30; the invoice opens full screen, §15** · **Rev 5 · 18-Nov-2026: an independent invoice as the CA's 43 specimens: no challan, no order, no PO; schema rev 7, §16** · Vijay (Accounts Executive, Sales).

**We are on T24.** It is the first task that posts: it builds the engine's posting path (task list, build order #9). T12 (Create a customer, rev 4) is its master.

---

## 0. Inputs (stacked: a new input never silently replaces an old one)

| # | Date | Who | What | Effect here |
|---|---|---|---|---|
| I1 | 29-Oct | Vijay (task card rev, `docs/accounts_executive/01_…` T24) | One invoice from one delivery challan; the Accounts Manager checks every invoice; his approval triggers the IRN and e-way bill Part-A. The AE fills: challan (picked), customer PO, quantity ≤ challan, invoice date, narration. Party, place of supply, tax and **ledgers are shown** ("come by themselves") | The default mode (§4, mode A) |
| I2 | 30-Oct | Vijay (app `app/sales`) | The accounting entry is **typed by hand**, like a Tally voucher; the app checks it | Replaced by I8 for the new screen (difference D1) |
| I3 | Oct | Team (`shared_doc_reference/Aikyat_Sales_Module_Finalized_Scope.md`) | SO → DC → Invoice; **no orphan document** where the DC step is on; DC is a company switch (off: invoice against the SO); services use a notional DC; one DC → one or many invoices; discount at supply reduces the taxable value (4.14); export / SEZ is a **variant** of the invoice (4.16); a series per GSTIN, reset each FY (4.17); Branch on every header (5.4) | §4, §6, §7 |
| I4 | Oct | Scenario (`shared_doc_reference/scenario/Full scenario.md`) | B4-01 (DC-1 → ₹7,48,125), B4-03 (ship-to PIN missing → stays Draft), B4-04 (IRN cancel window), B4-05 (unbilled list), B4-09 (export USD 10,680 at ₹88), D-02/D-03 (challan, Part-B), C-24/C-25/C-27 | The answer keys; §12 |
| I5 | Nov | Team lead (CLAUDE.md §3) | Slices send business facts; **the engine decides** recognition, rule and accounts; every JE links to its event and rule version; events are immutable | §1, §8 |
| I6 | 5–6 Nov | Vijay (T12 rev 4, `customer_onboarding_schema.dbml`) | The invoice reads `debtor_account` (control ledger from `debtor_category`), `debtor_location` **bill_to / ship_to**, `debtor_tax_registration`; the T24 hand-off in `02_engine_history.md` | §5 B, §11 |
| I7 | — | CA (Swasthik, `1. Global_Chart_of_Accounts_Updated_1.xls`, Indian GAAP sheet) | 401010 Sale of Products · 401020 Sale of Services · 401030 Export Sales · 107010–107130 receivables · 206010 Statutory Dues Payable (GST/TDS/PF/ESI, **one ledger**) · 106020 Finished Goods · 501030 Change in Inventory. **No** Output CGST / SGST / IGST split, **no** round-off ledger | §8.3 (codes not in the chart are marked *proposed*) |
| I8 | **6-Nov** | **Vijay** | **The engine fills the entry; the AE may edit it; and the AE may create a new voucher he fills himself** | §4 mode B, §8.4 |
| I9 | 6-Nov | Law research (sources in §3) | Rule 46 particulars (a)–(s), e-invoice INV-01, e-way bill rule 138, IGST s.10, GST rates from 22-9-2025, TCS under IT Act 2025 s.394(1) | §3, §5 |
| I10 | 6-Nov | ERP research (sources in §2) | How SAP, ERPNext, Odoo and Oracle raise a customer invoice | §2 |
| I11 | — | Sunny (`sunny_ui_formula/00_foundry_task_to_screen_formula.md`) | Task → steps → components → pattern → slots → regions | §4 |
| I12 | 30-Oct | Earlier method (`docs/accounts_executive/case_engine/03_example_sales_invoice.md`, rev 10–13) | State machine, gaps P.1, defaults | Reused where still true; §10 |
| I13 | **16-Nov** | Manoj (engine repo `aikyat-business-engine-poc`, branch `manoj/vendor-backend-model`, commit `923409b`) | The purchase voucher (T1) **built**: stages, gates re-run at approval, one transaction, PostJournalEntry / ReverseJournalEntry, the books core (branch, fiscal_year, document_sequence, journal); 13-Nov: **no control ledger** (`account_type` receivable / payable) | §13: the twin; D5–D17 |
| I14 | **16-Nov** | **Vijay** | Build the sales voucher his way: the UI first, then the schema and the walkthrough; hand it over for merge; no faults this time | §13 (rev 2) |

**Differences (both shown, the owner followed):**

| # | Between | Difference | Followed | Why |
|---|---|---|---|---|
| D1 | I2 ↔ I1, I5, I8 | Typed entry vs ledgers shown | **I8:** the engine fills, the AE may edit | Vijay's latest input; agrees with the card and the engine model |
| D2 | I8 ↔ I3, I1 | A voucher the AE fills himself vs "no orphan document" | **Both:** the AE may fill a voucher himself, but a **goods** line must still pick its challan line while the DC switch is on; service lines need none | The scope (team) owns the chain; to confirm with Vijay |
| D3 | I7 ↔ app | The app's 401011, 206011–206013, 506090 are not in the CA's chart | **Proposed**, asked of the CA (G18) | Never invent a code |
| D4 | T12 form ↔ law | The customer form carries "LUT number & validity", but the LUT is **ours** (the exporter's, per GSTIN, per FY, Rule 96A) | The invoice reads our company's LUT; the customer's copy is only a cross-check (G19) | Ownership |
| D5 | I13 ↔ T12 rev 4, I6 | "Control ledger" (`control_ledger_code`) vs his built `ledger_account_code` with `account_type` | **I13** | His built decision; it says the same thing more simply (§13.1) |
| D6 | I13 ↔ I8 | His purchase entry is **typed** by the AE; ours is **filled by the engine**, editable with a reason | **I8** (both: the stored line has the same shape) | Vijay's input for the sales side; the CA sees the rule and the edit |
| D7 | I13 ↔ I5 | His approval posts directly (no outbox); our model passes an event to the engine | **I13 for now**, G14 open | The built engine; adding the outbox later is additive |

---

## 1. Where T24 sits in the engine (CLAUDE.md §6, the six questions)

| Question | Answer |
|---|---|
| 1. Slice | **Sales** (Billing combined with this role, 29-Oct). The AE raises; the Accounts Manager (Rajan) checks |
| 2. Business event | `SalesInvoiceApproved` → `SalesInvoiceIssued` (number) → `SalesInvoiceRegistered` (IRN; e-way bill Part-A) → `SalesInvoicePosted`. Rev 2: one approval transaction, as his purchase voucher; `SalesInvoiceIrnCancelled` (≤ 24 h) |
| 3. Recognised? | **Yes**, once the IRN is registered (posted only with an IRN): the first posting. The IRN cancelled within 24 h → the reversal (the mirror). (The challan's event posts the cost; the order posts nothing) |
| 4. Posting rule | `SALES_INVOICE` with conditions: domestic intra / inter, services, export LUT / IGST, SEZ LUT / IGST, TCS item (§8.2) |
| 5. Entry | Dr Customer (its control ledger) · Cr Sales · Cr Output GST by head · ± Round off (· Cr TCS payable, only for a TCS item) |
| 6. Exception | IRN refused → stage **issued**, Compliance queue, retried · a check fails again at approval (`APPROVAL_REFUSED`) · period or year closed · no rule matches · the AE's edited entry (to Rajan, §8.4) |

**Never in T24:** recording the delivery challan, stock and cost of goods sold (the Stores challan task, G30; rev 4) · changing a rate (the Sales Manager's, on the order) · editing party identity (Business Core) · editing or deleting a confirmed invoice (a credit note, T25).

---

## 2. How the four ERPs do it

Research of 6-Nov-2026, read from source code or official docs; "(unverified)" where it could not be opened.

| Concept | SAP S/4HANA | ERPNext + India Compliance | Odoo 18 + l10n_in | Oracle Fusion Receivables | **Ours (T24)** |
|---|---|---|---|---|---|
| Document | Billing doc F2 (VF01) from the delivery; FI invoice FB70 standalone | Sales Invoice, from SO / Delivery Note / standalone | `account.move` out_invoice | Transaction (class Invoice) | Sales invoice: mode A from the challan, mode B typed |
| Dates | Billing date + posting date | `posting_date`, `due_date` | `invoice_date` + `date` (accounting) | TransactionDate + AccountingDate | Invoice date; posting date = invoice date |
| Our GSTIN | Business place (+ section code) | `company_gstin` from the company address | Company / branch VAT | FirstPartyRegistrationNumber (legal reporting unit) | A3 issuer GSTIN from our branch |
| Parties | Sold-to · ship-to · bill-to · payer | Customer + billing / shipping / **dispatch** address | Partner + delivery address | Bill-to · ship-to · sold-to sites | B1 account · B3 bill-to · B6 ship-to · A4 dispatch from |
| GSTIN | Per recipient (Tax number 3) | On the address | On the partner | On the party / site | On the bill-to place (`debtor_location` → registration) |
| Place of supply | Derived | `place_of_supply`, auto, editable | `l10n_in_state_id`: ship-to state, else partner, else company | Tax-rule default (bill-to / ship-to / first party) | B8 worked from ship-to (s.10) |
| GST category | Export cat. DIR/DEM/SEZ/SED; Reg/REV | `gst_category` (10 values) | `l10n_in_gst_treatment` (8 values) | Fiscal classifications (unverified) | B5 buyer's GST position → `SupTyp` |
| Tax decided by | Condition records + tax code | Tax template by tax category (inter-state, RCM flags) | Product taxes remapped by the fiscal position | Tax rules engine (HSN, states) | Tax master by HSN and date; local vs inter from POS |
| Intra vs inter | Plant region vs POS | `place_of_supply[:2] != company_gstin[:2]`; SEZ always inter | Fiscal state from POS; SEZ a virtual state | Ship-from state vs POS state | B9: POS vs our GSTIN state; SEZ / export → IGST or LUT |
| HSN | Material control code | `gst_hsn_code` on the line | `l10n_in_hsn_code` copied from the product | ProductFiscalClassification | C6 from the item master, copied |
| Receivable account | Customer reconciliation account | `debit_to` (customer's, else company) | Partner receivable property | AutoAccounting | `debtor_account.control_ledger_code` |
| Revenue account | VKOA (KOFI, ERL) | Line `income_account` (item / group / company) | Product / category, fiscal-position mapping | AutoAccounting | Rule R1–R7; the AE may change it with a reason (I8) |
| Cost of goods sold | Goods issue at delivery | Delivery Note (or the invoice if `update_stock`) | Delivery (Anglo-Saxon: at invoice) | Cost Management, matched to revenue | **The challan's entry**, never the invoice |
| Posted invoice | Never edited; VF11 cancel | Cancel + amend (`amended_from`) | Credit note, or reset to draft | Edit only before activity | Never edited; IRN cancel ≤ 24 h, else credit note (T25) |
| E-invoice store | eDocument Cockpit (IRN, Ack, QR) | `irn` + e-Invoice Log (cancel reason 1–4) | EDI JSON attachment; cancel reason | GSP / flexfields (unverified) | `einvoice_registration` (G1, G2, G6) |
| E-way bill fields | eDocument | transporter, GST transporter ID, mode, distance, vehicle, LR no. / date | type, distance, mode, vehicle, doc no. / date, transporter | (unverified) | §5 F from the challan |
| Numbering | Billing range + ODN | `naming_series` (one per GSTIN possible) | Journal sequence per year; warns on Rule 46(b) | Source numbering + document sequencing | A5 / A6: one series per GSTIN per FY, given at Issue |
| Approval before posting | (release to accounting) | Optional workflow | Draft → Confirm | Optional approval step | Rajan checks every invoice (I1) |

**What all four agree on (and T24 follows):**
1. **Draft has no ledger effect;** posting is one atomic step that freezes the document, writes the entry and takes the legal number.
2. **A posted invoice is never edited:** cancel inside the legal window, else a credit or debit note pointing to the original.
3. **The account is not typed on an invoice that comes from a delivery:** receivable from the customer, revenue from the item or rule, tax from the tax code. (FB70 / a manual line is the exception, for miscellaneous revenue: our mode B.)
4. **Tax is decided by rules** from the buyer's GST category, the place of supply vs our state and the HSN; wrong combinations are blocked.
5. **Intra vs inter is one comparison:** our GSTIN's state vs the place of supply; SEZ is always inter-state.
6. **The place of supply and the GST category are stored on the invoice** (a snapshot), not re-read later.
7. **Our GSTIN is a header fact** from the selling unit; each GSTIN numbers its own invoices.
8. **Bill-to, ship-to and dispatch-from are separate**, and the GSTIN sits on the address.
9. **HSN is copied from the item master onto the line** and frozen at posting.
10. **Cost of goods sold belongs to the goods movement** (the delivery), as our engine model says.
11. **The legal number is separate from the internal id** (≤ 16 characters, per GSTIN, per FY).
12. **The e-invoice and e-way bill are separate records** linked to the invoice: IRN, Ack, QR, status, cancel reason 1–4.

**Where we differ, on purpose:** the AE may edit the engine's entry (I8), but only with a reason, never the customer or tax lines, and always checked by Rajan (§8.4). SAP FB70 and ERPNext / Odoo line accounts allow the same kind of change.

**Sources:** SAP help (revenue account determination, goods issue, VF11, FB70), SAP Document Compliance India deck (16-Mar-2020), KBAs 3627504 / 2513276 / 2459388; github.com/frappe/erpnext `sales_invoice.json`, `sales_invoice_item.json`; github.com/resilient-tech/india-compliance (`custom_fields.py`, `overrides/transaction.py`, `e_invoice_log.json`); github.com/odoo/odoo 18.0 `l10n_in`, `l10n_in_edi`, `l10n_in_edi_ewaybill`, `stock_account`; odoo.com/documentation/18.0 (India, customer invoices, credit notes, fiscal positions); docs.oracle.com Financials 26b `receivablesInvoices` REST, AutoAccounting, GST processing, cost-of-goods-sold recognition.

---

## 3. What the law requires on our invoice (Nov 2026)

Official sources read on taxinformation.cbic.gov.in, gstcouncil.gov.in, einv-apisandbox.nic.in; "(secondary)" = a commentary only.

| Particular | When | Source |
|---|---|---|
| Our name, address, GSTIN | Always | CGST Rule 46(a) |
| Invoice number: ≤ 16 characters, A–Z 0–9 `-` `/`, consecutive, unique per FY; e-invoice: not starting with 0, `/` or `-` | Always | Rule 46(b); NIC validation |
| Invoice date (goods: on or before removal) | Always | Rule 46(c); CGST s.31(1) |
| Customer name, address, GSTIN | Registered customer | Rule 46(d) |
| Customer name, address, **delivery address, state name and code** | Unregistered customer, value ≥ ₹50,000 | Rule 46(e) |
| HSN: **6 digits** (our AATO > ₹5 crore; 4 digits ≤ ₹5 crore) | Every line | Rule 46(g); Notification 78/2020-CT |
| Description · quantity and UQC (goods) | Every line | Rule 46(h), (i) |
| Total value · taxable value after discount | Always | Rule 46(j), (k) |
| Rate and amount per head (CGST, SGST, IGST, cess) | Always | Rule 46(l), (m); rates 9/2025-CT(Rate) from 22-9-2025: 0 / 5 / 18 / 40 % |
| Cess | Nil on all goods from 1-2-2026 (column kept, value 0) | 3/2025-Compensation Cess (Rate) |
| **Place of supply with state name** | Inter-state (always in the e-invoice `Pos`) | Rule 46(n); IGST s.10 |
| **Delivery address** | Where it differs from the place of supply | Rule 46(o) |
| "Tax payable on reverse charge: Yes / No" | **Always** (No for our goods) | Rule 46(p); 4/2017-CT(Rate) |
| Signature | Not for an electronic invoice | Rule 46(q) proviso |
| IRN + signed QR (+ Ack no. and date) | AATO > ₹5 crore; B2B, SEZ, export | Rule 46(r), 48(4); 10/2023-CT |
| Export / SEZ endorsement, verbatim: "SUPPLY MEANT FOR EXPORT/SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS ON PAYMENT OF INTEGRATED TAX" or "… UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX" + country of destination | Export or SEZ | Rule 46 2nd proviso (20/2024-CT) |
| E-way bill (Part A from the invoice; Part B vehicle by Stores) | Goods moving, value > ₹50,000 (Karnataka intra-state also ₹50,000) | Rule 138; KA FD 47 CSL 2017 (secondary) |
| Income-tax TCS line (below the GST total, not in the taxable value) | Only listed items: scrap etc. 2 %, motor vehicle / luxury > ₹10 lakh 1 % | IT Act 2025 s.394(1) (secondary); s.206C(1H) ended 1-4-2025 |
| Round-off line (±₹99.99), never inside taxable value or tax | Optional | CGST s.170; INV-01 `RndOffAmt` |
| Amount in words · due date | **Not required by law** (commercial practice; shown) | Rule 46 silent |

**Timing rules the screen enforces:** IRN cancellation only within **24 hours** and not while an active e-way bill exists (NIC cancel-IRN) · reporting to the IRP within **30 days** of the invoice date if AATO ≥ ₹10 crore (GSTN advisory, from 1-4-2025) · e-way bill cancel within 24 hours; validity 1 day per 200 km (Rule 138(10)) · an e-way bill only for a document ≤ 180 days old (from 1-1-2025, secondary).

**Place of supply (goods):** where the movement ends, i.e. the **ship-to** state (IGST s.10(1)(a)). Bill-to-ship-to on the direction of the customer: the **bill-to**'s principal place (s.10(1)(b)). Export: outside India, `Pos` 96 (s.11). SEZ: always inter-state, IGST (s.7(5)(b)). Same state as our GSTIN → CGST + SGST; else IGST.

**Our AATO decides three switches** (e-invoice > ₹5 cr, 30-day limit ≥ ₹10 cr, HSN 6 digits > ₹5 cr): a dated company setting (gap G17).

---

## 4. The screen

### 4.1 Steps (task card I1) → components → pattern (Sunny, I11)

| # | Step (card) | Component | Slot |
|---|---|---|---|
| 1 | Pull the challan lines | `cmp.record-summary` (challan, order) · unbilled worklist | context_panel · query_controls |
| 2 | Check tax and place of supply | `cmp.form-section` B (parties) with worked-out POS and supply type | primary_workspace |
| 3 | Apply the billing instructions | billing-instruction strip beside the PO field (rule 3: a warning sits next to what it is about) | primary_workspace |
| 4 | Run the e-invoice pre-check | checks list | validation_feedback |
| 5 | Submit | `cmp.change-summary` ("what Submit sends") + submit | action_area |
| 6 | On approval: IRN and e-way bill Part-A | `cmp.receipt` | validation_feedback |
| 7 | Send to the customer | delivery channel shown | action_area |
| 8 | Cancel the IRN within 24 h | cancel with the time left | action_area |

**Pattern:** FD-06 Structured Editor · variant **transaction-workspace** (recording what physically happened, the source beside the entry), the same as T12's customer form:

| Region | Width | Holds |
|---|---|---|
| **Source** | 5/16 | The challan (lines, batches, expiry, vehicle, distance) · the sales order (rates, PO) · the customer (account, category, control ledger, credit, exposure, billing instructions, bill-to and ship-to choices) |
| **Entry** | 7/16 | Tabs: **Invoice** (sections A–G of §5) · **Accounting entry** (engine-filled, editable, §8.4) · **Why each value** (business + engineer, §9) · **Approval & history** |
| **Action** | 4/16, pinned | Checks (to fix · warnings · met) · what Submit sends · Save / Submit · Built with |

**Lists (left of the workspace):** *To bill* (unbilled challan lines, oldest and largest first, services aged against 30 days) · *My drafts* · *With Rajan* · *Confirmed*. Buttons: **Bill a challan** (mode A) · **New sales voucher** (mode B).

### 4.2 Three modes, one document

| Mode | Opened by | What is prefilled | What the AE types | Source |
|---|---|---|---|---|
| **A · From a challan** (default) | Picking a challan from *To bill* | Everything: customer, bill-to, ship-to, lines, rates, tax, entry | Customer PO (if the instruction says so) · quantity (≤ challan) · date · narration | I1, I3 |
| **B · Typed by me** | **New sales voucher** | Only what the chosen customer gives (bill-to, ship-to, terms) and the item master (HSN, UQC, GST rate) | Customer · lines (item or service, quantity, rate, discount) · for each **goods** line its challan line (DC switch on) · PO · date · narration · the entry if he wants (prefilled, editable) | I8, D2 |
| **C · Export / SEZ** (a form of A or B) | The customer is export or SEZ (from T12: `export_customer`, `sez_customer`, category) | As A, plus our LUT, endorsement, `Pos` 96 / SEZ state | Export type (LUT / with IGST) · currency and rate · port · shipping bill (later) | I3 4.16, B4-09, D4 |

---

## 5. The fields

**Columns:** *How* = picked · typed · default (prefilled, editable) · worked (by rule, not typed) · shown (read-only) · after (filled after approval). *From* = where the value comes from. *Goes to* = the DB home (hint for §11).

### A · Header

| # | Field | How | From | Required when | Rule / check | Source | Goes to |
|---|---|---|---|---|---|---|---|
| A1 | Voucher type | worked | mode + customer | Always | Tax invoice · Export invoice · SEZ invoice (Bill of supply only if every line is exempt) | Rule 46, 46A | invoice.document_type |
| A2 | Our company | shown | session (`pc.operated_party`) | Always | — | T12 key | invoice.operated_party_id |
| A3 | Our GSTIN / branch (issuer) | default | our branch of the challan's godown (KA-01 → 29…) | Always | Must be an active registration of ours (gap G7) | Rule 46(a); scope 5.4 | invoice.issuer_gstin, branch_id |
| A4 | Dispatch from | shown | the challan's godown address | When it differs from our registered address | — | INV-01 DispDtls | invoice.dispatch_from |
| A5 | Number series | worked | A3 + FY (`KA/INV/2627/`) | Always | One series per GSTIN per FY (C-27) | Rule 46(b); scope 4.17 | document_series |
| A6 | Invoice number | after | the series, at **Issue** (after approval, before the IRN) | Always | ≤ 16 characters; never reused, even when cancelled | Rule 46(b); C-27 | invoice.number |
| A7 | Invoice date | default (today) | — | Always | Not after today · not before the challan without a warning · open period · ≤ 30 days old for the IRP if AATO ≥ ₹10 cr | Rule 46(c); s.31(1) | invoice.invoice_date |
| A8 | Posting date | worked | = A7 | Always | Same as the invoice date (no back-posting); a soft-closed month needs Rajan | ERP practice; period control | journal_entry.posting_date |
| A9 | Delivery challan(s) | picked (A) · per line (B) | the unbilled list | Goods, DC switch on | Fully billed → stop (duplicate) | I1, I3 | invoice_line.challan_line_ref |
| A10 | Sales order | shown | the challan | When there is one | — | I3 | invoice.sales_order_ref |
| A11 | Customer PO number | typed | — | If the billing instruction says "every invoice" | — | I1; billing instruction (T12) | invoice.customer_po_no |
| A12 | Customer PO date | typed | — | Optional | — | ERP practice | invoice.customer_po_date |
| A13 | Reverse charge | worked (No) | the supply | Always | Yes only for a 4/2017-CT(Rate) item (none of ours) | Rule 46(p) | invoice.reverse_charge |
| A14 | Currency · rate | default INR · typed (C) | the customer's currency | Export | Rate > 0; source of the rate to the CA (G25) | scope 4.16; B4-09 | invoice.currency_code, exchange_rate |
| A15 | Narration | typed (default text) | — | Optional | — | I1 | invoice.narration |

### B · Customer, places and tax position

| # | Field | How | From | Required when | Rule / check | Source | Goes to |
|---|---|---|---|---|---|---|---|
| B1 | Customer (account) | worked (A) · picked (B) | the order's customer → `fin.debtor_account` | Always | Account open; not blocked | T12 | invoice.debtor_account_id |
| B2 | Customer code · legal name · trade name | shown | debtor_account.customer_code · `pc.party`, `pc.party_trade_name` | Always | Identity is read, never edited here (B4-03) | Rule 46(d) | copied at Issue: invoice.buyer_* |
| B3 | Bill-to place | default | `fin.debtor_location` bill_to of the default GSTIN; another bill_to may be picked | Always | Must be open | T12 rev 4 | invoice.bill_to_location_id |
| B4 | Bill-to GSTIN | worked | the bill-to's `debtor_tax_registration` → `pc.party_identifier` | Registered customer | Valid, active, its state = the bill-to state | Rule 46(d); INV-01 BuyerDtls | copied: invoice.buyer_gstin |
| B5 | Buyer's GST position | worked | registration type (regular · composition · SEZ · unregistered) + export flag | Always | Decides INV-01 `SupTyp` (B2B · SEZWP · SEZWOP · EXPWP · EXPWOP) | INV-01 | invoice.supply_type |
| B6 | Ship-to place | default | `fin.debtor_location` ship_to (primary), else the bill-to | Goods | Must be open; **PIN 6 digits** (B4-03 pre-check) | Rule 46(o); T12 F1 | invoice.ship_to_location_id |
| B7 | Ship-to GSTIN | shown (optional) | the ship-to's registration, if any | Optional (portal rule on hold, 29-Jul-2026) | — | e-way bill advisory | copied |
| B8 | **Place of supply** | worked | ship-to state (s.10(1)(a)); export → 96; SEZ → the SEZ state, IGST | Always | — (business + engineer answer §9) | IGST s.10, s.11, s.7(5) | invoice.place_of_supply_code |
| B9 | Supply: local / inter-state | worked | B8 vs A3's state | Always | Local → CGST + SGST; else IGST; SEZ / export → IGST or LUT | IGST s.7, s.8 | invoice.is_inter_state |
| B10 | Billing instructions | shown | debtor_account: PO rule · delivery channel · format note | Always | Drive A11 and the send step | T12 | — (read) |
| B11 | Payment terms · credit days · due date | worked | debtor_account terms; due = A7 + credit days | Credit customer | Not legal; shown and sent to Collections | T12; I1 "Sends" | invoice.due_date |
| B12 | Credit position | shown | limit (`debtor_credit_limit`) · due now · this invoice | Credit customer | Over the limit → warn (credit is checked on the order) | I1 Exceptions | — (read) |
| B13 | E-commerce operator GSTIN | typed | — | Only a sale through an operator (s.52) | — | INV-01 EcmGstin | invoice.ecom_gstin |

### C · Lines

| # | Field | How | From | Required when | Rule / check | Source | Goes to |
|---|---|---|---|---|---|---|---|
| C1 | Line no. | worked | — | Always | 1…1000 | INV-01 SlNo | invoice_line.line_no |
| C2 | Challan line | worked (A) · picked (B) | the challan | Goods, DC switch on | No challan line → stop (I3); not fully billed | I1, I3 | invoice_line.challan_line_ref |
| C3 | Item / service | worked (A) · picked (B) | the challan's item; item master; service catalogue | Always | — | Rule 46(h) | invoice_line.item_code |
| C4 | Is service | worked | item master | Always | Service → SAC, no quantity check, no e-way bill | INV-01 IsServc | invoice_line.is_service |
| C5 | Description | default | item master | Always | — | Rule 46(h) | invoice_line.description |
| C6 | HSN / SAC | worked | item master (tax master, G20) | Always | 6 digits (AATO > ₹5 cr); a service needs a SAC | Rule 46(g); 78/2020-CT | invoice_line.hsn_sac |
| C7 | Batch · expiry | shown | the challan | Batch-tracked goods | Expiry within 7 days → warn | B4-01; D-02 | invoice_line.batch (read from DC) |
| C8 | Quantity | default (challan) · typed | the challan's unbilled quantity | Goods | 0 < qty ≤ unbilled (0 % above); less → warn (stays on the list) | I1 Rules | invoice_line.quantity |
| C9 | UQC | worked | item master | Goods | GST unit code (CTN, NOS …) | Rule 46(i) | invoice_line.uqc |
| C10 | Rate | shown (A) · typed (B, no order) | the order's approved rate | Always | The AE never changes an order's rate (I1); in B with an order, a different rate → stop | I1 Rules | invoice_line.unit_price |
| C11 | Discount (at supply) | shown | the order / price list | When agreed before supply | Reduces the taxable value on the line; a later discount is a credit note | scope 4.14; Rule 46(k) | invoice_line.discount_amount |
| C12 | Taxable value | worked | qty × rate − discount (in INR for export: × rate) | Always | — | Rule 46(k) | invoice_line.taxable_value |
| C13 | GST rate | worked | tax master by HSN and date (0 / 5 / 18 / 40 %) | Always | Override → Compliance Officer (G20) | Rule 46(l); 9/2025-CT(R) | invoice_line.gst_rate |
| C14 | CGST · SGST or IGST amount | worked | C12 × C13 (half each when local) | Always | ±₹1 tolerance at the IRP | Rule 46(m) | invoice_line.cgst/sgst/igst_amount |
| C15 | Cess | worked (0) | — | Kept for the schema | Nil on all goods from 1-2-2026 | 3/2025-Comp Cess | invoice_line.cess_amount |
| C16 | Line total | worked | C12 + tax | Always | — | INV-01 TotItemVal | invoice_line.line_total |
| C17 | Revenue ledger | worked (editable in the entry, §8.4) | the rule (§8.2) | Always | Never a group or control ledger | I8 | entry line |
| C18 | Margin | shown | standard cost (item master) | Goods | Below the 18 % floor → warn | I1 Sees | — (read) |

### D · Totals

| # | Field | How | Rule | Source | Goes to |
|---|---|---|---|---|---|
| D1 | Total taxable value | worked | Σ C12 | Rule 46(k) | invoice.taxable_total |
| D2 | CGST · SGST · IGST · cess totals | worked | Σ per head | Rule 46(m) | invoice.*_total |
| D3 | TCS (income tax) | worked | Only a TCS item (debtor category SCRAP / LUXURY / TOUR): rate × (D1 + D2); below the GST total | IT Act 2025 s.394(1) | invoice.tcs_amount, tcs_section |
| D4 | Round off | worked | To the rupee (company parameter); ±₹99.99 | s.170; INV-01 | invoice.round_off |
| D5 | Invoice total | worked | D1 + D2 + D3 + D4 | Rule 46(j) | invoice.grand_total |
| D6 | In words | worked | — | Practice | — (printed) |
| D7 | Total in foreign currency | worked | Export: Σ lines in currency | B4-09 | invoice.total_foreign |

### E · Export / SEZ (mode C only)

| # | Field | How | From | Required | Source | Goes to |
|---|---|---|---|---|---|---|
| E1 | Export type | default | LUT if our LUT is valid on A7, else with IGST | Always | Rule 46 proviso; B4-09 | invoice.export_type |
| E2 | Our LUT number · valid until | shown | our company's LUT register (per GSTIN, per FY) | Under LUT | D4; Rule 96A | invoice.lut_ref |
| E3 | Endorsement | worked | E1 → the verbatim text of §3 | Always | Rule 46 2nd proviso | printed |
| E4 | Country of destination | default | the customer's address | Export | Rule 46 proviso | invoice.country_code |
| E5 | Port code | typed | — | Export by sea / air | INV-01 ExpDtls | invoice.port_code |
| E6 | Shipping bill no. · date | typed (after) | — | Reminder until entered (B4-09) | INV-01 ExpDtls; refund | invoice.shipping_bill_no, _date |
| E7 | SEZ registration of the buyer | shown | the customer's GSTIN (SEZ) | SEZ | scope 4.16 | — (read) |

### F · Transport and e-way bill (from the challan; Part B is Stores')

| # | Field | How | From | Required | Source | Goes to |
|---|---|---|---|---|---|---|
| F1 | Transporter · ID | shown | the challan | Goods moving | Rule 138 Part A | eway_bill |
| F2 | Vehicle no. (Part B) | shown | Stores (D-03) | Before the goods move | Rule 138 Part B | eway_bill |
| F3 | Distance (km) | shown | the challan | E-way bill | INV-01 EwbDtls.Distance | eway_bill |
| F4 | LR / transport doc no. | shown | the challan | Optional | Part A | eway_bill |
| F5 | E-way bill needed? | worked | goods moving and D5 > ₹50,000 | — | Rule 138(1) | — |
| F6 | E-way bill no. · valid until | after | the IRP / NIC | When F5 | Rule 138(10): 1 day per 200 km | eway_bill |

### G · After approval (filled by the system)

| # | Field | When | Source | Goes to |
|---|---|---|---|---|
| G1 | IRN · Ack no. · Ack date · signed QR | On Register | Rule 48(4) | einvoice_registration |
| G2 | IRN status · error reason · retries | On a refusal (B4-03) | scope "IRN exception queue" | einvoice_registration |
| G3 | Journal entry · rule version | On Post | CLAUDE.md §3 | journal_entry |
| G4 | Open item (new reference, due date) | On Post | bill-wise allocation | ar_open_item |
| G5 | Sent to the customer (channel, at) | On Send | billing instruction | invoice.sent_at |
| G6 | Cancellation (reason code 1–4, at, by) | Within 24 h, no active e-way bill | NIC cancel-IRN; B4-04 | invoice.cancelled_* |

**Count:** 15 header · 13 customer · 18 line · 7 totals · 7 export · 6 transport · 6 after approval = **72 fields** (of which the AE types at most 9 in mode A).

---

## 6. Statuses

```
Draft ──Submit──▶ Submitted ──Rajan approves──▶ Approved ──Issue (number)──▶ Issued ──IRN──▶ Registered ──Post──▶ Confirmed
  ▲                  │ Rajan returns (reason)                                    │ IRN refused → stays Issued, Compliance queue (B4-03)
  └──────────────────┘ Returned                                                  
Draft ──Send back to Stores (challan wrong)──▶ Sent back          Confirmed ──within 24 h, goods not moved──▶ Cancelled (number kept)
                                                                  Confirmed ──after that──▶ only a credit note (T25)
```

- **Confirmed** = posted and IRN present (scope design goal 6). A posting failure leaves it Registered, no journal (C-25).
- **Nothing is deleted** (C-24). A draft can be discarded (kept as discarded).
- **App (mock, rev 1):** Rajan's approval runs Issue, Register and Post in one step; the separate Approved / Issued / Registered statuses, the IRN refusal (G2) and the 24-hour cancel (G6) are designed here but not yet shown in the app.

**Rev 2 (16-Nov): the stages as built** (`fin.sales_invoice.stage`, the twin of Manoj's `purchase_invoice.stage`):

```
draft ──Submit (AE)──▶ submitted ──Rajan: approve──▶ [every check again] Issue ─▶ Register ─▶ Post ──▶ posted
  ▲                       │ send back (reason) ─────▶ draft                 │ IRP refuses
  │                       └ reject (reason) ────────▶ rejected              ▼
  │                                                                       issued ──Retry (Compliance)──▶ Register ─▶ Post ──▶ posted
draft ──discard / challan sent back to Stores──▶ discarded       posted ──IRN cancel ≤ 24 h──▶ cancelled (mirror entry, number kept)
                                                                 posted ──after that──▶ a credit note (T25); the invoice stays posted
```

- "Approved" and "Registered" are steps inside the one approval transaction, not stages. "Returned" is now `draft` with `decision_reason`. "Sent back" is now `discarded` with `challan_sent_back`.
- The app shows every path: Rajan approves, approves with the IRP down, sends back or rejects; Venkat retries; Cancel IRN (hours left).

---

## 7. Checks

Stop = can't submit · Warn = shown, goes with the invoice · ✓ = met.

| # | Check | Level | Source |
|---|---|---|---|
| K1 | Customer account open (T12 done) | Stop | I1 Requires |
| K2 | Goods line without a challan line (DC switch on) · item not on the order | Stop | I3; I1 |
| K3 | Quantity above the unbilled challan quantity (0 %) | Stop | I1 Rules |
| K4 | Partial billing: quantity left on the list | Warn | I1 |
| K5 | Challan fully billed already (duplicate) | Stop | B4-01 "flag duplicates" |
| K6 | Rate differs from the order's | Stop | I1 Rules |
| K7 | Invoice date after today · period hard-closed | Stop | I1 |
| K8 | Soft-closed month · invoice dated before the challan | Warn | period control |
| K9 | Customer PO missing where the instruction requires it | Stop | I1 |
| K10 | E-invoice pre-check: buyer GSTIN valid and active · ship-to PIN 6 digits · HSN 6 digits · place of supply · number format | Stop (stays Draft) | B4-03; INV-01 |
| K11 | Export: no valid LUT on the date → with IGST, or stop if "LUT" chosen | Stop / Warn | B4-09 |
| K12 | Export: shipping bill not yet entered | Warn (reminder) | B4-09 |
| K13 | Batch expires within 7 days | Warn | D-02 |
| K14 | Margin below the 18 % floor · below cost | Warn | I1 Sees |
| K15 | Customer over its credit limit after this invoice | Warn (Farid told) | I1 Exceptions |
| K16 | Entry balances (Dr = Cr) | Stop | engine |
| K17 | Entry edited by the AE: a reason on every changed line; party Dr = invoice total; tax lines = invoice tax; no group or control ledger | Stop if broken · otherwise Warn "goes to Rajan as an exception" | I8; §8.4 |
| K18 | IRP 30-day limit (AATO ≥ ₹10 cr) | Stop | GSTN advisory 2025 |
| K19 | The maker may not approve | Stop (at decide) | maker-checker |

---

## 8. The accounting entry

### 8.1 What the engine needs from the invoice (the event)

Invoice id and number · date · our GSTIN and branch · the customer's `debtor_account_id` (its control ledger) · supply type and place of supply · per line: taxable value, HSN/SAC, is service, GST rate and amounts by head · round off · TCS · currency and rate · the AE's edited lines (if any) with reasons · the approver. **No account is decided by the slice** unless the AE edited it (§8.4).

### 8.2 Posting rules (rule `SALES_INVOICE`, version 1, effective 1-Apr-2026)

| Rule | Condition | Dr | Cr |
|---|---|---|---|
| R1 | Goods, domestic, local | Customer (control ledger, e.g. 107010) = total | Sale of Products 401010 = taxable · Output CGST · Output SGST · ± Round off |
| R2 | Goods, domestic, inter-state | Customer | 401010 · Output IGST · ± Round off |
| R3 | Service line (SAC) | Customer | **401020 Sale of Services** · GST as R1/R2 |
| R4 | Export under LUT | Customer (107040 Export) in INR | **401030 Export Sales** · no GST |
| R5 | Export with IGST | Customer (107040) | 401030 · Output IGST |
| R6 | SEZ under LUT / with IGST | Customer (107050 SEZ) | 401030 (to confirm, G18) · Output IGST when paid |
| R7 | TCS item (scrap, luxury > ₹10 lakh …) | Customer incl. TCS | + TCS payable (s.394) |
| — | Discount at supply | — | Already inside the taxable value: no ledger (scope 4.14) |
| — | Stock and cost of goods sold | **Not here:** the Stores delivery challan task (G30) posts them with its own rule. Periodic: month end (T11) | |

**Scenario B4-01 (R1):** Dr Sri Lakshmi (107100 Trade Receivables – Dealer/Distributor: her T12 category) ₹7,48,125.00 · Cr 401010 ₹7,12,500.00 · Cr Output CGST ₹17,812.50 · Cr Output SGST ₹17,812.50 · round off ₹0.00.

### 8.3 Ledgers (CA's chart, Indian GAAP; Ind AS codes differ for receivables, G4)

| Ledger | Code | Status |
|---|---|---|
| Customer control (from the debtor category) | 107010–107130 | CA ✓ (fixes G12: no header-to-code map in the UI) |
| Sale of Products | 401010 | CA ✓ |
| Sale of Services | 401020 | CA ✓ |
| Export Sales | 401030 | CA ✓ |
| Output CGST · SGST · IGST | 206011 · 206012 · 206013 under 206010 | **proposed** (the CA has one 206010; GST returns need the heads) |
| Sale of Products – Inter-state | 401011 | **proposed, and probably not needed**: the place of supply is on the invoice; ask the CA |
| Round off | 505120 (rev 2; was 506090) under Other Expenses – Administrative | **proposed** (not a selling expense) |
| TCS payable | 206014 under 206010 | **proposed** |

### 8.4 The AE's edit (Vijay, 6-Nov)

- The engine fills the entry from the rule; the tab shows each line with its rule and "why".
- The AE may **change a ledger, split a line, or add a line**; each changed or added line needs a **reason**.
- **Locked, so the books always agree with the invoice and the IRN:** the customer line (Dr = invoice total) · the tax lines, ledger and amount (= the invoice's tax by head; GST returns read them) · Dr = Cr.
- Never allowed: a group ledger · another customer's or any control ledger · a closed period.
- An edited entry goes to Rajan marked **"entry differs from rule R1: lines 2, 4"**; he approves it with the invoice. The journal keeps the rule version **and** the edit (who, why, approved by): "why was this posted?" is always answerable.
- In mode B the entry is prefilled the same way; the AE may fill it all himself, and the same checks apply.

---

## 9. Every automatic value, answered twice (CLAUDE.md §2)

| Value | Business answer (CA) | Engineer answer |
|---|---|---|
| Customer | The challan is for SO-1, which Arun raised for Sri Lakshmi | challan.so → sales_order.debtor_account_id |
| Control ledger | Sri Lakshmi was set up as a Dealer / Distributor debtor, which sits under Trade Receivables – Dealer/Distributor | debtor_account.control_ledger_code (copied from debtor_category) → 107100 |
| Place of supply | The goods are delivered in Bengaluru, Karnataka | ship_to `debtor_location` → `pc.business_location.administrative_area_code` IN-KA → GST 29 |
| Tax split | Our plant is in Karnataka too, so it is a local sale: CGST + SGST | place_of_supply = issuer GSTIN state → intra |
| GST rate · HSN | Glucose biscuits are HSN 190531 at 5 % (from 22-9-2025) | tax master (HSN, date) → 5 % |
| Sales ledger | A domestic goods sale is Sale of Products | rule R1 → 401010 |
| Due date | Sri Lakshmi has 30 days' credit | invoice_date + debtor_account.credit_days |
| Number | The Karnataka series for 2026-27, next free number | document_series (issuer GSTIN, FY) at Issue |
| IRN · e-way bill | Rajan's approval sends it to the IRP; the bill is above ₹50,000 and moves by road | RegisterEInvoice after Issue; EWB Part A when F5 |
| Round off | The total is made a whole rupee | round(D1 + D2 + D3) − (D1 + D2 + D3) → 505120 (proposed) |

---

## 10. Gaps (placed: "We are on T24. This belongs to X.")

| ID | Gap | Kind | Home |
|---|---|---|---|
| G7 | Our own branches and GSTINs (issuer, dispatch-from, series) | New task | S3 |
| G12 | Receivable codes in the old invoice UI | In a task | **T24: fixed by design** (control ledger from the account) |
| G17 | Our AATO as a dated company setting (e-invoice, 30-day limit, HSN digits) | New task | S1 |
| G18 | The CA's ledgers: Output GST by head, round off, TCS payable, inter-state split, SEZ sales ledger | Other owner | The CA |
| G19 | The LUT is ours (per GSTIN, per FY); the customer form holds a copy | In a task | T12 + S3 |
| G20 | The tax master (HSN → rate by date, GST 2.0) and who overrides a rate | Other owner | Compliance Officer |
| G21 | A voucher typed by the AE vs "no orphan document" (D2) | In a task | **T24**, confirm with Vijay |
| G22 | Owners of the switches: DC on/off, integrated mode, inventory method, billing combined | Other owner | The team lead |
| G23 | The IRN offline fallback (DC-0618/0619 released during an outage) | In a task | T24 + Compliance |
| G24 | An IRP refusal for buyer data after Issue (the copy is not renewed) | In a task | T24 |
| G25 | The exchange rate for an export invoice (source and date) | Other owner | The CA |
| G26 | Services: notional challan and the 30-day ageing | In a task | T24 (worklist) |
| G27–G31 | Rev 2: month periods · one chart (code clashes) · receipts and allocation · challan stubs · "sent to the customer" | §13.7 | |

---

## 11. What the DB design must hold (the hand-off; tables come next)

**Rev 2:** built. The tables are in §13.3, the field homes in §13.5. `sales_invoice_approval` became columns on the invoice (as his: one checker); `ar_open_item` became a view (D17). The table below is kept as written in rev 1.

| Entity | Holds | Links |
|---|---|---|
| sales_invoice | §5 A, B (copied buyer data at Issue), D, E, status, maker, checker | debtor_account, debtor_location (bill_to, ship_to), operated_party, branch, document_series |
| sales_invoice_line | §5 C | challan line, item, sales order line |
| sales_invoice_entry_line | The proposed entry; edited lines with reason | ledger_account |
| document_series | Prefix, FY, next number, per issuer GSTIN | our registration (S3) |
| einvoice_registration | §5 G1–G2 | sales_invoice |
| eway_bill | §5 F | sales_invoice, delivery challan |
| sales_invoice_history · approval | Every change, decision and reason | — |
| journal_entry (engine) | The posted entry, rule version, edit record | sales_invoice (event id) |
| ar_open_item (engine) | New reference, amount, due date | debtor_account |

**Next tasks that read it:** T25 / T26 (notes against the invoice lines and tax) · T13 (advance adjusted) · T18 (AR reconciliation) · GSTR-1 (by HSN, B2B / B2C) · T27 (dispatched-not-billed).

## 12. Answer keys the screen must reproduce

| Case | Expected |
|---|---|
| B4-01 DC-1 → Sri Lakshmi | 600 × ₹700 + 300 × ₹975 = ₹7,12,500; CGST ₹17,812.50; SGST ₹17,812.50; total ₹7,48,125.00; R1: Dr 107100 (her category) · Cr 401010 |
| B4-03 C-02, ship-to PIN missing | Pre-check stop; stays Draft |
| B4-05 unbilled list | N-1 (service, 20 days), DC-0619 ₹99,000, DC-0618 ₹72,000 |
| B4-09 export SO-3 | USD 10,680 × ₹88.00 = ₹9,39,840; LUT to 31-Mar-2027; IGST nil; shipping-bill reminder; R4 |
| C-27 | KA duplicate number rejected; TN series separate; a cancelled number never reused |
| Edited entry (I8) | Revenue ledger changed with a reason → goes to Rajan as "entry differs from rule"; customer and tax lines locked |

---

## 13. Rev 2 (16-Nov): built the way Manoj built the purchase voucher

**Inputs I13 and I14** (§0). Manoj's engine repo (`aikyat-business-engine-poc`, branch `manoj/vendor-backend-model`, commit `923409b`) has the purchase voucher (T1) built and running. Its books core is: `fin.branch`, `fin.fiscal_year`, `fin.document_sequence`, `fin.journal_entry`, `fin.journal_line`, and `journal.py` (PostJournalEntry and ReverseJournalEntry). Vijay asked us to build the sales voucher his way: the UI first, then the schema, then a hand-over for merge.

### 13.1 Decisions (D5–D17)

| # | Decision | Why |
|---|---|---|
| D5 | The customer line posts to `debtor_account.ledger_account_code` (account_type `receivable`) and names the account. The words "control ledger" go | Manoj, 13-Nov, built (`ledger_and_subledger.md`). ERPNext does it this way. The subledger is a view of the same lines, so it always ties |
| D6 | **Our branch issues the invoice** (`fin.branch`): its GSTIN (A3), its state (decides local or inter-state), its series (`fin.document_series`, per branch per FY) | Rule 46(b) series per GSTIN; C-27 "TN series separate". The branch table exists in his books core (the S3 stub) |
| D7 | Stages: draft · submitted · **issued** · posted · **rejected** · **discarded** · **cancelled**. The AM approves, **sends back** (to draft, with a reason) or **rejects** (with a reason). No `amended` | His three outcomes. A posted sales invoice is never amended: within 24 h the IRN is cancelled, after that a credit note (T25) |
| D8 | A row exists **from the first save** (his voucher row starts at Submit) | An invoice can wait for the customer's PO (K9). Mode A drafts are listed |
| D9 | Approve **re-runs every check**, then Issue → Register → Post in one transaction. The IRP is outside: if it refuses, the invoice stays **issued** (number kept, nothing posted) and is retried | His `_approve`. G24 is covered |
| D10 | **IRN cancel ≤ 24 h** (reasons 1–4): ReverseJournalEntry writes the exact mirror; the number is kept, never reused; the challan lines are free to bill again | Rule 48 / IRP. Step 8 and G6 of the screen are built |
| D11 | The credit note (T25 mock) leaves the invoice **posted** | The law keeps the invoice; the credit note is a document of its own |
| D12 | The entry is **stored** (`fin.sales_invoice_entry_line`, the twin of `purchase_invoice_line`), with `origin` (rule, changed, added), `posting_rule_id` and `reason`. Posted 1:1 to `journal_line` | I8: the engine fills, the AE may edit with a reason. What Rajan approves is what posts |
| D13 | Codes from the CA's chart. **Round Off is proposed as 505120** (Other Expenses – Administrative), not 506090 (a selling expense). TCS Payable is proposed as 206014 | The CA's chart has no round-off; it is not a selling cost. Still G18 |
| D14 | Every check has a **code** in his style (e.g. `QUANTITY_ABOVE_CHALLAN`), shown in the app; the same codes name the gates and the `CHECK`s | Release check 5: app rules become schema checks |
| D15 | `fin.posting_rule` holds which rule, version and case wrote each line (SALES_INVOICE v1, R1–R7, from 1-Apr-2026) | Engine model: every JE links to its rule version. Here that link runs JE → invoice → entry line → rule |
| D16 | **No outbox** in T24: we follow the built engine (approval posts in the same transaction) | G14 stays with the team lead; adding the outbox later is additive |
| D17 | **No AR open-item table**: the open item is the invoice (due date) plus its journal line naming the account | Manoj's subledger is a view. Bill-wise allocation comes with receipts (G29) |

### 13.2 The app (rev 2)

- **Built:** the issuer branch on A3, with a select in mode B. Branches are KA-01 Bengaluru plant and HQ (`29AAECA0000A1ZQ`) and TN-01 Hosur unit (`33AAECA0000A1Z1`), as his seed.
- **The receivable ledger** replaces the control ledger everywhere.
- **The AM's three decisions.** Approval re-runs the checks (`APPROVAL_REFUSED`).
- **"Approves · IRP down"** leads to Issued; "Venkat retries" then posts it.
- **"Cancel IRN (h left)"** opens the IRP reason codes; the entry is reversed and the number kept.
- **Every check shows its code.**
- **Posting rules page:** the account types and the check codes.
- **Books page:** the subledger ties to the receivable ledgers.
- **Tests:** 53 pass (T12 21, T24 32: 23 updated, 9 new). Type-check and build are clean.
- **Screenshots:** the draft, with Rajan, issued without an IRN, confirmed, the entry tab, the cancel dialog, cancelled, TN-01 typed, the posting rules.

### 13.3 The tables: 16 for T24 (9 new, 5 Manoj's books core, 2 stubs)

Source: `customer_onboarding_schema.dbml` rev 5 (40 tables, 537 columns, 98 refs, 86 CHECKs) → `out.sql`.

| Table | Owner | What it holds |
|---|---|---|
| `fin.sales_invoice` | **T24** (58 columns, 31 CHECKs) | The header (A, B, D, E), the stage, the maker and checker, the number, the buyer and totals as issued, the journal and reversal ids |
| `fin.sales_invoice_line` | **T24** | C1–C16: what the customer is billed |
| `fin.sales_invoice_entry_line` | **T24** | The entry as it will post, and who wrote each line |
| `fin.sales_invoice_history` | **T24** | One row per version (append-only) |
| `fin.e_invoice` | **T24** | IRN, ack, QR, attempts, error, cancel (≤ 24 h CHECK) |
| `fin.e_way_bill` | **T24** | Part-A from the invoice; Part-B (vehicle) is Stores' |
| `fin.document_series` | **T24** | The GST number per branch, per FY, per document type |
| `fin.posting_rule` | **T24** | SALES_INVOICE v1, R1–R7, effective dated |
| `fin.export_lut` | stub (S3, G19) | Our LUT per GSTIN per FY |
| `sales.delivery_challan`, `_line` | stub (Sales / Stores slice, G30) | Only what the invoice reads |
| `fin.branch`, `fin.fiscal_year`, `fin.document_sequence`, `fin.journal_entry`, `fin.journal_line` | **Manoj's, as built** | One change: `journal_entry.voucher_type` + `sales` |

**Also changed (sync with what he built):**
- `fin.ledger_account`: no `is_control`; it gains `account_type` (+5 values), `since` and `until`.
- `fin.debtor_account`: `control_ledger_code` → `ledger_account_code`; it gains the identity key and clocks.
- `fin.debtor_location`: two keys added.
- `fin.gst_state_code`: `iso_3166_2` is nullable, and 96 is seeded.

### 13.4 The seven release checks (CLAUDE.md §3)

| # | Check | Result |
|---|---|---|
| 1 | Every field has a home | §13.5 below: 72 fields. Each is a column, or worked out (stated), or read from a master. **One has no home: G5 "sent to the customer"** (the send is not built): gap G31 |
| 2 | The next task reads it | §13.6 below: T25, T26, T13, T18, GSTR-1, T27 |
| 3 | Twin diff by script | Against his built `purchase_invoice` (26 → our 58 columns), `purchase_invoice_line` (9 → 13), `purchase_invoice_history` (10 → 10, the same). **His columns we don't have:** `amends_*`, `original_*`, `revision_no` (no amendment, D7); `supplier_invoice_key`, `invoice_financial_year` (his guard on the supplier's number; ours is a unique number per branch, and the FY is the series'); `inventory_item_code` (a sales entry never posts stock: cost is the challan's). **Our extra columns:** the sales fields (A–E), totals, the buyer copy, issue, reversal, discard, and the entry's `line_role`, `origin`, `posting_rule_id`, `rule_ledger_account_code`, `reason`. All deliberate |
| 4 | Links by script | 79 `*_id` columns in the 16 tables. Each has a foreign key, or is the table's own key, or has a reason: `journal_entry.source_document_id` (purchase or sales: his design), `sales_invoice_history.acting_on_event_id` (no event table, G14), `journal_line.creditor_account_id` (his vendor table, not drawn in this file; its key exists in his 0005). PostgreSQL export done |
| 5 | App rules become schema checks | Each app check carries a code (§7 + `CHECK_CODE` in `rules.ts`). Where the fact is on one row it is a `CHECK` (maker ≠ checker, totals add up, IGST only inter-state, number format, locked lines, a reason on an edit, cancel ≤ 24 h …). The rest are gates listed on `fin.sales_invoice` |
| 6 | Sync before release | Read his repo today (`923409b`). Decisions since 6-Nov: no control ledger (**followed**); books core built (**reused**); Accounts Manager alone approves a customer (T12: **to agree**, G9); outbox removed (**to agree**, G14); placeholder ledger codes and all categories on 107010 (**to agree**, G28); a typed purchase entry (ours stays engine-filled, I8: **deliberate**) |
| 7 | Files, with counts | `customer_onboarding_schema.dbml` (40 tables, 537 columns, 98 refs, 86 CHECKs) · `out.sql` (PostgreSQL: 3 schemas, 40 tables, 98 foreign keys, 86 CHECKs, 8 partial indexes) · `t24_schema_test.sql` (B4-01 + 19 refusals). **Run on PostgreSQL 18: 0 errors; 19 / 19 refused as expected** |

**Faults of ours, found by running `out.sql` on PostgreSQL (rev 4), fixed in rev 5:**
1. Six partial unique indexes were exported as full ones. One of them would have allowed only one GSTIN per customer.
2. The two one-to-one links to `pc.private_anchor` were exported in the wrong direction, so no row could be inserted.
3. `iso_3166_2` was NOT NULL, but codes 96, 97 and 99 have no state.

The lesson: parsing is not enough; **run** the SQL. This is now part of check 4.

### 13.5 Every field has a home (check 1)

| Fields | Home |
|---|---|
| A2 · A3 · A6 · A7 · A8 · A11 · A12 · A13 · A14 · A15 | `sales_invoice`: operated_party_id · branch_id · invoice_no · invoice_date · posting_date · customer_po_no · customer_po_date · reverse_charge · currency_code, exchange_rate · narration |
| A1 · A4 · A5 · A9 · A10 | Worked out or read: the type from supply_type_code · dispatch from the challan's branch · the series from `document_series.prefix` · `delivery_challan_id` (mode A) or the lines' `delivery_challan_line_id` · the order from `delivery_challan.sales_order_no / date` (stub) |
| B1 · B3 · B4 · B5 · B6 · B8 · B9 · B11 · B13 | `sales_invoice`: debtor_account_id · bill_to_location_id + bill_to_address · buyer_gstin · supply_type_code · ship_to_location_id + ship_to_address · place_of_supply_code · is_inter_state · due_date · e_commerce_gstin |
| B2 · B7 · B10 · B12 | buyer_legal_name (copied at Issue; the trade name is read from P&C) · the ship-to GSTIN in `ship_to_address.gstin` · read from `debtor_account` (po_reference_rule, invoice_delivery_channel) · worked out from `journal_line` |
| C1–C16 | `sales_invoice_line` (C17: `sales_invoice_entry_line`, role revenue; C18 margin: worked out, not stored) |
| D1–D5 · D7 | `sales_invoice` amounts (D6, the amount in words, is worked out) |
| E1 · E2 · E4 · E5 · E6 · E7 | export_type · export_lut_id · destination_country_code · port_code · shipping_bill_no / date · buyer_gstin (E3, the endorsement, follows export_type) |
| F1–F4 · F6 | `e_way_bill`: transporter_name · vehicle_no · distance_km · transport_doc_no · ewb_no, valid_until (F5 is worked out) |
| G1 · G2 · G3 · G4 · G6 | `e_invoice` (irn, ack_no, ack_at, signed_qr) · `e_invoice` (status, attempt_count, last_error_*) · journal_entry_id + `entry_line.posting_rule_id` · the invoice + `journal_line` (a view) · `e_invoice.cancel_*` + `reversal_journal_entry_id` |
| **G5** | **No home yet**: the send to the customer is not built (G31) |
| The AE's edit · Rajan's decision · the discard | `entry_line.origin, reason` · decided_by_contact_id, decided_at, decision_reason · discard_reason, challan_sent_back |

### 13.6 The next tasks that read it (check 2: the six questions, briefly)

| Next task | Reads | Ready? |
|---|---|---|
| T25 credit note · T26 debit note | invoice_no, invoice_date, the lines (HSN, rate, tax by head), irn (Rule 53: the original invoice) | Yes. Each needs its own series (`document_series.document_type`) and rule (`posting_rule.rule_code`) |
| T13 advance against an order | debtor_account_id, total, due_date | Partly. The adjustment needs an allocation (receipt → invoice) that no task here owns: G29 |
| T18 AR reconciliation | `journal_line` grouped by debtor_account_id vs the receivable ledgers | Yes: the same lines, so they tie by construction |
| GSTR-1 (Compliance) | lines by HSN and rate, supply_type_code, buyer_gstin, place_of_supply_code, e_invoice | Yes |
| T27 dispatched not billed | challan lines − invoiced quantity (submitted, issued, posted) | Yes, on the challan stub |

### 13.7 Gaps opened or changed in rev 2

| ID | Gap | Kind | Home |
|---|---|---|---|
| G27 | Month-level period close (soft / hard, the app's K7 / K8): the books core closes only whole years | New task | S1 (books and periods) |
| G28 | One chart. His placeholder codes clash with the CA's: 2010nn (CA: Term Loans), 103010 / 103020 (CA: Goodwill, Software), 108010–108030 (CA: Cash, Bank), 203010 (CA: Provision for Gratuity), 501010–501030 (CA: Raw Material Consumed, Purchase – Traded Goods, Change in Inventory). Also all 16 categories point at 107010, though the CA's chart has 107010–107130 | Other owner | Manoj + the CA |
| G29 | Receipts and bill-wise allocation (receipt → invoice) | New task | Not on this card (treasury / collections): ask |
| G30 | The delivery challan and the sales order are stubs (`sales.*`) | Other owner | The Sales / Stores slice |
| G31 | G5 "sent to the customer": no record yet | In a task | T24 (a later revision) |
| G24 | IRP refusal after Issue | — | **Covered** (rev 2: stage issued, retry) |
| G12 | Receivable codes in the old UI | — | **Covered** (rev 1 design, rev 2 built) |
| G7 | Our branches | — | **Partly covered**: Manoj's `fin.branch` (the S3 stub) is used by T24; S3 still owns the rest (number series per GSTIN is now `document_series`) |

---

## 14. Rev 3 (16-Nov): checked against the CA's 43 specimen invoices

**Input I15 (16-Nov, the CA through Vijay):** 43 specimen sales documents with the entry each must post (`docs/sales/shared_doc_reference/`: `Specimen_Sales_Invoices_All_43.pdf`, `expected_postings.json` / `.csv`).

**I16 (Vijay):** we build each task ourselves and hand it to Manoj to merge. The CA's documents are the business source: we follow them and question what we doubt. The specimens are another company's (ABC Industries); we take their **rules**, not their names or numbers.

### 14.1 Two faults of ours, corrected

| # | Specimen | Was | Now (app, schema, test) |
|---|---|---|---|
| F1 | C2, C4, C6: export / SEZ **with IGST** | R5 / R6 made the buyer owe the IGST (₹9,86,832 on B4-09) | The buyer owes the value only (₹9,39,840). **Dr IGST Refund Receivable** 109040 (proposed). Stored as `igst_refund_amount`, `payable_amount`, with CHECKs |
| F2 | D4: bill-to Maharashtra, goods to a third party's site in Karnataka | The place of supply was always the ship-to state, which gave CGST + SGST | A third-party ship-to → the **bill-to state** (IGST s.10(1)(b)) → IGST. Stored as `ship_to_third_party`, `place_of_supply_basis`, with CHECKs |

### 14.2 Added (the fields the specimens show)

| Specimens | Field / rule | Where |
|---|---|---|
| A5, A6, B4 | Line taxability (nil-rated, exempt, non-GST) → R9, 401050 (proposed); every line untaxed → **Bill of Supply**, its own series (KA/BOS/2627/) | C20 · `sales_invoice_line.taxability`, `sales_invoice.document_type` |
| C1–C4 | Export invoice: its own series (KA/EXP/2627/); **Incoterm** | A1, E8 · `document_type`, `incoterm_code` |
| A3, A4 | B2C (B2CS, B2CL above ₹1 lakh inter-state); **paid at once** (cash, UPI / card → R8, clearing ledger, no customer needed for B2C) | B5, B14 · `supply_type_code`, `settlement_mode`; `debtor_account_id` NULL only for a B2C sale paid at once |
| A8 | Freight charged: part of the value, taxed at the goods' rate → R10, 401070 (proposed) | C4 line kind `charge` |
| B5 | Pure-agent expense: outside the value, no GST → R11, 110030 (proposed) | C4 line kind `reimbursement`; D9 |
| B6 | Service period from–until; revenue → Contract Liability 206040 (proposed), R12 | C19 · `service_period_from / _until` |
| B3 | Place of supply at the property (IGST s.12(3)) | B8 · `place_of_supply_basis` |
| C8 | Concessional rate's notification (0.1 %, 40/2017) | C20 · `concession_notification` |
| C8, D5 | The buyer's order reference | A16 · `order_ref` |
| D7-b | "Against receipt voucher …", the advance adjusted (T13 posts it) | A17 · `advance_receipt_ref`, `advance_adjusted_amount` |
| All | Title per document type, ORIGINAL FOR RECIPIENT, declarations per case, the amount payable | Print view |
| — (law) | **An IRN only for B2B, export and SEZ**: a Bill of Supply or B2C posts at approval without one (`E_INVOICE_NOT_APPLICABLE`) | Store; K10 |

### 14.3 The proof

- **The posting rule is one pure function** (`app/sales/src/sales/engine.ts`): facts in, the entry out. The screen and the test both call it.
- **The CA's answer keys:** `casebook.test.ts`. All 43 specimens are accounted for. **24 are T24's, and all 24 post exactly what the CA expects.** The other 19 are placed with their home.
- **App:** 88 tests pass (T12 21, T24 41, CA keys 26). Type-check and build are clean. Screens checked: third-party ship-to, freight and pure-agent lines, the export with IGST entry, the Bill of Supply print.
- **Schema** (dbml rev 6, 40 tables, 553 columns, 98 refs, 106 CHECKs). On PostgreSQL 18:
  - B4-01 posts;
  - **25 / 25 wrong rows are refused** (N20–N25 are new: F1, F2, Bill of Supply with tax, pure-agent with GST, credit sale with no customer, advance above what is owed);
  - a B2C UPI sale with no customer is accepted.

### 14.4 Placed, not built here

- **T25 / T26:** E1–E4.
- **T13:** D6, D7-a, D7-b (the adjustment), D8.
- **Receipts (G29):** the receipt halves of A9, B1, B8 and D5.
- **Stores / new flows:** D1, D2.
- **S3 (G7):** D3, the stock transfer to our own GSTIN.
- **G32:** D5, the marketplace as the debtor.
- **G33:** B6's monthly release of deferred revenue.
- **Ask:** A10, the sale of a fixed asset.
- **Not our books:** B7, D10.

### 14.5 Questions for the CA (G34)

1. **The proposed ledgers** (not in the chart): 108030 UPI / Card Clearing, 109040 IGST Refund Receivable, 110030 Expenses Recoverable, 206040 Contract Liability, 401050 Sales – Exempt, 401070 Freight Recovered. Also the earlier ones: 206011–206014 and 505120.
2. **Separate revenue ledgers?** The specimens name separate ledgers for B2C, deemed export, merchant export, export services and SEZ. The chart has only 401010 / 401020 / 401030, so we map to those.
3. **Round off:** B4 absorbs ₹0.04 into revenue; we post it to Round Off. Which does the CA want?
4. **High sea sale (C9)** and **sale of a fixed asset (A10):** whose task are they?

---

## 15. Rev 4 (18-Nov): only the sales invoice; the challan is a read-only source

**Input I17 (18-Nov, Vijay):** T24 is the sales invoice entry only. The delivery challan is a separate Stores task (**G30**), with its own UI, schema ownership, posting rule and proof. Keep the challan as the invoice's read-only source (dispatched items, quantities, unbilled quantities). An invoice may never bill above the unbilled quantity. Keep the screen clean: the invoice opens full screen, with the invoice itself small at the right.

### 15.1 Removed from T24 (now G30's)

| Was in T24 | Why it went | Now |
|---|---|---|
| "Latha records DC-…" (mock: play Stores) | Recording a challan is Stores' event | G30 |
| The challan's cost entry (Dr 501030 · Cr 106020), seeded and on record | The goods leaving the store post on the challan, not the invoice | G30's posting rule (GOODS_ISSUE) |
| The cost-entry panel (source card, Accounting entry tab) | Same | One line: "Stock and cost of goods sold are posted by Stores' delivery challan (G30)" |
| The Perpetual / Periodic switch (Posting rules) and the Stock view (Books) | Inventory setup (S4) and Stores | S4, G30 |
| 2 tests (the cost entry; Periodic) | Same | Replaced: "T24 posts no stock and no cost" |

### 15.2 Kept

- **The invoice's own accounting:** Dr the customer · Cr revenue · Cr output GST (R1–R12). Unchanged; 24 / 24 CA answer keys pass.
- **The challan as a read-only source,** at the top of the Invoice tab: per line dispatched, billed before, unbilled, this invoice. A line above the unbilled quantity turns red.
- **K3 QUANTITY_ABOVE_CHALLAN:** a Stop at Submit and again at approval. The quantity is kept as typed (not cut), so the AE sees why. New test: a second invoice on lines already with Rajan is stopped.
- **The margin (C18, K14)** still reads the item's standard cost: a check on the price, not a posting.

### 15.3 The screen

- The list (rail and a home page: To bill, every invoice) stays. **An invoice opens as a full-screen modal**; Esc or ✕ closes it.
- Left: the form (tabs). Right, 340 px: **the invoice, small** (live; click to open full size and print), then the checks and Submit.
- The source card's customer facts moved into section B (credit position after this invoice, B12; the receivable ledger, B15).

### 15.4 The schema

**No column, key or CHECK changed.** Notes only, so the owner of each challan field is written down:

- `sales.delivery_challan`: G30 writes every column; T24 only reads. One exception: `status = returned` when the AE sends a challan back.
- `cost_journal_entry_id`: **owned by G30**, NULL until G30 is built; T24 never writes or reads it.
- `sales.delivery_challan_line`: the unbilled balance is a query; K3 is checked in the service (a sum across rows, so not a CHECK).

**Proof:** the dbml exports exactly to `out.sql` (only 3 comments differ from rev 6); on PostgreSQL 18, 40 tables and 553 columns, B4-01 posts, 25 / 25 wrong rows refused. App: 88 tests pass (T12 21, T24 41, CA 26); type-check and build clean; screens checked.

---

## 16. Rev 5 (18-Nov): an independent invoice, built around the CA's 43 specimens

**Input I18 (18-Nov, Vijay):** the CA's specimen invoices (`Specimen_Sales_Invoices_All_43.pdf`) are independent invoices. Build T24 around them; do not assume a challan. The screen was too full: keep only what this phase needs. Vijay chose: remove the challan from T24, and remove the fields that are on none of the CA's invoices (listed, not lost).

**Replaces I17's "challan as a read-only source"** (rev 4). Rev 4's other decisions stand: stock and cost of goods sold are the Stores task (G30); the invoice opens full screen with the invoice small at the right.

### 16.1 What the 43 specimens show (counted from the PDF)

| On the CA's invoices | How many | T24 rev 5 |
|---|---|---|
| Document no. · Date · Place of supply · Reverse charge | 43 / 43 | Section 1 |
| E-invoice (IRN, Ack no., Ack date) | 30 | After approval; printed |
| E-way bill | 14 (goods moving) | Transport section: vehicle, distance; the number on approval |
| Bill to (Recipient) · Ship to / Delivery at | all | Section 2: from the customer master; third-party ship-to |
| Lines: Description · HSN/SAC · Qty · UQC · Rate · **Disc.** · Taxable · GST % · CGST + SGST or IGST · Total | all | Section 3: item, qty, rate, discount typed; HSN, UQC, GST from the item |
| Tax summary by rate · amount in words · tax in words · amount payable · declarations · bank · signatory | all | Section 4 and the printed invoice |
| Case fields: Payment ref (A3), Delivery state (A4), Location of property (B3), Currency / Shipping bill / Port / Incoterm / Country (C1–C4), Export order ref (C8), Against receipt / Advance adjusted (D7-b) | their case only | Shown only when the case applies |
| Delivery challan, sales order, customer PO, batch, expiry, godown, margin | **0** | Removed |

### 16.2 Removed (listed in "Built with" as removed)

| Field / check | Why | Where it lives now |
|---|---|---|
| A9 challan, C2 challan line, K2–K5 (the challan checks) | On no CA invoice | Stores task G30 |
| A10 sales order, A11 / A12 customer PO, K9 | On no CA invoice | A buyer's order number can be typed as the order reference (A16). See G35 |
| C7 batch / expiry, K13 | On no CA invoice | Stores (G30) |
| C18 margin, K14 | Not on the invoice; cost is Stores' | — |
| A4 godown, F1 transporter, F4 LR no. | On no CA invoice | — |
| B10 billing instructions, B12 credit position, A8 posting date, A15 narration | Not on the invoice | K15 still warns on the credit limit; the narration is written by the system |
| B13 e-commerce GSTIN | The marketplace sale is G32 | G32 |

### 16.3 Added

- **The line discount** (Disc., the CA's A8), K6 `DISCOUNT_ABOVE_LINE_VALUE`.
- **A typed rate** per line (prefilled from the item's list price).
- **Transport** (vehicle, distance) for the e-way bill; the distance is required when an e-way bill is due.
- **The payment reference** of a sale paid now (the CA's A3).
- **The printed invoice in the CA's layout.**

### 16.4 Schema rev 7

- +3 columns on `fin.sales_invoice`: `transport_vehicle_no`, `transport_distance_km`, `payment_reference` (release check 1: every typed field has a home).
- +2 CHECKs: `sales_invoice_transport_distance_positive`, `sales_invoice_paid_now_has_reference`.
- **Nothing dropped.** `entry_mode` is always `typed`. The challan, PO and e-commerce columns stay, nullable; T24 leaves them NULL.
- The B4-01 proof is now a typed invoice with no challan.

### 16.5 Proof

- **App:** 85 tests pass (T12 21, T24 38, CA keys 26). Type-check and build are clean. Screens checked: the home list, the full-screen invoice, a new typed invoice with a discount, and the printed invoice.
- **CA answer keys:** 24 / 24 still pass. The posting rule is unchanged.
- **PostgreSQL 18:**
  - 40 tables, 556 columns, 98 foreign keys, 108 CHECKs;
  - B4-01 posts;
  - **27 / 27 wrong rows are refused** (N26, N27 are new).

### 16.6 Ledger choice: suggested, then picked by the AE (Vijay, 18-Nov)

**Input I19:** we have not concluded that ledgers are given automatically; for now the choice is manual. The engine's ledger is the default; the AE may pick another.

- **On the Accounting entry tab:** every line that is not locked has a searchable list.
  - The suggested ledger comes first, marked "suggested".
  - Typing filters the list and sorts it: code matches, then words of the name, then anything containing the text.
  - The list holds postable ledgers only: never a group, never a receivable ledger.
- **Locked:** the customer line and the tax lines, so the books agree with the invoice and the IRN.
- **Reasons:**
  - A picked ledger needs **no reason**.
  - A changed amount or an added line still needs one ("Change amounts / add lines").
  - Rajan sees every difference from the suggestion ("Entry differs from rule R1: line 2").
- **Schema:**
  - `sales_invoice_entry_line.origin` gains `picked`, whose reason is optional.
  - +1 CHECK: `sales_invoice_entry_line_picked_names_the_suggestion`.
  - On PostgreSQL, a picked line with no reason is accepted; a changed one without a reason is still refused.
  - Totals: 556 columns, 109 CHECKs.
- **App:** 87 tests pass (3 new: picking, picking back, the sort order).

### 16.7 The customer and GST lines too (Vijay, 18-Nov)

**Input I20:** "you only suggest; why lock?" Every ledger on the entry is now a suggestion, the customer and GST lines included.

| Line | Ledger | Amount |
|---|---|---|
| Customer | Picked among the **receivable ledgers**; the line still names the customer account | = what the buyer owes (locked) |
| CGST / SGST / IGST | Picked among postable ledgers | = the invoice's tax (locked: it is printed on the invoice and sent to the IRP) |
| Revenue, round off, added | Picked; amounts editable under "Change amounts" | — |

- **Why the amounts stay:** the GST on the entry must equal the GST on the invoice and the IRN, and the customer line must equal what the buyer owes. Changing them means changing the invoice lines.
- **Guards:**
  - an output tax ledger may hold only its own head's tax line;
  - never a group ledger;
  - the customer line only on a receivable ledger.
- **Schema:**
  - `entry_line` lets the customer, settlement, refund and tax lines be `picked`;
  - a picked customer line keeps `debtor_account_id` and stores the picked receivable ledger.
  - On PostgreSQL this is accepted, a changed tax amount is still refused, and 27 / 27 pass.
- **To agree with Manoj (G36):** his journal's commit check `ACCOUNT_NOT_ON_ITS_LEDGER` posts a customer line only to its account's own ledger.
- **App:** 88 tests pass.

### 16.8 Schema rev 8: the challan tables removed (Vijay, 18-Nov)

**Input I21:** "why are the challan tables still there; what is the need?" There is none: since rev 5 the invoice is independent, and a stub is the smallest table the current task needs.

- **Removed:**
  - the tables `sales.delivery_challan` and `sales.delivery_challan_line` (the whole `sales` schema), with their 10 refs;
  - on `fin.sales_invoice`: `delivery_challan_id`, `entry_mode`, `challan_sent_back`;
  - on `fin.sales_invoice_line`: `delivery_challan_line_id`, `rate_from_order`, `batch_no`, `batch_expiry_date`;
  - on `fin.e_way_bill`: `delivery_challan_id`;
  - with them 9 CHECKs and 2 indexes.
- **Now:** 38 tables, 519 columns, 100 CHECKs, 88 foreign keys.
- **Proof on PostgreSQL 18:** B4-01 posts; 27 / 27 wrong rows are refused; the picked-ledger rows and the B2C UPI sale are accepted.
- **Later:** the Stores task (G30) designs its own challan and adds an invoice link only if a later task needs one.
- **App:** untouched (it no longer used the challan since rev 5).

### 16.9 Schema rev 9: 5 unused columns removed; every table shown in full (Vijay, 18-Nov)

**Input I22:** the walkthrough must show the T24 tables expanded, with the example. And why does the invoice table still have so many columns?

**Removed** (nothing filled them, nothing read them):
- on `fin.sales_invoice`: `customer_po_no`, `customer_po_date`, `e_commerce_gstin`;
- on `fin.e_way_bill`: `transporter_name`, `transport_doc_no`.

**Now:** 38 tables, 514 columns, 100 CHECKs, 88 foreign keys.

**Why `fin.sales_invoice` still has 67 columns** (the screen shows about 16 fields):

| Group | Columns | What they are |
|---|---|---|
| Key | 7 | Ids, version, clocks |
| Typed by the AE | 19 | Most fill only in their case (export, paid now, advance, third party) |
| Worked out by the system | 24 | Document type, place of supply, tax per head, totals, due date, narration |
| Copied at approval | 6 | The number, the buyer's name, GSTIN and addresses: a printed invoice never changes |
| Approval trail | 11 | Stage, who and when, reasons, the journal entry |

**The walkthrough's new section "Every T24 table in full":**
- 14 tables: 9 new and 5 of Manoj's;
- every column with B4-01's real values, read from PostgreSQL after posting;
- for the invoice, where each value comes from.

**The B4-01 proof walk is now complete:**
- a history row at every step (save, submit, issue, post);
- the narration set at Issue;
- the scenario's times on the rows.

**Proof:** 27 / 27 wrong rows are refused.

### 16.10 Schema rev 10: the invoice table matches the screen; the diagram is grouped (Vijay, 18-Nov)

**Input I23:** "the sales invoice doesn't contain this many fields; why doesn't the UI match the backend? In the diagram I can't see what is P&C, what is T12, and what is new."

**Removed** (they only repeated a value or held a constant):

| Column | Why |
|---|---|
| `posting_date` | Always = `invoice_date`; the journal entry keeps its own |
| `reverse_charge` | Always No for our sales; printed as a word |
| `narration` | Written into `fin.journal_entry.narration` |
| `cess_amount` (invoice and line) | Nil; on none of the CA's invoices |
| `tcs_amount` | The rate waits for the CA (G18); added when confirmed |

**The invoice now has 62 columns**, each in one of 5 groups (the table's note in the dbml):

| Group | Columns | Notes |
|---|---|---|
| Key | 7 | |
| Typed by the AE | 19 | Only in their case: export, paid now, advance, third party |
| Worked out | 19 | Shown on the screen, never typed |
| Copied at approval | 6 | Frozen for the printed invoice |
| Approval trail | 11 | Who, when, why |

**Why the screen shows fewer fields than the table holds:**
- the screen shows what Teja types and the totals;
- the table also keeps what the system works out, the frozen copy and the trail.

**The diagram, grouped:**
- **In the dbml:** 4 colored `TableGroup`s plus a header color on every table:
  - P&C (teal), 11 tables;
  - T12 (indigo), 13 tables;
  - the books core (amber), 5 tables;
  - T24 (green), 9 tables.
- **In the walkthrough:** a new picture, "The whole database at a glance", with the same 4 lanes, every table with its column count, and the 9 key links labelled in words.

**Now:** 38 tables, 508 columns, 99 CHECKs, 88 foreign keys.

**Proof on PostgreSQL 18:** B4-01 posts; 26 / 26 wrong rows are refused (N18 retired with `posting_date`).

### 16.11 Rev 11: every invoice column mapped to the screen (Vijay, 18-Nov)

**Input I24:** "where do we enter all these in the UI? We design the tables for this screen."

- **Answer:** 57 of the 62 `fin.sales_invoice` columns are typed or shown on the screen.

  | Screen area | Columns |
  |---|---|
  | Header | 4 |
  | 1 · Invoice | 9 |
  | 2 · Bill to / ship to | 10 |
  | 4 · Totals | 10 |
  | Export | 10 |
  | Transport | 2 |
  | Only when it applies | 2 |
  | After approval | 2 |
  | Approval & history and side notes | 8 |

- **The other 5:** the system columns every table has (`sales_invoice_id`, `workspace_id`, `operated_party_id`, `version_number`, `updated_at`).
- **Where it is written down:** the walkthrough's full table gives each column's exact place.
- **Removed:** `fin.sales_invoice_line.concession_notification`. The screen has no field for it, so the line table now has 22 columns, each a column of "3 · Lines".
- **Now:** 38 tables, 507 columns.
- **Proof on PostgreSQL 18:** B4-01 posts; 26 / 26 wrong rows are refused.

## 17. Rev 12 (18-Nov): the AE books the voucher; the invoice is Billing's

**Input (Vijay, 18-Nov):** "As accounting executive I see only the accounting part. The invoice screen is a handoff for me. I don't store the sales invoice: it comes, I select the ledgers, the debit / credit and GST entry, and submit."

**The six questions (CLAUDE.md §6):**

| # | Question | Answer |
|---|---|---|
| 1 | Which slice? | Billing raises the invoice; the Accounts Executive books its voucher |
| 2 | Which business event? | `sales.invoice.issued` (Billing) → the AE's voucher → approved |
| 3 | Recognised? | Yes: a sale (revenue, receivable, output GST) |
| 4 | Which rule? | SALES_INVOICE v1, R1–R12: it suggests the ledgers; the AE may pick others |
| 5 | Which entry? | B4-01: Dr Sri Lakshmi (107100) 7,48,125.00 · Cr 401010 7,12,500.00 · Cr 206011 17,812.50 · Cr 206012 17,812.50 |
| 6 | Which exception? | A wrong invoice → "return to Billing" (reason); closed period → stop; sent back / rejected by Rajan |

**What changed:**

| | Before (rev 2–11) | Now (rev 12) |
|---|---|---|
| The AE's work | Typed the invoice, then its entry | Books the entry of Billing's invoice |
| Invoice number, IRN, e-way bill | Ours (at approval) | Billing's (arrive with the invoice) |
| Screen | "Raise a sales invoice" | "Book a sales voucher": Accounting entry · Invoice from Billing (read-only) · Why each value · Approval & history |
| Stages | draft, submitted, issued, posted, cancelled … | draft (received), submitted, posted, rejected, returned |
| T24 tables | 9 (62-column invoice, lines, entry, history, IRN, e-way bill, series, LUT, rule) | **4:** `sales_voucher` (25), `sales_voucher_line` (13), `sales_voucher_history` (9), `posting_rule` (8) |
| Database | 38 tables, 507 columns | 33 tables, 405 columns |

**Proof:** app 72 / 72 tests (T12 21, T24 25, the CA's answer keys 26); build clean; screens checked (inbox, entry, invoice tab, posted). PostgreSQL 18: B4-01 posts; 16 / 16 wrong rows refused (`t24_schema_test.sql`).

**Open:** G37 Billing's task and its event (other owner) · G36 a picked receivable ledger vs Manoj's commit check · G18 the proposed ledger codes (the CA).

## 18. Rev 13 (18-Nov): one voucher design for every type

**Input (Vijay, 18-Nov):** sales, receipt, purchase … are all types of voucher; design the tables once, efficient and scalable. The walkthrough was too complex: make it straight to the point, with each table's fields and an example.

| | Rev 12 | Rev 13 |
|---|---|---|
| Header | `fin.sales_voucher` (25) | `fin.voucher` (26): + `voucher_type`, `creditor_account_id`, `source_event_id`, `due_date`, `narration`; − the 4 GST amounts |
| GST | on the header | `fin.voucher_gst` (7): only for sales, purchase, credit / debit note |
| Lines | `fin.sales_voucher_line` (13) | `fin.voucher_line` (14): + `creditor_account_id`; origin `typed` for vouchers with no rule (journal) |
| History | `fin.sales_voucher_history` | `fin.voucher_history` |
| A new voucher type | 3 new tables | **no new table**: a `voucher_type` value, its rules, its number series |

**Moved from a CHECK to a gate:** "the customer line is Dr" (a sale debits the customer, a receipt credits it: the rule decides).

**Proof:** PostgreSQL 18: B4-01 posts; 20 / 20 wrong rows refused; a receipt voucher (RV-0001) sits in the same tables. Database: 34 tables, 414 columns. App: unchanged (72 / 72 tests).

**Walkthrough rebuilt:** in one minute · the map · the design rules · the T24 flow · every table with every field, a real example and a plain meaning (414 / 414) · what the database refuses · answered twice · open points.

**To agree (G38):** Manoj's `purchase_invoice` becomes voucher_type `purchase`.

## 19. Rev 14 (18-Nov): Manoj's model, on the customer side

**Input (Vijay, 18-Nov):** analyse how Manoj built the purchase voucher (engine repo `aikyat-business-engine-poc`, branch `manoj/vendor-backend-model`, commit 923409b): `purchase_invoice` + `_line` + `_history` are the voucher, and posting writes only the 2 shared journal tables. Do the same for sales, so the hand-over is clean. Rev 13's common voucher is withdrawn.

**His model, as read (migration 0005, `purchase_invoice.py`, `journal.py`):**
- 3 tables per voucher type, 1 shared book (`journal_entry`, `journal_line`, 8 commit rules).
- No GST columns: GST is lines on the Input GST ledgers (`account_type`); gates check the head (same state → CGST + SGST).
- No rule table: rules R1–R6 propose the form in code; nothing about them is stored.
- Created at Submit; stages submitted → posted | rejected | draft (sent back); posted → amended by an approved correction (reverse + repost).
- Never twice: an EXCLUDE on (vendor, invoice number ignoring case and spaces, financial year), sharing allowed inside one correction chain.

| His | Ours (rev 14) | Difference |
|---|---|---|
| `fin.purchase_invoice` (27) | `fin.sales_invoice` (26) | no `source_extraction_id` (no PDF; Billing hands over, G37); the customer may be empty (B2C paid at once); never-twice per branch (GSTIN), not per party |
| `fin.purchase_invoice_line` (9) | `fin.sales_invoice_line` (8) | customer line must be Dr (his vendor line Cr); no `inventory_item_code` (stock leaves by the challan) |
| `fin.purchase_invoice_history` (10) | `fin.sales_invoice_history` (10) | none |
| journal, branch, year, numbering | the same | `journal_entry.voucher_type` + `sales`; series `sales_invoice` (SV) |

**Name:** `fin.sales_invoice` is the voucher (as his `purchase_invoice`), not the 62-column invoice of revs 5–11. The screen keeps "Sales Voucher".

**Not stored any more (the app still shows them):** which ledger the rule proposed (recomputed for the Accounts Manager); "return to Billing" (a message to Billing, G37).

**Proof:** PostgreSQL 18: 32 tables, 394 columns. B4-01 posts; the correction SV-0012-1 reverses JE-233 and posts the new entry (the customer still owes ₹7,48,125.00); a sent-back voucher is sent again; a B2C UPI sale has no customer line; 24 / 24 wrong rows refused. Walkthrough rebuilt (his tables beside ours). App: unchanged.
