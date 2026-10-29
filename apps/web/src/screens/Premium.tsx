import { useState } from 'react';
import { useApp } from '../app';
import { ApiError } from '../api/types';
import { formatDate, Modal, toast } from '../ui/components';
import { IconCheck, IconX } from '../ui/icons';
import type { Plan } from '../api/types';

const FEATURES: [string, boolean, boolean][] = [
  ['Konstitusiya mövzusu (dərslər, təkrar, final testi)', true, true],
  ['Kateqoriyanın bütün mövzuları', false, true],
  ['Paqonda gündə 3 ulduz (səhvdə biri sönür)', true, false],
  ['Ulduzlar tükənmir', false, true],
  ['Real formatda sınaq imtahanı (vaxtla)', false, true],
  ['Zəif mövzular üzrə gücləndirmə', false, true],
  ['Həftəlik və aylıq reytinqdə iştirak', false, true],
  ['Zabit rütbələri: Leytenantdan Ordu generalına qədər (pulsuz planda Gizir)', false, true],
  ['Yarışlar, təltiflər və sertifikatlar', true, true],
  ['Ayda 2 seriya dondurma', false, true],
  ['Final testinə 24 saat gözləmədən təkrar cəhd', false, true],
];

export function Premium() {
  const { api, me, meta, refreshMe, nav } = useApp();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const buy = async (p: Plan) => {
    setBusy(true);
    setNotice(null);
    try {
      await api.checkout(p.id);
      await refreshMe();
      setPlan(null);
      toast('Premium aktivləşdi.');
      nav({ name: 'home' });
    } catch (e) {
      setPlan(null);
      if (e instanceof ApiError && e.code === 'NOT_IMPLEMENTED') setNotice(e.message);
      else toast(e instanceof Error ? e.message : 'Xəta baş verdi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page stack loose">
      <section className="stack tight">
        <h1>Premium</h1>
        <p className="muted">Bütün proqram, tükənməyən ulduzlar, zabit rütbələri və real formatda sınaq imtahanı. İmtahana qədər lazım olan hər şey.</p>
      </section>

      {me?.premium && (
        <div className="banner"><IconCheck /><span>Premium {formatDate(me.premiumUntil)} tarixinədək aktivdir. Yeni plan alınarsa, müddət ona əlavə olunur.</span></div>
      )}
      {notice && <div className="banner warn" role="status">{notice}</div>}

      <section className="stack">
        {meta.plans.map((p) => (
          <article key={p.id} className={`card stack ${p.id === 'exam3' ? 'accent' : ''}`}>
            <div className="row between">
              <h2>{p.title}</h2>
              {p.id === 'exam3' && <span className="chip xp">Ən sərfəli</span>}
            </div>
            <div className="row" style={{ alignItems: 'baseline', gap: 6 }}>
              <b style={{ fontSize: '2rem', fontWeight: 800 }} className="num">{p.priceAzn.toFixed(2)}</b>
              <span className="muted">AZN {p.recurring ? '/ ay' : `/ ${p.months} ay`}</span>
            </div>
            <p className="small muted">{p.note}</p>
            <button className={`btn ${p.id === 'exam3' ? 'primary' : 'secondary'} block`} onClick={() => setPlan(p)}>Seç</button>
          </article>
        ))}
      </section>

      <section className="card flat" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
          <table className="data">
            <thead><tr><th>İmkan</th><th style={{ textAlign: 'center' }}>Pulsuz</th><th style={{ textAlign: 'center' }}>Premium</th></tr></thead>
            <tbody>
              {FEATURES.map(([f, free, prem]) => (
                <tr key={f}>
                  <td>{f}</td>
                  <td style={{ textAlign: 'center', color: free ? 'var(--ok)' : 'var(--muted)' }}><span style={{ width: 18, display: 'inline-flex' }}>{free ? <IconCheck /> : <IconX />}</span></td>
                  <td style={{ textAlign: 'center', color: prem ? 'var(--ok)' : 'var(--muted)' }}><span style={{ width: 18, display: 'inline-flex' }}>{prem ? <IconCheck /> : <IconX />}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="tiny muted">Aylıq abunəni istənilən vaxt ləğv etmək olar, ödənilmiş dövrün sonunadək Premium qalır. Vergi və pulun qaytarılması şərtləri ödəniş sistemi qoşularkən dəqiqləşəcək.</p>

      {plan && (
        <Modal onClose={() => !busy && setPlan(null)}>
          <h2>{plan.title} · {plan.priceAzn.toFixed(2)} AZN</h2>
          {api.mode === 'demo' ? (
            <p className="muted">Demo rejimi: ödəniş simulyasiya olunur, kart məlumatı soruşulmur. Premium dərhal {plan.months * 30} günlük aktivləşəcək.</p>
          ) : (
            <p className="muted">Ödəniş səhifəsinə yönləndiriləcəksən. Kart məlumatı QanunHub-da saxlanılmır.</p>
          )}
          <button className="btn primary block" disabled={busy} onClick={() => buy(plan)}>{api.mode === 'demo' ? 'Demo ödənişi təsdiqlə' : 'Ödənişə keç'}</button>
          <button className="btn secondary block" disabled={busy} onClick={() => setPlan(null)}>Ləğv et</button>
        </Modal>
      )}
    </main>
  );
}
