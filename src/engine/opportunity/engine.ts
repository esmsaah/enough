// Opportunity engine — proof of concept (not wired into the app yet).
// Deterministic. Every € comes from a verified plan (plans.<market>.json) or a
// number the person typed. An option is generated only when every stated need
// is still met. Savings are computed from the final configuration over the next
// 12 billing periods, never by adding up separate claims.

export type Plan = {
  service: string;
  plan: string;
  monthly: number;
  billing: string[];
  features: { ads?: boolean; streams?: number; quality?: number; storageGb?: number };
  accounts: number;
  sameAddress: boolean;
  requires?: 'student' | 'family';
  source: string;
  checked?: string;
};
export type Market = { market: string; currency: string; verified: string; plans: Plan[] };

export type Importance = 'wouldMiss' | 'canLiveWithout' | 'unknown';

export type Sub = {
  id: string;
  name: string;
  service?: string; // key into the market plans, if we have researched plans
  plan?: string; // plan name, if known
  monthly: number; // what the person pays now
  priceSource: 'statement' | 'typed';
  nextCharge?: string; // ISO date of the next payment (statement), else unknown
  lockedUntil?: string; // ISO date: contract end or end of a prepaid period
  fixedBill?: boolean; // power, water, TV fee: nothing to switch
  importance: Importance;
  rotatable?: boolean; // video, used sometimes, the person keeps it
  pinned?: boolean; // the person wants it on all year
  needs?: { viewersAtOnce?: number; adsOk?: boolean; needs4K?: boolean; minQuality?: number; storageUsedGb?: number; student?: boolean };
  // Other people at the SAME address paying their own account of this service.
  household?: Array<{ id: string; monthly: number; storageUsedGb?: number; sameAddress: boolean }>;
  membership?: { visitsPerMonth: number; singleVisit?: number };
};

export type Loss = 0 | 1 | 2; // 0 nothing given up · 1 wait (rotation) · 2 drop what you said you can live without
export type Option = {
  id: string;
  kind: 'planFit' | 'householdPlan' | 'rotation' | 'payPerVisit' | 'cancel';
  affects: string[]; // item ids (and household account ids) this option changes
  loss: Loss;
  baseline12: number; // what the affected accounts cost in the next 12 periods today
  after12: number; // what they cost with this option
  saving12: number;
  startsOn?: string; // first payment that changes
  deadline?: string; // act before this date
  title: string;
  evidence: string[];
  sources: string[];
  confidence: 'high' | 'medium';
  schedule?: Array<{ service: string; on: string; off: string; steps: string[] }>;
  /** Money freed per item of the person (household accounts count on their own item). */
  perItem: Record<string, number>;
  /** The plan to switch to, for planFit and householdPlan. */
  newPlan?: { name: string; monthly: number };
};
export type Conditional = { itemId: string; question: string; ifYes: string; saving12IfYes: number };
export type Exposure = { freeNow: number; locked: Array<{ name: string; monthly: number; until: string }>; fixed: number; total: number };
export type Result = {
  options: Option[];
  levels: Array<{ maxLoss: Loss; saving12: number; chosen: string[] }>;
  conditionals: Conditional[];
  noOpportunity: Array<{ itemId: string; why: string }>;
  exposure: Exposure;
};

// ---------- dates and money ----------
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function addMonths(iso: string, k: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1 + k, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}
const dayBefore = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
/** The 12 payment dates in the next 12 billing periods. Unknown billing day: a month from today. */
function slots(s: Pick<Sub, 'nextCharge'>, today: string): string[] {
  const first = s.nextCharge ?? addMonths(today, 1);
  return Array.from({ length: 12 }, (_, k) => addMonths(first, k));
}
/** Cost over the 12 periods when the price changes from `from` (inclusive). */
function costWithChange(s: Sub, today: string, newMonthly: number, from: string): number {
  return r2(slots(s, today).reduce((sum, d) => sum + (d >= from ? newMonthly : s.monthly), 0));
}
const earliestChange = (s: Sub, today: string) => {
  const first = slots(s, today)[0]!;
  return s.lockedUntil && s.lockedUntil > first ? slots(s, today).find((d) => d >= s.lockedUntil!) ?? '9999-12-31' : first;
};
/** 'BA' → 'Bosnia & Herzegovina'. */
const countryName = (code: string) => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code === 'UK' ? 'GB' : code) ?? code; } catch { return code; } };
const fmt = (n: number, cur: string) => new Intl.NumberFormat('en', { style: 'currency', currency: cur }).format(n);

