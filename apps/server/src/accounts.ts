// Learner accounts behind Supabase Auth. auth.users owns identity (email, password, confirmation);
// public.profiles holds the name and username the learner fills in; the users table keeps the learning state.
// On every request the users row is created if missing and its nickname and full name follow the profile.
import type { UserRecord } from '@qanunhub/core';
import { newUser } from '@qanunhub/core';
import type { Db } from './db';
import { rowToUser } from './pgStore';
import type { AuthClaims } from './supabaseAuth';

export interface Account {
  user: UserRecord;
  /** First name, last name and username are filled in; until then the learning API is closed. */
  profileComplete: boolean;
}

export interface AccountOptions {
  adminEmail: string;
  /** auth.users is reachable (a Supabase database), so email confirmation can be read from it. */
  authUsers: boolean;
}

const UNIQUE_VIOLATION = '23505';
const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === UNIQUE_VIOLATION;

export async function hasAuthUsers(sql: Db): Promise<boolean> {
  const [r] = await sql`select to_regprocedure('public.account_email_confirmed(uuid)') is not null as ok`;
  return !!r?.ok;
}

async function emailConfirmed(sql: Db, id: string, opts: AccountOptions): Promise<boolean> {
  // Without Supabase (plain local Postgres) a valid token is all there is.
  if (!opts.authUsers) return true;
  // auth.users is not readable by the API role; supabase/profiles.sql exposes just this flag to it.
  const [r] = await sql`select public.account_email_confirmed(${id}::uuid) as ok`;
  return !!r?.ok;
}

const select = (sql: Db, id: string) => sql`
  select u.*, p.first_name as profile_first_name, p.last_name as profile_last_name, p.username as profile_username
  from users u left join public.profiles p on p.id = u.id
  where u.id = ${id}`;

export async function resolveAccount(sql: Db, claims: AuthClaims, now: number, opts: AccountOptions): Promise<Account> {
  let [r] = await select(sql, claims.sub);
  if (!r) {
    await createUserRow(sql, claims, now, opts);
    [r] = await select(sql, claims.sub);
  }
  const updates: Record<string, unknown> = {};
  if (!r.email_verified && (await emailConfirmed(sql, claims.sub, opts))) updates.email_verified = true;
  const username: string | null = r.profile_username ?? null;
  const fullName = [r.profile_first_name, r.profile_last_name].filter(Boolean).join(' ').trim() || null;
  if (username && (username !== r.nickname || fullName !== r.full_name)) {
    updates.nickname = username;
    updates.full_name = fullName;
  }
  if (Object.keys(updates).length) {
    try {
      await sql`update users set ${sql(updates)} where id = ${claims.sub}`;
      [r] = await select(sql, claims.sub);
    } catch (e) {
      // A nickname left over from before profiles existed: keep the old one rather than failing the request.
      if (!isUniqueViolation(e)) throw e;
    }
  }
  return {
    user: rowToUser(r),
    profileComplete: !!(r.profile_first_name && r.profile_last_name && r.profile_username),
  };
}

async function createUserRow(sql: Db, claims: AuthClaims, now: number, opts: AccountOptions) {
  const u = newUser(claims.sub, claims.email, `u_${claims.sub.replace(/-/g, '').slice(0, 12)}`, now);
  u.role = opts.adminEmail && claims.email === opts.adminEmail.trim().toLowerCase() ? 'admin' : 'user';
  u.emailVerified = await emailConfirmed(sql, claims.sub, opts);
  const insert = (email: string) => sql`
    insert into users (id, email, nickname, role, daily_goal, email_verified, hearts, streak, today, game, created_at)
    values (${u.id}, ${email}, ${u.nickname}, ${u.role}, ${u.dailyGoal}, ${u.emailVerified},
      ${sql.json(u.hearts as any)}, ${sql.json(u.streak as any)}, ${sql.json(u.today as any)}, ${sql.json(u.game as any)}, ${new Date(now)})
    on conflict (id) do nothing`;
  try {
    await insert(claims.email || `${u.id}@users.invalid`);
  } catch (e) {
    // The email belongs to an older local account: the Supabase user still gets a learning profile.
    if (!isUniqueViolation(e)) throw e;
    await insert(`${u.id}@users.invalid`);
  }
}
