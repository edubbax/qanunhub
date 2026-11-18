// Builds .vercel/output (Vercel Build Output API v3) from the web build and the API server:
//   static/                 the web app (apps/web/dist), served by Vercel's CDN
//   functions/api.func/     the API as one Node.js function, with migrations and the content bundle
//   config.json             routes: /api/* to the function, security headers, SPA fallback
// Run `npm run build -w @qanunhub/web` first. Deploy with `vercel deploy --prebuilt --prod`.
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.vercel', 'output');
const fn = join(out, 'functions', 'api.func');
const web = join(root, 'apps', 'web', 'dist');
const contentPath = join(root, 'content', 'build', 'content.json');
const supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const region = process.env.VERCEL_REGION ?? 'fra1'; // next to Supabase eu-central-1 (Frankfurt)

if (!existsSync(join(web, 'index.html'))) throw new Error('apps/web/dist is missing: run `npm run build -w @qanunhub/web` first.');
if (!supabaseUrl) console.warn('SUPABASE_URL is not set: the Content-Security-Policy will not allow the browser to reach Supabase.');

rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });

cpSync(web, join(out, 'static'), { recursive: true, filter: (p) => !p.endsWith('.map') });

await build({
  entryPoints: [join(root, 'apps', 'server', 'src', 'vercel.ts')],
  outfile: join(fn, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  minify: false,
  legalComments: 'none',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
cpSync(join(root, 'apps', 'server', 'migrations'), join(fn, 'migrations'), { recursive: true });
// The version names the exact bundle, so a content rebuild on the same day still replaces the stored copy.
const raw = readFileSync(contentPath);
const bundle = JSON.parse(raw.toString('utf8'));
bundle.version = `${String(bundle.version).split('+')[0]}+${createHash('sha1').update(raw).digest('hex').slice(0, 10)}`;
writeFileSync(join(fn, 'content.json.gz'), gzipSync(Buffer.from(JSON.stringify(bundle)), { level: 9 }));
writeFileSync(join(fn, 'content.version'), bundle.version + '\n');
writeFileSync(join(fn, 'package.json'), JSON.stringify({ type: 'module' }) + '\n');
writeFileSync(join(fn, '.vc-config.json'), JSON.stringify({
  runtime: 'nodejs22.x',
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  shouldAddHelpers: false,
  maxDuration: 60,
  memory: 1024,
  regions: [region],
}, null, 2) + '\n');

const csp = [
  "default-src 'self'",
  "script-src 'self' https://millinet.az https://*.millinet.az",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "frame-src https:",
  `connect-src 'self'${supabaseUrl ? ' ' + new URL(supabaseUrl).origin : ''} https://millinet.az https://*.millinet.az`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
const common = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' };
writeFileSync(join(out, 'config.json'), JSON.stringify({
  version: 3,
  routes: [
    { src: '^/api(?:/.*)?$', headers: common, continue: true },
    { src: '^/(?!api(?:/|$)).*$', headers: { ...common, 'Content-Security-Policy': csp, 'Strict-Transport-Security': 'max-age=31536000' }, continue: true },
    { src: '^/assets/.+$', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
    { src: '^/(sw\\.js|manifest\\.webmanifest|index\\.html)$', headers: { 'Cache-Control': 'no-cache' }, continue: true },
    { src: '^/api(?:/.*)?$', dest: '/api' },
    { handle: 'filesystem' },
    { src: '^/(?!api(?:/|$)).*$', dest: '/index.html', headers: { 'Cache-Control': 'no-cache' } },
  ],
}, null, 2) + '\n');
console.log(`.vercel/output ready (function region ${region}).`);
