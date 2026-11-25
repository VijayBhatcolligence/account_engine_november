// The setup rows: what the company configures once, before any entry (S1, S2, S3 and the S1 part 2 mapping).
// Taken from the app's own catalogues, so the app and the database never disagree:
//   our company and branches (sales/catalogue.ts COMPANY, BRANCHES) · fiscal years (FISCAL_YEARS) · the chart (LEDGERS)
//   · GST state codes (onboarding STATES) · debtor categories (DEBTOR_MASTER + DEBTOR_LEDGER) · the people (ACTORS)
//   · the book, its settings, the line roles, the rule SALES_INVOICE v1 and the mapping (as t24_schema_test.sql, rev 17).
import type pg from 'pg';
import { ACTORS, DEBTOR_CATEGORIES, DEBTOR_MASTER, STATES } from '../src/onboarding/catalogue';
import { BRANCHES, COMPANY, DEBTOR_LEDGER, FISCAL_YEARS, LEDGERS } from '../src/sales/catalogue';
import type { ActorKey } from '../src/onboarding/types';
import { insertOnce, uid, upsert, WS } from './db';

export const COMPANY_PARTY = uid('party', 'COMPANY');
export const OP = uid('op', 'OP-1');
export const BOOK = uid('book', 'PRIMARY');
export const contactOf = (k: ActorKey | string | undefined) => (k ? uid('actor', k) : null);
export const fyOf = (date: string) => {
  const y = FISCAL_YEARS.find((f) => date >= f.start && date <= f.end);
  return y ? uid('fy', y.label) : null;
};
export const branchIdOf = (code: string | undefined) => (BRANCHES[code ?? ''] ?? BRANCHES['KA-01']).branchId;
export const ledgerCode = (key: string) => LEDGERS[key]?.code ?? null;
/** The app's Ledger type has no 'stock' account type; Manoj's chart types the inventory ledgers 'stock' (rev 15). */
const ACCOUNT_TYPE_EXTRA: Record<string, string> = { '106020': 'stock' };

/** The mapping on day one = the app's ledgers today (proved 19 / 19 in t24_schema_test.sql, rev 17). */
export const MAPPING: { n: number; role: string; doc: string | null; party?: string; line?: string; tax?: string; settle?: string; ledger: string; why: string }[] = [
  { n: 1, role: 'revenue', doc: 'sales_invoice', party: 'domestic', line: 'goods', tax: 'taxable', ledger: 'sale_products', why: 'R1, R2: goods sold in India' },
  { n: 2, role: 'revenue', doc: 'sales_invoice', party: 'domestic', line: 'service', tax: 'taxable', ledger: 'sale_services', why: 'R3: services' },
  { n: 3, role: 'revenue', doc: 'sales_invoice', party: 'domestic', line: 'charge', tax: 'taxable', ledger: 'freight_recovered', why: 'R10: freight charged to the buyer' },
  { n: 4, role: 'revenue', doc: 'sales_invoice', party: 'export', tax: 'taxable', ledger: 'export_sales', why: 'R4, R5: exports' },
  { n: 5, role: 'revenue', doc: 'sales_invoice', party: 'sez', tax: 'taxable', ledger: 'export_sales', why: 'R6: SEZ supplies (to confirm, G18)' },
  { n: 6, role: 'revenue', doc: 'sales_invoice', tax: 'nil_rated', ledger: 'exempt_sales', why: 'R9: nil-rated' },
  { n: 7, role: 'revenue', doc: 'sales_invoice', tax: 'exempt', ledger: 'exempt_sales', why: 'R9: exempt' },
  { n: 8, role: 'revenue', doc: 'sales_invoice', tax: 'non_gst', ledger: 'exempt_sales', why: 'R9: non-GST' },
  { n: 9, role: 'deferred_revenue', doc: null, ledger: 'contract_liability', why: 'R12: a period service billed in advance' },
  { n: 10, role: 'recoverable_expense', doc: null, ledger: 'reimbursement_recoverable', why: 'R11: expense paid as pure agent' },
  { n: 11, role: 'igst_refund', doc: null, ledger: 'igst_refund', why: 'R5, R6: IGST paid by us, claimed back' },
  { n: 12, role: 'settlement', doc: null, settle: 'cash', ledger: 'cash_in_hand', why: 'R8: paid in cash' },
  { n: 13, role: 'settlement', doc: null, settle: 'upi_card', ledger: 'upi_card_clearing', why: 'R8: paid by UPI or card' },
  { n: 14, role: 'output_cgst', doc: null, ledger: 'out_cgst', why: 'Output CGST, every document' },
  { n: 15, role: 'output_sgst', doc: null, ledger: 'out_sgst', why: 'Output SGST, every document' },
  { n: 16, role: 'output_igst', doc: null, ledger: 'out_igst', why: 'Output IGST, every document' },
  { n: 17, role: 'round_off', doc: null, ledger: 'round_off', why: 'Round off' },
  { n: 18, role: 'cogs', doc: null, ledger: 'cogs', why: 'R13: cost of goods sold (501040 proposed, G18)' },
  { n: 19, role: 'stock', doc: null, ledger: 'fg_inventory', why: 'R13: finished goods that leave' },
];

