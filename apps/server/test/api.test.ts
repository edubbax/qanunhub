// End-to-end API tests against a real Postgres database (TEST_DATABASE_URL, see scripts/dev-db.sh).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, migrate, type Sql } from '../src/db';
import { ContentCache, importBundle, loadBundle } from '../src/content';
import { createApp } from '../src/app';
import { createUser } from '../src/auth';
import { resetRateLimits } from '../src/rateLimit';
import { fixtureBundle, sectionedBundle } from '../../../packages/core/test/fixtures';

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:55432/qanunhub_test';
let sql: Sql;
let app: ReturnType<typeof createApp>;
let clock = Date.UTC(2026, 10, 2, 8);

beforeAll(async () => {
  sql = connect(URL);
  await sql.unsafe('drop schema public cascade; create schema public;');
  await migrate(sql, () => {});
  await importBundle(sql, fixtureBundle());
  const content = new ContentCache(sql);
  await content.reload();
  app = createApp({ sql, content, now: () => clock });
  await createUser(sql, 'admin@qanunhub.az', 'Admin-parol-2026', 'admin', clock, { verified: true, role: 'admin' });
});

afterAll(async () => {
  await sql.end();
});

/** Minimal cookie-keeping client around app.request(). */
function client() {
  let cookie = '';
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json', 'x-requested-with': 'qanunhub', ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  return {
    get: (p: string) => call('GET', p),
    post: (p: string, b?: unknown, h?: Record<string, string>) => call('POST', p, b ?? {}, h),
    patch: (p: string, b: unknown) => call('PATCH', p, b),
  };
}

async function correctAnswers(sessionId: string) {
  const [r] = await sql`select data from learn_sessions where id = ${sessionId}`;
  const items = new Map((await sql`select id, answer from items`).map((i) => [i.id, i.answer as number[]]));
  return (r.data.questions as { qid: number; itemId: string; perm: number[] }[]).map((q) => ({
    qid: q.qid, answer: items.get(q.itemId)!.map((a) => q.perm.indexOf(a)),
  }));
}

describe('accounts', () => {
  it('registers, sends a verification mail and verifies the email', async () => {
    resetRateLimits();
    const c = client();
    const r = await c.post('/api/auth/register', { email: 'Aynur@Example.az', password: 'gizli-parol-1', nickname: 'aynur', accept: true });
    expect(r.status).toBe(200);
    const me = await c.get('/api/me');
    expect(me.json.email).toBe('aynur@example.az');
    expect(me.json.emailVerified).toBe(false);
    const [mail] = await sql`select body from mail_outbox where to_email = 'aynur@example.az' order by id desc limit 1`;
    const token = /token=([\w-]+)/.exec(mail.body)![1];
    expect((await c.post('/api/auth/verify', { token })).status).toBe(200);
    expect((await c.get('/api/me')).json.emailVerified).toBe(true);
    expect((await c.post('/api/auth/verify', { token })).status).toBe(400); // single use
  });

  it('rejects duplicates, weak passwords and wrong credentials without revealing which', async () => {
    const c = client();
    expect((await c.post('/api/auth/register', { email: 'aynur@example.az', password: 'gizli-parol-2', nickname: 'aynur2', accept: true })).status).toBe(409);
    expect((await c.post('/api/auth/register', { email: 'yeni@example.az', password: '12345678', nickname: 'yeni', accept: true })).json.error.code).toBe('VALIDATION');
    const a = await c.post('/api/auth/login', { email: 'aynur@example.az', password: 'səhv-parol' });
    const b = await c.post('/api/auth/login', { email: 'yoxdur@example.az', password: 'səhv-parol' });
    expect(a.status).toBe(401);
    expect(a.json.error.message).toBe(b.json.error.message);
  });

  it('resets a password through the emailed link and logs out other sessions', async () => {
    const c = client();
    await c.post('/api/auth/login', { email: 'aynur@example.az', password: 'gizli-parol-1' });
    expect((await c.get('/api/me')).status).toBe(200);
    await client().post('/api/auth/forgot', { email: 'aynur@example.az' });
    const [mail] = await sql`select body from mail_outbox where subject like '%bərpa%' order by id desc limit 1`;
    const token = /token=([\w-]+)/.exec(mail.body)![1];
    expect((await client().post('/api/auth/reset', { token, password: 'yeni-gizli-parol' })).status).toBe(200);
    expect((await c.get('/api/me')).status).toBe(401);
    const d = client();
    expect((await d.post('/api/auth/login', { email: 'aynur@example.az', password: 'yeni-gizli-parol' })).status).toBe(200);
  });

  it('blocks state-changing calls without the CSRF header', async () => {
    const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(403);
  });
});

describe('learning flow', () => {
  const c = client();

  it('onboards, learns a lesson and gets XP and a streak', async () => {
    await c.post('/api/auth/login', { email: 'aynur@example.az', password: 'yeni-gizli-parol' });
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
    const a = client();
    await a.post('/api/auth/login', { email: 'admin@qanunhub.az', password: 'Admin-parol-2026' });
    const created = await a.post('/api/admin/competitions', {
      title: 'Noyabr yarışı', description: 'Test', category: 'BB', startsAt: clock - 60_000, endsAt: clock + 86_400_000, questionCount: 5, timeLimitSec: 600,
    });
    expect(created.status).toBe(200);
    await c.patch('/api/me', { fullName: 'Aynur Əliyeva' });
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

  it('shows the free learner a preview of the leaderboard', async () => {
    const lb = await c.get('/api/leaderboard?period=week&scope=BB');
    expect(lb.json.eligible).toBe(false);
    expect(lb.json.previewRank).toBe(1);
  });

  it('returns a clear error for premium features and billing', async () => {
    expect((await c.post('/api/sessions', { kind: 'mock' })).json.error.code).toBe('PREMIUM_REQUIRED');
    expect((await c.post('/api/billing/checkout', { plan: 'monthly' })).status).toBe(501);
  });
});

describe('admin', () => {
  const a = client();
  const learner = client();

  it('lets an admin grant premium, which unlocks topics and the leaderboard', async () => {
    await a.post('/api/auth/login', { email: 'admin@qanunhub.az', password: 'Admin-parol-2026' });
    const users = await a.get('/api/admin/users?q=aynur');
    const id = users.json[0].id;
    expect((await a.patch(`/api/admin/users/${id}`, { premiumUntil: clock + 30 * 86400_000 })).status).toBe(200);
    await learner.post('/api/auth/login', { email: 'aynur@example.az', password: 'yeni-gizli-parol' });
    const path = await learner.get('/api/path');
    expect(path.json.topics[1].locked).toBe(false);
    expect((await learner.get('/api/me')).json.rank.title).toBe('Leytenant');
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
    const c = client();
    const meta = await c.get('/api/meta');
    expect(meta.json.comingSoonCategories).toEqual(['AB']);
    expect(meta.json.formats).toBeNull(); // test formats are shown only after sign-in
    await c.post('/api/auth/register', { email: 'ab@example.az', password: 'Parol-uzun-2026', nickname: 'abuser', accept: true });
    const res = await c.patch('/api/me', { category: 'AB' });
    expect(res.status).toBe(400);
  });
});
