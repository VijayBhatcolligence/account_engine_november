// T24 Sales voucher entry, the recording model (REC, Vijay 27-Nov-2026): Billing raises the invoice and hands it over; the
// Accounts Executive TYPES its entry, like Tally (no posting rule, no ledger mapping in this app); the document's amounts and
// the cost from inventory are calculated; the checks compare the typed entry with them; Rajan approves and the entry posts.
import { beforeEach, describe, expect, it } from 'vitest';
import { useOnboarding } from '../onboarding/store';
import { LEDGERS } from './catalogue';
import { calcOf, checksOf, costLinesOf, dueOf, entryOf, rankLedgers, stops, sum } from './rules';
import { stockValue } from './inventory';
import { goodsLine, type InvoiceSpec } from './seed';
import { ctxOf, useSales, voucherOf } from './store';
import { rupeesInWords } from './words';
import type { InvoiceLine } from './types';

const app = () => useOnboarding.getState();
const sl = () => useSales.getState();
const v = (id: string) => voucherOf(sl(), id)!;
const ctx = () => ctxOf(sl());
const checks = (id: string) => checksOf(v(id), ctx());
const stopCodes = (id: string) => stops(checks(id)).map((c) => c.code);
const stopTitles = (id: string) => stops(checks(id)).map((c) => c.title);
const warnCodes = (id: string) => checks(id).filter((c) => c.level === 'warn').map((c) => c.code);
const pendingOf = (id: string) => v(id).approvals.find((a) => a.status === 'pending')!;
const approveAll = (id: string) => v(id).approvals.filter((a) => a.status === 'pending').forEach((a) => sl().decide(id, a.id, 'approve'));
const entry = (id: string) => entryOf(v(id), ctx()).map((l) => [l.ledger === 'party' ? `party ${l.code}` : l.code, l.dr, l.cr]);
const receive = (spec: InvoiceSpec) => sl().receiveInvoice(spec)!;
const service = (item: string, rate: number, more: Partial<InvoiceLine> = {}): InvoiceLine => ({ kind: 'service', item, qty: 1, rate, discount: null, ...more });
const extra = (kind: 'charge' | 'reimbursement', rate: number): InvoiceLine => ({ kind, item: kind === 'charge' ? 'CH-FRT' : 'RE-01', qty: 1, rate, discount: null });
const B401: InvoiceSpec = { accountId: 'ACC-1201', lines: [goodsLine('FG-101', 600, 700), goodsLine('FG-102', 300, 975)], transport: { vehicleNo: 'KA01AB1234', distanceKm: 12 } };

/** The AE clears the entry and types his own lines: [ledger key or 'party', Dr, Cr]. */
const type = (id: string, lines: [string, number, number][]) => {
  sl().clearEntry(id); // "clear and type my own"
  for (const [ledger, dr, cr] of lines) sl().addLine(id, { ledger, dr, cr });
};
/** B4-01 as the AE types it (the CA's A1 shape): the customer, the sales, CGST, SGST, and the cost from inventory. */
const typeB401 = () => {
  type('SV-0012', [['party', 7_48_125, 0], ['sale_products', 0, 7_12_500], ['out_cgst', 0, 17_812.5], ['out_sgst', 0, 17_812.5]]);
  sl().addCostLines('SV-0012');
};

beforeEach(() => {
  app().reset();
  sl().reset();
});

