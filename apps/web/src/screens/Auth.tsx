import { useEffect, useState } from 'react';
import { useApp } from '../app';
import { toast } from '../ui/components';
import { IconBook, IconRepeat, IconShield, IconTrophy } from '../ui/icons';
import { Epaulette } from '../ui/insignia';
import logoUrl from '../assets/logo.png';

function Brand({ big = false }: { big?: boolean }) {
  return (
    <div className={`brand ${big ? 'big' : ''}`} style={{ cursor: 'default' }}>
      <img src={logoUrl} alt="QanunHub" />
    </div>
  );
}

export function Welcome() {
  const { nav, api, refreshMe } = useApp();
  const demo = useSubmit();
  return (
    <main className="page no-tabs stack loose">
      <Brand big />
      <section className="welcome-hero">
        <h1>Dövlət qulluğu imtahanının qanunvericilik bölməsinə hər gün az-az, amma ardıcıl hazırlaş</h1>
        <p>Qısa dərslər, unutduğunu vaxtında qaytaran təkrar, real formatda sınaq və yarışlar. Hər uğur rütbəni yüksəldir.</p>
        <div className="ranks" aria-hidden="true">
          {['gizir', 'l', 'kapitan', 'polkovnik', 'gm', 'og'].map((c, i) => <Epaulette key={c} code={c} size={44 + i * 6} />)}
        </div>
      </section>
      <div className="stack">
        <div className="feature"><span className="ico"><IconBook /></span><div><b>Qanunun öz mətninə əsaslanan dərslər</b><p className="muted small">Konstitusiyadan Kargüzarlıq Təlimatına qədər, kateqoriyana uyğun mövzular. AC, BA və BB hazırdır, AB tezliklə.</p></div></div>
        <div className="feature"><span className="ico"><IconRepeat /></span><div><b>Unutduğunu özü qaytaran təkrar</b><p className="muted small">Səhv etdiyin sual əvvəlcə bir neçə dəqiqədən, sonra bir neçə gündən sonra yenidən qarşına çıxır. Təkrar cədvəli imtahan tarixinə uyğunlaşır.</p></div></div>
        <div className="feature"><span className="ico"><IconShield /></span><div><b>Rütbə, ulduz və təltiflər</b><p className="muted small">Gizirdən Ordu generalına qədər rütbələr, paqonda üç ulduz, uğurlu testlərə görə medal və ordenlər.</p></div></div>
        <div className="feature"><span className="ico"><IconTrophy /></span><div><b>Reytinq və yarışlar</b><p className="muted small">Həftəlik və aylıq cədvəllər, qaliblərə PDF sertifikat verilən yarışlar.</p></div></div>
      </div>
      <div className="stack">
        {api.demo && (
          <button className="btn primary block" disabled={demo.busy} onClick={() => demo.run(async () => {
            await api.demo!.quickStart();
            const m = await refreshMe();
            nav(m?.category ? { name: 'home' } : { name: 'onboarding' }, true);
          })}>{demo.busy ? 'Açılır…' : 'Demo hesabla bax (Premium)'}</button>
        )}
        {demo.error && <div className="banner bad" role="alert">{demo.error}</div>}
        <button className={`btn ${api.demo ? 'secondary' : 'primary'} block`} onClick={() => nav({ name: 'register' })}>Pulsuz başla</button>
        <button className="btn secondary block" onClick={() => nav({ name: 'login' })}>Hesabım var, daxil ol</button>
        <button className="btn ghost" onClick={() => nav({ name: 'certificate' })}>Sertifikatı yoxla</button>
      </div>
      {api.mode === 'demo' && (
        <p className="tiny muted center">Bu, brauzerdə işləyən demo versiyadır: hesablar, ödəniş və email simulyasiya olunur, məlumatlar yalnız bu brauzerdə saxlanılır.</p>
      )}
    </main>
  );
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xəta baş verdi.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

export function Login() {
  const { api, nav, refreshMe } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  return (
    <main className="page no-tabs stack loose">
      <Brand />
      <h1>Daxil ol</h1>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.login(email, password); const m = await refreshMe(); nav(m?.category ? { name: 'home' } : { name: 'onboarding' }, true); }); }}>
        <div className="field"><label htmlFor="login-email">Email</label><input id="login-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="login-password">Şifrə</label><input id="login-password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <div className="banner bad" role="alert">{error}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Yoxlanılır…' : 'Daxil ol'}</button>
      </form>
      <div className="row between">
        <button className="btn ghost" onClick={() => nav({ name: 'forgot' })}>Şifrəni unutmusan?</button>
        <button className="btn ghost" onClick={() => nav({ name: 'register' })}>Qeydiyyat</button>
      </div>
    </main>
  );
}

