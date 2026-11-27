import { Clock, Inbox, Plus, ReceiptText, UserCheck } from 'lucide-react';
import { inr } from '../../domain/money';
import { calcOf, DOC_LABEL } from '../../sales/rules';
import { useSalesCtx } from '../../sales/SalesScreen';
import { isMineV, isWithOthersV, titleOfV } from '../../sales/store';
import { fmtDateTime, relTime } from '../../domain/dates';
import { Button, Callout, EmptyState, KpiCard, ListItem, PageHeader, Tile, TileGrid } from '../../ui';
import { ACTORS, ME, SIDE_LABEL, who } from '../catalogue';
import { isCustomer, isMine, isWithOthers, titleOf, useOnboarding } from '../store';

const FLOW = [
  { who: 'Event or Sales', where: 'Automatic or on paper', what: 'Automatic: an uploaded invoice names a customer we do not have → the form opens already filled from it (a task here). Manual: Arun hands you a paper form' },
  { who: 'You', where: 'This app', what: 'Automatic: fill only what is flagged missing. Manual: New → type everything. Then check the GSTIN on the portal and submit' },
  { who: 'System', where: 'Finance backend', what: 'Works out state, constitution and header; finds the party if it is already in the master; stops what is wrong' },
  { who: 'Checkers', where: 'Their apps', what: 'Rajan: party, terms, billing · Farid: credit limit · Venkat: tax tagging' },
  { who: 'System', where: 'Finance backend', what: 'P&C creates the party (or adds the customer role) and gives the party_id; then the AR account under its header, from today: active' },
];

const SALES_FLOW = [
  { who: 'Billing', where: 'Their app', what: 'Hands over its invoice or note (number, IRN, lines, GST calculated)' },
  { who: 'You', where: 'This app', what: 'Type its entry, like Tally: pick each ledger, enter Dr / Cr (the document\'s amounts are shown beside); Dr = Cr' },
  { who: 'Checker', where: 'His app', what: 'Rajan approves (the entry posts), sends it back or rejects it' },
  { who: 'System', where: 'The books', what: 'The journal entry as typed; the ledgers and the customer\'s sub-ledger update' },
];

