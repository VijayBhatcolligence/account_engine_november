// The app ↔ its backend. The app's rules run as before; its data now lives in PostgreSQL:
//   start  → the app opens from the database's last saved state (another browser, a reload: the same data)
//   change → 0.7 s after the last change, the whole state is saved: the backend writes the schema's rows in one transaction
//            and the database's own checks decide (a refusal is shown, nothing of that save is written)
//   no database → the app still works (as before, in this browser only) and says so; it saves when the database is back.
import { create } from 'zustand';
import { useOnboarding } from '../onboarding/store';
import { useSales } from '../sales/store';

export type DbState = 'connecting' | 'saving' | 'saved' | 'refused' | 'offline';
export interface DbStatus {
  state: DbState;
  /** Last successful save (ISO). */
  savedAt?: string;
  /** Why the last save was refused, or why the database cannot be reached. */
  message?: string;
  constraint?: string;
  rows?: Record<string, number>;
  url?: string;
  database?: string;
}
export const useDb = create<DbStatus>(() => ({ state: 'connecting' }));

const API = '/api/db';
const onboardingSlice = () => {
  const s = useOnboarding.getState();
  return { now: s.now, parties: s.parties, accounts: s.accounts, requests: s.requests, log: s.log, notices: s.notices, nav: s.nav };
};
const salesSlice = () => {
  const s = useSales.getState();
  return { vouchers: s.vouchers, journal: s.journal, lots: s.lots, costMethod: s.costMethod, returns: s.returns, returnStock: s.returnStock, held: s.held };
};
/** What a save is about: the data, not where you are looking (nav) — moving between screens never saves. */
const fingerprint = () => {
  const { nav: _nav, ...o } = onboardingSlice();
  return JSON.stringify([o, salesSlice()]);
};

let applying = false;
let lastSaved = '';
let timer: ReturnType<typeof setTimeout> | undefined;
let started = false;

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const r = await fetch(`${API}${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: (await r.json()) as T };
}

export async function saveNow() {
  clearTimeout(timer);
  const print = fingerprint();
  useDb.setState({ state: 'saving' });
  try {
    const { status, data } = await call<{ ok: boolean; rows?: Record<string, number>; savedAt?: string; error?: string; constraint?: string; code?: string }>('PUT', '/state', {
      onboarding: onboardingSlice(),
      sales: salesSlice(),
    });
    if (data.ok) {
      lastSaved = print;
      useDb.setState({ state: 'saved', savedAt: data.savedAt, rows: data.rows, message: undefined, constraint: undefined });
    } else if (status === 422) useDb.setState({ state: 'refused', message: data.error, constraint: data.constraint ?? data.code });
    else useDb.setState({ state: 'offline', message: data.error ?? `HTTP ${status}` });
  } catch (e) {
    useDb.setState({ state: 'offline', message: (e as Error).message });
  }
}

const schedule = () => {
  if (applying || !started) return;
  if (fingerprint() === lastSaved) return;
  clearTimeout(timer);
  timer = setTimeout(() => void saveNow(), 700);
};

/** Open from the database (if it has a saved state), then save every change. Call once, at start. */
export async function startSync() {
  try {
    const { data: h } = await call<{ ok: boolean; ready?: boolean; url?: string; database?: string; error?: string }>('GET', '/health');
    useDb.setState({ url: h.url, database: h.database });
    if (!h.ok) throw new Error(`${h.error ?? 'not reachable'} · start it: npm run db:start`);
    if (!h.ready) await call('POST', '/setup');
    const { data: saved } = await call<{ onboarding: object; sales: object } | null>('GET', '/state');
    if (saved) {
      applying = true;
      useOnboarding.setState(saved.onboarding as never);
      useSales.setState(saved.sales as never);
      applying = false;
      lastSaved = fingerprint();
      useDb.setState({ state: 'saved', savedAt: undefined, message: 'Opened from the database' });
    }
    started = true;
    if (!saved) await saveNow();
  } catch (e) {
    started = true; // work on in this browser; the next change tries to save again
    useDb.setState({ state: 'offline', message: (e as Error).message });
  }
}
useOnboarding.subscribe(schedule);
useSales.subscribe(schedule);

/** The demo's "Start again": rebuild the database (schema + setup rows), then save the app's fresh state into it. */
export async function resetDatabase() {
  useDb.setState({ state: 'saving', message: 'Rebuilding the database…' });
  try {
    await call('POST', '/reset');
    lastSaved = '';
    await saveNow();
  } catch (e) {
    useDb.setState({ state: 'offline', message: (e as Error).message });
  }
}

export interface TableInfo { name: string; rows: number; note: string }
export interface SaveInfo { saved_at: string; ok: boolean; rows_written: Record<string, number> | null; error: string | null; error_code: string | null; error_constraint: string | null }
export const fetchTables = () => call<{ tables: TableInfo[]; saves: SaveInfo[] }>('GET', '/tables').then((r) => r.data);
export const fetchRows = (name: string) => call<{ name: string; columns: string[]; rows: Record<string, unknown>[] }>('GET', `/tables/${name}?limit=200`).then((r) => r.data);
