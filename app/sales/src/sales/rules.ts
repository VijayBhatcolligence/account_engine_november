// What a sales invoice works out, what the engine posts, what is checked, and who checks it (T24 §5, §7, §8).
// Pure functions: the screens only render what these return.
//
// Rev 5 (18-Nov): an independent invoice, as the CA's 43 specimens show it: no challan, no order, no customer PO.
// Who writes what (one owner per fact, CLAUDE.md §3):
//   this invoice               Dr customer (its account's receivable ledger), Cr sales, Cr output GST (± round off)
//                              + rev 15 (R13): Dr Cost of Goods Sold, Cr Finished Goods, the cost read from inventory (inventory.ts)
//   Stores (task G30)          the physical challan where goods move without a sale (on approval, job work, transfers)
//   the engine                 picks the rule (R1–R7) and the ledgers; the AE may edit the entry with a reason (§8.4)
//   our branch (fin.branch)    issues it: its GSTIN, its state (local or inter-state), its number series (rev 2)
// Every check carries a code in the engine's style (Manoj's gates: MISSING_REQUIRED_DETAILS, LEDGER_NOT_POSTABLE …):
// the same code is the schema's Submit check or CHECK (customer_onboarding_schema.dbml, T24 tables).

import { inr } from '../domain/money';
import { STATES } from '../onboarding/catalogue';
import type { CheckResult } from '../onboarding/rules';
import { branchFor, locationsOf, type BranchView } from '../onboarding/branches';
import type { Account, ActorKey, Party, PartyLocation, Request } from '../onboarding/types';
import { BILLING, BRANCHES, branchOf, COMPANY, COUNTRIES, CURRENCY, EXTRAS, fiscalYearOf, IRN_CANCEL_HOURS, ITEMS, LEDGERS, MONTH, OPENING_DUE, PARAMS, periodOf, PICKABLE, receivableKeyOf, SERVICES, type Statement, type Taxability } from './catalogue';
import type { NoteWhy } from './engine';
import { COST_METHODS, costOf, issueOf, type CostMethod, type CostResult, type StockLot } from './inventory';
import type { ApprovalWhy, EditLine, InvoiceLine, JournalEntry, JournalLine, StockReturn, Voucher } from './types';

export interface SalesCtx {
  accounts: Account[];
  parties: Party[];
  requests: Request[];
  journal: JournalEntry[];
  vouchers: Voucher[];
  now: string;
  /** Rev 15: the stock lots (inventory, a demo stub) and the company's costing method. Absent: no cost lines. */
  lots?: StockLot[];
  costMethod?: CostMethod;
  /** Rev 18: Stores' return receipts (inv.stock_return, a stub). */
  returns?: StockReturn[];
}

/** What the entry reads. */
export type EntryCtx = Pick<SalesCtx, 'accounts' | 'parties' | 'requests' | 'lots' | 'costMethod'> & Partial<Pick<SalesCtx, 'journal' | 'returns' | 'vouchers'>>;

/** A check with its spec id (T24 §7: K1–K19) and its code (the engine's refusal code, the schema's check). */
export type SCheck = CheckResult & { k?: string; code?: string };

