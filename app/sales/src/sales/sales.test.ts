// T24 Sales voucher entry (rev 6, Vijay 18-Nov): Billing raises the invoice and hands it over; the Accounts Executive
// books its accounting entry (ledgers suggested, pickable), Rajan approves and the entry posts.
import { beforeEach, describe, expect, it } from 'vitest';
import { useOnboarding } from '../onboarding/store';
import { LEDGERS } from './catalogue';
import { calcOf, checksOf, dueOf, entryDiffOf, entryOf, rankLedgers, stops, sum } from './rules';
import { goodsLine, type InvoiceSpec } from './seed';
import { ctxOf, useSales, voucherOf } from './store';
import { rupeesInWords } from './words';
import type { InvoiceLine } from './types';

const app = () => useOnboarding.getState();
const sl = () => useSales.getState();
const v = (id: string) => voucherOf(sl(), id)!;
const ctx = () => ctxOf(sl());
const checks = (id: string) => checksOf(v(id), ctx());
const stopTitles = (id: string) => stops(checks(id)).map((c) => c.title);
const warnTitles = (id: string) => checks(id).filter((c) => c.level === 'warn').map((c) => c.title);
const pendingOf = (id: string) => v(id).approvals.find((a) => a.status === 'pending')!;
const approveAll = (id: string) => v(id).approvals.filter((a) => a.status === 'pending').forEach((a) => sl().decide(id, a.id, 'approve'));
const entry = (id: string) => entryOf(v(id), ctx()).map((l) => [l.ledger === 'party' ? `party ${l.code}` : l.code, l.dr, l.cr]);
const receive = (spec: InvoiceSpec) => sl().receiveInvoice(spec)!;
const service = (item: string, rate: number, more: Partial<InvoiceLine> = {}): InvoiceLine => ({ kind: 'service', item, qty: 1, rate, discount: null, ...more });
const extra = (kind: 'charge' | 'reimbursement', rate: number): InvoiceLine => ({ kind, item: kind === 'charge' ? 'CH-FRT' : 'RE-01', qty: 1, rate, discount: null });
const B401: InvoiceSpec = { accountId: 'ACC-1201', lines: [goodsLine('FG-101', 600, 700), goodsLine('FG-102', 300, 975)], transport: { vehicleNo: 'KA01AB1234', distanceKm: 12 } };

beforeEach(() => {
  app().reset();
  sl().reset();
});

