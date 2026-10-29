// Shoulder boards for the military ranks, the three-star "lives" board and award medals, drawn as SVG.
import { GIZIR, MILITARY_RANKS, ROMAN, rankByCode, type MilitaryRank } from '@qanunhub/core';
import { useId } from 'react';

const GOLD = '#c9a646';
const GOLD_DARK = '#9c7c2c';
const MAROON = '#4a0e17';
const MAROON_LIGHT = '#6b1a26';

function starPath(cx: number, cy: number, r: number, points = 5, inner = 0.42): string {
  const step = Math.PI / points;
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = -Math.PI / 2 + i * step;
    d += `${i === 0 ? 'M' : 'L'}${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
  }
  return d + 'Z';
}

/** Stylised state emblem for the highest rank: an eight-pointed star with a flame inside a ring. */
function Emblem({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={MAROON} stroke={GOLD_DARK} strokeWidth={1} />
      <path d={starPath(cx, cy, r * 0.82, 8, 0.72)} fill={GOLD} stroke={GOLD_DARK} strokeWidth={0.6} />
      <circle cx={cx} cy={cy} r={r * 0.36} fill="#1f6fb2" />
      <path d={`M${cx},${cy - r * 0.3} C${cx + r * 0.22},${cy - r * 0.05} ${cx + r * 0.12},${cy + r * 0.2} ${cx},${cy + r * 0.24} C${cx - r * 0.12},${cy + r * 0.2} ${cx - r * 0.22},${cy - r * 0.05} ${cx},${cy - r * 0.3}Z`} fill="#e64a3b" />
    </g>
  );
}

function stars(rank: MilitaryRank): { x: number; y: number; r: number }[] {
  const c = 30;
  switch (rank.code) {
    case 'gizir': return [{ x: c, y: 92, r: 5 }, { x: c, y: 76, r: 5 }];
    case 'kl': return [{ x: c, y: 84, r: 5.2 }];
    case 'l': return [{ x: c - 11, y: 90, r: 5.2 }, { x: c + 11, y: 90, r: 5.2 }];
    case 'bl': return [{ x: c - 11, y: 92, r: 5.2 }, { x: c + 11, y: 92, r: 5.2 }, { x: c, y: 76, r: 5.2 }];
    case 'kapitan': return [{ x: c - 11, y: 94, r: 5.2 }, { x: c + 11, y: 94, r: 5.2 }, { x: c, y: 79, r: 5.2 }, { x: c, y: 64, r: 5.2 }];
    case 'mayor': return [{ x: c, y: 82, r: 7.5 }];
    case 'pl': return [{ x: c - 13, y: 88, r: 7.5 }, { x: c + 13, y: 88, r: 7.5 }];
    case 'polkovnik': return [{ x: c - 13, y: 92, r: 7.5 }, { x: c + 13, y: 92, r: 7.5 }, { x: c, y: 70, r: 7.5 }];
    case 'gm': return [{ x: c, y: 84, r: 10 }];
    case 'gl': return [{ x: c, y: 92, r: 9.5 }, { x: c, y: 66, r: 9.5 }];
    case 'gp': return [{ x: c, y: 96, r: 9 }, { x: c, y: 74, r: 9 }, { x: c, y: 52, r: 9 }];
    case 'og': return [{ x: c, y: 94, r: 12 }];
    default: return [];
  }
}

/** A vertical shoulder board for a rank code ("gizir", "l", "polkovnik", "og", ...). */
export function Epaulette({ code, size = 48, title }: { code: string; size?: number; title?: string }) {
  const id = useId().replace(/:/g, '');
  const rank = rankByCode(code) ?? GIZIR;
  const general = rank.tier === 'general' || rank.tier === 'army';
  const outline = 'M6,30 L30,6 L54,30 L54,112 Q54,118 48,118 L12,118 Q6,118 6,112 Z';
  const label = title ?? rank.title;
  return (
    <svg viewBox="0 0 60 124" width={size * (60 / 124)} height={size} role="img" aria-label={label} className="epaulette">
      <title>{label}</title>
      <defs>
        <linearGradient id={`f${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={general ? '#b8923a' : MAROON} />
          <stop offset="0.5" stopColor={general ? '#e2c470' : MAROON_LIGHT} />
          <stop offset="1" stopColor={general ? '#b8923a' : MAROON} />
        </linearGradient>
        <pattern id={`z${id}`} width="10" height="8" patternUnits="userSpaceOnUse">
          <path d="M0,6 L5,2 L10,6" fill="none" stroke={GOLD_DARK} strokeWidth="1.1" opacity="0.6" />
        </pattern>
        <clipPath id={`c${id}`}><path d={outline} /></clipPath>
      </defs>
      <path d={outline} fill={`url(#f${id})`} stroke={general ? GOLD_DARK : GOLD} strokeWidth="2" />
      <g clipPath={`url(#c${id})`}>
        {general && <rect x="0" y="0" width="60" height="124" fill={`url(#z${id})`} />}
        {rank.tier === 'junior' && <rect x="28" y="14" width="4" height="106" fill={GOLD} opacity="0.9" />}
        {rank.tier === 'senior' && (<><rect x="22" y="14" width="3.5" height="106" fill={GOLD} opacity="0.9" /><rect x="34.5" y="14" width="3.5" height="106" fill={GOLD} opacity="0.9" /></>)}
      </g>
      <circle cx="30" cy="22" r="5" fill={general ? MAROON : GOLD} stroke={general ? '#2e080e' : GOLD_DARK} strokeWidth="1" />
      {stars(rank).map((s, i) => (
        <path key={i} d={starPath(s.x, s.y, s.r)} fill={general ? '#e9e4e6' : GOLD} stroke={general ? '#8d8689' : GOLD_DARK} strokeWidth="0.8" />
      ))}
      {rank.code === 'og' && <Emblem cx={30} cy={60} r={14} />}
    </svg>
  );
}

