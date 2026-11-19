// What the request holds, what the system works out from what you typed, what is checked, and who checks what.
// Pure functions over the state: the screens only render what these return (design doc §3, §6).
// Everything is typed by the Accounts Executive from the paper form (decided 27-Oct): there is no "shown from
// another role" any more. The system only WORKS OUT values from what you typed (state from the GSTIN,
// constitution from the PAN, ledger and GST / TCS treatment from the debtor category …), and you can edit those too.
// Customer fields follow the CA's Customer Master onboarding form (Swasthik, sections A–F and B1), in its order.

import { inr } from '../domain/money';
import {
  ACTORS,
  categoriesFor,
  CONSTITUTIONS,
  constitutionFromPan,
  CREDIT_OR_CASH,
  CURRENCIES,
  CUSTOMER_CATEGORY,
  DEBTOR_MASTER,
  DELIVERY,
  EXPORT_CATEGORY,
  GST_REG_TYPES,
  GST_TREATMENT_OPTIONS,
  HEADERS_PAYABLE,
  HEADERS_RECEIVABLE,
  LEDGER_OPTIONS,
  MSME_CATEGORY,
  MSME_STATUS,
  OUR_STATE,
  PAYMENT_TERMS,
  PO_RULES,
  REALISATION_MODE,
  RESIDENT,
  SEC_43BH,
  STATE_OPTIONS,
  STATES,
  stateOfGstin,
  TAX_TYPE,
  TCS_OPTIONS,
  TERM_DAYS,
  underFor,
  YES_NO,
  YES_NO_NA,
} from './catalogue';
import type { Account, ActorKey, Block, FieldValue, Party, Request, Side, Suggestion, Values } from './types';

// ---------- Sections (the form's A–F, in its order) ----------

/** A–F and B1 are the customer form's sections; S is its "System suggestions" block; BI the billing instructions
 *  (task card T12); M and K are the vendor's MSME and bank blocks. */
export type Section = 'A' | 'S' | 'B' | 'B1' | 'C' | 'D' | 'BI' | 'BK' | 'E' | 'F' | 'M' | 'K';

export interface SectionDef {
  id: Section;
  title: string;
  note: string;
  sides: Side[];
  visible?: (v: Values) => boolean;
}

const both: Side[] = ['payable', 'receivable'];
const cust: Side[] = ['receivable'];
const vend: Side[] = ['payable'];

export const SECTIONS: SectionDef[] = [
  { id: 'A', title: 'A · Basic details', note: 'Who the customer is. The debtor / ledger category is the most important field: it drives the suggestions below.', sides: both },
  { id: 'S', title: 'System suggestions', note: 'Worked out from the debtor / ledger category. Confirm them; change one only if this customer is an exception.', sides: both },
  { id: 'B', title: 'B · GST & tax compliance', note: 'Confirm or override the suggestions. Venkat (Compliance Officer) checks this part.', sides: both },
  { id: 'B1', title: 'B1 · Other GST registrations', note: 'If the customer has more GSTINs across states (branches, HO). One party, one account: each GSTIN is a branch we can bill.', sides: cust },
  { id: 'C', title: 'C · Address & contact', note: 'The registered / billing address of the main GSTIN.', sides: both },
  { id: 'D', title: 'D · Credit & collection terms', note: 'Farid (Credit Controller) checks the credit limit.', sides: both },
  { id: 'BI', title: 'Billing instructions', note: 'For the Billing Executive, who applies them but cannot change them (task card T12).', sides: cust },
  { id: 'BK', title: 'Bank details (optional)', note: "Not on the CA's form (Vijay, 6-Nov). For refunds (excess payment, security deposit, credit notes) and matching receipts. Stored once per party in fin.party_bank_account, shared with the vendor side.", sides: cust },
  { id: 'E', title: 'E · Export / cross-border receipts', note: 'Only because Export customer = Yes: the FEMA receivables side.', sides: cust, visible: (v) => v.exportCustomer === 'yes' },
  { id: 'F', title: 'F · Documents & remarks', note: 'What came with the form.', sides: cust },
  { id: 'M', title: 'MSME', note: '', sides: vend },
  { id: 'K', title: 'Bank', note: '', sides: vend },
];

export const sectionsFor = (r: Request) => SECTIONS.filter((s) => s.sides.includes(r.side) && (!s.visible || s.visible(r.values)));

// ---------- Fields ----------

/** Who gets the value: P&C (the party), Finance (the account), or the system works it out. */
export type Group = 'party' | 'finance' | 'worked';

export interface FieldDef {
  key: string;
  label: string;
  section: Section;
  group: Group;
  kind: 'text' | 'number' | 'select' | 'switch';
  options?: Record<string, string> | ((r: Request) => Record<string, string>);
  sides: Side[];
  required?: (v: Values, r: Request) => boolean;
  visible?: (v: Values, r: Request) => boolean;
  placeholder?: string;
  hint?: string;
  unit?: string;
  upper?: boolean;
  wide?: boolean;
}

const always = () => true;
const isYes = (k: string) => (v: Values) => v[k] === 'yes';
const mismatch = (_v: Values, r: Request) => r.pennyDrop?.result === 'name_mismatch';
const resident = (v: Values) => v.resident !== 'non_resident';
const registered = (v: Values) => v.gstRegistered === 'yes';
const exporting = (v: Values) => v.exportCustomer === 'yes';
const notCash = (v: Values) => v.creditOrCash !== 'cash';
const onCredit = (v: Values) => v.creditOrCash === 'credit';
const sez = (v: Values) => exporting(v) || v.gstRegType === 'sez';
const shipping = (v: Values) => !isEmpty(v.shippingAddress) && String(v.shippingAddress).trim() !== '';
/** Bank details are optional for a customer, but all or nothing: one field typed needs the account, IFSC and name. */
const BANK_KEYS = ['beneficiary', 'bankName', 'bankBranch', 'bankAccountNo', 'ifsc', 'bankProof'];
const anyBank = (v: Values) => BANK_KEYS.some((k) => !isEmpty(v[k]) && String(v[k]).trim() !== '');
const manyGstins = (v: Values, r: Request) => registered(v) && (r.registrations?.length ?? 0) > 0;

/** The GSTINs on the form: the main one, then section B1's. */
export const gstinsOnForm = (r: Request) => [String(r.values.gstin ?? '').trim(), ...(r.registrations ?? []).map((g) => g.gstin.trim())].filter(Boolean);
const gstinOptions = (r: Request) => Object.fromEntries(gstinsOnForm(r).map((g) => [g, `${g} · ${STATES[stateOfGstin(g) ?? '']?.name ?? 'state ?'}`]));

