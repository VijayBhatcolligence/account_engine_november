// The mock backend. Every action records the API calls, events and table writes the real backend would make
// (Backend tab), so the UX walkthrough and the backend design can be read side by side. No network calls.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { ToastItem } from '../ui';
import { ACTORS, ME, SIDE_LABEL, STATES, stateOfGstin } from './catalogue';
import { branchesOf, gstinsForLocation, locationsOf, openBranches } from './branches';
import { afterOf, checksOf, follow, GSTIN_RE, isEmpty, mask, PARTY_KEYS, partyValues, routesFor, stops, suggestionsOf } from './rules';
import { newRequest, PAPERS, seedAccounts, seedLog, seedNotices, seedParties, seedRequests, START } from './seed';
import type { Account, ActorKey, Change, CustomerBranch, ExtraContact, FieldValue, GstCheck, GstRegistration, LogEntry, Notice, Party, PartyLocation, Request, Side } from './types';

/** A page. The top menu groups them: Tasks (onboarding, sales) · Rules (checks, posting rules, backend) · Forms (forms, parties, books). */
export type TabId = 'dashboard' | 'tasks' | 'onboarding' | 'sales' | 'checks' | 'postingRules' | 'backend' | 'forms' | 'parties' | 'books' | 'cnc';

interface Data {
  now: string;
  parties: Party[];
  accounts: Account[];
  requests: Request[];
  log: LogEntry[];
  notices: Notice[];
  nav: { tab: TabId; requestId: string | null; voucherId?: string | null };
}

interface State extends Data {
  toasts: ToastItem[];
  navigate: (tab: TabId, requestId?: string | null) => void;
  /** Opens a sales voucher in Tasks › Post a sales entry. */
  openVoucher: (voucherId: string | null) => void;
  /** Shared by the other tasks: advance the scenario clock, write the backend log, send a notice. */
  bump: (mins: number) => string;
  record: (kind: LogEntry['kind'], actor: ActorKey, line: string, detail?: string) => void;
  notify: (n: Omit<Notice, 'id' | 'at' | 'read'>) => void;
  /** Opens a new request for a paper form on your desk. Returns its id. */
  createRequest: (o: { side: Side; from: ActorKey; formNo: string; paper?: string | null }) => string;
  setValue: (reqId: string, key: string, value: FieldValue) => void;
  /** Form section B1: the customer's other GST registrations (a row each). */
  addRegistration: (reqId: string) => void;
  setRegistration: (reqId: string, regId: string, patch: Partial<Omit<GstRegistration, 'id'>>) => void;
  removeRegistration: (reqId: string, regId: string) => void;
  /** Section C: more contact people of the customer (the first is the form's Contact person / Mobile / Email). */
  addContact: (reqId: string) => void;
  setContact: (reqId: string, contactId: string, patch: Partial<Omit<ExtraContact, 'id'>>) => void;
  removeContact: (reqId: string, contactId: string) => void;
  useSuggestion: (reqId: string, key: string) => void;
  /** Mock only: types everything on the paper form for you. */
  typeFromPaper: (reqId: string) => void;
  useParty: (reqId: string, partyId: string) => void;
  unlinkParty: (reqId: string) => void;
  saveDraft: (reqId: string) => void;
  checkGstin: (reqId: string) => void;
  runPennyDrop: (reqId: string) => void;
  submit: (reqId: string) => void;
  decide: (reqId: string, changeId: string, approve: boolean, reason?: string) => void;
  sendBack: (reqId: string, reason: string) => void;
  discard: (reqId: string) => void;
  /** A customer's billing branches (fin.debtor_location, usage bill_to): link a P&C location under its GSTIN, deactivate, make default. */
  addBranch: (accountId: string, locationId: string) => void;
  deactivateBranch: (accountId: string, branchId: string) => void;
  setDefaultBranch: (accountId: string, branchId: string) => void;
  openNotice: (id: string) => void;
  markAllRead: () => void;
  dismissToast: (id: number) => void;
  reset: () => void;
}

function initial(): Data {
  const accounts = seedAccounts();
  return {
    now: START,
    parties: seedParties(),
    accounts,
    requests: seedRequests(accounts),
    log: seedLog(),
    notices: seedNotices(),
    nav: { tab: 'dashboard', requestId: null },
  };
}

/** Advance the scenario clock by some minutes. */
function tick(now: string, mins: number): string {
  const d = new Date(Date.parse(`${now}:00Z`) + mins * 60_000);
  return d.toISOString().slice(0, 16);
}

let toastId = 1;

export const partyOf = (s: Pick<Data, 'parties'>, partyId: string | null) => (partyId ? s.parties.find((p) => p.partyId === partyId) ?? null : null);
export const requestOf = (s: Pick<Data, 'requests'>, id: string | null) => s.requests.find((r) => r.id === id) ?? null;
/** The name to show for a request: what was typed, else the form number. */
export const titleOf = (r: Request) => (isEmpty(r.values.legalName) ? `New ${SIDE_LABEL[r.side].toLowerCase()} · form ${r.formNo}` : String(r.values.legalName));

/** In Needs me: the maker has the next move. */
export const isMine = (r: Request) => r.status === 'draft' || r.status === 'returned';
export const isWithOthers = (r: Request) => r.status === 'submitted';
/** The creation task is "Create a customer" (2-Nov): its lists show customer forms only. Vendor data stays in the store. */
export const isCustomer = (r: Request) => r.side === 'receivable';

const API = '/api/v1/accounting-support';   // the spec's paths (02 section N); the legal entity comes from the session
const PM = 'P&C';                            // Business Core: read through its interface (rev 12)

