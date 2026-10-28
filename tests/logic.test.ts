import { describe, expect, it } from 'vitest';
import type { Habit, SchoolClass, Task } from '../shared/schema';
import { taskSchema, validateBackup } from '../shared/schema';
import { computeAverage, currentGpa, gradeImpact, letterGrade, scoreNeeded, overallAverage, cumulativeGpa } from '../src/lib/grades';
import { scoreTask, rankTasks } from '../src/lib/priority';
import { currentStreak, bestStreak, completionRate } from '../src/lib/habits';
import { nextOccurrence, occurrencesInRange } from '../src/lib/recurrence';
import { parseQuickAdd } from '../src/lib/quickparse';
import { goalProgress } from '../src/lib/progress';
import { buildSampleData } from '../src/lib/sample';
import { collectionSchemas } from '../shared/schema';

const T = (p: Partial<Task>): Task => ({
  id: Math.random().toString(36).slice(2),
  title: 't',
  status: 'todo',
  priority: 'medium',
  tags: [],
  archived: false,
  createdAt: 0,
  updatedAt: 0,
  ...p,
});

const weighted: SchoolClass = {
  id: 'c1',
  name: 'Chem',
  color: '#fff',
  level: 'honors',
  credits: 1,
  archived: false,
  createdAt: 0,
  updatedAt: 0,
  categories: [
    { id: 'tests', name: 'Tests', weight: 60 },
    { id: 'hw', name: 'Homework', weight: 40 },
  ],
};
const points: SchoolClass = { ...weighted, id: 'c2', categories: [], level: 'regular' };

describe('grades', () => {
  it('computes total-points averages', () => {
    const tasks = [
      T({ classId: 'c2', pointsEarned: 45, pointsPossible: 50 }),
      T({ classId: 'c2', pointsEarned: 40, pointsPossible: 50 }),
      T({ classId: 'c2', pointsPossible: 100 }), // ungraded — ignored
      T({ classId: 'c2', pointsEarned: 0, pointsPossible: 100, excused: true }),
    ];
    expect(computeAverage(points, tasks).average).toBeCloseTo(85);
  });

  it('computes weighted averages and renormalises missing categories', () => {
    const tasks = [T({ classId: 'c1', gradeCategoryId: 'tests', pointsEarned: 80, pointsPossible: 100 })];
    expect(computeAverage(weighted, tasks).average).toBeCloseTo(80);
    tasks.push(T({ classId: 'c1', gradeCategoryId: 'hw', pointsEarned: 10, pointsPossible: 10 }));
    expect(computeAverage(weighted, tasks).average).toBeCloseTo(0.6 * 80 + 0.4 * 100);
  });

  it('returns null without grading information and falls back to manual grades', () => {
    expect(computeAverage(points, []).average).toBeNull();
    const withManual = { ...points, manualGrades: { mp1: 91 } };
    const period = { id: 'mp1', name: 'Q1', start: '2026-09-01', end: '2026-11-01' };
    const r = computeAverage(withManual, [], period);
    expect(r.average).toBe(91);
    expect(r.source).toBe('manual');
  });

  it('letters and GPA', () => {
    expect(letterGrade(93.2)).toBe('A');
    expect(letterGrade(89.99)).toBe('B+');
    expect(letterGrade(null)).toBe('—');
    const tasks = [
      T({ classId: 'c1', gradeCategoryId: 'tests', pointsEarned: 95, pointsPossible: 100 }),
      T({ classId: 'c2', pointsEarned: 85, pointsPossible: 100 }),
    ];
    expect(currentGpa([weighted, points], tasks, [], 'unweighted').gpa).toBeCloseTo((4 + 3) / 2);
    expect(currentGpa([weighted, points], tasks, [], 'weighted').gpa).toBeCloseTo((4.5 + 3) / 2);
    expect(cumulativeGpa([{ id: 'p', name: '9', gpa: 3, credits: 2 }], { gpa: 4, credits: 2, classesCounted: 2 })).toBeCloseTo(3.5);
  });

  it('measures grade impact of an ungraded assignment', () => {
    const graded = T({ classId: 'c2', pointsEarned: 90, pointsPossible: 100 });
    const big = T({ classId: 'c2', pointsPossible: 100 });
    const small = T({ classId: 'c2', pointsPossible: 10 });
    const all = [graded, big, small];
    const bigImpact = gradeImpact(big, points, all)!;
    const smallImpact = gradeImpact(small, points, all)!;
    expect(bigImpact).toBeCloseTo(50); // 95% vs 45%
    expect(smallImpact).toBeLessThan(bigImpact);
    expect(gradeImpact(graded, points, all)).toBeNull();
  });

  it('finds the score needed to reach a target', () => {
    const tasks = [T({ classId: 'c2', pointsEarned: 80, pointsPossible: 100 })];
    const { needed } = scoreNeeded(points, tasks, 85, 100, undefined);
    expect(needed).toBeCloseTo(90, 1);
    expect(scoreNeeded(points, tasks, 200, 100, undefined).needed).toBeNull();
  });

  it('averages marking periods for the overall grade', () => {
    const periods = [
      { id: 'a', name: 'Q1', start: '2026-09-01', end: '2026-10-31' },
      { id: 'b', name: 'Q2', start: '2026-11-01', end: '2026-12-31' },
    ];
    const tasks = [
      T({ classId: 'c2', dueDate: '2026-09-10', pointsEarned: 100, pointsPossible: 100 }),
      T({ classId: 'c2', dueDate: '2026-11-10', pointsEarned: 16, pointsPossible: 20 }),
    ];
    expect(overallAverage(points, tasks, periods).average).toBeCloseTo(90);
  });
});