export const FIELDS: FieldDef[] = [
  // A. Basic details
  { key: 'tradeName', label: 'Customer name', section: 'A', group: 'party', kind: 'text', sides: cust, required: always, hint: 'The name commonly used for the customer.' },
  { key: 'legalName', label: 'Legal name (as per PAN / GST)', section: 'A', group: 'party', kind: 'text', sides: cust, required: always, wide: true, hint: 'Must match the PAN / GST records exactly.' },
  { key: 'legalName', label: 'Legal name', section: 'A', group: 'party', kind: 'text', sides: vend, required: always, wide: true, hint: 'As on the GST certificate / PAN.' },
  { key: 'tradeName', label: 'Trade name', section: 'A', group: 'party', kind: 'text', sides: vend, placeholder: 'Only if different' },
  { key: 'constitution', label: 'Constitution / customer type', section: 'A', group: 'worked', kind: 'select', options: CONSTITUTIONS, sides: cust, required: always },
  { key: 'customerCategory', label: 'Customer category', section: 'A', group: 'finance', kind: 'select', options: CUSTOMER_CATEGORY, sides: cust, required: always, hint: 'Business relationship classification.' },
  { key: 'category', label: 'Debtor / ledger category', section: 'A', group: 'finance', kind: 'select', options: (r) => categoriesFor(r.side), sides: cust, required: always, wide: true, hint: 'Drives the ledger, GST treatment, TCS section and credit period: select carefully.' },
  { key: 'category', label: 'Category', section: 'A', group: 'finance', kind: 'select', options: (r) => categoriesFor(r.side), sides: vend, required: always, wide: true },
  { key: 'relatedParty', label: 'Related party?', section: 'A', group: 'finance', kind: 'select', options: YES_NO, sides: vend, required: always, hint: 'Ind AS 24. Blank means "nobody has said".' },
  { key: 'pan', label: 'PAN', section: 'A', group: 'party', kind: 'text', sides: both, required: resident, placeholder: 'AAAAA0000A', upper: true, hint: 'Needed when the invoice / TDS threshold applies; a non-resident may have none.' },
  { key: 'gstin', label: 'GSTIN', section: 'A', group: 'party', kind: 'text', sides: vend, placeholder: '29AAAAA0000A1Z5', upper: true, hint: 'Leave blank if the party is not GST-registered.' },
  { key: 'constitution', label: 'Constitution', section: 'A', group: 'worked', kind: 'select', options: CONSTITUTIONS, sides: vend, required: always },
  { key: 'resident', label: 'Resident status', section: 'A', group: 'worked', kind: 'select', options: RESIDENT, sides: both, required: always },

  // System suggestions (blue rows on the form): from the debtor category, confirmed or overridden here.
  { key: 'ledger', label: 'Suggested ledger (chart of accounts)', section: 'S', group: 'worked', kind: 'select', options: LEDGER_OPTIONS, sides: cust, required: always },
  {
    key: 'under',
    label: 'Under (header)',
    section: 'S',
    group: 'worked',
    kind: 'select',
    options: (r) => Object.fromEntries((r.side === 'payable' ? HEADERS_PAYABLE : HEADERS_RECEIVABLE).map((h) => [h, h])),
    sides: both,
    required: always,
  },
  { key: 'gstTreatment', label: 'GST treatment', section: 'S', group: 'worked', kind: 'select', options: GST_TREATMENT_OPTIONS, sides: cust, required: always },
  { key: 'tcsSection', label: 'TCS section (Income Tax Act 2025)', section: 'S', group: 'worked', kind: 'select', options: TCS_OPTIONS, sides: cust, required: always },
  { key: 'tcsRate', label: 'TCS rate & threshold', section: 'S', group: 'worked', kind: 'text', sides: cust, required: always },
  { key: 'relatedParty', label: 'Related party / elimination', section: 'S', group: 'worked', kind: 'select', options: YES_NO, sides: cust, required: always },
  { key: 'accountName', label: 'Account name (as it shows in the books)', section: 'S', group: 'worked', kind: 'text', sides: both, required: always },

  // B. GST & tax compliance
  { key: 'gstRegistered', label: 'GST registered?', section: 'B', group: 'party', kind: 'select', options: YES_NO, sides: cust, required: always },
  { key: 'gstin', label: 'GSTIN', section: 'B', group: 'party', kind: 'text', sides: cust, visible: registered, required: registered, placeholder: '29AAAAA0000A1Z5', upper: true, hint: 'The main GSTIN, from the GST certificate. Other GSTINs go in B1.' },
  { key: 'taxType', label: 'Tax type (this GSTIN vs our home state)', section: 'B', group: 'worked', kind: 'select', options: TAX_TYPE, sides: cust, visible: registered, required: registered },
  { key: 'gstRegType', label: 'GST registration type', section: 'B', group: 'finance', kind: 'select', options: GST_REG_TYPES, sides: cust, visible: registered, required: registered },
  { key: 'exportCustomer', label: 'Export customer?', section: 'B', group: 'finance', kind: 'select', options: YES_NO, sides: cust, required: always, hint: 'Supplies to this customer are exported out of India.' },
  { key: 'sezCustomer', label: 'SEZ customer?', section: 'B', group: 'finance', kind: 'select', options: YES_NO, sides: cust, visible: sez, required: sez, hint: 'An SEZ unit or developer.' },
  { key: 'eInvoice', label: 'E-invoice applicable?', section: 'B', group: 'worked', kind: 'select', options: YES_NO_NA, sides: cust, required: always },
  { key: 'tcsConfirmed', label: 'TCS applicability confirmed?', section: 'B', group: 'finance', kind: 'select', options: YES_NO_NA, sides: cust, required: always, hint: 'Confirm the suggested TCS section against actual turnover / threshold.' },

  // B1. Other GST registrations: the rows are their own table; this is the default among them.
  { key: 'billingGstin', label: 'Default / billing GSTIN', section: 'B1', group: 'worked', kind: 'select', options: gstinOptions, sides: cust, visible: manyGstins, required: manyGstins },

  // C. Address & contact
  { key: 'addressLine', label: 'Registered / billing address', section: 'C', group: 'party', kind: 'text', sides: cust, required: always, wide: true, hint: 'Full address as per PAN / GST records.' },
  { key: 'addressLine', label: 'Address', section: 'C', group: 'party', kind: 'text', sides: vend, required: always, wide: true },
  { key: 'city', label: 'City', section: 'C', group: 'party', kind: 'text', sides: both, required: always },
  { key: 'state', label: 'State', section: 'C', group: 'worked', kind: 'select', options: STATE_OPTIONS, sides: both, required: resident },
  { key: 'pincode', label: 'PIN code', section: 'C', group: 'party', kind: 'text', sides: both, required: resident, placeholder: '560001', hint: '6 digits; blank for a foreign address.' },
  { key: 'shippingAddress', label: 'Shipping address (if different)', section: 'C', group: 'party', kind: 'text', sides: cust, wide: true, hint: 'Only if goods are delivered to a different location. Becomes a P&C location "Ship-to" on approval.' },
  // Added for the law, not on the CA's form: the ship-to's city, state and PIN (the form has one line for it).
  { key: 'shipCity', label: 'Shipping city', section: 'C', group: 'party', kind: 'text', sides: cust, visible: shipping, required: shipping },
  { key: 'shipState', label: 'Shipping state', section: 'C', group: 'party', kind: 'select', options: STATE_OPTIONS, sides: cust, visible: shipping, required: shipping, hint: 'Decides the place of supply for goods (IGST Act s.10(1)(a)).' },
  { key: 'shipPincode', label: 'Shipping PIN code', section: 'C', group: 'party', kind: 'text', sides: cust, visible: shipping, required: shipping, placeholder: '562114', hint: '6 digits: the e-way bill needs it.' },
  { key: 'contactPerson', label: 'Contact person', section: 'C', group: 'party', kind: 'text', sides: both },
  { key: 'phone', label: 'Mobile number', section: 'C', group: 'party', kind: 'text', sides: cust, required: always, placeholder: '+91 98xxx xxxxx', hint: '10-digit mobile number.' },
  { key: 'phone', label: 'Phone', section: 'C', group: 'party', kind: 'text', sides: vend, required: always, placeholder: '+91 …' },
  { key: 'email', label: 'Email ID', section: 'C', group: 'party', kind: 'text', sides: cust, required: always, placeholder: 'accounts@…', hint: 'Used for invoices, statements and correspondence.' },
  { key: 'email', label: 'Email', section: 'C', group: 'party', kind: 'text', sides: vend, placeholder: 'accounts@…' },

  // D. Credit & collection terms
  { key: 'creditOrCash', label: 'Credit or cash customer?', section: 'D', group: 'finance', kind: 'select', options: CREDIT_OR_CASH, sides: cust, required: always },
  { key: 'creditLimit', label: 'Credit limit', section: 'D', group: 'finance', kind: 'number', sides: cust, visible: notCash, required: onCredit, unit: '₹', hint: 'As written on the form. Farid (Credit Controller) checks it.' },
  { key: 'paymentTerms', label: 'Payment terms', section: 'D', group: 'finance', kind: 'select', options: PAYMENT_TERMS, sides: cust, required: always },
  { key: 'creditDays', label: 'Credit period', section: 'D', group: 'worked', kind: 'number', sides: cust, visible: notCash, required: onCredit, unit: 'days' },
  { key: 'creditDays', label: 'Credit days', section: 'D', group: 'finance', kind: 'number', sides: vend, required: always, unit: 'days' },
  { key: 'securityDeposit', label: 'Security deposit', section: 'D', group: 'finance', kind: 'number', sides: cust, unit: '₹', hint: 'Refundable deposit held, if any.' },
  { key: 'collectionOwner', label: 'Collection owner', section: 'D', group: 'finance', kind: 'text', sides: cust, hint: 'Employee responsible for collections on this account.' },
  { key: 'currency', label: 'Currency', section: 'D', group: 'worked', kind: 'select', options: CURRENCIES, sides: both, required: always },
  { key: 'billByBill', label: 'Track bill by bill', section: 'D', group: 'worked', kind: 'switch', sides: both },

  // Billing instructions (task card T12: "billing instructions: PO reference rule, delivery channel, format")
  { key: 'poRule', label: 'PO reference', section: 'BI', group: 'finance', kind: 'select', options: PO_RULES, sides: cust, required: always },
  { key: 'delivery', label: 'Send invoices by', section: 'BI', group: 'finance', kind: 'select', options: DELIVERY, sides: cust, required: always },
  { key: 'invoiceFormat', label: 'Invoice format note', section: 'BI', group: 'finance', kind: 'text', sides: cust, placeholder: 'Optional' },

  // Bank details (optional, Vijay 6-Nov; not on the CA's form): fin.party_bank_account, shared with the vendor side.
  { key: 'beneficiary', label: 'Account holder name', section: 'BK', group: 'finance', kind: 'text', sides: cust, required: anyBank, hint: 'As on the cancelled cheque or bank letter.' },
  { key: 'bankName', label: 'Bank name', section: 'BK', group: 'finance', kind: 'text', sides: cust },
  { key: 'bankBranch', label: 'Branch', section: 'BK', group: 'finance', kind: 'text', sides: cust },
  { key: 'bankAccountNo', label: 'Bank account number', section: 'BK', group: 'finance', kind: 'text', sides: cust, required: anyBank },
  { key: 'ifsc', label: 'IFSC', section: 'BK', group: 'finance', kind: 'text', sides: cust, required: anyBank, placeholder: 'ABCD0123456', upper: true, hint: 'No penny-drop now: the account is verified before the first refund is paid to it.' },
  { key: 'bankProof', label: 'Cancelled cheque / bank proof attached?', section: 'BK', group: 'finance', kind: 'select', options: YES_NO, sides: cust },

  // E. Export / cross-border receipts (only if Export customer = Yes)
  { key: 'adBank', label: 'AD bank (for export realisation)', section: 'E', group: 'finance', kind: 'text', sides: cust, visible: exporting, required: exporting, hint: 'The Authorised Dealer bank through which export proceeds are realised.' },
  { key: 'exportCategory', label: 'Export category', section: 'E', group: 'finance', kind: 'select', options: EXPORT_CATEGORY, sides: cust, visible: exporting, required: exporting },
  { key: 'lut', label: 'LUT number & validity', section: 'E', group: 'finance', kind: 'text', sides: cust, visible: exporting, placeholder: 'AD290426000000X · to 31-Mar-2027', hint: 'Needed for a zero-rated export without paying IGST.' },
  { key: 'realisationMode', label: 'Expected mode of realisation', section: 'E', group: 'finance', kind: 'select', options: REALISATION_MODE, sides: cust, visible: exporting },
  { key: 'fircBrc', label: 'FIRC / BRC tracking required?', section: 'E', group: 'finance', kind: 'select', options: YES_NO, sides: cust, visible: exporting, required: exporting, hint: 'Tracked per shipment.' },
  { key: 'edpms', label: 'EDPMS / SOFTEX reference (services)', section: 'E', group: 'finance', kind: 'text', sides: cust, visible: exporting, hint: 'For IT / ITES export invoices reported to RBI.' },

  // F. Documents & remarks
  { key: 'gstCertificate', label: 'GST certificate attached?', section: 'F', group: 'finance', kind: 'select', options: YES_NO, sides: cust },
  { key: 'panCopy', label: 'PAN copy attached?', section: 'F', group: 'finance', kind: 'select', options: YES_NO, sides: cust },
  { key: 'msmeCertificate', label: 'MSME / Udyam certificate (if the customer is MSME)', section: 'F', group: 'finance', kind: 'select', options: YES_NO, sides: cust, hint: 'For our own MSME reporting only.' },
  { key: 'remarks', label: 'Remarks', section: 'F', group: 'finance', kind: 'text', sides: cust, wide: true },

  // Vendor: MSME and bank
  { key: 'msmeStatus', label: 'MSME?', section: 'M', group: 'finance', kind: 'select', options: MSME_STATUS, sides: vend, required: always },
  { key: 'msmeCategory', label: 'MSME category', section: 'M', group: 'finance', kind: 'select', options: MSME_CATEGORY, sides: vend, visible: isYes('msmeStatus'), required: isYes('msmeStatus') },
  { key: 'udyam', label: 'Udyam number', section: 'M', group: 'finance', kind: 'text', sides: vend, visible: isYes('msmeStatus'), placeholder: 'UDYAM-KA-00-0000000', upper: true, hint: 'No certificate yet? Leave blank: a reminder goes to the vendor.' },
  { key: 'sec43bh', label: '43B(h) 45-day clock applies?', section: 'M', group: 'worked', kind: 'select', options: YES_NO, sides: vend, required: always },
  { key: 'bankAccountNo', label: 'Bank account number', section: 'K', group: 'finance', kind: 'text', sides: vend, required: always, hint: 'From the cancelled cheque.' },
  { key: 'ifsc', label: 'IFSC', section: 'K', group: 'finance', kind: 'text', sides: vend, required: always, placeholder: 'ABCD0123456', upper: true },
  { key: 'beneficiary', label: 'Beneficiary name', section: 'K', group: 'finance', kind: 'text', sides: vend, required: always },
  {
    key: 'callBackNumber',
    label: 'Call-back: number you called',
    section: 'K',
    group: 'finance',
    kind: 'select',
    options: (r) => ({ ...(isEmpty(r.values.phone) ? {} : { [String(r.values.phone)]: `${r.values.phone} · on the paper form` }), email: '+91 90000 11111 · given in an email with the bank details' }),
    sides: vend,
    visible: mismatch,
    required: mismatch,
    hint: 'Needed because the name at the bank does not match.',
  },
  { key: 'callBackPerson', label: 'Call-back: who confirmed', section: 'K', group: 'finance', kind: 'text', sides: vend, visible: mismatch, required: mismatch },
];