// ---------- 1. plan fit ----------
/** Plans of the same service that still cover every need. Unknown need = keep today's level. */
function fittingPlans(s: Sub, m: Market): { fits: Plan[]; current?: Plan; unknown: string[] } {
  const all = m.plans.filter((p) => p.service === s.service);
  const current = all.find((p) => p.plan === s.plan) ?? all.find((p) => Math.abs(p.monthly - s.monthly) <= Math.max(0.06, s.monthly * 0.02));
  const n = s.needs ?? {};
  const unknown: string[] = [];
  const fits = all.filter((p) => {
    if (p.requires === 'student' && !n.student) return false;
    if (p.accounts > 1 && p.requires !== 'family') return false; // shared plans are a household option, not a plan fit
    const f = p.features, c = current?.features ?? {};
    if (f.streams !== undefined) {
      const need = n.viewersAtOnce ?? c.streams;
      if (n.viewersAtOnce === undefined) unknown.push('viewers');
      if (need === undefined || f.streams < need) return false;
    }
    if (f.ads) { if (n.adsOk !== true) { if (n.adsOk === undefined) unknown.push('ads'); return false; } }
    if (f.quality !== undefined) {
      const need = n.minQuality ?? (n.needs4K === true ? 2160 : n.needs4K === false ? 0 : (c.quality ?? 0));
      if (n.minQuality === undefined && n.needs4K === undefined) unknown.push('4k');
      if (f.quality < need) return false;
    }
    if (f.storageGb !== undefined) {
      const used = n.storageUsedGb;
      if (used === undefined) { unknown.push('storage'); if (f.storageGb < (c.storageGb ?? Infinity)) return false; }
      else if (f.storageGb < used * 1.1) return false; // 10% headroom
    }
    return true;
  });
  return { fits, ...(current ? { current } : {}), unknown: [...new Set(unknown)] };
}

function planFitOption(s: Sub, m: Market, today: string): Option | undefined {
  if (!s.service) return undefined;
  const { fits, current } = fittingPlans(s, m);
  const best = fits.filter((p) => p.monthly < s.monthly - 0.005).sort((a, b) => a.monthly - b.monthly)[0];
  if (!best) return undefined;
  const from = earliestChange(s, today);
  const base = r2(s.monthly * 12), after = costWithChange(s, today, best.monthly, from);
  if (after >= base) return undefined;
  const lost: string[] = [];
  if (current?.features.streams && best.features.streams && best.features.streams < current.features.streams) lost.push(`${current.features.streams - best.features.streams} screens you don't use`);
  if (current?.features.quality && best.features.quality && best.features.quality < current.features.quality) lost.push(best.features.quality >= 1080 ? '4K' : best.features.quality >= 720 ? 'Full HD (720p instead)' : 'HD picture');
  if (current?.features.storageGb && best.features.storageGb && best.features.storageGb < current.features.storageGb) lost.push('storage you don\'t use');
  if (best.features.ads && !current?.features.ads) lost.push('ad-free (you said ads are OK)');
  const n = s.needs ?? {};
  return {
    id: `fit:${s.id}`, kind: 'planFit', affects: [s.id], loss: 0, baseline12: base, after12: after, saving12: r2(base - after),
    startsOn: from, deadline: dayBefore(from),
    title: `${s.name}: switch ${current?.plan ?? 'your plan'} to ${best.plan}`,
    evidence: [
      `You pay ${fmt(s.monthly, m.currency)} a month (${s.priceSource === 'statement' ? 'from your statement' : 'from your answers, change it in Check if yours differs'}).`,
      ...(n.viewersAtOnce !== undefined ? [`Up to ${n.viewersAtOnce} ${n.viewersAtOnce === 1 ? 'person watches' : 'people watch'} at once, ${best.plan} allows ${best.features.streams}.`] : []),
      ...(n.storageUsedGb !== undefined ? [`You use ${n.storageUsedGb} GB, ${best.plan} holds ${best.features.storageGb} GB (we keep 10% room to grow).`] : []),
      `${best.plan} is ${fmt(best.monthly, m.currency)} a month in ${countryName(m.market)}.`,
      ...(lost.length ? [`You give up ${lost.join(', ')}.`] : []),
    ],
    sources: [`${best.source} (checked ${best.checked ?? m.verified})`],
    confidence: s.priceSource === 'statement' ? 'high' : 'medium',
    perItem: { [s.id]: r2(base - after) },
    newPlan: { name: best.plan, monthly: best.monthly },
  };
}

