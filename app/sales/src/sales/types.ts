// Post a sales invoice (new task, Billing combined with this role: 01 tasks doc §9, open question 11), as the
// biscuit-plant scenario runs it (Engineer guide §2.10, Full scenario B4-01, D-02, D-03):
//   Sales Order (Arun, approved by Nisha) → Delivery Challan (Stores, Latha; stock leaves the books here under
//   Perpetual) → the Accounts Executive raises the invoice FROM the challan → Rajan approves every invoice →
//   one journal entry (Dr customer, Cr sales, Cr output GST), invoice number, IRN, e-way bill Part-A → Stores
//   releases the challan. Never edited again: corrected by a credit note.

import type { ISODate, ISODateTime } from '../domain/types';
import type { ActorKey, HistoryLine } from '../onboarding/types';

export interface ChallanLine {
  item: string; // ITEMS key (FG-101)
  batch: string;
  qty: number; // cartons dispatched
  rate: number; // from the approved Sales Order, ₹ per carton
}

/** A delivery challan, made by Stores (not by this task). */
export interface Challan {
  id: string; // DC-1
  soId: string;
  soDate: ISODate;
  customer: string; // name on the order; the AR account is found from it
  date: ISODate;
  lines: ChallanLine[];
  vehicleNo: string;
  transporter: string;
  distanceKm: number;
  lrNo: string;
  note: string;
  /** The customer has no account yet (a new customer): Stores records it only once it is active. */
  needsAccount?: boolean;
  /** Set when Stores has recorded it (mock: seeded, or played from the demo). */
  recordedAt?: ISODateTime;
  /** Under Perpetual: the cost entry Stores' challan wrote. */
  costEntryId?: string;
}

export interface InvoiceLine {
  dcLine: number; // index of the matching challan line (same item and batch), −1 when none
  item: string;
  batch: string;
  dcQty: number;
  qty: number | null; // quantity invoiced: never above the challan (0% tolerance), partial allowed
  rate: number | null; // the approved order's rate (from the challan)
}

/** The accounting entry, typed by hand like a Tally voucher (30-Oct): the invoice is the example, the entry is the person's. */
export interface ManualEntry {
  partyLedger: string; // Dr: the customer's AR account (accountId)
  partyAmount: number | null;
  salesLedger: string; // Cr: LEDGERS key
  salesAmount: number | null;
  taxLines: { ledger: string; amount: number | null }[]; // Cr: output GST ledgers
  roundOff: number | null; // + Cr, − Dr
  /** The challan's cost entry, typed by hand too (Perpetual, 30-Oct). Present only while the challan has none. */
  cost?: CostEntry;
}

/** Dr cost of goods sold · Cr finished-goods inventory, for the whole challan, dated the challan date. */
export interface CostEntry {
  drLedger: string;
  drAmount: number | null;
  crLedger: string;
  crAmount: number | null;
}

export type VoucherStatus = 'draft' | 'submitted' | 'returned' | 'posted' | 'cancelled' | 'sent_back';

export type ApprovalWhy = 'invoice';

export interface Approval {
  id: string;
  why: ApprovalWhy;
  label: string;
  checker: ActorKey;
  status: 'pending' | 'approved' | 'returned';
  decidedAt?: ISODateTime;
  reason?: string;
}

/** One sales invoice (sales_invoice), raised from one delivery challan. */
export interface Voucher {
  id: string; // SI-0012 while it is a draft
  /** GST invoice number: given only when it posts (one gap-free series per GSTIN, ≤ 16 characters). */
  number: string | null;
  status: VoucherStatus;
  dcId: string;
  from: ActorKey; // who recorded the challan (Stores)
  arrivedAt: ISODateTime;
  date: ISODate;
  accountId: string; // the customer's AR account (from onboarding)
  /** The customer's branch it bills (fin.customer_branch). Absent: the account's default branch. */
  branchId?: string;
  customerPo: string;
  narration: string;
  lines: InvoiceLine[];
  /** The accounting entry typed by hand (30-Oct). Absent: the rule writes the entry (seeded, confirmed invoices). */
  manual?: ManualEntry;
  approvals: Approval[];
  returnedReason?: string;
  sentBack?: { to: ActorKey; reason: string; at: ISODateTime };
  submittedAt?: ISODateTime;
  postedAt?: ISODateTime;
  entryId?: string;
  irn?: string;
  ackNo?: string;
  ackAt?: ISODateTime;
  ewbNo?: string;
  ewbValidTo?: ISODate;
  cancel?: { creditNote: string; entryId: string; reason: string; at: ISODateTime };
  dirty?: boolean;
  history: HistoryLine[];
}

/** A journal line, as the posting engine writes it. Party lines carry the sub-ledger account. */
export interface JournalLine {
  ledger: string; // LEDGERS key, or 'party'
  accountId?: string;
  dr: number;
  cr: number;
}

export interface JournalEntry {
  id: string; // JE-000231
  voucherNo: string; // KA/INV/2627/0143 · KA/CN/2627/0001 · DC-1
  voucherId?: string;
  kind: 'sales' | 'credit_note' | 'challan_cost';
  date: ISODate;
  narration: string;
  lines: JournalLine[];
  rule: string;
  postedAt: ISODateTime;
  postedBy: ActorKey;
  reverses?: string;
}

export type InventoryMethod = 'perpetual' | 'periodic';
