import { beforeEach, describe, expect, it } from 'vitest';
import { useOnboarding } from '../onboarding/store';
import { SERIES } from './catalogue';
import { calcOf, checksOf, costLinesOf, dueOf, linesOf, stops, sum, unbilled } from './rules';
import { ctxOf, useSales, voucherOf } from './store';
import { rupeesInWords } from './words';

const app = () => useOnboarding.getState();
const sl = () => useSales.getState();
const v = (id: string) => voucherOf(sl(), id)!;
const ctx = () => ctxOf(sl());
const checks = (id: string) => checksOf(v(id), ctx());
const stopTitles = (id: string) => stops(checks(id)).map((c) => c.title);
const approveAll = (id: string) => v(id).approvals.forEach((a) => sl().decide(id, a.id, true));
/** The entry is typed by hand; the mock types what the invoice says. */
const typeEntry = (id: string) => sl().typeEntry(id);
const draft = (dc: string) => {
  const id = sl().createFromChallan(dc);
  if (id) typeEntry(id);
  return id;
};

describe('sales invoice from a delivery challan (scenario B4-01, D-02)', () => {
  beforeEach(() => {
    app().reset();
    sl().setMethod('perpetual');
    typeEntry('SI-0012');
  });

  it('DC-1 / SO-1 (Sri Lakshmi): ₹7,12,500 + CGST ₹17,812.50 + SGST ₹17,812.50 = ₹7,48,125', () => {
    const c = calcOf(v('SI-0012'), ctx());
    expect(c.intra).toBe(true);
    expect(c.taxable).toBe(7_12_500);
    expect(c.cgst).toBe(17_812.5);
    expect(c.sgst).toBe(17_812.5);
    expect(c.total).toBe(7_48_125);
    expect(c.hsn).toEqual([{ hsn: '190531', gst: 5, taxable: 7_12_500, cgst: 17_812.5, sgst: 17_812.5, igst: 0 }]);
    expect(rupeesInWords(c.total)).toBe('Indian Rupees Seven Lakh Forty Eight Thousand One Hundred Twenty Five Only');
    const lines = linesOf(v('SI-0012'), ctx());
    expect(lines.map((l) => [l.ledgerKey.split('#')[0], l.dr, l.cr])).toEqual([
      ['party', 7_48_125, 0],
      ['sales_local', 0, 7_12_500],
      ['out_cgst', 0, 17_812.5],
      ['out_sgst', 0, 17_812.5],
    ]);
  });

  it("the cost side is the challan's: typed by hand, Dr cost of goods sold ₹5,64,000, Cr FG inventory, dated the challan; margin 20.8%", () => {
    const dc = () => ctx().challans.find((c) => c.id === 'DC-1')!;
    expect(dc().costEntryId).toBeUndefined(); // not in the books until it is typed
    expect(costLinesOf(dc()).map((l) => [l.ledgerKey, l.dr, l.cr])).toEqual([
      ['cogs', 5_64_000, 0],
      ['fg_inventory', 0, 5_64_000],
    ]);
    expect(linesOf(v('SI-0012'), ctx()).some((l) => l.ledgerKey === 'fg_inventory' || l.ledgerKey === 'cogs')).toBe(false); // never inside the invoice
    expect(calcOf(v('SI-0012'), ctx()).marginPct).toBe(20.84);
    sl().setField('SI-0012', 'customerPo', 'SLD/PO/889');
    sl().submit('SI-0012');
    approveAll('SI-0012');
    const je = sl().journal.find((e) => e.id === dc().costEntryId)!;
    expect([je.kind, je.voucherNo, je.date, je.postedBy]).toEqual(['challan_cost', 'DC-1', '2026-10-07', 'teja']);
    expect(je.lines.map((l) => [l.ledger, l.dr, l.cr])).toEqual([
      ['cogs', 5_64_000, 0],
      ['fg_inventory', 0, 5_64_000],
    ]);
  });

  it("needs the customer's PO (billing instruction) and warns on batch G-2604 expiring in 5 days", () => {
    expect(stopTitles('SI-0012')).toEqual(["Still to fill: Customer's PO number"]);
    expect(checks('SI-0012').some((c) => c.level === 'warn' && c.title.startsWith('Batch G-2604 expires 2026-10-12 (5 days)'))).toBe(true);
    expect(checks('SI-0012').some((c) => c.title === 'E-invoice pre-check passes')).toBe(true);
  });

  it('submit → Rajan approves → confirmed: KA/INV/2627/0143, one entry, IRN, e-way bill; the customer owes more', () => {
    sl().setField('SI-0012', 'customerPo', 'SLD/PO/889');
    const before = dueOf(sl(), 'ACC-1201');
    sl().submit('SI-0012');
    expect(v('SI-0012').number).toBeNull();
    approveAll('SI-0012');
    const x = v('SI-0012');
    expect(x.status).toBe('posted');
    expect(x.number).toBe(`${SERIES.invoice}0143`);
    expect(x.number!.length).toBeLessThanOrEqual(16); // CGST Rule 46(b)
    expect(x.irn).toHaveLength(64);
    expect(x.ewbNo).toBeTruthy();
    expect(dueOf(sl(), 'ACC-1201')).toBe(before + 7_48_125);
    const all = sl().journal.flatMap((e) => e.lines);
    expect(sum(all).dr).toBe(sum(all).cr);
    sl().setQty('SI-0012', 0, 1); // confirmed is final
    expect(v('SI-0012').lines[0].qty).toBe(300);
  });

  it('never above the challan; partial billing leaves the rest on the unbilled list', () => {
    sl().setField('SI-0012', 'customerPo', 'SLD/PO/889');
    sl().setQty('SI-0012', 2, 301);
    expect(stopTitles('SI-0012')).toContain('Line 3: 301 cartons, but only 300 on DC-1 are not yet billed');
    sl().setQty('SI-0012', 2, 200);
    typeEntry('SI-0012'); // the person corrects the entry after changing a quantity
    expect(stopTitles('SI-0012')).toEqual([]);
    sl().submit('SI-0012');
    approveAll('SI-0012');
    expect(unbilled(ctx()).map((c) => c.id)).toContain('DC-1');
    const id = draft('DC-1')!;
    expect(v(id).lines.map((l) => l.qty)).toEqual([100]); // only the 100 cream cartons left
  });

  it('Kerala Traders DC-0005: inter-state, so IGST and the inter-state sales ledger; 560 km = 3-day e-way bill', () => {
    const id = draft('DC-0005')!;
    const c = calcOf(v(id), ctx());
    expect(c.intra).toBe(false);
    expect(c.igst).toBe(2_880);
    expect(c.total).toBe(60_480);
    expect(linesOf(v(id), ctx()).map((l) => l.ledgerKey.split('#')[0])).toEqual(['party', 'sales_interstate', 'out_igst']);
    expect(stopTitles(id)).toEqual([]);
    sl().submit(id);
    approveAll(id);
    expect(v(id).ewbValidTo).toBe('2026-10-09');
  });

  it('e-invoice pre-check: a ship-to pincode missing in the party master stops the invoice (B4-03)', () => {
    app().parties.find((p) => p.partyId === 'P-0031')!.address.pincode; // present
    useOnboarding.setState((s) => {
      s.parties.find((p) => p.partyId === 'P-0031')!.address.pincode = '';
    });
    expect(stopTitles('SI-0012').some((t) => t.startsWith('E-invoice pre-check: ship-to pincode missing'))).toBe(true);
  });

  it('periods: a closed month stops, a soft-closed month warns, a future date stops', () => {
    sl().setField('SI-0012', 'customerPo', 'X');
    sl().setField('SI-0012', 'date', '2026-08-31');
    expect(stopTitles('SI-0012')).toContain('Aug-2026 is closed');
    sl().setField('SI-0012', 'date', '2026-09-30');
    expect(checks('SI-0012').some((c) => c.level === 'warn' && c.title === 'Sep-2026 is soft-closed')).toBe(true);
    sl().setField('SI-0012', 'date', '2026-10-20');
    expect(stopTitles('SI-0012')).toContain('Invoice date is after today');
  });

  it('a credit note reverses the invoice lines only; stock and cost stay (a return comes back through Stores)', () => {
    sl().setField('SI-0012', 'customerPo', 'SLD/PO/889');
    sl().submit('SI-0012');
    approveAll('SI-0012');
    const before = dueOf(sl(), 'ACC-1201');
    sl().cancelByCreditNote('SI-0012', 'Invoiced to the wrong customer');
    expect(v('SI-0012').cancel!.creditNote).toBe(`${SERIES.creditNote}0001`);
    expect(dueOf(sl(), 'ACC-1201')).toBe(before - 7_48_125);
    const cn = sl().journal.find((e) => e.kind === 'credit_note')!;
    expect(cn.lines.some((l) => l.ledger === 'cogs' || l.ledger === 'fg_inventory')).toBe(false);
  });

  it('Periodic (Run 2): no cost entry on the challans; the invoice entry is the same', () => {
    sl().setMethod('periodic');
    typeEntry('SI-0012');
    expect(sl().journal.some((e) => e.kind === 'challan_cost')).toBe(false);
    expect(calcOf(v('SI-0012'), ctx()).total).toBe(7_48_125);
    expect(checks('SI-0012').some((c) => c.title === 'Periodic: no cost entry per sale')).toBe(true);
  });

  it('Coastal Bakes DC-0007 waits for its account; after onboarding, Stores records it and it can be billed', () => {
    expect(sl().createFromChallan('DC-0007')).toBeNull();
    const req = app().createRequest({ side: 'receivable', from: 'arun', formNo: 'CRF-0019', paper: 'coastal' });
    app().typeFromPaper(req);
    app().checkGstin(req);
    app().submit(req);
    app().requests.find((r) => r.id === req)!.changes.forEach((c) => app().decide(req, c.id, true));
    sl().recordChallan('DC-0007');
    expect(sl().journal.some((e) => e.voucherNo === 'DC-0007' && e.kind === 'challan_cost')).toBe(false); // typed with the invoice
    const id = draft('DC-0007')!;
    expect(stopTitles(id)).toEqual(["Still to fill: Customer's PO number"]);
  });
});

