// "Stored in PostgreSQL": the engine's tables as they are in the database NOW (read back, not the app's memory),
// the last saves (accepted or refused, with the constraint that refused), and the status pill for the top bar.
import { useEffect, useState } from 'react';
import { Database, RefreshCw } from 'lucide-react';
import { Button, Callout, DataTable, StatusPill, type Column } from '../ui';
import { fetchRows, fetchTables, saveNow, useDb, type SaveInfo, type TableInfo } from './sync';

const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');

/** Top bar: where the data is and whether the last change reached it. */
export function DbPill() {
  const d = useDb();
  const tone = d.state === 'saved' ? 'success' : d.state === 'saving' || d.state === 'connecting' ? 'info' : d.state === 'refused' ? 'critical' : 'warning';
  const text =
    d.state === 'saved' ? `Saved to PostgreSQL${d.savedAt ? ` ${time(d.savedAt)}` : ''}`
    : d.state === 'saving' ? 'Saving…'
    : d.state === 'connecting' ? 'Connecting…'
    : d.state === 'refused' ? 'Database refused the last change'
    : 'Not saved: no database';
  return (
    <span title={[d.url, d.message, d.constraint && `constraint: ${d.constraint}`].filter(Boolean).join('\n')}>
      <StatusPill tone={tone}>
        <Database size={14} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} />
        {text}
      </StatusPill>
    </span>
  );
}

const cell = (v: unknown) => (v === null || v === undefined ? <span className="subtle">NULL</span> : typeof v === 'object' ? JSON.stringify(v) : String(v));

export function DatabasePanel() {
  const d = useDb();
  const [info, setInfo] = useState<{ tables: TableInfo[]; saves: SaveInfo[] } | null>(null);
  const [table, setTable] = useState('fin.journal_line');
  const [data, setData] = useState<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setInfo(await fetchTables());
      setData(await fetchRows(table));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
    // read again after each save
  }, [table, d.savedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const filled = info?.tables.filter((t) => t.rows).length ?? 0;
  const cols: Column<Record<string, unknown>>[] = (data?.columns ?? []).map((k) => ({ key: k, header: k, render: (r) => cell(r[k]) }));
  const groups = ['pc', 'fin', 'inv'];

  return (
    <section className="section">
      <div className="ob-backend__bar">
        <h3 className="section__title">Stored in PostgreSQL (live)</h3>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <DbPill />
          <Button icon={RefreshCw} onClick={() => void load()}>
            Read again
          </Button>
        </span>
      </div>
      {d.state === 'offline' && (
        <Callout tone="warning" title="No database: the app works in this browser only">
          {d.message} · Start it: <code>npm run db:start</code> (the first time: <code>npm run db:init</code>), then reload.
        </Callout>
      )}
      {d.state === 'refused' && (
        <Callout tone="critical" title={`The database refused the last change${d.constraint ? `: ${d.constraint}` : ''}`}>
          {d.message} · Nothing of that change was written; the database keeps the last accepted state.{' '}
          <Button onClick={() => void saveNow()}>Try again</Button>
        </Callout>
      )}
      <p className="subtle small-note">
        {d.url ?? ''} · the engine&apos;s schema (customer_onboarding_schema.dbml, rev 19: {info?.tables.length ?? '…'} tables, {filled} with rows). Every change in the app is saved here
        in one transaction; the database&apos;s own keys, checks and triggers decide. What you see below is read back from the database, not from the app.
      </p>
      {error && <Callout tone="critical">{error}</Callout>}
      <div className="ob-backend__bar">
        <select className="input ob-table-pick" value={table} onChange={(e) => setTable(e.target.value)} aria-label="Table">
          {groups.map((g) => (
            <optgroup key={g} label={g === 'pc' ? 'pc: Parties & Contacts (P&C’s, written as its stand-in)' : g === 'fin' ? 'fin: setup, customers, sales vouchers, the journal' : 'inv: inventory (stub)'}>
              {(info?.tables ?? []).filter((t) => t.name.startsWith(`${g}.`)).map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} · {t.rows} row{t.rows === 1 ? '' : 's'}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="subtle small-note">{info?.tables.find((t) => t.name === table)?.note}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <DataTable columns={cols} rows={data?.rows ?? []} rowKey={(r) => JSON.stringify(r)} empty={<span className="subtle">No rows yet.</span>} />
      </div>
      <h3 className="section__title" style={{ marginTop: 16 }}>Last saves</h3>
      <ol className="ob-log">
        {(info?.saves ?? []).map((s, i) => (
          <li key={i} className={`ob-log__item ob-log__item--${s.ok ? 'db' : 'event'}`}>
            <span className="ob-log__kind">{s.ok ? 'SAVED' : 'REFUSED'}</span>
            <span className="ob-log__main">
              <span className="ob-log__line">{s.ok ? `${Object.values(s.rows_written ?? {}).reduce((a, b) => a + b, 0)} rows written or checked` : s.error_constraint ?? s.error_code ?? 'refused'}</span>
              {!s.ok && <span className="ob-log__detail">{s.error}</span>}
            </span>
            <span className="ob-log__meta">{time(s.saved_at)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
