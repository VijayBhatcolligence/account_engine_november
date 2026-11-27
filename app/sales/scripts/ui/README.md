# Browser checks

| Script | Run | Checks |
|---|---|---|
| `both-paths.cjs` | `npm run ui:check` (the app running: `npm run dev`) | A from an event: Billing's invoice → the entry starts empty → typed on the screen + the cost from inventory → approved → posted; a credit note typed → posted. B manual: blank customer form → approved → its invoice typed → posted. C phone width, dark mode, no errors |

- Needs Edge (installed on Windows) and `playwright-core` (an app dev dependency: `npm install`).
- **Resets the local demo data** (POST /api/db/reset).
- Screenshots: `%TEMP%\aikyat-ui\`. Exit code 1 if any check fails.
- Approvals and the long T12 fields are set through the app's own store (what the form's controls call); navigation, upload,
  submit and the checkers' screen buttons are clicked.
