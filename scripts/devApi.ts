import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { parse } from 'node:url';
import jobsHandler from '../api/jobs.js';

/**
 * Local-only dev server for the Vercel API functions. Vercel has no free offline runner without
 * its CLI, so this mounts the same handlers on http://localhost:3000 for `npm run dev:api`. The
 * Vite dev server proxies /api here (see web/vite.config.ts). Production is unaffected — Vercel
 * runs the handlers itself.
 */
const PORT = 3000;

/** Adapt a raw Node req/res to the minimal Vercel handler shape our handlers use. */
function adapt(req: IncomingMessage, res: ServerResponse) {
  const { query } = parse(req.url ?? '', true);
  const vreq = Object.assign(req, { query });
  const vres = Object.assign(res, {
    status(code: number) {
      res.statusCode = code;
      return vres;
    },
    json(body: unknown) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
      return vres;
    },
  });
  return { vreq, vres };
}

const server = createServer((req, res) => {
  const pathname = parse(req.url ?? '', true).pathname ?? '';
  const { vreq, vres } = adapt(req, res);

  if (pathname === '/api/jobs') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void jobsHandler(vreq as any, vres as any);
    return;
  }

  res.statusCode = 404;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`[dev:api] serving API functions on http://localhost:${PORT}`);
});
