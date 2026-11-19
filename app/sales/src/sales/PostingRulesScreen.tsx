// Posting rules (T24 §8): what every voucher must satisfy, the rule SALES_INVOICE v1 (R1–R7), the ledgers and
// their status in the CA's chart, the AE's edit (§8.4), the company switches, and the checks K1–K19.

import { PageHeader, Section, StatusPill } from '../ui';
import { DEBTOR_LEDGER, LEDGERS, PARAMS, SETTINGS } from './catalogue';
import { CHECK_CODE, POSTING_RULE } from './rules';

const EVERY_VOUCHER: { rule: string; why: string }[] = [
  { rule: 'Total Dr = total Cr, to the paisa (K16)', why: 'Double entry. Nothing is posted unless it balances' },
  { rule: 'The engine picks the rule and the ledgers; the slice sends amounts', why: 'The invoice sends the business facts (customer, place of supply, lines, tax). The AE may edit the entry only with a reason, and Rajan sees it (§8.4)' },
  { rule: 'One owner per entry: the invoice posts revenue, the receivable and GST only', why: "Stock and cost of goods sold are the Stores task's (G30), never the invoice's: crediting stock here as well would count it twice" },
  { rule: 'Never a group ledger; a receivable ledger only through a customer (LEDGER_NOT_POSTABLE)', why: "206010 Statutory Dues becomes a group once the GST heads exist. 107010–107130 are receivable ledgers (account_type receivable): the customer line posts to its account's own ledger and names the account (the commit check: SUBLEDGER_MISMATCH, ACCOUNT_NOT_ON_ITS_LEDGER). No \"control ledger\" (Manoj, 13-Nov)" },
  { rule: 'The posting date must be in an open period (K7, K8)', why: 'Oct-2026 open · Sep-2026 soft-closed (Accounts Manager approval) · earlier months closed' },
  { rule: 'Approval re-runs every check, then posts in one transaction', why: "As Manoj's purchase voucher: the customer or the period may have changed since Submit (APPROVAL_REFUSED). If any step stops, nothing is saved" },
  { rule: 'Posted is final: no edit, no delete', why: "A mistake on the invoice is Billing's to correct (a credit note, T25); a wrong entry is reversed, never edited" },
  { rule: 'One entry per invoice', why: "Each invoice Billing hands over is booked once (the voucher is unique per invoice number and branch)" },
  { rule: 'Every journal entry keeps its rule version and any edit', why: '"Why was this posted?" is always answerable: the entry → its sales invoice (source_document_id) → rule SALES_INVOICE v1 and the case on each line (fin.posting_rule) → the edit (who, why, approved by)' },
];

const RULES: [string, string, string, string][] = [
  ['R1', 'Goods, domestic, local (place of supply = our branch\'s state)', 'Customer (its receivable ledger) = total', '401010 Sale of Products · Output CGST · Output SGST · ± Round off'],
  ['R2', 'Goods, domestic, inter-state', 'Customer', '401010 Sale of Products · Output IGST · ± Round off'],
  ['R3', 'Service line (SAC)', 'Customer', '401020 Sale of Services · GST as R1 / R2'],
  ['R4', 'Export under LUT', 'Customer (107040) in INR', '401030 Export Sales · no GST'],
  ['R5', 'Export with IGST (rev 3: the CA\'s C2, C4)', 'Customer (107040) = the value only · IGST Refund Receivable 109040 (proposed) = the IGST', '401030 Export Sales · Output IGST'],
  ['R6', 'SEZ under LUT / with IGST (rev 3: C5, C6)', 'Customer (107050) = the value only · with IGST: IGST Refund Receivable 109040', '401030 (to confirm, G18) · Output IGST when paid'],
  ['R7', 'TCS item (scrap, luxury …)', 'Customer incl. TCS', '+ TCS payable 206014 (s.394): rate to confirm, not computed in the mock'],
  ['R8', 'Paid at once: cash / UPI / card (A3)', 'Cash in Hand 108010 or UPI / Card Clearing 108030 (proposed), not the customer', 'as the line\'s own rule'],
  ['R9', 'Nil-rated, exempt or non-GST line (A5, A6, B4)', '—', 'Sales – Exempt / Nil-rated 401050 (proposed) · no GST; all lines so → a Bill of Supply'],
  ['R10', 'Freight charged to the buyer (A8)', '—', 'Freight Recovered 401070 (proposed) · GST at the goods\' rate'],
  ['R11', 'Expense paid as pure agent (B5)', '—', 'Expenses Recoverable 110030 (proposed) · outside the value, no GST'],
  ['R12', 'Period service billed in advance (B6)', '—', 'Contract Liability 206040 (proposed) · released month by month (period end: G33)'],
];

const CHECKS: [string, 'Stop' | 'Warn' | 'Stop / Warn', string][] = [
  ['K1', 'Stop', 'The invoice names an open customer account (T12 done)'],
  ['K7', 'Stop', 'The posting date (= the invoice date) in a closed month or year'],
  ['K8', 'Warn', 'Soft-closed month'],
  ['K15', 'Warn', 'Customer over its credit limit after this invoice'],
  ['K16', 'Stop', 'Entry balances (Dr = Cr)'],
  ['K17', 'Stop / Warn', 'Ledgers are suggestions: any may be picked (no reason). The customer and GST amounts are the invoice\'s; never a group ledger; the customer line only on a receivable ledger; a changed amount needs a reason; Rajan sees every change'],
  ['K19', 'Stop', 'The maker may not decide'],
];

