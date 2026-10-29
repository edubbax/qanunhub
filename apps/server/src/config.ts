// Runtime configuration from environment variables (see .env.example).

function bool(v: string | undefined, def: boolean): boolean {
  if (v == null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://qanunhub:qanunhub@localhost:5432/qanunhub',
  port: Number(process.env.PORT ?? 8080),
  appOrigin: process.env.APP_ORIGIN ?? 'http://localhost:5173',
  cookieSecure: bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production'),
  /** Staging / review only: skip the email confirmation step. */
  autoVerifyEmail: bool(process.env.AUTO_VERIFY_EMAIL, false),
  /** When false, learners may change category at any time. */
  categoryChangeLimit: bool(process.env.CATEGORY_CHANGE_LIMIT, true),
  adminEmail: process.env.ADMIN_EMAIL ?? '',
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
  webDist: process.env.WEB_DIST ?? '',
  /** content.json imported on start when the database has no content yet. */
  contentSeed: process.env.CONTENT_SEED ?? '',
  mailMode: (process.env.MAIL_MODE ?? 'outbox') as 'outbox' | 'console',
  trustProxy: bool(process.env.TRUST_PROXY, false),
};
