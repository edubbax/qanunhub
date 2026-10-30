// Supabase Auth and the profiles table through @supabase/supabase-js. The session is kept in localStorage and
// refreshed automatically; onAuthStateChange drives the whole app (see AuthGate in app.tsx).
import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthBackend, AuthEvent, AuthUser, Profile, ProfileInput } from './types';
import { AuthError, normalizeUsername } from './types';

export interface SupabaseSettings {
  supabaseUrl: string;
  supabaseKey: string;
}

/** Settings come from the server (/api/config) so one build serves every environment; VITE_ variables are the fallback. */
export async function loadSupabaseSettings(): Promise<SupabaseSettings> {
  try {
    const res = await fetch('/api/config', { headers: { accept: 'application/json' } });
    if (res.ok) {
      const s = (await res.json()) as SupabaseSettings;
      if (s.supabaseUrl && s.supabaseKey) return s;
    }
  } catch {
    // Offline or a static deployment without the API: try the build-time settings.
  }
  const env = import.meta.env as Record<string, string | undefined>;
  const s = { supabaseUrl: env.VITE_SUPABASE_URL ?? '', supabaseKey: env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '' };
  if (!s.supabaseUrl || !s.supabaseKey) throw new Error('Supabase sazlanmayıb: serverdə SUPABASE_URL və SUPABASE_PUBLISHABLE_KEY təyin edilməlidir.');
  return s;
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'E-poçt və ya şifrə yanlışdır.',
  email_not_confirmed: 'E-poçt ünvanın hələ təsdiqlənməyib. Poçt qutundakı linkə keç.',
  user_already_exists: 'Bu e-poçt ilə hesab artıq var. Daxil ol və ya şifrəni bərpa et.',
  email_exists: 'Bu e-poçt ilə hesab artıq var. Daxil ol və ya şifrəni bərpa et.',
  weak_password: 'Şifrə çox sadədir. Hərf və rəqəmlərdən ibarət daha uzun şifrə seç.',
  same_password: 'Yeni şifrə köhnəsindən fərqli olmalıdır.',
  over_email_send_rate_limit: 'Çox sayda məktub göndərildi. Bir neçə dəqiqə sonra yenidən cəhd et.',
  over_request_rate_limit: 'Çox sayda cəhd edildi. Bir az sonra yenidən cəhd et.',
  signup_disabled: 'Qeydiyyat hazırda bağlıdır.',
  email_address_invalid: 'E-poçt ünvanı qəbul edilmədi.',
  validation_failed: 'Məlumatları yoxla.',
  session_not_found: 'Sessiyanın vaxtı bitib. Yenidən daxil ol.',
};

function fail(error: { code?: string; message?: string; status?: number } | null): never {
  const code = error?.code ?? '';
  if (MESSAGES[code]) throw new AuthError(MESSAGES[code]);
  if (error?.status === 429) throw new AuthError(MESSAGES.over_request_rate_limit);
  if (/fetch|network/i.test(error?.message ?? '')) throw new AuthError('İnternet bağlantısı yoxdur. Bağlantını yoxla və yenidən cəhd et.');
  throw new AuthError('Gözlənilməz xəta baş verdi. Bir az sonra yenidən cəhd et.');
}

const toUser = (s: Session | null): AuthUser | null => (s?.user ? { id: s.user.id, email: s.user.email ?? '' } : null);

function toEvent(e: AuthChangeEvent): AuthEvent | null {
  switch (e) {
    case 'INITIAL_SESSION': case 'SIGNED_IN': case 'SIGNED_OUT': case 'PASSWORD_RECOVERY': case 'TOKEN_REFRESHED': case 'USER_UPDATED':
      return e;
    default:
      return null;
  }
}

interface ProfileRow { first_name: string | null; last_name: string | null; username: string | null }
const toProfile = (r: ProfileRow | null): Profile => ({ firstName: r?.first_name ?? null, lastName: r?.last_name ?? null, username: r?.username ?? null });

export function supabaseAuth(settings: SupabaseSettings): AuthBackend {
  const client: SupabaseClient = createClient(settings.supabaseUrl, settings.supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'qanunhub-auth',
    },
  });
  const redirect = (path = '/') => `${window.location.origin}${path}`;

  async function currentUserId(): Promise<string> {
    const { data } = await client.auth.getSession();
    if (!data.session) throw new AuthError('Sessiyanın vaxtı bitib. Yenidən daxil ol.');
    return data.session.user.id;
  }

  return {
    kind: 'supabase',

    onChange(listener) {
      // supabase-js calls back with INITIAL_SESSION first; the callback must not await other auth calls.
      const { data } = client.auth.onAuthStateChange((event, session) => {
        const e = toEvent(event);
        if (e) setTimeout(() => listener(e, toUser(session)), 0);
      });
      return () => data.subscription.unsubscribe();
    },

    async accessToken() {
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    },

    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) fail(error);
    },

    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email: email.trim().toLowerCase(), password, options: { emailRedirectTo: redirect('/') } });
      if (error) fail(error);
      return { confirmEmail: !data.session };
    },

    async signOut() {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error && error.code !== 'session_not_found') fail(error);
    },

    async resendConfirmation(email) {
      const { error } = await client.auth.resend({ type: 'signup', email: email.trim().toLowerCase(), options: { emailRedirectTo: redirect('/') } });
      if (error) fail(error);
    },

    async sendPasswordReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: redirect('/sifre-yenile') });
      if (error) fail(error);
    },

    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) fail(error);
    },

    async getProfile() {
      const id = await currentUserId();
      const { data, error } = await client.from('profiles').select('first_name, last_name, username').eq('id', id).maybeSingle<ProfileRow>();
      if (error) fail(error);
      return toProfile(data);
    },

    async saveProfile(input: ProfileInput) {
      const id = await currentUserId();
      const row = { id, first_name: input.firstName.trim().replace(/\s+/g, ' '), last_name: input.lastName.trim().replace(/\s+/g, ' '), username: normalizeUsername(input.username) };
      // upsert also covers a row the sign-up trigger did not create (accounts older than the trigger).
      const { data, error } = await client.from('profiles').upsert(row, { onConflict: 'id' }).select('first_name, last_name, username').single<ProfileRow>();
      if (error) {
        if (error.code === '23505') throw new AuthError('Bu istifadəçi adı artıq tutulub. Başqasını seç.');
        if (error.code === '23514') throw new AuthError('Məlumatları yoxla: ad və soyad 2–40 hərf, istifadəçi adı 3–24 simvol.');
        fail(error);
      }
      return toProfile(data);
    },

    async usernameAvailable(username) {
      const { data, error } = await client.rpc('username_available', { candidate: normalizeUsername(username) });
      if (error) fail(error);
      return data === true;
    },
  };
}
