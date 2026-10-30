// Demo backend: the same engine as the server, running in the browser over an in-memory store saved to
// localStorage. Accounts, payments and email are simulated; everything else behaves like production.
import type { AdminApi, AdminAudit, AdminMail, AdminUser, Api, ItemFilter, MetaDto } from './types';
import { ApiError } from './types';
import {
  AVAILABLE_CATEGORIES, AppError, CATEGORIES, COMING_SOON_CATEGORIES, ContentIndex, EXAM_FORMATS, MemoryStore, SAMPLE_EMAIL_SUFFIX, SUBGROUPS, answer, complete, emptyMemoryData,
  getHome, getLeaderboard, getMe, getPath, getWeakTopics, grantPremium, isAppError, newUser, periodStartKey, dayStart, randomId,
  reportItem, startFinal, startLesson, startMock, startReview, startSection, startWeak, updateProfile,
  adminCompetitions, createCompetition, finishCompetitionNow, getCertificate, getStandings, listCompetitions, recordConfirmedReport,
  startCompetition, type Competition,
  type Card, type Category, type ContentBundle, type EngineCtx, type Item, type MemoryData, type SessionKind,
} from '@qanunhub/core';

const KEY = 'qanunhub-demo-v4';
const DEMO_EMAIL = 'demo@qanunhub.az';
const DEMO_PASSWORD = 'demo-hesab-2026';

interface DemoState {
  memory: MemoryData;
  accounts: Record<string, { userId: string; pass: string }>;
  current: string | null;
  overrides: { items: Record<string, Partial<Item>>; cards: Record<string, { title?: string | null; body?: string }> };
  mail: AdminMail[];
  audit: AdminAudit[];
  resetTokens: Record<string, string>;
  seeded: string[];
}

const PLANS: MetaDto['plans'] = [
  { id: 'monthly', title: 'Aylıq', priceAzn: 12.99, months: 1, recurring: true, note: 'Hər ay avtomatik yenilənir, istənilən vaxt ləğv etmək olar.' },
  { id: 'exam3', title: '3 aylıq İmtahan paketi', priceAzn: 29.99, months: 3, recurring: false, note: 'Bir dəfə ödənilir, avtomatik yenilənmir. Ayda ~10 AZN.' },
];

const SAMPLE_NICKS = [
  'leyla.m', 'orxan_dq', 'nigar88', 'tural.h', 'aysel_k', 'kamran.e', 'gunel.q', 'rauf_ab', 'sevinc.a', 'elvin_r', 'nərmin.s', 'fuad.bb',
  'aytən_m', 'samir.i', 'zəhra_n', 'ilkin.t', 'könül_h', 'murad.ac', 'lalə_b', 'ramin.k', 'şəbnəm_q', 'vüsal.d', 'xədicə.r', 'emil_ba',
];

function load(): DemoState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DemoState) : null;
  } catch {
    return null;
  }
}

function fresh(): DemoState {
  return { memory: emptyMemoryData(), accounts: {}, current: null, overrides: { items: {}, cards: {} }, mail: [], audit: [], resetTokens: {}, seeded: [] };
}

// Not a security measure: demo accounts live only in this browser.
function demoHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36) + ':' + s.length;
}

function wrap(e: unknown): never {
  if (e instanceof ApiError) throw e;
  if (isAppError(e)) {
    const a = e as AppError;
    throw new ApiError(a.code, a.message, a.status, (a.data as Record<string, unknown>) ?? null);
  }
  throw e;
}