/** The default code of each check id (T24 §7). A case of its own overrides it (e.g. K7 DATE_IN_FUTURE). */
export const CHECK_CODE: Record<string, string> = {
  N1: 'NOTE_AGAINST_A_POSTED_INVOICE', N2: 'WAITING_FOR_RETURN_RECEIPT', N3: 'SCHEME_REFERENCE_NEEDED', N4: 'NOTE_TIME_LIMIT',
  K1: 'DEBTOR_ACCOUNT_NOT_FOUND', K6: 'DISCOUNT_ABOVE_LINE_VALUE', K7: 'PERIOD_CLOSED', K8: 'PERIOD_SOFT_CLOSED', Fill: 'MISSING_REQUIRED_DETAILS', K10: 'E_INVOICE_PRECHECK',
  K11: 'LUT_NOT_VALID', K12: 'SHIPPING_BILL_PENDING', E4: 'COUNTRY_MISSING', E5: 'PORT_CODE_MISSING',
  K15: 'OVER_CREDIT_LIMIT', R7: 'TCS_RATE_UNCONFIRMED', K16: 'DEBITS_CREDITS_DIFFER', K17: 'ENTRY_LINE_INVALID', K27: 'ENTRY_VS_DOCUMENT', K18: 'IRP_30_DAY_LIMIT',
  K19: 'MAKER_MAY_NOT_DECIDE', A3: 'BRANCH_NOT_VALID', B9: 'TAX_SPLIT', B5: 'BUYER_UNREGISTERED',
  K26: 'STOCK_SHORT', K20: 'THIRD_PARTY_SHIP_TO_INCOMPLETE', K21: 'PLACE_OF_SUPPLY_PROPERTY', K22: 'SERVICE_PERIOD_REQUIRED', K23: 'NON_TAXABLE_LINES', K24: 'IGST_REFUND_CLAIMED', K25: 'ADVANCE_ADJUSTMENT_INVALID',
};

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const money = (n: number, cur: string) => (cur === 'INR' ? rupees(n) : `${cur} ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);


export const customers = (ctx: Pick<SalesCtx, 'accounts'>) => ctx.accounts.filter((a) => a.side === 'receivable');
export const accountOf = (ctx: Pick<SalesCtx, 'accounts'>, id: string) => ctx.accounts.find((a) => a.accountId === id) ?? null;
export const partyOfAccount = (ctx: Pick<SalesCtx, 'accounts' | 'parties'>, accountId: string) => {
  const a = accountOf(ctx, accountId);
  return a ? ctx.parties.find((p) => p.partyId === a.partyId) ?? null : null;
};
/** B3: the bill-to branch (its GSTIN and address): chosen on the invoice, else the account's default. */
export const branchOfV = (ctx: Pick<SalesCtx, 'accounts' | 'parties'>, v: Pick<Voucher, 'accountId' | 'branchId'>): BranchView | null =>
  branchFor(accountOf(ctx, v.accountId), partyOfAccount(ctx, v.accountId), v.branchId);

const requestOf = (ctx: Pick<SalesCtx, 'requests'>, a: Account | null) => (a?.requestId ? ctx.requests.find((r) => r.id === a.requestId) : undefined);

export function billingOf(ctx: Pick<SalesCtx, 'requests'>, a: Account | null): { poRule: string; delivery: string } | null {
  if (!a) return null;
  const req = requestOf(ctx, a);
  if (req) return { poRule: String(req.values.poRule ?? 'none'), delivery: String(req.values.delivery ?? 'email') };
  return BILLING[a.accountId] ?? null;
}

/** B5: domestic, export or SEZ, from the T12 account (its category, or the request's flags). */
export type BuyerKind = 'domestic' | 'export' | 'sez';
export function kindOf(ctx: Pick<SalesCtx, 'requests'>, a: Account | null): BuyerKind {
  if (!a) return 'domestic';
  const req = requestOf(ctx, a);
  if (a.category === 'sez_unit' || req?.values.sezCustomer === 'yes') return 'sez';
  if (['export_goods', 'export_services', 'related_party_overseas'].includes(a.category) || req?.values.exportCustomer === 'yes') return 'export';
  return 'domestic';
}
export const currencyOf = (ctx: Pick<SalesCtx, 'requests'>, a: Account | null) => (a ? String(requestOf(ctx, a)?.values.currency || CURRENCY[a.accountId] || 'INR') : 'INR');
/** D3: an income-tax TCS category (IT Act 2025 s.394): scrap, luxury goods, tour packages. */
export const isTcsCategory = (a: Account | null) => !!a && ['scrap_specified_goods', 'luxury_goods', 'tour_package'].includes(a.category);
/**
 * The customer's receivable ledger: fin.debtor_category.ledger_account_code, copied at T12 to
 * fin.debtor_account.ledger_account_code (Manoj, 13-Nov: no "control ledger"; the ledger's account_type is receivable). Fixes G12.
 */
export const receivableOf = (a: Account | null) => {
  const key = receivableKeyOf(a?.category ?? '');
  return { key, code: LEDGERS[key].code, name: LEDGERS[key].name };
};

/** A3: the branch that issues the invoice (fin.branch): our GSTIN, picked on the invoice. */
export const issuerOf = (v: Pick<Voucher, 'branch'>) => branchOf(v.branch);

/** What the customer owes now: brought forward + every posted Dr − Cr on its account. */
export function dueOf(ctx: Pick<SalesCtx, 'journal'>, accountId: string): number {
  const moved = ctx.journal.flatMap((e) => e.lines).filter((l) => l.accountId === accountId).reduce((t, l) => t + l.dr - l.cr, 0);
  return r2((OPENING_DUE[accountId] ?? 0) + moved);
}

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** An item or a service, as the line reads it (C3–C6, C9, C13). */
export function itemOf(code: string): { name: string; hsn: string; uqc: string; gst: number; service: boolean; taxability: Taxability; period?: boolean } | null {
  const it = ITEMS[code];
  if (it) return { name: it.name, hsn: it.hsn, uqc: it.uqc, gst: it.gst, service: false, taxability: 'taxable' };
  const s = SERVICES[code];
  if (s) return { name: s.name, hsn: s.sac, uqc: s.uqc, gst: s.gst, service: true, taxability: s.taxability, period: s.period };
  const x = EXTRAS[code];
  return x ? { name: x.name, hsn: x.sac, uqc: x.uqc, gst: 0, service: x.kind === 'charge', taxability: x.kind === 'reimbursement' ? 'non_gst' : 'taxable' } : null;
}

/** An invoice line's item: our item master, or (an uploaded invoice) the line's own description, HSN and rate. */
export const itemOfLine = (l: Pick<InvoiceLine, 'item' | 'custom'>) => l.custom ?? itemOf(l.item);

/** Our LUT is per GSTIN (Rule 96A): valid only for the branch that filed it, inside its dates. */
export const lutValidOn = (date: string, branch = 'KA-01') => !!date && branch === COMPANY.lut.branch && date >= COMPANY.lut.validFrom && date <= COMPANY.lut.validTo;
/** E1 default: LUT when the issuing branch's LUT is valid on the invoice date, else with IGST. */
export const exportTypeOf = (v: Pick<Voucher, 'exportType' | 'date' | 'branch'>) => v.exportType ?? (lutValidOn(v.date, v.branch) ? 'lut' : 'igst');

// ---------- Places: bill-to, ship-to, place of supply (B3, B6, B8) ----------

export interface Places {
  bill: BranchView | null;
  billLoc: PartyLocation | null;
  ship: PartyLocation | null;
  shipState: string | null;
  /** Ship-to choices: the account's ship-to (if any) and the bill-to place. */
  shipOptions: PartyLocation[];
  shipDiffers: boolean;
}

export function placesOf(ctx: Pick<SalesCtx, 'accounts' | 'parties'>, v: Pick<Voucher, 'accountId' | 'branchId' | 'shipToId'>): Places {
  const a = accountOf(ctx, v.accountId);
  const p = partyOfAccount(ctx, v.accountId);
  const bill = branchOfV(ctx, v);
  const locs = p ? locationsOf(p) : [];
  const billLoc = bill?.location ?? locs[0] ?? null;
  const accShip = a?.shipTo ? locs.find((l) => l.locationId === a.shipTo!.locationId) ?? null : null;
  const shipOptions = [accShip, billLoc].filter((x, i, xs): x is PartyLocation => !!x && xs.findIndex((y) => y?.locationId === x.locationId) === i);
  const ship = (v.shipToId && shipOptions.find((l) => l.locationId === v.shipToId)) || accShip || billLoc;
  const shipDiffers = !!ship && !!billLoc && ship.locationId !== billLoc.locationId;
  const shipState = !ship ? null : !shipDiffers && bill?.stateCode ? bill.stateCode : ship.stateCode || null;
  return { bill, billLoc, ship, shipState, shipOptions, shipDiffers };
}

// ---------- Worked out: amounts and tax ----------

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9' | 'R10' | 'R11' | 'R12';

export interface CalcRow {
  idx: number; // index in v.lines
  kind: InvoiceLine['kind'];
  taxability: Taxability;
  /** A period service: revenue deferred (R12). */
  deferred: boolean;
  item: string;
  name: string;
  hsn: string;
  uqc: string;
  qty: number;
  rate: number; // in the invoice currency
  discount: number;
  foreign: number | null; // amount in the foreign currency (export)
  amount: number; // the line's value in INR (C12): taxable value, or the untaxed value of a nil / exempt / non-GST line
  gst: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
}

/** Rev 3: the place-of-supply basis (B8), from the CA's specimens and the IGST Act. */
export type PosBasis = 'goods_ship_to' | 'goods_bill_to_third_party' | 'service_recipient' | 'service_immovable_property' | 'export' | 'sez';
export const POS_BASIS_WORDS: Record<PosBasis, string> = {
  goods_ship_to: 'goods: where the movement ends, the ship-to (IGST s.10(1)(a))',
  goods_bill_to_third_party: 'goods delivered to a third party on the buyer\'s direction: the buyer\'s (bill-to) state (IGST s.10(1)(b))',
  service_recipient: 'service to a registered buyer: the buyer\'s location (IGST s.12(2)(a))',
  service_immovable_property: 'service on immovable property: where the property is (IGST s.12(3))',
  export: 'export: outside India, code 96 (IGST s.11 / s.13)',
  sez: 'supply to an SEZ: inter-state, IGST (IGST s.7(5)(b))',
};

export interface Calc {
  rows: CalcRow[];
  kind: BuyerKind;
  /** Rev 3: the buyer has a GSTIN (B2B) or not (B2C). */
  registered: boolean;
  currency: string;
  fx: number;
  exportType: 'lut' | 'igst' | null;
  /** Place of supply: a state key, or '96' (other countries). */
  pos: string | null;
  posCode: string | null;
  posName: string | null;
  posBasis: PosBasis | null;
  intra: boolean | null;
  supplyType: 'B2B' | 'B2CS' | 'B2CL' | 'EXPWP' | 'EXPWOP' | 'SEZWP' | 'SEZWOP';
  /** Rev 3 · A1: the document the law calls it (its own series). */
  docType: 'tax_invoice' | 'bill_of_supply' | 'export_invoice';
  taxable: number;
  /** Rev 3: nil-rated, exempt and non-GST values (D8), and pure-agent expenses outside the value (D9). */
  exempt: number;
  reimbursement: number;
  cgst: number;
  sgst: number;
  igst: number;
  tcs: number;
  exact: number;
  total: number;
  roundOff: number;
  /** Rev 3 (F1): IGST paid by us and claimed back on an export / SEZ supply with IGST; the buyer does not owe it. */
  refund: number;
  /** What the buyer owes: the total less any refund-claimed IGST (D10). */
  payable: number;
  foreignTotal: number | null;
  /** One row per HSN and rate, as printed under the invoice. */
  hsn: { hsn: string; gst: number; taxable: number; cgst: number; sgst: number; igst: number }[];
}

/** B2CL: an inter-state supply to an unregistered buyer above ₹1,00,000 (reported invoice-wise in GSTR-1; the CA's specimen A4). */
export const B2CL_ABOVE = 1_00_000;

export function calcOf(v: Voucher, ctx: Pick<SalesCtx, 'accounts' | 'parties' | 'requests'>): Calc {
  const a = accountOf(ctx, v.accountId);
  const kind = kindOf(ctx, a);
  const currency = v.currency || 'INR';
  const fx = currency === 'INR' ? 1 : Number(v.fxRate) || 0;
  const zeroRated = kind !== 'domestic' && exportTypeOf(v) === 'lut';
  const pl = v.accountId ? placesOf(ctx, v) : null;
  const registered = kind !== 'domestic' || !!pl?.bill?.gstin;
  const anyGoods = v.lines.some((l) => l.kind === 'goods');
  const billState = pl?.bill?.stateCode ?? pl?.billLoc?.stateCode ?? null;
  let pos: string | null = null;
  let posBasis: PosBasis | null = null;
  if (v.accountId) {
    if (kind === 'export') [pos, posBasis] = ['96', 'export'];
    else if (kind === 'sez') [pos, posBasis] = [billState, 'sez'];
    else if (anyGoods && v.thirdPartyShipTo) [pos, posBasis] = [billState, 'goods_bill_to_third_party'];
    else if (anyGoods) [pos, posBasis] = [pl?.shipState ?? null, 'goods_ship_to'];
    else if (v.propertyState) [pos, posBasis] = [v.propertyState, 'service_immovable_property'];
    else [pos, posBasis] = [billState, 'service_recipient'];
  }
  const posCode = pos === '96' ? '96' : pos ? STATES[pos]?.code ?? null : null;
  const posName = pos === '96' ? 'Other countries (outside India)' : pos ? STATES[pos]?.name ?? null : null;
  const intra = pos === null ? null : kind !== 'domestic' ? false : pos === issuerOf(v).state;
  // A charge (freight) follows the goods' rate: part of the same supply (the highest goods rate on the invoice; 18 % when none).
  const goodsRate = Math.max(0, ...v.lines.filter((l) => l.kind === 'goods').map((l) => itemOfLine(l)?.gst ?? 0)) || v.chargeGst || 18;
  const rows: CalcRow[] = v.lines
    .map((l, idx) => ({ l, idx, it: itemOfLine(l) }))
    .filter(({ l, it }) => Number(l.qty) > 0 && it)
    .map(({ l, idx, it }) => {
      const qty = Number(l.qty);
      const rate = Number(l.rate) || 0;
      const discount = Number(l.discount) || 0;
      const gross = r2(qty * rate - discount);
      const foreign = currency === 'INR' ? null : gross;
      const amount = currency === 'INR' ? gross : r2(gross * fx);
      const taxability: Taxability = l.kind === 'reimbursement' ? 'non_gst' : it!.taxability;
      // Rev 18: a goodwill credit note reduces no GST (s.15(3): no scheme agreed before the supply).
      const gst = taxability !== 'taxable' || v.noteReason === 'goodwill' ? 0 : l.kind === 'charge' ? goodsRate : it!.gst;
      const half = r2((amount * gst) / 200);
      const cgst = intra ? half : 0;
      const igst = intra === false && !zeroRated ? r2((amount * gst) / 100) : 0;
      const deferred = l.kind === 'service' && !!it!.period;
      return { idx, kind: l.kind, taxability, deferred, item: l.item, name: it!.name, hsn: it!.hsn, uqc: it!.uqc, qty, rate, discount, foreign, amount, gst, cgst, sgst: cgst, igst, tax: r2(cgst * 2 + igst) } as CalcRow;
    });
  const sumOf = (k: 'amount' | 'cgst' | 'sgst' | 'igst', f: (x: CalcRow) => boolean = () => true) => r2(rows.filter(f).reduce((t, x) => t + x[k], 0));
  const taxable = sumOf('amount', (x) => x.taxability === 'taxable' && x.kind !== 'reimbursement');
  const exempt = sumOf('amount', (x) => x.taxability !== 'taxable' && x.kind !== 'reimbursement');
  const reimbursement = sumOf('amount', (x) => x.kind === 'reimbursement');
  const cgst = sumOf('cgst');
  const sgst = sumOf('sgst');
  const igst = sumOf('igst');
  const tcs = 0; // R7: the rate is not confirmed (G18) — not computed in the mock
  const exact = r2(taxable + exempt + reimbursement + cgst + sgst + igst + tcs);
  const total = Math.round(exact);
  const refund = kind !== 'domestic' && !zeroRated ? igst : 0;
  const groups = new Map<string, Calc['hsn'][number]>();
  for (const x of rows.filter((r) => r.kind !== 'reimbursement')) {
    const k = `${x.hsn}|${x.gst}`;
    const g = groups.get(k) ?? { hsn: x.hsn, gst: x.gst, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    g.taxable = r2(g.taxable + x.amount);
    g.cgst = r2(g.cgst + x.cgst);
    g.sgst = r2(g.sgst + x.sgst);
    g.igst = r2(g.igst + x.igst);
    groups.set(k, g);
  }
  const supplyType = kind === 'export' ? (zeroRated ? 'EXPWOP' : 'EXPWP') : kind === 'sez' ? (zeroRated ? 'SEZWOP' : 'SEZWP') : registered ? 'B2B' : intra === false && total > B2CL_ABOVE ? 'B2CL' : 'B2CS';
  const docType = kind === 'export' ? 'export_invoice' : rows.length && rows.every((x) => x.taxability !== 'taxable') ? 'bill_of_supply' : 'tax_invoice';
  return {
    rows, kind, registered, currency, fx, exportType: kind === 'domestic' ? null : exportTypeOf(v), pos, posCode, posName, posBasis, intra, supplyType, docType,
    taxable, exempt, reimbursement, cgst, sgst, igst, tcs, exact, total, roundOff: r2(total - exact), refund, payable: r2(total - refund),
    foreignTotal: currency === 'INR' ? null : r2(rows.reduce((t, x) => t + (x.foreign ?? 0), 0)),
    hsn: [...groups.values()],
  };
}

/** Rev 15 (R13): the cost of the invoice's goods, from the stock lots by the company's method (null: no inventory in the context). */
export function costOfV(v: Voucher, ctx: EntryCtx, c: Calc = calcOf(v, ctx)): CostResult | null {
  if (isNote(v)) return null; // a note issues no stock: a return's goods come back through Stores' receipt
  // Posted: the cost is what the entry posted (the stock has moved since), never recomputed.
  if (v.entryId) {
    const je = ctx.journal?.find((e) => e.id === v.entryId);
    const cl = je?.lines.filter((l) => !!l.item && l.cr > 0) ?? [];
    if (!je || !cl.length) return null;
    const picks = cl.map((l) => ({ item: l.item!, lotId: null, lot: l.lot ?? null, receivedOn: null, qty: l.qty ?? 0, unitCost: r2(l.cr / (l.qty || 1)), amount: l.cr }));
    return { method: je.costMethod ?? 'fifo', picks, total: r2(picks.reduce((t, p) => t + p.amount, 0)), problems: [] };
  }
  if (!ctx.lots) return null;
  const items = issueOf(c.rows.filter((r) => !!ITEMS[r.item]));
  if (!items.length) return null;
  return costOf(ctx.lots, ctx.costMethod ?? 'fifo', v.branch, items);
}


// ---------- The entry: what the Accounts Executive types (REC, Vijay 27-Nov-2026: "like Tally: select the ledger, enter
// debit and credit, save"). No posting rule and no ledger mapping in this app: a role app's own accounting layer proposes
// the entry (later); here the AE records it. The automatic calculations stay: the document's amounts (calcOf) and the
// cost of the goods from inventory (costLinesOf) are shown, and the checks compare the typed entry with them.

export interface EntryLine {
  id: string;
  /** party: the customer's account (on its receivable ledger) · tax: an output GST ledger · cost: a line from inventory · line: any other */
  role: 'party' | 'tax' | 'cost' | 'line';
  ledger: string; // LEDGERS key, or 'party'
  /** The ledger shown (the customer line: its receivable ledger). */
  ledgerKey?: string;
  name: string;
  code: string;
  statement: Statement;
  dr: number;
  cr: number;
  /** The line's own narration (optional). */
  reason?: string;
  /** A cost / stock line (from inventory): item, lot (null: weighted average), quantity. */
  item?: string;
  lot?: string | null;
  qty?: number;
}

const L = (key: string) => LEDGERS[key] ?? { code: '—', name: key ? `(${key})` : '(no ledger chosen)', statement: 'PL' as Statement };
const roleOfLedger = (k: string, item?: string): EntryLine['role'] => (k === 'party' ? 'party' : item ? 'cost' : LEDGERS[k]?.accountType?.startsWith('output_') ? 'tax' : 'line');

/** The entry as typed (fin.sales_invoice_line, then the journal lines). */
export function entryOf(v: Voucher, ctx: EntryCtx): EntryLine[] {
  const a = accountOf(ctx, v.accountId);
  const ar = a ? receivableOf(a) : null;
  // Not edited yet: the default entry, filled from the document's amounts (Vijay, 27-Nov: "by default it should show the
  // entry; then I can edit, it's my choice"). Once the AE changes anything, his lines are the entry.
  return (v.edit?.lines ?? defaultEntryOf(v, ctx)).map((e): EntryLine => {
    if (e.ledger === 'party')
      return { id: e.id, role: 'party', ledger: 'party', ledgerKey: ar?.key, name: a ? `${a.name} (${a.accountId})` : 'The customer (no account yet)', code: ar?.code ?? '—', statement: 'BS', dr: r2(e.dr), cr: r2(e.cr), reason: e.reason };
    const lg = L(e.ledger);
    return { id: e.id, role: roleOfLedger(e.ledger, e.item), ledger: e.ledger, ledgerKey: e.ledger, name: lg.name, code: lg.code, statement: lg.statement, dr: r2(e.dr), cr: r2(e.cr), reason: e.reason, ...(e.item ? { item: e.item, lot: e.lot ?? null, qty: e.qty } : {}) };
  });
}

/** The default entry: the document's calculated amounts put on the usual ledgers, as a STARTING POINT the AE may change
 *  line by line (or clear and type his own). Not a posting rule: no rule table, no mapping, no versions; the AE's entry is
 *  what posts. Usual ledgers: the customer (or the cash / UPI account when paid at once) · by line: goods → Sale of Products,
 *  services → Sale of Services (a period billed in advance → Contract Liability), nil / exempt → Sales – Exempt, freight
 *  charged → Freight Recovered, a pure-agent expense → Expenses Recoverable, export / SEZ → Export Sales · a credit note:
 *  a return → Sales Returns, a discount → Discount Allowed, a price correction → the sales ledger · GST by head · round off ·
 *  the IGST we claim back · the cost from inventory. A credit note goes the other way. */
export function defaultEntryOf(v: Voucher, ctx: EntryCtx): EditLine[] {
  const c = calcOf(v, ctx);
  if (!c.rows.length || c.pos === null) return [];
  const credit = v.docType === 'credit_note';
  const cs = credit ? 'cr' : 'dr'; // the customer's side
  const os = credit ? 'dr' : 'cr'; // the other side
  const out: EditLine[] = [];
  const put = (ledger: string, amount: number, side: 'dr' | 'cr') => {
    const x = r2(Math.abs(amount));
    if (x) out.push({ id: `d:${out.length + 1}`, ledger, dr: side === 'dr' ? x : 0, cr: side === 'cr' ? x : 0, reason: '' });
  };
  const settle = v.settlement ?? 'credit';
  put(settle === 'credit' ? 'party' : settle === 'cash' ? 'cash_in_hand' : 'upi_card_clearing', c.payable, cs);
  if (c.refund) put('igst_refund', c.refund, cs);
  const ledgerOf = (r: CalcRow) =>
    credit && v.noteReason === 'return' ? 'sales_returns'
    : credit && (v.noteReason === 'scheme_discount' || v.noteReason === 'goodwill') ? 'discount_allowed'
    : r.kind === 'reimbursement' ? 'reimbursement_recoverable'
    : r.kind === 'charge' ? 'freight_recovered'
    : c.kind !== 'domestic' ? 'export_sales'
    : r.taxability !== 'taxable' ? 'exempt_sales'
    : r.kind === 'service' ? (r.deferred ? 'contract_liability' : 'sale_services')
    : 'sale_products';
  const byLedger = new Map<string, number>();
  for (const r of c.rows) byLedger.set(ledgerOf(r), r2((byLedger.get(ledgerOf(r)) ?? 0) + r.amount));
  for (const [ledger, amount] of byLedger) put(ledger, amount, os);
  put('out_cgst', c.cgst, os);
  put('out_sgst', c.sgst, os);
  put('out_igst', c.igst, os);
  if (c.roundOff) put('round_off', c.roundOff, c.roundOff > 0 ? os : cs);
  return [...out, ...costLinesOf(v, ctx)];
}

/** An automatic calculation, not a rule: the cost of the goods from inventory (FIFO / weighted average) as lines the AE adds
 *  with one click (Dr Cost of Goods Sold · Cr Finished Goods, per lot); for a return the note carries back (the book's
 *  setting): Dr Finished Goods · Cr Cost of Goods Sold at the cost the goods left at. */
export function costLinesOf(v: Voucher, ctx: EntryCtx): EditLine[] {
  const back = isNote(v) ? returnCostOf(v, ctx) : undefined;
  if (back) return back.flatMap((p, i) => [
    { id: `cost:${i + 1}:dr`, ledger: 'fg_inventory', dr: p.amount, cr: 0, reason: `${p.qty} ${p.item} back, lot ${p.lot}`, item: p.item, lot: p.lot, qty: p.qty },
    { id: `cost:${i + 1}:cr`, ledger: 'cogs', dr: 0, cr: p.amount, reason: `${p.qty} ${p.item} back, lot ${p.lot}`, item: p.item, lot: p.lot, qty: p.qty },
  ]);
  const cost = costOfV(v, ctx);
  if (!cost || cost.problems.length) return [];
  return cost.picks.flatMap((p, i) => {
    const why = `${p.qty} ${p.item}${p.lot ? ` from lot ${p.lot}` : ' at the average'} at ${rupees(p.unitCost)} (${COST_METHODS[cost.method].label})`;
    return [
      { id: `cost:${i + 1}:dr`, ledger: 'cogs', dr: p.amount, cr: 0, reason: why, item: p.item, lot: p.lot, qty: p.qty },
      { id: `cost:${i + 1}:cr`, ledger: 'fg_inventory', dr: 0, cr: p.amount, reason: why, item: p.item, lot: p.lot, qty: p.qty },
    ];
  });
}

export const toJournal = (lines: EntryLine[], accountId?: string): JournalLine[] =>
  lines.filter((l) => l.dr || l.cr).map((l) => (l.ledger === 'party' ? { ledger: 'party', accountId, dr: l.dr, cr: l.cr, code: l.code } : { ledger: l.ledger, dr: l.dr, cr: l.cr, ...(l.reason ? { reason: l.reason } : {}), ...(l.item ? { item: l.item, lot: l.lot ?? null, qty: l.qty } : {}) }));
/** ReverseJournalEntry (Manoj's journal.py): the exact mirror, Dr and Cr swapped, line by line. */
export const mirrorOf = (lines: JournalLine[]): JournalLine[] => lines.map((l) => ({ ...l, dr: l.cr, cr: l.dr }));
export const sum = (lines: { dr: number; cr: number }[]) => ({ dr: r2(lines.reduce((t, l) => t + l.dr, 0)), cr: r2(lines.reduce((t, l) => t + l.cr, 0)) });

export const dueDateOf = (v: Pick<Voucher, 'date'> & Partial<Pick<Voucher, 'docType'>>, a: Account | null) => {
  if (!a || !v.date) return null;
  if (v.docType === 'credit_note') return v.date; // it reduces what is owed, from its date
  const d = new Date(`${v.date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (a.creditDays ?? 0));
  return d.toISOString().slice(0, 10);
};