/** The free plan's "lives": a horizontal shoulder board with three stars; lost stars are dimmed. */
export function LifeStars({ current, max = 3, infinite = false, size = 28 }: { current: number; max?: number; infinite?: boolean; size?: number }) {
  const label = infinite ? 'Premium: ulduzlar tükənmir' : `Ulduzlar: ${current} / ${max}`;
  const w = 26 + max * 22;
  return (
    <svg viewBox={`0 0 ${w} 30`} height={size} width={(size * w) / 30} role="img" aria-label={label} className="life-stars">
      <title>{label}</title>
      <path d={`M3,4 L${w - 14},4 L${w - 3},15 L${w - 14},26 L3,26 Q1,26 1,24 L1,6 Q1,4 3,4Z`} fill={MAROON} stroke={GOLD} strokeWidth="1.5" />
      <circle cx={w - 13} cy="15" r="3.6" fill={GOLD} />
      {Array.from({ length: max }, (_, i) => {
        const on = infinite || i < current;
        return <path key={i} d={starPath(14 + i * 22, 15, 8.2)} fill={on ? GOLD : 'none'} stroke={on ? GOLD_DARK : '#b98f96'} strokeWidth={on ? 0.8 : 1.2} opacity={on ? 1 : 0.7} />;
      })}
    </svg>
  );
}

const MEDAL: Record<string, { main: string; dark: string; ribbon: [string, string, string] }> = {
  gold: { main: '#d9b54a', dark: '#9c7c2c', ribbon: ['#00a3d8', '#e4002b', '#4a9a2c'] },
  silver: { main: '#c9cdd2', dark: '#878d94', ribbon: [MAROON, '#f2eded', MAROON] },
  bronze: { main: '#c58a5a', dark: '#8a5a33', ribbon: ['#800020', GOLD, '#800020'] },
  maroon: { main: '#9b2c3e', dark: MAROON, ribbon: [GOLD, MAROON, GOLD] },
};

/** An award: ribbon and medal (round), order (star) or badge (shield). Greyed out until earned. */
export function Medal({ shape, color, tier, earned, size = 56, title }: { shape: 'medal' | 'order' | 'badge'; color: string; tier: number; earned: boolean; size?: number; title: string }) {
  const m = MEDAL[color] ?? MEDAL.gold;
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 60 76" width={(size * 60) / 76} height={size} role="img" aria-label={title} className={`medal ${earned ? '' : 'locked'}`}>
      <title>{title}</title>
      <defs>
        <radialGradient id={`m${id}`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.45" stopColor={m.main} />
          <stop offset="1" stopColor={m.dark} />
        </radialGradient>
      </defs>
      <path d="M14,0 H46 L40,26 H20 Z" fill={m.ribbon[1]} />
      <path d="M14,0 H23 L24,26 H20 Z" fill={m.ribbon[0]} />
      <path d="M37,0 H46 L40,26 H36 Z" fill={m.ribbon[2]} />
      {shape === 'medal' && <circle cx="30" cy="48" r="20" fill={`url(#m${id})`} stroke={m.dark} strokeWidth="1.5" />}
      {shape === 'order' && <path d={starPath(30, 48, 23, 8, 0.62)} fill={`url(#m${id})`} stroke={m.dark} strokeWidth="1.2" />}
      {shape === 'badge' && <path d="M30,26 L50,32 L48,54 Q44,66 30,72 Q16,66 12,54 L10,32 Z" fill={`url(#m${id})`} stroke={m.dark} strokeWidth="1.5" />}
      <path d={starPath(30, shape === 'badge' ? 46 : 48, 8)} fill="#fff" opacity="0.85" />
      {earned && tier > 0 && (
        <g>
          <circle cx="47" cy="64" r="9" fill={MAROON} stroke={GOLD} strokeWidth="1.2" />
          <text x="47" y="67.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" fontFamily="Source Sans 3, sans-serif">{ROMAN[tier - 1]}</text>
        </g>
      )}
    </svg>
  );
}

export { MILITARY_RANKS, GIZIR };
