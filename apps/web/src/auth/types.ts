// Identity and the learner's profile. Production uses Supabase Auth and the public.profiles table
// (see supabase/profiles.sql); the demo build keeps the same contract in the browser.

export interface AuthUser {
  id: string;
  email: string;
}

export interface Profile {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}

export interface ProfileInput {
  firstName: string;
  lastName: string;
  username: string;
}

/** SIGNED_OUT also covers an expired session that could not be refreshed. */
export type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY' | 'TOKEN_REFRESHED' | 'USER_UPDATED';

export interface AuthBackend {
  kind: 'supabase' | 'demo';
  /**
   * Subscribes to session changes. The listener is called once right away with the current session
   * (INITIAL_SESSION), then on every change. Returns the unsubscribe function.
   */
  onChange(listener: (event: AuthEvent, user: AuthUser | null) => void): () => void;
  /** A fresh access token for the API, refreshed when close to expiry; null when signed out. */
  accessToken(): Promise<string | null>;
  signIn(email: string, password: string): Promise<void>;
  /** confirmEmail: the account waits for the link in the confirmation email before the first sign-in. */
  signUp(email: string, password: string): Promise<{ confirmEmail: boolean }>;
  signOut(): Promise<void>;
  resendConfirmation(email: string): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  getProfile(): Promise<Profile>;
  saveProfile(input: ProfileInput): Promise<Profile>;
  usernameAvailable(username: string): Promise<boolean>;
}

export class AuthError extends Error {}

export const isProfileComplete = (p: Profile | null): p is Profile & ProfileInput => !!(p?.firstName && p.lastName && p.username);

// The same rules as the checks in supabase/profiles.sql, with messages for the form.
export const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;
export const NAME_RE = /^[\p{L}][\p{L}\p{M}' -]{1,39}$/u;

export function normalizeUsername(v: string): string {
  return v.trim().toLowerCase();
}

export function validateProfile(p: ProfileInput): Partial<Record<keyof ProfileInput, string>> {
  const errors: Partial<Record<keyof ProfileInput, string>> = {};
  if (!NAME_RE.test(p.firstName.trim())) errors.firstName = 'Adını düzgün yaz: 2–40 hərf.';
  if (!NAME_RE.test(p.lastName.trim())) errors.lastName = 'Soyadını düzgün yaz: 2–40 hərf.';
  if (!USERNAME_RE.test(normalizeUsername(p.username))) errors.username = '3–24 simvol: kiçik latın hərfləri, rəqəmlər, «_» və «.».';
  return errors;
}

export function validateCredentials(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return 'E-poçt ünvanını düzgün yaz.';
  if (password.length < 8) return 'Şifrə ən azı 8 simvol olmalıdır.';
  return null;
}
