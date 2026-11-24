// Starts the API: migrations, content seed, content cache, token verifier. Shared by the Node server (index.ts)
// and the Vercel function (vercel.ts).
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { ContentBundle } from '@qanunhub/core';
import { premiumSettings } from '@qanunhub/core';
import { hasAuthUsers } from './accounts';
import { createApp } from './app';
import { config } from './config';
import { ContentCache, importBundle } from './content';
import { connect, migrate } from './db';
import { createTokenVerifier } from './supabaseAuth';

export interface BootOptions {
  /** content.json (or content.json.gz) to load. */
  seedPath?: string;
  /** The bundle's version, when known without parsing it; the file is read only if the database has another one. */
  seedVersion?: string;
  /** 'empty': load only into an empty database (the long-running server). 'newer': also replace an older version. */
  seedMode?: 'empty' | 'newer';
}

function readBundle(path: string): ContentBundle {
  const raw = readFileSync(path);
  return JSON.parse((path.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')) as ContentBundle;
}

export async function boot(opts: BootOptions = {}) {
  if (!config.supabaseUrl && !config.supabaseJwtSecret) {
    console.warn('SUPABASE_URL is not set: no one can sign in until it is.');
  }
  premiumSettings.emails = config.premiumEmails;
  const sql = connect(config.databaseUrl, { prepare: config.databasePrepare });
  await migrate(sql);
  if (opts.seedPath) {
    const [row] = await sql<{ value: string }[]>`select value from content_meta where key = 'version'`;
    const want = opts.seedMode === 'newer' ? !row || (opts.seedVersion ? row.value !== opts.seedVersion : true) : !row;
    if (want) {
      const bundle = readBundle(opts.seedPath);
      if (!row || row.value !== bundle.version) {
        const res = await importBundle(sql, bundle, { overwriteEdited: false, onlyIfVersionDiffers: true });
        if (res) console.log(`content ${bundle.version} loaded from ${opts.seedPath}:`, res);
      }
    }
  }
  const content = new ContentCache(sql);
  await content.reload();
  console.log(`content: version ${content.current.bundle.version}, ${content.current.itemById.size} published items`);
  const authUsers = await hasAuthUsers(sql);
  const verifyToken = createTokenVerifier({ supabaseUrl: config.supabaseUrl, jwtSecret: config.supabaseJwtSecret });
  return createApp({ sql, content, verifyToken, authUsers });
}
