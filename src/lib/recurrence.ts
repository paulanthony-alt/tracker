import type { Recurrence } from '@shared/schema';
import { addDaysISO, addMonthsISO, daysBetween, weekStartISO, weekdayOf, WEEKDAYS_SHORT } from './dates';

/** The next date strictly after `from` matching the rule, or undefined past `until`. */
export function nextOccurrence(from: string, rule: Recurrence, anchor: string = from): string | undefined {
  let next: string;
  if (rule.freq === 'daily') {
    next = addDaysISO(from, rule.interval);
  } else if (rule.freq === 'monthly') {
    next = addMonthsISO(from, rule.interval);
  } else {
    const days = rule.daysOfWeek?.length ? [...rule.daysOfWeek].sort() : [weekdayOf(anchor)];
    next = '';
    // Look ahead at most `interval` weeks + 1 to find the next valid weekday.
    for (let i = 1; i <= 7 * (rule.interval + 1); i++) {
      const candidate = addDaysISO(from, i);
      if (!days.includes(weekdayOf(candidate))) continue;
      const weeksFromAnchor = Math.floor(daysBetween(weekStartISO(anchor, 0), weekStartISO(candidate, 0)) / 7);
      if (weeksFromAnchor % rule.interval === 0) {
        next = candidate;
        break;
      }
    }
    if (!next) return undefined;
  }
  if (rule.until && next > rule.until) return undefined;
  return next;
}

/** Every occurrence of a recurring item that falls within [start, end]. */
export function occurrencesInRange(first: string, rule: Recurrence | undefined, start: string, end: string): string[] {
  if (!rule) return first >= start && first <= end ? [first] : [];
  const out: string[] = [];
  let cur: string | undefined = first;
  let guard = 0;
  while (cur && cur <= end && guard++ < 2000) {
    if (cur >= start) out.push(cur);
    cur = nextOccurrence(cur, rule, first);
  }
  return out;
}

export function describeRecurrence(rule: Recurrence | undefined): string {
  if (!rule) return 'Does not repeat';
  const n = rule.interval;
  let base: string;
  if (rule.freq === 'daily') base = n === 1 ? 'Every day' : `Every ${n} days`;
  else if (rule.freq === 'monthly') base = n === 1 ? 'Every month' : `Every ${n} months`;
  else {
    const days = rule.daysOfWeek?.length ? ` on ${[...rule.daysOfWeek].sort().map((d) => WEEKDAYS_SHORT[d]).join(', ')}` : '';
    base = (n === 1 ? 'Every week' : `Every ${n} weeks`) + days;
  }
  return rule.until ? `${base} until ${rule.until}` : base;
}
