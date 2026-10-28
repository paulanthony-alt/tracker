/**
 * Merges what the Google sync script sent (Classroom and Calendar) into your
 * records whenever it changes, on whichever device has Vyro open. The merge
 * itself lives in shared/imports.ts; this only wires it to Firebase and the store.
 */
import { parseInbox, planImport, type ImportPlan } from '@shared/imports';
import type { CollectionName, DataSnapshot } from '@shared/schema';
import { COLORS } from './defaults';
import { useStore } from './store';
import { toast } from './toast';
import { plural } from './util';

export function startImports(): () => void {
  if (useStore.getState().storageMode !== 'firebase') return () => {};
  let latest: unknown[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let again = false;
  let stopped = false;
  let stop: (() => void) | undefined;

  const run = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      const inbox = parseInbox(latest);
      if (!inbox.length) return;
      const fb = await import('./firebase');
      const state = await fb.readImportState();
      const s = useStore.getState();
      const plan = planImport(inbox, { classes: s.classes, tasks: s.tasks, events: s.events }, state, { now: Date.now(), colors: COLORS });
      apply(plan);
      if (plan.stateChanged) await fb.writeImportState(plan.state);
    } catch (err) {
      console.error('[imports] could not bring in Google data', err);
    } finally {
      running = false;
      if (again && !stopped) {
        again = false;
        void run();
      }
    }
  };

  void import('./firebase').then((fb) => {
    if (stopped) return;
    stop = fb.watchInbox((docs) => {
      latest = docs;
      clearTimeout(timer);
      // Let the first burst of snapshots settle before merging.
      timer = setTimeout(() => void run(), 1200);
    });
  });

  return () => {
    stopped = true;
    stop?.();
    clearTimeout(timer);
  };
}

function apply(plan: ImportPlan) {
  const s = useStore.getState();
  const known = new Set([...s.classes, ...s.tasks, ...s.events].map((r) => r.id));
  const byCollection: Partial<Record<CollectionName, unknown[]>> = {};
  for (const p of plan.puts) (byCollection[p.collection] ??= []).push(p.record);
  if (plan.puts.length) s.addRecords(byCollection as Partial<Omit<DataSnapshot, 'settings'>>);
  for (const d of plan.deletes) s.remove(d.collection, d.id);

  const added = plan.puts.filter((p) => !known.has(p.record.id));
  const count = (c: CollectionName) => added.filter((p) => p.collection === c).length;
  const parts = [count('classes') && plural(count('classes'), 'class', 'classes'), count('tasks') && plural(count('tasks'), 'assignment'), count('events') && plural(count('events'), 'event')].filter(Boolean);
  if (parts.length) toast.info(`Added ${parts.join(', ')} from Google`);
}
