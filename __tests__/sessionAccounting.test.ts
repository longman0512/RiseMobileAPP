import {
  appendLeg,
  countdownLegSeconds,
  flowLegSeconds,
  scoringMinutes,
  secondsToBilledMinutes,
} from '../src/lib/sessionAccounting';
import {
  resolveSessionSave,
  sumFocusMinutes,
  sumRecoveryMinutes,
  sumSegmentMinutes,
  type SessionSegment,
} from '../src/lib/sessionApi';

describe('leg duration math', () => {
  it('bills a started leg for at least one minute and rounds partials up', () => {
    expect(secondsToBilledMinutes(1)).toBe(1);
    expect(secondsToBilledMinutes(59)).toBe(1);
    expect(secondsToBilledMinutes(61)).toBe(2);
    expect(secondsToBilledMinutes(600)).toBe(10);
  });

  it('counts only the current FLOW leg, not the whole elapsed counter', () => {
    // Fresh FLOW: base 0, ten minutes on the clock.
    expect(flowLegSeconds(600, 0)).toBe(600);
    // FLOW resumed after a RESET at 10:00, now showing 15:00 total.
    expect(flowLegSeconds(900, 600)).toBe(300);
  });

  it('counts a countdown leg including overtime', () => {
    expect(countdownLegSeconds(50, 3000, 0)).toBe(0);
    expect(countdownLegSeconds(50, 600, 0)).toBe(2400);
    expect(countdownLegSeconds(30, 0, 120)).toBe(1920);
  });
});

describe('FLOW ↔ RESET chain accounting', () => {
  // Regression: the pre-break FLOW minutes used to be written to `segments`
  // twice, once when RESET interrupted and again when the session ended.
  it('does not double-count FLOW time across a RESET break', () => {
    let segments: SessionSegment[] = [];

    // FLOW runs to 10:00, user taps RESET.
    segments = appendLeg(segments, 'flow', flowLegSeconds(600, 0));
    // RESET runs its full 10 minutes, FLOW resumes from 10:00.
    segments = appendLeg(segments, 'reset', countdownLegSeconds(10, 0, 0));
    // FLOW runs on to 15:00 total and the user ends the session.
    segments = appendLeg(segments, 'flow', flowLegSeconds(900, 600));

    expect(segments).toEqual([
      { protocol: 'flow', duration_mins: 10 },
      { protocol: 'reset', duration_mins: 10 },
      { protocol: 'flow', duration_mins: 5 },
    ]);
    expect(sumFocusMinutes(segments)).toBe(15);
    expect(sumRecoveryMinutes(segments)).toBe(10);
    expect(sumSegmentMinutes(segments)).toBe(25);
  });

  it('saves a FLOW chain as one FLOW row holding the focus minutes', () => {
    const segments: SessionSegment[] = [
      { protocol: 'flow', duration_mins: 10 },
      { protocol: 'reset', duration_mins: 10 },
      { protocol: 'flow', duration_mins: 5 },
    ];

    expect(resolveSessionSave('flow', segments, 'flow')).toEqual({
      coin_type: 'flow',
      duration_mins: 15,
      segments,
    });
  });
});

describe('what gets written to the sessions table', () => {
  // Regression: RESET-only sessions were saved with duration_mins = 1 because
  // the caller passed focus minutes (always 0 for RESET) as an override.
  it('saves a RESET-only session with its real duration', () => {
    const segments: SessionSegment[] = [{ protocol: 'reset', duration_mins: 10 }];

    expect(resolveSessionSave('reset', segments, 'reset')).toEqual({
      coin_type: 'reset',
      duration_mins: 10,
      segments,
    });
  });

  it('saves a LOCK IN session with its full length', () => {
    const segments: SessionSegment[] = [{ protocol: 'lockin', duration_mins: 50 }];

    expect(resolveSessionSave('lockin', segments, 'lockin')).toEqual({
      coin_type: 'lockin',
      duration_mins: 50,
      segments,
    });
  });

  it('never writes a zero-minute session', () => {
    expect(resolveSessionSave(null, [], 'lockin').duration_mins).toBe(1);
  });
});

describe('scoring minutes', () => {
  it('scores LOCK IN on its own leg and FLOW on the whole chain', () => {
    expect(scoringMinutes('lockin', 50, 50)).toBe(50);
    expect(scoringMinutes('flow', 5, 15)).toBe(15);
    expect(scoringMinutes('reset', 10, 0)).toBe(0);
  });
});
