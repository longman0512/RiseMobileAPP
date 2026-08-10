/** Ranks are earned with XP — see src/lib/xp.ts for how XP is awarded. */
export type RankName = 'Initiate' | 'Operator' | 'Architect' | 'Master';

export type RankInfo = {
  name: RankName;
  minPoints: number;
  nextName: RankName | null;
  nextMinPoints: number | null;
  progress: number;
  pointsToNext: number | null;
};

export const RANK_THRESHOLDS: { name: RankName; minPoints: number }[] = [
  { name: 'Initiate', minPoints: 0 },
  { name: 'Operator', minPoints: 500 },
  { name: 'Architect', minPoints: 1500 },
  { name: 'Master', minPoints: 3000 },
];

export function rankFromPoints(totalPoints: number): RankInfo {
  let current = RANK_THRESHOLDS[0];
  let next = RANK_THRESHOLDS[1] ?? null;

  for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i -= 1) {
    if (totalPoints >= RANK_THRESHOLDS[i].minPoints) {
      current = RANK_THRESHOLDS[i];
      next = RANK_THRESHOLDS[i + 1] ?? null;
      break;
    }
  }

  const span = next ? next.minPoints - current.minPoints : 1;
  const into = totalPoints - current.minPoints;
  const progress = next ? Math.min(1, Math.max(0, into / span)) : 1;

  return {
    name: current.name,
    minPoints: current.minPoints,
    nextName: next?.name ?? null,
    nextMinPoints: next?.minPoints ?? null,
    progress,
    pointsToNext: next ? Math.max(0, next.minPoints - totalPoints) : null,
  };
}

export function formatPoints(n: number): string {
  return n.toLocaleString('en-US');
}
