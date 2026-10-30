// Runtime configuration from environment variables (see .env.example).

function bool(v: string | undefined, def: boolean): boolean {
  if (v == null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export const config = {
  /** The Supabase Postgres connection string (Project Settings -> Database), or a local Postgres in development. */
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://qanunhub:qanunhub@localhost:5432/qanunhub',
  /** false for Supabase's transaction pooler (port 6543), which does not support prepared statements. */
  databasePrepare: bool(process.env.DATABASE_PREPARE, true),
  port: Number(process.env.PORT ?? 8080),
  appOrigin: process.env.APP_ORIGIN ?? 'http://localhost:5173',
  /** https://<project-ref>.supabase.co */
  supabaseUrl: (process.env.SUPABASE_URL ?? '').replace(/\/+$/, ''),
  /** The publishable (or legacy anon) key; handed to the browser through /api/config. */
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
  /** Only for projects still signing tokens with the legacy shared secret (HS256). Never sent to the browser. */
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
  /** When false, learners may change category at any time. */
  categoryChangeLimit: bool(process.env.CATEGORY_CHANGE_LIMIT, true),
  /** The account with this email becomes admin when it first signs in. */
  adminEmail: (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase(),
  webDist: process.env.WEB_DIST ?? '',
  /** content.json imported on start when the database has no content yet. */
  contentSeed: process.env.CONTENT_SEED ?? '',
  trustProxy: bool(process.env.TRUST_PROXY, false),
};
