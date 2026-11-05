# Aikyat Parties and Contacts — Product Charter

> **Status: Governing product architecture — 2026-10-02.**
>
> **Authority:** Derived from `aikyat-concept:architecture/adr-aikyat-parties-and-contacts.md` and `aikyat-concept:architecture/sl-aikyat-parties-and-contacts.md`. This record fixes product purpose and L0/L1 boundaries. Detailed design requires separate review.
>
> **Transitional filename:** The filename retains `aikyat-business-core` until file naming is handled separately. It does not preserve the former product name or charter.

## Charter

> **Aikyat Parties and Contacts is the workspace-scoped Foundation capability that keeps coherent who or what the business deals with and who or what its users may reach in order to conduct that business.**

It serves business operations, communication, collaboration, and Corporate Support Functions without absorbing their work. Its meaning and authority are supplied consistently by Aikyat; each workspace governs its own state.

## Product shape

The product has three conceptually distinct responsibility areas:

1. **Parties** — people and organizations with accepted business or legal standing, rights, or obligations.
2. **Contacts** — stable business-interaction identities through which people, organizational destinations, and systems may be reached or may perform attributable actions.
3. **Contactability** — the contextual answer to which Contacts a user may reach and through which channels.

These responsibilities belong to one product because Party and Contact realities must remain coherent across business operations and communication. Their different lifecycles do not require different product authorities.

## Primary experience

**Aikyat Contacts** is the product's primary user-facing application. It presents the broad business-contact experience.

Communication and collaboration products consume narrower contactability views for their channels. Business-operations products consume Parties, Contacts, and contactability in the context of their work. Neither relationship makes Aikyat Contacts a communication transport or an operational workflow system.

## Governing distinctions

- Party and Contact are related aspects of business reality; neither is a synonym for the other.
- A Contact is a canonical business-interaction identity, not merely an entry in a viewer-specific list.
- A contactability answer is contextual. It does not replace or redefine the Contact.
- Being known, reachable, permitted, and preferred are different properties.
- Association, representation, authorization, and actual action remain different facts.
- “Actor” describes a role in an Activity; it is not a parallel foundational identity beside Party and Contact.
- An Organization may be presented through its Party identity and related Contacts without manufacturing a duplicate Organization Contact.
- Internal identity machinery does not become a third generic business concept exposed to consumers.

## Product boundary

Aikyat Parties and Contacts owns the coherent product meaning of Parties, Contacts, and Contactability. It governs its own accepted facts and the composed business-contact answer.

It does not own:

- business transactions, accounts, workflows, or professional decisions;
- communication transport, messages, calls, meetings, presence, or channel behavior;
- authentication principals, credentials, sessions, or workspace membership;
- workforce relationships, organization structure, positions, or assignments;
- general grants, denies, barriers, legal restrictions, or cross-cutting policy evaluation;
- all purpose-specific consent merely because it affects communication;
- a universal Matter, work-group, participation, or collaboration model; or
- a universal Business Understanding or Evidence Corpus.

Adjacent facts and decisions may influence Contactability without moving into the Parties or Contacts responsibility areas or changing their semantic owner.

## Boundary invariants

- The product is workspace-scoped and does not create an enumerable global directory.
- Source authority remains with the product that owns the fact or decision.
- Contactability owns the composed answer and disclosure at its boundary; it does not acquire every contributing policy.
- Communication products retain final responsibility for their channel action.
- HR structure does not move into Contacts merely because it influences contactability.
- A communication route does not by itself prove identity, representation, or authority.
- Cross-product reuse is necessary but not sufficient to admit a fact.
- The absence of another owner is not an admission rule.
- Ordinary users encounter a coherent business-contact experience rather than the internal ontology.

## Product relationships

The governing L1 relationships are recorded in [`seams-aikyat-business-core.md`](seams-aikyat-business-core.md). Neighbouring products retain their own architecture authority and must approve any later reciprocal contract that changes their obligations.

## Deliberately delegated design

This charter does not approve or prescribe:

- logical or physical schemas;
- identifiers, cardinalities, or storage topology;
- API, event, query, or command shapes;
- policy languages or evaluation mechanics;
- channel and preference vocabularies;
- assurance, retention, erasure, availability, or federation mechanics;
- migration or compatibility behavior; or
- repository, package, and deployment naming.

Those decisions belong to later product-design and reciprocal-contract reviews. Existing model, contract, research, and implementation artifacts remain inputs to that work; they do not override this charter merely because they already exist.

## Authority history

- **2026-07-30:** Aikyat Organization became Aikyat Business Core after workforce authority moved to Aikyat HR.
- **2026-09-24:** the portfolio narrowed Business Core to shared Party-and-contact reference meaning.
- **2026-10-02:** the portfolio rechartered the product as Aikyat Parties and Contacts, established Parties, Contacts, and Contactability as its three responsibility areas, and placed Aikyat Contacts as its primary application.