describe('the invoice comes from Billing; the AE types its entry (B4-01, SV-0012 → Sri Lakshmi)', () => {
  it('received already numbered, with its IRN; the amounts are calculated: ₹7,12,500 + CGST + SGST = ₹7,48,125', () => {
    const x = v('SV-0012');
    expect([x.status, x.number, x.irn?.length]).toEqual(['draft', 'KA/INV/2627/0143', 64]);
    const c = calcOf(x, ctx());
    expect([c.intra, c.taxable, c.cgst, c.sgst, c.igst, c.total]).toEqual([true, 7_12_500, 17_812.5, 17_812.5, 0, 7_48_125]);
    expect(rupeesInWords(c.total)).toBe('Indian Rupees Seven Lakh Forty Eight Thousand One Hundred Twenty Five Only');
  });

  it('the entry is shown filled by default (the document\'s amounts on the usual ledgers + the cost from inventory): the CA\'s A1, no stop', () => {
    expect(entry('SV-0012')).toEqual([['party 107100', 7_48_125, 0], ['401010', 0, 7_12_500], ['206011', 0, 17_812.5], ['206012', 0, 17_812.5], ['501040', 1_62_000, 0], ['106020', 0, 1_62_000], ['501040', 1_68_000, 0], ['106020', 0, 1_68_000], ['501040', 2_28_000, 0], ['106020', 0, 2_28_000]]);
    expect(v('SV-0012').edit).toBeUndefined(); // nothing typed yet: the default
    expect(stopCodes('SV-0012')).toEqual([]);
  });

  it('editing it is the AE\'s choice: a change starts from the default; "back to the default" undoes it; "clear" empties it (Submit then stops)', () => {
    const first = entryOf(v('SV-0012'), ctx())[1];
    sl().setLine('SV-0012', first.id, { ledger: 'sale_services' });
    expect(entry('SV-0012')[1]).toEqual(['401020', 0, 7_12_500]);
    expect(v('SV-0012').edit?.lines).toHaveLength(10);
    sl().resetEntry('SV-0012');
    expect(entry('SV-0012')[1]).toEqual(['401010', 0, 7_12_500]);
    sl().clearEntry('SV-0012');
    expect(entryOf(v('SV-0012'), ctx())).toEqual([]);
    expect(stopCodes('SV-0012')).toContain('ENTRY_EMPTY');
  });

  it('the default posts as it is when the AE accepts it', () => {
    sl().submit('SV-0012');
    approveAll('SV-0012');
    expect(v('SV-0012').status).toBe('posted');
  });

  it('typed (the customer, sales, CGST, SGST) + the cost from inventory (one click, FIFO): no stop, no warning', () => {
    typeB401();
    expect(entry('SV-0012')).toEqual([['party 107100', 7_48_125, 0], ['401010', 0, 7_12_500], ['206011', 0, 17_812.5], ['206012', 0, 17_812.5], ['501040', 1_62_000, 0], ['106020', 0, 1_62_000], ['501040', 1_68_000, 0], ['106020', 0, 1_68_000], ['501040', 2_28_000, 0], ['106020', 0, 2_28_000]]);
    expect(stopCodes('SV-0012')).toEqual([]);
    expect(warnCodes('SV-0012')).not.toContain('ENTRY_VS_DOCUMENT');
  });

  it('the AE cannot change the invoice: the store has no invoice setters, only the entry', () => {
    const st = sl() as unknown as Record<string, unknown>;
    for (const k of ['setField', 'createTyped', 'setSettlement', 'setLedger', 'setEditing']) expect(st[k]).toBeUndefined();
    for (const k of ['addLine', 'setLine', 'removeLine', 'addCostLines', 'submit', 'returnToBilling']) expect(typeof st[k]).toBe('function');
  });

  it('the inbox: three invoices to book, two already posted (their entries as typed)', () => {
    expect(sl().vouchers.filter((x) => x.status === 'draft').map((x) => [x.id, x.number])).toEqual([['SV-0012', 'KA/INV/2627/0143'], ['SV-0013', 'KA/INV/2627/0144'], ['SV-0014', 'KA/EXP/2627/0001']]);
    const je = sl().journal.find((e) => e.voucherNo === 'KA/INV/2627/0141')!;
    expect(je.lines[0]).toMatchObject({ ledger: 'party', accountId: 'ACC-1205', code: '107010', dr: 75_600 });
    expect(je.rule).toBe('Typed by Teja, approved by Rajan');
  });

  it('submit → Rajan approves → the entry posts as typed; the customer owes more; the maker may not decide', () => {
    const before = dueOf(sl(), 'ACC-1201');
    typeB401();
    sl().submit('SV-0012');
    expect(sl().decide('SV-0012', pendingOf('SV-0012').id, 'approve', { by: 'teja' })).toBe(false); // K19
    approveAll('SV-0012');
    const x = v('SV-0012');
    expect([x.status, x.number]).toEqual(['posted', 'KA/INV/2627/0143']);
    expect(dueOf(sl(), 'ACC-1201')).toBe(before + 7_48_125);
    const je = sl().journal.find((e) => e.id === x.entryId)!;
    expect(je.rule).toBe('Typed by Teja, approved by Rajan · cost from inventory (FIFO)');
    const all = sl().journal.flatMap((e) => e.lines);
    expect(sum(all).dr).toBe(sum(all).cr);
  });

  it('periods: an invoice dated in a closed month cannot be booked; a soft-closed month warns (K7, K8)', () => {
    expect(stopTitles(receive({ ...B401, date: '2026-08-31' }))).toContain('Aug-2026 is closed');
    expect(checks(receive({ ...B401, date: '2026-09-30' })).filter((c) => c.level === 'warn').map((c) => c.title)).toContain('Sep-2026 is soft-closed');
  });

  it('an invoice that cannot be booked goes back to Billing with a reason: nothing posts', () => {
    const before = sl().journal.length;
    sl().returnToBilling('SV-0013', 'GST does not match the place of supply');
    expect([v('SV-0013').status, v('SV-0013').returned?.reason]).toEqual(['returned', 'GST does not match the place of supply']);
    expect(sl().journal).toHaveLength(before);
  });
});

