// App shell: routing (URL paths on the server build, in-memory in the demo), session state and layout.
import type { MeDto, SessionKind } from '@qanunhub/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Api, MetaDto } from './api/types';
import { ApiError } from './api/types';
import { ErrorBox, Spinner, ToastHost } from './ui/components';
import { IconBolt, IconFlame, IconHeart, IconHome, IconPath, IconTrophy, IconUser } from './ui/icons';
import { Forgot, Login, Register, Reset, Verify, Welcome } from './screens/Auth';
import { Onboarding } from './screens/Onboarding';
import { Home } from './screens/Home';
import { PathScreen } from './screens/Path';
import { SessionScreen } from './screens/Session';
import { Leaderboard } from './screens/Leaderboard';
import { Weak } from './screens/Weak';
import { Profile } from './screens/Profile';
import { Premium } from './screens/Premium';
import { Admin } from './screens/Admin';

export type Route =
  | { name: 'welcome' } | { name: 'login' } | { name: 'register' } | { name: 'forgot' }
  | { name: 'reset'; token: string } | { name: 'verify'; token: string }
  | { name: 'onboarding' } | { name: 'home' } | { name: 'path'; topicId?: string }
  | { name: 'session'; kind: SessionKind; lessonId?: string; topicId?: string; back?: Route }
  | { name: 'leaderboard' } | { name: 'weak' } | { name: 'profile' } | { name: 'premium' } | { name: 'admin' };

const PATHS: Record<string, string> = {
  welcome: '/', login: '/giris', register: '/qeydiyyat', forgot: '/sifre-unutdum', reset: '/sifre-berpa', verify: '/tesdiq',
  onboarding: '/baslangic', home: '/bu-gun', path: '/yol', leaderboard: '/reytinq', weak: '/zeif', profile: '/profil',
  premium: '/premium', admin: '/admin',
};

function routeFromUrl(): Route {
  const p = window.location.pathname.replace(/\/+$/, '') || '/';
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const name = Object.keys(PATHS).find((k) => PATHS[k] === p);
  if (name === 'reset' || name === 'verify') return { name, token };
  if (name === 'path') return { name: 'path', topicId: new URLSearchParams(window.location.search).get('movzu') ?? undefined };
  return name && name !== 'session' ? ({ name } as Route) : { name: 'welcome' };
}

function urlFor(r: Route): string | null {
  if (r.name === 'session') return null;
  if (r.name === 'path' && r.topicId) return `${PATHS.path}?movzu=${encodeURIComponent(r.topicId)}`;
  return PATHS[r.name] ?? '/';
}

interface Ctx {
  api: Api;
  me: MeDto | null;
  meta: MetaDto;
  route: Route;
  nav: (r: Route, replace?: boolean) => void;
  refreshMe: () => Promise<MeDto | null>;
  setMe: (m: MeDto | null) => void;
}

const AppCtx = createContext<Ctx | null>(null);
export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppCtx missing');
  return c;
}

const PUBLIC = new Set(['welcome', 'login', 'register', 'forgot', 'reset', 'verify']);
const TABS = new Set(['home', 'path', 'leaderboard', 'profile', 'weak', 'premium']);

