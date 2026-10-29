import type { Category } from '@qanunhub/core';
import { useState } from 'react';
import { useApp } from '../app';
import { formatDate, Modal, Progress, toast } from '../ui/components';
import { IconFlame, IconSettings, IconShield, IconStar } from '../ui/icons';

type Theme = 'auto' | 'light' | 'dark';

// A host page (e.g. an embedding viewer) may set data-theme itself; "auto" restores its value.
const hostTheme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;

export function applyTheme(t: Theme) {
  if (t !== 'auto') document.documentElement.setAttribute('data-theme', t);
  else if (hostTheme) document.documentElement.setAttribute('data-theme', hostTheme);
  else document.documentElement.removeAttribute('data-theme');
}

export function savedTheme(): Theme {
  try {
    const t = localStorage.getItem('qanunhub-theme');
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

export function Profile() {
  const { api, me, meta, nav, setMe, refreshMe } = useApp();
  const [theme, setTheme] = useState<Theme>(savedTheme);
  const [edit, setEdit] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  if (!me) return null;
  const rank = me.rank;

  const changeTheme = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
    try {
      localStorage.setItem('qanunhub-theme', t);
    } catch {
      /* ignore */
    }
  };

  return (
    <main className="page stack loose">
      <section className="row">
        <span className="brand"><span className="mark" style={{ width: 48, height: 48, fontSize: '1.4rem', borderRadius: 14 }}>{me.nickname.slice(0, 1).toUpperCase()}</span></span>
        <span className="grow stack" style={{ gap: 0 }}>
          <h1 style={{ fontSize: '1.35rem' }}>{me.nickname}</h1>
          <span className="small muted">{me.email}</span>
        </span>
      </section>

      <section className="card stack">
        {rank ? (
          <>
            <div className="rank-badge">
              <span className="seal">{rank.code === 'ali' ? 'A' : rank.code.slice(1)}</span>
              <span className="stack tight grow">
                <span className="tiny muted">İxtisas dərəcəsi</span>
                <b style={{ fontSize: '1.15rem' }}>{rank.title}</b>
                {rank.nextTitle && <span className="small muted">Növbəti: {rank.nextTitle}</span>}
              </span>
            </div>
            {rank.nextTitle && (
              <div className="stack tight">
                <span className="small">Final testi keçilmiş mövzular: {rank.passedPct}% / {rank.nextPassedPct}%</span>
                <Progress value={rank.nextPassedPct ? (rank.passedPct / rank.nextPassedPct) * 100 : 100} tone="xp" />
                {rank.nextXp != null && <span className="small">XP: {me.xpTotal} / {rank.nextXp}</span>}
              </div>
            )}
          </>
        ) : (
          <div className="row">
            <span style={{ width: 28, color: 'var(--xp)', display: 'inline-flex' }}><IconStar /></span>
            <span className="grow small">Rütbələr (7-ci dərəcədən Ali dərəcəyə) Premium planında açılır.</span>
          </div>
        )}
      </section>

      <section className="kpi">
        <div className="card"><b className="row" style={{ gap: 4, color: 'var(--xp)' }}><span style={{ width: 20, display: 'inline-flex' }}><IconFlame /></span>{me.streak}</b><span>ardıcıl gün</span></div>
        <div className="card"><b>{me.longestStreak}</b><span>ən uzun seriya</span></div>
        <div className="card"><b>{me.premium ? me.freezesLeft : '—'}</b><span>dondurma qalıb</span></div>
      </section>

      <section className="card stack">
        <div className="row between">
          <h2>İmtahan</h2>
          <button className="btn ghost small" onClick={() => setEdit(true)}>Dəyiş</button>
        </div>
        <dl className="stack tight small" style={{ margin: 0 }}>
          <Row k="Kateqoriya" v={me.category ? `${me.category} · ${meta.formats[me.category].kindTitle}` : '—'} />
          <Row k="Alt qrup" v={me.subgroup ? `${me.subgroup} · keçid ${meta.subgroups.find((s) => s.code === me.subgroup)?.passPercent ?? '—'}%` : 'seçilməyib'} />
          <Row k="İmtahan tarixi" v={me.examDate ? formatDate(me.examDate) : 'bilinmir'} />
          <Row k="Gündəlik hədəf" v={`${me.dailyGoal} dəqiqə`} />
        </dl>
      </section>

      <section className="card stack">
        <div className="row between">
          <h2>Abunəlik</h2>
          {me.premium ? <span className="chip ok">Premium</span> : <span className="chip">Pulsuz</span>}
        </div>
        <p className="small muted">{me.premium ? `Premium ${formatDate(me.premiumUntil)} tarixinədək aktivdir.` : 'Pulsuz planda Konstitusiya mövzusu və gündə 3 can var.'}</p>
        <button className={`btn ${me.premium ? 'secondary' : 'primary'} block`} onClick={() => nav({ name: 'premium' })}>{me.premium ? 'Planı idarə et' : 'Premium-a keç'}</button>
      </section>

      <section className="card stack">
        <h2>Görünüş</h2>
        <div className="seg" role="group" aria-label="Tema">
          {(['auto', 'light', 'dark'] as Theme[]).map((t) => (
            <button key={t} className={theme === t ? 'on' : ''} onClick={() => changeTheme(t)}>{t === 'auto' ? 'Sistem' : t === 'light' ? 'İşıqlı' : 'Qaranlıq'}</button>
          ))}
        </div>
      </section>

      {(me.role !== 'user' || api.demo) && (
        <section className="card stack">
          <h2 className="row"><span style={{ width: 22, display: 'inline-flex' }}><IconShield /></span>Redaktor paneli</h2>
          {api.demo && (
            <label className="check">
              <input type="checkbox" checked={me.role === 'admin'} onChange={async (e) => { await api.demo!.setAdmin(e.target.checked); await refreshMe(); }} />
              <span>Demo: bu hesaba admin hüququ ver (məzmun redaktoru, şikayətlər, istifadəçilər).</span>
            </label>
          )}
          {me.role !== 'user' && <button className="btn secondary block" onClick={() => nav({ name: 'admin' })}><IconSettings />Admin panelini aç</button>}
        </section>
      )}

      <section className="stack">
        <button className="btn secondary block" onClick={async () => { await api.logout(); setMe(null); nav({ name: 'welcome' }, true); }}>Çıxış</button>
        {api.demo && <button className="btn ghost" onClick={() => setConfirmReset(true)}>Demo məlumatlarını sıfırla</button>}
        <p className="tiny muted center">Məzmun versiyası {meta.contentVersion}. Tədris materialıdır, hüquqi məsləhət deyil. Rəsmi mətn: e-qanun.az.</p>
      </section>

      {edit && <ExamEdit onClose={() => setEdit(false)} />}
      {confirmReset && (
        <Modal onClose={() => setConfirmReset(false)}>
          <h2>Demo sıfırlansın?</h2>
          <p className="muted">Bu brauzerdəki bütün demo hesabları, irəliləyiş və redaktələr silinəcək.</p>
          <button className="btn danger block" onClick={() => { api.demo!.reset(); window.location.reload(); }}>Sıfırla</button>
          <button className="btn secondary block" onClick={() => setConfirmReset(false)}>Ləğv et</button>
        </Modal>
      )}
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="row between" style={{ alignItems: 'baseline' }}>
      <dt className="muted">{k}</dt>
      <dd style={{ margin: 0, textAlign: 'right', fontWeight: 600 }}>{v}</dd>
    </div>
  );
}

function ExamEdit({ onClose }: { onClose: () => void }) {
  const { api, me, meta, setMe } = useApp();
  const [category, setCategory] = useState<Category>(me!.category!);
  const [subgroup, setSubgroup] = useState<string | null>(me!.subgroup);
  const [examDate, setExamDate] = useState(me!.examDate ?? '');
  const [dailyGoal, setDailyGoal] = useState(me!.dailyGoal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = category !== me!.category;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const m = await api.updateProfile({ ...(changed ? { category } : {}), subgroup, examDate: examDate || null, dailyGoal });
      setMe(m);
      toast('Yadda saxlanıldı.');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xəta baş verdi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2>İmtahan parametrləri</h2>
      <div className="field">
        <label htmlFor="pe-cat">Kateqoriya</label>
        <select id="pe-cat" className="input" value={category} onChange={(e) => { const c = e.target.value as Category; setCategory(c); if (subgroup && !subgroup.startsWith(c)) setSubgroup(null); }}>
          {meta.categories.map((c) => <option key={c} value={c}>{c} · {meta.formats[c].kindTitle}</option>)}
        </select>
        {changed && <span className="hint">Kateqoriyanı 30 gündə bir dəfə dəyişmək olar. Öyrəndiyin ortaq mövzular saxlanılır.</span>}
      </div>
      <div className="field">
        <label htmlFor="pe-sub">Alt qrup</label>
        <select id="pe-sub" className="input" value={subgroup ?? ''} onChange={(e) => setSubgroup(e.target.value || null)}>
          <option value="">Bilmirəm</option>
          {meta.subgroups.filter((s) => s.category === category).map((s) => <option key={s.code} value={s.code}>{s.code} · keçid {s.passPercent}%</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="pe-date">İmtahan tarixi</label>
        <input id="pe-date" className="input" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
      </div>
      <div className="field">
        <label>Gündəlik hədəf</label>
        <div className="seg" role="group" aria-label="Gündəlik hədəf">
          {[10, 15, 20, 30].map((m) => <button key={m} type="button" className={dailyGoal === m ? 'on' : ''} onClick={() => setDailyGoal(m)}>{m} dəq</button>)}
        </div>
      </div>
      {error && <div className="banner bad" role="alert">{error}</div>}
      <button className="btn primary block" disabled={busy} onClick={save}>Yadda saxla</button>
      <button className="btn secondary block" onClick={onClose}>Ləğv et</button>
    </Modal>
  );
}
