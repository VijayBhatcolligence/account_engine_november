// The tax invoice as it is issued (Tally layout), with every particular of CGST Rule 46, the e-invoice
// fields (IRN, Ack No, Ack Date, signed QR) and the FSSAI licence number (FSSAI order of 10-Jun-2021).
// Before confirmation it is a DRAFT built from the entry; it becomes the invoice once posted and the IRN exists.

import { fmtDate, fmtDateTime } from '../domain/dates';
import { ACTORS, STATES } from '../onboarding/catalogue';
import { COMPANY, PARAMS } from './catalogue';
import { accountOf, billingOf, branchOfV, calcOf, challanOf, dueDateOf, ewbDays, partyOfAccount, rupees, type SalesCtx } from './rules';
import type { Voucher } from './types';
import { rupeesInWords } from './words';

const n2 = (x: number) => x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A mock signed QR: a fixed pattern drawn from the IRN (not scannable). */
function Qr({ seed }: { seed: string }) {
  const N = 25;
  const cells: [number, number][] = [];
  let h = 7;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      h = (h * 31 + seed.charCodeAt((x + y * N) % seed.length)) % 1_000_003;
      const finder = (x < 7 && y < 7) || (x > N - 8 && y < 7) || (x < 7 && y > N - 8);
      const ring = finder && (x % 6 === 0 || y % 6 === 0 || (x % 7 > 1 && x % 7 < 5 && y % 7 > 1 && y % 7 < 5) || x === N - 1 || x === N - 7 || y === N - 1 || y === N - 7);
      if (finder ? ring : h % 3 === 0) cells.push([x, y]);
    }
  return (
    <svg viewBox={`0 0 ${N} ${N}`} width="92" height="92" role="img" aria-label="Signed QR code (mock)" shapeRendering="crispEdges">
      <rect width={N} height={N} fill="#fff" />
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#111" />
      ))}
    </svg>
  );
}