/** E-way bill validity: one day for every 200 km or part of it (normal cargo). The distance is typed on the invoice (rev 5). */
export const ewbDays = (km: number) => Math.max(1, Math.ceil(km / 200));
/** F5: goods moving and the value above ₹50,000. */
export const ewbNeeded = (c: Calc) => c.rows.some((r) => r.kind === 'goods') && c.total > PARAMS.ewayBillMin.value;

/** Rev 3: e-invoicing (an IRN) covers B2B, export and SEZ supplies on a tax or export invoice; not a Bill of Supply, not B2C
 *  (Notification 13/2020-CT; B2C prints a dynamic QR). Without it, approval posts at once. */
export const einvoiceRequired = (c: Pick<Calc, 'supplyType' | 'docType'>) => c.docType !== 'bill_of_supply' && c.supplyType !== 'B2CS' && c.supplyType !== 'B2CL';

/** Rev 3: the series of the document type (tax invoice, Bill of Supply, export invoice) of the issuing branch. */
export const seriesOf = (v: Pick<Voucher, 'branch'> & Partial<Pick<Voucher, 'docType'>>, c: Pick<Calc, 'docType'>) => {
  const s = issuerOf(v).series;
  if (v.docType === 'credit_note') return s.creditNote;
  if (v.docType === 'debit_note') return s.debitNote;
  return c.docType === 'bill_of_supply' ? s.billOfSupply : c.docType === 'export_invoice' ? s.export : s.invoice;
};

