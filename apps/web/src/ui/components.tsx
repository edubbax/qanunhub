import logoUrl from '../assets/logo.png';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Yüklənir" />;
}

/** Full-screen loading state with the brand, while the session and the account are being read. */
export function Splash() {
  return (
    <div className="splash" role="status" aria-label="Yüklənir">
      <img src={logoUrl} alt="" />
      <span className="splash-bar"><span /></span>
    </div>
  );
}

export function Progress({ value, target, tone }: { value: number; target?: number; tone?: 'ok' | 'xp' }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`progress ${tone ?? ''}`} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${v}%` }} />
      {target != null && <i className="target" style={{ left: `calc(${target}% - 1px)` }} title={`Hədəf ${target}%`} />}
    </div>
  );
}

export function Ring({ value, label, tone }: { value: number; label?: string; tone?: string }) {
  return (
    <div className="ring" style={{ ['--p' as string]: Math.round(value), ...(tone ? { ['--c' as string]: tone } : {}) }}>
      <span>{label ?? `${Math.round(value)}%`}</span>
    </div>
  );
}

export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true">{children}</div>
    </div>
  );
}

let toastSetter: ((m: string | null) => void) | null = null;
export function toast(message: string) {
  toastSetter?.(message);
}
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    toastSetter = setMsg;
    return () => { toastSetter = null; };
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3200);
    return () => clearTimeout(t);
  }, [msg]);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

// "Tezliklə": Premium is announced but not on sale. Any Premium entry point opens this notice instead.
let soonSetter: ((feature: string | null) => void) | null = null;
export function comingSoon(feature = 'Premium') {
  soonSetter?.(feature);
}
export function ComingSoonHost() {
  const [feature, setFeature] = useState<string | null>(null);
  useEffect(() => {
    soonSetter = setFeature;
    return () => { soonSetter = null; };
  }, []);
  if (!feature) return null;
  return (
    <Modal onClose={() => setFeature(null)}>
      <div className="soon">
        <span className="soon-badge">Tezliklə</span>
        <h2>{feature}</h2>
        <p className="muted">Premium imkanları hazırlanır və tezliklə açılacaq. Hazırda hamı pulsuz planda öyrənir: Konstitusiya mövzusu tam açıqdır, paqonda gündə 3 ulduz var, rütbə — Gizir.</p>
      </div>
      <button className="btn primary block" onClick={() => setFeature(null)} autoFocus>Aydındır</button>
    </Modal>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Gözlənilməz xəta baş verdi.';
  return (
    <div className="card flat stack center">
      <p>{message}</p>
      {onRetry && <button className="btn secondary" onClick={onRetry}>Yenidən cəhd et</button>}
    </div>
  );
}

/** Loads data with a promise-returning function; re-runs when deps change. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (error) => alive && setState({ data: null, error, loading: false }),
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];
const MONTHS_SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];
const BAKU_MS = 4 * 3600_000;

// Formatted by hand in Baku time: browsers without full ICU data print Azerbaijani dates as "2026 M12 28".
export function formatDate(ts: number | string | null | undefined): string {
  if (ts == null) return '—';
  const d = typeof ts === 'string' ? new Date(ts + 'T00:00:00Z') : new Date(ts + BAKU_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatTime(ts: number): string {
  const d = new Date(ts + BAKU_MS);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}, ${hh}:${mm}`;
}

export function untilText(ts: number, now = Date.now()): string {
  const total = Math.max(1, Math.ceil(Math.max(0, ts - now) / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h >= 24) return `${Math.floor(h / 24)} gün ${h % 24} saat`;
  if (h > 0) return m ? `${h} saat ${m} dəq` : `${h} saat`;
  return `${m} dəq`;
}

const UNITS: Record<number, string> = { 1: 'ci', 2: 'ci', 3: 'cü', 4: 'cü', 5: 'ci', 6: 'cı', 7: 'ci', 8: 'ci', 9: 'cu' };
const TENS: Record<number, string> = { 1: 'cu', 2: 'ci', 3: 'cu', 4: 'cı', 5: 'ci', 6: 'cı', 7: 'ci', 8: 'ci', 9: 'cı' };

/** Azerbaijani ordinal: 1-ci, 3-cü, 6-cı, 9-cu, 10-cu, 40-cı, 100-cü (the suffix follows the last vowel). */
export function ordinal(n: number): string {
  const u = n % 10;
  const t = Math.floor(n / 10) % 10;
  const s = u ? UNITS[u] : t ? TENS[t] : n % 1000 === 0 ? 'ci' : 'cü';
  return `${n}-${s}`;
}
