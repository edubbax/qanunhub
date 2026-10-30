import { readFileSync } from 'node:fs';
import { serve } from '@hono/node-server';
import type { ContentBundle } from '@qanunhub/core';
import { hasAuthUsers } from './accounts';
import { createApp } from './app';
import { config } from './config';
import { ContentCache, importBundle } from './content';
import { connect, migrate } from './db';
import { createTokenVerifier } from './supabaseAuth';

async function main() {
  if (!config.supabaseUrl && !config.supabaseJwtSecret) {
    console.warn('SUPABASE_URL is not set: no one can sign in until it is.');
  }
  const sql = connect(config.databaseUrl, { prepare: config.databasePrepare });
  await migrate(sql);
  // First start on an empty database: load the bundled content so the app is usable right away.
  const [hasContent] = await sql`select 1 from content_meta where key = 'version'`;
  if (!hasContent && config.contentSeed) {
    const res = await importBundle(sql, JSON.parse(readFileSync(config.contentSeed, 'utf8')) as ContentBundle, { overwriteEdited: false });
    console.log(`content seeded from ${config.contentSeed}:`, res);
  }
  const content = new ContentCache(sql);
  await content.reload();
  console.log(`content loaded: version ${content.current.bundle.version}, ${content.current.itemById.size} published items`);
  const authUsers = await hasAuthUsers(sql);
  const verifyToken = createTokenVerifier({ supabaseUrl: config.supabaseUrl, jwtSecret: config.supabaseJwtSecret });
  const app = createApp({ sql, content, verifyToken, authUsers });
  serve({ fetch: app.fetch, port: config.port }, (info) => console.log(`QanunHub API listening on :${info.port}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
