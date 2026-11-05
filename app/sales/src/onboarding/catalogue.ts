// Reference lists. The categories, constitutions and the 43B(h) relevance are copied from the finance repo
// (aikyat-finance apps/operations/.../ledger_form_rules.dart, from the CA's Customer and Vendor Master
// onboarding workbooks). The keys are what the backend stores; the labels are what a person reads.

import type { ActorKey, Side } from './types';

export interface Actor {
  name: string;
  role: string;
}

export const ACTORS: Record<ActorKey, Actor> = {
  teja: { name: 'Teja', role: 'Accounts Executive' },
  rajan: { name: 'Rajan', role: 'Accounts Manager' },
  usha: { name: 'Usha', role: 'Finance Controller' },
  venkat: { name: 'Venkat', role: 'Compliance Officer' },
  farid: { name: 'Farid', role: 'Credit Controller' },
  ravi: { name: 'Ravi', role: 'Procurement Officer' },
  kiran: { name: 'Kiran', role: 'Contracts & Services Procurement Officer' },
  arun: { name: 'Arun', role: 'Sales Executive' },
  latha: { name: 'Latha', role: 'Stores Officer (KA-FG)' },
  nisha: { name: 'Nisha', role: 'Sales Manager' },
  system: { name: 'System', role: 'Aikyat Finance' },
  bank: { name: 'Bank', role: 'Penny-drop service' },
  gst: { name: 'GST portal', role: 'GSTIN search' },
  irp: { name: 'IRP', role: 'E-invoice portal' },
};

export const ME: ActorKey = 'teja';
export const who = (k: ActorKey) => `${ACTORS[k].name} (${ACTORS[k].role})`;

/** Who can hand over a paper form, by side. */
export const FORM_FROM: Record<Side, ActorKey[]> = { payable: ['ravi', 'kiran'], receivable: ['arun'] };

/** GST state codes (first two digits of a GSTIN): the "GST State Code Master" of the CA's Customer Master
 *  onboarding form (Reference Lists). The legacy codes 25 and 28 and 99 (Centre Jurisdiction) are left out. */
