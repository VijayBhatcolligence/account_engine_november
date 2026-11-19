// What a sales invoice works out, what the engine posts, what is checked, and who checks it (T24 §5, §7, §8).
// Pure functions: the screens only render what these return.
//
// Rev 5 (18-Nov): an independent invoice, as the CA's 43 specimens show it: no challan, no order, no customer PO.
// Who writes what (one owner per fact, CLAUDE.md §3):
//   this invoice               Dr customer (its account's receivable ledger), Cr sales, Cr output GST (± round off): never stock or cost
//   Stores (task G30)          the goods leaving the store, stock and cost of goods sold: not here
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
import { caseOf, postingFor, type FactLine, type Facts } from './engine';
import type { ApprovalWhy, InvoiceLine, JournalEntry, JournalLine, Voucher } from './types';

export interface SalesCtx {
  accounts: Account[];
  parties: Party[];
  requests: Request[];
  journal: JournalEntry[];
  vouchers: Voucher[];
  now: string;
}

/** A check with its spec id (T24 §7: K1–K19) and its code (the engine's refusal code, the schema's check). */
export type SCheck = CheckResult & { k?: string; code?: string };

/** The default code of each check id (T24 §7). A case of its own overrides it (e.g. K7 DATE_IN_FUTURE). */
export const CHECK_CODE: Record<string, string> = {
  K1: 'DEBTOR_ACCOUNT_NOT_FOUND', K6: 'DISCOUNT_ABOVE_LINE_VALUE', K7: 'PERIOD_CLOSED', K8: 'PERIOD_SOFT_CLOSED', Fill: 'MISSING_REQUIRED_DETAILS', K10: 'E_INVOICE_PRECHECK',
  K11: 'LUT_NOT_VALID', K12: 'SHIPPING_BILL_PENDING', E4: 'COUNTRY_MISSING', E5: 'PORT_CODE_MISSING',
  K15: 'OVER_CREDIT_LIMIT', R7: 'TCS_RATE_UNCONFIRMED', K16: 'DEBITS_CREDITS_DIFFER', K17: 'ENTRY_DIFFERS_FROM_RULE', K18: 'IRP_30_DAY_LIMIT',
  K19: 'MAKER_MAY_NOT_DECIDE', A3: 'BRANCH_NOT_VALID', B9: 'TAX_SPLIT', B5: 'BUYER_UNREGISTERED',
  K20: 'THIRD_PARTY_SHIP_TO_INCOMPLETE', K21: 'PLACE_OF_SUPPLY_PROPERTY', K22: 'SERVICE_PERIOD_REQUIRED', K23: 'NON_TAXABLE_LINES', K24: 'IGST_REFUND_CLAIMED', K25: 'ADVANCE_ADJUSTMENT_INVALID',
};

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const money = (n: number, cur: string) => (cur === 'INR' ? rupees(n) : `${cur} ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export const POSTING_RULE = 'SALES_INVOICE v1 (effective 1-Apr-2026)';

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
  revenue: string; // LEDGERS key (C17, by rule)
  rule: RuleId;
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
  rules: RuleId[];
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
  const goodsRate = Math.max(0, ...v.lines.filter((l) => l.kind === 'goods').map((l) => itemOf(l.item)?.gst ?? 0)) || 18;
  const facts = { buyer: kind, exportType: kind === 'domestic' ? null : exportTypeOf(v) };
  const rows: CalcRow[] = v.lines
    .map((l, idx) => ({ l, idx, it: itemOf(l.item) }))
    .filter(({ l, it }) => Number(l.qty) > 0 && it)
    .map(({ l, idx, it }) => {
      const qty = Number(l.qty);
      const rate = Number(l.rate) || 0;
      const discount = Number(l.discount) || 0;
      const gross = r2(qty * rate - discount);
      const foreign = currency === 'INR' ? null : gross;
      const amount = currency === 'INR' ? gross : r2(gross * fx);
      const taxability: Taxability = l.kind === 'reimbursement' ? 'non_gst' : it!.taxability;
      const gst = taxability !== 'taxable' ? 0 : l.kind === 'charge' ? goodsRate : it!.gst;
      const half = r2((amount * gst) / 200);
      const cgst = intra ? half : 0;
      const igst = intra === false && !zeroRated ? r2((amount * gst) / 100) : 0;
      const deferred = l.kind === 'service' && !!it!.period;
      const fl: FactLine = { kind: l.kind, taxability, amount, cgst, sgst: cgst, igst, deferred };
      const c = caseOf(facts, fl, intra === true);
      return { idx, kind: l.kind, taxability, deferred, item: l.item, name: it!.name, hsn: it!.hsn, uqc: it!.uqc, qty, rate, discount, foreign, amount, gst, cgst, sgst: cgst, igst, tax: r2(cgst * 2 + igst), revenue: c.ledger, rule: c.rule as RuleId } as CalcRow;
    });
  const rules = new Set<RuleId>(rows.map((x) => x.rule));
  if (isTcsCategory(a)) rules.add('R7');
  if (v.settlement && v.settlement !== 'credit') rules.add('R8');
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
    rules: [...rules].sort((x, y) => Number(x.slice(1)) - Number(y.slice(1))), hsn: [...groups.values()],
  };
}

/** The facts the invoice sends the posting rule (the engine model: the slice sends facts, the engine picks the ledgers). */
export const factsOf = (v: Voucher, c: Calc, receivableKey: string): Facts => ({
  buyer: c.kind,
  exportType: c.exportType,
  settlement: v.settlement ?? 'credit',
  intra: c.intra === true,
  lines: c.rows.map((x) => ({ kind: x.kind, taxability: x.taxability, amount: x.amount, cgst: x.cgst, sgst: x.sgst, igst: x.igst, deferred: x.deferred })),
  roundOff: c.roundOff,
  receivableKey,
});

// ---------- The engine's entry (§8.2) and the AE's edit (§8.4) ----------

export interface EntryLine {
  id: string; // 'party' · 'settle' · 'refund' · 'rev:sale_products' · 'tax:cgst' · 'round' · edit ids
  role: 'party' | 'settlement' | 'refund' | 'revenue' | 'tax' | 'round' | 'added';
  ledger: string; // LEDGERS key, or 'party'
  name: string;
  code: string;
  statement: Statement;
  dr: number;
  cr: number;
  rule: string; // 'R1' · 'R1 + R3' · 'edit'
  why: string;
  locked: boolean;
  /** Differs from the rule (edited, split or added). */
  changed?: boolean;
  /** The amount differs from the rule's, or the line was added / split: a reason is required (a ledger-only change needs none). */
  amountChanged?: boolean;
  reason?: string;
  /** What the rule had on this line. */
  ruleLedger?: string;
  /** The ledger key shown in the picker (the customer line: its receivable ledger; others: = ledger). */
  ledgerKey?: string;
}

const L = (key: string) => LEDGERS[key] ?? { code: '—', name: key ? `(${key})` : '(no ledger chosen)', statement: 'PL' as Statement };

const REV_WHY: Record<string, string> = {
  sale_products: 'Taxable value of goods: a domestic sale of our products (the place of supply is on the invoice)',
  sale_services: 'Taxable value of service lines (SAC): Sale of Services',
  export_sales: 'Export / SEZ supply: zero-rated (under LUT no GST; with IGST, the IGST is ours to claim back)',
  exempt_sales: 'Nil-rated, exempt or non-GST value: no tax charged (R9; the CA\'s specimen A5, A6)',
  freight_recovered: 'Freight charged to the buyer: part of the value of supply, taxed at the goods\' rate (R10; specimen A8)',
  reimbursement_recoverable: 'Paid as the buyer\'s pure agent: outside the value of supply, no GST (R11; specimen B5)',
  contract_liability: 'A period service billed in advance: revenue is earned month by month, so it waits in Contract Liability (R12; specimen B6)',
};

/** The entry the posting rule writes (read-only unless the AE edits it): engine.postingFor on the invoice's facts. */
export function ruleEntryOf(v: Voucher, ctx: Pick<SalesCtx, 'accounts' | 'parties' | 'requests'>): EntryLine[] {
  const c = calcOf(v, ctx);
  const a = accountOf(ctx, v.accountId);
  if (!a || c.pos === null || c.taxable + c.exempt + c.reimbursement <= 0) return [];
  const ar = receivableOf(a);
  const home = STATES[issuerOf(v).state]?.name ?? issuerOf(v).state;
  return postingFor(factsOf(v, c, ar.key)).map((p): EntryLine => {
    const lg = p.ledger === 'party' ? { code: ar.code, name: `${a.name} (${a.accountId})`, statement: 'BS' as Statement } : L(p.ledger);
    const why =
      p.role === 'party' ? `What the buyer owes${c.refund ? ' (the invoice value less the IGST we claim back)' : ''}, on ${ar.name} (${ar.code}), the receivable ledger of its debtor category; the line names the account`
      : p.role === 'settlement' ? `Paid at once (${v.settlement === 'cash' ? 'cash' : 'UPI / card'}): the money is in the clearing account, the customer owes nothing (R8; specimen A3)`
      : p.role === 'refund' ? 'IGST paid by us on the export / SEZ supply and claimed back: not the buyer\'s (R5 / R6; specimens C2, C4, C6)'
      : p.role === 'tax' ? (p.ledger === 'out_cgst' ? 'Half the GST rate, owed to the Centre (local sale)' : p.ledger === 'out_sgst' ? `Half the GST rate, owed to ${home} (local sale)` : c.kind === 'domestic' ? 'Full GST rate: inter-state' : 'IGST on the export / SEZ supply, paid by us')
      : p.role === 'round' ? (p.cr ? 'Total rounded up to the rupee' : 'Total rounded down to the rupee')
      : REV_WHY[p.ledger] ?? '';
    return { id: p.id, role: p.role, ledger: p.ledger, ledgerKey: p.ledger === 'party' ? ar.key : p.ledger, name: lg.name, code: lg.code, statement: lg.statement, dr: p.dr, cr: p.cr, rule: p.rule, why, locked: p.locked };
  });
}

/** The entry that posts: the rule's, or the AE's edit (party and tax lines always the rule's: locked). */
export function entryOf(v: Voucher, ctx: Pick<SalesCtx, 'accounts' | 'parties' | 'requests'>): EntryLine[] {
  const rule = ruleEntryOf(v, ctx);
  if (!v.edit || !rule.length) return rule;
  // Lines whose amount is the invoice's: the ledger may still be picked (Vijay, 18-Nov: every ledger is a suggestion).
  const picks = v.edit.picks ?? {};
  const locked = rule.filter((l) => l.locked).map((l): EntryLine => {
    const k = picks[l.id];
    if (!k || k === l.ledgerKey) return l;
    const lg = L(k);
    return l.ledger === 'party'
      ? { ...l, code: lg.code, ledgerKey: k, changed: true, ruleLedger: l.ledgerKey, rule: 'edit' }
      : { ...l, ledger: k, ledgerKey: k, name: lg.name, code: lg.code, statement: lg.statement, changed: true, ruleLedger: l.ledger, rule: 'edit' };
  });
  const edited: EntryLine[] = v.edit.lines.map((e) => {
    const r = e.from ? rule.find((x) => x.id === e.from) : undefined;
    const amountChanged = !r || Math.abs(r.dr - e.dr) > 0.004 || Math.abs(r.cr - e.cr) > 0.004;
    const changed = amountChanged || r.ledger !== e.ledger;
    const lg = L(e.ledger);
    return { id: e.id, role: r ? r.role : 'added', ledger: e.ledger, name: lg.name, code: lg.code, statement: lg.statement, dr: r2(e.dr), cr: r2(e.cr), rule: changed ? 'edit' : r!.rule, why: r ? r.why : 'Added by the AE', locked: false, changed, amountChanged, reason: e.reason, ruleLedger: r?.ledger };
  });
  const isRound = (l: EntryLine) => v.edit!.lines.find((e) => e.id === l.id)?.from === 'round';
  const head = locked.filter((l) => l.role === 'party' || l.role === 'settlement' || l.role === 'refund');
  return [...head, ...edited.filter((l) => !isRound(l)), ...locked.filter((l) => l.role === 'tax'), ...edited.filter(isRound)];
}

/** "Entry differs from rule R1: lines 2, 4" (§8.4), or null when the entry is the rule's. */
export function entryDiffOf(v: Voucher, ctx: Pick<SalesCtx, 'accounts' | 'parties' | 'requests'>): string | null {
  if (!v.edit) return null;
  const lines = entryOf(v, ctx);
  const nos = lines.map((l, i) => (l.changed ? i + 1 : 0)).filter(Boolean);
  const rule = ruleEntryOf(v, ctx);
  const dropped = rule.filter((r) => !r.locked && !v.edit!.lines.some((e) => e.from === r.id));
  if (!nos.length && !dropped.length) return null;
  return `Entry differs from rule ${calcOf(v, ctx).rules.join(' + ')}: line${nos.length === 1 ? '' : 's'} ${nos.join(', ')}${dropped.length ? ` (removed: ${dropped.map((d) => d.name).join(', ')})` : ''}`;
}

export const toJournal = (lines: EntryLine[], accountId?: string): JournalLine[] =>
  lines.filter((l) => l.dr || l.cr).map((l) => (l.ledger === 'party' ? { ledger: 'party', accountId, dr: l.dr, cr: l.cr, code: l.code } : { ledger: l.ledger, dr: l.dr, cr: l.cr, ...(l.changed && l.reason ? { reason: l.reason } : {}) }));
/** ReverseJournalEntry (Manoj's journal.py): the exact mirror, Dr and Cr swapped, line by line. */
export const mirrorOf = (lines: JournalLine[]): JournalLine[] => lines.map((l) => ({ ...l, dr: l.cr, cr: l.dr }));
export const sum = (lines: { dr: number; cr: number }[]) => ({ dr: r2(lines.reduce((t, l) => t + l.dr, 0)), cr: r2(lines.reduce((t, l) => t + l.cr, 0)) });

export const dueDateOf = (v: Pick<Voucher, 'date'>, a: Account | null) => {
  if (!a || !v.date) return null;
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
export const seriesOf = (v: Pick<Voucher, 'branch'>, c: Pick<Calc, 'docType'>) => {
  const s = issuerOf(v).series;
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
  if (!v.accountId) add('K1', 'stop', 'The invoice names no customer account', 'Return it to Billing (or book a walk-in sale paid at once).');
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
  // K15 credit (a warning: the goods are already invoiced).
  if (a && a.creditLimit !== null && c.payable > 0 && (v.settlement ?? 'credit') === 'credit') {
    const due = dueOf(ctx, a.accountId);
    if (due + c.payable > a.creditLimit) add('K15', 'warn', `After this invoice the customer is over its limit by ${inr(due + c.payable - a.creditLimit)}`, 'Allowed; Rajan sees it and Farid (Credit Controller) is told.');
  }
  // D3 / R7 TCS.
  if (isTcsCategory(a)) add('R7', 'warn', 'TCS item (income tax s.394): the rate is not confirmed', 'R7 adds Cr TCS payable; the rate and its ledger wait for the CA (G18).');
  if (missing.length) add('Fill', 'stop', `Still to fill: ${missing.join(' · ')}`, undefined, { code: 'MISSING_REQUIRED_DETAILS' });

  // K16, K17: the entry.
  const lines = entryOf(v, ctx);
  if (lines.length) {
    const t = sum(lines);
    if (t.dr === t.cr) add('K16', 'ok', `Dr = Cr: ${rupees(t.dr)}`, undefined, { code: 'ENTRY_BALANCED' });
    else add('K16', 'stop', `Dr ${rupees(t.dr)} ≠ Cr ${rupees(t.cr)}`, 'The entry must balance to the paisa.');
    if (v.edit) editChecks(v, ctx, c, lines, add);
    else add('K17', 'ok', `Entry by rule ${c.rules.join(' + ')}: not edited`, undefined, { code: 'ENTRY_AS_RULE' });
  }
  return out;
}

/** K17: the AE's edit (§8.4). Locked lines, a reason on every changed line, no group or receivable ledger. */
function editChecks(v: Voucher, ctx: SalesCtx, c: Calc, lines: EntryLine[], add: (k: string, level: SCheck['level'], title: string, detail?: string, more?: Partial<SCheck>) => void) {
  let broken = false;
  const stop = (code: string, title: string, detail?: string) => {
    broken = true;
    add('K17', 'stop', title, detail, { code });
  };
  const party = lines.filter((l) => l.role === 'party' || l.role === 'settlement');
  if (party.length !== 1 || Math.abs(party[0].dr - c.payable) > 0.004) stop('LOCKED_LINE_CHANGED', `Customer line must be Dr ${rupees(c.payable)} (what the buyer owes)`);
  const refund = r2(lines.filter((l) => l.role === 'refund').reduce((t, l) => t + l.dr, 0));
  if (Math.abs(refund - c.refund) > 0.004) stop('LOCKED_LINE_CHANGED', `IGST refund line must be Dr ${rupees(c.refund)}`);
  // The tax lines carry the invoice's tax, whatever ledger is picked; no other line may post into an output tax ledger.
  for (const head of ['cgst', 'sgst', 'igst'] as const) {
    const onTaxLines = r2(lines.filter((l) => l.id === `tax:${head}`).reduce((t, l) => t + l.cr - l.dr, 0));
    if (Math.abs(onTaxLines - c[head]) > 0.004) stop('LOCKED_LINE_CHANGED', `The ${head.toUpperCase()} line is ${rupees(onTaxLines)}: the invoice's tax is ${rupees(c[head])}`, "The tax amount is the invoice's (and the IRN's); only its ledger may be picked.");
    const got = r2(lines.filter((l) => l.ledger === `out_${head}`).reduce((t, l) => t + l.cr - l.dr, 0));
    const want = r2(lines.filter((l) => l.id === `tax:${head}` && l.ledger === `out_${head}`).reduce((t, l) => t + l.cr - l.dr, 0));
    if (Math.abs(got - want) > 0.004) stop('LOCKED_LINE_CHANGED', `Output ${head.toUpperCase()} in the entry is ${rupees(got)}: the invoice's tax is ${rupees(want)}`, 'Only its own tax line (same head) posts into an output tax ledger.');
  }
  lines.forEach((l, i) => {
    const n = i + 1;
    if (l.locked) {
      if (!l.changed) return;
      const lg = LEDGERS[l.ledgerKey ?? ''];
      if (l.ledger === 'party' && lg?.accountType !== 'receivable') stop('LEDGER_NOT_POSTABLE', `Line ${n}: the customer line must post to a receivable ledger`);
      else if (l.ledger !== 'party' && (!lg || lg.isGroup || lg.accountType === 'receivable')) stop('LEDGER_NOT_POSTABLE', `Line ${n}: pick a postable ledger (never a group or a receivable ledger)`);
      return;
    }
    const lg = LEDGERS[l.ledger];
    if (!l.ledger) stop('MISSING_REQUIRED_DETAILS', `Line ${n}: choose a ledger`);
    else if (!lg) stop('LEDGER_NOT_FOUND', `Line ${n}: ${l.ledger} is not in the chart`);
    else if (lg.isGroup) stop('LEDGER_NOT_POSTABLE', `Line ${n}: ${lg.name} (${lg.code}) is a group, not a ledger`, 'Post to a ledger under it.');
    else if (lg.accountType === 'receivable') stop('LEDGER_NOT_POSTABLE', `Line ${n}: ${lg.name} (${lg.code}) is a receivable ledger`, "Its lines must name a customer account: only the customer line reaches it, through the customer's own account.");
    if (l.dr && l.cr) stop('DEBIT_AND_CREDIT', `Line ${n}: both Dr and Cr`);
    if (l.amountChanged && !l.reason?.trim()) stop('REASON_REQUIRED', `Line ${n}: a reason is needed for the change`, 'A changed amount or an added line carries its reason; Rajan sees it. Picking another ledger needs none (manual for now).');
  });
  const diff = entryDiffOf(v, ctx);
  if (!broken && diff) add('K17', 'warn', diff, 'Goes to Rajan as an exception; the journal keeps the rule and your edit (who, why, approved by).');
  if (!diff) add('K17', 'ok', 'Entry editable: nothing changed from the rule yet', undefined, { code: 'ENTRY_AS_RULE' });
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
export function routesOf(v: Voucher, ctx: SalesCtx): { why: ApprovalWhy; label: string; checker: ActorKey; entryDiff?: string }[] {
  const diff = entryDiffOf(v, ctx) ?? undefined;
  const kind = calcOf(v, ctx).kind;
  return [{ why: 'invoice', label: `${periodOf(v.date || ctx.now) === 'soft' ? 'Entry check (soft-closed month)' : 'Entry check'}${kind === 'export' ? ' · export' : ''}${diff ? ' · ledgers differ from the suggestion' : ''}`, checker: 'rajan', entryDiff: diff }];
}

export const narrationOf = (v: Voucher, ctx: Pick<SalesCtx, 'accounts'>) => {
  const a = accountOf(ctx, v.accountId);
  const what = v.lines.some((l) => l.kind === 'service') && !v.lines.some((l) => l.kind === 'goods') ? 'services' : 'goods';
  return `Being ${what} sold to ${a?.name ?? '…'}${v.orderRef ? `, order ${v.orderRef}` : ''}`;
};

export const countryName = (code: string | undefined) => (code ? COUNTRIES[code] ?? code : '—');
