import { serve } from '@hono/node-server';
import { boot } from './boot';
import { config } from './config';

async function main() {
  const app = await boot({ seedPath: config.contentSeed || undefined, seedMode: 'empty' });
  serve({ fetch: app.fetch, port: config.port }, (info) => console.log(`QanunHub API listening on :${info.port}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
