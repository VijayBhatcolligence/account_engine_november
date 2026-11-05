// What a sales invoice works out, what it would post, what is checked, and who checks it. Pure functions:
// the screens only render what these return. The posting rule is the team lead's design (method §5.3):
// the module sends amounts and tax, the posting rule + account determination choose the ledgers.
//
// Who writes what (one owner per fact):
//   Stores' delivery challan   stock leaves KA-FG; under Perpetual also Dr cost of goods sold, Cr FG inventory
//   this invoice               Dr customer, Cr sales, Cr output GST (+ round off): never stock, never cost

import { inr } from '../domain/money';
import { OUR_STATE, STATES } from '../onboarding/catalogue';
import { GSTIN_RE, type CheckResult } from '../onboarding/rules';
import { branchFor, type BranchView } from '../onboarding/branches';
import type { Account, ActorKey, Party, Request } from '../onboarding/types';
import { BATCHES, BILLING, costOn, ITEMS, LEDGERS, MONTH, OPENING_DUE, PARAMS, periodOf, RECEIVABLES_CODE, type Statement } from './catalogue';
import type { ApprovalWhy, Challan, InventoryMethod, JournalEntry, JournalLine, Voucher } from './types';

export interface SalesCtx {
  accounts: Account[];
  parties: Party[];
  requests: Request[];
  journal: JournalEntry[];
  vouchers: Voucher[];
  challans: Challan[];
  method: InventoryMethod;
  now: string;
}

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const POSTING_RULE = 'SALES_INVOICE / STAT v1';
export const COST_RULE = 'GOODS_ISSUE / STAT / perpetual v1';

export const customers = (ctx: Pick<SalesCtx, 'accounts'>) => ctx.accounts.filter((a) => a.side === 'receivable');
export const accountOf = (ctx: Pick<SalesCtx, 'accounts'>, id: string) => ctx.accounts.find((a) => a.accountId === id) ?? null;
export const partyOfAccount = (ctx: Pick<SalesCtx, 'accounts' | 'parties'>, accountId: string) => {
  const a = accountOf(ctx, accountId);
  return a ? ctx.parties.find((p) => p.partyId === a.partyId) ?? null : null;
};
/** The branch an invoice bills (its GSTIN and address): chosen on the invoice, else the account's default. */
export const branchOfV = (ctx: Pick<SalesCtx, 'accounts' | 'parties'>, v: Pick<Voucher, 'accountId' | 'branchId'>): BranchView | null =>
  branchFor(accountOf(ctx, v.accountId), partyOfAccount(ctx, v.accountId), v.branchId);
export const challanOf = (ctx: Pick<SalesCtx, 'challans'>, id: string) => ctx.challans.find((c) => c.id === id) ?? null;

/** The customer account a challan's order belongs to (by name; a new customer has none until onboarded). */
export function accountForChallan(ctx: Pick<SalesCtx, 'accounts'>, dc: Challan): Account | null {
  const word = dc.customer.split(' ')[0].toLowerCase();
  return customers(ctx).find((a) => a.name.toLowerCase().startsWith(word)) ?? null;
}

/** The billed branch's state (its GSTIN first, then its address): the place of supply. */
export function stateOf(ctx: Pick<SalesCtx, 'accounts' | 'parties'>, accountId: string, branchId?: string): string | null {
  const p = partyOfAccount(ctx, accountId);
  if (!p) return null;
  return branchOfV(ctx, { accountId, branchId })?.stateCode || p.address.stateCode || null;
}

export function billingOf(ctx: Pick<SalesCtx, 'requests'>, a: Account | null): { poRule: string; delivery: string } | null {
  if (!a) return null;
  const req = a.requestId ? ctx.requests.find((r) => r.id === a.requestId) : undefined;
  if (req) return { poRule: String(req.values.poRule ?? 'none'), delivery: String(req.values.delivery ?? 'email') };
  return BILLING[a.accountId] ?? null;
}

/** What the customer owes now: brought forward + every posted Dr − Cr on its account. */
export function dueOf(ctx: Pick<SalesCtx, 'journal'>, accountId: string): number {
  const moved = ctx.journal.flatMap((e) => e.lines).filter((l) => l.accountId === accountId).reduce((t, l) => t + l.dr - l.cr, 0);
  return r2((OPENING_DUE[accountId] ?? 0) + moved);
}

