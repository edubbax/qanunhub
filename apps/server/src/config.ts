// Runtime configuration from environment variables (see .env.example).

function bool(v: string | undefined, def: boolean): boolean {
  if (v == null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export const config = {
  /** The Supabase Postgres connection string (Project Settings -> Database), or a local Postgres in development. */
  get databaseUrl(): string {
    return process.env.DATABASE_URL ?? 'postgres://qanunhub:qanunhub@localhost:5432/qanunhub';
  },
  /** false for Supabase's transaction pooler (port 6543), which does not support prepared statements. */
  get databasePrepare() {
    return bool(process.env.DATABASE_PREPARE, true);
  },
  get port() {
    return Number(process.env.PORT ?? 8080);
  },
  get appOrigin() {
    return process.env.APP_ORIGIN ?? 'http://localhost:5173';
  },
  /** https://<project-ref>.supabase.co */
  get supabaseUrl() {
    return (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  },
  /** The publishable (or legacy anon) key; handed to the browser through /api/config. */
  get supabasePublishableKey() {
    return process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';
  },
  /** Only for projects still signing tokens with the legacy shared secret (HS256). Never sent to the browser. */
  get supabaseJwtSecret() {
    return process.env.SUPABASE_JWT_SECRET ?? '';
  },
  /** When false, learners may change category at any time. */
  get categoryChangeLimit() {
    return bool(process.env.CATEGORY_CHANGE_LIMIT, true);
  },
  /** The account with this email becomes admin when it first signs in. */
  get adminEmail() {
    return (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  },
  get webDist() {
    return process.env.WEB_DIST ?? '';
  },
  /** content.json imported on start when the database has no content yet. */
  get contentSeed() {
    return process.env.CONTENT_SEED ?? '';
  },
  get trustProxy() {
    return bool(process.env.TRUST_PROXY, false);
  },
};
