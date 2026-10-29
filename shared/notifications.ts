/**
 * Decides which notifications are due in a time window. Pure and
 * dependency-free so it runs in the browser (exact-time alerts while the app
 * is open) and in scripts/reminders (push to closed devices).
 */
import type { CalendarEvent, Habit, NotificationPrefs, Reminder, SchoolClass, Project, Task } from './schema.ts';
import { addDays, formatClock, localDate, occurrencesInRange, weekday, zonedTime } from './calendar.ts';

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  reminders: true,
  defaultReminderTime: '09:00',
  eventLeadMinutes: 15,
  taskLeadMinutes: 60,
  digestTime: '07:30',
  habitNudgeTime: null,
  tomorrowTime: '17:30',
};

/** When the "tomorrow" preview goes out, or null if it's off. Older saved settings don't have it yet: they get the default. */
export const tomorrowTimeOf = (prefs: NotificationPrefs) => (prefs.tomorrowTime === undefined ? DEFAULT_NOTIFICATION_PREFS.tomorrowTime! : prefs.tomorrowTime);

export interface DueNotification {
  /** Stable id for de-duplication. Changes if the item is rescheduled, so it notifies again. */
  key: string;
  /** When it should fire (UTC ms). */
  at: number;
  kind: 'reminder' | 'event' | 'task' | 'digest' | 'habits' | 'tomorrow';
  title: string;
  body: string;
  /** In-app route to open (hash), e.g. "#/tasks". */
  url: string;
  important?: boolean;
  /** The record it came from, for actions like "Done" or "Snooze". */
  refId?: string;
}

export interface NotificationData {
  reminders: Reminder[];
  events: CalendarEvent[];
  tasks: Task[];
  habits: Habit[];
  classes?: SchoolClass[];
  projects?: Project[];
}

const minutes = (n: number) => n * 60_000;
const MAX_PREVIEW_LINES = 6;

/**
 * Everything on the calendar for one date, timed items first: events, tasks and
 * assignments due, reminders and project milestones. One line each.
 */
function calendarFor(data: NotificationData, date: string): { sort: number; line: string }[] {
  const at = (time?: string) => (time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : 24 * 60);
  const items: { sort: number; line: string }[] = [];
  for (const e of data.events) {
    if (!occurrencesInRange(e.date, e.recurrence, date, date).length) continue;
    items.push({ sort: at(e.startTime), line: `${e.startTime ? formatClock(e.startTime) : 'All day'} · ${e.title}${e.location ? ` (${e.location})` : ''}` });
  }
  for (const t of data.tasks) {
    if (t.status === 'done' || t.archived || t.dueDate !== date) continue;
    const where = data.classes?.find((c) => c.id === t.classId)?.name ?? data.projects?.find((p) => p.id === t.projectId)?.name;
    items.push({ sort: at(t.dueTime), line: `${t.dueTime ? `Due ${formatClock(t.dueTime)}` : 'Due'} · ${t.title}${where ? ` (${where})` : ''}` });
  }
  for (const r of data.reminders) {
    if (r.done || r.date !== date) continue;
    items.push({ sort: at(r.time), line: `${r.time ? `${formatClock(r.time)} · ` : ''}Reminder: ${r.title}` });
  }
  for (const p of data.projects ?? []) {
    for (const m of p.milestones) if (!m.done && m.dueDate === date) items.push({ sort: at(), line: `Milestone · ${m.title} (${p.name})` });
  }
  return items.sort((a, b) => a.sort - b.sort);
}
const leadText = (lead: number) => (lead === 0 ? 'now' : lead < 60 ? `in ${lead} min` : lead % 60 === 0 ? `in ${lead / 60} hr` : `in ${Math.floor(lead / 60)} hr ${lead % 60} min`);

/**
 * Everything whose fire time falls in [fromMs, toMs).
 * `timeZone` is the user's IANA zone; dates and times in the data are local to it.
 */
