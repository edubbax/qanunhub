import { useEffect, useState } from 'react';
import { useApp } from '../app';
import { toast } from '../ui/components';
import { IconBook, IconRepeat, IconTarget, IconTrophy } from '../ui/icons';

function Brand() {
  return (
    <div className="brand">
      <span className="mark">Q</span>
      <span className="stack" style={{ gap: 2 }}>
        <span>QanunHub</span>
        <span className="tricolor" aria-hidden="true"><span /><span /><span /></span>
      </span>
    </div>
  );
}

export function Welcome() {
  const { nav, api, meta } = useApp();
  return (
    <main className="page no-tabs stack loose">
      <Brand />
      <section className="hero">
        <h1>Qanunvericilik imtahanına gündə 15 dəqiqə ilə hazırlaş</h1>
        <p className="lead">Dövlət qulluğu test imtahanının 40 qanunvericilik sualı üçün qısa dərslər, düşünülmüş təkrar və real formatda sınaq imtahanı.</p>
      </section>
      <div className="stack">
        <div className="feature"><span className="ico"><IconBook /></span><div><b>Rəsmi mətnə əsaslanan dərslər</b><p className="muted small">{meta.topics.length} proqram mövzusu: Konstitusiyadan Kargüzarlıq Təlimatına qədər, kateqoriyana (AB, AC, BA, BB) uyğun.</p></div></div>
        <div className="feature"><span className="ico"><IconRepeat /></span><div><b>Unutduğunu özü qaytaran təkrar</b><p className="muted small">Səhv etdiyin sual 10 dəqiqə sonra, sonra 1 və 3 gün sonra yenidən gəlir. İmtahan tarixinə uyğunlaşır.</p></div></div>
        <div className="feature"><span className="ico"><IconTarget /></span><div><b>Keçid balına qarşı hazırlıq faizi</b><p className="muted small">Alt qrupunun keçid faizini (65–85%) seç və hazırlığını onunla müqayisə et.</p></div></div>
        <div className="feature"><span className="ico"><IconTrophy /></span><div><b>Həftəlik və aylıq reytinq</b><p className="muted small">XP, ardıcıl günlər və dövlət qulluğu ixtisas dərəcələri adlı rütbələr.</p></div></div>
      </div>
      <div className="stack">
        <button className="btn primary block" onClick={() => nav({ name: 'register' })}>Pulsuz başla</button>
        <button className="btn secondary block" onClick={() => nav({ name: 'login' })}>Hesabım var, daxil ol</button>
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
