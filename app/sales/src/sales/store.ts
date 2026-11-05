// The mock backend of Post a sales invoice. It shares the app's clock, backend log, notices and navigation with
// onboarding (useOnboarding), and reads the customer accounts onboarding created. Nothing is sent anywhere.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { inr } from '../domain/money';
import { ACTORS, ME } from '../onboarding/catalogue';
import { useOnboarding } from '../onboarding/store';
import { fmtNo, PARAMS, SERIES } from './catalogue';
import { accountForChallan, accountOf, billedQty, calcOf, challanOf, checksOf, COST_RULE, ewbDays, linesOf, narrationOf, POSTING_RULE, routesOf, ruleCostOf, ruleEntryOf, stops, typedCostLinesOf, sum, toJournal, type SalesCtx } from './rules';
import { blankEntry, irnOf, newVoucher, seedSales } from './seed';
import type { Challan, CostEntry, InventoryMethod, JournalEntry, ManualEntry, Voucher } from './types';

interface Data {
  challans: Challan[];
  vouchers: Voucher[];
  journal: JournalEntry[];
  method: InventoryMethod;
}

interface State extends Data {
  /** Opens a draft invoice from a delivery challan: its unbilled lines, at the order's rates. Returns its id. */
  createFromChallan: (dcId: string) => string | null;
  /** Mock only: play Stores (Latha) recording a challan that waited for the customer's account. */
  recordChallan: (dcId: string) => void;
  setField: (id: string, key: 'date' | 'customerPo' | 'narration', value: string) => void;
  /** Which of the customer's branches this invoice bills (its GSTIN and address; the place of supply follows). */
  setBranch: (id: string, branchId: string) => void;
  setQty: (id: string, i: number, qty: number | null) => void;
  /** The accounting entry, typed by hand (30-Oct). */
  setEntry: (id: string, patch: Partial<Pick<ManualEntry, 'partyLedger' | 'partyAmount' | 'salesLedger' | 'salesAmount' | 'roundOff'>>) => void;
  setTaxLine: (id: string, i: number, patch: { ledger?: string; amount?: number | null }) => void;
  addTaxLine: (id: string) => void;
  removeTaxLine: (id: string, i: number) => void;
  setCost: (id: string, patch: Partial<CostEntry>) => void;
  /** Mock only: types the entry the rule expects, the way a person would. */
  typeEntry: (id: string) => void;
  saveDraft: (id: string) => void;
  submit: (id: string) => void;
  decide: (id: string, approvalId: string, approve: boolean, reason?: string) => void;
  sendBack: (id: string, reason: string) => void;
  discard: (id: string) => void;
  /** A confirmed invoice is never edited: it is cancelled by a credit note (reverses its own lines only). */
  cancelByCreditNote: (id: string, reason: string) => void;
  /** Company switch (scenario Run 1 / Run 2): restarts the sales data under that method. */
  setMethod: (m: InventoryMethod) => void;
  reset: () => void;
}

export const isMineV = (v: Voucher) => v.status === 'draft' || v.status === 'returned';
export const isWithOthersV = (v: Voucher) => v.status === 'submitted';
export const voucherOf = (s: Pick<Data, 'vouchers'>, id: string | null | undefined) => s.vouchers.find((v) => v.id === id) ?? null;
export const titleOfV = (v: Voucher, ctx: Pick<SalesCtx, 'accounts' | 'challans'>) => accountOf(ctx, v.accountId)?.name ?? challanOf(ctx, v.dcId)?.customer ?? v.dcId;

const API = '/api/v1/legal-entities/LE-1/sales-invoices';
const app = () => useOnboarding.getState();

/** The context the rules read: onboarding's accounts and parties + this store's data. */
export const ctxOf = (s: Data): SalesCtx => {
  const a = app();
  return { accounts: a.accounts, parties: a.parties, requests: a.requests, journal: s.journal, vouchers: s.vouchers, challans: s.challans, method: s.method, now: a.now };
};

