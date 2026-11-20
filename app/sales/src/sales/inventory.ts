// T24 rev 15 (Vijay, 20-Nov-2026): the cost of goods sold comes from INVENTORY, not from the invoice.
//   The invoice gives the item and the quantity; the stock lots give the cost; the method (FIFO or weighted average)
//   decides which cost. The engine adds the cost lines to the SAME journal entry as the sale (one entry per invoice):
//     Dr Cost of Goods Sold · Cr Finished Goods (one line per lot under FIFO, one per item under weighted average).
//   This is a ROUGH DEMO of the inventory side (inv.stock_lot, a stub): the real inventory module (T8 / S4) owns it.
//   Lot costs are ILLUSTRATIVE: the scenario gives one standard cost per item (₹560 / ₹760); lots with different costs
//   are needed to show FIFO and weighted average differ. Quantities and batches are the scenario's (§1.6, D-02).

export type CostMethod = 'fifo' | 'wam';
export const COST_METHODS: Record<CostMethod, { label: string; words: string }> = {
  fifo: { label: 'FIFO', words: 'First in, first out: the oldest lots go out first, each at its own cost' },
  wam: { label: 'Weighted average', words: 'Weighted average: every unit at (value of the stock ÷ quantity in stock)' },
};

/** inv.stock_lot: one row per lot received (not accounting; the inventory module's). */
export interface StockLot {
  lotId: string; // LOT-1
  branch: string; // fin.branch.branch_code
  godown: string; // KA-FG
  item: string; // FG-101
  lot: string; // batch G-2604
  receivedOn: string; // ISO date: FIFO order
  qtyReceived: number;
  qtyLeft: number;
  unitCost: number; // ₹ per unit (weighted average: rewritten to the average after each issue)
  illustrative: true;
}

/** Demo stock on 07-Oct-2026, KA-FG (scenario §1.6 quantities and batches). Costs and received dates: ILLUSTRATIVE. */
export const seedLots = (): StockLot[] => [
  { lotId: 'LOT-1', branch: 'KA-01', godown: 'KA-FG', item: 'FG-101', lot: 'G-2604', receivedOn: '2026-04-14', qtyReceived: 300, qtyLeft: 300, unitCost: 540, illustrative: true },
  { lotId: 'LOT-2', branch: 'KA-01', godown: 'KA-FG', item: 'FG-101', lot: 'G-2608', receivedOn: '2026-08-12', qtyReceived: 2_000, qtyLeft: 2_000, unitCost: 560, illustrative: true },
  { lotId: 'LOT-3', branch: 'KA-01', godown: 'KA-FG', item: 'FG-102', lot: 'C-2607', receivedOn: '2026-07-16', qtyReceived: 1_500, qtyLeft: 1_500, unitCost: 760, illustrative: true },
];

const r2 = (n: number) => Math.round(n * 100) / 100;

/** One cost line: what left stock, from which lot, at what cost. lotId null = weighted average (all lots of the item). */
export interface CostPick {
  item: string;
  lotId: string | null;
  lot: string | null;
  receivedOn: string | null;
  qty: number;
  unitCost: number;
  amount: number;
}
export interface CostProblem {
  code: 'NO_STOCK_RECORD' | 'STOCK_SHORT';
  item: string;
  want: number;
  have: number;
}
export interface CostResult {
  method: CostMethod;
  picks: CostPick[];
  total: number;
  problems: CostProblem[];
}

export const lotsOf = (lots: StockLot[], branch: string, item: string) =>
  lots.filter((l) => l.branch === branch && l.item === item && l.qtyLeft > 0).sort((a, b) => a.receivedOn.localeCompare(b.receivedOn) || a.lotId.localeCompare(b.lotId));

/** The quantity of each item on the invoice (goods lines only; a service has no stock). */
export const issueOf = (rows: { kind: string; item: string; qty: number }[]) => {
  const m = new Map<string, number>();
  for (const r of rows) if (r.kind === 'goods' && r.qty > 0) m.set(r.item, (m.get(r.item) ?? 0) + r.qty);
  return [...m].map(([item, qty]) => ({ item, qty }));
};

/** The cost of the goods on an invoice, from the lots, by the method. Pure: nothing changes. */
export function costOf(lots: StockLot[], method: CostMethod, branch: string, items: { item: string; qty: number }[]): CostResult {
  const picks: CostPick[] = [];
  const problems: CostProblem[] = [];
  for (const { item, qty } of items) {
    const own = lotsOf(lots, branch, item);
    const have = own.reduce((t, l) => t + l.qtyLeft, 0);
    if (!lots.some((l) => l.branch === branch && l.item === item)) {
      problems.push({ code: 'NO_STOCK_RECORD', item, want: qty, have: 0 });
      continue;
    }
    if (have < qty) {
      problems.push({ code: 'STOCK_SHORT', item, want: qty, have });
      continue;
    }
    if (method === 'wam') {
      const value = own.reduce((t, l) => t + l.qtyLeft * l.unitCost, 0);
      const avg = value / have;
      picks.push({ item, lotId: null, lot: null, receivedOn: null, qty, unitCost: r2(avg), amount: r2(qty * avg) });
      continue;
    }
    let need = qty;
    for (const l of own) {
      if (!need) break;
      const take = Math.min(need, l.qtyLeft);
      picks.push({ item, lotId: l.lotId, lot: l.lot, receivedOn: l.receivedOn, qty: take, unitCost: l.unitCost, amount: r2(take * l.unitCost) });
      need -= take;
    }
  }
  return { method, picks, total: r2(picks.reduce((t, p) => t + p.amount, 0)), problems };
}

/** At approval (the same transaction as the journal entry): the stock goes down. Mutates the lots (an immer draft).
 *  FIFO: each lot by what it gave. Weighted average: quantity from the oldest lots; the stock left keeps the value left,
 *  so every remaining lot of the item carries the new average (value left ÷ quantity left). */
export function issueStock(lots: StockLot[], method: CostMethod, branch: string, items: { item: string; qty: number }[]) {
  const res = costOf(lots, method, branch, items);
  if (res.problems.length) return res;
  for (const { item, qty } of items) {
    const own = lotsOf(lots, branch, item);
    const valueBefore = own.reduce((t, l) => t + l.qtyLeft * l.unitCost, 0);
    const out = res.picks.filter((p) => p.item === item).reduce((t, p) => t + p.amount, 0);
    let need = qty;
    for (const l of own) {
      const take = Math.min(need, l.qtyLeft);
      l.qtyLeft -= take;
      need -= take;
    }
    if (method === 'wam') {
      const left = own.reduce((t, l) => t + l.qtyLeft, 0);
      if (left) for (const l of own) l.unitCost = (valueBefore - out) / left;
    }
  }
  return res;
}

/** What the stock is worth (Σ quantity left × unit cost): it must equal the Finished Goods ledger (T9 reconciliation). */
export const stockValue = (lots: StockLot[], branch?: string) => r2(lots.filter((l) => !branch || l.branch === branch).reduce((t, l) => t + l.qtyLeft * l.unitCost, 0));
