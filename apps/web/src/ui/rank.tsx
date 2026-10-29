// Rank card used on Home and Profile: the shoulder board, the rank's name and progress to the next one.
import type { MeDto } from '@qanunhub/core';
import { Progress } from './components';
import { Epaulette } from './insignia';

export function RankHero({ me, compact = false, onPremium }: { me: MeDto; compact?: boolean; onPremium?: () => void }) {
  const r = me.rank;
  const span = r.next ? r.next.merit - r.floorMerit : 1;
  const pct = r.next ? Math.max(0, Math.min(100, ((r.merit - r.floorMerit) / span) * 100)) : 100;
  return (
    <section className="hero-card stack">
      <div className="rank-line">
        <Epaulette code={r.code} size={compact ? 64 : 84} />
        <div className="grow stack tight">
          <span className="small">{me.fullName || me.nickname}</span>
          <span className="rank-title">{r.title}</span>
          {r.isGizir ? (
            <span className="small">Premium ilə zabit rütbələri açılır{r.earned ? `: qazandığın rütbə — ${r.earned.title}` : ''}.</span>
          ) : r.next ? (
            <span className="small">Növbəti: {r.next.title} · {Math.max(0, r.next.merit - r.merit)} xidmət balı{r.next.streak ? ` və ${r.next.streak} günlük seriya` : ''}</span>
          ) : (
            <span className="small">Ən yüksək rütbə. Onu qorumaq üçün hər gün məşq et.</span>
          )}
        </div>
      </div>
      {!r.isGizir && r.next && <Progress value={pct} />}
      {!compact && !r.isGizir && r.inactiveDays > 0 && (
        <span className="small">Diqqət: {r.inactiveDays} gündür məşq yoxdur. Hər buraxılan gün rütbədən {r.decayPerDay} bal çıxır.</span>
      )}
      {r.isGizir && onPremium && <button className="btn light small" style={{ alignSelf: 'flex-start' }} onClick={onPremium}>Rütbələrə bax</button>}
    </section>
  );
}
