// T24 Sales voucher entry (docs/sales/sales_engine/task_list/T24_sales_voucher_entry.md).
//   Rev 6 (18-Nov, Vijay): the Accounts Executive does NOT raise the invoice. Billing raises it (number, IRN, lines,
//   GST) and hands it over. The AE books its accounting entry: the ledgers are suggested by the posting rule (R1–R12),
//   the AE may pick others (§8.4); Dr = Cr; the GST lines = the invoice's GST → Submit → Rajan approves (the entry posts
//   to the journal), sends it back, or rejects it. The invoice itself is read-only here (it is Billing's).

import type { ISODate, ISODateTime } from '../domain/types';
import type { ActorKey, HistoryLine } from '../onboarding/types';

/** One line of the received invoice (Billing's), the CA's columns: Description · HSN/SAC · Qty · UQC · Rate · Disc. · Taxable · GST % · tax · Total.
 *  Goods or a service (from the item master: name, HSN / SAC, UQC, GST rate); a charge (freight, A8) or a pure-agent
 *  reimbursement (B5); a service period (B6). */
export interface InvoiceLine {
  kind: 'goods' | 'service' | 'charge' | 'reimbursement';
  item: string; // ITEMS, SERVICES or EXTRAS key ('' while not picked)
  qty: number | null;
  rate: number | null; // typed, in the invoice currency (prefilled from the item's list price)
  /** Disc. (Rs.): a trade discount on the face of the invoice, inside the value (CGST s.15(3)(a); the CA's A8). */
  discount: number | null;
  /** A period service (C19): from – until (revenue deferred, R12). */
  periodFrom?: string;
  periodUntil?: string;
  /** A concessional rate's notification (C20), e.g. 40/2017-CT(R) for a merchant exporter. */
  notification?: string;
}

/** One line of the AE's edited entry (§8.4). Party and tax lines are never stored here: they stay locked to the invoice. */
export interface EditLine {
  id: string; // 'rev:sale_products' (from the rule) · 'add:1' (added) · 'split:1'
  ledger: string; // LEDGERS key
  dr: number;
  cr: number;
  reason: string;
  /** The rule line it came from (absent: added or split by the AE). */
  from?: string;
}

export interface EntryEdit {
  lines: EditLine[];
  /** "Change amounts / add lines" is on. Off: only ledgers were picked (manual choice, no reason needed). */
  amounts?: boolean;
  /** The ledger picked for a line whose AMOUNT is the invoice's (the customer, settlement, refund and GST lines): line id → ledger key. */
  picks?: Record<string, string>;
  by: ActorKey;
  at: ISODateTime;
}

/**
 * fin.sales_voucher.stage (rev 6, the AE's accounting voucher for a received invoice):
 *   draft      received from Billing; the AE books the entry (also after Rajan sends it back: decisionReason says why)
 *   submitted  with Rajan
 *   posted     approved: the journal entry is posted
 *   rejected   Rajan rejected the entry (it stays unposted; Billing is told)
 *   returned   the AE sent the invoice back to Billing (it cannot be booked as it is)
 */
export type VoucherStatus = 'draft' | 'submitted' | 'posted' | 'rejected' | 'returned';
export type Outcome = 'approve' | 'send_back' | 'reject';

export type ApprovalWhy = 'invoice';

export interface Approval {
  id: string;
  why: ApprovalWhy;
  label: string;
  checker: ActorKey;
  status: 'pending' | 'approved' | 'sent_back' | 'rejected';
  decidedAt?: ISODateTime;
  reason?: string;
  /** "Entry differs from rule R1: lines 2, 4" (§8.4): what the checker sees. */
  entryDiff?: string;
}

/** The AE's sales voucher (fin.sales_voucher) for one invoice received from Billing. The invoice fields below are
 *  Billing's and read-only here; the AE's own data is the entry (edit), the approvals and the history. */
