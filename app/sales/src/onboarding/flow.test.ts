import { beforeEach, describe, expect, it } from 'vitest';
import { checksOf, stops } from './rules';
import { requestOf, useOnboarding } from './store';

const st = () => useOnboarding.getState();
const req = (id: string) => requestOf(st(), id)!;
const checks = (id: string) => checksOf(req(id), st());
const stopTitles = (id: string) => stops(checks(id)).map((c) => c.title);
const set = (id: string, values: Record<string, string | number>) => Object.entries(values).forEach(([k, v]) => st().setValue(id, k, v));

/** Malnad, everything from Ravi's paper form, checked on the GST portal and by penny-drop. */
function readyMalnad() {
  st().typeFromPaper('REQ-0101');
  st().checkGstin('REQ-0101');
  st().runPennyDrop('REQ-0101');
}

describe('vendor from a paper form: Malnad Cocoa Traders', () => {
  beforeEach(() => st().reset());

  it('party details typed from the form; the system works out state, constitution and account name', () => {
    const r = req('REQ-0101');
    expect(r.status).toBe('draft');
    expect(r.partyId).toBeNull();
    expect(r.values.state).toBe('KA'); // GSTIN starts with 29
    expect(r.values.constitution).toBe('partnership'); // PAN 4th letter F
    expect(r.values.accountName).toBe('Malnad Cocoa Traders');
    expect(stopTitles('REQ-0101')).toContain('Still to fill: Category · Related party · Credit days · MSME · Bank account number · IFSC · Beneficiary name');
    expect(stopTitles('REQ-0101')).toContain('Check the GSTIN on the GST portal');
  });

  it('every field is editable, and copying mistakes are caught', () => {
    st().setValue('REQ-0101', 'legalName', 'Malnad Cocoa Traders LLP');
    expect(req('REQ-0101').values.accountName).toBe('Malnad Cocoa Traders LLP'); // follows until you change it
    st().setValue('REQ-0101', 'pan', 'AAHFM0000B');
    expect(stopTitles('REQ-0101')).toContain('GSTIN does not belong to this PAN');
    st().setValue('REQ-0101', 'pan', 'AAHFM0000A');
    st().setValue('REQ-0101', 'state', 'TN');
    expect(stopTitles('REQ-0101')).toContain('State does not match the GSTIN');
  });

  it('the category sets the header and the 43B(h) answer', () => {
    set('REQ-0101', { category: 'goods_msme' });
    expect(req('REQ-0101').values.under).toBe('Trade Payables › Goods');
    expect(req('REQ-0101').values.sec43bh).toBe('yes');
  });

  it('stops: MSME mismatch, more than 45 days, a bank account used by Vendor A', () => {
    readyMalnad();
    st().setValue('REQ-0101', 'category', 'goods_non_msme');
    expect(stopTitles('REQ-0101')).toContain('Category says Non-MSME, but MSME = Yes');
    st().setValue('REQ-0101', 'category', 'goods_msme');
    st().setValue('REQ-0101', 'creditDays', 60);
    expect(stopTitles('REQ-0101')).toContain('60 credit days for an MSME vendor');
    st().setValue('REQ-0101', 'bankAccountNo', '50100012345678');
    expect(stopTitles('REQ-0101')).toContain('Bank account already used by Vendor A');
  });

  it('a penny-drop name mismatch needs a call-back on the number from the form, not an email one', () => {
    readyMalnad();
    st().setValue('REQ-0101', 'bankAccountNo', '777700001234');
    expect(stopTitles('REQ-0101')).toContain('Bank details changed after the penny-drop: run it again');
    st().runPennyDrop('REQ-0101');
    expect(req('REQ-0101').pennyDrop!.result).toBe('name_mismatch');
    set('REQ-0101', { callBackNumber: 'email', callBackPerson: 'Mr Gowda' });
    expect(stopTitles('REQ-0101')).toContain('Call-back number came from an email with the bank details');
    st().setValue('REQ-0101', 'callBackNumber', '+91 98450 00000');
    expect(stopTitles('REQ-0101')).toEqual([]);
  });

  it('submit → three checkers → a NEW party in the master and an active account', () => {
    readyMalnad();
    expect(stopTitles('REQ-0101')).toEqual([]);
    st().submit('REQ-0101');
    const r = req('REQ-0101');
    expect(r.status).toBe('submitted');
    expect(r.changes.map((c) => c.checker)).toEqual(['rajan', 'usha', 'venkat']);
    expect(r.changes[0].after.pan).toBe('AAHFM0000A'); // Rajan checks the party details too
    r.changes.forEach((c) => st().decide('REQ-0101', c.id, true));
    const done = req('REQ-0101');
    expect(done.status).toBe('active');
    const party = st().parties.find((p) => p.partyId === done.partyId)!;
    expect(party.legalName).toBe('Malnad Cocoa Traders');
    expect(party.gstins[0]).toEqual({ value: '29AAHFM0000A1Z5', stateCode: 'KA', status: 'active' });
    expect(party.roles[0]).toMatchObject({ type: 'supplier', formFrom: 'ravi', formNo: 'VRF-0107' });
    const acct = st().accounts.find((a) => a.partyId === party.partyId)!;
    expect(acct.under).toBe('Trade Payables › Goods');
    expect(st().log.some((e) => e.line === 'INSERT accounting.subledger_account')).toBe(true);
    expect(st().log.some((e) => e.line === 'INSERT accounting.subledger_account_control')).toBe(true);
    expect(st().log.some((e) => e.line === 'PartyRegistered')).toBe(true);
    expect(st().log.some((e) => e.line === 'PartyAccountRequestActivated')).toBe(true);
  });

  it('a returned part comes back; approved parts stay approved on resubmit', () => {
    readyMalnad();
    st().submit('REQ-0101');
    const [party, bank] = req('REQ-0101').changes;
    st().decide('REQ-0101', party.id, true);
    st().decide('REQ-0101', bank.id, false, 'Cancelled cheque does not match the account');
    expect(req('REQ-0101').status).toBe('returned');
    st().setValue('REQ-0101', 'beneficiary', 'Malnad Cocoa Traders (firm)');
    st().submit('REQ-0101');
    const after = req('REQ-0101').changes;
    expect(after.find((c) => c.block === 'party')!.status).toBe('approved');
    expect(after.find((c) => c.block === 'bank')!.status).toBe('pending');
  });
});