/** Cartons of a challan line already on another invoice (with checkers, confirmed or credited). */
export function billedQty(ctx: Pick<SalesCtx, 'vouchers'>, dcId: string, dcLine: number, exceptId?: string): number {
  return ctx.vouchers
    .filter((v) => v.id !== exceptId && v.dcId === dcId && (v.status === 'submitted' || v.status === 'posted' || v.status === 'cancelled'))
    .flatMap((v) => v.lines.filter((l) => l.dcLine === dcLine))
    .reduce((t, l) => t + (Number(l.qty) || 0), 0);
}

/** Challans Stores has recorded with cartons still to bill (the unbilled list: keep it at zero). */
export function unbilled(ctx: Pick<SalesCtx, 'challans' | 'vouchers'>): Challan[] {
  return ctx.challans.filter((c) => c.recordedAt && c.lines.some((l, i) => l.qty - billedQty(ctx, c.id, i) > 0));
}

export const expiryOf = (batch: string) => BATCHES.find((b) => b.batch === batch)?.expiry ?? null;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

// ---------- Worked out: amounts, tax, cost ----------

export interface CalcRow {
  dcLine: number;
  item: string;
  name: string;
  batch: string;
  expiry: string | null;
  hsn: string;
  uqc: string;
  qty: number;
  rate: number;
  amount: number;
  gst: number;
  tax: number;
  cost: number; // standard cost of these cartons (on the challan date)
}

export interface Calc {
  rows: CalcRow[];
  intra: boolean | null;
  pos: string | null;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  exact: number;
  total: number;
  roundOff: number;
  cost: number;
  margin: number;
  marginPct: number | null;
  /** One row per HSN and rate, as printed under the invoice. */
  hsn: { hsn: string; gst: number; taxable: number; cgst: number; sgst: number; igst: number }[];
}

