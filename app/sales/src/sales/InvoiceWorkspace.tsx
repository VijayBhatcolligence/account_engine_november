// T24 Sales voucher entry (rev 6, Vijay 18-Nov): the Accounts Executive books the ACCOUNTING ENTRY of an invoice that
// Billing raised and handed over. The invoice is read-only here (Billing's: number, IRN, lines, GST).
//   main    tabs: Accounting entry (the work: ledgers suggested, pick others; Dr = Cr; GST = the invoice's) ·
//           Invoice from Billing (read-only) · Why each value · Approval & history
//   right   the invoice, small (click → full size) · checks · what Submit sends · Submit / Save / Return to Billing
// "?" beside an automatic value gives its business answer and its engineer answer.

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Ban, Blocks, Check, CheckCheck, CornerUpLeft, Eye, Lock, Plus, Save, Send, Undo2, UserPlus, X } from 'lucide-react';
import { fmtDate, fmtDateTime } from '../domain/dates';
import { Button, Callout, Dialog, SegmentedControl, StatusPill, TextInput } from '../ui';
import { ACTORS, ME, STATES, who } from '../onboarding/catalogue';
import { ReasonDialog } from '../onboarding/screens/OnboardingScreen';
import { StatusSteps, type Step } from '../onboarding/screens/parts';
import { ENDORSEMENT, ITEMS, LEDGERS } from './catalogue';
import { COST_METHODS, lotsOf, stockValue, type CostMethod } from './inventory';
import { useSalesCtx, V_STATUS } from './hooks';
import { InvoiceDoc } from './InvoiceDoc';
import { logicOf, type Logic } from './logic';
import { accountOf, againstOf, costLinesOf, receivableOf, calcOf, checksOf, costOfV, countryName, DOC_LABEL, dueDateOf, entryOf, isNote, isTcsCategory, issuerOf, money, NOTE_REASON, partyOfAccount, placesOf, rankLedgers, routesOf, rupees, stops, sum, type EntryLine, type SCheck } from './rules';
import { T24_SPEC } from './screenSpec';
import { isMineV, titleOfV, useSales } from './store';
import type { Outcome, Voucher } from './types';
import { rupeesInWords } from './words';

type Tab = 'invoice' | 'entry' | 'why' | 'history';
const num = (x: string) => (x === '' ? null : Number(x.replace(/[^0-9.-]/g, '')));
const ledgerLabel = (k: string) => (LEDGERS[k] ? `${LEDGERS[k].name} (${LEDGERS[k].code})` : k || '—');

export function VoucherWorkspace({ v, onClose }: { v: Voucher; onClose: () => void }) {
  const { s, ctx } = useSalesCtx();
  const checks = checksOf(v, ctx);
  const [tab, setTab] = useState<Tab>('entry');
  const [preview, setPreview] = useState(false);
  const [deciding, setDeciding] = useState<{ id: string; outcome: Exclude<Outcome, 'approve'> } | null>(null);
  const [returning, setReturning] = useState(false);
  const [builtWith, setBuiltWith] = useState(false);
  const close = onClose;
  const a = accountOf(ctx, v.accountId);
  const c = calcOf(v, ctx);
  const st = V_STATUS[v.status];
  // Esc closes the voucher, unless a dialog is open on top of it (that dialog closes first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.scrim') && onClose();
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = was;
    };
  }, [onClose]);

  return createPortal(
    <div className="sv-full" role="dialog" aria-modal="true" aria-label={`Sales voucher: ${titleOfV(v, ctx)}`}>
      <header className="ob-req__head sv-full__head">
        <div className="ob-req__titlerow">
          <div>
            <p className="ob-req__eyebrow">
              Sales voucher {v.id} · {isNote(v) ? `${DOC_LABEL[v.docType!].toLowerCase()} ${v.number} against ${againstOf(ctx, v)?.number ?? '?'} (${NOTE_REASON[v.noteReason!]})` : `invoice ${v.number}`} from {ACTORS.billing.name} · received {fmtDateTime(v.arrivedAt)}
            </p>
            <h2 className="ob-req__title sv-title">
              {titleOfV(v, ctx)} {isNote(v) && <StatusPill tone={v.docType === 'credit_note' ? 'warning' : 'info'}>{DOC_LABEL[v.docType!]}</StatusPill>} <StatusPill tone={st.tone}>{st.label}</StatusPill>
            </h2>
          </div>
          <span className="inline-gap">
            <Button size="sm" variant="ghost" icon={Blocks} onClick={() => setBuiltWith(true)}>
              Built with
            </Button>
            <button className="overlay__close sv-full__close" aria-label="Close" title="Close (Esc)" onClick={close}>
              <X size={20} />
            </button>
          </span>
        </div>
        <div className="ob-req__facts">
          <span>
            <span className="subtle">{isNote(v) ? DOC_LABEL[v.docType!] : 'Invoice'}</span> <span className="mono">{v.number}</span>
          </span>
          <span>
            <span className="subtle">Date</span> {fmtDate(v.date)}
          </span>
          <span>
            <span className="subtle">Taxable</span> {rupees(c.taxable + c.exempt)}
          </span>
          <span>
            <span className="subtle">GST</span> {c.intra ? `CGST ${rupees(c.cgst)} + SGST ${rupees(c.sgst)}` : `IGST ${rupees(c.igst)}`}
          </span>
          <span>
            <span className="subtle">{c.refund ? 'Buyer owes' : 'Total'}</span> <strong>{rupees(c.payable)}</strong>
            {c.foreignTotal !== null && <span className="subtle"> ({money(c.foreignTotal, c.currency)})</span>}
          </span>
          <span>
            <span className="subtle">Due</span> {v.settlement === 'credit' ? fmtDate(dueDateOf(v, a)) : 'paid now'}
          </span>
        </div>
      </header>

      <div className="sv-full__body">
        <div className="sv-full__main">
          <SegmentedControl
            label="View"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'entry', label: 'Accounting entry' },
              { value: 'invoice', label: isNote(v) ? `${DOC_LABEL[v.docType!]} from Billing` : 'Invoice from Billing' },
              { value: 'why', label: 'Why each value' },
              { value: 'history', label: 'Approval & history' },
            ]}
          />
          {tab === 'entry' && <EntryTab v={v} editable={isMineV(v)} />}
          {tab === 'invoice' && <ReceivedInvoiceTab v={v} />}
          {tab === 'why' && <WhyTab v={v} />}
          {tab === 'history' && <HistoryTab v={v} />}
        </div>
        <ActionColumn v={v} checks={checks} onPreview={() => setPreview(true)} onDecide={(id, outcome) => setDeciding({ id, outcome })} onReturn={() => setReturning(true)} />
      </div>

      <Dialog open={preview} onClose={() => setPreview(false)} title={`${DOC_WORDS[c.docType]} ${v.number}`} description="Billing's invoice, as the customer got it (read-only). Use the browser's print to print it." width={1000} footer={<Button onClick={() => setPreview(false)}>Close</Button>}>
        <div className="inv-big">
          <InvoiceDoc v={v} ctx={ctx} />
        </div>
      </Dialog>
      <BuiltWith open={builtWith} onClose={() => setBuiltWith(false)} />
      <ReasonDialog
        open={deciding !== null}
        title={deciding ? `${ACTORS[v.approvals.find((x) => x.id === deciding.id)!.checker].name} ${deciding.outcome === 'send_back' ? 'sends the entry back' : 'rejects the entry'}` : ''}
        description={deciding?.outcome === 'reject' ? 'Mock only: you are playing the checker. Nothing is posted; Billing is told.' : 'Mock only: you are playing the checker. It comes back to you with this reason. Nothing is posted.'}
        chips={deciding?.outcome === 'reject' ? ['The invoice should not be booked: Billing to cancel it', 'Duplicate of an entry already posted'] : ['Use the suggested sales ledger', 'Wrong receivable ledger for this customer', 'The ledger change needs a reason']}
        action={deciding?.outcome === 'reject' ? 'Reject' : 'Send back'}
        onClose={() => setDeciding(null)}
        onConfirm={(reason) => {
          s.decide(v.id, deciding!.id, deciding!.outcome, { reason });
          setDeciding(null);
        }}
      />
      <ReasonDialog
        open={returning}
        title={`Return ${v.number} to Billing`}
        description="The invoice cannot be booked as it is. Nothing is posted; Billing corrects it (a credit note or a new invoice) and sends it again."
        chips={['Wrong customer on the invoice', 'GST does not match the place of supply', 'Wrong rate or quantity: Billing to correct']}
        action="Return to Billing"
        onClose={() => setReturning(false)}
        onConfirm={(reason) => {
          s.returnToBilling(v.id, reason);
          setReturning(false);
        }}
      />
    </div>,
    document.body,
  );
}

