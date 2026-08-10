import {
  formatChain,
  formatDuration,
  formatElapsedLabel,
  formatFriendCode,
  formatRelativeTime,
  minutesSince,
  totalChainMinutes,
} from '../src/lib/squadFormat';
import { ACTIVITY_ORDER, type SquadBlock } from '../src/types/squad';

const NOW = Date.parse('2026-08-06T12:00:00.000Z');

function minutesAgo(mins: number): string {
  return new Date(NOW - mins * 60_000).toISOString();
}

describe('duration formatting', () => {
  it('renders minutes and hours the way the rows expect', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(125)).toBe('2h 05m');
  });

  it('never renders a negative duration', () => {
    expect(formatDuration(-10)).toBe('0m');
  });
});

describe('elapsed time is computed locally, not polled', () => {
  it('derives minutes from started_at and the current clock', () => {
    expect(minutesSince(minutesAgo(25), NOW)).toBe(25);
    expect(formatElapsedLabel(minutesAgo(90), NOW)).toBe('for 1h 30m');
  });

  it('handles a missing or unparseable timestamp', () => {
    expect(minutesSince(null, NOW)).toBeNull();
    expect(minutesSince('not a date', NOW)).toBeNull();
    expect(formatElapsedLabel(undefined, NOW)).toBeNull();
  });

  // A clock skew between device and server must not render "for -3m".
  it('clamps a future timestamp to zero', () => {
    expect(minutesSince(new Date(NOW + 180_000).toISOString(), NOW)).toBe(0);
  });
});

describe('request timestamps', () => {
  it('reads naturally at every scale', () => {
    expect(formatRelativeTime(minutesAgo(0), NOW)).toBe('just now');
    expect(formatRelativeTime(minutesAgo(5), NOW)).toBe('5m ago');
    expect(formatRelativeTime(minutesAgo(3 * 60), NOW)).toBe('3h ago');
    expect(formatRelativeTime(minutesAgo(24 * 60), NOW)).toBe('yesterday');
    expect(formatRelativeTime(minutesAgo(3 * 24 * 60), NOW)).toBe('3d ago');
    expect(formatRelativeTime(null, NOW)).toBe('');
  });
});

describe('friend codes', () => {
  it('displays in two groups of three', () => {
    expect(formatFriendCode('A7X9BQ')).toBe('A7X 9BQ');
    expect(formatFriendCode('a7x9bq')).toBe('A7X 9BQ');
  });

  it('has a placeholder before a code has been issued', () => {
    expect(formatFriendCode(null)).toBe('——————');
  });
});

describe('the chain shown in the detail view', () => {
  const blocks: SquadBlock[] = [
    { protocol: 'lockin', duration_mins: 50 },
    { protocol: 'reset', duration_mins: 10 },
    { protocol: 'flow', duration_mins: 30 },
  ];

  it('lists completed blocks in order', () => {
    expect(formatChain(blocks)).toBe('LOCK IN 50m  →  RESET 10m  →  FLOW 30m');
    expect(totalChainMinutes(blocks)).toBe(90);
  });

  // Flow is open-ended, so the detail view shows the chain instead of a
  // countdown — the first block of a shift still needs to say something.
  it('has copy for the first block of a shift', () => {
    expect(formatChain([])).toBe('First block of this shift');
    expect(totalChainMinutes([])).toBe(0);
  });
});

describe('friend ordering', () => {
  it('puts the deepest focus first and offline last', () => {
    const states = ['offline', 'paused', 'lockin', 'flow'] as const;
    const sorted = [...states].sort((a, b) => ACTIVITY_ORDER[a] - ACTIVITY_ORDER[b]);
    expect(sorted).toEqual(['lockin', 'flow', 'paused', 'offline']);
  });
});
