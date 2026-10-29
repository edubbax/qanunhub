// Api over HTTP to the QanunHub server (same origin, session cookie).
import type { ContentBundle, PathDto, SessionKind } from '@qanunhub/core';
import type { Api, ItemFilter } from './types';
import { ApiError } from './types';

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'qanunhub' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('NETWORK', 'İnternet bağlantısı yoxdur. Bağlantını yoxla və yenidən cəhd et.', 0);
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = json?.error ?? {};
    throw new ApiError(e.code ?? 'HTTP', e.message ?? `Xəta (${res.status})`, res.status, e.data ?? null);
  }
  return json as T;
}

const qs = (o: Record<string, unknown>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== null).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

export function httpApi(): Api {
  return {
    mode: 'server',
    async me() {
      try {
        return await call('GET', '/api/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    register: (email, password, nickname) => call('POST', '/api/auth/register', { email, password, nickname, accept: true }),
    login: (email, password) => call('POST', '/api/auth/login', { email, password }),
    logout: () => call('POST', '/api/auth/logout'),
    forgot: (email) => call('POST', '/api/auth/forgot', { email }),
    reset: (token, password) => call('POST', '/api/auth/reset', { token, password }),
    verify: (token) => call('POST', '/api/auth/verify', { token }),
    resendVerification: () => call('POST', '/api/auth/resend-verification'),
    meta: () => call('GET', '/api/meta'),
    updateProfile: (p) => call('PATCH', '/api/me', p),
    home: () => call('GET', '/api/home'),
    path: () => call<PathDto>('GET', '/api/path'),
    startSession: (kind: SessionKind, ref = {}) => call('POST', '/api/sessions', { kind, ...ref }),
    answer: (id, qid, answer, ms) => call('POST', `/api/sessions/${id}/answer`, { qid, answer, ms: Math.round(ms) }),
    complete: (id) => call('POST', `/api/sessions/${id}/complete`),
    report: (id, qid, reason, body) => call('POST', `/api/sessions/${id}/report`, { qid, reason, body }),
    leaderboard: (period, scope) => call('GET', `/api/leaderboard?${qs({ period, scope })}`),
    weak: () => call('GET', '/api/weak'),
    checkout: (plan) => call('POST', '/api/billing/checkout', { plan }),
    admin: {
      overview: () => call('GET', '/api/admin/overview'),
      topics: () => call('GET', '/api/admin/topics'),
      lessons: (topicId) => call('GET', `/api/admin/lessons?${qs({ topicId })}`),
      items: (f: ItemFilter) => call('GET', `/api/admin/items?${qs(f as Record<string, unknown>)}`),
      itemStats: (id) => call('GET', `/api/admin/items/${encodeURIComponent(id)}/stats`),
      updateItem: (id, patch) => call('PATCH', `/api/admin/items/${encodeURIComponent(id)}`, patch),
      cards: (lessonId) => call('GET', `/api/admin/cards?${qs({ lessonId })}`),
      updateCard: (id, patch) => call('PATCH', `/api/admin/cards/${encodeURIComponent(id)}`, patch),
      reports: (status) => call('GET', `/api/admin/reports?${qs({ status })}`),
      resolveReport: (id, status, resolution) => call('PATCH', `/api/admin/reports/${id}`, { status, resolution }),
      users: (q) => call('GET', `/api/admin/users?${qs({ q })}`),
      updateUser: (id, patch) => call('PATCH', `/api/admin/users/${id}`, patch),
      importContent: (bundle: ContentBundle) => call('POST', '/api/admin/import', bundle),
      mail: () => call('GET', '/api/admin/mail'),
      audit: () => call('GET', '/api/admin/audit'),
    },
  };
}
