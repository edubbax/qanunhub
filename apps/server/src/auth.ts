// Email + password accounts, opaque session cookies, verification and reset tokens.
import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { UserRecord } from '@qanunhub/core';
import { AppError, newUser } from '@qanunhub/core';
import type { Db } from './db';
import { rowToUser } from './pgStore';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const N = 16384;
const R = 8;
const P = 1;

export const SESSION_COOKIE = 'qh_session';
export const SESSION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// A short list of passwords that must never be accepted; the length rule covers the rest.
const WEAK = new Set(['12345678', '123456789', '1234567890', 'password', 'qwertyui', 'qwerty123', '11111111', 'abcd1234', 'parol123', 'azerbaycan']);

export function validateCredentials(email: string, password: string) {
  if (!EMAIL_RE.test(email) || email.length > 200) throw new AppError('VALIDATION', 'Email ünvanı düzgün deyil.');
  if (typeof password !== 'string' || password.length < 8) throw new AppError('VALIDATION', 'Şifrə ən azı 8 simvol olmalıdır.');
  if (password.length > 200) throw new AppError('VALIDATION', 'Şifrə çox uzundur.');
  if (WEAK.has(password.toLowerCase())) throw new AppError('VALIDATION', 'Bu şifrə çox sadədir. Başqa şifrə seçin.');
}

export async function createUser(sql: Db, email: string, password: string, nickname: string, now: number, opts: { verified?: boolean; role?: UserRecord['role'] } = {}): Promise<UserRecord> {
  const e = email.trim().toLowerCase();
  validateCredentials(e, password);
  if (!/^[\p{L}\p{N}_.-]{3,24}$/u.test(nickname)) throw new AppError('VALIDATION', 'Ləqəb 3–24 simvol olmalıdır: hərf, rəqəm, «_», «.», «-».');
  const [exists] = await sql`select 1 from users where email = ${e}`;
  if (exists) throw new AppError('CONFLICT', 'Bu email ilə hesab artıq var. Daxil olun və ya şifrəni bərpa edin.');
  const [nickTaken] = await sql`select 1 from users where lower(nickname) = lower(${nickname})`;
  if (nickTaken) throw new AppError('CONFLICT', 'Bu ləqəb artıq istifadə olunur.');
  const u = newUser(randomUUID(), e, nickname, now);
  u.emailVerified = !!opts.verified;
  u.role = opts.role ?? 'user';
  await sql`
    insert into users (id, email, password_hash, nickname, role, daily_goal, email_verified, hearts, streak, today, game, created_at)
    values (${u.id}, ${u.email}, ${await hashPassword(password)}, ${u.nickname}, ${u.role}, ${u.dailyGoal}, ${u.emailVerified},
      ${sql.json(u.hearts as any)}, ${sql.json(u.streak as any)}, ${sql.json(u.today as any)}, ${sql.json(u.game as any)}, ${new Date(now)})`;
  return u;
}

export async function login(sql: Db, email: string, password: string): Promise<UserRecord> {
  const [r] = await sql`select * from users where email = ${email.trim().toLowerCase()}`;
  // Same message for unknown email and wrong password, so accounts cannot be enumerated.
  if (!r || !(await verifyPassword(password, r.password_hash))) throw new AppError('UNAUTHORIZED', 'Email və ya şifrə yanlışdır.');
  return rowToUser(r);
}

export async function createSession(sql: Db, userId: string, meta: { ua?: string; ip?: string }): Promise<string> {
  const token = newToken();
  await sql`
    insert into auth_sessions (token_hash, user_id, expires_at, user_agent, ip)
    values (${sha256(token)}, ${userId}, ${new Date(Date.now() + SESSION_DAYS * 86400_000)}, ${meta.ua?.slice(0, 300) ?? null}, ${meta.ip ?? null})`;
  return token;
}

export async function sessionUser(sql: Db, token: string | undefined): Promise<UserRecord | null> {
  if (!token || token.length > 100) return null;
  const [r] = await sql`
    select u.* from auth_sessions s join users u on u.id = s.user_id
    where s.token_hash = ${sha256(token)} and s.expires_at > now()`;
  return r ? rowToUser(r) : null;
}

export async function destroySession(sql: Db, token: string | undefined) {
  if (token) await sql`delete from auth_sessions where token_hash = ${sha256(token)}`;
}

export async function issueToken(sql: Db, userId: string, kind: 'verify' | 'reset'): Promise<string> {
  const token = newToken();
  const ttl = kind === 'verify' ? 48 * 3600_000 : 3600_000;
  await sql`insert into auth_tokens (token_hash, user_id, kind, expires_at) values (${sha256(token)}, ${userId}, ${kind}, ${new Date(Date.now() + ttl)})`;
  return token;
}

export async function consumeToken(sql: Db, token: string, kind: 'verify' | 'reset'): Promise<string> {
  const [r] = await sql`
    update auth_tokens set used_at = now()
    where token_hash = ${sha256(String(token))} and kind = ${kind} and used_at is null and expires_at > now()
    returning user_id`;
  if (!r) throw new AppError('VALIDATION', kind === 'verify' ? 'Təsdiq linki etibarsızdır və ya vaxtı keçib.' : 'Bərpa linki etibarsızdır və ya vaxtı keçib.');
  return r.user_id;
}

export async function setPassword(sql: Db, userId: string, password: string) {
  if (typeof password !== 'string' || password.length < 8) throw new AppError('VALIDATION', 'Şifrə ən azı 8 simvol olmalıdır.');
  if (WEAK.has(password.toLowerCase())) throw new AppError('VALIDATION', 'Bu şifrə çox sadədir. Başqa şifrə seçin.');
  await sql`update users set password_hash = ${await hashPassword(password)} where id = ${userId}`;
  await sql`delete from auth_sessions where user_id = ${userId}`;
}
