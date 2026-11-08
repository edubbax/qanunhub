// Shoulder boards for the military ranks, the three-star "lives" board and award medals, drawn as SVG.
import { BAS_GIZIR, GIZIR, MILITARY_RANKS, ROMAN, rankByCode, type MilitaryRank } from '@qanunhub/core';
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
const STAR_DARK = '#d29a1a';
const CHEVRON = '#b8262c';
const PIPING = '#c8282e';

/** Leaves along an arc (a U opening upward when `ry` < 1), the wreath of the senior officers and of the state emblem. */
function Leaves({ cx, cy, w, from, to, fill, edge, size = 3.2, ry = 0.7, n = 8 }: { cx: number; cy: number; w: number; from: number; to: number; fill: string; edge: string; size?: number; ry?: number; n?: number }) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const th = (from + ((to - from) * i) / n) * (Math.PI / 180);
    const x = cx + w * Math.cos(th);
    const y = cy + w * ry * Math.sin(th);
    const rot = (Math.atan2(ry * Math.cos(th), -Math.sin(th)) * 180) / Math.PI;
    out.push(<ellipse key={i} cx={x} cy={y} rx={size} ry={size * 0.48} transform={`rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})`} fill={fill} stroke={edge} strokeWidth={0.4} />);
  }
  return <g>{out}</g>;
}

/** An eight-pointed star with a light and a dark half on every ray, as on the regulation boards. */
function FacetStar({ cx, cy, r, inner = 0.55 }: { cx: number; cy: number; r: number; inner?: number }) {
  const pt = (rad: number, deg: number) => `${(cx + rad * Math.cos((deg * Math.PI) / 180)).toFixed(2)},${(cy + rad * Math.sin((deg * Math.PI) / 180)).toFixed(2)}`;
  const rays = [];
  for (let i = 0; i < 8; i++) {
    const tip = -90 + i * 45;
    rays.push(
      <g key={i}>
        <polygon points={`${cx},${cy} ${pt(r, tip)} ${pt(r * inner, tip - 22.5)}`} fill={STAR} />
        <polygon points={`${cx},${cy} ${pt(r, tip)} ${pt(r * inner, tip + 22.5)}`} fill={STAR_DARK} />
      </g>,
    );
  }
  return (
    <g>
      <path d={starPath(cx, cy, r, 8, inner)} fill="none" stroke={STAR_EDGE} strokeWidth={0.5} strokeLinejoin="round" />
      {rays}
    </g>
  );
}

/** The state emblem on the Army General's board: white eight-pointed star with a flame on a blue, red and green ring,
 *  a green laurel branch on one side and a golden wheat ear on the other. */