describe('customers from paper forms, and parties already in the master', () => {
  beforeEach(() => st().reset());

  it('Coastal Bakes: same PAN as an old party (a warning), checked by Farid, goes live', () => {
    const id = st().createRequest({ side: 'receivable', from: 'arun', formNo: 'CRF-0019', paper: 'coastal' });
    expect(req(id).values.legalName ?? '').toBe('');
    st().typeFromPaper(id);
    st().checkGstin(id);
    expect(req(id).values.under).toBe('Trade Receivables › Domestic');
    expect(req(id).values.constitution).toBe('company');
    expect(checks(id).some((c) => c.level === 'warn' && c.title.includes('Same PAN as P-0088') && c.usePartyId === 'P-0088')).toBe(true);
    expect(stopTitles(id)).toEqual([]);
    st().submit(id);
    expect(req(id).changes.map((c) => c.checker)).toEqual(['rajan', 'farid', 'venkat']);
    req(id).changes.forEach((c) => st().decide(id, c.id, true));
    expect(st().accounts.find((a) => a.requestId === id)!.creditLimit).toBe(4_00_000);
  });

  it('Sri Lakshmi (Mysuru): the GSTIN is already our customer, so the form goes back to Arun', () => {
    const id = st().createRequest({ side: 'receivable', from: 'arun', formNo: 'CRF-0020', paper: 'lakshmi' });
    st().typeFromPaper(id);
    const stop = stops(checks(id)).find((c) => c.sendBack)!;
    expect(stop.title).toBe('Already set up: GSTIN 29AAKFS0000S1Z2 is Sri Lakshmi Distributors (P-0031)');
    const before = st().parties.length;
    st().sendBack(id, 'Same GSTIN as Sri Lakshmi Distributors (C-01): add the depot as a location instead');
    expect(req(id).status).toBe('sent_back');
    expect(req(id).sentBack!.to).toBe('arun');
    expect(st().parties.length).toBe(before);
    expect(st().log.some((e) => e.line === 'PartyAccountRequestSentBack')).toBe(true);
  });

  it('using a party from the master locks its details', () => {
    const id = st().createRequest({ side: 'receivable', from: 'arun', formNo: 'CRF-0019', paper: 'coastal' });
    st().typeFromPaper(id);
    st().useParty(id, 'P-0088');
    expect(req(id).partyId).toBe('P-0088');
    expect(req(id).values.legalName).toBe('Coastal Bakes & Confectioners');
    st().setValue(id, 'legalName', 'Something else');
    expect(req(id).values.legalName).toBe('Coastal Bakes & Confectioners');
  });

  it("the CA's form: the debtor category fills the system suggestions; payment terms set the credit period", () => {
    const id = st().createRequest({ side: 'receivable', from: 'arun', formNo: 'CRF-0019', paper: 'coastal' });
    st().typeFromPaper(id);
    expect(req(id).values.ledger).toBe('Trade Receivables – Domestic');
    expect(req(id).values.tcsSection).toBe('Not applicable');
    expect(req(id).values.relatedParty).toBe('no');
    expect(req(id).values.taxType).toBe('intra'); // 29 = Karnataka, our home state
    expect(req(id).values.eInvoice).toBe('yes');
    st().setValue(id, 'category', 'scrap_specified_goods');
    expect(req(id).values.tcsSection).toBe('394(1)');
    expect(req(id).values.ledger).toBe('Trade Receivables – Scrap/Specified Goods Sales');
    expect(checks(id).some((c) => c.title.startsWith('The category suggests TCS'))).toBe(false); // confirmed = yes
    st().setValue(id, 'paymentTerms', 'net_45');
    expect(req(id).values.creditDays).toBe(45);
    st().setValue(id, 'category', 'export_goods');
    expect(stopTitles(id)).toContain('"Export Debtor – Goods" is an export category, but Export customer = No');
  });

  it('Deccan Fresh: 3 GSTINs in 3 states → one party, one account, a branch for each GSTIN with an address', () => {
    const id = st().createRequest({ side: 'receivable', from: 'arun', formNo: 'CRF-0021', paper: 'deccan' });
    st().typeFromPaper(id);
    expect(req(id).registrations!.map((g) => g.gstin)).toEqual(['33AAECD0000D1Z2', '32AAECD0000D1Z6']);
    expect(req(id).values.billingGstin).toBe('29AAECD0000D1Z4'); // the main GSTIN, until you choose another
    expect(req(id).values.creditDays).toBe(45); // Net 45
    expect(stopTitles(id)).toContain('Check the other GSTINs on the GST portal');
    st().checkGstin(id);
    expect(Object.keys(req(id).regChecks!)).toHaveLength(2);
    expect(stopTitles(id)).toEqual([]);
    st().submit(id);
    expect(req(id).changes.find((c) => c.block === 'party')!.after.registrations).toContain('33AAECD0000D1Z2');
    req(id).changes.forEach((c) => st().decide(id, c.id, true));
    const done = req(id);
    expect(done.status).toBe('active');
    const party = st().parties.find((p) => p.partyId === done.partyId)!;
    expect(party.gstins.map((g) => `${g.stateCode} ${g.value}`)).toEqual(['KA 29AAECD0000D1Z4', 'TN 33AAECD0000D1Z2', 'KL 32AAECD0000D1Z6']);
    expect(party.locations!.map((l) => l.city)).toEqual(['Chennai']); // Kochi has no address yet
    const accts = st().accounts.filter((a) => a.partyId === party.partyId);
    expect(accts).toHaveLength(1);
    expect(accts[0].branches!.map((b) => `${b.gstin}${b.isDefault ? ' default' : ''}`)).toEqual(['29AAECD0000D1Z4 default', '33AAECD0000D1Z2']);
    expect(st().log.some((e) => e.line === 'No branch yet' && e.detail!.startsWith('32AAECD0000D1Z6'))).toBe(true);
  });

  it('B1 rows are checked: same PAN, not twice, and the billing GSTIN needs its branch address', () => {
    const id = st().createRequest({ side: 'receivable', from: 'arun', formNo: 'CRF-0021', paper: 'deccan' });
    st().typeFromPaper(id);
    const [chennai, kochi] = req(id).registrations!;
    st().setRegistration(id, kochi.id, { gstin: '32AAFFK0000T1Z8' }); // Kerala Traders' GSTIN: another PAN, another party
    expect(stopTitles(id)).toContain('B1 row 2: GSTIN 32AAFFK0000T1Z8 does not belong to PAN AAECD0000D');
    expect(stopTitles(id)).toContain('GSTIN 32AAFFK0000T1Z8 (B1) is already in the party master: P-0036 Kerala Traders');
    st().setRegistration(id, kochi.id, { gstin: '33AAECD0000D1Z2' });
    expect(stopTitles(id)).toContain('GSTIN 33AAECD0000D1Z2 is listed twice');
    st().setRegistration(id, kochi.id, { gstin: '32AAECD0000D1Z6' });
    st().setValue(id, 'billingGstin', '32AAECD0000D1Z6');
    expect(stopTitles(id)).toContain('The billing GSTIN 32AAECD0000D1Z6 needs its branch address');
    st().setValue(id, 'billingGstin', chennai.gstin);
    st().checkGstin(id);
    expect(stopTitles(id)).toEqual([]);
    st().setValue(id, 'gstRegistered', 'no'); // not registered after all: no GSTIN, no B1 rows
    expect(req(id).values.gstin).toBe('');
    expect(req(id).registrations).toEqual([]);
  });

  it('Al Noor: an export customer, no PAN or GSTIN; section E is needed and the e-invoice applies', () => {
    const id = st().createRequest({ side: 'receivable', from: 'arun', formNo: 'CRF-0022', paper: 'alnoor' });
    st().typeFromPaper(id);
    expect(req(id).values.ledger).toBe('Trade Receivables – Export');
    expect(req(id).values.eInvoice).toBe('yes');
    expect(req(id).values.creditDays).toBe(60); // Net 60 (the category says "As per contract / Advance")
    expect(stopTitles(id)).toEqual([]);
    st().setValue(id, 'adBank', '');
    expect(stopTitles(id)).toContain('Still to fill: AD bank');
    st().setValue(id, 'adBank', 'State Bank of India, Overseas Branch, Bengaluru');
    st().setValue(id, 'lut', '');
    expect(checks(id).some((c) => c.level === 'warn' && c.title === 'No LUT: the export goes out with IGST paid (refund route)')).toBe(true);
  });

  it('Healthy Bite: one party, a customer account already; the vendor account adds a role, no new party', () => {
    const r = req('REQ-0100');
    expect(r.partyId).toBe('P-0042');
    expect(r.values.accountName).toBe('Healthy Bite Foods (vendor)');
    expect(checks('REQ-0100').some((c) => c.title === 'Also our customer')).toBe(true);
    const before = st().parties.length;
    st().decide('REQ-0100', 'CHG-0100-2', true);
    expect(st().parties.length).toBe(before);
    expect(st().accounts.filter((a) => a.partyId === 'P-0042').map((a) => a.side).sort()).toEqual(['payable', 'receivable']);
    expect(st().parties.find((p) => p.partyId === 'P-0042')!.roles.map((x) => x.type)).toEqual(['customer', 'supplier']);
  });
});
