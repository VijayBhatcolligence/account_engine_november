# Engine test documents

`<task>/` holds the documents made by the `test-doc-maker` agent for that task: `<name>.pdf` (+ `.html` source) and
`<name>.expected.json` (the expected entry: ledger, Dr, Cr, role; its source: the CA's key id or a cycle.md decision), and a
`README.md` listing them.

- Every document is **fictional** (footer "FICTIONAL TEST DOCUMENT"); GSTINs carry valid checksums only so the reader's checks run.
- They are for uploading in the app and checking the entry. The reader's own samples stay in `app/sales/parser/samples/web/`
  (written there only when Vijay says the documents are parser samples).
