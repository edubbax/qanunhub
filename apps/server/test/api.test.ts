// End-to-end API tests against a real Postgres database (TEST_DATABASE_URL, see scripts/dev-db.sh).
// Supabase is stood in for by scripts/supabase-stub.sql (auth.users, auth.uid()) plus the real supabase/profiles.sql,
// and access tokens are signed with a test HS256 secret the way Supabase signs them.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, migrate, type Sql } from '../src/db';
import { ContentCache, importBundle, loadBundle } from '../src/content';
import { createApp } from '../src/app';
import { config } from '../src/config';
import { resetRateLimits } from '../src/rateLimit';
import { createTokenVerifier } from '../src/supabaseAuth';
import { fixtureBundle, sectionedBundle } from '../../../packages/core/test/fixtures';

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:55432/qanunhub_test';
const SUPABASE_URL = 'http://supabase.test';
const SECRET = 'test-secret-with-at-least-32-characters!!';
const root = (f: string) => new globalThis.URL(`../../../${f}`, import.meta.url);
let sql: Sql;
let app: ReturnType<typeof createApp>;
let clock = Date.UTC(2026, 10, 2, 8);

beforeAll(async () => {
  sql = connect(URL);
  await sql.unsafe('drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;');
  await sql.unsafe(readFileSync(root('scripts/supabase-stub.sql'), 'utf8'));
  await sql.unsafe(readFileSync(root('supabase/profiles.sql'), 'utf8'));
  await migrate(sql, () => {});
  await importBundle(sql, fixtureBundle());
  const content = new ContentCache(sql);
  await content.reload();
  config.adminEmail = 'admin@qanunhub.az';
  app = createApp({ sql, content, now: () => clock, authUsers: true, verifyToken: createTokenVerifier({ supabaseUrl: SUPABASE_URL, jwtSecret: SECRET }) });
  admin = await account('admin@qanunhub.az', { first: 'Admin', last: 'QanunHub', username: 'admin' });
});

afterAll(async () => {
  await sql.end();
});

/** A Supabase access token as Auth issues it. */
async function token(sub: string, email: string, claims: Record<string, unknown> = {}, secret = SECRET) {
  const { aud = 'authenticated', ...rest } = claims;
  return new SignJWT({ email, role: 'authenticated', aal: 'aal1', session_id: randomUUID(), is_anonymous: false, ...rest })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(sub).setIssuer(`${SUPABASE_URL}/auth/v1`).setAudience(aud as string)
    .setIssuedAt().setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
}

/** Signs a user up in the stand-in auth.users (the trigger creates the profile row) and fills the profile in. */
async function account(email: string, profile?: { first: string; last: string; username: string }, opts: { confirmed?: boolean } = {}) {
  const id = randomUUID();
  await sql`insert into auth.users (id, email, email_confirmed_at) values (${id}, ${email}, ${opts.confirmed === false ? null : new Date()})`;
  if (profile) await sql`update public.profiles set first_name = ${profile.first}, last_name = ${profile.last}, username = ${profile.username} where id = ${id}`;
  return client(id, await token(id, email));
}

/** Minimal client around app.request() carrying the bearer token. */
function client(id = '', bearer = '') {
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json', 'x-requested-with': 'qanunhub', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  return {
    id,
    get: (p: string) => call('GET', p),
    post: (p: string, b?: unknown, h?: Record<string, string>) => call('POST', p, b ?? {}, h),
    patch: (p: string, b: unknown) => call('PATCH', p, b),
  };
}
type Client = ReturnType<typeof client>;
let admin: Client;
let aynur: Client;

async function correctAnswers(sessionId: string) {
  const [r] = await sql`select data from learn_sessions where id = ${sessionId}`;
  const items = new Map((await sql`select id, answer from items`).map((i) => [i.id, i.answer as number[]]));
  return (r.data.questions as { qid: number; itemId: string; perm: number[] }[]).map((q) => ({
    qid: q.qid, answer: items.get(q.itemId)!.map((a) => q.perm.indexOf(a)),
  }));
}

