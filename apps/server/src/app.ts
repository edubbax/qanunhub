// HTTP API (Hono). Every learner operation runs the shared engine inside a transaction that holds a
// per-user advisory lock, so double submits and parallel tabs cannot corrupt progress.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { Category, ContentBundle, EngineCtx, Period, Scope, UserRecord } from '@qanunhub/core';
import {
  AppError, CATEGORIES, EXAM_FORMATS, SUBGROUPS, answer, complete, getHome, getLeaderboard, getMe, getPath, getWeakTopics,
  grantPremium, isAppError, reportItem, startFinal, startLesson, startMock, startReview, startWeak, updateProfile,
} from '@qanunhub/core';
import {
  SESSION_COOKIE, SESSION_DAYS, consumeToken, createSession, createUser, destroySession, issueToken, login, sessionUser, setPassword,
} from './auth';
import { config } from './config';
import type { ContentCache } from './content';
import { importBundle, rowToItem } from './content';
import type { Sql, Tx } from './db';
import { resetMail, sendMail, verifyMail } from './mailer';
import { PgStore } from './pgStore';
import { rateLimit } from './rateLimit';

type Env = { Variables: { user: UserRecord | null } };

export interface AppDeps {
  sql: Sql;
  content: ContentCache;
  now?: () => number;
}

export const PLANS = [
  { id: 'monthly', title: 'Aylıq', priceAzn: 12.99, months: 1, recurring: true, note: 'Hər ay avtomatik yenilənir, istənilən vaxt ləğv etmək olar.' },
  { id: 'exam3', title: '3 aylıq İmtahan paketi', priceAzn: 29.99, months: 3, recurring: false, note: 'Bir dəfə ödənilir, avtomatik yenilənmir. Ayda ~10 AZN.' },
];

const answerSchema = z.object({ qid: z.number().int().min(0).max(500), answer: z.array(z.number().int().min(0).max(20)).max(20), ms: z.number().min(0).max(3_600_000) });
const profileSchema = z.object({
  category: z.enum(['AB', 'AC', 'BA', 'BB']).optional(),
  subgroup: z.string().max(5).nullable().optional(),
  examDate: z.string().max(10).nullable().optional(),
  dailyGoal: z.number().int().optional(),
  nickname: z.string().max(24).optional(),
});

function clientIp(c: Context): string {
  if (config.trustProxy) {
    const fwd = c.req.header('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
  }
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? 'local';
}

function setSessionCookie(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, sameSite: 'Lax', path: '/', secure: config.cookieSecure, maxAge: SESSION_DAYS * 86400 });
}

async function body<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AppError('VALIDATION', 'Sorğu formatı yanlışdır.');
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new AppError('VALIDATION', 'Sorğu məlumatları yanlışdır.', { issues: r.error.issues.map((i) => i.path.join('.')) });
  return r.data;
}

