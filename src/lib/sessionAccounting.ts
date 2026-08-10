import type { SessionSegment } from './sessionApi';
import type { CoinType } from '../types/coins';

/**
 * Pure duration math for a session's legs. Kept out of SessionProvider so the
 * rules that decide how many minutes get written to the database can be tested
 * without mounting React.
 *
 * A "leg" is one continuous stretch of one protocol. A session is a list of
 * legs: LOCK IN alone, FLOW alone, or a FLOW ↔ RESET chain.
 */

/** Any started leg bills at least one minute; partial minutes round up. */
export function secondsToBilledMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

/**
 * FLOW shows one continuous elapsed counter across a RESET break, so the leg
 * that is running now owns only the time since it started.
 *
 * `base` is the elapsed value the current leg started from: 0 for a fresh FLOW,
 * or the paused value when FLOW resumes after a RESET.
 */
export function flowLegSeconds(totalElapsedSeconds: number, legBaseSeconds: number): number {
  return Math.max(1, totalElapsedSeconds - legBaseSeconds);
}

/** LOCK IN / RESET count down, and may run past zero into overtime. */
export function countdownLegSeconds(
  plannedMinutes: number,
  timeRemainingSeconds: number,
  overtimeSeconds: number,
): number {
  return Math.max(0, plannedMinutes * 60 - timeRemainingSeconds + overtimeSeconds);
}

export function appendLeg(
  segments: SessionSegment[],
  protocol: CoinType,
  legSeconds: number,
): SessionSegment[] {
  return [...segments, { protocol, duration_mins: secondsToBilledMinutes(legSeconds) }];
}

/**
 * Minutes that earn points for a finished session:
 * LOCK IN scores its own leg, FLOW scores every focus leg in the chain, RESET
 * is recovery and never scores.
 */
export function scoringMinutes(
  protocol: CoinType,
  finalLegMinutes: number,
  focusMinutes: number,
): number {
  if (protocol === 'lockin') return finalLegMinutes;
  if (protocol === 'flow') return focusMinutes;
  return 0;
}
