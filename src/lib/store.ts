/**
 * The single source of truth for the UI. Every mutation goes through `put` /
 * `drop`, which validate against the shared schema, update state immediately
 * (optimistic) and queue the change for persistence.
 */
import { create } from 'zustand';
import {
  COLLECTIONS,
  collectionSchemas,
  emptySnapshot,
  type CollectionName,
  type CollectionTypes,
  type DataSnapshot,
  type DayPlan,
  type JournalEntry,
  type Settings,
  type Task,
  type WeeklyReview,
} from '@shared/schema';
import { uid } from './id';
import { nextOccurrence } from './recurrence';
import { todayISO } from './dates';
import { defaultSettings, withDefaults } from './defaults';
import { persistence, type StorageMode, type SyncStatus } from './persistence';
import { toast } from './toast';

type ListCollections = Exclude<CollectionName, 'settings'>;
type Rec<K extends CollectionName> = CollectionTypes[K];
/** What callers provide when creating: everything except bookkeeping fields. */
export type Draft<K extends CollectionName> = Omit<Rec<K>, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

const PREFIX: Record<ListCollections, string> = {
  tasks: 'tsk',
  classes: 'cls',
  projects: 'prj',
  habits: 'hab',
  goals: 'gol',
  events: 'evt',
  reminders: 'rem',
  notes: 'not',
  journal: 'jrn',
  dayPlans: 'day',
  reviews: 'rev',
};

export interface AppState extends Omit<DataSnapshot, 'settings'> {
  settings: Settings;
  ready: boolean;
  loadError: string | null;
  storageMode: StorageMode;
  syncStatus: SyncStatus;
  syncDetail?: string;
  aiAvailable: boolean;

  init(): Promise<void>;
  create<K extends ListCollections>(collection: K, draft: Draft<K>): Rec<K>;
  update<K extends ListCollections>(collection: K, id: string, patch: Partial<Rec<K>>): void;
  remove<K extends ListCollections>(collection: K, id: string): void;
  updateSettings(patch: Partial<Settings>): void;

  addTask(draft: Partial<Task> & { title: string }): Task;
  toggleTask(id: string): void;
  deleteClass(id: string): void;
  deleteProject(id: string): void;
  deleteGoal(id: string): void;
  upsertDayPlan(date: string, patch: Partial<DayPlan>): void;
  upsertJournal(date: string, patch: Partial<JournalEntry>): void;
  upsertReview(weekStart: string, patch: Partial<WeeklyReview>): void;

  snapshot(): DataSnapshot;
  replaceAll(data: DataSnapshot): Promise<{ skipped: number }>;
  removeSampleData(): void;
  /** Add complete records as-is (used by sample data). */
  addRecords(data: Partial<Omit<DataSnapshot, 'settings'>>): void;
}

function validate<K extends CollectionName>(collection: K, record: unknown): Rec<K> | null {
  const parsed = collectionSchemas[collection].safeParse(record);
  if (parsed.success) return parsed.data as Rec<K>;
  const issue = parsed.error.issues[0];
  const field = issue.path.join('.');
  toast.error(`Couldn't save: ${field ? `${field} — ` : ''}${issue.message}`);
  console.error(`[store] invalid ${collection} record`, parsed.error.issues, record);
  return null;
}

