// Reference data for T24 Sales voucher entry (docs/sales/sales_engine/task_list/T24_sales_voucher_entry.md), from
// the biscuit-plant scenario (Full scenario B4, D-01…D-05) and the CA's chart of accounts (I7, Indian GAAP sheet).
// Company identity numbers are placeholders. Ledger codes the CA's chart does not have are marked "proposed" (§8.3, G18).

import { DEBTOR_MASTER } from '../onboarding/catalogue';

export type Statement = 'BS' | 'PL';
export type Nature = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export interface Ledger {
  code: string;
  name: string;
  group: string; // Schedule III head
  nature: Nature;
  statement: Statement;
  /** Not in the CA's chart: proposed, the CA to confirm (G18). */
  proposed?: boolean;
  /** A group (not postable). */
  isGroup?: boolean;
  /**
   * fin.ledger_account.account_type (Manoj, 13-Nov, ledger_and_subledger.md): there is no "control ledger".
   * receivable: each of its lines names a customer account (debtor_account_id), so a voucher line reaches it only
   * through a customer · output_*: the invoice's tax by head (locked) · tcs_payable · round_off.
   */
  accountType?: 'receivable' | 'output_cgst' | 'output_sgst' | 'output_igst' | 'tcs_payable' | 'round_off';
}

/**
 * Our company (P&C seed in the engine repo, migration 0003: Aikyat Biscuits Private Limited, PAN AAECA0000A) and its two
 * branches as Manoj's fin.branch seeds them (migration 0005: KA-01, TN-01, each with its GSTIN and place). An invoice is
 * issued by a branch: its GSTIN, its state (local or inter-state), its number series. Street addresses, CIN, FSSAI and
 * bank are placeholders (illustrative).
 */
export interface Branch {
  code: string; // fin.branch.branch_code
  name: string; // fin.branch.display_name
  branchId: string; // fin.branch.branch_id (engine seed)
  gstin: string; // pc.party_identifier IN_GST, via fin.branch.gst_identifier_id
  state: string; // the state key of the GSTIN (KA, TN)
  godown: string;
  address: string[];
  /** Rule 46(b): one series per GSTIN per FY, at most 16 characters (fin.document_series). */
  series: { invoice: string; billOfSupply: string; export: string; creditNote: string };
}
export const BRANCHES: Record<string, Branch> = {
  'KA-01': {
    code: 'KA-01', name: 'Bengaluru plant and HQ', branchId: '6b1d0a52-0001-4f0e-8a51-5c0b7a000001', gstin: '29AAECA0000A1ZQ', state: 'KA', godown: 'KA-FG (finished goods)',
    address: ['Plot 14, KIADB Industrial Area, Peenya 2nd Stage', 'Bengaluru 560058, Karnataka'], series: { invoice: 'KA/INV/2627/', billOfSupply: 'KA/BOS/2627/', export: 'KA/EXP/2627/', creditNote: 'KA/CN/2627/' },
  },
  'TN-01': {
    code: 'TN-01', name: 'Hosur unit', branchId: '6b1d0a52-0002-4f0e-8a51-5c0b7a000002', gstin: '33AAECA0000A1Z1', state: 'TN', godown: 'TN-FG (finished goods)',
    address: ['SIPCOT Industrial Complex, Phase I', 'Hosur 635126, Tamil Nadu'], series: { invoice: 'TN/INV/2627/', billOfSupply: 'TN/BOS/2627/', export: 'TN/EXP/2627/', creditNote: 'TN/CN/2627/' },
  },
};
export const branchOf = (code: string | undefined) => BRANCHES[code ?? ''] ?? BRANCHES['KA-01'];

export const COMPANY = {
  legalName: 'Aikyat Biscuits Private Limited',
  pan: 'AAECA0000A',
  cin: 'U15410KA2019PTC120000',
  fssai: '11219999000123',
  email: 'billing@aikyatbiscuits.example',
  phone: '+91 80 4000 1000',
  bank: { name: 'HDFC Bank', branch: 'Peenya, Bengaluru', account: '50200012345678', ifsc: 'HDFC0000123' },
  jurisdiction: 'Bengaluru',
  /** Our LUT (Rule 96A): per GSTIN, per FY (fin.export_lut, a stub until S3). ILLUSTRATIVE number; validity from the scenario (C-03, B4-09). D4, G19. */
  lut: { no: 'AD2904260001234', branch: 'KA-01', gstin: '29AAECA0000A1ZQ', fy: '2026-27', validFrom: '2026-04-01', validTo: '2027-03-31', illustrative: true },
};

