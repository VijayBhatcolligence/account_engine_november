// The mock backend of T24 Sales voucher entry. It shares the app's clock, backend log, notices and navigation with
// onboarding (useOnboarding), and reads the customer accounts onboarding created (T12). Nothing is sent anywhere.
//
// Rev 6 (18-Nov, Vijay): the Accounts Executive does not raise the invoice. Billing raises it (number, IRN, lines, GST)
// and hands it over; the AE books its accounting entry:
//   received (draft) ──Submit (AE)──▶ submitted ──DecideSalesVoucher (Rajan, not the maker)──┬─ approve ▶ PostJournalEntry ▶ posted
//                                                                                              ├─ send_back (reason) ▶ draft
//                                                                                              └─ reject (reason) ▶ rejected
//   received (draft) ──ReturnToBilling (AE, reason)──▶ returned (the invoice cannot be booked as it is)
//   Approve re-runs every check (the customer or the period may have changed since Submit), then posts in one transaction,
//   as Manoj's purchase voucher. The invoice itself (lines, IRN, e-way bill, its number) is Billing's: read-only here.
//
// Rev 18 (25-Nov, T25 / T26): Billing also hands over CREDIT and DEBIT NOTES against a posted invoice (the same voucher, a type
//   column; the same flow: book → Rajan (+ Venkat for a scheme discount, + Usha above ₹1,00,000) → posts). A return note waits
//   for Stores' Sales Return Receipt (D-05); who posts the stock back is the book's setting returnStock: stores_receipt (the
//   receipt posts Dr Finished Goods · Cr COGS, the CA's E1) or with_credit_note (the note does).

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { inr } from '../domain/money';
import { ACTORS, ME } from '../onboarding/catalogue';
import { useOnboarding } from '../onboarding/store';
import { accountOf, calcOf, checksOf, costLinesOf, defaultEntryOf, DOC_LABEL, einvoiceRequired, entryOf, isNote, nextNumber, NOTE_REASON, routesOf, seriesOf, stops, sum, toJournal, type SalesCtx } from './rules';
import { irnOf, received, seedSales, type InvoiceSpec } from './seed';
import { returnReceiptPostingFor } from './engine';
import { ITEMS } from './catalogue';
import { STATES } from '../onboarding/catalogue';
import { COST_METHODS, issueOf, issueStock, seedLots, type CostMethod, type StockLot } from './inventory';
import type { Account, ActorKey } from '../onboarding/types';
import type { DocType, EditLine, InvoiceLine, JournalEntry, NoteReason, Outcome, ReturnStockPosting, StockReturn, Voucher } from './types';

interface Data {
  vouchers: Voucher[];
  journal: JournalEntry[];
  /** Rev 15: inv.stock_lot (inventory, a demo stub) and the company's costing method (FIFO or weighted average). */
  lots: StockLot[];
  costMethod: CostMethod;
  /** Rev 18: Stores' return receipts, and the book's setting: who posts the stock back on a return. */
  returns: StockReturn[];
  returnStock: ReturnStockPosting;
  /** Rev 21: uploaded documents whose customer is not registered: OUTSIDE the voucher list (no draft without a customer), each
   *  waiting for its T12 request; back in To book, by itself, once the customer is active. */
  held: Voucher[];
}

/** What Billing hands over for a note (mock: the facts its event carries). */
export interface NoteSpec {
  invoiceId: string;
  docType: Exclude<DocType, 'invoice'>;
  reason: NoteReason;
  lines: InvoiceLine[];
  schemeRef?: string;
}
/** What Stores records when goods come back (D-05). */
export interface ReturnSpec {
  invoiceId: string;
  item: string;
  lot: string;
  qty: number;
  condition: StockReturn['condition'];
}

export interface DecideOpts {
  reason?: string;
  /** Mock only: who presses the button (K19: the maker may not decide). Default: the checker. */
  by?: ActorKey;
}

