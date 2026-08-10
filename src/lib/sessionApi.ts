import { localTodayKey } from './sessionAnalytics';
import type { CoinType } from '../types/coins';
import { supabase } from './supabase';

export type SessionSegment = {
  protocol: CoinType;
  duration_mins: number;
};

export type EndSessionPayload = {
  coin_type: CoinType;
  started_at: string;
  duration_mins: number;
  note: string | null;
  next_block: string | null;
  planned_mins?: number;
  overtime_mins?: number;
  segments?: SessionSegment[];
};

export function sumSegmentMinutes(segments: SessionSegment[]): number {
  return segments.reduce((sum, s) => sum + s.duration_mins, 0);
}

export function sumFocusMinutes(segments: SessionSegment[]): number {
  return segments
    .filter((s) => s.protocol === 'lockin' || s.protocol === 'flow')
    .reduce((sum, s) => sum + s.duration_mins, 0);
}

export function sumRecoveryMinutes(segments: SessionSegment[]): number {
  return segments
    .filter((s) => s.protocol === 'reset')
    .reduce((sum, s) => sum + s.duration_mins, 0);
}

/** One sessions row for FLOW↔RESET chains: coin_type flow, duration_mins = focus (FLOW) time. */
export function resolveSessionSave(
  sessionPrimary: CoinType | null,
  segments: SessionSegment[],
  fallbackProtocol: CoinType,
  durationOverride?: number,
): { coin_type: CoinType; duration_mins: number; segments?: SessionSegment[] } {
  const segs = segments.length > 0 ? segments : undefined;
  const hasFlow = segments.some((s) => s.protocol === 'flow');
  const hasReset = segments.some((s) => s.protocol === 'reset');
  const focusMins = Math.max(1, sumFocusMinutes(segments));

  if (hasFlow && (hasReset || sessionPrimary === 'flow')) {
    return {
      coin_type: 'flow',
      duration_mins: durationOverride != null ? Math.max(1, durationOverride) : focusMins,
      segments: segs,
    };
  }

  const total =
    durationOverride != null
      ? Math.max(1, durationOverride)
      : segments.length > 0
        ? Math.max(1, sumSegmentMinutes(segments))
        : 1;

  return {
    coin_type: sessionPrimary ?? fallbackProtocol,
    duration_mins: total,
    segments: segs,
  };
}

