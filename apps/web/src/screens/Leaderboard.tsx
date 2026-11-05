import type { Period, Scope } from '@qanunhub/core';
import { useState } from 'react';
import { rankByCode } from '@qanunhub/core';
import { useApp } from '../app';
import { Epaulette } from '../ui/insignia';
import { ErrorBox, Spinner, ordinal, untilText, useLoad } from '../ui/components';
import { IconLock, IconTrophy } from '../ui/icons';

export function Leaderboard() {
  const { api, me, nav } = useApp();
  const [period, setPeriod] = useState<Period>('week');
  const [scope, setScope] = useState<Scope>('ALL');
  const { data, error, loading, reload } = useLoad(() => api.leaderboard(period, scope), [period, scope]);
  const cat = me?.category ?? null;

  return (
    <main className="page stack">
      <section className="stack tight">
        <h1>Reytinq</h1>
        <p className="muted small">Yalnız dərs, təkrar və testlərdən qazanılan XP sayılır (gündə ən çox 600 XP). XP bərabər olduqda daha dəqiq cavab verən, sonra bu XP-yə daha tez çatan irəlidə olur.</p>
      </section>
      <div className="row wrap between">
        <div className="seg" role="group" aria-label="Dövr">
          <button className={period === 'week' ? 'on' : ''} onClick={() => setPeriod('week')}>Bu həftə</button>
          <button className={period === 'month' ? 'on' : ''} onClick={() => setPeriod('month')}>Bu ay</button>
        </div>
        <div className="seg" role="group" aria-label="Kateqoriya">
          <button className={scope === 'ALL' ? 'on' : ''} onClick={() => setScope('ALL')}>Hamısı</button>
          {cat && <button className={scope === cat ? 'on' : ''} onClick={() => setScope(cat)}>{cat}</button>}
        </div>
      </div>

      {loading && !data && <Spinner />}
      {error ? <ErrorBox error={error} onRetry={reload} /> : null}
      {data && (
        <>
          <p className="tiny muted">Dövr {untilText(data.periodEnd)} sonra bitir (Bakı vaxtı ilə).</p>

          {!data.eligible && (
            <div className="banner warn">
              <IconLock />
              <div className="grow stack tight">
                <span>
                  {me?.emailVerified ? 'Hesabın reytinqdə iştirakdan kənarlaşdırılıb.' : 'Reytinqdə iştirak üçün e-poçt ünvanını təsdiqlə.'}
                  {data.previewRank ? ` Bu dövrün XP-si ilə ${ordinal(data.previewRank)} yerdə olardın.` : ''}
                </span>
              </div>
            </div>
          )}

          {data.me && (
            <div className="card accent row">
              <span style={{ width: 28, color: 'var(--xp)', display: 'inline-flex' }}><IconTrophy /></span>
              <span className="grow"><b>Sənin yerin: {data.me.rank}</b></span>
              <span className="num"><b>{data.me.xp}</b> XP</span>
            </div>
          )}

          <section className="card flat" style={{ padding: 0, overflow: 'hidden' }}>
            {data.rows.length === 0 && <p className="empty">Bu dövrdə hələ heç kim XP qazanmayıb. İlk sən ol!</p>}
            {data.rows.map((r) => {
              const acc = r.answered ? Math.round((r.correct / r.answered) * 100) : 0;
              return (
                <div key={r.userId} className={`lb-row ${r.rank <= 3 ? 'top' : ''} ${r.userId === me?.id ? 'me' : ''}`}>
                  <span className="rank">{r.rank}</span>
                  <Epaulette code={r.rankCode ?? 'gizir'} size={30} />
                  <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                    <span className="name">{r.nickname}{r.userId === me?.id ? ' (sən)' : ''}</span>
                    <span className="tiny muted">{rankByCode(r.rankCode ?? 'gizir')?.title} · dəqiqlik {acc}%{r.sample ? ' · nümunə' : ''}</span>
                  </span>
                  <span className="num"><b>{r.xp}</b> <span className="tiny muted">XP</span></span>
                </div>
              );
            })}
          </section>
          {api.mode === 'demo' && <p className="tiny muted">Demo: cədvəldəki «nümunə istifadəçi»lər boş görünməsin deyə əlavə olunub.</p>}
        </>
      )}
    </main>
  );
}
