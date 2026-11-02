// Brief §7 "Savings target tool": the person enters a monthly target; pick the
// changes whose monthly saving is closest to it, preferring sums at or above the
// target, then fewer changes. Every subset is checked up to 20 changes.

import type { Recommendation } from './types';

export type TargetPick = { ids: string[]; monthly: number };

export function pickForTarget(recs: Recommendation[], targetMonthly: number): TargetPick | undefined {
  const opts = recs.filter((r) => r.potentialYearlySaving > 0).map((r) => ({ id: r.itemId, m: r.potentialYearlySaving / 12 }));
  if (!opts.length || !(targetMonthly > 0)) return undefined;
  let best: { ids: string[]; m: number; score: [number, number, number] } | undefined;
  const consider = (ids: string[], m: number) => {
    const reaches = m >= targetMonthly - 0.005 ? 0 : 1;
    const score: [number, number, number] = [reaches, Math.round(Math.abs(m - targetMonthly) * 100), ids.length];
    if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && (score[1] < best.score[1] || (score[1] === best.score[1] && score[2] < best.score[2])))) best = { ids, m, score };
  };
  if (opts.length <= 20) {
    for (let mask = 1; mask < 1 << opts.length; mask++) {
      const ids: string[] = []; let m = 0;
      for (let i = 0; i < opts.length; i++) if (mask & (1 << i)) { ids.push(opts[i]!.id); m += opts[i]!.m; }
      consider(ids, m);
    }
  } else {
    const sorted = [...opts].sort((a, b) => b.m - a.m); const ids: string[] = []; let m = 0;
    for (const o of sorted) { if (m >= targetMonthly) break; ids.push(o.id); m += o.m; }
    consider(ids, m);
  }
  return best ? { ids: best.ids, monthly: Math.round(best.m * 100) / 100 } : undefined;
}