/** Party details: locked when you use a party that is already in the master (they come from there). */
export const PARTY_KEYS = [...new Set(FIELDS.filter((f) => f.group === 'party').map((f) => f.key))].concat('state');

export const fieldsFor = (r: Request) => FIELDS.filter((f) => f.sides.includes(r.side) && (!f.visible || f.visible(r.values, r)) && (!SECTIONS.find((s) => s.id === f.section)?.visible || SECTIONS.find((s) => s.id === f.section)!.visible!(r.values)));
export const fieldsIn = (r: Request, g: Group) => fieldsFor(r).filter((f) => f.group === g);
export const fieldsOfSection = (r: Request, s: Section) => fieldsFor(r).filter((f) => f.section === s);

export const optionsOf = (f: FieldDef, r: Request) => (typeof f.options === 'function' ? f.options(r) : f.options ?? {});

export const isEmpty = (v: FieldValue | undefined) => v === null || v === undefined || v === '';
const str = (v: FieldValue | undefined) => (isEmpty(v) ? '' : String(v).trim());

export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const UDYAM = /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** A mobile number's 10 digits (a +91 or 0 prefix and spaces allowed), or null. */
export function mobileDigits(phone: string): string | null {
  const d = phone.replace(/\D/g, '');
  const ten = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d;
  return ten.length === 10 ? ten : null;
}

