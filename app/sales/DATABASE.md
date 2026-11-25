# The app's database (PostgreSQL, the engine's schema)

The app saves into the engine's own schema: `docs/sales/sales_engine/out.sql` (rev 17, 42 tables), run as it is.

## Run it

| Step | Command (in `app/sales`) | What it does |
|---|---|---|
| First time only | `npm run db:init` | Creates a PostgreSQL cluster on this PC (`%LOCALAPPDATA%\aikyat-ae\pgdata`, port 55440, outside OneDrive), the database `aikyat_ae`, the schema and the setup rows |
| After a restart of the PC | `npm run db:start` | Starts that cluster (`db:stop` stops it) |
| The app | `npm run dev` | The app and its backend together, on http://localhost:5174 |
| Look inside | `npm run db:status` | Rows per table |
| Start again | `npm run db:reset`, or Demo → "Reset the demo" | Drops and rebuilds everything |
| Prove it | `npm run db:e2e` | Drives the app's stores: a new customer and SV-0012 booked + approved, each saved; a wrong save refused. **Rebuilds the database** |

In the app, the top bar shows **Saved to PostgreSQL hh:mm**. **Rules → Backend view** shows each table read back from the database, and the last saves.

## How it works

```
the app (its rules, unchanged) ──every change, 0.7 s later──▶ PUT /api/db/state ──▶ server/project.ts
                                                                   one transaction: the app's state → the schema's rows
                                                                   the database's keys, CHECKs, EXCLUDEs and triggers decide
the app opens ◀── GET /api/db/state ◀── demo.app_state (the app's own state: drafts, notices, the log)
```

- **Refused:** if a save breaks a rule of the schema, nothing of it is written. The pill turns red and names the constraint.
- **No database:** the app still works in this browser only, and saves when the database is back.

## What is stored

| From the app | Tables |
|---|---|
| Parties (both sides) | `pc.*`: party, PAN / GSTINs, addresses, trade name, standing, contacts (as P&C's stand-in) |
| Customer requests and accounts (T12) | `customer_request` (+ approval, history), `debtor_account` (+ tax registration, location, credit limit, history), `party_bank_account` |
| Sales vouchers (T24), from Submit on | `sales_invoice`, `sales_invoice_line` by role, with the mapping row used (rev 17), `sales_invoice_history` |
| The journal | `journal_entry`, `journal_line` (+ rule, case, role, mapping row), `document_sequence` |
| Stock | `inv.stock_lot` (quantities left) |
| Setup, from the app's catalogues | company, branches, years, chart, GST states, debtor categories, book + settings, roles, rule SALES_INVOICE v1, the 19 mapping rows |

**Not stored:**
- The vendor side's accounts and requests: their tables are Manoj's and are not in our schema. Vendor parties are stored.
- An invoice received but not yet booked: it is still Billing's.

**Assumptions to know:**
- An account the app starts with gets an "OPENING" request, because `debtor_account` needs the request it was opened from.
- Its terms not on a form use defaults; their remarks say so.

## Moving the database (Docker, Supabase …)

1. Set **one line** in `app/sales/.env.local`: `DATABASE_URL=…`. See `.env.example` for local, Docker and Supabase.
2. Run `npm run db:setup`. It creates the schema and the setup rows on that server.
3. Run `npm run dev`.

Docker: `docker compose up -d` (file `docker-compose.yml`, PostgreSQL 18). Supabase: use the project's connection string, with `?sslmode=require`. The schema needs `btree_gist`, which both have.
