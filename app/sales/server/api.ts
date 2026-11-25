// The backend's HTTP API (served by the same `npm run dev` as the app, under /api/db).
//   GET  /api/db/health          is the database there? which one (password hidden), how many tables
//   POST /api/db/setup           create the schema (out.sql) and the setup rows if missing
//   POST /api/db/reset           drop and rebuild everything (the app's "Reset the demo")
//   GET  /api/db/state           the app's last saved state (the app opens from it)
//   PUT  /api/db/state           save: the app's state → the schema's rows, one transaction (the database's checks decide)
//   GET  /api/db/tables          every table with its row count + the last saves
//   GET  /api/db/tables/:name    the rows of one table
import type { IncomingMessage, ServerResponse } from 'node:http';
import { health, loadState, rowsOf, saveState, setupDatabase, tables } from './admin';
import type { Snapshot } from './project';

let queue: Promise<unknown> = Promise.resolve();
/** Saves run one after the other: never two transactions writing the same rows at once. */
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
};

const body = (req: IncomingMessage) =>
  new Promise<string>((ok, fail) => {
    let b = '';
    req.on('data', (d) => (b += d));
    req.on('end', () => ok(b));
    req.on('error', fail);
  });

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/db')) return false;
  const path = url.pathname.slice('/api/db'.length) || '/';
  try {
    if (req.method === 'GET' && path === '/health') return send(res, 200, await health()), true;
    if (req.method === 'POST' && path === '/setup') return send(res, 200, await serial(() => setupDatabase())), true;
    if (req.method === 'POST' && path === '/reset') return send(res, 200, await serial(() => setupDatabase({ reset: true }))), true;
    if (req.method === 'GET' && path === '/state') return send(res, 200, await loadState()), true;
    if (req.method === 'PUT' && path === '/state') {
      const snap = JSON.parse(await body(req)) as Snapshot;
      const out = await serial(() => saveState(snap));
      return send(res, out.ok ? 200 : 422, out), true;
    }
    if (req.method === 'GET' && path === '/tables') return send(res, 200, await tables()), true;
    const m = path.match(/^\/tables\/([a-z_]+\.[a-z_]+)$/);
    if (req.method === 'GET' && m) return send(res, 200, await rowsOf(m[1], Number(url.searchParams.get('limit') ?? 100))), true;
    send(res, 404, { error: `no route ${req.method} ${url.pathname}` });
  } catch (e) {
    const err = e as { message: string; code?: string };
    send(res, 503, { ok: false, error: err.message, code: err.code });
  }
  return true;
}
