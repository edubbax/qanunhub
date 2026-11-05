// Builds release/: QanunHub as a ready-to-run app for one computer (Node.js 20+ only, no npm install).
//   release/server.mjs        the API server with every dependency bundled (apps/server/src/local.ts)
//   release/web/              the web app
//   release/migrations/       database migrations
//   release/content.json.gz   the content bundle (+ content.version)
//   release/.env              settings (Supabase URL and key, database login) — copied from release.env if present
// Run `npm run build -w @qanunhub/web` first. Started by QanunHub-baslat.bat (Windows) or qanunhub-baslat.command (macOS/Linux).
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'release');
const web = join(root, 'apps', 'web', 'dist');
if (!existsSync(join(web, 'index.html'))) throw new Error('apps/web/dist is missing: run `npm run build -w @qanunhub/web` first.');

const keepEnv = existsSync(join(out, '.env')) ? readFileSync(join(out, '.env')) : null;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(root, 'apps', 'server', 'src', 'local.ts')],
  outfile: join(out, 'server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  legalComments: 'none',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
cpSync(web, join(out, 'web'), { recursive: true, filter: (p) => !p.endsWith('.map') });
cpSync(join(root, 'apps', 'server', 'migrations'), join(out, 'migrations'), { recursive: true });
const raw = readFileSync(join(root, 'content', 'build', 'content.json'));
const bundle = JSON.parse(raw.toString('utf8'));
bundle.version = `${String(bundle.version).split('+')[0]}+${createHash('sha1').update(raw).digest('hex').slice(0, 10)}`;
writeFileSync(join(out, 'content.json.gz'), gzipSync(Buffer.from(JSON.stringify(bundle)), { level: 9 }));
writeFileSync(join(out, 'content.version'), bundle.version + '\n');
writeFileSync(join(out, 'package.json'), JSON.stringify({ type: 'module', private: true }) + '\n');
const envSrc = process.env.RELEASE_ENV ?? join(root, 'release.env');
if (existsSync(envSrc)) cpSync(envSrc, join(out, '.env'));
else if (keepEnv) writeFileSync(join(out, '.env'), keepEnv);
else cpSync(join(root, 'release.env.example'), join(out, '.env'));
console.log('release/ ready');
