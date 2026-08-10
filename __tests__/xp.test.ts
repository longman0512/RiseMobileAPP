import {
  blockXp,
  focusBlockCount,
  shiftXp,
  totalFocusMinutes,
  totalOvertimeMinutes,
  XP_RATES,
  type ShiftBlock,
} from '../src/lib/xp';
import {
  suggestPauseMinutes,
  MAX_PAUSE_MINUTES,
  MIN_PAUSE_MINUTES,
  TIREDNESS_LEVELS,
} from '../src/lib/pauseDuration';

describe('XP rates', () => {
  it('matches the rates the client specified', () => {
    expect(XP_RATES.lockin).toEqual({ standard: 1.5, overtime: 2 });
    expect(XP_RATES.flow).toEqual({ standard: 1, overtime: 1.5 });
    expect(XP_RATES.reset).toEqual({ standard: 0, overtime: 0 });
  });

  it('always pays more for overtime than standard time', () => {
    expect(XP_RATES.lockin.overtime).toBeGreaterThan(XP_RATES.lockin.standard);
    expect(XP_RATES.flow.overtime).toBeGreaterThan(XP_RATES.flow.standard);
  });
});

describe('block XP', () => {
  it('charges standard and overtime minutes at their own rates', () => {
    expect(blockXp({ protocol: 'lockin', standardMins: 50, overtimeMins: 0 })).toBe(75);
    expect(blockXp({ protocol: 'lockin', standardMins: 50, overtimeMins: 10 })).toBe(95);
    expect(blockXp({ protocol: 'flow', standardMins: 30, overtimeMins: 20 })).toBe(60);
  });

  it('never scores a RESET', () => {
    expect(blockXp({ protocol: 'reset', standardMins: 15, overtimeMins: 5 })).toBe(0);
  });
});

describe('shift breakdown', () => {
  const blocks: ShiftBlock[] = [
    { protocol: 'lockin', standardMins: 50, overtimeMins: 10 }, // 75 + 20 = 95
    { protocol: 'reset', standardMins: 10, overtimeMins: 0 }, // 0
    { protocol: 'flow', standardMins: 40, overtimeMins: 0 }, // 40
  ];

  it('splits earnings by protocol', () => {
    const xp = shiftXp(blocks);
    expect(xp.lockin).toBe(95);
    expect(xp.flow).toBe(40);
    expect(xp.total).toBe(135);
  });

  // The per-protocol numbers already contain overtime earnings, so the bonus is
  // reported as the premium only. Adding it to the total would double-count.
  it('reports the overtime premium separately without double counting', () => {
    const xp = shiftXp(blocks);
    expect(xp.overtimeBonus).toBe(5); // 10 min × (2 − 1.5)
    expect(xp.lockin + xp.flow).toBe(xp.total);
  });

  it('is empty for a shift with no blocks', () => {
    expect(shiftXp([])).toEqual({ lockin: 0, flow: 0, overtimeBonus: 0, total: 0 });
  });

  it('counts focus time and blocks, ignoring pauses', () => {
    expect(totalFocusMinutes(blocks)).toBe(100);
    expect(totalOvertimeMinutes(blocks)).toBe(10);
    expect(focusBlockCount(blocks)).toBe(2);
  });
});

describe('pause suggestion', () => {
  it('scales with tiredness on a fresh shift', () => {
    const fresh = { shiftFocusMinutes: 0, cameFromOvertime: false };
    expect(suggestPauseMinutes({ tiredness: 1, ...fresh })).toBe(5);
    expect(suggestPauseMinutes({ tiredness: 3, ...fresh })).toBe(12);
    expect(suggestPauseMinutes({ tiredness: 5, ...fresh })).toBe(25);
  });

  it('adds time for a long shift and for overtime', () => {
    expect(
      suggestPauseMinutes({ tiredness: 3, shiftFocusMinutes: 60, cameFromOvertime: false }),
    ).toBe(16); // 12 + 4
    expect(
      suggestPauseMinutes({ tiredness: 3, shiftFocusMinutes: 60, cameFromOvertime: true }),
    ).toBe(18); // 12 + 4 + 2
  });

  it('stays within the allowed range whatever the inputs', () => {
    for (const tiredness of TIREDNESS_LEVELS) {
      for (const mins of [0, 30, 240, 1000]) {
        const result = suggestPauseMinutes({
          tiredness,
          shiftFocusMinutes: mins,
          cameFromOvertime: true,
        });
        expect(result).toBeGreaterThanOrEqual(MIN_PAUSE_MINUTES);
        expect(result).toBeLessThanOrEqual(MAX_PAUSE_MINUTES);
      }
    }
  });

  it('ignores a negative focus total', () => {
    expect(
      suggestPauseMinutes({ tiredness: 2, shiftFocusMinutes: -100, cameFromOvertime: false }),
    ).toBe(8);
  });
});
