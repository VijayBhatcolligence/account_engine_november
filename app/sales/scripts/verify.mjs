// npm run verify [-- --fast]: every check before reporting (CLAUDE.md §6), one line each.
//   typecheck · tests · database end-to-end (db:e2e, RESETS the local demo data) · build
//   --fast: typecheck + tests only.   Exit code 1 if any step fails. Full logs: <tmp>/aikyat-verify/<step>.log
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fast = process.argv.includes('--fast');
const LOGS = join(tmpdir(), 'aikyat-verify');
mkdirSync(LOGS, { recursive: true });
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const steps = [
  { name: 'Typecheck', cmd: 'npm run -s typecheck', ok: (o, c) => c === 0, sum: (o) => (o.match(/error TS/g) ?? []).length ? `${(o.match(/error TS/g) ?? []).length} errors` : 'clean' },
  { name: 'Tests', cmd: 'npx vitest run', ok: (o, c) => c === 0, sum: (o) => (o.match(/Tests\s+(.+)/)?.[1] ?? '?').trim() },
  ...(fast ? [] : [
    { name: 'Database end-to-end (db:e2e)', cmd: 'npm run -s db:e2e', ok: (o, c) => c === 0 && /ALL SAVES BEHAVED/.test(o), sum: (o) => (/ALL SAVES BEHAVED/.test(o) ? 'ALL SAVES BEHAVED' : (o.match(/(\d+ FAILED)/)?.[1] ?? 'failed')) + ' (local demo data reset)' },
    { name: 'Build', cmd: 'npm run -s build', ok: (o, c) => c === 0, sum: (o) => (/built in/.test(o) ? 'built' : 'failed') },
  ]),
];
let bad = 0;
const rows = [];
for (const s of steps) {
  const t0 = Date.now();
  const r = spawnSync(s.cmd, { shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = strip(`${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  const file = join(LOGS, `${s.name.replace(/[^a-z]+/gi, '_')}.log`);
  writeFileSync(file, out);
  const pass = s.ok(out, r.status);
  if (!pass) bad++;
  const line = `${pass ? 'PASS' : 'FAIL'}  ${s.name.padEnd(30)} ${s.sum(out)}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`;
  rows.push(line);
  console.log(line);
  if (!pass) console.log(`      first lines of the error:\n${out.split('\n').filter((l) => /error|fail|✖|×|refused/i.test(l)).slice(0, 5).map((l) => `      ${l.trim()}`).join('\n')}\n      full log: ${file}`);
}
console.log(`\n${bad ? `${bad} FAILED` : 'ALL PASSED'}${fast ? ' (fast: typecheck + tests only)' : ''} · logs in ${LOGS}`);
process.exit(bad ? 1 : 0);
