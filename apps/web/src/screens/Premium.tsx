// Premium is announced but not on sale yet: the page shows what it will include, with "Tezliklə" on every action.
import { useApp } from '../app';
import { comingSoon } from '../ui/components';
import { IconCheck, IconX } from '../ui/icons';

const FEATURES: [string, boolean, boolean][] = [
  ['Konstitusiya mövzusu (dərslər, təkrar, bölmə və final testləri)', true, true],
  ['Paqonda gündə 3 ulduz (səhvdə biri sönür)', true, false],
  ['Gizir rütbəsi və təltiflər', true, true],
  ['Həftəlik və aylıq reytinqdə iştirak', true, true],
  ['Yarışlar və PDF sertifikatlar', true, true],
  ['Kateqoriyanın bütün mövzuları', false, true],
  ['Ulduzlar tükənmir', false, true],
  ['Zabit rütbələri: Leytenantdan Ordu generalına qədər', false, true],
  ['Real formatda sınaq imtahanı (vaxtla)', false, true],
  ['Zəif mövzular üzrə gücləndirmə', false, true],
  ['Ayda 2 buraxılmış gün seriyanı qırmır', false, true],
  ['Final testinə 24 saat gözləmədən təkrar cəhd', false, true],
];

export function Premium() {
  const { meta } = useApp();
  return (
    <main className="page stack loose">
      <section className="premium-hero">
        <span className="soon-badge">Tezliklə</span>
        <h1>Premium</h1>
        <p>Bütün proqram, tükənməyən ulduzlar, zabit rütbələri və real formatda sınaq imtahanı. Premium hazırlanır və tezliklə açılacaq.</p>
        <p className="small">Hazırda hamı pulsuz planda öyrənir: Konstitusiya mövzusu tam açıqdır, rütbə — Gizir.</p>
      </section>

      <section className="stack">
        {meta.plans.map((p) => (
          <article key={p.id} className={`card stack ${p.id === 'exam3' ? 'accent' : ''}`}>
            <div className="row between">
              <h2>{p.title}</h2>
              <span className="chip soon-chip">Tezliklə</span>
            </div>
            <p className="small muted">{p.note}</p>
            <button className="btn secondary block" onClick={() => comingSoon(p.title)}>Tezliklə</button>
          </article>
        ))}
      </section>

      <section className="card flat" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
          <table className="data">
            <thead><tr><th>İmkan</th><th style={{ textAlign: 'center' }}>İndi</th><th style={{ textAlign: 'center' }}>Premium</th></tr></thead>
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
    </main>
  );
}
