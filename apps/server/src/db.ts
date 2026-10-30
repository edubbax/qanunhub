import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

export type Sql = postgres.Sql<Record<string, unknown>>;
export type Tx = postgres.TransactionSql<Record<string, unknown>>;
export type Db = Sql | Tx;

export function connect(url: string, opts: { prepare?: boolean } = {}): Sql {
  return postgres(url, {
    max: 10,
    prepare: opts.prepare ?? true,
    onnotice: () => {},
    types: {
      // Keep calendar dates as plain 'YYYY-MM-DD' strings; no time zone shifts.
      date: { to: 1082, from: [1082], serialize: (x: unknown) => x, parse: (x: unknown) => x },
    },
    transform: { undefined: null },
  }) as unknown as Sql;
}

function migrationsDir(): string {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', 'migrations');
}

/** Applies pending migrations in file-name order inside one transaction each. */
export async function migrate(sql: Sql, log = console.log): Promise<string[]> {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
  const dir = migrationsDir();
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const text = readFileSync(join(dir, f), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into schema_migrations (name) values (${f})`;
    });
    applied.push(f);
    log(`migration applied: ${f}`);
  }
  return applied;
}
