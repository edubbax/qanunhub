import type { CompetitionDto } from '@qanunhub/core';
import { useEffect, useState } from 'react';
import { useApp } from '../app';
import { ErrorBox, Progress, Spinner, ordinal, toast, untilText, useLoad } from '../ui/components';
import { IconAlert, IconBook, IconChevron, IconExam, IconMail, IconMedal, IconPlay, IconRepeat, IconTrophy, IconWeak } from '../ui/icons';
import { LifeStars } from '../ui/insignia';
import { RankHero } from '../ui/rank';

export function Home() {
  const { api, auth, nav, setMe, meta } = useApp();
  const { data, error, loading, reload } = useLoad(() => api.home(), []);
  const [sent, setSent] = useState(false);
  const [live, setLive] = useState<CompetitionDto | null>(null);
  useEffect(() => { if (data) setMe(data.me); }, [data, setMe]);
  useEffect(() => {
    api.competitions().then((list) => setLive(list.find((c) => c.status === 'active') ?? null), () => {});
  }, [api]);
  if (loading && !data) return <main className="page"><Spinner /></main>;
  if (error || !data) return <main className="page"><ErrorBox error={error} onRetry={reload} /></main>;
  const h = data;
  const premium = h.me.premium;
  const hearts = h.me.hearts;
  const locked = hearts?.lockedUntil && hearts.lockedUntil > Date.now();
  const fmt = h.me.category && meta.formats ? meta.formats[h.me.category] : null;
  const goalPct = Math.min(100, (h.me.todayXp / Math.max(10, h.me.dailyGoal * 2)) * 100);

  return (
    <main className="page stack loose">
      <RankHero me={h.me} compact onPremium={() => nav({ name: 'premium' })} />

      {!h.me.emailVerified && api.mode === 'server' && (
        <div className="banner warn">
          <IconMail />
          <div className="grow stack tight">
            <span>E-poçt ünvanını təsdiqlə: reytinq, yarışlar və ödəniş bundan sonra açılır.</span>
            <button className="btn ghost small" style={{ alignSelf: 'flex-start', paddingInline: 0 }} disabled={sent} onClick={async () => { try { await auth.resendConfirmation(h.me.email); setSent(true); toast('Təsdiq məktubu yenidən göndərildi.'); } catch (e) { toast(e instanceof Error ? e.message : 'Göndərilmədi.'); } }}>
              {sent ? 'Göndərildi' : 'Məktubu yenidən göndər'}
            </button>
          </div>
        </div>
      )}

      {locked && (
        <div className="banner bad">
          <LifeStars current={0} size={22} />
          <div className="grow">Paqonda ulduz qalmayıb. Yeni dərslər {untilText(hearts!.lockedUntil!)} sonra açılacaq. Bu arada təkrar et: 10 sualdan 8-ni düzgün cavablandırsan, paqonuna 1 ulduz qayıdır.</div>
        </div>
      )}

      <section className="stack">
        <h2 className="group-title">Bu günün planı</h2>
        {h.nextLesson ? (
          <button className="tile" disabled={!!locked} onClick={() => nav({ name: 'session', kind: 'lesson', lessonId: h.nextLesson!.id, back: { name: 'home' } })}>
            <span className="ico"><IconPlay /></span>
            <span className="grow stack tight"><b>{h.nextLesson.title}</b><span className="small muted">Növbəti dərs · {h.nextLesson.topicTitle}</span></span>
            <IconChevron />
          </button>
        ) : (
          <button className="tile" onClick={() => nav({ name: premium ? 'path' : 'premium' })}>
            <span className="ico"><IconBook /></span>
            <span className="grow stack tight"><b>{premium ? 'Bütün dərslər keçilib' : 'Pulsuz mövzu bitdi'}</b><span className="small muted">{premium ? 'Bölmə və final testlərini, sınaq imtahanını yoxla.' : 'Qalan mövzular Premium planındadır.'}</span></span>
            <IconChevron />
          </button>
        )}
        {h.dueCount > 0 ? (
          <button className="tile" onClick={() => nav({ name: 'session', kind: 'review', back: { name: 'home' } })}>
            <span className="ico xp"><IconRepeat /></span>
            <span className="grow stack tight"><b>Gündəlik təkrar</b><span className="small muted">{Math.min(10, h.dueCount)} sual vaxtında təkrar gözləyir · ulduz xərcləmir</span></span>
            <IconChevron />
          </button>
        ) : h.learnedUnits > 0 && (
          <button className="tile" onClick={() => nav({ name: 'session', kind: 'review', back: { name: 'home' } })}>
            <span className="ico"><IconRepeat /></span>
            <span className="grow stack tight"><b>Əlavə məşq</b><span className="small muted">Ən zəif xatırladığın 10 sual</span></span>
            <IconChevron />
          </button>
        )}
        <div className="card flat stack tight">
          <div className="row between"><span className="small"><b>Gündəlik hədəf</b> · {h.me.dailyGoal} dəq</span><span className="small muted num">{h.me.todayXp} XP bu gün</span></div>
          <Progress value={goalPct} tone="xp" />
        </div>
      </section>

      {live && (
        <section className="stack">
          <h2 className="group-title">Yarış</h2>
          <button className="tile" onClick={() => nav({ name: 'competition', id: live.id })}>
            <span className="ico xp"><IconMedal /></span>
            <span className="grow stack tight">
              <b>{live.title}</b>
              <span className="small muted">{live.my ? `Nəticən: ${live.my.pct}%${live.my.place ? ` · ${ordinal(live.my.place)} yer` : ''}` : `${untilText(live.endsAt)} qalıb · ${live.participants} iştirakçı`}</span>
            </span>
            {!live.my && live.canStart && <span className="chip primary">Qoşul</span>}
            <IconChevron />
          </button>
        </section>
      )}

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
        <div className="info-list">
          <div><span>Yadda saxlanılmış suallar</span><span className="num">{h.learnedUnits} / {h.totalUnits}</span></div>
          <div><span>Final testi keçilmiş mövzular</span><span className="num">{h.topicsPassed} / {h.topicsTotal}</span></div>
          {h.examDaysLeft != null && <div><span>İmtahana qalıb</span><span className="num">{h.examDaysLeft} gün</span></div>}
        </div>
        <p className="tiny muted">Faiz təkrar cədvəlinə görə hesablanır: unudulmağa yaxın suallar faizi aşağı salır.</p>
      </section>

      <section className="stack">
        <h2 className="group-title">İmtahana hazırlıq</h2>
        <button className="tile" onClick={() => nav(premium ? { name: 'session', kind: 'mock', back: { name: 'home' } } : { name: 'premium' })}>
          <span className="ico ok"><IconExam /></span>
          <span className="grow stack tight">
            <b>Sınaq imtahanı</b>
            <span className="small muted">{fmt ? `Real format: ${fmt.lawClosed} qapalı${fmt.lawOpen ? ` + ${fmt.lawOpen} açıq` : ''} tapşırıq, ${fmt.lawMax} bal, vaxtla` : 'Real formatda, vaxtla'}</span>
          </span>
          {!premium ? <span className="chip">Premium</span> : <IconChevron />}
        </button>
        <button className="tile" onClick={() => nav({ name: premium ? 'weak' : 'premium' })}>
          <span className="ico bad"><IconWeak /></span>
          <span className="grow stack tight"><b>Zəif mövzular</b><span className="small muted">Ən çox səhv etdiyin normalar üzrə gücləndirmə</span></span>
          {!premium ? <span className="chip">Premium</span> : <IconChevron />}
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
          <div className="grow">Pulsuz planda Konstitusiya mövzusu tam açıqdır. Qalan mövzular, tükənməyən ulduzlar, zabit rütbələri və sınaq imtahanı Premium ilədir.</div>
        </div>
      )}
    </main>
  );
}