/** fin.fiscal_year (engine seed, migration 0005): April to March, none closed. A date outside them cannot post. */
export const FISCAL_YEARS = [
  { label: 'FY 2025-26', start: '2025-04-01', end: '2026-03-31', closed: false },
  { label: 'FY 2026-27', start: '2026-04-01', end: '2027-03-31', closed: false },
  { label: 'FY 2027-28', start: '2027-04-01', end: '2028-03-31', closed: false },
];
export const fiscalYearOf = (date: string) => FISCAL_YEARS.find((y) => date >= y.start && date <= y.end) ?? null;

/** Company switches (owners: the team lead, G22). Shown in the app; not changed here. */
export const SETTINGS = {
  billingCombined: { value: true, words: 'Billing combined with the Accounts Executive: Rajan checks every invoice', owner: 'Team lead (G22)' },
  irp30: { value: true, words: 'IRP 30-day reporting limit applies (AATO ≥ ₹10 crore). Placeholder until our AATO is a dated setting (G17)', owner: 'Compliance Officer (G17)' },
};

/**
 * The receivable ledger of each debtor category: fin.debtor_category.ledger_account_code, copied at T12 to
 * fin.debtor_account.ledger_account_code. Codes from the CA's chart (Indian GAAP sheet, rows 54–66: 107010–107130 are
 * all Trade Receivables). The engine seed (0004) still points every category at 107010 ("until the workbook arrives"):
 * to agree with Manoj (G28).
 */
export const DEBTOR_LEDGER: Record<string, string> = {
  domestic_b2b_regular: '107010',
  domestic_b2c_retail: '107020',
  domestic_b2g: '107030',
  export_goods: '107040',
  export_services: '107040',
  sez_unit: '107050',
  deemed_export: '107060',
  ecommerce_marketplace: '107070',
  related_party_domestic: '107080',
  related_party_overseas: '107090',
  dealer_distributor: '107100',
  scrap_specified_goods: '107110',
  luxury_goods: '107120',
  tour_package: '107130',
  composition_scheme: '107010',
  employee_advances: '105030',
};

/** One row per receivable ledger, named as the category master names it. */
const RECEIVABLE_LEDGERS: Record<string, Ledger> = Object.fromEntries(
  [...new Set(Object.values(DEBTOR_LEDGER))].map((code) => {
    const cat = Object.keys(DEBTOR_LEDGER).find((k) => DEBTOR_LEDGER[k] === code)!;
    return [`ar_${code}`, { code, name: DEBTOR_MASTER[cat]?.ledger ?? code, group: 'Trade receivables', nature: 'asset', statement: 'BS', accountType: 'receivable' } as Ledger];
  }),
);

