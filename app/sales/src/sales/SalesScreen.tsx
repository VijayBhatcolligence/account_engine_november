// T24 Sales voucher entry (rev 6, Vijay 18-Nov): the invoices Billing hands over, to book.
//   rail    To book (received from Billing) · With Rajan · Done; collapses
//   main    every received invoice in one list; one opens as a full-screen voucher (InvoiceWorkspace): the accounting entry
// The AE does not raise invoices; "Billing sends an invoice" is a mock to try the flow with other customers.
// Rev 18 (T25, T26): credit and debit notes come the same way ("Billing sends a note", the scenario's B4-06 to B4-08), and a
// return waits for Stores' receipt ("Stores records a return", D-05). The book's setting decides who posts the stock back.

import { useState } from 'react';
import { ChevronsLeft, ChevronsRight, FileMinus, Inbox, PackageOpen, ReceiptText } from 'lucide-react';
import { relTime } from '../domain/dates';
import { inr } from '../domain/money';
import { Button, Callout, Dialog, EmptyState, SegmentedControl } from '../ui';
import { ApiHint } from '../onboarding/screens/parts';
import { TaskPicker } from '../tasks/TaskPicker';
import { goodsLine } from './seed';
import { useSalesCtx, V_STATUS } from './hooks';
import { VoucherWorkspace } from './InvoiceWorkspace';
import { calcOf, customers, DOC_LABEL, isNote, kindOf } from './rules';
import type { NoteSpec, ReturnSpec } from './store';
import type { InvoiceLine } from './types';
import { isDoneV, isMineV, isWithOthersV, titleOfV, voucherOf } from './store';
import type { Voucher } from './types';

export { useSalesCtx, V_STATUS } from './hooks';

export function SalesScreen() {
  const { app, s, ctx } = useSalesCtx();
  const [collapsed, setCollapsed] = useState(false);
  const [sending, setSending] = useState(false);
  const [noting, setNoting] = useState(false);
  const [returning, setReturning] = useState(false);
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
              {isNote(v) ? `${DOC_LABEL[v.docType!]} ` : ''}{v.number} · {v.docType === 'credit_note' ? '−' : ''}{inr(total)} · {when}
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
      <SalesHome mine={mine} others={others} done={done} onSend={() => setSending(true)} onNote={() => setNoting(true)} onReturn={() => setReturning(true)} />
      {selected && <VoucherWorkspace key={selected.id} v={selected} onClose={() => app.openVoucher(null)} />}
      <SendDialog open={sending} onClose={() => setSending(false)} />
      <NoteDialog open={noting} onClose={() => setNoting(false)} />
      <ReturnDialog open={returning} onClose={() => setReturning(false)} />
    </div>
  );
}