// ---------- the "?" and a labelled value ----------

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

/** A labelled value; "?" when the system filled it. The spec field id is kept as a tooltip (T24 §5), not shown. */
function F({ id, label, why, children, wide, missing }: { id: string; label: string; why?: Logic; children: ReactNode; wide?: boolean; missing?: boolean }) {
  return (
    <div className={`sv-f${wide ? ' sv-f--wide' : ''}${missing ? ' is-missing' : ''}`} title={`Field ${id}`}>
      <span className="sv-f__l">
        {label} <Why l={why} />
      </span>
      <span className="sv-f__v">{children}</span>
    </div>
  );
}

function Sec({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section className="ob-sec sv-sec" id={`sv-${id}`}>
      <header className="ob-sec__head">
        <h3>{/^\d$/.test(id) ? `${id} · ${title}` : title}</h3>
        {note && <span className="subtle small-note">{note}</span>}
      </header>
      {children}
    </section>
  );
}


/** Rev 3: the document the law calls it (A1), its own series. */
export const DOC_WORDS = { tax_invoice: 'Tax invoice', bill_of_supply: 'Bill of supply', export_invoice: 'Export invoice' } as const;
const KIND_WORDS: Record<string, string> = { goods: 'Goods', service: 'Service', charge: 'Charge (freight)', reimbursement: 'Pure-agent expense' };
const TAXABILITY_WORDS: Record<string, string> = { taxable: 'taxable', nil_rated: 'nil-rated', exempt: 'exempt', non_gst: 'non-GST' };

// ---------- The small invoice, top right ----------

/** Top right: the invoice as the customer will get it, small. Click to open it full size. */
function MiniInvoice({ v, onOpen }: { v: Voucher; onOpen: () => void }) {
  const { ctx } = useSalesCtx();
  return (
    <button className="sv-mini-inv" onClick={onOpen} aria-label="Open the invoice preview" title="Open the invoice preview">
      <span className="sv-mini-inv__frame" aria-hidden>
        <span className="sv-mini-inv__page">
          <InvoiceDoc v={v} ctx={ctx} />
        </span>
      </span>
      <span className="sv-mini-inv__label">
        <Eye size={13} aria-hidden /> {v.number ? 'View / print' : 'Live preview'} · click to open
      </span>
    </button>
  );
}

// ---------- The invoice from Billing (read-only) ----------

