/**
 * The Vyro data model. Shared by the browser and the server so both sides
 * validate records against exactly the same rules.
 *
 * Design rule: every piece of information is stored once. An assignment is a
 * Task with a `classId`; a business task is a Task with a `projectId`. The
 * School, Business, Calendar and Dashboard views are all just filtered views of
 * the same `tasks` collection.
 */
import { z } from 'zod';

const id = z.string().min(1).max(64);
/** Calendar date, `YYYY-MM-DD`, always in the user's local time. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date');
/** Wall-clock time, `HH:mm` (24h). */
export const isoTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected an HH:mm time');
const text = (max: number) => z.string().max(max);
const timestamp = z.number().int().nonnegative();

const base = {
  id,
  createdAt: timestamp,
  updatedAt: timestamp,
  /** Marks records created by "Load sample data" so they can be removed in one click. */
  sample: z.boolean().optional(),
};

// ---------------------------------------------------------------------------
// Tasks (also: assignments, business tasks, study sessions)
// ---------------------------------------------------------------------------

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export const ASSIGNMENT_TYPES = [
  'homework',
  'quiz',
  'test',
  'project',
  'essay',
  'lab',
  'study',
  'other',
] as const;

export const recurrenceSchema = z.object({
  freq: z.enum(['daily', 'weekly', 'monthly']),
  interval: z.number().int().min(1).max(365),
  /** For weekly recurrence: 0 = Sunday … 6 = Saturday. */
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  until: isoDate.optional(),
});

export const taskSchema = z.object({
  ...base,
  title: text(300).min(1, 'Title is required'),
  notes: text(20000).optional(),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(PRIORITIES),
  dueDate: isoDate.optional(),
  dueTime: isoTime.optional(),
  /** Optional time estimate used by the day planner. */
  estimateMinutes: z.number().int().min(0).max(24 * 60).optional(),
  category: text(60).optional(),
  tags: z.array(text(40)).max(30),
  recurrence: recurrenceSchema.optional(),
  /** Links. A task may belong to a class (assignment), a project, and/or a goal. */
  classId: id.optional(),
  projectId: id.optional(),
  milestoneId: id.optional(),
  goalId: id.optional(),
  /** Assignment-only fields. */
  assignmentType: z.enum(ASSIGNMENT_TYPES).optional(),
  gradeCategoryId: id.optional(),
  pointsEarned: z.number().min(0).max(100000).optional(),
  pointsPossible: z.number().min(0).max(100000).optional(),
  /** Excused / dropped assignments don't count toward the average. */
  excused: z.boolean().optional(),
  completedAt: timestamp.optional(),
  archived: z.boolean(),
  order: z.number().optional(),
});
export type Task = z.infer<typeof taskSchema>;
export type Priority = Task['priority'];
export type TaskStatus = Task['status'];
export type AssignmentType = NonNullable<Task['assignmentType']>;
export type Recurrence = z.infer<typeof recurrenceSchema>;

// ---------------------------------------------------------------------------
// School
// ---------------------------------------------------------------------------

export const gradeCategorySchema = z.object({
  id,
  name: text(60).min(1),
  /** Percentage weight, 0–100. Weights across a class should total 100. */
  weight: z.number().min(0).max(100),
});
export type GradeCategory = z.infer<typeof gradeCategorySchema>;

export const classSchema = z.object({
  ...base,
  name: text(120).min(1, 'Class name is required'),
  teacher: text(120).optional(),
  room: text(60).optional(),
  schedule: text(120).optional(),
  color: text(20),
  level: z.enum(['regular', 'honors', 'ap']),
  credits: z.number().min(0).max(10),
  /** Empty = grade is total points earned / total points possible. */
  categories: z.array(gradeCategorySchema).max(20),
  /** Grades you already know (e.g. from the school portal), per marking period. */
  manualGrades: z.record(z.string(), z.number().min(0).max(200)).optional(),
  targetGrade: z.number().min(0).max(200).optional(),
  archived: z.boolean(),
});
export type SchoolClass = z.infer<typeof classSchema>;

export const markingPeriodSchema = z.object({
  id,
  name: text(60).min(1),
  start: isoDate,
  end: isoDate,
});
export type MarkingPeriod = z.infer<typeof markingPeriodSchema>;

