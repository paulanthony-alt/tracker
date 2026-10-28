/**
 * The Google Apps Script that brings Google Classroom and Google Calendar into
 * Vyro. The user pastes it into script.google.com from the Google account that
 * has their classes; it runs every 30 minutes as that account and writes what
 * it finds to vyro/owner/inbox (see shared/imports.ts and firestore.rules).
 *
 * Running inside the user's own account matters for school accounts: schools
 * usually block outside apps from reading student data, but a script you
 * create yourself counts as your own.
 */
import { IMPORT_LIMITS } from '@shared/imports';

export interface SyncScriptConfig {
  projectId: string;
  apiKey: string;
  key: string;
}

export function buildSyncScript(cfg: SyncScriptConfig): string {
  return `/**
 * Vyro sync: brings Google Classroom and Google Calendar into Vyro.
 *
 * Setup (one time):
 *   1. Services (+ on the left) -> Google Classroom API -> Add.
 *   2. Choose "setup" in the menu above, click Run, and allow access.
 * After that it runs by itself every 30 minutes. Change the two settings
 * below to true/false if you only want one of them.
 */
const BRING_IN_CLASSROOM = true;
const BRING_IN_CALENDAR = true;

// Your Vyro connection. The key is private: don't share this script.
const VYRO = ${JSON.stringify(cfg, null, 2)};

const LIMITS = ${JSON.stringify(IMPORT_LIMITS)};
const DAYS_BACK = 14;
const DAYS_AHEAD = 120;

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sync') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(30).create();
  sync();
  Logger.log('All set. Vyro will update every 30 minutes.');
}

function sync() {
  const tz = Session.getScriptTimeZone();
  const account = (Session.getEffectiveUser().getEmail() || Session.getActiveUser().getEmail() || ScriptApp.getScriptId()).toLowerCase();
  const tag = md5(account).slice(0, 12);
  let skipCalendars = [];
  if (BRING_IN_CLASSROOM) {
    if (typeof Classroom === 'undefined') {
      Logger.log('Google Classroom is not added yet: click Services (+) on the left, pick Google Classroom API, then Add.');
    } else {
      const classroom = readClassroom(tz);
      skipCalendars = classroom.calendarIds;
      send('classroom-' + tag, { source: 'classroom', account: account, items: classroom.items });
      Logger.log('Classroom: ' + classroom.courses + ' class(es), ' + (classroom.items.length - classroom.courses) + ' assignment(s).');
    }
  }
  if (BRING_IN_CALENDAR) {
    const cal = readCalendar(tz, account, skipCalendars);
    send('calendar-' + tag, { source: 'calendar', account: account, from: cal.from, to: cal.to, items: cal.items });
    Logger.log('Calendar: ' + cal.items.length + ' event(s).');
  }
}

// ---------------------------------------------------------------------------

function readClassroom(tz) {
  const items = [];
  const calendarIds = [];
  const today = day(new Date(), tz);
  const earliest = day(addDays(new Date(), -30), tz);
  const latest = day(addDays(new Date(), 180), tz);
  const recent = addDays(new Date(), -60).getTime();
  const courses = all(function (pageToken) {
    return Classroom.Courses.list({ studentId: 'me', courseStates: ['ACTIVE'], pageToken: pageToken });
  }, 'courses');
  courses.forEach(function (c) {
    if (c.calendarId) calendarIds.push(c.calendarId);
    let teacher;
    try {
      teacher = Classroom.UserProfiles.get(c.ownerId).name.fullName;
    } catch (e) {}
    items.push(clean({ kind: 'course', ext: safeId(c.id), name: cut(c.name, LIMITS.name) || 'Class', section: cut(c.section, LIMITS.name), room: cut(c.room, 60), teacher: cut(teacher, LIMITS.name) }));
  });
  const work = [];
  courses.forEach(function (c) {
    const mine = {};
    try {
      all(function (pageToken) {
        return Classroom.Courses.CourseWork.StudentSubmissions.list(c.id, '-', { userId: 'me', pageToken: pageToken });
      }, 'studentSubmissions').forEach(function (s) {
        mine[s.courseWorkId] = s;
      });
    } catch (e) {}
    all(function (pageToken) {
      return Classroom.Courses.CourseWork.list(c.id, { pageToken: pageToken, orderBy: 'updateTime desc' });
    }, 'courseWork', 5).forEach(function (w) {
      const due = dueOf(w, tz);
      if (due.date ? due.date < earliest || due.date > latest : new Date(w.creationTime).getTime() < recent) return;
      const s = mine[w.id] || {};
      const state = s.state === 'TURNED_IN' ? 'turned_in' : s.state === 'RETURNED' ? 'returned' : 'open';
      work.push(clean({
        kind: 'work',
        ext: safeId(w.id),
        course: safeId(c.id),
        title: cut(w.title, LIMITS.title) || 'Assignment',
        notes: cut(w.description, LIMITS.notes),
        link: cut(w.alternateLink, LIMITS.link),
        due: due.date,
        dueTime: due.time,
        points: typeof w.maxPoints === 'number' ? w.maxPoints : undefined,
        state: state,
        grade: typeof s.assignedGrade === 'number' ? s.assignedGrade : undefined,
      }));
    });
  });
  // Upcoming work first, so the newest matters most if there's a lot.
  work.sort(function (a, b) {
    return Math.abs(daysBetween(a.due || today, today)) - Math.abs(daysBetween(b.due || today, today));
  });
  return { items: items.concat(work).slice(0, LIMITS.items), courses: courses.length, calendarIds: calendarIds };
}

function dueOf(w, tz) {
  if (!w.dueDate) return {};
  const d = w.dueDate;
  // Classroom stores due dates in UTC; show them in your own time zone.
  if (w.dueTime && (w.dueTime.hours !== undefined || w.dueTime.minutes !== undefined)) {
    const at = new Date(Date.UTC(d.year, d.month - 1, d.day, w.dueTime.hours || 0, w.dueTime.minutes || 0));
    return { date: Utilities.formatDate(at, tz, 'yyyy-MM-dd'), time: Utilities.formatDate(at, tz, 'HH:mm') };
  }
  return { date: d.year + '-' + pad(d.month) + '-' + pad(d.day) };
}

function readCalendar(tz, account, skip) {
  const start = addDays(new Date(), -DAYS_BACK);
  const end = addDays(new Date(), DAYS_AHEAD);
  const items = [];
  CalendarApp.getAllCalendars().forEach(function (cal) {
    if (cal.isHidden() || !cal.isSelected() || skip.indexOf(cal.getId()) >= 0) return;
    cal.getEvents(start, end).forEach(function (e) {
      try {
        if (e.getMyStatus && e.getMyStatus() === CalendarApp.GuestStatus.NO) return;
      } catch (err) {}
      const base = { title: cut(e.getTitle(), LIMITS.title) || '(No title)', location: cut(e.getLocation(), LIMITS.location), notes: cut(stripHtml(e.getDescription()), LIMITS.notes) };
      const id = account + '|' + cal.getId() + '|' + e.getId();
      if (e.isAllDayEvent()) {
        // One entry per day (up to two weeks) for multi-day events.
        // (Stepping from noon keeps daylight-saving changes from shifting the date.)
        const endAt = e.getAllDayEndDate().getTime();
        for (let t = e.getAllDayStartDate().getTime() + 43200000, n = 0; t < endAt && n < 14; t += 86400000, n++) {
          const date = day(new Date(t), tz);
          items.push(clean(Object.assign({ kind: 'event', ext: md5(id + '|' + date).slice(0, 24), date: date }, base)));
        }
      } else {
        const date = day(e.getStartTime(), tz);
        const endDate = day(e.getEndTime(), tz);
        items.push(clean(Object.assign({
          kind: 'event',
          ext: md5(id + '|' + e.getStartTime().getTime()).slice(0, 24),
          date: date,
          start: Utilities.formatDate(e.getStartTime(), tz, 'HH:mm'),
          end: endDate === date ? Utilities.formatDate(e.getEndTime(), tz, 'HH:mm') : undefined,
        }, base)));
      }
    });
  });
  items.sort(function (a, b) {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });
  const kept = items.slice(0, LIMITS.items);
  // If the list was cut short, only claim the range it really covers.
  const to = kept.length < items.length ? kept[kept.length - 1].date : day(end, tz);
  return { items: kept, from: day(start, tz), to: to };
}

// ---------------------------------------------------------------------------

function send(docId, body) {
  const doc = Object.assign({ id: docId, key: VYRO.key, syncedAt: Date.now() }, body);
  const url = 'https://firestore.googleapis.com/v1/projects/' + VYRO.projectId + '/databases/(default)/documents/vyro/owner/inbox/' + docId + '?key=' + VYRO.apiKey;
  const res = UrlFetchApp.fetch(url, { method: 'patch', contentType: 'application/json', payload: JSON.stringify({ fields: toFields(doc) }), muteHttpExceptions: true });
  const code = res.getResponseCode();
  if (code === 403) throw new Error('Vyro refused the update. The sync key was probably reset: copy the script again from Vyro (Settings -> Connections).');
  if (code >= 300) throw new Error('Could not reach Vyro (' + code + '): ' + res.getContentText().slice(0, 300));
}

function toFields(obj) {
  const fields = {};
  Object.keys(obj).forEach(function (k) {
    if (obj[k] !== undefined) fields[k] = toValue(obj[k]);
  });
  return fields;
}

function toValue(v) {
  if (v === null) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  return { stringValue: String(v) };
}

function all(fetchPage, field, maxPages) {
  const out = [];
  let token;
  let pages = 0;
  do {
    const res = fetchPage(token) || {};
    (res[field] || []).forEach(function (x) {
      out.push(x);
    });
    token = res.nextPageToken;
    pages++;
  } while (token && pages < (maxPages || 20));
  return out;
}

function clean(obj) {
  Object.keys(obj).forEach(function (k) {
    if (obj[k] === undefined || obj[k] === '') delete obj[k];
  });
  return obj;
}

function cut(s, max) {
  if (s === undefined || s === null) return undefined;
  s = String(s).trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function stripHtml(s) {
  return s ? String(s).replace(/<br\\s*\\/?>/gi, '\\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&') : s;
}

function safeId(s) {
  s = String(s);
  return /^[A-Za-z0-9_-]{1,40}$/.test(s) ? s : md5(s).slice(0, 24);
}

function md5(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8)
    .map(function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    })
    .join('');
}

function day(d, tz) {
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

function addDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}

function daysBetween(a, b) {
  return (Date.parse(a) - Date.parse(b)) / 86400000;
}

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}
`;
}
