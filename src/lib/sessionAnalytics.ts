import { STREAK_MIN_MINUTES } from './protocolConfig';
import type { SessionRecord } from './sessionApi';

export type HeatmapDay = {
  date: string;
  intensity: number;
  focusMinutes: number;
  sessions: SessionRecord[];
};

/** Focus time counts lockin + flow only (reset is recovery). */
export function focusMinutesForSession(session: SessionRecord): number {
  if (session.coin_type === 'reset') return 0;
  return session.duration_mins;
}

export function toLocalDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function intensityFromFocusMinutes(focusMinutes: number): number {
  if (focusMinutes <= 0) return 0;
  if (focusMinutes < 120) return 1;
  if (focusMinutes < 240) return 2;
  if (focusMinutes < 360) return 3;
  return 4;
}

export function focusIntensityLabel(intensity: number): string {
  if (intensity === 0) return 'No activity';
  if (intensity === 1) return '1-2 hours';
  if (intensity === 2) return '2-4 hours';
  if (intensity === 3) return '4-6 hours';
  return '6+ hours';
}

export function groupSessionsByDate(sessions: SessionRecord[]): Map<string, SessionRecord[]> {
  const map = new Map<string, SessionRecord[]>();
  for (const session of sessions) {
    const key = toLocalDateKey(session.started_at);
    const list = map.get(key) ?? [];
    list.push(session);
    map.set(key, list);
  }
  return map;
}

function dateKeyFromOffset(daysAgo: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return toLocalDateKey(d.toISOString());
}

/** Local calendar date (YYYY-MM-DD) for streak day logic — matches the heatmap. */
export function localTodayKey(): string {
  return dateKeyFromOffset(0);
}

function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return toLocalDateKey(d.toISOString());
}

/** Daily focus minutes keyed by local calendar date. */
export function focusMinutesByLocalDate(sessions: SessionRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const session of sessions) {
    const key = toLocalDateKey(session.started_at);
    map.set(key, (map.get(key) ?? 0) + focusMinutesForSession(session));
  }
  return map;
}

export function isQualifyingStreakDay(
  focusMinutes: number,
  minMinutes = STREAK_MIN_MINUTES,
): boolean {
  return focusMinutes >= minMinutes;
}

/** Consecutive local days with >= minMinutes focus, ending today or yesterday. */
export function computeCurrentStreak(
  sessions: SessionRecord[],
  minMinutes = STREAK_MIN_MINUTES,
): number {
  const byDay = focusMinutesByLocalDate(sessions);
  const today = localTodayKey();
  const yesterday = dateKeyFromOffset(1);

  let startDate: string | null = null;
  if (isQualifyingStreakDay(byDay.get(today) ?? 0, minMinutes)) {
    startDate = today;
  } else if (isQualifyingStreakDay(byDay.get(yesterday) ?? 0, minMinutes)) {
    startDate = yesterday;
  } else {
    return 0;
  }

  let streak = 0;
  let cursor = startDate;
  while (isQualifyingStreakDay(byDay.get(cursor) ?? 0, minMinutes)) {
    streak++;
    cursor = addDaysToDateKey(cursor, -1);
  }
  return streak;
}

/** Longest run of consecutive qualifying local days in session history. */
export function computeLongestStreak(
  sessions: SessionRecord[],
  minMinutes = STREAK_MIN_MINUTES,
): number {
  const byDay = focusMinutesByLocalDate(sessions);
  const qualifyingDates = [...byDay.entries()]
    .filter(([, mins]) => isQualifyingStreakDay(mins, minMinutes))
    .map(([date]) => date)
    .sort();

  if (qualifyingDates.length === 0) return 0;

  let longest = 1;
  let current = 1;
  for (let i = 1; i < qualifyingDates.length; i++) {
    const prev = qualifyingDates[i - 1];
    const curr = qualifyingDates[i];
    if (addDaysToDateKey(prev, 1) === curr) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}

/** Most recent local date with >= minMinutes focus (for server sync). */
export function lastQualifyingDateKey(
  sessions: SessionRecord[],
  minMinutes = STREAK_MIN_MINUTES,
): string | null {
  const byDay = focusMinutesByLocalDate(sessions);
  let latest: string | null = null;
  for (const [date, mins] of byDay) {
    if (!isQualifyingStreakDay(mins, minMinutes)) continue;
    if (!latest || date > latest) latest = date;
  }
  return latest;
}

export function buildHeatmapDays(sessions: SessionRecord[], days = 90): HeatmapDay[] {
  const byDate = groupSessionsByDate(sessions);
  const result: HeatmapDay[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = dateKeyFromOffset(i);
    const daySessions = byDate.get(date) ?? [];
    const focusMinutes = daySessions.reduce(
      (sum, s) => sum + focusMinutesForSession(s),
      0,
    );
    result.push({
      date,
      focusMinutes,
      intensity: intensityFromFocusMinutes(focusMinutes),
      sessions: daySessions.sort(
        (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
      ),
    });
  }

  return result;
}

function startOfLocalWeek(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/** Sum of focus minutes in the current calendar week (Sun–Sat), as hours. */
export function weeklyFocusHours(sessions: SessionRecord[]): number {
  const weekStart = startOfLocalWeek().getTime();
  const focusMins = sessions
    .filter((s) => new Date(s.started_at).getTime() >= weekStart)
    .reduce((sum, s) => sum + focusMinutesForSession(s), 0);
  return Math.round((focusMins / 60) * 10) / 10;
}