export const STATES: Record<string, { code: string; name: string }> = {
  JK: { code: '01', name: 'Jammu and Kashmir' },
  HP: { code: '02', name: 'Himachal Pradesh' },
  PB: { code: '03', name: 'Punjab' },
  CH: { code: '04', name: 'Chandigarh' },
  UK: { code: '05', name: 'Uttarakhand' },
  HR: { code: '06', name: 'Haryana' },
  DL: { code: '07', name: 'Delhi' },
  RJ: { code: '08', name: 'Rajasthan' },
  UP: { code: '09', name: 'Uttar Pradesh' },
  BR: { code: '10', name: 'Bihar' },
  SK: { code: '11', name: 'Sikkim' },
  AR: { code: '12', name: 'Arunachal Pradesh' },
  NL: { code: '13', name: 'Nagaland' },
  MN: { code: '14', name: 'Manipur' },
  MZ: { code: '15', name: 'Mizoram' },
  TR: { code: '16', name: 'Tripura' },
  ML: { code: '17', name: 'Meghalaya' },
  AS: { code: '18', name: 'Assam' },
  WB: { code: '19', name: 'West Bengal' },
  JH: { code: '20', name: 'Jharkhand' },
  OD: { code: '21', name: 'Odisha' },
  CG: { code: '22', name: 'Chhattisgarh' },
  MP: { code: '23', name: 'Madhya Pradesh' },
  GJ: { code: '24', name: 'Gujarat' },
  DN: { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  MH: { code: '27', name: 'Maharashtra' },
  KA: { code: '29', name: 'Karnataka' },
  GA: { code: '30', name: 'Goa' },
  LD: { code: '31', name: 'Lakshadweep' },
  KL: { code: '32', name: 'Kerala' },
  TN: { code: '33', name: 'Tamil Nadu' },
  PY: { code: '34', name: 'Puducherry' },
  AN: { code: '35', name: 'Andaman and Nicobar Islands' },
  TS: { code: '36', name: 'Telangana' },
  AP: { code: '37', name: 'Andhra Pradesh' },
  LA: { code: '38', name: 'Ladakh' },
  OT: { code: '97', name: 'Other Territory' },
};
export const STATE_OPTIONS: Record<string, string> = Object.fromEntries(Object.entries(STATES).map(([k, v]) => [k, `${v.name} (${v.code})`]));
export const stateOfGstin = (gstin: string) => Object.entries(STATES).find(([, v]) => v.code === gstin.slice(0, 2))?.[0] ?? null;
export const OUR_STATE = 'KA';

export const SIDE_LABEL: Record<Side, string> = { payable: 'Vendor', receivable: 'Customer' };

export const CREDITOR_CATEGORIES: Record<string, string> = {
  goods_msme: 'Creditors for Goods – MSME',
  goods_non_msme: 'Creditors for Goods – Non-MSME',
  capital_goods: 'Creditors – Capital Goods / Fixed Assets',
  consultants: 'Creditors – Consultants & Professionals',
  contractors: 'Creditors – Contractors (Works/Civil/Labour)',
  manpower_security: 'Creditors – Manpower & Security Services',
  freight_gta: 'Creditors – Freight & Transportation (GTA)',
  commission_brokerage: 'Creditors – Commission & Brokerage Agents',
  rent_immovable: 'Creditors – Rent (Immovable Property)',
  advertising: 'Creditors – Advertising & Marketing Agencies',
  it_software: 'Creditors – IT / Software / SaaS Subscriptions',
  insurance: 'Creditors – Insurance',
  utilities: 'Creditors – Utilities (Electricity/Telecom/Internet)',
  directors: 'Creditors – Directors',
  related_party: 'Creditors – Related Party / Group Company',
  loans_icd: 'Creditors – Loans & Inter-Corporate Deposits',
  employee_reimbursement: 'Creditors – Employee Reimbursement / Imprest',
  ecommerce_operators: 'Creditors – E-commerce Operators',
  government_statutory: 'Creditors – Government / Statutory Bodies',
  international_import: 'Creditors – International / Import (Non-Resident)',
};

export const DEBTOR_CATEGORIES: Record<string, string> = {
  domestic_b2b_regular: 'Domestic B2B Trade Debtor – Regular',
  domestic_b2c_retail: 'Domestic B2C Debtor (Retail/Walk-in)',
  domestic_b2g: 'Domestic B2G Debtor (Government / PSU)',
  export_goods: 'Export Debtor – Goods',
  export_services: 'Export Debtor – Services',
  sez_unit: 'SEZ Unit / Developer Debtor',
  deemed_export: 'Deemed Export Debtor (EOU / Advance Authorisation / EPCG)',
  ecommerce_marketplace: 'E-commerce Marketplace Debtor (sales via ECO)',
  related_party_domestic: 'Related Party / Intercompany Debtor (Domestic)',
  related_party_overseas: 'Related Party / Intercompany Debtor (Overseas / Group)',
  dealer_distributor: 'Dealer / Distributor Debtor',
  scrap_specified_goods: 'Sale of Scrap / Specified Goods Debtor',
  luxury_goods: 'Sale of Luxury Goods Debtor',
  tour_package: 'Overseas Tour Package Debtor',
  composition_scheme: 'Composition Scheme Debtor',
  employee_advances: 'Employee Debtor (staff advances / recoveries)',
};

export const categoriesFor = (side: Side) => (side === 'payable' ? CREDITOR_CATEGORIES : DEBTOR_CATEGORIES);

export const CONSTITUTIONS: Record<string, string> = {
  individual: 'Individual',
  proprietorship: 'Proprietorship',
  partnership: 'Partnership',
  llp: 'LLP',
  company: 'Company',
  huf: 'HUF',
  trust_society: 'Trust / Society',
  government: 'Government',
  foreign_entity: 'Foreign Entity',
  other: 'Other',
};

export const RESIDENT: Record<string, string> = { resident: 'Resident', non_resident: 'Non-Resident' };
export const MSME_STATUS: Record<string, string> = { yes: 'Yes', no: 'No', unknown: 'Asked, not known yet' };
export const MSME_CATEGORY: Record<string, string> = { micro: 'Micro', small: 'Small', medium: 'Medium' };
export const YES_NO: Record<string, string> = { yes: 'Yes', no: 'No' };

// ---------- The CA's Customer Master onboarding form (shared by Swasthik: 1. Customer_Master_Onboarding_Form_1.xls) ----------
// Its dropdown lists, copied as they are. The keys are what the backend stores.

export const YES_NO_NA: Record<string, string> = { yes: 'Yes', no: 'No', not_applicable: 'Not Applicable' };
export const CUSTOMER_CATEGORY: Record<string, string> = { b2b: 'B2B', b2c: 'B2C', b2g: 'B2G' };
export const GST_REG_TYPES: Record<string, string> = { regular: 'Regular', composition: 'Composition', sez: 'SEZ', government: 'Government', unregistered: 'Unregistered', other: 'Other' };
export const CREDIT_OR_CASH: Record<string, string> = { credit: 'Credit', cash: 'Cash' };
export const PAYMENT_TERMS: Record<string, string> = { immediate: 'Immediate', net_15: 'Net 15', net_30: 'Net 30', net_45: 'Net 45', net_60: 'Net 60', net_90: 'Net 90', other: 'Other' };
/** Days a payment term gives (Net 30 → 30). "Other": none. */
export const TERM_DAYS: Record<string, number> = { immediate: 0, net_15: 15, net_30: 30, net_45: 45, net_60: 60, net_90: 90 };
export const EXPORT_CATEGORY: Record<string, string> = { goods: 'Goods', services: 'Services', goods_services: 'Goods & Services' };
export const REALISATION_MODE: Record<string, string> = { advance: 'Advance', brc_firc: 'Against BRC/FIRC on shipment', lc: 'Letter of Credit', other: 'Other' };
export const TAX_TYPE: Record<string, string> = { intra: 'CGST + SGST (Intra-state)', inter: 'IGST (Inter-state / Export)' };
export const EXPORT_REALISATION_NORM =
  'Export proceeds must normally be realised and repatriated within 9 months from the date of export, per FEMA 23(R)/2026-RB and the Master Direction on Export of Goods and Services (effective 1-Oct-2026). Extend via the AD bank if the deadline is at risk.';

/** One row of the form's "Debtor Category Master": what a category suggests. The form's own words. */
export interface DebtorRule {
  ledger: string;
  gst: string;
  tcs: string;
  legacy: string;
  tcsRate: string;
  credit: string;
  /** The suggested credit period as a number, only when the form gives one number. */
  creditDays: number | null;
  related: boolean;
  /** Customer category the debtor category implies (for a consistency warning). */
  customer: 'b2b' | 'b2c' | 'b2g' | null;
  /** Export customer? the category implies: true, false, or no rule. */
  exporting: boolean | null;
  notes: string;
}

const NA = 'Not applicable';
const TAXABLE = 'Taxable (CGST+SGST / IGST per place of supply)';
const ZERO = 'Zero-rated (with LUT/Bond, or with IGST + refund)';
const D = (ledger: string, gst: string, credit: string, creditDays: number | null, customer: DebtorRule['customer'], exporting: boolean | null, notes: string, more: Partial<DebtorRule> = {}): DebtorRule => ({ ledger, gst, tcs: NA, legacy: NA, tcsRate: NA, credit, creditDays, related: false, customer, exporting, notes, ...more });

/** The Debtor Category Master (TCS under the Income Tax Act 2025, s.394; refresh each year against the CBDT chart). */
export const DEBTOR_MASTER: Record<string, DebtorRule> = {
  domestic_b2b_regular: D('Trade Receivables – Domestic', TAXABLE, '30 Days', 30, 'b2b', false, 'Default category for ordinary domestic B2B trade sales.', { legacy: '206C(1H) — WITHDRAWN w.e.f. 1-Apr-2025, no successor' }),
  domestic_b2c_retail: D('Trade Receivables – Domestic Retail', 'Taxable (CGST+SGST / IGST)', 'Immediate / 7 Days', null, 'b2c', false, 'Cash-heavy category — Credit or Cash Customer typically defaults to Cash.'),
  domestic_b2g: D('Trade Receivables – Government', 'Taxable', '45–60 Days', null, 'b2g', false, 'Government/PSU buyer may deduct GST TDS u/s 51 CGST Act (2% on payments >₹2.5 lakh); reconcile against GSTR-7A of the buyer.'),
  export_goods: D('Trade Receivables – Export', ZERO, 'As per contract / Advance', null, 'b2b', true, 'FIRC/BRC + EDPMS tracking required. Realise proceeds within 9 months of export (FEMA 23(R)/2026-RB).'),
  export_services: D('Trade Receivables – Export', ZERO, 'As per contract / Advance', null, 'b2b', true, 'SOFTEX filing required for IT/ITES exports; EDPMS tracking; 9-month realisation norm applies.'),
  sez_unit: D('Trade Receivables – SEZ', 'Zero-rated (Bond/LUT — supply treated as export)', 'As per contract', null, 'b2b', null, 'Requires SEZ endorsement on invoice and Bond/LUT registered on ICEGATE; verify SEZ online database before supply.'),
  deemed_export: D('Trade Receivables – Deemed Export', 'Taxable, with refund route available to supplier', 'As per contract', null, 'b2b', false, 'Supply stays within India but is treated as deemed export under FTP — GST is charged, refund claimed separately.'),
  ecommerce_marketplace: D('Trade Receivables – E-commerce', 'Taxable — TCS collected BY the e-commerce operator, not by us', '7–15 Days (ECO payout cycle)', null, 'b2b', false, 'Reconcile against GSTR-8 filed by the marketplace; this is GST-law TCS, not Income Tax Act TCS.', { tcs: 'Sec 52 CGST Act (GST TCS, distinct from Income Tax TCS)', tcsRate: 'Typically 0.5% (0.25%+0.25% or 1% IGST) collected by ECO' }),
  related_party_domestic: D('Trade Receivables – Related Party (Elimination)', "Taxable at open-market/arm's-length value (GST Valuation Rule 28)", '30 Days', 30, 'b2b', false, 'Flag for Ind AS 24 related-party disclosure and consolidation elimination entries.', { related: true }),
  related_party_overseas: D('Trade Receivables – Related Party – Export (Elimination)', "Zero-rated if genuine export; transfer-pricing arm's-length value applies", 'As per Group policy', null, 'b2b', true, 'Form 3CEB transfer-pricing report applicable; flag for both Related Party and Export handling.', { related: true }),
  dealer_distributor: D('Trade Receivables – Dealer/Distributor', 'Taxable', '45 Days', 45, 'b2b', false, 'Often volume/scheme-linked — commercial terms and discounts live in Pricing Master, not here.'),
  scrap_specified_goods: D('Trade Receivables – Scrap/Specified Goods Sales', 'Taxable', '30 Days', 30, 'b2b', false, 'TCS must be collected by us at the time of invoicing/receipt, whichever is earlier — set up TCS collection on this ledger.', { tcs: '394(1)', legacy: '206C(1) [old]', tcsRate: 'Up to 2% — confirm current CBDT rate for the specific goods category' }),
  luxury_goods: D('Trade Receivables – Luxury Goods Sales', 'Taxable', '30 Days / Advance', null, 'b2b', false, 'New TCS obligation introduced by the Income Tax Act 2025 — thresholds are notified separately by CBDT; verify before invoicing.', { tcs: '394', legacy: 'No equivalent under 1961 Act — new provision', tcsRate: '1% above CBDT-notified threshold' }),
  tour_package: D('Trade Receivables – Tour Package Sales', 'Taxable', 'Advance / 15 Days', null, 'b2b', false, 'Flat-rate TCS replacing the old tiered 5%/20% structure — applies only if the company sells tour packages.', { tcs: '394', legacy: '206C(1G) [old]', tcsRate: '2% flat on package value' }),
  composition_scheme: D('Trade Receivables – Domestic', 'Taxable — normal tax invoice from us', '30 Days', 30, 'b2b', false, "Customer's Composition status affects THEIR ability to claim ITC, not our own tax treatment — invoice normally."),
  employee_advances: D('Employee Advances Receivable (NOT Trade Receivables)', 'Not applicable — not a taxable supply', 'Per HR policy', null, null, false, 'Route to a distinct control account — do not mix with Trade Receivables ageing/credit-limit logic.'),
};

const uniq = (xs: string[]) => Object.fromEntries([...new Set(xs)].map((x) => [x, x]));
export const LEDGER_OPTIONS = uniq(Object.values(DEBTOR_MASTER).map((d) => d.ledger));
export const GST_TREATMENT_OPTIONS = uniq(Object.values(DEBTOR_MASTER).map((d) => d.gst));
export const TCS_OPTIONS = uniq(Object.values(DEBTOR_MASTER).map((d) => d.tcs));
export const CURRENCIES: Record<string, string> = { INR: 'INR', USD: 'USD', EUR: 'EUR', GBP: 'GBP' };
export const PO_RULES: Record<string, string> = { every_invoice: 'PO number on every invoice', none: 'No PO reference needed' };
export const DELIVERY: Record<string, string> = { email: 'Email', portal: 'Customer portal upload', with_goods: 'Copy with the goods', courier: 'Courier' };

/** Sec 43B(h): does the 45-day clock bind this payable? The category settles it for about half the list. */
export type Sec43bh = 'applies' | 'not_applicable' | 'if_msme' | 'verify';
export const SEC_43BH: Record<string, { outcome: Sec43bh; words: string }> = {
  goods_msme: { outcome: 'applies', words: 'Pay within 45 days (or the agreed period, max 45) or the expense is disallowed.' },
  goods_non_msme: { outcome: 'not_applicable', words: 'Not applicable.' },
  capital_goods: { outcome: 'if_msme', words: 'Applicable if the vendor is MSME.' },
  consultants: { outcome: 'if_msme', words: 'Applicable if the consultant is MSME-registered.' },
  contractors: { outcome: 'if_msme', words: 'Applicable if the contractor is MSME.' },
  manpower_security: { outcome: 'if_msme', words: 'Applicable if MSME.' },
  freight_gta: { outcome: 'if_msme', words: 'Applicable if MSME.' },
  commission_brokerage: { outcome: 'if_msme', words: 'Applicable if MSME.' },
  rent_immovable: { outcome: 'not_applicable', words: 'Not applicable — a landlord is not a goods or service MSME vendor.' },
  advertising: { outcome: 'if_msme', words: 'Applicable if MSME.' },
  it_software: { outcome: 'not_applicable', words: 'Generally not applicable.' },
  insurance: { outcome: 'not_applicable', words: 'Not applicable.' },
  utilities: { outcome: 'not_applicable', words: 'Not applicable.' },
  directors: { outcome: 'not_applicable', words: 'Not applicable.' },
  related_party: { outcome: 'verify', words: 'Rarely applicable — verify.' },
  loans_icd: { outcome: 'not_applicable', words: 'Not applicable.' },
  employee_reimbursement: { outcome: 'not_applicable', words: 'Not applicable.' },
  ecommerce_operators: { outcome: 'if_msme', words: 'Applicable if MSME.' },
  government_statutory: { outcome: 'not_applicable', words: 'Not applicable.' },
  international_import: { outcome: 'not_applicable', words: 'Not applicable.' },
};

/** The header ("Under") a category puts the account in. Headers are rows in accounting.account (is_postable = false). */
export function underFor(side: Side, category: string): string {
  if (side === 'payable') {
    if (category === 'goods_msme' || category === 'goods_non_msme') return 'Trade Payables › Goods';
    if (category === 'capital_goods') return 'Trade Payables › Capital Goods';
    if (category === 'related_party') return 'Trade Payables › Related Parties';
    if (category === 'international_import') return 'Trade Payables › Import';
    return 'Trade Payables › Services & Expenses';
  }
  if (['export_goods', 'export_services', 'sez_unit', 'deemed_export'].includes(category)) return 'Trade Receivables › Export & SEZ';
  if (category.startsWith('related_party')) return 'Trade Receivables › Related Parties';
  if (category === 'domestic_b2b_regular' || category === 'dealer_distributor' || category === 'domestic_b2g') return 'Trade Receivables › Domestic';
  return 'Trade Receivables › Other';
}

export const HEADERS_PAYABLE = ['Trade Payables › Goods', 'Trade Payables › Capital Goods', 'Trade Payables › Services & Expenses', 'Trade Payables › Related Parties', 'Trade Payables › Import'];
export const HEADERS_RECEIVABLE = ['Trade Receivables › Domestic', 'Trade Receivables › Export & SEZ', 'Trade Receivables › Related Parties', 'Trade Receivables › Other'];

/** PAN 4th letter → holder type (Income-tax PAN structure). */
export function constitutionFromPan(pan: string | null): { value: string; why: string } | null {
  if (!pan || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return null;
  const c = pan[3];
  const map: Record<string, [string, string]> = {
    C: ['company', 'C = company'],
    F: ['partnership', 'F = firm (covers partnerships and LLPs: check which)'],
    P: ['individual', 'P = individual (a proprietor uses their own PAN)'],
    H: ['huf', 'H = HUF'],
    T: ['trust_society', 'T = trust'],
    G: ['government', 'G = government'],
    A: ['other', 'A = association of persons'],
  };
  const m = map[c];
  return m ? { value: m[0], why: `PAN ${pan}: 4th letter ${m[1]}` } : null;
}
