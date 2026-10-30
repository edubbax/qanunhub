// Competitions: list, standings with the podium, and certificates (download as PDF, public check by code).
import type { CertificateDto, CompetitionDto } from '@qanunhub/core';
import { useEffect, useState } from 'react';
import { useApp } from '../app';
import { ApiError } from '../api/types';
import { canvasToPdf, renderCertificate, saveFile } from '../ui/certificate';
import { ErrorBox, Modal, Spinner, formatDate, formatTime, ordinal, toast, untilText, useLoad } from '../ui/components';
import { IconBack, IconCalendar, IconClock, IconDownload, IconExam, IconInfo, IconMedal, IconUsers } from '../ui/icons';
import { Epaulette } from '../ui/insignia';

const STATUS: Record<CompetitionDto['status'], { label: string; tone: string }> = {
  active: { label: 'Davam edir', tone: 'ok' },
  upcoming: { label: 'Tezliklə', tone: 'primary' },
  finished: { label: 'Başa çatıb', tone: '' },
};

export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Competitions() {
  const { api, me } = useApp();
  const { data, error, loading, reload } = useLoad(() => api.competitions(), []);
  if (loading && !data) return <main className="page"><Spinner /></main>;
  if (error || !data) return <main className="page"><ErrorBox error={error} onRetry={reload} /></main>;
  const groups: [string, CompetitionDto[]][] = [
    ['Davam edən yarışlar', data.filter((c) => c.status === 'active')],
    ['Tezliklə', data.filter((c) => c.status === 'upcoming')],
    ['Başa çatmış yarışlar', data.filter((c) => c.status === 'finished')],
  ];
  return (
    <main className="page stack loose">
      <section className="stack tight">
        <h1>Yarışlar</h1>
        <p className="muted">Eyni sualları eyni vaxtda cavablandır. Hər yarışda bir cəhd verilir. Ən çox bal toplayan üç nəfər sertifikat və təltif alır; bal bərabər olduqda daha tez bitirən irəlidə olur.</p>
      </section>
      {!me?.fullName && (
        <div className="banner">
          <IconInfo />
          <div className="grow stack tight">
            <span>Sertifikatda adının düzgün yazılması üçün profildə ad və soyadını qeyd et. Hələlik ləqəbin yazılacaq.</span>
          </div>
        </div>
      )}
      {data.length === 0 && <div className="card empty">Hələ yarış elan olunmayıb. Yeni yarışlar burada görünəcək.</div>}
      {groups.map(([title, list]) => list.length > 0 && (
        <section key={title} className="stack">
          <h2 className="group-title">{title}</h2>
          {list.map((c) => <CompetitionCard key={c.id} c={c} />)}
        </section>
      ))}
    </main>
  );
}