const nextNo = (ids: string[], prefix: string, start: number) => Math.max(start, ...ids.filter((x) => x.startsWith(prefix)).map((x) => Number(x.slice(prefix.length)) || 0)) + 1;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export const useSales = create<State>()(
  persist(
    immer((set, get) => {
      /** The posting engine: the accounting event → posting rule + determination → one journal entry. */
      const post = (s: Data, v: Voucher) => {
        const ctx = ctxOf(s);
        const now = app().bump(1);
        const lines = linesOf(v, ctx);
        const c = calcOf(v, ctx);
        const a = accountOf(ctx, v.accountId)!;
        const dc = challanOf(ctx, v.dcId)!;
        const t = sum(lines);
        const number = fmtNo(SERIES.invoice, nextNo(s.vouchers.map((x) => x.number ?? ''), SERIES.invoice, 0));
        const narration = v.narration.trim() || narrationOf(v, ctx);
        const typedCost = typedCostLinesOf(v);
        if (s.method === 'perpetual' && v.manual?.cost && !dc.costEntryId && typedCost.length) {
          const costId = `JE-${String(nextNo(s.journal.map((e) => e.id), 'JE-', 0)).padStart(6, '0')}`;
          s.journal.push({ id: costId, voucherNo: dc.id, kind: 'challan_cost', date: dc.date, narration: `Being goods issued from KA-FG on ${dc.id} (${dc.soId}) at standard cost`, lines: toJournal(typedCost), rule: COST_RULE, postedAt: now, postedBy: ME });
          s.challans.find((x) => x.id === dc.id)!.costEntryId = costId;
          app().record('db', 'system', 'INSERT accounting.journal_entry (goods issue, typed)', `${costId} · ${dc.id} dated ${dc.date} · Dr Cost of goods sold ${inr(typedCost[0].dr)} · Cr Inventory – finished goods ${inr(typedCost[1]?.cr ?? 0)} (Perpetual)`);
        }
        const entryId = `JE-${String(nextNo(s.journal.map((e) => e.id), 'JE-', 0)).padStart(6, '0')}`;
        s.journal.push({ id: entryId, voucherNo: number, voucherId: v.id, kind: 'sales', date: v.date, narration, lines: toJournal(lines, a.accountId), rule: POSTING_RULE, postedAt: now, postedBy: 'system' });
        Object.assign(v, { number, entryId, status: 'posted', postedAt: now, narration, irn: irnOf(number), ackNo: `1126${String(Date.parse(`${now}:00Z`) % 1e11).padStart(11, '0')}`, ackAt: now });
        if (c.total > PARAMS.ewayBillMin.value) {
          v.ewbNo = `3410${String(Number.parseInt(irnOf(number).slice(0, 7), 16) % 1e8).padStart(8, '0')}`;
          v.ewbValidTo = addDays(v.date, ewbDays(dc.distanceKm) - 1);
        }
        const r = app().record;
        r('event', 'system', 'finance.sales_invoice.approved', `${v.id} · accounting event SALES_INVOICE: taxable ${inr(c.taxable)}, GST ${inr(c.cgst + c.sgst + c.igst)}, party ${a.accountId}, place of supply ${c.pos} (no ledgers chosen by the module; no stock, no cost)`);
        r('api', 'system', `posting-engine: ${POSTING_RULE}`, `account determination: ${c.intra ? 'local → 401010 + Output CGST / SGST' : 'inter-state → 401011 + Output IGST'} · round off ${c.roundOff}`);
        r('db', 'system', 'INSERT accounting.journal_entry', `${entryId} · ${number} · posting date ${v.date} · Dr = Cr ${inr(t.dr)} · append-only`);
        r('db', 'system', `INSERT accounting.journal_line ×${lines.length}`, lines.map((l) => `${l.dr ? 'Dr' : 'Cr'} ${l.name} ${inr(l.dr || l.cr)} [${l.statement}]`).join(' · '));
        r('db', 'system', 'INSERT accounting.subledger_item (AR)', `${a.accountId} · New Ref ${number} · ${inr(c.total)} · due in ${a.creditDays ?? 0} days`);
        r('api', 'irp', 'IRP: generate IRN', `${number} → IRN ${v.irn!.slice(0, 12)}… · Ack ${v.ackNo} · signed QR`);
        if (v.ewbNo) r('api', 'irp', 'E-way bill Part-A (from the invoice)', `${v.ewbNo} · ${dc.distanceKm} km · valid to ${v.ewbValidTo}; Part-B (vehicle ${dc.vehicleNo}) by Latha at KA-FG`);
        r('event', 'system', 'finance.sales_invoice.confirmed', `${number} · Stores: ${dc.id} release unblocked · Billing sends it by the customer's instruction · Collections sees the due date`);
        v.history.push({ at: now, by: 'system', text: `Confirmed ${number} · ${entryId} · IRN received${v.ewbNo ? ` · e-way bill ${v.ewbNo}` : ''}` });
        app().notify({ tone: 'success', title: `Confirmed ${number}: ${a.name}`, body: `${inr(c.total)} · journal ${entryId}. IRN received${v.ewbNo ? `, e-way bill Part-A ready for Latha` : ''}; ${dc.id} can be released.`, voucherId: v.id });
      };

      return {
        ...seedSales(),

        createFromChallan: (dcId) => {
          const s = get();
          const ctx = ctxOf(s);
          const dc = challanOf(ctx, dcId);
          const a = dc && accountForChallan(ctx, dc);
          if (!dc || !dc.recordedAt || !a) return null;
          const open = s.vouchers.find((v) => v.dcId === dcId && isMineV(v));
          if (open) {
            app().openVoucher(open.id);
            return open.id;
          }
          const id = `SI-${String(nextNo(s.vouchers.map((v) => v.id), 'SI-', 0)).padStart(4, '0')}`;
          const at = app().bump(5);
          set((d) => {
            d.vouchers.push({ ...newVoucher({ id, dc, at, accountId: a.accountId, billed: (i) => billedQty(ctx, dcId, i) }), manual: blankEntry(s.method === 'perpetual' && !dc.costEntryId) });
          });
          app().record('api', ME, `POST ${API}`, `{delivery_challan: ${dcId}} → 201 ${id} (draft: lines pulled from the challan; no invoice number until it is confirmed)`);
          app().record('db', 'system', 'INSERT finance.sales_invoice · sales_invoice_line', `${id} · draft · ${dc.lines.length} challan lines`);
          app().openVoucher(id);
          return id;
        },

        recordChallan: (dcId) =>
          set((s) => {
            const dc = s.challans.find((c) => c.id === dcId);
            const ctx = ctxOf(s);
            if (!dc || dc.recordedAt || !accountForChallan(ctx, dc)) return;
            const now = app().bump(10);
            dc.recordedAt = now;
            dc.date = now.slice(0, 10);
            app().record('api', 'latha', `POST /api/v1/legal-entities/LE-1/delivery-challans`, `${dc.id} against ${dc.soId} · ${dc.lines.map((l) => `${l.qty} ctn ${l.item} batch ${l.batch}`).join(' · ')} · release blocked until the IRN`);
            // Perpetual: its cost entry is typed by hand with the invoice (30-Oct), and posts dated the challan date.
            app().notify({ tone: 'info', title: `${dc.id} ready to bill: ${dc.customer}`, body: `Latha recorded it against ${dc.soId}. Its release waits for your invoice's IRN.` });
          }),

        setField: (id, key, value) =>
          set((s) => {
            const v = voucherOf(s, id);
            if (!v || !isMineV(v)) return;
            v[key] = key === 'customerPo' ? value.toUpperCase() : value;
            v.dirty = true;
          }),

        setBranch: (id, branchId) =>
          set((s) => {
            const v = voucherOf(s, id);
            if (!v || !isMineV(v)) return;
            v.branchId = branchId;
            v.dirty = true;
          }),

        setQty: (id, i, qty) =>
          set((s) => {
            const v = voucherOf(s, id);
            if (!v || !isMineV(v) || !v.lines[i]) return;
            v.lines[i].qty = qty;
            v.dirty = true;
          }),

        setEntry: (id, patch) =>
          set((s) => {
            const v = voucherOf(s, id);
            if (!v || !isMineV(v) || !v.manual) return;
            Object.assign(v.manual, patch);
            v.dirty = true;
          }),

        setTaxLine: (id, i, patch) =>
          set((s) => {
            const v = voucherOf(s, id);
            const t = v?.manual?.taxLines[i];
            if (!v || !t || !isMineV(v)) return;
            Object.assign(t, patch);
            v.dirty = true;
          }),

        addTaxLine: (id) =>
          set((s) => {
            const v = voucherOf(s, id);
            if (v?.manual && isMineV(v)) v.manual.taxLines.push({ ledger: '', amount: null });
          }),

        removeTaxLine: (id, i) =>
          set((s) => {
            const v = voucherOf(s, id);
            if (!v?.manual || !isMineV(v)) return;
            v.manual.taxLines.splice(i, 1);
            if (!v.manual.taxLines.length) v.manual.taxLines.push({ ledger: '', amount: null });
            v.dirty = true;
          }),

        setCost: (id, patch) =>
          set((s) => {
            const v = voucherOf(s, id);
            if (!v || !isMineV(v) || !v.manual?.cost) return;
            Object.assign(v.manual.cost, patch);
            v.dirty = true;
          }),

        typeEntry: (id) =>
          set((s) => {
            const v = voucherOf(s, id);
            if (!v || !v.manual || !isMineV(v)) return;
            const ctx = ctxOf(s);
            v.manual = { ...ruleEntryOf(v, ctx), ...(v.manual.cost ? { cost: ruleCostOf(v, ctx) } : {}) };
            v.dirty = true;
          }),

        saveDraft: (id) => {
          if (!voucherOf(get(), id)) return;
          app().bump(1);
          app().record('api', ME, `PATCH ${API}/${id}`, 'draft saved · checks, the Dr / Cr preview and the e-invoice pre-check returned');
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
            const resubmit = v.status === 'returned';
            if (!v.narration.trim()) v.narration = narrationOf(v, ctx);
            const routes = routesOf(v, ctx);
            v.approvals = routes.map((r, i) => ({ id: `APR-${v.id.slice(3)}-${i + 1}${resubmit ? 'b' : ''}`, why: r.why, label: r.label, checker: r.checker, status: 'pending' }));
            v.status = 'submitted';
            v.submittedAt = now;
            v.returnedReason = undefined;
            v.dirty = false;
            app().record('api', ME, `POST ${API}/${v.id}/submit`, `all Stop checks clear · e-invoice pre-check passed · total ${inr(calcOf(v, ctx).total)}`);
            app().record('db', 'system', 'INSERT platform.approval', routes.map((r) => `${r.label} → ${ACTORS[r.checker].name}`).join(' · '));
            app().record('event', 'system', 'finance.sales_invoice.submitted', `${v.id} → ${routes.map((r) => ACTORS[r.checker].name).join(', ')}`);
            v.history.push({ at: now, by: ME, text: `${resubmit ? 'Resubmitted' : 'Submitted'}: ${routes.map((r) => `${r.label.toLowerCase()} to ${ACTORS[r.checker].name}`).join(' · ')}` });
          }),

        decide: (id, approvalId, approve, reason) =>
          set((s) => {
            const v = voucherOf(s, id);
            const ap = v?.approvals.find((x) => x.id === approvalId);
            if (!v || !ap || ap.status !== 'pending') return;
            const now = app().bump(15);
            ap.status = approve ? 'approved' : 'returned';
            ap.decidedAt = now;
            ap.reason = reason;
            app().record('api', ap.checker, `POST /api/v1/approvals/${ap.id}/decide`, `{outcome: ${approve ? 'approved' : 'returned'}${reason ? `, reason: "${reason}"` : ''}}`);
            v.history.push({ at: now, by: ap.checker, text: `${approve ? 'Approved' : 'Returned'}: ${ap.label.toLowerCase()}${reason ? ` · "${reason}"` : ''}` });
            if (!approve) {
              v.status = 'returned';
              v.returnedReason = `${ACTORS[ap.checker].name}: ${reason}`;
              app().record('event', 'system', 'finance.sales_invoice.returned', `${v.id} → back to the Accounts Executive · nothing posted, no number used`);
              app().notify({ tone: 'critical', title: `Returned by ${ACTORS[ap.checker].name}: invoice for ${v.dcId}`, body: reason ?? '', voucherId: v.id });
              return;
            }
            if (v.approvals.every((x) => x.status === 'approved')) post(s, v);
          }),

        sendBack: (id, reason) =>
          set((s) => {
            const v = voucherOf(s, id);
            if (!v || !isMineV(v)) return;
            const now = app().bump(2);
            v.status = 'sent_back';
            v.sentBack = { to: v.from, reason, at: now };
            v.history.push({ at: now, by: ME, text: `Challan ${v.dcId} sent back to ${ACTORS[v.from].name}: "${reason}"` });
            app().record('api', ME, `POST ${API}/${v.id}/send-back`, `{to: ${ACTORS[v.from].role}, reason: "${reason}"} · nothing posted`);
          }),

        discard: (id) =>
          set((s) => {
            const v = voucherOf(s, id);
            if (!v || v.status !== 'draft' || v.submittedAt) return;
            s.vouchers = s.vouchers.filter((x) => x.id !== id);
            app().record('api', ME, `POST ${API}/${id}/discard`, 'draft opened by mistake (kept as discarded; no number was used)');
            app().openVoucher(null);
          }),

        cancelByCreditNote: (id, reason) =>
          set((s) => {
            const v = voucherOf(s, id);
            const e = v && s.journal.find((x) => x.id === v.entryId);
            if (!v || !e || v.status !== 'posted') return;
            const now = app().bump(5);
            const cn = fmtNo(SERIES.creditNote, nextNo(s.journal.filter((x) => x.kind === 'credit_note').map((x) => x.voucherNo), SERIES.creditNote, 0));
            const entryId = `JE-${String(nextNo(s.journal.map((x) => x.id), 'JE-', 0)).padStart(6, '0')}`;
            const total = sum(e.lines).dr;
            s.journal.push({ id: entryId, voucherNo: cn, voucherId: v.id, kind: 'credit_note', date: now.slice(0, 10), narration: `Being invoice ${v.number} credited in full: ${reason}`, lines: e.lines.map((l) => ({ ...l, dr: l.cr, cr: l.dr })), rule: 'SALES_CREDIT_NOTE / STAT v1', postedAt: now, postedBy: 'system', reverses: e.id });
            v.status = 'cancelled';
            v.cancel = { creditNote: cn, entryId, reason, at: now };
            const checkers = total > PARAMS.creditNoteFc.value ? 'Rajan and Usha (above ₹1,00,000)' : 'Rajan';
            v.history.push({ at: now, by: ME, text: `Credited in full by ${cn} (${entryId} reverses ${e.id}), approved by ${checkers} (mock): "${reason}"` });
            app().record('api', ME, `POST ${API}/${v.id}/credit-notes`, `{reason: "${reason}"} · against an adjustment the Sales Manager approved (mock) · checked by ${checkers} · the confirmed entry ${e.id} is not touched`);
            app().record('db', 'system', 'INSERT accounting.journal_entry', `${entryId} · ${cn} · reverses ${e.id} line by line (Dr ↔ Cr). Stock and cost are not touched: a return comes back through Stores' return receipt`);
            app().record('api', 'irp', 'IRP: credit note IRN', `${cn} against ${v.number}`);
          }),

        setMethod: (m) =>
          set((s) => {
            Object.assign(s, seedSales(m));
            app().record('api', 'system', `Company switch: inventory accounting = ${m}`, m === 'perpetual' ? 'Run 1: the challan writes the cost entry at standard cost' : 'Run 2: quantities only; cost of goods sold at month end from closing stock (T11)');
          }),

        reset: () =>
          set((s) => {
            Object.assign(s, seedSales(s.method));
          }),
      };
    }),
    { name: 'aikyat-ae-sales-v6', partialize: (s) => ({ challans: s.challans, vouchers: s.vouchers, journal: s.journal, method: s.method }) },
  ),
);
