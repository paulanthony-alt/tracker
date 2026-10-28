import { describe, expect, it } from 'vitest';
import { addMonths as dfAddMonths, format } from 'date-fns';
import type { CalendarEvent, Habit, Reminder, Task } from '../shared/schema';
import { addMonths, localDate, zonedTime } from '../shared/calendar';
import { DEFAULT_NOTIFICATION_PREFS as P, dueNotifications } from '../shared/notifications';

const NY = 'America/New_York';
const base = { createdAt: 0, updatedAt: 0 };
const rem = (p: Partial<Reminder>): Reminder => ({ ...base, id: 'r1', title: 'Bring permission slip', done: false, ...p });
const evt = (p: Partial<CalendarEvent>): CalendarEvent => ({ ...base, id: 'e1', title: 'Soccer practice', date: '2026-10-26', ...p });
const task = (p: Partial<Task>): Task => ({ ...base, id: 't1', title: 'Problem set 6', status: 'todo', priority: 'medium', tags: [], archived: false, ...p });
const empty = { reminders: [], events: [], tasks: [], habits: [] as Habit[] };
const at = (iso: string) => Date.parse(iso);
/** Prefs without the morning digest, for tests about other kinds. */
const ND = { ...P, digestTime: null };

describe('time zones', () => {
  it('converts local wall time to UTC, including across daylight saving', () => {
    expect(new Date(zonedTime('2026-10-28', '07:30', NY)).toISOString()).toBe('2026-10-28T11:30:00.000Z'); // EDT, UTC-4
    expect(new Date(zonedTime('2026-11-02', '07:30', NY)).toISOString()).toBe('2026-11-02T12:30:00.000Z'); // EST, UTC-5
    expect(new Date(zonedTime('2026-03-08', '09:00', NY)).toISOString()).toBe('2026-03-08T13:00:00.000Z'); // day DST starts
    expect(new Date(zonedTime('2026-10-28', '07:30', 'Asia/Kolkata')).toISOString()).toBe('2026-10-28T02:00:00.000Z');
  });
  it('gets the local date of an instant', () => {
    expect(localDate(at('2026-10-29T02:00:00Z'), NY)).toBe('2026-10-28');
    expect(localDate(at('2026-10-29T02:00:00Z'), 'Europe/London')).toBe('2026-10-29');
  });
  it('month math matches date-fns (end-of-month clamping)', () => {
    for (const d of ['2026-01-31', '2026-03-31', '2024-01-30', '2026-12-15', '2026-05-31']) {
      for (const n of [1, 2, 11, 13]) expect(addMonths(d, n)).toBe(format(dfAddMonths(new Date(`${d}T12:00:00`), n), 'yyyy-MM-dd'));
    }
  });
});