/** The page behind the voucher: every invoice Billing handed over. */
function SalesHome({ mine, others, done, onSend, onNote, onReturn }: { mine: Voucher[]; others: Voucher[]; done: Voucher[]; onSend: () => void; onNote: () => void; onReturn: () => void }) {
  const { app, s, ctx } = useSalesCtx();
  const all = [...mine, ...others, ...done];
  return (
    <div className="sv-home">
      {s.held.length > 0 && <HeldDocs />}
      <header className="sv-home__head">
        <div>
          <h2 className="sv-home__title">Sales vouchers</h2>
          <p className="subtle">Billing raises the invoice and hands it to you. Open one and type its entry, like Tally: pick each ledger, enter Dr or Cr (the document's amounts are shown beside); then submit to Rajan.</p>
        </div>
        <span className="inline-gap">
          <Button icon={Inbox} onClick={onSend} title="Mock only: play Billing">
            Mock: Billing sends an invoice
          </Button>
          <Button icon={FileMinus} onClick={onNote} title="Mock only: play Billing (T25, T26)">
            Mock: Billing sends a note
          </Button>
          <Button icon={PackageOpen} onClick={onReturn} title="Mock only: play Stores (D-05)">
            Mock: Stores records a return
          </Button>
        </span>
      </header>
      <section className="sv-home__sec">
        <h3 className="sv-home__h">Received invoices and notes · {all.length}</h3>
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
                  <td className="mono">
                    {v.number}
                    {isNote(v) && <span className="subtle small-note"> · {DOC_LABEL[v.docType!].toLowerCase()}</span>}
                  </td>
                  <td>{v.date}</td>
                  <td className="num">
                    {v.docType === 'credit_note' ? '−' : ''}
                    {inr(calcOf(v, ctx).payable)}
                  </td>
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

const ONE = (amount: number): InvoiceLine[] => [{ kind: 'goods', item: 'FG-101', qty: 1, rate: amount, discount: null }];

/** Mock only: Billing issues a credit or debit note against a posted invoice (the scenario's B4-06 to B4-08) and hands it over. */
function NoteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { s, app } = useSalesCtx();
  const posted = s.vouchers.filter((x) => !isNote(x) && x.status === 'posted');
  const lakshmi = posted.find((x) => x.number === 'KA/INV/2627/0143');
  const namma = posted.find((x) => x.number === 'KA/INV/2627/0141');
  const rate = lakshmi?.lines.find((l) => l.item === 'FG-101')?.rate ?? 700;
  const presets: { key: string; title: string; words: string; inv?: Voucher; spec?: Omit<NoteSpec, 'invoiceId'> }[] = [
    { key: 'B4-06', title: 'B4-06 · Credit note: 40 cartons returned', words: `Sri Lakshmi, against KA/INV/2627/0143: 40 × ₹${rate} + GST. Waits for Stores' receipt (C-17).`, inv: lakshmi, spec: { docType: 'credit_note', reason: 'return', lines: [goodsLine('FG-101', 40, rate)] } },
    { key: 'B4-07a', title: 'B4-07(a) · Credit note: scheme rebate ₹50,000 (SCH-26-Q2)', words: 'Agreed before supply, so GST is reduced: ₹52,500. Rajan and Venkat approve.', inv: lakshmi, spec: { docType: 'credit_note', reason: 'scheme_discount', schemeRef: 'SCH-26-Q2', lines: ONE(50000) } },
    { key: 'B4-07c', title: 'B4-07(c) · Credit note: goodwill ₹5,000, no scheme', words: 'Namma Bakes, against KA/INV/2627/0141: no scheme, so GST is NOT reduced (s.15(3)).', inv: namma, spec: { docType: 'credit_note', reason: 'goodwill', lines: ONE(5000) } },
    { key: 'B4-07d', title: 'B4-07(d) · Credit note: price correction ₹3,000 + GST', words: "Illustrative: against KA/INV/2627/0143 (the scenario's 20-Mar-2026 invoice is not in the demo).", inv: lakshmi, spec: { docType: 'credit_note', reason: 'price_correction', lines: ONE(3000) } },
    { key: 'B4-08', title: 'B4-08 · Debit note: late freight ₹6,000 + GST', words: 'Namma Bakes, against KA/INV/2627/0141: ₹75,600 → ₹81,900. An extra entry, not a reversal.', inv: namma, spec: { docType: 'debit_note', reason: 'additional_charge', lines: [{ kind: 'charge', item: 'CH-FRT', qty: 1, rate: 6000, discount: null }] } },
  ];
  return (
    <Dialog open={open} onClose={onClose} title="Mock: Billing sends a note" description="Plays Billing: it issues a credit or debit note against a posted invoice, after Nisha approved the adjustment, and hands it to you to book (T25, T26).">
      <div className="sheet-stack">
        <ReturnStockSwitch />
        {presets.map((p) => (
          <button
            key={p.key}
            className="sv-pick"
            disabled={!p.inv}
            onClick={() => {
              const id = p.inv && p.spec ? s.receiveNote({ invoiceId: p.inv.id, ...p.spec }) : null;
              onClose();
              if (id) app.openVoucher(id);
            }}
          >
            <strong>{p.title}</strong>
            <span className="subtle small-note">{p.inv ? p.words : `First book and post ${p.key.startsWith('B4-07c') || p.key === 'B4-08' ? 'KA/INV/2627/0141' : 'KA/INV/2627/0143 (Sri Lakshmi, B4-01)'}: a note corrects a posted invoice.`}</span>
          </button>
        ))}
        <ApiHint>event sales.creditnote.issued / sales.debitnote.issued (Billing) → a sales voucher of type credit_note / debit_note, against its invoice</ApiHint>
      </div>
    </Dialog>
  );
}

/** The book's setting (fin.book_setting return_stock_posting): who posts the stock back when goods are returned. */
function ReturnStockSwitch() {
  const { s } = useSalesCtx();
  return (
    <div>
      <p className="subtle small-note">Stock back on a return is posted by (the book's setting):</p>
      <SegmentedControl
        label="Who posts the stock back"
        value={s.returnStock}
        onChange={s.setReturnStock}
        options={[
          { value: 'stores_receipt', label: "Stores' receipt (CA's E1)" },
          { value: 'with_credit_note', label: 'The credit note' },
        ]}
      />
    </div>
  );
}

/** Mock only: Stores records goods returned by a customer (D-05), matched to the invoice and the batch they left from. */
function ReturnDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { s } = useSalesCtx();
  const [msg, setMsg] = useState<string | null>(null);
  const lakshmi = s.vouchers.find((x) => !isNote(x) && x.status === 'posted' && x.number === 'KA/INV/2627/0143');
  const presets: { title: string; words: string; spec: Omit<ReturnSpec, 'invoiceId'> }[] = [
    { title: 'D-05 · 40 cartons of FG-101, batch G-2608, damaged', words: 'Held in quarantine (KA-QC) at the cost they left at.', spec: { item: 'FG-101', lot: 'G-2608', qty: 40, condition: 'damaged' } },
    { title: 'Illustrative · 10 cartons of FG-102, batch C-2607, saleable', words: 'Back on the shelf, in their own batch.', spec: { item: 'FG-102', lot: 'C-2607', qty: 10, condition: 'saleable' } },
  ];
  return (
    <Dialog open={open} onClose={() => { setMsg(null); onClose(); }} title="Mock: Stores records a return" description="Plays Latha (Stores): goods come back against an invoice; the receipt names the batch, the quantity and the condition (D-05). A return credit note waits for it (C-17).">
      <div className="sheet-stack">
        <ReturnStockSwitch />
        {!lakshmi && <Callout tone="info">First book and post KA/INV/2627/0143 (Sri Lakshmi, B4-01): goods come back against a posted invoice.</Callout>}
        {presets.map((p) => (
          <button
            key={p.title}
            className="sv-pick"
            disabled={!lakshmi}
            onClick={() => {
              const id = lakshmi ? s.recordReturn({ invoiceId: lakshmi.id, ...p.spec }) : null;
              setMsg(id ? `${id} recorded${s.returnStock === 'stores_receipt' ? ': the stock back is posted now (Books → Day book).' : ': the credit note will post the stock back.'}` : 'Refused: more back than the invoice took from that batch (Part C).');
            }}
          >
            <strong>{p.title}</strong>
            <span className="subtle small-note">{p.words}</span>
          </button>
        ))}
        {msg && <Callout tone={msg.startsWith('Refused') ? 'critical' : 'success'}>{msg}</Callout>}
        <p className="subtle small-note">Recorded: {s.returns.length ? s.returns.map((r) => `${r.id} (${r.qty} ${r.item}, ${r.condition}${r.noteId ? `, note ${r.noteId}` : ''})`).join(' · ') : 'none yet'}. </p>
        <ApiHint>event stores.sales_return.received (Stores) → inv.stock_return; the stock back posts here or with the note</ApiHint>
      </div>
    </Dialog>
  );
}

/** Rev 21: uploaded documents waiting for their customer: NOT drafts (not in the list); each waits for its T12 request. */
function HeldDocs() {
  const { app, s, ctx } = useSalesCtx();
  return (
    <Callout tone="info" title={`Waiting for a customer · ${s.held.length} (not in the voucher list)`}>
      <ul className="ob-plain sv-held">
        {s.held.map((v) => {
          const reqId = v.pendingCustomer?.requestId;
          const r = reqId ? app.requests.find((x) => x.id === reqId) : undefined;
          const stage = !r ? 'request discarded' : r.status === 'draft' ? 'the form is with you: fill and submit' : r.status === 'submitted' ? 'with the checkers' : r.status === 'active' ? 'active' : r.status.replace('_', ' ');
          return (
            <li key={v.id}>
              <strong>{DOC_LABEL[v.docType ?? 'invoice']} {v.number}</strong> · {v.pendingCustomer?.name} · {inr(calcOf(v, ctx).payable)} ·{' '}
              <span className="subtle">T12 {reqId ?? '—'}: {stage}</span>{' '}
              <span className="inline-gap">
                {r ? (
                  <Button size="sm" onClick={() => app.navigate('onboarding', r.id)}>Open the customer form</Button>
                ) : (
                  <Button size="sm" onClick={() => s.holdForCustomer(v.id, true)}>Create the customer again</Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <span className="subtle small-note">Each comes back to "To book" by itself when its customer is activated (the T12 approvals).</span>
    </Callout>
  );
}
