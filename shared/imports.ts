/**
 * Bringing in Google Classroom and Google Calendar.
 *
 * A small Google Apps Script, run from the user's own Google account (see
 * src/lib/syncScript.ts), writes what it finds to vyro/owner/inbox/{docId}.
 * Whichever device has Vyro open then merges the inbox into normal records
 * with `planImport`. Imported records get deterministic ids, so every device
 * computes the same result and re-syncs update instead of duplicating.
 *
 * `state` remembers what was imported (record id → "inboxDocId|fingerprint").
 * It lets a re-sync tell "changed in Google" (fingerprint differs → update)
 * from "you deleted it in Vyro" (remembered but missing → leave it deleted).
 */
import { z } from 'zod';
import { isoDate, isoTime, type AssignmentType, type CalendarEvent, type Priority, type SchoolClass, type Task } from './schema.ts';

export const INBOX_SOURCES = ['classroom', 'calendar'] as const;
export type InboxSource = (typeof INBOX_SOURCES)[number];

/** Field limits. The sync script trims to these before sending. */
export const IMPORT_LIMITS = { items: 600, name: 120, title: 200, notes: 2000, link: 500, location: 200 } as const;
const L = IMPORT_LIMITS;

const ext = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
const str = (max: number) => z.string().max(max);

const courseItem = z.object({
  kind: z.literal('course'),
  ext,
  name: str(L.name).min(1),
  section: str(L.name).optional(),
  room: str(60).optional(),
  teacher: str(L.name).optional(),
});
const workItem = z.object({
  kind: z.literal('work'),
  ext,
  course: ext,
  title: str(L.title).min(1),
  notes: str(L.notes).optional(),
  link: str(L.link).optional(),
  due: isoDate.optional(),
  dueTime: isoTime.optional(),
  points: z.number().min(0).max(100000).optional(),
  state: z.enum(['open', 'turned_in', 'returned']).optional(),
  grade: z.number().min(0).max(100000).optional(),
});
const eventItem = z.object({
  kind: z.literal('event'),
  ext,
  title: str(L.title).min(1),
  date: isoDate,
  start: isoTime.optional(),
  end: isoTime.optional(),
  location: str(L.location).optional(),
  notes: str(L.notes).optional(),
});
export const inboxItemSchema = z.discriminatedUnion('kind', [courseItem, workItem, eventItem]);
export type InboxItem = z.infer<typeof inboxItemSchema>;
export type CourseItem = z.infer<typeof courseItem>;
export type WorkItem = z.infer<typeof workItem>;
export type EventItem = z.infer<typeof eventItem>;

/** One sync from one Google account. Items are checked one by one, so a bad item is skipped, not fatal. */
export const inboxDocSchema = z.object({
  id: z.string().min(1).max(64),
  source: z.enum(INBOX_SOURCES),
  account: str(200).optional(),
  syncedAt: z.number(),
  /** The date range the sync covered; imported events in it that Google no longer has are removed. */
  from: isoDate.optional(),
  to: isoDate.optional(),
  items: z.array(z.unknown()).max(L.items),
});
export type InboxDoc = z.infer<typeof inboxDocSchema>;

export type ImportState = Record<string, string>;

export interface ImportPlan {
  puts: ({ collection: 'classes'; record: SchoolClass } | { collection: 'tasks'; record: Task } | { collection: 'events'; record: CalendarEvent })[];
  deletes: { collection: 'events'; id: string }[];
  state: ImportState;
  stateChanged: boolean;
}

export const importedId = {
  course: (e: string) => `gc_${e}`,
  work: (e: string) => `gcw_${e}`,
  event: (e: string) => `gce_${e}`,
};
export const isImported = (id: string) => /^gc[we]?_/.test(id);

/** Stable fingerprint of an item (key order doesn't matter). */
function fingerprint(item: object): string {
  return JSON.stringify(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : 1)));
}

function clean<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export function guessAssignmentType(title: string): AssignmentType {
  if (/\b(test|exam|midterm|final)s?\b/i.test(title)) return 'test';
  if (/\bquiz(zes)?\b/i.test(title)) return 'quiz';
  if (/\bprojects?\b/i.test(title)) return 'project';
  if (/\b(essay|paper)s?\b/i.test(title)) return 'essay';
  if (/\blabs?\b/i.test(title)) return 'lab';
  return 'homework';
}

const workNotes = (w: WorkItem) => [w.notes, w.link && `Open in Google Classroom: ${w.link}`].filter(Boolean).join('\n\n') || undefined;
const isTurnedIn = (w: WorkItem) => w.state === 'turned_in' || w.state === 'returned';
const hasPoints = (n: number | undefined) => (n && n > 0 ? n : undefined);

export function parseInbox(raw: unknown[]): { doc: InboxDoc; items: InboxItem[] }[] {
  const out: { doc: InboxDoc; items: InboxItem[] }[] = [];
  for (const r of raw) {
    const parsed = inboxDocSchema.safeParse(r);
    if (!parsed.success) continue;
    const items: InboxItem[] = [];
    for (const it of parsed.data.items) {
      const p = inboxItemSchema.safeParse(it);
      if (p.success) items.push(p.data);
    }
    out.push({ doc: parsed.data, items });
  }
  return out.sort((a, b) => (a.doc.id < b.doc.id ? -1 : 1));
}

