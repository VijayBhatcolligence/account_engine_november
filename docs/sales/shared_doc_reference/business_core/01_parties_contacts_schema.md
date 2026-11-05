# Parties & Contacts (Business Core): the schema, read for our tasks

**What this is:** our reading of the P&C schema (copy in `aikyat-parties-contacts/`, commit `8760abc`, 26-Oct-2026). It covers what each table holds, the rules, how a `party_id` flows, which tables our tasks use, and what P&C has not built yet. **Their files win** over this reading.

**Status:** 30-Oct-2026; **rev 11, 2-Nov-2026** · Owner: Vijay · Used by: `docs/accounts_executive/case_engine/01_backend_build_guide.md` §3.19 (rev 11).

**Rev 11 (Vijay, 2-Nov-2026, guide input 29, kept simple):** "It's not an API … finally it is one database"; then "our submission goes to P&C, all checks happen there; an error is returned, else the new party id." So:
- `pc` sits in **the same PostgreSQL database** as `accounting` and `accounting_support`;
- after the last approval we **hand the party to P&C**; P&C runs all its own checks, writes its own rows, and answers the **`party_id`** or an **error**. How it stores the party is P&C's work;
- we read `pc` with our own queries (*core reads*);
- **we follow their schema and never change it** (§3).
- The P&C team's own papers still describe an API (Proposal 1: "no database join"; Proposal 2: `POST /parties`). That is a difference to settle with them (ask A8, §6).

**Sources:**
- the DDL (`runtime/…/db/migrations/000…010`);
- the logical model (`model/logical-model.md`);
- Proposals 1 and 2 (`docs/proposals/m2-tally/`);
- the P&C team's deck "Parties and Contacts: the data model" (27-Oct-2026, pasted by Vijay). Its Aikyat Biscuits example is used in §4.

---

## 1. P&C in one picture

```text
                         ┌──────────────────────────────────────────────┐
  Identity, HR,          │ Aikyat Parties & Contacts (schema pc)         │       Accounting, Billing,
  Control Plane  ──────► │  PARTY    anyone we transact with             │ ────► Procurement, Stores, our tasks
  (facts they own)       │  CONTACT  anyone we communicate with          │       keep ONLY the party_id
                         │  one party_id per company or person           │       + their own facts (money, terms)
                         └──────────────────────────────────────────────┘
          one PostgreSQL database: schema pc beside schemas accounting, accounting_support
          our action:  BEGIN · SET LOCAL app.current_workspace · INSERT ours + INSERT pc.* · COMMIT
```

- **P&C holds identity:** who it is (name, PAN, GSTIN), where it is (locations), what it is to us (customer, supplier: a *standing*), how it ties to other parties, and who we talk to (contacts, email, phone).
- **P&C holds no money, stock or orders.** "Standing does not create the customer account, supplier account, … ledger, workflow, permission or consent that another product owns" (`party_standing` comment, DDL 003).
- **Every other app keeps only `party_id`** and reads the rest from P&C. Bank details, credit terms, MSME and category **stay in our tables** (Proposal 2: "money terms, not identity").

---

## 2. The 32 tables (236 columns)

**Status of the build (commit `8760abc`):**
- All 32 tables exist as DDL.
- The running service has **one business read**, `GET /api/v1/workspaces/{workspace_id}/people`, and a daily sync from Control Plane and Identity.
- **No write API for parties yet** (`POST /parties` is Proposal 2). **Since rev 11:** we hand the party to P&C in the same database and get back the `party_id` or an error (§4). How that hand-over is made is ask A1.

