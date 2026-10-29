/**
 * Runs the Vyro Google Apps Script (src/lib/syncScript.ts) in Node with fake
 * Google services, and captures the requests it would send to Firestore.
 */
import { createHash } from 'node:crypto';
import { buildSyncScript } from '../../src/lib/syncScript';

export interface CapturedRequest {
  url: string;
  method: string;
  payload: string;
}

const TZ = 'America/New_York';

function formatDate(d: Date, tz: string, fmt: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  if (fmt === 'yyyy-MM-dd') return `${parts.year}-${parts.month}-${parts.day}`;
  if (fmt === 'HH:mm') return `${parts.hour}:${parts.minute}`;
  throw new Error(`unsupported format ${fmt}`);
}

const ev = (p: { id: string; title: string; start: string; end: string; allDay?: boolean; location?: string; description?: string; declined?: boolean }) => ({
  getId: () => p.id,
  getTitle: () => p.title,
  getLocation: () => p.location ?? '',
  getDescription: () => p.description ?? '',
  isAllDayEvent: () => Boolean(p.allDay),
  getStartTime: () => new Date(p.start),
  getEndTime: () => new Date(p.end),
  getAllDayStartDate: () => new Date(p.start),
  getAllDayEndDate: () => new Date(p.end),
  getMyStatus: () => (p.declined ? 'NO' : 'YES'),
});

const cal = (id: string, events: ReturnType<typeof ev>[], opts: { hidden?: boolean } = {}) => ({
  getId: () => id,
  isHidden: () => Boolean(opts.hidden),
  isSelected: () => true,
  getEvents: () => events,
});

/** Run sync() once and return what it sent. `classroom: false` simulates the service not being added. */
export function runSyncScript(cfg = { projectId: 'demo-vyro', apiKey: 'test-api-key', member: 'owner', key: 'k'.repeat(40) }, opts: { classroom?: boolean } = {}) {
  const requests: CapturedRequest[] = [];
  const logs: string[] = [];
  const Utilities = {
    formatDate,
    DigestAlgorithm: { MD5: 'md5' },
    Charset: { UTF_8: 'utf8' },
    computeDigest: (_alg: string, s: string) => [...createHash('md5').update(s, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
  };
  const Session = {
    getScriptTimeZone: () => TZ,
    getEffectiveUser: () => ({ getEmail: () => 'Student@School.org' }),
    getActiveUser: () => ({ getEmail: () => '' }),
  };
  const ScriptApp = { getProjectTriggers: () => [], getScriptId: () => 'script-id', newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => ({}) }) }) }) };
  const Logger = { log: (m: string) => logs.push(m) };
  const UrlFetchApp = {
    fetch: (url: string, o: { method: string; payload: string }) => {
      requests.push({ url, method: o.method, payload: o.payload });
      return { getResponseCode: () => 200, getContentText: () => '{}' };
    },
  };
  const Classroom = {
    Courses: {
      list: () => ({ courses: [{ id: '5551', name: 'AP Biology', section: 'Period 3', room: '204', ownerId: 't1', calendarId: 'class-bio@group.calendar.google.com' }] }),
      CourseWork: {
        list: () => ({
          courseWork: [
            // Due 11:59 PM New York time on Nov 3 (stored by Classroom in UTC).
            { id: '9001', title: 'Unit 4 Test', description: 'Chapters 9–11', alternateLink: 'https://classroom.google.com/c/x/a/9001', dueDate: { year: 2026, month: 11, day: 4 }, dueTime: { hours: 4, minutes: 59 }, maxPoints: 100, creationTime: '2026-10-20T00:00:00Z' },
            { id: '9002', title: 'Lab 3 write-up', creationTime: '2026-10-25T00:00:00Z' },
            { id: '9003', title: 'Old worksheet', dueDate: { year: 2026, month: 5, day: 1 }, creationTime: '2026-04-01T00:00:00Z' },
          ],
        }),
        StudentSubmissions: { list: () => ({ studentSubmissions: [{ courseWorkId: '9002', state: 'RETURNED', assignedGrade: 18 }] }) },
      },
    },
    UserProfiles: { get: () => ({ name: { fullName: 'Ms. Rivera' } }) },
  };
  const CalendarApp = {
    GuestStatus: { NO: 'NO' },
    getAllCalendars: () => [
      cal('me@gmail.com', [
        ev({ id: 'a1', title: 'Soccer practice', start: '2026-11-02T21:00:00Z', end: '2026-11-02T22:30:00Z', location: 'Field 2', description: 'Bring <b>cleats</b><br>and water' }),
        ev({ id: 'a2', title: 'Thanksgiving break', start: '2026-11-26T05:00:00Z', end: '2026-11-28T05:00:00Z', allDay: true }),
        ev({ id: 'a3', title: 'Declined meeting', start: '2026-11-03T15:00:00Z', end: '2026-11-03T16:00:00Z', declined: true }),
      ]),
      cal('class-bio@group.calendar.google.com', [ev({ id: 'dup', title: 'Unit 4 Test', start: '2026-11-04T04:59:00Z', end: '2026-11-04T04:59:00Z' })]),
      cal('hidden@group', [ev({ id: 'h', title: 'Hidden', start: '2026-11-05T15:00:00Z', end: '2026-11-05T16:00:00Z' })], { hidden: true }),
    ],
  };
  const names = ['Utilities', 'Session', 'ScriptApp', 'Logger', 'UrlFetchApp', 'CalendarApp', ...(opts.classroom === false ? [] : ['Classroom'])];
  const values = [Utilities, Session, ScriptApp, Logger, UrlFetchApp, CalendarApp, ...(opts.classroom === false ? [] : [Classroom])];
  const api = new Function(...names, `${buildSyncScript(cfg)}\nreturn { sync, setup };`)(...values) as { sync: () => void; setup: () => void };
  api.sync();
  return { requests, logs };
}

/** Turn Firestore REST typed JSON back into plain values. */
export function fromFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromValue(v as Record<string, unknown>)]));
}
function fromValue(v: Record<string, unknown>): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return ((v.arrayValue as { values?: Record<string, unknown>[] }).values ?? []).map(fromValue);
  if ('mapValue' in v) return fromFields((v.mapValue as { fields?: Record<string, unknown> }).fields ?? {});
  throw new Error(`unknown value ${JSON.stringify(v)}`);
}
