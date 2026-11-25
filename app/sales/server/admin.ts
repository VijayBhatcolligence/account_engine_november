// Setting the database up, reading it back, and the app's saved state.
// The schema is NOT copied: it is the engine's own out.sql (docs/sales/sales_engine/out.sql, rev 17), run as it is.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { APP_DIR, DATABASE_URL, db, SAFE_URL, tx } from './db';
import { project, type Counts, type Snapshot } from './project';
import { seedReference } from './reference';

export const SCHEMA_FILE = join(APP_DIR, '..', '..', 'docs', 'sales', 'sales_engine', 'out.sql');
const SCHEMAS = ['pc', 'fin', 'inv'];

/** The app's own state (what it shows: drafts, notices, the log), so a reload or another browser opens where you left off. */
const DEMO_SQL = `
CREATE SCHEMA IF NOT EXISTS demo;
CREATE TABLE IF NOT EXISTS demo.app_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  onboarding jsonb NOT NULL, sales jsonb NOT NULL, saved_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS demo.save_log (
  save_id bigserial PRIMARY KEY, saved_at timestamptz NOT NULL DEFAULT now(), ok boolean NOT NULL,
  rows_written jsonb, error text, error_code text, error_constraint text);
COMMENT ON SCHEMA demo IS 'The demo app''s own state (not the engine''s schema): the last saved app state and every save''s outcome.';`;

/** Create the database if it does not exist (a local or Docker server; Supabase's already does). */
async function ensureDatabase() {
  const url = new URL(DATABASE_URL);
  const name = decodeURIComponent(url.pathname.slice(1));
  try {
    const c = new pg.Client({ connectionString: DATABASE_URL });
    await c.connect();
    await c.end();
  } catch (e) {
    if ((e as { code?: string }).code !== '3D000') throw e;
    url.pathname = '/postgres';
    const c = new pg.Client({ connectionString: url.toString() });
    await c.connect();
    await c.query(`CREATE DATABASE "${name.replace(/"/g, '')}"`);
    await c.end();
  }
}

async function schemaExists() {
  const { rows } = await db().query(`SELECT to_regclass('fin.account_determination') IS NOT NULL AS ok`);
  return rows[0].ok as boolean;
}

/** Schema (out.sql) + the demo tables + the setup rows. reset: drop everything first. */
export async function setupDatabase(opts: { reset?: boolean } = {}) {
  await ensureDatabase();
  const c = await db().connect();
  try {
    if (opts.reset) await c.query(`DROP SCHEMA IF EXISTS ${[...SCHEMAS, 'demo'].join(', ')} CASCADE`);
    if (!(await schemaExists())) {
      if (!existsSync(SCHEMA_FILE)) throw new Error(`schema file not found: ${SCHEMA_FILE}`);
      await c.query(readFileSync(SCHEMA_FILE, 'utf8'));
    }
    await c.query(DEMO_SQL);
  } finally {
    c.release();
  }
  await tx((t) => seedReference(t));
  return health();
}

export async function health() {
  try {
    const { rows } = await db().query(`SELECT current_database() AS database, split_part(version(), ' ', 2) AS version,
      (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = ANY($1) AND table_type = 'BASE TABLE') AS tables,
      to_regclass('demo.app_state') IS NOT NULL AS ready`, [SCHEMAS]);
    return { ok: true, url: SAFE_URL, ...rows[0] };
  } catch (e) {
    return { ok: false, url: SAFE_URL, error: (e as Error).message, code: (e as { code?: string }).code };
  }
}

/** Every table of the engine's schema with its row count. */
export async function tables() {
  const { rows } = await db().query(`SELECT table_schema || '.' || table_name AS name, obj_description((table_schema || '.' || table_name)::regclass) AS note
    FROM information_schema.tables WHERE table_schema = ANY($1) AND table_type = 'BASE TABLE' ORDER BY 1`, [SCHEMAS]);
  const out = [];
  for (const r of rows) {
    const { rows: n } = await db().query(`SELECT count(*)::int AS n FROM ${r.name.split('.').map((x: string) => `"${x}"`).join('.')}`);
    out.push({ name: r.name, rows: n[0].n, note: (r.note ?? '').split('\n')[0].slice(0, 160) });
  }
  const { rows: saves } = await db().query(`SELECT saved_at, ok, rows_written, error, error_code, error_constraint FROM demo.save_log ORDER BY save_id DESC LIMIT 10`);
  return { tables: out, saves };
}

/** The rows of one table, newest first where it has a time. */
export async function rowsOf(name: string, limit = 100) {
  const { rows: ok } = await db().query(`SELECT 1 FROM information_schema.tables WHERE table_schema || '.' || table_name = $1 AND table_schema = ANY($2)`, [name, SCHEMAS]);
  if (!ok.length) throw new Error(`no such table: ${name}`);
  const { rows: cols } = await db().query(`SELECT column_name FROM information_schema.columns WHERE table_schema || '.' || table_name = $1 ORDER BY ordinal_position`, [name]);
  const names = cols.map((c) => c.column_name as string);
  const order = ['recorded_at', 'posted_at', 'submitted_at', 'updated_at', 'created_at'].find((c) => names.includes(c));
  const { rows } = await db().query(`SELECT * FROM ${name.split('.').map((x) => `"${x}"`).join('.')} ${order ? `ORDER BY "${order}" DESC NULLS LAST` : ''} LIMIT ${Math.min(500, limit)}`);
  return { name, columns: names, rows };
}

export async function loadState() {
  const { rows } = await db().query('SELECT onboarding, sales, saved_at FROM demo.app_state WHERE id = 1');
  return rows[0] ?? null;
}

/** One save: the app's state → the schema's rows + the app state, in ONE transaction. Refused → nothing written, the reason kept. */
export async function saveState(snap: Snapshot): Promise<{ ok: true; rows: Counts; savedAt: string } | { ok: false; error: string; code?: string; constraint?: string; detail?: string }> {
  try {
    const rows = await tx(async (c) => {
      const counts = await project(c, snap);
      await c.query(`INSERT INTO demo.app_state (id, onboarding, sales, saved_at) VALUES (1, $1, $2, now())
        ON CONFLICT (id) DO UPDATE SET onboarding = EXCLUDED.onboarding, sales = EXCLUDED.sales, saved_at = now()`, [JSON.stringify(snap.onboarding), JSON.stringify(snap.sales)]);
      return counts;
    });
    await db().query('INSERT INTO demo.save_log (ok, rows_written) VALUES (true, $1)', [JSON.stringify(rows)]);
    return { ok: true, rows, savedAt: new Date().toISOString() };
  } catch (e) {
    const err = e as { message: string; code?: string; constraint?: string; detail?: string; table?: string };
    await db().query('INSERT INTO demo.save_log (ok, error, error_code, error_constraint) VALUES (false, $1, $2, $3)', [err.message, err.code ?? null, err.constraint ?? null]).catch(() => undefined);
    return { ok: false, error: err.message, code: err.code, constraint: err.constraint, detail: err.detail ?? err.table };
  }
}
