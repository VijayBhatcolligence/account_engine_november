import { Clock, Inbox, Plus, ReceiptText, UserCheck } from 'lucide-react';
import { inr } from '../../domain/money';
import { calcOf } from '../../sales/rules';
import { useSalesCtx } from '../../sales/SalesScreen';
import { isMineV, isWithOthersV, titleOfV } from '../../sales/store';
import { fmtDateTime, relTime } from '../../domain/dates';
import { Button, Callout, EmptyState, KpiCard, ListItem, PageHeader, Tile, TileGrid } from '../../ui';
import { ACTORS, ME, SIDE_LABEL, who } from '../catalogue';
import { isCustomer, isMine, isWithOthers, titleOf, useOnboarding } from '../store';

const FLOW = [
  { who: 'Sales', where: 'On paper', what: 'Arun fills a customer form and hands it to you, with copies of the GST certificate and PAN' },
  { who: 'You', where: 'This app', what: 'New → type everything from the form: party details and finance details (credit limit, billing). Check the GSTIN on the portal' },
  { who: 'System', where: 'Finance backend', what: 'Works out state, constitution and header; finds the party if it is already in the master; stops what is wrong' },
  { who: 'Checkers', where: 'Their apps', what: 'Rajan: party, terms, billing · Farid: credit limit · Venkat: tax tagging' },
  { who: 'System', where: 'Finance backend', what: 'P&C creates the party (or adds the customer role) and gives the party_id; then the AR account under its header, from today: active' },
];

const SALES_FLOW = [
  { who: 'Sales · Stores', where: 'Their apps', what: 'Arun raises the order (Nisha approves); Latha records the delivery challan. Under Perpetual the challan posts the cost: Dr cost of goods sold, Cr FG inventory' },
  { who: 'You', where: 'This app', what: 'Pick the challan under To bill: the invoice pulls its lines at the order rates. Add the customer PO, check quantities (never above the challan)' },
  { who: 'System', where: 'Finance backend', what: 'Works out place of supply, CGST + SGST or IGST, HSN summary, round off, margin; runs the e-invoice pre-check' },
  { who: 'Checker', where: 'His app', what: 'Rajan approves every invoice (Billing combined, §9). His approval triggers the IRN and e-way bill Part-A' },
  { who: 'System', where: 'Posting engine', what: 'One entry: Dr customer, Cr sales, Cr output GST. Invoice number, IRN, QR. Stores then releases the challan' },
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
  const postedTotal = posted.reduce((t, v) => t + calcOf(v, ctx).total, 0);

  return (
    <div className="dash-wrap">
      <div className="ob-dash">
        <PageHeader
          title={`Good morning, ${ACTORS[ME].name}`}
          subtitle="Two tasks in this mock: creating a customer from the paper form Sales hands you, and raising the sales invoice for each delivery challan."
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
            <KpiCard icon={ReceiptText} label="Sales posted (Oct)" value={inr(postedTotal)} context={`${posted.length} invoices · journal in Forms › Books`} onClick={() => s.navigate('books')} />
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
                      title={`New ${SIDE_LABEL[r.side].toLowerCase()} · ${titleOf(r)}`}
                      subtitle={r.status === 'returned' ? `Returned · ${r.returnedReason}` : `Form ${r.formNo} from ${who(r.from)}`}
                      meta={`Opened ${relTime(r.arrivedAt, s.now)}`}
                      onClick={() => s.navigate('onboarding', r.id)}
                    />
                  );
                })}
                {vMine.map((v) => (
                  <ListItem
                    key={v.id}
                    tone={v.status === 'returned' ? 'critical' : 'warning'}
                    title={`Sales entry · ${titleOfV(v, ctx)}`}
                    subtitle={v.status === 'returned' ? `Returned · ${v.returnedReason}` : `From challan ${v.dcId}, recorded by ${who(v.from)}`}
                    meta={`Opened ${relTime(v.arrivedAt, s.now)}`}
                    onClick={() => s.openVoucher(v.id)}
                  />
                ))}
              </div>
            )}
          </Tile>

          <Tile title="Recent" subtitle="Same as the bell" span={6}>
            <div className="ob-list">
              {s.notices.slice(0, 5).map((n) => (
                <ListItem key={n.id} tone={n.tone} title={n.title} subtitle={n.body} meta={fmtDateTime(n.at)} onClick={() => s.openNotice(n.id)} />
              ))}
            </div>
          </Tile>

          <Tile title="How a new customer reaches you" subtitle="Nothing arrives in the system from Sales: you type the whole form in. Rajan checks the party details against the scanned form." span={12}>
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
              The invoice debits the customer (balance sheet) and credits Sales (P&L) and Output GST (balance sheet). The cost side, Dr cost of goods sold (P&L) and Cr finished-goods inventory (balance sheet), is the challan's own entry under Perpetual (typed by hand for now, dated the challan date), never inside the invoice.
            </Callout>
          </Tile>
        </TileGrid>
      </div>
    </div>
  );
}
