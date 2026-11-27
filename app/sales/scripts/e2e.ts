// npm run db:e2e — the app's own stores, driven in Node, saved through the backend into PostgreSQL. Proves, on a REBUILT
// database: the start state saves; a new customer (T12: typed from the paper, submitted, every step approved) saves; SV-0012
// (T24: its entry TYPED by the AE — REC, 27-Nov-2026: no posting rule — approved by Rajan, posted with its cost from inventory)
// saves; the notes (typed) save; a T12 form filled by an event saves; and a save the schema refuses writes nothing.
import { requestOf, useOnboarding } from '../src/onboarding/store';
import { useSales } from '../src/sales/store';
import { saveState, setupDatabase } from '../server/admin';
import { db } from '../server/db';
import type { Snapshot } from '../server/project';

const snap = (): Snapshot => {
  const o = useOnboarding.getState(), s = useSales.getState();
  return {
    onboarding: { now: o.now, parties: o.parties, accounts: o.accounts, requests: o.requests, log: o.log, notices: o.notices, nav: o.nav },
    sales: { vouchers: s.vouchers, journal: s.journal, lots: s.lots, costMethod: s.costMethod, returns: s.returns, returnStock: s.returnStock, held: s.held },
  };
};
let failed = 0;
async function save(label: string) {
  const r = await saveState(snap());
  if (r.ok) console.log(`✔ ${label}: saved · ${Object.entries(r.rows).map(([t, n]) => `${t.split('.')[1]} ${n}`).join(' · ')}`);
  else { failed++; console.log(`✖ ${label}: REFUSED · ${r.error} · ${r.constraint ?? r.code ?? ''} · ${r.detail ?? ''}`); }
  return r.ok;
}
const q = async (sql: string, args: unknown[] = []) => (await db().query(sql, args)).rows;
/** The AE types the lines: [ledger key or 'party', Dr, Cr]; cost: add the cost from inventory (one click). */
const type = (id: string, lines: [string, number, number][], cost = false) => {
  useSales.getState().clearEntry(id); // the default entry cleared: the AE's own lines (the default itself is proved in the tests)
  for (const [ledger, dr, cr] of lines) useSales.getState().addLine(id, { ledger, dr, cr });
  if (cost) useSales.getState().addCostLines(id);
};

