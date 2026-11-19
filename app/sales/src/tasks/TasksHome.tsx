// Tasks: one card per task of this role, grouped. A card opens that task's full-screen workspace.
//   Onboarding        create a customer (its AR ledger)
//   Create a voucher  two types, two separate tasks built side by side by two people:
//                     Sales invoice (this app, T24) · Purchase voucher (T1, built in parallel by a teammate)

import { useState } from 'react';
import { ReceiptText, ShoppingCart, UserPlus } from 'lucide-react';
import { ActionCard, Button, Dialog, PageHeader } from '../ui';
import { isCustomer, isMine, isWithOthers, useOnboarding } from '../onboarding/store';
import { isMineV, isWithOthersV, useSales } from '../sales/store';
import { TASKS } from './TaskPicker';

export function TasksHome() {
  const s = useOnboarding();
  const sales = useSales();
  const [purchase, setPurchase] = useState(false);
  const [onb, sv] = TASKS;
  const count = (mine: number, others: number) => `${mine} need${mine === 1 ? 's' : ''} you · ${others} with checkers`;
  return (
    <div className="tasks-home">
      <PageHeader title="Tasks" subtitle="Pick a task. Each opens full screen: the list on the left, the form in the middle, the checklist on the right." />
      <section className="tasks-home__group">
        <h2 className="tasks-home__h">Onboarding</h2>
        <div className="tasks-home__grid">
          <ActionCard
            icon={UserPlus}
            accent="teal"
            title="Create a customer"
            description="A new customer from the paper form Sales hands you: the party in the master and its AR ledger under the right header, with its credit limit."
            code={onb.code}
            cadence={count(s.requests.filter(isCustomer).filter(isMine).length, s.requests.filter(isCustomer).filter(isWithOthers).length)}
            badge={s.requests.filter(isCustomer).filter(isMine).length}
            onClick={() => s.navigate('onboarding')}
          />
        </div>
      </section>
      <section className="tasks-home__group">
        <h2 className="tasks-home__h">Create a voucher · two types</h2>
        <div className="tasks-home__grid">
          <ActionCard
            icon={ReceiptText}
            accent="blue"
            title="Sales: book a sales voucher"
            description="Billing hands over the invoice; you book its entry: Dr customer, Cr sales, Cr GST. Ledgers are suggested; pick others if needed. Every worked-out value shows its logic."
            code={sv.code}
            cadence={count(sales.vouchers.filter(isMineV).length, sales.vouchers.filter(isWithOthersV).length)}
            badge={sales.vouchers.filter(isMineV).length}
            onClick={() => s.navigate('sales')}
          />
          <ActionCard
            icon={ShoppingCart}
            accent="amber"
            title="Purchase: post a purchase voucher"
            description="A vendor invoice against its PO and GRN: three-way match, input GST (ITC), TDS, the MSME 45-day clock."
            code="T1 · built in parallel"
            cadence="A separate task, built side by side by a teammate"
            onClick={() => setPurchase(true)}
          />
        </div>
      </section>
      <Dialog
        open={purchase}
        onClose={() => setPurchase(false)}
        title="Purchase voucher (T1)"
        description="A separate task in the same Create a voucher menu, built side by side by a second person."
        footer={<Button onClick={() => setPurchase(false)}>Close</Button>}
      >
        <ul className="ob-plain">
          <li>Same layout (list · form · checklist) and the same method (01, rev 6): the app + the task doc → the backend.</li>
          <li>Same shared parts: the party accounts from onboarding, the posting engine, the approval mechanism, the Books.</li>
          <li>Its own entry: Dr purchases or GRN-clearing, Dr input CGST / SGST (or IGST), Cr the vendor's AP account, Cr TDS payable. Under Perpetual the stock side is the GRN's, as the cost side of a sale is the challan's.</li>
          <li>Not in this app yet: it lands here when the teammate's branch is merged.</li>
        </ul>
      </Dialog>
    </div>
  );
}
