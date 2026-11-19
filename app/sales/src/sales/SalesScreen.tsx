// T24 Sales voucher entry (rev 6, Vijay 18-Nov): the invoices Billing hands over, to book.
//   rail    To book (received from Billing) · With Rajan · Done; collapses
//   main    every received invoice in one list; one opens as a full-screen voucher (InvoiceWorkspace): the accounting entry
// The AE does not raise invoices; "Billing sends an invoice" is a mock to try the flow with other customers.

import { useState } from 'react';
import { ChevronsLeft, ChevronsRight, Inbox, ReceiptText } from 'lucide-react';
import { relTime } from '../domain/dates';
import { inr } from '../domain/money';
import { Button, Dialog, EmptyState } from '../ui';
import { ApiHint } from '../onboarding/screens/parts';
import { TaskPicker } from '../tasks/TaskPicker';
import { goodsLine } from './seed';
import { useSalesCtx, V_STATUS } from './hooks';
import { VoucherWorkspace } from './InvoiceWorkspace';
import { calcOf, customers, kindOf } from './rules';
import { isDoneV, isMineV, isWithOthersV, titleOfV, voucherOf } from './store';
import type { Voucher } from './types';

export { useSalesCtx, V_STATUS } from './hooks';

export function SalesScreen() {
  const { app, s, ctx } = useSalesCtx();
  const [collapsed, setCollapsed] = useState(false);
  const [sending, setSending] = useState(false);
  const sorted = [...s.vouchers].sort((a, b) => b.arrivedAt.localeCompare(a.arrivedAt));
  const mine = sorted.filter(isMineV);
  const others = sorted.filter(isWithOthersV);
  const done = sorted.filter(isDoneV);
  const selected = voucherOf(s, app.nav.voucherId);

  const row = (v: Voucher) => {
    const name = titleOfV(v, ctx);
    const total = calcOf(v, ctx).payable;
    const when = v.status === 'posted' ? `posted ${relTime(v.postedAt!, app.now)}` : v.status === 'submitted' ? `sent ${relTime(v.submittedAt!, app.now)}` : v.status === 'draft' && v.decisionReason ? 'sent back to me' : v.status === 'draft' ? `received ${relTime(v.arrivedAt, app.now)}` : V_STATUS[v.status].label.toLowerCase();
    return (
      <button key={v.id} className={`ob-rail__item${v.id === selected?.id ? ' is-selected' : ''}`} onClick={() => app.openVoucher(v.id)} title={`${name} · ${v.number}`}>
        <span className={`ob-rail__dot bg-${V_STATUS[v.status].tone}`} aria-hidden />
        {collapsed ? (
          <span className="ob-rail__initials">{name.slice(0, 2).toUpperCase()}</span>
        ) : (
          <span className="ob-rail__text">
            <span className="ob-rail__name">{name}</span>
            <span className="ob-rail__meta">
              {v.number} · {inr(total)} · {when}
            </span>
          </span>
        )}
      </button>
    );
  };
  const group = (title: string, list: Voucher[], empty: string) => (
    <section className="ob-rail__group">
      {!collapsed && (
        <h3 className="ob-rail__title">
          {title} <span className="ob-rail__count">{list.length}</span>
        </h3>
      )}
      {list.length === 0 && !collapsed && <p className="ob-rail__empty">{empty}</p>}
      {list.map(row)}
    </section>
  );

  return (
    <div className="ob-ws">
      <nav className={`ob-rail${collapsed ? ' is-collapsed' : ''}`} aria-label="Sales vouchers">
        <div className="ob-rail__head">
          {!collapsed && <TaskPicker current="sales" />}
          <button className="ob-rail__toggle" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Show the list' : 'Hide the list'} title={collapsed ? 'Show the list' : 'Hide the list'}>
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </div>
        <div className="ob-rail__scroll">
          {group('To book (from Billing)', mine, 'Nothing to book.')}
          {group('With Rajan', others, 'Nothing waiting for approval.')}
          {group('Done', done, 'None yet.')}
        </div>
      </nav>
      <SalesHome mine={mine} others={others} done={done} onSend={() => setSending(true)} />
      {selected && <VoucherWorkspace key={selected.id} v={selected} onClose={() => app.openVoucher(null)} />}
      <SendDialog open={sending} onClose={() => setSending(false)} />
    </div>
  );
}

/** The page behind the voucher: every invoice Billing handed over. */
function SalesHome({ mine, others, done, onSend }: { mine: Voucher[]; others: Voucher[]; done: Voucher[]; onSend: () => void }) {
  const { app, ctx } = useSalesCtx();
  const all = [...mine, ...others, ...done];
  return (
    <div className="sv-home">
      <header className="sv-home__head">
        <div>
          <h2 className="sv-home__title">Sales vouchers</h2>
          <p className="subtle">Billing raises the invoice and hands it to you. Open one and book its accounting entry: the ledgers are suggested, you may pick others; then submit to Rajan.</p>
        </div>
        <Button icon={Inbox} onClick={onSend} title="Mock only: play Billing">
          Mock: Billing sends an invoice
        </Button>
      </header>
      <section className="sv-home__sec">
        <h3 className="sv-home__h">Received invoices · {all.length}</h3>
        {all.length === 0 ? (
          <EmptyState icon={ReceiptText} title="Nothing received" text="Invoices appear here when Billing hands them over." />
        ) : (
          <table className="sv-items sv-home__list">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Invoice</th>
                <th>Date</th>
                <th className="num">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {all.map((v) => (
                <tr key={v.id} onClick={() => app.openVoucher(v.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && app.openVoucher(v.id)}>
                  <td>
                    <strong>{titleOfV(v, ctx)}</strong>
                  </td>
                  <td className="mono">{v.number}</td>
                  <td>{v.date}</td>
                  <td className="num">{inr(calcOf(v, ctx).payable)}</td>
                  <td>
                    <span className={`ob-rail__dot bg-${V_STATUS[v.status].tone}`} aria-hidden /> {V_STATUS[v.status].label}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/** Mock only: Billing hands over a new invoice (50 cartons of glucose biscuit at the list price) for the picked customer. */
function SendDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { s, ctx, app } = useSalesCtx();
  const list = customers(ctx);
  return (
    <Dialog open={open} onClose={onClose} title="Mock: Billing sends an invoice" description="Plays Billing: it raises an invoice (50 cartons of glucose biscuit, list price) for the customer you pick and hands it to you to book." footer={<Button onClick={onClose}>Cancel</Button>}>
      <div className="sheet-stack">
        {list.map((a) => (
          <button
            key={a.accountId}
            className="sv-pick"
            onClick={() => {
              const id = s.receiveInvoice({ accountId: a.accountId, lines: [goodsLine('FG-101', 50, kindOf(ctx, a) === 'domestic' ? undefined : 8.9)], transport: { vehicleNo: 'KA01AB1234', distanceKm: 120 } });
              onClose();
              if (id) app.openVoucher(id);
            }}
          >
            <strong>
              {a.name} <span className="subtle">{a.accountId}</span>
            </strong>
            <span className="subtle small-note">
              {a.under} · {kindOf(ctx, a)} · {a.creditDays ?? 0} days
            </span>
          </button>
        ))}
        <ApiHint>event sales.invoice.issued (Billing) → a sales voucher to book</ApiHint>
      </div>
    </Dialog>
  );
}
