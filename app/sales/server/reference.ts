// The setup rows: what the company configures once, before any entry (S1, S2, S3).
// Taken from the app's own catalogues, so the app and the database never disagree:
//   our company and branches (sales/catalogue.ts COMPANY, BRANCHES) · fiscal years (FISCAL_YEARS) · the chart (LEDGERS)
//   · GST state codes (onboarding STATES) · debtor categories (DEBTOR_MASTER + DEBTOR_LEDGER) · the people (ACTORS)
//   · the book and its settings. (REC, 27-Nov-2026: the posting rules and the ledger mapping are removed, schema rev 19.)
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
  const rajan = contactOf('rajan');
  await insertOnce(c, 'fin.book', { book_id: BOOK, workspace_id: WS, operated_party_id: OP, book_code: 'PRIMARY', display_name: 'Aikyat Biscuits · primary book', is_primary: true }, ['book_id']);
  await upsert(c, 'fin.setting_definition', { setting_code: 'inventory_mode', display_name: 'Inventory accounting', allowed_values: ['perpetual', 'periodic'], owner_task: 'S1 part 1 (for T24); S4 owns it', read_by: 'T24 rule R13, T11' }, ['setting_code']);
  await upsert(c, 'fin.setting_definition', { setting_code: 'costing_method', display_name: 'Costing method', allowed_values: ['fifo', 'weighted_average'], owner_task: 'S1 part 1 (for T24); S4 owns it', read_by: 'T24 rule R13, T9' }, ['setting_code']);
  await upsert(c, 'fin.setting_definition', { setting_code: 'return_stock_posting', display_name: 'Who posts the stock back on a sales return', allowed_values: ['stores_receipt', 'with_credit_note'], owner_task: 'T25 (rev 18); S4 owns it', read_by: 'T25 rule R5, SALES_RETURN_RECEIPT' }, ['setting_code']);
  for (const [code, value] of [['inventory_mode', 'perpetual'], ['costing_method', 'fifo'], ['return_stock_posting', 'stores_receipt']])
    await insertOnce(c, 'fin.book_setting', { book_setting_id: uid('setting', `${code}:2026-04-01`), workspace_id: WS, book_id: BOOK, setting_code: code, setting_value: value, effective_from: '2026-04-01', reason: 'First setting (illustrative, G3)', approved_by_contact_id: rajan, approved_at: new Date() }, ['book_setting_id']);
  // REC (27-Nov-2026): no posting rules, roles or mapping (schema rev 19): the AE types the entry; a role app proposes it.
}
