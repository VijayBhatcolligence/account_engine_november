# Aikyat Parties and Contacts — Logical model

> **Status: Approved product logical model — 2026-10-02.**
>
> This model derives from the governing [Product Charter](../architecture/ra-aikyat-business-core.md) and [L1 Boundary Map](../architecture/seams-aikyat-business-core.md). It supersedes the former Anchor/Party/Actor model at the logical-model level. It does not approve physical schemas, APIs, events, migrations, policy mechanics, or runtime topology.

## 1. Scope

This model describes the logical information needed for three product responsibilities:

1. **Parties** — people and organizations with accepted business or legal standing, rights, or obligations;
2. **Contacts** — stable business-interaction identities through which people, organizational destinations, and systems may be reached or may perform attributable actions; and
3. **Contactability** — the contextual answer to which Contacts a user may reach and through which channels.

It is a logical model, not a database design. A logical record may later become a table, aggregate member, document, projection, or another physical representation. No physical choice may erase the distinctions and invariants recorded here.

## 2. Conventions

- Every workspace governs its own records. Cross-workspace federation never silently creates one shared master graph.
- Stable logical identities survive names, routes, roles, and ordinary lifecycle changes.
- Business-effective time and recording time remain distinct.
- Missing information means unknown or not recorded; it is never an implicit wildcard, denial, consent, or falsehood.
- A claim about the world and the workspace's decision to rely on it are different records or states.
- Product catalogues contain governed reusable meaning. Workspace vocabulary may extend them without pretending that matching labels have identical semantics.
- Relationships, routes, representation, Principal bindings, and contactability inputs do not grant resource access by themselves.
- User experiences compose the model behind ordinary business language; users are not expected to administer ontology records.

## 3. Model map

```text
private_anchor
  ├── party                         Person or Organization with standing
  │     ├── operated_party
  │     ├── party_standing
  │     ├── party_identifier
  │     ├── party_trade_name
  │     ├── business_location
  │     └── party_relationship
  │
  └── contact                       Person, System, or Destination
        ├── contact_point
        │     └── route_use
        ├── contact_party_association
        ├── handler
        ├── representation
        └── principal_binding

proposal + claim                    evidence, candidate change, acceptance
identity_merge                      identity-wide accepted redirect
record_history                      internal accepted-change audit

Contactability                      computed above the registries
  consumes owned facts + adjacent decisions
  produces AuthorizedContactProjection
```

Party and Contact are the only public **subject** identities. `private_anchor` preserves internal identity continuity; subordinate typed references such as BusinessLocation remain referenceable without becoming generic subjects.

## 4. Identity kernel and public facets

### `private_anchor`

One workspace-local canonical identity used internally to keep Party and Contact facets coherent.

| Logical field | Meaning |
|---|---|
| `anchor_id` | Stable workspace-local identity value. |
| `workspace_id` | Workspace governing the identity. |
| `anchor_kind` | Immutable ordinary kind: `person`, `organization`, `system`, or `destination`. |
| `created_at` | Recording time at which the identity was created. |

`private_anchor` is never exposed as a third generic subject, public reference type, API resource, partner identifier, or user-facing concept. Consumers express intent through `PartyRef` or `ContactRef`.

Allowed facets are structural:

| Anchor kind | Party facet | Contact facet |
|---|---:|---:|
| Person | Optional, once standing is accepted | Required |
| Organization | Required | Prohibited |
| System | Prohibited | Required |
| Destination | Prohibited | Required |

Only a Person may carry both facets. When it does, `party_id`, `contact_id`, and the private `anchor_id` denote the same semantic identity. That shared value does not make `PartyRef` and `ContactRef` interchangeable.

### `party`

A Person or Organization with accepted business or legal standing, rights, or obligations of its own.

| Logical field | Meaning |
|---|---|
| `party_id` | Stable typed Party identity; internally refers to the same-valued private Anchor. |
| `party_kind` | `person` or `organization`, consistent with the Anchor kind. |
| `legal_name` | Accepted legal name when established. |
| `legal_form_code` | Applicable legal form when established; absent when unknown or inapplicable. |

Every recorded Organization is a Party. A Person receives Party only when the workspace accepts a standing fact giving that Person rights or obligations of their own. Creating that first fact creates or reuses the Person Contact and adds Party to the same identity atomically. Party is not removed merely because one standing fact later ends.