export function planImport(
  inbox: { doc: InboxDoc; items: InboxItem[] }[],
  data: { classes: SchoolClass[]; tasks: Task[]; events: CalendarEvent[] },
  state: ImportState,
  opts: { now: number; colors: string[] },
): ImportPlan {
  const { now } = opts;
  const next: ImportState = { ...state };
  const puts: ImportPlan['puts'] = [];
  const deletes: ImportPlan['deletes'] = [];
  const classes = new Map(data.classes.map((c) => [c.id, c]));
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const events = new Map(data.events.map((e) => [e.id, e]));
  const fpOf = (id: string) => state[id]?.slice(state[id].indexOf('|') + 1);

  for (const { doc, items } of inbox) {
    const tag = (item: object) => `${doc.id}|${fingerprint(item)}`;

    for (const c of items.filter((i): i is CourseItem => i.kind === 'course')) {
      const id = importedId.course(c.ext);
      if (!classes.has(id)) {
        // Remembered but gone: you deleted this class in Vyro, so don't bring it back.
        if (state[id]) continue;
        const record: SchoolClass = clean({
          id,
          createdAt: now,
          updatedAt: now,
          name: c.name,
          teacher: c.teacher,
          room: c.room,
          schedule: c.section,
          color: opts.colors[classes.size % opts.colors.length] ?? '#4f8cff',
          level: 'regular' as const,
          credits: 1,
          categories: [],
          archived: false,
        });
        classes.set(id, record);
        puts.push({ collection: 'classes', record });
      }
      // After the first import the class is yours to edit; Classroom doesn't overwrite it.
      next[id] = tag(c);
    }

    for (const w of items.filter((i): i is WorkItem => i.kind === 'work')) {
      const id = importedId.work(w.ext);
      const classId = importedId.course(w.course);
      const existing = tasks.get(id);
      if (!existing) {
        if (state[id] || !classes.has(classId)) continue;
        const done = isTurnedIn(w);
        const type = guessAssignmentType(w.title);
        const record: Task = clean({
          id,
          createdAt: now,
          updatedAt: now,
          title: w.title,
          notes: workNotes(w),
          status: done ? ('done' as const) : ('todo' as const),
          completedAt: done ? now : undefined,
          priority: (type === 'test' ? 'high' : 'medium') as Priority,
          dueDate: w.due,
          dueTime: w.due ? w.dueTime : undefined,
          tags: ['classroom'],
          classId,
          assignmentType: type,
          pointsPossible: hasPoints(w.points),
          pointsEarned: w.grade,
          archived: false,
        });
        tasks.set(id, record);
        puts.push({ collection: 'tasks', record });
      } else if (fpOf(id) !== fingerprint(w)) {
        // Changed in Classroom: refresh what Classroom owns, keep your own edits (notes, priority, tags…).
        const record: Task = clean({
          ...existing,
          updatedAt: now,
          title: w.title,
          dueDate: w.due,
          dueTime: w.due ? w.dueTime : undefined,
          pointsPossible: hasPoints(w.points) ?? existing.pointsPossible,
          pointsEarned: w.grade ?? existing.pointsEarned,
          ...(isTurnedIn(w) && existing.status !== 'done' ? { status: 'done' as const, completedAt: now } : {}),
        });
        tasks.set(id, record);
        puts.push({ collection: 'tasks', record });
      }
      next[id] = tag(w);
    }

    const seen = new Set<string>();
    for (const e of items.filter((i): i is EventItem => i.kind === 'event')) {
      const id = importedId.event(e.ext);
      seen.add(id);
      const existing = events.get(id);
      if (!existing && state[id]) {
        next[id] = tag(e);
        continue;
      }
      if (!existing || fpOf(id) !== fingerprint(e)) {
        // Google Calendar owns imported events; your colour and links are kept.
        const record: CalendarEvent = clean({
          ...existing,
          id,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          title: e.title,
          date: e.date,
          startTime: e.start,
          endTime: e.start ? e.end : undefined,
          location: e.location,
          notes: e.notes,
        });
        events.set(id, record);
        puts.push({ collection: 'events', record });
      }
      next[id] = tag(e);
    }
    // Events this account used to send but no longer does: deleted or moved out of range in Google.
    if (doc.source === 'calendar') {
      for (const [id, val] of Object.entries(state)) {
        if (!val.startsWith(`${doc.id}|`) || !id.startsWith('gce_') || seen.has(id)) continue;
        const ev = events.get(id);
        if (ev && doc.from && doc.to && ev.date >= doc.from && ev.date <= doc.to) deletes.push({ collection: 'events', id });
        delete next[id];
      }
    }
  }

  const stateChanged = JSON.stringify(Object.entries(next).sort()) !== JSON.stringify(Object.entries(state).sort());
  return { puts, deletes, state: next, stateChanged };
}
