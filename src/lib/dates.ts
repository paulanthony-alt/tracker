import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  isValid,
  parse,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

/** All calendar dates in the app are local `YYYY-MM-DD` strings. */
export const toISO = (d: Date) => format(d, 'yyyy-MM-dd');
export const fromISO = (s: string) => parse(s, 'yyyy-MM-dd', new Date());
export const todayISO = () => toISO(new Date());
export const isISODate = (s: string | undefined): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && isValid(fromISO(s));

export const addDaysISO = (s: string, n: number) => toISO(addDays(fromISO(s), n));
export const addMonthsISO = (s: string, n: number) => toISO(addMonths(fromISO(s), n));
/** Whole days from `a` to `b` (positive when `b` is later). */
export const daysBetween = (a: string, b: string) => differenceInCalendarDays(fromISO(b), fromISO(a));
export const weekStartISO = (s: string, weekStartsOn: 0 | 1 = 1) =>
  toISO(startOfWeek(fromISO(s), { weekStartsOn }));
export const monthStartISO = (s: string) => toISO(startOfMonth(fromISO(s)));
export const weekdayOf = (s: string) => fromISO(s).getDay();

export function rangeISO(start: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDaysISO(start, i));
}

/** "Today", "Tomorrow", "Yesterday", "Thu", "Nov 4", "Nov 4, 2027". */
export function formatRelativeDay(s: string, today = todayISO()): string {
  const diff = daysBetween(today, s);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = fromISO(s);
  if (diff > 1 && diff < 7) return format(d, 'EEE');
  if (d.getFullYear() === fromISO(today).getFullYear()) return format(d, 'MMM d');
  return format(d, 'MMM d, yyyy');
}

/** "in 3 days", "2 days overdue", "due today". */
export function formatDueDistance(s: string, today = todayISO()): string {
  const diff = daysBetween(today, s);
  if (diff === 0) return 'due today';
  if (diff === 1) return 'due tomorrow';
  if (diff > 1) return `in ${diff} days`;
  if (diff === -1) return '1 day overdue';
  return `${-diff} days overdue`;
}

export const formatLong = (s: string) => format(fromISO(s), 'EEEE, MMMM d');
export const formatShort = (s: string) => format(fromISO(s), 'MMM d');

/** "14:30" → "2:30 PM". */
export function formatTime(t: string | undefined): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hh} ${suffix}` : `${hh}:${String(m).padStart(2, '0')} ${suffix}`;
}

export const timeToMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const minutesToTime = (mins: number) => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
};

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_MIN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
