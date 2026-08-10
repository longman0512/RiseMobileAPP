import { supabase } from './supabase';
import type { ShiftBlock, XpBreakdown } from './xp';

export type ShiftEndReason = 'end_shift' | 'exit' | 'auto';

export type EndShiftPayload = {
  startedAt: string;
  blocks: ShiftBlock[];
  focusMins: number;
  overtimeMins: number;
  blockCount: number;
  xp: XpBreakdown;
  nextTarget: string | null;
  reason: ShiftEndReason;
};

export type EndShiftResult = {
  ok: boolean;
  shiftId?: string;
  /** Lifetime XP after this shift was committed. */
  lifetimeXp?: number;
  message?: string;
};

function logShiftError(context: string, message: string): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[shiftApi] ${context}:`, message);
  }
}

/**
 * Commit a finished shift. This is the only moment XP becomes permanent — while
 * a shift is open the totals live in memory and are never written.
 */
export async function endShift(payload: EndShiftPayload): Promise<EndShiftResult> {
  const { data, error } = await supabase.rpc('end_shift', {
    p_started_at: payload.startedAt,
    p_blocks: payload.blocks,
    p_focus_mins: payload.focusMins,
    p_overtime_mins: payload.overtimeMins,
    p_block_count: payload.blockCount,
    p_lockin_xp: payload.xp.lockin,
    p_flow_xp: payload.xp.flow,
    p_overtime_bonus_xp: payload.xp.overtimeBonus,
    p_total_xp: payload.xp.total,
    p_next_target: payload.nextTarget,
    p_ended_reason: payload.reason,
  });

  if (error) {
    logShiftError('end_shift', error.message);
    return { ok: false, message: error.message };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { out_shift_id?: string; out_lifetime_xp?: number }
    | null;

  return {
    ok: true,
    shiftId: row?.out_shift_id,
    lifetimeXp: row?.out_lifetime_xp,
  };
}

export type MyXp = {
  totalXp: number;
  totalShifts: number;
  totalOvertimeMins: number;
  currentStreak: number;
};

export const EMPTY_MY_XP: MyXp = {
  totalXp: 0,
  totalShifts: 0,
  totalOvertimeMins: 0,
  currentStreak: 0,
};

/** Lifetime XP for the main page. Committed totals only — never pending. */
export async function fetchMyXp(): Promise<MyXp> {
  const { data, error } = await supabase.rpc('get_my_xp');

  if (error) {
    logShiftError('get_my_xp', error.message);
    return EMPTY_MY_XP;
  }

  const row = (data ?? {}) as Record<string, number | null>;
  return {
    totalXp: Number(row.total_xp ?? 0),
    totalShifts: Number(row.total_shifts ?? 0),
    totalOvertimeMins: Number(row.total_overtime_mins ?? 0),
    currentStreak: Number(row.current_streak ?? 0),
  };
}
