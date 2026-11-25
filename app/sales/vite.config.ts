import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { backend } from './server/vitePlugin';

export default defineConfig({
  // backend(): the API under /api/db (saves the app to PostgreSQL), served by the same dev server.
  plugins: [react(), backend()],
  server: { port: 5174, open: true },
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
});
