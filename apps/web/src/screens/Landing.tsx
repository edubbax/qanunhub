// The public front page: what QanunHub is, how a lesson works, why it sticks, and a way in.
// Shown at "/" to visitors who are not signed in; signed-in learners go straight to the app.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import logoUrl from '../assets/logo.png';
import homeShot from '../assets/landing/home.webp';
import cardShot from '../assets/landing/m-card.webp';
import clozeShot from '../assets/landing/cloze-ok.webp';
import millinetBadge from '../assets/landing/millinet.webp';
import pathShot from '../assets/landing/path.webp';
import recapShot from '../assets/landing/m-recap.webp';
import { IconBook, IconCheck, IconClock, IconExam, IconFlame, IconMedal, IconRepeat, IconShield, IconTarget, IconTrophy, IconUsers } from '../ui/icons';
import { Epaulette } from '../ui/insignia';

interface Props {
  onStart: () => void;
  onLogin: () => void;
}

function Phone({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`lp-phone ${className}`}>
      <div className="lp-screen"><img src={src} alt={alt} loading="lazy" decoding="async" /></div>
    </div>
  );
}

function Section({ id, eyebrow, title, lead, children, tone }: { id?: string; eyebrow: string; title: ReactNode; lead?: ReactNode; children: ReactNode; tone?: 'dark' | 'soft' }) {
  return (
    <section id={id} className={`lp-section ${tone ? `lp-${tone}` : ''}`}>
      <div className="lp-inner">
        <div className="lp-head">
          <span className="lp-eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          {lead && <p className="lp-lead">{lead}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

const STATS: [string, string][] = [['18', 'qanun və məcəllə'], ['384', 'qısa dərs'], ['1 867', 'izah kartı'], ['3 700+', 'yoxlanılmış sual']];

const STEPS: { n: string; title: string; text: string; shot: string; alt: string }[] = [
  { n: '1', title: 'Öyrən', text: 'Qanunun öz mətni qısa kartlarda. Müddətlər, orqanlar və qadağalar rənglə seçilir, imtahanın ən çox soruşduğu maddələr nişanlanır.', shot: cardShot, alt: 'İzah kartı: Maddə 97' },
  { n: '2', title: 'Yoxla', text: 'Hər dərsin sonunda test sualları və qanunun öz cümləsindən rəqəm məşqi. Səhv etdiyin sual dərsin sonunda yenidən gəlir.', shot: clozeShot, alt: 'Rəqəm məşqi: düzgün cavab' },
  { n: '3', title: 'Yadda saxla', text: 'Yekunda dərsin əsas faktları və səhvlərin qanunun sözləri ilə. Sonra sistem həmin sualları vaxtında təkrara gətirir.', shot: recapShot, alt: 'Dərsin yekunu' },
];

const FEATURES: { icon: ReactNode; title: string; text: string }[] = [
  { icon: <IconRepeat />, title: 'Aralıqlı təkrar', text: 'Sual unudulmağa başlayanda yenidən qarşına çıxır: 10 dəqiqə, 1 gün, 3 gün, 7 gün… İmtahan tarixini yazsan, plan ona uyğunlaşır.' },
  { icon: <IconTarget />, title: 'Rəqəmlər və müddətlər', text: '«14 gün», «83 səs», «24 saat» — imtahanda ən çox çaşdıran rəqəmlərə ayrıca məşq.' },
  { icon: <IconExam />, title: 'Real formatda sınaq', text: 'Bölmə testi, mövzu final testi və vaxt sayğaclı sınaq imtahanı: 40 tapşırıq, 50 dəqiqə.' },
  { icon: <IconFlame />, title: 'Gündəlik seriya', text: 'Gündə 10–20 dəqiqə. Ardıcıl günlər seriya yaradır, ayda iki «dondurma» onu qoruyur.' },
  { icon: <IconUsers />, title: 'Reytinq və yarışlar', text: 'Həftəlik və aylıq lövhə, eyni suallarla yarışlar və qaliblərə yoxlanıla bilən PDF sertifikat.' },
  { icon: <IconShield />, title: 'Etibarlı məzmun', text: 'Cavab açarları qanunun mətni ilə yoxlanılıb, şübhəli suallar çıxarılıb. «Sualda səhv var» düyməsi həmişə açıqdır.' },
];

const RANKS: [string, string][] = [
  ['gizir', 'Gizir'], ['bg', 'Baş gizir'], ['kl', 'Kiçik leytenant'], ['l', 'Leytenant'], ['bl', 'Baş leytenant'], ['kapitan', 'Kapitan'],
  ['mayor', 'Mayor'], ['pl', 'Polkovnik-leytenant'], ['polkovnik', 'Polkovnik'], ['gm', 'General-mayor'], ['gl', 'General-leytenant'],
  ['gp', 'General-polkovnik'], ['og', 'Ordu generalı'],
];


// The MilliNet ad banner. The partner's script is loaded inside a sandboxed iframe (no same-origin access), so it
// can run but cannot read the learner's session. The frame reports its content height so it fits the banner.
const END = '<' + '/script>';
const BANNER_DOC =
  '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}body{display:flex;justify-content:center;overflow:hidden}</style></head><body>' +
  '<!--MilliNet --> <script type="text/javascript" src="https://millinet.az/">' + END +
  '<script>(function(){var send=function(){parent.postMessage({qhBannerHeight:Math.ceil(document.body.getBoundingClientRect().height)},"*")};' +
  'if(window.ResizeObserver)new ResizeObserver(send).observe(document.body);addEventListener("load",send);setInterval(send,1500);})();' + END +
  '</body></html>';

function MilliNetBanner() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  const [fallback, setFallback] = useState(false);
  // If the partner's script renders nothing (blocked, offline, wrong protocol), show the participant badge as a link.
  useEffect(() => {
    const t = window.setTimeout(() => setFallback(true), 5000);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const h = (e.data as { qhBannerHeight?: unknown } | null)?.qhBannerHeight;
      if (typeof h === 'number' && Number.isFinite(h)) setHeight(Math.max(0, Math.min(Math.round(h), 400)));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return (
    <aside className={`lp-ad ${height > 0 || fallback ? 'on' : ''}`} aria-label="MilliNet 2026">
      {fallback && height === 0 && (
        <a className="lp-millinet" href="http://millinet.az/site.php?id=842" target="_blank" rel="noopener noreferrer">
          <img src={millinetBadge} alt="MilliNet 2026 — Milli İnternet Mükafatı. İştirakçı" width={200} height={103} loading="lazy" />
        </a>
      )}
      <iframe
        ref={frame} title="Reklam" srcDoc={BANNER_DOC} style={{ height }}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      />
    </aside>
  );
}

export function Landing({ onStart, onLogin }: Props) {
  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-inner lp-nav-row">
          <a href="/" className="lp-brand" aria-label="QanunHub"><img src={logoUrl} alt="QanunHub" /></a>
          <nav className="lp-links" aria-label="Bölmələr">
            <a href="#nece-isleyir" onClick={go('nece-isleyir')}>Necə işləyir</a>
            <a href="#imkanlar" onClick={go('imkanlar')}>İmkanlar</a>
            <a href="#imtahan" onClick={go('imtahan')}>İmtahan</a>
          </nav>
          <div className="lp-nav-cta">
            <button className="btn ghost" onClick={onLogin}>Daxil ol</button>
            <button className="btn primary lp-hide-sm" onClick={onStart}>Pulsuz başla</button>
          </div>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-arc lp-arc-1" aria-hidden />
        <div className="lp-arc lp-arc-2" aria-hidden />
        <div className="lp-inner lp-hero-grid">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow lp-gold">Dövlət qulluğuna qəbul imtahanı · «Qanunvericilik» fənni</span>
            <h1>Qanunları əzbərləmə.<br /><em>Anla, yadda saxla, keç.</em></h1>
            <p className="lp-lead">
              QanunHub imtahanın qanunvericilik bölməsinə telefonda hazırlıqdır: qanunun öz mətnindən qısa dərslər,
              unutmağa qoymayan təkrar və real formatda sınaq imtahanı. Gündə 15 dəqiqə kifayətdir.
            </p>
            <div className="lp-cta-row">
              <button className="btn lp-btn-light" onClick={onStart}>Pulsuz başla</button>
              <button className="btn lp-btn-outline" onClick={onLogin}>Hesabım var</button>
            </div>
            <p className="lp-note"><IconCheck /> Konstitusiya dərsləri pulsuzdur · kart tələb olunmur</p>
            <div className="lp-stats">
              {STATS.map(([n, l]) => <div key={l}><b>{n}</b><span>{l}</span></div>)}
            </div>
          </div>
          <div className="lp-hero-art" aria-hidden>
            <Phone src={pathShot} alt="" className="lp-ph-left" />
            <Phone src={homeShot} alt="" className="lp-ph-mid" />
            <Phone src={clozeShot} alt="" className="lp-ph-right" />
          </div>
        </div>
      </section>

      <Section eyebrow="Tanış gəlir?" title={<>Qanunu oxuyursan, amma <em>yadda qalmır</em></>} tone="soft">
        <div className="lp-grid3">
          <div className="lp-card"><span className="lp-ic"><IconBook /></span><h3>Həcm çox böyükdür</h3><p>18 qanun və məcəllə, yüzlərlə maddə — hamısı bir imtahanda.</p></div>
          <div className="lp-card"><span className="lp-ic"><IconTarget /></span><h3>Rəqəmlər qarışır</h3><p>Müddətlər, səs sayları, faizlər — imtahanın ən sevdiyi tələ.</p></div>
          <div className="lp-card"><span className="lp-ic"><IconClock /></span><h3>Tez unudulur</h3><p>Bir dəfə oxunan mətnin böyük hissəsi bir neçə gündə yaddan çıxır.</p></div>
        </div>
      </Section>

      <Section id="nece-isleyir" eyebrow="Necə işləyir" title={<>Bir dərs — <em>10 dəqiqə</em></>} lead="Hər dərs 3–5 maddədir. Oxuduğun mətn dərhal yoxlanır, sonunda isə yalnız yadda saxlamalı olduğun qalır.">
        <div className="lp-steps">
          {STEPS.map((s) => (
            <article key={s.n} className="lp-step">
              <div className="lp-step-text"><span className="lp-num">{s.n}</span><div><h3>{s.title}</h3><p>{s.text}</p></div></div>
              <Phone src={s.shot} alt={s.alt} />
            </article>
          ))}
        </div>
      </Section>

      <Section id="imkanlar" eyebrow="İmkanlar" title={<>Öyrəndiyini <em>unutmağa qoymur</em></>} tone="soft">
        <div className="lp-grid3">
          {FEATURES.map((f) => (
            <div key={f.title} className="lp-card"><span className="lp-ic">{f.icon}</span><h3>{f.title}</h3><p>{f.text}</p></div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Motivasiya" title={<>Gizirdən <em>Ordu generalına</em></>} lead="Hər düz cavab və hər gün xidmət balı qazandırır. Bal yığıldıqca paqondakı ulduzlar artır; uzun fasilə versən, rütbə enə bilər — necə ki, xidmətdə.">
        <div className="lp-ranks" role="list">
          {RANKS.map(([code, title], i) => (
            <div key={code} className={`lp-rank ${i === 0 ? 'cur' : ''}`} role="listitem">
              <Epaulette code={code} size={92} />
              <span>{title}</span>
            </div>
          ))}
        </div>
        <div className="lp-split">
          <div className="lp-card lp-row"><span className="lp-ic"><IconMedal /></span><div><h3>12 təltif, 3 dərəcə</h3><p>Təlim nişanı, Dəqiq atıcı, Mövzu medalı, Dəmir iradə, Sınaq qəhrəmanı, Yarış qalibi…</p></div></div>
          <div className="lp-card lp-row"><span className="lp-ic"><IconTrophy /></span><div><h3>Həftəlik reytinq</h3><p>Ümumi və öz kateqoriyan üzrə lövhə. Botvari sürətli cavablar sayılmır.</p></div></div>
        </div>
        <p className="lp-foot-note">Hamı Gizir rütbəsindən başlayır · zabit rütbələri Premium ilə açılacaq — tezliklə</p>
      </Section>

      <Section id="imtahan" eyebrow="İmtahana hazırlıq" title={<>Real imtahan <em>formatında</em> yoxla</>} lead="Hər mövzu addım-addım bağlanır: dərslərdən sonra bölmə testi, sonra final testi. Sınaq imtahanı kateqoriyanın real formatını və alt qrupunun keçid faizini təkrarlayır." tone="dark">
        <div className="lp-flow">
          {[
            ['Dərslər', '3–5 maddə, izah kartları', ['21 mövzu', '71 bölmə']],
            ['Bölmə testi', 'rəsmi mənbə sualları', ['10 sual', 'keçid 80%']],
            ['Mövzu final testi', 'bütün mövzu üzrə', ['20 sual', 'keçid 80%']],
            ['Sınaq imtahanı', 'vaxt sayğacı ilə', ['40 tapşırıq', '50 dəqiqə']],
          ].map(([t, s, k], i) => (
            <div key={t as string} className={`lp-flow-step ${i === 3 ? 'fin' : ''}`}>
              <span className="lp-flow-n">{i + 1}</span>
              <h3>{t}</h3><p>{s}</p>
              <div className="lp-chips">{(k as string[]).map((c) => <span key={c}>{c}</span>)}</div>
            </div>
          ))}
        </div>
        <div className="lp-formats">
          <div className="lp-fmt"><div className="lp-cats"><span>AB</span><span>BA</span></div><b>48 <small>bal</small></b><p>32 qapalı + 8 açıq tapşırıq</p></div>
          <div className="lp-fmt"><div className="lp-cats"><span>AC</span><span>BB</span></div><b>40 <small>bal</small></b><p>40 qapalı tapşırıq</p></div>
          <div className="lp-fmt"><div className="lp-cats"><span>%</span></div><b>65–85%</b><p>alt qrupuna görə keçid faizi</p></div>
        </div>
        <p className="lp-foot-note">Hazırda AC, BA və BB kateqoriyaları açıqdır · AB — tezliklə</p>
      </Section>

      <section className="lp-final">
        <div className="lp-inner lp-final-box">
          <img src={logoUrl} alt="" className="lp-final-logo" />
          <h2>Bu gün başla.</h2>
          <p>Konstitusiya dərsləri pulsuzdur. Qeydiyyat bir dəqiqə çəkir.</p>
          <div className="lp-cta-row center">
            <button className="btn lp-btn-light" onClick={onStart}>Pulsuz başla</button>
            <button className="btn lp-btn-outline" onClick={onLogin}>Daxil ol</button>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-inner lp-footer-row">
          <img src={logoUrl} alt="QanunHub" className="lp-footer-logo" />
          <MilliNetBanner />
          <p className="lp-founder">Təsisçi - Ömər Heydər</p>
          <p className="lp-small">© {new Date().getFullYear()} QanunHub · Qanunların rəsmi mətni: e-qanun.az</p>
        </div>
      </footer>
    </div>
  );
}