describe('the checks on a typed entry', () => {
  it('Dr ≠ Cr stops (K16); a line with both Dr and Cr, or with no amount, stops (K17)', () => {
    type('SV-0012', [['party', 7_48_125, 0], ['sale_products', 0, 7_00_000]]);
    expect(stopCodes('SV-0012')).toContain('ENTRY_NOT_BALANCED');
    sl().addLine('SV-0012', { ledger: 'round_off' });
    expect(stopTitles('SV-0012')).toContain('Line 3: no amount');
  });

  it('never a group ledger; a receivable ledger only through the customer (LEDGER_NOT_POSTABLE)', () => {
    type('SV-0012', [['statutory_dues', 0, 1], ['ar_107010', 1, 0]]);
    expect(stopTitles('SV-0012')).toEqual(expect.arrayContaining(['Line 1: Statutory Dues Payable (206010) is a group, not a ledger', 'Line 2: Trade Receivables – Domestic (107010) is a receivable ledger']));
  });

  it('typing one side clears the other; a removed line is gone', () => {
    sl().clearEntry('SV-0012');
    sl().addLine('SV-0012', { ledger: 'sale_products', dr: 10 });
    const id = v('SV-0012').edit!.lines[0].id;
    sl().setLine('SV-0012', id, { cr: 10 });
    expect(v('SV-0012').edit!.lines[0]).toMatchObject({ dr: 0, cr: 10 });
    sl().removeLine('SV-0012', id);
    expect(v('SV-0012').edit!.lines).toEqual([]);
  });

  it('the entry against the document: a different customer amount or GST is a warning Rajan sees (K27), not a stop', () => {
    type('SV-0012', [['party', 7_48_000, 0], ['sale_products', 0, 7_12_375], ['out_igst', 0, 35_625]]);
    sl().addCostLines('SV-0012');
    expect(stopCodes('SV-0012')).toEqual([]);
    const w = checks('SV-0012').filter((c) => c.code === 'ENTRY_VS_DOCUMENT').map((c) => c.title);
    expect(w).toEqual(expect.arrayContaining(['The customer line is ₹7,48,000.00 Dr; the document says ₹7,48,125.00 Dr', "Output CGST in the entry is ₹0.00; the document's CGST is ₹17,812.50", "Output IGST in the entry is ₹35,625.00; the document's IGST is ₹0.00"]));
  });

  it('the cost of goods sold must equal inventory (stock goes out on approval): missing → COST_NOT_IN_ENTRY', () => {
    type('SV-0012', [['party', 7_48_125, 0], ['sale_products', 0, 7_12_500], ['out_cgst', 0, 17_812.5], ['out_sgst', 0, 17_812.5]]);
    expect(stopCodes('SV-0012')).toContain('COST_NOT_IN_ENTRY'); // the AE removed the cost lines
    sl().addCostLines('SV-0012');
    expect(stopCodes('SV-0012')).toEqual([]);
  });

  it('the picker: the chart by code; typing sorts code matches, then name matches; never a group or a receivable ledger', () => {
    expect(rankLedgers('4010').every((k) => LEDGERS[k].code.startsWith('4010'))).toBe(true);
    expect(rankLedgers('sale').every((k) => LEDGERS[k].name.toLowerCase().includes('sale'))).toBe(true);
    expect(rankLedgers('').some((k) => LEDGERS[k].isGroup || LEDGERS[k].accountType === 'receivable')).toBe(false);
    expect(rankLedgers('zzzz')).toEqual([]);
  });
});