/** Merge adjacent legs of the same protocol for a shorter timeline string. */
export function mergeConsecutiveSegments(segments: SessionSegment[]): SessionSegment[] {
  const merged: SessionSegment[] = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && last.protocol === seg.protocol) {
      last.duration_mins += seg.duration_mins;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

export function formatSegmentBreakdown(segments: SessionSegment[]): string {
  return mergeConsecutiveSegments(segments)
    .map((s) => `${s.protocol.toUpperCase()} ${s.duration_mins} min`)
    .join(' — ');
}

function segmentsToJson(segments: SessionSegment[] | undefined): SessionSegment[] | undefined {
  if (!segments?.length) return undefined;
  return segments;
}

export type SessionRecord = {
  session_id?: string;
  coin_type: CoinType;
  started_at: string;
  duration_mins: number;
  note?: string | null;
  next_block?: string | null;
};

export type UserStats = {
  current_streak: number;
  longest_streak: number;
  last_session_date: string | null;
  total_lockin_mins: number;
  total_flow_mins: number;
  total_reset_mins: number;
  /** Lifetime XP, committed only when a shift is formally ended. */
  total_xp: number;
};

type DbSessionRow = {
  id: string;
  coin_type: CoinType;
  started_at: string;
  duration_mins: number;
  note?: string | null;
  next_block?: string | null;
};

const EMPTY_STATS: UserStats = {
  current_streak: 0,
  longest_streak: 0,
  last_session_date: null,
  total_lockin_mins: 0,
  total_flow_mins: 0,
  total_reset_mins: 0,
  total_xp: 0,
};

function mapSessionRow(row: DbSessionRow): SessionRecord {
  return {
    session_id: row.id,
    coin_type: row.coin_type,
    started_at: row.started_at,
    duration_mins: row.duration_mins,
    note: row.note,
    next_block: row.next_block,
  };
}

function logSessionError(context: string, message: string): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[sessionApi] ${context}:`, message);
  }
}

type CompleteSessionRow = {
  out_session_id?: string;
  session_id?: string;
};

function parseSessionIdFromRpc(data: unknown): string | undefined {
  const row = (Array.isArray(data) ? data[0] : data) as CompleteSessionRow | null;
  if (!row || typeof row !== 'object') return undefined;
  const id = row.out_session_id ?? row.session_id;
  return typeof id === 'string' ? id : undefined;
}

async function endSessionDirectInsert(
  userId: string,
  payload: EndSessionPayload,
): Promise<{ ok: boolean; sessionId?: string; message?: string }> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      user_id: userId,
      coin_type: payload.coin_type,
      started_at: payload.started_at,
      duration_mins: payload.duration_mins,
      note: payload.note,
      next_block: payload.next_block,
    })
    .select('id')
    .single();

  if (error) {
    logSessionError('sessions.insert', error.message);
    return { ok: false, message: error.message };
  }

  return { ok: true, sessionId: data?.id as string | undefined };
}

export type EndSessionResult = {
  ok: boolean;
  sessionId?: string;
  message?: string;
  /** Session row saved but user_stats streak was not updated (RPC unavailable). */
  statsSkipped?: boolean;
};

const STATS_SKIPPED_MESSAGE =
  'Session saved but streak stats could not be updated. Pull to refresh on History after migrations are applied.';

type CompleteSessionRpcOptions = {
  includeSegments?: boolean;
  includeStreakDate?: boolean;
};

async function callCompleteSessionRpc(
  payload: EndSessionPayload,
  options?: CompleteSessionRpcOptions,
): Promise<{ data: unknown; error: { message: string } | null }> {
  const includeSegments = options?.includeSegments !== false;
  const includeStreakDate = options?.includeStreakDate !== false;
  const segJson = includeSegments ? segmentsToJson(payload.segments) : undefined;
  const rpcArgs: Record<string, unknown> = {
    p_coin_type: payload.coin_type,
    p_started_at: payload.started_at,
    p_duration_mins: payload.duration_mins,
    p_note: payload.note,
    p_next_block: payload.next_block,
  };
  if (includeStreakDate) {
    rpcArgs.p_streak_date = localTodayKey();
  }
  if (includeSegments) {
    rpcArgs.p_segments = segJson ?? null;
  }

  const { data, error } = await supabase.rpc('complete_session', rpcArgs);
  return { data, error };
}

export async function endSession(payload: EndSessionPayload): Promise<EndSessionResult> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, message: 'Not signed in' };
  }

  const hasSegments = Boolean(payload.segments?.length);
  const attempts: CompleteSessionRpcOptions[] = [
    { includeSegments: hasSegments, includeStreakDate: true },
    { includeSegments: false, includeStreakDate: true },
    { includeSegments: false, includeStreakDate: false },
  ];

  let data: unknown;
  let error: { message: string } | null = null;
  for (let i = 0; i < attempts.length; i++) {
    if (i === 1 && !hasSegments) continue;
    if (i > 0 && error) {
      logSessionError('complete_session', `${error.message} — retrying with fewer RPC params`);
    }
    ({ data, error } = await callCompleteSessionRpc(payload, attempts[i]));
    if (!error) break;
  }

  if (!error) {
    return { ok: true, sessionId: parseSessionIdFromRpc(data) };
  }

  logSessionError('complete_session', error.message);

  const fallback = await endSessionDirectInsert(userData.user.id, payload);
  if (fallback.ok) {
    logSessionError(
      'complete_session',
      `RPC failed (${error.message}); saved session via direct insert without user_stats.`,
    );
    return {
      ok: true,
      sessionId: fallback.sessionId,
      statsSkipped: true,
      message: STATS_SKIPPED_MESSAGE,
    };
  }

  return { ok: false, message: error.message };
}

/** Push client-computed streak values to user_stats (migration 008). */
export async function syncUserStreak(
  currentStreak: number,
  longestStreak: number,
  lastQualifyingDate: string | null,
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.rpc('sync_my_streak', {
    p_current_streak: currentStreak,
    p_longest_streak: longestStreak,
    p_last_qualifying_date: lastQualifyingDate,
  });

  if (error) {
    logSessionError('sync_my_streak', error.message);
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

export async function updateSessionNotes(
  sessionId: string,
  note: string | null,
  nextBlock: string | null,
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.rpc('update_session_notes', {
    p_session_id: sessionId,
    p_note: note,
    p_next_block: nextBlock,
  });

  if (error) {
    logSessionError('update_session_notes', error.message);
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

export async function fetchSessionHistory(userId: string): Promise<{
  sessions: SessionRecord[];
  error?: string;
}> {
  const { data, error } = await supabase.rpc('get_my_session_history', { p_limit: 365 });

  if (!error && data) {
    return { sessions: (data as DbSessionRow[]).map(mapSessionRow) };
  }

  if (error) {
    logSessionError('get_my_session_history', error.message);
  }

  const { data: rows, error: selectError } = await supabase
    .from('sessions')
    .select('id, coin_type, started_at, duration_mins, note, next_block')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(365);

  if (selectError) {
    const message = error?.message ?? selectError.message;
    return { sessions: [], error: message };
  }

  return {
    sessions: (rows ?? []).map((row) =>
      mapSessionRow({
        id: row.id as string,
        coin_type: row.coin_type as CoinType,
        started_at: row.started_at as string,
        duration_mins: row.duration_mins as number,
        note: row.note,
        next_block: row.next_block,
      }),
    ),
    error: error ? error.message : undefined,
  };
}

export async function fetchUserStats(userId: string): Promise<{
  stats: UserStats;
  error?: string;
}> {
  const { data, error } = await supabase.rpc('get_my_user_stats');

  if (!error && data) {
    const row = data as UserStats;
    return {
      stats: {
        current_streak: row.current_streak ?? 0,
        longest_streak: row.longest_streak ?? 0,
        last_session_date: row.last_session_date ?? null,
        total_lockin_mins: row.total_lockin_mins ?? 0,
        total_flow_mins: row.total_flow_mins ?? 0,
        total_reset_mins: row.total_reset_mins ?? 0,
        total_xp: row.total_xp ?? 0,
      },
    };
  }

  if (error) {
    logSessionError('get_my_user_stats', error.message);
  }

  const { data: row, error: selectError } = await supabase
    .from('user_stats')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (selectError) {
    return { stats: EMPTY_STATS, error: error?.message ?? selectError.message };
  }

  if (!row) {
    return { stats: EMPTY_STATS, error: error?.message };
  }

  const stats = row as UserStats;
  return {
    stats: {
      current_streak: stats.current_streak ?? 0,
      longest_streak: stats.longest_streak ?? 0,
      last_session_date: stats.last_session_date ?? null,
      total_lockin_mins: stats.total_lockin_mins ?? 0,
      total_flow_mins: stats.total_flow_mins ?? 0,
      total_reset_mins: stats.total_reset_mins ?? 0,
      total_xp: stats.total_xp ?? 0,
    },
    error: error?.message,
  };
}
