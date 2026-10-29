// Inline SVG icons (stroke style, currentColor).
import type { ReactNode } from 'react';

const S = ({ children, fill }: { children: ReactNode; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IconFlame = () => <S fill><path d="M12 2c.5 3.2-1.4 5-3 6.8C7.5 10.5 6 12.3 6 15a6 6 0 0 0 12 0c0-2.1-.9-3.9-2.2-5.4-.3 1.5-1.1 2.6-2.3 3.1.6-3.2-.2-7.6-1.5-10.7z" /></S>;
export const IconHeart = () => <S fill><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.2 5.2 3 1.6-1.8 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z" /></S>;
export const IconBolt = () => <S fill><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></S>;
export const IconHome = () => <S><path d="M3 11 12 3l9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></S>;
export const IconPath = () => <S><circle cx="6" cy="5" r="2.5" /><circle cx="18" cy="12" r="2.5" /><circle cx="6" cy="19" r="2.5" /><path d="M8.3 6.2 15.7 10.8M15.7 13.2 8.3 17.8" /></S>;
export const IconTrophy = () => <S><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></S>;
export const IconUser = () => <S><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></S>;
export const IconCheck = () => <S><path d="m5 12 5 5L20 7" /></S>;
export const IconX = () => <S><path d="M6 6l12 12M18 6 6 18" /></S>;
export const IconLock = () => <S><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></S>;
export const IconPlay = () => <S fill><path d="M8 5v14l11-7z" /></S>;
export const IconRepeat = () => <S><path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12" /><path d="M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" /></S>;
export const IconTarget = () => <S><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></S>;
export const IconFlag = () => <S><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></S>;
export const IconBook = () => <S><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z" /><path d="M4 19a2 2 0 0 1 2-2h13" /></S>;
export const IconClock = () => <S><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>;
export const IconStar = () => <S fill><path d="m12 2 3 6.6 7 .8-5.2 4.8 1.4 7L12 17.7 5.8 21.2l1.4-7L2 9.4l7-.8L12 2z" /></S>;
export const IconBack = () => <S><path d="M15 18 9 12l6-6" /></S>;
export const IconChevron = () => <S><path d="m9 18 6-6-6-6" /></S>;
export const IconDown = () => <S><path d="m6 9 6 6 6-6" /></S>;
export const IconInfo = () => <S><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></S>;
export const IconAlert = () => <S><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17v.5" /></S>;
export const IconShield = () => <S><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z" /></S>;
export const IconSettings = () => <S><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></S>;
export const IconMail = () => <S><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></S>;
export const IconExam = () => <S><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></S>;
export const IconWeak = () => <S><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></S>;
