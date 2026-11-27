# REC · The recording model (role apps own the accounting layer; the AE records) · cycle

| | |
|---|---|
| Task | REC (a change of method, not a card task): reverse the engine's posting rules and mapping; remove the invoice reader; P&C pull |
| Parent | — |
| Opened | 27-Nov-2026 |
| **Stage** | 5 Build DB + 6 Build app (started 27-Nov-2026) |
| Proposal | `../../proposals/REC.md` · Status: approved by Vijay 27-Nov-2026 (REC-D2) |

## Decisions

| ID | Date | Question | Options | Vijay's answer (his words) | Engine-wide? |
|---|---|---|---|---|---|
| REC-D1 | 27-Nov-2026 | How is accounting split now? | — | "for each role he'll do one part of accounting … he'll build some layer which will understand accounting and completely propose what entry will be done … as AE … like Tally he'll get things and he'll select ledger, enter debit credit … and save the entry; no intelligence here … parsing and all, no rule here" | **Yes** → CLAUDE.md §3 |
| REC-D2 | 27-Nov-2026 | What to remove from the AE app, the schema and the ER pages? | A move out · B delete · C keep switched off | "only remove auto posting rule … accountant will type and enter … remove that parser; other than that nothing removed: we need inventory and auto calculation; all mapping rule remove even from artifact html & both ER html" | Yes |
| REC-D3 | 27-Nov-2026 | Save the current state first? | A archive branch · B delete outright | Agreed A ("rest … I agree with your point") → local branch `archive/ae-engine-rev21`, commit 03586df (not pushed) | No |
| REC-D4 | 27-Nov-2026 | P&C | — | "take pull from P&C, update it accordingly" | No |
| REC-D5 | 27-Nov-2026 | Agents | — | "rest agents I agree with your point": the agents look at recording (Tally-like) with the role app's proposed entry, not posting rules | No |
| REC-D8 | 27-Nov-2026 | P&C keys: Finance links to pc.party_identifier and pc.party_standing by (workspace_id, id), which P&C does not have | A follow theirs (single-column FKs to the pkey) · B ask P&C for the keys | A — Vijay: "take pull from P&C, update it accordingly" (P&C's model file wins, CLAUDE.md §5) | No |
| REC-D9 | 27-Nov-2026 | P&C stub columns and allowed values | A follow their migrations (recorded_at / updated_at, scope, activity_ref / decision_ref, the 3-column trade-name key, allowed values) · B keep the slim stub | A — the same instruction | No |
| REC-D10 | 27-Nov-2026 | P&C now ships as its own cell (own database): our "same database" assumption and the fin → pc foreign keys | A log as an Other-owner gap (ask P&C: REFERENCES grants or a read API) · B ignore | A recommended; logged as gap G57 | No |

## Open decisions

| ID | Question | Recommended | Blocks | Can wait |
|---|---|---|---|---|
| REC-D6 | After this: the customer account (debtor_account) columns: core accounting or not | the next task | — | yes |
| REC-D11 | Old .dbml notes that name rules as history (rev 14 D4 "R1–R12 in code", "SALES_RETURN_RECEIPT v1", "R13") | A leave as history (recommended: inputs are stacked, history kept) · B mark "removed in rev 19" | — | yes |

## Log

| Date | Stage | What happened |
|---|---|---|
| 27-Nov-2026 | — | Archive commit 03586df on `archive/ae-engine-rev21` (rev 21: 113 tests, reader 43/43 + 7/7, entries 28/28, db:e2e all saves) |
| 27-Nov-2026 | 5 | schema-builder: rev 19 built. 43 → 37 tables, 523 → 457 columns, 107 → 90 FKs, 88 → 54 CHECKs; t24_schema_test 56 / 56 refused; kept entries identical to rev 18; ER pages rebuilt (37 tables, 90 links, tested 4 views) |
| 27-Nov-2026 | 5 | partner-sync: P&C has no schema change since 8760abc (20 commits, deployment only); our pc stubs differ (2 keys P&C does not have, 18 columns, allowed values) → REC-D8, D9 (follow theirs), D10 (gap) |