/** Rule 46(b) + NIC: ≤ 16 characters, A–Z 0–9 - /, not starting with 0, / or -. */
export const numberOk = (no: string) => no.length <= 16 && /^[A-Z1-9][A-Z0-9/-]*$/.test(no);
/** C-27: the next number of the series; a number already used (even if cancelled) is never given again. */
export function nextNumber(used: (string | null)[], prefix = BRANCHES['KA-01'].series.invoice): string {
  const n = Math.max(0, ...used.filter((x): x is string => !!x && x.startsWith(prefix)).map((x) => Number(x.slice(prefix.length)) || 0)) + 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}
export const isDuplicateNumber = (used: (string | null)[], no: string) => used.includes(no);

/** Hours left to cancel the IRN (24 h from its ack); 0 when the window has closed. */
export function irnHoursLeft(v: Pick<Voucher, 'ackAt'>, now: string): number {
  if (!v.ackAt) return 0;
  const left = IRN_CANCEL_HOURS - (Date.parse(`${now}:00Z`) - Date.parse(`${v.ackAt}:00Z`)) / 3_600_000;
  return left > 0 ? Math.round(left * 10) / 10 : 0;
}

// ---------- Checks (rev 6: the AE's entry only; the invoice's own checks are Billing's) ----------

export function checksOf(v: Voucher, ctx: SalesCtx): SCheck[] {
  const out: SCheck[] = [];
  const add = (k: string, level: SCheck['level'], title: string, detail?: string, more: Partial<SCheck> = {}) => out.push({ k, code: CHECK_CODE[k], level, title, detail, ...more });
  const a = accountOf(ctx, v.accountId);
  const c = calcOf(v, ctx);
  const missing: string[] = [];

  // K1 customer account.
  if (!v.accountId && v.pendingCustomer) add('K1', 'stop', `Customer not registered: ${v.pendingCustomer.name}`, v.pendingCustomer.requestId ? `Waiting for T12 request ${v.pendingCustomer.requestId}.` : 'Register it first (T12), create it now (demo shortcut), or pick an existing account.');
  else if (!v.accountId) add('K1', 'stop', 'The invoice names no customer account', 'Return it to Billing (or book a walk-in sale paid at once).');
  else if (!a) add('K1', 'stop', 'No customer account', 'A new customer is set up first (T12 Create a customer).');
  // Posting date = the invoice date (K7, K8): the period and the year must be open.
  if (v.date) {
    const per = periodOf(v.date);
    const fy = fiscalYearOf(v.date);
    if (!fy) add('K7', 'stop', `No financial year is set up for ${v.date}`, 'fin.fiscal_year (the books core): a date outside every year cannot post.', { code: 'FINANCIAL_YEAR_CLOSED' });
    else if (fy.closed) add('K7', 'stop', `${fy.label} is closed`, 'Nothing posts into a closed financial year.', { code: 'FINANCIAL_YEAR_CLOSED' });
    if (per === 'hard') add('K7', 'stop', `${MONTH(v.date)} is closed`, 'Nothing can be posted into a hard-closed period. Ask Billing for a dated correction.');
    if (per === 'soft') add('K8', 'warn', `${MONTH(v.date)} is soft-closed`, 'Allowed only as an adjustment the Accounts Manager approves.');
  }
  if (c.intra !== null && c.rows.length) add('B9', 'ok', c.kind === 'export' ? 'Export: the invoice carries no CGST / SGST' : c.intra ? 'Invoice GST is CGST + SGST: two tax lines' : 'Invoice GST is IGST: one tax line');
  if (isNote(v)) noteChecks(v, ctx, add);
  // K15 credit (a warning: the goods are already invoiced). A credit note lowers what is owed: no credit check.
  if (v.docType !== 'credit_note' && a && a.creditLimit !== null && c.payable > 0 && (v.settlement ?? 'credit') === 'credit') {
    const due = dueOf(ctx, a.accountId);
    if (due + c.payable > a.creditLimit) add('K15', 'warn', `After this invoice the customer is over its limit by ${inr(due + c.payable - a.creditLimit)}`, 'Allowed; Rajan sees it and Farid (Credit Controller) is told.');
  }
  // D3 / R7 TCS.
  if (isTcsCategory(a)) add('R7', 'warn', 'TCS item (income tax s.394): the rate is not confirmed', 'R7 adds Cr TCS payable; the rate and its ledger wait for the CA (G18).');
  if (missing.length) add('Fill', 'stop', `Still to fill: ${missing.join(' · ')}`, undefined, { code: 'MISSING_REQUIRED_DETAILS' });

  // K26 (rev 15, R13): the cost of the goods, from inventory by the company's method.
  const cost = costOfV(v, ctx, c);
  if (cost) {
    for (const p of cost.problems)
      if (p.code === 'NO_STOCK_RECORD') add('K26', 'stop', `No stock record for ${p.item} at ${v.branch}`, "The cost of goods sold cannot be found: the item is not in this branch's stock (inventory). An exception, never a guess.", { code: 'NO_STOCK_RECORD' });
      else add('K26', 'stop', `Stock short: ${p.item} ${p.want} on the invoice, ${p.have} in stock`, 'Goods cannot go out of stock that is not there: check the stock with Stores before booking.', { code: 'STOCK_SHORT' });
    if (!cost.problems.length) add('K26', 'ok', `Cost of goods sold by ${COST_METHODS[cost.method].label}: ${rupees(cost.total)} from inventory`, undefined, { code: 'COST_FROM_INVENTORY' });
  }

  // K16, K17: the entry the AE typed, against the document's calculated amounts.
  entryChecks(v, ctx, c, entryOf(v, ctx), add);
  return out;
}

