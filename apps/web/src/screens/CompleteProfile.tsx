// "Profilini tamamla": after the first sign-in the learner gives a first name, a last name and a unique
// username before anything else opens. Names go on competition certificates; the username on leaderboards.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app';
import type { Profile, ProfileInput } from '../auth/types';
import { USERNAME_RE, normalizeUsername, validateProfile } from '../auth/types';
import { Field, FormError, SubmitButton } from '../ui/form';
import { IconAt, IconCheck, IconLogout, IconUser, IconX } from '../ui/icons';
import { AuthLayout, useSubmit } from './Auth';

const TRANSLIT: Record<string, string> = { ə: 'e', ı: 'i', ö: 'o', ü: 'u', ğ: 'g', ç: 'c', ş: 's', İ: 'i' };

/** Lower case, Azerbaijani letters spelled in Latin, everything else outside a-z 0-9 _ . dropped. */
export function toUsername(v: string): string {
  return v.replace(/[əıöüğçşİ]/gi, (ch) => TRANSLIT[ch.toLowerCase()] ?? TRANSLIT[ch] ?? ch)
    .toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9_.]/g, '').slice(0, 24);
}

type Check = 'idle' | 'checking' | 'free' | 'taken' | 'invalid' | 'error';

/** Debounced availability check against Supabase (public.username_available). */
function useUsernameCheck(username: string, own: string | null): Check {
  const { auth } = useApp();
  const [state, setState] = useState<Check>('idle');
  const seq = useRef(0);
  useEffect(() => {
    const name = normalizeUsername(username);
    const n = ++seq.current;
    if (!name) { setState('idle'); return; }
    if (!USERNAME_RE.test(name)) { setState('invalid'); return; }
    if (own && name === own) { setState('free'); return; }
    setState('checking');
    const t = setTimeout(() => {
      auth.usernameAvailable(name).then(
        (ok) => { if (n === seq.current) setState(ok ? 'free' : 'taken'); },
        () => { if (n === seq.current) setState('error'); },
      );
    }, 400);
    return () => clearTimeout(t);
  }, [username, own, auth]);
  return state;
}

export function ProfileForm({ initial, onSaved, submitText }: { initial: Profile; onSaved: (p: Profile) => void; submitText: string }) {
  const { auth } = useApp();
  const [form, setForm] = useState<ProfileInput>({ firstName: initial.firstName ?? '', lastName: initial.lastName ?? '', username: initial.username ?? '' });
  const [touched, setTouched] = useState<Partial<Record<keyof ProfileInput, boolean>>>({});
  const [usernameEdited, setUsernameEdited] = useState(!!initial.username);
  const { busy, error, run } = useSubmit();
  const errors = useMemo(() => validateProfile(form), [form]);
  const check = useUsernameCheck(form.username, initial.username);

  // Until the learner types a username, suggest one from the name ("aynur.aliyeva").
  useEffect(() => {
    if (usernameEdited) return;
    const suggestion = toUsername([form.firstName, form.lastName].filter(Boolean).join('.'));
    setForm((f) => (f.username === suggestion ? f : { ...f, username: suggestion }));
  }, [form.firstName, form.lastName, usernameEdited]);

  const show = (k: keyof ProfileInput) => (touched[k] ? errors[k] : null);
  const usernameError = show('username') ?? (check === 'taken' ? 'Bu istifadəçi adı artıq tutulub. Başqasını seç.' : null);
  const status = {
    idle: null,
    checking: <span className="fx-status" aria-label="Yoxlanılır"><span className="btn-spinner dark" /></span>,
    free: <span className="fx-status ok" aria-label="Boşdur"><IconCheck /></span>,
    taken: <span className="fx-status bad" aria-label="Tutulub"><IconX /></span>,
    invalid: null,
    error: null,
  }[check];

  return (
    <form className="auth-form" noValidate onSubmit={(e) => {
      e.preventDefault();
      setTouched({ firstName: true, lastName: true, username: true });
      if (Object.keys(errors).length || check === 'taken' || check === 'checking') return;
      run(async () => onSaved(await auth.saveProfile(form)));
    }}>
      <div className="fx-grid">
        <Field
          label="Ad" icon={<IconUser />} autoComplete="given-name" placeholder="Aynur" value={form.firstName} maxLength={40}
          onChange={(e) => setForm({ ...form, firstName: e.target.value })} onBlur={() => setTouched({ ...touched, firstName: true })}
          error={show('firstName')} autoFocus
        />
        <Field
          label="Soyad" autoComplete="family-name" placeholder="Əliyeva" value={form.lastName} maxLength={40}
          onChange={(e) => setForm({ ...form, lastName: e.target.value })} onBlur={() => setTouched({ ...touched, lastName: true })}
          error={show('lastName')}
        />
      </div>
      <Field
        label="İstifadəçi adı" icon={<IconAt />} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="aynur.aliyeva"
        value={form.username} maxLength={24}
        onChange={(e) => { setUsernameEdited(true); setForm({ ...form, username: toUsername(e.target.value) }); }}
        onBlur={() => setTouched({ ...touched, username: true })}
        error={usernameError}
        hint={check === 'free' && form.username !== initial.username ? 'Bu ad boşdur.' : 'Reytinqdə görünəcək. 3–24 simvol: latın hərfləri, rəqəmlər, «_» və «.».'}
        trailing={status}
      />
      {error && <FormError>{error}</FormError>}
      <SubmitButton busy={busy} busyText="Yadda saxlanılır…" disabled={check === 'checking'}>{submitText}</SubmitButton>
    </form>
  );
}

export function CompleteProfile({ initial, onSaved }: { initial: Profile; onSaved: (p: Profile) => void }) {
  const { user, signOut } = useApp();
  return (
    <AuthLayout
      footer={
        <span className="auth-signed">
          <span className="muted">{user?.email}</span>
          <button className="link-btn" onClick={signOut}><IconLogout />Çıxış</button>
        </span>
      }
    >
      <ol className="steps" aria-label="Addımlar">
        <li className="done"><span><IconCheck /></span>Hesab</li>
        <li className="current" aria-current="step"><span>2</span>Profil</li>
        <li><span>3</span>İmtahan</li>
      </ol>
      <header className="auth-head">
        <h1>Profilini tamamla</h1>
        <p className="muted">Ad və soyadın yarış sertifikatlarında, istifadəçi adın reytinqdə görünəcək.</p>
      </header>
      <ProfileForm initial={initial} onSaved={onSaved} submitText="Yadda saxla və davam et" />
    </AuthLayout>
  );
}
