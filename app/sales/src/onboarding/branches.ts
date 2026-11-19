// A customer's billing branches (docs/sales/sales_engine/customer_onboarding_schema.dbml, fin.debtor_location, usage bill_to).
// The ship-to (usage ship_to) is a P&C location with purpose 'ship_to' and Account.shipTo: never a billing branch.
// One party and one customer account, however many branches. P&C holds the locations and the GSTINs but not which
// GSTIN goes with which location; the account's branch rows say so (ids only). The first location is the party's
// registered address; the account's first branch is the one the onboarding form gave.

import type { Account, CustomerBranch, Party, PartyGstin, PartyLocation } from './types';

/** P&C's locations of a party: the registered address first, then any others it holds. */
export function locationsOf(p: Party): PartyLocation[] {
  return [{ locationId: `${p.partyId}-L1`, label: p.address.city || 'Registered office', ...p.address }, ...(p.locations ?? [])];
}

/** The GSTINs P&C holds for a location's state that can be billed (not cancelled). */
export const gstinsForLocation = (p: Party, loc: PartyLocation): PartyGstin[] => p.gstins.filter((g) => g.stateCode === loc.stateCode && g.status !== 'cancelled');

/** The account's branches. An account set up before branches existed has one: the registered address, default. */
export function branchesOf(a: Account, p: Party | null): CustomerBranch[] {
  if (a.branches?.length) return a.branches;
  if (!p) return [];
  const loc = locationsOf(p)[0];
  const gstin = a.gstin ?? gstinsForLocation(p, loc)[0]?.value ?? null;
  return [{ branchId: `${a.accountId}-B1`, locationId: loc.locationId, gstin, isDefault: true, since: a.activatedAt }];
}

export const openBranches = (a: Account, p: Party | null) => branchesOf(a, p).filter((b) => !b.until);

export interface BranchView {
  branch: CustomerBranch;
  location: PartyLocation | null;
  gstin: PartyGstin | null;
  /** The branch's state: its GSTIN's, else its address's. The place of supply of an invoice to it. */
  stateCode: string | null;
}

export function viewOf(p: Party, b: CustomerBranch): BranchView {
  const location = locationsOf(p).find((l) => l.locationId === b.locationId) ?? null;
  const gstin = b.gstin ? p.gstins.find((g) => g.value === b.gstin) ?? null : null;
  return { branch: b, location, gstin, stateCode: gstin?.stateCode || location?.stateCode || null };
}

/** The branch an invoice bills: the one it chose if still open, else the default, else the first open one. */
export function branchFor(a: Account | null, p: Party | null, branchId?: string): BranchView | null {
  if (!a || !p) return null;
  const open = openBranches(a, p);
  const b = open.find((x) => x.branchId === branchId) ?? open.find((x) => x.isDefault) ?? open[0];
  return b ? viewOf(p, b) : null;
}

export const branchLabel = (v: BranchView) => `${v.location?.label ?? '—'}${v.gstin ? ` · ${v.gstin.value}` : ' · unregistered'}`;
