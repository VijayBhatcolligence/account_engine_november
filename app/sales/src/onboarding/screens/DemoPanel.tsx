// Mock-only controls (dashed violet: not part of the product). Nothing arrives from Procurement or Sales in the
// system (decided 27-Oct): the paper forms are picked in "New from a paper form". This panel only lists things
// to try and resets the demo. Checker decisions are played from the request itself ("Rajan approves" buttons).

import { resetDatabase } from '../../backend/sync';
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
            <h3 className="section__title">3 · Book a sales voucher (Tasks → Create a voucher)</h3>
            <ul className="ob-tips">
              <li>
                <strong>Sri Lakshmi, KA/INV/2627/0143</strong> (the scenario's B4-01): Billing handed it over; the entry is suggested (rule R1). Click a ledger to pick another (type to search). Submit, then play Rajan: the entry posts. Total ₹7,48,125 (CGST and SGST ₹17,812.50 each).
              </li>
              <li>
                <strong>Kerala Traders, KA/INV/2627/0144</strong>: IGST, one tax line. <strong>Gulf Snack, KA/EXP/2627/0001</strong>: export under LUT, no GST line. As Rajan, try "sends back" or "rejects".
              </li>
              <li>If an invoice is wrong (customer, GST), use "Return to Billing": nothing posts.</li>
              <li>"Mock: Billing sends an invoice" hands you a new one for any customer.</li>
              <li>Forms → Books: the day book, trial balance and customer outstanding show the posted entries.</li>
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
                void resetDatabase();
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