describe('Rajan decides: approve · send back · reject (maker ≠ checker, a reason to say no)', () => {
  it('send back needs a reason; the voucher comes back to the AE, who sends it again', () => {
    typeB401();
    sl().submit('SV-0012');
    expect(sl().decide('SV-0012', pendingOf('SV-0012').id, 'send_back')).toBe(false);
    expect(sl().decide('SV-0012', pendingOf('SV-0012').id, 'send_back', { reason: 'Use Sale of Products' })).toBe(true);
    expect([v('SV-0012').status, v('SV-0012').decisionReason]).toEqual(['draft', 'Rajan: Use Sale of Products']);
    sl().submit('SV-0012');
    approveAll('SV-0012');
    expect(v('SV-0012').status).toBe('posted');
  });

  it('reject ends it: nothing posted', () => {
    typeB401();
    sl().submit('SV-0012');
    const before = sl().journal.length;
    sl().decide('SV-0012', pendingOf('SV-0012').id, 'reject', { reason: 'Duplicate of an entry already posted' });
    expect(v('SV-0012').status).toBe('rejected');
    expect(sl().journal).toHaveLength(before);
  });
});

describe("the CA's specimens: the amounts are calculated; the default entry, and the CA's entry typed, agree with the document", () => {
  const agrees = (id: string) => {
    expect(stopCodes(id)).toEqual([]);
    expect(warnCodes(id)).not.toContain('ENTRY_VS_DOCUMENT');
  };
  const byDefault = (id: string) => entryOf(v(id), ctx()).filter((l) => !l.item).map((l) => [l.ledger === 'party' ? 'party' : l.code, l.dr, l.cr]);

  it('the default entry for each kind: service · inter-state · export (LUT / with IGST) · exempt · period service · freight · pure agent · UPI', () => {
    const svc = receive({ accountId: 'ACC-1204', lines: [service('SV-01', 72_000)] });
    expect(byDefault(svc)).toEqual([['party', 84_960, 0], ['401020', 0, 72_000], ['206011', 0, 6_480], ['206012', 0, 6_480]]);
    expect(byDefault('SV-0013')).toEqual([['party', 60_480, 0], ['401010', 0, 57_600], ['206013', 0, 2_880]]);
    expect(byDefault('SV-0014')).toEqual([['party', 9_39_840, 0], ['401030', 0, 9_39_840]]);
    const igst = receive({ accountId: 'ACC-1203', lines: [goodsLine('FG-101', 1_200, 8.9)], exportType: 'igst' });
    expect(byDefault(igst)).toEqual([['party', 9_39_840, 0], ['109040', 46_992, 0], ['401030', 0, 9_39_840], ['206013', 0, 46_992]]);
    expect(byDefault(receive({ accountId: 'ACC-1204', lines: [service('SV-03', 30_000)] }))).toEqual([['party', 30_000, 0], ['401050', 0, 30_000]]);
    expect(byDefault(receive({ accountId: 'ACC-1204', lines: [service('SV-02', 10_000, { qty: 12, periodFrom: '2026-10-07', periodUntil: '2027-10-06' })] }))).toEqual([['party', 1_41_600, 0], ['206040', 0, 1_20_000], ['206011', 0, 10_800], ['206012', 0, 10_800]]);
    expect(byDefault(receive({ ...B401, lines: [...B401.lines, extra('charge', 2_000)] }))).toContainEqual(['401070', 0, 2_000]);
    expect(byDefault(receive({ ...B401, lines: [...B401.lines, extra('reimbursement', 5_000)] }))).toContainEqual(['110030', 0, 5_000]);
    expect(byDefault(receive({ ...B401, settlement: 'upi_card', paymentRef: 'UPI 6312' }))[0]).toEqual(['108030', 7_48_125, 0]);
    for (const id of [svc, 'SV-0013', 'SV-0014', igst]) agrees(id);
  });

  it('a service (N-1): co-packing ₹72,000 + GST 18% local; typed to Sale of Services 401020', () => {
    const id = receive({ accountId: 'ACC-1204', lines: [service('SV-01', 72_000)] });
    expect([calcOf(v(id), ctx()).cgst, calcOf(v(id), ctx()).payable]).toEqual([6_480, 84_960]);
    type(id, [['party', 84_960, 0], ['sale_services', 0, 72_000], ['out_cgst', 0, 6_480], ['out_sgst', 0, 6_480]]);
    agrees(id);
  });

  it('issued by TN-01 to a Karnataka customer: inter-state IGST; the journal carries branch TN-01', () => {
    const id = receive({ accountId: 'ACC-1204', branch: 'TN-01', lines: [service('SV-01', 72_000)] });
    expect(v(id).number).toBe('TN/INV/2627/0001');
    expect(calcOf(v(id), ctx()).igst).toBe(12_960);
    type(id, [['party', 84_960, 0], ['sale_services', 0, 72_000], ['out_igst', 0, 12_960]]);
    agrees(id);
    sl().submit(id);
    approveAll(id);
    expect(sl().journal.find((e) => e.id === v(id).entryId)!.branch).toBe('TN-01');
  });

  it('F2 bill-to-ship-to (D4): billing Chennai, goods to a third party in Karnataka → IGST', () => {
    const id = receive({ ...B401, branchId: 'BR-0002', thirdPartyShipTo: { name: 'Metro Builders (site)', line: 'Survey No. 112, Whitefield', city: 'Bengaluru', pincode: '560066', stateCode: 'KA' } });
    const c = calcOf(v(id), ctx());
    expect([c.pos, c.posBasis, c.igst]).toEqual(['TN', 'goods_bill_to_third_party', 35_625]);
  });

  it('A8 freight charged (taxed at the goods\' rate) and B5 a pure-agent expense (no GST): the totals', () => {
    expect(calcOf(v(receive({ ...B401, lines: [...B401.lines, extra('charge', 2_000)] })), ctx()).total).toBe(7_50_225);
    const r = calcOf(v(receive({ ...B401, lines: [...B401.lines, extra('reimbursement', 5_000)] })), ctx());
    expect([r.reimbursement, r.total]).toEqual([5_000, 7_53_125]);
  });

  it('A3 paid now by UPI: typed to UPI / Card Clearing; the customer owes nothing more', () => {
    const owed = dueOf(sl(), 'ACC-1201');
    const id = receive({ ...B401, settlement: 'upi_card', paymentRef: 'UPI 6312 0987 4455' });
    type(id, [['upi_card_clearing', 7_48_125, 0], ['sale_products', 0, 7_12_500], ['out_cgst', 0, 17_812.5], ['out_sgst', 0, 17_812.5]]);
    sl().addCostLines(id);
    agrees(id);
    sl().submit(id);
    approveAll(id);
    expect(dueOf(sl(), 'ACC-1201')).toBe(owed);
  });

  it('A6 / B4 a Bill of Supply (only exempt lines): no GST, no IRN', () => {
    const id = receive({ accountId: 'ACC-1204', lines: [service('SV-03', 30_000)] });
    expect([v(id).number, v(id).irn, calcOf(v(id), ctx()).cgst]).toEqual(['KA/BOS/2627/0001', undefined, 0]);
    type(id, [['party', 30_000, 0], ['exempt_sales', 0, 30_000]]);
    agrees(id);
  });

  it('B6 a period service billed in advance: typed to Contract Liability; the GST as calculated', () => {
    const id = receive({ accountId: 'ACC-1204', lines: [service('SV-02', 10_000, { qty: 12, periodFrom: '2026-10-07', periodUntil: '2027-10-06' })] });
    type(id, [['party', 1_41_600, 0], ['contract_liability', 0, 1_20_000], ['out_cgst', 0, 10_800], ['out_sgst', 0, 10_800]]);
    agrees(id);
  });

  it('B3 a service on immovable property in Tamil Nadu → place of supply Tamil Nadu, IGST', () => {
    const id = receive({ accountId: 'ACC-1204', lines: [service('SV-01', 1_00_000)], propertyState: 'TN' });
    expect([calcOf(v(id), ctx()).pos, calcOf(v(id), ctx()).igst]).toEqual(['TN', 18_000]);
  });
});