const STATE_NAME = (gstin: string) => STATES[stateOfGstin(gstin) ?? '']?.name ?? 'Other';
const nextNo = (ids: string[], prefix: string, start: number) => Math.max(start, ...ids.filter((x) => x.startsWith(prefix)).map((x) => Number(x.slice(prefix.length)) || 0)) + 1;

export const useOnboarding = create<State>()(
  persist(
    immer((set, get) => {
      const log = (s: Data, kind: LogEntry['kind'], actor: ActorKey, line: string, detail?: string) => {
        s.log.push({ id: (s.log[s.log.length - 1]?.id ?? 0) + 1, at: s.now, kind, actor, line, detail });
      };
      const notice = (s: Data, n: Omit<Notice, 'id' | 'at' | 'read'>) => {
        s.notices.unshift({ ...n, id: `N-${s.notices.length + 1}-${s.now}`, at: s.now, read: false });
      };
      const toast = (s: State, t: Omit<ToastItem, 'id'>) => {
        s.toasts.push({ ...t, id: toastId++ });
      };

      return {
        ...initial(),
        toasts: [],

        navigate: (tab, requestId) =>
          set((s) => {
            s.nav.tab = tab;
            if (requestId !== undefined) s.nav.requestId = requestId;
          }),

        openVoucher: (voucherId) =>
          set((s) => {
            s.nav.tab = 'sales';
            s.nav.voucherId = voucherId;
          }),

        bump: (mins) => {
          set((s) => {
            s.now = tick(s.now, mins);
          });
          return get().now;
        },

        record: (kind, actor, line, detail) =>
          set((s) => {
            log(s, kind, actor, line, detail);
          }),

        notify: (n) =>
          set((s) => {
            notice(s, n);
          }),

        createRequest: ({ side, from, formNo, paper }) => {
          const id = `REQ-${String(nextNo(get().requests.map((r) => r.id), 'REQ-', 101)).padStart(4, '0')}`;
          set((s) => {
            s.now = tick(s.now, 5);
            const r = newRequest({ id, side, from, formNo, at: s.now, paper: paper ?? undefined }, s.accounts);
            s.requests.push(r);
            s.nav = { tab: 'onboarding', requestId: id };
            log(s, 'api', ME, `POST ${API}/party-account-requests`, `{side: ${side}, kind: onboard, form_no: ${formNo}, form_from: ${ACTORS[from].name}} → 201 ${id}`);
            log(s, 'db', 'system', 'INSERT accounting_support.party_account_request', `${id} · draft · party_id NULL (a new party unless you use one from P&C)`);
          });
          return id;
        },

        setValue: (reqId, key, value) =>
          set((s) => {
            const r = requestOf(s, reqId);
            if (!r || !isMine(r)) return;
            if (r.partyId && PARTY_KEYS.includes(key)) return; // from the master: change it there
            const before = suggestionsOf(r, s.accounts);
            r.values[key] = value;
            r.dirty = true;
            follow(r, before, s.accounts);
            if (key === 'msmeStatus' && value !== 'yes') {
              r.values.msmeCategory = '';
              r.values.udyam = '';
            }
            if (key === 'shippingAddress' && isEmpty(value)) {
              // No shipping address: goods go to the billing address, so no ship-to city, state or PIN.
              r.values.shipCity = '';
              r.values.shipState = '';
              r.values.shipPincode = '';
            }
            if (key === 'gstRegistered' && value !== 'yes') {
              // Not registered: no GSTIN, no registration type, no other registrations.
              r.values.gstin = '';
              r.values.gstRegType = '';
              r.values.billingGstin = '';
              r.registrations = [];
              r.regChecks = {};
              follow(r, before, s.accounts);
            }
          }),

        addRegistration: (reqId) =>
          set((s) => {
            const r = requestOf(s, reqId);
            if (!r || !isMine(r) || r.partyId) return;
            const before = suggestionsOf(r, s.accounts);
            const rows = (r.registrations ??= []);
            rows.push({ id: `G${nextNo(rows.map((g) => g.id), 'G', 0)}`, gstin: '' });
            r.dirty = true;
            follow(r, before, s.accounts);
          }),

        setRegistration: (reqId, regId, patch) =>
          set((s) => {
            const r = requestOf(s, reqId);
            const g = r?.registrations?.find((x) => x.id === regId);
            if (!r || !g || !isMine(r) || r.partyId) return;
            const before = suggestionsOf(r, s.accounts);
            const old = g.gstin;
            Object.assign(g, patch);
            if (patch.gstin !== undefined && old && r.values.billingGstin === old) r.values.billingGstin = patch.gstin;
            r.dirty = true;
            follow(r, before, s.accounts);
          }),

        removeRegistration: (reqId, regId) =>
          set((s) => {
            const r = requestOf(s, reqId);
            if (!r || !isMine(r) || r.partyId || !r.registrations) return;
            const before = suggestionsOf(r, s.accounts);
            const g = r.registrations.find((x) => x.id === regId);
            r.registrations = r.registrations.filter((x) => x.id !== regId);
            if (g && r.values.billingGstin === g.gstin) r.values.billingGstin = r.values.gstin ?? '';
            r.dirty = true;
            follow(r, before, s.accounts);
          }),

        addContact: (reqId) =>
          set((s) => {
            const r = requestOf(s, reqId);
            if (!r || !isMine(r) || r.partyId) return;
            const rows = (r.contacts ??= []);
            rows.push({ id: `K${nextNo(rows.map((c) => c.id), 'K', 0)}`, name: '' });
            r.dirty = true;
          }),

        setContact: (reqId, contactId, patch) =>
          set((s) => {
            const r = requestOf(s, reqId);
            const c = r?.contacts?.find((x) => x.id === contactId);
            if (!r || !c || !isMine(r) || r.partyId) return;
            Object.assign(c, patch);
            r.dirty = true;
          }),

        removeContact: (reqId, contactId) =>
          set((s) => {
            const r = requestOf(s, reqId);
            if (!r || !isMine(r) || r.partyId || !r.contacts) return;
            r.contacts = r.contacts.filter((x) => x.id !== contactId);
            r.dirty = true;
          }),

        useSuggestion: (reqId, key) => {
          const r = requestOf(get(), reqId);
          const sug = r && suggestionsOf(r, get().accounts)[key];
          if (sug) get().setValue(reqId, key, sug.value);
        },

        typeFromPaper: (reqId) => {
          const r = requestOf(get(), reqId);
          const paper = r?.paper ? PAPERS[r.paper] : null;
          if (!r || !paper) return;
          for (const [k, v] of Object.entries(paper.values)) {
            if (r.partyId && PARTY_KEYS.includes(k)) continue;
            get().setValue(reqId, k, v);
          }
          if (paper.registrations?.length && !r.partyId)
            set((s) => {
              const q = requestOf(s, reqId)!;
              const before = suggestionsOf(q, s.accounts);
              q.registrations = paper.registrations!.map((g, i) => ({ id: `G${i + 1}`, ...g }));
              follow(q, before, s.accounts);
            });
          if (paper.contacts?.length && !r.partyId)
            set((s) => {
              requestOf(s, reqId)!.contacts = paper.contacts!.map((c, i) => ({ id: `K${i + 1}`, ...c }));
            });
        },

        useParty: (reqId, partyId) =>
          set((s) => {
            const r = requestOf(s, reqId);
            const p = partyOf(s, partyId);
            if (!r || !p || !isMine(r)) return;
            const before = suggestionsOf(r, s.accounts);
            r.partyId = partyId;
            Object.assign(r.values, partyValues(p));
            const g = p.gstins[0];
            r.gstCheck = g ? { status: g.status, nameAtGst: p.legalName.toUpperCase(), at: s.now, forValue: g.value } : undefined;
            // B1 from the master: its other GSTINs, with the location in that state if P&C has one. Locked here.
            const locs = locationsOf(p);
            r.registrations = p.gstins.slice(1).map((x, i) => {
              const l = locs.find((y) => y.stateCode === x.stateCode);
              return { id: `G${i + 1}`, gstin: x.value, line: l?.line, city: l?.city, pincode: l?.pincode };
            });
            r.regChecks = Object.fromEntries(p.gstins.slice(1).map((x) => [x.value, { status: x.status, nameAtGst: p.legalName.toUpperCase(), at: s.now, forValue: x.value }]));
            // More contacts from the master too: P&C holds them, so they are locked here like B1.
            r.contacts = (p.contacts ?? []).map((c, i) => ({ id: `K${i + 1}`, ...c }));
            follow(r, before, s.accounts);
            r.dirty = true;
            r.history.push({ at: s.now, by: ME, text: `Used party ${p.partyId} ${p.legalName} from the master (no new party)` });
            log(s, 'api', ME, `${PM}: GetParty ${p.partyId}`, 'party details from P&C (core read)');
            log(s, 'api', ME, `POST ${API}/party-account-requests/${r.id}/use-party`, `{party_id: ${p.partyId}}: use the existing party`);
            toast(s, { tone: 'info', title: `Using ${p.partyId} ${p.legalName}`, body: 'Party details now come from the master and are locked here.' });
          }),

        unlinkParty: (reqId) =>
          set((s) => {
            const r = requestOf(s, reqId);
            if (!r || !isMine(r)) return;
            r.history.push({ at: s.now, by: ME, text: `Stopped using party ${r.partyId}: a new party will be created` });
            r.partyId = null;
            r.dirty = true;
          }),

        saveDraft: (reqId) =>
          set((s) => {
            const r = requestOf(s, reqId);
            if (!r) return;
            s.now = tick(s.now, 1);
            log(s, 'api', ME, `PATCH ${API}/party-account-requests/${r.id}`, 'draft values saved · checks re-run and returned');
            log(s, 'db', 'system', 'UPDATE accounting_support.party_account_request', `${r.id} · values`);
            r.dirty = false;
            toast(s, { tone: 'success', title: 'Draft saved', body: 'Nothing is sent to a checker until you submit.' });
          }),

        checkGstin: (reqId) =>
          set((s) => {
            const r = requestOf(s, reqId);
            if (!r) return;
            const gstin = String(r.values.gstin ?? '');
            const others = (r.registrations ?? []).map((g) => g.gstin.trim()).filter((g) => GSTIN_RE.test(g));
            if (!GSTIN_RE.test(gstin) && !others.length) return;
            s.now = tick(s.now, 1);
            // Mock GST portal: a GSTIN with ZZ in characters 3–4 is cancelled; one in the master keeps its status.
            const look = (x: string): GstCheck => {
              const known = s.parties.flatMap((p) => p.gstins.map((g) => ({ g, p }))).find((y) => y.g.value === x);
              const status = x.slice(2, 4) === 'ZZ' ? 'cancelled' : known?.g.status ?? 'active';
              const nameAtGst = (known?.p.legalName ?? String(r.values.legalName ?? '')).toUpperCase();
              r.history.push({ at: s.now, by: 'gst', text: `GSTIN ${x} ${status}: ${nameAtGst}` });
              log(s, 'api', ME, `POST ${API}/party-account-requests/${r.id}/check-gstin`, `{gstin: ${x}}`);
              log(s, 'db', 'system', 'INSERT accounting_support.gstin_check', `${x} · ${status}`);
              log(s, 'api', 'gst', `GST portal: search GSTIN ${x}`, `${status} · ${nameAtGst} · state ${stateOfGstin(x) ?? '?'}`);
              return { status, nameAtGst, at: s.now, forValue: x };
            };
            if (GSTIN_RE.test(gstin)) r.gstCheck = look(gstin);
            r.regChecks = Object.fromEntries(others.map((x) => [x, look(x)]));
            const all = [r.gstCheck?.forValue === gstin ? r.gstCheck : null, ...Object.values(r.regChecks)].filter((x): x is GstCheck => !!x);
            const bad = all.filter((x) => x.status !== 'active');
            toast(s, bad.length ? { tone: 'critical', title: `${bad.length} of ${all.length} GSTIN${all.length > 1 ? 's' : ''} not active`, body: bad.map((x) => `${x.forValue} ${x.status}`).join(' · ') } : { tone: 'success', title: all.length > 1 ? `All ${all.length} GSTINs active` : 'GSTIN active', body: all[0]?.nameAtGst ?? '' });
          }),

        runPennyDrop: (reqId) =>
          set((s) => {
            const r = requestOf(s, reqId);
            if (!r) return;
            const legal = String(r.values.legalName ?? '');
            const acct = String(r.values.bankAccountNo ?? '');
            const ifsc = String(r.values.ifsc ?? '');
            s.now = tick(s.now, 2);
            // Mock bank: an account starting 7777 belongs to someone else.
            const nameAtBank = acct.startsWith('7777') ? 'SRI RAMA ENTERPRISES' : legal.toUpperCase();
            const words = new Set(legal.toUpperCase().split(/\s+/));
            const hit = nameAtBank.split(/\s+/).filter((w) => words.has(w)).length;
            const matchPct = Math.round((hit / Math.max(words.size, 1)) * 100);
            r.pennyDrop = { result: matchPct >= 80 ? 'pass' : 'name_mismatch', nameAtBank, matchPct, at: s.now, forKey: `${acct}|${ifsc}` };
            r.history.push({ at: s.now, by: 'bank', text: `Penny-drop ${r.pennyDrop.result === 'pass' ? 'passed' : 'name mismatch'}: ${nameAtBank} (${matchPct}%)` });
            log(s, 'api', ME, `POST ${API}/party-account-requests/${r.id}/verify-bank-account`, `{method: penny_drop, account: ${mask(acct)}, ifsc: ${ifsc}}`);
            log(s, 'api', 'bank', 'Bank penny-drop API (₹1 credit)', `name at bank: ${nameAtBank} · match ${matchPct}%`);
            log(s, 'db', 'system', 'INSERT accounting_support.bank_account_verification', `penny_drop · ${r.pennyDrop.result}`);
            toast(s, r.pennyDrop.result === 'pass' ? { tone: 'success', title: 'Penny-drop passed', body: `${nameAtBank} · ${matchPct}% name match` } : { tone: 'warning', title: 'Name at the bank does not match', body: `${nameAtBank}. Do a call-back before you submit.` });
          }),

        submit: (reqId) =>
          set((s) => {
            const r = requestOf(s, reqId);
            if (!r || !isMine(r)) return;
            if (stops(checksOf(r, s)).length) return;
            s.now = tick(s.now, 2);
            if (r.dirty) log(s, 'api', ME, `PATCH ${API}/party-account-requests/${r.id}`, 'last draft values');
            if (r.pennyDrop?.result === 'name_mismatch') {
              log(s, 'db', 'system', 'INSERT accounting_support.bank_account_verification', `call_back · pass · ${r.values.callBackNumber} · ${r.values.callBackPerson} (recorded at submit)`);
            }
            log(s, 'api', ME, `POST ${API}/party-account-requests/${r.id}/submit`, 'all Stop checks clear');
            const resubmit = r.status === 'returned';
            const changes: Change[] = routesFor(r.side).map((route, i) => {
              const after = afterOf(r, route.keys);
              const prev = r.changes.find((c) => c.block === route.block);
              const same = prev && JSON.stringify(prev.after) === JSON.stringify(after);
              if (prev && prev.status === 'approved' && (same || route.keys.length === 0)) return prev;
              return { id: `CHG-${r.id.slice(4)}-${i + 1}${resubmit ? 'b' : ''}`, block: route.block, label: route.label, checker: route.checker, status: 'pending', after };
            });
            const fresh = changes.filter((c) => c.status === 'pending');
            r.changes = changes;
            r.status = 'submitted';
            r.submittedAt = s.now;
            r.returnedReason = undefined;
            r.dirty = false;
            log(s, 'db', 'system', `INSERT accounting_support.approval_step ×${fresh.length}`, fresh.map((c) => `${c.block} → ${ACTORS[c.checker].name}`).join(' · '));
            log(s, 'event', 'system', 'PartyAccountRequestSubmitted', `${r.id} → ${fresh.map((c) => ACTORS[c.checker].name).join(', ')}`);
            if (r.side === 'payable' && (r.values.msmeStatus === 'unknown' || (r.values.msmeStatus === 'yes' && isEmpty(r.values.udyam)))) {
              log(s, 'api', 'system', 'Mail: Udyam reminder to the vendor', `${r.values.email || r.values.phone} · reminder again in 7 days`);
            }
            r.history.push({ at: s.now, by: ME, text: `${resubmit ? 'Resubmitted' : 'Submitted'}: ${fresh.map((c) => `${c.label.toLowerCase()} to ${ACTORS[c.checker].name}`).join(' · ')}` });
            toast(s, { tone: 'success', title: `Sent to ${fresh.map((c) => ACTORS[c.checker].name).join(', ')}`, body: 'It is now under "With checkers". You are told when it is active or returned.' });
          }),

        decide: (reqId, changeId, approve, reason) =>
          set((s) => {
            const r = requestOf(s, reqId);
            const c = r?.changes.find((x) => x.id === changeId);
            if (!r || !c || c.status !== 'pending') return;
            s.now = tick(s.now, 15);
            c.status = approve ? 'approved' : 'returned';
            c.decidedAt = s.now;
            c.reason = reason;
            log(s, 'api', c.checker, `POST ${API}/party-account-requests/${r.id}/decide`, `{step: ${c.block}, outcome: ${approve ? 'approved' : 'returned'}}${approve ? '' : ` · reason: ${reason}`}`);
            log(s, 'db', 'system', 'UPDATE accounting_support.approval_step', `${c.id} · ${c.status} by ${ACTORS[c.checker].name}`);
            r.history.push({ at: s.now, by: c.checker, text: `${approve ? 'Approved' : 'Returned'}: ${c.label.toLowerCase()}${reason ? ` · "${reason}"` : ''}` });

            if (!approve) {
              r.status = 'returned';
              r.returnedReason = `${ACTORS[c.checker].name}: ${reason}`;
              log(s, 'event', 'system', 'PartyAccountRequestReturned', `${r.id} → back to the Accounts Executive (the other open steps are cancelled)`);
              notice(s, { tone: 'critical', title: `Returned by ${ACTORS[c.checker].name}: ${titleOf(r)}`, body: reason ?? '', requestId: r.id });
              return;
            }
            if (r.changes.some((x) => x.status !== 'approved')) {
              const done = r.changes.filter((x) => x.status === 'approved').length;
              log(s, 'event', 'system', 'PartyAccountRequestDecided', `${r.id} · ${done} of ${r.changes.length} approved · still submitted`);
              return;
            }

            // Every step approved (state approved). 1) The reaction party-registration: RegisterParty hands the party to
            //    P&C, which runs its own checks and answers the party_id (state party_created). Rev 12: ids kept as plain values.
            log(s, 'event', 'system', 'PartyAccountRequestApproved', `${r.id} · all ${r.changes.length} steps approved`);
            log(s, 'api', 'system', `POST ${API}/party-account-requests/${r.id}/register-party`, r.partyId ? `existing party ${r.partyId}: only the ${r.side === 'payable' ? 'supplier' : 'customer'} standing` : 'a new party');
            const v = r.values;
            const roleType = r.side === 'payable' ? ('supplier' as const) : ('customer' as const);
            let p = partyOf(s, r.partyId);
            if (!p) {
              const partyId = `P-${String(nextNo(s.parties.map((x) => x.partyId), 'P-', 140)).padStart(4, '0')}`;
              const created: Party = {
                partyId,
                kind: 'organization',
                legalName: String(v.legalName),
                tradeName: isEmpty(v.tradeName) ? undefined : String(v.tradeName),
                pan: isEmpty(v.pan) ? null : String(v.pan),
                gstins: [
                  ...(isEmpty(v.gstin) ? [] : [{ value: String(v.gstin), stateCode: String(v.state), status: r.gstCheck?.status ?? ('active' as const) }]),
                  ...(r.registrations ?? []).map((g) => ({ value: g.gstin, stateCode: stateOfGstin(g.gstin) ?? '', status: r.regChecks?.[g.gstin]?.status ?? ('active' as const) })),
                ],
                address: { line: String(v.addressLine ?? ''), city: String(v.city ?? ''), stateCode: String(v.state ?? ''), pincode: String(v.pincode ?? ''), country: v.resident === 'non_resident' ? '' : 'IN' },
                contactPerson: isEmpty(v.contactPerson) ? undefined : String(v.contactPerson),
                email: isEmpty(v.email) ? undefined : String(v.email),
                phones: isEmpty(v.phone) ? [] : [String(v.phone)],
                roles: [],
                // B1 rows with a branch address become P&C locations (business_location), each in its GSTIN's state.
                locations: (r.registrations ?? [])
                  .filter((g) => !isEmpty(g.line ?? '') || !isEmpty(g.city ?? ''))
                  .map((g, i): PartyLocation => ({ locationId: `${partyId}-L${i + 2}`, label: `${g.city || STATE_NAME(g.gstin)} branch`, line: g.line ?? '', city: g.city ?? '', stateCode: stateOfGstin(g.gstin) ?? '', pincode: g.pincode ?? '', country: 'IN' })),
                contacts: (r.contacts ?? []).filter((c) => c.name.trim()).map(({ id: _id, ...c }) => c),
              };
              // The shipping address (section C) is a P&C location too, named "Ship-to": the invoice reads its state.
              if (r.side === 'receivable' && !isEmpty(v.shippingAddress)) {
                const n = (created.locations?.length ?? 0) + 2;
                (created.locations ??= []).push({ locationId: `${partyId}-L${n}`, label: 'Ship-to', line: String(v.shippingAddress), city: String(v.shipCity ?? ''), stateCode: String(v.shipState ?? ''), pincode: String(v.shipPincode ?? ''), country: 'IN', purpose: 'ship_to' });
              }
              s.parties.push(created);
              p = s.parties[s.parties.length - 1];
              r.partyId = partyId;
              log(s, 'api', 'system', `${PM}: create party (P&C's action, its own checks)`, `${created.legalName} · ${[created.pan && `PAN ${created.pan}`, ...created.gstins.map((g) => `GSTIN ${g.value}`)].filter(Boolean).join(' · ')} · ${created.address.city} → party_id ${partyId}`);
              log(s, 'db', 'system', 'P&C writes pc.party · party_identifier · business_location · contact · contact_point', `${partyId} (P&C's tables, not ours)`);
              if (created.gstins.length > 1) log(s, 'db', 'system', `P&C writes pc.party_identifier ×${created.gstins.length} (IN_GST)`, created.gstins.map((g) => `${g.value} (IN-${g.stateCode})`).join(' · '));
              if (created.locations?.length) log(s, 'db', 'system', `P&C writes pc.business_location ×${created.locations.length + 1}`, ['registered address', ...created.locations.map((l) => (l.purpose === 'ship_to' ? `Ship-to (${l.city}, ${l.stateCode})` : l.label))].join(' · '));
              if (r.side === 'receivable') {
                // One pc.contact per person: the form's first contact, then the extra ones. No name on the form: the customer
                // name stands in (placeholder rule, to confirm with P&C: pc.contact needs a display name).
                const first = isEmpty(v.contactPerson) ? `${String(v.tradeName || v.legalName)} (no contact name on the form)` : String(v.contactPerson);
                const people = [first, ...(created.contacts ?? []).map((c) => c.name)];
                const points = (isEmpty(v.phone) ? 0 : 1) + (isEmpty(v.email) ? 0 : 1) + (created.contacts ?? []).reduce((n, c) => n + (c.phone ? 1 : 0) + (c.email ? 1 : 0), 0);
                log(s, 'db', 'system', `P&C writes pc.contact ×${people.length} · contact_party_association ×${people.length} (customer_contact) · contact_point ×${points}`, people.join(' · '));
              }
            }
            const standingId = `S-${p.partyId.slice(2)}-${roleType === 'customer' ? 'C' : 'S'}`;
            p.roles.push({ standingId, type: roleType, since: s.now.slice(0, 10), enteredBy: ME, formFrom: r.from, formNo: r.formNo });
            log(s, 'db', 'system', 'P&C writes pc.party_standing', `${standingId} · ${p.partyId} is ${roleType} of our company (OP-1)`);
            log(s, 'db', 'system', 'UPDATE accounting_support.party_account_request', `${r.id} · party_created · party_id ${p.partyId} · party_standing_id ${standingId}`);
            log(s, 'event', 'system', 'PartyRegistered', `${r.id} · ${p.partyId} · ${roleType}`);

            // 2) The reaction subledger-opening: the AR / AP subledger account and its control account, from today.
            //    3) The reaction party-onboarding: Activate writes the customer / vendor account (state active).
            const suggestedUnder = suggestionsOf(r, s.accounts).under?.value;
            const accountId = `ACC-${r.side === 'payable' ? 2200 : 1300}${s.accounts.length}`;
            const acct: Account = {
              accountId,
              partyId: p.partyId,
              side: r.side,
              name: String(v.accountName),
              under: String(v.under),
              category: String(v.category),
              creditDays: isEmpty(v.creditDays) ? null : Number(v.creditDays),
              creditLimit: isEmpty(v.creditLimit) ? null : Number(v.creditLimit),
              msme: r.side === 'payable' ? (v.msmeStatus as Account['msme']) : null,
              msmeCategory: r.side === 'payable' ? String(v.msmeCategory ?? '') || null : null,
              udyam: isEmpty(v.udyam) ? null : String(v.udyam),
              sec43bh: r.side === 'payable' ? v.sec43bh === 'yes' : null,
              bankAccountNo: isEmpty(v.bankAccountNo) ? undefined : String(v.bankAccountNo),
              bankLast4: isEmpty(v.bankAccountNo) ? null : String(v.bankAccountNo).slice(-4),
              bankSince: isEmpty(v.bankAccountNo) ? null : s.now.slice(0, 10),
              activatedAt: s.now.slice(0, 10),
              requestId: r.id,
              standingId,
              gstin: isEmpty(v.gstin) ? null : String(v.gstin),
              controlSince: s.now.slice(0, 10),
              controlSource: suggestedUnder !== undefined && String(suggestedUnder) === String(v.under) ? 'suggested' : 'chosen',
            };
            // One account, many branches: the registered address under the main GSTIN, then each B1 GSTIN with an address.
            if (r.side === 'receivable' && (r.registrations?.length ?? 0) > 0) {
              const bill = String(v.billingGstin || v.gstin || '');
              const today = s.now.slice(0, 10);
              const first = nextNo(s.accounts.flatMap((x) => (x.branches ?? []).map((b) => b.branchId)), 'BR-', 0);
              const rows: CustomerBranch[] = [{ branchId: '', locationId: `${p.partyId}-L1`, gstin: isEmpty(v.gstin) ? null : String(v.gstin), isDefault: false, since: today }];
              for (const l of p.locations ?? []) {
                const g = (r.registrations ?? []).find((x) => stateOfGstin(x.gstin) === l.stateCode && !rows.some((b) => b.gstin === x.gstin));
                if (g) rows.push({ branchId: '', locationId: l.locationId, gstin: g.gstin, isDefault: false, since: today });
              }
              rows.forEach((b, i) => {
                b.branchId = `BR-${String(first + i).padStart(4, '0')}`;
                b.isDefault = b.gstin === bill;
              });
              if (!rows.some((b) => b.isDefault)) rows[0].isDefault = true;
              acct.branches = rows;
              acct.gstin = bill || acct.gstin;
            }
            const shipLoc = (p.locations ?? []).find((l) => l.purpose === 'ship_to');
            if (r.side === 'receivable' && shipLoc) {
              const n = nextNo(s.accounts.flatMap((x) => (x.shipTo ? [x.shipTo.linkId] : [])), 'ST-', 0);
              acct.shipTo = { linkId: `ST-${String(n).padStart(4, '0')}`, locationId: shipLoc.locationId, since: s.now.slice(0, 10) };
            }
            s.accounts.push(acct);
            r.status = 'active';
            r.activatedAt = s.now;
            r.accountId = accountId;
            log(s, 'api', 'system', 'POST /api/v1/accounting/subledger-accounts', `{party_id: ${p.partyId}, subledger: ${r.side === 'payable' ? 'AP' : 'AR'}, name: "${acct.name}", control: "${acct.under}"} → ${accountId}`);
            log(s, 'db', 'system', 'INSERT accounting.subledger_account', `${accountId} · ${r.side === 'payable' ? 'AP' : 'AR'} · party_id ${p.partyId} (a plain value: no foreign key into P&C)`);
            log(s, 'db', 'system', 'INSERT accounting.subledger_account_control', `${accountId} under ${acct.under} · from ${acct.controlSince} · ${acct.controlSource}`);
            log(s, 'event', 'system', 'SubledgerAccountOpened', `${accountId} · ${r.id}`);
            log(s, 'api', 'system', `POST ${API}/party-account-requests/${r.id}/activate`, `{subledger_account_id: ${accountId}}`);
            log(s, 'db', 'system', 'INSERT accounting_support.party_account', `${accountId} · ${r.side} · ${acct.category} · standing ${standingId}${acct.gstin ? ` · GST registration ${acct.gstin}` : ''}`);
            if (r.side === 'receivable') log(s, 'db', 'system', 'INSERT accounting_support.party_credit_limit', `${accountId} · ${acct.creditLimit ?? 0} · from ${acct.activatedAt}`);
            if (acct.branches) {
              log(s, 'db', 'system', `INSERT fin.debtor_location ×${acct.branches.length} (usage bill_to)`, acct.branches.map((b) => `${b.branchId} · ${b.gstin ?? 'unregistered'}${b.isDefault ? ' (default)' : ''}`).join(' · '));
              const without = (r.registrations ?? []).filter((g) => !acct.branches!.some((b) => b.gstin === g.gstin));
              if (without.length) log(s, 'db', 'system', 'No branch yet', `${without.map((g) => g.gstin).join(' · ')}: P&C holds the GSTIN; add the branch on the customer once its address is known`);
            }
            if (acct.shipTo) log(s, 'db', 'system', 'INSERT fin.debtor_location (usage ship_to)', `${acct.shipTo.linkId} · location ${acct.shipTo.locationId} (${shipLoc?.city}, ${shipLoc?.stateCode}) · no GSTIN: where goods go, not a billing branch`);
            if (acct.bankLast4 && r.side === 'payable') log(s, 'db', 'system', 'INSERT accounting_support.party_bank_account', `${mask(String(v.bankAccountNo))} · since ${acct.bankSince}`);
            if (acct.bankLast4 && r.side === 'receivable') {
              // One bank row per party (shared with the vendor side): a party that is already our vendor with this account keeps its row.
              const reused = s.accounts.some((a) => a !== acct && a.partyId === acct.partyId && a.bankAccountNo === acct.bankAccountNo);
              log(s, 'db', 'system', reused ? 'fin.party_bank_account: row reused' : 'INSERT fin.party_bank_account', `${mask(String(v.bankAccountNo))} · ${v.ifsc} · ${v.beneficiary} · unverified (checked before the first refund)`);
              log(s, 'db', 'system', 'debtor_account.refund_bank_account_id set', `${accountId} → that bank row`);
            }
            log(s, 'db', 'system', 'UPDATE accounting_support.party_account_request', `${r.id} · active · subledger_account_id ${accountId}`);
            log(s, 'event', 'system', 'PartyAccountRequestActivated', `${accountId} · ${SIDE_LABEL[r.side].toLowerCase()} · ${r.side === 'payable' ? 'Purchase can post vouchers; Payables gets the MSME clock' : 'Sales can confirm orders; Billing reads the instructions'}`);
            if (acct.bankLast4 && r.side === 'payable') log(s, 'event', 'system', 'PartyAccountRequestActivated · bank_account_added', `${accountId} · flag "new bank details" on the next payment proposal`);
            r.history.push({ at: s.now, by: 'system', text: `Active: party ${p.partyId}, account ${accountId} under ${acct.under}` });
            notice(s, { tone: 'success', title: `${SIDE_LABEL[r.side]} active: ${p.legalName}`, body: `${accountId} under ${acct.under}. ${r.side === 'payable' ? 'Purchase can now post vouchers to it.' : 'Sales can now confirm orders.'}`, requestId: r.id });
          }),

        sendBack: (reqId, reason) =>
          set((s) => {
            const r = requestOf(s, reqId);
            if (!r || !isMine(r)) return;
            s.now = tick(s.now, 2);
            r.status = 'sent_back';
            r.sentBack = { to: r.from, reason, at: s.now };
            r.history.push({ at: s.now, by: ME, text: `Form returned to ${ACTORS[r.from].name}: "${reason}"` });
            log(s, 'api', ME, `POST ${API}/party-account-requests/${r.id}/send-back`, `{to: ${ACTORS[r.from].role}, reason: "${reason}"}`);
            log(s, 'db', 'system', 'UPDATE accounting_support.party_account_request', `${r.id} · sent_back · no party, no account created`);
            log(s, 'event', 'system', 'PartyAccountRequestSentBack', `${r.id} → ${ACTORS[r.from].name} (${ACTORS[r.from].role}): form ${r.formNo} returned`);
            toast(s, { tone: 'info', title: `Form returned to ${ACTORS[r.from].name}`, body: 'Nothing is created. It is in Done with your comment.' });
          }),

        discard: (reqId) =>
          set((s) => {
            const r = requestOf(s, reqId);
            if (!r || r.status !== 'draft' || r.submittedAt) return;
            s.requests = s.requests.filter((x) => x.id !== reqId);
            s.nav.requestId = null;
            log(s, 'api', ME, `DELETE ${API}/party-account-requests/${reqId}`, 'draft opened by mistake');
          }),

        addBranch: (accountId, locationId) =>
          set((s) => {
            const a = s.accounts.find((x) => x.accountId === accountId);
            const p = a ? partyOf(s, a.partyId) : null;
            const loc = p ? locationsOf(p).find((l) => l.locationId === locationId) : null;
            if (!a || !p || !loc || openBranches(a, p).some((b) => b.locationId === locationId)) return;
            const g = gstinsForLocation(p, loc)[0] ?? null;
            const all = (a.branches = [...branchesOf(a, p)]);
            const id = `BR-${String(nextNo(s.accounts.flatMap((x) => (x.branches ?? []).map((b) => b.branchId)), 'BR-', 0)).padStart(4, '0')}`;
            const today = s.now.slice(0, 10);
            all.push({ branchId: id, locationId, gstin: g?.value ?? null, isDefault: false, since: today });
            log(s, 'api', ME, `POST /api/v1/fin/customer-accounts/${accountId}/branches`, `${loc.label} (${PM} location ${locationId}) under ${g ? `GSTIN ${g.value}` : 'no GSTIN: unregistered'}`);
            log(s, 'db', 'system', 'INSERT fin.debtor_location', `${id} · usage bill_to · ${accountId} · location ${locationId} · gst_registration ${g?.value ?? 'NULL'}`);
            log(s, 'db', 'system', 'INSERT fin.customer_account_history', `${accountId} · add_branch ${id}`);
            log(s, 'event', 'system', 'CustomerBranchAdded.v1', `${accountId} · ${id}`);
          }),

        deactivateBranch: (accountId, branchId) =>
          set((s) => {
            const a = s.accounts.find((x) => x.accountId === accountId);
            const p = a ? partyOf(s, a.partyId) : null;
            if (!a || !p) return;
            const all = branchesOf(a, p).map((b) => ({ ...b }));
            const b = all.find((x) => x.branchId === branchId && !x.until);
            const open = all.filter((x) => !x.until);
            if (!b || open.length < 2) return; // the only open branch stays: an account always bills somewhere
            a.branches = all;
            b.until = s.now.slice(0, 10);
            if (b.isDefault) {
              b.isDefault = false;
              open.find((x) => x !== b)!.isDefault = true;
            }
            log(s, 'api', ME, `POST /api/v1/fin/customer-accounts/${accountId}/branches/${branchId}/deactivate`, 'no new invoices to it; past invoices keep their copy');
            log(s, 'db', 'system', 'UPDATE fin.debtor_location', `${branchId} · until ${b.until}`);
            log(s, 'event', 'system', 'CustomerBranchDeactivated.v1', `${accountId} · ${branchId}`);
          }),

        setDefaultBranch: (accountId, branchId) =>
          set((s) => {
            const a = s.accounts.find((x) => x.accountId === accountId);
            const p = a ? partyOf(s, a.partyId) : null;
            if (!a || !p) return;
            const all = branchesOf(a, p).map((b) => ({ ...b }));
            if (!all.some((x) => x.branchId === branchId && !x.until)) return;
            a.branches = all;
            all.forEach((x) => (x.isDefault = x.branchId === branchId));
            log(s, 'api', ME, `PATCH /api/v1/fin/customer-accounts/${accountId}/branches/${branchId}`, 'is_default = true');
            log(s, 'db', 'system', 'UPDATE fin.debtor_location', `${branchId} default; the previous default off`);
            log(s, 'event', 'system', 'CustomerBranchChanged.v1', `${accountId} · ${branchId} is the default`);
          }),

        openNotice: (id) =>
          set((s) => {
            const n = s.notices.find((x) => x.id === id);
            if (!n) return;
            n.read = true;
            if (n.requestId) {
              s.nav.tab = 'onboarding';
              s.nav.requestId = n.requestId;
            } else if (n.voucherId) {
              s.nav.tab = 'sales';
              s.nav.voucherId = n.voucherId;
            }
          }),

        markAllRead: () =>
          set((s) => {
            s.notices.forEach((n) => (n.read = true));
          }),

        dismissToast: (id) =>
          set((s) => {
            s.toasts = s.toasts.filter((t) => t.id !== id);
          }),

        reset: () =>
          set((s) => {
            Object.assign(s, initial());
            s.toasts = [];
          }),
      };
    }),
    {
      name: 'aikyat-ae-onboarding-v6',
      partialize: (s) => ({ now: s.now, parties: s.parties, accounts: s.accounts, requests: s.requests, log: s.log, notices: s.notices, nav: s.nav }),
    },
  ),
);
