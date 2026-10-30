import type { Category } from '@qanunhub/core';
import { useState } from 'react';
import { useApp } from '../app';
import { ordinal } from '../ui/components';

const KIND: Record<Category, string> = {
  AB: 'İnzibati rəhbər vəzifələr',
  AC: 'İnzibati rəhbər vəzifələr',
  BA: 'İnzibati icraçı vəzifələr',
  BB: 'İnzibati icraçı vəzifələr',
};

const CAT_TEXT: Record<Category, string> = {
  AB: '4–5-ci təsnifat: şöbə və sektor müdirləri, onların müavinləri, regional bölmə rəhbərləri, rəhbərin müşaviri və köməkçisi.',
  AC: '5–7-ci təsnifat: yerli bölmə rəhbərləri, sektor müdirləri, tabe orqanların rəhbərləri və onların müavinləri.',
  BA: '4–5-ci təsnifat: baş, böyük və aparıcı məsləhətçilər, məsləhətçilər, baş mühasib, hakim köməkçisi, məhkəmə iclasının katibi.',
  BB: '6–7-ci təsnifat: baş, böyük və aparıcı məsləhətçilər, məsləhətçilər, baş mühasib, hakim köməkçisi, məhkəmə iclasının katibi.',
};

export function Onboarding() {
  const { api, meta, me, setMe, nav } = useApp();
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<Category | null>(me?.category ?? null);
  const [subgroup, setSubgroup] = useState<string | null>(me?.subgroup ?? null);
  const [examDate, setExamDate] = useState<string>(me?.examDate ?? '');
  const [dailyGoal, setDailyGoal] = useState<number>(me?.dailyGoal ?? 15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    if (!category) return;
    setBusy(true);
    setError(null);
    try {
      const m = await api.updateProfile({ category, subgroup, examDate: examDate || null, dailyGoal });
      setMe(m);
      nav({ name: 'home' }, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xəta baş verdi.');
    } finally {
      setBusy(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  return (
    <main className="page no-tabs stack loose">
      <div className="steps" aria-hidden="true">{[0, 1, 2].map((i) => <span key={i} className={i <= step ? 'on' : ''} />)}</div>

      {step === 0 && (
        <section className="stack">
          <div className="stack tight">
            <h1>Hansı kateqoriyaya hazırlaşırsan?</h1>
            <p className="muted">Dərslər, testlər və yarışlar seçdiyin kateqoriyanın proqramına uyğun qurulacaq.</p>
          </div>
          {meta.categories.map((c) => {
            const soon = meta.comingSoonCategories.includes(c);
            return (
              <button key={c} className={`choice ${category === c ? 'on' : ''}`} disabled={soon} onClick={() => { setCategory(c); if (subgroup && !subgroup.startsWith(c)) setSubgroup(null); }} aria-pressed={category === c}>
                <span className="code">{c}</span>
                <span className="stack tight grow">
                  <span className="row between"><b>{KIND[c]}</b>{soon && <span className="chip xp">Tezliklə</span>}</span>
                  <span className="small muted">{CAT_TEXT[c]}</span>
                </span>
              </button>
            );
          })}
          <button className="btn primary block" disabled={!category} onClick={() => setStep(1)}>Davam et</button>
        </section>
      )}

      {step === 1 && category && (
        <section className="stack">
          <div className="stack tight">
            <h1>Alt qrupun hansıdır?</h1>
            <p className="muted">Keçid balı alt qrupa görə 65–85% arasında dəyişir. Hazırlıq faizini bu hədəflə müqayisə edəcəyik.</p>
          </div>
          {meta.subgroups.filter((s) => s.category === category).map((s) => (
            <button key={s.code} className={`choice ${subgroup === s.code ? 'on' : ''}`} onClick={() => setSubgroup(s.code)} aria-pressed={subgroup === s.code}>
              <span className="code">{s.code}</span>
              <span className="stack tight grow">
                <span className="row between"><b>Keçid balı {s.passPercent}%</b><span className="chip">{ordinal(s.classification)} təsnifat</span></span>
                <span className="small muted">{s.positions.join(', ')}</span>
              </span>
            </button>
          ))}
          <div className="row">
            <button className="btn secondary" onClick={() => setStep(0)}>Geri</button>
            <button className="btn primary grow" onClick={() => setStep(2)}>{subgroup ? 'Davam et' : 'Bilmirəm, keç'}</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="stack">
          <div className="stack tight">
            <h1>İmtahan nə vaxtdır?</h1>
            <p className="muted">Tarix bilinirsə, təkrarlar elə planlanır ki, hər sual imtahandan əvvəl ən azı iki dəfə qarşına çıxsın.</p>
          </div>
          <div className="field">
            <label htmlFor="exam-date">İmtahan tarixi (istəyə bağlı)</label>
            <input id="exam-date" className="input" type="date" min={today} value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Gündəlik hədəf</label>
            <div className="seg" role="group" aria-label="Gündəlik hədəf">
              {[10, 15, 20, 30].map((m) => <button key={m} type="button" className={dailyGoal === m ? 'on' : ''} onClick={() => setDailyGoal(m)}>{m} dəq</button>)}
            </div>
            <span className="hint">Hədəfi istənilən vaxt profildə dəyişə bilərsən.</span>
          </div>
          {error && <div className="banner bad" role="alert">{error}</div>}
          <div className="row">
            <button className="btn secondary" onClick={() => setStep(1)}>Geri</button>
            <button className="btn primary grow" disabled={busy} onClick={finish}>Öyrənməyə başla</button>
          </div>
        </section>
      )}
    </main>
  );
}