describe('the entry is typed by hand; the invoice is prefilled (30-Oct)', () => {
  beforeEach(() => {
    app().reset();
    sl().setMethod('perpetual');
  });

  it('the invoice comes prefilled from the challan; the entry is blank and lists what is still to type', () => {
    expect(calcOf(v('SI-0012'), ctx()).total).toBe(7_48_125);
    expect(stopTitles('SI-0012')).toContain("Still to fill: Customer's PO number · Party A/c · Party A/c amount · Sales ledger · Sales amount · Tax ledgers · Cost Dr ledger · Cost Dr amount · Cost Cr ledger · Cost Cr amount");
    expect(linesOf(v('SI-0012'), ctx())).toEqual([]);
  });

  it('typed by hand as the invoice says: no stop except the PO; the entry is what was typed and it balances', () => {
    sl().setEntry('SI-0012', { partyLedger: 'ACC-1201', partyAmount: 7_48_125, salesLedger: 'sales_local', salesAmount: 7_12_500 });
    sl().setTaxLine('SI-0012', 0, { ledger: 'out_cgst', amount: 17_812.5 });
    sl().addTaxLine('SI-0012');
    sl().setTaxLine('SI-0012', 1, { ledger: 'out_sgst', amount: 17_812.5 });
    sl().setCost('SI-0012', { drLedger: 'cogs', drAmount: 5_64_000, crLedger: 'fg_inventory', crAmount: 5_64_000 });
    expect(stopTitles('SI-0012')).toEqual(["Still to fill: Customer's PO number"]);
    expect(checks('SI-0012').some((c) => c.title === 'Dr = Cr: ₹7,48,125.00')).toBe(true);
  });

  it('a wrong choice stops with the reason: party, sales ledger, IGST on a local sale, an amount off, unbalanced', () => {
    typeEntry('SI-0012');
    sl().setEntry('SI-0012', { partyLedger: 'ACC-1202' });
    expect(stopTitles('SI-0012').some((t) => t.startsWith('Party A/c: this invoice is to Sri Lakshmi'))).toBe(true);
    sl().setEntry('SI-0012', { partyLedger: 'ACC-1201', salesLedger: 'sales_interstate' });
    expect(stopTitles('SI-0012')).toContain('Sales ledger: a local sale goes to Sale of Products – Local (CGST + SGST)');
    sl().setEntry('SI-0012', { salesLedger: 'sales_local' });
    sl().setTaxLine('SI-0012', 0, { ledger: 'out_igst' });
    expect(stopTitles('SI-0012').some((t) => t.startsWith('Tax ledgers: a local sale takes Output CGST and Output SGST'))).toBe(true);
    sl().setTaxLine('SI-0012', 0, { ledger: 'out_cgst', amount: 17_000 });
    expect(stopTitles('SI-0012').some((t) => t.includes('the invoice shows ₹17,812.50'))).toBe(true);
    expect(stopTitles('SI-0012').some((t) => t.startsWith('Dr ₹7,48,125.00 ≠ Cr'))).toBe(true);
  });

  it('the cost entry: a wrong ledger or amount stops; asked once per challan; nothing under Periodic', () => {
    typeEntry('SI-0012');
    sl().setCost('SI-0012', { crLedger: 'sales_local' });
    expect(stopTitles('SI-0012').some((t) => t.startsWith('Cost entry Cr: the goods leave Inventory – finished goods'))).toBe(true);
    sl().setCost('SI-0012', { crLedger: 'fg_inventory', drAmount: 5_00_000 });
    expect(stopTitles('SI-0012').some((t) => t.includes('at standard cost is ₹5,64,000.00'))).toBe(true);
    expect(stopTitles('SI-0012')).toContain('Cost entry: Dr ₹5,00,000.00 ≠ Cr ₹5,64,000.00');
    sl().setField('SI-0012', 'customerPo', 'SLD/PO/889');
    sl().setQty('SI-0012', 2, 200); // part of the challan
    typeEntry('SI-0012');
    expect(stopTitles('SI-0012')).toEqual([]);
    sl().submit('SI-0012');
    approveAll('SI-0012');
    expect(v(draft('DC-1')!).manual!.cost).toBeUndefined(); // the challan's cost is already in the books
    sl().setMethod('periodic');
    expect(v('SI-0012').manual!.cost).toBeUndefined();
  });
});

