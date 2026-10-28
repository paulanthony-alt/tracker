import type { Priority } from '@shared/schema';
import { addDaysISO, daysBetween, isISODate, weekdayOf, weekStartISO } from './dates';

export interface ParsedQuickAdd {
  title: string;
  dueDate?: string;
  dueTime?: string;
  priority?: Priority;
  tags: string[];
  classId?: string;
  projectId?: string;
  /** Human-readable list of what was recognised, for the preview chips. */
  tokens: string[];
}

interface Named {
  id: string;
  name: string;
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_ABBR = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const PRIORITY_WORDS: Record<string, Priority> = {
  low: 'low',
  med: 'medium',
  medium: 'medium',
  high: 'high',
  urgent: 'urgent',
  '1': 'urgent',
  '2': 'high',
  '3': 'medium',
  '4': 'low',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function matchNamed(token: string, items: Named[]): Named | undefined {
  const t = norm(token);
  if (!t) return undefined;
  return items.find((i) => norm(i.name) === t) ?? items.find((i) => norm(i.name).startsWith(t));
}

/**
 * Natural-ish quick capture:
 *   "Chem lab report fri 9am !high #lab @chem"
 *   "List 20 cards on eBay tomorrow +cardsales"
 *
 * Dates: today, tonight, tomorrow/tmr, weekday names, "next fri", "next week",
 * "in 3 days", "in 2 weeks", 11/14, 2026-11-14. Times: 5pm, 5:30pm, 17:00.
 * !high / !urgent / !1–!4 = priority, #tag, @class, +project.
 */
export function parseQuickAdd(
  input: string,
  today: string,
  opts: { classes?: Named[]; projects?: Named[] } = {},
): ParsedQuickAdd {
  const out: ParsedQuickAdd = { title: '', tags: [], tokens: [] };
  let s = ` ${input} `;

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    s = s.replace(re, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpMatchArray;
      return fn(m) === false ? m[0] : ' ';
    });
  };

  take(/\s!(\w+)(?=\s)/gi, (m) => {
    const p = PRIORITY_WORDS[m[1].toLowerCase()];
    if (!p) return false;
    out.priority = p;
    out.tokens.push(`Priority: ${p}`);
  });
  take(/\s#([\w-]{1,40})(?=\s)/g, (m) => {
    out.tags.push(m[1].toLowerCase());
    out.tokens.push(`#${m[1].toLowerCase()}`);
  });
  take(/\s@([\w-]+)(?=\s)/g, (m) => {
    const c = matchNamed(m[1], opts.classes ?? []);
    if (!c) return false;
    out.classId = c.id;
    out.tokens.push(`Class: ${c.name}`);
  });
  take(/\s\+([\w-]+)(?=\s)/g, (m) => {
    const p = matchNamed(m[1], opts.projects ?? []);
    if (!p) return false;
    out.projectId = p.id;
    out.tokens.push(`Project: ${p.name}`);
  });

  // Times
  take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)(?=\s)/gi, (m) => {
    let h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    if (h < 1 || h > 12 || min > 59) return false;
    const pm = m[3].toLowerCase() === 'pm';
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    out.dueTime = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  });
  if (!out.dueTime) {
    take(/\s(?:at\s+)([01]?\d|2[0-3]):([0-5]\d)(?=\s)/g, (m) => {
      out.dueTime = `${m[1].padStart(2, '0')}:${m[2]}`;
    });
  }

  // Dates
  const setDate = (d: string, label: string) => {
    out.dueDate = d;
    out.tokens.push(label);
  };
  take(/\s(today|tonight|tod)(?=\s)/gi, (m) => {
    if (out.dueDate) return false;
    setDate(today, 'Today');
    if (m[1].toLowerCase() === 'tonight' && !out.dueTime) out.dueTime = '20:00';
  });
  take(/\s(tomorrow|tmr|tmrw)(?=\s)/gi, () => {
    if (out.dueDate) return false;
    setDate(addDaysISO(today, 1), 'Tomorrow');
  });
  take(/\sin\s+(\d{1,3})\s+(day|days|week|weeks)(?=\s)/gi, (m) => {
    if (out.dueDate) return false;
    const n = Number(m[1]) * (m[2].toLowerCase().startsWith('week') ? 7 : 1);
    setDate(addDaysISO(today, n), `In ${m[1]} ${m[2]}`);
  });
  take(/\snext\s+week(?=\s)/gi, () => {
    if (out.dueDate) return false;
    setDate(addDaysISO(weekStartISO(today, 1), 7), 'Next week');
  });
  take(/\s(next\s+|on\s+|by\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday)?(?=\s)/gi, (m) => {
    if (out.dueDate) return false;
    // "Study for SAT" is not Saturday: all-caps abbreviations are left alone.
    if (m[2].length <= 4 && m[2] === m[2].toUpperCase() && !m[1]) return false;
    const key = m[2].toLowerCase().slice(0, 3);
    const target = DAY_ABBR.indexOf(key);
    if (target < 0) return false;
    let diff = (target - weekdayOf(today) + 7) % 7;
    if (diff === 0) diff = 7;
    if (m[1]?.trim().toLowerCase() === 'next' && diff < 7) diff += 7;
    const d = addDaysISO(today, diff);
    setDate(d, DAYS[target][0].toUpperCase() + DAYS[target].slice(1));
  });
  take(/\s(\d{4}-\d{2}-\d{2})(?=\s)/g, (m) => {
    if (out.dueDate || !isISODate(m[1])) return false;
    setDate(m[1], m[1]);
  });
  take(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/g, (m) => {
    if (out.dueDate) return false;
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    let year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : Number(today.slice(0, 4));
    let iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!isISODate(iso)) return false;
    // Without a year, a date more than ~2 months in the past means next year.
    if (!m[3] && daysBetween(today, iso) < -60) {
      year += 1;
      iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    setDate(iso, `${month}/${day}`);
  });

  if (out.dueTime && !out.dueDate) setDate(today, 'Today');
  if (out.dueTime) {
    const [h, mm] = out.dueTime.split(':').map(Number);
    const label = `${h % 12 === 0 ? 12 : h % 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h >= 12 ? 'PM' : 'AM'}`;
    out.tokens.push(label);
  }
  out.title = s.replace(/\s+/g, ' ').trim();
  return out;
}
