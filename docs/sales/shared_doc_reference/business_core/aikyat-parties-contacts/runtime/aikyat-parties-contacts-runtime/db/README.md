# The schema

The logical model, `model/logical-model.md`, made physical. Numbered plain SQL
under `migrations/`, applied in order by `parties_contacts/migrate.py` and
recorded in `pc.schema_migration`. One file per area, so an area can be read in
one sitting.

Physical design derives from the logical model and adds no business meaning
that is absent from it. Where a column or table here is not a model field, the
file that creates it says so and says why.

## What is in each file

| File | Tables |
|---|---|
| `000_establish_schemas` | none. The `pc` and `standin` schemas |
| `001_platform_catalogues` | `legal_form` · `identifier_scheme` · `identifier_scheme_standing` · `purpose_type` · `party_standing_type` · `party_relationship_type` · `capacity_type` |
| `002_identity_kernel` | `private_anchor` · `party` · `contact` · `identity_merge` |
| `003_parties` | `operated_party` · `party_trade_name` · `party_standing` · `business_location` · `party_relationship` |
| `004_legal_identity` | `party_identifier` |
| `005_contacts` | `capacity` · `contact_party_association` · `contact_point` · `route_use` · `handler` · `representation` · `principal_binding` |
| `006_workspace_vocabulary` | `purpose` · `contact_party_association_purpose` · `route_use_purpose` · `business_location_purpose` |
| `007_evidence` | `claim` · `proposal` · `proposal_supporting_claim` · `record_history` |
| `008_correct_standin_schema_comment` | none. Replaces the comment on the `standin` schema. **Supersedes the wording of 000** |
| `009_restore_indian_legal_identity_catalogue` | none. Adds the approved Indian legal-form and identifier vocabulary |

**32 tables, and the migration ledger.**

| | Count | |
|---|---|---|
| Named by the plan | 24 | 4 platform catalogues and 20 workspace records |
| Type catalogues behind `_code` fields | 3 | `party_standing_type` · `party_relationship_type` · `capacity_type` |
| Workspace capacity | 1 | `capacity`, the workspace-defined half of `capacity_code` |
| Sets of references | 4 | the three `*_purpose` tables and `proposal_supporting_claim` |

`AuthorizedContactProjection` is not a table. The model calls it disposable and
rebuildable; it is a response shape.

## The two schemas

| Schema | Holds |
|---|---|
| `pc` | what Aikyat Parties and Contacts owns. Everything above |
| `standin` | facts that **exist nowhere** and need a temporary home. Empty today |

**A stand-in is not a copy of another module's data.** The test is not whether
the owning module is deployed; it is whether the data exists. Data that exists
and is correct in another module, such as Identity's and Control Plane's, is
never stood in for here.

**v1 departs from "fetch, never copy" once, deliberately.** Its daily sync
copies what Identity and Control Plane hold -- members, their grants, names
and addresses, and each workspace's operating company -- into `pc`, as P&C's
own records, refreshed from their owners every day. That copy is not a
stand-in and never goes in `standin`. When an upstream cannot be reached,
`/readyz` names it and the read keeps serving the last good copy.

Two rules hold between the schemas:

- **Never joined in SQL.** No query, view or function reads a table of one
  together with a table of the other. Composition happens in application code,
  through an adapter.
- **A foreign key may point from `standin` to `pc`, never from `pc` to
  `standin`.** The first is integrity and is dropped with the schema it lives
  in. The second would pin the schema: `DROP SCHEMA standin CASCADE` would have
  to remove a constraint from a `pc` table.

**Read 008, not 000, for what `standin` is.** Migration 000 describes a
stand-in as a fact another module owns, held until that module has a read API,
and forbids any foreign key into `pc`. Both statements are wrong now. 000 is
applied and is never edited, so its text stands as written and 008 supersedes
it.

## Applied migrations are never edited

A mistake in a merged migration is corrected by a new migration, as 008 does
for 000. Even a comment counts.

`evals/test_migrate.py` pins **every** migration by the hash of its content,
the newest included, in `MIGRATION_SHA256`. Two tests hold it:

- the pin list must equal this directory exactly, so a migration cannot be
  added without a pin and the list cannot fall behind;
- no pinned file may change.

**Adding a migration:** run the suite. The failure prints the line to add.

