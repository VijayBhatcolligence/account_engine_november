// The app's state → the rows of our schema (docs/sales/sales_engine/customer_onboarding_schema.dbml, rev 17), in ONE transaction.
// The app keeps working as it does (its rules decide); every save lands here, and the DATABASE checks it: every key, foreign
// key, CHECK, EXCLUDE and trigger of the schema runs. If one refuses, nothing of that save is written and the app shows why.
//
// What is written, and from what:
//   P&C (pc.*)         every party (both sides), its PAN / GSTINs, addresses, trade name, standing, contacts      ← parties
//   T12 (fin.*)        customer_request (+ approvals, history), debtor_account (+ tax registrations, locations,
//                      credit limit, history), party_bank_account                                               ← requests, accounts
//   T24 (fin.*)        sales_invoice (from Submit on), its lines BY ROLE with the mapping row used, its history  ← vouchers
//   books (fin.*)      journal_entry / journal_line (+ the 7 trace columns), document_sequence                   ← journal
//   inventory (inv.*)  stock_lot (quantities left after each sale)                                               ← lots
// Not written (not in our schema): the vendor side's accounts and requests (Manoj's creditor tables); the app's own
// UI state (drafts being typed, notices, the log) is kept whole in demo.app_state so the app reloads from the database.
import type pg from 'pg';
import { DEBTOR_MASTER, STATES } from '../src/onboarding/catalogue';
import type { Account, Party, Request } from '../src/onboarding/types';
import { COST_METHODS, type CostMethod, type StockLot } from '../src/sales/inventory';
import { calcOf, dueDateOf, entryOf, type EntryLine, type SalesCtx } from '../src/sales/rules';
import { DEBTOR_LEDGER, LEDGERS } from '../src/sales/catalogue';
import type { JournalEntry, JournalLine, Voucher } from '../src/sales/types';
import { insertOnce, uid, upsert, WS } from './db';
import { BOOK, branchIdOf, contactOf, fyOf, OP } from './reference';

export interface Snapshot {
  onboarding: { now: string; parties: Party[]; accounts: Account[]; requests: Request[] } & Record<string, unknown>;
  sales: { vouchers: Voucher[]; journal: JournalEntry[]; lots: StockLot[]; costMethod: CostMethod } & Record<string, unknown>;
}

const s = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
const n = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const yes = (v: unknown) => (v === null || v === undefined || v === '' ? null : v === true || v === 'yes');
const at = (t: string | undefined | null) => (t ? (t.length <= 10 ? `${t}T00:00:00+05:30` : `${t}:00+05:30`) : null);
const day = (t: string | undefined | null) => (t ? t.slice(0, 10) : null);
const json = (v: unknown) => JSON.stringify(v ?? null);
const areaOf = (state: string | undefined | null) => (state ? `IN-${state}` : null);

const partyUid = (pid: string) => uid('party', pid);
const locUid = (locationId: string) => uid('loc', locationId);
const gstUid = (pid: string, gstin: string) => uid('ident', `${pid}:GST:${gstin}`);
const standingUid = (pid: string, type: string) => uid('standing', `${pid}:${type}`);
const accountUid = (accountId: string) => uid('debtor', accountId);
const requestUid = (requestId: string) => uid('request', requestId);
const voucherUid = (voucherId: string) => uid('voucher', voucherId);
const entryUid = (entryId: string) => uid('je', entryId);
const lotUid = (lotId: string) => uid('lot', lotId);

export interface Counts { [table: string]: number }