/** K16 balance · K17 every line postable · K27 the entry against the document (the customer, GST by head) · K26 the cost
 *  against inventory. The document's amounts and the cost are calculations, not rules: the AE types the entry. */
function entryChecks(v: Voucher, ctx: SalesCtx, c: Calc, lines: EntryLine[], add: (k: string, level: SCheck['level'], title: string, detail?: string, more?: Partial<SCheck>) => void) {
  if (!lines.length) return add('K16', 'stop', 'Type the entry', 'Pick the ledger for each line and enter its debit or credit (like Tally); the document\'s amounts are shown beside.', { code: 'ENTRY_EMPTY' });
  let ok = true;
  const stop = (k: string, code: string, title: string, detail?: string) => {
    ok = false;
    add(k, 'stop', title, detail, { code });
  };
  lines.forEach((l, i) => {
    const n = i + 1;
    if (l.ledger !== 'party') {
      const lg = LEDGERS[l.ledger];
      if (!l.ledger) stop('K17', 'MISSING_REQUIRED_DETAILS', `Line ${n}: choose a ledger`);
      else if (!lg) stop('K17', 'LEDGER_NOT_FOUND', `Line ${n}: ${l.ledger} is not in the chart`);
      else if (lg.isGroup) stop('K17', 'LEDGER_NOT_POSTABLE', `Line ${n}: ${lg.name} (${lg.code}) is a group, not a ledger`, 'Post to a ledger under it.');
      else if (lg.accountType === 'receivable') stop('K17', 'LEDGER_NOT_POSTABLE', `Line ${n}: ${lg.name} (${lg.code}) is a receivable ledger`, "Its lines must name a customer account: pick the customer instead.");
    }
    if (l.dr && l.cr) stop('K17', 'DEBIT_AND_CREDIT', `Line ${n}: both Dr and Cr`);
    if (!l.dr && !l.cr) stop('K17', 'MISSING_REQUIRED_DETAILS', `Line ${n}: no amount`);
  });
  const t = sum(lines);
  if (t.dr === t.cr) add('K16', 'ok', `Dr = Cr: ${rupees(t.dr)}`, undefined, { code: 'ENTRY_BALANCED' });
  else stop('K16', 'ENTRY_NOT_BALANCED', `Dr ${rupees(t.dr)} ≠ Cr ${rupees(t.cr)}`, 'The entry must balance to the paisa.');
  // Against the document (warnings: Rajan sees them). A credit note moves the other way.
  const sign = v.docType === 'credit_note' ? -1 : 1;
  const net = (f: (l: EntryLine) => boolean) => r2(lines.filter(f).reduce((s, l) => s + l.dr - l.cr, 0));
  if ((v.settlement ?? 'credit') === 'credit' && v.accountId) {
    const party = net((l) => l.ledger === 'party');
    const want = r2(sign * c.payable);
    if (Math.abs(party - want) > 0.004) add('K27', 'warn', `The customer line is ${rupees(Math.abs(party))} ${party >= 0 ? 'Dr' : 'Cr'}; the document says ${rupees(Math.abs(want))} ${want >= 0 ? 'Dr' : 'Cr'}`, 'What the customer owes is the document\'s total.', { code: 'ENTRY_VS_DOCUMENT' });
  }
  for (const head of ['cgst', 'sgst', 'igst'] as const) {
    const got = r2(-net((l) => l.ledger === `out_${head}`));
    const want = r2(sign * c[head]);
    if (Math.abs(got - want) > 0.004) add('K27', 'warn', `Output ${head.toUpperCase()} in the entry is ${rupees(Math.abs(got))}; the document's ${head.toUpperCase()} is ${rupees(Math.abs(want))}`, "The tax posted is the document's (and its IRN's).", { code: 'ENTRY_VS_DOCUMENT' });
  }
  // K26: inventory moves at approval for the goods on the invoice; the books must carry the same cost.
  const cost = isNote(v) ? null : costOfV(v, ctx, c);
  if (cost && !cost.problems.length) {
    const typed = r2(lines.filter((l) => l.ledger === 'cogs' && l.item).reduce((s, l) => s + l.dr - l.cr, 0));
    if (Math.abs(typed - cost.total) > 0.004) stop('K26', 'COST_NOT_IN_ENTRY', `The cost of goods sold in the entry is ${rupees(typed)}; inventory says ${rupees(cost.total)}`, 'Stock goes out when Rajan approves: add the cost from inventory (one click) so the books and the stock agree.');
  }
  if (ok) add('K17', 'ok', `Entry typed: ${lines.length} lines, every ledger postable`, undefined, { code: 'ENTRY_TYPED' });
}