describe('the invoice comes from Billing; the AE books its entry (B4-01, SV-0012 → Sri Lakshmi)', () => {
  it('received already numbered, with its IRN: KA/INV/2627/0143; ₹7,12,500 + CGST + SGST = ₹7,48,125', () => {
    const x = v('SV-0012');
    expect([x.status, x.number, x.irn?.length]).toEqual(['draft', 'KA/INV/2627/0143', 64]);
    const c = calcOf(x, ctx());
    expect([c.intra, c.taxable, c.cgst, c.sgst, c.igst, c.total, c.rules]).toEqual([true, 7_12_500, 17_812.5, 17_812.5, 0, 7_48_125, ['R1']]);
    expect(rupeesInWords(c.total)).toBe('Indian Rupees Seven Lakh Forty Eight Thousand One Hundred Twenty Five Only');
  });

  it('the suggested entry (rule R1): Dr the customer on its receivable ledger · Cr sales · Cr output CGST · Cr output SGST', () => {
    expect(entry('SV-0012')).toEqual([['party 107100', 7_48_125, 0], ['401010', 0, 7_12_500], ['206011', 0, 17_812.5], ['206012', 0, 17_812.5]]);
    expect(entryDiffOf(v('SV-0012'), ctx())).toBeNull();
    expect(entryOf(v('SV-0012'), ctx()).some((l) => l.ledger === 'cogs' || l.ledger === 'fg_inventory')).toBe(false); // stock is Stores' (G30)
  });

  it('the AE cannot change the invoice: the store has no invoice setters, only the entry', () => {
    const st = sl() as unknown as Record<string, unknown>;
    for (const k of ['setLine', 'setField', 'addLine', 'createTyped', 'setSettlement']) expect(st[k]).toBeUndefined();
    for (const k of ['setLedger', 'setEditLine', 'submit', 'returnToBilling']) expect(typeof st[k]).toBe('function');
  });

  it('the inbox: three invoices to book, two already posted', () => {
    expect(sl().vouchers.filter((x) => x.status === 'draft').map((x) => [x.id, x.number])).toEqual([['SV-0012', 'KA/INV/2627/0143'], ['SV-0013', 'KA/INV/2627/0144'], ['SV-0014', 'KA/EXP/2627/0001']]);
    const je = sl().journal.find((e) => e.voucherNo === 'KA/INV/2627/0141')!;
    expect(je.lines[0]).toMatchObject({ ledger: 'party', accountId: 'ACC-1205', code: '107010', dr: 75_600 });
  });

  it('submit → Rajan approves → the entry posts (R1); the customer owes more; the maker may not decide', () => {
    const before = dueOf(sl(), 'ACC-1201');
    expect(stopTitles('SV-0012')).toEqual([]);
    sl().submit('SV-0012');
    expect(sl().decide('SV-0012', pendingOf('SV-0012').id, 'approve', { by: 'teja' })).toBe(false); // K19
    approveAll('SV-0012');
    const x = v('SV-0012');
    expect([x.status, x.number]).toEqual(['posted', 'KA/INV/2627/0143']);
    expect(dueOf(sl(), 'ACC-1201')).toBe(before + 7_48_125);
    const je = sl().journal.find((e) => e.id === x.entryId)!;
    expect(je.rule).toBe('SALES_INVOICE v1 (effective 1-Apr-2026) · R1');
    const all = sl().journal.flatMap((e) => e.lines);
    expect(sum(all).dr).toBe(sum(all).cr);
  });

  it('Kerala Traders (SV-0013): inter-state R2: one IGST line; Gulf Snack (SV-0014): export under LUT R4, no GST line', () => {
    expect(entry('SV-0013')).toEqual([['party 107010', 60_480, 0], ['401010', 0, 57_600], ['206013', 0, 2_880]]);
    expect(entry('SV-0014')).toEqual([['party 107040', 9_39_840, 0], ['401030', 0, 9_39_840]]);
  });

  it("an export with IGST (the CA's C2): the buyer owes the value only; Dr IGST Refund Receivable (R5)", () => {
    const id = receive({ accountId: 'ACC-1203', lines: [goodsLine('FG-101', 1_200, 8.9)], exportType: 'igst' });
    expect(entry(id)).toEqual([['party 107040', 9_39_840, 0], ['109040', 46_992, 0], ['401030', 0, 9_39_840], ['206013', 0, 46_992]]);
  });

  it('periods: an invoice dated in a closed month cannot be booked; a soft-closed month warns (K7, K8)', () => {
    expect(stopTitles(receive({ ...B401, date: '2026-08-31' }))).toContain('Aug-2026 is closed');
    expect(warnTitles(receive({ ...B401, date: '2026-09-30' }))).toContain('Sep-2026 is soft-closed');
  });

  it('an invoice that cannot be booked goes back to Billing with a reason: nothing posts', () => {
    const before = sl().journal.length;
    sl().returnToBilling('SV-0013', 'GST does not match the place of supply');
    expect([v('SV-0013').status, v('SV-0013').returned?.reason]).toEqual(['returned', 'GST does not match the place of supply']);
    expect(sl().journal).toHaveLength(before);
  });
});

