// T12 Create a customer: the screen, derived with Sunny's task-to-screen formula
// (docs/sales/shared_doc_reference/sunny_ui_formula/00_foundry_task_to_screen_formula.md):
// task card → steps → components → pattern & variant → slots → regions → screen. This is its screens.json,
// shown in the app under "Built with" so the screen can be checked against it.
// Fields: the CA's Customer Master onboarding form (Swasthik, 1. Customer_Master_Onboarding_Form_1.xls).

export interface SpecStep {
  id: string;
  name: string;
}
export interface SpecRegion {
  id: string;
  width: string;
  slots: string[];
  note?: string;
}
export interface SpecComponent {
  inst: string;
  cmp: string;
  slot: string;
  region: string;
  steps: string[];
  reason: string;
  /** Not one of the formula's 41 components (none fits): a new one, said so. */
  added?: boolean;
}

export const SCREEN_SPEC = {
  code: 'T12',
  name: 'Create a customer (from Sales’ paper form)',
  category: 'CAT-03 Create & Request: it ends with a request sent for checking (or the form returned)',
  pattern: { fd: 'FD-06', name: 'Structured Editor', variant: 'transaction-workspace', reason: 'Recording what is written on a paper form: the source sits beside the entry. Not FD-07 Guided Sequence: there is no order gate (rev 13: every check runs at Submit), so one screen.' },
  profile: [
    ['frequency', 'as needed (a form from Sales)'],
    ['volume', 'one form per sitting, a few a day'],
    ['complexity', 'medium–high: ~50 fields, 3 conditional parts (export, SEZ, more GSTINs)'],
    ['urgency', 'routine (Sales waits to confirm the first order)'],
    ['risk', 'medium-high: the ledger, GST and TCS set here reach every invoice'],
    ['collaboration', 'hand-off to Rajan (Accounts Manager), Farid (Credit Controller), Venkat (Compliance Officer)'],
    ['environment', 'desktop at HQ'],
    ['variability', 'conditional'],
  ] as [string, string][],
  steps: [
    { id: 'S1', name: 'Open the paper form from Sales' },
    { id: 'S2', name: 'Type the basic details; pick the debtor / ledger category (A)' },
    { id: 'S3', name: 'Confirm the system suggestions from the category' },
    { id: 'S4', name: 'Type GST & tax and every GSTIN; check them on the GST portal (B, B1)' },
    { id: 'S5', name: 'See whether P&C already holds the customer' },
    { id: 'S6', name: 'Type the address and contact (C)' },
    { id: 'S7', name: 'Type the credit, collection and billing terms (D)' },
    { id: 'S8', name: 'Type the export receipts, if an export customer (E)' },
    { id: 'S9', name: 'Note the documents and remarks (F)' },
    { id: 'S10', name: 'Clear the checks; submit for checking, or return the form' },
  ] as SpecStep[],
  regions: [
    { id: 'rail', width: 'collapsible', slots: ['query_controls'], note: 'Added: several paper forms can be on the desk. It collapses so the three regions keep their widths.' },
    { id: 'source', width: '5/16', slots: ['context_panel'] },
    { id: 'entry', width: '7/16 (12/16 with the paper hidden)', slots: ['primary_workspace', 'supporting_analysis'] },
    { id: 'action', width: '4/16 pin', slots: ['validation_feedback', 'action_area'] },
  ] as SpecRegion[],
  components: [
    { inst: 'header', cmp: 'cmp.task-header', slot: 'task_header', region: 'top', steps: ['S1'], reason: 'Names the request, the form, who handed it over, and whose move it is' },
    { inst: 'queue', cmp: 'cmp.work-queue (rail)', slot: 'query_controls', region: 'rail', steps: ['S1'], reason: 'The forms on the desk: Needs me · With checkers · Done' },
    { inst: 'paper', cmp: 'cmp.record-summary', slot: 'context_panel', region: 'source', steps: ['S1', 'S2', 'S4', 'S6', 'S7', 'S8', 'S9'], reason: 'The paper itself, in the form’s A–F order, so you copy top to bottom (rule 2)' },
    { inst: 'sec-A', cmp: 'cmp.form-section', slot: 'primary_workspace', region: 'entry', steps: ['S2'], reason: 'A · Basic details (7 form rows)' },
    { inst: 'sec-S', cmp: 'cmp.form-section (worked rows)', slot: 'primary_workspace', region: 'entry', steps: ['S3'], reason: 'The form’s blue rows: worked out from the category, each with its reason; edit one only if wrong' },
    { inst: 'sec-B', cmp: 'cmp.form-section', slot: 'primary_workspace', region: 'entry', steps: ['S4'], reason: 'B · GST & tax compliance (9 form rows), with the GST portal check under the GSTIN (rule 3)' },
    { inst: 'sec-B1', cmp: 'cmp.form-section (repeatable rows)', slot: 'primary_workspace', region: 'entry', steps: ['S4'], reason: 'B1 · Other GST registrations: a row per GSTIN (state and tax type worked out), its branch address, the default billing GSTIN' },
    { inst: 'duplicate', cmp: 'cmp.duplicate-check', slot: 'supporting_analysis', region: 'entry', steps: ['S5'], reason: 'P&C parties with this PAN or these GSTINs: use one, or none (a new party). Right after the GSTINs it searches on (rule 3)' },
    { inst: 'sec-C', cmp: 'cmp.form-section', slot: 'primary_workspace', region: 'entry', steps: ['S6'], reason: 'C · Address & contact (8 form rows)' },
    { inst: 'sec-D', cmp: 'cmp.form-section', slot: 'primary_workspace', region: 'entry', steps: ['S7'], reason: 'D · Credit & collection terms (6 form rows), and the billing instructions of task card T12' },
    { inst: 'sec-E', cmp: 'cmp.form-section', slot: 'primary_workspace', region: 'entry', steps: ['S8'], reason: 'E · Export receipts (7 form rows): shown only when Export customer = Yes' },
    { inst: 'sec-F', cmp: 'cmp.form-section', slot: 'primary_workspace', region: 'entry', steps: ['S9'], reason: 'F · Documents & remarks (4 form rows)' },
    { inst: 'section-checks', cmp: 'cmp.rule-checks', slot: 'supporting_analysis', region: 'entry', steps: ['S2', 'S4', 'S6', 'S7', 'S8'], reason: 'Each section’s stops and warnings sit under that section (rule 3)' },
    { inst: 'checklist', cmp: 'cmp.entry-checklist', slot: 'validation_feedback', region: 'action', steps: ['S10'], reason: 'Every field ✓ or missing, by section, then what blocks Submit. None of the 41 fits a long form’s completeness view', added: true },
    { inst: 'summary', cmp: 'cmp.change-summary', slot: 'validation_feedback', region: 'action', steps: ['S10'], reason: 'What Submit sends, grouped by receiver, and what happens on approval' },
    { inst: 'endings', cmp: 'cmp.ending-picker', slot: 'action_area', region: 'action', steps: ['S10'], reason: 'Submit → Rajan · Farid · Venkat, or Return the form → Arun: each names where it goes (rule 4)' },
    { inst: 'receipt', cmp: 'cmp.receipt', slot: 'validation_feedback', region: 'entry · action', steps: ['S10'], reason: 'After Submit: who has it, what was approved, the party and account once active' },
    { inst: 'history', cmp: 'cmp.timeline', slot: 'context_panel', region: 'entry', steps: ['S10'], reason: 'What happened to the request, in order: background, so last (rule 5)' },
  ] as SpecComponent[],
  rules: [
    [1, 'The main work gets the largest region: the entry is 7/16, 12/16 when the paper is hidden'],
    [2, 'What is compared stays together: the paper and the entry side by side, in the same A–F order'],
    [3, 'A warning sits next to what it is about: each section’s checks under it; the duplicate check after the GSTINs; the portal result under the GSTIN'],
    [4, 'The commit sits at the point of decision: Submit names Rajan, Farid and Venkat; the change summary is beside it'],
    [5, 'Background goes lowest: checkers and history at the end'],
    [6, 'Fit the device: desktop at HQ; on a narrow screen the paper and the rail collapse'],
  ] as [number, string][],
  /** Every row of the CA's form → where it is on the screen. */
  coverage: [
    ['A', 'Customer Name', 'tradeName'],
    ['A', 'Legal Name (as per PAN / GST)', 'legalName'],
    ['A', 'Constitution / Customer Type', 'constitution (worked from the PAN)'],
    ['A', 'Customer Category', 'customerCategory'],
    ['A', 'Debtor / Ledger Category', 'category'],
    ['A', 'PAN', 'pan'],
    ['A', 'Resident Status', 'resident (worked from the PAN / GSTIN)'],
    ['Sugg.', 'Suggested Ledger (COA)', 'ledger'],
    ['Sugg.', 'Suggested GST Treatment', 'gstTreatment'],
    ['Sugg.', 'Suggested TCS Section', 'tcsSection'],
    ['Sugg.', 'Suggested TCS Rate & Threshold', 'tcsRate'],
    ['Sugg.', 'Suggested Credit Period', 'creditDays (in D, worked)'],
    ['Sugg.', 'Related Party / Elimination', 'relatedParty'],
    ['B', 'GST Registered?', 'gstRegistered'],
    ['B', 'GSTIN', 'gstin'],
    ['B', 'State Identified from GSTIN', 'shown with the GSTIN; state (C) worked from it'],
    ['B', 'Suggested Tax Type', 'taxType'],
    ['B', 'GST Registration Type', 'gstRegType'],
    ['B', 'Export Customer?', 'exportCustomer'],
    ['B', 'SEZ Customer?', 'sezCustomer'],
    ['B', 'E-invoice Applicable?', 'eInvoice (worked)'],
    ['B', 'TCS Applicability Confirmed?', 'tcsConfirmed'],
    ['B1', 'Registration 1–3: State (auto) + GSTIN (6 rows)', 'a row each, any number; state and tax type worked out'],
    ['B1', 'Default / Billing GSTIN', 'billingGstin'],
    ['C', 'Registered / Billing Address', 'addressLine'],
    ['C', 'Shipping Address (if different)', 'shippingAddress'],
    ['C', 'City', 'city'],
    ['C', 'State', 'state (worked from the GSTIN)'],
    ['C', 'PIN Code', 'pincode'],
    ['C', 'Contact Person', 'contactPerson'],
    ['C', 'Mobile Number', 'phone'],
    ['C', 'Email ID', 'email'],
    ['D', 'Credit or Cash Customer?', 'creditOrCash'],
    ['D', 'Credit Limit', 'creditLimit'],
    ['D', 'Payment Terms', 'paymentTerms'],
    ['D', 'Credit Period (Days)', 'creditDays'],
    ['D', 'Security Deposit', 'securityDeposit'],
    ['D', 'Collection Owner', 'collectionOwner'],
    ['E', 'AD Bank', 'adBank'],
    ['E', 'Export Category', 'exportCategory'],
    ['E', 'LUT Number & Validity', 'lut'],
    ['E', 'Expected Mode of Realisation', 'realisationMode'],
    ['E', 'FIRC / BRC Tracking Required?', 'fircBrc'],
    ['E', 'EDPMS / SOFTEX Reference', 'edpms'],
    ['E', 'Export Realisation Norm', 'a note in E (FEMA: 9 months)'],
    ['F', 'GST Certificate Attached?', 'gstCertificate'],
    ['F', 'PAN Copy Attached?', 'panCopy'],
    ['F', 'MSME / Udyam Certificate', 'msmeCertificate'],
    ['F', 'Remarks', 'remarks'],
  ] as [string, string, string][],
  /** Kept from the app, not on the CA's form, and why. */
  kept: [
    ['Under (header)', 'The header the account sits under in the books (the sales posting reads it)'],
    ['Account name', 'Unique in the books'],
    ['Currency · track bill by bill', 'The account’s settings'],
    ['PO reference · send invoices by · invoice format', 'Billing instructions: task card T12'],
  ] as [string, string][],
};

/** Steps no component covers (should be none). */
export const uncoveredSteps = () => SCREEN_SPEC.steps.filter((s) => !SCREEN_SPEC.components.some((c) => c.steps.includes(s.id)));