/** Strip keys whose value is undefined so optional fields stay absent. */
function clean<T extends object>(obj: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export const useStore = create<AppState>()((set, get) => {
  const persist = (collection: CollectionName, id: string, data: unknown | null) => {
    persistence.enqueue(data === null ? { op: 'delete', collection, id } : { op: 'put', collection, id, data });
  };

  const putRecord = <K extends ListCollections>(collection: K, record: Rec<K>) => {
    set((s) => {
      const list = s[collection] as Rec<K>[];
      const i = list.findIndex((r) => r.id === record.id);
      const next = i >= 0 ? list.map((r, j) => (j === i ? record : r)) : [...list, record];
      return { [collection]: next } as unknown as Partial<AppState>;
    });
    persist(collection, record.id, record);
  };

  return {
    ...(emptySnapshot() as Omit<DataSnapshot, 'settings'>),
    settings: defaultSettings(),
    ready: false,
    loadError: null,
    storageMode: 'local',
    syncStatus: 'saved',
    aiAvailable: false,

    async init() {
      persistence.setListeners(
        (status, detail) => set({ syncStatus: status, syncDetail: detail }),
        (errors) => toast.error(`${errors.length} change(s) were rejected by the server: ${errors[0].message}`),
        // Changes made on another device (Firebase mode): merge them in without re-saving.
        ({ collection, upserts, deletes }) => {
          const schema = collectionSchemas[collection];
          const valid = upserts.filter((r) => schema.safeParse(r).success);
          if (collection === 'settings') {
            const next = valid.find((r) => r.id === 'settings') as Settings | undefined;
            if (next) set({ settings: withDefaults(next) });
            return;
          }
          set((s) => {
            const incoming = new Map(valid.map((r) => [r.id, r]));
            const gone = new Set(deletes);
            const current = s[collection] as { id: string }[];
            // Replace in place so list order stays stable; append records that are new here.
            const next = current.filter((r) => !gone.has(r.id)).map((r) => incoming.get(r.id) ?? r);
            const known = new Set(current.map((r) => r.id));
            for (const r of valid) if (!known.has(r.id)) next.push(r);
            return { [collection]: next } as unknown as Partial<AppState>;
          });
        },
      );
      persistence.bindSnapshot(() => get().snapshot());
      // Signed out elsewhere or password reset: show the "couldn't load" screen with Sign out.
      persistence.onAccessLost = (message) => set({ loadError: message });
      try {
        const data = await persistence.boot();
        const valid = emptySnapshot() as Record<string, unknown[]>;
        for (const c of COLLECTIONS) {
          valid[c] = (data[c] as unknown[]).filter((r) => collectionSchemas[c].safeParse(r).success);
        }
        const settings = withDefaults((valid.settings as Settings[])[0]);
        set({
          ...(valid as unknown as Omit<DataSnapshot, 'settings'>),
          settings,
          ready: true,
          storageMode: persistence.mode,
          aiAvailable: persistence.health?.ai ?? false,
        });
      } catch (err) {
        set({ loadError: err instanceof Error ? err.message : String(err), ready: true });
      }
    },

    create(collection, draft) {
      const now = Date.now();
      const record = clean({ ...draft, id: draft.id ?? uid(PREFIX[collection]), createdAt: now, updatedAt: now });
      const valid = validate(collection, record);
      if (valid) putRecord(collection, valid);
      return (valid ?? record) as Rec<typeof collection>;
    },

    update(collection, id, patch) {
      const current = (get()[collection] as Rec<typeof collection>[]).find((r) => r.id === id);
      if (!current) return;
      const merged = { ...current, ...patch, id, updatedAt: Date.now() };
      // Explicit `undefined` in a patch clears an optional field.
      for (const [k, v] of Object.entries(patch)) if (v === undefined) delete (merged as Record<string, unknown>)[k];
      const valid = validate(collection, merged);
      if (valid) putRecord(collection, valid);
    },

    remove(collection, id) {
      set((s) => ({ [collection]: (s[collection] as { id: string }[]).filter((r) => r.id !== id) }) as unknown as Partial<AppState>);
      persist(collection, id, null);
      // Day plans reference tasks by id — drop dangling references.
      if (collection === 'tasks') {
        for (const p of get().dayPlans) {
          if (!p.topTaskIds.includes(id) && !p.timeBlocks.some((b) => b.taskId === id)) continue;
          get().update('dayPlans', p.id, { topTaskIds: p.topTaskIds.filter((t) => t !== id), timeBlocks: p.timeBlocks.filter((b) => b.taskId !== id) });
        }
      }
    },

    updateSettings(patch) {
      const merged = { ...get().settings, ...patch, updatedAt: Date.now() };
      const valid = validate('settings', merged);
      if (!valid) return;
      set({ settings: valid });
      persist('settings', 'settings', valid);
    },

    addTask(draft) {
      const { title, ...rest } = draft;
      return get().create('tasks', {
        status: 'todo',
        priority: 'medium',
        tags: [],
        archived: false,
        ...rest,
        title: title.trim(),
      });
    },

    toggleTask(id) {
      const task = get().tasks.find((t) => t.id === id);
      if (!task) return;
      if (task.status === 'done') {
        get().update('tasks', id, { status: 'todo', completedAt: undefined });
        return;
      }
      get().update('tasks', id, { status: 'done', completedAt: Date.now() });
      // Recurring: completing an instance schedules the next one (history is kept).
      if (task.recurrence) {
        const from = task.dueDate ?? todayISO();
        const next = nextOccurrence(from, task.recurrence);
        if (next) {
          const { id: _old, createdAt: _c, updatedAt: _u, completedAt: _d, ...copy } = task;
          void _old, _c, _u, _d;
          get().create('tasks', {
            ...copy,
            status: 'todo',
            dueDate: next,
            pointsEarned: undefined,
          });
          toast.info(`Next "${task.title}" scheduled for ${next}`);
        }
      }
    },

    deleteClass(id) {
      for (const t of get().tasks.filter((t) => t.classId === id)) get().remove('tasks', t.id);
      for (const e of get().events.filter((e) => e.classId === id)) get().update('events', e.id, { classId: undefined });
      for (const n of get().notes.filter((n) => n.links.some((l) => l.id === id)))
        get().update('notes', n.id, { links: n.links.filter((l) => l.id !== id) });
      get().remove('classes', id);
    },

    deleteProject(id) {
      for (const t of get().tasks.filter((t) => t.projectId === id)) get().remove('tasks', t.id);
      for (const e of get().events.filter((e) => e.projectId === id)) get().update('events', e.id, { projectId: undefined });
      for (const n of get().notes.filter((n) => n.links.some((l) => l.id === id)))
        get().update('notes', n.id, { links: n.links.filter((l) => l.id !== id) });
      get().remove('projects', id);
    },

    deleteGoal(id) {
      for (const t of get().tasks.filter((t) => t.goalId === id)) get().update('tasks', t.id, { goalId: undefined });
      for (const n of get().notes.filter((n) => n.links.some((l) => l.id === id)))
        get().update('notes', n.id, { links: n.links.filter((l) => l.id !== id) });
      get().remove('goals', id);
    },

    upsertDayPlan(date, patch) {
      const existing = get().dayPlans.find((p) => p.date === date);
      if (existing) get().update('dayPlans', existing.id, patch);
      else get().create('dayPlans', { id: `day_${date}`, date, topTaskIds: [], timeBlocks: [], ...patch });
    },

    upsertJournal(date, patch) {
      const existing = get().journal.find((j) => j.date === date);
      if (existing) get().update('journal', existing.id, patch);
      else get().create('journal', { id: `jrn_${date}`, date, content: '', ...patch });
    },

    upsertReview(weekStart, patch) {
      const existing = get().reviews.find((r) => r.weekStart === weekStart);
      if (existing) get().update('reviews', existing.id, patch);
      else get().create('reviews', { id: `rev_${weekStart}`, weekStart, nextWeekPriorities: [], ...patch });
    },

    snapshot() {
      const s = get();
      const out = emptySnapshot() as Record<string, unknown[]>;
      for (const c of COLLECTIONS) out[c] = c === 'settings' ? [s.settings] : (s[c as ListCollections] as unknown[]);
      return out as unknown as DataSnapshot;
    },

    async replaceAll(data) {
      const result = await persistence.replaceAll(data);
      set({
        ...(Object.fromEntries(COLLECTIONS.filter((c) => c !== 'settings').map((c) => [c, data[c]])) as unknown as Omit<DataSnapshot, 'settings'>),
        settings: withDefaults(data.settings[0]),
        syncStatus: 'saved',
      });
      return result;
    },

    addRecords(data) {
      for (const [c, list] of Object.entries(data) as [ListCollections, { id: string }[]][]) {
        for (const rec of list ?? []) {
          const valid = validate(c, rec);
          if (valid) putRecord(c, valid as Rec<typeof c>);
        }
      }
    },

    removeSampleData() {
      const s = get();
      for (const c of COLLECTIONS) {
        if (c === 'settings') continue;
        for (const r of s[c] as { id: string; sample?: boolean }[]) if (r.sample) get().remove(c, r.id);
      }
      // Sample marking periods / past terms are flagged by id prefix.
      const st = get().settings;
      get().updateSettings({
        markingPeriods: st.markingPeriods.filter((p) => !p.id.startsWith('sample_')),
        pastTerms: st.pastTerms.filter((p) => !p.id.startsWith('sample_')),
      });
    },
  };
});

// ---------------------------------------------------------------------------
// Convenience selectors
// ---------------------------------------------------------------------------

export const useSettings = () => useStore((s) => s.settings);
export const hasSampleData = (s: AppState) =>
  COLLECTIONS.some((c) => c !== 'settings' && (s[c as ListCollections] as { sample?: boolean }[]).some((r) => r.sample));