describe('priority', () => {
  const ctx = { today: '2026-10-28', classes: [points], tasks: [] as Task[], periods: [] };
  it('ranks overdue and urgent work first', () => {
    const tasks = [
      T({ title: 'later', dueDate: '2026-11-20' }),
      T({ title: 'overdue', dueDate: '2026-10-25' }),
      T({ title: 'today', dueDate: '2026-10-28' }),
      T({ title: 'urgent today', dueDate: '2026-10-28', priority: 'urgent' }),
      T({ title: 'done', dueDate: '2026-10-20', status: 'done' }),
    ];
    const ranked = rankTasks(tasks, { ...ctx, tasks });
    // Same importance: overdue beats due-today. Urgent importance can outrank a mildly overdue task.
    expect(ranked.map((r) => r.task.title)).toEqual(['urgent today', 'overdue', 'today', 'later']);
  });
  it('explains its reasons and rewards grade impact', () => {
    const graded = T({ classId: 'c2', pointsEarned: 90, pointsPossible: 100 });
    const test = T({ classId: 'c2', pointsPossible: 200, dueDate: '2026-11-03' });
    const hw = T({ classId: 'c2', pointsPossible: 5, dueDate: '2026-11-03' });
    const tasks = [graded, test, hw];
    const a = scoreTask(test, { ...ctx, tasks });
    const b = scoreTask(hw, { ...ctx, tasks });
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.reasons.join(' ')).toMatch(/pts of grade/);
  });
});

describe('habits', () => {
  const h = (p: Partial<Habit>): Habit => ({
    id: 'h',
    name: 'h',
    color: '#fff',
    frequency: 'daily',
    targetPerWeek: 1,
    completions: [],
    archived: false,
    order: 0,
    createdAt: new Date(2026, 9, 1).getTime(),
    updatedAt: 0,
    ...p,
  });
  it('counts daily streaks without breaking on an unfinished today', () => {
    const habit = h({ completions: ['2026-10-25', '2026-10-26', '2026-10-27'] });
    expect(currentStreak(habit, '2026-10-28')).toBe(3);
    expect(currentStreak({ ...habit, completions: [...habit.completions, '2026-10-28'] }, '2026-10-28')).toBe(4);
    expect(currentStreak({ ...habit, completions: ['2026-10-25', '2026-10-26'] }, '2026-10-28')).toBe(0);
  });
  it('skips unscheduled days', () => {
    // Weekdays only; 2026-10-24/25 are Sat/Sun.
    const habit = h({ daysOfWeek: [1, 2, 3, 4, 5], completions: ['2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27'] });
    expect(currentStreak(habit, '2026-10-28')).toBe(4);
    expect(bestStreak(habit, '2026-10-28')).toBe(4);
  });
  it('weekly targets and completion rate', () => {
    const habit = h({ frequency: 'weekly', targetPerWeek: 2, completions: ['2026-10-13', '2026-10-15', '2026-10-20', '2026-10-21', '2026-10-27'] });
    expect(currentStreak(habit, '2026-10-28')).toBe(2);
    const daily = h({ completions: ['2026-10-26', '2026-10-27'] });
    expect(completionRate(daily, '2026-10-25', '2026-10-28')).toBeCloseTo(0.5);
  });
});

describe('recurrence', () => {
  it('daily / weekly / monthly', () => {
    expect(nextOccurrence('2026-10-28', { freq: 'daily', interval: 2 })).toBe('2026-10-30');
    expect(nextOccurrence('2026-10-28', { freq: 'weekly', interval: 1 })).toBe('2026-11-04');
    expect(nextOccurrence('2026-10-28', { freq: 'weekly', interval: 1, daysOfWeek: [1, 3, 5] })).toBe('2026-10-30');
    expect(nextOccurrence('2026-01-31', { freq: 'monthly', interval: 1 })).toBe('2026-02-28');
    expect(nextOccurrence('2026-10-28', { freq: 'daily', interval: 1, until: '2026-10-28' })).toBeUndefined();
  });
  it('expands occurrences in a range', () => {
    const days = occurrencesInRange('2026-10-26', { freq: 'weekly', interval: 1, daysOfWeek: [1, 3, 5] }, '2026-10-26', '2026-11-01');
    expect(days).toEqual(['2026-10-26', '2026-10-28', '2026-10-30']);
    expect(occurrencesInRange('2026-10-28', undefined, '2026-10-01', '2026-10-31')).toEqual(['2026-10-28']);
  });
});