export function App({ api }: { api: Api }) {
  const useHistory = api.mode === 'server';
  const [route, setRoute] = useState<Route>(() => (useHistory ? routeFromUrl() : { name: 'welcome' }));
  const [me, setMe] = useState<MeDto | null>(null);
  const [meta, setMeta] = useState<MetaDto | null>(null);
  const [boot, setBoot] = useState<{ error: unknown; done: boolean }>({ error: null, done: false });

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

  const refreshMe = useCallback(async () => {
    const m = await api.me();
    setMe(m);
    return m;
  }, [api]);

  const start = useCallback(async () => {
    setBoot({ error: null, done: false });
    try {
      const [m, mt] = await Promise.all([api.me(), api.meta()]);
      setMe(m);
      setMeta(mt);
      setBoot({ error: null, done: true });
    } catch (e) {
      setBoot({ error: e, done: true });
    }
  }, [api]);

  useEffect(() => { start(); }, [start]);

  // Route guards: public pages for guests, onboarding until a category is chosen.
  useEffect(() => {
    if (!boot.done || boot.error) return;
    if (!me && !PUBLIC.has(route.name)) nav({ name: 'welcome' }, true);
    else if (me && !me.category && route.name !== 'onboarding' && route.name !== 'verify') nav({ name: 'onboarding' }, true);
    else if (me && me.category && (route.name === 'welcome' || route.name === 'login' || route.name === 'register' || route.name === 'onboarding')) nav({ name: 'home' }, true);
  }, [boot, me, route.name, nav]);

  const ctx = useMemo<Ctx | null>(() => (meta ? { api, me, meta, route, nav, refreshMe, setMe } : null), [api, me, meta, route, nav, refreshMe]);

  if (!boot.done) return <Spinner />;
  if (boot.error || !ctx) {
    return (
      <div className="shell"><div className="page no-tabs"><ErrorBox error={boot.error ?? new ApiError('BOOT', 'Tətbiq yüklənmədi.', 0)} onRetry={start} /></div></div>
    );
  }

  let screen: JSX.Element;
  switch (route.name) {
    case 'welcome': screen = <Welcome />; break;
    case 'login': screen = <Login />; break;
    case 'register': screen = <Register />; break;
    case 'forgot': screen = <Forgot />; break;
    case 'reset': screen = <Reset token={route.token} />; break;
    case 'verify': screen = <Verify token={route.token} />; break;
    case 'onboarding': screen = <Onboarding />; break;
    case 'home': screen = <Home />; break;
    case 'path': screen = <PathScreen topicId={route.topicId} />; break;
    case 'session': screen = <SessionScreen key={JSON.stringify(route)} route={route} />; break;
    case 'leaderboard': screen = <Leaderboard />; break;
    case 'weak': screen = <Weak />; break;
    case 'profile': screen = <Profile />; break;
    case 'premium': screen = <Premium />; break;
    case 'admin': screen = <Admin />; break;
  }

  const showChrome = !!me?.category && TABS.has(route.name);
  return (
    <AppCtx.Provider value={ctx}>
      <div className={`shell ${route.name === 'admin' ? 'wide' : ''}`}>
        {showChrome && <TopBar />}
        {screen}
        {showChrome && <TabBar />}
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
      <button className="brand" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0 }} onClick={() => nav({ name: 'home' })}>
        <span className="mark">Q</span>
        <span className="stack" style={{ gap: 2 }}>
          <span>QanunHub</span>
          <span className="tricolor" aria-hidden="true"><span /><span /><span /></span>
        </span>
      </button>
      <span className="grow" />
      <span className="stat streak" title="Ardıcıl günlər"><IconFlame />{me.streak}</span>
      {me.hearts ? (
        <span className="stat hearts" title="Canlar"><IconHeart />{me.hearts.current}</span>
      ) : (
        <span className="stat hearts" title="Premium: limitsiz can"><IconHeart />∞</span>
      )}
      <span className="stat xp" title="Ümumi XP"><IconBolt />{me.xpTotal}</span>
    </header>
  );
}

function TabBar() {
  const { route, nav } = useApp();
  const tabs: { name: Route['name']; label: string; icon: JSX.Element }[] = [
    { name: 'home', label: 'Bu gün', icon: <IconHome /> },
    { name: 'path', label: 'Yol', icon: <IconPath /> },
    { name: 'leaderboard', label: 'Reytinq', icon: <IconTrophy /> },
    { name: 'profile', label: 'Profil', icon: <IconUser /> },
  ];
  return (
    <nav className="tabbar" aria-label="Əsas menyu">
      <div className="tabbar-inner">
        {tabs.map((t) => (
          <button key={t.name} className={`tab ${route.name === t.name ? 'active' : ''}`} onClick={() => nav({ name: t.name } as Route)} aria-current={route.name === t.name ? 'page' : undefined}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