export function PostingRulesScreen() {
  const ledgers = Object.values(LEDGERS).filter((l) => l.accountType !== 'receivable');
  const receivables = [...new Set(Object.values(DEBTOR_LEDGER))].map((code) => Object.values(LEDGERS).find((l) => l.code === code)!).filter(Boolean);
  return (
    <div className="ob-page">
      <PageHeader
        title="Posting rules"
        subtitle={`${POSTING_RULE}: the entry the engine suggests for an invoice received from Billing, the ledgers it uses, and the checks. Same rules the backend runs on save, submit and post.`}
      />
      <Section title="SALES_INVOICE v1 (effective 1-Apr-2026): event data → rule → entry">
        <table className="ob-sugg">
          <thead>
            <tr>
              <th>Rule · condition</th>
              <th>Dr</th>
              <th>Cr</th>
            </tr>
          </thead>
          <tbody>
            {RULES.map(([id, cond, dr, cr]) => (
              <tr key={id}>
                <th scope="row">
                  <strong>{id}</strong> · {cond}
                </th>
                <td>{dr}</td>
                <td>{cr}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Discount at supply</th>
              <td colSpan={2}>Already inside the taxable value: no ledger (scope 4.14)</td>
            </tr>
            <tr>
              <th scope="row">Stock and cost of goods sold</th>
              <td colSpan={2}>Not in this rule. The goods leaving the store are posted by Stores' delivery challan, a separate task (G30), with its own posting rule. The invoice never credits stock.</td>
            </tr>
          </tbody>
        </table>
        <pre className="sv-rule">{`Example B4-01 · SI-0012, Sri Lakshmi (R1)
   Dr 107100 Trade Receivables – Dealer/Distributor
        naming Sri Lakshmi Distributors (ACC-1201)     7,48,125.00
   Cr 401010 Sale of Products                          7,12,500.00
   Cr 206011 Output CGST (proposed)                       17,812.50
   Cr 206012 Output SGST (proposed)                       17,812.50
Example B4-09 · Gulf Snack export under LUT (R4)
   Dr Gulf Snack Imports LLC (107040)                  9,39,840.00
   Cr 401030 Export Sales                              9,39,840.00   USD 10,680 × ₹88.00`}</pre>
      </Section>
      <div className="ob-two">
        <Section title="Ledgers (CA's chart, Indian GAAP)">
          <table className="ob-sugg">
            <tbody>
              {ledgers.map((l) => (
                <tr key={l.code}>
                  <th scope="row" className="mono">
                    {l.code}
                  </th>
                  <td>{l.name}</td>
                  <td className="mono subtle small-note">{l.accountType ?? ''}</td>
                  <td>{l.proposed ? <StatusPill tone="warning">proposed (CA to confirm)</StatusPill> : l.isGroup ? <StatusPill tone="normal">group</StatusPill> : <StatusPill tone="success">CA ✓</StatusPill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="subtle small-note">401011 Sale of Products – Inter-state is only a proposal (probably not needed: the place of supply is on the invoice). Domestic inter-state sales post to 401010. Output GST by head (206011–206013), TCS payable (206014) and Round Off (505120, under Other Expenses – Administrative) wait for the CA (G18). The second column is fin.ledger_account.account_type.</p>
        </Section>
        <Section title="Receivable ledgers (from the debtor category)">
          <table className="ob-sugg">
            <tbody>
              {receivables.map((l) => (
                <tr key={l.code}>
                  <th scope="row" className="mono">
                    {l.code}
                  </th>
                  <td>{l.name}</td>
                  <td className="subtle small-note">{Object.keys(DEBTOR_LEDGER).filter((k) => DEBTOR_LEDGER[k] === l.code).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="subtle small-note">From fin.debtor_category (the CA's Debtor Category Master), copied to fin.debtor_account.ledger_account_code at T12. account_type receivable: each line names its customer. The CA's chart has all 13 codes (Indian GAAP rows 54–66); the engine seed still maps every category to 107010 (to agree, G28). Replaces the old header-to-code map (G12).</p>
        </Section>
      </div>
      <div className="ob-two">
        <Section title="The AE's edit (§8.4, Vijay 6-Nov)">
          <ul className="ob-plain">
            <li>The engine fills the entry; it is read-only with each line's rule and why.</li>
            <li>"Edit entry": change a ledger, split a line, add a line. Every changed or added line needs a reason.</li>
            <li>Locked: the customer line (= invoice total), the tax lines (= the invoice's tax by head), Dr = Cr.</li>
            <li>Never a group ledger, never a receivable ledger on another line (LEDGER_NOT_POSTABLE).</li>
            <li>Rajan sees "Entry differs from rule R1: lines …"; the journal keeps the rule and the edit (who, why, approved by).</li>
          </ul>
        </Section>
        <Section title="Company settings and parameters">
          <ul className="ob-params">
            {Object.values(SETTINGS).map((p) => (
              <li key={p.words}>
                <span>{p.words}</span>
                <strong>{p.owner}</strong>
              </li>
            ))}
            {Object.values(PARAMS).map((p) => (
              <li key={p.words}>
                <span>{p.words}</span>
                <strong>{p.owner}</strong>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      <Section title="Checks on a sales invoice (K1–K19)">
        <ul className="check-list">
          {CHECKS.map(([k, level, when]) => (
            <li key={k} className={`check-row ${level === 'Warn' ? 'check-row--reason' : 'check-row--stop'}`}>
              <StatusPill tone={level === 'Warn' ? 'warning' : 'critical'}>{level}</StatusPill>
              <span className="check-row__text">
                <span className="check-row__title">
                  {k} · {when}
                </span>
                <span className="check-row__detail mono">{CHECK_CODE[k]}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>
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
    </div>
  );
}