// ---------- 1b. one shared plan for one home ----------
function householdOption(s: Sub, m: Market, today: string): Option | undefined {
  const others = (s.household ?? []).filter((h) => h.sameAddress);
  if (!s.service || !others.length) return undefined;
  const people = 1 + others.length;
  const storageNeed = s.service === 'icloud' ? (s.needs?.storageUsedGb ?? NaN) + others.reduce((a, h) => a + (h.storageUsedGb ?? NaN), 0) : 0;
  if (Number.isNaN(storageNeed)) return undefined; // can't size a shared storage plan without everyone's usage
  const shared = m.plans
    .filter((p) => p.service === s.service && p.accounts >= people && (p.features.storageGb === undefined || p.features.storageGb >= storageNeed * 1.1))
    .sort((a, b) => a.monthly - b.monthly)[0];
  if (!shared) return undefined;
  const from = earliestChange(s, today);
  const base = r2((s.monthly + others.reduce((a, h) => a + h.monthly, 0)) * 12);
  const after = r2(costWithChange(s, today, shared.monthly, from) + others.reduce((a, h) => a + slots(s, today).filter((d) => d < from).length * h.monthly, 0));
  if (after >= base) return undefined;
  return {
    id: `home:${s.id}`, kind: 'householdPlan', affects: [s.id, ...others.map((h) => h.id)], loss: 0, baseline12: base, after12: after, saving12: r2(base - after),
    startsOn: from, deadline: dayBefore(from),
    title: `${s.name}: ${people} accounts at one address → ${shared.plan}`,
    evidence: [
      `${people} people at the same address each pay for ${s.name}, ${fmt(base / 12, m.currency)} a month together.`,
      `${shared.plan} covers ${shared.accounts} accounts for ${fmt(shared.monthly, m.currency)}.`,
      ...(shared.sameAddress ? ['Everyone on it must live at the same address (provider rule).'] : []),
      ...(storageNeed ? [`Together you use ${storageNeed} GB, ${shared.plan} holds ${shared.features.storageGb} GB.`] : []),
    ],
    sources: [`${shared.source} (checked ${shared.checked ?? m.verified})`], confidence: 'medium',
    perItem: { [s.id]: r2(base - after) },
    newPlan: { name: shared.plan, monthly: shared.monthly },
  };
}