/** The ledgers a sales invoice touches (§8.3). The customer line posts to its account's receivable ledger, naming the account. */
export const LEDGERS: Record<string, Ledger> = {
  sale_products: { code: '401010', name: 'Sale of Products', group: 'Revenue from operations', nature: 'income', statement: 'PL' },
  sale_services: { code: '401020', name: 'Sale of Services', group: 'Revenue from operations', nature: 'income', statement: 'PL' },
  export_sales: { code: '401030', name: 'Export Sales', group: 'Revenue from operations', nature: 'income', statement: 'PL' },
  sale_products_inter: { code: '401011', name: 'Sale of Products – Inter-state', group: 'Revenue from operations', nature: 'income', statement: 'PL', proposed: true },
  statutory_dues: { code: '206010', name: 'Statutory Dues Payable', group: 'Other current liabilities', nature: 'liability', statement: 'BS', isGroup: true },
  out_cgst: { code: '206011', name: 'Output CGST', group: 'Other current liabilities › Statutory dues', nature: 'liability', statement: 'BS', proposed: true, accountType: 'output_cgst' },
  out_sgst: { code: '206012', name: 'Output SGST', group: 'Other current liabilities › Statutory dues', nature: 'liability', statement: 'BS', proposed: true, accountType: 'output_sgst' },
  out_igst: { code: '206013', name: 'Output IGST', group: 'Other current liabilities › Statutory dues', nature: 'liability', statement: 'BS', proposed: true, accountType: 'output_igst' },
  tcs_payable: { code: '206014', name: 'TCS Payable (income tax s.394)', group: 'Other current liabilities › Statutory dues', nature: 'liability', statement: 'BS', proposed: true, accountType: 'tcs_payable' },
  // rev 2: 505120 under Other Expenses – Administrative (after the CA's 505110 Miscellaneous), not 506090: round off is not a selling expense.
  round_off: { code: '505120', name: 'Round Off', group: 'Other expenses – administrative', nature: 'expense', statement: 'PL', proposed: true, accountType: 'round_off' },
  // Rev 3 (16-Nov, the CA's specimen invoices A3, A5, A8, B5, B6, C2, C4, C6): ledgers the CA's chart does not have yet: proposed (G18).
  exempt_sales: { code: '401050', name: 'Sales – Exempt / Nil-rated / Non-GST', group: 'Revenue from operations', nature: 'income', statement: 'PL', proposed: true },
  freight_recovered: { code: '401070', name: 'Freight Recovered', group: 'Revenue from operations', nature: 'income', statement: 'PL', proposed: true },
  contract_liability: { code: '206040', name: 'Contract Liability (Income Received in Advance)', group: 'Other current liabilities', nature: 'liability', statement: 'BS', proposed: true },
  reimbursement_recoverable: { code: '110030', name: 'Expenses Recoverable (pure agent)', group: 'Other current assets', nature: 'asset', statement: 'BS', proposed: true },
  igst_refund: { code: '109040', name: 'IGST Refund Receivable', group: 'Short-term loans and advances', nature: 'asset', statement: 'BS', proposed: true },
  upi_card_clearing: { code: '108030', name: 'UPI / Card Clearing', group: 'Cash and bank balances', nature: 'asset', statement: 'BS', proposed: true },
  cash_in_hand: { code: '108010', name: 'Cash in Hand', group: 'Cash and bank balances', nature: 'asset', statement: 'BS' },
  // Rev 15 (Vijay, 20-Nov): the cost of goods sold ledger, named as the CA's answer key names it ("COGS", specimens D1-b, D2, E1).
  // The CA's chart has no such ledger (501030 is Change in Inventory): code proposed (G18).
  cogs: { code: '501040', name: 'Cost of Goods Sold', group: 'Cost of materials consumed / goods sold', nature: 'expense', statement: 'PL', proposed: true },
  change_in_inventory: { code: '501030', name: 'Change in Inventory', group: 'Changes in inventories of finished goods (Schedule III)', nature: 'expense', statement: 'PL' },
  fg_inventory: { code: '106020', name: 'Finished Goods', group: 'Inventories', nature: 'asset', statement: 'BS' },
  ...RECEIVABLE_LEDGERS,
};

export const ledgerByCode = (code: string) => Object.entries(LEDGERS).find(([, l]) => l.code === code)?.[0] ?? null;
/** The receivable ledger key of a debtor category (fin.debtor_category.ledger_account_code). */
export const receivableKeyOf = (category: string) => `ar_${DEBTOR_LEDGER[category] ?? '107010'}`;
/** Ledgers the AE may pick when he edits the entry: not a group, not a receivable ledger (LEDGER_NOT_POSTABLE: reached only through a customer). */
export const PICKABLE = Object.keys(LEDGERS).filter((k) => !LEDGERS[k].isGroup && LEDGERS[k].accountType !== 'receivable');

export interface Item {
  code: string;
  name: string;
  hsn: string; // 6 digits: our turnover is above ₹5 crore
  uqc: string; // GST unit quantity code
  unit: string;
  price: number; // list price, ₹ per carton before GST
  gst: number; // %, from the tax master (Compliance Officer)
  service?: false;
}

export const ITEMS: Record<string, Item> = {
  'FG-101': { code: 'FG-101', name: 'Glucose biscuit 100 g, carton of 48', hsn: '190531', uqc: 'CTN', unit: 'ctn', price: 720, gst: 5 },
  'FG-102': { code: 'FG-102', name: 'Milk cream biscuit 150 g, carton of 36', hsn: '190531', uqc: 'CTN', unit: 'ctn', price: 990, gst: 5 },
};

/** Services: a SAC, a GST rate, no e-way bill. ILLUSTRATIVE: SAC 998599 is a placeholder (G20). */
export type Taxability = 'taxable' | 'nil_rated' | 'exempt' | 'non_gst';
export interface Service {
  code: string;
  name: string;
  sac: string;
  uqc: string;
  gst: number;
  /** Rev 3: from the tax master (G20). Not taxable → no GST, a Bill of Supply when every line is so. */
  taxability: Taxability;
  /** Rev 3: a period service (a subscription, AMC): revenue is earned over the period (deferred, Ind AS 115 / AS 9). */
  period?: boolean;
  illustrative: true;
}
export const SERVICES: Record<string, Service> = {
  'SV-01': { code: 'SV-01', name: 'Co-packing service (scenario N-1)', sac: '998599', uqc: 'OTH', gst: 18, taxability: 'taxable', illustrative: true },
  'SV-02': { code: 'SV-02', name: 'Recipe and quality support, annual contract', sac: '998311', uqc: 'MON', gst: 18, taxability: 'taxable', period: true, illustrative: true },
  'SV-03': { code: 'SV-03', name: 'Rent of staff quarters (residential dwelling)', sac: '997211', uqc: 'MON', gst: 0, taxability: 'exempt', illustrative: true },
};