try {
  console.log(JSON.stringify(await setupDatabase({ reset: true })));
  useOnboarding.getState().reset();
  useSales.getState().reset();
  await save('1 · the app\'s start state (seed parties, accounts, the posted SV-0010 / SV-0011, stock)');

  // T12: Deccan Fresh (3 GSTINs) typed from the paper, submitted, every step approved → active
  const o = useOnboarding.getState();
  const rid = o.createRequest({ side: 'receivable', from: 'arun', formNo: 'CRF-0021', paper: 'deccan' });
  o.typeFromPaper(rid);
  o.checkGstin(rid);
  useOnboarding.getState().submit(rid);
  let r = useOnboarding.getState().requests.find((x) => x.id === rid)!;
  console.log(`  T12 ${rid}: ${r.status} · steps ${r.changes.map((c) => `${c.block}→${c.checker}`).join(', ') || '(none: did not submit)'}`);
  await save('2 · a customer request submitted');
  for (const c of r.changes) useOnboarding.getState().decide(rid, c.id, true);
  r = useOnboarding.getState().requests.find((x) => x.id === rid)!;
  console.log(`  T12 ${rid}: ${r.status} · account ${r.accountId ?? '-'}`);
  await save('3 · the customer approved and active');

  // T24: SV-0012 (B4-01) typed by Teja (the customer, the sales, CGST, SGST + the cost from inventory), approved by Rajan → posted
  type('SV-0012', [['party', 748125, 0], ['sale_products', 0, 712500], ['out_cgst', 0, 17812.5], ['out_sgst', 0, 17812.5]], true);
  const s = useSales.getState();
  s.submit('SV-0012');
  const v = useSales.getState().vouchers.find((x) => x.id === 'SV-0012')!;
  console.log(`  T24 SV-0012: ${v.status}`);
  await save('4 · SV-0012 submitted');
  const ok = useSales.getState().decide('SV-0012', v.approvals.find((a) => a.status === 'pending')!.id, 'approve');
  console.log(`  T24 SV-0012: approve → ${ok} · ${useSales.getState().vouchers.find((x) => x.id === 'SV-0012')!.status}`);
  await save('5 · SV-0012 approved and posted');

  // T25 / T26 (rev 18): Stores' receipt D-05 (stores_receipt: it posts the Stock back), then B4-06, B4-07(a), (c), B4-08, and a
  // return under the other setting (with_credit_note: the note posts the stock back).
  const st = () => useSales.getState();
  const book = (id: string) => { st().submit(id); for (const a of useSales.getState().vouchers.find((x) => x.id === id)!.approvals.filter((x) => x.status === 'pending')) st().decide(id, a.id, 'approve'); return useSales.getState().vouchers.find((x) => x.id === id)!.status; };
  const one = (amount: number) => [{ kind: 'goods' as const, item: 'FG-101', qty: 1, rate: amount, discount: null }];
  const rr1 = st().recordReturn({ invoiceId: 'SV-0012', item: 'FG-101', lot: 'G-2608', qty: 40, condition: 'damaged' });
  await save(`6 · D-05: Stores' receipt ${rr1} (the Stock back posted by the receipt)`);
  const cn1 = st().receiveNote({ invoiceId: 'SV-0012', docType: 'credit_note', reason: 'return', lines: [{ kind: 'goods', item: 'FG-101', qty: 40, rate: 700, discount: null }] })!;
  type(cn1, [['sales_returns', 28000, 0], ['out_cgst', 700, 0], ['out_sgst', 700, 0], ['party', 0, 29400]]);
  console.log(`  T25 ${cn1} (B4-06 return): ${book(cn1)}`);
  await save('7 · B4-06 the return credit note posted');
  const cn2 = st().receiveNote({ invoiceId: 'SV-0012', docType: 'credit_note', reason: 'scheme_discount', schemeRef: 'SCH-26-Q2', lines: one(50000) })!;
  type(cn2, [['discount_allowed', 50000, 0], ['out_cgst', 1250, 0], ['out_sgst', 1250, 0], ['party', 0, 52500]]);
  console.log(`  T25 ${cn2} (B4-07a scheme, Rajan + Venkat): ${book(cn2)}`);
  const cn3 = st().receiveNote({ invoiceId: 'SV-0010', docType: 'credit_note', reason: 'goodwill', lines: one(5000) })!;
  type(cn3, [['discount_allowed', 5000, 0], ['party', 0, 5000]]);
  console.log(`  T25 ${cn3} (B4-07c goodwill, no GST): ${book(cn3)}`);
  const dn1 = st().receiveNote({ invoiceId: 'SV-0010', docType: 'debit_note', reason: 'additional_charge', lines: [{ kind: 'charge', item: 'CH-FRT', qty: 1, rate: 6000, discount: null }] })!;
  type(dn1, [['party', 6300, 0], ['freight_recovered', 0, 6000], ['out_cgst', 0, 150], ['out_sgst', 0, 150]]);
  console.log(`  T26 ${dn1} (B4-08 late freight): ${book(dn1)}`);
  await save('8 · B4-07(a), (c) and B4-08 posted');
  st().setReturnStock('with_credit_note');
  st().recordReturn({ invoiceId: 'SV-0012', item: 'FG-102', lot: 'C-2607', qty: 10, condition: 'saleable' });
  const cn4 = st().receiveNote({ invoiceId: 'SV-0012', docType: 'credit_note', reason: 'return', lines: [{ kind: 'goods', item: 'FG-102', qty: 10, rate: 975, discount: null }] })!;
  type(cn4, [['sales_returns', 9750, 0], ['out_cgst', 243.75, 0], ['out_sgst', 243.75, 0], ['round_off', 0.5, 0], ['party', 0, 10238]], true);
  console.log(`  T25 ${cn4} (a return, the note posts the stock back): ${book(cn4)}`);
  await save('9 · a return under the other setting (with_credit_note)');
  console.table(await q(`SELECT v.internal_ref_no AS ref, v.invoice_no, v.document_type AS type, v.note_reason AS reason, coalesce(l.ledger_account_code, '(customer)') AS ledger, l.side, l.amount
    FROM fin.sales_invoice v JOIN fin.sales_invoice_line l USING (sales_invoice_id) WHERE v.document_type <> 'invoice' ORDER BY v.internal_ref_no, l.line_no`));
  console.table(await q(`SELECT r.return_no, r.quantity::int AS qty, r.item_code, r.condition, r.unit_cost::numeric(10,2) AS cost, e.voucher_type AS stock_back_by FROM inv.stock_return r LEFT JOIN fin.journal_entry e USING (journal_entry_id) ORDER BY 1`));
  console.log('book settings:', JSON.stringify(await q(`SELECT setting_code, setting_value, effective_from::text, effective_until::text FROM fin.book_setting WHERE setting_code = 'return_stock_posting' ORDER BY effective_from`)));

  // The database, read back.
  console.log('\nSV-0012 in fin.sales_invoice:', JSON.stringify(await q(`SELECT internal_ref_no, invoice_no, stage, inventory_mode, costing_method, due_date::text FROM fin.sales_invoice WHERE internal_ref_no = 'SV-0012'`)));
  console.table(await q(`SELECT l.line_no, l.ledger_account_code AS ledger, l.debit, l.credit
    FROM fin.journal_line l JOIN fin.journal_entry e USING (journal_entry_id) WHERE e.source_ref_no = 'SV-0012' ORDER BY l.line_no`));
  console.table(await q(`SELECT lot_no, item_code, quantity_left::int AS left FROM inv.stock_lot ORDER BY received_on`));
  console.table(await q(`SELECT ledger_account_code AS ledger, sum(debit) AS dr, sum(credit) AS cr FROM fin.journal_line GROUP BY 1 ORDER BY 1`));
  console.log('trial balance:', JSON.stringify(await q(`SELECT sum(debit) AS dr, sum(credit) AS cr FROM fin.journal_line`)));
  console.log('Deccan Fresh:', JSON.stringify(await q(`SELECT a.customer_code, a.account_name, a.debtor_category_code, a.ledger_account_code, (SELECT count(*) FROM fin.debtor_tax_registration t WHERE t.debtor_account_id = a.debtor_account_id) AS gstins, (SELECT count(*) FROM fin.debtor_location l WHERE l.debtor_account_id = a.debtor_account_id) AS locations FROM fin.debtor_account a WHERE a.account_name ILIKE 'Deccan%'`)));

  // A document whose customer is not registered (held, rev 21; any event may bring one): the T12 form opened and filled by the
  // event → the accountant fills the rest, submits, the checkers approve → the document back in To book by itself → typed → posted.
  const ob = useOnboarding.getState;
  const vv = (id: string) => useSales.getState().vouchers.find((x) => x.id === id)!;
  const sv = st().receiveInvoice({ accountId: 'ACC-1204', lines: [{ kind: 'service', item: 'SV-01', qty: 1, rate: 72000, discount: null }] })!;
  useSales.setState((d) => {
    const x = d.vouchers.find((y) => y.id === sv)!;
    x.accountId = '';
    x.pendingCustomer = { name: 'Tranquil Tech Parks Pvt Ltd', gstin: '29AAICT5544M1ZN', pan: 'AAICT5544M', stateCode: '29', address: 'Outer Ring Road, Marathahalli, Bengaluru 560037' };
  });
  const reqId = st().holdForCustomer(sv, false)!;
  await save(`11 · ${sv} waits for its customer (not in the voucher list) · T12 ${reqId} opened and filled by the event`);
  const fill: Record<string, string | number> = { customerCategory: 'b2b', category: 'domestic_b2b_regular', exportCustomer: 'no', resident: 'resident', contactPerson: 'Accounts desk', phone: '9820012345', email: 'accounts@example.com', creditOrCash: 'credit', paymentTerms: 'net_30', creditDays: 30, creditLimit: 500000, currency: 'INR', delivery: 'email', eInvoice: 'yes', tcsConfirmed: 'not_applicable', poRule: 'none', gstCertificate: 'yes', panCopy: 'yes', constitution: 'company' };
  for (const [k, val] of Object.entries(fill)) if ([undefined, null, ''].includes(requestOf(ob(), reqId)!.values[k] as never)) ob().setValue(reqId, k, val);
  ob().checkGstin(reqId);
  ob().submit(reqId);
  requestOf(ob(), reqId)!.changes.forEach((c) => ob().decide(reqId, c.id, true));
  const acc = requestOf(ob(), reqId)!.accountId!;
  type(sv, [['party', 84960, 0], ['sale_services', 0, 72000], ['out_cgst', 0, 6480], ['out_sgst', 0, 6480]]);
  console.log(`  T12 ${reqId} → ${acc} active · ${sv} back in To book: ${vv(sv)?.accountId === acc} · ${sv}: ${book(sv)}`);
  if (!(await save(`12 · ${sv} posted (its customer created through T12 from the event's form; the entry typed)`))) failed++;
  const chk = (await q(`SELECT paper_form_number || ' · ' || stage || ' · ' || left(remarks, 60) AS how_opened FROM fin.customer_request WHERE debtor_account_id = (SELECT debtor_account_id FROM fin.debtor_account WHERE customer_code = $1)`, [acc]))[0];
  console.log('  ', JSON.stringify(chk));
  if (vv(sv).status !== 'posted' || !String(chk?.how_opened).includes('Opened automatically')) failed++;
  const leftover = await q(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'fin' AND table_name IN ('posting_rule', 'account_determination', 'line_role')`);
  console.log(`  rules / mapping tables in the database: ${leftover[0].n} (rev 19: none)`);
  if (leftover[0].n !== 0) failed++;

  // A save the schema refuses: a posted voucher with no journal entry (sales_invoice_posted_has_journal) → nothing written.
  const before = (await q(`SELECT saved_at FROM demo.app_state`))[0]?.saved_at;
  useSales.setState((st) => { const x = st.vouchers.find((y) => y.id === 'SV-0013')!; x.status = 'posted'; x.submittedAt = '2026-10-07T12:00'; x.approvals = [{ id: 'X', why: 'invoice', label: 'x', checker: 'rajan', status: 'approved', decidedAt: '2026-10-07T12:05' }]; });
  const refused = !(await saveState(snap())).ok;
  const after = (await q(`SELECT saved_at FROM demo.app_state`))[0]?.saved_at;
  console.log(`\n✔ 10 · a wrong save (SV-0013 "posted" with no journal entry) refused: ${refused} · app state unchanged: ${String(before) === String(after)}`);
  if (!refused) failed++;
  console.table(await q(`SELECT ok, error_constraint, left(error, 90) AS error FROM demo.save_log ORDER BY save_id DESC LIMIT 2`));
} catch (e) {
  failed++;
  console.error(e);
} finally {
  await db().end();
  console.log(failed ? `\n${failed} FAILED` : '\nALL SAVES BEHAVED');
  process.exitCode = failed ? 1 : 0;
}
