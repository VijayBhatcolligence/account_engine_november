// Raise a sales invoice: the worklist rail and the open invoice.
//   left    To bill (challans Stores recorded, not yet invoiced) · Needs me · With Rajan · Done; collapses
//   right   the open invoice, full width (InvoiceWorkspace): header with actions, issue strip, tabs

import { useState } from 'react';
import { ChevronsLeft, ChevronsRight, PackageCheck, Plus, ReceiptText, Truck } from 'lucide-react';
import { fmtDate, relTime } from '../domain/dates';
import { inr } from '../domain/money';
import { Button, Dialog, EmptyState } from '../ui';
import { ApiHint } from '../onboarding/screens/parts';
import { TaskPicker } from '../tasks/TaskPicker';
import { ITEMS } from './catalogue';
import { useSalesCtx, V_STATUS } from './hooks';
import { VoucherWorkspace } from './InvoiceWorkspace';
import { accountForChallan, billedQty, calcOf, unbilled } from './rules';
import { isMineV, isWithOthersV, titleOfV, voucherOf } from './store';
import type { Challan, Voucher } from './types';

const API = '/sales-invoices';

export { useSalesCtx, V_STATUS } from './hooks';

export function SalesScreen() {
  const { app, s, ctx } = useSalesCtx();
  const [collapsed, setCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);
  const sorted = [...s.vouchers].sort((a, b) => b.arrivedAt.localeCompare(a.arrivedAt));
  const mine = sorted.filter(isMineV);
  const others = sorted.filter(isWithOthersV);
  const done = sorted.filter((v) => !isMineV(v) && !isWithOthersV(v));
  const toBill = unbilled(ctx).filter((c) => !mine.some((v) => v.dcId === c.id));
  const waiting = s.challans.filter((c) => !c.recordedAt);
  const selected = voucherOf(s, app.nav.voucherId) ?? mine[0] ?? others[0] ?? done[0] ?? null;

  const row = (v: Voucher) => {
    const name = titleOfV(v, ctx);
    const total = calcOf(v, ctx).total;
    const when = v.status === 'posted' ? `confirmed ${relTime(v.postedAt!, app.now)}` : v.status === 'submitted' ? `sent ${relTime(v.submittedAt!, app.now)}` : relTime(v.arrivedAt, app.now);
    return (
      <button key={v.id} className={`ob-rail__item${v.id === selected?.id ? ' is-selected' : ''}`} onClick={() => app.openVoucher(v.id)} title={`${name} · ${v.number ?? v.id}`}>
        <span className={`ob-rail__dot bg-${V_STATUS[v.status].tone}`} aria-hidden />
        {collapsed ? (
          <span className="ob-rail__initials">{name.slice(0, 2).toUpperCase()}</span>
        ) : (
          <span className="ob-rail__text">
            <span className="ob-rail__name">{name}</span>
            <span className="ob-rail__meta">
              {v.number ?? `${v.id} · ${v.dcId}`} · {total ? inr(total) : '—'} · {when}
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
      <nav className={`ob-rail${collapsed ? ' is-collapsed' : ''}`} aria-label="Sales invoices">
        <div className="ob-rail__head">
          {!collapsed && <TaskPicker current="sales" />}
          <button className="ob-rail__toggle" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Show the list' : 'Hide the list'} title={collapsed ? 'Show the list' : 'Hide the list'}>
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </div>
        <div className="ob-rail__new">
          {collapsed ? (
            <button className="ob-rail__toggle" onClick={() => setCreating(true)} aria-label="New invoice from a challan" title="New invoice from a challan">
              <Plus size={16} />
            </button>
          ) : (
            <Button variant="primary" icon={Plus} block onClick={() => setCreating(true)}>
              New invoice from a challan
            </Button>
          )}
        </div>
        <div className="ob-rail__scroll">
          {!collapsed && (
            <section className="ob-rail__group">
              <h3 className="ob-rail__title">
                To bill <span className="ob-rail__count">{toBill.length}</span>
              </h3>
              {toBill.length === 0 && <p className="ob-rail__empty">Unbilled list is empty.</p>}
              {toBill.map((c) => (
                <button key={c.id} className="ob-rail__item" onClick={() => s.createFromChallan(c.id)} title="Open an invoice from this challan">
                  <Truck size={14} aria-hidden className="tone-warning sv-rail-ic" />
                  <span className="ob-rail__text">
                    <span className="ob-rail__name">{c.customer}</span>
                    <span className="ob-rail__meta">
                      {c.id} · {c.soId} · {c.lines.reduce((t, l) => t + l.qty, 0)} ctn · {fmtDate(c.date)}
                    </span>
                  </span>
                </button>
              ))}
              {waiting.map((c) => (
                <div key={c.id} className="ob-rail__item sv-rail-wait" title={c.note}>
                  <Truck size={14} aria-hidden className="subtle sv-rail-ic" />
                  <span className="ob-rail__text">
                    <span className="ob-rail__name subtle">{c.customer}</span>
                    <span className="ob-rail__meta">
                      {c.soId}: {accountForChallan(ctx, c) ? 'account active, Stores can record it' : 'waits for its customer account'}
                    </span>
                    {accountForChallan(ctx, c) && (
                      <button className="ob-sim__btn" onClick={() => s.recordChallan(c.id)} title="Mock only: play Stores">
                        <PackageCheck size={12} aria-hidden /> Latha records {c.id}
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </section>
          )}
          {group('Needs me', mine, 'No draft invoice.')}
          {group('With Rajan', others, 'Nothing waiting for approval.')}
          {done.length > 0 && group('Done', done, '')}
        </div>
      </nav>
      {selected ? (
        <VoucherWorkspace key={selected.id} v={selected} />
      ) : (
        <div className="ob-req ob-req--empty">
          <EmptyState icon={ReceiptText} title="No invoice open" text="Pick a challan under To bill to raise its invoice." />
        </div>
      )}
      <NewDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

/** "+ New": which recorded challan to invoice (only challans Stores recorded and not yet fully billed). */
function NewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { s, ctx } = useSalesCtx();
  const list = unbilled(ctx);
  return (
    <Dialog open={open} onClose={onClose} title="New invoice from a challan" description="Accounting-led billing: the invoice pulls the challan lines not yet billed, at the approved order's rates. An invoice line with no challan line is refused." footer={<Button onClick={onClose}>Cancel</Button>}>
      <div className="sheet-stack">
        {list.length === 0 && <p className="subtle">Nothing to bill: every recorded challan is invoiced.</p>}
        {list.map((c: Challan) => (
          <button
            key={c.id}
            className="sv-pick"
            onClick={() => {
              s.createFromChallan(c.id);
              onClose();
            }}
          >
            <strong>
              {c.id} · {c.customer}
            </strong>
            <span className="subtle small-note">
              {c.soId} · {fmtDate(c.date)} · {c.lines.map((l, i) => `${l.qty - billedQty(ctx, c.id, i)} ctn ${ITEMS[l.item].name.split(',')[0]} (${l.batch})`).join(' · ')}
            </span>
          </button>
        ))}
        <ApiHint>POST {API} {'{delivery_challan}'}</ApiHint>
      </div>
    </Dialog>
  );
}
