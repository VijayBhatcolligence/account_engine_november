// Shared by the sales screens: the live rules context and the status words.

import type { Tone } from '../ui';
import { useOnboarding } from '../onboarding/store';
import { ctxOf, useSales } from './store';
import type { Voucher } from './types';

export const V_STATUS: Record<Voucher['status'], { label: string; tone: Tone }> = {
  draft: { label: 'To book · needs me', tone: 'warning' },
  submitted: { label: 'With Rajan', tone: 'info' },
  posted: { label: 'Posted', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'critical' },
  returned: { label: 'Returned to Billing', tone: 'normal' },
};

/** The rules' context, live: onboarding's accounts + this task's invoices and journal. */
export function useSalesCtx() {
  const app = useOnboarding();
  const s = useSales();
  return { app, s, ctx: { ...ctxOf(s), accounts: app.accounts, parties: app.parties, requests: app.requests, now: app.now } };
}