// ---------- 2. rotation ----------
function rotationOption(subs: Sub[], m: Market, today: string, useFitted: Map<string, number>): Option | undefined {
  // Prepaid or contracted services can't pause, so they stay out of the rotation.
  const group = subs.filter((s) => s.rotatable && !s.pinned && !s.fixedBill && s.importance !== 'canLiveWithout' && !(s.lockedUntil && s.lockedUntil > today));
  if (group.length < 2) return undefined;
  const ordered = [...group].sort((a, b) => slots(a, today)[0]!.localeCompare(slots(b, today)[0]!) || a.name.localeCompare(b.name));
  const n = ordered.length, block = Math.floor(12 / n);
  let base = 0, after = 0;
  const schedule: NonNullable<Option['schedule']> = [];
  const evidence: string[] = [];
  // Each block starts the day after the previous one ends. Subscribing again sets a
  // new billing day, so the next charges follow the restart date, not the old one.
  let cursor = '';
  const perItem: Record<string, number> = {};
  for (const [i, s] of ordered.entries()) {
    const sl = slots(s, today);
    const start = i * block, end = i === n - 1 ? 12 : (i + 1) * block; // last one takes the remainder
    const count = end - start;
    const keepPrice = useFitted.get(s.id) ?? s.monthly;
    // Coming back after a gap costs today's list price, which can be higher than an old price.
    const list = s.service ? m.plans.find((p) => p.service === s.service && Math.abs(p.monthly - keepPrice) < 0.01)?.monthly ?? m.plans.find((p) => p.service === s.service && p.plan === s.plan)?.monthly : undefined;
    const rejoin = Math.max(keepPrice, list ?? keepPrice);
    base += s.monthly * 12;
    const steps: string[] = [];
    let on: string, paidUntil: string;
    const afterBefore = after;
    if (i === 0) {
      after += count * keepPrice;
      on = today; paidUntil = sl[end]!;
      if (useFitted.has(s.id)) steps.push(`switch to the cheaper plan before ${dayBefore(sl[0]!)}`);
      steps.push(`cancel before ${dayBefore(paidUntil)}`);
    } else {
      if (list === undefined) evidence.push(`${s.name}: no verified list price, assumes the same price when you return.`);
      else if (rejoin > keepPrice) evidence.push(`${s.name}: you pay ${fmt(keepPrice, m.currency)} now, coming back costs today's ${fmt(rejoin, m.currency)}.`);
      after += count * rejoin;
      on = cursor; paidUntil = addMonths(cursor, count);
      steps.push(`cancel before ${dayBefore(sl[0]!)} (paid until then)`, `subscribe again on ${on}`);
      if (i < n - 1) steps.push(`cancel before ${dayBefore(paidUntil)}`);
    }
    perItem[s.id] = r2(s.monthly * 12 - (after - afterBefore));
    cursor = paidUntil;
    schedule.push({ service: s.name, on, off: dayBefore(paidUntil), steps });
  }
  base = r2(base); after = r2(after);
  if (after >= base) return undefined;
  const cur = m.currency;
  return {
    id: `rot:${ordered.map((s) => s.id).join('+')}${useFitted.size ? ':fitted' : ''}`, kind: 'rotation', affects: ordered.map((s) => s.id), loss: 1,
    baseline12: base, after12: after, saving12: r2(base - after),
    title: `Rotate ${ordered.map((s) => s.name).join(', ')}: one at a time, ${block} months each`,
    evidence: [
      `You keep all of them and use each only sometimes.`,
      `Today: ${fmt(base, cur)} over 12 months. Rotating: ${fmt(after, cur)}.`,
      ...evidence,
      'You wait for a show until its service is on. Nothing is lost, you keep your account and profile.',
    ],
    sources: [...new Set(ordered.flatMap((s) => m.plans.filter((p) => p.service === s.service).map((p) => `${p.source} (checked ${p.checked ?? m.verified})`)))],
    confidence: ordered.every((s) => s.nextCharge) ? 'high' : 'medium',
    schedule,
    perItem,
  };
}

// ---------- 3. cost of use ----------
function payPerVisitOption(s: Sub, m: Market, today: string): Option | undefined {
  const v = s.membership;
  if (!v || !(v.singleVisit && v.singleVisit > 0)) return undefined;
  const newMonthly = r2(v.singleVisit * v.visitsPerMonth);
  if (newMonthly >= s.monthly) return undefined;
  const from = earliestChange(s, today);
  const base = r2(s.monthly * 12), after = costWithChange(s, today, newMonthly, from);
  return {
    id: `visit:${s.id}`, kind: 'payPerVisit', affects: [s.id], loss: 0, baseline12: base, after12: after, saving12: r2(base - after), startsOn: from,
    ...(s.lockedUntil ? { deadline: dayBefore(from) } : {}),
    title: `${s.name}: pay per visit`,
    evidence: [
      `${v.visitsPerMonth} visits a month on a ${fmt(s.monthly, m.currency)} plan is ${fmt(s.monthly / Math.max(1, v.visitsPerMonth), m.currency)} a visit.`,
      `You said one visit costs ${fmt(v.singleVisit, m.currency)}, so ${fmt(newMonthly, m.currency)} a month for the same visits.`,
      ...(s.lockedUntil ? [`Your contract runs until ${s.lockedUntil}, so the saving starts on ${from}. Check the notice period in your contract, it can be a month or more.`] : []),
    ],
    sources: ['your own prices'], confidence: 'medium',
    perItem: { [s.id]: r2(base - after) },
  };
}

