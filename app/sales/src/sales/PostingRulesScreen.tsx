// Posting rules: what every voucher must satisfy, what a sales invoice is checked for, the two entries a sale
// makes (Stores' challan: cost; the invoice: revenue), the company switch Perpetual / Periodic, and the numbers.

import { PageHeader, Section, SegmentedControl, StatusPill } from '../ui';
import { LEDGERS, PARAMS, SERIES } from './catalogue';
import { COST_RULE, POSTING_RULE } from './rules';
import { useSales } from './store';

const EVERY_VOUCHER: { rule: string; why: string }[] = [
  { rule: 'Total Dr = total Cr, to the paisa', why: 'Double entry. A draft may be unbalanced; nothing is posted unless it balances' },
  { rule: 'A sale has a balance-sheet side and a P&L side', why: 'The customer owes us and GST is owed (balance sheet); the sale is income (P&L). Under Perpetual the cost side is the same: cost of goods sold (P&L), inventory (balance sheet)' },
  { rule: 'One owner per entry: stock and cost move on the challan, revenue on the invoice', why: "Stores' challan is when the goods leave; crediting inventory again in the invoice would count it twice" },
  { rule: 'Only postable ledgers, never a header', why: "Trade Receivables › Domestic is a header: the line goes to the customer's own AR account under it" },
  { rule: 'A control account is posted only with a party', why: 'The AR sub-ledger must always add up to Trade Receivables (CONTROL_ACCOUNT_REQUIRES_PARTY)' },
  { rule: 'The posting date must be in an open period', why: 'Oct-2026 open · Sep-2026 soft-closed (Accounts Manager approval) · earlier months closed' },
  { rule: 'Confirmed is final: no edit, no delete', why: 'A mistake is corrected by a credit note (its own reversing entry); the invoice stays (scenario C-24)' },
  { rule: `The invoice number is given on confirmation: ${SERIES.invoice}nnnn`, why: 'One series per GSTIN, reset each financial year, never gapped; at most 16 characters (CGST Rule 46(b)). A cancelled number is kept, never reused' },
  { rule: 'Confirmed only with the entry posted and the IRN received', why: 'If the entry fails, the invoice stays Draft (scenario C-25); without the IRN the challan cannot leave' },
  { rule: 'The module never chooses a ledger', why: "It sends amounts and tax; the posting rule and account determination pick the ledgers (team lead's design)" },
];

const SALES_CHECKS: { level: 'stop' | 'warn'; when: string; why: string }[] = [
  { level: 'stop', when: 'An invoice line with no challan line', why: 'Bill only what Stores dispatched (scenario §3.2)' },
  { level: 'stop', when: 'Quantity above what is left on the challan', why: '0% above the challan; partial billing allowed (scenario §3.4)' },
  { level: 'stop', when: 'The challan is already fully invoiced', why: 'No duplicate invoice' },
  { level: 'stop', when: 'E-invoice pre-check fails: buyer GSTIN, ship-to pincode, 6-digit HSN', why: 'Else the IRN fails. Identity is fixed in the party master, not here; the invoice stays Draft (B4-03)' },
  { level: 'stop', when: "Customer's PO number missing when its billing instruction says every invoice", why: 'From onboarding (billing instructions)' },
  { level: 'stop', when: 'Date in a closed month, or after today', why: 'Period lock; the invoice is dated at or before removal of the goods' },
  { level: 'stop', when: 'No customer account, or an export customer', why: 'Onboard first; export invoices (LUT) are another voucher type' },
  { level: 'warn', when: 'Date in a soft-closed month', why: 'Accounts Manager-approved adjustments only' },
  { level: 'warn', when: 'Batch expires within 7 days', why: 'FEFO warning from the challan, shown again (G-2604 on DC-1)' },
  { level: 'warn', when: 'Margin below 18%, or below cost', why: 'The Sales Order approval covered it; shown so nothing is billed below cost unseen' },
  { level: 'warn', when: 'Customer over its credit limit after this invoice', why: 'Credit is checked on the order; dispatched goods are billed anyway, Farid is told' },
  { level: 'warn', when: 'Part of the challan left unbilled', why: 'Partial billing: the rest stays on the unbilled list (keep it at zero)' },
];

