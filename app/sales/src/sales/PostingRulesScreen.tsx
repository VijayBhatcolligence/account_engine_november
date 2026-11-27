// Ledgers and checks (REC, 27-Nov-2026: no posting rules in this app). What every voucher must satisfy, the ledgers the AE
// picks from (the chart), the receivable ledgers, the company settings, and the checks on a typed entry.

import { PageHeader, Section, StatusPill } from '../ui';
import { DEBTOR_LEDGER, LEDGERS, PARAMS, SETTINGS } from './catalogue';
import { CHECK_CODE } from './rules';

const EVERY_VOUCHER: { rule: string; why: string }[] = [
  { rule: 'Total Dr = total Cr, to the paisa (K16)', why: 'Double entry. Nothing is posted unless it balances' },
  { rule: 'The AE types the entry, like Tally: the ledger and Dr or Cr on each line', why: 'REC (Vijay, 27-Nov-2026): each role app owns its accounting layer and will propose the entry; this app records it. No posting rule and no ledger mapping here. The document\'s amounts (GST, totals) and the cost from inventory are calculated and shown for reference' },
  { rule: 'The entry is checked against the document (K27) and inventory (K26)', why: 'The customer line and the GST by head are compared with the document\'s calculated amounts (a warning Rajan sees); the cost of goods sold must equal inventory\'s, because stock goes out on approval' },
  { rule: 'Never a group ledger; a receivable ledger only through a customer (LEDGER_NOT_POSTABLE)', why: "107010–107130 are receivable ledgers (account_type receivable): the customer line posts to its account's own ledger and names the account (the commit check: SUBLEDGER_MISMATCH, ACCOUNT_NOT_ON_ITS_LEDGER)" },
  { rule: 'The posting date must be in an open period (K7, K8)', why: 'Oct-2026 open · Sep-2026 soft-closed (Accounts Manager approval) · earlier months closed' },
  { rule: 'Approval re-runs every check, then posts in one transaction', why: "As Manoj's purchase voucher: the customer or the period may have changed since Submit (APPROVAL_REFUSED). If any step stops, nothing is saved" },
  { rule: 'Posted is final: no edit, no delete', why: "A mistake on the invoice is Billing's to correct (a credit note, T25); a wrong entry is reversed, never edited" },
  { rule: 'One entry per document', why: 'Each invoice or note Billing hands over is booked once (unique per number and branch); the journal entry links to it (source_document_id)' },
];

const CHECKS: [string, 'Stop' | 'Warn' | 'Stop / Warn', string][] = [
  ['K1', 'Stop', 'The invoice names an open customer account (T12 done)'],
  ['K7', 'Stop', 'The posting date (= the invoice date) in a closed month or year'],
  ['K8', 'Warn', 'Soft-closed month'],
  ['K15', 'Warn', 'Customer over its credit limit after this invoice'],
  ['K16', 'Stop', 'The entry is typed and balances (Dr = Cr)'],
  ['K17', 'Stop', 'Every line has a postable ledger (never a group; a receivable ledger only through the customer) and one amount, Dr or Cr'],
  ['K27', 'Warn', 'The customer line and the GST by head differ from the document\'s calculated amounts (Rajan sees it)'],
  ['K26', 'Stop', 'The cost of goods sold in the entry differs from inventory\'s (stock goes out on approval)'],
  ['K19', 'Stop', 'The maker may not decide'],
];

export function PostingRulesScreen() {
  const ledgers = Object.values(LEDGERS).filter((l) => l.accountType !== 'receivable');
  const receivables = [...new Set(Object.values(DEBTOR_LEDGER))].map((code) => Object.values(LEDGERS).find((l) => l.code === code)!).filter(Boolean);
  return (
    <div className="ob-page">
      <PageHeader
        title="Ledgers and checks"
        subtitle="No posting rules in this app (REC, 27-Nov-2026): the Accounts Executive types each entry, like Tally, from these ledgers; the checks below run on save, submit and post."
      />
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
                  <td>{l.proposed ? <StatusPill tone="warning">proposed in the app</StatusPill> : l.isGroup ? <StatusPill tone="normal">group</StatusPill> : l.seeded ? <StatusPill tone="info">seeded default</StatusPill> : <StatusPill tone="success">CA ✓</StatusPill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="subtle small-note">The ledgers the AE picks from, seeded in the chart by default (Vijay, 26-Nov). "Seeded default": the CA's chart had no code for it, so it carries ours (G18: the CA may renumber). The second column is fin.ledger_account.account_type.</p>
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
        <Section title="Typing an entry (REC, 27-Nov-2026)">
          <ul className="ob-plain">
            <li>The entry starts empty. Each line: a ledger (or the customer's account), Dr or Cr, an optional narration.</li>
            <li>The document's amounts (customer, taxable value, GST by head, round off) are calculated and shown beside, for reference.</li>
            <li>"Add the cost from inventory" adds the cost of goods sold lines (FIFO or weighted average) in one click: a calculation, not a rule.</li>
            <li>Submit needs Dr = Cr and postable ledgers; a difference from the document is a warning Rajan sees.</li>
            <li>A role app's own accounting layer will later propose the entry; it arrives here filled, and the AE checks and records it.</li>
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
      <Section title="Checks on a typed entry (K1–K26)">
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
