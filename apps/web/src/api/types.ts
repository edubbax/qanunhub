// The contract between the UI and its backend: the HTTP server in production, the in-browser engine in the demo.
import type {
  AnswerDto, Card, Category, CompleteDto, ContentBundle, EXAM_FORMATS, HomeDto, Item, LeaderboardDto, MeDto, PathDto,
  Period, ProfilePatch, Scope, SessionDto, SessionKind, Subgroup, WeakTopicDto,
} from '@qanunhub/core';

export interface Plan {
  id: string;
  title: string;
  priceAzn: number;
  months: number;
  recurring: boolean;
  note: string;
}

export interface MetaDto {
  categories: Category[];
  subgroups: Subgroup[];
  formats: typeof EXAM_FORMATS;
  plans: Plan[];
  contentVersion: string;
  topics: { id: string; programNo: string; shortTitle: string; categories: Category[]; free: boolean }[];
}

export interface AdminOverview {
  users: { users: number; premium: number; active_day: number; active_week: number; new_week: number };
  items: { status: string; n: number }[];
  flags: { flag: string; n: number }[];
  reports: { open: number };
  sessionsDay: { sessions: number; completed: number };
  content: { topics: number; lessons: number; cards: number; units: number; version: string };
}

export interface AdminTopic { id: string; programNo: string; shortTitle: string; categories: Category[]; free: boolean; lessons: number; items: number; published: number; flagged: number }
export interface AdminLesson { id: string; title: string; order: number; refs: string[]; categories: Category[]; items: number; cards: number }
export interface AdminUser {
  id: string; email: string; nickname: string; role: 'user' | 'editor' | 'admin'; category: Category | null; subgroup: string | null;
  premiumUntil: number | null; emailVerified: boolean; leaderboardBanned: boolean; xpTotal: number; createdAt: number; lastSeenAt: number | null;
}
export interface AdminReport { id: string; itemId: string; reason: string; body: string; status: string; resolution: string; createdAt: number; nickname: string; stem: string | null; topicId: string | null }
export interface AdminMail { id: string; to: string; subject: string; body: string; createdAt: number }
export interface AdminAudit { id: string; actor: string | null; action: string; entity: string; entityId: string; createdAt: number }
export interface ItemFilter { topicId?: string; lessonId?: string; status?: string; flag?: string; q?: string; page?: number }
export type ItemPatch = Partial<Pick<Item, 'stem' | 'statements' | 'options' | 'answer' | 'explanation' | 'ref' | 'status' | 'flags'>>;

export interface AdminApi {
  overview(): Promise<AdminOverview>;
  topics(): Promise<AdminTopic[]>;
  lessons(topicId: string): Promise<AdminLesson[]>;
  items(f: ItemFilter): Promise<{ total: number; page: number; items: Item[] }>;
  itemStats(id: string): Promise<{ answered: number; correct: number; avg_ms: number }>;
  updateItem(id: string, patch: ItemPatch): Promise<Item>;
  cards(lessonId: string): Promise<Card[]>;
  updateCard(id: string, patch: { title?: string | null; body?: string }): Promise<void>;
  reports(status: string): Promise<AdminReport[]>;
  resolveReport(id: string, status: 'confirmed' | 'rejected', resolution: string): Promise<void>;
  users(q: string): Promise<AdminUser[]>;
  updateUser(id: string, patch: { premiumUntil?: number | null; role?: AdminUser['role']; leaderboardBanned?: boolean; emailVerified?: boolean }): Promise<void>;
  importContent(bundle: ContentBundle): Promise<{ topics: number; lessons: number; items: number; keptEdited: number }>;
  mail(): Promise<AdminMail[]>;
  audit(): Promise<AdminAudit[]>;
}

export interface Api {
  mode: 'server' | 'demo';
  me(): Promise<MeDto | null>;
  register(email: string, password: string, nickname: string): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  forgot(email: string): Promise<void>;
  reset(token: string, password: string): Promise<void>;
  verify(token: string): Promise<void>;
  resendVerification(): Promise<void>;
  meta(): Promise<MetaDto>;
  updateProfile(p: ProfilePatch): Promise<MeDto>;
  home(): Promise<HomeDto>;
  path(): Promise<PathDto>;
  startSession(kind: SessionKind, ref?: { lessonId?: string; topicId?: string }): Promise<SessionDto>;
  answer(sessionId: string, qid: number, answer: number[], ms: number): Promise<AnswerDto>;
  complete(sessionId: string): Promise<CompleteDto>;
  report(sessionId: string, qid: number, reason: string, body: string): Promise<void>;
  leaderboard(period: Period, scope: Scope): Promise<LeaderboardDto>;
  weak(): Promise<WeakTopicDto[]>;
  checkout(planId: string): Promise<void>;
  admin: AdminApi;
  /** Demo-only helpers; undefined on the server build. */
  demo?: { setAdmin(on: boolean): Promise<void>; reset(): void };
}

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number, readonly data: Record<string, unknown> | null = null) {
    super(message);
  }
}
