// npm run ui:check — the browser check of BOTH paths, the recording model (REC, 27-Nov-2026: the AE types the entry, like
// Tally; no posting rule). The app must be running (npm run dev → http://localhost:5174). RESETS the local demo data.
// Screenshots: <tmp>/aikyat-ui/. Exit 1 on any failure.
//
//  A · FROM AN EVENT  Billing's invoice SV-0012 arrives: the entry is SHOWN FILLED (the document's amounts on the usual
//                     ledgers + the cost from inventory) → accepted as it is → Rajan approves → posted. A credit note against
//                     it: its default edited (a narration) → posted.
//  B · MANUAL         a blank customer form ("New customer from a paper form") typed → submitted → approved → an invoice for
//                     that customer → "Clear and type my own" → typed line by line on the screen → posted.
//  C · phone width (no sideways scroll), dark mode, no console errors.
// The checkers' approvals and the long T12 fields go through the app's own stores (window.__aikyat, development only).
const { mkdirSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { chromium } = require('playwright-core');

const URL = process.env.APP_URL || 'http://localhost:5174/';
const SHOTS = join(tmpdir(), 'aikyat-ui');
mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  · ${detail}` : ''}`); };
const FILL = { customerCategory: 'b2b', category: 'domestic_b2b_regular', exportCustomer: 'no', resident: 'resident', contactPerson: 'Accounts desk', phone: '9820012345', email: 'accounts@example.com', creditOrCash: 'credit', paymentTerms: 'net_30', creditDays: 30, creditLimit: 500000, currency: 'INR', delivery: 'email', eInvoice: 'yes', tcsConfirmed: 'not_applicable', poRule: 'none', gstCertificate: 'yes', panCopy: 'yes', constitution: 'company' };

