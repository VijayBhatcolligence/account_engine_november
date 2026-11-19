// The invoice as the customer gets it, laid out as the CA's 43 specimen invoices (rev 5, 18-Nov):
//   our company · title (TAX INVOICE / BILL OF SUPPLY / EXPORT INVOICE) · ORIGINAL FOR RECIPIENT
//   Document no. · Date · Place of supply · Reverse charge · E-way bill · Transport · E-invoice (IRN, Ack) · case fields
//   Bill to (Recipient) · Ship to / Delivery at
//   # · Description · HSN/SAC · Qty · UQC · Rate · Disc. · Taxable · GST % · CGST · SGST | IGST · Total
//   Tax summary by rate · amount in words · tax amount in words · totals · declarations / notes · bank · signatory
// Every particular of CGST Rule 46. Rev 6: this is Billing's invoice, received by the AE (read-only); it is already issued.

import { fmtDate, fmtDateTime } from '../domain/dates';
import { STATES } from '../onboarding/catalogue';
import { COMPANY, ENDORSEMENT } from './catalogue';
import { accountOf, calcOf, countryName, dueDateOf, einvoiceRequired, ewbNeeded, issuerOf, partyOfAccount, placesOf, type SalesCtx } from './rules';
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
    <svg viewBox={`0 0 ${N} ${N}`} width="84" height="84" role="img" aria-label="Signed QR code (mock)" shapeRendering="crispEdges">
      <rect width={N} height={N} fill="#fff" />
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#111" />
      ))}
    </svg>
  );
}

/** The declarations the CA's specimen invoices print, by case (each from the law it cites). */
export function declarationsOf(v: Voucher, c: ReturnType<typeof calcOf>, creditDays: number | null): string[] {
  const out: string[] = [];
  if (c.docType === 'bill_of_supply') out.push('Bill of supply: nil-rated / exempt supply, no tax charged (Sec 31(3)(c), Rule 49).');
  else if (c.exempt > 0) out.push(`Includes nil-rated / exempt value of Rs. ${n2(c.exempt)} on which no tax is charged.`);
  if (c.supplyType === 'B2CS' && c.payable < 50_000) out.push('B2C supply below Rs. 50,000: recipient name and address optional (Rule 46).');
  if (c.supplyType === 'B2CL') out.push('Inter-state B2C supply above Rs. 1,00,000: reported invoice-wise in GSTR-1 (B2CL).');
  if (c.rows.some((r) => r.discount > 0)) out.push('Trade discount allowed on the face of the invoice (Sec 15(3)(a)).');
  if (c.rows.some((r) => r.kind === 'charge')) out.push('Freight charged to the buyer forms part of the value of supply (Sec 15(2)(c)) and is taxed at the rate of the goods.');
  if (c.reimbursement > 0) out.push('Expenses incurred as pure agent of the recipient are excluded from the value of supply (Rule 33).');
  if (c.posBasis === 'goods_bill_to_third_party') out.push('Bill-to-ship-to: place of supply is the principal place of business of the person on whose direction the goods are delivered (IGST Act Sec 10(1)(b)).');
  if (c.posBasis === 'service_immovable_property') out.push('Place of supply is the location of the immovable property (IGST Act Sec 12(3)).');
  if (c.kind !== 'domestic') out.push(c.exportType === 'lut' ? `${ENDORSEMENT.lut} (LUT ${COMPANY.lut.no}).` : ENDORSEMENT.igst + '.');
  if (c.refund > 0) out.push(c.kind === 'sez' ? 'Supply to SEZ unit on payment of IGST. Refund of IGST to be claimed by the supplier (Rule 89); IGST not recoverable from the SEZ unit.' : 'Supply meant for export on payment of IGST. IGST is paid by the exporter and refund is claimed; it is not payable by the recipient.');
  if (c.kind === 'sez') out.push('Endorsement of Specified Officer, SEZ: ____________________');
  if (c.rows.some((r) => r.deferred)) out.push('Service period as stated on the line; the service is billed in advance for the period.');
  if ((v.advanceAmount ?? 0) > 0) out.push(`Tax on this invoice was paid on the advance (${v.advanceRef}) and is adjusted in GSTR-1 Table 11B.`);
  if (v.settlement === 'credit' && c.payable > 0) out.push(`Payment terms: ${creditDays ?? 0} days from invoice date.`);
  return out;
}

