// Customer / vendor onboarding (03_party_onboarding_design.md).
// Decided 27-Oct: nothing arrives from Procurement or Sales in the system. They hand the Accounts Executive a
// PAPER form (with copies of the GST certificate, PAN, cancelled cheque), and the AE types everything in:
// the party's details AND the finance details. So every field on the request is editable by the AE.
//   Party            P&C (Business Core, schema pc): created by P&C when the request is approved; we keep its ids
//                    as plain values (rev 12). The mock keeps a copy here so the walkthrough can show it.
//   Request, Account the onboarding request (maker–checker) and the active party account

import type { ISODate, ISODateTime } from '../domain/types';

export type Side = 'payable' | 'receivable';

export type ActorKey = 'teja' | 'rajan' | 'usha' | 'venkat' | 'farid' | 'ravi' | 'kiran' | 'arun' | 'latha' | 'nisha' | 'billing' | 'system' | 'bank' | 'gst' | 'irp';

// ---------- The party, as P&C holds it (mock copy) ----------

export type GstStatus = 'active' | 'suspended' | 'cancelled';

export interface PartyGstin {
  value: string;
  stateCode: string; // 'KA'
  status: GstStatus;
}

export interface PartyRole {
  /** P&C party_standing id (mock: S-<party>-<type>). */
  standingId?: string;
  type: 'supplier' | 'customer';
  since: ISODate;
  enteredBy: ActorKey; // the AE who typed it in
  formFrom?: ActorKey; // who handed over the paper form
  formNo?: string;
}

export interface Party {
  partyId: string;
  kind: 'organization' | 'person';
  legalName: string;
  tradeName?: string;
  pan: string | null;
  gstins: PartyGstin[];
  address: { line: string; city: string; stateCode: string; pincode: string; country: string };
  contactPerson?: string;
  email?: string;
  phones: string[];
  roles: PartyRole[];
  /** P&C business_location rows besides the registered address (branches in other cities / states, a ship-to). */
  locations?: PartyLocation[];
  /** More contact people besides the first (pc.contact + contact_party_association + contact_point each). */
  contacts?: PartyContact[];
}

/** One more contact person of the party (mock copy of pc.contact and its contact points). */
export interface PartyContact {
  name: string;
  phone?: string;
  email?: string;
}

/** A P&C business location (mock copy): a physical presence of the party. It carries no GSTIN. */
export interface PartyLocation {
  locationId: string;
  label: string;
  line: string;
  city: string;
  stateCode: string;
  pincode: string;
  country: string;
  /** 'ship_to': the customer's delivery address (form section C). Not a billing branch. */
  purpose?: 'ship_to';
}

/** fin.debtor_location (usage bill_to): which P&C location this account bills, under which P&C GSTIN. Ids only. */
export interface CustomerBranch {
  branchId: string;
  locationId: string;
  /** The P&C GST registration (mock: the GSTIN value). Null: an unregistered branch. */
  gstin: string | null;
  isDefault: boolean;
  since: ISODate;
  /** Deactivated: no new invoices to it. */
  until?: ISODate;
}

/** A paper form on the AE's desk (mock only: what is written on it, so the walkthrough can copy from it). */
export interface PaperForm {
  key: string;
  side: Side;
  from: ActorKey;
  formNo: string;
  title: string;
  note: string;
  values: Values;
  /** Section B1 of the form: the customer's other GST registrations (branches in other states). */
  registrations?: Omit<GstRegistration, 'id'>[];
  /** Section C: more contact people besides the first. */
  contacts?: Omit<ExtraContact, 'id'>[];
  attachments: string[];
  /** Illustrative: not a scenario party (shown on the paper). */
  illustrative?: boolean;
}

/**
 * One more GST registration of the customer (form section B1: "if the customer has multiple GSTINs across states").
 * On approval P&C holds the GSTIN (party_identifier IN_GST). With its branch address it also becomes a
 * P&C location and a fin.debtor_location row, usage bill_to (that location, billed under this GSTIN); without one, the
 * branch is added on the account once the address is known.
 */
export interface GstRegistration {
  id: string;
  gstin: string;
  /** The place of business of this registration (from its GST certificate). Optional on the form. */
  line?: string;
  city?: string;
  pincode?: string;
}

/** One more contact person on the request (section C), besides the form's Contact person / Mobile / Email. */
export interface ExtraContact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

// ---------- The request and the account (Finance) ----------

export type FieldValue = string | number | boolean | null;
export type Values = Record<string, FieldValue>;

