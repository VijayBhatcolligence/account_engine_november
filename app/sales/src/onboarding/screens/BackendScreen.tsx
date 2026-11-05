// Backend view: what the clicks in this walkthrough would do in the real backend.
//   left   the log: API calls, events, table writes, in order
//   right  the tables as they stand now (P&C, accounting, accounting_support; rev 12), from the mock state

import { useState } from 'react';
import { fmtDateTime } from '../../domain/dates';
import { inr } from '../../domain/money';
import { DataTable, PageHeader, SegmentedControl, type Column } from '../../ui';
import { ACTORS } from '../catalogue';
import { mask } from '../rules';
import { useOnboarding } from '../store';
import { LEDGERS } from '../../sales/catalogue';
import { calcOf } from '../../sales/rules';
import { ctxOf, useSales } from '../../sales/store';
import type { LogEntry } from '../types';

type KindFilter = 'all' | LogEntry['kind'];

type Row = Record<string, string>;
type Owner = 'P&C (Business Core)' | 'accounting' | 'accounting_support' | 'Sales & journal (new)';
interface TableDef {
  id: string;
  owner: Owner;
  rows: (s: ReturnType<typeof useOnboarding.getState>) => Row[];
}

const yes = (b: boolean | null | undefined) => (b === null || b === undefined ? 'NULL' : b ? 'true' : 'false');
const ISO: Record<string, string> = { KA: 'IN-KA', TN: 'IN-TN', KL: 'IN-KL', MH: 'IN-MH', TS: 'IN-TS', AP: 'IN-AP', GA: 'IN-GA', DL: 'IN-DL', GJ: 'IN-GJ' };
const iso = (k: string) => (k ? ISO[k] ?? k : 'NULL');
const standingOf = (partyId: string, type: string) => `S-${partyId.slice(2)}-${type === 'customer' ? 'C' : 'S'}`;