// ---------- Worked out by the system ----------

/** What each worked-out field is worked out from: while those are all empty, it waits for them. */
export const WORKED_FROM: Record<string, { keys: string[]; words: string }> = {
  state: { keys: ['gstin'], words: 'the GSTIN' },
  accountName: { keys: ['legalName', 'tradeName'], words: 'the customer name' },
  under: { keys: ['category'], words: 'the category' },
  ledger: { keys: ['category'], words: 'the category' },
  gstTreatment: { keys: ['category'], words: 'the category' },
  tcsSection: { keys: ['category'], words: 'the category' },
  tcsRate: { keys: ['category'], words: 'the category' },
  relatedParty: { keys: ['category'], words: 'the category' },
  constitution: { keys: ['pan'], words: 'the PAN' },
  resident: { keys: ['pan', 'gstin'], words: 'the PAN or GSTIN' },
  taxType: { keys: ['gstin'], words: 'the GSTIN' },
  eInvoice: { keys: ['customerCategory'], words: 'the customer category' },
  creditDays: { keys: ['paymentTerms', 'category'], words: 'the payment terms or category' },
  billingGstin: { keys: ['gstin'], words: 'the GSTIN' },
  currency: { keys: [], words: '' },
  billByBill: { keys: [], words: '' },
  sec43bh: { keys: ['category'], words: 'the category' },
};

/** Values the system works out from what you typed. They follow their source until you change them yourself. */
export function suggestionsOf(r: Request, accounts: Account[] = []): Record<string, Suggestion> {
  const v = r.values;
  const s: Record<string, Suggestion> = {};
  const gstin = str(v.gstin);
  const pan = str(v.pan);
  const name = str(v.legalName);

  const st = GSTIN_RE.test(gstin) ? stateOfGstin(gstin) : null;
  if (st) s.state = { value: st, why: `GSTIN starts with ${gstin.slice(0, 2)}: ${STATES[st].name}` };

  if (name) {
    const other = r.partyId ? accounts.find((a) => a.partyId === r.partyId && a.side !== r.side) : undefined;
    const base = str(v.tradeName) || name;
    s.accountName = other
      ? { value: `${base} (${r.side === 'payable' ? 'vendor' : 'customer'})`, why: `"${other.name}" is already its ${other.side === 'payable' ? 'vendor' : 'customer'} account` }
      : { value: base, why: str(v.tradeName) ? `The ${r.side === 'receivable' ? 'customer' : 'trade'} name you typed` : 'The legal name you typed' };
  }

  const c = constitutionFromPan(pan);
  if (c) s.constitution = c;
  if (PAN_RE.test(pan) || GSTIN_RE.test(gstin)) s.resident = { value: 'resident', why: 'Has an Indian PAN / GSTIN' };
  if (v.resident !== 'non_resident') s.currency = { value: 'INR', why: 'Indian party: blank would also mean INR' };
  s.billByBill = { value: true, why: 'Trade party: bills are settled one by one' };

  const cat = str(v.category);
  if (cat) s.under = { value: underFor(r.side, cat), why: `From the category: ${categoriesFor(r.side)[cat]}` };
  if (r.side === 'payable' && cat) {
    const rel = SEC_43BH[cat];
    const msme = v.msmeStatus;
    let value: FieldValue = '';
    if (rel?.outcome === 'applies') value = 'yes';
    else if (rel?.outcome === 'not_applicable') value = 'no';
    else if (rel?.outcome === 'if_msme') value = msme === 'yes' ? 'yes' : msme === 'no' ? 'no' : '';
    s.sec43bh = { value, why: `CA's table for this category: ${rel?.words ?? '—'}${rel?.outcome === 'if_msme' ? ` MSME = ${msme || 'not answered'}.` : ''}` };
  }

  if (r.side === 'receivable') {
    // The form's blue rows: the Debtor Category Master's line for the category chosen.
    const m = DEBTOR_MASTER[cat];
    if (m) {
      const from = `Debtor category master: ${categoriesFor('receivable')[cat]}`;
      s.ledger = { value: m.ledger, why: from };
      s.gstTreatment = { value: m.gst, why: from };
      s.tcsSection = { value: m.tcs, why: m.legacy === 'Not applicable' ? from : `${from} (legacy: ${m.legacy})` };
      s.tcsRate = { value: m.tcsRate, why: m.tcs === 'Not applicable' ? from : `${from}: confirm against the current CBDT notification` };
      s.relatedParty = { value: m.related ? 'yes' : 'no', why: m.related ? `${from}: Ind AS 24 disclosure and elimination` : from };
    }
    // Tax type: this GSTIN's state against our GST home state (a company setting, set once).
    if (exporting(v)) s.taxType = { value: 'inter', why: 'Export: IGST' };
    else if (st) s.taxType = st === OUR_STATE ? { value: 'intra', why: `GSTIN state ${STATES[st].name} = our home state` } : { value: 'inter', why: `GSTIN state ${STATES[st].name} ≠ our home state ${STATES[OUR_STATE].name}` };
    // E-invoice: our turnover is above the e-invoicing limit (company setting); it applies to B2B / B2G and exports.
    const cc = str(v.customerCategory);
    if (exporting(v)) s.eInvoice = { value: 'yes', why: 'Export invoice: e-invoicing applies (our turnover is above the limit)' };
    else if (cc === 'b2c') s.eInvoice = { value: 'not_applicable', why: 'B2C: e-invoicing is for B2B / B2G and exports' };
    else if (cc && v.gstRegistered === 'no') s.eInvoice = { value: 'not_applicable', why: 'Not GST-registered: no recipient GSTIN for an e-invoice' };
    else if (cc) s.eInvoice = { value: 'yes', why: `${CUSTOMER_CATEGORY[cc]} and our turnover is above the e-invoicing limit` };
    // Credit period: the payment terms first (Net 30 → 30), else the category master when it gives one number.
    const pt = str(v.paymentTerms);
    if (pt in TERM_DAYS) s.creditDays = { value: TERM_DAYS[pt], why: `Payment terms: ${PAYMENT_TERMS[pt]}` };
    else if (m?.creditDays != null) s.creditDays = { value: m.creditDays, why: `Debtor category master: ${m.credit}` };
    else if (m) s.creditDays = { value: '', why: `The category master says "${m.credit}": type the agreed days` };
    if (GSTIN_RE.test(gstin) && (r.registrations?.length ?? 0) > 0) s.billingGstin = { value: gstin, why: 'The main GSTIN (section B)' };
  }
  return s;
}