| File | Table | Cols | What it holds | Used by us |
|---|---|---|---|---|
| 001 | `legal_form` | 3 | Catalogue: legal forms (only `IN_PVT_LTD` seeded) | Task 1 (code sent) |
| 001 | `identifier_scheme` | 3 | Catalogue: `IN_PAN`, `IN_GST` | Task 1 (code sent) |
| 001 | `identifier_scheme_standing` | 5 | Catalogue: GST standings `active`, `suspended`, `cancelled`, `none_held` | Task 1 (code sent) |
| 001 | `purpose_type` | 4 | Catalogue: business functions (empty) | – |
| 001 | `party_standing_type` | 3 | Catalogue: what a party is to us: customer, supplier, employee, prospect (**named, not seeded**) | Task 1 (code sent) |
| 001 | `party_relationship_type` | 6 | Catalogue: party-to-party ties, e.g. owned_by (empty) | – |
| 001 | `capacity_type` | 6 | Catalogue: in what capacity a contact acts for a party (empty) | – |
| 002 | `private_anchor` | 4 | The hidden identity behind `party_id` and `contact_id`. **Never exposed** | – (P&C's own) |
| 002 | `party` | 7 | **A company or a person with standing:** kind, legal name, legal form | Task 1 writes · Task 2 reads |
| 002 | `contact` | 8 | Someone or something we reach: a person, a shared desk (*destination*), a system (an AI agent) | Task 1 writes |
| 002 | `identity_merge` | 5 | Two records found to be one: a redirect, decided by a person | – |
| 003 | `operated_party` | 7 | **Which party is ours:** "this workspace runs this company" | Task 1 · Task 2 read |
| 003 | `party_trade_name` | 8 | A name the party trades under | Task 1 writes |
| 003 | `party_standing` | 10 | **What the party is to us:** supplier / customer of our company, since when | Task 1 writes |
| 003 | `business_location` | 13 | A place: address lines, city, state (ISO `IN-KA`), PIN, country | Task 1 writes · Task 2 reads |
| 003 | `party_relationship` | 9 | Party ↔ party, e.g. the mill is owned by a group | – |
| 004 | `party_identifier` | 11 | **PAN and GSTINs:** scheme, scope (`IN`, `IN-KA`), value, GST standing, since / until | Task 1 writes · Task 2 reads |
| 005 | `capacity` | 8 | Workspace list of capacities (empty) | later (ask A5) |
| 005 | `contact_party_association` | 10 | A person acts for a party, in a capacity | later (ask A5) |
| 005 | `contact_point` | 10 | A route: email, phone, url, postal (a postal route points to a location) | Task 1 writes |
| 005 | `route_use` | 10 | In what capacity and purpose a route applies | – |
| 005 | `handler` | 10 | Who reads a shared desk | – |
| 005 | `representation` | 10 | A contact may act for a party (stronger than association) | – |
| 005 | `principal_binding` | 9 | A login (Identity) mapped to a contact | – |
| 006 | `purpose` | 8 | Workspace list of business functions | – |
| 006 | `contact_party_association_purpose` · `route_use_purpose` · `business_location_purpose` | 4 · 4 · 4 | Sets of purposes (link rows) | – |
| 007 | `claim` | 12 | Evidence: an assertion with its source; never overwritten | – (not written until ask A7) |
| 007 | `proposal` | 10 | A candidate change waiting for a decision | – |
| 007 | `proposal_supporting_claim` | 4 | Claims behind a proposal | – |
| 007 | `record_history` | 11 | Append-only audit of accepted changes. **Nothing writes it yet:** "the first write path records history, because only it knows the performer" (db README) | – (P&C's own) |

**By file:**

| File | Tables | Columns |
|---|---|---|
| 001 catalogues | 7 | 30 |
| 002 identity kernel | 4 | 24 |
| 003 parties | 5 | 47 |
| 004 legal identity | 1 | 11 |
| 005 contacts | 7 | 67 |
| 006 workspace vocabulary | 4 | 20 |
| 007 evidence | 4 | 37 |
| **Total** | **32** | **236** |

Migrations 000 and 008 create schemas and comments only; 009 seeds the catalogues; 010 creates the API's database role and its grants.

### 2.1 Columns of the tables our tasks use

Every workspace table also has `workspace_id` (text) and `recorded_at` (immutable). Most also have `updated_at` (set by a trigger). Ids are **uuid**.

| Table | Columns |
|---|---|
| `party` | party_id · workspace_id · party_kind (`person` \| `organization`) · legal_name · legal_form_code (organization only) · recorded_at · updated_at |
| `party_identifier` | party_identifier_id · workspace_id · party_id · scheme_code (`IN_PAN`, `IN_GST`) · jurisdiction_scope_code (`IN` or `IN-KA`) · value · standing_code · since · until · recorded_at · updated_at |
| `party_trade_name` | trade_name_id · workspace_id · party_id · name · since · until · recorded_at · updated_at |
| `business_location` | business_location_id · workspace_id · party_id · display_name · address_lines (text[]) · locality · administrative_area_code (ISO 3166-2, `IN-KA`) · postal_code · country_code (`IN`) · since · until · recorded_at · updated_at |
| `party_standing` | party_standing_id · workspace_id · party_id · **operated_party_id** (not null: "customer of WHICH of our businesses") · standing_type_code · trade_name_id · since · until · recorded_at · updated_at |
| `operated_party` | operated_party_id · workspace_id · party_id · since · until · recorded_at · updated_at |
| `contact` | contact_id · workspace_id · contact_kind (`person` \| `system` \| `destination`) · display_name · accountable_party_id (required for a desk or a system, none for a person) · destination_role (`general` \| `qualified`) · recorded_at · updated_at |
| `contact_point` | contact_point_id · workspace_id · contact_id · channel_kind (`email` \| `phone` \| `url` \| `postal`) · route_value · business_location_id (postal only) · since · until · recorded_at · updated_at |
| `legal_form` | legal_form_code · jurisdiction_code · display_name |
| `identifier_scheme` | scheme_code · jurisdiction_code · display_name |
| `identifier_scheme_standing` | scheme_code · standing_code · display_name · definition · requires_value |
| `party_standing_type` | standing_type_code · display_name · definition |

**Seeded today (009):** `IN_PVT_LTD`; `IN_PAN`, `IN_GST`; for `IN_GST` the standings `active`, `suspended`, `cancelled`, `none_held`. Nothing else.

---

## 3. Rules every table follows (and what they mean for us)

| Rule (P&C) | In their words | What our tasks do |
|---|---|---|
| **End it, never delete it** | A closed place gets an `until` date | We never ask P&C to delete; a change is a new row or an `until` |
| **No status column** | "No `status` and no `is_active`, anywhere. Currency is derived from `since` / `until`" | "Is it still our supplier?" = a standing with `until` empty or in the future |
| **Empty means not known** | Never false, never "all"; an empty string is refused | We send nothing for an unknown value (e.g. a legal form P&C does not list), never a guess |
| **Two clocks** | `since` / `until` = when it was true · `recorded_at` = when Aikyat learned it | The form's dates go to `since`; our own timestamps stay ours |
| **A match never merges by itself** | "Two records with one GSTIN? A person decides." No uniqueness on (scheme, value) | Our "already set up" check finds a GSTIN or PAN match and **asks the AE** (Use party, or send back). The system never joins two parties |
| **Keys are uuids** | `party_id`, `contact_id` and the anchor id are the same value for one identity | Our `party_id` columns are `uuid`; the app's `P-0141` is a display id |
| **Workspace isolation** | Every row has `workspace_id`; row-level security is enabled, **forced**, and fails closed on `app.current_workspace` | Our legal entity maps to one workspace and one operated party (ask A6); our core reads run in that workspace |
| **One database** (rev 11) | Their papers: "read through the P&C API — no database join" (Proposal 1). Their db README forbids joins only between `pc` and `standin` | **Vijay (input 29): one database.** We hand P&C the party. **Rev 12 (2-Nov, after reading all of this folder):** we follow Proposal 1 and the boundary map ("neighbours do not write one another's authoritative state directly"): **no FK into `pc`, no SQL join**; reads go through P&C's read interface. D24 is dropped |
| **Keep what you used** | Model §7: products that must keep what they used copy the values into their own records | A statutory document (the invoice) **copies** the buyer's name, GSTIN and address when it is issued |
| **Evidence is not acceptance** | Observations stay claims until a governed action accepts them; an authorised direct action still keeps attribution and evidence | Our **last approval** is the governed action. The hand-over carries the source (request id, form number). How P&C records it is P&C's (ask A7) |

**P&C ids in our tables (rev 12).** We keep four P&C ids, each a **plain uuid with no foreign key**: `party_id` (the party), `party_standing_id` (its customer / supplier standing towards our company), `gst_registration_id` (the `party_identifier` row of the GSTIN an account bills or buys under) and `location_id` (a `business_location`). Our company's `party_id` and `operated_party_id` sit on `accounting.legal_entity` (Proposal 1). If P&C merges two parties, or a standing ends, our account can close (`subledger_account.closed_reason`); the reaction is Task 1 gap G18.

### 3.1 The hand-over (rev 11, kept simple)

| We give P&C | We get back |
|---|---|
| The party: kind and legal form (from the constitution), legal name, trade name (if any) | **OK:** the new `party_id` (uuid). Our request → `party_registered` |
| PAN; GSTIN with its state (`IN-KA`) and portal status | **Error:** what is wrong (e.g. "this GSTIN is already a party", a missing value, a code it lacks). Our request → `rejected_by_pc`; the AE fixes it (or uses that party) and submits again |
| Address; the desk's email and phone | |
| The standing: supplier / customer of our company | |
| The source: request id, form number | |

- **A used party** (the AE pressed *Use party*; for example, a customer that is already our vendor): only the standing is handed over (ask A7). P&C answers the same `party_id`.
- **Checked first (rev 13):** at Submit, before any approval, we ask P&C whether it would accept the hand-over (ask A9) and search it (FindParties). After the last approval only the write is left.
- **All checks are P&C's:** duplicates, codes, its own rules. **How it stores the party** (which `pc` rows) is P&C's work, not ours.
- **Never:** change P&C's DDL, or write `pc` rows ourselves.

---

## 4. How a `party_id` flows (the deck's example, then our tasks)

Ids are shown short (`P-1`, `OP-1`); each is a uuid. Grey rows in the deck = stored before; here every step adds rows.

**Step 0 · our company (Proposal 1).** At onboarding of the workspace, before any task:

| Table | Row |
|---|---|
| `party` | **P-1** · organization · Aikyat Biscuits Pvt Ltd · IN_PVT_LTD |
| `operated_party` | **OP-1** · party P-1 · since 1 Apr 2010 ("the company we run") |
| `party_identifier` | PAN (scope IN) · GSTIN `29…` (scope IN-KA, active) · GSTIN `33…` (scope IN-TN, active) |
| `business_location` | Bengaluru plant (IN-KA) · Hosur unit (IN-TN) |
| ours: `accounting.legal_entity` | **LE-1** · `party_id` = P-1 (Proposal 1 adds this column) |

**Task 1 · a new customer** (Coastal Bakes, form CRF-0019 from Arun). Nothing reaches P&C until the **last approval**:

| When | What happens | P&C | Ours | `party_id` |
|---|---|---|---|---|
| Draft → submitted → approved | The AE types the form; AM, CC and CO approve | – (only a **search**: is this PAN or GSTIN already a party?) | `party_account_request` (values), `approval_step` ×3 | none yet |
| Register (automation `party-registration`) | We hand the party to P&C; P&C checks it | P&C writes its rows (the party, PAN, GSTIN, address, desk, standing "customer of OP-1") | OK → `party_id` on the request, state `party_registered` · error → `pc_errors`, state `rejected_by_pc` | **born here**, in P&C's answer |
| Open AR account (automation) | Under Trade Receivables › Domestic | – | `subledger_account` with the `party_id` | carried |
| Activate (automation) | Terms, credit limit, billing go live; request → `active` | – | `party_account`, `party_credit_limit` with the `party_id` | carried |

- **The same company later becomes our supplier:** a second standing (supplier of OP-1) on **the same** party, never a second party. On our side it gets a second account (AP).
- **Rejected by P&C** (e.g. the GSTIN is already a party): nothing is created; the AE uses that party or fixes the form, and submits again.

**Task 2 · a sales invoice** to Sri Lakshmi Distributors (account ACC-1201):

| Step | Reads from P&C (by `party_id`, our SQL) | Written by us |
|---|---|---|
| Open / Save | buyer `party` (legal name), `party_identifier` (GSTIN, its state), `business_location` (address, PIN, state) → place of supply | invoice draft |
| Submit | the e-invoice pre-check: GSTIN valid, PIN 6 digits | – |
| Issue (the number) | our own GSTIN: P-1's `IN_GST` for the branch state (`IN-KA`), found through OP-1 | **a copy** of the buyer's name, GSTIN and address on the invoice: the legal record keeps what it used |
| Post | – | the journal line carries `party_id` (the AR line) |

---

## 5. What our tasks use

| P&C table | Task 1 (vendor / customer creation) | Task 2 (sales invoice) |
|---|---|---|
| `party` | P&C writes (from our hand-over) · read (search) | read |
| `party_identifier` | P&C writes · read (search by GSTIN / PAN) | read (buyer GSTIN; our GSTIN) |
| `party_trade_name` | P&C writes (when the form has one) | – |
| `business_location` | P&C writes | read |
| `contact` | P&C writes (the party's general desk) | – |
| `contact_point` | P&C writes (email, phone) | – |
| `party_standing` | P&C writes (supplier / customer of OP-1) · read (already ours?) | – |
| `operated_party` | read (OP-1 from our legal entity) | read |
| `legal_form` · `identifier_scheme` · `identifier_scheme_standing` · `party_standing_type` | codes handed over must exist | – |
| **Total** | **12** (7 P&C writes from our hand-over · 1 read · 4 catalogues) | **4** read |

**Never ours:** no task creates a `pc` table or migrates it. **Since rev 11** we hand P&C the party and read `pc` ourselves (§3.1); P&C writes its own rows.

---

## 6. What we need from P&C: our asks (rev 11)

These are **gaps** in Task 1 and Task 2 until P&C answers. Each task lists the ones it needs (section P.1). Rev 10's API asks are replaced: same database, one hand-over, our own reads.

| # | Ask | Why we need it | P&C's own status |
|---|---|---|---|
| A1 | **The hand-over:** how we give P&C a party in the same database, and what it answers (`party_id`, or errors with codes) | Task 1 Register | Proposal 2 describes it as `POST /parties` |
| A2 | Read rights on `pc` for our service (the core reads) | Task 1 search, Task 2 buyer | 010 grants only their own API role |
| A3 | Standing types `supplier` and `customer` seeded | Task 1 standing | Named, not seeded. Proposal 2 open point: "KM: wording" |
| A4 | Legal forms for the app's constitutions: partnership, LLP, company forms, trust / society, government, HUF / AOP | Task 1 legal form | Only `IN_PVT_LTD`. Until then sent empty (not known) |
| A5 | A capacity for "the contact person on the form" | Task 1 contact person | `capacity` is empty. Until then the contact person stays on our request only |
| A6 | Our company as an operated party; our legal entity → workspace | Every standing | Proposal 1; the daily sync copies each workspace's operating company |
| A7 | Add a standing to a party that already exists (a used party) | Task 1 *Use party* | – |
| A9 | **A check that writes nothing** (rev 13): we give the party (or only the role, for a party it has) at Submit, before any approval, and P&C answers OK or the same errors the real write would give | Task 1 Submit, check 2 (SUB-28) | – (Proposal 2 has only the write, `POST /parties`) |
| A8 | A Udyam identifier scheme (`IN_UDYAM`): the Udyam number is an authority registration, which their identifier catalogue is for; and the wording of the standing types (Proposal 2: "KM: wording"). **Rev 12:** the FK ask is dropped (no FK into `pc`) | Task 1 MSME vendor (`party_account.udyam` holds it until then) | No Udyam scheme; standing types named, not seeded |

---

## 7. Our old `party_master` → P&C, field by field

The app keeps its own words (it is fixed). Its mock log still says `party_master.*`, and that is a rename in each task's P.3.

| App field | Old table · column (dropped) | P&C table · column | Note |
|---|---|---|---|
| `legalName` | `party.legal_name` | `party.legal_name` | |
| `tradeName` | `party.trade_name` | `party_trade_name.name` | a row only when given |
| `pan` | `party.pan` | `party_identifier` IN_PAN, scope `IN` | PAN has no standing |
| `gstin` (+ portal status) | `party_gstin.gstin`, `.status` | `party_identifier` IN_GST, scope `IN-KA`, `standing_code` active / suspended / cancelled | the scope comes from GSTIN digits 1–2 |
| `state` (worked from the GSTIN) | `party.state_code`, `party_gstin.state_code` | `party_identifier.jurisdiction_scope_code` · `business_location.administrative_area_code` | ISO `IN-KA`. **The GST code ↔ ISO list (29 = IN-KA) is not P&C's**: ours, `accounting_support.gst_state_code` |
| `addressLine` · `city` · `pincode` | `party.address_line`, `.city`, `.pincode` | `business_location.address_lines`, `.locality`, `.postal_code`, `country_code` IN | |
| `email` · `phone` | `party.email`, `party_phone.phone` | `contact_point` (email, phone) on the party's **general desk** (`contact`, destination, general) | Proposal 2 |
| `contactPerson` | `party.contact_person` | `contact` (person) + `contact_party_association` | ask A5; until then not written |
| `constitution` (worked from the PAN) | `party.constitution` → `constitution_code` | `party.party_kind` (individual, proprietorship → person; the rest → organization) + `legal_form_code` | ask A4 |
| `resident` (worked) | `party.resident` | **not P&C's** | a tax status (TDS on non-residents): `accounting_support.party_account.resident` |
| the role: supplier / customer of our company | `party_role` (type, since, legal_entity_id) | `party_standing` (standing_type_code, operated_party_id, since) | ask A3, A6 |
| form from, form no, entered by | `party_role.form_from_person_id`, `form_no`, `entered_by_person_id` | stay on **our** request; travel as the hand-over's source | |
| the party id (`P-0141`) | `party.id` text | `party.party_id` **uuid** | given in P&C's answer to our hand-over |

**Dropped: 6 tables** (`party_master.state_code`, `constitution_code`, `party`, `party_gstin`, `party_phone`, `party_role`). One moved: the GST state list, now `accounting_support.gst_state_code`, keyed by the ISO code.