export function DashboardScreen() {
  const s = useOnboarding();
  const customers = s.requests.filter(isCustomer);
  const mine = customers.filter(isMine);
  const others = customers.filter(isWithOthers);
  const active = customers.filter((r) => r.status === 'active');
  const { s: sales, ctx } = useSalesCtx();
  const vMine = sales.vouchers.filter(isMineV);
  const vOthers = sales.vouchers.filter(isWithOthersV);
  const posted = sales.vouchers.filter((v) => v.status === 'posted');
  // invoices less credit notes plus debit notes (the notes correct the sales)
  const postedTotal = posted.reduce((t, v) => t + (v.docType === 'credit_note' ? -1 : 1) * calcOf(v, ctx).total, 0);
  const postedInvoices = posted.filter((v) => (v.docType ?? 'invoice') === 'invoice').length;
  const held = sales.held ?? [];

  return (
    <div className="dash-wrap">
      <div className="ob-dash">
        <PageHeader
          title={`Good morning, ${ACTORS[ME].name}`}
          subtitle="Each role app records its own document and will propose its entry; you record it, like Tally: pick the ledger, type Dr / Cr, save; Rajan approves. A task that arrives from an event opens already filled; a manual one opens blank."
          actions={
            <span className="inline-gap">
              <Button icon={Plus} onClick={() => s.navigate('onboarding')}>Create a customer</Button>
              <Button variant="primary" icon={ReceiptText} onClick={() => s.navigate('sales')}>Post a sales entry</Button>
            </span>
          }
        />
        <TileGrid>
          <div className="ob-kpis">
            <KpiCard icon={Inbox} label="Needs me" value={mine.length + vMine.length} context={`${mine.length} customer form${mine.length === 1 ? '' : 's'} · ${vMine.length} sales entr${vMine.length === 1 ? 'y' : 'ies'}`} status={mine.length + vMine.length ? { tone: 'warning', label: 'Open' } : undefined} onClick={() => (mine.length ? s.navigate('onboarding', mine[0].id) : s.openVoucher(vMine[0]?.id ?? null))} />
            <KpiCard icon={Clock} label="With checkers" value={others.length + vOthers.length} context="Waiting on Rajan, Farid or Venkat" onClick={() => (others.length ? s.navigate('onboarding', others[0].id) : s.openVoucher(vOthers[0]?.id ?? null))} />
            <KpiCard icon={ReceiptText} label="Sales posted (Oct)" value={inr(postedTotal)} context={`${postedInvoices} invoice${postedInvoices === 1 ? '' : 's'}${posted.length > postedInvoices ? ` · ${posted.length - postedInvoices} note${posted.length - postedInvoices === 1 ? '' : 's'} (net)` : ''} · journal in Forms › Books`} onClick={() => s.navigate('books')} />
            <KpiCard icon={UserCheck} label="Customers activated" value={active.length} context="In this walkthrough" onClick={() => s.navigate('parties')} />
          </div>

          <Tile title="Needs me" subtitle="Open one to complete it" span={6}>
            {mine.length + vMine.length === 0 ? (
              <EmptyState title="Nothing open" text='A customer form on your desk? Open Create a customer and press "New customer from a paper form".' />
            ) : (
              <div className="ob-list">
                {mine.map((r) => {
                  return (
                    <ListItem
                      key={r.id}
                      tone={r.status === 'returned' ? 'critical' : 'warning'}
                      title={`${r.source ? 'Create customer' : `New ${SIDE_LABEL[r.side].toLowerCase()}`} · ${titleOf(r)}`}
                      subtitle={r.status === 'returned' ? `Returned · ${r.returnedReason}` : r.source ? `Automatic · filled from ${r.source.docNo || r.source.file} (${r.source.filled.length} fields): fill what is missing and submit; the ${r.source.docNo ? 'document' : 'invoice'} waits for it` : `Manual · paper form ${r.formNo} from ${who(r.from)}`}
                      meta={`Opened ${relTime(r.arrivedAt, s.now)}`}
                      onClick={() => s.navigate('onboarding', r.id)}
                    />
                  );
                })}
                {vMine.map((v) => (
                  <ListItem
                    key={v.id}
                    tone={v.decisionReason ? 'critical' : 'warning'}
                    title={`Sales entry · ${titleOfV(v, ctx)}`}
                    subtitle={v.decisionReason ? `Sent back · ${v.decisionReason}` : `From Billing · ${DOC_LABEL[v.docType ?? 'invoice'].toLowerCase()} ${v.number}: type its entry`}
                    meta={`Opened ${relTime(v.arrivedAt, s.now)}`}
                    onClick={() => s.openVoucher(v.id)}
                  />
                ))}
              </div>
            )}
          </Tile>

          {held.length > 0 && (
            <Tile title="Waiting for a customer" subtitle="Uploaded documents, not in the voucher list: each comes back to book by itself once its customer is active" span={12}>
              <div className="ob-list">
                {held.map((v) => {
                  const r = s.requests.find((x) => x.id === v.pendingCustomer?.requestId);
                  return (
                    <ListItem
                      key={v.id}
                      tone="info"
                      title={`${DOC_LABEL[v.docType ?? 'invoice']} ${v.number} · ${v.pendingCustomer?.name}`}
                      subtitle={`Customer form ${r?.id ?? '(discarded)'}: ${!r ? 'create it again from Sales' : r.status === 'draft' ? 'with you, to fill and submit' : r.status === 'submitted' ? 'with the checkers' : r.status}`}
                      meta={inr(calcOf(v, ctx).payable)}
                      onClick={() => (r ? s.navigate('onboarding', r.id) : s.navigate('sales'))}
                    />
                  );
                })}
              </div>
            </Tile>
          )}

          <Tile title="Recent" subtitle="Same as the bell" span={6}>
            <div className="ob-list">
              {s.notices.slice(0, 5).map((n) => (
                <ListItem key={n.id} tone={n.tone} title={n.title} subtitle={n.body} meta={fmtDateTime(n.at)} onClick={() => s.openNotice(n.id)} />
              ))}
            </div>
          </Tile>

          <Tile title="How a new customer reaches you" subtitle="Two ways: automatically, filled from the document that named the customer; or by hand, typed from Sales' paper form. Rajan checks the party details either way." span={12}>
            <ol className="ob-flow">
              {FLOW.map((f, i) => (
                <li key={i} className={`ob-flow__step${f.who === 'You' ? ' is-you' : ''}`}>
                  <span className="ob-flow__n">{i + 1}</span>
                  <span className="ob-flow__who">{f.who}</span>
                  <span className="ob-flow__where">{f.where}</span>
                  <span className="ob-flow__what">{f.what}</span>
                </li>
              ))}
            </ol>
            <Callout tone="info" title="No group ledger to pick">
              The account sits under a header (for example Trade Receivables › Domestic). The category you choose decides which header. You never create a header: after go-live the Accounts Manager owns the chart of accounts.
            </Callout>
          </Tile>

          <Tile title="How a sales invoice reaches you" subtitle="Billing is combined with this role in this company (tasks doc §9): you post the invoice, the Accounts Manager checks every one." span={12}>
            <ol className="ob-flow ob-flow--sales">
              {SALES_FLOW.map((f, i) => (
                <li key={i} className={`ob-flow__step${f.who === 'You' ? ' is-you' : ''}`}>
                  <span className="ob-flow__n">{i + 1}</span>
                  <span className="ob-flow__who">{f.who}</span>
                  <span className="ob-flow__where">{f.where}</span>
                  <span className="ob-flow__what">{f.what}</span>
                </li>
              ))}
            </ol>
            <Callout tone="info" title="One balance-sheet side, one P&L side">
              The invoice debits the customer (balance sheet) and credits Sales (P&L) and Output GST (balance sheet). Stock and cost of goods sold are not part of the invoice: Stores' delivery challan posts them, a separate task (G30).
            </Callout>
          </Tile>
        </TileGrid>
      </div>
    </div>
  );
}
