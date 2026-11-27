// T25 Sales credit note + T26 Sales debit note, the recording model (REC, 27-Nov-2026): Billing hands over a note against a
// posted invoice; the AE types its entry (the CA's E1–E4 shapes), the document's amounts are calculated, the checks compare.
// Scenario B4-06 (return, after Stores' receipt D-05), B4-07 (scheme discount, goodwill, price correction), B4-08 (late freight),
// Part C (C-17, C-19, a return bigger than the batch). Both stock settings.
import { beforeEach, describe, expect, it } from 'vitest';
import { useOnboarding } from '../onboarding/store';
import { calcOf, checksOf, costLinesOf, entryOf, routesOf, stops } from './rules';
import { goodsLine } from './seed';
import { ctxOf, useSales, voucherOf } from './store';
import type { InvoiceLine } from './types';

const app = () => useOnboarding.getState();
const sl = () => useSales.getState();
const v = (id: string) => voucherOf(sl(), id)!;
const ctx = () => ctxOf(sl());
const entry = (id: string) => entryOf(v(id), ctx()).map((l) => [l.ledger === 'party' ? 'party' : l.code, l.dr, l.cr]);
const checks = (id: string) => checksOf(v(id), ctx());
const stopCodes = (id: string) => stops(checks(id)).map((c) => c.code);
const approveAll = (id: string) => v(id).approvals.filter((a) => a.status === 'pending').forEach((a) => sl().decide(id, a.id, 'approve'));
const owes = (accountId: string) => Math.round(sl().journal.flatMap((e) => e.lines).filter((l) => l.accountId === accountId).reduce((t, l) => t + l.dr - l.cr, 0) * 100) / 100;
const one = (amount: number): InvoiceLine[] => [{ kind: 'goods', item: 'FG-101', qty: 1, rate: amount, discount: null }];
const type = (id: string, lines: [string, number, number][]) => {
  sl().clearEntry(id); // "clear and type my own"
  for (const [ledger, dr, cr] of lines) sl().addLine(id, { ledger, dr, cr });
};
const agrees = (id: string) => {
  expect(stopCodes(id)).toEqual([]);
  expect(checks(id).filter((c) => c.code === 'ENTRY_VS_DOCUMENT')).toEqual([]);
};
/** B4-01 first: SV-0012 (KA/INV/2627/0143, Sri Lakshmi) typed, booked and approved: the invoice the notes correct. */
const postB401 = () => {
  type('SV-0012', [['party', 7_48_125, 0], ['sale_products', 0, 7_12_500], ['out_cgst', 0, 17_812.5], ['out_sgst', 0, 17_812.5]]);
  sl().addCostLines('SV-0012');
  sl().submit('SV-0012');
  approveAll('SV-0012');
  expect(v('SV-0012').status).toBe('posted');
};

beforeEach(() => {
  app().reset();
  sl().reset();
});