/**
 * After a change, worked-out fields that still hold their old suggestion (or nothing) take the new one.
 * A value you changed yourself is never overwritten.
 */
export function follow(r: Request, before: Record<string, Suggestion>, accounts: Account[] = []) {
  const after = suggestionsOf(r, accounts);
  for (const k of Object.keys(WORKED_FROM)) {
    const a = after[k];
    if (!a) continue;
    if (!FIELDS.some((f) => f.key === k && f.group === 'worked' && f.sides.includes(r.side))) continue;
    const cur = r.values[k];
    const b = before[k]?.value;
    if ((isEmpty(cur) || cur === b) && a.value !== cur) r.values[k] = a.value;
  }
}

export type Origin = 'worked' | 'changed' | 'waits' | 'typed' | 'empty';

export function originOf(f: FieldDef, r: Request, accounts: Account[] = []): Origin {
  const v = r.values[f.key];
  if (f.group === 'worked') {
    const sug = suggestionsOf(r, accounts)[f.key];
    if (sug && !isEmpty(sug.value)) return v === sug.value ? 'worked' : 'changed';
    const src = WORKED_FROM[f.key]?.keys ?? [];
    if (isEmpty(v)) return src.length && src.every((k) => isEmpty(r.values[k])) ? 'waits' : 'empty';
    return 'typed';
  }
  return isEmpty(v) && f.kind !== 'switch' ? 'empty' : 'typed';
}

/** A required field that is still empty (a worked-out field waiting for its source does not count yet). */
export const isMissing = (f: FieldDef, r: Request) => !!f.required?.(r.values, r) && isEmpty(r.values[f.key]) && f.kind !== 'switch';

// ---------- Tax tagging (Compliance Officer's, after you submit) ----------

const TDS_BY_CATEGORY: Record<string, string> = {
  goods_msme: '194Q, once purchases from this vendor cross ₹50 lakh in the year',
  goods_non_msme: '194Q, once purchases from this vendor cross ₹50 lakh in the year',
  contractors: '194C (1% individual / HUF, 2% others)',
  manpower_security: '194C (1% individual / HUF, 2% others)',
  freight_gta: '194C; GST under reverse charge unless the GTA charges forward',
  consultants: '194J',
  commission_brokerage: '194H',
  rent_immovable: '194-I',
};

export function taxTagging(r: Request): string[] {
  const st = str(r.values.state);
  const supply = isEmpty(r.values.gstin) ? 'unregistered: check RCM' : st ? (st === OUR_STATE ? 'intra-state (CGST + SGST)' : 'inter-state (IGST)') : 'state not known yet';
  const cat = str(r.values.category);
  if (r.side === 'payable') {
    return [`TDS: ${TDS_BY_CATEGORY[cat] ?? (cat ? 'none expected for this category' : 'pick a category first')}`, `GST: regular, forward charge, ${supply}`, 'ITC: eligible (not blocked under 17(5))'];
  }
  return [`GST: ${str(r.values.gstTreatment) || 'pick a category first'}`, `TCS: ${str(r.values.tcsSection) || '—'}`, `E-invoice: ${YES_NO_NA[str(r.values.eInvoice)] ?? '—'}`];
}

// ---------- Checks (design doc §6) ----------

export interface CheckResult {
  level: 'stop' | 'warn' | 'ok';
  title: string;
  detail?: string;
  /** The form itself cannot be set up (party already set up, GSTIN cancelled …): return it to whoever handed it over. */
  sendBack?: boolean;
  /** The party is already in the master: use it instead of creating it again. */
  usePartyId?: string;
  /** The form section it is about (the screen puts it next to that section). */
  section?: Section;
}

export interface CheckCtx {
  parties: Party[];
  accounts: Account[];
}

const SIDE_WORD = (side: Side) => (side === 'payable' ? 'vendor' : 'customer');

