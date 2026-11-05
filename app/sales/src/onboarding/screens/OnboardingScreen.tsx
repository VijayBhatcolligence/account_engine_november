// The task: create a customer, typed in from the PAPER form Sales hands over (decided 27-Oct; customer only since 2-Nov).
// The paper is the CA's Customer Master onboarding form (Swasthik): sections A–F and B1, in that order.
// The screen follows Sunny's task-to-screen formula: FD-06 Structured Editor · transaction-workspace (screenSpec.ts):
//   rail    the forms on the desk (Needs me · With checkers · Done) and "+ New from a paper form"; collapses
//   source  5/16  the paper form, in the same A–F order
//   entry   7/16  A · system suggestions · B · B1 (every GSTIN) · is it already in P&C? · C · D · billing · E · F,
//                 each section's checks under it; checkers and history last
//   action  4/16  pinned: every field ✓ / missing by section, what blocks, what Submit sends; Submit / Save / Return

import { useState } from 'react';
import { Banknote, Blocks, Bot, Check, ChevronsLeft, ChevronsRight, Circle, CheckCheck, CornerUpLeft, FileText, Link2, Pencil, Plus, Save, Search, Send, Trash2, Undo2, Unlink, UserPlus, X } from 'lucide-react';
import { fmtDateTime, relTime } from '../../domain/dates';
import { inr } from '../../domain/money';
import { Button, Callout, Dialog, EmptyState, ReasonChips, StatusPill, TextArea, TextInput } from '../../ui';
import { ACTORS, EXPORT_REALISATION_NORM, FORM_FROM, ME, OUR_STATE, SIDE_LABEL, STATES, stateOfGstin, TAX_TYPE, who } from '../catalogue';
import {
  checksOf,
  display,
  FIELDS,
  fieldsOfSection,
  gstinsOnForm,
  GSTIN_RE,
  isEmpty,
  isMissing,
  optionsOf,
  originOf,
  PARTY_KEYS,
  routesFor,
  sectionsFor,
  stops,
  suggestionsOf,
  WORKED_FROM,
  type CheckResult,
  type FieldDef,
  type SectionDef,
} from '../rules';
import { SCREEN_SPEC, uncoveredSteps } from '../screenSpec';
import { PAPERS, papersFor } from '../seed';
import { isCustomer, isMine, isWithOthers, partyOf, requestOf, titleOf, useOnboarding } from '../store';
import type { ActorKey, Request, Side } from '../types';
import { TaskPicker } from '../../tasks/TaskPicker';
import { ApiHint, OriginBadge, StatusOf, StatusSteps, type Step } from './parts';

const API = '/accounting-support/party-account-requests';