export function Register() {
  const { api, nav, refreshMe } = useApp();
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [accept, setAccept] = useState(false);
  const { busy, error, run } = useSubmit();
  return (
    <main className="page no-tabs stack loose">
      <Brand />
      <div className="stack tight">
        <h1>Hesab yarat</h1>
        <p className="muted">Konstitusiya mövzusu pulsuzdur. Kart tələb olunmur.</p>
      </div>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.register(email, password, nickname.trim()); await refreshMe(); nav({ name: 'onboarding' }, true); }); }}>
        <div className="field"><label htmlFor="reg-email">Email</label><input id="reg-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field">
          <label htmlFor="reg-nick">Ləqəb</label>
          <input id="reg-nick" className="input" autoComplete="nickname" required minLength={3} maxLength={24} value={nickname} onChange={(e) => setNickname(e.target.value)} />
          <span className="hint">Reytinqdə bu ad görünəcək. Real adını yazmaq məcburi deyil.</span>
        </div>
        <div className="field">
          <label htmlFor="reg-password">Şifrə</label>
          <input id="reg-password" className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          <span className="hint">Ən azı 8 simvol.</span>
        </div>
        <label className="check" htmlFor="reg-accept">
          <input id="reg-accept" type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
          <span>18 yaşım var. İstifadə şərtləri və məxfilik siyasəti ilə razıyam. Məzmun tədris məqsədlidir, hüquqi məsləhət deyil.</span>
        </label>
        {error && <div className="banner bad" role="alert">{error}</div>}
        <button className="btn primary block" disabled={busy || !accept}>{busy ? 'Yaradılır…' : 'Hesab yarat'}</button>
      </form>
      <button className="btn ghost" onClick={() => nav({ name: 'login' })}>Artıq hesabım var</button>
    </main>
  );
}

export function Forgot() {
  const { api, nav } = useApp();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useSubmit();
  return (
    <main className="page no-tabs stack loose">
      <Brand />
      <h1>Şifrənin bərpası</h1>
      {sent ? (
        <div className="stack">
          <div className="banner">Bu email ilə hesab varsa, bərpa linki göndərildi. Poçt qutunu yoxla (spam qovluğunu da).</div>
          {api.mode === 'demo' && <p className="muted small">Demo: bərpa kodu admin panelinin «Poçt» bölməsində görünür.</p>}
          <button className="btn secondary block" onClick={() => nav({ name: 'login' })}>Girişə qayıt</button>
        </div>
      ) : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.forgot(email); setSent(true); }); }}>
          <div className="field"><label htmlFor="forgot-email">Email</label><input id="forgot-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {error && <div className="banner bad" role="alert">{error}</div>}
          <button className="btn primary block" disabled={busy}>Bərpa linki göndər</button>
        </form>
      )}
    </main>
  );
}

export function Reset({ token }: { token: string }) {
  const { api, nav } = useApp();
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  return (
    <main className="page no-tabs stack loose">
      <Brand />
      <h1>Yeni şifrə</h1>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.reset(token, password); toast('Şifrə yeniləndi. İndi daxil ol.'); nav({ name: 'login' }, true); }); }}>
        <div className="field"><label htmlFor="reset-password">Yeni şifrə</label><input id="reset-password" className="input" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <div className="banner bad" role="alert">{error}</div>}
        <button className="btn primary block" disabled={busy}>Şifrəni yenilə</button>
      </form>
    </main>
  );
}

export function Verify({ token }: { token: string }) {
  const { api, nav, refreshMe, me } = useApp();
  const [state, setState] = useState<'wait' | 'ok' | 'fail'>('wait');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    api.verify(token).then(
      async () => { setState('ok'); await refreshMe(); },
      (e) => { setState('fail'); setMsg(e instanceof Error ? e.message : ''); },
    );
  }, [api, token, refreshMe]);
  return (
    <main className="page no-tabs stack loose">
      <Brand />
      <h1>Email təsdiqi</h1>
      {state === 'wait' && <p className="muted">Yoxlanılır…</p>}
      {state === 'ok' && <div className="banner">Email ünvanın təsdiqləndi. Reytinq və ödəniş funksiyaları açıqdır.</div>}
      {state === 'fail' && <div className="banner bad">{msg}</div>}
      <button className="btn primary block" onClick={() => nav(me ? { name: 'home' } : { name: 'login' })}>Davam et</button>
    </main>
  );
}