export function checksOf(r: Request, ctx: CheckCtx): CheckResult[] {
  const v = r.values;
  const out: CheckResult[] = [];
  const pan = str(v.pan);
  const gstin = str(v.gstin);
  const linked = r.partyId ? ctx.parties.find((p) => p.partyId === r.partyId) ?? null : null;

  // What you typed from the paper: formats and consistency.
  if (pan && !PAN_RE.test(pan)) out.push({ level: 'stop', section: 'A', title: 'PAN is not valid', detail: '5 letters, 4 digits, 1 letter (AAAAA0000A).' });
  if (gstin && !GSTIN_RE.test(gstin)) out.push({ level: 'stop', section: 'B', title: 'GSTIN is not valid', detail: '15 characters: state code, PAN, entity number, Z, check character.' });
  else if (gstin && PAN_RE.test(pan) && gstin.slice(2, 12) !== pan) out.push({ level: 'stop', section: 'B', title: 'GSTIN does not belong to this PAN', detail: `Characters 3–12 of the GSTIN are ${gstin.slice(2, 12)}; the PAN is ${pan}. One of them is copied wrong.` });
  if (gstin && GSTIN_RE.test(gstin) && !isEmpty(v.state) && stateOfGstin(gstin) && stateOfGstin(gstin) !== v.state) out.push({ level: 'stop', section: 'C', title: 'State does not match the GSTIN', detail: `The GSTIN is a ${STATES[stateOfGstin(gstin)!].name} registration.` });
  if (!isEmpty(v.pincode) && !/^\d{6}$/.test(str(v.pincode))) out.push({ level: 'stop', section: 'C', title: 'PIN code must be 6 digits' });
  if (!gstin && PAN_RE.test(pan)) out.push({ level: 'warn', section: 'B', title: 'No GSTIN: an unregistered party', detail: r.side === 'payable' ? 'Its bills come under reverse charge where that applies, with no ITC.' : 'Invoices go out as to an unregistered person.' });

  // GST portal: the GSTIN you typed must be checked, like a bank account.
  if (GSTIN_RE.test(gstin)) {
    const g = r.gstCheck;
    if (!g) out.push({ level: 'stop', section: 'B', title: 'Check the GSTIN on the GST portal', detail: 'Confirms it is real, active, and in this name.' });
    else if (g.forValue !== gstin) out.push({ level: 'stop', section: 'B', title: 'GSTIN changed after the portal check: check it again' });
    else {
      if (g.status === 'cancelled') out.push({ level: 'stop', section: 'B', sendBack: true, title: `GSTIN ${gstin} is cancelled on the GST portal`, detail: 'We cannot invoice or take ITC on a cancelled GSTIN.' });
      else if (g.status === 'suspended') out.push({ level: 'warn', section: 'B', title: `GSTIN ${gstin} is suspended`, detail: 'Hold ITC on its bills until it is active again.' });
      else out.push({ level: 'ok', section: 'B', title: `GSTIN active on the GST portal`, detail: g.nameAtGst });
      const words = new Set(str(v.legalName).toUpperCase().split(/\s+/).filter(Boolean));
      const hit = g.nameAtGst.split(/\s+/).filter((w) => words.has(w)).length;
      if (words.size && hit / Math.max(g.nameAtGst.split(/\s+/).length, 1) < 0.8) out.push({ level: 'warn', section: 'B', title: `Name on the GST portal is "${g.nameAtGst}"`, detail: 'Different from the legal name you typed. Use the name on the portal unless the form says otherwise.' });
    }
  }

  // B1: the other GST registrations. Same PAN, a known state, not twice, each checked on the portal.
  const regs = r.side === 'receivable' ? r.registrations ?? [] : [];
  const onForm = gstinsOnForm(r);
  let unchecked = false;
  regs.forEach((g, i) => {
    const n = `B1 row ${i + 1}`;
    const x = g.gstin.trim();
    if (!x) return void out.push({ level: 'stop', section: 'B1', title: `${n}: type the GSTIN or remove the row` });
    if (!GSTIN_RE.test(x)) return void out.push({ level: 'stop', section: 'B1', title: `${n}: GSTIN ${x} is not valid` });
    if (PAN_RE.test(pan) && x.slice(2, 12) !== pan) out.push({ level: 'stop', section: 'B1', title: `${n}: GSTIN ${x} does not belong to PAN ${pan}`, detail: 'Every GSTIN of one party carries its PAN in characters 3–12.' });
    if (!stateOfGstin(x)) out.push({ level: 'stop', section: 'B1', title: `${n}: ${x.slice(0, 2)} is not a GST state code` });
    if (g.pincode && !/^\d{6}$/.test(g.pincode)) out.push({ level: 'stop', section: 'B1', title: `${n}: PIN code must be 6 digits` });
    const c = r.regChecks?.[x];
    if (!c) unchecked = true;
    else if (c.status === 'cancelled') out.push({ level: 'stop', section: 'B1', title: `${n}: GSTIN ${x} is cancelled on the GST portal`, detail: 'Remove the row: we cannot invoice on it.' });
    else if (c.status === 'suspended') out.push({ level: 'warn', section: 'B1', title: `${n}: GSTIN ${x} is suspended` });
  });
  for (const x of new Set(onForm.filter((y, i) => onForm.indexOf(y) !== i))) out.push({ level: 'stop', section: 'B1', title: `GSTIN ${x} is listed twice` });
  if (unchecked) out.push({ level: 'stop', section: 'B1', title: 'Check the other GSTINs on the GST portal' });
  const bill = str(v.billingGstin);
  const billRow = regs.find((g) => g.gstin.trim() === bill);
  if (billRow && !(str(billRow.line ?? '') || str(billRow.city ?? ''))) out.push({ level: 'stop', section: 'B1', title: `The billing GSTIN ${bill} needs its branch address`, detail: 'Invoices default to it, so it needs a place of business (B1 row).' });

  // Already in the party master? Search by GSTIN, then PAN.
  if (linked) {
    const same = ctx.accounts.find((a) => a.partyId === linked.partyId && a.side === r.side && a.requestId !== r.id);
    if (same) out.push({ level: 'stop', sendBack: true, title: `Already set up: ${linked.legalName} is our ${SIDE_WORD(r.side)}`, detail: `Account ${same.name} (${same.accountId}). Nothing new to create.` });
    out.push({ level: 'ok', title: `Uses party ${linked.partyId} from the master`, detail: 'Party details come from the master; no new party is created.' });
    const other = ctx.accounts.find((a) => a.partyId === linked.partyId && a.side !== r.side);
    if (other) out.push({ level: 'ok', title: `Also our ${SIDE_WORD(other.side)}`, detail: `${other.name} (${other.accountId}). A second account on the other side.` });
  } else {
    const byGst = gstin ? ctx.parties.find((p) => p.gstins.some((g) => g.value === gstin)) : undefined;
    if (byGst) {
      const acct = ctx.accounts.find((a) => a.partyId === byGst.partyId && a.side === r.side);
      if (acct) out.push({ level: 'stop', sendBack: true, title: `Already set up: GSTIN ${gstin} is ${byGst.legalName} (${byGst.partyId})`, detail: `It is our ${SIDE_WORD(r.side)} already: ${acct.name} (${acct.accountId}). Nothing new to create.` });
      else out.push({ level: 'stop', usePartyId: byGst.partyId, title: `GSTIN ${gstin} is already in the party master: ${byGst.partyId} ${byGst.legalName}`, detail: 'Use that party instead of creating it a second time.' });
    }
    for (const g of regs) {
      const x = g.gstin.trim();
      const owner = GSTIN_RE.test(x) ? ctx.parties.find((p) => p.gstins.some((y) => y.value === x)) : undefined;
      if (owner && owner.partyId !== byGst?.partyId) out.push({ level: 'stop', section: 'B1', usePartyId: owner.partyId, title: `GSTIN ${x} (B1) is already in the party master: ${owner.partyId} ${owner.legalName}`, detail: 'One GSTIN belongs to one party. Use that party, or remove the row.' });
    }
    if (pan && !byGst) {
      for (const p of ctx.parties.filter((x) => x.pan === pan)) out.push({ level: 'warn', usePartyId: p.partyId, title: `Same PAN as ${p.partyId} "${p.legalName}"`, detail: 'Can be right (one company, another state). If it is the same party, use it.' });
    }
  }

  const name = str(v.accountName).toLowerCase();
  const clash = name && ctx.accounts.find((a) => a.name.toLowerCase() === name && a.requestId !== r.id);
  if (clash) out.push({ level: 'stop', section: 'S', title: `Account name "${v.accountName}" already exists (${clash.accountId})`, detail: 'Account names are unique in the books. Change the name, e.g. add the city.' });

  const missing = fieldsFor(r).filter((f) => isMissing(f, r) && !(f.group === 'worked' && originOf(f, r, ctx.accounts) === 'waits'));
  if (missing.length) out.push({ level: 'stop', title: `Still to fill: ${missing.map((f) => f.label.replace(/\?$/, '').replace(/ \(.*\)$/, '')).join(' · ')}` });

  if (r.side === 'payable') {
    if (v.category === 'goods_non_msme' && v.msmeStatus === 'yes') out.push({ level: 'stop', title: 'Category says Non-MSME, but MSME = Yes', detail: 'Pick "Creditors for Goods – MSME".' });
    if (v.category === 'goods_msme' && v.msmeStatus === 'no') out.push({ level: 'stop', title: 'Category says MSME, but MSME = No' });
    if (v.msmeStatus === 'unknown') out.push({ level: 'warn', title: 'MSME not known yet', detail: 'A reminder goes to the vendor when you submit. Until answered, the 45-day clock may apply.' });
    if (v.msmeStatus === 'yes' && isEmpty(v.udyam)) out.push({ level: 'warn', title: 'Udyam number not received yet', detail: 'A reminder goes to the vendor. The MSME register shows it as pending.' });
    if (!isEmpty(v.udyam) && !UDYAM.test(str(v.udyam))) out.push({ level: 'stop', title: 'Udyam number is not in the UDYAM-XX-00-0000000 format' });
    if (v.sec43bh === 'yes' && Number(v.creditDays) > 45) out.push({ level: 'stop', title: `${v.creditDays} credit days for an MSME vendor`, detail: 'MSMED Act / 43B(h): at most 45 days, or the expense is disallowed.' });

    const acct = str(v.bankAccountNo);
    if (acct) {
      const used = ctx.accounts.find((a) => a.bankAccountNo === acct && a.partyId !== r.partyId);
      if (used) out.push({ level: 'stop', sendBack: true, title: `Bank account already used by ${used.name}`, detail: 'Two parties with one bank account is the first sign of a diverted payment.' });
    }
    if (!isEmpty(v.ifsc) && !IFSC.test(str(v.ifsc))) out.push({ level: 'stop', title: 'IFSC is not valid', detail: '4 letters, a 0, then 6 letters or digits.' });
    const key = `${acct}|${v.ifsc ?? ''}`;
    if (acct && IFSC.test(str(v.ifsc))) {
      if (!r.pennyDrop) out.push({ level: 'stop', title: 'Run the penny-drop', detail: 'The Finance Controller approves bank details only after verification.' });
      else if (r.pennyDrop.forKey !== key) out.push({ level: 'stop', title: 'Bank details changed after the penny-drop: run it again' });
      else if (r.pennyDrop.result === 'pass') out.push({ level: 'ok', title: `Penny-drop passed: ${r.pennyDrop.nameAtBank} (${r.pennyDrop.matchPct}% name match)` });
      else {
        out.push({ level: 'warn', title: `Penny-drop name mismatch: bank says ${r.pennyDrop.nameAtBank} (${r.pennyDrop.matchPct}%)`, detail: 'A call-back on the number from the paper form is required.' });
        if (v.callBackNumber === 'email') out.push({ level: 'stop', title: 'Call-back number came from an email with the bank details', detail: 'Call the number on the paper form, not one the email gave you.' });
      }
    }
  }

  if (r.side === 'receivable') {
    const cat = str(v.category);
    const m = DEBTOR_MASTER[cat];
    const catName = categoriesFor('receivable')[cat];
    if (!isEmpty(v.phone) && resident(v) && !mobileDigits(str(v.phone))) out.push({ level: 'stop', section: 'C', title: 'Mobile number must have 10 digits', detail: 'A +91 or 0 in front and spaces are fine.' });
    if (!isEmpty(v.email) && !EMAIL.test(str(v.email))) out.push({ level: 'stop', section: 'C', title: 'Email ID is not valid' });
    // The ship-to (section C): a PIN of 6 digits; a state other than the billing GSTIN's is said, the invoice decides.
    if (shipping(v) && !isEmpty(v.shipPincode) && !/^\d{6}$/.test(str(v.shipPincode))) out.push({ level: 'stop', section: 'C', title: 'Shipping PIN code must be 6 digits' });
    const billGstin = str(v.billingGstin) || gstin;
    const billSt = GSTIN_RE.test(billGstin) ? stateOfGstin(billGstin) : null;
    if (shipping(v) && !isEmpty(v.shipState) && billSt && v.shipState !== billSt)
      out.push({ level: 'warn', section: 'C', title: `Ships to ${STATES[str(v.shipState)]?.name ?? v.shipState}, bills a ${STATES[billSt].name} GSTIN`, detail: 'The invoice task sets the place of supply for goods from the ship-to (IGST Act s.10(1)(a)).' });
    // More contacts: a name each, and a mobile or an email that is valid.
    (r.contacts ?? []).forEach((c, i) => {
      const n = `Contact ${i + 2}`;
      const ph = str(c.phone ?? '');
      const em = str(c.email ?? '');
      if (!c.name.trim()) out.push({ level: 'stop', section: 'C', title: `${n}: type the name or remove the row` });
      if (!ph && !em) out.push({ level: 'stop', section: 'C', title: `${n}: give a mobile number or an email` });
      if (ph && !mobileDigits(ph)) out.push({ level: 'stop', section: 'C', title: `${n}: mobile number must have 10 digits` });
      if (em && !EMAIL.test(em)) out.push({ level: 'stop', section: 'C', title: `${n}: email is not valid` });
    });
    // Bank (optional): the IFSC format; an account another party already uses is said, not stopped (a group company may pay).
    if (!isEmpty(v.ifsc) && !IFSC.test(str(v.ifsc))) out.push({ level: 'stop', section: 'BK', title: 'IFSC is not valid', detail: '4 letters, a 0, then 6 letters or digits.' });
    const acctNo = str(v.bankAccountNo);
    if (acctNo) {
      const used = ctx.accounts.find((a) => a.bankAccountNo === acctNo && a.partyId !== r.partyId);
      const own = r.partyId ? ctx.accounts.find((a) => a.bankAccountNo === acctNo && a.partyId === r.partyId) : undefined;
      if (used) out.push({ level: 'warn', section: 'BK', title: `BANK_ACCOUNT_IN_USE: ${used.name} (${used.accountId}) has this bank account`, detail: 'Fine if a group company pays for this customer; never refund to it without checking.' });
      else if (own) out.push({ level: 'ok', section: 'BK', title: `Same bank account as ${own.name}: its fin.party_bank_account row is reused` });
    }
    if (m?.exporting === true && v.exportCustomer === 'no') out.push({ level: 'stop', section: 'B', title: `"${catName}" is an export category, but Export customer = No`, detail: 'One of them is wrong: the category sets the ledger and the GST treatment.' });
    if (m?.exporting === false && v.exportCustomer === 'yes') out.push({ level: 'stop', section: 'B', title: `Export customer = Yes, but "${catName}" is a domestic category`, detail: 'Pick an export category (Export Debtor – Goods / Services), or set Export customer to No.' });
    if (m?.customer && !isEmpty(v.customerCategory) && v.customerCategory !== m.customer) out.push({ level: 'warn', section: 'A', title: `Customer category ${CUSTOMER_CATEGORY[str(v.customerCategory)]}, but the debtor category is "${catName}"`, detail: `That category is a ${CUSTOMER_CATEGORY[m.customer]} category. One of them is probably wrong.` });
    if (v.gstRegType === 'sez' && cat && cat !== 'sez_unit') out.push({ level: 'warn', section: 'B', title: 'GST registration type SEZ, but the debtor category is not "SEZ Unit / Developer Debtor"' });
    if (cat === 'sez_unit' && !isEmpty(v.gstRegType) && v.gstRegType !== 'sez') out.push({ level: 'warn', section: 'B', title: 'An SEZ debtor category, but the GST registration type is not SEZ' });
    if (v.gstRegType === 'composition' && cat && cat !== 'composition_scheme') out.push({ level: 'warn', section: 'B', title: 'GST registration type Composition, but the debtor category is not "Composition Scheme Debtor"' });
    if (v.tcsConfirmed === 'no') out.push({ level: 'warn', section: 'B', title: 'TCS applicability not confirmed', detail: 'Venkat (Compliance Officer) confirms it after you submit.' });
    if (m && m.tcs !== 'Not applicable' && v.tcsConfirmed === 'not_applicable') out.push({ level: 'warn', section: 'B', title: `The category suggests TCS (${m.tcs}), but you marked it not applicable` });
    const pt = str(v.paymentTerms);
    if (pt in TERM_DAYS && !isEmpty(v.creditDays) && Number(v.creditDays) !== TERM_DAYS[pt] && v.creditOrCash !== 'cash') out.push({ level: 'warn', section: 'D', title: `Payment terms ${PAYMENT_TERMS[pt]}, but ${v.creditDays} credit days` });
    if (exporting(v) && isEmpty(v.lut)) out.push({ level: 'warn', section: 'E', title: 'No LUT: the export goes out with IGST paid (refund route)' });
    if (exporting(v) && cat === 'export_services' && isEmpty(v.edpms)) out.push({ level: 'warn', section: 'E', title: 'No SOFTEX / EDPMS reference yet', detail: m?.notes });
    if (v.currency !== 'INR' && cat.startsWith('domestic')) out.push({ level: 'warn', section: 'D', title: 'Domestic customer billed in a foreign currency?' });
  }
  return out;
}

