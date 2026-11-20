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

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { inr } from '../domain/money';
import { ACTORS, ME } from '../onboarding/catalogue';
import { useOnboarding } from '../onboarding/store';
import { accountOf, calcOf, checksOf, entryDiffOf, entryOf, POSTING_RULE, routesOf, ruleEntryOf, stops, sum, toJournal, type SalesCtx } from './rules';
import { received, seedSales, type InvoiceSpec } from './seed';
import { COST_METHODS, issueOf, issueStock, seedLots, type CostMethod, type StockLot } from './inventory';
import type { ActorKey } from '../onboarding/types';
import type { EditLine, JournalEntry, Outcome, Voucher } from './types';

interface Data {
  vouchers: Voucher[];
  journal: JournalEntry[];
  /** Rev 15: inv.stock_lot (inventory, a demo stub) and the company's costing method (FIFO or weighted average). */
  lots: StockLot[];
  costMethod: CostMethod;
}

export interface DecideOpts {
  reason?: string;
  /** Mock only: who presses the button (K19: the maker may not decide). Default: the checker. */
  by?: ActorKey;
}

interface State extends Data {
  /** Mock only: Billing hands over an invoice it raised (numbered, IRN registered). Returns the voucher id. */
  receiveInvoice: (spec: InvoiceSpec) => string | null;
  /** §8.4: "Change amounts / add lines" on (copies the rule's editable lines) or off (back to the rule). */
  setEditing: (id: string, on: boolean) => void;
  /** Change an editable line: ledger, amount, reason. */
  setEditLine: (id: string, lineId: string, patch: Partial<Pick<EditLine, 'ledger' | 'dr' | 'cr' | 'reason'>>) => void;
  /** Pick another ledger for an entry line (the engine's is the default; manual for now). Starts the edit if needed. */
  setLedger: (id: string, lineId: string, ledger: string) => void;
  splitEditLine: (id: string, lineId: string) => void;
  addEditLine: (id: string) => void;
  removeEditLine: (id: string, lineId: string) => void;
  saveDraft: (id: string) => void;
  submit: (id: string) => void;
  /** DecideSalesVoucher: approve (posts) · send_back (reason) · reject (reason). Returns false when it did not happen. */
  decide: (id: string, approvalId: string, outcome: Outcome, opts?: DecideOpts) => boolean;
  /** The invoice cannot be booked as it is (wrong customer, wrong GST…): back to Billing with a reason. */
  returnToBilling: (id: string, reason: string) => void;
  /** Rev 15: the company's costing method (a setting; the demo shows it on the voucher). */
  setCostMethod: (m: CostMethod) => void;
  reset: () => void;
}

export const isMineV = (v: Voucher) => v.status === 'draft';
export const isWithOthersV = (v: Voucher) => v.status === 'submitted';
export const isDoneV = (v: Voucher) => !isMineV(v) && !isWithOthersV(v);
export const voucherOf = (s: Pick<Data, 'vouchers'>, id: string | null | undefined) => s.vouchers.find((v) => v.id === id) ?? null;
export const titleOfV = (v: Voucher, ctx: Pick<SalesCtx, 'accounts'>) => accountOf(ctx, v.accountId)?.name ?? 'Sales invoice';

const API = '/api/v1/sales-vouchers';
const app = () => useOnboarding.getState();

/** The context the rules read: onboarding's accounts and parties + this store's data. */
export const ctxOf = (s: Data): SalesCtx => {
  const a = app();
  return { accounts: a.accounts, parties: a.parties, requests: a.requests, journal: s.journal, vouchers: s.vouchers, now: a.now, lots: s.lots, costMethod: s.costMethod };
};

