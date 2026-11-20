// T24 §9: every automatic value, told twice (CLAUDE.md §2), with the current invoice's data filled in:
//   business  what the CA / Accounts Manager hears ("how did you pick that ledger?")
//   engineer  which data it reads, which rule decides, where the result is stored
// Pure: the screen shows what this returns.

import { fmtDate } from '../domain/dates';
import { categoriesFor, STATES } from '../onboarding/catalogue';
import { COMPANY, ENDORSEMENT, ITEMS, LEDGERS, PARAMS } from './catalogue';
import { COST_METHODS } from './inventory';
import { accountOf, calcOf, costOfV, countryName, dueDateOf, ewbDays, ewbNeeded, issuerOf, itemOf, partyOfAccount, placesOf, receivableOf, rupees, type SalesCtx } from './rules';
import type { Voucher } from './types';

export interface Logic {
  key: string;
  /** The spec's field id (T24 §5). */
  id: string;
  what: string;
  value: string;
  business: string;
  engineer: { reads: string; rule: string; stores: string };
}

export function logicOf(v: Voucher, ctx: SalesCtx): Logic[] {
  const a = accountOf(ctx, v.accountId);
  const p = partyOfAccount(ctx, v.accountId);
  const c = calcOf(v, ctx);
  const pl = placesOf(ctx, v);
  const gst = pl.bill?.gstin?.value ?? '';
  const br = issuerOf(v);
  const ours = STATES[br.state];
  const cat = a ? categoriesFor('receivable')[a.category] ?? a.category : '—';
  const ar = receivableOf(a);
  const items = [...new Set(c.rows.map((r) => r.item))];
  const local = c.intra === true;
  const exp = c.kind !== 'domestic';
  const revKeys = [...new Set(c.rows.map((r) => r.revenue))];
  const cost = costOfV(v, ctx, c);

  const out: Logic[] = [
    {
      key: 'party', id: 'B1', what: 'Customer', value: a ? `${a.name} (${a.accountId})` : '—',
      business: `You picked ${a?.name ?? 'the customer'} from the active customer accounts (set up in T12). Its name, GSTIN and addresses come from the customer master; you never type them on the invoice.`,
      engineer: { reads: 'debtor_account (active) → pc.party (name) · debtor_location (bill_to, ship_to)', rule: 'picked; refused when the account is not active (K1)', stores: 'sales_invoice.debtor_account_id' },
    },
    {
      key: 'ledger', id: 'B1 · C17', what: 'Receivable ledger', value: a ? `${ar.name} (${ar.code})` : '—',
      business: `${a?.name ?? 'The customer'} was set up as "${cat}". In the CA's chart that category's customers are kept on ${ar.name} (${ar.code}). The invoice total goes there, on a line that names ${a?.name ?? 'the customer'}: the ledger gives the trial-balance line, the name gives what this customer owes.`,
      engineer: { reads: 'debtor_account.ledger_account_code (copied at T12 from debtor_category.ledger_account_code)', rule: 'the customer line posts to the account\'s own ledger, account_type receivable; the commit check refuses a receivable line without its debtor_account_id, or on another ledger (SUBLEDGER_MISMATCH, ACCOUNT_NOT_ON_ITS_LEDGER). Fixes G12', stores: `journal_line.ledger_account_code = ${ar.code} + debtor_account_id` },
    },
    {
      key: 'issuer', id: 'A3 · A5', what: 'Our GSTIN · branch · series', value: `${br.code} ${br.name} · ${br.gstin} · ${br.series.invoice}`,
      business: `The invoice is issued under our GSTIN ${br.gstin} (${br.name}, ${br.code}) and takes its number from that GSTIN's series. The supplying branch decides it.`,
      engineer: { reads: 'picked → fin.branch (gst_identifier_id → pc.party_identifier)', rule: 'one of our branches (BRANCH_NOT_VALID); local / inter-state compares the place of supply with this branch\'s state', stores: 'sales_invoice.branch_id · journal_entry.branch_id · journal_line.branch_id' },
    },
    {
      key: 'billto', id: 'B3 · B4', what: 'Bill-to and its GSTIN', value: pl.billLoc ? `${pl.billLoc.label} · ${gst || 'no GSTIN'}` : '—',
      business: `The bill goes to ${pl.billLoc?.label ?? '—'} (${pl.billLoc?.city ?? ''}), the account's ${pl.bill?.branch.isDefault ? 'default' : 'chosen'} billing branch, registered under GSTIN ${gst || '—'}.`,
      engineer: { reads: 'debtor_location (usage bill_to, is_default) → debtor_tax_registration → pc.party_identifier IN_GST', rule: 'default bill_to; another open bill_to may be picked; its GSTIN state must equal the place\'s state (K10)', stores: 'sales_invoice.bill_to_location_id · copied at Issue: buyer_gstin' },
    },
    {
      key: 'shipto', id: 'B6', what: 'Ship-to', value: pl.ship ? `${pl.ship.label}, ${pl.ship.city} ${pl.ship.pincode}` : '—',
      business: pl.shipDiffers ? `The goods go to ${pl.ship?.label} (${pl.ship?.city}), not to the bill-to: the invoice prints the delivery address (Rule 46(o)).` : 'The customer gave no separate delivery address, so the goods go to the bill-to place.',
      engineer: { reads: 'debtor_location (usage ship_to, primary) else the bill_to', rule: 'PIN must be 6 digits for the e-invoice (B4-03, K10)', stores: 'sales_invoice.ship_to_location_id' },
    },
    {
      key: 'pos', id: 'B8', what: 'Place of supply', value: c.posName ? `${c.posName} (${c.posCode})` : '—',
      business: c.kind === 'export' ? `The goods leave India for ${countryName(p?.address.country)}: an export's place of supply is outside India, code 96 (IGST s.11).` : c.rows.some((r) => r.kind === 'goods') ? `The goods are delivered in ${pl.ship?.city ?? '—'}, ${c.posName ?? '—'}. For goods that move, the place of supply is where the movement ends (IGST s.10(1)(a)).` : `A service to a registered customer: its place of supply is the customer's location, ${c.posName ?? '—'} (IGST s.12(2)(a)).`,
      engineer: { reads: c.kind === 'export' ? 'debtor_account.export → Pos 96' : 'ship_to debtor_location → pc.business_location.administrative_area_code (IN-KA) → gst_state_code', rule: 'goods: ship-to state, but a THIRD-PARTY ship-to → the bill-to state (s.10(1)(b), rev 3 F2) · services: bill-to state, or the property\'s state (s.12(3)) · export 96 · SEZ: IGST', stores: 'sales_invoice.place_of_supply_code, place_of_supply_basis, ship_to_third_party' },
    },
    {
      key: 'nature', id: 'B5 · B9', what: 'Supply type · tax split', value: c.intra === null ? '—' : `${c.supplyType} · ${exp ? (c.exportType === 'lut' ? 'zero-rated (LUT)' : 'IGST') : local ? 'CGST + SGST' : 'IGST'}`,
      business: exp ? `An ${c.kind === 'sez' ? 'SEZ supply' : 'export'} is zero-rated: under our LUT no IGST is charged; without a valid LUT, IGST is paid and refunded.` : local ? `Our ${br.name} GSTIN ${br.gstin} is ${ours.name} (${ours.code}) too. Same state = a local sale: CGST + SGST.` : `Our ${br.name} is in ${ours.name}, the place of supply is ${c.posName}. Different states = inter-state: IGST.`,
      engineer: { reads: `issuer branch GSTIN state (${ours.code}) · place_of_supply · buyer GST position`, rule: 'intra := pos = the branch\'s state; SupTyp B2B / EXPWP / EXPWOP / SEZWP / SEZWOP', stores: 'sales_invoice.supply_type_code, is_inter_state' },
    },
    {
      key: 'hsn', id: 'C6 · C13', what: 'HSN / SAC and GST rate', value: items.map((i) => { const it = itemOf(i)!; return `${i}: ${it.hsn}, ${it.gst}%`; }).join(' · ') || '—',
      business: `${items.some((i) => ITEMS[i]) ? 'Biscuits are HSN 1905 31 at 5% (rates from 22-9-2025). ' : ''}${items.some((i) => !ITEMS[i]) ? 'The co-packing service carries SAC 998599 at 18% (placeholder, illustrative). ' : ''}Set once on the item by the Compliance Officer, never typed on the invoice. 6 digits: our turnover is above ₹5 crore.`,
      engineer: { reads: 'item_master.hsn_sac · tax_master(hsn, date) → rate', rule: 'on Billing\'s invoice line; an override → Compliance Officer (G20, C-29)', stores: 'sales_invoice_line.hsn_sac, gst_rate' },
    },
    {
      key: 'sales', id: 'C17', what: 'Sales ledger (rule)', value: revKeys.map((k) => `${LEDGERS[k].name} (${LEDGERS[k].code})`).join(' · ') || '—',
      business: exp ? `An ${c.kind === 'sez' ? 'SEZ supply' : 'export'} goes to Export Sales (401030)${c.exportType === 'lut' ? ', with no GST line' : ''}.` : `A domestic sale of our products is Sale of Products (401010)${revKeys.includes('sale_services') ? '; a service is Sale of Services (401020)' : ''}. Local or inter-state use the same ledger: the place of supply is on the invoice (a split 401011 is only a proposal to the CA).`,
      engineer: { reads: 'line.is_service · buyer kind (domestic / export / SEZ)', rule: `rule ${c.rules.join(' + ') || '—'} of SALES_INVOICE v1 → ${revKeys.map((k) => LEDGERS[k].code).join(', ') || '—'}; the AE may change it with a reason (§8.4)`, stores: 'journal_line.ledger_account_code' },
    },
    {
      key: 'tax', id: 'D2', what: 'Tax ledgers and amounts', value: c.intra === null ? '—' : exp && c.exportType === 'lut' ? 'IGST nil (LUT)' : local ? `CGST ${rupees(c.cgst)} + SGST ${rupees(c.sgst)}` : `IGST ${rupees(c.igst)}`,
      business: exp && c.exportType === 'lut' ? 'Zero-rated under our LUT: no tax is charged, so no tax line.' : local ? 'Half the rate to the Centre (CGST), half to Karnataka (SGST). We owe both until paid.' : 'The full rate is IGST, owed to the Centre until paid.',
      engineer: { reads: 'taxable value · gst_rate · supply type', rule: 'per line: CGST = SGST = round2(taxable × rate / 200), IGST = round2(taxable × rate / 100) → 206011 / 206012 / 206013 (proposed under 206010, G18); locked in the entry', stores: 'sales_invoice_line tax columns · journal_line' },
    },
    {
      key: 'cost', id: 'R13', what: 'Cost of goods sold', value: !cost ? 'no goods: no cost' : cost.problems.length ? cost.problems.map((p) => `${p.code} ${p.item}`).join(' · ') : `${rupees(cost.total)} by ${COST_METHODS[cost.method].label}`,
      business: !cost ? 'Only services on this invoice: no stock goes out, so there is no cost of goods sold.' : `What the goods cost us, from the stock records, never the selling price. ${cost.method === 'fifo' ? 'FIFO: the oldest lot goes out first, each at its own cost' : 'Weighted average: every unit at the stock value ÷ its quantity'}${cost.picks.length ? ` (${cost.picks.map((p) => `${p.qty} ${p.item}${p.lot ? ` from ${p.lot}` : ''} at ${rupees(p.unitCost)}`).join(' + ')})` : ''}. It is booked with the sale, in the same entry, so the sale and its cost meet in the same period.`,
      engineer: { reads: 'inv.stock_lot (branch, item, received_on order) · the company costing method (G3)', rule: 'R13: FIFO = oldest lots first at their unit_cost; weighted average = Σ(qty_left × unit_cost) ÷ Σ qty_left; short or no record → Stop (STOCK_SHORT, NO_STOCK_RECORD). Dr 501040 (proposed) · Cr 106020 per lot / per item', stores: 'sales_invoice.costing_method · sales_invoice_line.inventory_item_code, quantity, stock_lot_id · journal_line · at approval: stock_lot.quantity_left' },
    },
    {
      key: 'rate', id: 'C7 · C9', what: 'Rate and discount', value: c.rows.map((r) => `${r.item} ${c.currency === 'INR' ? '₹' : `${c.currency} `}${r.rate}${r.discount ? ` less ${r.discount}` : ''}`).filter((x, i, xs) => xs.indexOf(x) === i).join(', ') || '—',
      business: 'The rate is typed per line, as on the CA\'s invoices: it starts at the item\'s list price and you change it to the price agreed with the customer. A trade discount on the face of the invoice (Disc.) reduces the taxable value (CGST s.15(3)(a)). Rajan sees every rate when he approves.',
      engineer: { reads: 'typed; default item_master.list_price', rule: 'taxable = qty × rate − discount; discount ≤ qty × rate (K6 DISCOUNT_ABOVE_LINE_VALUE)', stores: 'sales_invoice_line.unit_price, discount_amount, taxable_amount' },
    },
    {
      key: 'due', id: 'B11', what: 'Credit days and due date', value: a ? `${a.creditDays ?? 0} days → ${fmtDate(dueDateOf(v, a))}` : '—',
      business: `${a?.name ?? 'The customer'} has ${a?.creditDays ?? 0} days' credit, agreed at onboarding. So this bill is due on ${fmtDate(dueDateOf(v, a))}; Collections follows it from then.`,
      engineer: { reads: 'debtor_account.credit_days', rule: 'due_date = invoice_date + credit_days (CHECK due_date >= invoice_date). The open item is the invoice and its journal line naming the account (Manoj: the subledger is a view, no separate table)', stores: 'sales_invoice.due_date' },
    },
    {
      key: 'round', id: 'D4', what: 'Round off', value: rupees(c.roundOff),
      business: 'The total is made a whole rupee; the paise go to Round off.',
      engineer: { reads: 'D1 + D2 + D3', rule: 'round(total) − total (±₹99.99) → 506090 (proposed, G18)', stores: 'sales_invoice.round_off · journal_line' },
    },
    {
      key: 'number', id: 'A6', what: 'Invoice number', value: v.number ?? '—',
      business: `Billing's number, from the ${ours.name} series for 2026-27. It came with the invoice; the voucher keeps it so the entry can always be traced back to its invoice.`,
      engineer: { reads: 'the invoice handed over by Billing (sales.invoice.issued event)', rule: 'one voucher per invoice (unique: branch + invoice_no)', stores: 'sales_voucher.invoice_no' },
    },
    {
      key: 'irn', id: 'G1 · F5', what: 'IRN · e-way bill', value: `${v.irn ? `IRN ${v.irn.slice(0, 12)}…` : 'IRN after approval'} · ${ewbNeeded(c) ? `e-way bill ${ewbDays(Number(v.transport.distanceKm) || 1)} day(s)` : 'no e-way bill'}`,
      business: `Billing registered the invoice with the IRP before handing it over${v.irn ? ' (IRN and signed QR on the invoice)' : ' (not needed: B2C or a Bill of Supply)'}${v.ewbNo ? ', and made the e-way bill' : ''}. You only book the entry.`,
      engineer: { reads: 'the invoice handed over by Billing', rule: 'IRN and e-way bill are Billing\'s; not stored in the voucher', stores: '— (Billing\'s)' },
    },
    {
      key: 'approver', id: 'K19', what: 'Who approves', value: 'Rajan (Accounts Manager)',
      business: 'Billing sits with the Accounts Executive, so the Accounts Manager checks every invoice: he approves, sends it back with a reason, or rejects it. You (the maker) can never decide your own. Everything is checked again when he approves.',
      engineer: { reads: 'the job of the person deciding (accounts_manager)', rule: 'DecideSalesInvoice: maker ≠ checker (CHECK decided_by_contact_id <> submitted_by_contact_id); reason required to send back or reject; approve re-runs every gate, then Issue → Register → Post in one transaction', stores: 'sales_invoice.decided_by_contact_id, decided_at, decision_reason · sales_invoice_history' },
    },
  ];
  if (exp) {
    out.splice(6, 0,
      {
        key: 'export', id: 'E1 · E2 · E3', what: 'Export type · LUT · endorsement', value: c.exportType === 'lut' ? `LUT ${COMPANY.lut.no} to ${fmtDate(COMPANY.lut.validTo)}` : 'With IGST',
        business: c.exportType === 'lut' ? `Our LUT for 2026-27 (number illustrative) is valid on the invoice date, so we export without paying IGST and print "${ENDORSEMENT.lut}".` : `Without a valid LUT on the date, IGST is paid and refunded; the invoice prints "${ENDORSEMENT.igst}".`,
        engineer: { reads: 'our LUT register (issuer GSTIN, FY) — not the customer\'s copy (D4, G19)', rule: 'LUT if valid on A7 else IGST; LUT chosen without a valid LUT → stop (K11)', stores: 'sales_invoice.export_type, lut_ref' },
      },
      {
        key: 'fx', id: 'A14 · D7', what: 'Currency and rate', value: c.currency === 'INR' ? 'INR' : `${c.currency} ${c.foreignTotal?.toLocaleString('en-IN')} × ₹${c.fx} = ${rupees(c.taxable)}`,
        business: `The customer is invoiced in ${c.currency} (T12). The rupee value is at ₹${c.fx} per ${c.currency}: ${PARAMS.fxUsd.words}.`,
        engineer: { reads: 'debtor_account.currency · exchange rate (typed; source G25)', rule: 'taxable INR = round2(Σ qty × rate × fx)', stores: 'sales_invoice.currency_code, exchange_rate, total_foreign' },
      },
    );
  }
  return out;
}