// Rev 12 (case_engine/02 section M): P&C owns who the party is; we keep its ids as plain values (no foreign key).
const TABLES: TableDef[] = [
  { id: 'pc.party', owner: 'P&C (Business Core)', rows: (s) => s.parties.map((p) => ({ party_id: p.partyId, party_kind: p.kind, legal_name: p.legalName, legal_form_code: 'NULL' })) },
  { id: 'pc.party_standing', owner: 'P&C (Business Core)', rows: (s) => s.parties.flatMap((p) => p.roles.map((x) => ({ party_standing_id: x.standingId ?? standingOf(p.partyId, x.type), party_id: p.partyId, operated_party_id: 'OP-1', standing_type_code: x.type, since: x.since, until: 'NULL' }))) },
  {
    id: 'pc.party_identifier',
    owner: 'P&C (Business Core)',
    rows: (s) =>
      s.parties.flatMap((p) => [
        ...(p.pan ? [{ party_id: p.partyId, scheme_code: 'IN_PAN', scope: 'IN', value: p.pan, standing_code: 'NULL' }] : []),
        ...p.gstins.map((g) => ({ party_id: p.partyId, scheme_code: 'IN_GST', scope: iso(g.stateCode), value: g.value, standing_code: g.status })),
      ]),
  },
  { id: 'pc.business_location', owner: 'P&C (Business Core)', rows: (s) => s.parties.filter((p) => p.address.city).map((p) => ({ party_id: p.partyId, address_lines: p.address.line || 'NULL', locality: p.address.city, administrative_area_code: iso(p.address.stateCode), postal_code: p.address.pincode || 'NULL', country_code: p.address.country || 'NULL' })) },
  { id: 'pc.contact_point (the general desk)', owner: 'P&C (Business Core)', rows: (s) => s.parties.flatMap((p) => [...(p.email ? [{ party_id: p.partyId, channel_kind: 'email', route_value: p.email }] : []), ...p.phones.map((ph) => ({ party_id: p.partyId, channel_kind: 'phone', route_value: ph }))]) },
  { id: 'accounting.legal_entity', owner: 'accounting', rows: () => [{ id: 'LE-1', party_id: '(our company in P&C)', workspace_id: 'WS-1', operated_party_id: 'OP-1', functional_currency: 'INR' }] },
  { id: 'accounting.subledger_account', owner: 'accounting', rows: (s) => s.accounts.map((a) => ({ id: a.accountId, legal_entity_id: 'LE-1', subledger: a.side === 'payable' ? 'AP' : 'AR', party_id: a.partyId, control_account: a.under, name: a.name, state: 'active', valid_from: a.activatedAt, closed_reason: 'NULL' })) },
  { id: 'accounting.subledger_account_control', owner: 'accounting', rows: (s) => s.accounts.map((a) => ({ subledger_account_id: a.accountId, control_account: a.under, valid_from: a.controlSince ?? a.activatedAt, valid_to: 'NULL', source: a.controlSource ?? 'chosen (sample data)', reason: 'NULL' })) },
  {
    id: 'accounting_support.party_account_request',
    owner: 'accounting_support',
    rows: (s) => s.requests.map((r) => ({ id: r.id, side: r.side, state: r.status, form_no: r.formNo, from_person: ACTORS[r.from].name, party_id: r.partyId ?? 'NULL', submitted_at: r.submittedAt ?? 'NULL', subledger_account_id: r.accountId ?? 'NULL' })),
  },
  {
    id: 'accounting_support.approval_step',
    owner: 'accounting_support',
    rows: (s) => s.requests.flatMap((r) => r.changes.map((c) => ({ id: c.id, entity_id: r.id, step: c.block, position: ACTORS[c.checker].role, state: c.status === 'pending' ? 'requested' : c.status, decided_at: c.decidedAt ?? 'NULL', reason: c.reason ?? 'NULL' }))),
  },
  { id: 'accounting_support.gstin_check', owner: 'accounting_support', rows: (s) => s.requests.filter((r) => r.gstCheck).map((r) => ({ party_account_request_id: r.id, input_key: r.gstCheck!.forValue, result: r.gstCheck!.status, checked_at: r.gstCheck!.at })) },
  {
    id: 'accounting_support.bank_account_verification',
    owner: 'accounting_support',
    rows: (s) =>
      s.requests.flatMap((r) => [
        ...(r.pennyDrop ? [{ party_account_request_id: r.id, method: 'penny_drop', result: r.pennyDrop.result, match_pct: String(r.pennyDrop.matchPct), checked_at: r.pennyDrop.at }] : []),
        ...(r.values.callBackNumber && r.submittedAt ? [{ party_account_request_id: r.id, method: 'call_back', result: 'pass', match_pct: 'NULL', checked_at: r.submittedAt }] : []),
      ]),
  },
  {
    id: 'accounting_support.party_account',
    owner: 'accounting_support',
    rows: (s) =>
      s.accounts.map((a) => ({
        subledger_account_id: a.accountId,
        party_id: a.partyId,
        party_standing_id: a.standingId ?? standingOf(a.partyId, a.side === 'payable' ? 'supplier' : 'customer'),
        gst_registration: a.gstin ?? 'NULL',
        side: a.side,
        category: a.category,
        credit_days: a.creditDays === null ? 'NULL' : String(a.creditDays),
        msme_status: a.side === 'payable' ? a.msme ?? 'NULL' : 'NULL',
        udyam: a.side === 'payable' ? a.udyam ?? 'NULL' : 'NULL',
        sec43bh: a.side === 'payable' ? yes(a.sec43bh) : 'NULL',
        state: 'active',
      })),
  },
  { id: 'accounting_support.party_credit_limit', owner: 'accounting_support', rows: (s) => s.accounts.filter((a) => a.side === 'receivable').map((a) => ({ subledger_account_id: a.accountId, credit_limit: a.creditLimit === null ? 'NULL' : inr(a.creditLimit), valid_from: a.activatedAt, valid_to: 'NULL' })) },
  { id: 'accounting_support.party_bank_account', owner: 'accounting_support', rows: (s) => s.accounts.filter((a) => a.bankLast4).map((a) => ({ subledger_account_id: a.accountId, bank_account_no: mask(a.bankAccountNo ?? a.bankLast4!), valid_from: a.bankSince ?? 'NULL', valid_to: 'NULL' })) },
  {
    id: 'finance.sales_invoice',
    owner: 'Sales & journal (new)',
    rows: () => {
      const sl = useSales.getState();
      const ctx = ctxOf(sl);
      return sl.vouchers.map((v) => ({ id: v.id, invoice_no: v.number ?? 'NULL', state: v.status, delivery_challan: v.dcId, account_id: v.accountId || 'NULL', invoice_date: v.date, total: inr(calcOf(v, ctx).total), journal_entry_id: v.entryId ?? 'NULL', irn: v.irn ?? 'NULL' }));
    },
  },
  {
    id: 'finance.sales_invoice_line',
    owner: 'Sales & journal (new)',
    rows: () => useSales.getState().vouchers.flatMap((v) => v.lines.map((l, i) => ({ sales_invoice_id: v.id, line_no: String(i + 1), challan_line: `${v.dcId}/${l.dcLine + 1}`, item: l.item, batch: l.batch, qty: String(l.qty ?? 'NULL'), rate: String(l.rate) }))),
  },
  {
    id: 'inventory.delivery_challan (Stores)',
    owner: 'Sales & journal (new)',
    rows: () => useSales.getState().challans.map((c) => ({ id: c.id, sales_order: c.soId, customer: c.customer, challan_date: c.date, godown: 'KA-FG', cartons: String(c.lines.reduce((t, l) => t + l.qty, 0)), recorded_at: c.recordedAt ?? 'NULL (waits for the customer account)', cost_entry_id: c.costEntryId ?? 'NULL' })),
  },
  { id: 'accounting.journal_entry', owner: 'Sales & journal (new)', rows: () => useSales.getState().journal.map((e) => ({ id: e.id, voucher_no: e.voucherNo, kind: e.kind, posting_date: e.date, rule_version: e.rule, reverses_entry: e.reverses ?? 'NULL', posted_at: e.postedAt })) },
  {
    id: 'accounting.journal_line',
    owner: 'Sales & journal (new)',
    rows: () => useSales.getState().journal.flatMap((e) => e.lines.map((l, i) => ({ entry_id: e.id, line_no: String(i + 1), account: l.ledger === 'party' ? `${l.accountId} (AR)` : `${LEDGERS[l.ledger].code} ${LEDGERS[l.ledger].name}`, subledger: l.ledger === 'party' ? 'AR' : 'NULL', dr: l.dr ? l.dr.toFixed(2) : '0.00', cr: l.cr ? l.cr.toFixed(2) : '0.00' }))),
  },
];

