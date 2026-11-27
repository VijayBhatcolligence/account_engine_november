// REC (Vijay, 27-Nov-2026): the posting rules SALES_INVOICE / SALES_CREDIT_NOTE / SALES_DEBIT_NOTE v1 are REMOVED from this
// app. Each role app owns its accounting layer and proposes its entry; the Accounts Executive records it, or types it, like
// Tally (rules.ts entryOf). The rules and the mapping are kept on the local branch archive/ae-engine-rev21.
//
// What stays here: the note reasons (a fact of the document, GST s.34) and Stores' return receipt, which is the Stores role's
// own entry (mocked in this app): the stock back at the cost it left at (the CA's E1).

export type NoteDoc = 'credit_note' | 'debit_note';
export type NoteWhy = 'return' | 'scheme_discount' | 'price_correction' | 'goodwill' | 'price_increase' | 'additional_charge';

export interface StockLine {
  ledger: 'fg_inventory' | 'cogs';
  dr: number;
  cr: number;
  item?: string;
  lot?: string | null;
  qty?: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Stores' receipt (the Stores role's entry): Dr Finished Goods · Cr Cost of Goods Sold, at the cost the goods left at. */
export function returnReceiptPostingFor(items: { item: string; lot: string | null; qty: number; amount: number }[]): StockLine[] {
  const back = items.filter((c) => c.amount > 0);
  if (!back.length) return [];
  return [
    ...back.map((c): StockLine => ({ ledger: 'fg_inventory', dr: c.amount, cr: 0, item: c.item, lot: c.lot, qty: c.qty })),
    { ledger: 'cogs', dr: 0, cr: r2(back.reduce((t, c) => t + c.amount, 0)) },
  ];
}
