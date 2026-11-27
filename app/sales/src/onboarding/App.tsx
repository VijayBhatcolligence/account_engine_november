// Accounts Executive role app. Same shell and UI kit as before. The top menu is the same for every role:
//   Dashboard · Tasks (two cards: onboarding / create a ledger, create a voucher / post an entry; each opens full screen)
//   · Rules (onboarding checks, posting rules, backend view) · Forms (forms received, vendors & customers, books)
//   · C&C (communication and collaboration)

import { DbPill } from '../backend/DatabasePanel';
import { useEffect, useRef } from 'react';
import { BookOpenCheck, FileStack, LayoutDashboard, ListChecks, MessagesSquare } from 'lucide-react';
import { CncScreen } from '../cnc/CncScreen';
import { useCnc } from '../cnc/store';
import { fmtDateTime } from '../domain/dates';
import { BooksScreen } from '../sales/BooksScreen';
import { PostingRulesScreen } from '../sales/PostingRulesScreen';
import { SalesScreen } from '../sales/SalesScreen';
import { isMineV, useSales } from '../sales/store';
import { AppShell, type ShellTabDef } from '../shell/AppShell';
import { FormsScreen } from '../tasks/FormsScreen';
import { SubNav } from '../tasks/SubNav';
import { TasksHome } from '../tasks/TasksHome';
import { Toaster } from '../ui';
import { ACTORS, ME } from './catalogue';
import { BackendScreen } from './screens/BackendScreen';
import { ChecksScreen } from './screens/ChecksScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { DemoPanel } from './screens/DemoPanel';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { PartiesScreen } from './screens/PartiesScreen';
import { Profile } from './screens/Profile';
import { isCustomer, isMine, useOnboarding, type TabId } from './store';
import './onboarding.css';
import '../sales/sales.css';

type Top = 'dashboard' | 'tasks' | 'rules' | 'forms' | 'cnc';

const TABS: ShellTabDef[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'tasks', label: 'Tasks', icon: ListChecks, bleed: true },
  { id: 'rules', label: 'Rules', icon: BookOpenCheck },
  { id: 'forms', label: 'Forms', icon: FileStack },
  { id: 'cnc', label: 'C&C', icon: MessagesSquare, bleed: true },
];

/** The pages under each menu item, the first is where the menu item opens. */
const PAGES: Record<Top, TabId[]> = {
  dashboard: ['dashboard'],
  tasks: ['tasks', 'onboarding', 'sales'],
  rules: ['checks', 'postingRules', 'backend'],
  forms: ['forms', 'parties', 'books'],
  cnc: ['cnc'],
};
const topOf = (v: TabId) => (Object.keys(PAGES) as Top[]).find((t) => PAGES[t].includes(v)) ?? 'dashboard';
const VIEW_IDS = Object.values(PAGES).flat();

export function App() {
  const s = useOnboarding();
  const sales = useSales();
  const cnc = useCnc();
  const last = useRef<Partial<Record<Top, TabId>>>({});
  const top = topOf(s.nav.tab);
  last.current[top] = s.nav.tab;
  // Deep link: ?tab=onboarding&req=REQ-0101 · ?tab=sales&v=SI-0011 · ?tab=books opens that page.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const tab = q.get('tab') as TabId | null;
    if (tab && VIEW_IDS.includes(tab)) useOnboarding.getState().navigate(tab, q.get('req'));
    if (q.get('v')) useOnboarding.getState().openVoucher(q.get('v'));
  }, []);
  return (
    <AppShell
      title={ACTORS[ME].role}
      tabDefs={TABS}
      user={{ name: ACTORS[ME].name, role: ACTORS[ME].role, place: 'HQ' }}
      clockLabel={fmtDateTime(s.now)}
      activeTab={top}
      onTabChange={(t) => s.navigate(t === 'tasks' ? 'tasks' : last.current[t as Top] ?? PAGES[t as Top][0])}
      tabBadges={{ tasks: s.requests.filter(isCustomer).filter(isMine).length + sales.vouchers.filter(isMineV).length, cnc: cnc.threads.filter((t) => t.unread).length }}
      notifications={s.notices.map((n) => ({ id: n.id, tone: n.tone, title: n.title, body: n.body, time: fmtDateTime(n.at), read: n.read }))}
      onOpenNotification={s.openNotice}
      onMarkAllRead={s.markAllRead}
      onSeeAllNotifications={() => s.navigate('dashboard')}
      profile={<Profile />}
      status={<DbPill />}
      tabs={{
        dashboard: <DashboardScreen />,
        tasks: s.nav.tab === 'sales' ? <SalesScreen /> : s.nav.tab === 'onboarding' ? <OnboardingScreen /> : <TasksHome />,
        rules: (
          <SubNav
            value={top === 'rules' ? s.nav.tab : 'checks'}
            options={[
              { value: 'checks', label: 'Onboarding checks' },
              { value: 'postingRules', label: 'Ledgers' },
              { value: 'backend', label: 'Backend view' },
            ]}
            onChange={(v) => s.navigate(v)}
          >
            {s.nav.tab === 'postingRules' ? <PostingRulesScreen /> : s.nav.tab === 'backend' ? <BackendScreen /> : <ChecksScreen />}
          </SubNav>
        ),
        forms: (
          <SubNav
            value={top === 'forms' ? s.nav.tab : 'forms'}
            options={[
              { value: 'forms', label: 'Forms received' },
              { value: 'parties', label: 'Vendors & customers' },
              { value: 'books', label: 'Books' },
            ]}
            onChange={(v) => s.navigate(v)}
          >
            {s.nav.tab === 'parties' ? <PartiesScreen /> : s.nav.tab === 'books' ? <BooksScreen /> : <FormsScreen />}
          </SubNav>
        ),
        cnc: <CncScreen />,
      }}
    >
      <Toaster toasts={s.toasts} onDismiss={s.dismissToast} />
      <DemoPanel />
    </AppShell>
  );
}