describe('the entry: suggested ledgers, the AE may pick others (§8.4)', () => {
  it('pick another sales ledger (no reason needed): Rajan sees "entry differs from rule"', () => {
    sl().setLedger('SV-0012', 'rev:sale_products', 'sale_services');
    expect(v('SV-0012').edit?.amounts).toBeFalsy();
    expect(stopTitles('SV-0012')).toEqual([]);
    expect(warnTitles('SV-0012')).toContain('Entry differs from rule R1: line 2');
    sl().setEditLine('SV-0012', 'rev:sale_products', { reason: 'Co-packed stock billed as a service (illustrative)' });
    sl().submit('SV-0012');
    expect(v('SV-0012').approvals[0].entryDiff).toBe('Entry differs from rule R1: line 2');
    approveAll('SV-0012');
    const je = sl().journal.find((e) => e.id === v('SV-0012').entryId)!;
    expect(je.edit).toEqual({ by: 'teja', approvedBy: 'rajan', diff: 'Entry differs from rule R1: line 2', reasons: ['Sale of Services: Co-packed stock billed as a service (illustrative)'] });
  });

  it('picking the suggestion again is the rule again; a changed amount still needs a reason', () => {
    sl().setLedger('SV-0012', 'rev:sale_products', 'sale_services');
    sl().setLedger('SV-0012', 'rev:sale_products', 'sale_products');
    expect(entryDiffOf(v('SV-0012'), ctx())).toBeNull();
    sl().setEditing('SV-0012', true);
    sl().setEditLine('SV-0012', 'rev:sale_products', { cr: 7_00_000 });
    expect(stopTitles('SV-0012')).toContain('Line 2: a reason is needed for the change');
  });

  it('the customer and GST lines: their ledger is a suggestion too; their amount stays the invoice amount', () => {
    sl().setLedger('SV-0012', 'party', 'ar_107010');
    sl().setLedger('SV-0012', 'tax:cgst', 'statutory_dues'); // a group: refused
    expect(stops(checks('SV-0012')).map((c) => c.code)).toContain('LEDGER_NOT_POSTABLE');
    sl().setLedger('SV-0012', 'tax:cgst', 'out_sgst'); // CGST into the SGST ledger: refused
    expect(stopTitles('SV-0012').some((t) => t.startsWith('Output SGST in the entry is ₹35,625.00'))).toBe(true);
    sl().setLedger('SV-0012', 'tax:cgst', 'out_cgst');
    expect(entry('SV-0012')).toEqual([['party 107010', 7_48_125, 0], ['401010', 0, 7_12_500], ['206011', 0, 17_812.5], ['206012', 0, 17_812.5]]);
    sl().submit('SV-0012');
    approveAll('SV-0012');
    expect(sl().journal.find((e) => e.id === v('SV-0012').entryId)!.lines[0]).toMatchObject({ ledger: 'party', accountId: 'ACC-1201', code: '107010', dr: 7_48_125 });
  });

  it('a group or a receivable ledger on a revenue line stops (LEDGER_NOT_POSTABLE); revenue into a tax ledger stops', () => {
    sl().setEditing('SV-0012', true);
    sl().setEditLine('SV-0012', 'rev:sale_products', { ledger: 'statutory_dues', reason: 'x' });
    expect(stopTitles('SV-0012')).toContain('Line 2: Statutory Dues Payable (206010) is a group, not a ledger');
    sl().setEditLine('SV-0012', 'rev:sale_products', { ledger: 'ar_107010' });
    expect(stopTitles('SV-0012')).toContain('Line 2: Trade Receivables – Domestic (107010) is a receivable ledger');
    sl().setEditLine('SV-0012', 'rev:sale_products', { ledger: 'out_cgst' });
    expect(stopTitles('SV-0012').some((t) => t.startsWith('Output CGST in the entry is ₹7,30,312.50'))).toBe(true);
  });

  it('split a line: Dr = Cr must hold (K16); off again = back to the rule', () => {
    sl().setEditing('SV-0012', true);
    sl().splitEditLine('SV-0012', 'rev:sale_products');
    sl().setEditLine('SV-0012', 'split:1', { ledger: 'sale_services', cr: 12_500 });
    expect(stopTitles('SV-0012')).toContain('Dr ₹7,48,125.00 ≠ Cr ₹7,60,625.00');
    sl().setEditLine('SV-0012', 'rev:sale_products', { cr: 7_00_000, reason: 'Part is a service' });
    sl().setEditLine('SV-0012', 'split:1', { reason: 'Packing service on the order' });
    expect(stopTitles('SV-0012')).toEqual([]);
    sl().setEditing('SV-0012', false);
    expect(entryDiffOf(v('SV-0012'), ctx())).toBeNull();
  });

  it('the picker: the suggested ledger first; typing sorts code matches, then name matches; never a group or a receivable ledger', () => {
    expect(rankLedgers('', 'sale_services')[0]).toBe('sale_services');
    expect(rankLedgers('4010').every((k) => LEDGERS[k].code.startsWith('4010'))).toBe(true);
    expect(rankLedgers('sale').every((k) => LEDGERS[k].name.toLowerCase().includes('sale'))).toBe(true);
    expect(rankLedgers('').some((k) => LEDGERS[k].isGroup || LEDGERS[k].accountType === 'receivable')).toBe(false);
    expect(rankLedgers('zzzz')).toEqual([]);
  });
});

describe('Rajan decides: approve · send back · reject (maker ≠ checker, a reason to say no)', () => {
  it('send back needs a reason; the voucher comes back to the AE, who sends it again', () => {
    sl().submit('SV-0012');
    expect(sl().decide('SV-0012', pendingOf('SV-0012').id, 'send_back')).toBe(false);
    expect(sl().decide('SV-0012', pendingOf('SV-0012').id, 'send_back', { reason: 'Use the suggested sales ledger' })).toBe(true);
    expect([v('SV-0012').status, v('SV-0012').decisionReason]).toEqual(['draft', 'Rajan: Use the suggested sales ledger']);
    sl().submit('SV-0012');
    approveAll('SV-0012');
    expect(v('SV-0012').status).toBe('posted');
  });

  it('reject ends it: nothing posted', () => {
    sl().submit('SV-0012');
    const before = sl().journal.length;
    sl().decide('SV-0012', pendingOf('SV-0012').id, 'reject', { reason: 'Duplicate of an entry already posted' });
    expect(v('SV-0012').status).toBe('rejected');
    expect(sl().journal).toHaveLength(before);
  });
});