export function OnboardingScreen() {
  const s = useOnboarding();
  const [collapsed, setCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);
  const sorted = s.requests.filter(isCustomer).sort((a, b) => b.arrivedAt.localeCompare(a.arrivedAt));
  const mine = sorted.filter(isMine);
  const others = sorted.filter(isWithOthers);
  const done = sorted.filter((r) => !isMine(r) && !isWithOthers(r));
  const asked = requestOf(s, s.nav.requestId);
  const selected = (asked && isCustomer(asked) ? asked : null) ?? mine[0] ?? others[0] ?? done[0] ?? null;

  const row = (r: Request) => {
    const name = titleOf(r);
    const when = r.status === 'submitted' ? `${r.changes.filter((c) => c.status === 'approved').length} of ${r.changes.length} approved · sent ${relTime(r.submittedAt!, s.now)}` : r.status === 'active' ? `active ${relTime(r.activatedAt!, s.now)}` : r.status === 'sent_back' ? `returned ${relTime(r.sentBack!.at, s.now)}` : relTime(r.arrivedAt, s.now);
    const tone = r.status === 'returned' ? 'critical' : r.status === 'draft' ? 'warning' : r.status === 'active' ? 'success' : r.status === 'submitted' ? 'info' : 'normal';
    return (
      <button key={r.id} className={`ob-rail__item${r.id === selected?.id ? ' is-selected' : ''}`} onClick={() => s.navigate('onboarding', r.id)} title={`${name} · ${r.id}`}>
        <span className={`ob-rail__dot bg-${tone}`} aria-hidden />
        {collapsed ? (
          <span className="ob-rail__initials">{name.slice(0, 2).toUpperCase()}</span>
        ) : (
          <span className="ob-rail__text">
            <span className="ob-rail__name">{name}</span>
            <span className="ob-rail__meta">
              {SIDE_LABEL[r.side]} · {r.formNo} · {ACTORS[r.from].name} · {when}
            </span>
          </span>
        )}
      </button>
    );
  };
  const group = (title: string, list: Request[], empty: string) => (
    <section className="ob-rail__group">
      {!collapsed && (
        <h3 className="ob-rail__title">
          {title} <span className="ob-rail__count">{list.length}</span>
        </h3>
      )}
      {list.length === 0 && !collapsed && <p className="ob-rail__empty">{empty}</p>}
      {list.map(row)}
    </section>
  );

  return (
    <div className="ob-ws">
      <nav className={`ob-rail${collapsed ? ' is-collapsed' : ''}`} aria-label="Customer requests">
        <div className="ob-rail__head">
          {!collapsed && <TaskPicker current="onboarding" />}
          <button className="ob-rail__toggle" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Show the list' : 'Hide the list'} title={collapsed ? 'Show the list' : 'Hide the list'}>
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </div>
        <div className="ob-rail__new">
          {collapsed ? (
            <button className="ob-rail__toggle" onClick={() => setCreating(true)} aria-label="New customer from a paper form" title="New customer from a paper form">
              <Plus size={16} />
            </button>
          ) : (
            <Button variant="primary" icon={Plus} block onClick={() => setCreating(true)}>
              New customer from a paper form
            </Button>
          )}
        </div>
        <div className="ob-rail__scroll">
          {group('Needs me', mine, 'Nothing open. A customer form from Sales on your desk? Start it with "New".')}
          {group('With checkers', others, 'Nothing with a checker.')}
          {done.length > 0 && group('Done', done, '')}
        </div>
      </nav>
      {selected ? (
        <RequestWorkspace key={selected.id} r={selected} />
      ) : (
        <div className="ob-req ob-req--empty">
          <EmptyState icon={UserPlus} title="No customer open" text="When Sales hands you a customer form, start it with New." />
        </div>
      )}
      <NewDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

/** "+ New": the customer form in your hand (from Sales). */
function NewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useOnboarding();
  const side: Side = 'receivable';
  const [from, setFrom] = useState<ActorKey>(FORM_FROM.receivable[0]);
  const [formNo, setFormNo] = useState('');
  const [paper, setPaper] = useState('');
  const used = new Set(s.requests.map((r) => r.paper).filter(Boolean));
  const samples = papersFor(side).filter((p) => !used.has(p.key));
  const pick = (k: string) => {
    setPaper(k);
    const p = PAPERS[k];
    if (p) {
      setFrom(p.from);
      setFormNo(p.formNo);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New customer from a paper form"
      description="Sales hands you the filled-in Customer Master onboarding form with copies of the GST certificate(s) and PAN. You type it all in here."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!formNo.trim()}
            onClick={() => {
              s.createRequest({ side, from, formNo: formNo.trim(), paper: paper || null });
              setPaper('');
              setFormNo('');
              onClose();
            }}
          >
            Open it
          </Button>
        </>
      }
    >
      <div className="sheet-stack">
        <div className="field ob-demo-field">
          <span className="field__label">
            <span className="ob-launcher__tag">DEMO</span> Which paper is on your desk?
          </span>
          <select className="input" value={paper} onChange={(e) => pick(e.target.value)}>
            <option value="">A blank form (type your own)</option>
            {samples.map((p) => (
              <option key={p.key} value={p.key}>
                {p.formNo} · {p.title} (from {ACTORS[p.from].name})
              </option>
            ))}
          </select>
          <span className="field__hint">Mock only: shows the paper beside the form so you can copy from it.</span>
        </div>
        <div className="ob-two-col">
          <label className="field">
            <span className="field__label">
              Handed over by<span className="field__req"> *</span>
            </span>
            <select className="input" value={from} onChange={(e) => setFrom(e.target.value as ActorKey)}>
              {FORM_FROM[side].map((k) => (
                <option key={k} value={k}>
                  {who(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">
              Form number<span className="field__req"> *</span>
            </span>
            <TextInput value={formNo} placeholder="CRF-0021" onChange={(e) => setFormNo(e.target.value.toUpperCase())} />
          </label>
        </div>
        <ApiHint>POST {API}</ApiHint>
      </div>
    </Dialog>
  );
}

function RequestWorkspace({ r }: { r: Request }) {
  const s = useOnboarding();
  const editable = isMine(r);
  const checks = checksOf(r, s);
  const [returning, setReturning] = useState<string | null>(null);
  const [sendingBack, setSendingBack] = useState(false);
  const [showPaper, setShowPaper] = useState(!!r.paper && editable);
  const [builtWith, setBuiltWith] = useState(false);
  const sections = sectionsFor(r);
  const formErrors = checks.filter((c) => c.sendBack);
  const groups = sections.map((sec) => [sec, fieldsOfSection(r, sec.id)] as [SectionDef, FieldDef[]]).filter(([, f]) => f.length > 0);

  return (
    <div className="ob-req">
      <RequestHeader r={r} showPaper={showPaper} onTogglePaper={() => setShowPaper((x) => !x)} onBuiltWith={() => setBuiltWith(true)} />

      <div className={`ob-req__body${showPaper && r.paper ? ' has-paper' : ''}`}>
        {showPaper && r.paper && <PaperPanel r={r} onClose={() => setShowPaper(false)} />}

        <div className="ob-req__main">
          {editable && formErrors.length > 0 && (
            <Callout tone="critical" title="This form cannot be set up">
              <ul className="ob-plain">
                {formErrors.map((c) => (
                  <li key={c.title}>
                    <strong>{c.title}.</strong> {c.detail}
                  </li>
                ))}
              </ul>
              <div className="ob-row">
                <Button variant="destructive" icon={Undo2} onClick={() => setSendingBack(true)}>
                  Return the form to {ACTORS[r.from].name}
                </Button>
                <ApiHint>POST {API}/{r.id}/send-back</ApiHint>
              </div>
            </Callout>
          )}
          {r.status === 'returned' && (
            <Callout tone="critical" title="Returned to you">
              {r.returnedReason}. Fix it and resubmit: parts already approved stay approved unless you change them.
            </Callout>
          )}
          {r.status === 'sent_back' && (
            <Callout tone="info" title={`Form returned to ${who(r.sentBack!.to)} · ${fmtDateTime(r.sentBack!.at)}`}>
              "{r.sentBack!.reason}". No party and no account were created.
            </Callout>
          )}
          {r.status === 'active' && <ActiveReceipt r={r} />}

          {sections.map((sec) => (
            <SectionBlock key={sec.id} sec={sec} r={r} editable={editable} checks={checks} />
          ))}

          {r.changes.length > 0 && (
            <section className="ob-sec">
              <header className="ob-sec__head">
                <h3>Checkers</h3>
                <span className="subtle small-note">Each one sees and approves only their part. Rajan checks the party details against the scanned form.</span>
              </header>
              <ul className="ob-changes">
                {r.changes.map((c) => (
                  <li key={c.id} className="ob-change">
                    <span className="ob-change__main">
                      <span className="ob-change__title">
                        {c.label} → {who(c.checker)}
                      </span>
                      <span className="subtle small-note">
                        {c.decidedAt ? fmtDateTime(c.decidedAt) : 'Waiting'}
                        {c.reason ? ` · "${c.reason}"` : ''}
                      </span>
                    </span>
                    <StatusPill tone={c.status === 'approved' ? 'success' : c.status === 'returned' ? 'critical' : 'warning'}>{c.status === 'pending' ? 'Waiting' : c.status === 'approved' ? 'Approved' : 'Returned'}</StatusPill>
                    {c.status === 'pending' && r.status !== 'active' && (
                      <span className="ob-sim">
                        <button className="ob-sim__btn" onClick={() => s.decide(r.id, c.id, true)} title="Mock only: play the checker">
                          <CheckCheck size={14} aria-hidden /> {ACTORS[c.checker].name} approves
                        </button>
                        <button className="ob-sim__btn" onClick={() => setReturning(c.id)} title="Mock only: play the checker">
                          <CornerUpLeft size={14} aria-hidden /> returns
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <details className="ob-sec ob-history-box">
            <summary>History ({r.history.length})</summary>
            <ul className="ob-history">
              {[...r.history].reverse().map((h, i) => (
                <li key={i}>
                  <span className="subtle">{fmtDateTime(h.at)}</span> · <strong>{ACTORS[h.by].name}</strong> · {h.text}
                </li>
              ))}
            </ul>
          </details>
        </div>

        <aside className="ob-side">
          {editable ? (
            <Checklist r={r} groups={groups} checks={checks} onSendBack={() => setSendingBack(true)} />
          ) : (
            <div className="ob-side__scroll">
              <p className="ob-aside__title">Progress</p>
              <StatusSteps steps={stepsOf(r)} />
            </div>
          )}
        </aside>
      </div>

      <BuiltWith open={builtWith} onClose={() => setBuiltWith(false)} />
      <ReasonDialog
        open={returning !== null}
        title={returning ? `${ACTORS[r.changes.find((c) => c.id === returning)!.checker].name} returns this part` : ''}
        description="Mock only: you are playing the checker. It goes back to the Accounts Executive with this reason."
        chips={['PAN typed does not match the PAN card copy', 'Wrong debtor category for this customer', 'TCS section not confirmed']}
        action="Return"
        onClose={() => setReturning(null)}
        onConfirm={(reason) => {
          s.decide(r.id, returning!, false, reason);
          setReturning(null);
        }}
      />
      <ReasonDialog
        open={sendingBack}
        title={`Return the form to ${who(r.from)}`}
        description="Nothing is created. They get the paper back with your comment (and see it in the system)."
        chips={formErrors.length ? formErrors.map((c) => `${c.title}. ${c.detail ?? ''}`.trim()) : ['GST certificate copy is missing', 'Form not signed', 'Debtor category not ticked']}
        action="Return the form"
        onClose={() => setSendingBack(false)}
        onConfirm={(reason) => {
          s.sendBack(r.id, reason);
          setSendingBack(false);
        }}
      />
    </div>
  );
}

/** One section of the form (cmp.form-section): typed fields, the rows worked out for it, its own checks under it. */
function SectionBlock({ sec, r, editable, checks }: { sec: SectionDef; r: Request; editable: boolean; checks: CheckResult[] }) {
  const s = useOnboarding();
  const linked = partyOf(s, r.partyId);
  const fields = fieldsOfSection(r, sec.id);
  const typed = fields.filter((f) => f.group !== 'worked');
  const worked = fields.filter((f) => f.group === 'worked');
  const mine = checks.filter((c) => c.section === sec.id && c.level !== 'ok' && !c.usePartyId && !c.sendBack);
  const filled = fields.filter((f) => !isEmpty(r.values[f.key]) || f.kind === 'switch').length;
  const locked = (f: FieldDef) => !editable || (!!linked && PARTY_KEYS.includes(f.key));
  if (sec.id === 'B1' && !(r.values.gstRegistered === 'yes')) return null;
  return (
    <>
      <section className={`ob-sec${sec.id === 'S' ? ' ob-sec--worked' : ''}`} id={`sec-${sec.id}`}>
        <header className="ob-sec__head">
          <h3>{sec.title}</h3>
          {fields.length > 0 && sec.id !== 'B1' && (
            <span className={`ob-sec__count${filled === fields.length ? ' tone-success' : ''}`}>
              {filled} of {fields.length}
            </span>
          )}
          <span className="subtle small-note">{sec.note}</span>
          {sec.id === 'A' && linked && <span className="subtle small-note">Party details come from P&amp;C ({linked.partyId}): locked here.</span>}
        </header>
        {sec.id === 'B1' && <Registrations r={r} editable={editable && !linked} />}
        {typed.length > 0 && (
          <div className="ob-grid">
            {typed.map((f) => (
              <FieldRow key={`${f.key}-${f.section}`} f={f} r={r} locked={locked(f)} />
            ))}
          </div>
        )}
        {worked.length > 0 && <WorkedTable fields={worked} r={r} readOnly={!editable} />}
        {sec.id === 'B' && <GstinCheck r={r} editable={editable && !linked} />}
        {sec.id === 'E' && <p className="ob-note">{EXPORT_REALISATION_NORM}</p>}
        {sec.id === 'K' && <PennyDrop r={r} editable={editable} />}
        {mine.length > 0 && <SectionChecks list={mine} />}
      </section>
      {(sec.id === 'B1' || (sec.id === 'B' && r.values.gstRegistered !== 'yes')) && <DuplicateCheck r={r} editable={editable} checks={checks} />}
    </>
  );
}

/** The checks about one section, right under it (cmp.rule-checks, placement rule 3). */
function SectionChecks({ list }: { list: CheckResult[] }) {
  return (
    <ul className="ob-secchecks">
      {list.map((c) => (
        <li key={c.title} className={`tone-${c.level === 'stop' ? 'critical' : 'warning'}`}>
          <strong>{c.level === 'stop' ? 'Fix' : 'Note'}:</strong> {c.title}
          {c.detail ? <span className="subtle"> · {c.detail}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Form section B1: the customer's other GST registrations, a row each (cmp.form-section, repeatable). */
function Registrations({ r, editable }: { r: Request; editable: boolean }) {
  const s = useOnboarding();
  const rows = r.registrations ?? [];
  const main = String(r.values.gstin ?? '');
  const all = gstinsOnForm(r);
  const states = new Set(all.map((g) => stateOfGstin(g)).filter(Boolean));
  const status = (g: string) => {
    const c = g === main ? (r.gstCheck?.forValue === main ? r.gstCheck : undefined) : r.regChecks?.[g];
    return c ? <StatusPill tone={c.status === 'active' ? 'success' : c.status === 'suspended' ? 'warning' : 'critical'}>{c.status}</StatusPill> : GSTIN_RE.test(g) ? <StatusPill tone="normal">not checked</StatusPill> : null;
  };
  const stateWords = (g: string) => {
    const st = GSTIN_RE.test(g) ? stateOfGstin(g) : null;
    return st ? `${STATES[st].name} · ${TAX_TYPE[st === OUR_STATE ? 'intra' : 'inter']}` : g ? 'state from the first two digits' : '';
  };
  return (
    <div className="ob-regs">
      <div className="ob-reg ob-reg--main">
        <span className="ob-reg__no">Main</span>
        <span className="mono">{main || '—'}</span>
        <span className="subtle small-note">{stateWords(main)} · section B</span>
        {main && status(main)}
      </div>
      {rows.map((g, i) => (
        <div key={g.id} className="ob-reg">
          <div className="ob-reg__top">
            <span className="ob-reg__no">{i + 1}</span>
            <label className="ob-reg__gstin">
              <TextInput value={g.gstin} disabled={!editable} placeholder="33AAAAA0000A1Z5" aria-label={`GSTIN of registration ${i + 1}`} onChange={(e) => s.setRegistration(r.id, g.id, { gstin: e.target.value.toUpperCase().replace(/\s/g, '') })} />
            </label>
            <span className="subtle small-note ob-reg__state">{stateWords(g.gstin)}</span>
            {status(g.gstin)}
            {editable && (
              <button className="link-btn" onClick={() => s.removeRegistration(r.id, g.id)} aria-label={`Remove registration ${i + 1}`} title="Remove">
                <X size={14} aria-hidden />
              </button>
            )}
          </div>
          <div className="ob-reg__addr">
            <TextInput value={g.line ?? ''} disabled={!editable} placeholder="Branch address (optional: from its GST certificate)" aria-label={`Branch address of registration ${i + 1}`} onChange={(e) => s.setRegistration(r.id, g.id, { line: e.target.value })} />
            <TextInput value={g.city ?? ''} disabled={!editable} placeholder="City" aria-label={`City of registration ${i + 1}`} onChange={(e) => s.setRegistration(r.id, g.id, { city: e.target.value })} />
            <TextInput value={g.pincode ?? ''} disabled={!editable} placeholder="PIN" inputMode="numeric" aria-label={`PIN of registration ${i + 1}`} onChange={(e) => s.setRegistration(r.id, g.id, { pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
          </div>
          <span className="subtle small-note">{g.line || g.city ? 'Becomes a branch of the account on approval: P&C location + this GSTIN.' : 'No address: P&C holds the GSTIN; its branch is added on the customer once the address is known.'}</span>
        </div>
      ))}
      <div className="ob-row">
        {editable && (
          <Button size="sm" icon={Plus} onClick={() => s.addRegistration(r.id)}>
            Add a GST registration
          </Button>
        )}
        <span className="subtle small-note">
          {all.length} GSTIN{all.length === 1 ? '' : 's'} in {states.size} state{states.size === 1 ? '' : 's'} · one party, one account
        </span>
      </div>
    </div>
  );
}

/** Is the customer already in P&C? (cmp.duplicate-check): searched on the PAN and every GSTIN; pick one, or none. */
function DuplicateCheck({ r, editable, checks }: { r: Request; editable: boolean; checks: CheckResult[] }) {
  const s = useOnboarding();
  const linked = partyOf(s, r.partyId);
  const hits = checks.filter((c) => c.usePartyId && !r.partyId);
  const searched = [String(r.values.pan || ''), ...gstinsOnForm(r)].filter(Boolean);
  return (
    <section className="ob-sec ob-dup" aria-label="Is this customer already in P&C?">
      <header className="ob-sec__head">
        <h3>Is this customer already in P&amp;C?</h3>
        <span className="subtle small-note">{searched.length ? `Searched: ${searched.join(' · ')}` : 'Type the PAN or a GSTIN: P&C is searched on them.'}</span>
        <ApiHint>P&amp;C: FindParties (pan, gstin)</ApiHint>
      </header>
      {linked ? (
        <div className="ob-dup__row">
          <Check size={14} aria-hidden className="tone-success" /> Using <strong>{linked.partyId}</strong> {linked.legalName} from P&amp;C: no new party; its details are locked here.
          {editable && (
            <button className="link-btn" onClick={() => s.unlinkParty(r.id)}>
              <Unlink size={12} aria-hidden /> Not this party
            </button>
          )}
        </div>
      ) : hits.length ? (
        hits.map((c) => {
          const p = partyOf(s, c.usePartyId!)!;
          return (
            <div key={c.title} className={`ob-dup__row tone-${c.level === 'stop' ? 'warning' : 'info'}`}>
              <span>
                <strong>{c.title}.</strong> {c.detail} {p.legalName} · PAN {p.pan ?? '—'} · {p.gstins.length} GSTIN{p.gstins.length === 1 ? '' : 's'} · {p.address.city || '—'} · {p.roles.map((x) => x.type).join(', ') || 'no role yet'}.
              </span>
              {editable && (
                <Button size="sm" icon={Link2} onClick={() => s.useParty(r.id, p.partyId)}>
                  Use {p.partyId}
                </Button>
              )}
            </div>
          );
        })
      ) : searched.length ? (
        <div className="ob-dup__row">
          <Check size={14} aria-hidden className="tone-success" /> No party in P&amp;C with this PAN or these GSTINs: P&amp;C creates a new party on approval.
        </div>
      ) : null}
    </section>
  );
}

/** What was recorded once active (cmp.receipt). */
function ActiveReceipt({ r }: { r: Request }) {
  const s = useOnboarding();
  const a = s.accounts.find((x) => x.accountId === r.accountId);
  return (
    <Callout tone="success" title={`Active since ${fmtDateTime(r.activatedAt!)}`}>
      Party <strong>{r.partyId}</strong>, account <strong>{r.accountId}</strong> under {String(r.values.under)}
      {a?.branches ? ` · ${a.branches.length} branches, billing ${a.gstin}` : ''}. Sales can confirm orders.
    </Callout>
  );
}

/** The workspace header: what you have typed so far, and the form it came from. */
function RequestHeader({ r, showPaper, onTogglePaper, onBuiltWith }: { r: Request; showPaper: boolean; onTogglePaper: () => void; onBuiltWith: () => void }) {
  const s = useOnboarding();
  const linked = partyOf(s, r.partyId);
  const v = r.values;
  const g = r.gstCheck && r.gstCheck.forValue === v.gstin ? r.gstCheck : null;
  const more = (r.registrations ?? []).length;
  return (
    <header className="ob-req__head">
      <div className="ob-req__titlerow">
        <div>
          <p className="ob-req__eyebrow">
            {r.id} · New {SIDE_LABEL[r.side].toLowerCase()} · paper form <strong>{r.formNo}</strong> from {who(r.from)} · opened {fmtDateTime(r.arrivedAt)}
          </p>
          <h2 className={`ob-req__title${isEmpty(v.legalName) ? ' subtle' : ''}`}>{titleOf(r)}</h2>
        </div>
        <span className="inline-gap">
          <Button size="sm" variant="ghost" icon={Blocks} onClick={onBuiltWith}>
            Built with
          </Button>
          {r.paper && (
            <Button size="sm" icon={FileText} onClick={onTogglePaper}>
              {showPaper ? 'Hide the paper' : 'Show the paper'}
            </Button>
          )}
          <StatusOf r={r} />
        </span>
      </div>
      <div className="ob-req__facts">
        <span>
          <span className="subtle">PAN</span> <span className="mono">{String(v.pan || '—')}</span>
        </span>
        <span className="inline-gap">
          <span className="subtle">GSTIN</span> <span className="mono">{String(v.gstin || (v.gstRegistered === 'no' ? 'not registered' : '—'))}</span>
          {!isEmpty(v.gstin) && (g ? <StatusPill tone={g.status === 'active' ? 'success' : g.status === 'suspended' ? 'warning' : 'critical'}>{g.status}</StatusPill> : <StatusPill tone="normal">not checked</StatusPill>)}
          {more > 0 && <span className="subtle">+{more} more</span>}
        </span>
        <span>{[v.city, v.state].filter((x) => !isEmpty(x)).join(', ') || <span className="subtle">city —</span>}</span>
        <span>{String(v.phone || '')}</span>
        <span className="inline-gap">
          <span className="subtle">Party</span>
          {linked ? (
            <>
              <span className="mono">{linked.partyId}</span> <span className="subtle">(already in the master)</span>
            </>
          ) : r.partyId ? (
            <span className="mono">{r.partyId}</span>
          ) : (
            <span className="subtle">new · created when approved</span>
          )}
        </span>
      </div>
    </header>
  );
}

/** Mock only: the paper form on the desk, to copy from: the CA's form, in its sections. */
function PaperPanel({ r, onClose }: { r: Request; onClose: () => void }) {
  const s = useOnboarding();
  const p = PAPERS[r.paper!];
  const fieldOf = (k: string) => FIELDS.find((f) => f.key === k && f.sides.includes(r.side));
  const words = (k: string, v: string | number | boolean | null) => {
    const f = fieldOf(k);
    if (f?.unit === '₹') return inr(Number(v));
    const o = f ? optionsOf(f, r) : {};
    return o[String(v)] ?? `${v}${f?.unit ? ` ${f.unit}` : ''}`;
  };
  const bySection = sectionsFor({ ...r, values: p.values }).map((sec) => ({
    sec,
    lines: Object.entries(p.values).filter(([k]) => fieldOf(k)?.section === sec.id).map(([k, v]) => [PAPER_LABEL[k] ?? fieldOf(k)?.label.replace(/ \(.*\)$/, '') ?? k, words(k, v)] as [string, string]),
  }));
  return (
    <aside className="ob-paper" aria-label="Paper form">
      <div className="ob-paper__bar">
        <span className="ob-launcher__tag">DEMO</span>
        <span className="small-note">The paper on your desk{p.illustrative ? ' · illustrative' : ''}</span>
        <button className="link-btn" onClick={onClose}>
          Hide
        </button>
      </div>
      <div className="ob-paper__sheet">
        <p className="ob-paper__head">{r.side === 'payable' ? 'VENDOR REGISTRATION FORM' : 'CUSTOMER / DEBTOR MASTER — ONBOARDING FORM'}</p>
        <p className="ob-paper__no">
          No. {p.formNo} · from {ACTORS[p.from].name}
        </p>
        {bySection.map(({ sec, lines }) =>
          lines.length || (sec.id === 'B1' && p.registrations?.length) ? (
            <div key={sec.id}>
              <p className="ob-paper__sec">{sec.title.replace('System suggestions', 'Suggestions')}</p>
              <dl className="ob-paper__list">
                {sec.id === 'B1' &&
                  (p.registrations ?? []).map((g, i) => (
                    <div key={g.gstin}>
                      <dt>Registration {i + 1}</dt>
                      <dd>
                        {g.gstin}
                        {g.city ? ` · ${[g.line, g.city, g.pincode].filter(Boolean).join(', ')}` : ''}
                      </dd>
                    </div>
                  ))}
                {lines.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null,
        )}
        <p className="ob-paper__note">"{p.note}"</p>
        <p className="ob-paper__att">Attached: {p.attachments.join(' · ')}</p>
        <p className="ob-paper__sign">Signed: {ACTORS[p.from].name}</p>
      </div>
      {isMine(r) && (
        <button className="ob-sim__btn ob-paper__type" onClick={() => s.typeFromPaper(r.id)} title="Mock only">
          <Pencil size={14} aria-hidden /> Type it all in for me
        </button>
      )}
    </aside>
  );
}

/** Shorter words on the paper where the screen's label is long. */
const PAPER_LABEL: Record<string, string> = {
  legalName: 'Legal name',
  category: 'Debtor category',
  addressLine: 'Address',
  phone: 'Mobile',
  email: 'Email',
  tcsConfirmed: 'TCS confirmed?',
  creditDays: 'Credit period',
};

function control(f: FieldDef, r: Request, disabled: boolean, set: (v: string | number | boolean | null) => void) {
  const v = r.values[f.key];
  if (f.kind === 'select') {
    return (
      <select className="input" value={String(v ?? '')} disabled={disabled} onChange={(e) => set(e.target.value)} aria-label={f.label}>
        <option value="">Choose…</option>
        {Object.entries(optionsOf(f, r)).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
    );
  }
  if (f.kind === 'switch') {
    return (
      <label className="ob-check">
        <input type="checkbox" checked={!!v} disabled={disabled} onChange={(e) => set(e.target.checked)} /> {v ? 'Yes' : 'No'}
      </label>
    );
  }
  if (f.kind === 'number') {
    return (
      <span className="field-row">
        {f.unit === '₹' && <span className="subtle">₹</span>}
        <TextInput inputMode="numeric" disabled={disabled} aria-label={f.label} value={v === null || v === undefined ? '' : String(v)} onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value.replace(/[^0-9]/g, '')))} />
        {f.unit && f.unit !== '₹' && <span className="subtle">{f.unit}</span>}
      </span>
    );
  }
  return <TextInput value={String(v ?? '')} disabled={disabled} aria-label={f.label} placeholder={f.placeholder} onChange={(e) => set(f.upper ? e.target.value.toUpperCase().replace(/\s/g, '') : e.target.value)} />;
}

function FieldRow({ f, r, locked }: { f: FieldDef; r: Request; locked: boolean }) {
  const s = useOnboarding();
  const required = f.required?.(r.values, r);
  const missing = !locked && isMissing(f, r);
  return (
    <div className={`field ob-field${f.wide ? ' ob-field--wide' : ''}${missing ? ' is-missing' : ''}`}>
      <span className="field__label ob-field__label">
        <span>
          {f.label}
          {required ? <span className="field__req"> *</span> : <span className="subtle"> (optional)</span>}
        </span>
        <span className={`ob-owner ob-owner--${f.group}`} title={f.group === 'party' ? 'Goes to P&C (who the party is)' : 'Kept by Finance (the account)'}>
          {f.group === 'party' ? 'P&C' : 'Finance'}
        </span>
      </span>
      {control(f, r, locked, (v) => s.setValue(r.id, f.key, v))}
      {f.hint && !locked && <span className="field__hint">{f.hint}</span>}
    </div>
  );
}

function GstinCheck({ r, editable }: { r: Request; editable: boolean }) {
  const s = useOnboarding();
  const gstin = String(r.values.gstin ?? '');
  const all = gstinsOnForm(r).filter((g) => GSTIN_RE.test(g));
  const ready = all.length > 0;
  const g = r.gstCheck;
  const stale = g && g.forValue !== gstin;
  if (r.values.gstRegistered !== 'yes' && !g) return null;
  return (
    <div className="ob-penny">
      {editable && (
        <span className="inline-gap">
          <Button size="sm" icon={Search} disabled={!ready} onClick={() => s.checkGstin(r.id)}>
            {all.length > 1 ? `Check all ${all.length} GSTINs on the GST portal` : g ? 'Check the GSTIN again' : 'Check the GSTIN on the GST portal'}
          </Button>
          {!ready && <span className="subtle small-note">Type a full 15-character GSTIN first.</span>}
          <ApiHint>POST {API}/{r.id}/check-gstin</ApiHint>
        </span>
      )}
      {g && (
        <span className={`ob-penny__result tone-${stale ? 'warning' : g.status === 'active' ? 'success' : 'critical'}`}>
          <Bot size={14} aria-hidden /> {stale ? 'Out of date: the GSTIN changed. ' : ''}GST portal: <strong>{g.status}</strong> · {g.nameAtGst}
        </span>
      )}
    </div>
  );
}

/** Values the system worked out, as one compact table: value · from what · Edit. Only a row you open becomes an input. */
function WorkedTable({ fields, r, readOnly }: { fields: FieldDef[]; r: Request; readOnly?: boolean }) {
  const s = useOnboarding();
  const [editing, setEditing] = useState<string[]>([]);
  const sugs = suggestionsOf(r, s.accounts);
  const locked = (f: FieldDef) => !!r.partyId && PARTY_KEYS.includes(f.key);
  return (
    <table className="ob-sugg">
      <tbody>
        {fields.map((f) => {
          const origin = originOf(f, r, s.accounts);
          const open = !readOnly && !locked(f) && (editing.includes(f.key) || origin === 'empty');
          const why = origin === 'waits' ? `Filled in when you type ${WORKED_FROM[f.key]?.words}` : origin === 'empty' ? sugs[f.key]?.why ?? 'Could not be worked out: choose it' : sugs[f.key]?.why;
          return (
            <tr key={f.key} className={origin === 'changed' ? 'is-changed' : origin === 'empty' && isMissing(f, r) ? 'is-missing' : undefined}>
              <th scope="row">{f.label}</th>
              <td className="ob-sugg__value">{open ? control(f, r, false, (v) => s.setValue(r.id, f.key, v)) : <span className={isEmpty(r.values[f.key]) && f.kind !== 'switch' ? 'subtle' : undefined}>{origin === 'waits' ? '—' : display(f, r)}</span>}</td>
              {!readOnly && (
                <>
                  <td className="ob-sugg__why">
                    {origin === 'changed' ? <OriginBadge origin="changed" /> : null} {why}
                  </td>
                  <td className="ob-sugg__act">
                    {origin === 'changed' && (
                      <button className="link-btn" onClick={() => s.useSuggestion(r.id, f.key)}>
                        Undo
                      </button>
                    )}
                    {origin !== 'waits' && origin !== 'empty' && !locked(f) && (
                      <button className="link-btn" onClick={() => setEditing((e) => (open ? e.filter((k) => k !== f.key) : [...e, f.key]))}>
                        {open ? 'Done' : <><Pencil size={12} aria-hidden /> Edit</>}
                      </button>
                    )}
                  </td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PennyDrop({ r, editable }: { r: Request; editable: boolean }) {
  const s = useOnboarding();
  const ready = !isEmpty(r.values.bankAccountNo) && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(r.values.ifsc ?? ''));
  const pd = r.pennyDrop;
  const stale = pd && pd.forKey !== `${r.values.bankAccountNo}|${r.values.ifsc}`;
  return (
    <div className="ob-penny">
      {editable && (
        <span className="inline-gap">
          <Button size="sm" icon={Banknote} disabled={!ready} onClick={() => s.runPennyDrop(r.id)}>
            {pd ? 'Run penny-drop again' : 'Run penny-drop'}
          </Button>
          {!ready && <span className="subtle small-note">Enter the account number and IFSC first.</span>}
          <ApiHint>POST {API}/{r.id}/verify-bank-account</ApiHint>
        </span>
      )}
      {pd && (
        <span className={`ob-penny__result tone-${stale ? 'warning' : pd.result === 'pass' ? 'success' : 'critical'}`}>
          <Bot size={14} aria-hidden /> {stale ? 'Out of date: the account or IFSC changed. ' : ''}Bank says <strong>{pd.nameAtBank}</strong> · {pd.matchPct}% name match
        </span>
      )}
    </div>
  );
}

/** What Submit sends, grouped by receiver, and what happens once all approve (cmp.change-summary). */
function ChangeSummary({ r }: { r: Request }) {
  const s = useOnboarding();
  const v = r.values;
  const linked = partyOf(s, r.partyId);
  const n = gstinsOnForm(r).length;
  const branches = 1 + (r.registrations ?? []).filter((g) => g.line || g.city).length;
  const routes = routesFor(r.side);
  const words: Record<string, string> = {
    party: `party details · account "${v.accountName || '—'}" under ${v.under || '—'} · ${v.creditOrCash === 'cash' ? 'cash customer' : `${v.creditDays ?? '—'} days`} · billing`,
    credit_limit: v.creditOrCash === 'cash' ? 'no credit (cash customer)' : `credit limit ${isEmpty(v.creditLimit) ? '—' : inr(Number(v.creditLimit))}`,
    tax: `${String(v.gstTreatment || 'GST treatment —')} · TCS ${String(v.tcsSection || '—')} · e-invoice ${String(v.eInvoice || '—').replace('_', ' ')}`,
  };
  return (
    <div className="ob-summary">
      <p className="ob-aside__sub">What Submit sends</p>
      <ul className="ob-plain ob-plain--tight">
        {routes.map((x) => (
          <li key={x.block}>
            <strong>{ACTORS[x.checker].name}</strong> <span className="subtle">({ACTORS[x.checker].role})</span>: {words[x.block]}
          </li>
        ))}
      </ul>
      <p className="subtle small-note">
        When all three approve: P&amp;C {linked ? `adds the customer standing to ${linked.partyId}` : 'registers a new party'}
        {n ? ` with ${n} GSTIN${n > 1 ? 's' : ''}` : ''}; Finance opens one account{n > 1 ? ` with ${branches} branch${branches > 1 ? 'es' : ''}` : ''}.
      </p>
    </div>
  );
}

/** Right column, always visible (cmp.entry-checklist): every field by section, what blocks, what Submit sends, the endings. */
function Checklist({ r, groups, checks, onSendBack }: { r: Request; groups: [SectionDef, FieldDef[]][]; checks: CheckResult[]; onSendBack: () => void }) {
  const s = useOnboarding();
  const blocking = stops(checks);
  const fixable = blocking.filter((c) => !c.sendBack && !c.title.startsWith('Still to fill'));
  const warns = checks.filter((c) => c.level === 'warn');
  const formProblem = blocking.some((c) => c.sendBack);
  const waits = (f: FieldDef) => f.group === 'worked' && originOf(f, r, s.accounts) === 'waits';
  const missingIn = (fields: FieldDef[]) => fields.filter((f) => isMissing(f, r) && !waits(f)).length;
  const missing = groups.reduce((n, [, f]) => n + missingIn(f), 0);
  const item = (f: FieldDef) => {
    const empty = isEmpty(r.values[f.key]) && f.kind !== 'switch';
    const need = f.required?.(r.values, r) && !waits(f);
    return (
      <li key={`${f.key}-${f.section}`} className={empty && need ? 'is-missing' : undefined}>
        {empty ? need ? <Circle size={13} aria-hidden className="tone-warning" /> : <Circle size={13} aria-hidden className="subtle" /> : <Check size={13} aria-hidden className="tone-success" />}
        <span className="ob-list__label">{f.label.replace(/\?$/, '').replace(/ \(.*\)$/, '')}</span>
        <span className="ob-list__value">{empty ? (need ? 'missing' : waits(f) ? `after ${WORKED_FROM[f.key]?.words.replace('the ', '')}` : '—') : display(f, r)}</span>
      </li>
    );
  };
  return (
    <>
      <div className="ob-side__scroll">
        <p className="ob-aside__title">
          Your entries {missing ? <span className="tone-warning">· {missing} missing</span> : <span className="tone-success">· complete</span>}
        </p>
        {groups.map(([sec, fields]) => {
          const m = missingIn(fields);
          return (
            <details key={sec.id} className="ob-checkgroup" open={m > 0}>
              <summary>
                <a href={`#sec-${sec.id}`} onClick={(e) => e.stopPropagation()}>
                  {sec.title}
                </a>
                <span className={m ? 'tone-warning' : 'tone-success'}>{m ? `${m} missing` : '✓'}</span>
              </summary>
              <ul className={`ob-checklist${sec.id === 'S' ? ' ob-checklist--muted' : ''}`}>{fields.map(item)}</ul>
            </details>
          );
        })}
        {(r.registrations?.length ?? 0) > 0 && (
          <p className="subtle small-note">
            B1: {r.registrations!.length} more GSTIN{r.registrations!.length > 1 ? 's' : ''} ({r.registrations!.filter((g) => g.line || g.city).length} with a branch address)
          </p>
        )}

        {fixable.length > 0 && (
          <>
            <p className="ob-aside__sub tone-critical">To fix before submit</p>
            <ul className="ob-plain ob-plain--tight">
              {fixable.map((c) => (
                <li key={c.title} title={c.detail}>
                  {c.section ? <a href={`#sec-${c.section}`}>{c.title}</a> : c.title}
                </li>
              ))}
            </ul>
          </>
        )}
        {warns.length > 0 && (
          <>
            <p className="ob-aside__sub tone-warning">Warnings (you can still submit)</p>
            <ul className="ob-plain ob-plain--tight">
              {warns.map((c) => (
                <li key={c.title} title={c.detail}>
                  {c.title}
                </li>
              ))}
            </ul>
          </>
        )}
        <ChangeSummary r={r} />
      </div>
      <div className="ob-side__actions">
        <Button variant="primary" icon={Send} block disabled={blocking.length > 0} onClick={() => s.submit(r.id)}>
          {r.status === 'returned' ? 'Resubmit' : 'Submit for checking'}
        </Button>
        <span className="subtle small-note">{formProblem ? 'Blocked: this form cannot be set up. Return it.' : blocking.length ? `${missing ? `${missing} field${missing > 1 ? 's' : ''} missing` : 'Fix the items above'}` : `Goes to ${routesFor(r.side).map((x) => ACTORS[x.checker].name).join(', ')}, each their part.`}</span>
        <Button icon={Save} block disabled={!r.dirty} onClick={() => s.saveDraft(r.id)}>
          Save draft
        </Button>
        <Button variant={formProblem ? 'destructive' : 'ghost'} icon={Undo2} block onClick={onSendBack}>
          Return the form to {ACTORS[r.from].name}
        </Button>
        {r.status === 'draft' && r.changes.length === 0 && (
          <button className="link-btn ob-discard" onClick={() => s.discard(r.id)}>
            <Trash2 size={12} aria-hidden /> Opened by mistake: discard
          </button>
        )}
      </div>
    </>
  );
}

/** "Built with": the screen checked against its spec (Sunny's formula, §15 decision 6). */
function BuiltWith({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sp = SCREEN_SPEC;
  const missingSteps = uncoveredSteps();
  const shown = new Set(FIELDS.filter((f) => f.sides.includes('receivable')).map((f) => f.key));
  const fieldKeys = sp.coverage.map(([, , k]) => k.split(' ')[0]);
  const unmatched = fieldKeys.filter((k) => /^[a-z][A-Za-z]+$/.test(k) && !shown.has(k));
  return (
    <Dialog open={open} onClose={onClose} width={980} title={`Built with · ${sp.code} ${sp.name}`} description="Sunny's task-to-screen formula: task card → steps → components → pattern → slots → regions → screen." footer={<Button onClick={onClose}>Close</Button>}>
      <div className="ob-built">
        <p>
          <strong>Category</strong> {sp.category}
        </p>
        <p>
          <strong>Pattern</strong> {sp.pattern.fd} {sp.pattern.name} · <em>{sp.pattern.variant}</em>. {sp.pattern.reason}
        </p>
        <p className="subtle small-note">{sp.profile.map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
        <h4>Regions</h4>
        <table className="ob-sugg">
          <tbody>
            {sp.regions.map((x) => (
              <tr key={x.id}>
                <th scope="row">{x.id}</th>
                <td>{x.width}</td>
                <td>{x.slots.join(', ')}</td>
                <td className="subtle">{x.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4>
          Components ({sp.components.length}) · steps covered {sp.steps.length - missingSteps.length} of {sp.steps.length}
        </h4>
        <table className="ob-sugg">
          <tbody>
            {sp.components.map((c) => (
              <tr key={c.inst}>
                <th scope="row">
                  {c.cmp}
                  {c.added ? ' (added)' : ''}
                </th>
                <td>{c.slot}</td>
                <td>{c.region}</td>
                <td>{c.steps.join(' ')}</td>
                <td className="subtle">{c.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4>Steps</h4>
        <ol className="ob-plain">
          {sp.steps.map((x) => (
            <li key={x.id}>
              {x.id} · {x.name}
            </li>
          ))}
        </ol>
        <h4>Placement rules applied</h4>
        <ul className="ob-plain">
          {sp.rules.map(([n, t]) => (
            <li key={n}>
              {n}. {t}
            </li>
          ))}
        </ul>
        <h4>
          The CA's form: {sp.coverage.length} lines (54 form rows; B1's 3 × 2 registration rows are one table) · {unmatched.length ? `${unmatched.length} not on the screen: ${unmatched.join(', ')}` : 'every row is on the screen'}
        </h4>
        <table className="ob-sugg">
          <tbody>
            {sp.coverage.map(([sec, row, to]) => (
              <tr key={row}>
                <th scope="row">{sec}</th>
                <td>{row}</td>
                <td className="mono">{to}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4>Kept from the app (not on the form)</h4>
        <ul className="ob-plain">
          {sp.kept.map(([k, why]) => (
            <li key={k}>
              <strong>{k}</strong>: {why}
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}

function stepsOf(r: Request): Step[] {
  const steps: Step[] = [
    { label: `Paper form ${r.formNo} from ${who(r.from)}`, at: r.arrivedAt, state: 'done' },
    { label: `${ACTORS[ME].name} types it in and submits`, at: r.submittedAt ?? r.sentBack?.at, state: r.status === 'draft' || r.status === 'returned' ? 'current' : 'done' },
  ];
  if (r.status === 'sent_back') {
    steps.push({ label: `Form returned to ${ACTORS[r.sentBack!.to].name}`, detail: r.sentBack!.reason, at: r.sentBack!.at, state: 'done' });
    return steps;
  }
  for (const c of r.changes) steps.push({ label: `${ACTORS[c.checker].name}: ${c.label.toLowerCase()}`, at: c.decidedAt, detail: c.status === 'returned' ? `Returned: ${c.reason}` : undefined, state: c.status === 'approved' ? 'done' : r.status === 'submitted' ? 'current' : 'todo' });
  steps.push({ label: 'Party and account active', detail: r.accountId ? `${r.partyId} · ${r.accountId} · ${String(r.values.under)}` : undefined, at: r.activatedAt, state: r.status === 'active' ? 'done' : 'todo' });
  return steps;
}

export function ReasonDialog({ open, title, description, chips, action, onClose, onConfirm }: { open: boolean; title: string; description: string; chips: string[]; action: string; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!reason.trim()}
            onClick={() => {
              onConfirm(reason.trim());
              setReason('');
            }}
          >
            {action}
          </Button>
        </>
      }
    >
      <ReasonChips options={chips} onPick={setReason} />
      <TextArea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Your comment" />
    </Dialog>
  );
}

