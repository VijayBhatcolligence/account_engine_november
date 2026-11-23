"""Manoj's whole engine schema as an interactive ER page, built the way his 'Vendor Customer ER' page is built
(same renderer: bands, crow's-foot links, detail panel, every table in full), with all data read from a PostgreSQL database.

Usage: python mk_er.py <backend dir with models.py + migrations, or "-"> <out.html> <template.html> [postgres url] [schemas, default pc,fin]
  Templates: er_tpl.html = Manoj's engine (manoj_engine_schema.dbml); er_tpl_customer.html = ours (customer_onboarding_schema.dbml,
  schemas pc,fin,inv). Table and column notes (COMMENT ON, from the .dbml Note) are shown where the database has them.
  url default: postgresql://tester@localhost:55432/manoj (the database Manoj's migrations 0001-0006 built, commit 923409b).
  For another schema: run its .dbml export on an empty database first, pass that url, and set SIDE, COLUMNS, BANDS and the
  header text in er_tpl.html for that schema. Then save the result twice: published artifact + local self-contained .html
  (wrap with <!doctype html>, <meta charset="utf-8">, viewport) and open it from disk to test (CLAUDE.md §4)."""
import json
import re
import sys
import ast
import glob
import psycopg

mdir, out = sys.argv[1], sys.argv[2]
con = psycopg.connect(sys.argv[4] if len(sys.argv) > 4 else 'postgresql://tester@localhost:55432/manoj')
q = lambda sql, *a: con.execute(sql, a).fetchall()
SCHEMAS = (sys.argv[5] if len(sys.argv) > 5 else 'pc,fin').split(',')

# his model docstrings (8 tables have one), by schema.table
DOC = {}
for f in ([] if mdir == '-' else glob.glob(f'{mdir}/capabilities/*/models.py')):
    tree = ast.parse(open(f, encoding='utf-8').read())
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            doc = ast.get_docstring(node)
            tn = sch = None
            for st in node.body:
                if isinstance(st, ast.Assign) and getattr(st.targets[0], 'id', '') == '__tablename__':
                    tn = st.value.value
                if isinstance(st, ast.Assign) and getattr(st.targets[0], 'id', '') == '__table_args__':
                    m = re.search(r"['\"]schema['\"]\s*:\s*['\"](\w+)['\"]", ast.unparse(st.value))
                    if m:
                        sch = m.group(1)
            if tn and doc:
                DOC[f'{sch or ("pc" if "parties" in f else "fin")}.{tn}'] = ' '.join(doc.split())

MIGRATION = {}
for f in ([] if mdir == '-' else glob.glob(f'{mdir}/migrations/versions/*.py')):
    src = open(f, encoding='utf-8').read()
    mig = re.search(r'_(\d{4})_', f).group(1)
    for m in re.finditer(r"create_table\(\s*['\"]([a-z_]+)['\"](.*?)schema\s*=\s*['\"]([a-z]+)['\"]", src, re.S):
        MIGRATION.setdefault(f'{m.group(3)}.{m.group(1)}', mig)
    for m in re.finditer(r"CREATE TABLE (?:IF NOT EXISTS )?([a-z]+)\.([a-z_]+)", src):
        MIGRATION.setdefault(f'{m.group(1)}.{m.group(2)}', mig)


def short(t):
    return t.replace('timestamp with time zone', 'timestamptz').replace('character varying', 'varchar').replace('numeric', 'numeric')


