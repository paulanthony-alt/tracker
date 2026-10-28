import type { Habit } from '@shared/schema';
import { addDaysISO, daysBetween, rangeISO, toISO, weekStartISO, weekdayOf } from './dates';

export const habitStartDate = (h: Habit) => {
  const created = toISO(new Date(h.createdAt));
  const firstDone = [...h.completions].sort()[0];
  return firstDone && firstDone < created ? firstDone : created;
};

/** Is a daily habit scheduled for this date? Weekly habits are "available" every day. */
export function isScheduled(h: Habit, date: string): boolean {
  if (h.frequency === 'weekly') return true;
  return !h.daysOfWeek?.length || h.daysOfWeek.includes(weekdayOf(date));
}

export const isDoneOn = (h: Habit, date: string) => h.completions.includes(date);

export function weekCount(h: Habit, weekStart: string): number {
  const days = new Set(rangeISO(weekStart, 7));
  return h.completions.filter((d) => days.has(d)).length;
}

/**
 * Current streak. Daily: consecutive scheduled days completed (today doesn't
 * break it until the day is over). Weekly: consecutive weeks hitting the target.
 */
export function currentStreak(h: Habit, today: string, weekStartsOn: 0 | 1 = 1): number {
  const done = new Set(h.completions);
  const start = habitStartDate(h);
  if (h.frequency === 'weekly') {
    let week = weekStartISO(today, weekStartsOn);
    let streak = 0;
    if (weekCount(h, week) >= h.targetPerWeek) streak++;
    week = addDaysISO(week, -7);
    while (week >= weekStartISO(start, weekStartsOn) && weekCount(h, week) >= h.targetPerWeek) {
      streak++;
      week = addDaysISO(week, -7);
    }
    return streak;
  }
  let streak = 0;
  let day = today;
  if (isScheduled(h, day) && !done.has(day)) day = addDaysISO(day, -1);
  let guard = 0;
  while (day >= start && guard++ < 5000) {
    if (isScheduled(h, day)) {
      if (!done.has(day)) break;
      streak++;
    }
    day = addDaysISO(day, -1);
  }
  return streak;
}

export function bestStreak(h: Habit, today: string, weekStartsOn: 0 | 1 = 1): number {
  const start = habitStartDate(h);
  if (h.frequency === 'weekly') {
    let best = 0;
    let run = 0;
    for (let w = weekStartISO(start, weekStartsOn); w <= today; w = addDaysISO(w, 7)) {
      if (weekCount(h, w) >= h.targetPerWeek) best = Math.max(best, ++run);
      else if (w !== weekStartISO(today, weekStartsOn)) run = 0;
    }
    return best;
  }
  const done = new Set(h.completions);
  let best = 0;
  let run = 0;
  const span = Math.min(daysBetween(start, today), 3650);
  for (let i = 0; i <= span; i++) {
    const day = addDaysISO(start, i);
    if (!isScheduled(h, day)) continue;
    if (done.has(day)) best = Math.max(best, ++run);
    else if (day !== today) run = 0;
  }
  return best;
}

/** Completion rate (0–1) between two dates, counting only days since the habit started. */
export function completionRate(h: Habit, from: string, to: string, weekStartsOn: 0 | 1 = 1): number | null {
  const start = habitStartDate(h);
  const begin = from < start ? start : from;
  if (begin > to) return null;
  if (h.frequency === 'weekly') {
    let met = 0;
    let weeks = 0;
    for (let w = weekStartISO(begin, weekStartsOn); w <= to; w = addDaysISO(w, 7)) {
      weeks++;
      if (weekCount(h, w) >= h.targetPerWeek) met++;
    }
    return weeks ? met / weeks : null;
  }
  const done = new Set(h.completions);
  let due = 0;
  let hit = 0;
  for (let d = begin; d <= to; d = addDaysISO(d, 1)) {
    if (!isScheduled(h, d)) continue;
    due++;
    if (done.has(d)) hit++;
  }
  return due ? hit / due : null;
}

/** Per-day totals for a set of daily habits: how many were scheduled and done. */
export function dailyTotals(habits: Habit[], days: string[]) {
  return days.map((date) => {
    let due = 0;
    let done = 0;
    for (const h of habits) {
      if (h.archived || h.frequency !== 'daily' || date < habitStartDate(h) || !isScheduled(h, date)) continue;
      due++;
      if (isDoneOn(h, date)) done++;
    }
    return { date, due, done };
  });
}

export function toggleCompletion(h: Habit, date: string): string[] {
  return isDoneOn(h, date) ? h.completions.filter((d) => d !== date) : [...h.completions, date].sort();
}