describe('accounts (Supabase Auth)', () => {
  it('rejects missing, forged, foreign and anonymous tokens', async () => {
    resetRateLimits();
    const id = randomUUID();
    await sql`insert into auth.users (id, email, email_confirmed_at) values (${id}, 'x@example.az', now())`;
    expect((await client().get('/api/me')).status).toBe(401);
    expect((await client(id, await token(id, 'x@example.az', {}, 'another-secret-with-32-characters-long')).get('/api/me')).status).toBe(401);
    expect((await client(id, await token(id, 'x@example.az', { aud: 'other' })).get('/api/me')).status).toBe(401);
    expect((await client(id, await token(id, 'x@example.az', { is_anonymous: true })).get('/api/me')).status).toBe(401);
    expect((await client(id, await token(id, 'x@example.az', { role: 'service_role' })).get('/api/me')).status).toBe(401);
  });

  it('creates the profile row on sign-up and keeps the learning API closed until the profile is complete', async () => {
    aynur = await account('Aynur@Example.az');
    const [p] = await sql`select first_name, username from public.profiles where id = ${aynur.id}`;
    expect(p).toEqual({ first_name: null, username: null });
    const blocked = await aynur.get('/api/me');
    expect(blocked.status).toBe(428);
    expect(blocked.json.error.code).toBe('PROFILE_REQUIRED');
    expect((await aynur.get('/api/meta')).json.formats).toBeNull();

    await sql`update public.profiles set first_name = 'Aynur', last_name = 'Əliyeva', username = 'aynur' where id = ${aynur.id}`;
    const me = await aynur.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.json).toMatchObject({ email: 'aynur@example.az', nickname: 'aynur', fullName: 'Aynur Əliyeva', emailVerified: true, role: 'user' });
    expect((await aynur.get('/api/meta')).json.formats).not.toBeNull();
  });

  it('follows profile edits and email confirmation from Supabase', async () => {
    await sql`update public.profiles set username = 'aynur.e' where id = ${aynur.id}`;
    expect((await aynur.get('/api/me')).json.nickname).toBe('aynur.e');
    const late = await account('late@example.az', { first: 'Kamal', last: 'Rəhimov', username: 'kamal' }, { confirmed: false });
    expect((await late.get('/api/me')).json.emailVerified).toBe(false);
    await sql`update auth.users set email_confirmed_at = now() where email = 'late@example.az'`;
    expect((await late.get('/api/me')).json.emailVerified).toBe(true);
  });

  it('makes the configured admin email an admin on first sign-in', async () => {
    expect((await admin.get('/api/me')).json.role).toBe('admin');
  });

  it('keeps the database tables closed to the Data API roles', async () => {
    const rls = await sql`select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`;
    expect(rls).toEqual([]);
  });

  it('serves the public Supabase settings and blocks state-changing calls without the custom header', async () => {
    expect(Object.keys((await client().get('/api/config')).json)).toEqual(['supabaseUrl', 'supabaseKey']);
    const res = await app.request('/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(403);
  });
});