const nextNo = (ids: string[], prefix: string, start: number) => Math.max(start, ...ids.filter((x) => x.startsWith(prefix)).map((x) => Number(x.slice(prefix.length)) || 0)) + 1;
const nextJe = (s: Data) => `JE-${String(nextNo(s.journal.map((e) => e.id), 'JE-', 0)).padStart(6, '0')}`;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const nextVoucherId = (s: Data) => `SV-${String(nextNo(s.vouchers.map((v) => v.id), 'SV-', 0)).padStart(4, '0')}`;

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
        const diff = entryDiffOf(v, ctx);
        const entryId = nextJe(s);
        const hasCost = lines.some((l) => l.role === 'cost');
        if (hasCost) issueStock(s.lots, s.costMethod, v.branch, issueOf(c.rows));
        s.journal.push({
          id: entryId, voucherNo: v.number!, voucherId: v.id, kind: 'sales', branch: v.branch, date: v.date, narration: v.narration, lines: toJournal(lines, a.accountId), rule: `${POSTING_RULE} · ${c.rules.join(' + ')}${hasCost ? ` + R13 (${COST_METHODS[s.costMethod].label})` : ''}`, postedAt: now, postedBy: 'system',
          ...(hasCost ? { costMethod: s.costMethod } : {}),
          ...(diff ? { edit: { by: v.edit!.by, approvedBy, diff, reasons: lines.filter((l) => l.changed).map((l) => `${l.name}: ${l.reason || 'ledger picked'}`) } } : {}),
        });
        Object.assign(v, { entryId, status: 'posted', postedAt: now });
        const r = app().record;
        r('api', 'system', `posting rule ${POSTING_RULE}`, `rule ${c.rules.join(' + ')} → ${lines.map((l) => `${l.dr ? 'Dr' : 'Cr'} ${l.code}`).join(' · ')}`);
        r('db', 'system', 'INSERT fin.journal_entry + journal_line', `${entryId} · voucher_type sales · source ${v.id} (${v.number}) · ${v.branch} · posting date ${v.date} · Dr = Cr ${inr(t.dr)}${diff ? ' · the AE\'s choices kept' : ''}`);
        if (hasCost) {
          const cl = lines.filter((l) => l.role === 'cost' && l.cr);
          r('db', 'system', 'UPDATE inv.stock_lot', `${COST_METHODS[s.costMethod].label}: ${cl.map((l) => `${l.item} ${l.qty}${l.lot ? ` from ${l.lot}` : ''} ${inr(l.cr)}`).join(' · ')} · stock goes down in the same transaction as the entry`);
        }
        if ((v.settlement ?? 'credit') === 'credit') r('db', 'system', 'open item', `${a.accountId} · ${v.number} · ${inr(c.payable)} due ${addDays(v.date, a.creditDays ?? 0)}: the journal line naming the account`);
        v.history.push({ at: now, by: 'system', text: `Posted ${entryId} (${c.rules.join(' + ')}${diff ? ', the AE\'s ledger choices approved by Rajan' : ''})` });
        app().notify({ tone: 'success', title: `Posted ${v.number}: ${a.name}`, body: `${inr(c.payable)} · journal ${entryId}.`, voucherId: v.id });
      };

      return {
        ...seedSales(),
        lots: seedLots(),
        costMethod: 'fifo' as CostMethod,

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

        setEditing: (id, on) =>
          edit(id, (v, s) => {
            if (!on) return void delete v.edit;
            if (v.edit) return void (v.edit.amounts = true);
            const rule = ruleEntryOf(v, ctxOf(s)).filter((l) => !l.locked);
            v.edit = { lines: rule.map((l) => ({ id: l.id, from: l.id, ledger: l.ledger, dr: l.dr, cr: l.cr, reason: '' })), by: ME, at: app().now, amounts: true };
          }),
        setEditLine: (id, lineId, patch) =>
          edit(id, (v) => {
            const l = v.edit?.lines.find((x) => x.id === lineId);
            if (l) Object.assign(l, patch);
          }),
        setLedger: (id, lineId, ledger) =>
          edit(id, (v, s) => {
            if (!v.edit) {
              const rule = ruleEntryOf(v, ctxOf(s)).filter((l) => !l.locked);
              v.edit = { lines: rule.map((l) => ({ id: l.id, from: l.id, ledger: l.ledger, dr: l.dr, cr: l.cr, reason: '' })), by: ME, at: app().now };
            }
            const r = ruleEntryOf(v, ctxOf(s)).find((x) => x.id === lineId);
            if (r?.locked) {
              // the customer, settlement, refund and GST lines: the amount stays the invoice's, the ledger is picked
              v.edit.picks ??= {};
              if (ledger === r.ledgerKey) delete v.edit.picks[lineId];
              else v.edit.picks[lineId] = ledger;
              return;
            }
            const l = v.edit.lines.find((x) => x.id === lineId);
            if (l) l.ledger = ledger;
          }),
        splitEditLine: (id, lineId) =>
          edit(id, (v) => {
            const lines = v.edit?.lines;
            const i = lines?.findIndex((x) => x.id === lineId) ?? -1;
            if (!lines || i < 0) return;
            const n = nextNo(lines.map((x) => x.id), 'split:', 0);
            lines.splice(i + 1, 0, { id: `split:${n}`, ledger: lines[i].ledger, dr: 0, cr: 0, reason: '' });
          }),
        addEditLine: (id) =>
          edit(id, (v) => {
            if (!v.edit) return;
            const n = nextNo(v.edit.lines.map((x) => x.id), 'add:', 0);
            v.edit.lines.push({ id: `add:${n}`, ledger: '', dr: 0, cr: 0, reason: '' });
          }),
        removeEditLine: (id, lineId) =>
          edit(id, (v) => {
            if (!v.edit) return;
            v.edit.lines = v.edit.lines.filter((x) => x.id !== lineId || !!x.from);
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
            v.approvals = [...v.approvals.filter((x) => x.status !== 'pending'), ...routes.map((r, i) => ({ id: `APR-${v.id.slice(3)}-${n + i + 1}`, why: r.why, label: r.label, checker: r.checker, status: 'pending' as const, ...(r.entryDiff ? { entryDiff: r.entryDiff } : {}) }))];
            v.status = 'submitted';
            v.submittedAt = now;
            v.dirty = false;
            app().record('api', ME, `POST ${API}/${v.id}/submit`, `all Stop checks clear · Dr = Cr ${inr(sum(entryOf(v, ctx)).dr)}${routes[0].entryDiff ? ` · ${routes[0].entryDiff}` : ''}`);
            v.history.push({ at: now, by: ME, text: `${again ? 'Sent again' : 'Entry booked and sent'} to ${routes.map((r) => ACTORS[r.checker].name).join(', ')}${routes[0].entryDiff ? ` · ${routes[0].entryDiff}` : ''}` });
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

        reset: () =>
          set((s) => {
            Object.assign(s, seedSales(), { lots: seedLots(), costMethod: 'fifo' as CostMethod });
          }),
      };
    }),
    { name: 'aikyat-ae-sales-v15-t24', partialize: (s) => ({ vouchers: s.vouchers, journal: s.journal, lots: s.lots, costMethod: s.costMethod }) },
  ),
);
