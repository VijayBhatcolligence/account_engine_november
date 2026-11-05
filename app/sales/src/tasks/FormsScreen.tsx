// Forms received: every paper that reached the Accounts Executive's desk, whichever task it started,
// with where it stands. Click one to open its task.

import { useState } from 'react';
import { fmtDateTime } from '../domain/dates';
import { inr } from '../domain/money';
import { DataTable, PageHeader, SegmentedControl, StatusPill, type Column, type Tone } from '../ui';
import { ACTORS, SIDE_LABEL } from '../onboarding/catalogue';
import { STATUS } from '../onboarding/screens/parts';
import { titleOf, isCustomer } from '../onboarding/store';
import { calcOf } from '../sales/rules';
import { useSalesCtx, V_STATUS } from '../sales/SalesScreen';
import { titleOfV } from '../sales/store';

interface Row {
  key: string;
  no: string;
  kind: string;
  from: string;
  about: string;
  at: string;
  task: 'onboarding' | 'sales';
  id: string;
  status: { label: string; tone: Tone };
  result: string;
}

type Filter = 'all' | 'onboarding' | 'sales';

export function FormsScreen() {
  const { app, s, ctx } = useSalesCtx();
  const [filter, setFilter] = useState<Filter>('all');
  const rows: Row[] = [
    ...app.requests.filter(isCustomer).map((r) => ({
      key: r.id,
      no: r.formNo,
      kind: `${SIDE_LABEL[r.side]} form`,
      from: ACTORS[r.from].name,
      about: titleOf(r),
      at: r.arrivedAt,
      task: 'onboarding' as const,
      id: r.id,
      status: STATUS[r.status],
      result: r.accountId ? `${r.partyId} · ${r.accountId}` : r.sentBack ? 'returned' : '—',
    })),
    ...s.vouchers.map((v) => ({
      key: v.id,
      no: v.dcId,
      kind: 'Delivery challan → invoice',
      from: ACTORS[v.from].name,
      about: titleOfV(v, ctx),
      at: v.arrivedAt,
      task: 'sales' as const,
      id: v.id,
      status: V_STATUS[v.status],
      result: v.number ? `${v.number} · ${inr(calcOf(v, ctx).total)}` : '—',
    })),
  ].filter((r) => filter === 'all' || r.task === filter);

  const cols: Column<Row>[] = [
    { key: 'no', header: 'Form', render: (r) => <span className="cell-stack"><strong className="mono">{r.no}</strong><span className="subtle small-note">{r.kind}</span></span>, sortValue: (r) => r.no },
    { key: 'about', header: 'About', render: (r) => r.about, sortValue: (r) => r.about },
    { key: 'from', header: 'Handed over by', render: (r) => r.from },
    { key: 'at', header: 'Received', render: (r) => fmtDateTime(r.at), sortValue: (r) => r.at },
    { key: 'task', header: 'Task', render: (r) => (r.task === 'onboarding' ? 'Create a customer' : 'Post a sales entry') },
    { key: 'status', header: 'Status', render: (r) => <StatusPill tone={r.status.tone}>{r.status.label}</StatusPill> },
    { key: 'result', header: 'Result', render: (r) => <span className="mono small-note">{r.result}</span> },
  ];

  return (
    <div className="screen-fill ob-page">
      <PageHeader
        title="Forms received"
        subtitle="Every paper on your desk: customer forms from Sales (typed in by you), and the delivery challans Stores recorded (each billed by one invoice)."
        actions={<SegmentedControl label="Show" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'onboarding', label: 'Party forms' }, { value: 'sales', label: 'Challans' }]} />}
      />
      <DataTable columns={cols} rows={rows} rowKey={(r) => r.key} onRowClick={(r) => (r.task === 'onboarding' ? app.navigate('onboarding', r.id) : app.openVoucher(r.id))} defaultSort={{ key: 'at', dir: 'desc' }} />
    </div>
  );
}