interface State extends Data {
  /** Mock only: Billing hands over an invoice it raised (numbered, IRN registered). Returns the voucher id. */
  receiveInvoice: (spec: InvoiceSpec) => string | null;
  /** REC: the AE types the entry, like Tally. A new line (a ledger, Dr or Cr); 'party' = the customer's account. */
  addLine: (id: string, line?: Partial<Omit<EditLine, 'id'>>) => void;
  setLine: (id: string, lineId: string, patch: Partial<Omit<EditLine, 'id'>>) => void;
  removeLine: (id: string, lineId: string) => void;
  /** The cost of the goods from inventory (an automatic calculation), added as lines; replaces earlier cost lines. */
  addCostLines: (id: string) => void;
  /** Back to the default entry (filled from the document's amounts). */
  resetEntry: (id: string) => void;
  /** Clear every line: the AE types his own. */
  clearEntry: (id: string) => void;
  saveDraft: (id: string) => void;
  submit: (id: string) => void;
  /** DecideSalesVoucher: approve (posts) · send_back (reason) · reject (reason). Returns false when it did not happen. */
  decide: (id: string, approvalId: string, outcome: Outcome, opts?: DecideOpts) => boolean;
  /** The invoice cannot be booked as it is (wrong customer, wrong GST…): back to Billing with a reason. */
  returnToBilling: (id: string, reason: string) => void;
  /** Rev 15: the company's costing method (a setting; the demo shows it on the voucher). */
  setCostMethod: (m: CostMethod) => void;
  /** Rev 18 · mock: Billing hands over a credit or debit note against a posted invoice. Returns the voucher id. */
  receiveNote: (spec: NoteSpec) => string | null;
  /** Rev 18 · mock: Stores records goods returned (D-05). Returns the receipt id, or null (refused: Part C). */
  recordReturn: (spec: ReturnSpec) => string | null;
  /** Rev 18: the book's setting, who posts the stock back on a return. */
  setReturnStock: (m: ReturnStockPosting) => void;
  /** Rev 21 · the document's customer is not registered: a T12 request prefilled from it (the Dashboard task), and the document
   *  leaves the voucher list to wait for it. go: open the request now (else it waits on the Dashboard). Returns the request id. */
  holdForCustomer: (voucherId: string, go?: boolean) => string | null;
  /** A waiting voucher gets its customer once one with that GSTIN / PAN / name exists. */
  linkPendingCustomers: () => void;
  reset: () => void;
}

export const isMineV = (v: Voucher) => v.status === 'draft';
export const isWithOthersV = (v: Voucher) => v.status === 'submitted';
export const isDoneV = (v: Voucher) => !isMineV(v) && !isWithOthersV(v);
export const voucherOf = (s: Pick<Data, 'vouchers'>, id: string | null | undefined) => s.vouchers.find((v) => v.id === id) ?? null;
export const titleOfV = (v: Voucher, ctx: Pick<SalesCtx, 'accounts'>) => accountOf(ctx, v.accountId)?.name ?? (v.pendingCustomer ? `${v.pendingCustomer.name} (not registered)` : 'Sales invoice');

const API = '/api/v1/sales-vouchers';
const app = () => useOnboarding.getState();

/** The context the rules read: onboarding's accounts and parties + this store's data. */
export const ctxOf = (s: Data): SalesCtx => {
  const a = app();
  return { accounts: a.accounts, parties: a.parties, requests: a.requests, journal: s.journal, vouchers: s.vouchers, now: a.now, lots: s.lots, costMethod: s.costMethod, returns: s.returns };
};

const nextNo = (ids: string[], prefix: string, start: number) => Math.max(start, ...ids.filter((x) => x.startsWith(prefix)).map((x) => Number(x.slice(prefix.length)) || 0)) + 1;
const nextJe = (s: Data) => `JE-${String(nextNo(s.journal.map((e) => e.id), 'JE-', 0)).padStart(6, '0')}`;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const nextVoucherId = (s: Data) => `SV-${String(nextNo([...s.vouchers, ...(s.held ?? [])].map((v) => v.id), 'SV-', 0)).padStart(4, '0')}`;

// ---------------------------------------------------------------- the T12 form filled from a document (rev 21)
const cityOf = (address: string | null | undefined) => address?.split(',').map((x) => x.trim()).find((x) => /^[A-Za-z .]+\s*\d{6}$/.test(x))?.replace(/\s*\d{6}$/, '') ?? '';