export const stops = (c: SCheck[]) => c.filter((x) => x.level === 'stop');

/** The customer line's picker: the receivable ledgers (each line still names the customer account). */
export const RECEIVABLES = Object.keys(LEDGERS).filter((k) => LEDGERS[k].accountType === 'receivable');

/** The ledger picker's list (manual choice for now, Vijay 18-Nov): postable ledgers only (never a group, never a
 *  receivable ledger: LEDGER_NOT_POSTABLE). Empty search: the suggested ledger first, then by code. Typed: code starts
 *  with it, then a word of the name starts with it, then the name contains it; each group by code. */
export function rankLedgers(q: string, suggested?: string, pool: string[] = PICKABLE): string[] {
  const t = q.trim().toLowerCase();
  const all = pool.slice().sort((a, b) => LEDGERS[a].code.localeCompare(LEDGERS[b].code));
  if (!t) return suggested && all.includes(suggested) ? [suggested, ...all.filter((k) => k !== suggested)] : all;
  const score = (k: string) => {
    const { code, name } = LEDGERS[k];
    const n = name.toLowerCase();
    if (code.startsWith(t)) return 0;
    if (n.startsWith(t) || n.split(/[\s–(/-]+/).some((w) => w.startsWith(t))) return 1;
    if (n.includes(t) || code.includes(t)) return 2;
    return 9;
  };
  return all.map((k) => [k, score(k)] as const).filter(([, s]) => s < 9).sort((a, b) => a[1] - b[1]).map(([k]) => k);
}

/** Rajan (Accounts Manager) checks every invoice: Billing combined with this role (tasks doc §9, scenario §3.1). */
export function routesOf(v: Voucher, ctx: SalesCtx): { why: ApprovalWhy; label: string; checker: ActorKey }[] {
  if (isNote(v)) {
    // Scenario §1.8: the Accounts Manager approves every note; a scheme discount that reduces GST: the Compliance Officer too
    // (B4-07(a)); a credit note above ₹1,00,000: the Finance Controller too.
    const total = calcOf(v, ctx).payable;
    return [
      { why: 'note' as const, label: `${DOC_LABEL[v.docType!]} check`, checker: 'rajan' as ActorKey },
      ...(v.noteReason === 'scheme_discount' ? [{ why: 'gst_scheme' as const, label: `GST reduced under scheme ${v.schemeRef ?? ''} (s.15(3)(b))`, checker: 'venkat' as ActorKey }] : []),
      ...(v.docType === 'credit_note' && total > PARAMS.creditNoteFc.value ? [{ why: 'over_limit' as const, label: `Credit note above ${inr(PARAMS.creditNoteFc.value)}`, checker: 'usha' as ActorKey }] : []),
    ];
  }
  const kind = calcOf(v, ctx).kind;
  return [{ why: 'invoice', label: `${periodOf(v.date || ctx.now) === 'soft' ? 'Entry check (soft-closed month)' : 'Entry check'}${kind === 'export' ? ' · export' : ''}`, checker: 'rajan' }];
}

export const narrationOf = (v: Voucher, ctx: Pick<SalesCtx, 'accounts'>) => {
  const a = accountOf(ctx, v.accountId);
  const what = v.lines.some((l) => l.kind === 'service') && !v.lines.some((l) => l.kind === 'goods') ? 'services' : 'goods';
  return `Being ${what} sold to ${a?.name ?? '…'}${v.orderRef ? `, order ${v.orderRef}` : ''}`;
};

export const countryName = (code: string | undefined) => (code ? COUNTRIES[code] ?? code : '—');


// ---------------------------------------------------------------- rev 18 · T25 / T26: the notes
export const isNote = (v: Pick<Voucher, 'docType'>) => !!v.docType && v.docType !== 'invoice';
export const DOC_LABEL: Record<string, string> = { invoice: 'Invoice', credit_note: 'Credit note', debit_note: 'Debit note' };
export const NOTE_REASON: Record<NoteWhy, string> = {
  return: 'goods returned', scheme_discount: 'scheme discount (GST reduced)', price_correction: 'price correction', goodwill: 'goodwill discount (no GST)',
  price_increase: 'price increase', additional_charge: 'extra charge billed later',
};
/** The invoice a note corrects. */
export const againstOf = (ctx: Partial<Pick<SalesCtx, 'vouchers'>>, v: Pick<Voucher, 'againstId'>) => (v.againstId ? ctx.vouchers?.find((x) => x.id === v.againstId) ?? null : null);
/** GST: a credit note that reduces tax is issued by 30 November after the end of the invoice's financial year (s.34(2)). */
export const noteDeadline = (invoiceDate: string) => {
  const y = Number(invoiceDate.slice(0, 4)) + (Number(invoiceDate.slice(5, 7)) >= 4 ? 1 : 0);
  return `${y}-11-30`;
};
/** A return's goods at the cost they LEFT at (Stores' receipt names the batch), when the note posts the stock back. */
export function returnCostOf(v: Voucher, ctx: EntryCtx) {
  if (v.noteReason !== 'return' || v.returnStock !== 'with_credit_note' || !v.returnId) return undefined;
  const r = ctx.returns?.find((x) => x.id === v.returnId);
  return r ? [{ item: r.item, lot: r.fromLot, qty: r.qty, amount: r2(r.qty * r.unitCost) }] : undefined;
}

/** The note's own checks (scenario B4-06 to B4-08, Part C C-17 to C-19). The limit "not more than left on the invoice": G46. */
function noteChecks(v: Voucher, ctx: SalesCtx, add: (k: string, level: SCheck['level'], title: string, detail?: string, more?: Partial<SCheck>) => void) {
  const inv = againstOf(ctx, v);
  if (!inv) add('N1', 'stop', 'The note names no invoice', 'A credit or debit note corrects one invoice (GST s.34): Billing names it.');
  else if ((inv.docType ?? 'invoice') !== 'invoice' || inv.status !== 'posted') add('N1', 'stop', `${inv.number} is not a posted invoice`, 'A note corrects a posted invoice only.');
  else if (inv.accountId !== v.accountId || inv.branch !== v.branch) add('N1', 'stop', 'Another customer or GSTIN than the invoice', "The note must name the invoice's customer and be issued by its branch.", { code: 'NOTE_SAME_CUSTOMER_AND_GSTIN' });
  else add('N1', 'ok', `Against ${inv.number} of ${inv.date} (posted, same customer and GSTIN)`);
  if (v.noteReason === 'return') {
    const r = ctx.returns?.find((x) => x.id === v.returnId);
    // Rev 21: a return always needs Stores' receipt (C-17; the schema's sales_invoice_return_needs_receipt). Goods with no stock
    // record (an uploaded invoice's goods not in our item master, T8) have no batch to receive: the note cannot be a return.
    const stocked = v.lines.some((l) => !!ITEMS[l.item]);
    if (!r && !stocked) add('N2', 'stop', 'A return needs the goods received back, and these goods are not in our inventory', "Stores receives a return into the batch it left from (C-17); goods not in our item master have no batch (T8). If no goods come back into our stock, pick the reason that fits (a price correction or a discount).", { code: 'RETURN_WITHOUT_STOCK_RECORD' });
    else if (!r) add('N2', 'stop', 'Waiting for the return receipt', 'Stores records the goods back first (D-05: the batch, the quantity, the condition); then this note can go (C-17).');
    else add('N2', 'ok', `Stores' receipt ${r.id}: ${r.qty} ${r.item} from batch ${r.fromLot}, ${r.condition}`, v.returnStock === 'with_credit_note' ? "This note posts the stock back (the book's setting)." : `The receipt posted the stock back${r.entryId ? ` (${r.entryId})` : ''}: not this note (the CA's E1).`);
  }
  if (v.noteReason === 'scheme_discount' && !v.schemeRef) add('N3', 'stop', 'A scheme discount needs its scheme reference', 'GST is reduced only for a discount agreed before the supply (s.15(3)(b)): name the scheme (C-19).');
  if (v.noteReason === 'goodwill' && v.schemeRef) add('N3', 'stop', 'Goodwill cannot claim a scheme', 'No scheme agreed before the supply: GST is not reduced (C-19).');
  if (inv && v.docType === 'credit_note' && v.noteReason !== 'goodwill') {
    const last = noteDeadline(inv.docDate ?? inv.date);
    const days = daysBetween(v.docDate ?? v.date, last);
    if (days < 0) add('N4', 'stop', `The GST time limit passed on ${last}`, "A credit note that reduces GST is issued by 30 November after the invoice's year (s.34(2)). Ask the Accounts Manager.");
    else if (days <= PARAMS.noteWarnDays.value) add('N4', 'warn', `Credit note limit ${last}, ${days} days left`, 'Within 60 days of the GST time limit (scenario B4-07).');
  }
}