// ---------- cancel (only what the person said they can live without) ----------
function cancelOption(s: Sub, _m: Market, today: string): Option | undefined {
  if (s.importance !== 'canLiveWithout' || s.fixedBill) return undefined;
  const from = earliestChange(s, today);
  const base = r2(s.monthly * 12), after = costWithChange(s, today, 0, from);
  if (after >= base) return undefined;
  return {
    id: `cancel:${s.id}`, kind: 'cancel', affects: [s.id], loss: 2, baseline12: base, after12: after, saving12: r2(base - after), startsOn: from, deadline: dayBefore(from),
    title: `${s.name}: cancel`, evidence: [`You said you can live without it.`, ...(s.lockedUntil ? [`Paid or contracted until ${s.lockedUntil}.`] : [])],
    sources: [s.priceSource === 'statement' ? 'your statement' : 'your price'], confidence: s.priceSource === 'statement' ? 'high' : 'medium',
    perItem: { [s.id]: r2(base - after) },
  };
}

// ---------- abstention: what one answer would unlock ----------
function conditionals(s: Sub, m: Market, today: string): Conditional[] {
  if (!s.service) return [];
  const { unknown } = fittingPlans(s, m);
  const out: Conditional[] = [];
  const tryWith = (needs: Sub['needs'], q: string, label: string) => {
    const o = planFitOption({ ...s, needs: { ...s.needs, ...needs } }, m, today);
    const now = planFitOption(s, m, today);
    if (o && o.saving12 > (now?.saving12 ?? 0)) out.push({ itemId: s.id, question: q, ifYes: `${label}: ${o.title.split(': ')[1]}`, saving12IfYes: r2(o.saving12 - (now?.saving12 ?? 0)) });
  };
  if (unknown.includes('4k')) tryWith({ viewersAtOnce: s.needs?.viewersAtOnce ?? 1, minQuality: 720 }, s.needs?.viewersAtOnce !== undefined ? `Would HD (720p) picture be enough on ${s.name}?` : `Does one person watch ${s.name} at a time, and is HD (720p) picture enough?`, 'If yes');
  else if (unknown.includes('viewers')) tryWith({ viewersAtOnce: 1 }, `Does only one person watch ${s.name} at a time?`, 'If yes');
  if (unknown.includes('ads')) tryWith({ adsOk: true }, `Would ads on ${s.name} be OK?`, 'If yes');
  if (unknown.includes('storage')) out.push({ itemId: s.id, question: `How much of your ${s.name} storage do you use? (Settings shows it)`, ifYes: 'We can check if a smaller plan fits', saving12IfYes: 0 });
  return out;
}

// ---------- 4. exposure ----------
function exposure(subs: Sub[], today: string): Exposure {
  let freeNow = 0, fixed = 0;
  const locked: Exposure['locked'] = [];
  for (const s of subs) {
    if (s.fixedBill) fixed += s.monthly;
    else if (s.lockedUntil && s.lockedUntil > today) locked.push({ name: s.name, monthly: s.monthly, until: s.lockedUntil });
    else freeNow += s.monthly;
  }
  const total = r2(freeNow + fixed + locked.reduce((a, l) => a + l.monthly, 0));
  return { freeNow: r2(freeNow), locked, fixed: r2(fixed), total };
}

// ---------- 5. choose the best compatible set per loss level ----------
/** Exhaustive search over options; two options conflict when they change the same account. */
export function choose(options: Option[], maxLoss: Loss): { saving12: number; chosen: string[] } {
  const pool = options.filter((o) => o.loss <= maxLoss && o.saving12 > 0).sort((a, b) => a.id.localeCompare(b.id));
  let best = { saving12: 0, chosen: [] as string[] };
  const walk = (i: number, used: Set<string>, picked: Option[], sum: number) => {
    if (i === pool.length) {
      const s = r2(sum);
      if (s > best.saving12 + 0.004 || (Math.abs(s - best.saving12) <= 0.004 && picked.length < best.chosen.length)) best = { saving12: s, chosen: picked.map((p) => p.id) };
      return;
    }
    walk(i + 1, used, picked, sum); // skip
    const o = pool[i]!;
    if (o.affects.every((a) => !used.has(a))) {
      const next = new Set(used); o.affects.forEach((a) => next.add(a));
      walk(i + 1, next, [...picked, o], sum + o.saving12);
    }
  };
  walk(0, new Set(), [], 0);
  return best;
}

