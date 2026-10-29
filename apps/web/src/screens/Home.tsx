import { useApp } from '../app';
import { ErrorBox, Progress, Spinner, untilText, useLoad } from '../ui/components';
import { IconAlert, IconBook, IconChevron, IconExam, IconHeart, IconMail, IconPlay, IconRepeat, IconTrophy, IconWeak } from '../ui/icons';
import { useEffect, useState } from 'react';
import { toast } from '../ui/components';

export function Home() {
  const { api, nav, setMe } = useApp();
  const { data, error, loading, reload } = useLoad(() => api.home(), []);
  const [sent, setSent] = useState(false);
  useEffect(() => { if (data) setMe(data.me); }, [data, setMe]);
  if (loading && !data) return <main className="page"><Spinner /></main>;
  if (error || !data) return <main className="page"><ErrorBox error={error} onRetry={reload} /></main>;
  const h = data;
  const premium = h.me.premium;
  const hearts = h.me.hearts;
  const locked = hearts?.lockedUntil && hearts.lockedUntil > Date.now();

  return (
    <main className="page stack loose">
      <section className="stack tight">
        <p className="muted small">Salam, {h.me.nickname}</p>
        <h1>{h.dueCount > 0 ? `Bu gün ${h.dueCount} sual təkrar gözləyir` : h.nextLesson ? 'Yeni dərsə hazırsan' : 'Bu günlük hamısı bitdi'}</h1>
        <div className="row wrap">
          <span className="chip primary">{h.me.category}{h.me.subgroup ? ` · ${h.me.subgroup}` : ''}</span>
          {h.examDaysLeft != null && <span className="chip xp">İmtahana {h.examDaysLeft} gün</span>}
          {!premium && <span className="chip">Pulsuz plan</span>}
          {premium && <span className="chip ok">Premium</span>}
        </div>
      </section>

      {!h.me.emailVerified && api.mode === 'server' && (
        <div className="banner warn">
          <IconMail />
          <div className="grow stack tight">
            <span>Email ünvanını təsdiqlə: reytinq və ödəniş bundan sonra açılır.</span>
            <button className="btn ghost small" style={{ alignSelf: 'flex-start', paddingInline: 0 }} disabled={sent} onClick={async () => { await api.resendVerification(); setSent(true); toast('Təsdiq məktubu yenidən göndərildi.'); }}>
              {sent ? 'Göndərildi' : 'Məktubu yenidən göndər'}
            </button>
          </div>
        </div>
      )}

      {locked && (
        <div className="banner bad">
          <IconHeart />
          <div className="grow">Canların bitib. Yeni dərslər {untilText(hearts!.lockedUntil!)} sonra açılacaq. Bu arada təkrar et: 10 sualdan 8-ni düz cavablasan, 1 can qazanırsan.</div>
        </div>
      )}

      <section className="stack">
        {h.dueCount > 0 && (
          <button className="tile" onClick={() => nav({ name: 'session', kind: 'review', back: { name: 'home' } })}>
            <span className="ico xp"><IconRepeat /></span>
            <span className="grow stack tight"><b>Gündəlik təkrar</b><span className="small muted">{Math.min(10, h.dueCount)} sual · təkrarlar can xərcləmir</span></span>
            <IconChevron />
          </button>
        )}
        {h.nextLesson ? (
          <button className="tile" disabled={!!locked} onClick={() => nav({ name: 'session', kind: 'lesson', lessonId: h.nextLesson!.id, back: { name: 'home' } })}>
            <span className="ico"><IconPlay /></span>
            <span className="grow stack tight"><b>{h.nextLesson.title}</b><span className="small muted">Növbəti dərs · {h.nextLesson.topicTitle}</span></span>
            <IconChevron />
          </button>
        ) : (
          <button className="tile" onClick={() => nav({ name: premium ? 'path' : 'premium' })}>
            <span className="ico"><IconBook /></span>
            <span className="grow stack tight"><b>{premium ? 'Bütün dərslər keçilib' : 'Pulsuz mövzu bitdi'}</b><span className="small muted">{premium ? 'Final testlərini və sınaq imtahanını yoxla.' : 'Qalan mövzular Premium planındadır.'}</span></span>
            <IconChevron />
          </button>
        )}
        {h.dueCount === 0 && h.learnedUnits + h.totalUnits > 0 && (
          <button className="tile" onClick={() => nav({ name: 'session', kind: 'review', back: { name: 'home' } })}>
            <span className="ico"><IconRepeat /></span>
            <span className="grow stack tight"><b>Əlavə məşq</b><span className="small muted">Ən zəif xatırladığın 10 sual</span></span>
            <IconChevron />
          </button>
        )}
      </section>

      <section className="card stack">
        <div className="row between">
          <h2>Hazırlıq</h2>
          <span className="chip">Hədəf {h.targetPercent}%</span>
        </div>
        <div className="row" style={{ alignItems: 'baseline', gap: 6 }}>
          <span className="readiness"><b>{h.readiness}%</b></span>
          <span className="muted small">qanunvericilik bölməsi üzrə</span>
        </div>
        <Progress value={h.readiness} target={h.targetPercent} tone={h.readiness >= h.targetPercent ? 'ok' : undefined} />
        <p className="small muted">
          Yadda saxlanılmış suallar: <b className="num">{h.learnedUnits}</b> / <span className="num">{h.totalUnits}</span>. Keçilmiş mövzular: <b className="num">{h.topicsPassed}</b> / <span className="num">{h.topicsTotal}</span>.
          Faiz təkrar cədvəlinə görə hesablanır: unudulmağa yaxın suallar faizi aşağı salır.
        </p>
      </section>

      <section className="kpi">
        <div className="card"><b>{h.me.todayXp}</b><span>bu gün XP</span></div>
        <div className="card"><b>{h.me.streak}</b><span>ardıcıl gün</span></div>
        <div className="card"><b>{h.me.xpTotal}</b><span>ümumi XP</span></div>
      </section>

      <section className="stack">
        <h2>Premium alətlər</h2>
        <button className="tile" onClick={() => nav(premium ? { name: 'session', kind: 'mock', back: { name: 'home' } } : { name: 'premium' })}>
          <span className="ico ok"><IconExam /></span>
          <span className="grow stack tight"><b>Sınaq imtahanı</b><span className="small muted">Real format: {h.me.category === 'AB' || h.me.category === 'BA' ? '32 qapalı + 8 açıq' : '40 qapalı'} sual, vaxtla</span></span>
          {!premium && <span className="chip">Premium</span>}
        </button>
        <button className="tile" onClick={() => nav({ name: premium ? 'weak' : 'premium' })}>
          <span className="ico bad"><IconWeak /></span>
          <span className="grow stack tight"><b>Zəif mövzular</b><span className="small muted">Ən çox səhv etdiyin normalara 15 dəqiqəlik gücləndirmə</span></span>
          {!premium && <span className="chip">Premium</span>}
        </button>
        <button className="tile" onClick={() => nav({ name: 'leaderboard' })}>
          <span className="ico xp"><IconTrophy /></span>
          <span className="grow stack tight"><b>Reytinq</b><span className="small muted">{premium ? 'Bu həftənin cədvəlində yerini gör' : 'Cədvələ baxa bilərsən, iştirak Premium ilədir'}</span></span>
          <IconChevron />
        </button>
      </section>

      {!premium && (
        <div className="banner">
          <IconAlert />
          <div className="grow">Pulsuz planda Konstitusiya mövzusu tam açıqdır. Digər {Math.max(0, h.topicsTotal - 1)} mövzu, limitsiz can və sınaq imtahanı Premium ilədir.</div>
        </div>
      )}
    </main>
  );
}
