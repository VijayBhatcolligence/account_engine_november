// Mock data for T24 (rev 6, Vijay 18-Nov: Billing raises the invoice and hands it over; the AE books its entry):
//   SV-0010, SV-0011  Namma Bakes: KA/INV/2627/0141, 0142, booked and posted on 05-Oct
//   SV-0012           Sri Lakshmi Distributors: KA/INV/2627/0143 received (scenario B4-01: 600 ctn glucose at ₹700 + 300 ctn
//                     cream at ₹975), to book
//   SV-0013           Kerala Traders: KA/INV/2627/0144 received (inter-state), to book
//   SV-0014           Gulf Snack Imports: KA/EXP/2627/0001 received (export under LUT, USD), to book

import { seedAccounts, seedParties, seedRequests } from '../onboarding/seed';
import { ITEMS, PARAMS } from './catalogue';
import { calcOf, currencyOf, einvoiceRequired, entryOf, ewbDays, ewbNeeded, exportTypeOf, kindOf, narrationOf, nextNumber, POSTING_RULE, seriesOf, toJournal, type SalesCtx } from './rules';
import type { Account } from '../onboarding/types';
import type { InvoiceLine, JournalEntry, Voucher } from './types';

const je = (n: number) => `JE-${String(n).padStart(6, '0')}`;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** A goods line of the item master: name, HSN, UQC and GST come with the item; the rate starts at its list price. */
export const goodsLine = (item: string, qty: number | null = null, rate?: number): InvoiceLine => ({ kind: 'goods', item, qty, rate: rate ?? ITEMS[item]?.price ?? null, discount: null });

/** What Billing hands over: the invoice as it raised it (mock: the facts its event carries). */
export interface InvoiceSpec {
  accountId: string;
  branch?: string;
  date?: string;
  lines: InvoiceLine[];
  settlement?: Voucher['settlement'];
  paymentRef?: string;
  branchId?: string;
  shipToId?: string;
  thirdPartyShipTo?: Voucher['thirdPartyShipTo'];
  propertyState?: string;
  exportType?: 'lut' | 'igst';
  fxRate?: number;
  incoterm?: string;
  portCode?: string;
  shippingBillNo?: string;
  orderRef?: string;
  advanceRef?: string;
  advanceAmount?: number;
  transport?: Voucher['transport'];
}

const blank = (o: { id: string; at: string; accountId: string }): Voucher => ({
  id: o.id,
  number: null,
  status: 'draft',
  branch: 'KA-01',
  maker: 'teja',
  arrivedAt: o.at,
  date: o.at.slice(0, 10),
  accountId: o.accountId,
  narration: '',
  lines: [],
  currency: 'INR',
  fxRate: null,
  portCode: '',
  settlement: 'credit',
  paymentRef: '',
  transport: { vehicleNo: '', distanceKm: null },
  incoterm: '',
  orderRef: '',
  advanceRef: '',
  advanceAmount: null,
  shippingBillNo: '',
  shippingBillDate: '',
  approvals: [],
  history: [],
});

/** Billing's invoice, as it reaches the AE: already numbered (its series), with its IRN and e-way bill when they apply. */
export function received(o: { id: string; at: string; account: Account; ctx: SalesCtx; spec: InvoiceSpec; used: (string | null)[] }): Voucher {
  const { spec } = o;
  const v = blank({ id: o.id, at: o.at, accountId: o.account.accountId });
  v.currency = currencyOf(o.ctx, o.account);
  v.fxRate = v.currency === 'INR' ? null : spec.fxRate ?? PARAMS.fxUsd.value;
  Object.assign(v, {
    branch: spec.branch ?? 'KA-01',
    date: spec.date ?? o.at.slice(0, 10),
    lines: spec.lines,
    settlement: spec.settlement ?? 'credit',
    paymentRef: spec.paymentRef ?? (spec.settlement && spec.settlement !== 'credit' ? 'UPI 6312 0987 4455' : ''),
    transport: spec.transport ?? { vehicleNo: '', distanceKm: null },
    incoterm: spec.incoterm ?? '',
    portCode: spec.portCode ?? '',
    shippingBillNo: spec.shippingBillNo ?? '',
    orderRef: spec.orderRef ?? '',
    advanceRef: spec.advanceRef ?? '',
    advanceAmount: spec.advanceAmount ?? null,
  });
  if (spec.branchId) v.branchId = spec.branchId;
  if (spec.shipToId) v.shipToId = spec.shipToId;
  if (spec.thirdPartyShipTo) v.thirdPartyShipTo = spec.thirdPartyShipTo;
  if (spec.propertyState) v.propertyState = spec.propertyState;
  if (kindOf(o.ctx, o.account) !== 'domestic') v.exportType = spec.exportType ?? exportTypeOf(v);
  const c = calcOf(v, o.ctx);
  // Billing's KA invoice series stood at 0140 on 05-Oct (scenario: 0141 and 0142 were Namma Bakes').
  v.number = nextNumber([...o.used, 'KA/INV/2627/0140'], seriesOf(v, c));
  if (einvoiceRequired(c)) {
    v.irn = irnOf(v.number);
    v.ackNo = `1126${String(Date.parse(`${o.at}:00Z`) % 1e11).padStart(11, '0')}`;
    v.ackAt = o.at;
  }
  if (ewbNeeded(c) && Number(v.transport.distanceKm) > 0) {
    v.ewbNo = `3410${String(Number.parseInt(irnOf(v.number).slice(0, 7), 16) % 1e8).padStart(8, '0')}`;
    v.ewbValidTo = addDays(v.date, ewbDays(Number(v.transport.distanceKm)) - 1);
  }
  v.narration = narrationOf(v, o.ctx);
  v.history.push({ at: o.at, by: 'billing', text: `Invoice ${v.number} received from Billing${v.irn ? ' (IRN registered)' : ''}: book its entry` });
  return v;
}

