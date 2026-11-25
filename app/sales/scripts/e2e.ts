// npm run db:e2e — the app's own stores, driven in Node, saved through the backend into PostgreSQL. Proves, on a REBUILT
// database: the start state saves; a new customer (T12: typed from the paper, submitted, every step approved) saves; SV-0012
// (T24: booked, approved by Rajan, posted with its cost) saves; and a save the schema refuses writes nothing.
import { useOnboarding } from '../src/onboarding/store';
import { useSales } from '../src/sales/store';
import { saveState, setupDatabase } from '../server/admin';
import { db } from '../server/db';
import type { Snapshot } from '../server/project';

const snap = (): Snapshot => {
  const o = useOnboarding.getState(), s = useSales.getState();
  return {
    onboarding: { now: o.now, parties: o.parties, accounts: o.accounts, requests: o.requests, log: o.log, notices: o.notices, nav: o.nav },
    sales: { vouchers: s.vouchers, journal: s.journal, lots: s.lots, costMethod: s.costMethod },
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

  // T24: SV-0012 (B4-01) booked by Teja, approved by Rajan → posted with its cost (FIFO)
  const s = useSales.getState();
  s.submit('SV-0012');
  const v = useSales.getState().vouchers.find((x) => x.id === 'SV-0012')!;
  console.log(`  T24 SV-0012: ${v.status}`);
  await save('4 · SV-0012 submitted');
  const ok = useSales.getState().decide('SV-0012', v.approvals.find((a) => a.status === 'pending')!.id, 'approve');
  console.log(`  T24 SV-0012: approve → ${ok} · ${useSales.getState().vouchers.find((x) => x.id === 'SV-0012')!.status}`);
  await save('5 · SV-0012 approved and posted');

  // The database, read back.
  console.log('\nSV-0012 in fin.sales_invoice:', JSON.stringify(await q(`SELECT internal_ref_no, invoice_no, stage, inventory_mode, costing_method, due_date::text FROM fin.sales_invoice WHERE internal_ref_no = 'SV-0012'`)));
  console.table(await q(`SELECT l.line_no, l.ledger_account_code AS ledger, l.debit, l.credit, l.rule_code || ' v' || l.rule_version AS rule, l.rule_case AS "case", l.line_role_code AS role, d.ledger_account_code AS mapped
    FROM fin.journal_line l JOIN fin.journal_entry e USING (journal_entry_id) LEFT JOIN fin.account_determination d USING (account_determination_id)
    WHERE e.source_ref_no = 'SV-0012' ORDER BY l.line_no`));
  console.table(await q(`SELECT lot_no, item_code, quantity_left::int AS left FROM inv.stock_lot ORDER BY received_on`));
  console.table(await q(`SELECT ledger_account_code AS ledger, sum(debit) AS dr, sum(credit) AS cr FROM fin.journal_line GROUP BY 1 ORDER BY 1`));
  console.log('trial balance:', JSON.stringify(await q(`SELECT sum(debit) AS dr, sum(credit) AS cr FROM fin.journal_line`)));
  console.log('Deccan Fresh:', JSON.stringify(await q(`SELECT a.customer_code, a.account_name, a.debtor_category_code, a.ledger_account_code, (SELECT count(*) FROM fin.debtor_tax_registration t WHERE t.debtor_account_id = a.debtor_account_id) AS gstins, (SELECT count(*) FROM fin.debtor_location l WHERE l.debtor_account_id = a.debtor_account_id) AS locations FROM fin.debtor_account a WHERE a.account_name ILIKE 'Deccan%'`)));

  // A save the schema refuses: a posted voucher with no journal entry (sales_invoice_posted_has_journal) → nothing written.
  const before = (await q(`SELECT saved_at FROM demo.app_state`))[0]?.saved_at;
  useSales.setState((st) => { const x = st.vouchers.find((y) => y.id === 'SV-0013')!; x.status = 'posted'; x.submittedAt = '2026-10-07T12:00'; x.approvals = [{ id: 'X', why: 'invoice', label: 'x', checker: 'rajan', status: 'approved', decidedAt: '2026-10-07T12:05' }]; });
  const refused = !(await saveState(snap())).ok;
  const after = (await q(`SELECT saved_at FROM demo.app_state`))[0]?.saved_at;
  console.log(`\n✔ 6 · a wrong save (SV-0013 "posted" with no journal entry) refused: ${refused} · app state unchanged: ${String(before) === String(after)}`);
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
