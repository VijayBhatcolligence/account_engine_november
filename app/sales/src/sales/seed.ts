// Mock data for Post a sales invoice, from the scenario: DC-0618 and DC-0619 (Namma Bakes, dispatched 03-Oct
// in an IRN outage) already invoiced on 05-Oct; DC-1 (SO-1, Sri Lakshmi) being invoiced now; DC-0005 waiting.
// Under Perpetual each challan has its cost entry (Stores'), under Periodic none.

import { seedAccounts, seedParties, seedRequests } from '../onboarding/seed';
import { CHALLANS, fmtNo, SERIES } from './catalogue';
import { accountForChallan, calcOf, COST_RULE, costLinesOf, linesOf, POSTING_RULE, toJournal } from './rules';
import type { Challan, InventoryMethod, JournalEntry, ManualEntry, Voucher } from './types';

const je = (n: number) => `JE-${String(n).padStart(6, '0')}`;

/** A draft invoice pulled from a challan: every line not yet billed, at the order's rate. */
/** The accounting entry, still to type (30-Oct): the invoice comes from the challan, the entry is the person's. */
export const blankEntry = (withCost: boolean): ManualEntry => ({
  partyLedger: '',
  partyAmount: null,
  salesLedger: '',
  salesAmount: null,
  taxLines: [{ ledger: '', amount: null }],
  roundOff: null,
  ...(withCost ? { cost: { drLedger: '', drAmount: null, crLedger: '', crAmount: null } } : {}),
});

/** Challans already billed before the demo starts: their cost entry is in the books. The rest are typed by hand. */
const COSTED = ['DC-0618', 'DC-0619'];

export function newVoucher(o: { id: string; dc: Challan; at: string; accountId: string; billed: (line: number) => number }): Voucher {
  return {
    id: o.id,
    number: null,
    status: 'draft',
    dcId: o.dc.id,
    from: 'latha',
    arrivedAt: o.at,
    date: o.at.slice(0, 10),
    accountId: o.accountId,
    customerPo: '',
    narration: '',
    lines: o.dc.lines.map((l, i) => ({ dcLine: i, item: l.item, batch: l.batch, dcQty: l.qty, qty: l.qty - o.billed(i), rate: l.rate })).filter((l) => (l.qty ?? 0) > 0),
    approvals: [],
    history: [{ at: o.at, by: 'teja', text: `Opened from ${o.dc.id} (${o.dc.soId}), recorded by Latha (Stores)` }],
  };
}

export function seedSales(method: InventoryMethod = 'perpetual'): { challans: Challan[]; vouchers: Voucher[]; journal: JournalEntry[]; method: InventoryMethod } {
  const accounts = seedAccounts();
  const ctx = { accounts, parties: seedParties(), requests: seedRequests(accounts), challans: CHALLANS };
  const journal: JournalEntry[] = [];
  let n = 225;
  const challans: Challan[] = CHALLANS.map((c) => ({ ...c, lines: c.lines.map((l) => ({ ...l })) }));
  for (const c of challans) {
    if (c.needsAccount) continue;
    c.recordedAt = `${c.date}T${c.id === 'DC-1' ? '10:00' : '09:30'}`;
    if (method === 'perpetual' && COSTED.includes(c.id)) {
      c.costEntryId = je(++n);
      journal.push({ id: c.costEntryId, voucherNo: c.id, kind: 'challan_cost', date: c.date, narration: `Being goods issued from KA-FG on ${c.id} (${c.soId}) at standard cost`, lines: toJournal(costLinesOf(c)), rule: COST_RULE, postedAt: c.recordedAt, postedBy: 'latha' });
    }
  }

  const posted = (id: string, no: number, dcId: string, date: string): Voucher => {
    const dc = challans.find((c) => c.id === dcId)!;
    const a = accountForChallan(ctx, dc)!;
    const v = newVoucher({ id, dc, at: `${date}T10:00`, accountId: a.accountId, billed: () => 0 });
    const c = calcOf(v, ctx);
    v.number = fmtNo(SERIES.invoice, no);
    v.status = 'posted';
    v.submittedAt = `${date}T10:30`;
    v.postedAt = `${date}T11:05`;
    v.entryId = je(++n);
    v.irn = irnOf(v.number);
    v.ackNo = `1126${String(no).padStart(11, '0')}`;
    v.ackAt = v.postedAt;
    v.ewbNo = c.total > 50_000 ? `3410${String(no).padStart(8, '0')}` : undefined;
    v.ewbValidTo = v.ewbNo ? dc.date : undefined; // made on the e-way bill portal at dispatch (offline fallback)
    v.narration = `Being goods sold to ${a.name} against ${dcId} / ${dc.soId}`;
    v.approvals = [{ id: `APR-${id.slice(3)}-1`, why: 'invoice', label: 'Invoice check', checker: 'rajan', status: 'approved', decidedAt: `${date}T11:00` }];
    v.history.push({ at: v.submittedAt, by: 'teja', text: 'Sent to Rajan: invoice check' }, { at: `${date}T11:00`, by: 'rajan', text: 'Approved: invoice check' }, { at: v.postedAt, by: 'system', text: `Confirmed ${v.number} · ${v.entryId} · IRN received` });
    journal.push({ id: v.entryId, voucherNo: v.number, voucherId: id, kind: 'sales', date, narration: v.narration, lines: toJournal(linesOf(v, ctx), a.accountId), rule: POSTING_RULE, postedAt: v.postedAt, postedBy: 'system' });
    return v;
  };
  const v1 = posted('SI-0010', 141, 'DC-0618', '2026-10-05');
  const v2 = posted('SI-0011', 142, 'DC-0619', '2026-10-05');

  // SO-1 / DC-1 (Sri Lakshmi): Teja has pulled the challan into a draft at 10:30 (scenario B4-01).
  const dc1 = challans.find((c) => c.id === 'DC-1')!;
  const v3 = { ...newVoucher({ id: 'SI-0012', dc: dc1, at: '2026-10-07T10:30', accountId: accountForChallan(ctx, dc1)!.accountId, billed: () => 0 }), manual: blankEntry(method === 'perpetual') };
  return { challans, vouchers: [v1, v2, v3], journal, method };
}

/** A mock IRN: 64 hex characters, the same for the same invoice number. */
export function irnOf(no: string) {
  let h = 2166136261;
  let out = '';
  for (let i = 0; out.length < 64; i++) {
    h = Math.imul(h ^ no.charCodeAt(i % no.length) ^ i, 16777619) >>> 0;
    out += h.toString(16).padStart(8, '0');
  }
  return out.slice(0, 64);
}