export const stops = (c: CheckResult[]) => c.filter((x) => x.level === 'stop');

// ---------- Who checks what (party_account_change) ----------

export interface Route {
  block: Block;
  label: string;
  checker: ActorKey;
  keys: string[];
}

/** The GST / TCS part Venkat (Compliance Officer) checks for a customer. */
const CUSTOMER_TAX_KEYS = ['gstRegType', 'taxType', 'exportCustomer', 'sezCustomer', 'eInvoice', 'tcsConfirmed', 'gstTreatment', 'tcsSection', 'tcsRate', 'lut'];

export function routesFor(side: Side): Route[] {
  const party = ['legalName', 'tradeName', 'pan', 'gstin', 'addressLine', 'city', 'state', 'pincode', 'contactPerson', 'phone', 'email'];
  const base = [...party, 'accountName', 'under', 'category', 'constitution', 'resident', 'relatedParty', 'creditDays', 'billByBill', 'currency'];
  if (side === 'payable') {
    return [
      { block: 'party', label: 'Party details, account, terms, MSME', checker: 'rajan', keys: [...base, 'msmeStatus', 'msmeCategory', 'udyam', 'sec43bh'] },
      { block: 'bank', label: 'Bank details', checker: 'usha', keys: ['bankAccountNo', 'ifsc', 'beneficiary', 'callBackNumber', 'callBackPerson'] },
      { block: 'tax', label: 'GST / TDS tagging', checker: 'venkat', keys: [] },
    ];
  }
  const more = ['gstRegistered', 'shippingAddress', 'shipCity', 'shipState', 'shipPincode', 'contacts', ...BANK_KEYS, 'customerCategory', 'ledger', 'registrations', 'billingGstin', 'creditOrCash', 'paymentTerms', 'securityDeposit', 'collectionOwner', 'poRule', 'delivery', 'invoiceFormat', 'adBank', 'exportCategory', 'realisationMode', 'fircBrc', 'edpms', 'gstCertificate', 'panCopy', 'msmeCertificate', 'remarks'];
  return [
    { block: 'party', label: 'Party details, account, terms, billing', checker: 'rajan', keys: [...base, ...more] },
    { block: 'credit_limit', label: 'Credit limit', checker: 'farid', keys: ['creditLimit'] },
    { block: 'tax', label: 'GST / TCS tagging', checker: 'venkat', keys: CUSTOMER_TAX_KEYS },
  ];
}

