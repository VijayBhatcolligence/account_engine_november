// Mock-only controls (dashed violet: not part of the product). Nothing arrives from Procurement or Sales in the
// system (decided 27-Oct): the paper forms are picked in "New from a paper form". This panel only lists things
// to try and resets the demo. Checker decisions are played from the request itself ("Rajan approves" buttons).

import { useState } from 'react';
import { FlaskConical, RotateCcw } from 'lucide-react';
import { Button, Sheet } from '../../ui';
import { useCnc } from '../../cnc/store';
import { useSales } from '../../sales/store';
import { useOnboarding } from '../store';

export function DemoPanel() {
  const s = useOnboarding();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="ob-launcher" onClick={() => setOpen(true)}>
        <FlaskConical size={16} aria-hidden />
        <span>
          <span className="ob-launcher__tag">DEMO</span>
          <span className="ob-launcher__text">Things to try</span>
        </span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Demo" description="Mock only. Stands in for the paper forms, the GST portal, the bank and the checkers.">
        <div className="sheet-stack">
          <section>
            <h3 className="section__title">1 · Paper forms on your desk</h3>
            <p className="subtle small-note">Create a customer → "New customer from a paper form" → pick one under DEMO. The paper shows beside the form; "Type it all in for me" copies it.</p>
            <ul className="ob-tips">
              <li>
                <strong>Coastal Bakes</strong> (customer, Arun): same PAN as an old party P-0088, so a warning with "Use P-0088".
              </li>
              <li>
                <strong>Sri Lakshmi (Mysuru)</strong> (customer, Arun): its GSTIN is already our customer C-01. Stop: return the form.
              </li>
            </ul>
          </section>
          <section>
            <h3 className="section__title">2 · Things to try on Coastal Bakes (CRF-0019)</h3>
            <ul className="ob-tips">
              <li>Open it from DEMO and press "Type it all in for me".</li>
              <li>Change one letter of the PAN: "GSTIN does not belong to this PAN".</li>
              <li>Press "Check the GSTIN on the GST portal". A GSTIN with ZZ as letters 3–4 comes back cancelled: return the form.</li>
              <li>Change the state: "State does not match the GSTIN".</li>
              <li>Submit, then play Rajan / Farid / Venkat. Return one part to see it come back. On approval the customer appears in Forms › Vendors &amp; customers with its AR account.</li>
              <li>Watch the Backend tab after each step.</li>
            </ul>
          </section>
          <section>
            <h3 className="section__title">3 · Raise a sales invoice (Tasks → Create a voucher)</h3>
            <ul className="ob-tips">
              <li>
                <strong>Sri Lakshmi, DC-1 / SO-1</strong> (SI-0012, the scenario's B4-01): the invoice is prefilled; open the Accounting entry tab and type the entry yourself (Party A/c, sales ledger, CGST, SGST, amounts, and the challan's cost entry: Dr cost of goods sold, Cr FG inventory), or press "Type it in for me"; then pick a wrong ledger to see it stop. Type the customer's PO, submit, play Rajan. Total ₹7,48,125 (CGST and SGST ₹17,812.50 each). Batch G-2604 expires in 5 days (warning).
              </li>
              <li>
                <strong>Kerala Traders, DC-0005</strong> (under To bill): Kerala, so IGST and the inter-state sales ledger; 560 km, so a 3-day e-way bill.
              </li>
              <li>Type 301 cartons on a 300-carton line: a Stop (never above the challan). Type 200: partial billing, 100 stay on the unbilled list.</li>
              <li>
                <strong>Coastal Bakes, DC-0007</strong>: waits until you finish its onboarding (CRF-0019). Then "Latha records DC-0007", and bill it (PO required).
              </li>
              <li>Forms → Books: the day book shows Stores' cost entries (Dr cost of goods sold, Cr FG inventory) beside the invoices; Stock shows the batches. Rules → Posting rules switches Perpetual / Periodic.</li>
              <li>Invoice date 2026-08-31: a closed month, a Stop. 2026-09-30: soft-closed, a warning.</li>
              <li>After posting: Issue a credit note, then see Forms → Books (day book, trial balance, stock, customer outstanding).</li>
            </ul>
          </section>
          <section>
            <h3 className="section__title">4 · Start again</h3>
            <Button
              icon={RotateCcw}
              onClick={() => {
                s.reset();
                useSales.getState().reset();
                useCnc.getState().reset();
                setOpen(false);
              }}
            >
              Reset the demo
            </Button>
          </section>
        </div>
      </Sheet>
    </>
  );
}
