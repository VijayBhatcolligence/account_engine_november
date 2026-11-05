// C&C: communication and collaboration. The same full-screen layout as a task:
//   left    conversations, one per piece of work (or a free one), newest first; "+ New conversation"
//   middle  the messages, the work it is about (opens the task), and the reply box
//   right   notifications: the same inbox as the bell

import { useState } from 'react';
import { ExternalLink, MessagesSquare, Plus, Send } from 'lucide-react';
import { fmtDateTime, relTime } from '../domain/dates';
import { Button, Dialog, EmptyState, ListItem, TextArea, TextInput } from '../ui';
import { ACTORS, ME } from '../onboarding/catalogue';
import { useOnboarding } from '../onboarding/store';
import type { ActorKey } from '../onboarding/types';
import { useCnc, type Thread } from './store';

const PEOPLE: ActorKey[] = ['rajan', 'usha', 'farid', 'venkat', 'arun', 'ravi', 'kiran', 'latha', 'nisha'];

export function CncScreen() {
  const app = useOnboarding();
  const c = useCnc();
  const [sel, setSel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const t = c.threads.find((x) => x.id === sel) ?? c.threads[0] ?? null;

  return (
    <div className="ob-ws">
      <nav className="ob-rail" aria-label="Conversations">
        <div className="ob-rail__head">
          <span className="ob-rail__task">
            <span className="code-tag">C&amp;C</span>
            <strong>Communication &amp; collaboration</strong>
          </span>
        </div>
        <div className="ob-rail__new">
          <Button variant="primary" icon={Plus} block onClick={() => setCreating(true)}>
            New conversation
          </Button>
        </div>
        <div className="ob-rail__scroll">
          <section className="ob-rail__group">
            <h3 className="ob-rail__title">
              Conversations <span className="ob-rail__count">{c.threads.length}</span>
            </h3>
            {c.threads.map((x) => {
              const last = x.messages[x.messages.length - 1];
              return (
                <button
                  key={x.id}
                  className={`ob-rail__item${x.id === t?.id ? ' is-selected' : ''}`}
                  onClick={() => {
                    setSel(x.id);
                    c.read(x.id);
                  }}
                >
                  <span className={`ob-rail__dot bg-${x.unread ? 'warning' : 'normal'}`} aria-hidden />
                  <span className="ob-rail__text">
                    <span className="ob-rail__name">{x.subject}</span>
                    <span className="ob-rail__meta">
                      {ACTORS[last.by].name}: {last.text.slice(0, 48)}
                      {last.text.length > 48 ? '…' : ''} · {relTime(last.at, app.now)}
                    </span>
                  </span>
                </button>
              );
            })}
          </section>
        </div>
      </nav>

      {t ? <Conversation key={t.id} t={t} /> : <div className="ob-req ob-req--empty"><EmptyState icon={MessagesSquare} title="No conversation" text="Start one about a form or an entry." /></div>}

      <aside className="ob-side">
        <div className="ob-side__scroll">
          <p className="ob-aside__title">Notifications</p>
          <p className="subtle small-note">Same as the bell: what the system and other roles tell you.</p>
          <div className="ob-list">
            {app.notices.slice(0, 12).map((n) => (
              <ListItem key={n.id} tone={n.tone} title={n.title} subtitle={n.body} meta={fmtDateTime(n.at)} onClick={() => app.openNotice(n.id)} />
            ))}
          </div>
        </div>
      </aside>
      <NewThread
        open={creating}
        onClose={() => setCreating(false)}
        onStart={(id) => {
          setSel(id);
          setCreating(false);
        }}
      />
    </div>
  );
}

function Conversation({ t }: { t: Thread }) {
  const app = useOnboarding();
  const c = useCnc();
  const [text, setText] = useState('');
  const open = () => (t.link?.kind === 'request' ? app.navigate('onboarding', t.link.id) : t.link && app.openVoucher(t.link.id));
  return (
    <div className="ob-req">
      <header className="ob-req__head">
        <div className="ob-req__titlerow">
          <div>
            <p className="ob-req__eyebrow">
              {t.id} · with {t.people.filter((p) => p !== ME).map((p) => `${ACTORS[p].name} (${ACTORS[p].role})`).join(', ')}
            </p>
            <h2 className="ob-req__title">{t.subject}</h2>
          </div>
          {t.link && (
            <Button size="sm" icon={ExternalLink} onClick={open}>
              Open {t.link.id}
            </Button>
          )}
        </div>
      </header>
      <div className="ob-req__body">
        <div className="ob-req__main cnc-main">
          <ul className="cnc-msgs">
            {t.messages.map((m, i) => (
              <li key={i} className={`cnc-msg${m.by === ME ? ' is-me' : ''}`}>
                <span className="cnc-msg__who">
                  <strong>{ACTORS[m.by].name}</strong> <span className="subtle small-note">{ACTORS[m.by].role} · {fmtDateTime(m.at)}</span>
                </span>
                <span className="cnc-msg__text">{m.text}</span>
              </li>
            ))}
          </ul>
          <div className="cnc-compose">
            <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder={`Reply to ${t.people.filter((p) => p !== ME).map((p) => ACTORS[p].name).join(', ')}…`} />
            <span className="inline-gap">
              <Button
                variant="primary"
                icon={Send}
                disabled={!text.trim()}
                onClick={() => {
                  c.send(t.id, text);
                  setText('');
                }}
              >
                Send
              </Button>
              <span className="subtle small-note">Mock: nobody replies. In the product the others see it in their own C&amp;C.</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewThread({ open, onClose, onStart }: { open: boolean; onClose: () => void; onStart: (id: string) => void }) {
  const c = useCnc();
  const [subject, setSubject] = useState('');
  const [people, setPeople] = useState<ActorKey[]>([]);
  const [text, setText] = useState('');
  const ok = subject.trim() && people.length && text.trim();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New conversation"
      description="Ask a checker, Sales or Dispatch about a form or an entry."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ok}
            onClick={() => {
              onStart(c.start(subject.trim(), people, text.trim()));
              setSubject('');
              setPeople([]);
              setText('');
            }}
          >
            Start
          </Button>
        </>
      }
    >
      <div className="sheet-stack">
        <label className="field">
          <span className="field__label">Subject</span>
          <TextInput value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. DN-0313 Healthy Bite: over the limit" />
        </label>
        <div className="field">
          <span className="field__label">With</span>
          <div className="reason-chips">
            {PEOPLE.map((p) => (
              <button key={p} type="button" className={`reason-chip${people.includes(p) ? ' is-on' : ''}`} onClick={() => setPeople((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]))}>
                {ACTORS[p].name} · {ACTORS[p].role}
              </button>
            ))}
          </div>
        </div>
        <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder="Your message" />
      </div>
    </Dialog>
  );
}