/** A route's values at submit: what the checker approves. The B1 rows and the extra contacts are carried as one value each. */
export const afterOf = (r: Request, keys: string[]): Values =>
  Object.fromEntries(
    keys.map((k) => [k, k === 'registrations' ? JSON.stringify((r.registrations ?? []).map(({ id: _id, ...g }) => g)) : k === 'contacts' ? JSON.stringify((r.contacts ?? []).map(({ id: _id, ...c }) => c)) : r.values[k] ?? null]),
  );

export const checkerLine = (side: Side) => routesFor(side).map((r) => `${ACTORS[r.checker].name} (${r.label.toLowerCase()})`).join(' · ');

/** Human value of a field for read-only display. */
export function display(f: FieldDef, r: Request): string {
  const v = r.values[f.key];
  if (f.kind === 'switch') return v ? 'Yes' : 'No';
  if (isEmpty(v)) return '—';
  if (f.unit === '₹') return inr(Number(v));
  if (f.key === 'bankAccountNo') return mask(String(v));
  const opts = optionsOf(f, r);
  return opts[String(v)] ?? `${v}${f.unit ? ` ${f.unit}` : ''}`;
}

export const mask = (acct: string) => (acct.length > 4 ? `•••• ${acct.slice(-4)}` : acct);

/** The party-detail values of a party already in the master (used when you link to it). */
export function partyValues(p: Party): Values {
  return {
    legalName: p.legalName,
    tradeName: p.tradeName ?? '',
    pan: p.pan ?? '',
    gstRegistered: p.gstins.length ? 'yes' : 'no',
    gstin: p.gstins[0]?.value ?? '',
    addressLine: p.address.line,
    shippingAddress: '',
    shipCity: '',
    shipState: '',
    shipPincode: '',
    city: p.address.city,
    state: p.address.stateCode,
    pincode: p.address.pincode,
    contactPerson: p.contactPerson ?? '',
    phone: p.phones[0] ?? '',
    email: p.email ?? '',
  };
}