Employment or affiliation with an external Party does not, by itself, give the worker Party standing in this workspace. Priya may therefore be an Acme-associated Person Contact without a Priya Party. If Priya later sells personally to an operated Party, the existing Person identity gains Party without re-keying.

### `contact`

A stable business-interaction identity that may be reached, may perform attributable actions, or may do both.

| Logical field | Meaning |
|---|---|
| `contact_id` | Stable typed Contact identity; internally refers to the same-valued private Anchor. |
| `contact_kind` | `person`, `system`, or `destination`. |
| `display_name` | Current interaction-facing label; not proof of legal identity. |
| `accountable_party_id` | Required for System and Destination; prohibited for Person. |
| `destination_role` | For Destination only: `general` or `qualified`; absent otherwise. |

Every Person is a Contact. A Person is accountable for themselves. Every System or Destination Contact has exactly one accountable Party whose governance boundary gives the non-person Contact meaning.

A System Contact may be action-only and have no route. A Destination Contact denotes a durable organizational destination. It may be qualified, such as Accounts Payable, Purchase Orders, Reception, or Customer Support, or it may be the general destination for an Organization Party.

Each Organization Party has at most one general Destination. It is created or reused when the first undifferentiated organizational route, such as a main email address or telephone number, is accepted. Further undifferentiated routes belong to that same Destination. The general Destination is the Organization's default interaction destination; it is not an Organization Contact and does not imply that every route applies to every business purpose.

A Destination may be reached or handled but never performs an Activity or represents a Party.

An Organization is never stored as a Contact. Aikyat Contacts may present an Organization Party as a composed card over its related people, systems, destinations, and routes without manufacturing a second Organization identity.

### Actor as an Activity role

There is no persistent `actor` record or public `ActorRef` in this model. When an Activity occurs, a Person or System Contact may occupy the performer role. The producing product records the Activity, the performer when known, and the relevant represented Party or destination separately.

An assisting instrument is attribution context, not another capability on the Contact. A Destination is never the performer. Receiving an interaction through a Destination does not prove which Person or System acted.

### `identity_merge`

An accepted identity-wide redirect when two same-kind private Anchors in one workspace are established as the same real subject.

| Logical field | Meaning |
|---|---|
| `merged_anchor_id` | Identity being redirected. |
| `survivor_anchor_id` | Identity that remains current. |
| `decision_ref` | Governed acceptance decision and evidence. |
| `accepted_at` | Recording time of the merge. |

The merge moves Party and Contact facets together. Independent Party and Contact merges may not disagree. New references resolve to the survivor; historical references remain interpretable. Email, phone, name, or Principal equality may propose a merge but never performs one automatically.

Kind correction is an exceptional governed repair, not a business lifecycle. It must reconcile every kind-dependent fact explicitly before completion.

## 5. Parties responsibility area

### `operated_party`

States that the workspace operates the business of a Party for an effective period. It does not mean employee, department, workspace member, or unrestricted administrator.

| Logical field | Meaning |
|---|---|
| `operated_party_id` | Stable workspace-to-Party association. |
| `party_id` | Operated Person or Organization Party. |
| `since`, `until` | Business-effective period when known. |

### `party_standing`

Reusable accepted standing of a Party relative to an operated Party, such as customer, supplier, employee, prospect, proprietor, guarantor, or another governed type.

| Logical field | Meaning |
|---|---|
| `party_standing_id` | Stable standing record. |
| `party_id` | Party bearing the standing. |
| `operated_party_id` | Operated Party to which the standing relates. |
| `standing_type_code` | Governed meaning of the standing. |
| `trade_name_id` | Optional trade name under which the standing is held. |
| `since`, `until` | Business-effective period when known. |

Standing does not create the operational customer account, supplier account, payroll record, ledger, workflow, permission, or consent owned by another product.

### Thin legal identity

The Parties area retains the following logical families from the earlier model because their meaning remains shared Party reference meaning:

- `legal_form` — reusable jurisdiction-specific legal-form vocabulary;
- `identifier_scheme` — governed authority-identifier vocabulary;
- `identifier_scheme_standing` — scheme-specific authority standing; and
- `party_identifier` — the workspace's accepted identifier or positively established absence fact for a Party, scope, and effective period.