describe('inventory (kept): the cost of goods sold is calculated from the stock lots, FIFO or weighted average', () => {
  it('FIFO: the oldest lot first, each at its own cost; a Dr COGS and a Cr Finished Goods line per lot', () => {
    const cl = costLinesOf(v('SV-0012'), ctx());
    expect(cl.map((l) => [l.ledger, l.item, l.lot, l.qty, l.dr, l.cr])).toEqual([
      ['cogs', 'FG-101', 'G-2604', 300, 1_62_000, 0], ['fg_inventory', 'FG-101', 'G-2604', 300, 0, 1_62_000],
      ['cogs', 'FG-101', 'G-2608', 300, 1_68_000, 0], ['fg_inventory', 'FG-101', 'G-2608', 300, 0, 1_68_000],
      ['cogs', 'FG-102', 'C-2607', 300, 2_28_000, 0], ['fg_inventory', 'FG-102', 'C-2607', 300, 0, 2_28_000],
    ]);
    expect(checks('SV-0012').find((c) => c.code === 'COST_FROM_INVENTORY')?.title).toBe('Cost of goods sold by FIFO: ₹5,58,000.00 from inventory');
  });

  it('weighted average: every unit at value ÷ quantity (Glucose ₹12,82,000 ÷ 2,300); one pair per item', () => {
    sl().setCostMethod('wam');
    expect(costLinesOf(v('SV-0012'), ctx()).filter((l) => l.ledger === 'cogs').map((l) => l.dr)).toEqual([3_34_434.78, 2_28_000]);
  });

  it('at approval the stock goes down in the same transaction; the posted entry keeps its cost; stock = Finished Goods', () => {
    const before = stockValue(sl().lots, 'KA-01');
    typeB401();
    sl().submit('SV-0012');
    approveAll('SV-0012');
    expect(sl().lots.map((l) => [l.lot, l.qtyLeft])).toEqual([['G-2604', 0], ['G-2608', 1_700], ['C-2607', 1_200]]);
    const je = sl().journal.find((e) => e.id === v('SV-0012').entryId)!;
    const fg = je.lines.filter((l) => l.ledger === 'fg_inventory').reduce((t, l) => t + l.cr - l.dr, 0);
    expect(before - stockValue(sl().lots, 'KA-01')).toBe(fg);
    expect(je.costMethod).toBe('fifo');
    // the next sale takes the next lot: Kerala's 80 cartons now come from G-2608 at ₹560
    expect(costLinesOf(v('SV-0013'), ctx()).map((l) => [l.ledger, l.dr, l.cr])).toEqual([['cogs', 44_800, 0], ['fg_inventory', 0, 44_800]]);
  });

  it('weighted average after an issue: the stock left keeps the value left (no paisa lost)', () => {
    sl().setCostMethod('wam');
    const before = stockValue(sl().lots, 'KA-01');
    typeB401();
    sl().submit('SV-0012');
    approveAll('SV-0012');
    expect(stockValue(sl().lots, 'KA-01')).toBe(Math.round((before - 5_62_434.78) * 100) / 100);
  });

  it('stock short or no stock record: a Stop (an exception, never a guess); a service has no cost', () => {
    expect(stopCodes(receive({ ...B401, lines: [goodsLine('FG-101', 2_400, 700)] }))).toContain('STOCK_SHORT');
    expect(stopCodes(receive({ accountId: 'ACC-1204', branch: 'TN-01', lines: [goodsLine('FG-101', 10, 700)] }))).toContain('NO_STOCK_RECORD');
    expect(costLinesOf(v(receive({ accountId: 'ACC-1204', lines: [service('SV-01', 72_000)] })), ctx())).toEqual([]);
  });
});