export function PostingRulesScreen() {
  const s = useSales();
  return (
    <div className="ob-page">
      <PageHeader
        title="Posting rules"
        subtitle="What every voucher must satisfy, what a sales invoice is checked for, and the two entries a sale makes. Same rules the backend runs on save, submit and confirm."
        actions={
          <span className="inline-gap">
            <span className="subtle small-note">Inventory accounting (company switch)</span>
            <SegmentedControl label="Inventory accounting" value={s.method} onChange={(m) => s.setMethod(m)} options={[{ value: 'perpetual', label: 'Perpetual (Run 1)' }, { value: 'periodic', label: 'Periodic (Run 2)' }]} />
          </span>
        }
      />
      <Section title="Every voucher">
        <ul className="check-list">
          {EVERY_VOUCHER.map((c) => (
            <li key={c.rule} className="check-row">
              <StatusPill tone="info">Always</StatusPill>
              <span className="check-row__text">
                <span className="check-row__title">{c.rule}</span>
                <span className="check-row__detail">{c.why}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <div className="ob-two">
        <Section title="A sale makes two entries">
          <pre className="sv-rule">{`1  Stores records the delivery challan (goods leave KA-FG)
   ${COST_RULE}
   Perpetual:  Dr ${LEDGERS.cogs.name.padEnd(36)} qty × standard cost   P&L
               Cr ${LEDGERS.fg_inventory.name.padEnd(36)} same amount           Balance sheet
   Periodic:   nothing (cost of goods sold from closing stock, T11)

2  The invoice is confirmed (Rajan approves; IRN; e-way bill Part-A)
   ${POSTING_RULE}
   Dr customer's AR account                  total (rounded)      Balance sheet
   Cr ${LEDGERS.sales_local.name.padEnd(36)} taxable  when local      P&L
   Cr ${LEDGERS.sales_interstate.name.padEnd(36)} taxable  when inter-state
   Cr Output CGST · Output SGST (½ rate each)  or  Output IGST     Balance sheet
   Dr/Cr Round off                           total − exact (< ₹1)  P&L

Example DC-1 / SO-1 (scenario B4-01):
   cost   Dr COGS 5,64,000.00 / Cr FG inventory 5,64,000.00
   sale   Dr Sri Lakshmi 7,48,125.00 / Cr Sales 7,12,500.00
          Cr CGST 17,812.50 / Cr SGST 17,812.50    margin 1,48,500 (20.8%)`}</pre>
          <p className="subtle small-note">Ledger codes from the CA's chart of accounts (401010 Sale of Products, 107010 Trade Receivables). Output GST, round off, cost of goods sold and FG inventory ledgers are proposed. In the Schedule III P&L, cost of goods sold shows as "changes in inventories of finished goods".</p>
        </Section>
        <Section title="Who approves, and the numbers">
          <div className="ob-route">
            <p className="ob-route__side">Sales invoice</p>
            <ul>
              <li>
                <strong>Every invoice</strong> → Rajan (Accounts Manager): Billing combined with this role (tasks doc §9). His approval triggers the IRN and e-way bill Part-A
              </li>
              <li>
                <strong>Credit note</strong> → only against an adjustment the Sales Manager approved; Rajan always, Usha as well above ₹1,00,000
              </li>
              <li>
                <strong>Cancel an IRN</strong> → within 24 hours and before the goods move; after that, only a credit note
              </li>
            </ul>
          </div>
          <ul className="ob-params">
            {Object.values(PARAMS).map((p) => (
              <li key={p.words}>
                <span>{p.words}</span>
                <strong>{p.owner}</strong>
              </li>
            ))}
            <li>
              <span>GST rate on biscuits (HSN 190531)</span>
              <strong>5% · Compliance Officer</strong>
            </li>
            <li>
              <span>E-way bill validity</span>
              <strong>1 day per 200 km</strong>
            </li>
          </ul>
        </Section>
      </div>
      <Section title="Checks on a sales invoice">
        <ul className="check-list">
          {SALES_CHECKS.map((c) => (
            <li key={c.when} className={`check-row ${c.level === 'stop' ? 'check-row--stop' : 'check-row--reason'}`}>
              <StatusPill tone={c.level === 'stop' ? 'critical' : 'warning'}>{c.level === 'stop' ? 'Stop' : 'Warn'}</StatusPill>
              <span className="check-row__text">
                <span className="check-row__title">{c.when}</span>
                <span className="check-row__detail">{c.why}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
