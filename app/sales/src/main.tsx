import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './onboarding/App';
import { startSync } from './backend/sync';
import { applyStoredTheme } from './shell/theme';
import './styles/tokens.css';
import './styles/global.css';
import './ui/ui.css';
import './ui/tile.css';

applyStoredTheme();
// The data lives in PostgreSQL (the backend under /api/db): open from it, then save every change.
void startSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
