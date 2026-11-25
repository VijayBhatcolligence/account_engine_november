// Serves the backend inside `npm run dev` (and `npm run preview`): one command, one port (5174), the app and its API.
// The API module is loaded through Vite, so it can reuse the app's own TypeScript (catalogues, rules) as they are.
import type { Plugin, ViteDevServer } from 'vite';

export function backend(): Plugin {
  return {
    name: 'aikyat-backend',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/db')) return next();
        try {
          const api = (await server.ssrLoadModule('/server/api.ts')) as typeof import('./api');
          if (!(await api.handle(req, res))) next();
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: (e as Error).message }));
        }
      });
    },
  };
}