function ReceivedInvoiceTab({ v }: { v: Voucher }) {
  const { ctx } = useSalesCtx();
  const L = Object.fromEntries(logicOf(v, ctx).map((l) => [l.key, l])) as Record<string, Logic>;
  const a = accountOf(ctx, v.accountId);
  const p = partyOfAccount(ctx, v.accountId);
  const c = calcOf(v, ctx);
  const pl = placesOf(ctx, v);
  const br = issuerOf(v);
  const exp = c.kind !== 'domestic';
  const cur = c.currency === 'INR' ? '₹' : `${c.currency} `;
  return (
    <div className="sv-tab">
      <p className="sv-g30">
        Raised by Billing and handed to you on {fmtDateTime(v.arrivedAt)}. Read-only: if something on it is wrong, use <b>Return to Billing</b>; you book only its accounting entry.
      </p>
      <Sec id="i" title="The invoice">
        <div className="sv-grid">
          <F id="A6" label="Invoice no." why={L.number}>
            <span className="mono">{v.number}</span>
          </F>
          <F id="A7" label="Date">{fmtDate(v.date)}</F>
          <F id="A1" label="Document">{DOC_WORDS[c.docType]}</F>
          <F id="A3" label="Our GSTIN" why={L.issuer}>
            <span className="mono">{br.gstin}</span> · {br.code}
          </F>
          <F id="B1" label="Customer" why={L.party}>
            <strong>{p?.legalName ?? a?.name ?? '—'}</strong> <span className="subtle">{a?.accountId}</span>
          </F>
          <F id="B4" label="Customer GSTIN">
            <span className="mono">{c.kind === 'export' ? 'URP (overseas)' : pl.bill?.gstin?.value ?? 'unregistered (B2C)'}</span>
          </F>
          <F id="B8" label="Place of supply" why={L.pos}>
            {c.posName ? `${c.posName} (${c.posCode})` : '—'}
          </F>
          <F id="B9" label="GST" why={L.nature}>
            {exp ? (c.exportType === 'lut' ? 'Export under LUT: no GST' : 'Export with IGST') : c.intra ? 'CGST + SGST (same state)' : 'IGST (inter-state)'} · <span className="subtle">{c.supplyType}</span>
          </F>
          <F id="B14" label="Payment" why={L.due}>
            {v.settlement === 'credit' ? `On credit · ${a?.creditDays ?? 0} days · due ${fmtDate(dueDateOf(v, a))}` : `Paid now (${v.settlement === 'cash' ? 'cash' : 'UPI / card'}) · ${v.paymentRef}`}
          </F>
          <F id="G1" label="E-invoice (IRN)" why={L.irn}>
            {v.irn ? <span className="mono">{v.irn.slice(0, 16)}… · Ack {v.ackNo}</span> : <span className="subtle">not applicable</span>}
          </F>
          {v.ewbNo && <F id="F6" label="E-way bill">{`${v.ewbNo} · valid to ${fmtDate(v.ewbValidTo)}`}</F>}
          {v.thirdPartyShipTo && <F id="B6" label="Delivered to (third party)">{`${v.thirdPartyShipTo.name}, ${v.thirdPartyShipTo.city} (${STATES[v.thirdPartyShipTo.stateCode]?.name ?? ''})`}</F>}
          {exp && <F id="E1" label="Export">{`${c.exportType === 'lut' ? 'Under LUT' : 'With IGST'} · ${c.kind === 'export' ? countryName(p?.address.country) : 'SEZ'} · ${c.currency} at ₹${c.fx}`}</F>}
          {(v.advanceAmount ?? 0) > 0 && <F id="A17" label="Advance adjusted">{`${v.advanceRef} · ${rupees(v.advanceAmount ?? 0)}`}</F>}
        </div>
      </Sec>
      <Sec id="l" title="Lines">
        <table className="sv-items sv-lines">
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>HSN/SAC</th>
              <th className="num">Qty</th>
              <th className="num">Rate</th>
              <th className="num">Disc.</th>
              <th className="num">Taxable</th>
              <th className="num">GST</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r, i) => (
              <tr key={r.idx}>
                <td>{i + 1}</td>
                <td>
                  {r.name}
                  {r.kind !== 'goods' && <span className="sv-kind">{KIND_WORDS[r.kind]}{r.taxability !== 'taxable' ? ` · ${TAXABILITY_WORDS[r.taxability]}` : ''}</span>}
                </td>
                <td className="mono">{r.hsn || '—'}</td>
                <td className="num">
                  {r.qty} {r.uqc}
                </td>
                <td className="num">{`${cur}${c.currency === 'INR' ? r.rate : r.rate.toFixed(2)}`}</td>
                <td className="num">{r.discount ? rupees(r.discount) : '–'}</td>
                <td className="num">{rupees(r.amount)}</td>
                <td className="num">
                  {r.taxability !== 'taxable' ? '–' : c.exportType === 'lut' ? '0%' : `${r.gst}%`}
                  {r.tax > 0 && <span className="subtle small-note sv-block">{rupees(r.tax)}</span>}
                </td>
                <td className="num">{rupees(r.amount + r.tax)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Sec>
      <Sec id="t" title="Totals">
        <div className="sv-totals">
          <span className="sv-totals__k">Taxable value</span>
          <span className="sv-totals__v">{rupees(c.taxable)}</span>
          {c.exempt > 0 && (
            <>
              <span className="sv-totals__k">Nil-rated / exempt / non-GST</span>
              <span className="sv-totals__v">{rupees(c.exempt)}</span>
            </>
          )}
          {c.reimbursement > 0 && (
            <>
              <span className="sv-totals__k">Pure-agent expenses</span>
              <span className="sv-totals__v">{rupees(c.reimbursement)}</span>
            </>
          )}
          {c.intra ? (
            <>
              <span className="sv-totals__k">CGST</span>
              <span className="sv-totals__v">{rupees(c.cgst)}</span>
              <span className="sv-totals__k">SGST</span>
              <span className="sv-totals__v">{rupees(c.sgst)}</span>
            </>
          ) : (
            <>
              <span className="sv-totals__k">IGST</span>
              <span className="sv-totals__v">{rupees(c.igst)}</span>
            </>
          )}
          {isTcsCategory(a) && (
            <>
              <span className="sv-totals__k">TCS</span>
              <span className="sv-totals__v subtle">rate to confirm (G18)</span>
            </>
          )}
          {c.roundOff !== 0 && (
            <>
              <span className="sv-totals__k">Round off</span>
              <span className="sv-totals__v">{rupees(c.roundOff)}</span>
            </>
          )}
          {c.refund > 0 && (
            <>
              <span className="sv-totals__k">Less IGST paid by us, refund claimed</span>
              <span className="sv-totals__v">− {rupees(c.refund)}</span>
            </>
          )}
          <span className="sv-totals__k sv-totals__total">Amount payable by the customer</span>
          <span className="sv-totals__v sv-totals__total">{rupees(c.payable)}</span>
          <span className="sv-totals__span">{rupeesInWords(c.payable)}</span>
        </div>
        {exp && <p className="sv-endorse small-note">{c.exportType === 'lut' ? ENDORSEMENT.lut : ENDORSEMENT.igst}</p>}
      </Sec>
    </div>
  );
}

// ---------- Accounting entry tab: typed by the AE (REC, 27-Nov-2026) ----------

function EntryTab({ v, editable }: { v: Voucher; editable: boolean }) {
  const { s, ctx } = useSalesCtx();
  const lines = entryOf(v, ctx);
  const t = sum(lines);
  const a = accountOf(ctx, v.accountId);
  const ar = a ? receivableOf(a) : null;
  const customer = a && ar ? { name: a.name, ledger: `${ar.name} (${ar.code})` } : null;
  const doc = isNote(v) ? DOC_LABEL[v.docType!].toLowerCase() : 'invoice';
  return (
    <div className="sv-tab sv-entries">
      <p className="sv-g30">
        The entry for {doc} <b className="mono">{v.number}</b>, {v.edit ? 'as you changed it' : <>filled from the {doc}'s amounts on the usual ledgers</>}.
        It is your choice: change any ledger or amount, add or remove a line, or clear it and type your own, like Tally. Rajan checks it before it posts.
      </p>
      <DocAmounts v={v} editable={editable} />
      <table className="sv-post sv-post--entry sv-post--typed">
        <thead>
          <tr>
            <th>#</th>
            <th>Ledger</th>
            <th className="num">Dr ₹</th>
            <th className="num">Cr ₹</th>
            <th>Narration</th>
            {editable && <th aria-label="Remove" />}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <EntryRow key={l.id} v={v} l={l} n={i + 1} editable={editable} customer={customer} />
          ))}
          {!lines.length && (
            <tr>
              <td colSpan={editable ? 6 : 5} className="subtle small-note">
                No lines yet.{editable ? ' Add a line, pick its ledger, type its amount.' : ''}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>{!lines.length ? '' : t.dr === t.cr ? <span className="tone-success"><Check size={13} aria-hidden /> Dr = Cr</span> : <span className="tone-critical">Difference {rupees(Math.abs(t.dr - t.cr))}</span>}</td>
            <td className="num">{rupees(t.dr)}</td>
            <td className="num">{rupees(t.cr)}</td>
            <td colSpan={editable ? 2 : 1} />
          </tr>
        </tfoot>
      </table>
      {editable && (
        <span className="inline-gap">
          <button className="link-btn sv-add" onClick={() => s.addLine(v.id)}>
            <Plus size={13} aria-hidden /> Add a line
          </button>
          {v.edit && (
            <button className="link-btn sv-add" onClick={() => s.resetEntry(v.id)}>
              <Undo2 size={13} aria-hidden /> Back to the default entry
            </button>
          )}
          {lines.length > 0 && (
            <button className="link-btn sv-add" onClick={() => s.clearEntry(v.id)}>
              <X size={13} aria-hidden /> Clear and type my own
            </button>
          )}
          {customer && !lines.some((l) => l.ledger === 'party') && (
            <button className="link-btn sv-add" onClick={() => s.addLine(v.id, { ledger: 'party' })}>
              <Plus size={13} aria-hidden /> Add the customer line ({customer.name})
            </button>
          )}
        </span>
      )}
      <p className="subtle small-note">
        <Lock size={11} aria-hidden /> No posting rule in this app: the default is only the document's amounts on the usual ledgers; what you leave or type is what posts. The role app's own accounting layer will later propose the entry.
        The customer line names the customer's account (its receivable ledger, {ar ? `${ar.code}` : 'from its category'}); never a group ledger. The checks compare the
        entry with the {doc}'s amounts and warn Rajan of any difference; the cost of goods sold must equal inventory's (stock goes out on approval).
      </p>
      {!isNote(v) && <CostPanel v={v} editable={editable} />}
    </div>
  );
}

/** The document's amounts (calculated from its lines: an automatic calculation, not a rule), shown beside the typed entry. */
function DocAmounts({ v, editable }: { v: Voucher; editable: boolean }) {
  const { s, ctx } = useSalesCtx();
  const c = calcOf(v, ctx);
  const credit = v.docType === 'credit_note';
  const side = (x: number, customerSide: boolean) => (x ? `${rupees(x)} ${customerSide !== credit ? 'Dr' : 'Cr'}` : '—');
  const cost = isNote(v) ? null : costOfV(v, ctx, c);
  const costLines = editable ? costLinesOf(v, ctx) : [];
  const rows: [string, string][] = [
    [(v.settlement ?? 'credit') === 'credit' ? 'The customer (what is owed)' : `Paid at once (${v.settlement === 'cash' ? 'cash' : 'UPI / card'})`, side(c.payable, true)],
    ['Taxable value', side(c.taxable, false)],
    ...(c.exempt ? [['Nil-rated / exempt / non-GST', side(c.exempt, false)] as [string, string]] : []),
    ...(c.reimbursement ? [['Pure-agent expenses', side(c.reimbursement, false)] as [string, string]] : []),
    ...(c.cgst ? [['CGST', side(c.cgst, false)] as [string, string], ['SGST', side(c.sgst, false)] as [string, string]] : []),
    ...(c.igst ? [['IGST', side(c.igst, false)] as [string, string]] : []),
    ...(c.roundOff ? [['Round off', `${rupees(Math.abs(c.roundOff))} ${(c.roundOff > 0) !== credit ? 'Cr' : 'Dr'}`] as [string, string]] : []),
    ...(c.refund ? [['IGST we claim back', rupees(c.refund)] as [string, string]] : []),
    ...(cost && !cost.problems.length ? [['Cost of the goods (inventory)', `${rupees(cost.total)} (${COST_METHODS[cost.method].label})`] as [string, string]] : []),
  ];
  return (
    <section className="sv-docamounts" aria-label="The document's amounts">
      <div className="sv-entry-bar">
        <span>
          <strong>The {isNote(v) ? DOC_LABEL[v.docType!].toLowerCase() : 'invoice'}'s amounts</strong> (calculated from its lines; for reference)
        </span>
        <span className="inline-gap">
          {cost && !v.entryId && editable && (
            <SegmentedControl
              label="Costing method"
              value={s.costMethod}
              onChange={(m) => s.setCostMethod(m)}
              options={(Object.keys(COST_METHODS) as CostMethod[]).map((m) => ({ value: m, label: COST_METHODS[m].label }))}
            />
          )}
          {editable && costLines.length > 0 && (
            <Button size="sm" icon={Plus} onClick={() => s.addCostLines(v.id)}>
              {v.edit ? 'Refresh' : 'Add'} the cost from inventory ({costLines.length / 2} lot{costLines.length === 2 ? '' : 's'})
            </Button>
          )}
        </span>
      </div>
      <div className="sv-docamounts__grid">
        {rows.map(([k, val]) => (
          <div key={k} className="sv-docamounts__item">
            <span className="sv-docamounts__k">{k}</span>
            <span className="sv-docamounts__v">{val}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Rev 15: the cost of the goods sold, from inventory (FIFO or weighted average), shown with the lots it came from. */
function CostPanel({ v, editable }: { v: Voucher; editable: boolean }) {
  const { s, ctx } = useSalesCtx();
  const c = calcOf(v, ctx);
  const cost = costOfV(v, ctx, c);
  const goods = [...new Set(c.rows.filter((r) => r.kind === 'goods').map((r) => r.item))];
  if (!goods.length) return <p className="sv-g30">No goods on this invoice (services only): no stock goes out, so there is no cost of goods sold.</p>;
  const posted = !!v.entryId;
  const method: CostMethod = cost?.method ?? s.costMethod;
  return (
    <section className="sv-cost" aria-label="Cost of goods sold from inventory">
      <div className="sv-entry-bar">
        <span>
          <strong>Cost of goods sold</strong> (calculated from inventory): the invoice gives the item and the quantity; <b>inventory</b> gives the cost, never the selling price.
          {posted ? ` Posted by ${COST_METHODS[method].label}.` : ''}
        </span>
        {false && !posted && editable && (
          <SegmentedControl
            label="Costing method"
            value={s.costMethod}
            onChange={(m) => s.setCostMethod(m)}
            options={(Object.keys(COST_METHODS) as CostMethod[]).map((m) => ({ value: m, label: COST_METHODS[m].label }))}
          />
        )}
      </div>
      <p className="subtle small-note">
        {COST_METHODS[method].words}. A company setting (Ind AS 2: one method for items of the same kind); the demo lets you switch it to compare. LIFO is not allowed in India.
      </p>
      {cost?.problems.map((p) => (
        <Callout key={p.item} tone="critical" title={p.code === 'STOCK_SHORT' ? `Stock short: ${p.item} ${p.want} on the invoice, ${p.have} in stock` : `No stock record for ${p.item}`}>
          The cost cannot be found, so the entry cannot post (an exception, never a guess).
        </Callout>
      ))}
      {cost && !cost.problems.length && (
        <div className="sv-scroll">
        <table className="sv-post">
          <thead>
            <tr>
              <th>Item</th>
              <th>{method === 'fifo' ? 'Lot (oldest first)' : 'Lots'}</th>
              <th className="num">Qty</th>
              <th className="num">Cost / unit ₹</th>
              <th className="num">Cost ₹</th>
            </tr>
          </thead>
          <tbody>
            {cost.picks.map((p) => (
              <tr key={`${p.item}:${p.lot ?? 'avg'}`}>
                <td>
                  <span className="mono">{p.item}</span> <span className="subtle">{ITEMS[p.item]?.name}</span>
                </td>
                <td>
                  {p.lot ? <span className="mono">{p.lot}</span> : 'all lots: the average'}
                  {p.receivedOn ? <span className="subtle"> · received {fmtDate(p.receivedOn)}</span> : ''}
                </td>
                <td className="num">{p.qty.toLocaleString('en-IN')}</td>
                <td className="num">{rupees(p.unitCost)}</td>
                <td className="num">{rupees(p.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Dr Cost of Goods Sold · Cr Finished Goods: "Add the cost from inventory" puts these in the entry</td>
              <td className="num">{rupees(cost.total)}</td>
            </tr>
          </tfoot>
        </table>
        </div>
      )}
      <StockLots branch={v.branch} items={goods} />
    </section>
  );
}

/** inv.stock_lot, read-only: the inventory the cost comes from (a rough demo stub; costs illustrative). */
function StockLots({ branch, items }: { branch: string; items: string[] }) {
  const { s } = useSalesCtx();
  const rows = items.flatMap((i) => lotsOf(s.lots, branch, i));
  return (
    <details className="sv-lots">
      <summary>
        Stock lots now at {branch} (inventory, not accounting): {rows.length} lot{rows.length === 1 ? '' : 's'} · value {rupees(stockValue(s.lots.filter((l) => items.includes(l.item)), branch))}
      </summary>
      <div className="sv-scroll">
      <table className="sv-post">
        <thead>
          <tr>
            <th>Lot</th>
            <th>Item</th>
            <th>Received</th>
            <th className="num">Qty left</th>
            <th className="num">Cost / unit ₹</th>
            <th className="num">Value ₹</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.lotId}>
              <td className="mono">{l.lot}</td>
              <td className="mono">{l.item}</td>
              <td>{fmtDate(l.receivedOn)}</td>
              <td className="num">
                {l.qtyLeft.toLocaleString('en-IN')} <span className="subtle">of {l.qtyReceived.toLocaleString('en-IN')}</span>
              </td>
              <td className="num">{rupees(Math.round(l.unitCost * 100) / 100)}</td>
              <td className="num">{rupees(Math.round(l.qtyLeft * l.unitCost * 100) / 100)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="subtle small-note">
        Table inv.stock_lot (a stub: the inventory module owns it, T8 / S4). Quantities and batches: the scenario. Lot costs and dates: illustrative, so FIFO and weighted average can differ. Stock goes down when Rajan approves, in the same transaction as the entry.
      </p>
    </details>
  );
}

/** A ledger, chosen from a searchable list (typing filters by code or name); the customer's account is the first choice. */
function LedgerPicker({ value, onChange, label, customer }: { value: string; onChange: (k: string) => void; label: string; customer: { name: string; ledger: string } | null }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', off);
    return () => window.removeEventListener('mousedown', off);
  }, [open]);
  const t = q.trim().toLowerCase();
  const withCustomer = customer && (!t || customer.name.toLowerCase().includes(t) || 'customer'.startsWith(t));
  const list = [...(withCustomer ? ['party'] : []), ...rankLedgers(q)];
  const labelOf = (k: string) => (k === 'party' ? (customer ? `${customer.name} · ${customer.ledger}` : 'The customer') : ledgerLabel(k));
  const pick = (k: string) => {
    onChange(k);
    setOpen(false);
    setQ('');
    input.current?.blur();
  };
  return (
    <div className="sv-lp" ref={ref}>
      <input
        ref={input}
        className={`input sv-lp__in${!value ? ' is-bad' : ''}`}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={label}
        value={open ? q : value ? labelOf(value) : ''}
        placeholder={open ? 'Type a name or code…' : 'Choose a ledger…'}
        onFocus={() => {
          setOpen(true);
          setQ('');
          setHi(0);
        }}
        onChange={(e) => {
          setQ(e.target.value);
          setHi(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setOpen(true), setHi((h) => Math.min(h + 1, list.length - 1)));
          else if (e.key === 'ArrowUp') (e.preventDefault(), setHi((h) => Math.max(h - 1, 0)));
          else if (e.key === 'Enter' && open && list[hi]) (e.preventDefault(), pick(list[hi]));
          else if (e.key === 'Escape') (e.stopPropagation(), setOpen(false), input.current?.blur());
        }}
      />
      {open && (
        <ul className="sv-lp__list" role="listbox" aria-label={label}>
          {list.map((k, i) => (
            <li
              key={k}
              role="option"
              aria-selected={k === value}
              className={`sv-lp__opt${i === hi ? ' is-hi' : ''}${k === value ? ' is-on' : ''}`}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(k);
              }}
            >
              {k === 'party' ? (
                <>
                  <span className="mono sv-lp__code">{customer?.ledger.match(/\((\d+)\)/)?.[1] ?? ''}</span>
                  <span className="sv-lp__name">{customer?.name} (the customer)</span>
                  <span className="sv-lp__tag">customer</span>
                </>
              ) : (
                <>
                  <span className="mono sv-lp__code">{LEDGERS[k].code}</span>
                  <span className="sv-lp__name">{LEDGERS[k].name}</span>
                </>
              )}
            </li>
          ))}
          {list.length === 0 && <li className="sv-lp__none">No ledger matches "{q}"</li>}
        </ul>
      )}
    </div>
  );
}

function EntryRow({ v, l, n, editable, customer }: { v: Voucher; l: EntryLine; n: number; editable: boolean; customer: { name: string; ledger: string } | null }) {
  const { s } = useSalesCtx();
  const stock = l.item ? <span className="sv-rule-hint">{l.item} · {l.lot ? `lot ${l.lot}` : 'average'} · {l.qty} (from inventory)</span> : null;
  if (!editable)
    return (
      <tr>
        <td>{n}</td>
        <td>
          <strong>{l.dr ? 'Dr' : 'Cr'}</strong> {l.name} <span className="mono subtle">({l.code})</span>
          {stock}
        </td>
        <td className="num">{l.dr ? rupees(l.dr) : ''}</td>
        <td className="num">{l.cr ? rupees(l.cr) : ''}</td>
        <td className="subtle small-note">{l.reason}</td>
      </tr>
    );
  const amt = (k: 'dr' | 'cr') => <TextInput inputMode="decimal" value={l[k] || ''} aria-label={`${k === 'dr' ? 'Debit' : 'Credit'}, line ${n}`} onChange={(ev) => s.setLine(v.id, l.id, { [k]: num(ev.target.value) ?? 0 })} />;
  return (
    <tr>
      <td>{n}</td>
      <td>
        <LedgerPicker value={l.ledger} customer={customer} onChange={(k) => s.setLine(v.id, l.id, { ledger: k })} label={`Ledger, line ${n}`} />
        {stock}
      </td>
      <td className="num sv-qty">{amt('dr')}</td>
      <td className="num sv-qty">{amt('cr')}</td>
      <td>
        <TextInput value={l.reason ?? ''} placeholder="Narration (optional)" className="input sv-reason" onChange={(ev) => s.setLine(v.id, l.id, { reason: ev.target.value })} aria-label={`Narration, line ${n}`} />
      </td>
      <td className="sv-items__x">
        <button className="link-btn" onClick={() => s.removeLine(v.id, l.id)} aria-label={`Remove line ${n}`} title="Remove this line">
          <X size={14} />
        </button>
      </td>
    </tr>
  );
}

// ---------- Why each value (§9) ----------

function WhyTab({ v }: { v: Voucher }) {
  const { ctx } = useSalesCtx();
  const [view, setView] = useState<'business' | 'engineer'>('business');
  const [open, setOpen] = useState<string | null>(null);
  const rows = logicOf(v, ctx);
  return (
    <div className="sv-tab">
      <div className="sv-logic-bar">
        <SegmentedControl label="Explain for" value={view} onChange={setView} options={[{ value: 'business', label: 'The CA (business)' }, { value: 'engineer', label: 'The engineer (data · rule)' }]} />
        <span className="subtle small-note">Click a row for both answers.</span>
      </div>
      <table className="ob-sugg sv-logic">
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.key}>
              <tr className="sv-logic__row" onClick={() => setOpen(open === r.key ? null : r.key)}>
                <th scope="row">
                  <span className="sv-fid">{r.id}</span> {r.what}
                </th>
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

// ---------- Approval & history ----------

function HistoryTab({ v }: { v: Voucher }) {
  const { s, ctx } = useSalesCtx();
  const je = v.entryId ? s.journal.find((e) => e.id === v.entryId) : null;
  return (
    <div className="sv-tab">
      <Sec id="✓" title="Approval">
        {v.approvals.length === 0 ? (
          <p className="subtle small-note">
            On Submit: {routesOf(v, ctx).map((r) => `${r.label} → ${ACTORS[r.checker].name}`).join(' · ')}. He approves, sends back or rejects. You are the maker: you cannot decide it (K19).
          </p>
        ) : (
          <ul className="ob-changes">
            {v.approvals.map((x) => (
              <li key={x.id} className="ob-change">
                <span className="ob-change__main">
                  <span className="ob-change__title">
                    {x.label} → {who(x.checker)}
                  </span>
                  {x.entryDiff && <span className="tone-warning small-note">{x.entryDiff}</span>}
                  <span className="subtle small-note">
                    {x.decidedAt ? fmtDateTime(x.decidedAt) : 'Waiting'}
                    {x.reason ? ` · "${x.reason}"` : ''}
                  </span>
                </span>
                <StatusPill tone={x.status === 'approved' ? 'success' : x.status === 'pending' ? 'warning' : 'critical'}>{x.status === 'pending' ? 'Waiting' : x.status === 'approved' ? 'Approved' : x.status === 'sent_back' ? 'Sent back' : 'Rejected'}</StatusPill>
              </li>
            ))}
          </ul>
        )}
        {je && (
          <p className="small-note">
            Journal {je.id} · {je.rule}
          </p>
        )}
      </Sec>
      <div className="sv-two">
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
    </div>
  );
}

function stepsOf(v: Voucher): Step[] {
  const steps: Step[] = [
    { label: `${isNote(v) ? DOC_LABEL[v.docType!] : 'Invoice'} ${v.number} received from ${ACTORS.billing.name}`, at: v.arrivedAt, state: 'done' },
    { label: `${ACTORS[ME].name} books the entry and submits`, at: v.submittedAt ?? v.returned?.at, state: isMineV(v) ? 'current' : 'done' },
  ];
  if (v.status === 'returned') {
    steps.push({ label: `Returned to ${ACTORS.billing.name}`, detail: v.returned?.reason, at: v.returned?.at, state: 'done' });
    return steps;
  }
  for (const x of v.approvals) steps.push({ label: `${ACTORS[x.checker].name}: ${x.label.toLowerCase()}`, at: x.decidedAt, detail: x.status === 'sent_back' ? `Sent back: ${x.reason}` : x.status === 'rejected' ? `Rejected: ${x.reason}` : x.entryDiff, state: x.status === 'pending' ? (v.status === 'submitted' ? 'current' : 'todo') : 'done' });
  if (v.status === 'rejected') return steps;
  steps.push({ label: 'Posted: the journal entry', detail: v.entryId, at: v.postedAt, state: v.status === 'posted' ? 'done' : 'todo' });
  return steps;
}

// ---------- Action column (4/16, pinned) ----------

function ActionColumn({ v, checks, onPreview, onDecide, onReturn }: { v: Voucher; checks: SCheck[]; onPreview: () => void; onDecide: (id: string, outcome: Exclude<Outcome, 'approve'>) => void; onReturn: () => void }) {
  const { s, ctx } = useSalesCtx();
  const editable = isMineV(v);
  const blocking = stops(checks);
  const warns = checks.filter((x) => x.level === 'warn');
  const oks = checks.filter((x) => x.level === 'ok');
  const c = calcOf(v, ctx);
  const pending = v.approvals.find((x) => x.status === 'pending');
  const item = (x: SCheck) => (
    <li key={`${x.k}${x.title}`} title={x.detail}>
      {x.k && <span className="sv-kid">{x.k}</span>} {x.title}
      {x.detail && <span className="sv-check__d">{x.detail}</span>}
      {x.code && x.level !== 'ok' && <span className="sv-check__code mono">{x.code}</span>}
    </li>
  );
  return (
    <aside className="ob-side sv-full__side">
      <div className="ob-side__scroll">
        <MiniInvoice v={v} onOpen={onPreview} />
        {v.status === 'draft' && v.decisionReason && <Callout tone="critical" title="Sent back by Rajan">{v.decisionReason}. Fix the entry and send it again.</Callout>}
        {v.status === 'rejected' && <Callout tone="critical" title="Rejected">{v.decisionReason}. Nothing posted.</Callout>}
        {v.status === 'returned' && <Callout tone="info" title={`Returned to ${ACTORS.billing.name}`}>"{v.returned?.reason}". Nothing posted; Billing sends a corrected invoice.</Callout>}
        {v.status === 'posted' && (
          <Callout tone="success" title={`Posted ${v.entryId}`}>
            The entry for {v.number} is in the books. Final: a mistake is put right by Billing's credit note (T25), never by editing.
          </Callout>
        )}
        {v.status === 'submitted' && pending && (
          <Callout tone="info" title={`With ${who(pending.checker)}`}>
            Since {fmtDateTime(v.submittedAt!)}.{pending.entryDiff ? ` He sees: ${pending.entryDiff}.` : ''} He approves (the entry posts), sends it back or rejects it.
            <span className="ob-sim sv-sim">
              <button className="ob-sim__btn" onClick={() => s.decide(v.id, pending.id, 'approve')} title="Mock only: play the checker">
                <CheckCheck size={14} aria-hidden /> {ACTORS[pending.checker].name} approves
              </button>
              <button className="ob-sim__btn" onClick={() => onDecide(pending.id, 'send_back')} title="Mock only: play the checker">
                <CornerUpLeft size={14} aria-hidden /> sends back
              </button>
              <button className="ob-sim__btn" onClick={() => onDecide(pending.id, 'reject')} title="Mock only: play the checker">
                <Ban size={14} aria-hidden /> rejects
              </button>
            </span>
          </Callout>
        )}
        {editable && (
          <>
            <p className="ob-aside__title">
              Checks {blocking.length ? <span className="tone-critical">· {blocking.length} to fix</span> : <span className="tone-success">· ready to submit</span>}
            </p>
            {blocking.length > 0 && (
              <>
                <p className="ob-aside__sub tone-critical">To fix before submit</p>
                <ul className="ob-plain ob-plain--tight sv-checks">{blocking.map(item)}</ul>
              </>
            )}
            {warns.length > 0 && (
              <>
                <p className="ob-aside__sub tone-warning">Warnings (Rajan sees them)</p>
                <ul className="ob-plain ob-plain--tight sv-checks">{warns.map(item)}</ul>
              </>
            )}
            <details className="ob-checkgroup">
              <summary>
                <span>Met ({oks.length})</span>
                <span className="tone-success">✓</span>
              </summary>
              <ul className="ob-plain ob-plain--tight sv-checks">{oks.map(item)}</ul>
            </details>
            <ChangeSummary v={v} />
          </>
        )}
        {!editable && (
          <>
            <p className="ob-aside__title">Progress</p>
            <StatusSteps steps={stepsOf(v)} />
          </>
        )}
      </div>
      {editable && (
        <div className="ob-side__actions">
          {!v.accountId && v.pendingCustomer ? (
            <>
              <Button variant="primary" icon={UserPlus} block onClick={() => s.holdForCustomer(v.id, true)}>
                Create the customer (T12) →
              </Button>
              <span className="subtle small-note">The T12 form opens filled from this document; it comes back to book once the customer is active.</span>
            </>
          ) : (
            <>
              <Button variant="primary" icon={Send} block disabled={blocking.length > 0} onClick={() => s.submit(v.id)}>
                {v.submittedAt ? 'Send again to Rajan' : 'Submit to Rajan'}
              </Button>
              <span className="subtle small-note">{blocking.length ? 'Fix the items in red first.' : `Goes to Rajan · ${rupees(c.payable)}`}</span>
            </>
          )}
          <Button icon={Save} block disabled={!v.dirty} onClick={() => s.saveDraft(v.id)}>
            Save draft
          </Button>
          {!v.submittedAt && (
            <button className="link-btn ob-discard" onClick={onReturn}>
              <Undo2 size={12} aria-hidden /> The {isNote(v) ? DOC_LABEL[v.docType!].toLowerCase() : 'invoice'} is wrong: return to Billing
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

/** What Submit sends, and what happens on approval (cmp.change-summary). */
function ChangeSummary({ v }: { v: Voucher }) {
  const { ctx } = useSalesCtx();
  const c = calcOf(v, ctx);
  const r = routesOf(v, ctx)[0];
  const lines = entryOf(v, ctx);
  return (
    <div className="ob-summary">
      <p className="ob-aside__sub">What Submit sends</p>
      <ul className="ob-plain ob-plain--tight">
        <li>
          <strong>Rajan</strong> <span className="subtle">(Accounts Manager)</span>: {r.label} · {rupees(c.payable)}
        </li>
      </ul>
      <p className="subtle small-note">
        When he approves (every check again): the journal entry posts as typed: {lines.map((l) => `${l.dr ? 'Dr' : 'Cr'} ${l.code}`).join(' · ')}{v.settlement === 'credit' ? `; the customer owes it, due ${fmtDate(dueDateOf(v, accountOf(ctx, v.accountId)))}` : ''}.
      </p>
    </div>
  );
}

// ---------- Built with ----------

function BuiltWith({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sp = T24_SPEC;
  const n = (b: string) => sp.fields.filter((f) => f[2] === b).length;
  return (
    <Dialog open={open} onClose={onClose} width={980} title={`Built with · ${sp.code} ${sp.name}`} description="Sunny's task-to-screen formula, checked against docs/sales/sales_engine/task_list/T24_sales_voucher_entry.md." footer={<Button onClick={onClose}>Close</Button>}>
      <div className="ob-built">
        <p>
          <strong>Pattern</strong> {sp.pattern.fd} {sp.pattern.name} · <em>{sp.pattern.variant}</em>. {sp.pattern.reason}
        </p>
        <h4>Regions</h4>
        <table className="ob-sugg">
          <tbody>
            {sp.regions.map((x) => (
              <tr key={x.id}>
                <th scope="row">{x.id}</th>
                <td>{x.width}</td>
                <td>{x.holds}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4>Steps (task card)</h4>
        <table className="ob-sugg">
          <tbody>
            {sp.steps.map(([id, step, where]) => (
              <tr key={id}>
                <th scope="row">
                  {id} · {step}
                </th>
                <td colSpan={2}>{where}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4>
          Fields ({sp.fields.length}): {n('built')} built · {n('partly')} partly · {n('not built')} not built · {n('removed')} removed (rev 5)
        </h4>
        <table className="ob-sugg">
          <tbody>
            {sp.fields.map(([id, name, b, where]) => (
              <tr key={id}>
                <th scope="row">
                  <span className="sv-fid">{id}</span> {name}
                </th>
                <td>
                  <StatusPill tone={b === 'built' ? 'success' : b === 'partly' ? 'warning' : b === 'removed' ? 'normal' : 'critical'}>{b}</StatusPill>
                </td>
                <td className="subtle">{where}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4>Checks</h4>
        <p className="small-note">{sp.checks.map(([k, b]) => `${k} ${b}`).join(' · ')}</p>
      </div>
    </Dialog>
  );
}

export function PendingCustomer({ v }: { v: Voucher }) {
  const s = useSales();
  const p = v.pendingCustomer!;
  return (
    <Callout tone="critical" title={`Customer not registered: ${p.name}${p.gstin ? ` · ${p.gstin}` : ''}`}>
      {isMineV(v) && (
        <Button size="sm" variant="primary" icon={UserPlus} onClick={() => s.holdForCustomer(v.id, true)}>
          Create the customer (T12, prefilled) →
        </Button>
      )}
    </Callout>
  );
}