describe("the CA's specimens: the entry the rule suggests for each kind of invoice", () => {
  it('a service (R3): N-1 co-packing ₹72,000 + GST 18% → Sale of Services 401020', () => {
    const id = receive({ accountId: 'ACC-1204', lines: [service('SV-01', 72_000)] });
    expect(entry(id)).toEqual([['party 107010', 84_960, 0], ['401020', 0, 72_000], ['206011', 0, 6_480], ['206012', 0, 6_480]]);
  });

  it('issued by TN-01 to a Karnataka customer: inter-state IGST; the journal carries branch TN-01', () => {
    const id = receive({ accountId: 'ACC-1204', branch: 'TN-01', lines: [service('SV-01', 72_000)] });
    expect(v(id).number).toBe('TN/INV/2627/0001');
    expect(entry(id)).toEqual([['party 107010', 84_960, 0], ['401020', 0, 72_000], ['206013', 0, 12_960]]);
    sl().submit(id);
    approveAll(id);
    expect(sl().journal.find((e) => e.id === v(id).entryId)!.branch).toBe('TN-01');
  });

  it('F2 bill-to-ship-to (D4): billing Chennai, goods to a third party in Karnataka → IGST', () => {
    const id = receive({ ...B401, branchId: 'BR-0002', thirdPartyShipTo: { name: 'Metro Builders (site)', line: 'Survey No. 112, Whitefield', city: 'Bengaluru', pincode: '560066', stateCode: 'KA' } });
    const c = calcOf(v(id), ctx());
    expect([c.pos, c.posBasis, c.igst]).toEqual(['TN', 'goods_bill_to_third_party', 35_625]);
  });

  it('A8 freight charged → Freight Recovered (R10); B5 pure-agent expense → Expenses Recoverable, no GST (R11)', () => {
    const f = receive({ ...B401, lines: [...B401.lines, extra('charge', 2_000)] });
    expect(entry(f)).toContainEqual(['401070', 0, 2_000]);
    expect(calcOf(v(f), ctx()).total).toBe(7_50_225);
    const r = receive({ ...B401, lines: [...B401.lines, extra('reimbursement', 5_000)] });
    expect(entry(r)).toContainEqual(['110030', 0, 5_000]);
  });

  it('A3 paid now by UPI → Dr UPI / Card Clearing; the customer owes nothing more (R8)', () => {
    const owed = dueOf(sl(), 'ACC-1201');
    const id = receive({ ...B401, settlement: 'upi_card', paymentRef: 'UPI 6312 0987 4455' });
    expect(entry(id)[0]).toEqual(['108030', 7_48_125, 0]);
    sl().submit(id);
    approveAll(id);
    expect(dueOf(sl(), 'ACC-1201')).toBe(owed);
  });

  it('A6 / B4 a Bill of Supply (only exempt lines): Sales – Exempt 401050, no GST, no IRN (R9)', () => {
    const id = receive({ accountId: 'ACC-1204', lines: [service('SV-03', 30_000)] });
    expect([v(id).number, v(id).irn]).toEqual(['KA/BOS/2627/0001', undefined]);
    expect(entry(id)).toEqual([['party 107010', 30_000, 0], ['401050', 0, 30_000]]);
  });

  it('B6 a period service billed in advance → Contract Liability (R12)', () => {
    const id = receive({ accountId: 'ACC-1204', lines: [service('SV-02', 10_000, { qty: 12, periodFrom: '2026-10-07', periodUntil: '2027-10-06' })] });
    expect(entry(id)).toEqual([['party 107010', 1_41_600, 0], ['206040', 0, 1_20_000], ['206011', 0, 10_800], ['206012', 0, 10_800]]);
  });

  it('B3 a service on immovable property in Tamil Nadu → place of supply Tamil Nadu, IGST', () => {
    const id = receive({ accountId: 'ACC-1204', lines: [service('SV-01', 1_00_000)], propertyState: 'TN' });
    expect([calcOf(v(id), ctx()).pos, calcOf(v(id), ctx()).igst]).toEqual(['TN', 18_000]);
  });
});
