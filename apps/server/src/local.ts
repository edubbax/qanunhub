// QanunHub on your own computer: the same server as in production, connected to the Supabase project, serving
// the web app at http://localhost:3000. Started by QanunHub-baslat.bat / qanunhub-baslat.command (see release/).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { serve } from '@hono/node-server';
import postgres from 'postgres';
import { boot } from './boot';
import { config } from './config';

const here = dirname(fileURLToPath(import.meta.url));

/** Reads KEY=value lines (no export, # comments) into process.env without overriding what is already set. */
function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

/** Supabase poolers live on a few hosts; the first one that accepts the login is used. */
async function pickDatabase(): Promise<void> {
  const list = (process.env.DATABASE_URL_CANDIDATES ?? process.env.DATABASE_URL ?? '').split(/\s*,\s*/).filter(Boolean);
  const errors: string[] = [];
  for (const url of list) {
    const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10, onnotice: () => {} });
    try {
      await sql`select 1`;
      process.env.DATABASE_URL = url;
      return;
    } catch (e) {
      errors.push(`${new URL(url).host}: ${(e as Error).message}`);
    } finally {
      await sql.end({ timeout: 2 }).catch(() => {});
    }
  }
  throw new Error(`Verilənlər bazasına qoşulmaq olmadı:\n  ${errors.join('\n  ')}\nİnternet bağlantısını və .env faylındakı DATABASE_URL-i yoxla.`);
}

async function main() {
  loadEnv(join(here, '.env'));
  process.env.MIGRATIONS_DIR ??= join(here, 'migrations');
  process.env.WEB_DIST ??= join(here, 'web');
  process.env.DATABASE_PREPARE ??= 'false';
  console.log('QanunHub başlayır… (ilk dəfə məzmun bazaya yüklənir, 1–2 dəqiqə çəkə bilər)');
  await pickDatabase();
  const version = readFileSync(join(here, 'content.version'), 'utf8').trim();
  const app = await boot({ seedPath: join(here, 'content.json.gz'), seedVersion: version, seedMode: 'newer' });
  serve({ fetch: app.fetch, port: config.port }, (info) => {
    const url = `http://localhost:${info.port}`;
    console.log(`\nQanunHub hazırdır: ${url}\nBu pəncərəni bağlasan, tətbiq dayanır.\n`);
    const open = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    if (process.env.OPEN_BROWSER !== '0') exec(open, () => {});
  });
}

main().catch((e) => {
  console.error('\nXəta:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