describe('T25 · B4-06: a credit note for a return, after Stores\' receipt (D-05)', () => {
  it('C-17: the note waits for the return receipt; once Stores records it, the note can go', () => {
    postB401();
    const id = sl().receiveNote({ invoiceId: 'SV-0012', docType: 'credit_note', reason: 'return', lines: [goodsLine('FG-101', 40, 700)] })!;
    expect(v(id).number).toBe('KA/CN/2627/0001');
    type(id, [['sales_returns', 28_000, 0], ['out_cgst', 700, 0], ['out_sgst', 700, 0], ['party', 0, 29_400]]);
    expect(stopCodes(id)).toContain('WAITING_FOR_RETURN_RECEIPT');
    const rr = sl().recordReturn({ invoiceId: 'SV-0012', item: 'FG-101', lot: 'G-2608', qty: 40, condition: 'damaged' })!;
    expect(v(id).returnId).toBe(rr);
    agrees(id);
  });

  it("stores_receipt (default, the CA's E1): the receipt posts Stock back ₹22,400; the AE types Sales Returns ₹28,000 + GST = ₹29,400", () => {
    postB401();
    const rr = sl().recordReturn({ invoiceId: 'SV-0012', item: 'FG-101', lot: 'G-2608', qty: 40, condition: 'damaged' })!;
    const stockBack = sl().journal.find((e) => e.kind === 'stock_return')!;
    expect(stockBack.lines.map((l) => [l.ledger, l.dr, l.cr])).toEqual([['fg_inventory', 22400, 0], ['cogs', 0, 22400]]); // 40 × ₹560 (batch G-2608)
    expect(sl().lots.find((l) => l.godown === 'KA-QC')).toMatchObject({ item: 'FG-101', lot: 'G-2608', qtyLeft: 40, unitCost: 560 });
    const id = sl().receiveNote({ invoiceId: 'SV-0012', docType: 'credit_note', reason: 'return', lines: [goodsLine('FG-101', 40, 700)] })!;
    expect([v(id).returnId, v(id).returnStock]).toEqual([rr, 'stores_receipt']);
    expect(costLinesOf(v(id), ctx())).toEqual([]); // the receipt posted the stock back: nothing for the note
    type(id, [['sales_returns', 28_000, 0], ['out_cgst', 700, 0], ['out_sgst', 700, 0], ['party', 0, 29_400]]);
    agrees(id);
    const before = owes('ACC-1201');
    sl().submit(id);
    expect(routesOf(v(id), ctx()).map((r) => r.checker)).toEqual(['rajan']); // below ₹1,00,000: Usha not needed
    approveAll(id);
    expect(v(id).status).toBe('posted');
    expect(owes('ACC-1201')).toBe(before - 29400);
  });

  it('with_credit_note (the other setting): the receipt posts nothing; the note carries the stock back (one click, at the cost it left at)', () => {
    postB401();
    sl().setReturnStock('with_credit_note');
    sl().recordReturn({ invoiceId: 'SV-0012', item: 'FG-102', lot: 'C-2607', qty: 10, condition: 'saleable' });
    expect(sl().journal.some((e) => e.kind === 'stock_return')).toBe(false);
    expect(sl().lots.find((l) => l.lot === 'C-2607' && l.godown === 'KA-FG')!.qtyLeft).toBe(1200 + 10); // back on the shelf, its own batch
    const id = sl().receiveNote({ invoiceId: 'SV-0012', docType: 'credit_note', reason: 'return', lines: [goodsLine('FG-102', 10, 975)] })!;
    // ₹10,237.50 rounded to the rupee: Round Off ₹0.50.
    expect([calcOf(v(id), ctx()).payable, calcOf(v(id), ctx()).roundOff]).toEqual([10_238, 0.5]);
    type(id, [['sales_returns', 9750, 0], ['out_cgst', 243.75, 0], ['out_sgst', 243.75, 0], ['round_off', 0.5, 0], ['party', 0, 10_238]]);
    sl().addCostLines(id);
    expect(entry(id).slice(5)).toEqual([['106020', 7600, 0], ['501040', 0, 7600]]);
    agrees(id);
    sl().submit(id);
    approveAll(id);
    expect(v(id).status).toBe('posted');
    expect(sl().lots.find((l) => l.lot === 'C-2607' && l.godown === 'KA-FG')!.qtyLeft).toBe(1210); // the note does not move stock again
  });

  it('Part C: a return bigger than the invoice took from that batch is refused', () => {
    postB401();
    expect(sl().recordReturn({ invoiceId: 'SV-0012', item: 'FG-101', lot: 'G-2608', qty: 301, condition: 'damaged' })).toBeNull();
    expect(sl().returns).toHaveLength(0);
  });
});

describe('T25 · B4-07: discount notes', () => {
  it("(a) scheme rebate SCH-26-Q2: the AE types Discount Allowed ₹50,000 + GST ₹2,500; Rajan AND Venkat (the CA's E2)", () => {
    postB401();
    const id = sl().receiveNote({ invoiceId: 'SV-0012', docType: 'credit_note', reason: 'scheme_discount', schemeRef: 'SCH-26-Q2', lines: one(50000) })!;
    type(id, [['discount_allowed', 50000, 0], ['out_cgst', 1250, 0], ['out_sgst', 1250, 0], ['party', 0, 52500]]);
    agrees(id);
    expect(routesOf(v(id), ctx()).map((r) => r.checker)).toEqual(['rajan', 'venkat']);
  });

  it('C-19: a scheme discount without its scheme reference stops', () => {
    postB401();
    const id = sl().receiveNote({ invoiceId: 'SV-0012', docType: 'credit_note', reason: 'scheme_discount', lines: one(50000) })!;
    expect(stopCodes(id)).toContain('SCHEME_REFERENCE_NEEDED');
  });

  it("(c) goodwill, no scheme: NO GST (s.15(3); the CA's E3); Namma Bakes, KA/INV/2627/0141", () => {
    const id = sl().receiveNote({ invoiceId: 'SV-0010', docType: 'credit_note', reason: 'goodwill', lines: one(5000) })!;
    expect([calcOf(v(id), ctx()).cgst, calcOf(v(id), ctx()).payable]).toEqual([0, 5000]);
    type(id, [['discount_allowed', 5000, 0], ['party', 0, 5000]]);
    agrees(id);
  });

  it('(d) a price correction: the AE types the revenue the invoice overstated (Sale of Products) + its GST back', () => {
    postB401();
    const id = sl().receiveNote({ invoiceId: 'SV-0012', docType: 'credit_note', reason: 'price_correction', lines: one(3000) })!;
    type(id, [['sale_products', 3000, 0], ['out_cgst', 75, 0], ['out_sgst', 75, 0], ['party', 0, 3150]]);
    agrees(id);
  });

  it('a credit note typed the wrong way round (the customer debited) is a warning Rajan sees', () => {
    postB401();
    const id = sl().receiveNote({ invoiceId: 'SV-0012', docType: 'credit_note', reason: 'price_correction', lines: one(3000) })!;
    type(id, [['party', 3150, 0], ['sale_products', 0, 3000], ['out_cgst', 0, 75], ['out_sgst', 0, 75]]);
    expect(checks(id).filter((c) => c.code === 'ENTRY_VS_DOCUMENT').length).toBeGreaterThan(0);
  });
});

