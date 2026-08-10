import type { CoinType } from '../types/coins';

/**
 * XP rates, per the client spec.
 *
 * Overtime always pays more than standard time for the same protocol: the point
 * is to reward working past the planned length instead of stopping dead on zero.
 * RESET is recovery and never scores.
 */
export const XP_RATES: Record<CoinType, { standard: number; overtime: number }> = {
  lockin: { standard: 1.5, overtime: 2 },
  flow: { standard: 1, overtime: 1.5 },
  reset: { standard: 0, overtime: 0 },
};

/** One completed block of a shift. */
export type ShiftBlock = {
  protocol: CoinType;
  /** Minutes inside the planned duration. */
  standardMins: number;
  /** Minutes past the planned duration. */
  overtimeMins: number;
};

export type XpBreakdown = {
  lockin: number;
  flow: number;
  /** The extra earned by overtime minutes over what standard rates would pay. */
  overtimeBonus: number;
  total: number;
};

export const EMPTY_XP: XpBreakdown = { lockin: 0, flow: 0, overtimeBonus: 0, total: 0 };

/** XP for a single block, standard and overtime minutes charged at their own rates. */
export function blockXp(block: ShiftBlock): number {
  const rate = XP_RATES[block.protocol];
  return block.standardMins * rate.standard + block.overtimeMins * rate.overtime;
}

/**
 * The Grand Finale breakdown: "Lock In: 450 XP | Flow: 120 XP | Overtime bonus:
 * 90 XP | Total: 660 XP".
 *
 * Per-protocol figures are the *whole* earnings for that protocol, overtime
 * included, so `lockin + flow` already equals `total`. `overtimeBonus` is
 * therefore reported separately as the premium overtime earned — the extra over
 * what those same minutes would have paid at the standard rate — rather than as
 * a fourth addend. Adding it to the total would count that time twice.
 */
export function shiftXp(blocks: ShiftBlock[]): XpBreakdown {
  let lockin = 0;
  let flow = 0;
  let overtimeBonus = 0;

  for (const block of blocks) {
    const rate = XP_RATES[block.protocol];
    const earned = blockXp(block);
    const premium = block.overtimeMins * (rate.overtime - rate.standard);

    if (block.protocol === 'lockin') lockin += earned;
    else if (block.protocol === 'flow') flow += earned;

    overtimeBonus += premium;
  }

  return {
    lockin: Math.round(lockin),
    flow: Math.round(flow),
    overtimeBonus: Math.round(overtimeBonus),
    total: Math.round(lockin + flow),
  };
}

export function totalOvertimeMinutes(blocks: ShiftBlock[]): number {
  return blocks.reduce((sum, b) => sum + b.overtimeMins, 0);
}

export function totalFocusMinutes(blocks: ShiftBlock[]): number {
  return blocks
    .filter((b) => b.protocol !== 'reset')
    .reduce((sum, b) => sum + b.standardMins + b.overtimeMins, 0);
}

/** Blocks that count as work — RESET pauses are not "blocks completed". */
export function focusBlockCount(blocks: ShiftBlock[]): number {
  return blocks.filter((b) => b.protocol !== 'reset').length;
}

export function formatXp(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}
