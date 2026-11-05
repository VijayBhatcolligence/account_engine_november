// One sales invoice, built for the person billing. The invoice comes prefilled from the challan, the order and the
// party master (the example); they type the customer's PO, maybe the date, maybe a lower quantity. The accounting
// entry is typed by hand, like a Tally voucher (30-Oct): every ledger selected, every amount typed, checked. So:
//   header      who · what · status, and the actions (Preview / print · Save · Submit) always in view
//   issue strip what blocks, what warns, what is met (replaces a side checklist), or the checker / result
//   tabs        Invoice (the whole form, every field visible, laid out like the invoice)
//               · Accounting entry (typed by hand) · Why each value · Approval & history
//   ? buttons   on every automatic value: the CA answer and the engineer answer, right where the value is

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, CheckCheck, CornerUpLeft, Eye, Pencil, Plus, Save, Send, Trash2, Undo2, X } from 'lucide-react';
import { fmtDate, fmtDateTime } from '../domain/dates';
import { inr } from '../domain/money';
import { Button, Callout, Dialog, SegmentedControl, StatusPill, TextInput } from '../ui';
import { ACTORS, ME, STATES, who } from '../onboarding/catalogue';
import { ReasonDialog } from '../onboarding/screens/OnboardingScreen';
import { ApiHint, StatusSteps, type Step } from '../onboarding/screens/parts';
import type { CheckResult } from '../onboarding/rules';
import { COMPANY, costOn, ITEMS, LEDGERS, MONTH, PARAMS, periodOf, SERIES } from './catalogue';
import { useSalesCtx, V_STATUS } from './hooks';
import { InvoiceDoc } from './InvoiceDoc';
import { logicOf, type Logic } from './logic';
import { branchLabel, openBranches, viewOf } from '../onboarding/branches';
import { accountOf, billedQty, billingOf, branchOfV, calcOf, challanOf, customers, checksOf, COST_RULE, costLinesOf, dueDateOf, dueOf, ewbDays, linesOf, narrationOf, partyOfAccount, POSTING_RULE, ruleCostOf, ruleEntryOf, rupees, stops, sum, typedCostLinesOf, type PostLine } from './rules';
import { isMineV, titleOfV } from './store';
import type { Voucher } from './types';
import { rupeesInWords } from './words';

const API = '/sales-invoices';
type Tab = 'invoice' | 'entries' | 'why' | 'history';

export function VoucherWorkspace({ v }: { v: Voucher }) {
  const { s, ctx } = useSalesCtx();
  const editable = isMineV(v);
  const checks = checksOf(v, ctx);
  const blocking = stops(checks);
  const [tab, setTab] = useState<Tab>('invoice');
  const [preview, setPreview] = useState(false);
  const [returning, setReturning] = useState<string | null>(null);
  const [sendingBack, setSendingBack] = useState(false);
  const [crediting, setCrediting] = useState(false);
  const a = accountOf(ctx, v.accountId);
  const dc = challanOf(ctx, v.dcId);
  const c = calcOf(v, ctx);
  const st = V_STATUS[v.status];

  return (
    <div className="ob-req">
      <header className="ob-req__head sv-head">
        <div className="ob-req__titlerow">
          <div>
            <p className="ob-req__eyebrow">
              {v.id} · Sales invoice from challan <strong>{v.dcId}</strong>
              {dc ? ` (${dc.soId})` : ''}, recorded by {who(v.from)} · opened {fmtDateTime(v.arrivedAt)}
            </p>
            <h2 className="ob-req__title">
              {titleOfV(v, ctx)} <StatusPill tone={st.tone}>{st.label}</StatusPill>
            </h2>
          </div>
          <span className="inline-gap">
            <Button icon={Eye} onClick={() => setPreview(true)}>
              {v.number ? 'View / print' : 'Preview the invoice'}
            </Button>
            {editable && (
              <>
                <Button icon={Save} disabled={!v.dirty} onClick={() => s.saveDraft(v.id)}>
                  Save draft
                </Button>
                <Button variant="primary" icon={Send} disabled={blocking.length > 0} onClick={() => s.submit(v.id)} title={blocking.length ? 'Fix the items in red first' : 'Goes to Rajan'}>
                  {v.status === 'returned' ? 'Resubmit' : 'Submit to Rajan'}
                </Button>
              </>
            )}
            {v.status === 'posted' && (
              <Button icon={CornerUpLeft} onClick={() => setCrediting(true)}>
                Credit note (mock)
              </Button>
            )}
          </span>
        </div>
        <div className="ob-req__facts">
          <span>
            <span className="subtle">Invoice</span> <span className="mono">{v.number ?? 'on confirmation'}</span>
          </span>
          <span>
            <span className="subtle">Date</span> {fmtDate(v.date)}
          </span>
          <span>
            <span className="subtle">Supply</span> {c.intra === null ? '—' : c.intra ? 'Local · CGST + SGST' : 'Inter-state · IGST'}
          </span>
          <span>
            <span className="subtle">Taxable</span> {inr(c.taxable)}
          </span>
          <span>
            <span className="subtle">Total</span> <strong>{inr(c.total)}</strong>
          </span>
          <span>
            <span className="subtle">Due</span> {fmtDate(dueDateOf(v, a))}
          </span>
          <span>
            <span className="subtle">Margin</span> {c.marginPct !== null ? `${c.marginPct}%` : '—'}
          </span>
        </div>
        <IssueStrip v={v} checks={checks} onReturn={setReturning} onSendBack={() => setSendingBack(true)} />
        <SegmentedControl
          label="View"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'invoice', label: 'Invoice' },
            { value: 'entries', label: v.manual && editable ? 'Accounting entry (type it) *' : 'Accounting entries' },
            { value: 'why', label: 'Why each value' },
            { value: 'history', label: 'Approval & history' },
          ]}
        />
      </header>

      <div className="sv-scroll">
        {tab === 'invoice' && <InvoiceForm v={v} editable={editable} />}
        {tab === 'entries' && <PostPreview v={v} editable={editable} />}
        {tab === 'why' && <WhyTable v={v} />}
        {tab === 'history' && <HistoryView v={v} />}
      </div>

      <Dialog open={preview} onClose={() => setPreview(false)} title={v.number ? `Tax invoice ${v.number}` : 'Tax invoice (draft preview)'} description="Exactly what the customer receives. Use the browser's print to print it." width={1000} footer={<Button onClick={() => setPreview(false)}>Close</Button>}>
        <div className="inv-big">
          <InvoiceDoc v={v} ctx={ctx} />
        </div>
      </Dialog>
      <ReasonDialog
        open={returning !== null}
        title={returning ? `${ACTORS[v.approvals.find((x) => x.id === returning)!.checker].name} returns this invoice` : ''}
        description="Mock only: you are playing the checker. It comes back to you with this reason. Nothing is posted."
        chips={["Customer's PO number does not match their order", 'Wrong invoice date', 'Bill the expiring batch separately']}
        action="Return"
        onClose={() => setReturning(null)}
        onConfirm={(reason) => {
          s.decide(v.id, returning!, false, reason);
          setReturning(null);
        }}
      />
      <ReasonDialog
        open={sendingBack}
        title={`Send ${v.dcId} back to ${who(v.from)}`}
        description="Nothing is posted and no invoice number is used. Stores corrects the challan."
        chips={['Quantity on the challan differs from what was loaded', 'Wrong batch on the challan', 'Challan raised for the wrong customer']}
        action="Send the challan back"
        onClose={() => setSendingBack(false)}
        onConfirm={(reason) => {
          s.sendBack(v.id, reason);
          setSendingBack(false);
        }}
      />
      <ReasonDialog
        open={crediting}
        title={`Credit note for ${v.number}`}
        description={`Mock: assumes the Sales Manager approved the adjustment. Checked by Rajan${c.total > PARAMS.creditNoteFc.value ? ' and Usha (above ₹1,00,000)' : ''}. It reverses this invoice's own lines; a return also needs Stores' return receipt.`}
        chips={['Invoiced to the wrong customer', 'Goods returned (Stores has recorded them back)', 'Wrong rate: re-invoice at the agreed rate']}
        action="Issue the credit note"
        onClose={() => setCrediting(false)}
        onConfirm={(reason) => {
          s.cancelByCreditNote(v.id, reason);
          setCrediting(false);
        }}
      />
    </div>
  );
}

