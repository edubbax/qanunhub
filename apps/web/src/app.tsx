// App shell. The user flow follows Supabase Auth (onAuthStateChange):
//   signed out            -> AuthScreen (e-mail and password: sign in, sign up, forgotten password)
//   password-reset link   -> NewPassword
//   profile not complete  -> CompleteProfile (first name, last name, unique username); the app stays closed
//   no category chosen    -> Onboarding (category, subgroup, exam date)
//   otherwise             -> the learning app (Home, Path, competitions, ...)
// Routing uses URL paths on the server build and stays in memory in the demo.
import type { MeDto, SessionKind } from '@qanunhub/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Api, MetaDto } from './api/types';
import { ApiError } from './api/types';
import type { AuthBackend, AuthUser, Profile } from './auth/types';
import { isProfileComplete } from './auth/types';
import { ErrorBox, Splash, ToastHost } from './ui/components';
import { IconBolt, IconFlame, IconHome, IconMedal, IconPath, IconTrophy, IconUser } from './ui/icons';
import { LifeStars } from './ui/insignia';
import logoUrl from './assets/logo.png';
import { Competitions, CompetitionScreen, CertificateCheck } from './screens/Competitions';
import { AuthScreen, NewPassword, type AuthMode } from './screens/Auth';
import { CompleteProfile } from './screens/CompleteProfile';
import { Onboarding } from './screens/Onboarding';
import { Home } from './screens/Home';
import { PathScreen } from './screens/Path';
import { SessionScreen } from './screens/Session';
import { Leaderboard } from './screens/Leaderboard';
import { Weak } from './screens/Weak';
import { Profile as ProfileScreen } from './screens/Profile';
import { Premium } from './screens/Premium';
import { Admin } from './screens/Admin';

export type Route =
  | { name: 'login' } | { name: 'register' } | { name: 'forgot' }
  | { name: 'onboarding' } | { name: 'home' } | { name: 'path'; topicId?: string }
  | { name: 'session'; kind: SessionKind; lessonId?: string; topicId?: string; sectionId?: string; competitionId?: string; back?: Route }
  | { name: 'leaderboard' } | { name: 'weak' } | { name: 'profile' } | { name: 'premium' } | { name: 'admin' }
  | { name: 'competitions' } | { name: 'competition'; id: string } | { name: 'certificate'; code?: string };

const PATHS: Record<string, string> = {
  login: '/giris', register: '/qeydiyyat', forgot: '/sifre-unutdum',
  onboarding: '/baslangic', home: '/bu-gun', path: '/yol', leaderboard: '/reytinq', weak: '/zeif', profile: '/profil',
  premium: '/premium', admin: '/admin', competitions: '/yarislar', certificate: '/sertifikat',
};
const RECOVERY_PATH = '/sifre-yenile';

function routeFromUrl(): Route {
  const p = window.location.pathname.replace(/\/+$/, '') || '/';
  const q = new URLSearchParams(window.location.search);
  const name = Object.keys(PATHS).find((k) => PATHS[k] === p);
  if (name === 'path') return { name: 'path', topicId: q.get('movzu') ?? undefined };
  if (name === 'competitions' && q.get('id')) return { name: 'competition', id: q.get('id')! };
  if (name === 'certificate') return { name: 'certificate', code: q.get('kod') ?? undefined };
  return name ? ({ name } as Route) : { name: 'home' };
}

function urlFor(r: Route): string | null {
  if (r.name === 'session') return null;
  if (r.name === 'competition') return `${PATHS.competitions}?id=${encodeURIComponent(r.id)}`;
  if (r.name === 'certificate' && r.code) return `${PATHS.certificate}?kod=${encodeURIComponent(r.code)}`;
  if (r.name === 'path' && r.topicId) return `${PATHS.path}?movzu=${encodeURIComponent(r.topicId)}`;
  return PATHS[r.name] ?? '/';
}

interface Ctx {
  api: Api;
  auth: AuthBackend;
  user: AuthUser | null;
  profile: Profile | null;
  setProfile: (p: Profile) => void;
  me: MeDto | null;
  meta: MetaDto;
  route: Route;
  nav: (r: Route, replace?: boolean) => void;
  refreshMe: () => Promise<MeDto | null>;
  setMe: (m: MeDto | null) => void;
  signOut: () => Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);
export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppCtx missing');
  return c;
}

const AUTH_ROUTES = new Set(['login', 'register', 'forgot']);
const TABS = new Set(['home', 'path', 'leaderboard', 'profile', 'weak', 'premium', 'competitions', 'competition']);

