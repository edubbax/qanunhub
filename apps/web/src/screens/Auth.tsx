// Sign-in screen: e-mail and password only. Modes: sign in, sign up, forgotten password; plus the
// "check your inbox" state after sign-up and the new-password form opened from the reset e-mail.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useApp } from '../app';
import { validateCredentials } from '../auth/types';
import { toast } from '../ui/components';
import { Field, FormError, PasswordField, PasswordStrength, SubmitButton } from '../ui/form';
import { IconBack, IconKey, IconLock, IconMail } from '../ui/icons';
import logoUrl from '../assets/logo.png';

export type AuthMode = 'login' | 'register' | 'forgot';

/** Runs a form action with a busy flag and a readable error. */
export function useSubmit() {
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
  return { busy, error, setError, run };
}

/** The frame shared by the sign-in and profile screens: brand on top, one card, a quiet footer. */
export function AuthLayout({ children, footer, wide = false }: { children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <main className="auth-page">
      <div className={`auth-wrap ${wide ? 'wide' : ''}`}>
        <img className="auth-logo" src={logoUrl} alt="QanunHub" />
        <section className="auth-card">{children}</section>
        {footer && <footer className="auth-footer">{footer}</footer>}
      </div>
    </main>
  );
}

const TITLES: Record<AuthMode, [string, string]> = {
  login: ['Xoş gəldin', 'Hesabına daxil ol və hazırlığa davam et.'],
  register: ['Hesab yarat', 'Dövlət qulluğu imtahanına hazırlığa bu gün başla.'],
  forgot: ['Şifrəni bərpa et', 'E-poçt ünvanını yaz, sənə bərpa linki göndərək.'],
};

export function AuthScreen({ mode, onMode }: { mode: AuthMode; onMode: (m: AuthMode) => void }) {
  const { auth, api, nav } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sentTo, setSentTo] = useState<{ kind: 'confirm' | 'reset'; email: string } | null>(null);
  const [touched, setTouched] = useState(false);
  const { busy, error, setError, run } = useSubmit();
  const demo = useSubmit();

  useEffect(() => { setError(null); setTouched(false); }, [mode, setError]);

  const emailError = touched && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) ? 'E-poçt ünvanını düzgün yaz.' : null;
  const passwordError = touched && mode !== 'forgot' && password.length < 8 ? 'Şifrə ən azı 8 simvol olmalıdır.' : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (mode === 'forgot') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return;
      run(async () => {
        await auth.sendPasswordReset(email);
        setSentTo({ kind: 'reset', email: email.trim() });
      });
      return;
    }
    if (validateCredentials(email, password)) return;
    run(async () => {
      if (mode === 'login') {
        await auth.signIn(email, password);
      } else {
        const { confirmEmail } = await auth.signUp(email, password);
        if (confirmEmail) setSentTo({ kind: 'confirm', email: email.trim() });
      }
    });
  };

  if (sentTo) return <CheckInbox kind={sentTo.kind} email={sentTo.email} onBack={() => { setSentTo(null); onMode('login'); }} />;

  const [title, subtitle] = TITLES[mode];
  return (
    <AuthLayout
      footer={
        <>
          {api.demo && (
            <button className="btn secondary block" disabled={demo.busy} onClick={() => demo.run(() => api.demo!.quickStart())}>
              {demo.busy && <span className="btn-spinner" aria-hidden="true" />}Demo hesabla bax
            </button>
          )}
          {demo.error && <FormError>{demo.error}</FormError>}
          <button className="link-btn" onClick={() => nav({ name: 'certificate' })}>Sertifikatı yoxla</button>
          {api.mode === 'demo' && <p className="tiny muted center">Demo versiya: hesablar və məlumatlar yalnız bu brauzerdə saxlanılır.</p>}
        </>
      }
    >
      {mode === 'forgot' && (
        <button className="auth-back" onClick={() => onMode('login')}><IconBack />Girişə qayıt</button>
      )}
      <header className="auth-head">
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </header>
      {mode !== 'forgot' && (
        <div className="auth-tabs" role="tablist" aria-label="Giriş və ya qeydiyyat">
          <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => onMode('login')}>Daxil ol</button>
          <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => onMode('register')}>Qeydiyyat</button>
          <span className="auth-tabs-pill" style={{ transform: mode === 'register' ? 'translateX(100%)' : undefined }} aria-hidden="true" />
        </div>
      )}
      <form className="auth-form" onSubmit={submit} noValidate>
        <Field
          label="E-poçt" icon={<IconMail />} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
          placeholder="ad@numune.az" value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} autoFocus
        />
        {mode !== 'forgot' && (
          <>
            <PasswordField
              label="Şifrə" icon={<IconLock />} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={mode === 'login' ? 'Şifrən' : 'Ən azı 8 simvol'} value={password} onChange={(e) => setPassword(e.target.value)}
              error={passwordError}
            />
            {mode === 'register' && <PasswordStrength password={password} />}
          </>
        )}
        {mode === 'login' && (
          <div className="auth-row-end">
            <button type="button" className="link-btn" onClick={() => onMode('forgot')}>Şifrəni unutmusan?</button>
          </div>
        )}
        {error && <FormError>{error}</FormError>}
        <SubmitButton busy={busy} busyText={mode === 'login' ? 'Daxil olunur…' : mode === 'register' ? 'Hesab yaradılır…' : 'Göndərilir…'}>
          {mode === 'login' ? 'Daxil ol' : mode === 'register' ? 'Hesab yarat' : 'Bərpa linki göndər'}
        </SubmitButton>
        {mode === 'register' && (
          <p className="tiny muted center">Qeydiyyatdan keçməklə 18 yaşın tamam olduğunu, istifadə şərtləri və məxfilik siyasəti ilə razılaşdığını təsdiq edirsən. Məzmun tədris məqsədlidir.</p>
        )}
      </form>
    </AuthLayout>
  );
}