An identifier is evidence and a Party fact, never the Party identity. Matching identifiers may propose duplicate review but do not silently merge identities. Detailed applications, filings, interpretations, tax determinations, and professional workflows remain with their specialist owners.

The initial governed Indian legal-identity vocabulary restores the earlier
approved MEP GST-standing decision and records the legal-form and identifier
codes approved with the first operated-business scenario. Exact display names
and definitions are:

| Catalogue | Code | Display name | Definition | Requires value |
|---|---|---|---|---:|
| `legal_form` | `IN_PVT_LTD` | Private limited company | — | — |
| `identifier_scheme` | `IN_PAN` | Permanent Account Number (PAN) | — | — |
| `identifier_scheme` | `IN_GST` | Goods and Services Tax Identification Number (GSTIN) | — | — |
| `identifier_scheme_standing` for `IN_GST` | `active` | Active | The authority currently records this GST registration as active. | Yes |
| `identifier_scheme_standing` for `IN_GST` | `suspended` | Suspended | The authority currently records this GST registration as suspended. | Yes |
| `identifier_scheme_standing` for `IN_GST` | `cancelled` | Cancelled | The authority records this GST registration as cancelled. | Yes |
| `identifier_scheme_standing` for `IN_GST` | `none_held` | None held | It has been positively established that the Party holds no GST registration for the stated jurisdiction scope and effective period. | No |

PAN has no standing vocabulary in the MEP. CIN remains an example of a possible
identifier scheme and is not part of this initial catalogue data. Taxpayer types
such as regular, composition, and SEZ are registration classifications, not GST
standings.

### `party_trade_name`

A durable name under which a Party conducts business. It is not another Party or Contact.

| Logical field | Meaning |
|---|---|
| `trade_name_id` | Stable identity retained across an ordinary rename. |
| `party_id` | Party conducting business under the name. |
| `name` | Current accepted business-facing name. |
| `since`, `until` | Effective use period when known. |

### `business_location`

The thin shared identity of a durable physical business presence of a Party.

| Logical field | Meaning |
|---|---|
| `business_location_id` | Stable subordinate reference. |
| `party_id` | Party whose presence is described. |
| `display_name` | Workspace-usable label. |
| `address` | Structured or ordered postal address when known. |
| `purposes` | Sourced location purposes when accepted. |
| `since`, `until` | Effective period when known. |

The same location may be referenced by Inventory, Manufacturing, HR, Taxation, or Accounting without becoming their warehouse, plant, workplace, registration, or accounting branch. Those facets remain domain-owned.

### `party_relationship`

An accepted, typed, effective-dated legal or business relationship between two Parties.

| Logical field | Meaning |
|---|---|
| `party_relationship_id` | Stable relationship record. |
| `from_party_id`, `to_party_id` | Directional Party endpoints. |
| `relationship_type_code` | Governed relationship meaning. |
| `since`, `until` | Effective period when known. |

Relationship vocabulary is admitted only when its meaning is reusable Party reference meaning. A relationship never grants resource access or action authority by itself.

## 6. Contacts responsibility area

### `contact_party_association`

An accepted connection between a Contact and a Party in a stated business capacity.

| Logical field | Meaning |
|---|---|
| `association_id` | Stable association record. |
| `contact_id` | Person, System, or Destination Contact. |
| `party_id` | Party with which the Contact is associated. |
| `capacity_code` | Governed or workspace-defined business capacity. |
| `purpose_refs` | Optional business functions of the association. |
| `scope` | Optional territory, location, or other admitted scope. |
| `since`, `until` | Effective period when known. |

Association explains a business connection. It does not prove representation, authorship, permission, or authority. A Person Contact's association with another Party is not used to connect that Person to their own same-identity Party facet.

System and Destination accountability also remains distinct from association. A shared-service Destination may be accountable to one Party and associated as a route for another.

### `contact_point`

A deliberately accepted technical route belonging to exactly one Contact.

| Logical field | Meaning |
|---|---|
| `contact_point_id` | Stable route identity. |
| `contact_id` | Contact that owns the route. |
| `channel_kind` | Email, phone, URL, postal, Aikyat application route, or another governed channel kind. |
| `route_value` | Channel-specific value or typed subordinate reference. |
| `since`, `until` | Effective period when known. |

