import type { MarkingPeriod, PastTerm, SchoolClass, Settings, Task } from '@shared/schema';

export interface CategoryResult {
  id: string;
  name: string;
  weight: number;
  earned: number;
  possible: number;
  percent: number | null;
  count: number;
}

export interface AverageResult {
  /** Percentage, or null when there isn't enough grading information. */
  average: number | null;
  source: 'computed' | 'manual' | 'none';
  graded: number;
  total: number;
  categories: CategoryResult[];
  /** Graded work that isn't counted because it has no category in a weighted class. */
  uncategorized: number;
}

export const isGraded = (t: Task) =>
  !t.excused && t.pointsEarned !== undefined && t.pointsPossible !== undefined && t.pointsPossible > 0;

export const taskPercent = (t: Task): number | null =>
  isGraded(t) ? (t.pointsEarned! / t.pointsPossible!) * 100 : null;

export function inPeriod(t: Task, p: MarkingPeriod | undefined): boolean {
  if (!p) return true;
  return !!t.dueDate && t.dueDate >= p.start && t.dueDate <= p.end;
}

export function periodFor(date: string, periods: MarkingPeriod[]): MarkingPeriod | undefined {
  return periods.find((p) => date >= p.start && date <= p.end);
}

/** Average for one class from its assignments, optionally limited to a marking period. */
export function computeAverage(cls: SchoolClass, tasks: Task[], period?: MarkingPeriod): AverageResult {
  const work = tasks.filter((t) => t.classId === cls.id && !t.archived && inPeriod(t, period));
  const graded = work.filter(isGraded);
  const categories: CategoryResult[] = [];
  let uncategorized = 0;
  let average: number | null = null;

  if (cls.categories.length === 0) {
    const earned = graded.reduce((s, t) => s + t.pointsEarned!, 0);
    const possible = graded.reduce((s, t) => s + t.pointsPossible!, 0);
    average = possible > 0 ? (earned / possible) * 100 : null;
  } else {
    let weighted = 0;
    let weightUsed = 0;
    for (const c of cls.categories) {
      const items = graded.filter((t) => t.gradeCategoryId === c.id);
      const earned = items.reduce((s, t) => s + t.pointsEarned!, 0);
      const possible = items.reduce((s, t) => s + t.pointsPossible!, 0);
      const percent = possible > 0 ? (earned / possible) * 100 : null;
      categories.push({ id: c.id, name: c.name, weight: c.weight, earned, possible, percent, count: items.length });
      if (percent !== null && c.weight > 0) {
        weighted += percent * c.weight;
        weightUsed += c.weight;
      }
    }
    const known = new Set(cls.categories.map((c) => c.id));
    uncategorized = graded.filter((t) => !t.gradeCategoryId || !known.has(t.gradeCategoryId)).length;
    // Categories with no grades yet are left out and the remaining weights are re-normalised —
    // this is how most school gradebooks report a running average.
    average = weightUsed > 0 ? weighted / weightUsed : null;
  }

  if (average === null && period && cls.manualGrades?.[period.id] !== undefined) {
    return { average: cls.manualGrades[period.id], source: 'manual', graded: 0, total: work.length, categories, uncategorized };
  }
  return {
    average,
    source: average === null ? 'none' : 'computed',
    graded: graded.length,
    total: work.length,
    categories,
    uncategorized,
  };
}

/**
 * The class's overall grade. With marking periods configured it is the mean of the
 * periods that have a grade (computed or entered manually); otherwise all work counts.
 */
export function overallAverage(cls: SchoolClass, tasks: Task[], periods: MarkingPeriod[]): AverageResult {
  if (periods.length === 0) return computeAverage(cls, tasks);
  const results = periods.map((p) => computeAverage(cls, tasks, p)).filter((r) => r.average !== null);
  const all = computeAverage(cls, tasks);
  if (results.length === 0) {
    // Work outside any period still counts if that's all we have.
    return all;
  }
  const avg = results.reduce((s, r) => s + r.average!, 0) / results.length;
  return { ...all, average: avg, source: results.every((r) => r.source === 'manual') ? 'manual' : 'computed' };
}

const LETTERS: [number, string, number][] = [
  [97, 'A+', 4.0],
  [93, 'A', 4.0],
  [90, 'A-', 3.7],
  [87, 'B+', 3.3],
  [83, 'B', 3.0],
  [80, 'B-', 2.7],
  [77, 'C+', 2.3],
  [73, 'C', 2.0],
  [70, 'C-', 1.7],
  [67, 'D+', 1.3],
  [63, 'D', 1.0],
  [60, 'D-', 0.7],
  [-Infinity, 'F', 0],
];

export function letterGrade(pct: number | null): string {
  if (pct === null) return '—';
  return LETTERS.find(([min]) => pct >= min)![1];
}