/** Where the session stands; 'loading' until the first onAuthStateChange event. */
type Session = { status: 'loading' } | { status: 'out' } | { status: 'in'; user: AuthUser };
/** The learner's data after sign-in, loaded in this order: profile, then the API's me + meta. */
type Account =
  | { step: 'idle' }
  | { step: 'loading' }
  | { step: 'profile'; profile: Profile }
  | { step: 'ready'; profile: Profile; me: MeDto }
  | { step: 'error'; error: unknown };

export function App({ api, auth }: { api: Api; auth: AuthBackend }) {
  const useHistory = api.mode === 'server';
  const [route, setRoute] = useState<Route>(() => (useHistory ? routeFromUrl() : { name: 'home' }));
  const [session, setSession] = useState<Session>({ status: 'loading' });
  const [recovery, setRecovery] = useState(() => useHistory && window.location.pathname === RECOVERY_PATH);
  const [account, setAccount] = useState<Account>({ step: 'idle' });
  const [meta, setMeta] = useState<MetaDto | null>(null);
  const [metaError, setMetaError] = useState<unknown>(null);
  const userId = session.status === 'in' ? session.user.id : null;
  const loadSeq = useRef(0);

  const nav = useCallback((r: Route, replace = false) => {
    setRoute(r);
    if (useHistory) {
      const url = urlFor(r);
      if (url) (replace ? history.replaceState : history.pushState).call(history, null, '', url);
    }
    window.scrollTo(0, 0);
  }, [useHistory]);

  useEffect(() => {
    if (!useHistory) return;
    const f = () => setRoute(routeFromUrl());
    window.addEventListener('popstate', f);
    return () => window.removeEventListener('popstate', f);
  }, [useHistory]);

  // The single source of truth for "who is signed in": Supabase's auth state, persisted across reloads.
  useEffect(() => auth.onChange((event, user) => {
    if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    if (!user) {
      setSession({ status: 'out' });
      setAccount({ step: 'idle' });
      return;
    }
    // Token refreshes keep the same user: nothing to reload.
    setSession((prev) => (prev.status === 'in' && prev.user.id === user.id ? prev : { status: 'in', user }));
  }), [auth]);

  const loadMeta = useCallback(async () => {
    setMetaError(null);
    try {
      setMeta(await api.meta());
    } catch (e) {
      setMetaError(e);
    }
  }, [api]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  /** Profile first (Supabase), then the learner record (API). Returns me when the app can open. */
  const loadAccount = useCallback(async () => {
    const seq = ++loadSeq.current;
    setAccount({ step: 'loading' });
    try {
      const profile = await auth.getProfile();
      if (seq !== loadSeq.current) return null;
      if (!isProfileComplete(profile)) {
        setAccount({ step: 'profile', profile });
        return null;
      }
      const [me, mt] = await Promise.all([api.me(), api.meta()]);
      if (seq !== loadSeq.current) return null;
      setMeta(mt);
      if (!me) {
        // The API refused the token (expired beyond refresh, or a different project): start over.
        await auth.signOut();
        return null;
      }
      setAccount({ step: 'ready', profile, me });
      return me;
    } catch (e) {
      if (seq !== loadSeq.current) return null;
      if (e instanceof ApiError && e.code === 'PROFILE_REQUIRED') {
        setAccount({ step: 'profile', profile: await auth.getProfile().catch(() => ({ firstName: null, lastName: null, username: null })) });
        return null;
      }
      setAccount({ step: 'error', error: e });
      return null;
    }
  }, [api, auth]);

  useEffect(() => {
    if (userId) loadAccount();
    else loadSeq.current++;
  }, [userId, loadAccount]);

  const refreshMe = useCallback(async () => {
    const me = await api.me();
    if (me) setAccount((a) => (a.step === 'ready' ? { ...a, me } : a));
    return me;
  }, [api]);

  const setMe = useCallback((me: MeDto | null) => {
    setAccount((a) => (a.step === 'ready' && me ? { ...a, me } : a));
  }, []);

  const setProfile = useCallback((profile: Profile) => {
    setAccount((a) => (a.step === 'ready' ? { ...a, profile, me: { ...a.me, nickname: profile.username ?? a.me.nickname, fullName: `${profile.firstName} ${profile.lastName}` } } : a));
  }, []);

  const signOut = useCallback(async () => {
    await auth.signOut();
    nav({ name: 'login' }, true);
  }, [auth, nav]);

  const me = account.step === 'ready' ? account.me : null;
  const profile = account.step === 'ready' || account.step === 'profile' ? account.profile : null;
  const user = session.status === 'in' ? session.user : null;

  // Route guards once the learner is in: onboarding until a category is chosen, never the sign-in pages.
  useEffect(() => {
    if (!me) return;
    if (!me.category && route.name !== 'onboarding') nav({ name: 'onboarding' }, true);
    else if (me.category && (AUTH_ROUTES.has(route.name) || route.name === 'onboarding')) nav({ name: 'home' }, true);
  }, [me, route.name, nav]);

  const ctx = useMemo<Ctx | null>(
    () => (meta ? { api, auth, user, profile, setProfile, me, meta, route, nav, refreshMe, setMe, signOut } : null),
    [api, auth, user, profile, setProfile, me, meta, route, nav, refreshMe, setMe, signOut],
  );

  if (metaError && !meta) {
    return <div className="shell"><div className="page no-tabs"><ErrorBox error={metaError} onRetry={loadMeta} /></div></div>;
  }
  if (!ctx || session.status === 'loading') return <Splash />;

  let screen: JSX.Element;
  let chrome = false;
  if (route.name === 'certificate') {
    // Public: anyone can check a certificate code, signed in or not.
    screen = <CertificateCheck code={route.code} />;
  } else if (session.status === 'out') {
    const mode: AuthMode = route.name === 'register' ? 'register' : route.name === 'forgot' ? 'forgot' : 'login';
    screen = <AuthScreen mode={mode} onMode={(m) => nav({ name: m }, true)} />;
  } else if (recovery) {
    screen = <NewPassword onDone={() => { setRecovery(false); if (useHistory) history.replaceState(null, '', '/'); }} />;
  } else if (account.step === 'idle' || account.step === 'loading') {
    screen = <Splash />;
  } else if (account.step === 'error') {
    screen = (
      <main className="page no-tabs stack">
        <ErrorBox error={account.error} onRetry={loadAccount} />
        <button className="btn ghost" onClick={signOut}>Çıxış</button>
      </main>
    );
  } else if (account.step === 'profile') {
    screen = <CompleteProfile initial={account.profile} onSaved={() => { loadAccount().then((m) => m && nav(m.category ? { name: 'home' } : { name: 'onboarding' }, true)); }} />;
  } else if (!account.me.category || route.name === 'onboarding') {
    screen = <Onboarding />;
  } else {
    chrome = TABS.has(route.name);
    switch (route.name) {
      case 'path': screen = <PathScreen topicId={route.topicId} />; break;
      case 'session': screen = <SessionScreen key={JSON.stringify(route)} route={route} />; break;
      case 'leaderboard': screen = <Leaderboard />; break;
      case 'weak': screen = <Weak />; break;
      case 'profile': screen = <ProfileScreen />; break;
      case 'premium': screen = <Premium />; break;
      case 'admin': screen = <Admin />; break;
      case 'competitions': screen = <Competitions />; break;
      case 'competition': screen = <CompetitionScreen id={route.id} />; break;
      default: screen = <Home />; chrome = true;
    }
  }

  return (
    <AppCtx.Provider value={ctx}>
      <div className={`shell ${route.name === 'admin' && me ? 'wide' : ''}`}>
        {chrome && <TopBar />}
        {screen}
        {chrome && <TabBar />}
      </div>
      <ToastHost />
    </AppCtx.Provider>
  );
}

function TopBar() {
  const { me, nav } = useApp();
  if (!me) return null;
  return (
    <header className="topbar">
      <button className="brand" onClick={() => nav({ name: 'home' })} aria-label="QanunHub — əsas səhifə">
        <img src={logoUrl} alt="QanunHub" />
      </button>
      <span className="grow" />
      <span className="stat streak" title="Ardıcıl günlər"><IconFlame />{me.streak}</span>
      <span className="stat hearts">
        {me.hearts ? <LifeStars current={me.hearts.current} max={me.hearts.max} size={24} /> : <LifeStars current={3} infinite size={24} />}
      </span>
      <span className="stat xp" title="Ümumi XP"><IconBolt />{me.xpTotal}</span>
    </header>
  );
}

function TabBar() {
  const { route, nav } = useApp();
  const tabs: { name: Route['name']; label: string; icon: JSX.Element }[] = [
    { name: 'home', label: 'Bu gün', icon: <IconHome /> },
    { name: 'path', label: 'Yol', icon: <IconPath /> },
    { name: 'competitions', label: 'Yarışlar', icon: <IconMedal /> },
    { name: 'leaderboard', label: 'Reytinq', icon: <IconTrophy /> },
    { name: 'profile', label: 'Profil', icon: <IconUser /> },
  ];
  return (
    <nav className="tabbar" aria-label="Əsas menyu">
      <div className="tabbar-inner">
        {tabs.map((t) => (
          <button key={t.name} className={`tab ${route.name === t.name || (t.name === 'competitions' && route.name === 'competition') ? 'active' : ''}`} onClick={() => nav({ name: t.name } as Route)} aria-current={route.name === t.name ? 'page' : undefined}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
