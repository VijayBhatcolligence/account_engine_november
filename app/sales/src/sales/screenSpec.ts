// T24 Sales voucher entry: the screen, derived with Sunny's task-to-screen formula (T24 §4), shown under "Built with".
// Rev 6 (18-Nov, Vijay): the Accounts Executive books the accounting entry of an invoice Billing hands over; the
// invoice is read-only. Each field below is the voucher's (fin.sales_voucher / _line) or read from Billing's invoice.

export type Built = 'built' | 'partly' | 'not built' | 'removed';

export const T24_SPEC = {
  code: 'T24',
  name: 'Sales voucher entry (book the entry of an invoice from Billing)',
  pattern: { fd: 'FD-06', name: 'Structured Editor', variant: 'transaction-workspace', reason: 'One voucher at a time, full screen: the entry is the work; the received invoice sits small at the right.' },
  regions: [
    { id: 'rail', width: 'collapsible', holds: 'To book (from Billing) · With Rajan · Done' },
    { id: 'entry', width: 'full screen, left', holds: 'Tabs: Accounting entry (the work) · Invoice from Billing (read-only) · Why each value · Approval & history' },
    { id: 'action', width: '340 px, right', holds: 'The invoice, small (click for full size) · checks · what Submit sends · Submit / Save / Return to Billing · Rajan: approve, send back, reject (mock)' },
  ],
  steps: [
    ['1', 'Open the invoice Billing handed over', 'Rail "To book" / the home list'],
    ['2', 'Check the suggested ledgers; pick others if needed', 'Accounting entry: click a ledger, type to search'],
    ['3', 'Dr = Cr; the customer and GST amounts equal the invoice', 'Accounting entry (the amounts come from the invoice)'],
    ['4', 'Submit to Rajan', 'Right: Submit'],
    ['5', 'Rajan approves: the entry posts', 'Approval & history'],
    ['6', 'The invoice is wrong: return it to Billing', 'Right: Return to Billing'],
  ] as [string, string, string][],
  fields: [
    ['V1', 'Voucher no. (SV-0012)', 'built', 'Header'],
    ['V2', "Invoice no. · date (Billing's)", 'built', 'Header; read from the invoice'],
    ['V3', 'Customer account', 'built', 'Header; read from the invoice'],
    ['V4', 'Our branch (GSTIN)', 'built', "Invoice from Billing tab; the journal line's branch"],
    ['V5', "Taxable · CGST · SGST · IGST · total (the invoice's)", 'built', "Header and the entry's top line: what the entry must agree with"],
    ['E1', 'Entry lines: side, ledger, amount', 'built', 'Accounting entry'],
    ['E2', 'Ledger: suggested, or picked', 'built', 'Accounting entry: searchable list; "suggested" tag'],
    ['E3', 'Rule case per line (R1…)', 'built', 'Accounting entry: Rule · why'],
    ['E4', 'Reason (a changed amount or an added line)', 'built', 'Accounting entry, under "Change amounts / add lines"'],
    ['S1', 'Status', 'built', 'Header pill'],
    ['S2', 'Submitted by · at', 'built', 'Approval & history'],
    ['S3', 'Decided by · at · reason', 'built', 'Approval & history; right side when sent back or rejected'],
    ['S4', 'Journal entry', 'built', 'Right side when posted'],
    ['S5', 'Returned to Billing · reason', 'built', 'Right side'],
    ['I1', 'The invoice (lines, IRN, e-way bill, addresses)', 'built', "Invoice from Billing tab and the small invoice: read-only, Billing's"],
  ] as [string, string, Built, string][],
  checks: [
    ['K1', 'built (open customer account)'], ['K7 K8', 'built (open period)'], ['K15', 'built (credit warning)'], ['K16', 'built (Dr = Cr)'], ['K17', 'built (ledger rules, amounts = the invoice)'], ['K19', 'built (maker ≠ checker)'],
    ['invoice checks', "Billing's (removed from T24, rev 6)"],
  ] as [string, string][],
};
