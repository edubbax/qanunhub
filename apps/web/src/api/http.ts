// Api over HTTP to the QanunHub server (same origin). Every call carries the Supabase access token.
import type { ContentBundle, PathDto, SessionKind } from '@qanunhub/core';
import type { AuthBackend } from '../auth/types';
import type { Api, ItemFilter } from './types';
import { ApiError } from './types';

async function request<T>(auth: AuthBackend, method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  const token = await auth.accessToken();
  try {
    res = await fetch(path, {
      method,
      credentials: 'omit',
      headers: {
        'content-type': 'application/json',
        'x-requested-with': 'qanunhub',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
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

export function httpApi(auth: AuthBackend): Api {
  const call = <T,>(method: string, path: string, body?: unknown) => request<T>(auth, method, path, body);
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
    competitions: () => call('GET', '/api/competitions'),
    standings: (id) => call('GET', `/api/competitions/${encodeURIComponent(id)}`),
    certificate: (code) => call('GET', `/api/certificates/${encodeURIComponent(code)}`),
    checkout: (plan) => call('POST', '/api/billing/checkout', { plan }),
    admin: {
      competitions: () => call('GET', '/api/admin/competitions'),
      createCompetition: (input) => call('POST', '/api/admin/competitions', input),
      finishCompetition: (id) => call('POST', `/api/admin/competitions/${encodeURIComponent(id)}/finish`),
      certificate: (code) => call('GET', `/api/admin/certificates/${encodeURIComponent(code)}`),
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
      audit: () => call('GET', '/api/admin/audit'),
    },
  };
}
