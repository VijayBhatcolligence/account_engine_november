// The CA's answer keys (docs/sales/shared_doc_reference/expected_postings.json, 43 specimen invoices, 16-Nov-2026) run
// against the posting rule (engine.ts). Each T24 case: the specimen's facts in → its "On invoice" lines out.
// The CA's ledger NAMES map to our ledgers (the CA's chart codes, or proposed codes: G18). Cases that belong to other
// tasks or need another master are listed at the end with their home, never silently dropped.
import { describe, expect, it } from 'vitest';
import RAW from '../../../../docs/sales/shared_doc_reference/expected_postings.json';
import { LEDGERS } from './catalogue';
import { postingFor, type FactLine, type Facts } from './engine';

type Expected = { scenario: string; events: { event: string; lines: { account: string; debit: number; credit: number }[] }[] };
const KEYS = RAW as Expected[];

/** The CA's specimen ledger name → our ledger (the customer's line is 'party'). */
function ourLedger(name: string): string {
  const n = name.replace(/–/g, '-');
  if (/\(Debtor\)|Foreign Debtor/.test(n)) return 'party';
  if (n === 'UPI / Card Clearing') return 'upi_card_clearing';
  if (n === 'IGST Refund Receivable') return 'igst_refund';
  if (/^Output (CGST|SGST|IGST)$/.test(n)) return `out_${n.slice(7).toLowerCase()}`;
  if (/Exempt|Nil-rated/.test(n)) return 'exempt_sales';
  if (n === 'Freight Recovered') return 'freight_recovered';
  if (n === 'Client Disbursements Recoverable') return 'reimbursement_recoverable';
  if (/Contract Liability/.test(n)) return 'contract_liability';
  if (/Export|SEZ/.test(n) && !/Deemed|Merchant/.test(n)) return 'export_sales'; // 401030 (separate goods / services / SEZ ledgers: a CA question, G18)
  if (/^Revenue - Services$/.test(n)) return 'sale_services';
  if (/^Sales - Domestic Goods|Deemed Export|Merchant Export/.test(n)) return 'sale_products'; // 401010 (B2C, deemed, merchant split: a CA question)
  return `?${name}`;
}

const L = (kind: FactLine['kind'], amount: number, tax: { cgst?: number; sgst?: number; igst?: number } = {}, more: Partial<FactLine> = {}): FactLine => ({ kind, taxability: 'taxable', amount, cgst: tax.cgst ?? 0, sgst: tax.sgst ?? 0, igst: tax.igst ?? 0, ...more });
const local = (amount: number, rate: number) => ({ cgst: (amount * rate) / 200, sgst: (amount * rate) / 200 });
const F = (o: Partial<Facts> & Pick<Facts, 'lines'>): Facts => ({ buyer: 'domestic', exportType: null, settlement: 'credit', intra: true, roundOff: 0, receivableKey: 'ar_107010', ...o });

/** The T24 cases: the specimen's facts (as the invoice gives them). */
const CASES: Record<string, Facts> = {
  A1: F({ lines: [L('goods', 100000, local(100000, 18))] }),
  A2: F({ intra: false, lines: [L('goods', 100000, { igst: 18000 })] }),
  A3: F({ settlement: 'upi_card', lines: [L('goods', 10000, local(10000, 18))] }), // B2C counter sale, paid by UPI
  A4: F({ intra: false, lines: [L('goods', 120000, { igst: 21600 })] }), // B2C, unregistered, on credit (B2CL)
  A5: F({ lines: [L('goods', 50000, local(50000, 18)), L('goods', 40000, local(40000, 5)), L('goods', 10000, {}, { taxability: 'nil_rated' })] }),
  A6: F({ lines: [L('goods', 100000, {}, { taxability: 'nil_rated' })] }), // Bill of Supply
  A7: F({ lines: [L('goods', 100000, local(100000, 40))] }), // the 40 % rate
  A8: F({ lines: [L('goods', 99000, local(99000, 18)), L('charge', 1000, local(1000, 18))] }), // 10 % discount inside; freight charged
  B1: F({ lines: [L('service', 100000, local(100000, 18))] }),
  B2: F({ intra: false, lines: [L('service', 100000, { igst: 18000 })] }),
  B3: F({ intra: false, lines: [L('service', 100000, { igst: 18000 })] }), // place of supply: the property in Tamil Nadu
  B5: F({ lines: [L('service', 100000, local(100000, 18)), L('reimbursement', 5000, {}, { taxability: 'non_gst' })] }),
  B6: F({ lines: [L('service', 1200000, local(1200000, 18), { deferred: true })] }),
  B8: F({ lines: [L('service', 100000, local(100000, 18))] }),
  C1: F({ buyer: 'export', exportType: 'lut', intra: false, lines: [L('goods', 88000)] }),
  C2: F({ buyer: 'export', exportType: 'igst', intra: false, lines: [L('goods', 88000, { igst: 15840 })] }),
  C3: F({ buyer: 'export', exportType: 'lut', intra: false, lines: [L('service', 88000)] }),
  C4: F({ buyer: 'export', exportType: 'igst', intra: false, lines: [L('service', 88000, { igst: 15840 })] }),
  C5: F({ buyer: 'sez', exportType: 'lut', intra: false, lines: [L('goods', 100000)] }),
  C6: F({ buyer: 'sez', exportType: 'igst', intra: false, lines: [L('goods', 100000, { igst: 18000 })] }),
  C7: F({ lines: [L('goods', 100000, local(100000, 18))] }), // deemed export to an EOU: taxed, the recipient claims the refund
  C8: F({ lines: [L('goods', 100000, local(100000, 0.1))] }), // merchant export, 0.1 % (Notification 40/2017)
  D4: F({ intra: false, lines: [L('goods', 100000, { igst: 18000 })] }), // bill-to MH, ship-to a third party in KA: place of supply MH
  D9: F({ lines: [L('goods', 100000, local(100000, 18))] }), // bill and hold
};