export async function localApi(loadBundle: () => Promise<ContentBundle>): Promise<Api> {
  let state: DemoState = load() ?? fresh();
  let base = await loadBundle();
  const store = new MemoryStore(state.memory);
  let index = build();

  function build(): ContentIndex {
    const b: ContentBundle = {
      ...base,
      items: base.items.map((i) => (state.overrides.items[i.id] ? { ...i, ...state.overrides.items[i.id] } as Item : i)),
      cards: base.cards.map((c) => (state.overrides.cards[c.id] ? { ...c, ...state.overrides.cards[c.id] } as Card : c)),
    };
    return new ContentIndex(b);
  }

  function save() {
    state.memory = store.data;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: the demo keeps working for this tab.
    }
  }

  function ctx(): EngineCtx {
    return { store, content: index, now: Date.now(), random: Math.random, newId: randomId, categoryChangeLimit: false };
  }

  function currentId(): string {
    if (!state.current || !store.data.users[state.current]) throw new ApiError('UNAUTHORIZED', 'Hesaba daxil ol.', 401);
    return state.current;
  }

  async function run<T>(fn: (c: EngineCtx, userId: string) => Promise<T>): Promise<T> {
    try {
      const r = await fn(ctx(), currentId());
      save();
      return r;
    } catch (e) {
      save();
      return wrap(e);
    }
  }

  /** Sample learners so the leaderboards are not empty in the demo. They are marked as samples in the UI. */
  async function seedSamples() {
    const now = Date.now();
    const keys = [`week|${periodStartKey('week', now)}`, `month|${periodStartKey('month', now)}`];
    const missing = keys.filter((k) => !state.seeded.includes(k));
    if (missing.length === 0) return;
    let rnd = 7;
    const r = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
    SAMPLE_NICKS.forEach((nick, i) => {
      const id = `sample-${i}`;
      if (!store.data.users[id]) {
        const u = newUser(id, `sample${i}${SAMPLE_EMAIL_SUFFIX}`, nick, now);
        u.category = AVAILABLE_CATEGORIES[i % AVAILABLE_CATEGORIES.length];
        u.premiumUntil = now + 365 * 86400_000;
        u.emailVerified = true;
        store.data.users[id] = u;
      }
    });
    for (const k of missing) {
      const [period, start] = k.split('|') as ['week' | 'month', string];
      const startMs = dayStart(start);
      for (let i = 0; i < SAMPLE_NICKS.length; i++) {
        const u = store.data.users[`sample-${i}`];
        const amount = Math.round((period === 'week' ? 40 + r() * 700 : 300 + r() * 2600) / 5) * 5;
        const at = Math.min(now - 60_000, startMs + Math.floor(r() * Math.max(1, now - startMs)));
        // Each event lands on both boards of its time; book it for the period being seeded only.
        const b = (store.data.boards[`${period}|${start}|ALL`] ??= {});
        const bc = (store.data.boards[`${period}|${start}|${u.category}`] ??= {});
        const answered = Math.round(amount / 2.2);
        const row = { xp: amount, correct: Math.round(answered * (0.62 + r() * 0.33)), answered, reachedAt: at };
        b[u.id] = row;
        bc[u.id] = { ...row };
      }
      state.seeded.push(k);
    }
    save();
  }
  await seedSamples();

  /** Demo competitions: one running with sample participants, one finished with winners, one upcoming. */
  async function seedCompetitions() {
    if (state.seeded.includes('competitions')) return;
    const now = Date.now();
    const day = 86400_000;
    const c = { store, content: index, now, random: Math.random, newId: randomId, categoryChangeLimit: false } as EngineCtx;
    const samples = Object.values(store.data.users).filter((u) => u.email.endsWith(SAMPLE_EMAIL_SUFFIX));
    if (samples.length === 0) return;
    const live = await createCompetition(c, {
      title: 'Həftəlik yarış: Konstitusiya və dövlət qulluğu', description: 'Hər kəs öz kateqoriyasının proqramından eyni 20 sualı cavablandırır. İlk üç yerə sertifikat verilir.',
      category: null, startsAt: now - day, endsAt: now + 6 * day, questionCount: 20, timeLimitSec: 20 * 60,
    });
    let rnd = 11;
    const r = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (const u of samples.slice(0, 14)) {
      const points = 9 + Math.floor(r() * 9);
      await store.saveEntry({
        competitionId: live.id, userId: u.id, nickname: u.nickname, category: (u.category ?? 'BB') as Category, sessionId: randomId(),
        startedAt: now - Math.floor(r() * day), finishedAt: now - Math.floor(r() * day / 2), points, maxPoints: 20, pct: Math.round((points / 20) * 100),
        durationMs: Math.round((7 + r() * 12) * 60_000),
      });
    }
    const past = await createCompetition(c, {
      title: 'Oktyabr yarışı', description: 'Ayın sonunda keçirilən açıq yarış.', category: null,
      startsAt: now - 12 * day, endsAt: now - 5 * day, questionCount: 20, timeLimitSec: 20 * 60,
    });
    for (const u of samples.slice(4, 16)) {
      const points = 10 + Math.floor(r() * 10);
      await store.saveEntry({
        competitionId: past.id, userId: u.id, nickname: u.nickname, category: (u.category ?? 'BB') as Category, sessionId: randomId(),
        startedAt: now - 8 * day, finishedAt: now - 8 * day + 900_000, points, maxPoints: 20, pct: Math.round((points / 20) * 100),
        durationMs: Math.round((8 + r() * 10) * 60_000),
      });
    }
    await listCompetitions(c, samples[0].id); // settles the finished one: winners and certificates
    await createCompetition(c, {
      title: 'Noyabr çempionatı', description: 'Bütün mövzular üzrə 30 sual, 30 dəqiqə.', category: null,
      startsAt: now + 3 * day, endsAt: now + 4 * day, questionCount: 30, timeLimitSec: 30 * 60,
    });
    state.seeded.push('competitions');
    save();
  }
  await seedCompetitions();

  const meta: MetaDto = {
    categories: CATEGORIES, availableCategories: AVAILABLE_CATEGORIES, comingSoonCategories: COMING_SOON_CATEGORIES, subgroups: SUBGROUPS, formats: EXAM_FORMATS, plans: PLANS, contentVersion: base.version, signedIn: true,
    topics: base.topics.map((t) => ({ id: t.id, programNo: t.programNo, shortTitle: t.shortTitle, categories: t.categories, free: t.free })),
  };

  function requireStaff() {
    const u = store.data.users[currentId()];
    if (u.role === 'user') throw new ApiError('FORBIDDEN', 'Bu bölməyə giriş icazən yoxdur.', 403);
    return u;
  }

  function audit(action: string, entity: string, entityId: string) {
    const u = store.data.users[state.current ?? ''];
    state.audit.unshift({ id: String(Date.now()), actor: u?.nickname ?? null, action, entity, entityId, createdAt: Date.now() });
    state.audit = state.audit.slice(0, 100);
  }

  const allItems = () => base.items.map((i) => (state.overrides.items[i.id] ? { ...i, ...state.overrides.items[i.id] } as Item : i));

  const admin: AdminApi = {
    async competitions() {
      requireStaff();
      return adminCompetitions(ctx());
    },
    async createCompetition(input) {
      const me = requireStaff();
      if (me.role !== 'admin') throw new ApiError('FORBIDDEN', 'Bu əməliyyat yalnız admin üçündür.', 403);
      const created: Competition = await run((c) => createCompetition(c, input));
      audit('competition.create', 'competition', created.id);
      save();
      return created;
    },
    async finishCompetition(id) {
      requireStaff();
      const done: Competition = await run((c) => finishCompetitionNow(c, id));
      audit('competition.finish', 'competition', id);
      save();
      return done;
    },
    async certificate(code) {
      requireStaff();
      return run((c) => getCertificate(c, code));
    },
    async overview() {
      requireStaff();
      const users = Object.values(store.data.users).filter((u) => !u.email.endsWith(SAMPLE_EMAIL_SUFFIX));
      const items = allItems();
      const byStatus = new Map<string, number>();
      const flags = new Map<string, number>();
      for (const i of items) {
        byStatus.set(i.status, (byStatus.get(i.status) ?? 0) + 1);
        for (const f of i.flags) flags.set(f, (flags.get(f) ?? 0) + 1);
      }
      const day = Date.now() - 86400_000;
      const sessions = Object.values(store.data.sessions).filter((s) => s.createdAt > day);
      return {
        users: { users: users.length, premium: users.filter((u) => (u.premiumUntil ?? 0) > Date.now()).length, active_day: users.length, active_week: users.length, new_week: users.filter((u) => u.createdAt > Date.now() - 7 * 86400_000).length },
        items: [...byStatus].map(([status, n]) => ({ status, n })),
        flags: [...flags].map(([flag, n]) => ({ flag, n })).sort((a, b) => b.n - a.n),
        reports: { open: store.data.reports.filter((r) => r.status === 'open').length },
        sessionsDay: { sessions: sessions.length, completed: sessions.filter((s) => s.completedAt).length },
        content: { topics: base.topics.length, lessons: base.lessons.length, cards: base.cards.length, units: base.units.length, version: base.version },
      };
    },
    async topics() {
      requireStaff();
      const items = allItems();
      return base.topics.map((t) => {
        const ti = items.filter((i) => i.topicId === t.id);
        return { id: t.id, programNo: t.programNo, shortTitle: t.shortTitle, categories: t.categories, free: t.free, lessons: base.lessons.filter((l) => l.topicId === t.id).length, items: ti.length, published: ti.filter((i) => i.status === 'published').length, flagged: ti.filter((i) => i.flags.length > 0).length };
      });
    },
    async lessons(topicId) {
      requireStaff();
      const items = allItems();
      return base.lessons.filter((l) => l.topicId === topicId).map((l) => ({ id: l.id, title: l.title, order: l.order, refs: l.refs, categories: l.categories, items: items.filter((i) => i.lessonId === l.id).length, cards: base.cards.filter((c) => c.lessonId === l.id).length }));
    },
    async items(f: ItemFilter) {
      requireStaff();
      const q = f.q?.toLowerCase();
      const list = allItems().filter((i) => (!f.topicId || i.topicId === f.topicId) && (!f.lessonId || i.lessonId === f.lessonId) && (!f.status || i.status === f.status) && (!f.flag || i.flags.includes(f.flag)) && (!q || i.stem.toLowerCase().includes(q)));
      const page = f.page ?? 0;
      return { total: list.length, page, items: list.slice(page * 50, page * 50 + 50) };
    },
    async itemStats(id) {
      requireStaff();
      const logs = store.data.reviews.filter((r) => r.itemId === id);
      return { answered: logs.length, correct: logs.filter((l) => l.correct).length, avg_ms: logs.length ? Math.round(logs.reduce((a, l) => a + l.responseMs, 0) / logs.length) : 0 };
    },
    async updateItem(id, patch) {
      requireStaff();
      const cur = allItems().find((i) => i.id === id);
      if (!cur) throw new ApiError('NOT_FOUND', 'Sual tapılmadı.', 404);
      const next = { ...cur, ...patch } as Item;
      if (next.answer.some((a) => a >= next.options.length)) throw new ApiError('VALIDATION', 'Düzgün cavabın nömrəsi variantların sayına uyğun deyil.', 400);
      if (next.type === 'single' && next.answer.length !== 1) throw new ApiError('VALIDATION', 'Tək seçimli sualın bir düzgün cavabı olmalıdır.', 400);
      state.overrides.items[id] = { ...(state.overrides.items[id] ?? {}), ...patch };
      audit('item.update', 'item', id);
      index = build();
      save();
      return next;
    },
    async cards(lessonId) {
      requireStaff();
      return base.cards.filter((c) => c.lessonId === lessonId).map((c) => ({ ...c, ...(state.overrides.cards[c.id] ?? {}) } as Card));
    },
    async updateCard(id, patch) {
      requireStaff();
      state.overrides.cards[id] = { ...(state.overrides.cards[id] ?? {}), ...patch };
      audit('card.update', 'card', id);
      index = build();
      save();
    },
    async reports(status) {
      requireStaff();
      const items = allItems();
      return store.data.reports.filter((r) => r.status === status).map((r) => {
        const it = items.find((i) => i.id === r.itemId);
        return { id: String(r.id), itemId: r.itemId, reason: r.reason, body: r.body, status: r.status, resolution: r.resolution, createdAt: r.at, nickname: store.data.users[r.userId]?.nickname ?? '', stem: it?.stem ?? null, topicId: it?.topicId ?? null };
      }).reverse();
    },
    async resolveReport(id, status, resolution) {
      requireStaff();
      const r = store.data.reports.find((x) => String(x.id) === id && x.status === 'open');
      if (!r) throw new ApiError('NOT_FOUND', 'Şikayət tapılmadı və ya artıq baxılıb.', 404);
      r.status = status;
      r.resolution = resolution;
      if (status === 'confirmed' && store.data.users[r.userId]) {
        store.data.users[r.userId].xpTotal += 20;
        await recordConfirmedReport(ctx(), r.userId);
      }
      audit('report.' + status, 'report', id);
      save();
    },
    async users(q) {
      const me = requireStaff();
      if (me.role !== 'admin') throw new ApiError('FORBIDDEN', 'Bu bölməyə giriş icazən yoxdur.', 403);
      const s = q.toLowerCase();
      return Object.values(store.data.users)
        .filter((u) => !s || u.email.includes(s) || u.nickname.toLowerCase().includes(s))
        .map((u): AdminUser => ({ id: u.id, email: u.email, nickname: u.nickname, role: u.role, category: u.category as Category | null, subgroup: u.subgroup, premiumUntil: u.premiumUntil, emailVerified: u.emailVerified, leaderboardBanned: u.leaderboardBanned, xpTotal: u.xpTotal, createdAt: u.createdAt, lastSeenAt: null }))
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    async updateUser(id, patch) {
      requireStaff();
      const u = store.data.users[id];
      if (!u) throw new ApiError('NOT_FOUND', 'İstifadəçi tapılmadı.', 404);
      if (patch.premiumUntil !== undefined) await grantPremium(ctx(), id, patch.premiumUntil);
      const fresh2 = store.data.users[id];
      if (patch.role) fresh2.role = patch.role;
      if (patch.leaderboardBanned !== undefined) fresh2.leaderboardBanned = patch.leaderboardBanned;
      if (patch.emailVerified !== undefined) fresh2.emailVerified = patch.emailVerified;
      audit('user.update', 'user', id);
      save();
    },
    async importContent(bundle) {
      requireStaff();
      base = bundle;
      state.overrides = { items: {}, cards: {} };
      index = build();
      audit('content.import', 'content', bundle.version);
      save();
      return { topics: bundle.topics.length, lessons: bundle.lessons.length, items: bundle.items.length, keptEdited: 0 };
    },
    async mail() {
      requireStaff();
      return state.mail;
    },
    async audit() {
      requireStaff();
      return state.audit;
    },
  };

  const api: Api = {
    mode: 'demo',
    async me() {
      if (!state.current || !store.data.users[state.current]) return null;
      return run((c, id) => getMe(c, id));
    },
    async register(email, password, nickname) {
      const e = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new ApiError('VALIDATION', 'Email ünvanı düzgün deyil.', 400);
      if (password.length < 8) throw new ApiError('VALIDATION', 'Şifrə ən azı 8 simvol olmalıdır.', 400);
      if (!/^[\p{L}\p{N}_.-]{3,24}$/u.test(nickname)) throw new ApiError('VALIDATION', 'Ləqəb 3–24 simvol olmalıdır: hərf, rəqəm, «_», «.», «-».', 400);
      if (state.accounts[e]) throw new ApiError('CONFLICT', 'Bu email ilə hesab artıq var. Daxil ol və ya şifrəni bərpa et.', 409);
      if (Object.values(store.data.users).some((u) => u.nickname.toLowerCase() === nickname.toLowerCase())) throw new ApiError('CONFLICT', 'Bu ləqəb artıq istifadə olunur.', 409);
      const u = newUser(randomId(), e, nickname, Date.now());
      u.emailVerified = true;
      store.data.users[u.id] = u;
      state.accounts[e] = { userId: u.id, pass: demoHash(password) };
      state.current = u.id;
      save();
    },
    async login(email, password) {
      const a = state.accounts[email.trim().toLowerCase()];
      if (!a || a.pass !== demoHash(password)) throw new ApiError('UNAUTHORIZED', 'Email və ya şifrə yanlışdır.', 401);
      state.current = a.userId;
      save();
    },
    async logout() {
      state.current = null;
      save();
    },
    async forgot(email) {
      const e = email.trim().toLowerCase();
      const a = state.accounts[e];
      if (a) {
        const token = randomId();
        state.resetTokens[token] = a.userId;
        state.mail.unshift({ id: token, to: e, subject: 'QanunHub: şifrənin bərpası', body: `Demo: bərpa kodu ${token}`, createdAt: Date.now() });
        save();
      }
    },
    async reset(token, password) {
      const userId = state.resetTokens[token];
      if (!userId) throw new ApiError('VALIDATION', 'Bərpa linki etibarsızdır və ya vaxtı keçib.', 400);
      if (password.length < 8) throw new ApiError('VALIDATION', 'Şifrə ən azı 8 simvol olmalıdır.', 400);
      const email = Object.keys(state.accounts).find((k) => state.accounts[k].userId === userId)!;
      state.accounts[email].pass = demoHash(password);
      delete state.resetTokens[token];
      save();
    },
    async verify() {},
    async resendVerification() {},
    async meta() {
      return meta;
    },
    updateProfile: (p) => run((c, id) => updateProfile(c, id, p)),
    home: () => run((c, id) => getHome(c, id)),
    path: () => run((c, id) => getPath(c, id)),
    startSession: (kind: SessionKind, ref = {}) => run((c, id) => {
      switch (kind) {
        case 'lesson': return startLesson(c, id, ref.lessonId ?? '');
        case 'review': return startReview(c, id);
        case 'weak': return startWeak(c, id, ref.topicId ?? '');
        case 'section': return startSection(c, id, ref.sectionId ?? '');
        case 'competition': return startCompetition(c, id, ref.competitionId ?? '');
        case 'final': return startFinal(c, id, ref.topicId ?? '');
        default: return startMock(c, id);
      }
    }),
    answer: (sid, qid, a, ms) => run((c, id) => answer(c, id, sid, qid, a, ms)),
    complete: (sid) => run((c, id) => complete(c, id, sid)),
    report: (sid, qid, reason, body) => run((c, id) => reportItem(c, id, sid, qid, reason, body)),
    leaderboard: (period, scope) => run((c, id) => getLeaderboard(c, id, period, scope)),
    weak: () => run((c, id) => getWeakTopics(c, id)),
    competitions: () => run((c, id) => listCompetitions(c, id)),
    standings: (cid) => run((c, id) => getStandings(c, id, cid)),
    certificate: (code) => run((c) => getCertificate(c, code)),
    async checkout(planId) {
      const plan = PLANS.find((p) => p.id === planId);
      if (!plan) throw new ApiError('VALIDATION', 'Plan tapılmadı.', 400);
      await run((c, id) => {
        const u = store.data.users[id];
        const from = Math.max(Date.now(), u.premiumUntil ?? 0);
        return grantPremium(c, id, from + plan.months * 30 * 86400_000);
      });
    },
    admin,
    demo: {
      async setAdmin(on) {
        const u = store.data.users[currentId()];
        u.role = on ? 'admin' : 'user';
        save();
      },
      /** Signs in to a ready demo account with Premium, so every screen can be seen without registering. */
      async quickStart() {
        if (!state.accounts[DEMO_EMAIL]) await api.register(DEMO_EMAIL, DEMO_PASSWORD, 'demo.hesab');
        await api.login(DEMO_EMAIL, DEMO_PASSWORD);
        const u = store.data.users[currentId()];
        if (!u.premiumUntil || u.premiumUntil < Date.now()) await run((c, id) => grantPremium(c, id, Date.now() + 365 * 86400_000));
      },
      reset() {
        try {
          localStorage.removeItem(KEY);
        } catch {
          /* ignore */
        }
        state = fresh();
        store.data = state.memory;
      },
    },
  };
  return api;
}