describe('quick add parser', () => {
  const today = '2026-10-28'; // Wednesday
  it('parses dates, times, priority, tags, class and project', () => {
    const r = parseQuickAdd('Chem lab report fri 9am !high #lab @chem', today, { classes: [{ id: 'c1', name: 'Chemistry' }] });
    expect(r.title).toBe('Chem lab report');
    expect(r.dueDate).toBe('2026-10-30');
    expect(r.dueTime).toBe('09:00');
    expect(r.priority).toBe('high');
    expect(r.tags).toEqual(['lab']);
    expect(r.classId).toBe('c1');
  });
  it('handles relative dates and leaves unknown tokens in the title', () => {
    expect(parseQuickAdd('call mom tomorrow', today).dueDate).toBe('2026-10-29');
    expect(parseQuickAdd('pay bill in 3 days', today).dueDate).toBe('2026-10-31');
    expect(parseQuickAdd('plan next week', today).dueDate).toBe('2026-11-02');
    expect(parseQuickAdd('dentist 11/14', today).dueDate).toBe('2026-11-14');
    expect(parseQuickAdd('Email @nobody', today).title).toBe('Email @nobody');
    expect(parseQuickAdd('Study for SAT', today).dueDate).toBeUndefined();
    expect(parseQuickAdd('Study for SAT', today).title).toBe('Study for SAT');
  });
});

describe('goals', () => {
  it('numeric progress', () => {
    const g = { id: 'g', title: 'Save', horizon: 'long' as const, progressMode: 'numeric' as const, current: 750, target: 3000, unit: '$', milestones: [], status: 'active' as const, createdAt: 0, updatedAt: 0 };
    expect(goalProgress(g, []).pct).toBeCloseTo(25);
    expect(goalProgress(g, []).label).toBe('$750 / $3,000');
  });
});

describe('schema & sample data', () => {
  it('sample data validates against the schema', () => {
    const { data } = buildSampleData('2026-10-28');
    for (const [name, list] of Object.entries(data)) {
      const schema = collectionSchemas[name as keyof typeof collectionSchemas];
      for (const rec of list as unknown[]) {
        const r = schema.safeParse(rec);
        if (!r.success) throw new Error(`${name}: ${JSON.stringify(r.error.issues)} ${JSON.stringify(rec)}`);
        expect((rec as { sample?: boolean }).sample).toBe(true);
      }
    }
  });
  it('rejects invalid tasks', () => {
    expect(taskSchema.safeParse(T({ title: '' })).success).toBe(false);
    expect(taskSchema.safeParse(T({ dueDate: '10/28/2026' })).success).toBe(false);
  });
  it('validates backups', () => {
    expect(validateBackup({}).ok).toBe(false);
    const ok = validateBackup({ format: 'life-os-backup', version: 1, data: { tasks: [T({}), { bad: true }] } });
    expect(ok.ok && ok.skipped).toBe(1);
  });
});

describe('day planner', () => {
  it('fills free gaps between events with the highest-priority tasks, never overlapping', async () => {
    const { planDay } = await import('../src/lib/insights');
    const { defaultSettings } = await import('../src/lib/defaults');
    const state = {
      tasks: [
        T({ id: 'a', title: 'Urgent essay', priority: 'urgent', dueDate: '2026-10-28', estimateMinutes: 60 }),
        T({ id: 'b', title: 'Low chore', priority: 'low', estimateMinutes: 30 }),
        T({ id: 'c', title: 'Done thing', status: 'done', estimateMinutes: 30 }),
      ],
      events: [{ id: 'e', title: 'Practice', date: '2026-10-28', startTime: '16:00', endTime: '17:30', createdAt: 0, updatedAt: 0 }],
      classes: [],
      settings: defaultSettings(),
    } as unknown as Parameters<typeof planDay>[0];
    const blocks = planDay(state, '2026-10-28', { start: '15:30', end: '19:00', breakMinutes: 0 });
    // Returned in time order. The urgent 60-min task can't fit 15:30–16:00, so it goes after practice;
    // the short low-priority task fills the earlier gap. The done task is skipped.
    expect(blocks.map((b) => b.taskId)).toEqual(['b', 'a']);
    expect(blocks[0]).toMatchObject({ start: '15:30', end: '16:00' });
    expect(blocks[1]).toMatchObject({ start: '17:30', end: '18:30' });
  });
});