**Editing a migration that is new in your change and not yet merged:** that is
an ordinary edit. The failure prints the replacement pin; paste it.

**Editing a migration that is already on `main`:** do not. Restore it and
write a new migration. A changed pin on a merged migration shows in review as
a modified line, and that is the thing to refuse.

## Where the fields come from

Seventeen records have a field table in the current model. Six more are
retained "from the earlier model" without being restated, and
`record_history` is described in prose only. Their fields are the earlier
model's, which is the previous version of the same file:

```bash
git show 7621949:model/logical-model.md
```

It speaks Anchor/Actor and is translated as it is read. Nothing under
`research/` is a source for anything here.

## Conventions

- **Platform catalogues carry no `workspace_id` and no row-level security.**
  Migration 001 creates them empty because the earlier model did not supply
  every display name and definition required by the schema. Migration 009 adds
  the first vocabulary whose complete meaning has since been approved:
  `IN_PVT_LTD`, `IN_PAN`, `IN_GST`, and the four `IN_GST` standings.
- **Everything else is workspace-owned.** `workspace_id` on the row, and every
  reference to another workspace-owned row is a composite foreign key that
  carries it. Row-level security is enabled and forced, and fails closed on
  the per-request setting `app.current_workspace`.
- **Indexes lead with `workspace_id`.** The one exception is a primary key on
  the row's own uuid. Every reference between workspace-owned rows has an index
  on the referencing side to follow it.
- **A superuser, or a role with `BYPASSRLS`, ignores row-level security.** The
  API must reach these tables as a role that is neither. That is decided with
  the first read.
- **No `status` and no `is_active`, anywhere.** Currency is derived from
  `since` / `until`. `proposal.outcome` is the decision itself.
- **Empty means not known.** Never false, never all, never inactive. An empty
  string, an empty list and an empty object are refused, so `NULL` is the only
  way to say it.
- **Two clocks.** `since` / `until` are business time: dates, half-open.
  `recorded_at` is when Aikyat first recorded the row and is immutable;
  `updated_at` is when it last changed and is set by trigger.
- **Keys are uuids.** `party_id`, `contact_id` and `anchor_id` are the same
  value for one identity.
- **Enums are CHECK constraints; catalogues are tables.** A catalogue holds
  vocabulary whose meaning is data. An enum holds values whose meaning
  requires product code.

## What the database does not enforce

Stated here because "it is in a comment" and "the database enforces it" are
different promises.

- **Overlap, when a bound is unknown.** Overlapping periods are refused for a
  standing, a relationship and a principal binding only when both `since` and
  `until` are known. A row with an empty bound is accepted unchecked: treating
  "not known" as "from forever" would assert knowledge nobody has.
- **Four `party_identifier` rules.** The `none_held` overlap rule, the GST
  cancellation rule, scope valid for the scheme, and value normalisation.
  Each depends on what a scheme's standings mean, which is code.
- **Merge procedure.** Cycles and chains, the survivor having Party first, and
  resolving a reference before each new write.
- **History.** Nothing writes `record_history`. There are no audit triggers;
  the first write path records history, because only it knows the performer.
- **Catalogue kind rules after the fact.** An association or relationship is
  checked against its type when it is written. Remapping a workspace capacity
  to a different governed type does not re-check existing associations.
- **A foreign key from `pc` into `standin`.** Postgres cannot refuse one: it
  is an ordinary key. The suite refuses it. `test_schema_shape.py` fails when
  one exists, and `test_schema_standin_boundary.py` proves that check sees a
  planted key.
- **A view or function in `pc` that reads `standin`.** Also the suite's to
  refuse, by asking the catalogue, and proved the same way on a planted view,
  materialized view and each kind of function. The check reads both
  `pg_depend` and function body text, because Postgres records a view's
  dependencies and keeps none for a function whose body is a string.
- **The rest of the never-join rule is not checked by anything.** Known gaps:
  a view or function in `standin` that reads `pc`; an object in a third schema
  that reads both; dynamic SQL that builds the schema name at run time; and
  **a join written in application code**, which no catalogue check can see and
  which is where the adapters will write their queries.

## Tests

`evals/test_schema_*.py`. One test per constraint, proving the forbidden row
is refused and by which rule. `test_schema_shape.py` compares the tests
against the database's own catalogue and fails when a constraint exists that
no test names.