A ContactPoint is not normally the Contact. Route replacement ends the old route and creates another while preserving interaction history. Equal technical values are matching evidence, not automatic identity proof or global uniqueness.

Raw headers, observed numbers, delivery attempts, and unresolved inbound routes remain with the communication product that observed them until a governed action accepts the Contact and route.

### `route_use`

States the capacity and purpose in which a ContactPoint applies.

| Logical field | Meaning |
|---|---|
| `route_use_id` | Stable applicability record. |
| `contact_point_id` | Route being qualified. |
| `association_id` | Optional association of the same Contact. |
| `purpose_refs` | Optional business purposes. |
| `scope` | Optional territory, location, channel capability, or comparable admitted scope. |
| `since`, `until` | Effective period when known. |

An absent association means the Contact's unqualified route; it does not mean the route applies to every Party the Contact may represent. Priya's Acme email can therefore apply to her Acme capacity without becoming her route when acting for another business.

A distinct real destination earns a Contact. A policy variation or day-of-week rule does not manufacture another destination identity.

### `handler`

An accepted relationship that a Person or System Contact reads, operates, or responds for a Destination Contact.

| Logical field | Meaning |
|---|---|
| `handler_id` | Stable handler relationship. |
| `destination_contact_id` | Destination being handled. |
| `handler_contact_id` | Person or System Contact handling it. |
| `contact_point_id` | Optional route-specific scope on the Destination. |
| `scope` | Optional purpose, region, or comparable admitted scope. |
| `since`, `until` | Effective period when known. |

Handling does not establish authorship of every interaction, representation of an associated Party, or authority to bind that Party.

### `representation`

The workspace's accepted, scoped understanding that a Person or System Contact may communicate or act for a Party.

| Logical field | Meaning |
|---|---|
| `representation_id` | Stable accepted representation record. |
| `representative_contact_id` | Person or System Contact; Destination prohibited. |
| `represented_party_id` | Party represented. |
| `representation_kind_code` | Governed kind of representation. |
| `authority_scope` | Business purpose or represented action family covered. |
| `since`, `until` | Effective period when known. |

Representation is stronger than association and remains distinct from access authorization and actual action. Only the represented Party or another governing legal source may establish or extend binding representation. A representative may renounce it. The workspace may decide whether to rely on evidence and may cease reliance without rewriting the source assertion.

No transitive delegation is inferred. A System Contact requires directly established authority for the represented Party unless a later governed model explicitly introduces delegation.

### `principal_binding`

The workspace's accepted business mapping from an Identity-owned Principal to a Person or System Contact.

| Logical field | Meaning |
|---|---|
| `principal_binding_id` | Stable binding record. |
| `identity_principal_ref` | Opaque Principal reference owned by Aikyat Identity. |
| `contact_id` | Person or System Contact; Destination prohibited. |
| `assurance` | Accepted assurance or evidence reference. |
| `since`, `until` | Effective period when known. |

Authentication proves control of a Principal, not human identity, affiliation, representation, Party standing, or business authority. Rebinding, merge, and correction retain evidence and do not silently rewrite prior Activities.

### Purpose vocabulary

Contacts may use governed platform purpose types and workspace-local purposes to describe business functions such as order intake, sales, payments, purchasing, or facilities. A label alone never creates product behavior. New canonical purpose meaning requires a real consumer and agreed semantics.

## 7. Evidence, proposals, and acceptance

### `claim`

One immutable attributable assertion or evidence item about a fact governed by this product.

| Logical field | Meaning |
|---|---|
| `claim_id` | Stable immutable evidence identity. |
| `workspace_id` | Workspace retaining the claim. |
| `claim_kind` | Typed meaning understood by the governed record family. |
| `subject_ref` | Party, Contact, relationship, route, or candidate identity concerned. |
| `asserted_values` | Typed asserted content. |
| `asserted_by_ref` | Known issuer when established. |
| `formation_method` | Extraction, direct observation, attestation, federation, or inference. |
| `evidence_ref` | Retained document, message, Activity, registry result, or other evidence. |
| `valid_from`, `valid_until` | Period the assertion concerns when stated. |
| `observed_at` | Recording of when the evidence was observed. |

Claims coexist and may disagree. Stronger evidence does not overwrite weaker or earlier evidence. Endpoint matching proves recognition of a route, not authorship. Identity matching remains a proposal until accepted.