describe('learning flow', () => {
  let c: Client;

  it('onboards, learns a lesson and gets XP and a streak', async () => {
    c = aynur;
    const me = await c.patch('/api/me', { category: 'BB', subgroup: 'BB2', examDate: '2026-12-15', dailyGoal: 20 });
    expect(me.json.category).toBe('BB');
    const path = await c.get('/api/path');
    expect(path.json.topics.map((t: { id: string }) => t.id)).toEqual(['konst', 'melumat']);
    expect(path.json.topics[1].locked).toBe(true);

    const s = await c.post('/api/sessions', { kind: 'lesson', lessonId: 'k1' });
    expect(s.status).toBe(200);
    expect(JSON.stringify(s.json)).not.toContain('"answer"'); // no keys sent to the client
    for (const q of await correctAnswers(s.json.id)) {
      const r = await c.post(`/api/sessions/${s.json.id}/answer`, { qid: q.qid, answer: q.answer, ms: 8000 });
      expect(r.json.correct).toBe(true);
    }
    const done = await c.post(`/api/sessions/${s.json.id}/complete`);
    expect(done.json.xp).toBe(19);
    expect(done.json.streak).toBe(1);
    const home = await c.get('/api/home');
    expect(home.json.me.xpTotal).toBe(19);
    expect(home.json.targetPercent).toBe(75);
    expect(home.json.examDaysLeft).toBe(43);
  });

  it('runs a competition: admin creates it, the learner takes it once, the admin closes it and a certificate is issued', async () => {
    const a = admin;
    const created = await a.post('/api/admin/competitions', {
      title: 'Noyabr yarışı', description: 'Test', category: 'BB', startsAt: clock - 60_000, endsAt: clock + 86_400_000, questionCount: 5, timeLimitSec: 600,
    });
    expect(created.status).toBe(200);
    const list = await c.get('/api/competitions');
    expect(list.json[0]).toMatchObject({ id: created.json.id, status: 'active', canStart: true });
    const s = await c.post('/api/sessions', { kind: 'competition', competitionId: created.json.id });
    expect(s.json.questions).toHaveLength(5);
    for (const q of await correctAnswers(s.json.id)) await c.post(`/api/sessions/${s.json.id}/answer`, { qid: q.qid, answer: q.answer, ms: 8000 });
    await c.post(`/api/sessions/${s.json.id}/complete`);
    expect((await c.post('/api/sessions', { kind: 'competition', competitionId: created.json.id })).json.error.code).toBe('COMPETITION_CLOSED');
    const finished = await a.post(`/api/admin/competitions/${created.json.id}/finish`);
    const code = finished.json.winners[0].certificateCode;
    expect(finished.json.winners[0].name).toBe('Aynur Əliyeva');
    const cert = await client().get(`/api/certificates/${code}`);
    expect(cert.json).toMatchObject({ code, name: 'Aynur Əliyeva', place: 1, competitionTitle: 'Noyabr yarışı' });
    const me = await c.get('/api/me');
    expect(me.json.awards.find((x: { id: string }) => x.id === 'champion').tier).toBe(1);
    expect(me.json.rank.title).toBe('Gizir');
  });

  it('refuses a second answer to the same question', async () => {
    const s = await c.post('/api/sessions', { kind: 'lesson', lessonId: 'k2' });
    const [q] = await correctAnswers(s.json.id);
    await c.post(`/api/sessions/${s.json.id}/answer`, { qid: q.qid, answer: q.answer, ms: 8000 });
    const again = await c.post(`/api/sessions/${s.json.id}/answer`, { qid: q.qid, answer: q.answer, ms: 8000 });
    expect(again.json.error.code).toBe('ALREADY_ANSWERED');
  });

  it('accepts problem reports for the editors queue', async () => {
    const s = await c.post('/api/sessions', { kind: 'review' });
    expect(s.status).toBe(200);
    const r = await c.post(`/api/sessions/${s.json.id}/report`, { qid: 0, reason: 'wrong_answer', body: 'Açar səhvdir' });
    expect(r.status).toBe(200);
  });

  it('lists free learners on the leaderboard next to a few sample learners', async () => {
    const lb = await c.get('/api/leaderboard?period=week&scope=ALL');
    expect(lb.json.eligible).toBe(true);
    const rows = lb.json.rows as { nickname: string; sample?: boolean; rankCode: string }[];
    expect(rows.find((r) => r.nickname === 'aynur.e')).toMatchObject({ rankCode: 'gizir' });
    expect(rows.filter((r) => r.sample)).toHaveLength(8);
    expect(lb.json.me.rank).toBeGreaterThan(0);
    // Seeding is idempotent and samples stay out of the admin lists.
    await c.get('/api/leaderboard?period=week&scope=ALL');
    const [n] = await sql`select count(*)::int as n from users where email like '%@sample.local'`;
    expect(n.n).toBe(8);
  });

  it('returns a clear error for premium features and billing', async () => {
    expect((await c.post('/api/sessions', { kind: 'mock' })).json.error.code).toBe('PREMIUM_REQUIRED');
    expect((await c.post('/api/billing/checkout', { plan: 'monthly' })).status).toBe(501);
  });
});