export function InvoiceDoc({ v, ctx }: { v: Voucher; ctx: SalesCtx }) {
  const c = calcOf(v, ctx);
  const a = accountOf(ctx, v.accountId);
  const p = partyOfAccount(ctx, v.accountId);
  const dc = challanOf(ctx, v.dcId);
  const final = v.status === 'posted' || v.status === 'cancelled';
  const bv = branchOfV(ctx, v);
  const loc = bv?.location ?? p?.address ?? null;
  const st = (p && (bv?.stateCode || p.address.stateCode)) || '';
  const due = dueDateOf(v, a);
  const bill = billingOf(ctx, a);
  const taxTotal = c.cgst + c.sgst + c.igst;
  const party = (title: string) => (
    <div className="inv-cell inv-party">
      <span className="inv-k">{title}</span>
      <strong>{p?.legalName ?? '—'}</strong>
      <span>{loc ? [loc.line, loc.city, loc.pincode].filter(Boolean).join(', ') : ''}</span>
      <span>
        GSTIN/UIN: <b>{bv?.gstin?.value ?? '—'}</b>
      </span>
      <span>
        State Name: {STATES[st]?.name ?? '—'}, Code: {STATES[st]?.code ?? '—'}
      </span>
      {title.startsWith('Buyer') && <span>Place of Supply: {c.pos ? `${STATES[c.pos]?.name} (${STATES[c.pos]?.code})` : '—'}</span>}
    </div>
  );
  const ref = (k: string, val: string) => (
    <div className="inv-cell">
      <span className="inv-k">{k}</span>
      <b>{val || ' '}</b>
    </div>
  );
  return (
    <div className={`inv${final ? '' : ' is-draft'}${v.status === 'cancelled' ? ' is-cancelled' : ''}`}>
      {!final && <div className="inv-mark">DRAFT · not an invoice until confirmed (IRN)</div>}
      {v.status === 'cancelled' && <div className="inv-mark">CREDITED IN FULL · {v.cancel?.creditNote}</div>}
      <div className="inv-top">
        <div>
          <p className="inv-title">TAX INVOICE</p>
          <p className="inv-sub">e-Invoice · (ORIGINAL FOR RECIPIENT)</p>
          <dl className="inv-irn">
            <dt>IRN</dt>
            <dd className="mono">{v.irn ?? 'generated on confirmation'}</dd>
            <dt>Ack No.</dt>
            <dd className="mono">{v.ackNo ?? '—'}</dd>
            <dt>Ack Date</dt>
            <dd>{v.ackAt ? fmtDateTime(v.ackAt) : '—'}</dd>
          </dl>
        </div>
        <div className="inv-qr">{v.irn ? <Qr seed={v.irn} /> : <span className="inv-qr__empty">Signed QR after the IRN</span>}</div>
      </div>

      <div className="inv-head">
        <div className="inv-left">
          <div className="inv-cell inv-party">
            <strong>{COMPANY.legalName}</strong>
            {COMPANY.address.map((l) => (
              <span key={l}>{l}</span>
            ))}
            <span>
              GSTIN/UIN: <b>{COMPANY.gstin}</b>
            </span>
            <span>State Name: Karnataka, Code: 29</span>
            <span>CIN: {COMPANY.cin}</span>
            <span>FSSAI Lic. No.: {COMPANY.fssai}</span>
            <span>
              E-Mail: {COMPANY.email} · {COMPANY.phone}
            </span>
          </div>
          {party('Consignee (Ship to)')}
          {party('Buyer (Bill to)')}
        </div>
        <div className="inv-refs">
          {ref('Invoice No.', v.number ?? '(on confirmation)')}
          {ref('Dated', fmtDate(v.date))}
          {ref('Delivery Note', v.dcId)}
          {ref('Mode/Terms of Payment', a ? `${a.creditDays ?? 0} days credit · due ${fmtDate(due)}` : '')}
          {ref('Reference No. & Date', dc ? `${dc.soId} dt. ${fmtDate(dc.soDate)}` : '')}
          {ref('Other References', `Branch ${COMPANY.branch.split(' ')[0]} · Godown KA-FG`)}
          {ref("Buyer's Order No.", v.customerPo || (bill?.poRule === 'every_invoice' ? '(required)' : ''))}
          {ref('Dated', v.customerPo && dc ? fmtDate(dc.soDate) : '')}
          {ref('Dispatch Doc No.', v.dcId)}
          {ref('Delivery Note Date', dc ? fmtDate(dc.date) : '')}
          {ref('Dispatched through', dc?.transporter ?? '')}
          {ref('Destination', loc?.city ?? '')}
          {ref('Bill of Lading/LR-RR No.', dc?.lrNo ?? '')}
          {ref('Motor Vehicle No.', dc ? `${dc.vehicleNo} (Part-B: ${ACTORS.latha.name})` : '')}
          <div className="inv-cell inv-span2">
            <span className="inv-k">Terms of Delivery</span>
            <b>Door delivery, freight paid by us · E-way bill {v.ewbNo ? `${v.ewbNo}, valid to ${fmtDate(v.ewbValidTo)}` : c.total > PARAMS.ewayBillMin.value ? `on confirmation (${dc ? ewbDays(dc.distanceKm) : 1} day validity)` : 'not needed (≤ ₹50,000)'}</b>
          </div>
        </div>
      </div>

      <table className="inv-items">
        <thead>
          <tr>
            <th>Sl No.</th>
            <th>Description of Goods</th>
            <th>HSN/SAC</th>
            <th>GST Rate</th>
            <th className="num">Quantity</th>
            <th className="num">Rate</th>
            <th>per</th>
            <th>Disc. %</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {c.rows.map((r, i) => (
            <tr key={`${r.dcLine}`}>
              <td>{i + 1}</td>
              <td>
                <b>{r.name}</b>
                <span className="inv-batch">
                  {r.item} · Batch {r.batch} · Expiry {fmtDate(r.expiry)}
                </span>
              </td>
              <td>{r.hsn}</td>
              <td>{r.gst} %</td>
              <td className="num">
                <b>
                  {r.qty} {r.uqc}
                </b>
              </td>
              <td className="num">{n2(r.rate)}</td>
              <td>{r.uqc}</td>
              <td />
              <td className="num">{n2(r.amount)}</td>
            </tr>
          ))}
          {c.intra !== false && (
            <>
              <tr className="inv-tax">
                <td />
                <td>Output CGST</td>
                <td colSpan={6} />
                <td className="num">{n2(c.cgst)}</td>
              </tr>
              <tr className="inv-tax">
                <td />
                <td>Output SGST</td>
                <td colSpan={6} />
                <td className="num">{n2(c.sgst)}</td>
              </tr>
            </>
          )}
          {c.intra === false && (
            <tr className="inv-tax">
              <td />
              <td>Output IGST</td>
              <td colSpan={6} />
              <td className="num">{n2(c.igst)}</td>
            </tr>
          )}
          {c.roundOff !== 0 && (
            <tr className="inv-tax">
              <td />
              <td>Round off</td>
              <td colSpan={6} />
              <td className="num">{n2(c.roundOff)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td />
            <td>Total</td>
            <td colSpan={2} />
            <td className="num">
              {c.rows.reduce((t, r) => t + r.qty, 0)} CTN
            </td>
            <td colSpan={3} />
            <td className="num">₹ {n2(c.total)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="inv-line">
        <span>
          Amount Chargeable (in words): <b>{rupeesInWords(c.total)}</b>
        </span>
        <span>E. &amp; O.E</span>
      </div>

      <table className="inv-hsn">
        <thead>
          <tr>
            <th rowSpan={2}>HSN/SAC</th>
            <th rowSpan={2} className="num">
              Taxable Value
            </th>
            {c.intra === false ? (
              <th colSpan={2}>Integrated Tax</th>
            ) : (
              <>
                <th colSpan={2}>Central Tax</th>
                <th colSpan={2}>State Tax</th>
              </>
            )}
            <th rowSpan={2} className="num">
              Total Tax Amount
            </th>
          </tr>
          <tr>
            {(c.intra === false ? ['Rate', 'Amount'] : ['Rate', 'Amount', 'Rate', 'Amount']).map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {c.hsn.map((g) => (
            <tr key={`${g.hsn}${g.gst}`}>
              <td>{g.hsn}</td>
              <td className="num">{n2(g.taxable)}</td>
              {c.intra === false ? (
                <>
                  <td>{g.gst}%</td>
                  <td className="num">{n2(g.igst)}</td>
                </>
              ) : (
                <>
                  <td>{g.gst / 2}%</td>
                  <td className="num">{n2(g.cgst)}</td>
                  <td>{g.gst / 2}%</td>
                  <td className="num">{n2(g.sgst)}</td>
                </>
              )}
              <td className="num">{n2(g.cgst + g.sgst + g.igst)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="num">{n2(c.taxable)}</td>
            {c.intra === false ? (
              <>
                <td />
                <td className="num">{n2(c.igst)}</td>
              </>
            ) : (
              <>
                <td />
                <td className="num">{n2(c.cgst)}</td>
                <td />
                <td className="num">{n2(c.sgst)}</td>
              </>
            )}
            <td className="num">{n2(taxTotal)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="inv-line">
        <span>
          Tax Amount (in words): <b>{rupeesInWords(taxTotal)}</b>
        </span>
      </div>
      <div className="inv-line inv-small">
        <span>Whether tax is payable on reverse charge: No · TCS: not applicable · Cess: nil</span>
        <span>Company's PAN: {COMPANY.pan}</span>
      </div>

      <div className="inv-foot">
        <div className="inv-cell">
          <span className="inv-k">Declaration</span>
          <span>We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</span>
        </div>
        <div className="inv-cell">
          <span className="inv-k">Company's Bank Details</span>
          <span>
            Bank: {COMPANY.bank.name} · A/c No.: {COMPANY.bank.account}
          </span>
          <span>
            Branch &amp; IFS Code: {COMPANY.bank.branch} · {COMPANY.bank.ifsc}
          </span>
        </div>
        <div className="inv-cell">
          <span className="inv-k">Customer's Seal and Signature</span>
        </div>
        <div className="inv-cell inv-sign">
          <span>for {COMPANY.legalName}</span>
          <span className="inv-signed">{final ? `Digitally signed · ${fmtDateTime(v.postedAt!)}` : ' '}</span>
          <b>Authorised Signatory</b>
        </div>
      </div>
      <p className="inv-end">
        SUBJECT TO {COMPANY.jurisdiction.toUpperCase()} JURISDICTION · This is a Computer Generated Invoice · Total {rupees(c.total)}
      </p>
    </div>
  );
}