tables = []
for sch, name, oid in q("""select n.nspname, c.relname, c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace
                            where c.relkind = 'r' and n.nspname = any(%s) order by 1, 2""", SCHEMAS):
    tid = f'{sch}.{name}'
    cons = q("select conname, contype::text, pg_get_constraintdef(oid), conkey, confrelid::regclass::text, confkey from pg_constraint where conrelid = %s order by contype, conname", oid)
    att = {r[0]: r[1] for r in q("select attnum, attname from pg_attribute where attrelid = %s and attnum > 0", oid)}
    pk = [att[k] for c in cons if c[1] == 'p' for k in c[3]]
    fkcols = {att[k] for c in cons if c[1] == 'f' for k in c[3]} - {'workspace_id'}
    cols = []
    for an, ty, nn, df, gen in q("""select a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid), a.attgenerated
                                    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                                    where a.attrelid = %s and a.attnum > 0 and not a.attisdropped order by a.attnum""", oid):
        d = f'GENERATED: {df}' if gen else (f'default {df}' if df else '')
        note = q("select col_description(%s, attnum) from pg_attribute where attrelid = %s and attname = %s", oid, oid, an)[0][0]
        cols.append({'n': an, 't': short(ty), 'pk': an in pk, 'fk': an in fkcols, 'nul': not nn, 'd': d, 'note': note or ''})
    keys, checks, rels = [], [], []
    for cn, ct, cd, ck, ftab, fk in cons:
        if ct == 'p':
            keys.append(cd)
        elif ct == 'u':
            keys.append(f'{cn}: {cd}')
        elif ct == 'f':
            m = re.match(r'FOREIGN KEY \((.*?)\) REFERENCES ([a-z_.]+)\((.*?)\)(.*)$', cd)
            sc, tg, tc, rest = m.groups()
            tg = tg if '.' in tg else f'{sch}.{tg}'
            keys.append(f'FK ({sc}) → {tg}{(" " + rest.strip()) if rest.strip() else ""}')
            scs, tcs = sc.split(', '), tc.split(', ')
            i = next((j for j, x in enumerate(scs) if x != 'workspace_id'), 0)
            rels.append({'from': tid, 'fc': scs[i], 'to': tg, 'tc': tcs[i], 'kind': 'pc' if tg.startswith('pc.') else 'fin', 'name': cn, 'composite': len(scs) > 1, 'cols': sc})
        elif ct == 'c':
            checks.append(f"{cn}: {re.sub(r'^CHECK \((.*)\)$', r'\1', cd, flags=re.S)}")
        elif ct == 'x':
            checks.append(f'{cn}: {cd}')
    idx = [f'{i}: {d.split(" USING ")[1]}' for i, d in q("""select i.relname, pg_get_indexdef(ix.indexrelid) from pg_index ix join pg_class i on i.oid = ix.indexrelid
                     where ix.indrelid = %s and not exists (select 1 from pg_constraint k where k.conindid = ix.indexrelid) order by 1""", oid)]
    trg = [re.sub(r'^CREATE (CONSTRAINT )?TRIGGER \S+ ', '', d).replace(f' ON {tid}', '') for n, d in q(
        "select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid = %s and not tgisinternal order by tgname", oid)]
    trg = [f'{n}: {d}' for (n, _), d in zip(q("select tgname, 1 from pg_trigger where tgrelid = %s and not tgisinternal order by tgname", oid), trg)]
    rows = con.execute(f'select count(*) from {tid}').fetchone()[0]
    tables.append({'id': tid, 'schema': sch, 'name': name, 'mig': MIGRATION.get(tid, '?'), 'doc': DOC.get(tid) or q('select obj_description(%s, %s)', oid, 'pg_class')[0][0] or '', 'cols': cols,
                   'keys': keys, 'checks': checks, 'indexes': idx, 'triggers': trg, 'rows': rows, 'rels': rels})

fns = [{'name': n, 'args': a, 'lang': l, 'body': b} for n, a, l, b in q(
    """select n.nspname || '.' || p.proname, pg_get_function_identity_arguments(p.oid), l.lanname, pg_get_functiondef(p.oid)
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang where n.nspname = any(%s) order by 1""", SCHEMAS)]
counts = {
    'tables': len(tables), **{sc: sum(t['schema'] == sc for t in tables) for sc in SCHEMAS},
    'columns': sum(len(t['cols']) for t in tables), 'fks': sum(len(t['rels']) for t in tables),
    'checks': sum(sum(not c.split(':')[1].strip().startswith('EXCLUDE') for c in t['checks']) for t in tables),
    'exclude': sum(sum(c.split(':')[1].strip().startswith('EXCLUDE') for c in t['checks']) for t in tables),
    'unique': q("select count(*) from pg_constraint where contype = 'u' and connamespace::regnamespace::text = any(%s)", SCHEMAS)[0][0],
    'triggers': sum(len(t['triggers']) for t in tables), 'functions': len(fns), 'docs': sum(1 for t in tables if t['doc']),
    'seeded': sum(1 for t in tables if t['rows']), 'notes': sum(1 for t in tables for c in t['cols'] if c['note']),
    'unique_idx': q("""select count(*) from pg_index ix join pg_class c on c.oid = ix.indrelid where ix.indisunique and not ix.indisprimary
                     and c.relnamespace::regnamespace::text = any(%s) and not exists (select 1 from pg_constraint k where k.conindid = ix.indexrelid)""", SCHEMAS)[0][0],
}
data = {'tables': tables, 'functions': fns, 'counts': counts}
tpl = open(sys.argv[3], encoding='utf-8').read()
html = tpl.replace('/*__DATA__*/null', json.dumps(data, ensure_ascii=False).replace('</', '<\\/'))
for k, v in counts.items():
    html = html.replace('{{' + k + '}}', str(v))
open(out, 'w', encoding='utf-8').write(html)
print(counts, len(html))
