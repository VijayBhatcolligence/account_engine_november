# Task tracker: how we build the engine

We build the accounting engine **one task at a time**, from the task card. Each task adds only what it needs. When every task is built, the engine runs all of accounting end to end, whatever the order we took them in (top-down, bottom-up, or from the middle). We started in the middle: **T12 Create a customer**.

| File | Answers |
|---|---|
| [01_task_register.md](01_task_register.md) | Which tasks exist, which are built, what each one built and needs |
| [02_engine_history.md](02_engine_history.md) | How the engine grew, task by task: tables added, changed, stubbed |
| [03_gaps.md](03_gaps.md) | Everything found that the current task does not cover, its kind and its home |

## The rules (decided by Vijay, 4-Nov-2026)

1. **One task at a time.** Sources for each task: the task card (why, who, when), the app `app/sales` (fields, checks), and the walkthrough method (the Vendor Backend Walkthrough and backend modeling, Manoj).
2. **Never break what is done.** A new task extends the engine. If it must change a done table, the history says what changes, why, and which done task is checked again.
3. **Stubs.** What an earlier task owns but is not built yet (the book, the chart of accounts) is a **stub**: the smallest table the current task needs, labelled, naming the task that will replace it.
4. **Keys that spread are chosen so a later task does not reach back.** Example: a customer account is keyed to the company (`operated_party_id`, the same key as the vendor side), not to a book, so adding more books later does not touch onboarding.
5. **Place every question first, even one outside the task.** Answer in one line: *"We are on Tn. This belongs to X. Logged as G-n; solved when X is built."*
6. **Open and close.** A task opens by reading its rows in `03_gaps.md` and the register. It closes by updating all three files.

## Placing a question

| It belongs to | Then | Gap kind |
|---|---|---|
| The current task | Do it | — |
| A task on the card, built or not | Built: check it there; missing → a gap. Not built: answer briefly, log it, solve it when that task is built | **In a task (Tn)** |
| No task on the card (setup: books, chart of accounts, inventory setup …) | Log it as a candidate task: **ask, don't add** (task card §10) | **New task** |
| A fact another team owns (Business Core, the accounting lead) | Log it as a request to them; we only read the answer | **Other owner** |
| Not the engine at all | Say so | — |

## Done means

Every task in the register is built, and every gap is **covered** (by a named task and revision) or **not needed** (with the reason). Then we can say: *the engine supports tasks T1 to Tn end to end.*
