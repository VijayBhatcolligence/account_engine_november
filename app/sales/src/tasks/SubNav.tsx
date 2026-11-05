// The pages under one top-menu item (Rules, Forms): a row of tabs above the page.

import type { ReactNode } from 'react';
import { SegmentedControl } from '../ui';
import type { TabId } from '../onboarding/store';

export function SubNav({ value, options, onChange, children }: { value: TabId; options: { value: TabId; label: string }[]; onChange: (v: TabId) => void; children: ReactNode }) {
  return (
    <div className="subnav-page">
      <div className="subnav">
        <SegmentedControl label="Page" value={value} onChange={onChange} options={options} />
      </div>
      {children}
    </div>
  );
}
