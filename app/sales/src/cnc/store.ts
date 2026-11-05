// Communication & collaboration: one conversation per piece of work (an onboarding request or a sales entry),
// with the people it involves. Mock: messages stay in this browser; nobody else replies.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { ME } from '../onboarding/catalogue';
import { useOnboarding } from '../onboarding/store';
import type { ActorKey } from '../onboarding/types';

export interface Message {
  at: string;
  by: ActorKey;
  text: string;
}

export interface Thread {
  id: string;
  subject: string;
  /** The work it is about: opens it in Tasks. */
  link?: { kind: 'request' | 'voucher'; id: string };
  people: ActorKey[];
  messages: Message[];
  unread: boolean;
}

function seedThreads(): Thread[] {
  return [
    {
      id: 'T-3',
      subject: 'Coastal Bakes: first order waiting',
      people: ['arun', 'teja', 'farid'],
      unread: true,
      messages: [
        { at: '2026-10-07T09:40', by: 'arun', text: "Coastal Bakes' first order SO-0019 is ready to load. Latha can record its challan only once their account is live, and you invoice it from that challan. Form CRF-0019 is with you." },
        { at: '2026-10-07T09:55', by: 'farid', text: 'I agreed ₹4,00,000 with them. I will approve the credit limit as soon as it reaches me.' },
      ],
    },
    {
      id: 'T-2',
      subject: 'Healthy Bite Foods (vendor): bank details',
      link: { kind: 'request', id: 'REQ-0100' },
      people: ['usha', 'teja'],
      unread: false,
      messages: [
        { at: '2026-10-06T16:30', by: 'usha', text: 'The cancelled cheque copy is faint. Can you ask Kiran for a clearer scan before I approve the bank details?' },
        { at: '2026-10-06T16:45', by: 'teja', text: 'Asked Kiran. The penny-drop passed at 100%, if that helps.' },
      ],
    },
    {
      id: 'T-1',
      subject: 'Namma Bakes invoice KA/INV/2627/0142',
      link: { kind: 'voucher', id: 'SI-0011' },
      people: ['rajan', 'teja'],
      unread: false,
      messages: [
        { at: '2026-10-05T11:40', by: 'rajan', text: 'Checked KA/INV/2627/0142 against DC-0619: 100 cartons of milk cream at ₹990, CGST + SGST 2.5% each. Fine.' },
        { at: '2026-10-05T11:50', by: 'teja', text: 'Thanks. The goods left on 03-Oct under the offline fallback, so the IRN came today.' },
      ],
    },
  ];
}

interface State {
  threads: Thread[];
  send: (threadId: string, text: string) => void;
  start: (subject: string, people: ActorKey[], text: string, link?: Thread['link']) => string;
  read: (threadId: string) => void;
  reset: () => void;
}

export const useCnc = create<State>()(
  persist(
    immer((set, get) => ({
      threads: seedThreads(),
      send: (threadId, text) =>
        set((s) => {
          const t = s.threads.find((x) => x.id === threadId);
          if (!t || !text.trim()) return;
          t.messages.push({ at: useOnboarding.getState().now, by: ME, text: text.trim() });
          s.threads = [t, ...s.threads.filter((x) => x.id !== threadId)];
        }),
      start: (subject, people, text, link) => {
        const id = `T-${get().threads.length + 1}`;
        set((s) => {
          s.threads.unshift({ id, subject, people: [ME, ...people.filter((p) => p !== ME)], link, unread: false, messages: [{ at: useOnboarding.getState().now, by: ME, text }] });
        });
        return id;
      },
      read: (threadId) =>
        set((s) => {
          const t = s.threads.find((x) => x.id === threadId);
          if (t) t.unread = false;
        }),
      reset: () =>
        set((s) => {
          s.threads = seedThreads();
        }),
    })),
    { name: 'aikyat-ae-cnc-v1', partialize: (s) => ({ threads: s.threads }) },
  ),
);