export async function project(c: pg.PoolClient, snap: Snapshot): Promise<Counts> {
  const { parties, accounts, requests } = snap.onboarding;
  const { vouchers, journal, lots, costMethod } = snap.sales;
  const done: Counts = {};
  const tick = (t: string) => (done[t] = (done[t] ?? 0) + 1);
  const ctx: SalesCtx = { accounts, parties, requests, journal, vouchers, now: snap.onboarding.now, lots, costMethod };

  // ---------------------------------------------------------------- P&C: every party (P&C's tables; here as its stand-in)
  for (const p of parties) {
    const pid = partyUid(p.partyId);
    await upsert(c, 'pc.private_anchor', { anchor_id: pid, workspace_id: WS, anchor_kind: p.kind, created_at: new Date() }, ['anchor_id']);
    await upsert(c, 'pc.party', { party_id: pid, workspace_id: WS, party_kind: p.kind, legal_name: p.legalName }, ['party_id']);
    tick('pc.party');
    const tradeId = p.tradeName ? uid('trade', p.partyId) : null;
    if (tradeId) await upsert(c, 'pc.party_trade_name', { trade_name_id: tradeId, workspace_id: WS, party_id: pid, name: p.tradeName }, ['trade_name_id']);
    if (p.pan) await upsert(c, 'pc.party_identifier', { party_identifier_id: uid('ident', `${p.partyId}:PAN`), workspace_id: WS, party_id: pid, scheme_code: 'IN_PAN', jurisdiction_scope_code: 'IN', value: p.pan, standing_code: 'active' }, ['party_identifier_id']);
    for (const g of p.gstins)
      await upsert(c, 'pc.party_identifier', { party_identifier_id: gstUid(p.partyId, g.value), workspace_id: WS, party_id: pid, scheme_code: 'IN_GST', jurisdiction_scope_code: 'IN', value: g.value, standing_code: g.status }, ['party_identifier_id']);
    const a = p.address;
    await upsert(c, 'pc.business_location', { business_location_id: locUid(`${p.partyId}-L1`), workspace_id: WS, party_id: pid, display_name: 'Registered address', address_lines: a.line ? [a.line] : null, locality: s(a.city), administrative_area_code: areaOf(a.stateCode), postal_code: s(a.pincode), country_code: s(a.country) }, ['business_location_id']);
    for (const l of p.locations ?? [])
      await upsert(c, 'pc.business_location', { business_location_id: locUid(l.locationId), workspace_id: WS, party_id: pid, display_name: l.label, address_lines: l.line ? [l.line] : null, locality: s(l.city), administrative_area_code: areaOf(l.stateCode), postal_code: s(l.pincode), country_code: s(l.country) }, ['business_location_id']);
    for (const r of p.roles)
      await upsert(c, 'pc.party_standing', { party_standing_id: standingUid(p.partyId, r.type), workspace_id: WS, party_id: pid, operated_party_id: OP, standing_type_code: r.type, trade_name_id: tradeId, since: r.since }, ['party_standing_id']);
    const people = [...(p.contactPerson || p.email || p.phones.length ? [{ name: p.contactPerson || `${p.tradeName ?? p.legalName} (no contact name on the form)`, phones: p.phones, email: p.email }] : []),
      ...(p.contacts ?? []).map((x) => ({ name: x.name, phones: x.phone ? [x.phone] : [], email: x.email }))];
    const capacity = p.roles.some((r) => r.type === 'customer') ? 'customer_contact' : 'supplier_contact';
    for (const [i, person] of people.entries()) {
      const cid = uid('pcontact', `${p.partyId}:${i}`);
      await upsert(c, 'pc.private_anchor', { anchor_id: cid, workspace_id: WS, anchor_kind: 'person', created_at: new Date() }, ['anchor_id']);
      await upsert(c, 'pc.contact', { contact_id: cid, workspace_id: WS, contact_kind: 'person', display_name: person.name, accountable_party_id: pid }, ['contact_id']);
      await upsert(c, 'pc.contact_party_association', { association_id: uid('assoc', `${p.partyId}:${i}`), workspace_id: WS, contact_id: cid, party_id: pid, capacity_code: capacity }, ['association_id']);
      const points = [...person.phones.map((v) => ['phone', v]), ...(person.email ? [['email', person.email]] : [])];
      for (const [j, [kind, value]] of points.entries())
        await upsert(c, 'pc.contact_point', { contact_point_id: uid('point', `${p.partyId}:${i}:${j}`), workspace_id: WS, contact_id: cid, channel_kind: kind, route_value: value }, ['contact_point_id']);
    }
  }

  // ---------------------------------------------------------------- T12: the customer requests (the vendor side is Manoj's)
  const customerAccounts = accounts.filter((a) => a.side === 'receivable');
  const requestOf = (a: Account) => requests.find((r) => r.id === a.requestId || r.accountId === a.accountId);
  const keptRequests: string[] = [];
  const stageOf: Record<string, string> = { draft: 'draft', submitted: 'submitted', active: 'active', returned: 'draft', sent_back: 'returned' };
  for (const r of requests.filter((x) => x.side === 'receivable')) {
    const v = r.values;
    const id = requestUid(r.id);
    keptRequests.push(id);
    const submissions = r.history.filter((h) => /^(Submitted|Sent again|Submitted again)/i.test(h.text)).length || (r.submittedAt ? 1 : 0);
    await upsert(c, 'fin.customer_request', {
      request_id: id, workspace_id: WS, operated_party_id: OP, request_kind: 'create', stage: stageOf[r.status] ?? 'draft', version_number: r.history.length + 1,
      paper_form_number: r.formNo, handed_over_by_contact_id: contactOf(r.from), customer_name: s(v.tradeName) ?? s(v.legalName), legal_name: s(v.legalName),
      constitution_code: s(v.constitution), customer_type_code: s(v.customerCategory), debtor_category_code: v.category ? String(v.category).toUpperCase() : null,
      pan: s(v.pan), resident_status: s(v.resident), account_name: s(v.accountName), gst_registered: yes(v.gstRegistered), gstin: s(v.gstin), gst_registration_type: s(v.gstRegType),
      gst_registration_count: r.registrations?.length ?? 0, additional_gst_registrations: json((r.registrations ?? []).map(({ id: _i, ...g }) => g)), billing_gstin: s(v.billingGstin),
      export_customer: yes(v.exportCustomer), e_invoice_applicable: s(v.eInvoice), tcs_applicability_confirmed: s(v.tcsConfirmed),
      address_lines: v.addressLine ? [String(v.addressLine)] : null, locality: s(v.city), administrative_area_code: areaOf(s(v.state)), postal_code: s(v.pincode), country_code: v.resident === 'non_resident' ? null : 'IN',
      shipping_address_lines: v.shippingAddress ? [String(v.shippingAddress)] : null, shipping_locality: s(v.shipCity), shipping_administrative_area_code: areaOf(s(v.shipState)), shipping_postal_code: s(v.shipPincode), shipping_country_code: v.shippingAddress ? 'IN' : null,
      contacts: json([{ name: s(v.contactPerson), phones: v.phone ? [String(v.phone)] : [], emails: v.email ? [String(v.email)] : [] }, ...(r.contacts ?? []).map((x) => ({ name: x.name, phones: x.phone ? [x.phone] : [], emails: x.email ? [x.email] : [] }))]),
      bank_beneficiary: s(v.beneficiary), bank_name: s(v.bankName), bank_account_no: s(v.bankAccountNo), bank_ifsc: s(v.ifsc),
      credit_or_cash: s(v.creditOrCash), credit_limit_amount: n(v.creditLimit), payment_terms_code: s(v.paymentTerms), credit_days: n(v.creditDays), currency_code: s(v.currency) ?? 'INR',
      po_reference_rule: s(v.poRule), invoice_delivery_channel: s(v.delivery), lut_number: s(v.lut), edpms_softex_reference: s(v.edpms),
      gst_certificate_attached: yes(v.gstCertificate), pan_copy_attached: yes(v.panCopy), remarks: s(v.remarks),
      created_by_contact_id: contactOf('teja'), submitted_by_contact_id: r.submittedAt ? contactOf('teja') : null, submitted_at: at(r.submittedAt), submission_number: submissions,
      return_reason: r.sentBack?.reason ?? null, party_id: r.partyId ? partyUid(r.partyId) : null, debtor_account_id: r.accountId ? accountUid(r.accountId) : null, activated_at: at(r.activatedAt), updated_at: new Date(),
    }, ['request_id']);
    tick('fin.customer_request');
    await c.query(`DELETE FROM fin.customer_request_approval WHERE request_id = $1 AND outcome = 'pending'`, [id]);
    const seenPart: Record<string, number> = {};
    for (const ch of r.changes) {
      const sub = Math.max(1, submissions) + (seenPart[ch.block] ?? 0);
      seenPart[ch.block] = (seenPart[ch.block] ?? 0) + 1;
      await upsert(c, 'fin.customer_request_approval', {
        approval_id: uid('approval', `${r.id}:${ch.id}`), workspace_id: WS, request_id: id, submission_number: sub, approval_part_code: ch.block, approver_role_code: ch.checker,
        approver_contact_id: contactOf(ch.checker), outcome: ch.status === 'returned' ? 'sent_back' : ch.status, // pending | approved | sent_back | rejected decided_at: at(ch.decidedAt), reason: ch.reason ?? null, approved_values: json(ch.after),
      }, ['approval_id']);
      tick('fin.customer_request_approval');
    }
    for (const [i, h] of r.history.entries()) {
      await insertOnce(c, 'fin.customer_request_history', { history_id: uid('request-history', `${r.id}:${i}`), workspace_id: WS, request_id: id, version_number: i + 1, operation: opOfRequest(h.text), performer_contact_id: contactOf(h.by), reason: null, row_snapshot: json(h), recorded_at: at(h.at) }, ['history_id']);
      tick('fin.customer_request_history');
    }
  }
  // A draft the app discarded is gone from the app: remove it here too (never one that opened an account).
  await c.query(`DELETE FROM fin.customer_request_approval WHERE request_id IN (SELECT request_id FROM fin.customer_request WHERE debtor_account_id IS NULL AND NOT (request_id = ANY($1::uuid[])))`, [keptRequests]);
  await c.query(`DELETE FROM fin.customer_request_history WHERE request_id IN (SELECT request_id FROM fin.customer_request WHERE debtor_account_id IS NULL AND NOT (request_id = ANY($1::uuid[])))`, [keptRequests]);
  await c.query(`DELETE FROM fin.customer_request WHERE debtor_account_id IS NULL AND NOT (request_id = ANY($1::uuid[]))`, [keptRequests]);

  // ---------------------------------------------------------------- T12: the customer accounts
  for (const a of customerAccounts) {
    const r = requestOf(a);
    const v = r?.values ?? {};
    const p = parties.find((x) => x.partyId === a.partyId);
    const did = accountUid(a.accountId);
    let reqId = r ? requestUid(r.id) : null;
    if (!reqId) {
      // An account the app starts with (opened before the app): its opening request, so opened_from_request_id holds.
      reqId = uid('request', `OPENING:${a.accountId}`);
      await upsert(c, 'fin.customer_request', {
        request_id: reqId, workspace_id: WS, operated_party_id: OP, request_kind: 'create', stage: 'active', paper_form_number: `OPENING ${a.accountId}`,
        handed_over_by_contact_id: contactOf('arun'), customer_name: a.name, legal_name: p?.legalName ?? a.name, account_name: a.name, debtor_category_code: a.category.toUpperCase(),
        pan: p?.pan ?? null, gstin: a.gstin ?? p?.gstins[0]?.value ?? null, credit_limit_amount: a.creditLimit, credit_days: a.creditDays, created_by_contact_id: contactOf('teja'),
        party_id: p ? partyUid(p.partyId) : null, debtor_account_id: did, activated_at: at(a.activatedAt), remarks: 'Opening account: the app starts with it (seed data, illustrative)',
      }, ['request_id']);
      tick('fin.customer_request');
    }
    const rule = DEBTOR_MASTER[a.category];
    const exporting = rule?.exporting === true || v.exportCustomer === 'yes';
    const creditDays = a.creditDays;
    await upsert(c, 'fin.debtor_account', {
      debtor_account_id: did, workspace_id: WS, operated_party_id: OP, party_id: partyUid(a.partyId),
      party_standing_id: p?.roles.some((x) => x.type === 'customer') ? standingUid(a.partyId, 'customer') : null, opened_from_request_id: reqId, customer_code: a.accountId,
      account_name: a.name, debtor_category_code: a.category.toUpperCase(), ledger_account_code: DEBTOR_LEDGER[a.category] ?? '107010',
      customer_type_code: s(v.customerCategory) ?? rule?.customer ?? 'b2b', resident_status: s(v.resident) ?? (exporting ? 'non_resident' : 'resident'),
      export_customer: exporting, e_invoice_applicable: s(v.eInvoice) ?? (exporting ? 'yes' : 'yes'), tcs_applicability_confirmed: s(v.tcsConfirmed) ?? 'not_applicable',
      credit_or_cash: s(v.creditOrCash) ?? (creditDays === null ? 'cash' : 'credit'), payment_terms_code: s(v.paymentTerms) ?? (creditDays === null ? 'immediate' : `net_${creditDays}`),
      credit_days: creditDays, currency_code: s(v.currency) ?? (exporting ? 'USD' : 'INR'), po_reference_rule: s(v.poRule) ?? 'none', invoice_delivery_channel: s(v.delivery) ?? 'email',
      lut_number: s(v.lut), opened_at: at(a.activatedAt), remarks: r ? null : 'Opening account (seed): terms not on a form are defaults, illustrative', updated_at: new Date(),
    }, ['debtor_account_id']);
    tick('fin.debtor_account');
    // Its GST registrations (one default) and where it bills / ships (fin.debtor_location).
    // Every GSTIN of the form (main + B1) is a registration of the account, with or without a branch address yet (schema note).
    const formGstins = [...(v.gstin ? [String(v.gstin)] : []), ...(r?.registrations ?? []).map((g) => g.gstin)].filter((g) => p?.gstins.some((x) => x.value === g));
    const gstins = [...new Set([...(a.branches ?? []).map((b) => b.gstin).filter((g): g is string => !!g), ...(a.gstin ? [a.gstin] : []), ...formGstins, ...(!a.branches && !a.gstin && p?.gstins[0] ? [p.gstins[0].value] : [])])];
    const def = a.branches?.find((b) => b.isDefault)?.gstin ?? a.gstin ?? gstins[0] ?? null;
    const regOf = (g: string) => uid('debtor-reg', `${a.accountId}:${g}`);
    for (const g of gstins) {
      await upsert(c, 'fin.debtor_tax_registration', { debtor_tax_registration_id: regOf(g), workspace_id: WS, debtor_account_id: did, party_identifier_id: gstUid(a.partyId, g), registration_type: 'regular', is_default: g === def, since: a.activatedAt }, ['debtor_tax_registration_id']);
      tick('fin.debtor_tax_registration');
    }
    const billTo = a.branches ?? [{ branchId: 'MAIN', locationId: `${a.partyId}-L1`, gstin: def, isDefault: true, since: a.activatedAt }];
    for (const b of billTo) {
      await upsert(c, 'fin.debtor_location', { debtor_location_id: uid('debtor-loc', `${a.accountId}:${b.branchId}`), workspace_id: WS, debtor_account_id: did, business_location_id: locUid(b.locationId), usage: 'bill_to', debtor_tax_registration_id: b.gstin ? regOf(b.gstin) : null, is_primary: true, since: b.since, until: b.until ?? null }, ['debtor_location_id']);
      tick('fin.debtor_location');
    }
    if (a.shipTo) {
      await upsert(c, 'fin.debtor_location', { debtor_location_id: uid('debtor-loc', `${a.accountId}:${a.shipTo.linkId}`), workspace_id: WS, debtor_account_id: did, business_location_id: locUid(a.shipTo.locationId), usage: 'ship_to', is_primary: true, since: a.shipTo.since }, ['debtor_location_id']);
      tick('fin.debtor_location');
    }
    if (a.creditLimit !== null) {
      await upsert(c, 'fin.debtor_credit_limit', { debtor_credit_limit_id: uid('limit', a.accountId), workspace_id: WS, debtor_account_id: did, credit_limit_amount: a.creditLimit, currency_code: 'INR', effective_from: a.activatedAt, approved_by_contact_id: contactOf('rajan'), source_request_id: reqId }, ['debtor_credit_limit_id']);
      tick('fin.debtor_credit_limit');
    }
    if (a.bankAccountNo && v.ifsc) {
      const bank = uid('bank', `${a.partyId}:${a.bankAccountNo}`);
      await upsert(c, 'fin.party_bank_account', { party_bank_account_id: bank, workspace_id: WS, party_id: partyUid(a.partyId), account_no: a.bankAccountNo, ifsc: String(v.ifsc), beneficiary_name: s(v.beneficiary) ?? a.name, bank_name: s(v.bankName) ?? 'not given', since: a.bankSince }, ['party_bank_account_id']);
      await c.query('UPDATE fin.debtor_account SET refund_bank_account_id = $1 WHERE debtor_account_id = $2', [bank, did]);
      tick('fin.party_bank_account');
    }
    await insertOnce(c, 'fin.debtor_account_history', { history_id: uid('debtor-history', `${a.accountId}:open`), workspace_id: WS, debtor_account_id: did, version_number: 1, operation: 'open', performer_contact_id: contactOf('rajan'), row_snapshot: json(a) }, ['history_id']);
  }

  // ---------------------------------------------------------------- inventory: the lots (quantities as they are now)
  for (const l of lots) {
    await upsert(c, 'inv.stock_lot', { stock_lot_id: lotUid(l.lotId), workspace_id: WS, branch_id: branchIdOf(l.branch), godown_code: l.godown, item_code: l.item, lot_no: l.lot, received_on: l.receivedOn, quantity_received: l.qtyReceived, quantity_left: l.qtyLeft, unit_cost: l.unitCost, updated_at: new Date() }, ['stock_lot_id']);
    tick('inv.stock_lot');
  }

  // ---------------------------------------------------------------- the journal (Manoj's tables): written once, never changed
  const entryRows = new Map<string, LineRow[]>();
  for (const v of vouchers) if (v.entryId) entryRows.set(v.entryId, linesOf(v, ctx, journal.find((e) => e.id === v.entryId)));
  for (const e of journal) {
    const jid = entryUid(e.id);
    await insertOnce(c, 'fin.journal_entry', {
      journal_entry_id: jid, workspace_id: WS, operated_party_id: OP, fiscal_year_id: fyOf(e.date), branch_id: branchIdOf(e.branch), posting_date: e.date, voucher_type: 'sales',
      source_document_id: e.voucherId ? voucherUid(e.voucherId) : null, source_ref_no: e.voucherId ?? e.voucherNo, reverses_journal_entry_id: e.reverses ? entryUid(e.reverses) : null,
      narration: e.narration, posted_by_contact_id: contactOf(e.postedBy), posted_at: at(e.postedAt),
    }, ['journal_entry_id']);
    tick('fin.journal_entry');
    const rows = entryRows.get(e.id) ?? e.lines.map((l) => plainLine(l));
    for (const [i, l] of rows.entries()) {
      const acc = l.account ? accounts.find((a) => a.accountId === l.account) : undefined;
      await insertOnce(c, 'fin.journal_line', {
        journal_line_id: uid('jl', `${e.id}:${i + 1}`), workspace_id: WS, journal_entry_id: jid, line_no: i + 1,
        ledger_account_code: l.code ?? (acc ? DEBTOR_LEDGER[acc.category] ?? '107010' : null), debtor_account_id: acc ? accountUid(acc.accountId) : null, branch_id: branchIdOf(e.branch),
        debit: l.dr, credit: l.cr, ...(await traceOf(c, l)),
      }, ['journal_line_id']);
      tick('fin.journal_line');
    }
  }

  // ---------------------------------------------------------------- T24: the sales vouchers (a row from Submit on, as the schema says)
  const keptVouchers: string[] = [];
  let lastNo = 0;
  for (const v of vouchers) {
    lastNo = Math.max(lastNo, Number(v.id.slice(3)) || 0);
    if (!v.submittedAt || v.status === 'returned') continue; // received but not booked yet: still Billing's invoice, not a voucher
    const a = accounts.find((x) => x.accountId === v.accountId);
    const id = voucherUid(v.id);
    keptVouchers.push(id);
    const decided = [...v.approvals].reverse().find((x) => x.status !== 'pending' && x.decidedAt);
    const rows = linesOf(v, ctx, v.entryId ? journal.find((e) => e.id === v.entryId) : undefined);
    const hasGoods = v.lines.some((l) => l.kind === 'goods');
    const stage = v.status === 'draft' ? 'draft' : v.status;
    const history = v.history.map((h) => ({ h, op: opOfVoucher(h.text) })).filter((x) => x.op);
    await upsert(c, 'fin.sales_invoice', {
      sales_invoice_id: id, workspace_id: WS, operated_party_id: OP, branch_id: branchIdOf(v.branch), debtor_account_id: a ? accountUid(a.accountId) : null,
      internal_ref_no: v.id, original_sales_invoice_id: id, revision_no: 0, posting_date: v.date, invoice_no: v.number ?? v.id, invoice_date: v.date,
      due_date: dueDateOf(v, a ?? null) ?? v.date, narration: v.narration, inventory_mode: hasGoods ? 'perpetual' : null,
      costing_method: hasGoods ? (costMethod === 'fifo' ? 'fifo' : 'weighted_average') : null, stage, version_number: Math.max(1, history.length),
      submitted_by_contact_id: contactOf(v.maker), submitted_at: at(v.submittedAt), decided_by_contact_id: decided && stage !== 'submitted' ? contactOf(decided.checker) : null,
      decided_at: decided && stage !== 'submitted' ? at(decided.decidedAt) : null, decision_reason: v.decisionReason ?? null, journal_entry_id: v.entryId ? entryUid(v.entryId) : null, updated_at: new Date(),
    }, ['sales_invoice_id']);
    tick('fin.sales_invoice');
    // Its lines: replaced whole on each save (the schema: "replaced whole on each Submit"); a posted voucher's = its journal entry's.
    await c.query('DELETE FROM fin.sales_invoice_line WHERE sales_invoice_id = $1', [id]);
    for (const [i, l] of rows.entries()) {
      const acc = l.account ? accounts.find((x) => x.accountId === l.account) : undefined;
      await insertOnce(c, 'fin.sales_invoice_line', {
        sales_invoice_line_id: uid('sil', `${v.id}:${i + 1}`), workspace_id: WS, sales_invoice_id: id, line_no: i + 1, side: l.dr ? 'Dr' : 'Cr',
        ledger_account_code: acc ? null : l.code, debtor_account_id: acc ? accountUid(acc.accountId) : null,
        inventory_item_code: l.cr && l.item ? l.item : null, quantity: l.cr && l.item ? l.qty ?? null : null,
        stock_lot_id: l.cr && l.item && l.lot ? lotUid(lots.find((x) => x.lot === l.lot && x.item === l.item)?.lotId ?? l.lot) : null,
        amount: l.dr || l.cr, ...(await traceOf(c, l)),
      }, ['sales_invoice_line_id']);
      tick('fin.sales_invoice_line');
    }
    for (const [i, { h, op }] of history.entries()) {
      await insertOnce(c, 'fin.sales_invoice_history', { history_id: uid('sv-history', `${v.id}:${i}`), workspace_id: WS, sales_invoice_id: id, version_number: i + 1, operation: op, row_snapshot: json(h), performer_contact_id: contactOf(h.by), reason: null, recorded_at: at(h.at) }, ['history_id']);
      tick('fin.sales_invoice_history');
    }
  }
  await c.query(`DELETE FROM fin.sales_invoice WHERE journal_entry_id IS NULL AND NOT (sales_invoice_id = ANY($1::uuid[]))`, [keptVouchers]);
  await c.query(`UPDATE fin.document_sequence SET last_number = GREATEST(last_number, $1) WHERE workspace_id = $2 AND document_type = 'sales_invoice'`, [lastNo, WS]);

  // The book's costing method follows the app's switch (dated from the scenario day; S1 part 1, never edited: closed + a new row).
  const want = costMethod === 'fifo' ? 'fifo' : 'weighted_average';
  const today = day(snap.onboarding.now)!;
  const { rows: cur } = await c.query(`SELECT book_setting_id, setting_value, effective_from::text AS f FROM fin.book_setting WHERE book_id = $1 AND setting_code = 'costing_method' AND effective_until IS NULL`, [BOOK]);
  if (cur[0] && cur[0].setting_value !== want) {
    if (cur[0].f >= today) await c.query('UPDATE fin.book_setting SET setting_value = $1, reason = $2 WHERE book_setting_id = $3', [want, `Changed in the app on ${today} (illustrative)`, cur[0].book_setting_id]);
    else {
      await c.query('UPDATE fin.book_setting SET effective_until = $1 WHERE book_setting_id = $2', [today, cur[0].book_setting_id]);
      await insertOnce(c, 'fin.book_setting', { book_setting_id: uid('setting', `costing_method:${today}:${want}`), workspace_id: WS, book_id: BOOK, setting_code: 'costing_method', setting_value: want, effective_from: today, reason: `Changed in the app (${COST_METHODS[costMethod].label}), illustrative`, approved_by_contact_id: contactOf('rajan'), approved_at: new Date() }, ['book_setting_id']);
    }
  }
  return done;
}

