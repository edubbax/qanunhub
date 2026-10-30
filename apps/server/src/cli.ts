// Maintenance commands: `migrate`, `import <content.json> [--overwrite-edited]`, `set-role <email> <user|editor|admin>`.
import { readFileSync } from 'node:fs';
import type { ContentBundle } from '@qanunhub/core';
import { config } from './config';
import { importBundle } from './content';
import { connect, migrate } from './db';

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const sql = connect(config.databaseUrl, { prepare: config.databasePrepare });
  try {
    if (cmd === 'migrate') {
      const applied = await migrate(sql);
      console.log(applied.length ? `applied ${applied.length} migration(s)` : 'schema is up to date');
    } else if (cmd === 'import') {
      await migrate(sql, () => {});
      const bundle = JSON.parse(readFileSync(args[0], 'utf8')) as ContentBundle;
      const res = await importBundle(sql, bundle, { overwriteEdited: args.includes('--overwrite-edited') });
      console.log(`imported content ${bundle.version}:`, res);
    } else if (cmd === 'set-role' && args[0] && ['user', 'editor', 'admin'].includes(args[1])) {
      // The learner must have signed in once, so that their row exists.
      const rows = await sql`update users set role = ${args[1]} where email = ${args[0].trim().toLowerCase()} returning id`;
      if (!rows.length) throw new Error(`no learner with email ${args[0]}: sign in to the app once first`);
      console.log(`${args[0]} is now ${args[1]}`);
    } else {
      console.log('usage: cli migrate | import <content.json> [--overwrite-edited] | set-role <email> <user|editor|admin>');
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
