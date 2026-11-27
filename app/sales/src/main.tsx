import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './onboarding/App';
import { startSync } from './backend/sync';
import { applyStoredTheme } from './shell/theme';
import { useOnboarding } from './onboarding/store';
import { useSales } from './sales/store';
import './styles/tokens.css';
import './styles/global.css';
import './ui/ui.css';
import './ui/tile.css';

applyStoredTheme();
// The data lives in PostgreSQL (the backend under /api/db): open from it, then save every change.
void startSync();
// Development only: the browser checks (scripts/ui) act on the app's own stores, never on a second copy of them.
if (import.meta.env.DEV) (window as unknown as { __aikyat: unknown }).__aikyat = { onboarding: useOnboarding, sales: useSales };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
