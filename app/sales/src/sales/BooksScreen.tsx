// Books: what the posted entries did. Day book (every journal entry and its lines), trial balance (this month's
// movements, balance sheet and P&L apart, Dr = Cr), and customer outstanding: the subledger is a view (Manoj, ledger_and_subledger.md),
// the receivable ledgers' lines grouped by the customer account they name, so it always ties to the ledgers.

import { useState } from 'react';
import { Check } from 'lucide-react';
import { fmtDate } from '../domain/dates';
import { inr } from '../domain/money';
import { PageHeader, SegmentedControl } from '../ui';
import { LEDGERS, OPENING_DUE } from './catalogue';
import { accountOf, customers, dueOf, r2, receivableOf, rupees } from './rules';
import { useSalesCtx } from './SalesScreen';
import type { JournalLine } from './types';

type View = 'daybook' | 'tb' | 'ar';

export function BooksScreen() {
  const [view, setView] = useState<View>('daybook');
  return (
    <div className="ob-page">
      <PageHeader
        title="Books"
        subtitle="Mock only: the journal the posting engine wrote for sales invoices (revenue, receivable, GST). Stock and cost of goods sold are Stores' challan task (G30). Nothing here is typed."
        actions={<SegmentedControl label="Show" value={view} onChange={setView} options={[{ value: 'daybook', label: 'Day book' }, { value: 'tb', label: 'Trial balance' }, { value: 'ar', label: 'Customer outstanding' }]} />}
      />
      {view === 'daybook' && <DayBook />}
      {view === 'tb' && <TrialBalance />}
      {view === 'ar' && <Outstanding />}
    </div>
  );
}

function useLedgerName() {
  const { ctx } = useSalesCtx();
  return (l: JournalLine) => {
    if (l.ledger === 'party') {
      const a = accountOf(ctx, l.accountId ?? '');
      return { name: `${a?.name ?? l.accountId} (${l.accountId})`, code: `${l.code ?? receivableOf(a).code} › ${l.accountId}`, st: 'BS' as const };
    }
    const L = LEDGERS[l.ledger];
    return { name: L.name, code: L.code, st: L.statement };
  };
}

function DayBook() {
  const { s } = useSalesCtx();
  const name = useLedgerName();
  const entries = [...s.journal].sort((x, y) => `${y.date}${y.postedAt}`.localeCompare(`${x.date}${x.postedAt}`));
  return (
    <table className="sv-post sv-daybook">
      <thead>
        <tr>
          <th>Date</th>
          <th>Voucher</th>
          <th>Ledger</th>
          <th>In</th>
          <th className="num">Dr</th>
          <th className="num">Cr</th>
        </tr>
      </thead>
      {entries.map((e) => (
        <tbody key={e.id}>
          <tr className="sv-daybook__head">
            <td>{fmtDate(e.date)}</td>
            <td colSpan={5}>
              <strong>{e.voucherNo}</strong> · {e.kind === 'sales' ? (e.reverses ? 'Sales invoice cancelled (IRN): reversal' : 'Sales invoice') : 'Sales invoicete'}{e.branch ? ` · ${e.branch}` : ''} · <span className="mono">{e.id}</span>
              {e.reverses ? ` reverses ${e.reverses}` : ''} · <span className="subtle">{e.narration}</span>
            </td>
          </tr>
          {e.lines.map((l, i) => {
            const n = name(l);
            return (
              <tr key={i}>
                <td />
                <td className="mono subtle">{n.code}</td>
                <td>
                  {l.dr ? 'Dr' : 'Cr'} {n.name}
                </td>
                <td>
                  <span className={`sv-st sv-st--${n.st}`}>{n.st === 'BS' ? 'Balance sheet' : 'P&L'}</span>
                </td>
                <td className="num">{l.dr ? rupees(l.dr) : ''}</td>
                <td className="num">{l.cr ? rupees(l.cr) : ''}</td>
              </tr>
            );
          })}
        </tbody>
      ))}
    </table>
  );
}

