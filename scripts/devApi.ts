import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { parse } from 'node:url';
import jobsHandler from '../api/jobs.js';
import jobByIdHandler from '../api/jobs/[id].js';
import resumeHandler from '../api/resume.js';
import guidanceHandler from '../api/jobs/[id]/guidance.js';
import prepHandler from '../api/jobs/[id]/prep.js';

/**
 * Local-only dev server for the Vercel API functions. Vercel has no free offline runner without
 * its CLI, so this mounts the same handlers on http://localhost:3000 for `npm run dev:api`. The
 * Vite dev server proxies /api here (see web/vite.config.ts). Production is unaffected — Vercel
 * runs the handlers itself.
 */
const PORT = 3000;

/** Read and JSON-parse the request body (Vercel does this automatically in production). */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

/** Adapt a raw Node req/res to the minimal Vercel handler shape our handlers use. */
function adapt(
  req: IncomingMessage,
  res: ServerResponse,
  query: Record<string, string | string[]>,
  body: unknown,
) {
  const vreq = Object.assign(req, { query, body });
  const vres = Object.assign(res, {
    status(code: number) {
      res.statusCode = code;
      return vres;
    },
    json(payload: unknown) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(payload));
      return vres;
    },
  });
  return { vreq, vres };
}

const server = createServer((req, res) => {
  void (async () => {
    const { pathname, query } = parse(req.url ?? '', true);
    const path = pathname ?? '';
    const body = req.method === 'GET' ? undefined : await readJsonBody(req);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const run = (h: any, q: Record<string, string | string[]>) => {
      const { vreq, vres } = adapt(req, res, q, body);
      return h(vreq as never, vres as never) as Promise<void>;
    };
    const q = query as Record<string, string | string[]>;

    // Job-scoped subroutes (most specific first).
    let m: RegExpExecArray | null;
    if ((m = /^\/api\/jobs\/([^/]+)\/guidance$/.exec(path))) {
      await run(guidanceHandler, { ...q, id: m[1]! });
      return;
    }
    if ((m = /^\/api\/jobs\/([^/]+)\/prep$/.exec(path))) {
      await run(prepHandler, { ...q, id: m[1]! });
      return;
    }
    if ((m = /^\/api\/jobs\/([^/]+)$/.exec(path))) {
      await run(jobByIdHandler, { ...q, id: m[1]! });
      return;
    }
    if (path === '/api/jobs') {
      await run(jobsHandler, q);
      return;
    }
    if (path === '/api/resume') {
      await run(resumeHandler, q);
      return;
    }

    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Not Found' }));
  })();
});

server.listen(PORT, () => {
  console.log(`[dev:api] serving API functions on http://localhost:${PORT}`);
});