// ---------------------------------------------------------------- lines BY ROLE, and the mapping row each one used
interface LineRow { code: string | null; account?: string; dr: number; cr: number; role: string | null; ruleCase: string | null; item?: string; qty?: number; lot?: string | null; reason?: string; facts: Facts | null }
interface Facts { party: string; scope: string | null; line: string | null; tax: string | null; settle: string; on: string }

const TAX_ROLE: Record<string, string> = { out_cgst: 'output_cgst', out_sgst: 'output_sgst', out_igst: 'output_igst' };
/** The app's line role (engine.ts) → the schema's line_role (rev 17). */
function roleOf(l: { role?: EntryLine['role']; ledger: string; dr: number }): string | null {
  const k = l.ledger;
  if (k === 'party') return 'customer';
  if (TAX_ROLE[k]) return TAX_ROLE[k];
  if (k === 'cash_in_hand' || k === 'upi_card_clearing') return 'settlement';
  if (k === 'igst_refund') return 'igst_refund';
  if (k === 'round_off') return 'round_off';
  if (k === 'cogs') return 'cogs';
  if (k === 'fg_inventory') return 'stock';
  if (k === 'contract_liability') return 'deferred_revenue';
  if (k === 'reimbursement_recoverable') return 'recoverable_expense';
  if (l.role === 'added') return null; // a line the AE added: no rule wrote it
  if (LEDGERS[k]?.nature === 'income') return 'revenue';
  return null;
}