export function gradePoints(pct: number, level: SchoolClass['level'], scale: Settings['gpaScale']): number {
  const base = LETTERS.find(([min]) => pct >= min)![2];
  if (scale === 'unweighted' || base === 0) return base;
  return base + (level === 'ap' ? 1 : level === 'honors' ? 0.5 : 0);
}

export interface GpaResult {
  gpa: number | null;
  credits: number;
  classesCounted: number;
}

export function currentGpa(
  classes: SchoolClass[],
  tasks: Task[],
  periods: MarkingPeriod[],
  scale: Settings['gpaScale'],
): GpaResult {
  let points = 0;
  let credits = 0;
  let counted = 0;
  for (const c of classes) {
    if (c.archived || c.credits <= 0) continue;
    const { average } = overallAverage(c, tasks, periods);
    if (average === null) continue;
    points += gradePoints(average, c.level, scale) * c.credits;
    credits += c.credits;
    counted++;
  }
  return { gpa: credits > 0 ? points / credits : null, credits, classesCounted: counted };
}

/** Credit-weighted GPA across past terms plus the current term. */
export function cumulativeGpa(past: PastTerm[], current: GpaResult): number | null {
  let points = past.reduce((s, t) => s + t.gpa * t.credits, 0);
  let credits = past.reduce((s, t) => s + t.credits, 0);
  if (current.gpa !== null) {
    points += current.gpa * current.credits;
    credits += current.credits;
  }
  return credits > 0 ? points / credits : null;
}

export interface HypotheticalGrade {
  id: string;
  /** An existing assignment id to override, or undefined for a brand-new assignment. */
  taskId?: string;
  categoryId?: string;
  earned: number;
  possible: number;
}

/** Apply what-if scores and return the class's tasks as they would look. */
export function applyHypotheticals(cls: SchoolClass, tasks: Task[], hypos: HypotheticalGrade[]): Task[] {
  const overrides = new Map(hypos.filter((h) => h.taskId).map((h) => [h.taskId!, h]));
  const result = tasks.map((t) => {
    const h = overrides.get(t.id);
    return h ? { ...t, pointsEarned: h.earned, pointsPossible: h.possible, excused: false } : t;
  });
  for (const h of hypos) {
    if (h.taskId) continue;
    result.push({
      id: `hypo_${h.id}`,
      title: 'Hypothetical',
      status: 'done',
      priority: 'medium',
      tags: [],
      archived: false,
      createdAt: 0,
      updatedAt: 0,
      classId: cls.id,
      gradeCategoryId: h.categoryId,
      pointsEarned: h.earned,
      pointsPossible: h.possible,
    });
  }
  return result;
}

/**
 * How many percentage points of the class average are at stake on an ungraded
 * assignment: (average if it scores 100%) − (average if it scores 0%).
 * Returns null when there's no point value to reason about.
 */
export function gradeImpact(task: Task, cls: SchoolClass | undefined, tasks: Task[], period?: MarkingPeriod): number | null {
  if (!cls || !task.pointsPossible || task.pointsPossible <= 0 || isGraded(task) || task.excused) return null;
  const relevant = tasks.filter((t) => t.classId === cls.id);
  const hi = computeAverage(cls, applyHypotheticals(cls, relevant, [{ id: 'hi', taskId: task.id, categoryId: task.gradeCategoryId, earned: task.pointsPossible, possible: task.pointsPossible }]), period).average;
  const lo = computeAverage(cls, applyHypotheticals(cls, relevant, [{ id: 'lo', taskId: task.id, categoryId: task.gradeCategoryId, earned: 0, possible: task.pointsPossible }]), period).average;
  if (hi === null || lo === null) return null;
  return Math.max(0, hi - lo);
}

/**
 * The score needed on a new assignment (worth `possible` points in `categoryId`)
 * to bring the class average to `target`. Returns null if impossible even with
 * 150% (extra credit) or if there's no way to compute an average.
 */
export function scoreNeeded(
  cls: SchoolClass,
  tasks: Task[],
  target: number,
  possible: number,
  categoryId: string | undefined,
  period?: MarkingPeriod,
): { needed: number | null; alreadyThere: boolean } {
  const avgWith = (earned: number) =>
    computeAverage(cls, applyHypotheticals(cls, tasks, [{ id: 'need', categoryId, earned, possible }]), period).average;
  if ((avgWith(0) ?? -1) >= target) return { needed: 0, alreadyThere: true };
  const max = possible * 1.5;
  if ((avgWith(max) ?? -1) < target) return { needed: null, alreadyThere: false };
  let lo = 0;
  let hi = max;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if ((avgWith(mid) ?? -1) >= target) hi = mid;
    else lo = mid;
  }
  return { needed: hi, alreadyThere: false };
}

export const fmtPct = (n: number | null, digits = 1) => (n === null ? '—' : `${n.toFixed(digits)}%`);
export const fmtGpa = (n: number | null) => (n === null ? '—' : n.toFixed(2));