/**
 * Rev 3: lines that are not goods or services of the order.
 *  charge          freight or packing charged to the buyer: part of the value of supply (CGST s.15(2)(c)), taxed at the goods' rate (CA specimen A8)
 *  reimbursement   expenses paid as the buyer's pure agent: outside the value of supply (CGST Rule 33), no GST (CA specimen B5)
 */
export interface Extra {
  code: string;
  name: string;
  kind: 'charge' | 'reimbursement';
  sac: string;
  uqc: string;
  illustrative: true;
}
export const EXTRAS: Record<string, Extra> = {
  'CH-FRT': { code: 'CH-FRT', name: 'Freight charged to the buyer', kind: 'charge', sac: '996511', uqc: 'OTH', illustrative: true },
  'RE-01': { code: 'RE-01', name: 'Expenses paid as pure agent (e.g. the buyer\'s FSSAI test fee)', kind: 'reimbursement', sac: '', uqc: 'OTH', illustrative: true },
};

/** Rev 3: Incoterms 2020 (export, E8). */
export const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];

/** Accounting periods (posting date → month). Older months are hard-closed. */
export const PERIODS: Record<string, 'open' | 'soft'> = { '2026-10': 'open', '2026-09': 'soft' };
export const periodOf = (date: string): 'open' | 'soft' | 'hard' => PERIODS[date.slice(0, 7)] ?? 'hard';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]}-${date.slice(0, 4)}`;

/** Company rules used here (scenario §1.8), each with an owner. */
export const PARAMS = {
  ewayBillMin: { value: 50_000, words: 'E-way bill above ₹50,000 with goods moving', owner: 'Compliance Officer' },
  einvoice: { value: true, words: 'E-invoicing applies: B2B, export and SEZ invoices get their IRN at approval', owner: 'Compliance Officer' },
  creditNoteFc: { value: 1_00_000, words: 'A credit note needs the Finance Controller as well above ₹1,00,000', owner: 'Accounts Manager' },
  roundTo: { value: 1, words: 'Invoice total rounded to the rupee; the difference goes to Round off', owner: 'Accounts Manager' },
  fxUsd: { value: 88, words: 'Placeholder exchange rate for exports: ₹88.00 per USD (scenario, Sales Executive section); its source is the CA\'s (G25)', owner: 'The CA (G25)' },
};

/** One series per GSTIN per document type, reset each financial year, never gapped (Rule 46(b): at most 16 characters). KA-01's is the default.
 *  Rev 3: a Bill of Supply and an export invoice have their own series (the CA's specimens: BOS/…, EXP/…). */
export const SERIES = BRANCHES['KA-01'].series;
export const fmtNo = (prefix: string, n: number) => `${prefix}${String(n).padStart(4, '0')}`;

/** IRP cancellation reasons (e-invoice API CnlRsn 1–4). An IRN may be cancelled only within 24 hours of its ack. */
export const IRN_CANCEL_REASONS: Record<string, string> = { '1': 'Duplicate', '2': 'Data entry mistake', '3': 'Order cancelled', '4': 'Others' };
export const IRN_CANCEL_HOURS = 24;

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
  'ACC-1203': { poRule: 'none', delivery: 'email' },
  'ACC-1204': { poRule: 'none', delivery: 'email' },
  'ACC-1205': { poRule: 'none', delivery: 'with_goods' },
  'ACC-1206': { poRule: 'none', delivery: 'courier' },
};

/** Invoice currency of customers set up before this mock (scenario C-03: "invoices in USD"). New ones: their request. */
export const CURRENCY: Record<string, string> = { 'ACC-1203': 'USD' };

export const COUNTRIES: Record<string, string> = { IN: 'India', AE: 'United Arab Emirates' };

/** Export endorsement, verbatim (Rule 46, 2nd proviso, 20/2024-CT). */
export const ENDORSEMENT = {
  igst: 'SUPPLY MEANT FOR EXPORT/SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS ON PAYMENT OF INTEGRATED TAX',
  lut: 'SUPPLY MEANT FOR EXPORT/SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX',
};
