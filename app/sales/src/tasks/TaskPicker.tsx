// Tasks menu: every task of this role opens in the same full-screen workspace (rail · form · checklist).
// The rail head shows the task you are in; click it to switch to another task.

import { useRef, useState, useEffect } from 'react';
import { ArrowLeft, ChevronDown, Check } from 'lucide-react';
import { useOnboarding, type TabId } from '../onboarding/store';

export interface TaskDef {
  view: TabId;
  code: string;
  name: string;
  words: string;
}

export const TASKS: TaskDef[] = [
  { view: 'onboarding', code: 'T12', name: 'Create a customer', words: 'A new customer for Sales, from a paper form' },
  { view: 'sales', code: 'T24 · new', name: 'Book a sales voucher', words: 'The accounting entry of an invoice Billing hands over' },
];

export const isTaskView = (v: TabId) => TASKS.some((t) => t.view === v);

export function TaskPicker({ current }: { current: TabId }) {
  const s = useOnboarding();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = TASKS.find((x) => x.view === current)!;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div className="task-pick" ref={ref}>
      <button className="task-pick__btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Switch task">
        <span className="ob-rail__task">
          <span className="code-tag">{t.code}</span>
          <strong>
            {t.name} <ChevronDown size={14} aria-hidden className="task-pick__chev" />
          </strong>
        </span>
      </button>
      {open && (
        <div className="task-pick__panel" role="menu">
          <button
            role="menuitem"
            className="task-pick__item task-pick__back"
            onClick={() => {
              s.navigate('tasks');
              setOpen(false);
            }}
          >
            <ArrowLeft size={14} aria-hidden /> All tasks
          </button>
          <p className="task-pick__head">Your tasks</p>
          {TASKS.map((x) => (
            <button
              key={x.view}
              role="menuitem"
              className={`task-pick__item${x.view === current ? ' is-current' : ''}`}
              onClick={() => {
                s.navigate(x.view);
                setOpen(false);
              }}
            >
              <span className="code-tag">{x.code}</span>
              <span className="task-pick__text">
                <strong>{x.name}</strong>
                <span className="subtle small-note">{x.words}</span>
              </span>
              {x.view === current && <Check size={14} aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
