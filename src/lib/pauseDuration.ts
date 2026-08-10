/**
 * Tiredness → suggested pause length.
 *
 * The client had not finalised the formula, so every number lives here and can
 * be tuned without touching a screen. Shape agreed: a base per tiredness level,
 * plus a little more the longer the shift has already run, plus a little more
 * if the last block ran into overtime — clamped to a sane range.
 */

export type TirednessLevel = 1 | 2 | 3 | 4 | 5;

export const TIREDNESS_LEVELS: TirednessLevel[] = [1, 2, 3, 4, 5];

/** Minutes suggested for a fresh shift, indexed by tiredness 1–5. */
export const BASE_MINUTES: Record<TirednessLevel, number> = {
  1: 5,
  2: 8,
  3: 12,
  4: 18,
  5: 25,
};

/** One extra minute for every this many minutes already focused this shift. */
export const MINUTES_PER_FOCUS_BONUS = 15;

/** Added when the block that just ended ran past its planned length. */
export const OVERTIME_BONUS_MINUTES = 2;

export const MIN_PAUSE_MINUTES = 5;
export const MAX_PAUSE_MINUTES = 30;

export const TIREDNESS_LABELS: Record<TirednessLevel, string> = {
  1: 'Fresh',
  2: 'Fine',
  3: 'Feeling it',
  4: 'Drained',
  5: 'Running on empty',
};

export type PauseSuggestionInput = {
  tiredness: TirednessLevel;
  /** Focus minutes banked in this shift so far, including the block just ended. */
  shiftFocusMinutes: number;
  /** Whether the block that just ended went into overtime. */
  cameFromOvertime: boolean;
};

export function suggestPauseMinutes({
  tiredness,
  shiftFocusMinutes,
  cameFromOvertime,
}: PauseSuggestionInput): number {
  const base = BASE_MINUTES[tiredness];
  const intensity = Math.floor(Math.max(0, shiftFocusMinutes) / MINUTES_PER_FOCUS_BONUS);
  const overtime = cameFromOvertime ? OVERTIME_BONUS_MINUTES : 0;

  const suggested = base + intensity + overtime;
  return Math.min(MAX_PAUSE_MINUTES, Math.max(MIN_PAUSE_MINUTES, suggested));
}