function TrialBalance() {
  const { s } = useSalesCtx();
  const name = useLedgerName();
  const by = new Map<string, { name: string; code: string; st: 'BS' | 'PL'; dr: number; cr: number }>();
  for (const l of s.journal.flatMap((e) => e.lines)) {
    const n = name(l);
    const k = l.ledger === 'party' ? `party:${l.accountId}` : l.ledger;
    const row = by.get(k) ?? { ...n, dr: 0, cr: 0 };
    row.dr = r2(row.dr + l.dr);
    row.cr = r2(row.cr + l.cr);
    by.set(k, row);
  }
  const rows = [...by.values()].map((r) => ({ ...r, net: r2(r.dr - r.cr) })).sort((a, b) => a.st.localeCompare(b.st) || a.code.localeCompare(b.code));
  const dr = r2(rows.reduce((t, r) => t + Math.max(r.net, 0), 0));
  const cr = r2(rows.reduce((t, r) => t + Math.max(-r.net, 0), 0));
  const income = r2(rows.filter((r) => r.st === 'PL').reduce((t, r) => t - r.net, 0));
  return (
    <>
      <div className="sv-party">
        <span>
          <span className="subtle">Period</span> Oct-2026 · movements only
        </span>
        <span>
          <span className="subtle">P&L: sales (net of round off)</span> <strong>{inr(income)}</strong>
        </span>
        <span className={dr === cr ? 'tone-success' : 'tone-critical'}>
          {dr === cr ? <Check size={13} aria-hidden /> : null} Dr {rupees(dr)} {dr === cr ? '=' : '≠'} Cr {rupees(cr)}
        </span>
      </div>
      <table className="sv-post">
        <thead>
          <tr>
            <th>Ledger</th>
            <th>Code</th>
            <th>In</th>
            <th className="num">Dr balance</th>
            <th className="num">Cr balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code + r.name}>
              <td>{r.name}</td>
              <td className="mono subtle">{r.code}</td>
              <td>
                <span className={`sv-st sv-st--${r.st}`}>{r.st === 'BS' ? 'Balance sheet' : 'P&L'}</span>
              </td>
              <td className="num">{r.net > 0 ? rupees(r.net) : ''}</td>
              <td className="num">{r.net < 0 ? rupees(-r.net) : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>Total</td>
            <td className="num">{rupees(dr)}</td>
            <td className="num">{rupees(cr)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

function Outstanding() {
  const { s, ctx } = useSalesCtx();
  const rows = customers(ctx).map((a) => {
    const lines = s.journal.flatMap((e) => e.lines.map((l) => ({ l, kind: e.kind }))).filter((x) => x.l.accountId === a.accountId);
    const invoiced = r2(lines.filter((x) => x.kind === 'sales').reduce((t, x) => t + x.l.dr - x.l.cr, 0)); // net of IRN cancellations
    const due = dueOf(ctx, a.accountId);
    return { a, opening: OPENING_DUE[a.accountId] ?? 0, invoiced, due, free: a.creditLimit === null ? null : a.creditLimit - due };
  });
  const total = r2(rows.reduce((t, r) => t + r.due, 0));
  const control = r2(rows.reduce((t, r) => t + r.opening, 0) + s.journal.flatMap((e) => e.lines).filter((l) => l.ledger === 'party').reduce((t, l) => t + l.dr - l.cr, 0));
  return (
    <>
      <div className="sv-party">
        <span>
          <span className="subtle">AR sub-ledger total</span> <strong>{inr(total)}</strong>
        </span>
        <span>
          <span className="subtle">Receivable ledgers (107010–107130)</span> <strong>{inr(control)}</strong>
        </span>
        <span className={total === control ? 'tone-success' : 'tone-critical'}>{total === control ? <><Check size={13} aria-hidden /> The customers add up to the receivable ledgers (same lines)</> : 'Does not tie'}</span>
      </div>
      <table className="sv-post">
        <thead>
          <tr>
            <th>Customer account</th>
            <th className="num">Brought forward</th>
            <th className="num">Invoiced (Oct)</th>
            <th className="num">Owes now</th>
            <th className="num">Credit limit</th>
            <th className="num">Available</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.a.accountId}>
              <td>
                {r.a.name} <span className="subtle small-note">{r.a.accountId}</span>
              </td>
              <td className="num">{inr(r.opening)}</td>
              <td className="num">{r.invoiced ? inr(r.invoiced) : '—'}</td>
              <td className="num">
                <strong>{inr(r.due)}</strong>
              </td>
              <td className="num">{inr(r.a.creditLimit)}</td>
              <td className={`num${r.free !== null && r.free < 0 ? ' tone-critical' : ''}`}>{r.free === null ? '—' : inr(r.free)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