export function BackendScreen() {
  const s = useOnboarding();
  const [kind, setKind] = useState<KindFilter>('all');
  const [table, setTable] = useState('accounting_support.party_account_request');
  const entries = [...s.log].reverse().filter((e) => kind === 'all' || e.kind === kind);
  const def = TABLES.find((t) => t.id === table)!;
  const rows = def.rows(s);
  const cols: Column<Row>[] = Object.keys(rows[0] ?? { '(no rows yet)': '' }).map((k) => ({ key: k, header: k, render: (r) => <span className={r[k] === 'NULL' ? 'subtle' : undefined}>{r[k]}</span> }));

  return (
    <div className="ob-page">
      <PageHeader title="Backend view" subtitle="Mock only. What each click in the walkthrough would call, publish and write. Nothing here is sent anywhere: it is the backend design (case_engine/02, rev 12) played against the UX." />
      <div className="ob-backend">
        <section className="ob-backend__log">
          <div className="ob-backend__bar">
            <h3 className="section__title">What happened</h3>
            <SegmentedControl label="Show" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'api', label: 'API' }, { value: 'event', label: 'Events' }, { value: 'db', label: 'Tables' }]} />
          </div>
          <ol className="ob-log">
            {entries.map((e) => (
              <li key={e.id} className={`ob-log__item ob-log__item--${e.kind}`}>
                <span className="ob-log__kind">{e.kind === 'api' ? 'API' : e.kind === 'event' ? 'EVENT' : 'TABLE'}</span>
                <span className="ob-log__main">
                  <span className="ob-log__line">{e.line}</span>
                  {e.detail && <span className="ob-log__detail">{e.detail}</span>}
                </span>
                <span className="ob-log__meta">
                  {ACTORS[e.actor].name}
                  <br />
                  {fmtDateTime(e.at).slice(4)}
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section className="ob-backend__tables">
          <div className="ob-backend__bar">
            <h3 className="section__title">Tables now</h3>
            <select className="input ob-table-pick" value={table} onChange={(e) => setTable(e.target.value)}>
              {(['P&C (Business Core)', 'accounting', 'accounting_support', 'Sales & journal (new)'] as const).map((o) => (
                <optgroup key={o} label={o === 'P&C (Business Core)' ? 'P&C: who the party is (theirs; we keep only ids)' : o === 'accounting' ? 'accounting: the books (subledger account, ledger group)' : o === 'accounting_support' ? 'accounting_support: the request and the customer account' : 'Sales entry and the journal: new (posting engine)'}>
                  {TABLES.filter((t) => t.owner === o).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <p className="subtle small-note">
            {def.owner === 'P&C (Business Core)' ? "P&C's tables, not ours: P&C writes them when it accepts the party we hand over. Our tables keep their ids as plain values (no foreign key, rev 12)." : def.owner === 'accounting' ? 'Accounting (the books): our company, the AR / AP subledger account and its ledger group, dated (case_engine/02 section M, rev 12).' : def.owner === 'accounting_support' ? 'The onboarding request, its approval steps and checks, and the customer / vendor account (case_engine/02 section M).' : 'Post a sales entry: the invoice (module) and the append-only journal the posting engine writes.'} {rows.length} rows.
          </p>
          <DataTable columns={cols} rows={rows} rowKey={(r) => Object.values(r).join('|')} />
        </section>
      </div>
    </div>
  );
}
