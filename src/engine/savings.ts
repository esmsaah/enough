// Enough — savings target tool. Section 7 of ENOUGH_BRIEF.md.
// From items with a saving above 0, pick the subset whose monthly saving is
// closest to the target, preferring sums at or above it, then fewer items.
// With 20 items or fewer, check every subset.

export type SavingCandidate = { id: string; name: string; monthlySaving: number };

export function pickSavingsSubset(
  candidates: SavingCandidate[],
  targetMonthly: number,
): SavingCandidate[] {
  const pool = candidates.filter((c) => c.monthlySaving > 0);
  if (pool.length === 0 || targetMonthly <= 0) return [];
  if (pool.length > 20) {
    // Safety valve (§7 says ≤20 subsets); greedily take the largest savers.
    const sorted = [...pool].sort((a, b) => b.monthlySaving - a.monthlySaving);
    const out: SavingCandidate[] = [];
    let sum = 0;
    for (const c of sorted) {
      if (sum >= targetMonthly) break;
      out.push(c);
      sum += c.monthlySaving;
    }
    return out;
  }

  let best: SavingCandidate[] | null = null;
  let bestScore: { over: boolean; dist: number; count: number } | null = null;

  for (let mask = 1; mask < 1 << pool.length; mask++) {
    const subset: SavingCandidate[] = [];
    let sum = 0;
    for (let i = 0; i < pool.length; i++) {
      if (mask & (1 << i)) {
        subset.push(pool[i]!);
        sum += pool[i]!.monthlySaving;
      }
    }
    const over = sum >= targetMonthly;
    const dist = Math.abs(sum - targetMonthly);
    if (
      !bestScore ||
      betterThan({ over, dist, count: subset.length }, bestScore)
    ) {
      best = subset;
      bestScore = { over, dist, count: subset.length };
    }
  }
  return best ?? [];
}

// Prefer sums at or above target, then closest, then fewer items.
function betterThan(a: { over: boolean; dist: number; count: number }, b: { over: boolean; dist: number; count: number }): boolean {
  if (a.over !== b.over) return a.over; // reaching the target wins
  if (a.dist !== b.dist) return a.dist < b.dist;
  return a.count < b.count;
}
