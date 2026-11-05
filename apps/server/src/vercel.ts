// The API as one Vercel Node.js function (Build Output API, see scripts/vercel-output.mjs). The web app is served
// as static files by Vercel; every /api/* request lands here. Migrations and the bundled content (a newer content
// version replaces the stored one, editors' changes kept) are applied on a cold start, once per instance.
import { here } from './vercelEnv';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { getRequestListener } from '@hono/node-server';
import { boot } from './boot';

let listener: Promise<ReturnType<typeof getRequestListener>> | null = null;

function start() {
  return (async () => {
    const seedVersion = readFileSync(join(here, 'content.version'), 'utf8').trim();
    const app = await boot({ seedPath: join(here, 'content.json.gz'), seedVersion, seedMode: 'newer' });
    return getRequestListener(app.fetch);
  })();
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  listener ??= start().catch((e) => {
    listener = null;
    throw e;
  });
  try {
    const listen = await listener;
    await listen(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) {
      res.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'retry-after': '5' });
      res.end(JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Xidmət başlayır, bir neçə saniyədən sonra yenidən cəhd et.' } }));
    }
  }
}