/** Specimens that are not T24's invoice entry, with their home (CLAUDE.md: place every question). */
const ELSEWHERE: Record<string, string> = {
  A9: 'Scrap sale: its own revenue ledger needs the item master (T8); the receipt (GST TDS) is receipts (G29)',
  A10: 'Sale of a fixed asset: the asset register (a new task, ask)',
  B4: 'Exempt service, rounding absorbed into revenue: a CA question (we post round off to 505120)',
  B7: "The supplier's books under reverse charge (not ours)",
  C9: 'High sea sale (non-GST commercial invoice): a CA question, a document type not built',
  'D1-a': 'Goods on approval: the delivery challan (Stores slice, G30)',
  'D1-b': 'Invoice on acceptance: T24 entry as A1; the cost release is the challan stub (G30)',
  D2: 'Consignment to an agent: a new flow (ask)',
  D3: 'Stock transfer to our own GSTIN: branches (S3, G7)',
  D5: 'E-commerce operator: the debtor is the marketplace (new gap G32); settlement is receipts (G29)',
  D6: 'Receipt voucher: T13 (advances)',
  'D7-a': 'Receipt voucher with GST on a service advance: T13',
  'D7-b': 'Invoice against an advance: T24 entry as B1; the adjustment is T13',
  D8: 'Refund voucher: T13',
  D10: "A composition supplier's books (not ours)",
  E1: 'Credit note: T25',
  E2: 'Credit note (discount): T25',
  E3: 'Commercial credit note: T25',
  E4: 'Debit note: T26',
};

const ours = (f: Facts) => {
  const m = new Map<string, number>();
  for (const l of postingFor(f)) m.set(`${l.dr ? 'Dr' : 'Cr'} ${l.ledger}`, Math.round(((m.get(`${l.dr ? 'Dr' : 'Cr'} ${l.ledger}`) ?? 0) + l.dr + l.cr) * 100) / 100);
  return Object.fromEntries([...m].sort());
};
const theirs = (k: Expected) => {
  const m = new Map<string, number>();
  for (const l of k.events[0].lines) {
    const key = `${l.debit ? 'Dr' : 'Cr'} ${ourLedger(l.account)}`;
    m.set(key, Math.round(((m.get(key) ?? 0) + l.debit + l.credit) * 100) / 100);
  }
  return Object.fromEntries([...m].sort());
};

describe("the CA's answer keys (43 specimens): every one is T24's or placed", () => {
  it('43 specimens: 24 run here, 19 placed with their home', () => {
    expect(KEYS).toHaveLength(43);
    expect(Object.keys(CASES).length + Object.keys(ELSEWHERE).length).toBe(43);
    for (const k of KEYS) expect(CASES[k.scenario] ?? ELSEWHERE[k.scenario]).toBeTruthy();
  });

  for (const k of KEYS.filter((x) => CASES[x.scenario])) {
    it(`${k.scenario}: the rule posts what the CA expects`, () => {
      expect(ours(CASES[k.scenario])).toEqual(theirs(k));
    });
  }

  it('every ledger the rule uses exists in our chart (CA codes or marked proposed)', () => {
    const used = new Set(Object.values(CASES).flatMap((f) => postingFor(f).map((l) => l.ledger)));
    for (const key of used) if (key !== 'party') expect(LEDGERS[key], key).toBeTruthy();
  });
});