### `proposal`

One candidate accepted-record creation, change, identity merge, or disposition.

| Logical field | Meaning |
|---|---|
| `proposal_id` | Stable candidate identity. |
| `record_kind` | Governed record family concerned. |
| `target_ref` | Existing accepted record for a change, when applicable. |
| `proposed_values` | Typed candidate state. |
| `supporting_claim_refs` | Claims available to the decision. |
| `outcome` | Open, accepted, rejected, superseded, or expired. |
| `decision_context` | Attributed decision, reason, policy version, and time. |
| `resolution_ref` | Accepted record or existing identity to which the proposal resolved. |

Each proposal concerns one governed decision. Acceptance may create a record, change an existing record, or resolve to an existing identity. Rejection remains available as memory so the same weak inference does not silently return. Authorized direct actions may accept a change without proposal ceremony but still preserve attribution and evidence.

### Accepted records

Accepted records express what this workspace currently relies on. They do not claim global truth. For an external Party or Contact, acceptance normally reflects evidence available to this workspace; federation may later add a stronger claim without overwriting the local history.

### `record_history`

Internal append-only audit of accepted creates, changes, merges, and governed deletion or redaction.

It preserves the changed record, prior and resulting state sufficient for audit, recording time, attributable performer Contact when known, relevant Activity, and decision basis. It is not a general cross-product temporal API. Products that must preserve what they used copy the required values into their own immutable or statutory records.

Governed personal-data erasure may redact eligible values when no lawful retention basis remains. The redaction action remains attributable without reproducing unlawfully retained data.

## 8. Contactability responsibility area

Contactability is a computed product capability above the Party and Contact registries. It answers:

> **For this viewer, in this business context, which Contacts are available through which channels?**

It keeps four dimensions distinct:

1. **Possible** — a suitable route or application capability exists.
2. **Permitted** — the viewer may discover the Contact, see the route, and attempt the interaction.
3. **Preferred** — applicable Contact, viewer, and organization choices rank or avoid otherwise permitted channels.
4. **Available** — the channel can currently receive or participate in the interaction.

### Inputs owned here

- accepted Parties and Contacts;
- ContactPoints and RouteUses;
- Contact-to-Party associations, handlers, and representation;
- directly administered communication preferences and consent for purposes owned by this product; and
- the workspace's accepted evidence and current views of those facts.

The exact preference and consent record vocabulary remains outside this candidate until the owning purpose, users, and scenarios are approved. Absence of such a record does not imply consent or prohibition.

### Inputs owned elsewhere

- Identity principals and authentication;
- Control Plane membership and entitlement;
- HR workforce, organization, position, assignment, and occupancy facts;
- Authorization and Governance grants, denies, barriers, legal restrictions, and cross-cutting policy decisions;
- purpose-specific consent and lawful basis from CRM, Marketing, HR, Governance, or another purpose owner; and
- channel capability, presence, availability, and product-specific eligibility from communication products.

Contactability consumes these inputs without copying their semantic ownership into the registries.

### `AuthorizedContactProjection`

Viewer-, context-, purpose-, and channel-specific computed output. It is disposable and rebuildable; it is never the Contact identity or source of truth.

The projection may contain only what the viewer is permitted to learn:

- permitted Contact identity and presentation;
- applicable Party and business capacity when disclosable;
- permitted channels and whether route values may be revealed or must remain relay-only;
- preferred and currently available choices when known; and
- an explanation referencing the contributing facts and decisions at an appropriate disclosure level.

Discovering a candidate is itself disclosure. Contactability must apply applicable policy before a Contact or route appears. Unknown or unavailable policy required for safe disclosure fails closed. Communication products enforce again when the interaction is attempted; Contactability is not the final authority for the channel action.

The registries remain independently usable and never depend on HR or Authorization. HR may reference Party or Contact without creating a dependency cycle through Contactability.

## 9. Cross-cutting invariants