export function InvoiceDoc({ v, ctx }: { v: Voucher; ctx: SalesCtx }) {
  const c = calcOf(v, ctx);
  const a = accountOf(ctx, v.accountId);
  const p = partyOfAccount(ctx, v.accountId);
  const br = issuerOf(v);
  const pl = placesOf(ctx, v);
  const exp = c.kind !== 'domestic';
  const bos = c.docType === 'bill_of_supply';
  const intra = c.intra === true;
  const taxTotal = c.cgst + c.sgst + c.igst;
  const cur = c.currency === 'INR' ? 'Rs.' : c.currency;
  const title = c.docType === 'export_invoice' ? 'EXPORT INVOICE' : bos ? 'BILL OF SUPPLY' : 'TAX INVOICE';
  const goods = c.rows.some((r) => r.kind === 'goods');
  const third = v.thirdPartyShipTo;
  const meta: [string, string][] = [
    ['Document no.', v.number ?? '(given on approval)'],
    ['Date', fmtDate(v.date)],
    ['Place of supply', c.posName ? `${c.posName} (${c.posCode})` : '—'],
    ['Reverse charge', 'No'],
  ];
  if (v.settlement !== 'credit') meta.push(['Payment', `${v.settlement === 'cash' ? 'Cash' : 'UPI / card'}${v.paymentRef ? ` · Ref ${v.paymentRef}` : ''}`]);
  if (c.posBasis === 'service_immovable_property') meta.push(['Location of property', c.posName ?? '—']);
  if (exp) {
    meta.push(['Currency', c.currency === 'INR' ? 'INR' : `${c.currency} · Rs. ${c.fx} per ${c.currency}`]);
    if (c.kind === 'export') {
      meta.push(['Shipping bill', v.shippingBillNo ? `${v.shippingBillNo}${v.shippingBillDate ? ` dt. ${fmtDate(v.shippingBillDate)}` : ''}` : '(to follow)']);
      if (v.portCode) meta.push(['Port code', v.portCode]);
      if (v.incoterm) meta.push(['Incoterm', v.incoterm]);
      meta.push(['Country of destination', countryName(p?.address.country)]);
    }
  }
  if (v.orderRef) meta.push([exp ? 'Export order ref' : 'Order ref', v.orderRef]);
  if ((v.advanceAmount ?? 0) > 0) meta.push(['Against receipt', v.advanceRef || '—'], ['Advance adjusted', `Rs. ${n2(v.advanceAmount ?? 0)}`]);
  if (goods && ewbNeeded(c)) meta.push(['E-way bill', v.ewbNo ? `${v.ewbNo}${v.ewbValidTo ? ` · valid to ${fmtDate(v.ewbValidTo)}` : ''}` : '(on approval)']);
  if (goods && (v.transport.vehicleNo || v.transport.distanceKm)) meta.push(['Transport', `Road${v.transport.vehicleNo ? ` · ${v.transport.vehicleNo}` : ''}${v.transport.distanceKm ? ` · ${v.transport.distanceKm} km` : ''}`]);

  const party = (head: string, name: string, loc: { line?: string; city?: string; pincode?: string } | null, stateKey: string | null | undefined, gstin: string | undefined) => (
    <div className="inv-cell inv-party">
      <span className="inv-k">{head}</span>
      <strong>{name}</strong>
      <span>{loc ? [loc.line, loc.city, loc.pincode].filter(Boolean).join(', ') : ''}</span>
      <span>{c.kind === 'export' ? `Country: ${countryName(p?.address.country)}` : `State: ${STATES[stateKey ?? '']?.name ?? '—'} (${STATES[stateKey ?? '']?.code ?? '—'})`}</span>
      <span>GSTIN: {c.kind === 'export' ? 'URP (overseas)' : gstin ?? 'Unregistered'}</span>
    </div>
  );

  return (
    <div className="inv">

      <div className="inv-top">
        <div className="inv-co">
          <strong className="inv-co__name">{COMPANY.legalName}</strong>
          {br.address.map((l) => (
            <span key={l}>{l}</span>
          ))}
          <span>
            State: {STATES[br.state]?.name} ({STATES[br.state]?.code}) · GSTIN: <b>{br.gstin}</b> · PAN: {COMPANY.pan}
          </span>
          <span>
            CIN: {COMPANY.cin} · FSSAI: {COMPANY.fssai}
          </span>
          <span>
            {COMPANY.phone} · {COMPANY.email}
          </span>
        </div>
        <div className="inv-titlebox">
          <p className="inv-title">{title}</p>
          <p className="inv-sub">ORIGINAL FOR RECIPIENT</p>
        </div>
      </div>

      <div className="inv-meta">
        {meta.map(([k, val]) => (
          <div key={k} className="inv-cell">
            <span className="inv-k">{k}</span>
            <b>{val}</b>
          </div>
        ))}
        {einvoiceRequired(c) && (
          <div className="inv-cell inv-meta__irn">
            <span className="inv-k">E-invoice</span>
            <span className="mono">IRN: {v.irn ?? '(on approval)'}</span>
            <span>
              Ack no.: {v.ackNo ?? '—'} · Ack date: {v.ackAt ? fmtDate(v.ackAt.slice(0, 10)) : '—'}
            </span>
          </div>
        )}
        <div className="inv-qr">{v.irn ? <Qr seed={v.irn} /> : <span className="inv-qr__empty">{einvoiceRequired(c) ? 'Signed QR after the IRN' : 'Dynamic QR (B2C)'}</span>}</div>
      </div>

      <div className="inv-parties">
        {party('Bill to (Recipient)', p?.legalName ?? a?.name ?? '—', pl.billLoc, pl.bill?.stateCode ?? pl.billLoc?.stateCode, pl.bill?.gstin?.value)}
        {third
          ? party('Ship to / Delivery at', third.name, third, third.stateCode, undefined)
          : party('Ship to / Delivery at', p?.legalName ?? a?.name ?? '—', pl.ship, pl.ship?.stateCode, p?.gstins.find((g) => g.stateCode === pl.ship?.stateCode)?.value ?? pl.bill?.gstin?.value)}
      </div>

      <table className="inv-items">
        <thead>
          <tr>
            <th>#</th>
            <th>Description</th>
            <th>HSN/SAC</th>
            <th className="num">Qty</th>
            <th>UQC</th>
            <th className="num">Rate ({cur})</th>
            <th className="num">Disc. ({cur})</th>
            <th className="num">Taxable ({cur})</th>
            {!bos && <th className="num">GST %</th>}
            {!bos && (intra ? <th className="num">CGST (Rs.)</th> : <th className="num">IGST (Rs.)</th>)}
            {!bos && intra && <th className="num">SGST (Rs.)</th>}
            <th className="num">Total ({cur})</th>
          </tr>
        </thead>
        <tbody>
          {c.rows.map((r, i) => {
            const base = r.foreign ?? r.amount;
            const tax = c.currency === 'INR' ? r.tax : 0;
            return (
              <tr key={r.idx}>
                <td>{i + 1}</td>
                <td>
                  {r.name}
                  {r.taxability !== 'taxable' && <span className="inv-batch">{r.kind === 'reimbursement' ? 'Pure agent: outside the value' : r.taxability.replace('_', '-')}</span>}
                </td>
                <td>{r.hsn || '—'}</td>
                <td className="num">{r.qty}</td>
                <td>{r.uqc}</td>
                <td className="num">{n2(r.rate)}</td>
                <td className="num">{r.discount ? n2(r.discount) : '–'}</td>
                <td className="num">{n2(base)}</td>
                {!bos && <td className="num">{r.taxability !== 'taxable' ? '–' : c.exportType === 'lut' ? '0%' : `${r.gst}%`}</td>}
                {!bos && <td className="num">{intra ? n2(r.cgst) : r.igst ? n2(r.igst) : '–'}</td>}
                {!bos && intra && <td className="num">{n2(r.sgst)}</td>}
                <td className="num">{n2(base + tax)}</td>
              </tr>
            );
          })}
          {c.rows.length === 0 && (
            <tr>
              <td colSpan={12} className="inv-empty">
                No line yet
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="inv-bottom">
        <div className="inv-bottom__left">
          {!bos && c.hsn.length > 0 && (
            <table className="inv-hsn">
              <thead>
                <tr>
                  <th>Rate</th>
                  <th className="num">Taxable (Rs.)</th>
                  {intra ? (
                    <>
                      <th className="num">CGST</th>
                      <th className="num">SGST</th>
                    </>
                  ) : (
                    <th className="num">IGST</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {Object.values(
                  c.hsn.reduce<Record<string, { gst: number; taxable: number; cgst: number; sgst: number; igst: number }>>((m, g) => {
                    const x = (m[g.gst] ??= { gst: g.gst, taxable: 0, cgst: 0, sgst: 0, igst: 0 });
                    x.taxable += g.taxable;
                    x.cgst += g.cgst;
                    x.sgst += g.sgst;
                    x.igst += g.igst;
                    return m;
                  }, {}),
                ).map((g) => (
                  <tr key={g.gst}>
                    <td>{c.exportType === 'lut' ? '0%' : `${g.gst}%`}</td>
                    <td className="num">{n2(g.taxable)}</td>
                    {intra ? (
                      <>
                        <td className="num">{n2(g.cgst)}</td>
                        <td className="num">{n2(g.sgst)}</td>
                      </>
                    ) : (
                      <td className="num">{n2(g.igst)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="inv-words">
            Amount in words: <b>{rupeesInWords(c.payable)}</b>
          </p>
          {taxTotal > 0 && (
            <p className="inv-words">
              Tax amount in words: <b>{rupeesInWords(taxTotal)}</b>
            </p>
          )}
        </div>
        <dl className="inv-totals">
          <dt>Taxable value</dt>
          <dd>{n2(c.taxable)}</dd>
          {c.exempt > 0 && (
            <>
              <dt>Nil-rated / exempt</dt>
              <dd>{n2(c.exempt)}</dd>
            </>
          )}
          {c.reimbursement > 0 && (
            <>
              <dt>Pure-agent expenses</dt>
              <dd>{n2(c.reimbursement)}</dd>
            </>
          )}
          {intra && c.cgst > 0 && (
            <>
              <dt>CGST</dt>
              <dd>{n2(c.cgst)}</dd>
              <dt>SGST</dt>
              <dd>{n2(c.sgst)}</dd>
            </>
          )}
          {!intra && c.igst > 0 && (
            <>
              <dt>IGST</dt>
              <dd>{n2(c.igst)}</dd>
            </>
          )}
          {c.roundOff !== 0 && (
            <>
              <dt>Round off</dt>
              <dd>{n2(c.roundOff)}</dd>
            </>
          )}
          {c.refund > 0 && (
            <>
              <dt>Less IGST paid by us (refund claimed)</dt>
              <dd>− {n2(c.refund)}</dd>
            </>
          )}
          <dt className="inv-totals__pay">Amount payable by recipient (Rs.)</dt>
          <dd className="inv-totals__pay">₹ {n2(c.payable)}</dd>
          {c.foreignTotal !== null && (
            <>
              <dt>In {c.currency}</dt>
              <dd>
                {c.currency} {n2(c.foreignTotal)}
              </dd>
            </>
          )}
        </dl>
      </div>

      <div className="inv-foot">
        <div className="inv-cell">
          <span className="inv-k">Declarations / notes</span>
          {declarationsOf(v, c, a?.creditDays ?? null).map((d) => (
            <span key={d}>• {d}</span>
          ))}
          <span>
            Bank details: {COMPANY.bank.name}, {COMPANY.bank.branch} · A/c {COMPANY.bank.account} · IFSC {COMPANY.bank.ifsc}
          </span>
          {v.settlement === 'credit' && a && <span>Due date: {fmtDate(dueDateOf(v, a))}</span>}
        </div>
        <div className="inv-cell inv-sign">
          <span>For {COMPANY.legalName}</span>
          <span className="inv-signed">{v.ackAt ? `Digitally signed · ${fmtDateTime(v.ackAt)}` : ' '}</span>
          <b>Authorised Signatory</b>
        </div>
      </div>
    </div>
  );
}
