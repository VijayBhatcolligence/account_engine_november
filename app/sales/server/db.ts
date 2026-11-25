// The database connection. ONE setting decides where the data lives: DATABASE_URL.
//   local (today):  postgresql://aikyat@localhost:55440/aikyat_ae   (npm run db:init → a PostgreSQL cluster on this machine)
//   Docker (later): postgresql://aikyat:aikyat@localhost:5432/aikyat_ae   (docker compose up -d)
//   Supabase (later): the project's connection string (Settings → Database), with ?sslmode=require
// Read from the environment, or from app/sales/.env.local (not committed), else the local default.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LOCAL_URL = 'postgresql://aikyat@localhost:55440/aikyat_ae';

function fromEnvFile(key: string): string | undefined {
  const f = join(APP_DIR, '.env.local');
  if (!existsSync(f)) return undefined;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, '');
  }
  return undefined;
}

export const DATABASE_URL = process.env.DATABASE_URL ?? fromEnvFile('DATABASE_URL') ?? LOCAL_URL;
/** The URL without its password, to show on screen. */
export const SAFE_URL = DATABASE_URL.replace(/:\/\/([^:@/]+):[^@]*@/, '://$1:***@');

let pool: pg.Pool | null = null;
export const db = () => (pool ??= new pg.Pool({ connectionString: DATABASE_URL, max: 4 }));

/** One transaction: every write of a save, or none (the database's checks and keys decide). */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await db().connect();
  try {
    await c.query('BEGIN');
    await c.query('SET CONSTRAINTS ALL DEFERRED'); // all our foreign keys are DEFERRABLE: checked at COMMIT, in any insert order
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

/** A stable uuid for an app id ("SV-0012", "ACC-1201", "teja" …): the same id always gives the same row. */
export function uid(kind: string, key: string): string {
  const h = createHash('md5').update(`aikyat:${kind}:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const WS = 'aikyat-biscuits';

type Row = Record<string, unknown>;
const q = (n: string) => n.split('.').map((p) => `"${p}"`).join('.');

/** INSERT … ON CONFLICT (key) DO UPDATE: a row the app changed is updated in place, never duplicated. */
export async function upsert(c: pg.PoolClient, table: string, row: Row, key: string[]) {
  const cols = Object.keys(row);
  const set = cols.filter((k) => !key.includes(k));
  const sql = `INSERT INTO ${q(table)} (${cols.map((k) => `"${k}"`).join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
    ON CONFLICT (${key.map((k) => `"${k}"`).join(', ')}) ${set.length ? `DO UPDATE SET ${set.map((k) => `"${k}" = EXCLUDED."${k}"`).join(', ')}` : 'DO NOTHING'}`;
  await c.query(sql, cols.map((k) => row[k]));
}

/** INSERT … ON CONFLICT DO NOTHING: for append-only rows (history, the journal): written once, never changed. */
export async function insertOnce(c: pg.PoolClient, table: string, row: Row, key: string[]) {
  const cols = Object.keys(row);
  await c.query(
    `INSERT INTO ${q(table)} (${cols.map((k) => `"${k}"`).join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) ON CONFLICT (${key.map((k) => `"${k}"`).join(', ')}) DO NOTHING`,
    cols.map((k) => row[k]),
  );
}