(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && errs.push(m.text()));
  const shot = (n) => p.screenshot({ path: join(SHOTS, `${n}.png`) });
  const ob = (src) => p.evaluate(([code, fill]) => new Function('o', 'FILL', code)(window.__aikyat.onboarding.getState(), fill), [src, FILL]);
  const sales = (src) => p.evaluate((code) => new Function('s', code)(window.__aikyat.sales.getState()), src);
  const fresh = async () => {
    await p.evaluate(() => fetch('/api/db/reset', { method: 'POST' }));
    await p.evaluate(() => localStorage.clear());
    await p.reload(); await p.waitForTimeout(2500);
    if (await p.locator('[role=dialog]').count()) { await p.keyboard.press('Escape'); await p.waitForTimeout(300); }
  };
  const toSales = async () => { await p.getByRole('button', { name: 'Tasks' }).first().click(); await p.waitForTimeout(400); await p.getByText('Sales: book a sales voucher').first().click(); await p.waitForTimeout(700); };
  const open = async (id) => { await ob(`o.openVoucher('${id}')`); await p.waitForTimeout(900); };
  /** Type one line on the screen: the ledger (typed in the picker, Enter) and its amount. */
  const line = async (query, side, amount, customer = false) => {
    if (customer) await p.getByRole('button', { name: /Add the customer line/ }).click();
    else await p.getByRole('button', { name: 'Add a line', exact: true }).click();
    await p.waitForTimeout(200);
    const rows = p.locator('.sv-post--typed tbody tr');
    const row = rows.nth((await rows.count()) - 1);
    if (!customer) {
      const lp = row.locator('input[role=combobox]');
      await lp.click(); await lp.fill(query); await p.waitForTimeout(150); await p.keyboard.press('Enter');
    }
    await row.locator(`input[aria-label^="${side === 'dr' ? 'Debit' : 'Credit'}"]`).fill(String(amount));
    await p.waitForTimeout(150);
  };
  const submitApprove = async () => {
    await p.getByRole('button', { name: /Submit to Rajan/ }).click(); await p.waitForTimeout(700);
    await p.getByText('Approval & history').click(); await p.waitForTimeout(300);
    await p.getByRole('button', { name: /Rajan approves/ }).click(); await p.waitForTimeout(1500);
    return /Posted/.test(await p.locator('.sv-title').first().innerText());
  };
  const completeRequest = async (id) => {
    await ob(`const r = o.requests.find((x) => x.id === '${id}'); for (const [k, v] of Object.entries(FILL)) if (r.values[k] === undefined || r.values[k] === null || r.values[k] === '') o.setValue('${id}', k, v); o.checkGstin('${id}');`);
    await p.waitForTimeout(400);
    await p.getByRole('button', { name: /Submit for checking/ }).click(); await p.waitForTimeout(800);
    await ob(`const r = o.requests.find((x) => x.id === '${id}'); r.changes.forEach((c) => o.decide(r.id, c.id, true));`);
    await p.waitForTimeout(1200);
    return ob(`return o.requests.find((x) => x.id === '${id}').accountId || null`);
  };

  try {
    for (let i = 0; i < 40; i++) { try { await p.goto(URL); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
    await p.waitForTimeout(2000);

    // ---------------- A · from an event (Billing's invoice): the entry shown filled; the AE accepts it or changes it
    await fresh(); await toSales(); await open('SV-0012');
    await shot('A1_default');
    const submitBtn = p.getByRole('button', { name: /Submit to Rajan/ });
    const shown = await p.locator('.sv-post--typed tbody tr').count();
    check('A1 the entry is shown filled (the invoice\'s amounts + the cost from inventory); Submit open', shown >= 4 && !(await submitBtn.isDisabled()) && (await p.locator('.sv-docamounts').count()) === 1, `${shown} lines`);
    check('A2 the FIFO / weighted-average switch is beside the amounts', (await p.locator('.sv-docamounts').getByText('Weighted average').count()) > 0);
    check('A3 accepted as shown → approved → posted', await submitApprove());
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    const cn = await sales(`return s.receiveNote({ invoiceId: 'SV-0012', docType: 'credit_note', reason: 'price_correction', lines: [{ kind: 'goods', item: 'FG-101', qty: 1, rate: 3000, discount: null }] })`);
    await open(cn);
    const rows = p.locator('.sv-post--typed tbody tr');
    await rows.nth(1).locator('input[aria-label^="Narration"]').fill('Rate agreed lower for the October lot');
    await p.waitForTimeout(300);
    await shot('A4_credit_note_edited');
    const edited = await sales(`return !!s.vouchers.find((x) => x.id === '${cn}').edit`);
    check(`A4 credit note ${cn}: the default edited (a narration), then posted`, edited && (await submitApprove()));
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);

    // ---------------- B · manual: a blank customer form → approved → its invoice typed → posted
    await fresh();
    await p.getByRole('button', { name: 'Tasks' }).first().click(); await p.waitForTimeout(400);
    await p.locator('text=Create a customer >> visible=true').first().click(); await p.waitForTimeout(700);
    await p.getByRole('button', { name: /New customer from a paper form/ }).first().click(); await p.waitForTimeout(500);
    await p.getByPlaceholder('CRF-0021').fill('CRF-9001');
    await p.getByRole('button', { name: 'Open it' }).click(); await p.waitForTimeout(800);
    const mid = await ob('return o.nav.requestId');
    const blank = await ob(`const r = o.requests.find((x) => x.id === '${mid}'); return { source: !!r.source }`);
    await ob(`const id = '${mid}'; const v = { legalName: 'Tranquil Tech Parks Pvt Ltd', tradeName: 'Tranquil Tech Parks Pvt Ltd', gstRegistered: 'yes', gstin: '29AAICT5544M1ZN', gstRegType: 'regular', pan: 'AAICT5544M', state: 'KA', addressLine: 'Outer Ring Road, Marathahalli', city: 'Bengaluru', pincode: '560037' }; for (const [k, x] of Object.entries(v)) o.setValue(id, k, x);`);
    await p.waitForTimeout(400); await shot('B1_manual_form');
    check('B1 manual form opens blank (no event)', !blank.source);
    const macc = await completeRequest(mid);
    check('B2 manual customer submitted and approved', !!macc, `${mid} → ${macc}`);
    await toSales();
    const inv = await sales(`return s.receiveInvoice({ accountId: '${macc}', lines: [{ kind: 'service', item: 'SV-01', qty: 1, rate: 72000, discount: null }] })`);
    await open(inv);
    await p.getByRole('button', { name: /Clear and type my own/ }).click(); await p.waitForTimeout(300);
    await line('', 'dr', 84960, true);
    await line('401020', 'cr', 72000);
    await line('206011', 'cr', 6480);
    await line('206012', 'cr', 6480);
    await shot('B3_typed');
    check(`B3 its invoice ${inv} typed and posted`, await submitApprove());

    // ---------------- C · phone, dark, errors
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await shot('C1_phone');
    check('C1 phone width: no sideways scroll', over <= 0, `${over}px`);
    await p.setViewportSize({ width: 1600, height: 950 }); await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(400); await shot('C2_dark');
    check('C2 no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('script ran to the end', false, String(e.message || e).split('\n')[0]);
    await shot('ERROR');
  } finally {
    await b.close();
    const bad = results.filter((r) => !r.pass).length;
    console.log(`\n${bad ? `${bad} FAILED` : 'ALL PASSED'} (${results.length} checks) · screenshots in ${SHOTS} · the local demo data was reset`);
    process.exit(bad ? 1 : 0);
  }
})();