export function dueNotifications(data: NotificationData, prefs: NotificationPrefs, timeZone: string, fromMs: number, toMs: number): DueNotification[] {
  if (!prefs.enabled || toMs <= fromMs) return [];
  const out: DueNotification[] = [];
  const inWindow = (at: number) => at >= fromMs && at < toMs;
  // Candidate local dates: lead times can push an item up to a day before its date.
  const firstDay = addDays(localDate(fromMs, timeZone), -1);
  const lastDay = addDays(localDate(toMs, timeZone), 2);
  const days: string[] = [];
  for (let d = firstDay; d <= lastDay; d = addDays(d, 1)) days.push(d);

  if (prefs.reminders) {
    for (const r of data.reminders) {
      if (r.done || !r.date) continue;
      const time = r.time ?? prefs.defaultReminderTime;
      const at = zonedTime(r.date, time, timeZone);
      if (!inWindow(at)) continue;
      out.push({
        key: `rem:${r.id}:${r.date}T${time}`,
        at,
        kind: 'reminder',
        title: r.important ? `Important: ${r.title}` : r.title,
        body: `Reminder · ${formatClock(time)}`,
        url: '#/',
        important: !!r.important,
        refId: r.id,
      });
    }
  }

  if (prefs.eventLeadMinutes !== null) {
    const lead = prefs.eventLeadMinutes;
    for (const e of data.events) {
      if (!e.startTime) continue;
      for (const date of occurrencesInRange(e.date, e.recurrence, days[0], days[days.length - 1])) {
        const at = zonedTime(date, e.startTime, timeZone) - minutes(lead);
        if (!inWindow(at)) continue;
        out.push({
          key: `evt:${e.id}:${date}T${e.startTime}`,
          at,
          kind: 'event',
          title: e.title,
          body: `${lead === 0 ? 'Starting now' : `Starts ${leadText(lead)}`} · ${formatClock(e.startTime)}${e.location ? ` · ${e.location}` : ''}`,
          url: `#/calendar?view=day&date=${date}`,
          refId: e.id,
        });
      }
    }
  }

  if (prefs.taskLeadMinutes !== null) {
    const lead = prefs.taskLeadMinutes;
    for (const t of data.tasks) {
      if (t.status === 'done' || t.archived || !t.dueDate || !t.dueTime) continue;
      const at = zonedTime(t.dueDate, t.dueTime, timeZone) - minutes(lead);
      if (!inWindow(at)) continue;
      const where = data.classes?.find((c) => c.id === t.classId)?.name ?? data.projects?.find((p) => p.id === t.projectId)?.name;
      out.push({
        key: `task:${t.id}:${t.dueDate}T${t.dueTime}`,
        at,
        kind: 'task',
        title: t.title,
        body: `Due ${leadText(lead)} · ${formatClock(t.dueTime)}${where ? ` · ${where}` : ''}`,
        url: `#/tasks?task=${t.id}`,
        important: t.priority === 'urgent' || t.priority === 'high',
        refId: t.id,
      });
    }
  }

  if (prefs.digestTime) {
    for (const date of days) {
      const at = zonedTime(date, prefs.digestTime, timeZone);
      if (!inWindow(at)) continue;
      const open = data.tasks.filter((t) => t.status !== 'done' && !t.archived && t.dueDate);
      const dueToday = open.filter((t) => t.dueDate === date);
      const overdue = open.filter((t) => t.dueDate! < date);
      const reminders = data.reminders.filter((r) => !r.done && r.date === date);
      const events = data.events.filter((e) => occurrencesInRange(e.date, e.recurrence, date, date).length > 0);
      if (!dueToday.length && !overdue.length && !reminders.length && !events.length) continue;
      const parts = [
        dueToday.length && `${dueToday.length} due today`,
        overdue.length && `${overdue.length} overdue`,
        events.length && `${events.length} event${events.length === 1 ? '' : 's'}`,
        reminders.length && `${reminders.length} reminder${reminders.length === 1 ? '' : 's'}`,
      ].filter(Boolean);
      const rank = { urgent: 0, high: 1, medium: 2, low: 3 } as const;
      const first = [...overdue, ...dueToday].sort((a, b) => rank[a.priority] - rank[b.priority])[0];
      out.push({
        key: `digest:${date}`,
        at,
        kind: 'digest',
        title: 'Your day',
        body: `${parts.join(' · ')}${first ? `. Start with: ${first.title}` : ''}`,
        url: '#/',
      });
    }
  }

  const previewTime = tomorrowTimeOf(prefs);
  if (previewTime) {
    for (const date of days) {
      const at = zonedTime(date, previewTime, timeZone);
      if (!inWindow(at)) continue;
      const next = addDays(date, 1);
      const items = calendarFor(data, next);
      if (!items.length) continue;
      const lines = items.slice(0, MAX_PREVIEW_LINES).map((i) => i.line);
      if (items.length > MAX_PREVIEW_LINES) lines.push(`+${items.length - MAX_PREVIEW_LINES} more`);
      out.push({
        key: `tomorrow:${next}`,
        at,
        kind: 'tomorrow',
        title: `Tomorrow: ${items.length} thing${items.length === 1 ? '' : 's'} on your calendar`,
        body: lines.join('\n'),
        url: `#/calendar?view=day&date=${next}`,
      });
    }
  }

  if (prefs.habitNudgeTime) {
    for (const date of days) {
      const at = zonedTime(date, prefs.habitNudgeTime, timeZone);
      if (!inWindow(at)) continue;
      const left = data.habits.filter(
        (h) => !h.archived && h.frequency === 'daily' && (!h.daysOfWeek?.length || h.daysOfWeek.includes(weekday(date))) && !h.completions.includes(date) && localDate(h.createdAt, timeZone) <= date,
      );
      if (!left.length) continue;
      out.push({
        key: `habits:${date}`,
        at,
        kind: 'habits',
        title: `${left.length} habit${left.length === 1 ? '' : 's'} left today`,
        body: left.map((h) => h.name).slice(0, 4).join(', '),
        url: '#/habits',
      });
    }
  }

  return out.sort((a, b) => a.at - b.at);
}