export function createApp(deps: AppDeps) {
  const { sql, content } = deps;
  const now = deps.now ?? Date.now;
  const app = new Hono<Env>();

  app.onError((err, c) => {
    if (isAppError(err)) return c.json({ error: { code: err.code, message: err.message, data: err.data ?? null } }, err.status as any);
    console.error(err);
    return c.json({ error: { code: 'INTERNAL', message: 'Gözlənilməz xəta baş verdi. Bir az sonra yenidən cəhd edin.' } }, 500);
  });

  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'same-origin');
    c.header('X-Frame-Options', 'DENY');
    if (!c.req.path.startsWith('/api')) {
      c.header('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    }
  });

  // CSRF: state-changing API calls must come from our own scripts (custom header + same-origin cookie).
  app.use('/api/*', async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.header('x-requested-with') !== 'qanunhub') {
      throw new AppError('FORBIDDEN', 'Sorğu qəbul edilmədi.');
    }
    rateLimit(`all:${clientIp(c)}`, 600, 60_000, now());
    c.set('user', await sessionUser(sql, getCookie(c, SESSION_COOKIE)));
    await next();
  });

  const requireUser = (c: Context<Env>): UserRecord => {
    const u = c.get('user');
    if (!u) throw new AppError('UNAUTHORIZED', 'Daxil olun.');
    return u;
  };
  const requireRole = (c: Context<Env>, roles: UserRecord['role'][]): UserRecord => {
    const u = requireUser(c);
    if (!roles.includes(u.role)) throw new AppError('FORBIDDEN', 'Bu bölməyə giriş icazəniz yoxdur.');
    return u;
  };

  async function run<T>(c: Context<Env>, fn: (ctx: EngineCtx, userId: string, tx: Tx) => Promise<T>): Promise<T> {
    const u = requireUser(c);
    return sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${u.id}))`;
      await tx`update users set last_seen_at = now() where id = ${u.id}`;
      const ctx: EngineCtx = {
        store: new PgStore(tx), content: content.current, now: now(), random: Math.random, newId: randomUUID,
        categoryChangeLimit: config.categoryChangeLimit && u.role === 'user',
      };
      return fn(ctx, u.id, tx);
    }) as Promise<T>;
  }

  // ------------------------------------------------------------------ auth

  app.post('/api/auth/register', async (c) => {
    rateLimit(`register:${clientIp(c)}`, 10, 3600_000, now());
    const b = await body(c, z.object({ email: z.string(), password: z.string(), nickname: z.string(), accept: z.literal(true) }));
    const user = await sql.begin(async (tx) => {
      const u = await createUser(tx, b.email, b.password, b.nickname.trim(), now(), { verified: config.autoVerifyEmail });
      if (!u.emailVerified) {
        const token = await issueToken(tx, u.id, 'verify');
        const m = verifyMail(`${config.appOrigin}/tesdiq?token=${token}`);
        await sendMail(tx, u.email, m.subject, m.body);
      }
      return u;
    });
    setSessionCookie(c, await createSession(sql, user.id, { ua: c.req.header('user-agent'), ip: clientIp(c) }));
    return c.json({ ok: true });
  });

  app.post('/api/auth/login', async (c) => {
    const b = await body(c, z.object({ email: z.string().max(200), password: z.string().max(200) }));
    rateLimit(`login:${clientIp(c)}`, 20, 15 * 60_000, now());
    rateLimit(`login:${b.email.toLowerCase()}`, 10, 15 * 60_000, now());
    const u = await login(sql, b.email, b.password);
    setSessionCookie(c, await createSession(sql, u.id, { ua: c.req.header('user-agent'), ip: clientIp(c) }));
    return c.json({ ok: true });
  });

  app.post('/api/auth/logout', async (c) => {
    await destroySession(sql, getCookie(c, SESSION_COOKIE));
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.post('/api/auth/verify', async (c) => {
    const b = await body(c, z.object({ token: z.string().max(100) }));
    const userId = await consumeToken(sql, b.token, 'verify');
    await sql`update users set email_verified = true where id = ${userId}`;
    return c.json({ ok: true });
  });

  app.post('/api/auth/resend-verification', async (c) => {
    const u = requireUser(c);
    rateLimit(`resend:${u.id}`, 3, 3600_000, now());
    if (u.emailVerified) return c.json({ ok: true });
    const token = await issueToken(sql, u.id, 'verify');
    const m = verifyMail(`${config.appOrigin}/tesdiq?token=${token}`);
    await sendMail(sql, u.email, m.subject, m.body);
    return c.json({ ok: true });
  });

  app.post('/api/auth/forgot', async (c) => {
    const b = await body(c, z.object({ email: z.string().max(200) }));
    rateLimit(`forgot:${clientIp(c)}`, 5, 3600_000, now());
    const [r] = await sql`select id, email from users where email = ${b.email.trim().toLowerCase()}`;
    if (r) {
      const token = await issueToken(sql, r.id, 'reset');
      const m = resetMail(`${config.appOrigin}/sifre-berpa?token=${token}`);
      await sendMail(sql, r.email, m.subject, m.body);
    }
    return c.json({ ok: true }); // same answer whether or not the account exists
  });

  app.post('/api/auth/reset', async (c) => {
    const b = await body(c, z.object({ token: z.string().max(100), password: z.string().max(200) }));
    await sql.begin(async (tx) => {
      const userId = await consumeToken(tx, b.token, 'reset');
      await setPassword(tx, userId, b.password);
    });
    return c.json({ ok: true });
  });

  // ------------------------------------------------------------------ learner

  app.get('/api/meta', (c) => c.json({
    categories: CATEGORIES, subgroups: SUBGROUPS, formats: EXAM_FORMATS, plans: PLANS,
    contentVersion: content.current.bundle.version,
    topics: content.current.topics.map((t) => ({ id: t.id, programNo: t.programNo, shortTitle: t.shortTitle, categories: t.categories, free: t.free })),
  }));

  app.get('/api/me', async (c) => c.json(await run(c, (ctx, id) => getMe(ctx, id))));
  app.patch('/api/me', async (c) => {
    const b = await body(c, profileSchema);
    if (b.nickname) {
      const u = requireUser(c);
      const [taken] = await sql`select 1 from users where lower(nickname) = lower(${b.nickname}) and id <> ${u.id}`;
      if (taken) throw new AppError('CONFLICT', 'Bu ləqəb artıq istifadə olunur.');
    }
    return c.json(await run(c, (ctx, id) => updateProfile(ctx, id, b as any)));
  });
  app.get('/api/home', async (c) => c.json(await run(c, (ctx, id) => getHome(ctx, id))));
  app.get('/api/path', async (c) => c.json(await run(c, (ctx, id) => getPath(ctx, id))));

  app.post('/api/sessions', async (c) => {
    const b = await body(c, z.object({ kind: z.enum(['lesson', 'review', 'weak', 'final', 'mock']), lessonId: z.string().max(80).optional(), topicId: z.string().max(80).optional() }));
    const u = requireUser(c);
    rateLimit(`session:${u.id}`, 60, 60 * 60_000, now());
    return c.json(await run(c, (ctx, id) => {
      switch (b.kind) {
        case 'lesson': return startLesson(ctx, id, b.lessonId ?? '');
        case 'review': return startReview(ctx, id);
        case 'weak': return startWeak(ctx, id, b.topicId ?? '');
        case 'final': return startFinal(ctx, id, b.topicId ?? '');
        default: return startMock(ctx, id);
      }
    }));
  });

  app.post('/api/sessions/:id/answer', async (c) => {
    const b = await body(c, answerSchema);
    const u = requireUser(c);
    rateLimit(`answer:${u.id}`, 240, 60_000, now());
    return c.json(await run(c, (ctx, id) => answer(ctx, id, (c.req.param('id') ?? ''), b.qid, b.answer, b.ms)));
  });

  app.post('/api/sessions/:id/complete', async (c) => c.json(await run(c, (ctx, id) => complete(ctx, id, (c.req.param('id') ?? '')))));

  app.post('/api/sessions/:id/report', async (c) => {
    const b = await body(c, z.object({ qid: z.number().int(), reason: z.string().max(30), body: z.string().max(2000).default('') }));
    const u = requireUser(c);
    rateLimit(`report:${u.id}`, 30, 3600_000, now());
    await run(c, (ctx, id) => reportItem(ctx, id, (c.req.param('id') ?? ''), b.qid, b.reason, b.body ?? ''));
    return c.json({ ok: true });
  });

  app.get('/api/leaderboard', async (c) => {
    const period = (c.req.query('period') === 'month' ? 'month' : 'week') as Period;
    const scopeQ = c.req.query('scope') ?? 'ALL';
    const scope = (scopeQ === 'ALL' || (CATEGORIES as string[]).includes(scopeQ) ? scopeQ : 'ALL') as Scope;
    return c.json(await run(c, (ctx, id) => getLeaderboard(ctx, id, period, scope)));
  });

  app.get('/api/weak', async (c) => c.json(await run(c, (ctx, id) => getWeakTopics(ctx, id))));

  app.get('/api/billing/plans', (c) => c.json({ plans: PLANS }));
  app.post('/api/billing/checkout', () => {
    throw new AppError('NOT_IMPLEMENTED', 'Onlayn ödəniş növbəti mərhələdə qoşulacaq. Hələlik Premium administrator tərəfindən aktivləşdirilir.');
  });

  // ------------------------------------------------------------------ admin

  const audit = (tx: Tx | Sql, actor: string, action: string, entity: string, entityId: string, before: unknown, after: unknown) =>
    tx`insert into audit_log (actor, action, entity, entity_id, before, after) values (${actor}, ${action}, ${entity}, ${entityId}, ${before == null ? null : tx.json(before as any)}, ${after == null ? null : tx.json(after as any)})`;

  app.get('/api/admin/overview', async (c) => {
    requireRole(c, ['admin', 'editor']);
    const [u] = await sql`
      select count(*)::int as users,
        count(*) filter (where premium_until > now())::int as premium,
        count(*) filter (where last_seen_at > now() - interval '1 day')::int as active_day,
        count(*) filter (where last_seen_at > now() - interval '7 days')::int as active_week,
        count(*) filter (where created_at > now() - interval '7 days')::int as new_week
      from users`;
    const items = await sql`select status, count(*)::int as n from items group by status`;
    const flags = await sql`select f as flag, count(*)::int as n from items, unnest(flags) f group by f order by n desc`;
    const [r] = await sql`select count(*) filter (where status = 'open')::int as open from reports`;
    const [s] = await sql`select count(*)::int as sessions, count(*) filter (where completed_at is not null)::int as completed from learn_sessions where created_at > now() - interval '1 day'`;
    const [cc] = await sql`select (select count(*)::int from topics) as topics, (select count(*)::int from lessons) as lessons, (select count(*)::int from cards) as cards, (select count(*)::int from units) as units`;
    return c.json({ users: u, items, flags, reports: r, sessionsDay: s, content: { ...cc, version: content.current.bundle.version } });
  });

  app.get('/api/admin/topics', async (c) => {
    requireRole(c, ['admin', 'editor']);
    const rows = await sql`
      select t.id, t.program_no, t.short_title, t.categories, t.free,
        (select count(*)::int from lessons l where l.topic_id = t.id) as lessons,
        (select count(*)::int from items i where i.topic_id = t.id) as items,
        (select count(*)::int from items i where i.topic_id = t.id and i.status = 'published') as published,
        (select count(*)::int from items i where i.topic_id = t.id and cardinality(i.flags) > 0) as flagged
      from topics t order by t.sort`;
    return c.json(rows.map((r) => ({ id: r.id, programNo: r.program_no, shortTitle: r.short_title, categories: r.categories, free: r.free, lessons: r.lessons, items: r.items, published: r.published, flagged: r.flagged })));
  });

  app.get('/api/admin/lessons', async (c) => {
    requireRole(c, ['admin', 'editor']);
    const topicId = c.req.query('topicId') ?? '';
    const rows = await sql`
      select l.*, (select count(*)::int from items i where i.lesson_id = l.id) as items,
        (select count(*)::int from cards k where k.lesson_id = l.id) as cards
      from lessons l where l.topic_id = ${topicId} order by l.sort`;
    return c.json(rows.map((r) => ({ id: r.id, title: r.title, order: r.sort, refs: r.refs, categories: r.categories, items: r.items, cards: r.cards })));
  });

  app.get('/api/admin/items', async (c) => {
    requireRole(c, ['admin', 'editor']);
    const q = c.req.query();
    const page = Math.max(0, Number(q.page ?? 0) || 0);
    const like = q.q ? `%${q.q}%` : null;
    const rows = await sql`
      select * from items where true
        ${q.topicId ? sql`and topic_id = ${q.topicId}` : sql``}
        ${q.lessonId ? sql`and lesson_id = ${q.lessonId}` : sql``}
        ${q.status ? sql`and status = ${q.status}` : sql``}
        ${q.flag ? sql`and ${q.flag} = any(flags)` : sql``}
        ${like ? sql`and stem ilike ${like}` : sql``}
      order by topic_id, lesson_id nulls last, id limit 50 offset ${page * 50}`;
    const [{ n }] = await sql`
      select count(*)::int as n from items where true
        ${q.topicId ? sql`and topic_id = ${q.topicId}` : sql``}
        ${q.lessonId ? sql`and lesson_id = ${q.lessonId}` : sql``}
        ${q.status ? sql`and status = ${q.status}` : sql``}
        ${q.flag ? sql`and ${q.flag} = any(flags)` : sql``}
        ${like ? sql`and stem ilike ${like}` : sql``}`;
    return c.json({ total: n, page, items: rows.map(rowToItem) });
  });

  app.get('/api/admin/items/:id/stats', async (c) => {
    requireRole(c, ['admin', 'editor']);
    const [r] = await sql`select count(*)::int as answered, count(*) filter (where correct)::int as correct, coalesce(avg(response_ms), 0)::int as avg_ms from review_log where item_id = ${(c.req.param('id') ?? '')}`;
    return c.json(r);
  });

  const itemPatch = z.object({
    stem: z.string().min(5).max(2000).optional(),
    statements: z.array(z.string().min(1).max(1000)).max(12).nullable().optional(),
    options: z.array(z.string().min(1).max(1000)).min(2).max(10).optional(),
    answer: z.array(z.number().int().min(0)).min(1).max(10).optional(),
    explanation: z.string().max(2000).nullable().optional(),
    ref: z.string().max(100).nullable().optional(),
    status: z.enum(['draft', 'review', 'published', 'flagged']).optional(),
    flags: z.array(z.string().max(40)).max(20).optional(),
  });

  app.patch('/api/admin/items/:id', async (c) => {
    const actor = requireRole(c, ['admin', 'editor']);
    const b = await body(c, itemPatch);
    const id = (c.req.param('id') ?? '');
    const updated = await sql.begin(async (tx) => {
      const [r] = await tx`select * from items where id = ${id} for update`;
      if (!r) throw new AppError('NOT_FOUND', 'Sual tapılmadı.');
      const before = rowToItem(r);
      const next = { ...before, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) } as typeof before;
      if (next.answer.some((a) => a >= next.options.length)) throw new AppError('VALIDATION', 'Düzgün cavab variantların sayından kənardadır.');
      if (next.type === 'single' && next.answer.length !== 1) throw new AppError('VALIDATION', 'Tək seçimli sualın bir düzgün cavabı olmalıdır.');
      await tx`
        update items set stem = ${next.stem}, statements = ${next.statements ? tx.json(next.statements) : null}, options = ${tx.json(next.options)},
          answer = ${tx.json(next.answer)}, explanation = ${next.explanation ?? null}, ref = ${next.ref ?? null}, status = ${next.status},
          flags = ${next.flags}, updated_at = now(), updated_by = ${actor.id}
        where id = ${id}`;
      await audit(tx, actor.id, 'item.update', 'item', id, before, next);
      return next;
    });
    await content.reload();
    return c.json(updated);
  });

  app.get('/api/admin/cards', async (c) => {
    requireRole(c, ['admin', 'editor']);
    const rows = await sql`select * from cards where lesson_id = ${c.req.query('lessonId') ?? ''} order by sort`;
    return c.json(rows.map((r) => ({ id: r.id, lessonId: r.lesson_id, order: r.sort, kind: r.kind, title: r.title, body: r.body, ref: r.ref })));
  });

  app.patch('/api/admin/cards/:id', async (c) => {
    const actor = requireRole(c, ['admin', 'editor']);
    const b = await body(c, z.object({ title: z.string().max(300).nullable().optional(), body: z.string().min(1).max(6000).optional() }));
    const id = (c.req.param('id') ?? '');
    await sql.begin(async (tx) => {
      const [r] = await tx`select * from cards where id = ${id} for update`;
      if (!r) throw new AppError('NOT_FOUND', 'Kart tapılmadı.');
      await tx`update cards set title = ${b.title === undefined ? r.title : b.title}, body = ${b.body ?? r.body}, updated_at = now(), updated_by = ${actor.id} where id = ${id}`;
      await audit(tx, actor.id, 'card.update', 'card', id, { title: r.title, body: r.body }, b);
    });
    await content.reload();
    return c.json({ ok: true });
  });

  app.get('/api/admin/reports', async (c) => {
    requireRole(c, ['admin', 'editor']);
    const status = c.req.query('status') ?? 'open';
    const rows = await sql`
      select r.*, u.nickname, i.stem, i.topic_id from reports r join users u on u.id = r.user_id left join items i on i.id = r.item_id
      where r.status = ${status} order by r.created_at desc limit 200`;
    return c.json(rows.map((r) => ({ id: String(r.id), itemId: r.item_id, reason: r.reason, body: r.body, status: r.status, resolution: r.resolution, createdAt: new Date(r.created_at).getTime(), nickname: r.nickname, stem: r.stem, topicId: r.topic_id })));
  });

  app.patch('/api/admin/reports/:id', async (c) => {
    const actor = requireRole(c, ['admin', 'editor']);
    const b = await body(c, z.object({ status: z.enum(['confirmed', 'rejected']), resolution: z.string().max(1000).default('') }));
    const id = (c.req.param('id') ?? '');
    await sql.begin(async (tx) => {
      const [r] = await tx`update reports set status = ${b.status}, resolution = ${b.resolution}, resolved_at = now(), resolved_by = ${actor.id} where id = ${id} and status = 'open' returning *`;
      if (!r) throw new AppError('NOT_FOUND', 'Şikayət tapılmadı və ya artıq baxılıb.');
      if (b.status === 'confirmed') {
        // Thank the reporter: XP that does not count on the leaderboard.
        await tx`insert into xp_events (user_id, source, amount, leaderboard, created_at) values (${r.user_id}, 'report', 20, false, now())`;
        await tx`update users set xp_total = xp_total + 20 where id = ${r.user_id}`;
      }
      await audit(tx, actor.id, 'report.' + b.status, 'report', id, null, b);
    });
    return c.json({ ok: true });
  });

  app.get('/api/admin/users', async (c) => {
    requireRole(c, ['admin']);
    const q = c.req.query('q');
    const like = q ? `%${q}%` : null;
    const rows = await sql`
      select id, email, nickname, role, category, subgroup, premium_until, email_verified, leaderboard_banned, xp_total, created_at, last_seen_at
      from users ${like ? sql`where email ilike ${like} or nickname ilike ${like}` : sql``}
      order by created_at desc limit 100`;
    return c.json(rows.map((r) => ({
      id: r.id, email: r.email, nickname: r.nickname, role: r.role, category: r.category, subgroup: r.subgroup,
      premiumUntil: r.premium_until ? new Date(r.premium_until).getTime() : null, emailVerified: r.email_verified,
      leaderboardBanned: r.leaderboard_banned, xpTotal: r.xp_total, createdAt: new Date(r.created_at).getTime(),
      lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).getTime() : null,
    })));
  });

  app.patch('/api/admin/users/:id', async (c) => {
    const actor = requireRole(c, ['admin']);
    const b = await body(c, z.object({
      premiumUntil: z.number().nullable().optional(), role: z.enum(['user', 'editor', 'admin']).optional(),
      leaderboardBanned: z.boolean().optional(), emailVerified: z.boolean().optional(),
    }));
    const id = (c.req.param('id') ?? '');
    if (id === actor.id && b.role && b.role !== 'admin') throw new AppError('VALIDATION', 'Öz admin rolunuzu silə bilməzsiniz.');
    await sql.begin(async (tx) => {
      const [r] = await tx`select id, role, premium_until, leaderboard_banned, email_verified from users where id = ${id} for update`;
      if (!r) throw new AppError('NOT_FOUND', 'İstifadəçi tapılmadı.');
      if (b.premiumUntil !== undefined) {
        const ctx: EngineCtx = { store: new PgStore(tx), content: content.current, now: now(), random: Math.random, newId: randomUUID };
        await grantPremium(ctx, id, b.premiumUntil);
      }
      if (b.role) await tx`update users set role = ${b.role} where id = ${id}`;
      if (b.leaderboardBanned !== undefined) await tx`update users set leaderboard_banned = ${b.leaderboardBanned} where id = ${id}`;
      if (b.emailVerified !== undefined) await tx`update users set email_verified = ${b.emailVerified} where id = ${id}`;
      await audit(tx, actor.id, 'user.update', 'user', id, r, b);
    });
    return c.json({ ok: true });
  });

  app.post('/api/admin/import', async (c) => {
    const actor = requireRole(c, ['admin']);
    const b = (await c.req.json()) as ContentBundle & { overwriteEdited?: boolean };
    if (!b || !Array.isArray(b.topics) || !Array.isArray(b.items)) throw new AppError('VALIDATION', 'Fayl məzmun paketi deyil.');
    const res = await importBundle(sql, b, { overwriteEdited: !!b.overwriteEdited });
    await audit(sql, actor.id, 'content.import', 'content', b.version ?? '', null, res);
    await content.reload();
    return c.json(res);
  });

  app.get('/api/admin/mail', async (c) => {
    requireRole(c, ['admin']);
    const rows = await sql`select id, to_email, subject, body, created_at from mail_outbox order by id desc limit 50`;
    return c.json(rows.map((r) => ({ id: String(r.id), to: r.to_email, subject: r.subject, body: r.body, createdAt: new Date(r.created_at).getTime() })));
  });

  app.get('/api/admin/audit', async (c) => {
    requireRole(c, ['admin']);
    const rows = await sql`select a.*, u.nickname from audit_log a left join users u on u.id = a.actor order by a.id desc limit 100`;
    return c.json(rows.map((r) => ({ id: String(r.id), actor: r.nickname, action: r.action, entity: r.entity, entityId: r.entity_id, createdAt: new Date(r.created_at).getTime() })));
  });

  app.get('/api/admin/payments', (c) => {
    requireRole(c, ['admin']);
    return c.json({ payments: [], note: 'Ödəniş provayderi qoşulandan sonra əməliyyatlar burada görünəcək.' });
  });

  app.all('/api/*', () => {
    throw new AppError('NOT_FOUND', 'Belə API yolu yoxdur.');
  });

  // ------------------------------------------------------------------ web app (production build)

  if (config.webDist && existsSync(join(config.webDist, 'index.html'))) {
    const index = readFileSync(join(config.webDist, 'index.html'), 'utf8');
    app.use('/assets/*', serveStatic({ root: config.webDist, onFound: (_p, c) => { c.header('Cache-Control', 'public, max-age=31536000, immutable'); } }));
    app.use('*', serveStatic({ root: config.webDist }));
    app.get('*', (c) => c.html(index));
  }

  return app;
}

export type { Category };
