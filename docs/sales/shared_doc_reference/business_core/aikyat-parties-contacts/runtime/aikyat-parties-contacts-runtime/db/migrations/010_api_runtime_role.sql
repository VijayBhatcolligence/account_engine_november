-- 010 · The api's database role, and every grant it holds.
--
-- A cell's Postgres arrives holding only its superuser; the platform creates
-- no role for any product (platform team, 2026-10-15). Each product makes its
-- own, as Aikyat Time and Aikyat Mail do, so that the running service is NOT
-- the superuser and NOT the owner of its tables. Both matter here:
--
--   a superuser, or any role with BYPASSRLS, ignores row-level security,
--   forced or not -- see 002 -- and
--
--   a table's OWNER may switch its row-level security off. So the role that
--   owns the schema (the migrator) must not be the role that serves requests.
--
-- So there are three roles, and only one of them is made here:
--
--   aikyat_parties_contacts_migrator     LOGIN, owns the database and runs
--                                        the migrations. Created by the cell
--                                        bootstrap, scripts/bootstrap_cell_
--                                        database.py, which holds its password.
--   aikyat_parties_contacts_api          LOGIN, the running service. Created
--                                        by the same bootstrap, as a MEMBER of
--                                        the role below, and nothing more.
--   aikyat_parties_contacts_api_runtime  NOLOGIN, made HERE. Holds every
--                                        privilege the service needs.
--
-- The login roles carry passwords, so they cannot live in a committed
-- migration. This one carries none, grants only to a role it makes itself, and
-- so runs the same everywhere: in a cell as the migrator, and in the test
-- suite as the server's superuser. Roles belong to the cluster, not the
-- database, so it is created only if it is not there yet.
--
-- ── the grants ───────────────────────────────────────────────────────────────
--
-- Written per table and per statement, from what the code actually does, as
-- Aikyat Time writes its own:
--
--   sync_apply.py   inserts anchors; inserts and updates parties, contacts,
--                   routes and principal bindings; inserts operated parties;
--                   reads what it updates. It never deletes.
--   directory.py    reads contacts, routes and principal bindings.
--   readiness.py    reads the migration ledger, for /readyz.
--
-- And what the triggers on those tables read, because a trigger runs with
-- the privileges of whoever fired it: anchor_has_its_required_facet reads
-- private_anchor, party and contact whenever an anchor is inserted, and
-- require_contact_kind reads contact for a principal binding. That is why the
-- service may read private_anchor although its code never does. Found by
-- running the suite as this role, not by reading the code.
--
-- NO ALTER DEFAULT PRIVILEGES, deliberately. It would hand every future table
-- to the service automatically; a grant nobody decided is a hole. A new table
-- gets no grant until a migration writes one, and evals/test_database_roles.py
-- fails the moment the schema holds a table its matrix does not name.
--
-- Nothing in `standin` is granted: nothing reads it.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aikyat_parties_contacts_api_runtime') THEN
    CREATE ROLE aikyat_parties_contacts_api_runtime
      NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA pc TO aikyat_parties_contacts_api_runtime;

GRANT SELECT                 ON pc.schema_migration  TO aikyat_parties_contacts_api_runtime;
GRANT SELECT, INSERT         ON pc.private_anchor    TO aikyat_parties_contacts_api_runtime;
GRANT SELECT, INSERT, UPDATE ON pc.party             TO aikyat_parties_contacts_api_runtime;
GRANT SELECT, INSERT         ON pc.operated_party    TO aikyat_parties_contacts_api_runtime;
GRANT SELECT, INSERT, UPDATE ON pc.contact           TO aikyat_parties_contacts_api_runtime;
GRANT SELECT, INSERT, UPDATE ON pc.contact_point     TO aikyat_parties_contacts_api_runtime;
GRANT SELECT, INSERT, UPDATE ON pc.principal_binding TO aikyat_parties_contacts_api_runtime;