function CompetitionCard({ c }: { c: CompetitionDto }) {
  const { nav } = useApp();
  const st = STATUS[c.status];
  return (
    <article className={c.status === 'active' ? 'hero-card comp-card' : 'card comp-card'}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <h2 style={{ fontSize: '1.15rem' }}>{c.title}</h2>
        <span className={`chip ${st.tone}`}>{st.label}</span>
      </div>
      {c.description && <p className="small muted">{c.description}</p>}
      <div className="comp-meta">
        <span className="chip"><IconExam />{c.questionCount} sual</span>
        <span className="chip"><IconClock />{Math.round(c.timeLimitSec / 60)} dəq</span>
        <span className="chip"><IconUsers />{c.participants} iştirakçı</span>
        <span className="chip">{c.category ?? 'Bütün kateqoriyalar'}</span>
      </div>
      <p className="small muted row" style={{ gap: 6 }}>
        <span style={{ width: 16, display: 'inline-flex' }}><IconCalendar /></span>
        {c.status === 'upcoming' ? `Başlayır: ${formatTime(c.startsAt)} (${untilText(c.startsAt)} sonra)` : c.status === 'active' ? `Bitir: ${formatTime(c.endsAt)} (${untilText(c.endsAt)} qalıb)` : `${formatDate(c.startsAt)} – ${formatDate(c.endsAt)}`}
      </p>
      {c.my && (
        <div className="row wrap">
          <span className="chip xp">Sənin nəticən: {c.my.pct}% · {duration(c.my.durationMs)}{c.my.place ? ` · ${ordinal(c.my.place)} yer` : ''}</span>
          {c.my.certificateCode && <span className="chip ok"><IconMedal />Sertifikat</span>}
        </div>
      )}
      {c.status === 'finished' && c.winners.length > 0 && (
        <p className="small">Qaliblər: {c.winners.map((w) => `${w.place}. ${w.nickname} (${w.pct}%)`).join(' · ')}</p>
      )}
      <div className="row wrap">
        {c.canStart && (
          <button className={`btn ${c.status === 'active' ? 'light' : 'primary'}`} onClick={() => nav({ name: 'session', kind: 'competition', competitionId: c.id, back: { name: 'competition', id: c.id } })}>
            Yarışa başla
          </button>
        )}
        <button className={`btn ${c.status === 'active' ? 'light' : 'secondary'} small`} onClick={() => nav({ name: 'competition', id: c.id })}>
          {c.status === 'upcoming' ? 'Ətraflı' : 'Nəticələr'}
        </button>
      </div>
      {!c.canStart && c.status === 'active' && c.reason && !c.my && <p className="small">{c.reason}</p>}
    </article>
  );
}

export function CompetitionScreen({ id }: { id: string }) {
  const { api, nav } = useApp();
  const { data, error, loading, reload } = useLoad(() => api.standings(id), [id]);
  const [cert, setCert] = useState<string | null>(null);
  if (loading && !data) return <main className="page"><Spinner /></main>;
  if (error || !data) return <main className="page"><ErrorBox error={error} onRetry={reload} /></main>;
  const c = data.competition;
  const podium = data.rows.slice(0, 3);
  return (
    <main className="page stack loose">
      <button className="btn ghost" style={{ alignSelf: 'flex-start', paddingInline: 0 }} onClick={() => nav({ name: 'competitions' })}><IconBack />Bütün yarışlar</button>
      <CompetitionCard c={c} />
      {c.my?.certificateCode && (
        <button className="btn primary block" onClick={() => setCert(c.my!.certificateCode)}><IconDownload />Sertifikatı yüklə (PDF)</button>
      )}
      {podium.length > 0 && c.status === 'finished' && (
        <section className="podium">
          {[podium[1], podium[0], podium[2]].map((r) => r && (
            <div key={r.place} className={`p${r.place}`}>
              <span className="place">{r.place}</span>
              <b className="small" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.nickname}</b>
              <span className="tiny muted">{r.pct}% · {duration(r.durationMs)}</span>
            </div>
          ))}
        </section>
      )}
      <section className="stack">
        <h2 className="group-title">Nəticələr cədvəli</h2>
        {data.rows.length === 0 ? (
          <div className="card empty">{c.status === 'upcoming' ? 'Yarış başlayanda nəticələr burada görünəcək.' : 'Hələ nəticə yoxdur. İlk sən ol!'}</div>
        ) : (
          <div className="card flat" style={{ padding: 0 }}>
            {data.rows.map((r) => (
              <div key={`${r.place}-${r.nickname}`} className={`st-row ${r.place <= 3 ? 'top' : ''} ${r.me ? 'me' : ''}`}>
                <span className="place">{r.place}</span>
                <Epaulette code={r.rankCode ?? 'gizir'} size={26} />
                <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>{r.nickname}{r.me ? ' (sən)' : ''}</span>
                <span className="small num" style={{ textAlign: 'right' }}><b>{r.pct}%</b><br /><span className="muted">{duration(r.durationMs)}</span></span>
              </div>
            ))}
          </div>
        )}
      </section>
      {cert && <CertificateModal code={cert} onClose={() => setCert(null)} />}
    </main>
  );
}