/** One line under the header: what blocks, what warns, what is met; or where the invoice stands. */
function IssueStrip({ v, checks, onReturn, onSendBack }: { v: Voucher; checks: CheckResult[]; onReturn: (id: string) => void; onSendBack: () => void }) {
  const { s } = useSalesCtx();
  const [showOk, setShowOk] = useState(false);
  const pending = v.approvals.find((x) => x.status === 'pending');
  if (v.status === 'submitted' && pending)
    return (
      <div className="sv-strip sv-strip--info">
        <span>
          <strong>With {who(pending.checker)}</strong> since {fmtDateTime(v.submittedAt!)}. When he approves: the entry posts, the number is given, the IRN and the e-way bill come back, and Stores can release {v.dcId}.
        </span>
        <span className="ob-sim">
          <button className="ob-sim__btn" onClick={() => s.decide(v.id, pending.id, true)} title="Mock only: play the checker">
            <CheckCheck size={14} aria-hidden /> {ACTORS[pending.checker].name} approves
          </button>
          <button className="ob-sim__btn" onClick={() => onReturn(pending.id)} title="Mock only: play the checker">
            <CornerUpLeft size={14} aria-hidden /> returns
          </button>
        </span>
      </div>
    );
  if (v.status === 'posted')
    return (
      <div className="sv-strip sv-strip--ok">
        <span>
          <strong>Confirmed {v.number}</strong> · journal {v.entryId} · IRN received{v.ewbNo ? ` · e-way bill ${v.ewbNo}` : ''} · {v.dcId} can leave. Final: a mistake is put right by a credit note, never by editing.
        </span>
      </div>
    );
  if (v.status === 'cancelled')
    return (
      <div className="sv-strip">
        <span>
          <strong>Credited in full by {v.cancel!.creditNote}</strong> ({v.cancel!.entryId}): "{v.cancel!.reason}". The invoice and its entry stay in the books.
        </span>
      </div>
    );
  if (v.status === 'sent_back')
    return (
      <div className="sv-strip">
        <span>
          <strong>Challan sent back to {who(v.sentBack!.to)}</strong>: "{v.sentBack!.reason}". Nothing posted, no number used.
        </span>
      </div>
    );
  const stopList = stops(checks);
  const warns = checks.filter((x) => x.level === 'warn');
  const oks = checks.filter((x) => x.level === 'ok');
  return (
    <div className="sv-issues">
      {v.status === 'returned' && (
        <div className="sv-strip sv-strip--bad">
          <span>
            <strong>Returned by {v.returnedReason}</strong>. Fix it and resubmit.
          </span>
        </div>
      )}
      <div className="sv-chips">
        {stopList.length > 0 ? <span className="sv-chips__h tone-critical">To fix before submit ({stopList.length})</span> : <span className="sv-chips__h tone-success">Ready to submit</span>}
        {stopList.map((x) => (
          <span key={x.title} className="sv-chip sv-chip--stop" title={x.detail}>
            {x.title}
          </span>
        ))}
        {warns.map((x) => (
          <span key={x.title} className="sv-chip sv-chip--warn" title={x.detail}>
            {x.title}
          </span>
        ))}
        <button className="sv-chip sv-chip--ok" onClick={() => setShowOk((o) => !o)} title="Rules the invoice already meets">
          <Check size={12} aria-hidden /> {oks.length} rules met
        </button>
        <span className="sv-chips__end">
          <button className="link-btn" onClick={onSendBack}>
            <Undo2 size={12} aria-hidden /> Send the challan back
          </button>
          {v.status === 'draft' && !v.submittedAt && (
            <button className="link-btn ob-discard" onClick={() => s.discard(v.id)}>
              <Trash2 size={12} aria-hidden /> Discard
            </button>
          )}
        </span>
      </div>
      {showOk && (
        <ul className="ob-plain ob-plain--tight sv-oklist">
          {oks.map((x) => (
            <li key={x.title}>
              {x.title}
              {x.detail ? ` · ${x.detail}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "?" beside an automatic value: the CA answer and the engineer answer, where the value is. */
function Why({ l }: { l: Logic | undefined }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', off);
    return () => window.removeEventListener('mousedown', off);
  }, [open]);
  if (!l) return null;
  return (
    <span className="sv-why" ref={ref}>
      <button className={`sv-why__btn${open ? ' is-open' : ''}`} onClick={() => setOpen((o) => !o)} aria-label={`Why: ${l.what}`} title="Why this value?">
        ?
      </button>
      {open && (
        <span className="sv-why__pop" role="dialog" aria-label={`Why: ${l.what}`}>
          <span className="sv-logic__h">For the CA · business</span>
          <span className="sv-why__p">{l.business}</span>
          <span className="sv-logic__h">For the engineer · data and rule</span>
          <span className="sv-why__p">
            <b>Reads:</b> <span className="mono">{l.engineer.reads}</span>
          </span>
          <span className="sv-why__p">
            <b>Rule:</b> {l.engineer.rule}
          </span>
          <span className="sv-why__p">
            <b>Stores:</b> <span className="mono">{l.engineer.stores}</span>
          </span>
        </span>
      )}
    </span>
  );
}

/** A labelled value. auto = filled by the system (shows "?"); otherwise it is typed or fixed by the source. */
function F({ label, why, children, wide, missing }: { label: string; why?: Logic; children: ReactNode; wide?: boolean; missing?: boolean }) {
  return (
    <div className={`sv-f${wide ? ' sv-f--wide' : ''}${missing ? ' is-missing' : ''}`}>
      <span className="sv-f__l">
        {label} <Why l={why} />
      </span>
      <span className="sv-f__v">{children}</span>
    </div>
  );
}

const SALES_LEDGERS = ['sales_local', 'sales_interstate'];
const TAX_LEDGERS = ['out_cgst', 'out_sgst', 'out_igst'];
const num = (x: string) => (x === '' ? null : Number(x.replace(/[^0-9.-]/g, '')));

/** What the invoice / posting rule says belongs there: shown beside a typed value, never filled in. */
function RuleHint({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  return <span className={`sv-rule-hint${ok === false ? ' is-off' : ok ? ' is-ok' : ''}`}>{ok === false ? '≠ ' : ok ? '✓ ' : ''}{children}</span>;
}

/** The whole invoice as a form, every field visible, in the order of the printed invoice. Prefilled from the challan. */
function InvoiceForm({ v, editable }: { v: Voucher; editable: boolean }) {
  const { s, ctx } = useSalesCtx();
  const L = Object.fromEntries(logicOf(v, ctx).map((l) => [l.key, l])) as Record<string, Logic>;
  const a = accountOf(ctx, v.accountId);
  const p = partyOfAccount(ctx, v.accountId);
  const dc = challanOf(ctx, v.dcId);
  const c = calcOf(v, ctx);
  const bv = branchOfV(ctx, v);
  const loc = bv?.location ?? p?.address ?? null;
  const st = (p && (bv?.stateCode || p.address.stateCode)) || '';
  const branches = a && p ? openBranches(a, p).map((b) => viewOf(p, b)) : [];
  const needPo = billingOf(ctx, a)?.poRule === 'every_invoice';
  const due = dueOf(ctx, v.accountId);
  const after = due + (v.status === 'posted' || v.status === 'cancelled' ? 0 : c.total);
  const per = v.date ? periodOf(v.date) : null;
  return (
    <div className="sv-sheet">
      <div className="sv-sheet__grid">
        <section className="sv-box">
          <h3 className="sv-box__h">Buyer · bill to = ship to</h3>
          <F label="Customer" why={L.party} wide>
            <strong>{a?.name ?? '—'}</strong> <span className="subtle">{a?.accountId}</span>
          </F>
          <F label="Under" why={L.control}>
            {a?.under ?? '—'}
          </F>
          <F label="Branch" wide>
            {branches.length > 1 && editable ? (
              <select className="input" value={bv?.branch.branchId ?? ''} onChange={(e) => s.setBranch(v.id, e.target.value)} aria-label="Bill to branch">
                {branches.map((b) => (
                  <option key={b.branch.branchId} value={b.branch.branchId}>
                    {branchLabel(b)}{b.branch.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <>{bv ? bv.location?.label : '—'} <span className="subtle">{branches.length > 1 ? `· 1 of ${branches.length} branches` : '· the only branch'}</span></>
            )}
          </F>
          <F label="GSTIN">
            <span className="mono">{bv?.gstin?.value ?? '—'}</span>
          </F>
          <F label="Address" wide>
            {loc ? [loc.line, loc.city].filter(Boolean).join(', ') : '—'}
          </F>
          <F label="Pincode" missing={!!loc && !/^\d{6}$/.test(loc.pincode)}>
            {!loc ? '—' : /^\d{6}$/.test(loc.pincode) ? loc.pincode : <StatusPill tone="critical">missing</StatusPill>}
          </F>
          <F label="State · code">{p ? `${STATES[st]?.name ?? '—'} · ${STATES[st]?.code ?? '—'}` : '—'}</F>
          <F label="Owes now → after this" wide>
            {a ? <>{inr(due)} → <strong className={a.creditLimit !== null && after > a.creditLimit ? 'tone-warning' : undefined}>{inr(after)}</strong> <span className="subtle">of limit {inr(a.creditLimit)}</span></> : '—'}
          </F>
          <p className="sv-box__note">Name, GSTIN and address come from the party master: never edited in Sales.</p>
        </section>

        <section className="sv-box">
          <h3 className="sv-box__h">Invoice</h3>
          <F label="Invoice no." why={L.number}>
            <span className={v.number ? 'mono' : 'subtle'}>{v.number ?? `${SERIES.invoice}nnnn on confirmation`}</span>
          </F>
          <F label={`Invoice date${editable ? ' *' : ''}`} missing={!v.date}>
            {editable ? <TextInput type="date" value={v.date} onChange={(ev) => s.setField(v.id, 'date', ev.target.value)} /> : fmtDate(v.date)}
            {per && <span className={`sv-f__hint${per !== 'open' ? ' tone-warning' : ''}`}>{MONTH(v.date)} {per === 'open' ? 'open' : per === 'soft' ? 'soft-closed' : 'closed'}</span>}
          </F>
          <F label="Place of supply" why={L.pos}>
            {c.pos ? `${STATES[c.pos]?.name} (${STATES[c.pos]?.code})` : '—'}
          </F>
          <F label="Supply" why={L.nature}>
            {c.intra === null ? '—' : c.intra ? 'Local (intra-state): CGST + SGST' : 'Inter-state: IGST'}
          </F>
          <F label="Branch · godown">KA-01 · {COMPANY.godown}</F>
          <F label="Seller GSTIN">
            <span className="mono">{COMPANY.gstin}</span>
          </F>
        </section>

        <section className="sv-box">
          <h3 className="sv-box__h">References · terms</h3>
          <F label="Delivery challan" why={L.qty}>
            {dc ? `${dc.id} · ${fmtDate(dc.date)} · ${ACTORS.latha.name}` : v.dcId}
          </F>
          <F label="Sales order" why={L.rate}>
            {dc ? `${dc.soId} · ${fmtDate(dc.soDate)}` : '—'}
          </F>
          <F label={`Customer's PO${needPo && editable ? ' *' : ''}`} why={L.po} missing={editable && needPo && !v.customerPo.trim()}>
            {editable ? <TextInput value={v.customerPo} placeholder={needPo ? 'e.g. SLD/PO/889' : 'Optional'} onChange={(ev) => s.setField(v.id, 'customerPo', ev.target.value)} /> : v.customerPo || '—'}
          </F>
          <F label="Payment terms → due" why={L.due}>
            {a ? `${a.creditDays ?? 0} days → ${fmtDate(dueDateOf(v, a))}` : '—'}
          </F>
          <F label="E-invoice" why={L.irn}>
            {v.irn ? <span className="mono">IRN {v.irn.slice(0, 14)}… · Ack {v.ackNo}</span> : <span className="subtle">IRN after Rajan approves</span>}
          </F>
          <F label="E-way bill" why={L.ewb}>
            {c.total > PARAMS.ewayBillMin.value ? (v.ewbNo ? `${v.ewbNo} · valid to ${fmtDate(v.ewbValidTo)}` : `Needed · ${dc ? ewbDays(dc.distanceKm) : 1} day(s)`) : 'Not needed (≤ ₹50,000)'}
          </F>
          <F label="Transport (Part-B, Stores)" wide>
            {dc ? `${dc.transporter} · ${dc.vehicleNo} · ${dc.distanceKm} km · LR ${dc.lrNo}` : '—'}
          </F>
        </section>
      </div>

      <table className="sv-items sv-items--sheet">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>Batch · expiry</th>
            <th>
              HSN · GST <Why l={L.hsn} />
            </th>
            <th className="num">On challan</th>
            <th className="num">Quantity{editable ? ' *' : ''}</th>
            <th className="num">
              Rate <Why l={L.rate} />
            </th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {v.lines.map((l, i) => {
            const it = ITEMS[l.item];
            const left = l.dcQty - billedQty(ctx, v.dcId, l.dcLine, v.id);
            const r = c.rows.find((x) => x.dcLine === l.dcLine);
            const soon = r?.expiry && v.date && (Date.parse(r.expiry) - Date.parse(v.date)) / 86_400_000 <= PARAMS.expiryWarnDays.value;
            return (
              <tr key={i} className={(Number(l.qty) || 0) > left ? 'is-over' : undefined}>
                <td>{i + 1}</td>
                <td>
                  <strong>{it?.name}</strong> <span className="subtle small-note">{l.item}</span>
                </td>
                <td className={soon ? 'tone-warning' : undefined}>
                  {l.batch} · {fmtDate(r?.expiry ?? null)}
                  {soon ? ' ⚠' : ''}
                </td>
                <td className="mono sv-nowrap">{it ? `${it.hsn} · ${it.gst}%` : '—'}</td>
                <td className="num">
                  {l.dcQty}
                  {left !== l.dcQty && <span className="subtle small-note sv-block">{left} unbilled</span>}
                </td>
                <td className="num sv-qty">{editable ? <TextInput inputMode="numeric" value={l.qty ?? ''} aria-label={`Quantity, line ${i + 1}`} onChange={(ev) => s.setQty(v.id, i, num(ev.target.value))} /> : `${l.qty ?? 0} ctn`}</td>
                <td className="num">{inr(Number(l.rate))}</td>
                <td className="num">{r ? rupees(r.amount) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="sv-sheet__foot">
        <div className="sv-sheet__words">
          <F label="Amount in words" wide>
            {rupeesInWords(c.total)}
          </F>
          <table className="sv-hsn">
            <thead>
              <tr>
                <th>HSN</th>
                <th className="num">Taxable</th>
                {c.intra === false ? <th className="num">IGST</th> : <><th className="num">CGST</th><th className="num">SGST</th></>}
                <th className="num">Total tax</th>
              </tr>
            </thead>
            <tbody>
              {c.hsn.map((g) => (
                <tr key={g.hsn + g.gst}>
                  <td>
                    {g.hsn} @ {g.gst}%
                  </td>
                  <td className="num">{rupees(g.taxable)}</td>
                  {c.intra === false ? <td className="num">{rupees(g.igst)}</td> : <><td className="num">{rupees(g.cgst)}</td><td className="num">{rupees(g.sgst)}</td></>}
                  <td className="num">{rupees(g.cgst + g.sgst + g.igst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <F label="Narration (optional: written for you if blank)" wide>
            {editable ? <TextInput value={v.narration} placeholder={narrationOf(v, ctx)} onChange={(ev) => s.setField(v.id, 'narration', ev.target.value)} /> : v.narration}
          </F>
        </div>
        <div className="sv-totals">
          <span className="sv-totals__k">Taxable value</span>
          <span className="sv-totals__v">{rupees(c.taxable)}</span>
          {c.intra !== false ? (
            <>
              <span className="sv-totals__k">CGST @ 2.5% <Why l={L.tax} /></span>
              <span className="sv-totals__v">{rupees(c.cgst)}</span>
              <span className="sv-totals__k">SGST @ 2.5%</span>
              <span className="sv-totals__v">{rupees(c.sgst)}</span>
            </>
          ) : (
            <>
              <span className="sv-totals__k">IGST @ 5% <Why l={L.tax} /></span>
              <span className="sv-totals__v">{rupees(c.igst)}</span>
            </>
          )}
          <span className="sv-totals__k">Round off <Why l={L.round} /></span>
          <span className="sv-totals__v">{rupees(c.roundOff)}</span>
          <span className="sv-totals__k sv-totals__total">Invoice total</span>
          <span className="sv-totals__v sv-totals__total">{rupees(c.total)}</span>
          <span className="sv-totals__k sv-totals__muted">Cost of goods (challan) <Why l={L.cost} /></span>
          <span className="sv-totals__v sv-totals__muted">{inr(c.cost)}</span>
          <span className="sv-totals__k sv-totals__muted">Gross margin <Why l={L.margin} /></span>
          <span className="sv-totals__v sv-totals__muted">{c.taxable ? `${inr(c.margin)} · ${c.marginPct}%` : '—'}</span>
        </div>
      </div>
      <p className="subtle small-note sv-sheet__legend">
        {v.manual && editable ? 'The invoice is prefilled from the challan (the example). The accounting entry is yours: type it on the Accounting entry tab.' : 'Read only.'} <span className="sv-why__btn sv-why__btn--legend">?</span> explains a value for the CA and for the engineer.{editable && <ApiHint>PATCH {API}/{v.id}</ApiHint>}
      </p>
    </div>
  );
}

/**
 * The accounting entry, typed by hand like a Tally sales voucher (30-Oct): Dr the Party A/c, Cr the sales ledger,
 * Cr each output GST ledger, round off. Every ledger is selected, every amount typed. Beside each, what the invoice
 * and the posting rule say belongs there (✓ agrees, ≠ differs); a difference stops Submit with the reason.
 */
function EntryForm({ v }: { v: Voucher }) {
  const { s, ctx } = useSalesCtx();
  const L = Object.fromEntries(logicOf(v, ctx).map((l) => [l.key, l])) as Record<string, Logic>;
  const m = v.manual!;
  const c = calcOf(v, ctx);
  const want = ruleEntryOf(v, ctx);
  const t = sum(linesOf(v, ctx));
  const same = (x: number | null, y: number) => (x === null ? null : Math.abs(Number(x) - y) <= 0.004);
  const sel = (value: string, onChange: (x: string) => void, options: [string, string][], placeholder: string, ok: boolean | null) => (
    <select className={`input${ok === false ? ' is-bad' : ''}`} value={value} onChange={(ev) => onChange(ev.target.value)}>
      <option value="">{placeholder}</option>
      {options.map(([k, label]) => (
        <option key={k} value={k}>
          {label}
        </option>
      ))}
    </select>
  );
  const amt = (value: number | null, onChange: (x: number | null) => void, label: string) => <TextInput inputMode="decimal" value={value ?? ''} aria-label={label} onChange={(ev) => onChange(num(ev.target.value))} />;
  const wantTax = (k: string) => want.taxLines.find((x) => x.ledger === k);
  return (
    <>
      <div className="sv-source">
        <span className="sv-source__h">From the invoice:</span>
        <span className="sv-source__lines">
          <span>{accountOf(ctx, v.accountId)?.name}</span>
          <span>{c.intra === null ? '—' : c.intra ? 'local sale' : 'inter-state sale'}</span>
          <span>taxable {rupees(c.taxable)}</span>
          {c.intra === false ? <span>IGST {rupees(c.igst)}</span> : <span>CGST {rupees(c.cgst)} · SGST {rupees(c.sgst)}</span>}
          <span>round off {rupees(c.roundOff)}</span>
          <span>total {rupees(c.total)}</span>
        </span>
        <button className="ob-sim__btn" onClick={() => s.typeEntry(v.id)} title="Mock only: types the entry from the invoice, as you would">
          <Pencil size={12} aria-hidden /> Type it in for me
        </button>
      </div>
      <table className="sv-post sv-post--typed">
        <thead>
          <tr>
            <th>Dr / Cr</th>
            <th>Ledger *</th>
            <th className="num">Debit ₹</th>
            <th className="num">Credit ₹</th>
            <th>The invoice says</th>
            <th aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Dr</td>
            <td>
              {sel(m.partyLedger, (x) => s.setEntry(v.id, { partyLedger: x }), customers(ctx).map((x) => [x.accountId, `${x.name} · ${x.accountId}`]), 'Select the Party A/c…', m.partyLedger ? m.partyLedger === want.partyLedger : null)} <Why l={L.party} />
            </td>
            <td className="num sv-qty">{amt(m.partyAmount, (x) => s.setEntry(v.id, { partyAmount: x }), 'Party A/c debit')}</td>
            <td />
            <td>
              <RuleHint ok={m.partyLedger ? m.partyLedger === want.partyLedger && same(m.partyAmount, want.partyAmount) !== false : same(m.partyAmount, want.partyAmount)}>
                {accountOf(ctx, want.partyLedger)?.name} · {rupees(want.partyAmount)} (the total)
              </RuleHint>
            </td>
            <td />
          </tr>
          <tr>
            <td>Cr</td>
            <td>
              {sel(m.salesLedger, (x) => s.setEntry(v.id, { salesLedger: x }), SALES_LEDGERS.map((k) => [k, `${LEDGERS[k].name} (${LEDGERS[k].code})`]), 'Select the sales ledger…', m.salesLedger ? m.salesLedger === want.salesLedger : null)} <Why l={L.sales} />
            </td>
            <td />
            <td className="num sv-qty">{amt(m.salesAmount, (x) => s.setEntry(v.id, { salesAmount: x }), 'Sales credit')}</td>
            <td>
              <RuleHint ok={m.salesLedger ? m.salesLedger === want.salesLedger && same(m.salesAmount, want.salesAmount) !== false : same(m.salesAmount, want.salesAmount)}>
                {LEDGERS[want.salesLedger]?.name ?? '—'} · {rupees(want.salesAmount)} (taxable value)
              </RuleHint>
            </td>
            <td />
          </tr>
          {m.taxLines.map((x, i) => {
            const w = wantTax(x.ledger);
            return (
              <tr key={i}>
                <td>Cr</td>
                <td>
                  {sel(x.ledger, (k) => s.setTaxLine(v.id, i, { ledger: k }), TAX_LEDGERS.map((k) => [k, `${LEDGERS[k].name} (${LEDGERS[k].code})`]), 'Select the tax ledger…', x.ledger ? !!w : null)} {i === 0 && <Why l={L.tax} />}
                </td>
                <td />
                <td className="num sv-qty">{amt(x.amount, (a) => s.setTaxLine(v.id, i, { amount: a }), `Tax credit ${i + 1}`)}</td>
                <td>
                  {x.ledger ? (
                    <RuleHint ok={w ? same(x.amount, w.amount) !== false : false}>{w ? `${LEDGERS[w.ledger].name} · ${rupees(w.amount)}` : c.intra ? 'not on a local sale' : 'not on an inter-state sale'}</RuleHint>
                  ) : (
                    <RuleHint ok={null}>{want.taxLines.map((w) => `${LEDGERS[w.ledger].name} ${rupees(w.amount)}`).join(' + ')}</RuleHint>
                  )}
                </td>
                <td className="sv-items__x">
                  <button className="link-btn" onClick={() => s.removeTaxLine(v.id, i)} aria-label={`Remove tax line ${i + 1}`}>
                    <X size={14} />
                  </button>
                </td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={2}>
              <button className="link-btn sv-add" onClick={() => s.addTaxLine(v.id)}>
                <Plus size={13} aria-hidden /> Add a tax ledger
              </button>
            </td>
            <td colSpan={4} />
          </tr>
          <tr>
            <td>{(Number(m.roundOff) || 0) < 0 ? 'Dr' : 'Cr'}</td>
            <td>
              Round off ({LEDGERS.round_off.code}) <span className="subtle small-note">+ Cr, − Dr</span> <Why l={L.round} />
            </td>
            <td />
            <td className="num sv-qty">{amt(m.roundOff, (x) => s.setEntry(v.id, { roundOff: x }), 'Round off')}</td>
            <td>
              <RuleHint ok={m.roundOff === null ? (c.roundOff === 0 ? true : null) : same(m.roundOff, c.roundOff)}>{rupees(c.roundOff)}</RuleHint>
            </td>
            <td />
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Total</td>
            <td className="num">{rupees(t.dr)}</td>
            <td className="num">{rupees(t.cr)}</td>
            <td colSpan={2}>{t.dr === t.cr ? (t.dr ? <span className="tone-success">✓ Dr = Cr</span> : '') : <span className="tone-critical">Difference {rupees(Math.abs(t.dr - t.cr))}</span>}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

/** Every automatic value in one table, explained for the CA or for the engineer. */
function WhyTable({ v }: { v: Voucher }) {
  const { ctx } = useSalesCtx();
  const [view, setView] = useState<'business' | 'engineer'>('business');
  const [open, setOpen] = useState<string | null>(null);
  const rows = logicOf(v, ctx);
  return (
    <div className="sv-sheet">
      <div className="sv-logic-bar">
        <span className="subtle small-note">Explain each value for</span>
        <SegmentedControl label="Explain for" value={view} onChange={setView} options={[{ value: 'business', label: 'The CA (business)' }, { value: 'engineer', label: 'The engineer (data · rule)' }]} />
        <span className="subtle small-note">Click a row for both.</span>
      </div>
      <table className="ob-sugg sv-logic">
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.key}>
              <tr className="sv-logic__row" onClick={() => setOpen(open === r.key ? null : r.key)}>
                <th scope="row">{r.what}</th>
                <td className="ob-sugg__value">{r.value}</td>
                <td className="ob-sugg__why">{view === 'business' ? r.business : <><b>Rule:</b> {r.engineer.rule}</>}</td>
              </tr>
              {open === r.key && (
                <tr className="sv-logic__open">
                  <td colSpan={3}>
                    <div className="sv-logic__two">
                      <div>
                        <p className="sv-logic__h">For the CA · business</p>
                        <p>{r.business}</p>
                      </div>
                      <div>
                        <p className="sv-logic__h">For the engineer · data and rule</p>
                        <p>
                          <b>Reads:</b> <span className="mono">{r.engineer.reads}</span>
                        </p>
                        <p>
                          <b>Rule:</b> {r.engineer.rule}
                        </p>
                        <p>
                          <b>Stores:</b> <span className="mono">{r.engineer.stores}</span>
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EntryTable({ lines, foot }: { lines: PostLine[]; foot: string }) {
  const t = sum(lines);
  return (
    <table className="sv-post">
      <thead>
        <tr>
          <th>Ledger</th>
          <th>Code</th>
          <th>In</th>
          <th className="num">Dr</th>
          <th className="num">Cr</th>
          <th>Why</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.ledgerKey}>
            <td>
              <strong>{l.dr ? 'Dr' : 'Cr'}</strong> {l.name}
            </td>
            <td className="mono subtle">{l.code}</td>
            <td>
              <span className={`sv-st sv-st--${l.statement}`}>{l.statement === 'BS' ? 'Balance sheet' : 'P&L'}</span>
            </td>
            <td className="num">{l.dr ? rupees(l.dr) : ''}</td>
            <td className="num">{l.cr ? rupees(l.cr) : ''}</td>
            <td className="subtle small-note">{l.why}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={3}>{t.dr === t.cr ? <span className="tone-success"><Check size={13} aria-hidden /> Dr = Cr</span> : <span className="tone-critical">Dr ≠ Cr</span>}</td>
          <td className="num">{rupees(t.dr)}</td>
          <td className="num">{rupees(t.cr)}</td>
          <td className="subtle small-note">{foot}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/**
 * The challan's cost entry, typed by hand too (Perpetual, 30-Oct): Dr cost of goods sold, Cr finished-goods
 * inventory, for the whole challan at standard cost. It is the challan's entry (dated the challan date, linked to
 * it), typed here for now and posted with the invoice; once posted, a later invoice for the same challan skips it.
 */
function CostForm({ v }: { v: Voucher }) {
  const { s, ctx } = useSalesCtx();
  const L = Object.fromEntries(logicOf(v, ctx).map((l) => [l.key, l])) as Record<string, Logic>;
  const k = v.manual!.cost!;
  const dc = challanOf(ctx, v.dcId)!;
  const w = ruleCostOf(v, ctx);
  const t = sum(typedCostLinesOf(v));
  const same = (x: number | null, y: number) => (x === null ? null : Math.abs(Number(x) - y) <= 0.004);
  const opts = Object.entries(LEDGERS).map(([key, l]) => [key, `${l.name} (${l.code})`] as [string, string]);
  const sel = (value: string, onChange: (x: string) => void, placeholder: string, ok: boolean | null) => (
    <select className={`input${ok === false ? ' is-bad' : ''}`} value={value} onChange={(ev) => onChange(ev.target.value)}>
      <option value="">{placeholder}</option>
      {opts.map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
  const amt = (value: number | null, onChange: (x: number | null) => void, label: string) => <TextInput inputMode="decimal" value={value ?? ''} aria-label={label} onChange={(ev) => onChange(num(ev.target.value))} />;
  return (
    <>
      <div className="sv-source">
        <span className="sv-source__h">From the challan:</span>
        <span className="sv-source__lines">
          {dc.lines.map((l, i) => (
            <span key={i}>
              {l.qty} ctn {l.item} × ₹{costOn(l.item, dc.date)}
            </span>
          ))}
          <span>standard cost {rupees(w.drAmount)} · {fmtDate(dc.date)}</span>
        </span>
        <span className="subtle small-note">The whole challan, even if this invoice bills part of it.</span>
      </div>
      <table className="sv-post sv-post--typed">
        <thead>
          <tr>
            <th>Dr / Cr</th>
            <th>Ledger *</th>
            <th className="num">Debit ₹</th>
            <th className="num">Credit ₹</th>
            <th>The rule says</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Dr</td>
            <td>
              {sel(k.drLedger, (x) => s.setCost(v.id, { drLedger: x }), 'Select the cost ledger…', k.drLedger ? k.drLedger === w.drLedger : null)} <Why l={L.cost} />
            </td>
            <td className="num sv-qty">{amt(k.drAmount, (x) => s.setCost(v.id, { drAmount: x }), 'Cost debit')}</td>
            <td />
            <td>
              <RuleHint ok={k.drLedger ? k.drLedger === w.drLedger && same(k.drAmount, w.drAmount) !== false : same(k.drAmount, w.drAmount)}>
                {LEDGERS.cogs.name} · {rupees(w.drAmount)}
              </RuleHint>
            </td>
          </tr>
          <tr>
            <td>Cr</td>
            <td>{sel(k.crLedger, (x) => s.setCost(v.id, { crLedger: x }), 'Select the inventory ledger…', k.crLedger ? k.crLedger === w.crLedger : null)}</td>
            <td />
            <td className="num sv-qty">{amt(k.crAmount, (x) => s.setCost(v.id, { crAmount: x }), 'Inventory credit')}</td>
            <td>
              <RuleHint ok={k.crLedger ? k.crLedger === w.crLedger && same(k.crAmount, w.crAmount) !== false : same(k.crAmount, w.crAmount)}>
                {LEDGERS.fg_inventory.name} · {rupees(w.crAmount)}
              </RuleHint>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Total</td>
            <td className="num">{rupees(t.dr)}</td>
            <td className="num">{rupees(t.cr)}</td>
            <td>{t.dr === t.cr ? (t.dr ? <span className="tone-success">✓ Dr = Cr</span> : '') : <span className="tone-critical">Difference {rupees(Math.abs(t.dr - t.cr))}</span>}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

/** The two entries a sale makes, each with its owner. */
function PostPreview({ v, editable }: { v: Voucher; editable: boolean }) {
  const { s, ctx } = useSalesCtx();
  const lines = linesOf(v, ctx);
  const dc = challanOf(ctx, v.dcId);
  const c = calcOf(v, ctx);
  const typing = !!v.manual && editable;
  if (!c.taxable) return <p className="subtle small-note sv-sheet">Enter a quantity on at least one line to see the entries.</p>;
  const costJe = dc?.costEntryId ? s.journal.find((e) => e.id === dc.costEntryId) : null;
  return (
    <div className="sv-sheet sv-entries">
      <p className="sv-entry-h">
        <span className="sv-st sv-st--PL">1 · This invoice</span> {v.entryId ? `posted as ${v.entryId}` : 'written once, when Rajan approves'}: what the customer owes, the sale, the GST
      </p>
      {typing ? <EntryForm v={v} /> : <EntryTable lines={lines} foot={POSTING_RULE} />}
      <p className="sv-entry-h">
        <span className="sv-st sv-st--BS">2 · Challan {v.dcId}</span> the cost of the goods that left ·{' '}
        {s.method === 'perpetual'
          ? costJe
            ? `already posted as ${costJe.id} by ${ACTORS[costJe.postedBy].name}, ${fmtDateTime(costJe.postedAt)}`
            : `its own entry, dated the challan date ${fmtDate(dc?.date ?? null)}: ${typing ? 'type it here' : 'typed'}, posted with this invoice`
          : 'Periodic: nothing per sale'}
      </p>
      {s.method === 'perpetual' && dc ? (
        costJe ? (
          <EntryTable lines={costJe.lines.map((l) => ({ ledgerKey: l.ledger, name: LEDGERS[l.ledger]?.name ?? l.ledger, code: LEDGERS[l.ledger]?.code ?? '—', statement: LEDGERS[l.ledger]?.statement ?? 'PL', dr: l.dr, cr: l.cr, why: l.dr ? costLinesOf(dc)[0].why : `Cartons leave KA-FG on ${dc.id}` }))} foot={`${COST_RULE} · whole challan`} />
        ) : typing && v.manual?.cost ? (
          <CostForm v={v} />
        ) : (
          <EntryTable lines={v.manual?.cost ? typedCostLinesOf(v) : costLinesOf(dc)} foot={`${COST_RULE} · whole challan`} />
        )
      ) : (
        <Callout tone="info" title="Periodic inventory (company switch, Run 2)">
          No cost entry per sale. Cost of goods sold comes at month end: opening stock + purchases − closing stock (T11).
        </Callout>
      )}
      <div className="sv-party">
        <span>
          <span className="subtle">Sales (P&L)</span> <strong>{inr(c.taxable)}</strong>
        </span>
        <span>
          <span className="subtle">Cost of goods sold (P&L)</span> <strong>{inr(c.cost)}</strong>
        </span>
        <span>
          <span className="subtle">Gross margin</span> <strong>{inr(c.margin)}</strong> · {c.marginPct}%
        </span>
        <span className="subtle small-note">The invoice never touches stock: the goods left on the challan. Crediting inventory again would count it twice.</span>
      </div>
    </div>
  );
}

function HistoryView({ v }: { v: Voucher }) {
  return (
    <div className="sv-sheet sv-two">
      <section>
        <h3 className="sv-box__h">Progress</h3>
        <StatusSteps steps={stepsOf(v)} />
      </section>
      <section>
        <h3 className="sv-box__h">History</h3>
        <ul className="ob-history">
          {[...v.history].reverse().map((h, i) => (
            <li key={i}>
              <span className="subtle">{fmtDateTime(h.at)}</span> · <strong>{ACTORS[h.by].name}</strong> · {h.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function stepsOf(v: Voucher): Step[] {
  const steps: Step[] = [
    { label: `Challan ${v.dcId} recorded by ${who(v.from)}`, state: 'done' },
    { label: `${ACTORS[ME].name} raises the invoice and submits`, at: v.submittedAt ?? v.sentBack?.at, state: isMineV(v) ? 'current' : 'done' },
  ];
  if (v.status === 'sent_back') {
    steps.push({ label: `Challan sent back to ${ACTORS[v.sentBack!.to].name}`, detail: v.sentBack!.reason, at: v.sentBack!.at, state: 'done' });
    return steps;
  }
  for (const x of v.approvals) steps.push({ label: `${ACTORS[x.checker].name}: ${x.label.toLowerCase()}`, at: x.decidedAt, detail: x.status === 'returned' ? `Returned: ${x.reason}` : undefined, state: x.status === 'approved' ? 'done' : v.status === 'submitted' ? 'current' : 'todo' });
  steps.push({ label: 'Confirmed: entry, number, IRN, e-way bill Part-A', detail: v.number ? `${v.number} · ${v.entryId}` : undefined, at: v.postedAt, state: v.status === 'posted' || v.status === 'cancelled' ? 'done' : 'todo' });
  steps.push({ label: `Stores releases ${v.dcId} (Part-B, vehicle leaves)`, state: v.status === 'posted' || v.status === 'cancelled' ? 'done' : 'todo' });
  if (v.cancel) steps.push({ label: `Credited by ${v.cancel.creditNote}`, detail: v.cancel.reason, at: v.cancel.at, state: 'done' });
  return steps;
}