export const pastTermSchema = z.object({
  id,
  name: text(60).min(1),
  gpa: z.number().min(0).max(6),
  credits: z.number().min(0).max(200),
});
export type PastTerm = z.infer<typeof pastTermSchema>;

// ---------------------------------------------------------------------------
// Business
// ---------------------------------------------------------------------------

export const PROJECT_STATUSES = ['idea', 'planning', 'active', 'paused', 'completed'] as const;

export const milestoneSchema = z.object({
  id,
  title: text(200).min(1),
  dueDate: isoDate.optional(),
  done: z.boolean(),
});
export type Milestone = z.infer<typeof milestoneSchema>;

export const contactSchema = z.object({
  id,
  name: text(120).min(1),
  role: text(120).optional(),
  email: text(200).optional(),
  phone: text(60).optional(),
  notes: text(2000).optional(),
});
export type Contact = z.infer<typeof contactSchema>;

export const transactionSchema = z.object({
  id,
  date: isoDate,
  type: z.enum(['revenue', 'expense']),
  amount: z.number().min(0).max(100_000_000),
  description: text(200).min(1),
  category: text(60).optional(),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const projectSchema = z.object({
  ...base,
  name: text(120).min(1, 'Project name is required'),
  description: text(5000).optional(),
  status: z.enum(PROJECT_STATUSES),
  color: text(20),
  startDate: isoDate.optional(),
  deadline: isoDate.optional(),
  /** Free-text next action, used when no open task is a better candidate. */
  nextAction: text(300).optional(),
  milestones: z.array(milestoneSchema).max(200),
  contacts: z.array(contactSchema).max(200),
  trackFinances: z.boolean(),
  transactions: z.array(transactionSchema).max(5000),
  archived: z.boolean(),
});
export type Project = z.infer<typeof projectSchema>;
export type ProjectStatus = Project['status'];

// ---------------------------------------------------------------------------
// Habits & goals
// ---------------------------------------------------------------------------

export const habitSchema = z.object({
  ...base,
  name: text(120).min(1, 'Habit name is required'),
  description: text(1000).optional(),
  icon: text(16).optional(),
  color: text(20),
  frequency: z.enum(['daily', 'weekly']),
  /** Daily habits: which weekdays it applies to (0 = Sunday). Empty/absent = every day. */
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  /** Weekly habits: completions needed per week. */
  targetPerWeek: z.number().int().min(1).max(7),
  /** Dates (YYYY-MM-DD) the habit was completed. */
  completions: z.array(isoDate).max(20000),
  archived: z.boolean(),
  order: z.number(),
});
export type Habit = z.infer<typeof habitSchema>;

export const goalSchema = z.object({
  ...base,
  title: text(200).min(1, 'Goal title is required'),
  description: text(5000).optional(),
  horizon: z.enum(['weekly', 'short', 'long']),
  category: text(60).optional(),
  /** Weekly goals belong to the week starting on this date (Monday). */
  weekStart: isoDate.optional(),
  targetDate: isoDate.optional(),
  /**
   * How progress is measured:
   *  - manual: you set a percentage
   *  - numeric: current / target (e.g. "$500 / $2000 saved")
   *  - milestones: checked milestones / all milestones
   *  - tasks: completed linked tasks / all linked tasks
   */
  progressMode: z.enum(['manual', 'numeric', 'milestones', 'tasks']),
  manualProgress: z.number().min(0).max(100).optional(),
  current: z.number().min(-1e9).max(1e9).optional(),
  target: z.number().min(-1e9).max(1e9).optional(),
  unit: text(30).optional(),
  milestones: z.array(milestoneSchema).max(200),
  status: z.enum(['active', 'achieved', 'dropped']),
});
export type Goal = z.infer<typeof goalSchema>;

// ---------------------------------------------------------------------------
// Calendar events & reminders
// ---------------------------------------------------------------------------

export const eventSchema = z.object({
  ...base,
  title: text(200).min(1, 'Event title is required'),
  date: isoDate,
  startTime: isoTime.optional(),
  endTime: isoTime.optional(),
  location: text(200).optional(),
  notes: text(5000).optional(),
  color: text(20).optional(),
  classId: id.optional(),
  projectId: id.optional(),
  recurrence: recurrenceSchema.optional(),
});
export type CalendarEvent = z.infer<typeof eventSchema>;

export const reminderSchema = z.object({
  ...base,
  title: text(300).min(1, 'Reminder text is required'),
  date: isoDate.optional(),
  /** Time of day to notify (local). Without one, the default reminder time is used. */
  time: isoTime.optional(),
  important: z.boolean().optional(),
  done: z.boolean(),
});
export type Reminder = z.infer<typeof reminderSchema>;

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export const noteLinkSchema = z.object({
  type: z.enum(['project', 'class', 'goal']),
  id,
});
export type NoteLink = z.infer<typeof noteLinkSchema>;

export const noteSchema = z.object({
  ...base,
  title: text(200),
  content: text(200000),
  folder: text(60),
  tags: z.array(text(40)).max(30),
  pinned: z.boolean(),
  isTemplate: z.boolean(),
  links: z.array(noteLinkSchema).max(50),
  archived: z.boolean(),
});
export type Note = z.infer<typeof noteSchema>;

// ---------------------------------------------------------------------------
// Journal, daily planning, weekly review
// ---------------------------------------------------------------------------

export const journalSchema = z.object({
  ...base,
  date: isoDate,
  mood: z.number().int().min(1).max(5).optional(),
  energy: z.number().int().min(1).max(5).optional(),
  content: text(50000),
  gratitude: text(5000).optional(),
  wins: text(5000).optional(),
});
export type JournalEntry = z.infer<typeof journalSchema>;

export const timeBlockSchema = z.object({
  id,
  start: isoTime,
  end: isoTime,
  label: text(200).min(1),
  taskId: id.optional(),
});
export type TimeBlock = z.infer<typeof timeBlockSchema>;

/** The plan for one day. Its id is the date itself. */
export const dayPlanSchema = z.object({
  ...base,
  date: isoDate,
  intention: text(500).optional(),
  /** Up to three task ids — "Top 3 priorities". */
  topTaskIds: z.array(id).max(3),
  timeBlocks: z.array(timeBlockSchema).max(48),
  notes: text(10000).optional(),
});
export type DayPlan = z.infer<typeof dayPlanSchema>;

/** A weekly review. Its id is the Monday the week starts on. */
export const weeklyReviewSchema = z.object({
  ...base,
  weekStart: isoDate,
  wentWell: text(10000).optional(),
  challenges: text(10000).optional(),
  nextWeekPriorities: z.array(text(300)).max(10),
  rating: z.number().int().min(1).max(5).optional(),
  completedAt: timestamp.optional(),
});
export type WeeklyReview = z.infer<typeof weeklyReviewSchema>;

// ---------------------------------------------------------------------------
// Settings (a single record with id "settings")
// ---------------------------------------------------------------------------

export const WIDGET_IDS = [
  'briefing',
  'schedule',
  'priorities',
  'tasks',
  'habits',
  'goals',
  'grades',
  'projects',
  'deadlines',
  'reminders',
  'week',
  'quicknote',
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export const widgetConfigSchema = z.object({
  id: z.enum(WIDGET_IDS),
  visible: z.boolean(),
  size: z.enum(['sm', 'md', 'lg']),
});
export type WidgetConfig = z.infer<typeof widgetConfigSchema>;

export const notificationPrefsSchema = z.object({
  /** Master switch for all reminders and alerts. */
  enabled: z.boolean(),
  reminders: z.boolean(),
  /** When a reminder has a date but no time. */
  defaultReminderTime: isoTime,
  /** Minutes before an event starts; null = off. */
  eventLeadMinutes: z.number().int().min(0).max(1440).nullable(),
  /** Minutes before a task with a due time; null = off. */
  taskLeadMinutes: z.number().int().min(0).max(1440).nullable(),
  /** Morning summary of what's due; null = off. */
  digestTime: isoTime.nullable(),
  /** Evening nudge for unfinished daily habits; null = off. */
  habitNudgeTime: isoTime.nullable(),
  /** Day-before preview of everything on tomorrow's calendar; null = off. Missing = the default (5:30 PM). */
  tomorrowTime: isoTime.nullable().optional(),
  /** Sunday-evening overview of the week ahead; null = off. Missing = the default (6 PM). */
  weekAheadTime: isoTime.nullable().optional(),
  /** Daily study reminder in the days before a test or quiz; null = off. Missing = the default (4 PM). */
  studyTime: isoTime.nullable().optional(),
  /** How many days before a test or quiz the study reminders start (1–7, default 3). */
  studyDaysBefore: z.number().int().min(1).max(7).optional(),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const settingsSchema = z.object({
  ...base,
  name: text(60),
  theme: z.enum(['dark', 'light', 'system']),
  accent: z.enum(['blue', 'green', 'violet', 'amber']),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  onboarded: z.boolean(),
  widgets: z.array(widgetConfigSchema).max(30),
  taskCategories: z.array(text(60)).max(50),
  noteFolders: z.array(text(60)).max(100),
  markingPeriods: z.array(markingPeriodSchema).max(12),
  gpaScale: z.enum(['unweighted', 'weighted']),
  gpaGoal: z.number().min(0).max(6).optional(),
  pastTerms: z.array(pastTermSchema).max(40),
  /** Upcoming-deadline alert window in days. */
  alertDays: z.number().int().min(1).max(30),
  notifications: notificationPrefsSchema.optional(),
  /** IANA time zone (e.g. "America/New_York"), so reminders can be sent at your local time. */
  timeZone: text(64).optional(),
});
export type Settings = z.infer<typeof settingsSchema>;

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export const collectionSchemas = {
  tasks: taskSchema,
  classes: classSchema,
  projects: projectSchema,
  habits: habitSchema,
  goals: goalSchema,
  events: eventSchema,
  reminders: reminderSchema,
  notes: noteSchema,
  journal: journalSchema,
  dayPlans: dayPlanSchema,
  reviews: weeklyReviewSchema,
  settings: settingsSchema,
} as const;

export type CollectionName = keyof typeof collectionSchemas;
export const COLLECTIONS = Object.keys(collectionSchemas) as CollectionName[];

export interface CollectionTypes {
  tasks: Task;
  classes: SchoolClass;
  projects: Project;
  habits: Habit;
  goals: Goal;
  events: CalendarEvent;
  reminders: Reminder;
  notes: Note;
  journal: JournalEntry;
  dayPlans: DayPlan;
  reviews: WeeklyReview;
  settings: Settings;
}

export type DataSnapshot = { [K in CollectionName]: CollectionTypes[K][] };

export function isCollection(name: string): name is CollectionName {
  return Object.prototype.hasOwnProperty.call(collectionSchemas, name);
}

/** A single change sent from the browser to the server. */
export const syncOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('put'), collection: z.string(), id, data: z.unknown() }),
  z.object({ op: z.literal('delete'), collection: z.string(), id }),
]);
export type SyncOp = z.infer<typeof syncOpSchema>;

export const BACKUP_FORMAT = 'vyro-backup';
/** Backups made before the app was renamed to Vyro still import. */
const LEGACY_BACKUP_FORMATS: unknown[] = ['life-os-backup'];
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  data: DataSnapshot;
}

/**
 * Validate an imported backup. Records that fail validation are reported
 * rather than silently dropped, so the user can decide what to do.
 */
export function validateBackup(input: unknown):
  | { ok: true; data: DataSnapshot; skipped: number }
  | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'File is not a JSON object.' };
  const obj = input as Record<string, unknown>;
  if ((obj.format !== BACKUP_FORMAT && !LEGACY_BACKUP_FORMATS.includes(obj.format)) || typeof obj.data !== 'object' || !obj.data) {
    return { ok: false, error: 'This does not look like a Vyro backup file.' };
  }
  const raw = obj.data as Record<string, unknown>;
  const data = {} as DataSnapshot;
  let skipped = 0;
  for (const name of COLLECTIONS) {
    const list = Array.isArray(raw[name]) ? (raw[name] as unknown[]) : [];
    const schema = collectionSchemas[name];
    const valid: unknown[] = [];
    for (const item of list) {
      const parsed = schema.safeParse(item);
      if (parsed.success) valid.push(parsed.data);
      else skipped++;
    }
    (data as Record<string, unknown[]>)[name] = valid;
  }
  return { ok: true, data, skipped };
}

export function emptySnapshot(): DataSnapshot {
  return Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as DataSnapshot;
}
