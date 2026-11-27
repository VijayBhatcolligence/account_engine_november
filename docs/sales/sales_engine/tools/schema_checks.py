"""Schema release checks 3, 4 and 7 by script (CLAUDE.md §3 "Before a task's schema is released"; .claude/skills/schema-release).

Usage:  python schema_checks.py <postgres url> [--schemas pc,fin,inv] [--twin "<Business Engine ER_manoj_full.html>"]
  The database must be built from out.sql on an empty database first (er-page skill, step 2). Read only: it changes nothing.

  7  counts      tables, columns, foreign keys, CHECKs, EXCLUDE, triggers, functions, indexes (from the catalog)
  4  links       every *_id / *_contact_id column that is not in a foreign key of its table (and is not the table's own key)
  3  twin diff   our tables vs Manoj's twins, column by column and check by check. His side is read from the DATA object of
                 his ER page (itself read from his database by mk_er.py), never from text; names mapped vendor -> customer.
Each difference printed is to be listed as "deliberate (why)" or fixed. The script does not judge.
"""
import argparse
import json
import re
import sys

import psycopg

# our table -> his twin; then the words that differ on the customer side
TWINS = {
    'fin.sales_invoice': 'fin.purchase_invoice',
    'fin.sales_invoice_line': 'fin.purchase_invoice_line',
    'fin.sales_invoice_history': 'fin.purchase_invoice_history',
    'fin.journal_entry': 'fin.journal_entry',
    'fin.journal_line': 'fin.journal_line',
    'fin.debtor_account': 'fin.creditor_account',
    'fin.debtor_account_history': 'fin.creditor_account_history',
    'fin.debtor_category': 'fin.creditor_category',
    'fin.debtor_tax_registration': 'fin.creditor_tax_registration',
    'fin.customer_request': 'fin.vendor_request',
    'fin.customer_request_history': 'fin.vendor_request_history',
    'fin.branch': 'fin.branch',
    'fin.fiscal_year': 'fin.fiscal_year',
    'fin.document_sequence': 'fin.document_sequence',
    'fin.ledger_account': 'fin.ledger_account',
    'fin.party_bank_account': 'fin.party_bank_account',
}
WORDS = [('purchase_invoice', 'sales_invoice'), ('creditor', 'debtor'), ('vendor', 'customer')]


def ours_name(his):
    for a, b in WORDS:
        his = his.replace(a, b)
    return his


def norm_check(name, expr):
    """A check compared by its expression, his names mapped to ours, spacing and casts ignored."""
    e = ours_name(expr)
    e = re.sub(r'::[a-z ]+(\[\])?', '', e)
    e = re.sub(r'[\s()]', '', e)
    return e


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('url')
    ap.add_argument('--schemas', default='pc,fin,inv')
    ap.add_argument('--twin')
    a = ap.parse_args()
    sch = a.schemas.split(',')
    con = psycopg.connect(a.url)
    q = lambda sql, *p: con.execute(sql, p).fetchall()

    # 7 · counts
    c = q("""SELECT
      (SELECT count(*) FROM information_schema.tables WHERE table_schema = ANY(%s) AND table_type = 'BASE TABLE'),
      (SELECT count(*) FROM information_schema.columns c JOIN information_schema.tables t USING (table_schema, table_name)
        WHERE c.table_schema = ANY(%s) AND t.table_type = 'BASE TABLE'),
      (SELECT count(*) FROM pg_constraint k JOIN pg_namespace n ON n.oid = k.connamespace WHERE n.nspname = ANY(%s) AND contype = 'f'),
      (SELECT count(*) FROM pg_constraint k JOIN pg_namespace n ON n.oid = k.connamespace WHERE n.nspname = ANY(%s) AND contype = 'c'),
      (SELECT count(*) FROM pg_constraint k JOIN pg_namespace n ON n.oid = k.connamespace WHERE n.nspname = ANY(%s) AND contype = 'x'),
      (SELECT count(*) FROM pg_trigger g JOIN pg_class r ON r.oid = g.tgrelid JOIN pg_namespace n ON n.oid = r.relnamespace
        WHERE n.nspname = ANY(%s) AND NOT g.tgisinternal),
      (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = ANY(%s)),
      (SELECT count(*) FROM pg_indexes WHERE schemaname = ANY(%s))""", *([sch] * 8))[0]
    print('7 · counts: tables %d · columns %d · foreign keys %d · CHECKs %d · EXCLUDE %d · triggers %d · functions %d · indexes %d' % c)

    # 4 · links
    rows = q("""SELECT n.nspname || '.' || r.relname, a.attname
      FROM pg_attribute a JOIN pg_class r ON r.oid = a.attrelid JOIN pg_namespace n ON n.oid = r.relnamespace
     WHERE n.nspname = ANY(%s) AND r.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped AND a.attname LIKE '%%\\_id'
       AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = r.oid AND k.contype = 'f' AND a.attnum = ANY(k.conkey))
       AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = r.oid AND k.contype = 'p' AND a.attnum = ANY(k.conkey))
     ORDER BY 1, 2""", sch)
    print('\n4 · links: %d *_id columns without a foreign key (each needs a stated reason)' % len(rows))
    for t, col in rows:
        print('   %s.%s' % (t, col))

    # 3 · twin diff
    if a.twin:
        h = open(a.twin, encoding='utf-8').read()
        i = h.index('const DATA = ') + len('const DATA = ')
        his = {t['id']: t for t in json.JSONDecoder().raw_decode(h[i:])[0]['tables']}
        print('\n3 · twin diff (ours vs Manoj\'s, names mapped %s)' % ', '.join('%s->%s' % w for w in WORDS))
        total = 0
        for ours, theirs in TWINS.items():
            if theirs not in his:
                print('   %s: his twin %s not in his page' % (ours, theirs))
                continue
            oc = [r[0] for r in q("""SELECT column_name FROM information_schema.columns WHERE table_schema || '.' || table_name = %s
                                     ORDER BY ordinal_position""", ours)]
            if not oc:
                print('   %s: not in our database' % ours)
                continue
            hc = [ours_name(col['n']) for col in his[theirs]['cols']]
            ock = {norm_check(n, d): n for n, d in q("""SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
                                                         WHERE conrelid = %s::regclass AND contype = 'c'""", ours)}
            hck = {}
            for s in his[theirs].get('checks', []):
                n, _, d = s.partition(': ')
                hck[norm_check(n, 'CHECK ' + d)] = ours_name(n)
            only_o = [x for x in oc if x not in hc]
            only_h = [x for x in hc if x not in oc]
            ck_o = sorted(v for k, v in ock.items() if k not in hck)
            ck_h = sorted(v for k, v in hck.items() if k not in ock)
            total += len(only_o) + len(only_h) + len(ck_o) + len(ck_h)
            print('   %s <-> %s: columns ours only %d, his only %d; checks ours only %d, his only %d'
                  % (ours, theirs, len(only_o), len(only_h), len(ck_o), len(ck_h)))
            for lbl, xs in (('cols ours only', only_o), ('cols his only', only_h), ('checks ours only', ck_o), ('checks his only', ck_h)):
                if xs:
                    print('      %s: %s' % (lbl, ', '.join(xs)))
        print('   differences in all: %d' % total)


if __name__ == '__main__':
    sys.exit(main())
