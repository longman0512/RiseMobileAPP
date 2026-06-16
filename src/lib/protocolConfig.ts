import type { CoinType } from '../types/coins';

export type EndScreen = 'summary' | 'journal' | 'none';

export type ProtocolConfig = {
  defaultMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  hapticIntervalMinutes: number | null;
  allowsPause: boolean;
  allowsThoughtCapture: boolean;
  /**
   * End-of-session UI: LOCK IN → summary; FLOW → journal; RESET → none
   * (RESET captures reflection live during the session and returns straight to
   * the main screen on end).
   */
  endScreen: EndScreen;
  /** RESET shows its reflection prompts during the active session. */
  reflectionDuringSession?: boolean;
  hasJournal: boolean;
};

export const PROTOCOL_CONFIG: Record<CoinType, ProtocolConfig> = {
  lockin: {
    defaultMinutes: 50,
    minMinutes: 25,
    maxMinutes: 120,
    hapticIntervalMinutes: 20,
    allowsPause: false,
    allowsThoughtCapture: false,
    endScreen: 'summary',
    hasJournal: false,
  },
  flow: {
    defaultMinutes: 30,
    minMinutes: 15,
    maxMinutes: 90,
    hapticIntervalMinutes: 15,
    allowsPause: true,
    allowsThoughtCapture: true,
    endScreen: 'journal',
    hasJournal: true,
  },
  reset: {
    defaultMinutes: 10,
    minMinutes: 5,
    maxMinutes: 30,
    hapticIntervalMinutes: null,
    allowsPause: false,
    allowsThoughtCapture: false,
    endScreen: 'none',
    reflectionDuringSession: true,
    hasJournal: false,
  },
};

export const RESET_INSTRUCTION_ROTATE_MS = 30_000;

export const RESET_INSTRUCTIONS = [
  'Stand up. Go get some water.',
  'Look out the window for 5 minutes.',
  'Close your eyes. Count 20 breaths.',
  'Stretch your neck. 30 seconds each side.',
] as const;

export const STREAK_MIN_MINUTES = 5;