describe('admin', () => {
  let a: Client;
  let learner: Client;

  it('keeps Premium closed: a premium date unlocks nothing and everyone stays Gizir', async () => {
    a = admin;
    learner = aynur;
    const users = await a.get('/api/admin/users?q=aynur');
    expect(users.json).toHaveLength(1);
    expect((await a.patch(`/api/admin/users/${users.json[0].id}`, { premiumUntil: clock + 30 * 86400_000 })).status).toBe(200);
    const path = await learner.get('/api/path');
    expect(path.json.topics[1].locked).toBe(true);
    const me = (await learner.get('/api/me')).json;
    expect(me.premium).toBe(false);
    expect(me.rank.title).toBe('Gizir');
    expect((await learner.post('/api/sessions', { kind: 'mock' })).json.error.code).toBe('PREMIUM_REQUIRED');
  });

  it('edits an item, records the change and serves the new text', async () => {
    const list = await a.get('/api/admin/items?topicId=konst&lessonId=k1');
    const item = list.json.items[0];
    const r = await a.patch(`/api/admin/items/${item.id}`, { stem: 'Yenilənmiş sual mətni?', explanation: 'Konstitusiya, maddə 1' });
    expect(r.json.stem).toBe('Yenilənmiş sual mətni?');
    const [log] = await sql`select action from audit_log order by id desc limit 1`;
    expect(log.action).toBe('item.update');
    expect((await a.patch(`/api/admin/items/${item.id}`, { answer: [9] })).json.error.code).toBe('VALIDATION');
  });

  it('confirms a report and thanks the learner with XP', async () => {
    const reports = await a.get('/api/admin/reports?status=open');
    expect(reports.json).toHaveLength(1);
    const before = (await learner.get('/api/me')).json.xpTotal;
    await a.patch(`/api/admin/reports/${reports.json[0].id}`, { status: 'confirmed', resolution: 'Açar düzəldildi' });
    expect((await learner.get('/api/me')).json.xpTotal).toBe(before + 20);
  });

  it('keeps editor changes when content is re-imported', async () => {
    const res = await a.post('/api/admin/import', fixtureBundle());
    expect(res.json.keptEdited).toBe(1);
  });

  it('denies admin endpoints to learners', async () => {
    expect((await learner.get('/api/admin/users')).status).toBe(403);
    expect((await learner.get('/api/admin/overview')).status).toBe(403);
  });
});

describe('content storage', () => {
  it('round-trips sections and question pools through Postgres', async () => {
    const b = sectionedBundle();
    await importBundle(sql, b);
    const back = await loadBundle(sql);
    expect(back.sections?.map((x) => x.id)).toEqual(['konst-s01', 'konst-s02']);
    expect(back.lessons.find((l) => l.id === 'k1')?.sectionId).toBe('konst-s01');
    expect(back.units.find((u) => u.id === 'k1f0')?.pool).toBe('formative');
    expect(back.items.find((i) => i.id === 'k1u0-v0')?.pool).toBe('exam');
  });

  it('lists AB as coming soon and refuses it as a category', async () => {
    const meta = await client().get('/api/meta');
    expect(meta.json.comingSoonCategories).toEqual(['AB']);
    expect(meta.json.formats).toBeNull(); // test formats are shown only after sign-in
    const c = await account('ab@example.az', { first: 'Elçin', last: 'Babayev', username: 'abuser' });
    const res = await c.patch('/api/me', { category: 'AB' });
    expect(res.status).toBe(400);
  });
});
