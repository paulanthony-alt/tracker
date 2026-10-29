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
const ND = { ...P, digestTime: null, tomorrowTime: null, weekAheadTime: null, studyTime: null };

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
    // (The r3 reminder on the 29th is still in the evening-before preview; that's tested on its own below.)
    expect(dueNotifications(data, ND, NY, at('2026-10-28T00:00:00Z'), at('2026-10-29T00:00:00Z'))).toEqual([]);
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
    const prefs = { ...P, habitNudgeTime: '20:00', digestTime: null, tomorrowTime: null, weekAheadTime: null, studyTime: null };
    const due = dueNotifications({ ...empty, habits: [habit] }, prefs, NY, at('2026-10-29T00:00:00Z'), at('2026-10-29T01:00:00Z'));
    expect(due.map((d) => d.title)).toEqual(['1 habit left today']);
    const done = { ...habit, completions: ['2026-10-28'] };
    expect(dueNotifications({ ...empty, habits: [done] }, prefs, NY, at('2026-10-29T00:00:00Z'), at('2026-10-29T01:00:00Z'))).toEqual([]);
  });

  describe('tomorrow preview', () => {
    // Wednesday Oct 28, 5:30 PM in New York (EDT) is 21:30 UTC.
    const evening = [at('2026-10-28T21:00:00Z'), at('2026-10-28T22:00:00Z')] as const;
    const only = { ...P, digestTime: null, eventLeadMinutes: null, taskLeadMinutes: null, reminders: false, weekAheadTime: null, studyTime: null };
    const cls = { ...base, id: 'c1', name: 'AP Biology', color: '#fff', level: 'ap' as const, credits: 1, categories: [], archived: false };
    const project = { ...base, id: 'p1', name: 'Card Show', status: 'active' as const, color: '#fff', tags: [], contacts: [], transactions: [], archived: false, milestones: [{ id: 'm1', title: 'Book table', dueDate: '2026-10-29', done: false }] };
    const data = {
      ...empty,
      classes: [cls],
      projects: [project as unknown as NonNullable<Parameters<typeof dueNotifications>[0]['projects']>[number]],
      events: [evt({ id: 'e1', title: 'Soccer practice', date: '2026-10-27', startTime: '16:00', location: 'North field', recurrence: { freq: 'daily', interval: 1 } }), evt({ id: 'e2', title: 'Field trip', date: '2026-10-29' })],
      tasks: [
        task({ id: 't1', title: 'Unit 4 Test', dueDate: '2026-10-29', dueTime: '08:00', classId: 'c1' }),
        task({ id: 't2', title: 'Already done', dueDate: '2026-10-29', status: 'done' }),
        task({ id: 't3', title: 'Today, not tomorrow', dueDate: '2026-10-28' }),
      ],
      reminders: [rem({ id: 'r1', title: 'Permission slip', date: '2026-10-29', time: '07:00' })],
    };

    it('goes out at 5:30 PM the day before and lists everything on tomorrow’s calendar, earliest first', () => {
      const due = dueNotifications(data, only, NY, ...evening);
      expect(due).toHaveLength(1);
      expect(due[0]).toMatchObject({ kind: 'tomorrow', key: 'tomorrow:2026-10-29', title: 'Tomorrow: 5 things on your calendar', url: '#/calendar?view=day&date=2026-10-29' });
      expect(new Date(due[0].at).toISOString()).toBe('2026-10-28T21:30:00.000Z');
      expect(due[0].body.split('\n')).toEqual(['7 AM · Reminder: Permission slip', 'Due 8 AM · Unit 4 Test (AP Biology)', '4 PM · Soccer practice (North field)', 'All day · Field trip', 'Milestone · Book table (Card Show)']);
    });

    it('stays quiet when tomorrow is empty, when turned off, and is on by default for older settings', () => {
      expect(dueNotifications(empty, only, NY, ...evening)).toEqual([]);
      expect(dueNotifications(data, { ...only, tomorrowTime: null }, NY, ...evening)).toEqual([]);
      const { tomorrowTime: _omit, ...older } = only;
      void _omit;
      expect(dueNotifications(data, older, NY, ...evening).map((d) => d.kind)).toEqual(['tomorrow']);
      expect(dueNotifications(data, { ...only, tomorrowTime: '19:00' }, NY, ...evening)).toEqual([]);
    });

    it('keeps long days short', () => {
      const busy = { ...empty, tasks: Array.from({ length: 9 }, (_, i) => task({ id: `b${i}`, title: `Item ${i}`, dueDate: '2026-10-29' })) };
      const body = dueNotifications(busy, only, NY, ...evening)[0].body.split('\n');
      expect(body).toHaveLength(7);
      expect(body[6]).toBe('+3 more');
    });
  });

  describe('week ahead and study reminders', () => {
    // Sunday Nov 1, 2026 is the day clocks go back: 6 PM is now EST (UTC-5), i.e. 23:00 UTC.
    const off = { ...P, digestTime: null, eventLeadMinutes: null, taskLeadMinutes: null, reminders: false, tomorrowTime: null, weekAheadTime: null, studyTime: null };
    const cls = { ...base, id: 'bio', name: 'AP Biology', color: '#fff', level: 'ap' as const, credits: 1, categories: [], archived: false };
    const project = { ...base, id: 'p1', name: 'Card Show', status: 'active' as const, color: '#fff', tags: [], contacts: [], transactions: [], archived: false, milestones: [{ id: 'm1', title: 'Book table', dueDate: '2026-11-03', done: false }] };
    const week = {
      ...empty,
      classes: [cls],
      projects: [project as unknown as NonNullable<Parameters<typeof dueNotifications>[0]['projects']>[number]],
      tasks: [
        task({ id: 'test', title: 'Unit 4 Test', dueDate: '2026-11-06', assignmentType: 'test', classId: 'bio' }),
        task({ id: 'quiz', title: 'Vocab 5', dueDate: '2026-11-05', assignmentType: 'quiz' }),
        task({ id: 'essay', title: 'Gatsby essay', dueDate: '2026-11-04', assignmentType: 'essay' }),
        task({ id: 'hw', title: 'Worksheet', dueDate: '2026-11-03', assignmentType: 'homework', priority: 'low' }),
        task({ id: 'later', title: 'Next week test', dueDate: '2026-11-12', assignmentType: 'test' }),
      ],
      events: [
        evt({ id: 'trip', title: 'Field trip', date: '2026-11-07', startTime: '10:00' }),
        evt({ id: 'soccer', title: 'Soccer practice', date: '2026-10-26', startTime: '16:00', recurrence: { freq: 'weekly', interval: 1, daysOfWeek: [1, 2, 3, 4, 5] } }),
      ],
    };

    it('sends the week ahead on Sunday evening, biggest things first', () => {
      const sunday = [at('2026-11-01T22:30:00Z'), at('2026-11-01T23:30:00Z')] as const;
      const due = dueNotifications(week, { ...off, weekAheadTime: '18:00' }, NY, ...sunday);
      expect(due).toHaveLength(1);
      expect(due[0]).toMatchObject({ kind: 'week', key: 'week:2026-11-01', title: 'Your week ahead', url: '#/calendar?view=week&date=2026-11-02' });
      expect(new Date(due[0].at).toISOString()).toBe('2026-11-01T23:00:00.000Z');
      expect(due[0].body.split('\n')).toEqual([
        'Thu · Quiz: Vocab 5',
        'Fri · Unit 4 Test (AP Biology)',
        'Wed · Gatsby essay',
        'Tue · Milestone: Book table',
        'Sat 10 AM · Field trip',
        'Also: Soccer practice ×5',
      ]);
    });

    it('only on Sundays, only when there is something, and not when turned off', () => {
      expect(dueNotifications(week, { ...off, weekAheadTime: '18:00' }, NY, at('2026-10-28T21:30:00Z'), at('2026-10-28T22:30:00Z'))).toEqual([]);
      expect(dueNotifications(empty, { ...off, weekAheadTime: '18:00' }, NY, at('2026-11-01T22:30:00Z'), at('2026-11-01T23:30:00Z'))).toEqual([]);
      const { weekAheadTime: _w, ...older } = off;
      void _w;
      expect(dueNotifications(week, older, NY, at('2026-11-01T22:30:00Z'), at('2026-11-01T23:30:00Z')).map((d) => d.kind)).toEqual(['week']);
    });

    it('reminds to study each day in the run-up to a test, at the chosen time', () => {
      const prefs = { ...off, studyTime: '16:00' };
      const data = { ...week, tasks: [...week.tasks, task({ id: 's1', title: 'Review ch. 9', dueDate: '2026-11-05', assignmentType: 'study', estimateMinutes: 45 })] };
      // Thursday Nov 5, 4 PM EST = 21:00 UTC: the quiz is today-not-tomorrow (due Thu), the test is tomorrow.
      const thu = dueNotifications(data, prefs, NY, at('2026-11-05T20:30:00Z'), at('2026-11-05T21:30:00Z'));
      expect(thu).toHaveLength(1);
      expect(thu[0]).toMatchObject({ kind: 'study', key: 'study:2026-11-05', title: 'Study time: Unit 4 Test tomorrow', url: '#/school?tab=planner' });
      expect(thu[0].body.split('\n')).toEqual(['Unit 4 Test · tomorrow (AP Biology)', 'Planned today: Review ch. 9 · 45 min']);
      // Monday Nov 2: quiz in 3 days (Thu); the test (Fri) is still 4 days away.
      const mon = dueNotifications(data, prefs, NY, at('2026-11-02T20:30:00Z'), at('2026-11-02T21:30:00Z'));
      expect(mon[0].title).toBe('Study time: Vocab 5 in 3 days');
      // Tuesday: both are within 3 days.
      expect(dueNotifications(data, prefs, NY, at('2026-11-03T20:30:00Z'), at('2026-11-03T21:30:00Z'))[0].title).toBe('Study time: 2 tests coming up');
      // "The day before" only.
      expect(dueNotifications(data, { ...prefs, studyDaysBefore: 1 }, NY, at('2026-11-03T20:30:00Z'), at('2026-11-03T21:30:00Z'))).toEqual([]);
      // Finished tests, and the setting turned off, mean no reminders.
      const done = { ...data, tasks: data.tasks.map((t) => ({ ...t, status: 'done' as const })) };
      expect(dueNotifications(done, prefs, NY, at('2026-11-05T20:30:00Z'), at('2026-11-05T21:30:00Z'))).toEqual([]);
      expect(dueNotifications(data, off, NY, at('2026-11-05T20:30:00Z'), at('2026-11-05T21:30:00Z'))).toEqual([]);
    });
  });

  it('respects the master switch and per-type switches', () => {
    const data = { ...empty, reminders: [rem({ date: '2026-10-28', time: '07:30' })] };
    const w = [at('2026-10-28T11:00:00Z'), at('2026-10-28T12:00:00Z')] as const;
    expect(dueNotifications(data, { ...P, enabled: false }, NY, ...w)).toEqual([]);
    expect(dueNotifications(data, { ...ND, reminders: false }, NY, ...w)).toEqual([]);
  });

  it('changes the key when a reminder is rescheduled, so it notifies again', () => {
    const a = dueNotifications({ ...empty, reminders: [rem({ date: '2026-10-28', time: '07:30' })] }, ND, NY, 0, at('2027-01-01T00:00:00Z'))[0];
    const b = dueNotifications({ ...empty, reminders: [rem({ date: '2026-10-28', time: '07:40' })] }, ND, NY, 0, at('2027-01-01T00:00:00Z'))[0];
    expect(a.key).not.toBe(b.key);
  });
});