describe('the default entry of a note (a starting point the AE may change)', () => {
  it('a return → Sales Returns; a scheme or goodwill discount → Discount Allowed; a price correction → the sales ledger; a debit note as an invoice', () => {
    postB401();
    const byDefault = (id: string) => entryOf(v(id), ctx()).map((l) => [l.ledger === 'party' ? 'party' : l.code, l.dr, l.cr]);
    const ret = sl().receiveNote({ invoiceId: 'SV-0012', docType: 'credit_note', reason: 'return', lines: [goodsLine('FG-101', 40, 700)] })!;
    expect(byDefault(ret)).toEqual([['party', 0, 29_400], ['401090', 28_000, 0], ['206011', 700, 0], ['206012', 700, 0]]);
    const sch = sl().receiveNote({ invoiceId: 'SV-0012', docType: 'credit_note', reason: 'scheme_discount', schemeRef: 'SCH-26-Q2', lines: one(50000) })!;
    expect(byDefault(sch)[1]).toEqual(['506020', 50000, 0]);
    const pc = sl().receiveNote({ invoiceId: 'SV-0012', docType: 'credit_note', reason: 'price_correction', lines: one(3000) })!;
    expect(byDefault(pc)[1]).toEqual(['401010', 3000, 0]);
    agrees(pc);
    const freight: InvoiceLine[] = [{ kind: 'charge', item: 'CH-FRT', qty: 1, rate: 6000, discount: null }];
    const dn = sl().receiveNote({ invoiceId: 'SV-0010', docType: 'debit_note', reason: 'additional_charge', lines: freight })!;
    expect(byDefault(dn)).toEqual([['party', 6300, 0], ['401070', 0, 6000], ['206011', 0, 150], ['206012', 0, 150]]);
    agrees(dn);
  });
});

describe('T26 · B4-08: a debit note', () => {
  it("late freight ₹6,000 + GST 5% (the goods' rate) on Namma Bakes' KA/INV/2627/0141: ₹75,600 → ₹81,900 (the CA's E4 shape)", () => {
    const freight: InvoiceLine[] = [{ kind: 'charge', item: 'CH-FRT', qty: 1, rate: 6000, discount: null }];
    const id = sl().receiveNote({ invoiceId: 'SV-0010', docType: 'debit_note', reason: 'additional_charge', lines: freight })!;
    expect(v(id).number).toBe('KA/DN/2627/0001');
    type(id, [['party', 6300, 0], ['freight_recovered', 0, 6000], ['out_cgst', 0, 150], ['out_sgst', 0, 150]]);
    agrees(id);
    const before = owes('ACC-1205');
    sl().submit(id);
    approveAll(id);
    expect(owes('ACC-1205')).toBe(before + 6300);
  });

  it('a note only against a posted invoice: not against a draft, not against another note', () => {
    expect(sl().receiveNote({ invoiceId: 'SV-0013', docType: 'debit_note', reason: 'price_increase', lines: one(100) })).toBeNull(); // SV-0013 not posted
    const cn = sl().receiveNote({ invoiceId: 'SV-0010', docType: 'credit_note', reason: 'goodwill', lines: one(100) })!;
    expect(sl().receiveNote({ invoiceId: cn, docType: 'debit_note', reason: 'price_increase', lines: one(100) })).toBeNull();
  });
});