describe('one customer, many branches (fin.customer_branch)', () => {
  beforeEach(() => {
    app().reset();
    sl().setMethod('perpetual');
    typeEntry('SI-0012');
  });

  it('Sri Lakshmi: one party, one account, 3 billed branches; the default (Bengaluru) bills CGST + SGST', () => {
    expect(app().parties.filter((p) => p.legalName === 'Sri Lakshmi Distributors')).toHaveLength(1);
    expect(app().accounts.filter((a) => a.partyId === 'P-0031' && a.side === 'receivable')).toHaveLength(1);
    expect(calcOf(v('SI-0012'), ctx()).intra).toBe(true);
  });

  it('billing the Chennai branch: its GSTIN 33… makes the place of supply Tamil Nadu, so IGST', () => {
    sl().setBranch('SI-0012', 'BR-0002');
    const c = calcOf(v('SI-0012'), ctx());
    expect(c.pos).toBe('TN');
    expect(c.intra).toBe(false);
    expect(c.igst).toBe(35_625);
  });

  it('add Kochi (in P&C, not yet linked) under its KL GSTIN; deactivate Hyderabad; no new party or account', () => {
    app().addBranch('ACC-1201', 'P-0031-L4');
    let br = app().accounts.find((a) => a.accountId === 'ACC-1201')!.branches!;
    expect(br.find((b) => b.locationId === 'P-0031-L4')?.gstin).toBe('32AAKFS0000S1Z6');
    app().deactivateBranch('ACC-1201', 'BR-0003');
    br = app().accounts.find((a) => a.accountId === 'ACC-1201')!.branches!;
    expect(br.find((b) => b.branchId === 'BR-0003')?.until).toBeTruthy();
    expect(app().accounts.filter((a) => a.partyId === 'P-0031')).toHaveLength(1);
    expect(app().log.some((l) => l.line === 'INSERT fin.customer_branch')).toBe(true);
  });

  it('the default branch moves when it is deactivated; the last open branch cannot be deactivated', () => {
    app().deactivateBranch('ACC-1201', 'BR-0001');
    const br = app().accounts.find((a) => a.accountId === 'ACC-1201')!.branches!;
    expect(br.filter((b) => b.isDefault && !b.until)).toHaveLength(1);
    app().deactivateBranch('ACC-1202', 'ACC-1202-B1');
    expect(app().accounts.find((a) => a.accountId === 'ACC-1202')!.branches).toBeUndefined();
  });
});