export interface Voucher {
  id: string; // SV-0012: the voucher's internal reference
  /** Billing's GST invoice number (already issued when it reaches the AE). */
  number: string | null;
  status: VoucherStatus;
  /** Our GSTIN (fin.branch): its state and its series. Picked on the invoice. */
  branch: string;
  maker: ActorKey;
  arrivedAt: ISODateTime;
  date: ISODate;
  accountId: string; // B1: the customer's account (T12)
  /** B3: the bill-to branch (fin.debtor_location usage bill_to). Absent: the account's default. */
  branchId?: string;
  /** B6: the ship-to location (P&C location id). Absent: the account's ship-to, else the bill-to. */
  shipToId?: string;
  /** Written by the system for the journal (not on the invoice). */
  narration: string;
  lines: InvoiceLine[];
  /** A14: currency and rate (export). */
  currency: string;
  fxRate: number | null;
  /** E1: export / SEZ type. */
  exportType?: 'lut' | 'igst';
  portCode: string; // E5
  shippingBillNo: string; // E6
  shippingBillDate: string;
  /** The AE's edit of the engine's entry (§8.4). Absent: the rule's entry, read-only. */
  edit?: EntryEdit;
  /** Rev 3 · B14: how it is settled: on credit (the customer owes it) or paid at once (cash, UPI / card: R8). */
  settlement: 'credit' | 'cash' | 'upi_card';
  /** Rev 5 · the CA's A3 "Payment: UPI · Ref …": the payment reference of a sale paid at once. */
  paymentRef: string;
  /** Rev 5 · the CA's "Transport: Road · KA-02-AB-1234" and the e-way bill (goods above ₹50,000): vehicle and distance. */
  transport: { vehicleNo: string; distanceKm: number | null };
  /** Rev 3 · B6: goods delivered to a THIRD PARTY on the buyer's direction (bill-to-ship-to): place of supply = the bill-to state (IGST s.10(1)(b)). */
  thirdPartyShipTo?: { name: string; line: string; city: string; pincode: string; stateCode: string };
  /** Rev 3 · B8: a service on immovable property: place of supply = where the property is (IGST s.12(3)). */
  propertyState?: string;
  /** Rev 3 · E8: Incoterm (export). A16: the buyer's order reference (export order, marketplace order ID). */
  incoterm: string;
  orderRef: string;
  /** Rev 3 · A17: an advance received earlier (T13's receipt voucher), adjusted against this invoice. */
  advanceRef: string;
  advanceAmount: number | null;
  approvals: Approval[];
  /** Rajan's reason when he sent it back (stage draft again) or rejected it (fin.sales_invoice.decision_reason). */
  decisionReason?: string;
  /** Sent back to Billing by the AE (the invoice cannot be booked as it is). */
  returned?: { reason: string; at: ISODateTime };
  submittedAt?: ISODateTime;
  postedAt?: ISODateTime;
  entryId?: string;
  /** Billing's e-invoice (IRN) and e-way bill, read-only here. */
  irn?: string;
  ackNo?: string;
  ackAt?: ISODateTime;
  ewbNo?: string;
  ewbValidTo?: ISODate;
  dirty?: boolean;
  history: HistoryLine[];
}

/** A journal line, as the posting engine writes it. Party lines carry the sub-ledger account. */
export interface JournalLine {
  ledger: string; // LEDGERS key, or 'party'
  accountId?: string;
  dr: number;
  cr: number;
  /** Customer line: its account's receivable ledger code (debtor_account.ledger_account_code). */
  code?: string;
  /** The AE's reason for an edited line. */
  reason?: string;
}

export interface JournalEntry {
  id: string; // JE-000231
  voucherNo: string; // KA/INV/2627/0143 · KA/CN/2627/0001
  voucherId?: string;
  kind: 'sales';
  /** The branch on the entry (fin.journal_entry.branch_id). */
  branch?: string;
  date: ISODate;
  narration: string;
  lines: JournalLine[];
  /** Rule and version: "SALES_INVOICE v1 · R1". */
  rule: string;
  postedAt: ISODateTime;
  postedBy: ActorKey;
  reverses?: string;
  /** The AE's edit, kept with the rule: "why was this posted?" (§8.4). */
  edit?: { by: ActorKey; approvedBy: ActorKey; diff: string; reasons: string[] };
}
