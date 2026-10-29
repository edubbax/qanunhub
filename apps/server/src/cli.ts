// Maintenance commands: `migrate`, `import <content.json> [--overwrite-edited]`, `create-admin <email> <password>`.
import { readFileSync } from 'node:fs';
import type { ContentBundle } from '@qanunhub/core';
import { createUser } from './auth';
import { config } from './config';
import { importBundle } from './content';
import { connect, migrate } from './db';

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const sql = connect(config.databaseUrl);
  try {
    if (cmd === 'migrate') {
      const applied = await migrate(sql);
      console.log(applied.length ? `applied ${applied.length} migration(s)` : 'schema is up to date');
    } else if (cmd === 'import') {
      await migrate(sql, () => {});
      const bundle = JSON.parse(readFileSync(args[0], 'utf8')) as ContentBundle;
      const res = await importBundle(sql, bundle, { overwriteEdited: args.includes('--overwrite-edited') });
      console.log(`imported content ${bundle.version}:`, res);
    } else if (cmd === 'create-admin') {
      await migrate(sql, () => {});
      await createUser(sql, args[0], args[1], args[2] ?? 'admin', Date.now(), { verified: true, role: 'admin' });
      console.log(`admin created: ${args[0]}`);
    } else {
      console.log('usage: cli migrate | import <content.json> [--overwrite-edited] | create-admin <email> <password> [nickname]');
      process.exitCode = 1;
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
