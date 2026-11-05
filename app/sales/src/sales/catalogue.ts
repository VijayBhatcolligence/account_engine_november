// Reference data for a sales invoice, from the biscuit-plant scenario (shared_docs/scenario: Engineer guide §1,
// Full scenario B4, D-01…D-05). Company identity numbers are placeholders. Ledger codes follow the CA's chart of
// accounts (401010 Sale of Products, 107010 Trade Receivables – Domestic, 206010 Statutory Dues); the ones it
// does not have are marked "proposed".

import type { Challan } from './types';

export type Statement = 'BS' | 'PL';
export type Nature = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export interface Ledger {
  code: string;
  name: string;
  group: string; // Schedule III head
  nature: Nature;
  statement: Statement;
  proposed?: boolean;
}

/** Our company and the branch that issues these invoices (placeholders, illustrative). */
export const COMPANY = {
  legalName: 'Aikyat Biscuits Pvt Ltd',
  branch: 'KA-01 Bengaluru (plant and head office)',
  address: ['Plot 14, KIADB Industrial Area, Peenya 2nd Stage', 'Bengaluru 560058, Karnataka'],
  gstin: '29AAACA0000A1Z5',
  pan: 'AAACA0000A',
  cin: 'U15410KA2019PTC120000',
  fssai: '11219999000123',
  stateCode: 'KA',
  email: 'billing@aikyatbiscuits.example',
  phone: '+91 80 4000 1000',
  bank: { name: 'HDFC Bank', branch: 'Peenya, Bengaluru', account: '50200012345678', ifsc: 'HDFC0000123' },
  godown: 'KA-FG (finished goods)',
  jurisdiction: 'Bengaluru',
};

/** The ledgers a sales invoice and its challan touch. The party line is the customer's own AR account. */
export const LEDGERS: Record<string, Ledger> = {
  sales_local: { code: '401010', name: 'Sale of Products – Local (CGST + SGST)', group: 'Revenue from operations', nature: 'income', statement: 'PL' },
  sales_interstate: { code: '401011', name: 'Sale of Products – Inter-state (IGST)', group: 'Revenue from operations', nature: 'income', statement: 'PL', proposed: true },
  out_cgst: { code: '206011', name: 'Output CGST', group: 'Other current liabilities › Statutory dues', nature: 'liability', statement: 'BS', proposed: true },
  out_sgst: { code: '206012', name: 'Output SGST', group: 'Other current liabilities › Statutory dues', nature: 'liability', statement: 'BS', proposed: true },
  out_igst: { code: '206013', name: 'Output IGST', group: 'Other current liabilities › Statutory dues', nature: 'liability', statement: 'BS', proposed: true },
  round_off: { code: '506090', name: 'Round off', group: 'Other expenses', nature: 'expense', statement: 'PL', proposed: true },
  cogs: { code: '502010', name: 'Cost of goods sold – finished goods', group: 'Changes in inventories of finished goods (Schedule III)', nature: 'expense', statement: 'PL', proposed: true },
  fg_inventory: { code: '105020', name: 'Inventory – finished goods (KA-FG)', group: 'Inventories', nature: 'asset', statement: 'BS', proposed: true },
};

/** The control account a customer's AR account sits under (onboarding "Under (header)"). */
export const RECEIVABLES_CODE: Record<string, string> = {
  'Trade Receivables › Domestic': '107010',
  'Trade Receivables › Export & SEZ': '107030',
  'Trade Receivables › Related Parties': '107050',
  'Trade Receivables › Other': '107140',
};

export interface Item {
  code: string;
  name: string;
  hsn: string; // 6 digits: our turnover is above ₹5 crore
  uqc: string; // GST unit quantity code
  unit: string;
  price: number; // list price, ₹ per carton before GST
  gst: number; // %, from the tax master (Compliance Officer)
  /** Standard cost per carton, by date it applies from. */
  cost: { from: string; value: number }[];
}

export const ITEMS: Record<string, Item> = {
  'FG-101': { code: 'FG-101', name: 'Glucose biscuit 100 g, carton of 48', hsn: '190531', uqc: 'CTN', unit: 'ctn', price: 720, gst: 5, cost: [{ from: '2026-04-01', value: 560 }] },
  'FG-102': { code: 'FG-102', name: 'Milk cream biscuit 150 g, carton of 36', hsn: '190531', uqc: 'CTN', unit: 'ctn', price: 990, gst: 5, cost: [{ from: '2026-04-01', value: 760 }, { from: '2026-10-12', value: 820 }] },
};
export const costOn = (item: string, date: string) => [...ITEMS[item].cost].reverse().find((c) => c.from <= date)?.value ?? 0;

/** Finished-goods batches at KA-FG on 05-Oct-2026 (opening stock). */
export const BATCHES: { batch: string; item: string; expiry: string; opening: number }[] = [
  { batch: 'G-2604', item: 'FG-101', expiry: '2026-10-12', opening: 300 },
  { batch: 'G-2608', item: 'FG-101', expiry: '2027-02-10', opening: 2000 },
  { batch: 'C-2607', item: 'FG-102', expiry: '2027-01-15', opening: 1500 },
];

