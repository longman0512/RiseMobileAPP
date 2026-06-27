import type { CoinType } from '../types/coins';

export type ProtocolTheme = {
  accent: string;
  gradient: [string, string];
  coinGradient: [string, string, string];
  quote: [string, string];
  ringSize: number;
  timerFontSize: number;
  footnote: string;
};

export const PROTOCOL_THEME: Record<CoinType, ProtocolTheme> = {
  lockin: {
    accent: '#C0C4CC',
    gradient: ['#8A9099', '#C0C4CC'],
    coinGradient: ['#D7DBE0', '#9BA1A9', '#6F757D'],
    quote: ['Phone face down.', 'The session holds itself.'],
    ringSize: 240,
    timerFontSize: 52,
    footnote: 'Lock In has no pause. Other coins are ignored until the timer ends.',
  },
  flow: {
    accent: '#E8C56A',
    gradient: ['#C9A24B', '#E8C56A'],
    coinGradient: ['#F0D88A', '#C9A24B', '#8F6F2B'],
    quote: ['Distraction fades.', 'Creation stays.'],
    ringSize: 240,
    timerFontSize: 52,
    footnote: 'Tap Reset to pause · tap Flow again to resume',
  },
  reset: {
    accent: '#D4855A',
    gradient: ['#C0703F', '#D4855A'],
    coinGradient: ['#E09A6B', '#C0703F', '#82471F'],
    quote: ['No feeds. No noise.', 'Just a breath.'],
    ringSize: 150,
    timerFontSize: 30,
    footnote: 'Tap Flow or Lock In to end early.',
  },
};

export function formatTimer(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
