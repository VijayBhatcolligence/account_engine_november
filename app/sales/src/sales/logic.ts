// The logic behind every value the sales invoice fills in by itself, told twice:
//   business  what the CA / Accounts Manager hears ("how did you pick that ledger?")
//   engineer  which data it reads, which rule decides, where the result is stored
// Pure: the screen shows what this returns, with today's values filled in.

import { fmtDate } from '../domain/dates';
import { inr } from '../domain/money';
import { categoriesFor, OUR_STATE, STATES } from '../onboarding/catalogue';
import { COMPANY, costOn, ITEMS, LEDGERS, PARAMS, SERIES } from './catalogue';
import { accountOf, billingOf, branchOfV, calcOf, challanOf, dueDateOf, ewbDays, partyOfAccount, rupees, type SalesCtx } from './rules';
import type { Voucher } from './types';

export interface Logic {
  key: string;
  what: string;
  value: string;
  business: string;
  engineer: { reads: string; rule: string; stores: string };
}

export function logicOf(v: Voucher, ctx: SalesCtx): Logic[] {
  const a = accountOf(ctx, v.accountId);
  const p = partyOfAccount(ctx, v.accountId);
  const dc = challanOf(ctx, v.dcId);
  const c = calcOf(v, ctx);
  const bv = branchOfV(ctx, v);
  const gst = bv?.gstin?.value ?? '';
  const pos = c.pos ? STATES[c.pos] : null;
  const ours = STATES[OUR_STATE];
  const cat = a ? categoriesFor('receivable')[a.category] ?? a.category : '—';
  const bill = billingOf(ctx, a);
  const items = [...new Set(c.rows.map((r) => r.item))];
  const rateWords = c.rows.map((r) => `${ITEMS[r.item].name.split(',')[0]} ₹${r.rate}`).filter((x, i, xs) => xs.indexOf(x) === i).join(', ');
  const local = c.intra === true;
  const salesKey = local ? 'sales_local' : 'sales_interstate';

  return [
    {
      key: 'party',
      what: 'Party A/c',
      value: a ? `${a.name} (${a.accountId})` : '—',
      business: `The challan ${v.dcId} was loaded against sales order ${dc?.soId ?? '—'} for ${dc?.customer ?? '—'}. That customer was set up in onboarding as account ${a?.accountId ?? '—'}. You never pick the party: it comes with the order.`,
      engineer: { reads: 'delivery_challan.so_id → sales_order.customer → finance.party_account (side = receivable) → accounting.subledger_account', rule: 'invoice.account_id := the order\'s customer account; refused when there is no active account', stores: 'finance.sales_invoice.account_id' },
    },
    {
      key: 'control',
      what: 'Under (control account)',
      value: a?.under ?? '—',
      business: `At onboarding the customer was put in the category "${cat}". That category places its account under ${a?.under ?? '—'}: the header where the books add up what all such customers owe.`,
      engineer: { reads: 'finance.party_account.category', rule: 'accounting.account_determination(key_type = control, key = category) → control_account_id', stores: 'accounting.subledger_account.control_account_id (set once, at onboarding)' },
    },
    {
      key: 'pos',
      what: 'Place of supply',
      value: pos ? `${pos.name} (${pos.code})` : '—',
      business: `The goods are delivered to ${bv?.location?.city || p?.address.city || '—'} (${bv?.location?.label ?? 'the customer'}). The customer's GSTIN ${gst || '—'} starts with ${gst.slice(0, 2) || '—'}, the code of ${pos?.name ?? '—'}. For goods that move, the place of supply is where the delivery ends.`,
      engineer: { reads: 'the account\'s P&C location (party_account.location_id → pc.business_location, ship-to state) · its GST registration (party_account.gst_registration_id → pc.party_identifier IN_GST, digits 1–2) → gst_state_code', rule: 'IGST Act s.10(1)(a): place of supply = where the movement ends; the GSTIN prefix must agree (e-invoice pre-check)', stores: 'finance.sales_invoice.place_of_supply' },
    },
    {
      key: 'nature',
      what: 'Local or inter-state',
      value: c.intra === null ? '—' : local ? 'Local (same state)' : 'Inter-state',
      business: local
        ? `Our plant's GSTIN ${COMPANY.gstin} is also ${ours.name} (${ours.code}). Same state = a local sale: the tax splits into CGST and SGST.`
        : `Our plant is in ${ours.name} (${ours.code}), the customer in ${pos?.name ?? '—'} (${pos?.code ?? '—'}). Different states = inter-state: the whole tax is IGST.`,
      engineer: { reads: 'branch.gstin state (KA-01 → 29) · place of supply', rule: 'intra := place_of_supply = branch state', stores: 'finance.sales_invoice.supply_type (intra | inter)' },
    },
    {
      key: 'sales',
      what: 'Sales ledger',
      value: c.intra === null ? '—' : `${LEDGERS[salesKey].name} (${LEDGERS[salesKey].code})`,
      business: `It is a ${local ? 'local' : 'inter-state'} sale of our own products to a domestic customer (onboarding category "${cat}"). So: ${LEDGERS[salesKey].name}. An export customer (category Export) would go to export sales under the LUT instead. For now you type the ledger in the entry; the rule checks it against this and refuses a different one.`,
      engineer: { reads: 'supply_type · party_account.category (domestic / export)', rule: `posting rule ${'SALES_INVOICE / STAT v1'}: revenue line → account_determination(key_type = sales, key = ${local ? 'local' : 'interstate'}) → ${LEDGERS[salesKey].code}. The module sends amounts, never an account; the typed entry is only compared with it (entry_mode = typed)`, stores: 'accounting.journal_line.account_id' },
    },
    {
      key: 'hsn',
      what: 'HSN and GST rate',
      value: items.map((i) => `${i}: HSN ${ITEMS[i].hsn}, ${ITEMS[i].gst}%`).join(' · ') || '—',
      business: 'Biscuits are HSN 1905 31, taxed at 5%. The HSN and rate are set once on the item by the Compliance Officer, never typed on the invoice. We print 6 digits because our turnover is above ₹5 crore.',
      engineer: { reads: 'item_master.hsn · tax_master(hsn → rate, valid_from)', rule: 'line.gst_rate := tax_master on the invoice date; an override needs a reason and the Compliance Officer', stores: 'finance.sales_invoice_line.hsn, gst_rate' },
    },
    {
      key: 'tax',
      what: 'Tax ledgers and amounts',
      value: c.intra === null ? '—' : local ? `CGST ${rupees(c.cgst)} + SGST ${rupees(c.sgst)}` : `IGST ${rupees(c.igst)}`,
      business: local ? 'Local sale: half the 5% goes to the Centre (CGST 2.5%), half to Karnataka (SGST 2.5%). Both are owed by us, so they sit in the balance sheet until paid.' : 'Inter-state sale: the full 5% is IGST, owed to the Centre. It sits in the balance sheet until paid.',
      engineer: { reads: 'line amount · gst_rate · supply_type', rule: 'per line: CGST = SGST = round2(amount × rate / 200), or IGST = round2(amount × rate / 100); account_determination(key_type = output_tax, key = cgst | sgst | igst) → 206011 / 206012 / 206013', stores: 'finance.sales_invoice_line tax columns · accounting.journal_line' },
    },
    {
      key: 'rate',
      what: 'Rate',
      value: rateWords || '—',
      business: `The price agreed on the sales order ${dc?.soId ?? ''}: the price list, the customer's contract rate, or an override the Sales Manager approved (₹700 glucose on SO-1). Billing never changes a price.`,
      engineer: { reads: 'sales_order_line.rate (price list → contract → approved override)', rule: 'invoice_line.rate := challan_line.rate := order line rate; read-only on the invoice', stores: 'finance.sales_invoice_line.rate' },
    },
    {
      key: 'qty',
      what: 'Quantity',
      value: c.rows.map((r) => `${r.qty} ${r.uqc}`).join(' · ') || '—',
      business: `What Latha loaded on ${v.dcId}. You can bill less (the rest stays to bill), never more.`,
      engineer: { reads: 'delivery_challan_line.qty · Σ quantity already invoiced', rule: 'qty ≤ challan qty − invoiced (0% tolerance, company rule)', stores: 'finance.sales_invoice_line.qty, challan_line_id' },
    },
    {
      key: 'due',
      what: 'Credit days and due date',
      value: a ? `${a.creditDays ?? 0} days → ${fmtDate(dueDateOf(v, a))}` : '—',
      business: `${a?.name ?? 'The customer'} gets ${a?.creditDays ?? '—'} days, agreed at onboarding. So this bill is due on ${fmtDate(dueDateOf(v, a))}; Collections follows it from that date.`,
      engineer: { reads: 'finance.party_account.credit_days', rule: 'due_date = invoice_date + credit_days; one AR open item "New Ref" per invoice', stores: 'accounting.subledger_item (AR) due_date' },
    },
    {
      key: 'po',
      what: "Customer's PO required?",
      value: bill?.poRule === 'every_invoice' ? 'Yes' : 'No',
      business: bill?.poRule === 'every_invoice' ? "This customer's billing instruction, set at onboarding: \"PO number on every invoice\". They reject invoices without it." : 'Its billing instruction does not ask for a PO.',
      engineer: { reads: 'finance.party_account.po_rule', rule: 'po_rule = every_invoice ⇒ customer_po required (Submit gate)', stores: 'finance.sales_invoice.customer_po' },
    },
    {
      key: 'round',
      what: 'Round off',
      value: rupees(c.roundOff),
      business: 'The total is rounded to the whole rupee; the paise go to the Round off ledger.',
      engineer: { reads: 'exact total', rule: 'total = round(exact); difference → account_determination(round_off) → 506090', stores: 'accounting.journal_line' },
    },
    {
      key: 'number',
      what: 'Invoice number',
      value: v.number ?? `${SERIES.invoice}nnnn (on confirmation)`,
      business: 'The next number in our Karnataka series for this year. The law allows no gaps and at most 16 characters, so the number is given only when the invoice is confirmed: a dropped draft uses none.',
      engineer: { reads: 'numbering_series(type = invoice, gstin = KA, fy = 2627)', rule: 'next value taken inside the confirm transaction; unique per GSTIN and year; cancelled numbers kept', stores: 'finance.sales_invoice.number' },
    },
    {
      key: 'irn',
      what: 'E-invoice (IRN, QR)',
      value: v.irn ? `IRN ${v.irn.slice(0, 12)}…` : 'After Rajan approves',
      business: 'Our turnover is above ₹5 crore, so every B2B invoice is registered on the government portal. It returns the IRN and a signed QR, printed on the invoice. Only then may the goods leave.',
      engineer: { reads: 'invoice header, parties, lines (the e-invoice schema)', rule: 'on approval → IRP adapter → irn, ack_no, signed_qr; retried, failures to the exception queue; Confirmed only when the IRN and the journal entry both succeed', stores: 'finance.sales_invoice.irn, ack_no, ack_at, signed_qr' },
    },
    {
      key: 'ewb',
      what: 'E-way bill',
      value: c.total > PARAMS.ewayBillMin.value ? `Needed · ${dc ? ewbDays(dc.distanceKm) : 1} day(s) for ${dc?.distanceKm ?? '—'} km` : 'Not needed',
      business: `The value is ${c.total > PARAMS.ewayBillMin.value ? 'above' : 'below'} ₹50,000 and the goods move, so ${c.total > PARAMS.ewayBillMin.value ? 'an e-way bill is needed' : 'no e-way bill is needed'}. Validity is one day per 200 km. Part-A comes from the invoice; Latha adds the vehicle (Part-B).`,
      engineer: { reads: 'invoice total · company rule ewb_min · challan distance, vehicle', rule: 'total > ewb_min ⇒ Part-A via the IRP with the IRN; valid_to = date + ceil(km / 200) − 1', stores: 'finance.sales_invoice.ewb_no, ewb_valid_to' },
    },
    {
      key: 'cost',
      what: 'Cost of goods sold',
      value: inr(c.cost),
      business: `The cartons cost us ${items.map((i) => `₹${costOn(i, dc?.date ?? v.date)} (${i})`).join(', ')} each at standard cost. That cost left the stock when Latha loaded the truck, so the entry is the challan's: Dr Cost of goods sold, Cr Finished-goods inventory, dated the challan date (typed by hand for now, posted as its own entry). The invoice only records what the customer owes, so stock is never reduced twice.${ctx.method === 'periodic' ? ' (Periodic switch: no entry per sale; cost comes from the month-end closing stock.)' : ''}`,
      engineer: { reads: 'delivery_challan_line.qty · item standard_cost(date) · company switch inventory_method', rule: 'perpetual: on challan confirm, GOODS_ISSUE rule: Dr det(cogs) 502010 · Cr det(fg_inventory, godown) 105020; periodic: none (T11 at month end)', stores: 'accounting.journal_entry (source = delivery_challan)' },
    },
    {
      key: 'margin',
      what: 'Gross margin',
      value: c.marginPct !== null ? `${inr(c.margin)} · ${c.marginPct}%` : '—',
      business: `Sales ${inr(c.taxable)} less cost ${inr(c.cost)}. The 18% floor was checked when the order was approved; it is shown again so nothing is billed below cost unseen.`,
      engineer: { reads: 'taxable · Σ qty × standard_cost', rule: 'margin_pct = (taxable − cost) / taxable; warn below the company rule margin_floor', stores: '(computed, not stored)' },
    },
    {
      key: 'approver',
      what: 'Who approves',
      value: 'Rajan (Accounts Manager)',
      business: 'In this company billing sits with the Accounts Executive, so the Accounts Manager checks every invoice. His approval sends it to the portal and posts it.',
      engineer: { reads: 'approval route (document = sales_invoice)', rule: 'one platform.approval step, position = accounts_manager; maker ≠ checker; approval → posting + IRN', stores: 'platform.approval' },
    },
  ];
}
