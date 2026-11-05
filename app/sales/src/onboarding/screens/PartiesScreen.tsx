// Vendors & customers: every active party account, one row per party and side.
// Party details come from P&C (Business Core); the account, its ledger group and money terms are ours (rev 12).

import { useState } from 'react';
import { inr } from '../../domain/money';
import { fmtDate } from '../../domain/dates';
import { Button, Callout, DataTable, KeyValue, PageHeader, Section, SegmentedControl, Sheet, StatusPill, type Column } from '../../ui';
import { branchesOf, gstinsForLocation, locationsOf, viewOf } from '../branches';
import { categoriesFor, MSME_CATEGORY } from '../catalogue';
import { partyOf, useOnboarding } from '../store';
import type { Account, Party } from '../types';
import { IdentityBlock } from './parts';

type Filter = 'all' | 'payable' | 'receivable';

export function PartiesScreen() {
  const s = useOnboarding();
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const rows = s.accounts.filter((a) => filter === 'all' || a.side === filter);
  const sel = s.accounts.find((a) => a.accountId === open) ?? null;

  const cols: Column<Account>[] = [
    { key: 'name', header: 'Account', render: (a) => <span className="cell-stack"><strong>{a.name}</strong><span className="subtle small-note">{a.accountId} · {a.partyId}</span></span>, sortValue: (a) => a.name },
    { key: 'side', header: 'Side', render: (a) => (a.side === 'payable' ? 'Vendor' : 'Customer'), sortValue: (a) => a.side },
    { key: 'under', header: 'Under', render: (a) => a.under, sortValue: (a) => a.under },
    { key: 'cat', header: 'Category', render: (a) => categoriesFor(a.side)[a.category] ?? a.category },
    { key: 'terms', header: 'Terms', render: (a) => `${a.creditDays ?? '—'} days${a.side === 'receivable' ? ` · ${inr(a.creditLimit)}` : ''}`, align: 'right', sortValue: (a) => a.creditDays ?? 0 },
    {
      key: 'msme',
      header: 'MSME',
      render: (a) =>
        a.side === 'receivable' ? '—' : a.msme === 'yes' ? (a.udyam ? <StatusPill tone="success">{MSME_CATEGORY[a.msmeCategory ?? ''] ?? 'Yes'}</StatusPill> : <StatusPill tone="warning">Yes · no Udyam</StatusPill>) : a.msme === 'unknown' ? <StatusPill tone="warning">Not known</StatusPill> : 'No',
    },
    { key: 'bank', header: 'Bank', render: (a) => (a.bankLast4 ? `•••• ${a.bankLast4}${a.bankSince && a.bankSince >= '2026-09-15' ? ' · new' : ''}` : '—') },
    { key: 'since', header: 'Active since', render: (a) => fmtDate(a.activatedAt), sortValue: (a) => a.activatedAt },
  ];

  return (
    <div className="screen-fill ob-page">
      <PageHeader
        title="Vendors & customers"
        subtitle="Every active party account. One party can have two accounts: Healthy Bite Foods is our customer and our vendor (one party P-0042, two accounts)."
        actions={<SegmentedControl label="Show" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'payable', label: 'Vendors' }, { value: 'receivable', label: 'Customers' }]} />}
      />
      <DataTable columns={cols} rows={rows} rowKey={(a) => a.accountId} onRowClick={(a) => setOpen(a.accountId)} selectedKey={open} defaultSort={{ key: 'since', dir: 'desc' }} />
      <Sheet open={!!sel} onClose={() => setOpen(null)} title={sel?.name ?? ''} description={sel ? `${sel.accountId} · ${sel.side === 'payable' ? 'vendor' : 'customer'} account` : ''} width={560}>
        {sel && (
          <div className="sheet-stack">
            <Section title="Party (P&C · Business Core)">
              <IdentityBlock p={partyOf(s, sel.partyId)!} side={sel.side} />
            </Section>
            <Section title="This account (ours)">
              <KeyValue
                columns={1}
                items={[
                  { label: 'Role in P&C', value: `${sel.side === 'payable' ? 'Supplier' : 'Customer'} of our company${sel.standingId ? ` · standing ${sel.standingId}` : ''}` },
                  { label: 'Under (ledger group)', value: `${sel.under}${sel.controlSince ? ` · since ${fmtDate(sel.controlSince)}${sel.controlSource ? ` (${sel.controlSource === 'suggested' ? 'as suggested' : 'chosen by the AE'})` : ''}` : ''}` },
                  ...(sel.side === 'payable' ? [{ label: 'Buys under GSTIN', value: sel.gstin ?? (partyOf(s, sel.partyId)?.gstins[0]?.value ?? 'Unregistered') }] : []),
                  { label: 'Category', value: categoriesFor(sel.side)[sel.category] ?? sel.category },
                  { label: 'Credit days', value: sel.creditDays ?? '—' },
                  ...(sel.side === 'receivable' ? [{ label: 'Credit limit', value: inr(sel.creditLimit) }] : []),
                  ...(sel.side === 'payable'
                    ? [
                        { label: 'MSME', value: sel.msme === 'yes' ? `${MSME_CATEGORY[sel.msmeCategory ?? ''] ?? 'Yes'} · ${sel.udyam ?? 'Udyam not received'}` : sel.msme ?? '—' },
                        { label: '43B(h) 45-day clock', value: sel.sec43bh === null ? 'Not confirmed' : sel.sec43bh ? 'Applies' : 'Does not apply' },
                        { label: 'Bank', value: sel.bankLast4 ? `•••• ${sel.bankLast4} since ${fmtDate(sel.bankSince)}` : '—' },
                      ]
                    : []),
                ]}
              />
            </Section>
            {sel.side === 'receivable' && partyOf(s, sel.partyId) && <Branches a={sel} p={partyOf(s, sel.partyId)!} />}
            <Callout tone="info" title="Change something?">
              A change opens a new request of kind "change" and goes to the same checkers. A new ledger group applies from a date: the old one stays in the history for entries already posted (accounting.subledger_account_control). Not built in this mock yet.
            </Callout>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/** fin.customer_branch: one account, many branches. Each links a P&C location to the P&C GSTIN of its state. */
function Branches({ a, p }: { a: Account; p: Party }) {
  const s = useOnboarding();
  const all = branchesOf(a, p).map((b) => viewOf(p, b));
  const open = all.filter((v) => !v.branch.until);
  const free = locationsOf(p).filter((l) => !open.some((v) => v.branch.locationId === l.locationId));
  const [pick, setPick] = useState('');
  return (
    <Section title={`Branches (${open.length} billed)`} aside={<span className="subtle small-note">one account · {a.accountId}</span>}>
      <div className="sheet-stack">
        {all.map((v) => (
          <div key={v.branch.branchId} className="cell-stack" style={{ opacity: v.branch.until ? 0.55 : 1 }}>
            <span>
              <strong>{v.location?.label ?? v.branch.locationId}</strong>{' '}
              {v.branch.isDefault && !v.branch.until && <StatusPill tone="success">Default</StatusPill>}{' '}
              {v.branch.until && <StatusPill tone="normal">Deactivated {fmtDate(v.branch.until)}</StatusPill>}
            </span>
            <span className="subtle small-note">
              {v.location ? [v.location.line, v.location.city, v.location.pincode].filter(Boolean).join(', ') : '—'} · GSTIN <span className="mono">{v.gstin?.value ?? 'unregistered'}</span> · since {fmtDate(v.branch.since)} · {v.branch.branchId}
            </span>
            {!v.branch.until && open.length > 1 && (
              <span>
                {!v.branch.isDefault && (
                  <Button size="sm" onClick={() => s.setDefaultBranch(a.accountId, v.branch.branchId)}>
                    Make default
                  </Button>
                )}{' '}
                <Button size="sm" onClick={() => s.deactivateBranch(a.accountId, v.branch.branchId)}>
                  Deactivate
                </Button>
              </span>
            )}
          </div>
        ))}
        {free.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="input" style={{ flex: 1, minWidth: 0 }} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="P&C location to add">
              <option value="">Add a branch P&C already holds…</option>
              {free.map((l) => (
                <option key={l.locationId} value={l.locationId}>
                  {l.label} ({l.city}) · {gstinsForLocation(p, l)[0]?.value ?? 'no GSTIN in P&C: unregistered'}
                </option>
              ))}
            </select>
            <Button size="sm" disabled={!pick} onClick={() => { s.addBranch(a.accountId, pick); setPick(''); }}>
              Add branch
            </Button>
          </div>
        )}
        <p className="subtle small-note">
          Still one party and one AR account: the balance, the credit limit and collections are per customer. A new address or GSTIN is added in P&C first; here we only link it. The invoice picks the branch and copies its GSTIN and address.
        </p>
      </div>
    </Section>
  );
}