export function seedSales(): { vouchers: Voucher[]; journal: JournalEntry[] } {
  const accounts = seedAccounts();
  const ctx: SalesCtx = { accounts, parties: seedParties(), requests: seedRequests(accounts), journal: [], vouchers: [], now: '2026-10-07T11:05' };
  const journal: JournalEntry[] = [];
  let n = 225;
  const acc = (id: string) => accounts.find((a) => a.accountId === id)!;
  const take = (id: string, at: string, spec: InvoiceSpec) => {
    const v = received({ id, at, account: acc(spec.accountId), ctx, spec, used: ctx.vouchers.map((x) => x.number) });
    ctx.vouchers.push(v);
    return v;
  };
  const posted = (v: Voucher) => {
    const a = acc(v.accountId);
    const c = calcOf(v, ctx);
    const d = v.date;
    Object.assign(v, { status: 'posted', submittedAt: `${d}T10:30`, postedAt: `${d}T11:05`, entryId: je(++n) });
    v.approvals = [{ id: `APR-${v.id.slice(3)}-1`, why: 'invoice', label: 'Entry check', checker: 'rajan', status: 'approved', decidedAt: `${d}T11:05` }];
    v.history.push({ at: `${d}T10:30`, by: 'teja', text: 'Entry booked and sent to Rajan' }, { at: `${d}T11:05`, by: 'rajan', text: `Approved · posted ${v.entryId}` });
    journal.push({ id: v.entryId!, voucherNo: v.number!, voucherId: v.id, kind: 'sales', branch: v.branch, date: d, narration: v.narration, lines: toJournal(entryOf(v, ctx), a.accountId), rule: `${POSTING_RULE} · ${c.rules.join(' + ')}`, postedAt: v.postedAt!, postedBy: 'system' });
  };
  posted(take('SV-0010', '2026-10-05T10:00', { accountId: 'ACC-1205', date: '2026-10-05', lines: [goodsLine('FG-101', 100, 720)], transport: { vehicleNo: 'KA05MN4411', distanceKm: 18 } }));
  posted(take('SV-0011', '2026-10-05T10:05', { accountId: 'ACC-1205', date: '2026-10-05', lines: [goodsLine('FG-102', 100, 990)], transport: { vehicleNo: 'KA05MN4411', distanceKm: 18 } }));
  // Received today, to book (scenario B4-01 first).
  take('SV-0012', '2026-10-07T10:30', { accountId: 'ACC-1201', lines: [goodsLine('FG-101', 600, 700), goodsLine('FG-102', 300, 975)], transport: { vehicleNo: 'KA01AB1234', distanceKm: 12 } });
  take('SV-0013', '2026-10-07T10:40', { accountId: 'ACC-1206', lines: [goodsLine('FG-101', 80)], transport: { vehicleNo: 'KL07AQ9012', distanceKm: 560 } });
  take('SV-0014', '2026-10-07T10:50', { accountId: 'ACC-1203', lines: [goodsLine('FG-101', 1_200, 8.9)], portCode: 'INMAA1', incoterm: 'FOB' });
  return { vouchers: ctx.vouchers, journal };
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
