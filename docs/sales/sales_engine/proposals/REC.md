# REC · Schema rev 19: remove the posting rules and the ledger mapping · proposal
Status: approved by Vijay 27-Nov-2026 (REC-D2)

## Inputs

| Date | Who | What | Effect |
|---|---|---|---|
| 27-Nov-2026 | Vijay | Each role app owns its accounting layer and proposes the complete entry; the AE records like Tally: picks the ledger, types Dr / Cr, saves. "Only remove auto posting rule … all mapping rule remove even from artifact html & both ER html. Nothing else removed: we need inventory and auto calculation" | This revision |

## 1. Remove (rev 18 → rev 19)

| What | Detail |
|---|---|
| 6 tables | `fin.line_role`, `fin.posting_rule`, `fin.posting_rule_case`, `fin.posting_rule_role`, `fin.account_determination`, `fin.account_determination_history` |
| 7 columns on `fin.journal_line` | `rule_code`, `rule_version`, `rule_case`, `line_role_code`, `account_determination_id`, `determined_ledger_code`, `override_reason` + their 6 CHECKs (`journal_line_rule_has_version`, `_rule_has_role`, `_case_needs_rule`, `_determined_has_row`, `_override_has_reason`, `_reason_only_on_override`) + the index `journal_line_determination_idx` + 3 Refs |
| 7 columns on `fin.sales_invoice_line` | the same 7 + their 7 CHECKs (the 6 above as `sales_invoice_line_*` and `sales_invoice_line_customer_role_is_the_customer`) + its indexes on them + 3 Refs |
| out.sql hand-written block "by hand (rev 17), S1 part 2" | posting_rule_no_overlap EXCLUDE; account_determination GENERATED specificity, its EXCLUDE, trigger `account_determination_guard`; functions `fin.determine_ledger`, `fin.account_determination_gaps` (completeness) |
| t24_schema_test.sql | the parts that seed / prove rules, roles and the mapping, and their wrong rows; renumber nothing silently: list the removed N-numbers |
| .dbml header | rev 19 paragraph (this table); rev 17's paragraph stays as history, marked "removed in rev 19" |

## 2. Keep (nothing else changes)
Every other table, column, CHECK, EXCLUDE and trigger: T12 (customer creation, debtor account), the books core (book, book_setting,
fiscal_year, document_sequence, branch), the journal (journal_entry, journal_line without the 7 columns), the sales document family
(sales_invoice, _line, _history, notes, e-invoice, e-way bill), inventory (`inv.stock_lot`, `inv.stock_return`), ledger_account,
debtor_category. The journal still balances (Manoj's commit check).

## 3. Done work touched
- T24, T25, T26: their lines no longer carry the rule / role / mapping; the entry is the AE's. Their other tests run again (t24_schema_test.sql, the rest).
- S1 part 2: withdrawn (the task card's "posting rules and mapping" moves to the role apps' accounting layer).
- App: `server/project.ts`, `server/reference.ts` stop writing these columns / tables (stage 6).

## 4. Release
Counts on PostgreSQL 18 after the change (expected 37 tables); schema test passes; ER page regenerated (both local files:
`docs/sales/Sales Engine ER_vijay_full.html`, `docs/sales/sales_engine/Sales Engine ER_vijay_full.html`) and the published artifact.

## 5. P&C pull (REC-D8, REC-D9: "take pull from P&C, update it accordingly")
P&C's schema is unchanged since commit 8760abc; our pc.* STUBS are brought in line with their migrations 002–007:
1. `pc.party_identifier`: drop our unique `(workspace_id, party_identifier_id)` (theirs has none, on purpose); `fin.debtor_tax_registration` → a single-column FK to `pc.party_identifier.party_identifier_id` (as `fin.branch` already does).
2. `pc.party_standing`: drop our unique `(workspace_id, party_standing_id)`; `fin.debtor_account` → a single-column FK to `pc.party_standing.party_standing_id`.
3. `pc.party_trade_name`: add their unique `(workspace_id, party_id, trade_name_id)`; the standing → trade-name FK becomes those 3 columns.
4. `recorded_at`, `updated_at timestamptz NOT NULL DEFAULT now()` on operated_party, party_trade_name, party_identifier, business_location, party_standing, contact, contact_party_association, contact_point; `pc.party.recorded_at` / `updated_at` NOT NULL.
5. `scope jsonb` on contact_party_association; `activity_ref jsonb`, `decision_ref jsonb` on record_history, its `recorded_at` NOT NULL.
6. Notes: the full allowed values (anchor_kind and contact_kind also `system`, `destination`; channel_kind `email, phone, url, postal`).
The app writes these stubs (server/project.ts): it must still save (db:e2e).
