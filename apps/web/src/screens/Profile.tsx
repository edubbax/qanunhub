import type { AwardDto, Category } from '@qanunhub/core';
import { ROMAN } from '@qanunhub/core';
import { useState } from 'react';
import { useApp } from '../app';
import { formatDate, Modal, Progress, toast } from '../ui/components';
import { IconDown, IconFlame, IconLogout, IconSettings, IconShield } from '../ui/icons';
import { ProfileForm } from './CompleteProfile';
import { BAS_GIZIR, Epaulette, GIZIR, MILITARY_RANKS, Medal } from '../ui/insignia';
import { RankHero } from '../ui/rank';

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
  const { api, me, meta, nav, refreshMe, profile, signOut } = useApp();
  const [theme, setTheme] = useState<Theme>(savedTheme);
  const [edit, setEdit] = useState(false);
  const [editName, setEditName] = useState(false);
  const [ladder, setLadder] = useState(false);
  const [award, setAward] = useState<AwardDto | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  if (!me) return null;
  const fmt = me.category && meta.formats ? meta.formats[me.category] : null;
  const earned = me.awards.filter((a) => a.tier > 0).length;

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
      <RankHero me={me} onPremium={() => nav({ name: 'premium' })} />

      <section className="kpi">
        <div className="card"><b className="row" style={{ gap: 4, color: 'var(--xp)' }}><span style={{ width: 20, display: 'inline-flex' }}><IconFlame /></span>{me.streak}</b><span>ardıcıl gün</span></div>
        <div className="card"><b>{me.rank.merit}</b><span>xidmət balı</span></div>
        <div className="card"><b>{me.xpTotal}</b><span>ümumi XP</span></div>
      </section>

      <section className="card stack">
        <button className="row between" style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', width: '100%' }} onClick={() => setLadder(!ladder)} aria-expanded={ladder}>
          <h2>Rütbə nərdivanı</h2>
          <span style={{ width: 20, transform: ladder ? 'rotate(180deg)' : undefined, display: 'inline-flex' }}><IconDown /></span>
        </button>
        <p className="small muted">
          Hər dərs və testdən gələn XP xidmət balına çevrilir; ardıcıl məşq etdikcə bal artır (30 günlük seriya ilə iki dəfə çox).
          Məşq etmədiyin hər gün rütbədən bal çıxılır və rütbə tədricən Kiçik leytenanta qədər enir. Ulduzların bitməsi və tələsik, oxumadan cavablar da bal aparır.
          Hazırda hamı Gizirdir; zabit rütbələri (Leytenantdan başlayaraq) Premium ilə açılacaq — tezliklə.
        </p>
        {ladder && (
          <div className="ladder">
            {[GIZIR, BAS_GIZIR, ...MILITARY_RANKS].map((r, i) => {
              const current = r.code === me.rank.code;
              const myLevel = MILITARY_RANKS.findIndex((x) => x.code === (me.rank.isGizir ? me.rank.earned?.code : me.rank.code));
              const above = r.code === 'gizir' ? false : r.code === 'bg' ? me.rank.isGizir : i - 2 > myLevel;
              return (
                <div key={r.code} className={`ladder-row ${current ? 'current' : ''} ${above ? 'above' : ''}`}>
                  <Epaulette code={r.code} size={78} />
                  <span className="stack" style={{ gap: 0 }}>
                    <b>{r.title}</b>
                    <span className="tiny muted">
                      {r.code === 'gizir' ? 'Pulsuz plan' : r.code === 'bg' ? 'Gizirdən sonrakı rütbə (Premium ilə — tezliklə)' : r.code === 'kl' ? 'Uzun fasilədən sonra enilən ən aşağı rütbə' : r.code === 'l' ? 'Premium ilə başlanğıc rütbə (tezliklə)' : `${r.minMerit} xidmət balı${r.minStreak ? ` · ${r.minStreak} günlük seriya` : ''}`}
                    </span>
                  </span>
                  {current && <span className="chip primary">Sən</span>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card stack">
        <div className="row between">
          <h2>Təltiflər</h2>
          <span className="chip xp">{earned} / {me.awards.length}</span>
        </div>
        <div className="awards">
          {me.awards.map((a) => (
            <button key={a.id} className={`award ${a.tier > 0 ? 'earned' : ''}`} onClick={() => setAward(a)}>
              <Medal shape={a.shape} color={a.color} tier={a.tier} earned={a.tier > 0} title={a.title} size={54} />
              <b>{a.title}</b>
              <span className="tiny muted">{a.tier > 0 ? `${ROMAN[a.tier - 1]} dərəcə` : 'Qazanılmayıb'}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card stack">
        <div className="row between">
          <h2>Şəxsi məlumat</h2>
          <button className="btn ghost small" onClick={() => setEditName(true)}>Dəyiş</button>
        </div>
        <div className="info-list">
          <div><span>Ad</span><span>{profile?.firstName ?? '—'}</span></div>
          <div><span>Soyad</span><span>{profile?.lastName ?? '—'}</span></div>
          <div><span>İstifadəçi adı</span><span>@{profile?.username ?? me.nickname}</span></div>
          <div><span>E-poçt</span><span>{me.email}</span></div>
        </div>
        <p className="tiny muted">Ad və soyad yarış sertifikatlarında yazılır. Reytinqdə yalnız istifadəçi adı görünür.</p>
      </section>

      <section className="card stack">
        <div className="row between">
          <h2>İmtahan</h2>
          <button className="btn ghost small" onClick={() => setEdit(true)}>Dəyiş</button>
        </div>
        <div className="info-list">
          <div><span>Kateqoriya</span><span>{me.category ? `${me.category}${fmt ? ` · ${fmt.kindTitle}` : ''}` : '—'}</span></div>
          {fmt && <div><span>Qanunvericilik bölməsi</span><span>{fmt.lawClosed} qapalı{fmt.lawOpen ? ` + ${fmt.lawOpen} açıq` : ''} · maks. {fmt.lawMax} bal</span></div>}
          <div><span>Alt qrup</span><span>{me.subgroup ? `${me.subgroup} · keçid ${meta.subgroups.find((x) => x.code === me.subgroup)?.passPercent ?? '—'}%` : 'seçilməyib'}</span></div>
          <div><span>İmtahan tarixi</span><span>{me.examDate ? formatDate(me.examDate) : 'bilinmir'}</span></div>
          <div><span>Gündəlik hədəf</span><span>{me.dailyGoal} dəqiqə</span></div>
        </div>
      </section>

      <section className="card stack">
        <div className="row between">
          <h2>Abunəlik</h2>
          {me.premium ? <span className="chip ok">Premium</span> : <span className="chip">Pulsuz</span>}
        </div>
        <p className="small muted">{me.premium ? `Premium ${formatDate(me.premiumUntil)} tarixinədək aktivdir. Bu ay seriyanı qoruyan günlər: ${me.freezesLeft}.` : 'Pulsuz planda Konstitusiya mövzusu açıqdır, paqonda gündə 3 ulduz var və rütbən Gizirdir.'}</p>
        <button className="btn secondary block" onClick={() => nav({ name: 'premium' })}>Premium — tezliklə</button>
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
              <span>Demo: bu hesaba admin hüququ ver (məzmun, şikayətlər, istifadəçilər, yarışlar).</span>
            </label>
          )}
          {me.role !== 'user' && <button className="btn secondary block" onClick={() => nav({ name: 'admin' })}><IconSettings />Admin panelini aç</button>}
        </section>
      )}

      <section className="stack">
        <button className="btn secondary block" onClick={() => nav({ name: 'certificate' })}>Sertifikatı yoxla</button>
        <button className="btn secondary block" onClick={signOut}><IconLogout />Çıxış</button>
        {api.demo && <button className="btn ghost" onClick={() => setConfirmReset(true)}>Demo məlumatlarını sıfırla</button>}
        <p className="tiny muted center">Məzmun versiyası {meta.contentVersion}. Tədris materialıdır, hüquqi məsləhət deyil. Qanunların rəsmi mətni: e-qanun.az.</p>
      </section>

      {edit && <ExamEdit onClose={() => setEdit(false)} />}
      {editName && <NameEdit onClose={() => setEditName(false)} />}
      {award && (
        <Modal onClose={() => setAward(null)}>
          <div className="row" style={{ gap: 14 }}>
            <Medal shape={award.shape} color={award.color} tier={award.tier} earned={award.tier > 0} title={award.title} size={84} />
            <div className="grow stack tight">
              <h2>{award.title}</h2>
              <span className="small muted">{award.tier > 0 ? `${ROMAN[award.tier - 1]} dərəcə · ${formatDate(award.earnedAt)}` : 'Hələ qazanılmayıb'}</span>
            </div>
          </div>
          {award.next != null ? (
            <div className="stack tight">
              <span className="small"><b>{award.tier > 0 ? 'Növbəti dərəcə' : 'Necə qazanılır'}:</b> {award.rule}.</span>
              <Progress value={(award.value / award.next) * 100} tone="xp" />
              <span className="tiny muted">{award.value} / {award.next}</span>
            </div>
          ) : (
            <span className="small">Bütün dərəcələr qazanılıb.</span>
          )}
          <button className="btn secondary block" onClick={() => setAward(null)}>Bağla</button>
        </Modal>
      )}
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

function NameEdit({ onClose }: { onClose: () => void }) {
  const { profile, setProfile } = useApp();
  return (
    <Modal onClose={onClose}>
      <h2>Şəxsi məlumat</h2>
      <p className="small muted">Artıq verilmiş sertifikatlar dəyişmir; yeni sertifikatlarda yeni ad yazılacaq.</p>
      <ProfileForm
        initial={profile ?? { firstName: null, lastName: null, username: null }}
        submitText="Yadda saxla"
        onSaved={(p) => { setProfile(p); toast('Yadda saxlanıldı.'); onClose(); }}
      />
      <button className="btn ghost block" onClick={onClose}>Ləğv et</button>
    </Modal>
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
          {meta.categories.map((c) => {
            const soon = meta.comingSoonCategories.includes(c);
            return <option key={c} value={c} disabled={soon}>{c}{meta.formats ? ` · ${meta.formats[c].kindTitle}` : ''}{soon ? ' (tezliklə)' : ''}</option>;
          })}
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
