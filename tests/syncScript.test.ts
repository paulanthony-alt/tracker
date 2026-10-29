import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseInbox, planImport } from '../shared/imports';
import { fromFields, runSyncScript } from './helpers/appsScript';

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-28T16:00:00Z'));
});
afterAll(() => vi.useRealTimers());

const decode = (payload: string) => fromFields(JSON.parse(payload).fields);

describe('Google sync script', () => {
  it('sends one Classroom and one Calendar document per account', () => {
    const { requests } = runSyncScript();
    expect(requests).toHaveLength(2);
    for (const r of requests) {
      expect(r.method).toBe('patch');
      expect(r.url).toMatch(/^https:\/\/firestore\.googleapis\.com\/v1\/projects\/demo-vyro\/databases\/\(default\)\/documents\/vyro\/owner\/inbox\/(classroom|calendar)-[a-f0-9]{12}\?key=test-api-key$/);
    }
    const [classroom, calendar] = requests.map((r) => decode(r.payload));
    expect(classroom).toMatchObject({ source: 'classroom', account: 'student@school.org', key: 'k'.repeat(40) });
    expect(calendar).toMatchObject({ source: 'calendar', from: '2026-10-14', to: '2027-02-25' });
  });

  it('produces items that Vyro imports as the right classes, assignments and events', () => {
    const docs = runSyncScript().requests.map((r) => decode(r.payload));
    const inbox = parseInbox(docs);
    // Every item the script sent passed Vyro's checks.
    expect(inbox.map((d) => d.items.length)).toEqual(docs.map((d) => (d.items as unknown[]).length));
    const plan = planImport(inbox, { classes: [], tasks: [], events: [] }, {}, { now: 1, colors: ['#4f8cff'] });
    const records = plan.puts.map((p) => p.record) as unknown as Record<string, unknown>[];

    expect(records.find((r) => r.name === 'AP Biology')).toMatchObject({ teacher: 'Ms. Rivera', room: '204', schedule: 'Period 3' });
    expect(records.find((r) => r.title === 'Unit 4 Test')).toMatchObject({ dueDate: '2026-11-03', dueTime: '23:59', pointsPossible: 100, assignmentType: 'test', status: 'todo' });
    expect(records.find((r) => r.title === 'Lab 3 write-up')).toMatchObject({ status: 'done', pointsEarned: 18, assignmentType: 'lab' });
    expect(records.find((r) => r.title === 'Old worksheet')).toBeUndefined();

    expect(records.find((r) => r.title === 'Soccer practice')).toMatchObject({ date: '2026-11-02', startTime: '16:00', endTime: '17:30', location: 'Field 2', notes: 'Bring cleats\nand water' });
    expect(records.filter((r) => r.title === 'Thanksgiving break').map((r) => r.date)).toEqual(['2026-11-26', '2026-11-27']);
    // Declined events, hidden calendars and Classroom's own class calendars are left out.
    expect(records.filter((r) => r.title === 'Unit 4 Test')).toHaveLength(1);
    expect(records.some((r) => r.title === 'Declined meeting' || r.title === 'Hidden')).toBe(false);
  });

  it("writes to a family member's own space", () => {
    const { requests } = runSyncScript({ projectId: 'demo-vyro', apiKey: 'test-api-key', member: 'sam', key: 'k'.repeat(40) });
    for (const r of requests) expect(r.url).toContain('/documents/vyro/sam/inbox/');
  });

  it('still syncs the calendar when the Classroom service is not added', () => {
    const { requests, logs } = runSyncScript(undefined, { classroom: false });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain('/inbox/calendar-');
    expect(logs[0]).toMatch(/Google Classroom is not added/);
  });
});