1. **One semantic Person identity per workspace.** The Person's Contact and any later Party facet share one private Anchor and move together through merge or correction.
2. **Typed public intent.** Consumers use Party or Contact meaning; they never use private Anchor as a generic subject.
3. **Kind integrity.** Organizations are Party-only; Systems and Destinations are Contact-only; only Persons may have both facets.
4. **No manufactured Party.** Contactability, affiliation, route ownership, or Principal binding does not create Party standing.
5. **No manufactured Contact.** Presenting an Organization in Aikyat Contacts does not create an Organization Contact. Accepting an undifferentiated organizational route creates or reuses the Organization's general Destination instead.
6. **Internal and external symmetry.** The same logical records serve operated and external Parties and Contacts; stewardship, evidence, completeness, and authority differ.
7. **Evidence is not acceptance.** Observation and inference remain claims or proposals until a governed action accepts them.
8. **No relation grants access.** Standing, association, representation, handling, route ownership, and Principal binding remain inputs to decisions, not permissions.
9. **Route recognition is not identity proof.** Matching a technical endpoint does not establish performer, represented Party, authorship, or Matter.
10. **Independent lifecycles do not cascade silently.** Ending an association, route, representation, trade name, or Party standing exposes dependent decisions without inventing their outcomes.
11. **Source authority survives composition.** Contactability never turns external HR, Identity, authorization, privacy, or channel facts into registry-owned truth.
12. **Disclosure precedes action.** Candidate discovery and route revelation are policy-sensitive even before a message, call, or meeting is attempted.
13. **Partial knowledge remains useful.** Rich legal, relationship, and routing data never becomes a compulsory onboarding checklist for an SMB.
14. **AI follows governed paths.** AI may extract, infer, explain, and propose; it changes accepted state only through attributable governed actions.

## 10. Explicitly outside this model

- business transactions, customer and supplier accounts, commercial terms, orders, invoices, shipments, books, payroll, calculations, filings, and specialist workflows;
- messages, calls, meetings, delivery, threading, presence, channel accounts, and communication-resource membership;
- authentication, credentials, sessions, workspace membership, and entitlement;
- HR organization units, jobs, positions, assignments, occupancy, reporting structure, and authoritative employment lifecycle;
- general grants, denies, barriers, policy language, evaluation engine, and decision receipts;
- purpose-specific consent and lawful basis owned by another domain;
- Matters, Cases, tasks, documents, work groups, participation, and universal collaboration context;
- accounting branches, warehouses, plants, cost centres, territories, and generic operating structure; and
- a universal Evidence Corpus or workspace-wide Business Understanding.

## 11. Deferred until separately earned

- user-scoped business Contact ownership, employer access, portability, retention, and offboarding;
- exact communication-preference and product-administered consent records;
- federation and voluntarily published Contact resolution;
- representation-kind vocabulary and legal-basis detail;
- delegation and re-delegation beyond directly established representation;
- Principal-binding assurance, rebinding, correction, and cross-workspace behavior;
- scheme-specific legal and registration detail beyond shared Party reference meaning;
- legal succession and transfer of predecessor obligations or contact paths;
- System and Destination identity merge policy;
- general as-of queries and rollback; and
- complete privacy, retention, erasure, and data-subject-right mechanics.

Each deferral requires a real scenario, consumer, semantic owner, risk posture, and governed review. None is an invitation to add convenience fields.

## 12. Disposition of the pre-recharter model

| Former concept | Candidate disposition |
|---|---|
| `anchor` | Retained as private identity machinery; no public generic reference. |
| `party` | Retained as the typed standing facet for Person or Organization. |
| `actor` / `ActorRef` | Removed; actor becomes an Activity role of Person or System Contact. |
| `system_actor` | Becomes System Contact with one accountable Party. |
| Person route on Anchor | Moves to ContactPoint owned by Person Contact. |
| Organization route on Anchor | An undifferentiated route moves to the accountable Organization's general Destination; a qualified route moves to its durable qualified Destination. |
| `actor_party_affiliation` | Generalized to Contact-to-Party association, distinct from representation. |
| `contact_point_handler` | Becomes Contact-to-Contact Handler for a Destination. |
| route purposes embedded on route | Move to RouteUse so route identity and business-capacity applicability change independently. |
| Principal-to-Actor binding | Becomes Principal-to-Person/System Contact binding. |
| generic roles, legal facts, sites, relationships | Retained only where they pass the current Party boundary. |
| proposal, claim, merge, history | Retained and adjusted to typed Party and Contact references. |
| no product-owned contactability model | Replaced by Contactability above the independent registries. |

This disposition is conceptual. It creates no migration or compatibility promise until the candidate model is approved and implementation posture is separately decided.