/** The voucher's lines: a posted one's are its journal entry's (as booked); otherwise the entry the rule (and the AE) make now. */
function linesOf(v: Voucher, ctx: SalesCtx, posted?: JournalEntry): LineRow[] {
  let c: ReturnType<typeof calcOf> | null = null;
  try {
    c = calcOf(v, ctx);
  } catch {
    c = null;
  }
  const facts = (ledger: string): Facts | null => {
    if (!c) return null;
    const row = c.rows.find((r) => r.revenue === ledger) ?? c.rows[0];
    return { party: c.kind, scope: c.kind === 'domestic' ? (c.intra ? 'intra_state' : 'inter_state') : null, line: row?.kind ?? null, tax: row?.taxability ?? null, settle: v.settlement ?? 'credit', on: v.date };
  };
  const caseFor = (ledger: string, role: string | null) => {
    if (role === 'cogs' || role === 'stock') return 'R13';
    if (role === 'settlement') return 'R8';
    if (!c || !['revenue', 'deferred_revenue', 'recoverable_expense', 'igst_refund'].includes(role ?? '')) return null;
    if (role === 'igst_refund') return c.kind === 'sez' ? 'R6' : 'R5';
    return c.rows.find((r) => r.revenue === ledger)?.rule ?? null;
  };
  const src: { ledger: string; code?: string; account?: string; dr: number; cr: number; role?: EntryLine['role']; item?: string; qty?: number; lot?: string | null; reason?: string }[] = posted
    ? posted.lines.map((l: JournalLine) => ({ ...l, account: l.accountId, code: l.ledger === 'party' ? undefined : LEDGERS[l.ledger]?.code ?? l.code }))
    : entryOf(v, ctx).filter((l) => l.dr || l.cr).map((l) => ({ ledger: l.ledger, code: l.ledger === 'party' ? undefined : l.code, account: l.ledger === 'party' ? v.accountId : undefined, dr: l.dr, cr: l.cr, role: l.role, item: l.item, qty: l.qty, lot: l.lot, reason: l.changed ? l.reason || 'ledger picked by the AE' : undefined }));
  return src.map((l) => {
    const role = roleOf(l);
    return { code: l.code ?? null, account: l.account, dr: l.dr, cr: l.cr, role, ruleCase: caseFor(l.ledger, role), item: l.item, qty: l.qty, lot: l.lot, reason: l.reason, facts: facts(l.ledger) };
  });
}

