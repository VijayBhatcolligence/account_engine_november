# Foundry: Task-to-Screen Formula

> **Source:** Sunny's Foundry pilot — 3 roles, 16 tasks, 11 patterns.
> Artifacts: [Task Screens](https://claude.ai/artifact/KWXXJ9vMae2L1UjrLb8HkT) · [Task Kit](https://claude.ai/artifact/GuTxYm22iepT3webSdHLN7)
> Kit v0.2.0 · Screens v0.3 · Design system: IBM Carbon

---

## §0. The Formula (7 steps)

Every task becomes a screen through this pipeline:

```
① Task card → ② Steps → ③ Components → ④ Pattern & variant
→ ⑤ Slots → ⑥ Regions → ⑦ Screen
```

| # | Stage | Input | Output | What happens |
|---|---|---|---|---|
| 1 | **Task card** | Role file, scenario, research | `task-card.json` | Trigger, steps, endings, rules, category, work conditions |
| 2 | **Steps** | Task card | Steps with required_information, required_actions | What the person looks at, checks, decides |
| 3 | **Components** | Each step's needs | Component list | One component for each need of each step |
| 4 | **Pattern & variant** | Category + work conditions + data | Pattern ref (FD-xx) + variant | From category, work conditions and data shape |
| 5 | **Slots** | Components | Each component → a slot (its job) | 9 possible slots; each component claims one |
| 6 | **Regions** | Pattern | Named columns with widths in /16 | The pattern defines which slots go in which column |
| 7 | **Screen** | Everything | `screens.json` → rendered screen | Drawn, then checked against its spec |

---

## §1. The Hierarchy

```
Foundations (Carbon theme, IBM Plex, 2× grid, shell)
  └── Primitives (30: button, input, table, chart, modal, tag, status …)
        └── Components (41: each made only of primitives, each for a step's need)
              └── Slots (9: each component's job on this screen)
                    └── Patterns (11 + variants: each gives named regions with widths)
                          └── Regions (columns in 16ths, each holding certain slots)
                                └── Screen (drawn, then checked against its spec)
```

**Rule:** each layer is made only of the layer below it. A component never reaches past primitives. A pattern never names a component — it names slots and regions.

---

## §2. Task Card (`task-card.json`)

The task card describes **the work**, not the screen.

```
task-card.json
├── task_id              "TASK-credit-controller-T01"
├── code                 "T01"
├── name                 "Decide an order sent for credit review"
├── version              "0.1.0"
├── role_id              "credit-controller"
├── marks                "[S] scenario  [R] role file  [T] research  [A] assumed  [F] fixture"
│
├── activity_to_task     How activities were classified into this task
│   ├── activities[]     Each source activity: ref, quote, action, trigger
│   └── task_check       Standard test — commit, job (record / question / endings), verdict
│
├── task_step_analysis   Why this is one task, not two
│   ├── independent_outcome   "A credit decision with a reason on one routed SO"
│   ├── trigger               What starts this task
│   ├── accountable_role      Who owns it
│   ├── completion            What "done" means
│   ├── outcomes[]            ["Approved", "Rejected", "Held"]
│   └── merge_or_split_notes  Why not split / merge with another
│
├── task_card            THE CORE
│   ├── role_ids[]
│   ├── owner            "Farid, Credit Controller (R-S03) [S]"
│   ├── trigger          What causes this task to appear
│   ├── subject          "Sales Order (credit review)"
│   ├── goal             What the task achieves
│   ├── completion_criteria
│   ├── outcomes[]       Each ending: id, label, goes_to, reason_required
│   ├── steps[]          (see §3)
│   ├── inputs[]         What enters the task
│   ├── business_rules[] Each: rule_id, description, source, check_type
│   ├── source_refs[]
│   └── open_questions[]
```

---

## §3. Steps

Each step inside `task_card.steps[]`:

| Field | Purpose |
|---|---|
| `step_id` | "S1", "S2", … |
| `name` | "Select the routed order" |
| `purpose` | Why this step exists |
| `required_information[]` | What the person needs to see |
| `required_actions[]` | What the person does |
| `required_when` | "always" or conditional |
| `repeatable` | true / false |
| `depends_on_step_ids[]` | Which steps must be done first |
| `validation_rules[]` | What is checked |
| `evidence_refs[]` | What supports it |
| `interaction_category` | "CAT-01" etc. |

**Key:** each `required_information` or `required_action` inside a step becomes a reason to include a component (§4).

---

## §4. Components (41)

Each component is made **only of primitives**. It exists because a step needs it.

### Shell components (not in slots)

| Component | Made of | Purpose |
|---|---|---|
| `cmp.app-header` | header, icon-button, tag | Product name, role, person, scope, working date |
| `cmp.task-sidebar` | side-nav | Role's task list grouped by sidebar_group, with counts |

### Frame components

| Component | Default slot | Made of | Purpose |
|---|---|---|---|
| `cmp.task-header` | task_header | status, tag | Names the task, what started it, whose move. **Variants:** `standard` (desktop), `compact` (phone) |
| `cmp.step-nav` | step_navigation | button, status | Stage navigation. **Variants:** `stages` (desktop), `compact` (phone: "2 of 3") |

### Select components (find / filter)

| Component | Default slot | Made of | Purpose |
|---|---|---|---|
| `cmp.filter-bar` | query_controls | search, select | Search and filters for the workspace below |
| `cmp.work-queue` | primary_workspace | data-table, link, search, select, status, tag | Items waiting for this task. **Variants:** `table` (many items, columns), `rail` (few items beside workbench) |

### Record components (context)

| Component | Default slot | Made of | Purpose |
|---|---|---|---|
| `cmp.record-summary` | context_panel | link, notification, structured-list, tag | Key facts of the selected record |
| `cmp.evidence-list` | supporting_analysis | link, status | Linked documents the decision rests on |
| `cmp.timeline` | context_panel | structured-list, tag | What happened to the record, in order |
| `cmp.activity-thread` | secondary_context | button, tag, textarea | Conversation on the record (SUP-01) |
| `cmp.offer-ladder` | context_panel | structured-list, tag | Negotiation rounds: our offer, their reply, target, limit |

### Analysis components (evidence)

| Component | Default slot | Made of | Purpose |
|---|---|---|---|
| `cmp.exposure-meter` | supporting_analysis | progress-bar, status, structured-list, tooltip | Credit exposure vs limit (stacked bar) |
| `cmp.signal-list` | supporting_analysis | chart-marks, status | Risk / payment signals with trends |
| `cmp.trend-chart` | supporting_analysis | chart-marks, tooltip | One measure over time against a reference line |
| `cmp.bar-compare` | supporting_analysis | chart-marks, status | One measure across entities against a threshold |
| `cmp.share-bar` | supporting_analysis | chart-marks | How a total is shared between parties (100% bar) |
| `cmp.kpi-tile` | primary_workspace | tile | One headline figure with label and comparison |
| `cmp.comparison-table` | primary_workspace | data-table, status | Side-by-side values. **Variants:** `reference`, `before-now` |
| `cmp.scorecard-table` | primary_workspace | data-table, status, tooltip | Entities × measures with review flags |
| `cmp.rule-checks` | context_panel | status, tag, tooltip | Company rules applied: met or flagged, with points |
| `cmp.ai-insight` | action_area | button, tag, tile | AI suggestion, labelled as such, with Use / Dismiss |
| `cmp.expiry-runway` | supporting_analysis | progress-bar, status | Days left before expiry vs days needed at normal use |
| `cmp.cover-check` | supporting_analysis | status, structured-list, tag | Is this item covered? Stock, open POs, open indents |
| `cmp.capacity-bar` | supporting_analysis | progress-bar, status, structured-list | Capacity: in use, planned, free vs limit |
| `cmp.scenario-compare` | supporting_analysis | data-table, status | Current position vs scenarios on named measures |

### Entry components (data capture)

| Component | Default slot | Made of | Purpose |
|---|---|---|---|
| `cmp.form-section` | primary_workspace | date-input, number-input, select, text-input, textarea | A labelled group of fields |
| `cmp.weighbridge-reading` | primary_workspace | number-input, status | Gross, tare, net weight cross-checked against bags × size |
| `cmp.line-capture` | primary_workspace | notification, number-input, progress-bar | One PO line: ordered, received, open, splits |
| `cmp.scan-field` | primary_workspace | tag, text-input | Scan-first field for label reads |
| `cmp.bulk-review-table` | primary_workspace | button, checkbox, data-table, notification, select, status, tag, text-input, tooltip | Many records with per-row judgement |
| `cmp.change-summary` | validation_feedback | structured-list, tag | What the commit will change, grouped by receiver |
| `cmp.slot-planner` | primary_workspace | select, tag, tile | Resources × hours planner (bays × arrivals) |
| `cmp.scenario-controls` | primary_workspace | content-switcher, slider, status | Change scenario assumptions, start from presets |
| `cmp.message-preview` | action_area | tile | Exactly what an outside party will receive |
| `cmp.answer-composer` | action_area | tag, textarea | Write an answer, inserting facts from the record |
| `cmp.recipient-list` | action_area | checkbox, tag | Who receives: fixed + optional |
| `cmp.findings-checklist` | primary_workspace | checkbox, select, status | Investigation checks with results and notes |
| `cmp.duplicate-check` | supporting_analysis | data-table, radio | Existing items close to what's asked; person picks or says "none" |

### Commit components (endings)

| Component | Default slot | Made of | Purpose |
|---|---|---|---|
| `cmp.ending-picker` | action_area | button, notification, radio-tile, status, textarea | Endings as tiles naming where each goes + reason + commit |
| `cmp.confirm-dialog` | action_area | button, modal, structured-list | Shows record, ending, reason, recipients before commit |
| `cmp.receipt` | validation_feedback | button, link, notification, structured-list | What was recorded, who has it, what happens next |

---

## §5. The 9 Slots

A slot is a component's **job on this screen** — not a position.

| # | Slot | Purpose |
|---|---|---|
| 1 | `task_header` | Names the task, whose move, the status |
| 2 | `query_controls` | Search, filter, narrow what the list shows |
| 3 | `primary_workspace` | The main work area: queue, entry, plan |
| 4 | `context_panel` | The source record, rule checks — what is being decided / recorded |
| 5 | `supporting_analysis` | Evidence, trends, metrics that inform the decision |
| 6 | `secondary_context` | Background: activity thread, notes from Sales |
| 7 | `step_navigation` | Stage navigation for multi-view tasks |
| 8 | `action_area` | The commit: endings, reason, AI suggestion, recipient list |
| 9 | `validation_feedback` | What was recorded and who has it now (receipt) |

**Ordering within a region:** by step number; background last.

---

## §6. The 6 Placement Rules

| # | Rule | Meaning | Example |
|---|---|---|---|
| 1 | The main work gets the largest region | primary_workspace column is widest | Queue is 5/16, evidence is 7/16 |
| 2 | What is compared together stays visible together | Evidence and the decision that quotes it are co-visible | Endings beside exposure and signals |
| 3 | A warning sits next to what it is about | Duplicate check beside the field, limit next to the amount | Cover-check beside the indent form |
| 4 | The commit sits at the point of decision | Endings name where each goes (Nisha for approve, Arun for reject) | ending-picker in decision region |
| 5 | Background goes lowest | Activity thread, conversation at bottom of its column | thread last in evidence |
| 6 | Fit the device | Phone splits into staged views; desktop keeps columns side by side | soi-t02-phone uses phone-staged |

---

## §7. The 11 Patterns

Each pattern defines **regions** (named columns with widths in /16) and **which slots go in which region**.

### FD-01 · Record Explorer
- **Purpose:** Find a record and read it
- **Required slots:** query_controls, primary_workspace
- **Optional:** supporting_analysis, context_panel, validation_feedback, action_area
- **Variant `answer-desk`:** reading is for someone else's question
  - `rail` 4/16 → query_controls
  - `main` 7/16 → primary_workspace, supporting_analysis
  - `side` 5/16 pin → context_panel, validation_feedback, action_area
- **Used by:** cc-t06

### FD-02 · Insight Canvas
- **Purpose:** Interpret measures across entities and periods
- **Required:** primary_workspace, supporting_analysis
- **Optional:** validation_feedback, action_area
- **Variant `assessment-to-reader`:** conclusion sent to a reader
  - `main` 11/16 → primary_workspace, supporting_analysis
  - `side` 5/16 pin → validation_feedback, action_area
- **Used by:** pm-t07

### FD-03 · Attention Queue
- **Purpose:** Work through items needing action, most urgent first
- **Required:** query_controls, primary_workspace
- **Optional:** context_panel, supporting_analysis, secondary_context, validation_feedback, action_area
- **Variant `queue-with-embedded-decision`:** each item needs a decision on evidence
  - `queue` 5/16 → query_controls, primary_workspace
  - `evidence` 7/16 → context_panel, supporting_analysis, secondary_context
  - `decision` 4/16 pin → validation_feedback, action_area
- **Variant `action-per-row`:** each item needs a short choice; the set is closed together
  - `main` 11/16 → query_controls, primary_workspace
  - `side` 5/16 pin → validation_feedback, action_area
- **Used by:** cc-t01, soi-t11

### FD-04 · Planner Canvas
- **Purpose:** Arrange work across time and resources
- **Required:** primary_workspace, supporting_analysis, action_area
- **Optional:** query_controls, validation_feedback
- **Variant `bay-day`:** day's arrivals across bays
  - `main` 12/16 → query_controls, primary_workspace
  - `side` 4/16 pin → supporting_analysis, validation_feedback, action_area
- **Used by:** soi-t01

### FD-05 · Scenario Lab
- **Purpose:** Compare alternative futures before recommending one
- **Required:** primary_workspace, supporting_analysis, action_area
- **Optional:** context_panel, validation_feedback
- **Variant `share-mix`:** the alternative is how a total is shared between parties
  - `main` 11/16 → context_panel, primary_workspace, supporting_analysis
  - `side` 5/16 pin → context_panel, validation_feedback, action_area
- **Used by:** pm-t06

### FD-06 · Structured Editor
- **Purpose:** Enter a bounded record
- **Required:** primary_workspace, validation_feedback, action_area
- **Optional:** context_panel, supporting_analysis, step_navigation
- **Variant `transaction-workspace`:** recording what physically happened, source beside the entry
  - `source` 5/16 → context_panel
  - `entry` 7/16 → primary_workspace
  - `action` 4/16 pin → validation_feedback, action_area
- **Variant `quick-create`:** short request with a check that it's needed
  - `entry` 11/16 → primary_workspace
  - `action` 5/16 pin → supporting_analysis, validation_feedback, action_area
- **Variant `phone-staged`:** same entry on a phone; source, entry, endings can't be seen together
  - `column` 16/16 → step_navigation, context_panel, primary_workspace, validation_feedback, action_area
- **Used by:** soi-t02, soi-t02-phone, soi-t16

### FD-07 · Guided Sequence
- **Purpose:** Multi-view sequence gated by an order gate (e.g. duplicate check first)
- **Required:** step_navigation, primary_workspace, action_area
- **Optional:** validation_feedback, context_panel, supporting_analysis
- **Variant `gated-stages`:** a check must be answered before the next stage starts
  - `main` 11/16 → step_navigation, primary_workspace, validation_feedback
  - `side` 5/16 pin → context_panel, supporting_analysis, validation_feedback, action_area
- **Used by:** soi-t12

### FD-08 · Bulk Console
- **Purpose:** Review or update many records at once
- **Required:** query_controls, primary_workspace, action_area
- **Optional:** context_panel, validation_feedback
- **Variant `review-sheet`:** each row its own judgement, one send closes the set
  - `main` 12/16 → query_controls, primary_workspace
  - `side` 4/16 pin → context_panel, validation_feedback, action_area
- **Used by:** cc-t04

### FD-09 · Capture Console
- **Purpose:** Scan-first capture
- **Required:** primary_workspace
- **Variant `embedded-scan`:** one step inside a desk task takes scanned labels
  - A scan field holds focus inside the host's primary_workspace
- **Note:** embeds inside another pattern (e.g. inside FD-06). Adds no regions.
- **Used by:** soi-t02

### FD-10 · Decision Workbench
- **Purpose:** Weigh evidence and record one accountable decision
- **Required:** primary_workspace, supporting_analysis, action_area
- **Optional:** query_controls, context_panel, secondary_context, validation_feedback
- **Variant `with-queue-rail`:** a few items wait, each needs full review
  - `rail` 3/16 → query_controls
  - `evidence` 8/16 → primary_workspace, context_panel, supporting_analysis, secondary_context
  - `decision` 5/16 pin → validation_feedback, action_area
- **Variant `single-subject`:** one subject at a time, with trend evidence
  - `rail` 3/16 → query_controls
  - `evidence` 8/16 → primary_workspace, context_panel, supporting_analysis, secondary_context
  - `decision` 5/16 pin → validation_feedback, action_area
- **Used by:** cc-t01 (embedded in FD-03), cc-t02, pm-t01

### FD-11 · Case Workspace
- **Purpose:** Investigate an exception and record a finding
- **Required:** primary_workspace, context_panel, action_area
- **Optional:** query_controls, validation_feedback
- **Variant `reconciliation`:** finding rests on comparing a record with reference values
  - `rail` 3/16 → query_controls
  - `main` 8/16 → context_panel, primary_workspace
  - `side` 5/16 pin → context_panel, validation_feedback, action_area
- **Used by:** pm-t12

### Default Arrangement (no pattern)
When no pattern applies:
- `main` 11/16 → task_header, query_controls, primary_workspace, context_panel, supporting_analysis, secondary_context, step_navigation
- `side` 5/16 pin → validation_feedback, action_area
- **Used by:** cc-t03, pm-t05

---

## §8. Work Characteristics (8 dimensions)

Each task card declares these. They drive **pattern and variant selection** — the same category can produce different screens.

| Dimension | Example values |
|---|---|
| frequency | daily, as needed, monthly, quarterly, rare |
| volume | many over a day, few, single, bulk, one per sitting |
| complexity | low, medium, high |
| urgency | immediate, deadline, routine |
| risk | low, medium, high, medium-high |
| collaboration | individual, handoff to X, collaborative with Y |
| environment | desktop at HQ, desktop in gate office, handheld |
| variability | structured, conditional, exploratory |

**Example:** cc-t01 and cc-t02 are both CAT-05 "Review & Decide", but:
- cc-t01: daily, many → FD-03 Attention Queue (queue-with-embedded-decision)
- cc-t02: as needed, single → FD-10 Decision Workbench (single-subject)

---

## §9. Task Categories (8)

Categories are "judged by how the task ends."

| Code | Name | Ending shape |
|---|---|---|
| CAT-01 | Observe & Analyze | An answer or an assessment |
| CAT-02 | Plan & Allocate | A plan published |
| CAT-03 | Create & Request | A record created / a request sent |
| CAT-04 | Execute & Record | A transaction recorded |
| CAT-05 | Review & Decide | A decision with a reason |
| CAT-06 | Investigate & Resolve | A finding / resolution |
| CAT-07 | Coordinate & Communicate | A message sent / agreement reached |
| CAT-08 | Configure & Govern | A setting changed / a policy applied |

---

## §10. Screen Spec (`screens.json`)

The screen spec is derived from the task card.

```
screens.json
├── path                  "roles/credit-controller/tasks/T01-.../screens.json"
├── cardPath              path to the task-card.json
├── plan                  "main" (or phone variant)
├── name, code, role, category
├── steps[]               [{id: "S1", name: "..."}, ...]
├── characteristics       {frequency, volume, complexity, urgency, risk, collaboration, environment, variability}
├── devices[]             ["desktop"] or ["handheld"]
│
├── views[]               One per screen (most tasks = 1)
│   ├── id                "SCR-credit-controller-T01-work"
│   ├── title, purpose
│   └── steps[]           ["S1","S2","S3","S4","S5"]
│
├── screen_count_reason   Why this many screens
│
├── placement_notes[]     Each: {rule: 2, component_ref: "cmp.ending-picker", note: "..."}
│
├── manifests[]           One per view
│   ├── id
│   ├── patterns[]        [{ref, fd, variant, reason}]
│   └── components[]      Each component placement:
│       ├── inst          "queue" (instance name)
│       ├── cmp           "cmp.work-queue"
│       ├── variant       "rail"
│       ├── slot          "primary_workspace"
│       ├── region        "queue"
│       ├── steps[]       ["S1"]
│       └── reason        Why this component, here
│
├── components[]          Flat summary: [{cmp, slot, steps}]
├── patterns[]            Flat summary: [{ref, variant, reason}]
├── no_pattern_reason     If no pattern: why plain components serve the task
└── profile               "daily · many over a day · medium · immediate · high · ..."
```

---

## §11. The 16 Example Tasks

### Credit Controller — Farid · R-S03

| Code | Task | Category | Pattern | Variant |
|---|---|---|---|---|
| T01 | Decide an order sent for credit review | CAT-05 | FD-03 Attention Queue + FD-10 Decision Workbench (embedded) | queue-with-embedded-decision |
| T02 | Place a credit hold on a customer | CAT-05 | FD-10 Decision Workbench | single-subject |
| T03 | Request a credit-hold release | CAT-03 | (none — default arrangement) | — |
| T04 | Review credit limits | CAT-08 | FD-08 Bulk Console | review-sheet |
| T06 | Answer whether a customer can take an order | CAT-01 | FD-01 Record Explorer | answer-desk |

### Procurement Manager — Meena · R-P04

| Code | Task | Category | Pattern | Variant |
|---|---|---|---|---|
| T01 | Decide PO commercial terms | CAT-05 | FD-10 Decision Workbench | with-queue-rail |
| T05 | Negotiate purchase rates | CAT-07 | (none — default arrangement) | — |
| T06 | Review the vendor mix | CAT-02 | FD-05 Scenario Lab | share-mix |
| T07 | Assess vendor performance | CAT-01 | FD-02 Insight Canvas | assessment-to-reader |
| T12 | Review quotation exceptions | CAT-06 | FD-11 Case Workspace | reconciliation |

### Stores Officer Inbound — Suresh · KA-01 Bengaluru

| Code | Task | Category | Pattern | Variant | Screens |
|---|---|---|---|---|---|
| T01 | Plan the day's arrivals | CAT-02 | FD-04 Planner Canvas | bay-day | 1 |
| T02 | Record a delivery (desktop) | CAT-04 | FD-06 Structured Editor + FD-09 Capture Console (embedded) | transaction-workspace | 1 |
| T02 | Record a delivery (phone) | CAT-04 | FD-06 Structured Editor + FD-09 Capture Console (embedded) | phone-staged | 3 |
| T11 | Check batches close to expiry | CAT-01 | FD-03 Attention Queue | action-per-row | 1 |
| T12 | Ask for a new item | CAT-03 | FD-07 Guided Sequence | gated-stages | 2 |
| T16 | Raise an indent | CAT-03 | FD-06 Structured Editor | quick-create | 1 |

---

## §12. Varieties (how the 16 tasks teach the system)

### A. One pattern, different variants
The same pattern arranged differently because the work differs.

| Pattern | Variant A | Variant B | Variant C |
|---|---|---|---|
| FD-03 Attention Queue | cc-t01: queue-with-embedded-decision | soi-t11: action-per-row | — |
| FD-10 Decision Workbench | pm-t01: with-queue-rail | cc-t02: single-subject | — |
| FD-06 Structured Editor | soi-t02: transaction-workspace | soi-t16: quick-create | soi-t02-phone: phone-staged |

### B. No pattern — components only
Plain components in the default arrangement. Slots and rules still apply.
- **cc-t03:** one request with a reason; the Finance Controller decides
- **pm-t05:** an exchange with an outside party: offers, a message preview, a thread

### C. A pattern inside another (embedded)
The embedded pattern adds no regions; the host places its parts.
- **cc-t01:** FD-10 Decision Workbench inside FD-03 Attention Queue
- **soi-t02:** FD-09 Capture Console inside FD-06 Structured Editor

### D. Multiple screens
One screen is the default. These split for a stated reason.
- **soi-t12:** split by an order gate (duplicate check must be answered first)
- **soi-t02-phone:** split by the device (phone can't show PO, weighing and endings together)

### E. Same category, three arrangements
"Review & Decide" (CAT-05) each time; volume and frequency change the screen.
- **cc-t01:** many orders through the day → Attention Queue
- **cc-t02:** one customer at a time → Decision Workbench (single-subject)
- **pm-t01:** three revisions, each fully reviewed → Decision Workbench (with-queue-rail)

---

## §13. Worked Example: cc-t01 "Decide an order sent for credit review"

### Steps

| Step | Name | What the person does |
|---|---|---|
| S1 | Select the routed order | Pick the next order (oldest and largest excess first) |
| S2 | See why it was routed | Know which of the 3 routing reasons apply |
| S3 | Read the exposure | See how far this order takes the customer past the limit |
| S4 | Read the payment signals | Judge whether the customer pays |
| S5 | Decide and write the reason | Choose approve / reject / hold, write reason, confirm |

### Pattern selection logic
- Category: CAT-05 Review & Decide
- Work: daily, many over a day, medium, immediate, high, handoff, desktop, conditional
- → **FD-03 Attention Queue** (queue-with-embedded-decision) — orders arrive through the day
- → **FD-10 Decision Workbench** embedded — evidence and decision co-visible

### Regions

| Region | Width | Slots |
|---|---|---|
| `queue` | 5/16 | query_controls, primary_workspace |
| `evidence` | 7/16 | context_panel, supporting_analysis, secondary_context |
| `decision` | 4/16 pin | validation_feedback, action_area |

### Component placement (13 components)

| Instance | Component | Variant | Slot | Region | Step | Reason |
|---|---|---|---|---|---|---|
| header | cmp.task-header | standard | task_header | — | — | Names the task and whose move |
| filters | cmp.filter-bar | — | query_controls | queue | S1 | Search and filters |
| queue | cmp.work-queue | rail | primary_workspace | queue | S1 | Orders arrive one by one |
| order | cmp.record-summary | — | context_panel | evidence | S2 | What is being decided |
| routing | cmp.rule-checks | — | context_panel | evidence | S2 | Which routing reason |
| exposure | cmp.exposure-meter | — | supporting_analysis | evidence | S3 | How far past the limit |
| signals | cmp.signal-list | — | supporting_analysis | evidence | S4 | Whether customer pays |
| dso | cmp.trend-chart | — | supporting_analysis | evidence | S4 | Payment behaviour trend |
| thread | cmp.activity-thread | — | secondary_context | evidence | S4 | Sales conversation |
| suggestion | cmp.ai-insight | — | action_area | decision | S5 | AI-drafted reason |
| decision | cmp.ending-picker | — | action_area | decision | S5 | The commit |
| confirm | cmp.confirm-dialog | — | action_area | — | S5 | Check before sending |
| receipt | cmp.receipt | — | validation_feedback | decision | S5 | What was recorded |

### Placement rules applied
- **Rule 2:** endings sit beside exposure and payment signals (the reason quotes them)
- **Rule 4:** each ending names where it goes (Nisha for approve, Arun for reject/hold)
- **Rule 5:** conversation with Sales is background, sits last in the evidence column

---

## §14. Primitives (30 — Carbon Design System)

| Primitive | Carbon equivalent |
|---|---|
| `prim.button` | Button |
| `prim.icon-button` | IconButton |
| `prim.link` | Link |
| `prim.text-input` | TextInput |
| `prim.number-input` | NumberInput |
| `prim.textarea` | TextArea |
| `prim.select` | Select / Dropdown |
| `prim.date-input` | DatePicker (single) |
| `prim.search` | Search |
| `prim.checkbox` | Checkbox |
| `prim.radio` | RadioButtonGroup |
| `prim.radio-tile` | TileGroup + RadioTile |
| `prim.toggle` | Toggle |
| `prim.slider` | Slider (with input) |
| `prim.tag` | Tag (read-only) |
| `prim.status` | Status icon + text (@carbon/icons-react) |
| `prim.notification` | InlineNotification / ActionableNotification |
| `prim.tabs` | Tabs (contained) |
| `prim.content-switcher` | ContentSwitcher |
| `prim.data-table` | DataTable with toolbar, selection, expansion |
| `prim.structured-list` | StructuredList (condensed) |
| `prim.tile` | Tile / ClickableTile |
| `prim.modal` | ComposedModal |
| `prim.progress-bar` | ProgressBar / MeterChart (stacked segments) |
| `prim.tooltip` | Toggletip / DefinitionTooltip |
| `prim.overflow-menu` | OverflowMenu |
| `prim.inline-loading` | InlineLoading / SkeletonText |
| `prim.chart-marks` | @carbon/charts-react (SVG marks, axes, gridlines) |
| `prim.header` | Header / HeaderName / HeaderGlobalBar (UI Shell) |
| `prim.side-nav` | SideNav / SideNavMenu / SideNavLink (UI Shell) |

---

## §15. Key Design Decisions

1. **One screen is the default.** Split only for a stated reason (order gate, device constraint).
2. **A pattern gives regions; components fill them via slots.** Slots are jobs, not positions.
3. **Ordering within a region:** by step number, background last.
4. **State-only components** (confirm-dialog, receipt, ending-picker) appear when their state triggers — modal on confirm, receipt on done.
5. **Patterns can embed:** FD-10 inside FD-03, FD-09 inside FD-06. The embedded pattern adds no regions.
6. **"Built with" panel:** shows the pattern, every drawn component with slot/region/step, step coverage, placement rules applied, and whether the screen matches its spec.
7. **Same category → different pattern:** work conditions (volume, frequency, urgency) drive the variant, not the category alone.
8. **Grid:** 2× grid, widths in /16. Pinned regions stay visible during scroll.
9. **Themes:** White / Gray 10 light, Gray 100 dark. Shell stays dark in both.

---

## §16. How to Use This Formula

To build a screen for a new task:

1. **Write the task card** — trigger, steps, endings, rules, category, work conditions
2. **For each step** — list required_information and required_actions
3. **Pick components** — one for each need; check if an existing component fits before making a new one
4. **Pick a pattern** — from the category and work conditions; check if an existing variant fits
5. **Assign slots** — each component gets the slot that matches its job
6. **The pattern gives regions** — slots map to regions; the component is placed
7. **Check the 6 placement rules** — adjust if violated
8. **One screen unless a stated reason splits** — order gate, device, can't-be-seen-together
9. **Write screens.json** — manifests with every component's inst, cmp, variant, slot, region, steps, reason
10. **"Built with" check** — every step is covered; every component traces to a step's need