const ROLES: [string, string, string, string, string | null][] = [
  ['customer', 'The customer: what it owes', 'party_account', 'asset', 'receivable'],
  ['settlement', 'Paid at once: cash, UPI or card (R8)', 'determination', 'asset', null],
  ['revenue', 'Revenue from the line', 'determination', 'income', null],
  ['deferred_revenue', 'Revenue received in advance (R12)', 'determination', 'liability', null],
  ['recoverable_expense', 'Expense recovered as pure agent (R11)', 'determination', 'asset', null],
  ['igst_refund', 'IGST paid by us, to claim back (R5, R6)', 'determination', 'asset', null],
  ['output_cgst', 'Output CGST', 'determination', 'liability', 'output_cgst'],
  ['output_sgst', 'Output SGST', 'determination', 'liability', 'output_sgst'],
  ['output_igst', 'Output IGST', 'determination', 'liability', 'output_igst'],
  ['round_off', 'Round off', 'determination', 'expense', 'round_off'],
  ['cogs', 'Cost of goods sold (R13)', 'determination', 'expense', null],
  ['stock', 'Stock that leaves (R13)', 'determination', 'asset', 'stock'],
];
const CASES: [string, string][] = [
  ['R1', "Goods, domestic, local (place of supply = our branch's state)"], ['R2', 'Goods, domestic, inter-state'], ['R3', 'Service line (SAC)'],
  ['R4', 'Export under LUT: no GST'], ['R5', 'Export with IGST: the IGST claimed back'], ['R6', 'SEZ supply, under LUT or with IGST'],
  ['R7', 'TCS item (scrap, luxury …): not computed yet'], ['R8', 'Paid at once: cash, UPI or card'], ['R9', 'Nil-rated, exempt or non-GST line'],
  ['R10', 'Freight charged to the buyer'], ['R11', 'Expense paid as pure agent'], ['R12', 'Period service billed in advance'],
  ['R13', 'Goods sold: their cost, from inventory (FIFO or weighted average)'],
];