const plainLine = (l: JournalLine): LineRow => ({ code: l.ledger === 'party' ? null : LEDGERS[l.ledger]?.code ?? l.code ?? null, account: l.accountId, dr: l.dr, cr: l.cr, role: null, ruleCase: null, facts: null });

/** The 7 trace columns: the rule, its case, the role, and the mapping row fin.determine_ledger gives on the posting date. */
async function traceOf(c: pg.PoolClient, l: LineRow) {
  const none = { rule_code: null, rule_version: null, rule_case: null, line_role_code: null, account_determination_id: null, determined_ledger_code: null, override_reason: null };
  if (!l.role) return none;
  const base = { rule_code: 'SALES_INVOICE', rule_version: 1, rule_case: l.ruleCase, line_role_code: l.role };
  if (l.role === 'customer' || !l.facts) return { ...base, account_determination_id: null, determined_ledger_code: null, override_reason: null };
  await c.query('SAVEPOINT det');
  try {
    const { rows } = await c.query(
      `SELECT d.account_determination_id AS id, d.ledger_account_code AS ledger FROM fin.account_determination d
        WHERE d.account_determination_id = fin.determine_ledger($1, $2, 'sales_invoice', $3, $9::date, $4, $5, $6, $7, $8)`,
      [WS, BOOK, l.role, l.facts.party, l.facts.scope, l.facts.line, l.facts.tax, l.facts.settle, l.facts.on],
    );
    await c.query('RELEASE SAVEPOINT det');
    const d = rows[0];
    const overridden = d && d.ledger !== l.code;
    return { ...base, account_determination_id: d?.id ?? null, determined_ledger_code: d?.ledger ?? null, override_reason: overridden ? l.reason ?? 'ledger picked by the AE (§8.4)' : null };
  } catch {
    await c.query('ROLLBACK TO SAVEPOINT det');
    return { ...base, account_determination_id: null, determined_ledger_code: null, override_reason: null }; // no row or a tie: the line keeps its ledger, untraced
  }
}

function opOfVoucher(text: string): 'submit' | 'decide' | null {
  if (/^(Entry booked|Sent again|Booked)/i.test(text)) return 'submit';
  if (/^(Approved|Sent back|Rejected|Posted)/i.test(text)) return 'decide';
  return null;
}
function opOfRequest(text: string): string {
  if (/^(Submitted|Sent again)/i.test(text)) return 'submit';
  if (/approved|returned/i.test(text)) return 'decide';
  if (/^Active/i.test(text)) return 'activate';
  if (/sent back|discard/i.test(text)) return 'send_back';
  return 'note';
}

export const STATE_CODES = STATES;
