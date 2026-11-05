// Defaults for the Vercel function, set before config.ts reads the environment (imported first by vercel.ts).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const here = dirname(fileURLToPath(import.meta.url));
process.env.MIGRATIONS_DIR ??= join(here, 'migrations');
process.env.TRUST_PROXY ??= '1';
// Supabase's transaction pooler (port 6543) does not keep prepared statements.
process.env.DATABASE_PREPARE ??= 'false';