export function runOpportunities(subs: Sub[], m: Market, today: string): Result {
  const options: Option[] = [];
  for (const s of subs) {
    if (s.fixedBill) continue;
    for (const o of [planFitOption(s, m, today), householdOption(s, m, today), payPerVisitOption(s, m, today), cancelOption(s, m, today)]) if (o) options.push(o);
  }
  const rot = rotationOption(subs, m, today, new Map());
  if (rot) options.push(rot);
  // Rotation on top of a cheaper fitting plan is its own option, so the two are never added twice.
  const fitted = new Map<string, number>();
  for (const o of options) if (o.kind === 'planFit') { const s = subs.find((x) => x.id === o.affects[0])!; const p = fittingPlans(s, m).fits.filter((f) => f.monthly < s.monthly).sort((a, b) => a.monthly - b.monthly)[0]; if (p) fitted.set(s.id, p.monthly); }
  if (fitted.size) {
    const rf = rotationOption(subs, m, today, fitted);
    if (rf && rf.affects.some((a) => fitted.has(a))) { rf.title += ', on the cheaper plans'; options.push(rf); }
  }
  const levels = ([0, 1, 2] as Loss[]).map((maxLoss) => ({ maxLoss, ...choose(options, maxLoss) }));
  const touched = new Set(options.flatMap((o) => o.affects));
  const conds = subs.flatMap((s) => conditionals(s, m, today));
  const asked = new Set(conds.map((c) => c.itemId));
  const noOpportunity = subs.filter((s) => !touched.has(s.id)).map((s) => ({
    itemId: s.id,
    why: s.fixedBill ? 'Fixed bill, nothing to switch.'
      : !s.service && !s.membership ? 'No verified plans for this service in this market, so no alternative is claimed.'
      : asked.has(s.id) ? 'Depends on one answer, see the question below.'
      : s.membership && !s.membership.singleVisit ? 'Cost per visit is known, but no single-visit price, so no € is claimed.'
      : s.importance === 'wouldMiss' && !s.rotatable ? 'Already on the cheapest plan that covers what you told us.'
      : 'No cheaper option meets your stated needs.',
  }));
  return { options, levels, conditionals: conds, noOpportunity, exposure: exposure(subs, today) };
}

/** Plain-text report for the proof of concept. */
export function report(res: Result, subs: Sub[], m: Market): string {
  const cur = m.currency, L: string[] = [];
  const name = (id: string) => subs.find((s) => s.id === id)?.name ?? id;
  const e = res.exposure;
  L.push(`Recurring: ${fmt(e.total, cur)} a month. Free to change now ${fmt(e.freeNow, cur)}. ${e.locked.map((l) => `${l.name} ${fmt(l.monthly, cur)} locked until ${l.until}`).join('. ')}${e.locked.length ? '. ' : ''}Fixed bills ${fmt(e.fixed, cur)}.`);
  const lvl = ['Without giving anything up', 'If you also wait for some shows', 'If you also drop what you said you can live without'];
  let prev = -1;
  for (const l of res.levels) {
    if (l.saving12 === prev) continue; prev = l.saving12;
    L.push(`${lvl[l.maxLoss]}: ${fmt(l.saving12, cur)} in the next 12 months${l.chosen.length ? '' : ' (no verified saving)'}`);
    for (const id of l.chosen) { const o = res.options.find((x) => x.id === id)!; L.push(`  • ${o.title}: ${fmt(o.saving12, cur)} (${o.confidence})${o.deadline ? `, act before ${o.deadline}` : ''}`); }
  }
  const all = new Set(res.levels.flatMap((l) => l.chosen));
  for (const o of res.options.filter((x) => all.has(x.id))) {
    L.push(`\n${o.title}`); o.evidence.forEach((ev) => L.push(`  - ${ev}`));
    o.schedule?.forEach((s) => L.push(`  · ${s.service}: paid ${s.on} → ${s.off}. ${s.steps.join(', ')}.`));
    L.push(`  source: ${o.sources.join('; ')}`);
  }
  if (res.conditionals.length) { L.push('\nOne answer would settle:'); res.conditionals.forEach((c) => L.push(`  ? ${c.question} ${c.saving12IfYes ? `${c.ifYes}, ${fmt(c.saving12IfYes, cur)} more in 12 months (not counted)` : c.ifYes}`)); }
  if (res.noOpportunity.length) { L.push('\nNo opportunity:'); res.noOpportunity.forEach((n) => L.push(`  ${name(n.itemId)}: ${n.why}`)); }
  return L.join('\n');
}
