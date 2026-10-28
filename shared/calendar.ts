/**
 * Dependency-free calendar math on `YYYY-MM-DD` strings, plus time-zone
 * conversion. Shared by the browser and the notification sender
 * (scripts/reminders), so both agree on exactly when something is due.
 */
import type { Recurrence } from './schema.ts';

const DAY_MS = 86_400_000;
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (s: string, n: number) => fmt(parse(s) + n * DAY_MS);
export const weekday = (s: string) => new Date(parse(s)).getUTCDay();
export const daysBetween = (a: string, b: string) => Math.round((parse(b) - parse(a)) / DAY_MS);
export const weekStart = (s: string, weekStartsOn: 0 | 1 = 1) => addDays(s, -((weekday(s) - weekStartsOn + 7) % 7));

/** Add months, clamping to the last day of shorter months (Jan 31 + 1 month = Feb 28). */
export function addMonths(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ty = Math.floor(total / 12);
  const tm = total % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return fmt(Date.UTC(ty, tm, Math.min(d, lastDay)));
}

/** The next date strictly after `from` matching the rule, or undefined past `until`. */
export function nextOccurrence(from: string, rule: Recurrence, anchor: string = from): string | undefined {
  let next: string;
  if (rule.freq === 'daily') {
    next = addDays(from, rule.interval);
  } else if (rule.freq === 'monthly') {
    next = addMonths(from, rule.interval);
  } else {
    const days = rule.daysOfWeek?.length ? [...rule.daysOfWeek].sort() : [weekday(anchor)];
    next = '';
    // Look ahead at most `interval` weeks + 1 to find the next valid weekday.
    for (let i = 1; i <= 7 * (rule.interval + 1); i++) {
      const candidate = addDays(from, i);
      if (!days.includes(weekday(candidate))) continue;
      const weeksFromAnchor = Math.floor(daysBetween(weekStart(anchor, 0), weekStart(candidate, 0)) / 7);
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
  while (cur && cur <= end && guard++ < 5000) {
    if (cur >= start) out.push(cur);
    cur = nextOccurrence(cur, rule, first);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Time zones
// ---------------------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>();
function partsIn(ms: number, timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    formatters.set(timeZone, f);
  }
  const p: Record<string, number> = {};
  for (const { type, value } of f.formatToParts(new Date(ms))) if (type !== 'literal') p[type] = Number(value);
  return p;
}

/** Offset of `timeZone` from UTC at instant `ms`, in milliseconds (local − UTC). */
function offsetAt(ms: number, timeZone: string): number {
  const p = partsIn(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The UTC instant of a local wall-clock date + time in `timeZone`. */
export function zonedTime(date: string, time: string, timeZone: string): number {
  const [h, m] = time.split(':').map(Number);
  const wall = parse(date) + (h * 60 + m) * 60_000;
  let utc = wall - offsetAt(wall, timeZone);
  // Second pass settles times right next to a daylight-saving switch.
  const again = wall - offsetAt(utc, timeZone);
  if (again !== utc) utc = again;
  return utc;
}

/** The local calendar date (`YYYY-MM-DD`) of instant `ms` in `timeZone`. */
export function localDate(ms: number, timeZone: string): string {
  const p = partsIn(ms, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function isValidTimeZone(tz: string | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "7:30 AM" from "07:30". */
export function formatClock(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h >= 12 ? 'PM' : 'AM'}`;
}
