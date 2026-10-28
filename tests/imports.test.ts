import { describe, expect, it } from 'vitest';
import { collectionSchemas, type CalendarEvent, type SchoolClass, type Task } from '../shared/schema';
import { guessAssignmentType, parseInbox, planImport, type InboxItem } from '../shared/imports';

const NOW = 1_800_000_000_000;
const opts = { now: NOW, colors: ['#111111', '#222222'] };
const empty = { classes: [] as SchoolClass[], tasks: [] as Task[], events: [] as CalendarEvent[] };

const course: InboxItem = { kind: 'course', ext: '101', name: 'AP Biology', section: 'Period 3', teacher: 'Ms. Rivera' };
const work = (p: Partial<Extract<InboxItem, { kind: 'work' }>> = {}): InboxItem => ({ kind: 'work', ext: 'w1', course: '101', title: 'Unit 4 Test', due: '2026-11-03', dueTime: '23:59', points: 100, state: 'open', ...p });
const ev = (p: Partial<Extract<InboxItem, { kind: 'event' }>> = {}): InboxItem => ({ kind: 'event', ext: 'e1', title: 'Soccer practice', date: '2026-11-02', start: '16:00', end: '17:30', ...p });

const classroomDoc = (items: InboxItem[]) => ({ doc: { id: 'classroom-abc', source: 'classroom' as const, syncedAt: NOW, items }, items });
const calendarDoc = (items: InboxItem[], from = '2026-10-20', to = '2027-01-31') => ({ doc: { id: 'calendar-abc', source: 'calendar' as const, syncedAt: NOW, from, to, items }, items });

/** Apply a plan to plain arrays, like the store does. */
function apply(data: typeof empty, plan: ReturnType<typeof planImport>) {
  const out = { classes: [...data.classes], tasks: [...data.tasks], events: [...data.events] };
  for (const p of plan.puts) {
    const list = out[p.collection] as { id: string }[];
    const i = list.findIndex((r) => r.id === p.record.id);
    if (i >= 0) list[i] = p.record;
    else list.push(p.record);
  }
  for (const d of plan.deletes) out.events = out.events.filter((e) => e.id !== d.id);
  return out;
}

describe('Classroom import', () => {
  it('creates a class and its assignments as valid records', () => {
    const plan = planImport([classroomDoc([course, work()])], empty, {}, opts);
    const cls = plan.puts.find((p) => p.collection === 'classes')!.record as SchoolClass;
    const task = plan.puts.find((p) => p.collection === 'tasks')!.record as Task;
    expect(collectionSchemas.classes.safeParse(cls).success).toBe(true);
    expect(collectionSchemas.tasks.safeParse(task).success).toBe(true);
    expect(cls).toMatchObject({ id: 'gc_101', name: 'AP Biology', teacher: 'Ms. Rivera', schedule: 'Period 3' });
    expect(task).toMatchObject({ id: 'gcw_w1', classId: 'gc_101', dueDate: '2026-11-03', dueTime: '23:59', assignmentType: 'test', priority: 'high', status: 'todo', pointsPossible: 100 });
    expect(plan.state['gcw_w1']).toMatch(/^classroom-abc\|/);
  });

  it('is idempotent: a second run with the same data changes nothing', () => {
    const first = planImport([classroomDoc([course, work()])], empty, {}, opts);
    const data = apply(empty, first);
    const second = planImport([classroomDoc([course, work()])], data, first.state, opts);
    expect(second.puts).toEqual([]);
    expect(second.stateChanged).toBe(false);
  });

  it('updates what Classroom owns when it changes, and keeps your edits', () => {
    const first = planImport([classroomDoc([course, work()])], empty, {}, opts);
    let data = apply(empty, first);
    data.tasks[0] = { ...data.tasks[0], notes: 'study ch. 4', priority: 'urgent' };
    const second = planImport([classroomDoc([course, work({ due: '2026-11-05', state: 'returned', grade: 91 })])], data, first.state, opts);
    data = apply(data, second);
    expect(data.tasks[0]).toMatchObject({ dueDate: '2026-11-05', status: 'done', pointsEarned: 91, notes: 'study ch. 4', priority: 'urgent' });
  });

  it('never brings back a class or assignment you deleted', () => {
    const first = planImport([classroomDoc([course, work()])], empty, {}, opts);
    const second = planImport([classroomDoc([course, work({ title: 'Unit 4 Test (moved)' })])], empty, first.state, opts);
    expect(second.puts).toEqual([]);
  });

  it('marks turned-in work as done on first import', () => {
    const plan = planImport([classroomDoc([course, work({ state: 'turned_in' })])], empty, {}, opts);
    expect(plan.puts.find((p) => p.collection === 'tasks')!.record).toMatchObject({ status: 'done', completedAt: NOW });
  });
});

describe('Calendar import', () => {
  it('creates, updates and removes events in the synced range', () => {
    const first = planImport([calendarDoc([ev(), ev({ ext: 'e2', title: 'Dentist', date: '2026-11-10', start: undefined, end: undefined })])], empty, {}, opts);
    let data = apply(empty, first);
    expect(data.events).toHaveLength(2);
    expect(data.events.every((e) => collectionSchemas.events.safeParse(e).success)).toBe(true);

    data.events[0] = { ...data.events[0], color: '#ff0000' };
    const second = planImport([calendarDoc([ev({ start: '16:30' })])], data, first.state, opts);
    data = apply(data, second);
    expect(data.events).toHaveLength(1);
    expect(data.events[0]).toMatchObject({ id: 'gce_e1', startTime: '16:30', color: '#ff0000' });
    expect(second.state['gce_e2']).toBeUndefined();
  });

  it('keeps past events that scrolled out of the synced range', () => {
    const first = planImport([calendarDoc([ev({ date: '2026-10-21' })])], empty, {}, opts);
    const data = apply(empty, first);
    const later = planImport([calendarDoc([], '2026-10-25', '2027-02-01')], data, first.state, opts);
    expect(later.deletes).toEqual([]);
    expect(later.state['gce_e1']).toBeUndefined();
  });

  it('only removes events that came from the same account', () => {
    const first = planImport([calendarDoc([ev()])], empty, {}, opts);
    const data = apply(empty, first);
    const other = { doc: { id: 'calendar-xyz', source: 'calendar' as const, syncedAt: NOW, from: '2026-10-20', to: '2027-01-31', items: [] }, items: [] };
    expect(planImport([other, calendarDoc([ev()])], data, first.state, opts).deletes).toEqual([]);
  });
});

describe('parsing', () => {
  it('skips malformed docs and items instead of failing', () => {
    const parsed = parseInbox([
      { id: 'calendar-1', source: 'calendar', syncedAt: 1, items: [ev(), { kind: 'event', ext: 'bad id!', title: 'x', date: '2026-01-01' }, { kind: 'nope' }] },
      { id: 'x', source: 'mystery', syncedAt: 1, items: [] },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].items).toHaveLength(1);
  });

  it('guesses assignment types from titles', () => {
    expect(guessAssignmentType('Chapter 5 Quiz')).toBe('quiz');
    expect(guessAssignmentType('Midterm review packet')).toBe('test');
    expect(guessAssignmentType('Lab 3: Osmosis')).toBe('lab');
    expect(guessAssignmentType('Persuasive essay draft')).toBe('essay');
    expect(guessAssignmentType('Worksheet 2.1')).toBe('homework');
  });
});
