-- 000 · The two schemas. No tables.
--
-- This migration establishes where things will live and creates nothing in
-- either place. The logical model is built from 001 onwards.
--
--   pc        what Aikyat Parties and Contacts owns.
--   standin   facts ANOTHER module owns -- HR, Identity, Control Plane --
--             held here only until that module has a read API.
--
-- THE RULE: `pc` and `standin` are NEVER joined in SQL.
--
--   No query, view, function or foreign key may name a table in one schema
--   and a table in the other. Composition happens in application code,
--   through an adapter, one owner at a time.
--
--   Why. The day HR, Identity or Control Plane ships its read API, the
--   stand-in is replaced by a remote call. If the two schemas are only ever
--   composed in application code, that swap is a change of adapter. If they
--   are joined in SQL, it is a rewrite of every read that joined them -- and
--   a join is also how borrowed data gets quietly treated as our own.
--
--   `standin` must stay droppable in ONE statement:
--
--       DROP SCHEMA standin CASCADE;
--
--   So nothing in `pc` may depend on it, and nothing in it may hold a foreign
--   key into `pc`.
--
-- The `pc` schema and the ledger `pc.schema_migration` already exist when
-- this file runs. The migration runner creates them in code, because the
-- table that records migrations cannot be created by a migration it would
-- then have to record. `pc` is restated here with IF NOT EXISTS only so this
-- file reads complete on its own.

CREATE SCHEMA IF NOT EXISTS pc;

COMMENT ON SCHEMA pc IS
  'Aikyat Parties and Contacts: what this product owns. NEVER joined in SQL to the standin schema; composition happens in application code, through an adapter.';

CREATE SCHEMA IF NOT EXISTS standin;

COMMENT ON SCHEMA standin IS
  'Borrowed facts another module owns, held only until that module has a read API. NEVER joined in SQL to the pc schema, and no foreign keys into pc. Must stay droppable in one statement: DROP SCHEMA standin CASCADE.';
