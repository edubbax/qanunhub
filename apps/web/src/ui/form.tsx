// Form controls of the sign-in and profile screens: labelled inputs with an icon, inline errors and hints,
// a password field with show/hide, and a submit button with a loading state.
import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { IconEye, IconEyeOff } from './icons';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  icon?: ReactNode;
  /** Shown under the field; replaced by the error when there is one. */
  hint?: ReactNode;
  error?: string | null;
  /** Rendered at the right edge inside the field (a status icon, a toggle). */
  trailing?: ReactNode;
  /** Text before the value inside the field, e.g. "@". */
  prefix?: string;
}

export function Field({ label, icon, hint, error, trailing, prefix, className, ...input }: FieldProps) {
  const id = useId();
  const note = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`fx ${error ? 'has-error' : ''} ${className ?? ''}`}>
      <label htmlFor={id} className="fx-label">{label}</label>
      <div className="fx-control">
        {icon && <span className="fx-icon" aria-hidden="true">{icon}</span>}
        {prefix && <span className="fx-prefix" aria-hidden="true">{prefix}</span>}
        <input id={id} className="fx-input" aria-invalid={!!error} aria-describedby={note} {...input} />
        {trailing && <span className="fx-trailing">{trailing}</span>}
      </div>
      {error ? <p id={note} className="fx-error" role="alert">{error}</p> : hint ? <p id={note} className="fx-hint">{hint}</p> : null}
    </div>
  );
}

export function PasswordField(props: Omit<FieldProps, 'type' | 'trailing'>) {
  const [show, setShow] = useState(false);
  return (
    <Field
      {...props}
      type={show ? 'text' : 'password'}
      trailing={
        <button type="button" className="fx-toggle" onClick={() => setShow(!show)} aria-label={show ? 'Şifrəni gizlət' : 'Şifrəni göstər'} aria-pressed={show}>
          {show ? <IconEyeOff /> : <IconEye />}
        </button>
      }
    />
  );
}

/** 0-4: length and variety of characters; enough to steer people away from "12345678". */
export function passwordScore(pw: string): number {
  if (pw.length < 8) return pw.length ? 1 : 0;
  let s = 1;
  if (pw.length >= 12) s++;
  if (/[a-zəöüğçşı]/.test(pw) && /[A-ZƏÖÜĞÇŞİ]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^\p{L}\d]/u.test(pw)) s++;
  else if (/\d/.test(pw) || /[^\p{L}\d]/u.test(pw)) s += 0.5;
  return Math.min(4, Math.floor(s));
}

const STRENGTH = ['', 'Zəif', 'Orta', 'Yaxşı', 'Güclü'];

export function PasswordStrength({ password }: { password: string }) {
  const score = passwordScore(password);
  if (!password) return null;
  return (
    <div className={`pw-meter s${score}`} aria-live="polite">
      <span className="pw-bars" aria-hidden="true"><i /><i /><i /><i /></span>
      <span className="tiny">{password.length < 8 ? `Ən azı 8 simvol (${password.length}/8)` : STRENGTH[score]}</span>
    </div>
  );
}

export function SubmitButton({ busy, children, busyText, className = 'primary', disabled }: { busy: boolean; children: ReactNode; busyText?: string; className?: string; disabled?: boolean }) {
  return (
    <button type="submit" className={`btn ${className} block btn-lg`} disabled={busy || disabled} aria-busy={busy}>
      {busy && <span className="btn-spinner" aria-hidden="true" />}
      {busy ? busyText ?? children : children}
    </button>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return <div className="form-error" role="alert">{children}</div>;
}
