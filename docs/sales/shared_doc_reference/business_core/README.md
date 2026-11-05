# Business Core: Aikyat Parties & Contacts (P&C)

**What this is:** the party identity every task follows (build guide input 27, 30-Oct-2026). **Business Core** was renamed **Aikyat Parties and Contacts** (P&C) on 2-Oct-2026. Another team builds and owns it. **We follow their schema and never change it.** **Same database (rev 11, 2-Nov-2026):** their schema `pc` sits in our PostgreSQL database. After the last approval we hand P&C the party; P&C runs its checks and answers the `party_id` or an error (`01_parties_contacts_schema.md` §3.1).

**Source:** `https://forge.aikyat.com/aikyat/aikyat-parties-contacts` · branch `main` · commit `8760abc` (merged 26-Oct-2026) · copied 30-Oct-2026 by Vijay.

| # | File | What it is |
|---|---|---|
| 1 | `01_parties_contacts_schema.md` | **Our reading. Start here.** Covers: the 32 tables; the rules they follow; how a `party_id` flows; which tables Task 1 and Task 2 use; what P&C has not built yet (our asks to them) |
| 2 | `aikyat-parties-contacts/` | **Verbatim copy** of 17 repo files at the **same paths** as in the repo. Never edited here |

## The copy (17 files, same paths as the repo)

| Path | What it is | Who wins |
|---|---|---|
| `architecture/ra-aikyat-business-core.md` | Product charter | 1st: governs everything below |
| `architecture/seams-aikyat-business-core.md` | Boundary map: what P&C owns, what its neighbours keep | 2nd |
| `model/logical-model.md` | **Approved logical model** (2-Oct-2026): every record, field and invariant | 3rd |
| `runtime/aikyat-parties-contacts-runtime/db/README.md` | The physical schema: files, conventions, what the database does not enforce | the DDL follows the model |
| `runtime/aikyat-parties-contacts-runtime/db/migrations/000…010` | **The DDL** (11 files, schema `pc`): **32 tables, 236 columns** | |
| `docs/proposals/m2-tally/p01-operated-company.html` | Proposal 1 (15-Oct): our own company is a party in P&C; `accounting.legal_entity` gets `party_id` | a proposal, not built |
| `docs/proposals/m2-tally/p02-customers-vendors.html` | Proposal 2 (16-Oct): an API to create parties, safe to repeat; Accounting keeps only `party_id` and its money fields. **Since rev 11** the same idea is a hand-over in the same database (ask A1) | a proposal, not built |

## Rules for this folder

- **Never edit the copy.** If our reading and their files disagree, their files win; fix `01_parties_contacts_schema.md`.
- **Refresh:** clone again, copy the same 17 paths, and write the new commit here. A clone works anonymously, but checkout fails on Windows (long paths). Read files with:
  ```bash
  git clone --no-checkout https://forge.aikyat.com/aikyat/aikyat-parties-contacts.git
  git -c core.longpaths=true archive HEAD <path> | tar -x -C <folder>
  ```
- **Not copied:** `research/` (their own README: "nothing under research/ is a source"), the runtime code, the tests, the deployments.
- **Internal:** like `case_engine/`, this folder stays in this repo. It is not pushed to `role-app-accounts-executive`.
