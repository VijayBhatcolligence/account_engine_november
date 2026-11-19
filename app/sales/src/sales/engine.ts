// The posting rule SALES_INVOICE v1, as ONE pure function (rev 3, 16-Nov-2026): business facts in, the entry out.
// The engine model (CLAUDE.md §3): the slice sends facts (who, what kind of supply, values, tax by head, how it is
// settled); the engine picks the rule case and the ledgers. The screen (rules.ts) and the CA's answer keys
// (casebook.test.ts, docs/sales/shared_doc_reference/expected_postings.json) both call this, so they cannot disagree.
//
// Cases (fin.posting_rule, SALES_INVOICE v1, from 1-Apr-2026):
//   R1 goods, domestic, local · R2 goods, domestic, inter-state · R3 service · R4 export / SEZ under LUT (no GST)
//   R5 export with IGST · R6 SEZ with IGST: the buyer owes the value only; IGST paid by us, refund claimed (rev 3 fix, F1)
//   R7 TCS item · R8 paid at once (cash / UPI / card): the clearing account, not the customer
//   R9 nil-rated, exempt or non-GST line · R10 freight charged (part of the value, taxed) · R11 pure-agent expense (outside
//   the value, no GST) · R12 a period service: revenue deferred to Contract Liability, released month by month

export type FactLineKind = 'goods' | 'service' | 'charge' | 'reimbursement';
export type FactTaxability = 'taxable' | 'nil_rated' | 'exempt' | 'non_gst';

export interface FactLine {
  kind: FactLineKind;
  taxability: FactTaxability;
  /** The line's value in ₹ (for a taxable line: its taxable value). */
  amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  /** A period service whose revenue is earned over the period (R12). */
  deferred?: boolean;
}

export interface Facts {
  buyer: 'domestic' | 'export' | 'sez';
  exportType: 'lut' | 'igst' | null;
  settlement: 'credit' | 'cash' | 'upi_card';
  /** Place of supply = the issuing branch's state (local) or not (inter-state). */
  intra: boolean;
  lines: FactLine[];
  roundOff: number;
  /** The customer account's receivable ledger key (debtor_account.ledger_account_code). */
  receivableKey: string;
}

export type Role = 'party' | 'settlement' | 'refund' | 'revenue' | 'tax' | 'round';
export interface PostLine {
  id: string;
  role: Role;
  ledger: string; // LEDGERS key, or 'party' (the customer's account on its receivable ledger)
  dr: number;
  cr: number;
  rule: string;
  /** Locked: the books must agree with the invoice and the IRN (§8.4). */
  locked: boolean;
}

export const r2 = (n: number) => Math.round(n * 100) / 100;

/** R1–R12: which case and which revenue ledger a line takes. */
export function caseOf(f: Pick<Facts, 'buyer' | 'exportType'>, l: FactLine, intra: boolean): { rule: string; ledger: string } {
  if (l.kind === 'reimbursement') return { rule: 'R11', ledger: 'reimbursement_recoverable' };
  if (l.taxability !== 'taxable') return { rule: 'R9', ledger: 'exempt_sales' };
  if (f.buyer !== 'domestic') return { rule: f.exportType === 'lut' ? 'R4' : f.buyer === 'sez' ? 'R6' : 'R5', ledger: 'export_sales' };
  if (l.kind === 'charge') return { rule: 'R10', ledger: 'freight_recovered' };
  if (l.kind === 'service') return l.deferred ? { rule: 'R12', ledger: 'contract_liability' } : { rule: 'R3', ledger: 'sale_services' };
  return { rule: intra ? 'R1' : 'R2', ledger: 'sale_products' };
}

/** What the invoice is worth, what the buyer owes, and the IGST we claim back (R5, R6). */
export function totalsOf(f: Facts) {
  const sum = (k: 'amount' | 'cgst' | 'sgst' | 'igst') => r2(f.lines.reduce((t, l) => t + l[k], 0));
  const value = sum('amount');
  const tax = r2(sum('cgst') + sum('sgst') + sum('igst'));
  const total = r2(value + tax + f.roundOff);
  const refund = f.buyer !== 'domestic' && f.exportType === 'igst' ? sum('igst') : 0;
  return { value, tax, total, refund, payable: r2(total - refund) };
}

/** The entry the rule writes. */
export function postingFor(f: Facts): PostLine[] {
  if (!f.lines.length) return [];
  const cases = f.lines.map((l) => caseOf(f, l, f.intra));
  const ruleWords = [...new Set(cases.map((c) => c.rule))].sort().join(' + ');
  const t = totalsOf(f);
  const out: PostLine[] = [];
  if (f.settlement === 'credit') out.push({ id: 'party', role: 'party', ledger: 'party', dr: t.payable, cr: 0, rule: ruleWords, locked: true });
  else out.push({ id: 'settle', role: 'settlement', ledger: f.settlement === 'cash' ? 'cash_in_hand' : 'upi_card_clearing', dr: t.payable, cr: 0, rule: 'R8', locked: true });
  if (t.refund) out.push({ id: 'refund', role: 'refund', ledger: 'igst_refund', dr: t.refund, cr: 0, rule: f.buyer === 'sez' ? 'R6' : 'R5', locked: true });
  const byLedger = new Map<string, { amount: number; rules: Set<string> }>();
  f.lines.forEach((l, i) => {
    const c = cases[i];
    const g = byLedger.get(c.ledger) ?? { amount: 0, rules: new Set<string>() };
    g.amount = r2(g.amount + l.amount);
    g.rules.add(c.rule);
    byLedger.set(c.ledger, g);
  });
  for (const [ledger, g] of byLedger) if (g.amount) out.push({ id: `rev:${ledger}`, role: 'revenue', ledger, dr: 0, cr: g.amount, rule: [...g.rules].sort().join(' + '), locked: false });
  for (const head of ['cgst', 'sgst', 'igst'] as const) {
    const amt = r2(f.lines.reduce((s, l) => s + l[head], 0));
    if (amt > 0) out.push({ id: `tax:${head}`, role: 'tax', ledger: `out_${head}`, dr: 0, cr: amt, rule: ruleWords, locked: true });
  }
  if (f.roundOff) out.push({ id: 'round', role: 'round', ledger: 'round_off', dr: f.roundOff < 0 ? -f.roundOff : 0, cr: f.roundOff > 0 ? f.roundOff : 0, rule: ruleWords, locked: false });
  return out;
}