export function calcOf(v: Voucher, ctx: Pick<SalesCtx, 'accounts' | 'parties' | 'challans'>): Calc {
  const pos = v.accountId ? stateOf(ctx, v.accountId, v.branchId) : null;
  const intra = pos ? pos === OUR_STATE : null;
  const dc = challanOf(ctx, v.dcId);
  const rows: CalcRow[] = v.lines
    .filter((l) => Number(l.qty) > 0 && ITEMS[l.item])
    .map((l) => {
      const it = ITEMS[l.item];
      const qty = Number(l.qty);
      const rate = Number(l.rate) || 0;
      const amount = r2(qty * rate);
      return { dcLine: l.dcLine, item: l.item, name: it.name, batch: l.batch, expiry: expiryOf(l.batch), hsn: it.hsn, uqc: it.uqc, qty, rate, amount, gst: it.gst, tax: r2((amount * it.gst) / 100), cost: r2(qty * costOn(l.item, dc?.date ?? v.date)) };
    });
  const taxable = r2(rows.reduce((t, x) => t + x.amount, 0));
  const half = (x: CalcRow) => r2((x.amount * x.gst) / 200);
  const cgst = intra ? r2(rows.reduce((t, x) => t + half(x), 0)) : 0;
  const sgst = cgst;
  const igst = intra === false ? r2(rows.reduce((t, x) => t + x.tax, 0)) : 0;
  const exact = r2(taxable + cgst + sgst + igst);
  const total = Math.round(exact);
  const cost = r2(rows.reduce((t, x) => t + x.cost, 0));
  const groups = new Map<string, Calc['hsn'][number]>();
  for (const x of rows) {
    const k = `${x.hsn}|${x.gst}`;
    const g = groups.get(k) ?? { hsn: x.hsn, gst: x.gst, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    g.taxable = r2(g.taxable + x.amount);
    if (intra) {
      g.cgst = r2(g.cgst + half(x));
      g.sgst = r2(g.sgst + half(x));
    } else if (intra === false) g.igst = r2(g.igst + x.tax);
    groups.set(k, g);
  }
  return { rows, intra, pos, taxable, cgst, sgst, igst, exact, total, roundOff: r2(total - exact), cost, margin: r2(taxable - cost), marginPct: taxable ? r2(((taxable - cost) / taxable) * 100) : null, hsn: [...groups.values()] };
}

// ---------- Worked out: the journal lines ----------

export interface PostLine {
  ledgerKey: string;
  name: string;
  code: string;
  statement: Statement;
  dr: number;
  cr: number;
  why: string;
}

const L = (k: keyof typeof LEDGERS, dr: number, cr: number, why: string): PostLine => ({ ledgerKey: k, name: LEDGERS[k].name, code: LEDGERS[k].code, statement: LEDGERS[k].statement, dr, cr, why });

/** This invoice's entry (revenue side). It never touches stock or cost. */
export function linesOf(v: Voucher, ctx: Pick<SalesCtx, 'accounts' | 'parties' | 'challans'>): PostLine[] {
  if (v.manual) return manualLinesOf(v, ctx);
  const c = calcOf(v, ctx);
  const a = accountOf(ctx, v.accountId);
  if (!a || c.intra === null || c.taxable <= 0) return [];
  const out: PostLine[] = [
    { ledgerKey: 'party', name: `${a.name} (${a.accountId})`, code: `${RECEIVABLES_CODE[a.under] ?? '107010'} › AR`, statement: 'BS', dr: c.total, cr: 0, why: `What the customer owes, on its AR account under ${a.under}` },
    L(c.intra ? 'sales_local' : 'sales_interstate', 0, c.taxable, c.intra ? 'Place of supply Karnataka = our state' : `Place of supply ${STATES[c.pos!]?.name ?? c.pos}: inter-state`),
  ];
  if (c.intra) {
    out.push(L('out_cgst', 0, c.cgst, 'Half the GST rate, owed to the Centre'));
    out.push(L('out_sgst', 0, c.sgst, 'Half the GST rate, owed to Karnataka'));
  } else out.push(L('out_igst', 0, c.igst, 'Full GST rate, inter-state'));
  if (c.roundOff > 0) out.push(L('round_off', 0, c.roundOff, 'Total rounded up to the rupee'));
  if (c.roundOff < 0) out.push(L('round_off', -c.roundOff, 0, 'Total rounded down to the rupee'));
  return out;
}

/** A typed entry posts exactly the ledgers and amounts the person chose (the checks make sure they match the invoice). */
function manualLinesOf(v: Voucher, ctx: Pick<SalesCtx, 'accounts' | 'parties' | 'challans'>): PostLine[] {
  const m = v.manual!;
  const pick = (k: string, dr: number, cr: number, why: string): PostLine =>
    LEDGERS[k] ? { ledgerKey: k, name: LEDGERS[k].name, code: LEDGERS[k].code, statement: LEDGERS[k].statement, dr, cr, why } : { ledgerKey: k || 'none', name: '(no ledger chosen)', code: '—', statement: 'PL', dr, cr, why };
  const n = (x: number | null) => r2(Number(x) || 0);
  const out: PostLine[] = [];
  if (m.partyLedger || m.partyAmount) {
    const a = accountOf(ctx, m.partyLedger);
    out.push(a ? { ledgerKey: 'party', name: `${a.name} (${a.accountId})`, code: `${RECEIVABLES_CODE[a.under] ?? '107010'} › AR`, statement: 'BS', dr: n(m.partyAmount), cr: 0, why: 'The Party A/c and amount you typed' } : pick('', n(m.partyAmount), 0, 'The Party A/c and amount you typed'));
  }
  if (m.salesLedger || m.salesAmount) out.push(pick(m.salesLedger, 0, n(m.salesAmount), 'The sales ledger and amount you typed'));
  m.taxLines.forEach((t, i) => (t.ledger || t.amount ? out.push({ ...pick(t.ledger, 0, n(t.amount), 'The tax ledger and amount you typed'), ledgerKey: `${t.ledger || 'none'}#${i}` }) : null));
  const ro = n(m.roundOff);
  if (ro > 0) out.push(pick('round_off', 0, ro, 'The round off you typed'));
  if (ro < 0) out.push(pick('round_off', -ro, 0, 'The round off you typed'));
  return out;
}

/** The challan's cost entry as typed (Perpetual): Dr and Cr, for the whole challan. */
export function typedCostLinesOf(v: Voucher): PostLine[] {
  const k = v.manual?.cost;
  if (!k) return [];
  const pick = (key: string, dr: number, cr: number): PostLine =>
    LEDGERS[key] ? { ledgerKey: key, name: LEDGERS[key].name, code: LEDGERS[key].code, statement: LEDGERS[key].statement, dr, cr, why: 'The ledger and amount you typed' } : { ledgerKey: 'none', name: '(no ledger chosen)', code: '—', statement: 'PL', dr, cr, why: 'The ledger and amount you typed' };
  const out: PostLine[] = [];
  if (k.drLedger || k.drAmount) out.push(pick(k.drLedger, r2(Number(k.drAmount) || 0), 0));
  if (k.crLedger || k.crAmount) out.push(pick(k.crLedger, 0, r2(Number(k.crAmount) || 0)));
  return out;
}

/** What the rule would write for this invoice: the answer the typed entry is checked against (and the demo types in). */
export function ruleEntryOf(v: Voucher, ctx: Pick<SalesCtx, 'accounts' | 'parties' | 'challans'>) {
  const c = calcOf(v, ctx);
  return {
    partyLedger: v.accountId,
    partyAmount: c.total,
    salesLedger: c.intra === null ? '' : c.intra ? 'sales_local' : 'sales_interstate',
    salesAmount: c.taxable,
    taxLines: c.intra === false ? [{ ledger: 'out_igst', amount: c.igst }] : [{ ledger: 'out_cgst', amount: c.cgst }, { ledger: 'out_sgst', amount: c.sgst }],
    roundOff: c.roundOff,
  };
}

/** What the rule would write for the challan's cost: whole challan at standard cost on the challan date. */
export function ruleCostOf(v: Voucher, ctx: Pick<SalesCtx, 'challans'>) {
  const dc = challanOf(ctx, v.dcId);
  const cost = dc ? costLinesOf(dc)[0].dr : 0;
  return { drLedger: 'cogs', drAmount: cost, crLedger: 'fg_inventory', crAmount: cost };
}

/** The challan's cost entry under Perpetual, at standard cost on the challan date (what the typed entry is checked against). */
export function costLinesOf(dc: Challan): PostLine[] {
  const cost = r2(dc.lines.reduce((t, l) => t + l.qty * costOn(l.item, dc.date), 0));
  return [L('cogs', cost, 0, `${dc.lines.map((l) => `${l.qty} × ₹${costOn(l.item, dc.date)}`).join(' + ')} (standard cost)`), L('fg_inventory', 0, cost, `Cartons leave KA-FG on ${dc.id}`)];
}

export const toJournal = (lines: PostLine[], accountId?: string): JournalLine[] => lines.map((l) => (l.ledgerKey === 'party' ? { ledger: 'party', accountId, dr: l.dr, cr: l.cr } : { ledger: l.ledgerKey.split('#')[0], dr: l.dr, cr: l.cr }));
export const sum = (lines: { dr: number; cr: number }[]) => ({ dr: r2(lines.reduce((t, l) => t + l.dr, 0)), cr: r2(lines.reduce((t, l) => t + l.cr, 0)) });

export const dueDateOf = (v: Voucher, a: Account | null) => {
  if (!a || !v.date) return null;
  const d = new Date(`${v.date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (a.creditDays ?? 0));
  return d.toISOString().slice(0, 10);
};

/** E-way bill validity: one day for every 200 km or part of it (normal cargo). */
export const ewbDays = (km: number) => Math.max(1, Math.ceil(km / 200));

// ---------- Checks ----------

export function checksOf(v: Voucher, ctx: SalesCtx): CheckResult[] {
  const out: CheckResult[] = [];
  const a = accountOf(ctx, v.accountId);
  const p = partyOfAccount(ctx, v.accountId);
  const dc = challanOf(ctx, v.dcId);
  const c = calcOf(v, ctx);
  const today = ctx.now.slice(0, 10);

  if (!dc) out.push({ level: 'stop', sendBack: true, title: 'An invoice line with no challan line is refused', detail: 'Bill only what Stores has recorded on a delivery challan.' });
  if (!a) out.push({ level: 'stop', title: 'No customer account for this order', detail: 'A new customer is set up first (Create a customer).' });
  if (a && a.under === 'Trade Receivables › Export & SEZ') out.push({ level: 'stop', title: 'Export invoice: not in this task yet', detail: 'Zero-rated under LUT, with currency and shipping bill: checked by the Compliance Officer.' });

  // The date decides the period and the GST return.
  if (v.date) {
    const per = periodOf(v.date);
    if (per === 'hard') out.push({ level: 'stop', title: `${MONTH(v.date)} is closed`, detail: 'Nothing can be posted into a hard-closed period.' });
    if (per === 'soft') out.push({ level: 'warn', title: `${MONTH(v.date)} is soft-closed`, detail: 'Allowed only as an adjustment the Accounts Manager approves.' });
    if (v.date > today) out.push({ level: 'stop', title: 'Invoice date is after today' });
    if (dc && v.date < dc.date) out.push({ level: 'warn', title: `Invoice dated before ${dc.id} (${dc.date})`, detail: 'Allowed (an invoice may precede removal of the goods), but check the date.' });
  }

  // Quantities: never above the challan (0% tolerance); partial billing allowed.
  let any = false;
  v.lines.forEach((l, i) => {
    const q = Number(l.qty) || 0;
    if (q > 0) any = true;
    if (l.dcLine < 0) return; // a line not on the challan is stopped by its own check
    const left = l.dcQty - billedQty(ctx, v.dcId, l.dcLine, v.id);
    if (q > left) out.push({ level: 'stop', title: `Line ${i + 1}: ${q} cartons, but only ${left} on ${v.dcId} are not yet billed`, detail: 'An invoice may never bill more than the challan (0% above).' });
    else if (q > 0 && q < left) out.push({ level: 'warn', title: `Line ${i + 1}: ${left - q} cartons of ${l.batch} stay on the unbilled list`, detail: 'Partial billing is allowed; bill the rest on another invoice.' });
  });
  const missing: string[] = [];
  if (!v.date) missing.push('Date');
  if (!any) missing.push('Quantity on at least one line');
  if (billingOf(ctx, a)?.poRule === 'every_invoice' && !v.customerPo.trim()) missing.push("Customer's PO number");
  if (missing.length) out.push({ level: 'stop', title: `Still to fill: ${missing.join(' · ')}` });

  // The whole challan already billed: a second invoice for it is a duplicate.
  if (dc && dc.lines.every((l, i) => l.qty - billedQty(ctx, dc.id, i, v.id) <= 0)) out.push({ level: 'stop', sendBack: true, title: `${dc.id} is already fully invoiced`, detail: 'A duplicate invoice for the same challan. Discard this one.' });

  // E-invoice pre-check (before approval, so the IRN does not fail). Identity lives in the party master.
  if (p) {
    const bv = branchOfV(ctx, v);
    const g = bv?.gstin?.value ?? '';
    const pin = bv?.location?.pincode ?? p.address.pincode;
    const pre: string[] = [];
    if (!GSTIN_RE.test(g)) pre.push("buyer's GSTIN missing or invalid");
    if (!/^\d{6}$/.test(pin)) pre.push('ship-to pincode missing');
    if (c.rows.some((r) => r.hsn.length < 6)) pre.push('HSN needs 6 digits (turnover above ₹5 crore)');
    if (pre.length) out.push({ level: 'stop', title: `E-invoice pre-check: ${pre.join(' · ')}`, detail: `You cannot edit it here: party identity lives in the party master (${p.partyId}). Raise a change there; the invoice stays Draft.` });
    else if (c.rows.length) out.push({ level: 'ok', title: 'E-invoice pre-check passes', detail: 'Buyer GSTIN, ship-to pincode, 6-digit HSN, place of supply.' });
  }
  if (c.intra !== null && c.rows.length) out.push({ level: 'ok', title: c.intra ? 'Karnataka customer: CGST + SGST' : `${STATES[c.pos!]?.name ?? c.pos} customer: IGST` });

  // Batches near expiry (Stores warned at the challan; shown again on the invoice).
  for (const r of c.rows) {
    if (r.expiry && v.date && daysBetween(v.date, r.expiry) <= PARAMS.expiryWarnDays.value) out.push({ level: 'warn', title: `Batch ${r.batch} expires ${r.expiry} (${daysBetween(v.date, r.expiry)} days)`, detail: 'Stores warned at the challan (FEFO). The customer must sell it quickly.' });
  }

  // Margin on standard cost (the Sales Order approval checked it; shown so nothing is billed below cost unseen).
  if (c.marginPct !== null) {
    if (c.margin < 0) out.push({ level: 'warn', title: `Below cost: margin ${inr(c.margin)}`, detail: 'The order needed the Sales Manager. Check it was approved.' });
    else if (c.marginPct < PARAMS.marginFloor.value) out.push({ level: 'warn', title: `Margin ${c.marginPct}% is below the ${PARAMS.marginFloor.value}% floor`, detail: 'The order needed the Sales Manager. Check it was approved.' });
  }

  // Credit: checked on the order. Goods dispatched are billed anyway; an over-limit is only told.
  if (a && a.creditLimit !== null && c.total > 0) {
    const due = dueOf(ctx, a.accountId);
    if (due + c.total > a.creditLimit) out.push({ level: 'warn', title: `After this invoice the customer is over its limit by ${inr(due + c.total - a.creditLimit)}`, detail: 'Credit is checked on the Sales Order; goods already dispatched are billed. Farid is told.' });
  }

  if (v.manual) manualChecks(v, ctx, c, out);

  // Accounting.
  const lines = linesOf(v, ctx);
  if (lines.length) {
    const t = sum(lines);
    out.push(t.dr === t.cr ? { level: 'ok', title: `Dr = Cr: ${rupees(t.dr)}` } : { level: 'stop', title: `Dr ${rupees(t.dr)} ≠ Cr ${rupees(t.cr)}` });
    out.push({ level: 'ok', title: 'A balance-sheet side (customer, GST) and a P&L side (sales)' });
    if (dc) out.push(ctx.method === 'perpetual' ? (v.manual?.cost && !dc.costEntryId ? { level: 'ok', title: `Cost entry for ${dc.id} typed: posts as its own entry, dated ${dc.date}`, detail: 'It belongs to the challan (the goods left), not to the invoice: inventory is credited once.' } : { level: 'ok', title: `Cost of goods sold already posted on ${dc.id}`, detail: 'This invoice does not touch stock: no double credit to inventory.' }) : { level: 'ok', title: 'Periodic: no cost entry per sale', detail: 'Cost of goods sold comes from the closing stock at month end (T11).' });
  }
  return out;
}

/**
 * The typed entry, checked against the invoice and the posting rule. The rule never overwrites what was typed:
 * it stops with the reason, and the person corrects the entry.
 */
function manualChecks(v: Voucher, ctx: SalesCtx, c: Calc, out: CheckResult[]) {
  const m = v.manual!;
  const want = ruleEntryOf(v, ctx);
  const missing: string[] = [];
  const off = (x: number | null, y: number) => Math.abs((Number(x) || 0) - y) > 0.004;
  const a = accountOf(ctx, v.accountId);
  if (!m.partyLedger) missing.push('Party A/c');
  else if (m.partyLedger !== v.accountId) out.push({ level: 'stop', title: `Party A/c: this invoice is to ${a?.name ?? v.accountId}`, detail: `You chose ${accountOf(ctx, m.partyLedger)?.name ?? m.partyLedger}. The debit goes to the buyer on the invoice (${v.accountId}).` });
  if (m.partyAmount === null) missing.push('Party A/c amount');
  else if (off(m.partyAmount, c.total)) out.push({ level: 'stop', title: `Party A/c Dr ${rupees(Number(m.partyAmount))}: the invoice total is ${rupees(c.total)}`, detail: 'The customer owes the invoice total, tax and round off included.' });
  if (!m.salesLedger) missing.push('Sales ledger');
  else if (want.salesLedger && m.salesLedger !== want.salesLedger) out.push({ level: 'stop', title: `Sales ledger: a ${c.intra ? 'local' : 'inter-state'} sale goes to ${LEDGERS[want.salesLedger].name}`, detail: `You chose ${LEDGERS[m.salesLedger]?.name ?? m.salesLedger}. Place of supply ${STATES[c.pos ?? '']?.name ?? '—'}${c.intra ? ' = our state' : ' ≠ our state'}.` });
  if (m.salesAmount === null) missing.push('Sales amount');
  else if (off(m.salesAmount, c.taxable)) out.push({ level: 'stop', title: `Sales Cr ${rupees(Number(m.salesAmount))}: the taxable value is ${rupees(c.taxable)}`, detail: 'Sales takes the taxable value only; GST goes to its own ledgers.' });
  const chosen = m.taxLines.filter((t) => t.ledger);
  if (!chosen.length) missing.push('Tax ledgers');
  else if (c.intra !== null) {
    const keys = want.taxLines.map((t) => t.ledger);
    const have = chosen.map((t) => t.ledger);
    if (have.some((k) => !keys.includes(k)) || keys.some((k) => !have.includes(k)) || new Set(have).size !== have.length)
      out.push({ level: 'stop', title: `Tax ledgers: ${c.intra ? 'a local sale takes Output CGST and Output SGST (no IGST)' : 'an inter-state sale takes Output IGST only'}`, detail: `You chose ${have.map((k) => LEDGERS[k]?.name ?? k).join(', ')}.` });
    for (const t of chosen) {
      const w = want.taxLines.find((x) => x.ledger === t.ledger);
      if (t.amount === null) missing.push(`${LEDGERS[t.ledger]?.name ?? t.ledger} amount`);
      else if (w && off(t.amount, w.amount)) out.push({ level: 'stop', title: `${LEDGERS[t.ledger].name} ${rupees(Number(t.amount))}: the invoice shows ${rupees(w.amount)}`, detail: `${c.rows[0]?.gst ?? 5}% GST${c.intra ? ', half each for CGST and SGST' : ''} on taxable ${rupees(c.taxable)}.` });
    }
  }
  if (m.taxLines.some((t) => !t.ledger && t.amount !== null)) missing.push('Tax ledger for an amount');
  if (off(m.roundOff, c.roundOff)) out.push({ level: 'stop', title: `Round off ${rupees(Number(m.roundOff) || 0)}: the invoice shows ${rupees(c.roundOff)}`, detail: 'Round off takes only the paise that make the total a whole rupee.' });
  const dc = challanOf(ctx, v.dcId);
  if (m.cost && dc && !dc.costEntryId && ctx.method === 'perpetual') {
    const k = m.cost;
    const w = ruleCostOf(v, ctx);
    if (!k.drLedger) missing.push('Cost Dr ledger');
    else if (k.drLedger !== w.drLedger) out.push({ level: 'stop', title: `Cost entry Dr: the goods that left go to ${LEDGERS.cogs.name}`, detail: `You chose ${LEDGERS[k.drLedger]?.name ?? k.drLedger}.` });
    if (k.drAmount === null) missing.push('Cost Dr amount');
    else if (off(k.drAmount, w.drAmount)) out.push({ level: 'stop', title: `Cost of goods sold ${rupees(Number(k.drAmount))}: ${dc.id} at standard cost is ${rupees(w.drAmount)}`, detail: `${costLinesOf(dc)[0].why}: the whole challan, on ${dc.date}.` });
    if (!k.crLedger) missing.push('Cost Cr ledger');
    else if (k.crLedger !== w.crLedger) out.push({ level: 'stop', title: `Cost entry Cr: the goods leave ${LEDGERS.fg_inventory.name}`, detail: `You chose ${LEDGERS[k.crLedger]?.name ?? k.crLedger}.` });
    if (k.crAmount === null) missing.push('Cost Cr amount');
    else if (off(k.crAmount, w.crAmount)) out.push({ level: 'stop', title: `Inventory Cr ${rupees(Number(k.crAmount))}: ${dc.id} at standard cost is ${rupees(w.crAmount)}` });
    const t = sum(typedCostLinesOf(v));
    if (t.dr !== t.cr && k.drAmount !== null && k.crAmount !== null) out.push({ level: 'stop', title: `Cost entry: Dr ${rupees(t.dr)} ≠ Cr ${rupees(t.cr)}` });
  }
  if (missing.length) {
    const i = out.findIndex((x) => x.title.startsWith('Still to fill: '));
    if (i >= 0) out[i] = { ...out[i], title: `${out[i].title} · ${missing.join(' · ')}` };
    else out.push({ level: 'stop', title: `Still to fill: ${missing.join(' · ')}` });
  }
}

export const stops = (c: CheckResult[]) => c.filter((x) => x.level === 'stop');

/** Rajan (Accounts Manager) checks every invoice: Billing combined with this role (tasks doc §9, scenario §3.1). */
export function routesOf(v: Voucher, ctx: Pick<SalesCtx, 'now'>): { why: ApprovalWhy; label: string; checker: ActorKey }[] {
  return [{ why: 'invoice', label: periodOf(v.date || ctx.now) === 'soft' ? 'Invoice check (soft-closed month)' : 'Invoice check', checker: 'rajan' }];
}

export const narrationOf = (v: Voucher, ctx: Pick<SalesCtx, 'accounts' | 'challans'>) => {
  const a = accountOf(ctx, v.accountId);
  const dc = challanOf(ctx, v.dcId);
  return `Being goods sold to ${a?.name ?? '…'} against ${v.dcId}${dc ? ` / ${dc.soId}` : ''}${v.customerPo ? `, their PO ${v.customerPo}` : ''}`;
};