export const useSales = create<State>()(
  persist(
    immer((set, get) => {
      /** Mine and editable (the entry only): every edit goes through this. */
      const edit = (id: string, fn: (v: Voucher, s: Data) => void) =>
        set((s) => {
          const v = voucherOf(s, id);
          if (!v || !isMineV(v)) return;
          fn(v, s);
          v.dirty = true;
        });

      /** Post: PostJournalEntry, the entry as booked (rule version + the AE's choices), lines 1:1. */
      const postEntry = (s: Data, v: Voucher, approvedBy: ActorKey) => {
        const ctx = ctxOf(s);
        const now = app().bump(1);
        const lines = entryOf(v, ctx);
        const c = calcOf(v, ctx);
        const a = accountOf(ctx, v.accountId)!;
        const t = sum(lines);
        const entryId = nextJe(s);
        const hasCost = lines.some((l) => l.role === 'cost');
        const note = isNote(v);
        // An invoice's cost lines take the goods out of stock; a return note's stock lines do not move it (Stores' receipt did).
        if (hasCost && !note) issueStock(s.lots, s.costMethod, v.branch, issueOf(c.rows));
        const ruleName = `Typed by ${ACTORS[v.maker].name}, approved by ${ACTORS[approvedBy].name}${hasCost && !note ? ` · cost from inventory (${COST_METHODS[s.costMethod].label})` : ''}`;
        if (note && v.returnId) {
          const rr = s.returns.find((x) => x.id === v.returnId);
          if (rr) rr.noteId = v.id;
        }
        s.journal.push({
          id: entryId, voucherNo: v.number!, voucherId: v.id, kind: 'sales', branch: v.branch, date: v.date, narration: v.narration, lines: toJournal(lines, a.accountId), rule: ruleName, postedAt: now, postedBy: 'system',
          ...(hasCost ? { costMethod: s.costMethod } : {}),
        });
        Object.assign(v, { entryId, status: 'posted', postedAt: now });
        const r = app().record;
        r('db', 'system', 'INSERT fin.journal_entry + journal_line', `${entryId} · voucher_type sales · source ${v.id} (${v.number}) · ${v.branch} · posting date ${v.date} · Dr = Cr ${inr(t.dr)} · the entry as typed: ${lines.map((l) => `${l.dr ? 'Dr' : 'Cr'} ${l.code}`).join(' · ')}`);
        if (hasCost && note) r('db', 'system', 'the stock back', `${lines.filter((l) => l.role === 'cost' && l.dr).map((l) => `${l.item} ${l.qty} back at ${inr(l.dr)}`).join(' · ')} · posted by the note (the book's setting); the lots moved at Stores' receipt`);
        if (hasCost && !note) {
          const cl = lines.filter((l) => l.role === 'cost' && l.cr);
          r('db', 'system', 'UPDATE inv.stock_lot', `${COST_METHODS[s.costMethod].label}: ${cl.map((l) => `${l.item} ${l.qty}${l.lot ? ` from ${l.lot}` : ''} ${inr(l.cr)}`).join(' · ')} · stock goes down in the same transaction as the entry`);
        }
        if ((v.settlement ?? 'credit') === 'credit') r('db', 'system', 'open item', `${a.accountId} · ${v.number} · ${inr(c.payable)} due ${addDays(v.date, a.creditDays ?? 0)}: the journal line naming the account`);
        v.history.push({ at: now, by: 'system', text: `Posted ${entryId} (the entry as typed, ${lines.length} lines)` });
        app().notify({ tone: 'success', title: `Posted ${note ? `${DOC_LABEL[v.docType!].toLowerCase()} ` : ''}${v.number}: ${a.name}`, body: `${inr(c.payable)} · journal ${entryId}.`, voucherId: v.id });
      };

      return {
        ...seedSales(),
        lots: seedLots(),
        costMethod: 'fifo' as CostMethod,
        returns: [] as StockReturn[],
        returnStock: 'stores_receipt' as ReturnStockPosting,
        held: [] as Voucher[],

        receiveInvoice: (spec) => {
          const s = get();
          const ctx = ctxOf(s);
          const a = accountOf(ctx, spec.accountId);
          if (!a || a.side !== 'receivable') return null;
          const id = nextVoucherId(s);
          const at = app().bump(2);
          const v = received({ id, at, account: a, ctx, spec, used: s.vouchers.map((x) => x.number) });
          set((d) => {
            d.vouchers.push(v);
          });
          app().record('event', 'billing', 'sales.invoice.issued', `${v.number} · ${a.name} · handed to the Accounts Executive → voucher ${id} (to book)`);
          return id;
        },

        addLine: (id, line = {}) =>
          edit(id, (v, s) => {
            v.edit ??= { lines: defaultEntryOf(v, ctxOf(s)), by: ME, at: app().now };
            const n = nextNo(v.edit.lines.map((x) => x.id), 'l:', 0);
            v.edit.lines.push({ id: `l:${n}`, ledger: '', dr: 0, cr: 0, reason: '', ...line });
          }),
        setLine: (id, lineId, patch) =>
          edit(id, (v, s) => {
            v.edit ??= { lines: defaultEntryOf(v, ctxOf(s)), by: ME, at: app().now };
            const l = v.edit.lines.find((x) => x.id === lineId);
            if (!l) return;
            Object.assign(l, patch);
            // a line is either Dr or Cr: typing one clears the other
            if (patch.dr) l.cr = 0;
            if (patch.cr) l.dr = 0;
          }),
        removeLine: (id, lineId) =>
          edit(id, (v, s) => {
            v.edit ??= { lines: defaultEntryOf(v, ctxOf(s)), by: ME, at: app().now };
            v.edit.lines = v.edit.lines.filter((x) => x.id !== lineId);
          }),
        resetEntry: (id) =>
          edit(id, (v) => {
            delete v.edit;
          }),
        clearEntry: (id) =>
          edit(id, (v) => {
            v.edit = { lines: [], by: ME, at: app().now };
          }),
        addCostLines: (id) =>
          edit(id, (v, s) => {
            const add = costLinesOf(v, ctxOf(s));
            v.edit ??= { lines: defaultEntryOf(v, ctxOf(s)), by: ME, at: app().now };
            v.edit.lines = [...v.edit.lines.filter((x) => !x.item), ...add];
          }),

        saveDraft: (id) => {
          if (!voucherOf(get(), id)) return;
          app().bump(1);
          app().record('api', ME, `PUT ${API}/${id}`, 'entry saved (fin.sales_voucher stage draft, its lines replaced) · checks returned');
          set((s) => {
            voucherOf(s, id)!.dirty = false;
          });
        },

        submit: (id) =>
          set((s) => {
            const v = voucherOf(s, id);
            if (!v || !isMineV(v)) return;
            const ctx = ctxOf(s);
            if (stops(checksOf(v, ctx)).length) return;
            const now = app().bump(2);
            const again = !!v.submittedAt;
            const routes = routesOf(v, ctx);
            const n = v.approvals.length;
            v.approvals = [...v.approvals.filter((x) => x.status !== 'pending'), ...routes.map((r, i) => ({ id: `APR-${v.id.slice(3)}-${n + i + 1}`, why: r.why, label: r.label, checker: r.checker, status: 'pending' as const }))];
            v.status = 'submitted';
            v.submittedAt = now;
            v.dirty = false;
            app().record('api', ME, `POST ${API}/${v.id}/submit`, `all Stop checks clear · Dr = Cr ${inr(sum(entryOf(v, ctx)).dr)}`);
            v.history.push({ at: now, by: ME, text: `${again ? 'Sent again' : 'Entry booked and sent'} to ${routes.map((r) => ACTORS[r.checker].name).join(', ')}` });
          }),

        decide: (id, approvalId, outcome, opts = {}) => {
          let done = false;
          set((s) => {
            const v = voucherOf(s, id);
            const ap = v?.approvals.find((x) => x.id === approvalId);
            if (!v || !ap || ap.status !== 'pending' || v.status !== 'submitted') return;
            const by = opts.by ?? ap.checker;
            if (by === v.maker) {
              app().record('api', by, `POST ${API}/${v.id}/decide`, '→ 403 MAKER_MAY_NOT_DECIDE: the maker may not decide his own voucher (K19)');
              return;
            }
            const reason = opts.reason?.trim();
            if (outcome !== 'approve' && !reason) {
              app().record('api', by, `POST ${API}/${v.id}/decide`, '→ 422 NO_REASON_GIVEN: say why, so the Accounts Executive can act on it');
              return;
            }
            if (outcome === 'approve') {
              const found = stops(checksOf(v, ctxOf(s)));
              if (found.length) {
                app().record('api', by, `POST ${API}/${v.id}/decide`, `{outcome: approve} → 422 APPROVAL_REFUSED: ${found.map((f) => f.code ?? f.k).join(', ')} (checked again at approval; nothing saved)`);
                app().notify({ tone: 'critical', title: `${v.number} cannot be approved now`, body: found.map((f) => f.title).join(' · '), voucherId: v.id });
                return;
              }
            }
            const now = app().bump(15);
            ap.status = outcome === 'approve' ? 'approved' : outcome === 'send_back' ? 'sent_back' : 'rejected';
            ap.decidedAt = now;
            ap.reason = reason;
            app().record('api', ap.checker, `POST ${API}/${v.id}/decide`, `{outcome: ${outcome}${reason ? `, reason: "${reason}"` : ''}}`);
            done = true;
            if (outcome === 'send_back') {
              v.status = 'draft';
              v.decisionReason = `${ACTORS[ap.checker].name}: ${reason}`;
              v.history.push({ at: now, by: ap.checker, text: `Sent back: "${reason}"` });
              app().notify({ tone: 'critical', title: `Sent back by ${ACTORS[ap.checker].name}: ${v.number}`, body: reason ?? '', voucherId: v.id });
              return;
            }
            if (outcome === 'reject') {
              v.status = 'rejected';
              v.decisionReason = `${ACTORS[ap.checker].name}: ${reason}`;
              v.history.push({ at: now, by: ap.checker, text: `Rejected: "${reason}". Nothing posted` });
              app().notify({ tone: 'critical', title: `Rejected by ${ACTORS[ap.checker].name}: ${v.number}`, body: reason ?? '', voucherId: v.id });
              return;
            }
            v.decisionReason = undefined;
            if (v.approvals.some((x) => x.status === 'pending')) return;
            postEntry(s, v, ap.checker);
          });
          return done;
        },

        returnToBilling: (id, reason) =>
          set((s) => {
            const v = voucherOf(s, id);
            if (!v || !isMineV(v) || !reason.trim()) return;
            const now = app().bump(2);
            v.status = 'returned';
            v.returned = { reason, at: now };
            v.history.push({ at: now, by: ME, text: `Returned to Billing: "${reason}". Nothing posted` });
            app().record('api', ME, `POST ${API}/${v.id}/return`, `{reason: "${reason}"} · Billing corrects the invoice (a credit note or a new invoice) and sends it again`);
          }),

        setCostMethod: (m) => {
          if (get().costMethod === m) return;
          set((s) => {
            s.costMethod = m;
          });
          app().record('api', ME, 'PUT /api/v1/settings/costing-method', `{method: ${m}} · ${COST_METHODS[m].words} (a company setting; Ind AS 2: the same method for items of the same kind)`);
        },

        receiveNote: (spec) => {
          const s = get();
          const inv = s.vouchers.find((x) => x.id === spec.invoiceId);
          if (!inv || isNote(inv) || inv.status !== 'posted') return null;
          const ctx = ctxOf(s);
          const id = nextVoucherId(s);
          const at = app().bump(2);
          const goodsGst = Math.max(0, ...inv.lines.filter((l) => l.kind === 'goods').map((l) => ITEMS[l.item]?.gst ?? 0)) || undefined;
          const v: Voucher = {
            ...JSON.parse(JSON.stringify(inv)),
            id, number: null, status: 'draft', maker: ME, arrivedAt: at, date: at.slice(0, 10), lines: spec.lines,
            approvals: [], history: [], docType: spec.docType, againstId: inv.id, noteReason: spec.reason, chargeGst: goodsGst,
            edit: undefined, decisionReason: undefined, returned: undefined, submittedAt: undefined, postedAt: undefined, entryId: undefined,
            irn: undefined, ackNo: undefined, ackAt: undefined, ewbNo: undefined, ewbValidTo: undefined, dirty: undefined,
            transport: { vehicleNo: '', distanceKm: null },
          };
          if (spec.schemeRef) v.schemeRef = spec.schemeRef;
          if (spec.reason === 'return') {
            v.returnStock = s.returnStock;
            // A receipt already recorded for this invoice and item, not yet used by a note (else the note waits: C-17).
            const rr = s.returns.find((x) => x.invoiceId === inv.id && !x.noteId && spec.lines.some((l) => l.item === x.item));
            // The receipt decides who posts the stock back: if it already posted it, the note must not post it again.
            if (rr) Object.assign(v, { returnId: rr.id, returnStock: rr.entryId ? 'stores_receipt' : 'with_credit_note' });
          }
          const c = calcOf(v, ctx);
          v.number = nextNumber(s.vouchers.map((x) => x.number), seriesOf(v, c));
          if (einvoiceRequired(c)) {
            v.irn = irnOf(v.number);
            v.ackNo = `1126${String(Date.parse(`${at}:00Z`) % 1e11).padStart(11, '0')}`;
            v.ackAt = at;
          }
          v.narration = `${DOC_LABEL[spec.docType]} against ${inv.number}: ${NOTE_REASON[spec.reason]}${spec.schemeRef ? ` (${spec.schemeRef})` : ''}`;
          v.history.push({ at, by: 'billing', text: `${DOC_LABEL[spec.docType]} ${v.number} received from Billing against ${inv.number} (${NOTE_REASON[spec.reason]}): book its entry` });
          set((d) => {
            d.vouchers.push(v);
          });
          app().record('event', 'billing', `sales.${spec.docType.replace('_', '')}.issued`, `${v.number} against ${inv.number} · ${NOTE_REASON[spec.reason]} → voucher ${id} (to book)${spec.reason === 'return' && !v.returnId ? ' · waits for Stores\' return receipt (C-17)' : ''}`);
          return id;
        },

        recordReturn: (spec) => {
          const s = get();
          const inv = s.vouchers.find((x) => x.id === spec.invoiceId);
          const je = inv?.entryId ? s.journal.find((e) => e.id === inv.entryId) : undefined;
          // The cost the goods LEFT at: the invoice's cost line for that item and batch (FIFO), or the item's (weighted average).
          const out = je?.lines.filter((l) => l.item === spec.item && l.cr > 0 && (l.lot ?? spec.lot) === spec.lot) ?? [];
          const sold = out.reduce((t, l) => t + (l.qty ?? 0), 0);
          const back = s.returns.filter((x) => x.invoiceId === spec.invoiceId && x.item === spec.item && x.fromLot === spec.lot).reduce((t, x) => t + x.qty, 0);
          if (!inv || !out.length || back + spec.qty > sold) {
            app().record('api', 'latha', 'POST /api/v1/stores/sales-returns', `→ 422 RETURN_MORE_THAN_SOLD: ${back + spec.qty} back of ${spec.item} batch ${spec.lot} against ${sold} on ${inv?.number ?? 'the invoice'} (Part C)`);
            return null;
          }
          const unitCost = Math.round((out.reduce((t, l) => t + l.cr, 0) / sold) * 100) / 100;
          const at = app().bump(5);
          const n = s.returns.length + 1;
          const id = `SRR-${String(n).padStart(4, '0')}`;
          const godown = `${inv.branch.slice(0, 2)}-QC`;
          let entryId: string | undefined;
          set((d) => {
            const from = d.lots.find((l) => l.lot === spec.lot && l.item === spec.item && !l.godown.endsWith('-QC'));
            let toLotId: string;
            if (spec.condition === 'saleable' && from) {
              from.qtyLeft += spec.qty; // back on the shelf, in its own batch
              toLotId = from.lotId;
            } else {
              toLotId = `LOT-${d.lots.length + 1}`;
              d.lots.push({ lotId: toLotId, branch: inv.branch, godown, item: spec.item, lot: spec.lot, receivedOn: at.slice(0, 10), qtyReceived: spec.qty, qtyLeft: spec.qty, unitCost, illustrative: true });
            }
            const r: StockReturn = { id, at, branch: inv.branch, accountId: inv.accountId, invoiceId: inv.id, item: spec.item, fromLot: spec.lot, qty: spec.qty, condition: spec.condition, toLotId, unitCost };
            if (d.returnStock === 'stores_receipt') {
              // SALES_RETURN_RECEIPT v1: the receipt posts the stock back, its own event (the CA's E1).
              entryId = nextJe(d);
              const lines = returnReceiptPostingFor([{ item: spec.item, lot: spec.lot, qty: spec.qty, amount: Math.round(spec.qty * unitCost * 100) / 100 }]);
              d.journal.push({ id: entryId, voucherNo: id, kind: 'stock_return', branch: inv.branch, date: at.slice(0, 10), narration: `Stock back: ${spec.qty} ${spec.item} returned against ${inv.number} (${spec.condition})`,
                lines: lines.map((l) => ({ ledger: l.ledger, dr: l.dr, cr: l.cr, ...(l.item ? { item: l.item, lot: l.lot ?? null, qty: l.qty } : {}) })), rule: 'SALES_RETURN_RECEIPT v1 · R1', postedAt: at, postedBy: 'system' });
              r.entryId = entryId;
            }
            d.returns.push(r);
            // A return note already waiting for this receipt (C-17) now has it.
            const waiting = d.vouchers.find((x) => x.docType === 'credit_note' && x.noteReason === 'return' && x.againstId === inv.id && !x.returnId && x.status === 'draft' && x.lines.some((l) => l.item === spec.item));
            if (waiting) {
              waiting.returnId = id;
              waiting.returnStock = r.entryId ? 'stores_receipt' : 'with_credit_note';
              waiting.history.push({ at, by: 'latha', text: `Stores' return receipt ${id} arrived: the note can go` });
            }
          });
          const rec = app().record;
          rec('event', 'latha', 'stores.sales_return.received', `${id} · ${spec.qty} ${spec.item} batch ${spec.lot}, ${spec.condition} → ${spec.condition === 'saleable' ? 'back in its batch' : godown} · against ${inv.number}`);
          rec('db', 'system', 'INSERT inv.stock_return + inv.stock_lot', `${id} at the cost it left at ${inr(unitCost)} per unit`);
          if (entryId) rec('db', 'system', 'INSERT fin.journal_entry (stock_return)', `${entryId} · Dr 106020 Finished Goods · Cr 501040 COGS ${inr(spec.qty * unitCost)} (SALES_RETURN_RECEIPT v1, the CA's E1)`);
          app().notify({ tone: 'success', title: `Stores: ${spec.qty} ${spec.item} back from ${accountOf(ctxOf(get()), inv.accountId)?.name ?? ''}`, body: `${id}${entryId ? ` · stock back posted ${entryId}` : ' · the credit note will post the stock back'}.` });
          return id;
        },

        setReturnStock: (m) => {
          if (get().returnStock === m) return;
          set((s) => {
            s.returnStock = m;
          });
          app().record('api', ME, 'PUT /api/v1/settings/return-stock-posting', `{value: ${m}} · ${m === 'stores_receipt' ? "Stores' return receipt posts the stock back (the CA's E1)" : 'the credit note posts the stock back in its own entry'} (fin.book_setting, dated)`);
        },

        holdForCustomer: (voucherId, go = true) => {
          const s = get();
          const v = voucherOf(s, voucherId) ?? s.held.find((x) => x.id === voucherId) ?? null;
          const p = v?.pendingCustomer;
          if (!v || !p || v.accountId || v.submittedAt) return null;
          const o = app();
          const live = p.requestId ? o.requests.find((r) => r.id === p.requestId) : undefined;
          let reqId = live?.id ?? null;
          if (!reqId) {
            // The event's data fills the T12 form: what an invoice shows. The rest (contact, credit terms, TCS …) the accountant adds.
            const nav = o.nav;
            reqId = o.createRequest({ side: 'receivable', from: ME, formNo: `UPL ${v.number ?? v.id}` });
            const stateKey = Object.entries(STATES).find(([, x]) => x.code === p.stateCode)?.[0] ?? '';
            const pin = p.address?.match(/\b\d{6}\b/)?.[0] ?? '';
            const city = cityOf(p.address);
            const filled: string[] = [];
            const set1 = (k: string, val: string | number | null) => {
              if (val === null || val === '') return;
              o.setValue(reqId!, k, val);
              filled.push(k);
            };
            set1('legalName', p.name);
            set1('tradeName', p.name);
            set1('gstRegistered', p.gstin ? 'yes' : 'no');
            set1('gstin', p.gstin);
            set1('gstRegType', p.gstin ? 'regular' : null);
            set1('pan', p.pan);
            set1('state', stateKey);
            set1('addressLine', p.address?.replace(/,?\s*State:.*$/i, '') ?? '');
            set1('city', city);
            set1('pincode', pin);
            // the customer category, the debtor category (it drives the receivable ledger), export and residence: the accountant's
            // decision, never guessed from an invoice; the form flags them as missing.
            useOnboarding.setState((d) => {
              const r = d.requests.find((x) => x.id === reqId);
              if (r) r.source = { kind: 'document', event: 'sales.document.received', uploadId: '', file: '', mime: '', docNo: v.number ?? '', voucherId: v.id, filled };
              if (!go) d.nav = nav;
            });
            o.record('event', 'system', 'customer.registration.requested', `${reqId} prefilled from ${v.number ?? 'the document'} (${filled.length} fields): ${p.name}${p.gstin ? ` · ${p.gstin}` : ''}; the accountant fills the rest and submits`);
          }
          // The document waits OUTSIDE the voucher list: no draft without a customer. It comes back to book once the customer is active.
          set((d) => {
            const i = d.vouchers.findIndex((x) => x.id === voucherId);
            const x = i >= 0 ? d.vouchers.splice(i, 1)[0] : d.held.find((y) => y.id === voucherId)!;
            x.pendingCustomer!.requestId = reqId!;
            x.history.push({ at: app().now, by: ME, text: `Waiting for its customer: ${p.name} sent to Create a customer (T12 request ${reqId}, prefilled from the document)` });
            if (i >= 0) d.held.push(x);
          });
          app().openVoucher(null);
          if (go) app().navigate('onboarding', reqId);
          return reqId;
        },

        linkPendingCustomers: () => {
          const o = app();
          const s = get();
          const party = (acc: { partyId: string }) => o.parties.find((y) => y.partyId === acc.partyId);
          const accountFor = (p: NonNullable<Voucher['pendingCustomer']>) => {
            // the T12 request made for it, once approved; else an active customer with that GSTIN (or that name, unregistered)
            const req = p.requestId ? o.requests.find((r) => r.id === p.requestId) : undefined;
            const byReq = req?.accountId ? o.accounts.find((acc) => acc.accountId === req.accountId) : undefined;
            return byReq ?? o.accounts.find((acc) => acc.side === 'receivable' && ((p.gstin && (acc.gstin === p.gstin || party(acc)?.gstins.some((g) => g.value === p.gstin))) || (!p.gstin && acc.name.toLowerCase() === p.name.toLowerCase())));
          };
          const back: { id: string; account: Account }[] = [];
          for (const x of [...s.held, ...s.vouchers.filter((y) => y.pendingCustomer && !y.accountId && y.status === 'draft')]) {
            const a = accountFor(x.pendingCustomer!);
            if (a) back.push({ id: x.id, account: a });
          }
          if (!back.length) return;
          set((d) => {
            for (const { id, account: a } of back) {
              const hi = d.held.findIndex((y) => y.id === id);
              const x = hi >= 0 ? d.held.splice(hi, 1)[0] : d.vouchers.find((y) => y.id === id)!;
              const p = x.pendingCustomer!;
              x.accountId = a.accountId;
              x.narration = x.narration.replace(p.name, a.name);
              x.history.push({ at: o.now, by: 'system', text: `Customer registered: ${a.name} (${a.accountId})${p.requestId ? ` by T12 request ${p.requestId}` : ''}: back in To book` });
              if (hi >= 0) d.vouchers.push(x);
            }
          });
          for (const { id, account: a } of back) {
            const x = voucherOf(get(), id)!;
            o.record('event', 'system', 'customer.activated → sales voucher ready', `${a.accountId} ${a.name}: ${DOC_LABEL[x.docType ?? 'invoice'].toLowerCase()} ${x.number} (${x.id}) to book`);
            o.notify({ tone: 'info', title: `Ready to book: ${x.number} · ${a.name}`, body: `The customer is active (${a.accountId}); the ${DOC_LABEL[x.docType ?? 'invoice'].toLowerCase()} is in To book.`, voucherId: x.id });
          }
        },

        reset: () =>
          set((s) => {
            Object.assign(s, seedSales(), { lots: seedLots(), costMethod: 'fifo' as CostMethod, returns: [], returnStock: 'stores_receipt' as ReturnStockPosting, held: [] });
          }),
      };
    }),
    { name: 'aikyat-ae-sales-v15-t24', partialize: (s) => ({ vouchers: s.vouchers, journal: s.journal, lots: s.lots, costMethod: s.costMethod, returns: s.returns, returnStock: s.returnStock, held: s.held }) },
  ),
);

// Rev 21: a customer activated anywhere (T12 approvals, on any screen) brings its waiting documents back to To book.
let knownAccounts = -1;
useOnboarding.subscribe((o) => {
  if (o.accounts.length === knownAccounts) return;
  knownAccounts = o.accounts.length;
  const s = useSales.getState();
  if (s.held?.length || s.vouchers.some((v) => v.pendingCustomer && !v.accountId)) s.linkPendingCustomers();
});
