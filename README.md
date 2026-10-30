# Accounts Executive (R01): role app

Frontend for the Accounts Executive role in the Aikyat finance POC. It holds the task and UX documents and the mock app built from them. The current focus is one task: **setting up a new vendor or customer account** (T7 vendor finance fields, T12 customer finance fields, T17 Udyam).

| Path | What it is |
|---|---|
| `docs/tasks/01_accounts_executive_tasks_and_responsibilities.md` | The role read into 23 tasks and 3 responsibilities, a card per task, "What you fill in", open questions |
| `docs/ux/02_accounts_executive_designed_ui.md` | Each task card mapped to the 5 app areas: Dashboard · Task · Reports · CnC · Rules |
| `docs/ux/03_party_onboarding_design.md` | Vendor / customer onboarding: trigger, fields, checks, tables, APIs, events, open questions. The app is built from this doc |
| `app/` | Mock app for party onboarding (mock data only, no backend). See `app/README.md` |

## Run the app

```bash
cd app
npm install
npm run dev     # http://localhost:5174
npm test
```

## Sources

The docs cite the shared role documents (`docs/shared_docs/engine_shared/`, Oct 1, 2026: the Role-wise Work List and the Operations Role Register). They are not copied here. The backend method and engine docs stay in `backend_engin_invention`, where these files came from.