export async function seedReference(c: pg.PoolClient) {
  // Our company in P&C (P&C's own seed in the engine repo; here so the keys resolve), its branches and our people.
  await insertOnce(c, 'pc.private_anchor', { anchor_id: COMPANY_PARTY, workspace_id: WS, anchor_kind: 'organization', created_at: new Date() }, ['anchor_id']);
  await insertOnce(c, 'pc.party', { party_id: COMPANY_PARTY, workspace_id: WS, party_kind: 'organization', legal_name: COMPANY.legalName }, ['party_id']);
  await insertOnce(c, 'pc.operated_party', { operated_party_id: OP, workspace_id: WS, party_id: COMPANY_PARTY, since: '2019-04-01' }, ['operated_party_id']);
  await insertOnce(c, 'pc.party_identifier', { party_identifier_id: uid('ident', 'COMPANY:PAN'), workspace_id: WS, party_id: COMPANY_PARTY, scheme_code: 'IN_PAN', jurisdiction_scope_code: 'IN', value: COMPANY.pan, standing_code: 'active' }, ['party_identifier_id']);
  for (const b of Object.values(BRANCHES)) {
    const loc = uid('loc', `BRANCH:${b.code}`), gst = uid('ident', `COMPANY:GST:${b.gstin}`);
    await insertOnce(c, 'pc.business_location', { business_location_id: loc, workspace_id: WS, party_id: COMPANY_PARTY, display_name: b.name, address_lines: b.address, administrative_area_code: `IN-${b.state}`, country_code: 'IN' }, ['business_location_id']);
    await insertOnce(c, 'pc.party_identifier', { party_identifier_id: gst, workspace_id: WS, party_id: COMPANY_PARTY, scheme_code: 'IN_GST', jurisdiction_scope_code: 'IN', value: b.gstin, standing_code: 'active' }, ['party_identifier_id']);
    await insertOnce(c, 'fin.branch', { branch_id: b.branchId, workspace_id: WS, operated_party_id: OP, branch_code: b.code, display_name: b.name, business_location_id: loc, gst_identifier_id: gst, since: '2020-04-01' }, ['branch_id']);
  }
  for (const [k, a] of Object.entries(ACTORS)) {
    const id = uid('actor', k);
    await insertOnce(c, 'pc.private_anchor', { anchor_id: id, workspace_id: WS, anchor_kind: 'person', created_at: new Date() }, ['anchor_id']);
    await insertOnce(c, 'pc.contact', { contact_id: id, workspace_id: WS, contact_kind: 'person', display_name: `${a.name} (${a.role})`, accountable_party_id: COMPANY_PARTY }, ['contact_id']);
  }
  for (const y of FISCAL_YEARS)
    await insertOnce(c, 'fin.fiscal_year', { fiscal_year_id: uid('fy', y.label), workspace_id: WS, operated_party_id: OP, label: y.label, start_date: y.start, end_date: y.end, is_closed: y.closed }, ['fiscal_year_id']);
  await insertOnce(c, 'fin.document_sequence', { workspace_id: WS, operated_party_id: OP, document_type: 'sales_invoice', last_number: 0 }, ['workspace_id', 'operated_party_id', 'document_type']);

  // The chart (the app's LEDGERS: one row per code) and the reference lists.
  const seen = new Set<string>();
  for (const l of Object.values(LEDGERS)) {
    if (seen.has(l.code)) continue;
    seen.add(l.code);
    await upsert(c, 'fin.ledger_account', { account_code: l.code, display_name: l.name, kind: l.nature, is_group: !!l.isGroup, account_type: l.isGroup ? null : (l.accountType ?? ACCOUNT_TYPE_EXTRA[l.code] ?? null) }, ['account_code']);
  }
  for (const [key, s] of Object.entries(STATES)) await upsert(c, 'fin.gst_state_code', { gst_code: s.code, iso_3166_2: `IN-${key}`, display_name: s.name }, ['gst_code']);
  await upsert(c, 'fin.gst_state_code', { gst_code: '96', iso_3166_2: null, display_name: 'Other Countries' }, ['gst_code']);
  let order = 0;
  for (const [key, r] of Object.entries(DEBTOR_MASTER))
    await upsert(c, 'fin.debtor_category', {
      debtor_category_code: key.toUpperCase(), display_name: DEBTOR_CATEGORIES[key] ?? key, ledger_account_code: DEBTOR_LEDGER[key] ?? '107010',
      customer_type_code: r.customer, related_party: r.related, default_credit_days: r.creditDays, gst_treatment_note: r.gst, tcs_rate_note: r.tcsRate, credit_period_note: r.credit, notes: r.notes, sort_order: ++order,
    }, ['debtor_category_code']);

  // S1 part 1: the book and the two settings T24 reads (values illustrative until the CA answers, G3).
  const rajan = contactOf('rajan'), teja = contactOf('teja');
  await insertOnce(c, 'fin.book', { book_id: BOOK, workspace_id: WS, operated_party_id: OP, book_code: 'PRIMARY', display_name: 'Aikyat Biscuits · primary book', is_primary: true }, ['book_id']);
  await upsert(c, 'fin.setting_definition', { setting_code: 'inventory_mode', display_name: 'Inventory accounting', allowed_values: ['perpetual', 'periodic'], owner_task: 'S1 part 1 (for T24); S4 owns it', read_by: 'T24 rule R13, T11' }, ['setting_code']);
  await upsert(c, 'fin.setting_definition', { setting_code: 'costing_method', display_name: 'Costing method', allowed_values: ['fifo', 'weighted_average'], owner_task: 'S1 part 1 (for T24); S4 owns it', read_by: 'T24 rule R13, T9' }, ['setting_code']);
  for (const [code, value] of [['inventory_mode', 'perpetual'], ['costing_method', 'fifo']])
    await insertOnce(c, 'fin.book_setting', { book_setting_id: uid('setting', `${code}:2026-04-01`), workspace_id: WS, book_id: BOOK, setting_code: code, setting_value: value, effective_from: '2026-04-01', reason: 'First setting (illustrative, G3)', approved_by_contact_id: rajan, approved_at: new Date() }, ['book_setting_id']);

  // S1 part 2: the roles, the register of the posting code, and the mapping (made by Teja, checked by Rajan).
  for (const [code, name, src, kind, type] of ROLES)
    await upsert(c, 'fin.line_role', { line_role_code: code, display_name: name, ledger_source: src, required_kind: kind, required_account_type: type }, ['line_role_code']);
  await insertOnce(c, 'fin.posting_rule', { rule_code: 'SALES_INVOICE', version: 1, document_type: 'sales_invoice', display_name: 'Sales invoice: the customer, revenue, GST and the cost of goods sold', effective_from: '2026-04-01', code_ref: 'app/sales/src/sales/engine.ts postingFor()', casebook_ref: 'casebook.test.ts + expected_postings.json', change_note: 'First version (R13 added in rev 15, before go-live)' }, ['rule_code', 'version']);
  for (const [code, name] of CASES) await insertOnce(c, 'fin.posting_rule_case', { rule_code: 'SALES_INVOICE', version: 1, case_code: code, display_name: name }, ['rule_code', 'version', 'case_code']);
  for (const [code] of ROLES) await insertOnce(c, 'fin.posting_rule_role', { rule_code: 'SALES_INVOICE', version: 1, line_role_code: code }, ['rule_code', 'version', 'line_role_code']);
  for (const m of MAPPING) {
    const id = uid('determination', String(m.n));
    const row = {
      account_determination_id: id, workspace_id: WS, book_id: BOOK, document_type: m.doc, line_role_code: m.role, party_kind: m.party ?? null, line_kind: m.line ?? null,
      taxability: m.tax ?? null, settlement_mode: m.settle ?? null, ledger_account_code: ledgerCode(m.ledger), effective_from: '2026-04-01', status: 'approved',
      reason: `${m.why} (day one = the app's ledgers; illustrative until the CA confirms, G18)`, made_by_contact_id: teja, made_at: new Date(), checked_by_contact_id: rajan, checked_at: new Date(),
    };
    const { rowCount } = await c.query('SELECT 1 FROM fin.account_determination WHERE account_determination_id = $1', [id]);
    if (rowCount) continue;
    await insertOnce(c, 'fin.account_determination', row, ['account_determination_id']);
    for (const op of ['propose', 'approve'])
      await insertOnce(c, 'fin.account_determination_history', { history_id: uid('determination-history', `${m.n}:${op}`), workspace_id: WS, account_determination_id: id, operation: op, row_snapshot: row, performer_contact_id: op === 'propose' ? teja : rajan, reason: 'Day-one mapping' }, ['history_id']);
  }
}
