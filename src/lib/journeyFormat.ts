import { PROTOCOL_CONFIG, STREAK_MIN_MINUTES } from './protocolConfig';
import type { SessionRecord, UserStats } from './sessionApi';
import { formatPoints, rankFromPoints, totalPointsFromMinutes } from './sessionScoring';

export function formatHoursMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0m';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function formatHoursMinutesLong(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0h 0m';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export function totalFocusMinutes(stats: UserStats): number {
  return stats.total_lockin_mins + stats.total_flow_mins;
}

export function sessionCompletionRate(sessions: SessionRecord[]): number {
  if (sessions.length === 0) return 0;
  const completed = sessions.filter((s) => s.duration_mins >= STREAK_MIN_MINUTES).length;
  return Math.round((completed / sessions.length) * 100);
}

export function resetSessionCount(sessions: SessionRecord[]): number {
  return sessions.filter((s) => s.coin_type === 'reset').length;
}

export function journeyRank(stats: UserStats) {
  const points = totalPointsFromMinutes(stats.total_lockin_mins, stats.total_flow_mins);
  return { points, rank: rankFromPoints(points) };
}

export function founderBadgeLabel(founderNumber: number | null | undefined): string | null {
  if (founderNumber == null || founderNumber < 1 || founderNumber > 100) return null;
  return `Founder №${String(founderNumber).padStart(3, '0')}`;
}

export function formatRankPoints(points: number): string {
  return `${formatPoints(points)} pts`;
}

export function lockInDefaultLabel(): string {
  return `${PROTOCOL_CONFIG.lockin.defaultMinutes} min default`;
}

export function resetDefaultLabel(): string {
  return `${PROTOCOL_CONFIG.reset.defaultMinutes} min · 2 prompts`;
}