describe('dueNotifications', () => {
  const day = (from: string, to: string) => [at(from), at(to)] as const;

  it('fires reminders at their time, or the default time when none is set', () => {
    const data = { ...empty, reminders: [rem({ date: '2026-10-28', time: '07:30', important: true }), rem({ id: 'r2', title: 'Pay phone bill', date: '2026-10-28' })] };
    const [from, to] = day('2026-10-28T11:00:00Z', '2026-10-28T14:00:00Z');
    const due = dueNotifications(data, ND, NY, from, to);
    expect(due.map((d) => [d.title, new Date(d.at).toISOString()])).toEqual([
      ['Important: Bring permission slip', '2026-10-28T11:30:00.000Z'],
      ['Pay phone bill', '2026-10-28T13:00:00.000Z'], // 09:00 EDT
    ]);
    expect(due[0].important).toBe(true);
    expect(due[0].body).toBe('Reminder · 7:30 AM');
  });

  it('ignores done reminders, undated reminders and anything outside the window', () => {
    const data = { ...empty, reminders: [rem({ date: '2026-10-28', time: '07:30', done: true }), rem({ id: 'r2' }), rem({ id: 'r3', date: '2026-10-29', time: '07:30' })] };
    expect(dueNotifications(data, P, NY, at('2026-10-28T00:00:00Z'), at('2026-10-29T00:00:00Z'))).toEqual([]);
  });

  it('warns before repeating events, using the lead time', () => {
    const data = { ...empty, events: [evt({ startTime: '16:00', recurrence: { freq: 'weekly', interval: 1, daysOfWeek: [1, 3, 5] }, location: 'North field' })] };
    const due = dueNotifications(data, ND, NY, at('2026-10-28T00:00:00Z'), at('2026-10-29T00:00:00Z'));
    expect(due).toHaveLength(1);
    expect(new Date(due[0].at).toISOString()).toBe('2026-10-28T19:45:00.000Z'); // 3:45 PM EDT
    expect(due[0].body).toBe('Starts in 15 min · 4 PM · North field');
    expect(due[0].key).toBe('evt:e1:2026-10-28T16:00');
  });

  it('warns before tasks with a due time and skips finished ones', () => {
    const data = { ...empty, tasks: [task({ dueDate: '2026-10-28', dueTime: '23:59', priority: 'urgent' }), task({ id: 't2', dueDate: '2026-10-28', dueTime: '20:00', status: 'done' })] };
    const due = dueNotifications(data, ND, NY, at('2026-10-28T00:00:00Z'), at('2026-10-29T12:00:00Z'));
    expect(due).toHaveLength(1);
    expect(new Date(due[0].at).toISOString()).toBe('2026-10-29T02:59:00.000Z'); // 10:59 PM EDT
    expect(due[0].important).toBe(true);
  });

  it('sends a morning digest only when there is something to say', () => {
    const data = { ...empty, tasks: [task({ dueDate: '2026-10-28' }), task({ id: 't2', title: 'Lab report', dueDate: '2026-10-27', priority: 'high' })] };
    const due = dueNotifications(data, P, NY, at('2026-10-28T11:00:00Z'), at('2026-10-28T12:00:00Z'));
    expect(due.map((d) => d.kind)).toEqual(['digest']);
    expect(due[0].body).toBe('1 due today · 1 overdue. Start with: Lab report');
    expect(dueNotifications(empty, P, NY, at('2026-10-28T11:00:00Z'), at('2026-10-28T12:00:00Z'))).toEqual([]);
  });

  it('nudges about unfinished habits when enabled', () => {
    const habit: Habit = { ...base, id: 'h', name: 'Read 20 minutes', color: '#fff', frequency: 'daily', targetPerWeek: 1, completions: [], archived: false, order: 0 };
    const prefs = { ...P, habitNudgeTime: '20:00', digestTime: null };
    const due = dueNotifications({ ...empty, habits: [habit] }, prefs, NY, at('2026-10-29T00:00:00Z'), at('2026-10-29T01:00:00Z'));
    expect(due.map((d) => d.title)).toEqual(['1 habit left today']);
    const done = { ...habit, completions: ['2026-10-28'] };
    expect(dueNotifications({ ...empty, habits: [done] }, prefs, NY, at('2026-10-29T00:00:00Z'), at('2026-10-29T01:00:00Z'))).toEqual([]);
  });

  it('respects the master switch and per-type switches', () => {
    const data = { ...empty, reminders: [rem({ date: '2026-10-28', time: '07:30' })] };
    const w = [at('2026-10-28T11:00:00Z'), at('2026-10-28T12:00:00Z')] as const;
    expect(dueNotifications(data, { ...P, enabled: false }, NY, ...w)).toEqual([]);
    expect(dueNotifications(data, { ...P, reminders: false, digestTime: null }, NY, ...w)).toEqual([]);
  });

  it('changes the key when a reminder is rescheduled, so it notifies again', () => {
    const a = dueNotifications({ ...empty, reminders: [rem({ date: '2026-10-28', time: '07:30' })] }, P, NY, 0, at('2027-01-01T00:00:00Z'))[0];
    const b = dueNotifications({ ...empty, reminders: [rem({ date: '2026-10-28', time: '07:40' })] }, P, NY, 0, at('2027-01-01T00:00:00Z'))[0];
    expect(a.key).not.toBe(b.key);
  });
});
