// npm run db:<command>  (runs with vite-node, so it reuses the backend's TypeScript)
//   init    create a PostgreSQL cluster on THIS computer (outside OneDrive), start it, create the database, schema and setup rows
//   start   start that local cluster            stop    stop it
//   setup   create the schema + setup rows on DATABASE_URL if missing (any server: local, Docker, Supabase)
//   reset   drop and rebuild everything on DATABASE_URL
//   status  where the data is, and how many rows each table holds
// The local cluster: %LOCALAPPDATA%\aikyat-ae\pgdata, port 55440, user aikyat, local connections only. PostgreSQL itself must be
// installed (it is: C:\Program Files\PostgreSQL\18). Another PostgreSQL bin folder: set PG_BIN.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DATABASE_URL, db, LOCAL_URL, SAFE_URL } from '../server/db';
import { health, setupDatabase, tables } from '../server/admin';

const ROOT = join(process.env.LOCALAPPDATA ?? join(homedir(), '.local', 'share'), 'aikyat-ae');
const DATA = join(ROOT, 'pgdata');
const LOG = join(ROOT, 'postgres.log');
const PORT = '55440';

function pgBin(tool: string) {
  const dirs = [process.env.PG_BIN, ...['18', '17', '16'].map((v) => `C:\\Program Files\\PostgreSQL\\${v}\\bin`)].filter(Boolean) as string[];
  for (const d of dirs) {
    const f = join(d, process.platform === 'win32' ? `${tool}.exe` : tool);
    if (existsSync(f)) return f;
  }
  return tool; // on PATH
}
const run = (tool: string, args: string[]) => {
  const r = spawnSync(pgBin(tool), args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (r.error) throw r.error;
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
};
const isLocal = DATABASE_URL === LOCAL_URL;
const running = () => run('pg_ctl', ['-D', DATA, 'status']).ok;

function start() {
  if (!existsSync(DATA)) throw new Error(`no local cluster yet: run  npm run db:init`);
  if (running()) return console.log(`PostgreSQL already running (port ${PORT}, ${DATA})`);
  // stdio ignored: the server keeps running after pg_ctl returns and must not hold this script's output open.
  const r = spawnSync(pgBin('pg_ctl'), ['-D', DATA, '-l', LOG, '-o', `-p ${PORT} -c listen_addresses=localhost`, '-w', 'start'], { stdio: 'ignore', windowsHide: true });
  if (r.status !== 0) throw new Error(`PostgreSQL did not start: see ${LOG}`);
  console.log(`PostgreSQL started (port ${PORT}, data ${DATA})`);
}

async function printStatus() {
  const h = await health();
  console.log(`database: ${SAFE_URL}`);
  if (!h.ok) return console.log(`not reachable: ${'error' in h ? h.error : ''}${isLocal ? '\n→ npm run db:start (or db:init the first time)' : ''}`);
  console.log(`PostgreSQL ${h.version} · ${h.database} · ${h.tables} tables${h.ready ? '' : ' · not set up: npm run db:setup'}`);
  if (!h.ready) return;
  const t = await tables();
  for (const x of t.tables) if (x.rows) console.log(`  ${x.name.padEnd(36)} ${String(x.rows).padStart(5)}`);
  console.log(`  (${t.tables.filter((x) => !x.rows).length} tables empty)`);
}

const cmd = process.argv[2];
try {
  if (cmd === 'init') {
    if (!isLocal) throw new Error(`DATABASE_URL points elsewhere (${SAFE_URL}): init only makes the local cluster. Use db:setup.`);
    if (!existsSync(DATA)) {
      mkdirSync(ROOT, { recursive: true });
      const r = run('initdb', ['-D', DATA, '-U', 'aikyat', '--auth=trust', '-E', 'UTF8', '--locale=C']);
      if (!r.ok) throw new Error(r.out);
      console.log(`cluster created: ${DATA}`);
    }
    start();
    console.log(JSON.stringify(await setupDatabase()));
  } else if (cmd === 'start') start();
  else if (cmd === 'stop') console.log(run('pg_ctl', ['-D', DATA, '-m', 'fast', 'stop']).out);
  else if (cmd === 'setup') console.log(JSON.stringify(await setupDatabase()));
  else if (cmd === 'reset') console.log(JSON.stringify(await setupDatabase({ reset: true })));
  else if (cmd === 'status') await printStatus();
  else console.log('usage: npm run db:init | db:start | db:stop | db:setup | db:reset | db:status');
} catch (e) {
  console.error(`✖ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await db().end().catch(() => undefined);
}
