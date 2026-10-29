import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createUser } from './auth';
import { config } from './config';
import { ContentCache } from './content';
import { connect, migrate } from './db';

async function main() {
  const sql = connect(config.databaseUrl);
  await migrate(sql);
  if (config.adminEmail && config.adminPassword) {
    const [exists] = await sql`select id from users where email = ${config.adminEmail.toLowerCase()}`;
    if (!exists) {
      await createUser(sql, config.adminEmail, config.adminPassword, 'admin', Date.now(), { verified: true, role: 'admin' });
      console.log(`admin account created: ${config.adminEmail}`);
    }
  }
  const content = new ContentCache(sql);
  await content.reload();
  console.log(`content loaded: version ${content.current.bundle.version}, ${content.current.itemById.size} published items`);
  const app = createApp({ sql, content });
  serve({ fetch: app.fetch, port: config.port }, (info) => console.log(`QanunHub API listening on :${info.port}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
