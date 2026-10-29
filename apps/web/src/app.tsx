// App shell: routing (URL paths on the server build, in-memory in the demo), session state and layout.
import type { MeDto, SessionKind } from '@qanunhub/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Api, MetaDto } from './api/types';
import { ApiError } from './api/types';
import { ErrorBox, Spinner, ToastHost } from './ui/components';
import { IconBolt, IconFlame, IconHome, IconMedal, IconPath, IconTrophy, IconUser } from './ui/icons';
import { LifeStars } from './ui/insignia';
import logoUrl from './assets/logo.png';
import { Competitions, CompetitionScreen, CertificateCheck } from './screens/Competitions';
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
  | { name: 'session'; kind: SessionKind; lessonId?: string; topicId?: string; sectionId?: string; competitionId?: string; back?: Route }
  | { name: 'leaderboard' } | { name: 'weak' } | { name: 'profile' } | { name: 'premium' } | { name: 'admin' }
  | { name: 'competitions' } | { name: 'competition'; id: string } | { name: 'certificate'; code?: string };

const PATHS: Record<string, string> = {
  welcome: '/', login: '/giris', register: '/qeydiyyat', forgot: '/sifre-unutdum', reset: '/sifre-berpa', verify: '/tesdiq',
  onboarding: '/baslangic', home: '/bu-gun', path: '/yol', leaderboard: '/reytinq', weak: '/zeif', profile: '/profil',
  premium: '/premium', admin: '/admin', competitions: '/yarislar', certificate: '/sertifikat',
};

function routeFromUrl(): Route {
  const p = window.location.pathname.replace(/\/+$/, '') || '/';
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const name = Object.keys(PATHS).find((k) => PATHS[k] === p);
  if (name === 'reset' || name === 'verify') return { name, token };
  if (name === 'path') return { name: 'path', topicId: new URLSearchParams(window.location.search).get('movzu') ?? undefined };
  if (name === 'competitions') {
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) return { name: 'competition', id };
  }
  if (name === 'certificate') return { name: 'certificate', code: new URLSearchParams(window.location.search).get('kod') ?? undefined };
  return name && name !== 'session' ? ({ name } as Route) : { name: 'welcome' };
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

const PUBLIC = new Set(['welcome', 'login', 'register', 'forgot', 'reset', 'verify', 'certificate']);
const TABS = new Set(['home', 'path', 'leaderboard', 'profile', 'weak', 'premium', 'competitions', 'competition']);

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
    // Test formats and programme sizes arrive only for signed-in learners.
    if (m) api.meta().then(setMeta, () => {});
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
    case 'competitions': screen = <Competitions />; break;
    case 'competition': screen = <CompetitionScreen id={route.id} />; break;
    case 'certificate': screen = <CertificateCheck code={route.code} />; break;
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