export interface Suggestion {
  value: FieldValue;
  why: string;
}

export type RequestStatus = 'draft' | 'submitted' | 'returned' | 'active' | 'sent_back';

export type Block = 'party' | 'bank' | 'credit_limit' | 'tax';

/** One block of a submitted request, routed to one checker (party_account_change). */
export interface Change {
  id: string;
  block: Block;
  label: string;
  checker: ActorKey;
  status: 'pending' | 'approved' | 'returned';
  after: Values;
  decidedAt?: ISODateTime;
  reason?: string;
}

export interface PennyDrop {
  result: 'pass' | 'name_mismatch';
  nameAtBank: string;
  matchPct: number;
  at: ISODateTime;
  /** account|ifsc the result is for: a later edit makes it stale. */
  forKey: string;
}

/** GST portal check of the GSTIN the AE typed. */
export interface GstCheck {
  status: GstStatus;
  nameAtGst: string;
  at: ISODateTime;
  /** The GSTIN this result is for: a later edit makes it stale. */
  forValue: string;
}

export interface HistoryLine {
  at: ISODateTime;
  by: ActorKey;
  text: string;
}

/** One onboarding of one party account (party_account_request). */
export interface Request {
  id: string;
  side: Side;
  status: RequestStatus;
  /** Who handed over the paper form (Procurement Officer / Sales Executive). */
  from: ActorKey;
  formNo: string;
  /** When the AE opened it (the paper reached the desk). */
  arrivedAt: ISODateTime;
  /** An existing party the AE chose to use (found by PAN / GSTIN). Null: a new party is created on approval. */
  partyId: string | null;
  /** Mock only: the paper form this request was typed from. */
  paper?: string;
  values: Values;
  /** Form section B1: the other GST registrations (the main GSTIN is values.gstin). */
  registrations?: GstRegistration[];
  /** Section C: more contact people (the first is values.contactPerson / phone / email). */
  contacts?: ExtraContact[];
  gstCheck?: GstCheck;
  /** GST portal results for the other registrations, by GSTIN. */
  regChecks?: Record<string, GstCheck>;
  pennyDrop?: PennyDrop;
  changes: Change[];
  returnedReason?: string;
  /** The form was returned to whoever handed it over (party already exists, GSTIN cancelled …). */
  sentBack?: { to: ActorKey; reason: string; at: ISODateTime };
  submittedAt?: ISODateTime;
  activatedAt?: ISODateTime;
  accountId?: string;
  dirty?: boolean;
  history: HistoryLine[];
}

/** An active party account, as one view: accounting.subledger_account (+ its dated control account)
 *  and accounting_support.party_account (+ credit limit, bank account). Rev 12. */
export interface Account {
  accountId: string;
  partyId: string;
  side: Side;
  name: string;
  under: string;
  category: string;
  creditDays: number | null;
  creditLimit: number | null;
  msme: 'yes' | 'no' | 'unknown' | null;
  msmeCategory?: string | null;
  udyam: string | null;
  sec43bh: boolean | null;
  bankLast4: string | null;
  bankAccountNo?: string;
  bankSince: ISODate | null;
  activatedAt: ISODate;
  requestId?: string;
  /** The P&C standing this account serves (customer / supplier of our company). */
  standingId?: string;
  /** The P&C GST registration it bills / buys under (mock: the GSTIN). */
  gstin?: string | null;
  /** Customer: the branches it bills (one account, many branches). Absent: one branch, the registered address. */
  branches?: CustomerBranch[];
  /** Customer: where goods are delivered, when the form gave a shipping address (fin.debtor_location, usage ship_to). */
  shipTo?: { linkId: string; locationId: string; since: ISODate };
  /** The control account (ledger group) is effective-dated: since when, and how it was set. */
  controlSince?: ISODate;
  controlSource?: 'suggested' | 'chosen';
}

// ---------- The walkthrough's link to the backend design ----------

export type LogKind = 'api' | 'event' | 'db';

export interface LogEntry {
  id: number;
  at: ISODateTime;
  kind: LogKind;
  actor: ActorKey;
  line: string; // "POST /party-account-requests" · "party.role.added" · "INSERT party_master.party"
  detail?: string;
}

export interface Notice {
  id: string;
  at: ISODateTime;
  tone: 'info' | 'success' | 'warning' | 'critical';
  title: string;
  body: string;
  requestId?: string;
  /** A sales voucher the notice is about (Post a sales entry). */
  voucherId?: string;
  read: boolean;
}
