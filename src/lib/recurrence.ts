import type { Recurrence } from '@shared/schema';
import { WEEKDAYS_SHORT } from './dates';

// The occurrence logic lives in shared/ so the notification sender uses the exact same rules.
export { nextOccurrence, occurrencesInRange } from '@shared/calendar';

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