function verifyHint(api: ReturnType<typeof useApp>['api'], code: string): string {
  return api.mode === 'server' ? `Yoxlama: ${location.origin}/sertifikat?kod=${code}` : 'Yoxlama: QanunHub → «Sertifikatı yoxla»';
}

export function CertificateModal({ code, onClose, admin = false }: { code: string; onClose: () => void; admin?: boolean }) {
  const { api } = useApp();
  const [data, setData] = useState<{ cert: CertificateDto; url: string; pdf: Blob } | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let alive = true;
    (admin ? api.admin.certificate(code) : api.certificate(code)).then(async (cert) => {
      const canvas = await renderCertificate(cert, verifyHint(api, cert.code));
      if (!alive) return;
      setData({ cert, url: canvas.toDataURL('image/jpeg', 0.85), pdf: canvasToPdf(canvas, `QanunHub sertifikat ${cert.code}`) });
    }, (e) => alive && setError(e));
    return () => { alive = false; };
  }, [api, code, admin]);
  return (
    <Modal onClose={onClose}>
      <h2>Sertifikat</h2>
      {error ? <ErrorBox error={error} /> : !data ? <Spinner /> : (
        <>
          <img className="cert-preview" src={data.url} alt={`${data.cert.name} üçün sertifikat`} />
          <p className="small muted">Kod: <b>{data.cert.code}</b>. Sertifikatın həqiqiliyini bu kodla yoxlamaq olar.</p>
          <button className="btn primary block" onClick={async () => { if (await saveFile(data.pdf, `QanunHub-sertifikat-${data.cert.code}.pdf`)) toast('Sertifikat yükləndi.'); }}>
            <IconDownload />PDF kimi yüklə
          </button>
        </>
      )}
      <button className="btn secondary block" onClick={onClose}>Bağla</button>
    </Modal>
  );
}

/** Public page: check a certificate by its code. */
export function CertificateCheck({ code: initial }: { code?: string }) {
  const { api, nav, me } = useApp();
  const [code, setCode] = useState(initial ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CertificateDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const check = async (value: string) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.certificate(value.trim()));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Yoxlamaq alınmadı.');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { if (initial) check(initial); }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main className="page no-tabs stack loose">
      <button className="btn ghost" style={{ alignSelf: 'flex-start', paddingInline: 0 }} onClick={() => nav(me ? { name: 'competitions' } : { name: 'welcome' })}><IconBack />Geri</button>
      <section className="stack tight">
        <h1>Sertifikatı yoxla</h1>
        <p className="muted">QanunHub yarışlarında verilən sertifikatın kodunu daxil et (məsələn, QH-AB12-CD34).</p>
      </section>
      <form className="row" onSubmit={(e) => { e.preventDefault(); check(code); }}>
        <input className="input grow" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="QH-XXXX-XXXX" aria-label="Sertifikat kodu" />
        <button className="btn primary" disabled={busy || code.trim().length < 6}>Yoxla</button>
      </form>
      {error && <div className="banner bad" role="alert">{error}</div>}
      {result && (
        <section className="card stack">
          <div className="row"><span className="chip ok">Sertifikat həqiqidir</span></div>
          <div className="info-list">
            <div><span>Ad</span><span>{result.name}</span></div>
            <div><span>Yarış</span><span>{result.competitionTitle}</span></div>
            <div><span>Yer</span><span>{ordinal(result.place)} yer</span></div>
            <div><span>Nəticə</span><span>{result.pct}%</span></div>
            <div><span>Verilib</span><span>{formatDate(result.issuedAt)}</span></div>
          </div>
          {me && <button className="btn secondary" onClick={() => setOpen(true)}><IconDownload />Sertifikata bax</button>}
        </section>
      )}
      {open && result && <CertificateModal code={result.code} onClose={() => setOpen(false)} />}
    </main>
  );
}
