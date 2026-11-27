# Proposals: one per task (stage 3 of the task cycle)

`<task>.md` (e.g. `T25.md`, `T25a.md`): the engine and database design for that task, written by the `schema-designer` agent.

- First line: `Status: proposed (<date>)`. Only the task-cycle skill changes it, after Vijay's explicit yes, to
  `Status: approved by Vijay <date> (<Tn>-D<n>)` — the decision row sits in `../task_tracker/<task>/cycle.md`.
- `schema-builder` builds only from an approved proposal and checks that decision exists.
- A failed review (stage 4) sets it back to `proposed`; the history of changes stays in the file's Inputs table.