function CheckInbox({ kind, email, onBack }: { kind: 'confirm' | 'reset'; email: string; onBack: () => void }) {
  const { auth } = useApp();
  const [cooldown, setCooldown] = useState(60);
  const { busy, error, run } = useSubmit();
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  const resend = () => run(async () => {
    if (kind === 'confirm') await auth.resendConfirmation(email);
    else await auth.sendPasswordReset(email);
    toast('Məktub yenidən göndərildi.');
    setCooldown(60);
  });
  return (
    <AuthLayout>
      <div className="auth-state">
        <span className="auth-state-icon"><IconMail /></span>
        <h1>Poçt qutunu yoxla</h1>
        <p className="muted">
          <b className="ink">{email}</b> ünvanına {kind === 'confirm' ? 'təsdiq linki' : 'şifrə bərpası linki'} göndərdik.
          {kind === 'confirm' ? ' Linkə keçəndən sonra hesabın açılacaq.' : ' Linkə keçib yeni şifrə təyin et.'} Məktub gəlməyibsə, «Spam» qovluğuna da bax.
        </p>
      </div>
      {error && <FormError>{error}</FormError>}
      <button className="btn secondary block" disabled={busy || cooldown > 0} onClick={resend}>
        {busy && <span className="btn-spinner" aria-hidden="true" />}
        {cooldown > 0 ? `Yenidən göndər (${cooldown} san.)` : 'Məktubu yenidən göndər'}
      </button>
      <button className="btn ghost block" onClick={onBack}><IconBack />Girişə qayıt</button>
    </AuthLayout>
  );
}

/** Opened from the password-reset e-mail: Supabase has signed the user in for this one purpose. */
export function NewPassword({ onDone }: { onDone: () => void }) {
  const { auth, user, signOut } = useApp();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [touched, setTouched] = useState(false);
  const { busy, error, run } = useSubmit();
  const mismatch = touched && repeat !== password ? 'Şifrələr eyni deyil.' : null;
  const short = touched && password.length < 8 ? 'Şifrə ən azı 8 simvol olmalıdır.' : null;
  return (
    <AuthLayout footer={<button className="link-btn" onClick={() => { onDone(); signOut(); }}>Ləğv et və çıx</button>}>
      <div className="auth-state">
        <span className="auth-state-icon"><IconKey /></span>
        <h1>Yeni şifrə</h1>
        <p className="muted">{user?.email ? <><b className="ink">{user.email}</b> hesabı üçün yeni şifrə təyin et.</> : 'Hesabın üçün yeni şifrə təyin et.'}</p>
      </div>
      <form className="auth-form" noValidate onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (password.length < 8 || password !== repeat) return;
        run(async () => {
          await auth.updatePassword(password);
          toast('Şifrə yeniləndi.');
          onDone();
        });
      }}>
        <PasswordField label="Yeni şifrə" icon={<IconLock />} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={short} autoFocus />
        <PasswordStrength password={password} />
        <PasswordField label="Yeni şifrə (təkrar)" icon={<IconLock />} autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} error={mismatch} />
        {error && <FormError>{error}</FormError>}
        <SubmitButton busy={busy} busyText="Yadda saxlanılır…">Şifrəni yenilə</SubmitButton>
      </form>
    </AuthLayout>
  );
}