function Emblem({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const flame = `M${cx},${cy - r * 0.4} C${cx + r * 0.27},${cy - r * 0.06} ${cx + r * 0.17},${cy + r * 0.26} ${cx},${cy + r * 0.3} C${cx - r * 0.17},${cy + r * 0.26} ${cx - r * 0.27},${cy - r * 0.06} ${cx},${cy - r * 0.4}Z`;
  return (
    <g>
      <Leaves cx={cx} cy={cy} w={r * 1.1} from={96} to={168} fill="#2f7d3a" edge="#1b4d22" size={r * 0.2} ry={1} n={6} />
      <Leaves cx={cx} cy={cy} w={r * 1.1} from={12} to={84} fill="#d8a21f" edge="#8f6a10" size={r * 0.2} ry={1} n={6} />
      <circle cx={cx} cy={cy} r={r} fill="#b08a1c" />
      <circle cx={cx} cy={cy} r={r * 0.92} fill="#35b3e0" />
      <circle cx={cx} cy={cy} r={r * 0.72} fill="#d6313b" />
      <path d={starPath(cx, cy, r * 0.72, 8, 0.62)} fill="#3c9d46" transform={`rotate(22.5 ${cx} ${cy})`} />
      <path d={starPath(cx, cy, r * 0.74, 8, 0.46)} fill="#fff" />
      <path d={flame} fill="#e23d33" />
      <path d={`M${cx},${cy - r * 0.2} C${cx + r * 0.08},${cy - r * 0.02} ${cx + r * 0.05},${cy + r * 0.14} ${cx},${cy + r * 0.17} C${cx - r * 0.05},${cy + r * 0.14} ${cx - r * 0.08},${cy - r * 0.02} ${cx},${cy - r * 0.2}Z`} fill="#fff" opacity="0.7" />
    </g>
  );
}

/** The gold laurel wreath of the senior officers' boards, under the stars. */
function Wreath({ cx, cy, w }: { cx: number; cy: number; w: number }) {
  return (
    <g>
      <Leaves cx={cx} cy={cy - w * 0.25} w={w} from={12} to={168} fill={STAR} edge={STAR_EDGE} size={w * 0.27} />
      <circle cx={cx} cy={cy + w * 0.62} r={w * 0.16} fill={STAR} stroke={STAR_EDGE} strokeWidth={0.5} />
    </g>
  );
}

interface Layout { stars: { y: number; r: number }[]; device?: 'wreath' | 'emblem' }

/** Star positions as on the regulation boards: juniors from the bottom up, seniors above the wreath, generals in the field. */
function layout(rank: MilitaryRank): Layout {
  const col = (ys: number[], r: number) => ys.map((y) => ({ y, r }));
  switch (rank.code) {
    case 'kl': return { stars: col([112], 9.5) };
    case 'l': return { stars: col([112, 88], 9.5) };
    case 'bl': return { stars: col([124, 100, 76], 9.5) };
    case 'kapitan': return { stars: col([128, 104, 80, 56], 9.5) };
    case 'mayor': return { stars: col([96], 10) };
    case 'pl': return { stars: col([96, 72], 10) };
    case 'polkovnik': return { stars: col([96, 72, 48], 10) };
    case 'gm': return { stars: col([75], 11) };
    case 'gl': return { stars: col([62, 96], 11) };
    case 'gp': return { stars: col([48, 75, 102], 11) };
    case 'og': return { stars: col([74], 14) };
    default: return { stars: [] };
  }
}

const POINTED = 'M6,40 L25,8 Q30,3.5 35,8 L54,40 L54,142 Q54,146 50,146 L10,146 Q6,146 6,142 Z';
const FLAT = 'M6,15 L17,4 L43,4 L54,15 L54,142 Q54,146 50,146 L10,146 Q6,146 6,142 Z';
const ARCH = 'M6,30 A24,26 0 0 1 54,30 L54,142 Q54,146 50,146 L10,146 Q6,146 6,142 Z';
const GEN_FIELD = 'M15,42 Q15,24 30,11 Q45,24 45,42 L45,111 L30,123 L15,111 Z';
const GEN_BRAID = 'M10.5,32 A19.5,22 0 0 1 49.5,32 L49.5,141 L10.5,141 Z';

/** A vertical shoulder board for a rank code ("gizir", "bg", "l", "polkovnik", "og", ...). */
export function Epaulette({ code, size = 48, title }: { code: string; size?: number; title?: string }) {
  const id = useId().replace(/:/g, '');
  const rank = rankByCode(code) ?? GIZIR;
  const nco = rank.tier === 'nco';
  const general = rank.tier === 'general';
  const army = rank.tier === 'army';
  const { stars, device } = layout(rank);
  const label = title ?? rank.title;
  const boardPath = nco ? FLAT : general || army ? ARCH : POINTED;
  const bg = rank.code === 'bg';
  const buttonY = nco ? 22 : general ? 25 : army ? 19 : 24;
  const buttonR = army ? 6 : 7;
  return (
    <svg viewBox="0 0 60 150" width={size * (60 / 150)} height={size} role="img" aria-label={label} className="epaulette">
      <title>{label}</title>
      <defs>
        <linearGradient id={`f${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={OLIVE_DARK} />
          <stop offset="0.5" stopColor={OLIVE_LIGHT} />
          <stop offset="1" stopColor={OLIVE_DARK} />
        </linearGradient>
        <radialGradient id={`b${id}`} cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#ffe873" />
          <stop offset="0.6" stopColor="#f1bf1c" />
          <stop offset="1" stopColor="#c99410" />
        </radialGradient>
        <clipPath id={`c${id}`}><path d={boardPath} /></clipPath>
      </defs>
      {general ? (
        <g>
          <path d={ARCH} fill={STAR} stroke={PIPING} strokeWidth="2.4" />
          <path d={GEN_BRAID} fill="none" stroke={STAR_EDGE} strokeWidth="5" strokeDasharray="2.6 2.2" opacity="0.7" />
          <path d={GEN_FIELD} fill={`url(#f${id})`} stroke={STAR_EDGE} strokeWidth="0.8" />
          <path d="M16,110.5 L30,122 L44,110.5" stroke="#f4f1ea" strokeWidth="1.8" fill="none" />
          <path d="M16,115 Q30,143 44,115 Q30,130 16,115Z" fill="#e6b422" stroke={STAR_EDGE} strokeWidth="0.6" />
          <path d={starPath(19.5, 133, 2.7, 5, 0.45)} fill="#f4f1ea" />
          <path d={starPath(40.5, 133, 2.7, 5, 0.45)} fill="#f4f1ea" />
        </g>
      ) : (
        <path d={boardPath} fill={`url(#f${id})`} stroke={nco || army ? PIPING : OLIVE_DARK} strokeWidth={nco ? 2.4 : army ? 2.2 : 1.5} />
      )}
      {nco && (
        <g clipPath={`url(#c${id})`}>
          <path d={bg ? 'M3,68 L30,98 L57,68' : 'M3,78 L30,108 L57,78'} stroke={CHEVRON} strokeWidth="5.6" fill="none" />
          {(bg ? [101, 113, 125] : [113, 125]).map((y) => (
            <rect key={y} x="2" y={y} width="56" height="9" fill="#f1d414" />
          ))}
        </g>
      )}
      <circle cx="30" cy={buttonY} r={buttonR} fill={`url(#b${id})`} stroke="#b9890e" strokeWidth="0.9" />
      {!nco && <circle cx="30" cy={buttonY} r={buttonR * 0.55} fill="none" stroke="#b9890e" strokeWidth="0.6" opacity="0.7" />}
      {stars.map((st, i) => (
        <FacetStar key={i} cx={30} cy={st.y} r={st.r} inner={army ? 0.5 : 0.56} />
      ))}
      {device === undefined && rank.tier === 'senior' && <Wreath cx={30} cy={126} w={13} />}
      {army && <Emblem cx={30} cy={112} r={17} />}
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

export { MILITARY_RANKS, GIZIR, BAS_GIZIR };
