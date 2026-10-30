// Shoulder boards for the military ranks, the three-star "lives" board and award medals, drawn as SVG.
import { GIZIR, MILITARY_RANKS, ROMAN, rankByCode, type MilitaryRank } from '@qanunhub/core';
import { useId } from 'react';

const GOLD = '#c9a646';
const GOLD_DARK = '#9c7c2c';
const MAROON = '#4a0e17';

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

// Colours of the shoulder boards of the Armed Forces of Azerbaijan: olive cloth, yellow eight-pointed stars,
// red piping on the generals' boards.
const OLIVE = '#5f6136';
const OLIVE_LIGHT = '#767847';
const OLIVE_DARK = '#3f4023';
const STAR = '#f4c430';
const STAR_EDGE = '#a7791a';
const PIPING = '#c8282e';

/** The state emblem on the Army General's board: an eight-pointed star over a blue-red-green ring with a flame. */
function Emblem({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const arc = (from: number, to: number, rad: number) => {
    const a = (from - 90) * (Math.PI / 180);
    const b = (to - 90) * (Math.PI / 180);
    return `M${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)} A${rad},${rad} 0 0 1 ${cx + rad * Math.cos(b)},${cy + rad * Math.sin(b)}`;
  };
  return (
    <g>
      <path d={starPath(cx, cy, r, 8, 0.78)} fill={STAR} stroke={STAR_EDGE} strokeWidth={0.8} />
      <circle cx={cx} cy={cy} r={r * 0.62} fill="#fff" />
      <path d={arc(-60, 60, r * 0.55)} stroke="#00a3d8" strokeWidth={r * 0.14} fill="none" />
      <path d={arc(60, 180, r * 0.55)} stroke="#e4002b" strokeWidth={r * 0.14} fill="none" />
      <path d={arc(180, 300, r * 0.55)} stroke="#2e9a3c" strokeWidth={r * 0.14} fill="none" />
      <path d={starPath(cx, cy, r * 0.42, 8, 0.7)} fill="#fff" stroke={STAR_EDGE} strokeWidth={0.5} />
      <path d={`M${cx},${cy - r * 0.3} C${cx + r * 0.2},${cy - r * 0.04} ${cx + r * 0.12},${cy + r * 0.2} ${cx},${cy + r * 0.22} C${cx - r * 0.12},${cy + r * 0.2} ${cx - r * 0.2},${cy - r * 0.04} ${cx},${cy - r * 0.3}Z`} fill="#e64a3b" />
      <path d={`M${cx - r * 0.85},${cy + r * 0.55} Q${cx},${cy + r * 1.15} ${cx + r * 0.85},${cy + r * 0.55}`} stroke="#d9a520" strokeWidth={r * 0.12} fill="none" strokeLinecap="round" />
    </g>
  );
}

/** The crescent of the senior officers' boards, horns up. */
function Crescent({ cx, cy, w }: { cx: number; cy: number; w: number }) {
  return (
    <path
      d={`M${cx - w},${cy - w * 0.35} A${w},${w} 0 0 0 ${cx + w},${cy - w * 0.35} A${w},${w * 0.5} 0 0 1 ${cx - w},${cy - w * 0.35}Z`}
      fill={STAR} stroke={STAR_EDGE} strokeWidth={0.7}
    />
  );
}

/** The generals' crossed sabres over a crescent. */
function Sabres({ cx, cy, w }: { cx: number; cy: number; w: number }) {
  const blade = (dir: 1 | -1) => (
    <g>
      <path d={`M${cx - dir * w},${cy + w * 0.35} Q${cx - dir * w * 0.1},${cy + w * 0.1} ${cx + dir * w * 0.95},${cy - w * 0.75}`} stroke={STAR} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <path d={`M${cx - dir * w * 0.82},${cy + w * 0.05} L${cx - dir * w * 0.62},${cy + w * 0.45}`} stroke={STAR_EDGE} strokeWidth={1.4} strokeLinecap="round" />
    </g>
  );
  return (
    <g>
      <Crescent cx={cx} cy={cy + w * 0.35} w={w * 0.9} />
      {blade(1)}
      {blade(-1)}
    </g>
  );
}

interface Layout { stars: { y: number; r: number }[]; device?: 'crescent' | 'sabres' | 'emblem' }

/** Star positions from the bottom of the board up, as on the regulation boards. */
function layout(rank: MilitaryRank): Layout {
  const col = (ys: number[], r: number) => ys.map((y) => ({ y, r }));
  switch (rank.code) {
    case 'gizir': return { stars: col([112, 94], 5.5) };
    case 'kl': return { stars: col([100], 6.8) };
    case 'l': return { stars: col([112, 90], 6.8) };
    case 'bl': return { stars: col([122, 100, 78], 6.8) };
    case 'kapitan': return { stars: col([126, 104, 82, 60], 6.8) };
    case 'mayor': return { stars: col([104], 8.5), device: 'crescent' };
    case 'pl': return { stars: col([104, 81], 8.5), device: 'crescent' };
    case 'polkovnik': return { stars: col([104, 81, 58], 8.5), device: 'crescent' };
    case 'gm': return { stars: col([98], 9.5), device: 'sabres' };
    case 'gl': return { stars: col([98, 73], 9.5), device: 'sabres' };
    case 'gp': return { stars: col([98, 73, 48], 9.5), device: 'sabres' };
    case 'og': return { stars: col([50], 12), device: 'emblem' };
    default: return { stars: [] };
  }
}

/** A vertical shoulder board for a rank code ("gizir", "l", "polkovnik", "og", ...). */
export function Epaulette({ code, size = 48, title }: { code: string; size?: number; title?: string }) {
  const id = useId().replace(/:/g, '');
  const rank = rankByCode(code) ?? GIZIR;
  const general = rank.tier === 'general' || rank.tier === 'army';
  const { stars, device } = layout(rank);
  const outline = 'M7,26 Q7,6 30,4 Q53,6 53,26 L53,142 Q53,146 49,146 L11,146 Q7,146 7,142 Z';
  const inner = 'M10.5,26.5 Q10.5,9.5 30,7.5 Q49.5,9.5 49.5,26.5 L49.5,142.5 L10.5,142.5 Z';
  const label = title ?? rank.title;
  return (
    <svg viewBox="0 0 60 150" width={size * (60 / 150)} height={size} role="img" aria-label={label} className="epaulette">
      <title>{label}</title>
      <defs>
        <linearGradient id={`f${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={OLIVE_DARK} />
          <stop offset="0.5" stopColor={OLIVE_LIGHT} />
          <stop offset="1" stopColor={OLIVE_DARK} />
        </linearGradient>
      </defs>
      <path d={outline} fill={`url(#f${id})`} stroke={OLIVE_DARK} strokeWidth="1.5" />
      {general && <path d={inner} fill="none" stroke={PIPING} strokeWidth="2.2" />}
      {rank.code === 'gizir' && <rect x="9" y="132" width="42" height="5" fill={STAR} opacity="0.9" />}
      <circle cx="30" cy="20" r="4.6" fill={OLIVE} stroke={STAR_EDGE} strokeWidth="1.2" />
      <path d={starPath(30, 20, 2.6, 8, 0.6)} fill={STAR} />
      {stars.map((s, i) => (
        <path key={i} d={starPath(30, s.y, s.r, 8, 0.6)} fill={STAR} stroke={STAR_EDGE} strokeWidth="0.7" />
      ))}
      {device === 'crescent' && <Crescent cx={30} cy={130} w={13} />}
      {device === 'sabres' && <Sabres cx={30} cy={124} w={14} />}
      {device === 'emblem' && <Emblem cx={30} cy={104} r={17} />}
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
      <path d={`M3,4 L${w - 14},4 Q${w - 2},5 ${w - 2},15 Q${w - 2},25 ${w - 14},26 L3,26 Q1,26 1,24 L1,6 Q1,4 3,4Z`} fill={OLIVE} stroke={OLIVE_DARK} strokeWidth="1.5" />
      <circle cx={w - 12} cy="15" r="3.4" fill={OLIVE_LIGHT} stroke={STAR_EDGE} strokeWidth="1" />
      {Array.from({ length: max }, (_, i) => {
        const on = infinite || i < current;
        return <path key={i} d={starPath(14 + i * 22, 15, 8.4, 8, 0.6)} fill={on ? STAR : 'none'} stroke={on ? STAR_EDGE : '#a9ab86'} strokeWidth={on ? 0.8 : 1.1} opacity={on ? 1 : 0.75} />;
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
