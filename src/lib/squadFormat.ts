import { COIN_LABELS } from '../types/coins';
import type { SquadBlock } from '../types/squad';

/** "45m" / "2h 05m" — friend timings never need seconds. */
export function formatDuration(totalMinutes: number): string {
  const mins = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${String(rest).padStart(2, '0')}m`;
}

export function minutesSince(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const started = new Date(iso).getTime();
  if (Number.isNaN(started)) return null;
  return Math.max(0, Math.floor((nowMs - started) / 60000));
}

/** "for 25m", or null when there is no clock to report. */
export function formatElapsedLabel(iso: string | null | undefined, nowMs: number): string | null {
  const mins = minutesSince(iso, nowMs);
  if (mins == null) return null;
  return `for ${formatDuration(mins)}`;
}

/** "3h ago" / "just now" — for when a friend request arrived. */
export function formatRelativeTime(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const minutes = Math.max(0, Math.floor((nowMs - then) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

export function formatClockTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** "LOCK IN 50m → RESET 10m" — the chain a friend has completed so far. */
export function formatChain(blocks: SquadBlock[]): string {
  if (blocks.length === 0) return 'First block of this shift';
  return blocks
    .map((b) => `${COIN_LABELS[b.protocol]} ${formatDuration(b.duration_mins)}`)
    .join('  →  ');
}

export function totalChainMinutes(blocks: SquadBlock[]): number {
  return blocks.reduce((sum, b) => sum + b.duration_mins, 0);
}

/** Codes are shown and typed in groups of three: "ADA 234". */
export function formatFriendCode(code: string | null): string {
  if (!code) return '——————';
  const clean = code.toUpperCase();
  return clean.length === 6 ? `${clean.slice(0, 3)} ${clean.slice(3)}` : clean;
}