/** Accounting periods (posting date → month). Older months are hard-closed. */
export const PERIODS: Record<string, 'open' | 'soft'> = { '2026-10': 'open', '2026-09': 'soft' };
export const periodOf = (date: string): 'open' | 'soft' | 'hard' => PERIODS[date.slice(0, 7)] ?? 'hard';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]}-${date.slice(0, 4)}`;

/** Company rules used here (scenario §1.8), each with an owner. */
export const PARAMS = {
  ewayBillMin: { value: 50_000, words: 'E-way bill above ₹50,000 with goods moving', owner: 'Compliance Officer' },
  einvoice: { value: true, words: 'E-invoicing applies: the challan is released only once the invoice has its IRN', owner: 'Compliance Officer' },
  marginFloor: { value: 18, words: 'Margin floor 18% (the Sales Order approval checks it)', owner: 'Accounts Manager' },
  creditNoteFc: { value: 1_00_000, words: 'A credit note needs the Finance Controller as well above ₹1,00,000', owner: 'Accounts Manager' },
  roundTo: { value: 1, words: 'Invoice total rounded to the rupee; the difference goes to Round off', owner: 'Accounts Manager' },
  expiryWarnDays: { value: 7, words: 'Batch near expiry: warn within 7 days', owner: 'Inventory Controller' },
};

/** One series per GSTIN, reset each financial year, never gapped. Rule 46(b): at most 16 characters. */
export const SERIES = { invoice: 'KA/INV/2627/', creditNote: 'KA/CN/2627/' };
export const fmtNo = (prefix: string, n: number) => `${prefix}${String(n).padStart(4, '0')}`;

/** What customers owed on 05-Oct-2026 (scenario §1.5), by AR account. */
export const OPENING_DUE: Record<string, number> = {
  'ACC-1201': 4_00_000,
  'ACC-1202': 8_20_000,
  'ACC-1204': 0,
  'ACC-1205': 0,
  'ACC-1206': 4_10_000,
};

/** Billing instructions of the customers set up before this mock (new ones come from their onboarding request). */
export const BILLING: Record<string, { poRule: 'every_invoice' | 'none'; delivery: string }> = {
  'ACC-1201': { poRule: 'every_invoice', delivery: 'email' },
  'ACC-1202': { poRule: 'every_invoice', delivery: 'portal' },
  'ACC-1204': { poRule: 'none', delivery: 'email' },
  'ACC-1205': { poRule: 'none', delivery: 'with_goods' },
  'ACC-1206': { poRule: 'none', delivery: 'courier' },
};

/**
 * Delivery challans recorded by Stores (Latha, KA-FG), owned by the Stores role. Under Perpetual the challan
 * also writes the cost entry (Dr cost of goods sold, Cr finished-goods inventory, at standard cost).
 * DC-0618 / DC-0619 / DC-1 are the scenario's; DC-0005 and DC-0007 are illustrative.
 */
export const CHALLANS: Challan[] = [
  { id: 'DC-0618', soId: 'SO-0611', soDate: '2026-10-01', customer: 'Namma Bakes', date: '2026-10-03', lines: [{ item: 'FG-101', batch: 'G-2608', qty: 100, rate: 720 }], vehicleNo: 'KA05MN4411', transporter: 'Own vehicle', distanceKm: 18, lrNo: '—', note: 'Released on 03-Oct under the offline fallback during an IRN portal outage (scenario B4-05)' },
  { id: 'DC-0619', soId: 'SO-0612', soDate: '2026-10-01', customer: 'Namma Bakes', date: '2026-10-03', lines: [{ item: 'FG-102', batch: 'C-2607', qty: 100, rate: 990 }], vehicleNo: 'KA05MN4411', transporter: 'Own vehicle', distanceKm: 18, lrNo: '—', note: 'Released on 03-Oct under the offline fallback (scenario B4-05)' },
  { id: 'DC-1', soId: 'SO-1', soDate: '2026-10-05', customer: 'Sri Lakshmi Distributors', date: '2026-10-07', lines: [{ item: 'FG-101', batch: 'G-2604', qty: 300, rate: 700 }, { item: 'FG-101', batch: 'G-2608', qty: 300, rate: 700 }, { item: 'FG-102', batch: 'C-2607', qty: 300, rate: 975 }], vehicleNo: 'KA01AB1234', transporter: 'Own vehicle', distanceKm: 12, lrNo: '—', note: 'SO-1 approved by Nisha on 06-Oct with the glucose override ₹700; cream at the contract rate ₹975 (scenario B4-01)' },
  { id: 'DC-0005', soId: 'SO-5', soDate: '2026-10-06', customer: 'Kerala Traders', date: '2026-10-07', lines: [{ item: 'FG-101', batch: 'G-2608', qty: 80, rate: 720 }], vehicleNo: 'KL07AQ9012', transporter: 'VRL Logistics', distanceKm: 560, lrNo: 'VRL/KOC/88213', note: 'Illustrative: an inter-state sale (IGST)' },
  { id: 'DC-0007', soId: 'SO-0019', soDate: '2026-10-07', customer: 'Coastal Bakes Pvt Ltd', date: '2026-10-07', lines: [{ item: 'FG-102', batch: 'C-2607', qty: 50, rate: 990 }], vehicleNo: 'KA19D2233', transporter: 'Coastal Roadways', distanceKm: 355, lrNo: 'CR/0412', note: 'Illustrative: the first order of a new customer. Stores can record it only once its account is active', needsAccount: true },
];
