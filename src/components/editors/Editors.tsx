import { useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { CalendarEvent, Goal, GradeCategory, Habit, Project, SchoolClass } from '@shared/schema';
import { PROJECT_STATUSES } from '@shared/schema';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui';
import { cn, opt, optNum } from '@/lib/util';
import { toast } from '@/lib/toast';
import { uid } from '@/lib/id';
import { COLORS } from '@/lib/defaults';
import { todayISO, weekStartISO, WEEKDAYS_MIN } from '@/lib/dates';
import { Button, IconButton } from '../ui/primitives';
import { Modal, confirmAction } from '../ui/Modal';
import { Field, Segmented } from '../ui/Field';
import { RecurrenceField } from './RecurrenceField';

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Color">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={`Color ${c}`}
          onClick={() => onChange(c)}
          className={cn('h-7 w-7 rounded-full border-2 transition-transform hover:scale-110', value === c ? 'border-fg' : 'border-transparent')}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function Footer({ onDelete, onSave, saveLabel, close }: { onDelete?: () => void; onSave: () => void; saveLabel: string; close: () => void }) {
  return (
    <>
      {onDelete && (
        <Button variant="ghost" className="mr-auto !text-bad" icon={<Trash2 size={15} />} onClick={onDelete}>
          Delete
        </Button>
      )}
      <Button variant="ghost" onClick={close}>
        Cancel
      </Button>
      <Button variant="primary" onClick={onSave}>
        {saveLabel}
      </Button>
    </>
  );
}

// ---------------------------------------------------------------------------

export function EventEditor({ id, date, time }: { id?: string; date?: string; time?: string }) {
  const close = useUI((s) => s.close);
  const existing = useStore((s) => (id ? s.events.find((e) => e.id === id) : undefined));
  const classes = useStore((s) => s.classes);
  const projects = useStore((s) => s.projects);
  const [e, setE] = useState<Partial<CalendarEvent>>(
    existing ?? { date: date ?? todayISO(), startTime: time, endTime: time ? `${String(Math.min(23, Number(time.slice(0, 2)) + 1)).padStart(2, '0')}:${time.slice(3)}` : undefined },
  );
  const [err, setErr] = useState<Record<string, string>>({});
  const set = <K extends keyof CalendarEvent>(k: K, v: CalendarEvent[K] | undefined) => setE((p) => ({ ...p, [k]: v }));

  const save = () => {
    const errs: Record<string, string> = {};
    if (!e.title?.trim()) errs.title = 'Give the event a name';
    if (!e.date) errs.date = 'Pick a date';
    if (e.endTime && !e.startTime) errs.startTime = 'Add a start time';
    if (e.startTime && e.endTime && e.endTime <= e.startTime) errs.endTime = 'End must be after start';
    setErr(errs);
    if (Object.keys(errs).length) return;
    const data = { ...e, title: e.title!.trim(), location: opt(e.location), notes: opt(e.notes) } as CalendarEvent;
    const s = useStore.getState();
    if (existing) s.update('events', existing.id, data);
    else s.create('events', data);
    toast.success(existing ? 'Event saved' : 'Event added');
    close();
  };

  return (
    <Modal
      open
      onClose={close}
      title={existing ? 'Edit event' : 'New event'}
      footer={
        <Footer
          close={close}
          saveLabel={existing ? 'Save' : 'Add event'}
          onSave={save}
          onDelete={
            existing
              ? async () => {
                  if (await confirmAction({ title: 'Delete event?', message: existing.recurrence ? 'This deletes every occurrence of this repeating event.' : `“${existing.title}” will be deleted.` })) {
                    useStore.getState().remove('events', existing.id);
                    close();
                  }
                }
              : undefined
          }
        />
      }
    >
      <div className="space-y-4">
        <Field label="Title" error={err.title}>
          <input className="input" value={e.title ?? ''} onChange={(ev) => set('title', ev.target.value)} placeholder="e.g. Soccer practice" data-autofocus />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date" error={err.date}>
            <input type="date" className="input" value={e.date ?? ''} onChange={(ev) => set('date', ev.target.value || undefined)} />
          </Field>
          <Field label="Start" error={err.startTime}>
            <input type="time" className="input" value={e.startTime ?? ''} onChange={(ev) => set('startTime', ev.target.value || undefined)} />
          </Field>
          <Field label="End" error={err.endTime}>
            <input type="time" className="input" value={e.endTime ?? ''} onChange={(ev) => set('endTime', ev.target.value || undefined)} />
          </Field>
        </div>
        <p className="-mt-2 text-xs text-faint">Leave times blank for an all-day event.</p>
        <Field label="Location">
          <input className="input" value={e.location ?? ''} onChange={(ev) => set('location', ev.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Class">
            <select className="input" value={e.classId ?? ''} onChange={(ev) => set('classId', ev.target.value || undefined)}>
              <option value="">None</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project">
            <select className="input" value={e.projectId ?? ''} onChange={(ev) => set('projectId', ev.target.value || undefined)}>
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Repeat">
          <RecurrenceField value={e.recurrence} onChange={(v) => set('recurrence', v)} />
        </Field>
        <Field label="Color">
          <ColorPicker value={e.color ?? ''} onChange={(c) => set('color', c)} />
        </Field>
        <Field label="Notes">
          <textarea className="input" rows={2} value={e.notes ?? ''} onChange={(ev) => set('notes', ev.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

export function HabitEditor({ id }: { id?: string }) {
  const close = useUI((s) => s.close);
  const existing = useStore((s) => (id ? s.habits.find((h) => h.id === id) : undefined));
  const count = useStore((s) => s.habits.length);
  const [h, setH] = useState<Partial<Habit>>(existing ?? { frequency: 'daily', targetPerWeek: 3, color: COLORS[count % COLORS.length], completions: [] });
  const [err, setErr] = useState('');
  const set = <K extends keyof Habit>(k: K, v: Habit[K] | undefined) => setH((p) => ({ ...p, [k]: v }));

  const save = () => {
    if (!h.name?.trim()) return setErr('Name your habit');
    const data = { ...h, name: h.name.trim(), description: opt(h.description), icon: opt(h.icon), daysOfWeek: h.frequency === 'daily' && h.daysOfWeek?.length && h.daysOfWeek.length < 7 ? h.daysOfWeek : undefined } as Habit;
    const s = useStore.getState();
    if (existing) s.update('habits', existing.id, data);
    else s.create('habits', { ...data, completions: [], archived: false, order: count });
    toast.success(existing ? 'Habit saved' : 'Habit added');
    close();
  };

  return (
    <Modal
      open
      onClose={close}
      title={existing ? 'Edit habit' : 'New habit'}
      description="Your habits, your rules — daily, specific weekdays, or a weekly target."
      footer={
        <Footer
          close={close}
          saveLabel={existing ? 'Save' : 'Add habit'}
          onSave={save}
          onDelete={
            existing
              ? async () => {
                  if (await confirmAction({ title: 'Delete habit?', message: `“${existing.name}” and its ${existing.completions.length} check-ins will be deleted. Archive it instead to keep the history.` })) {
                    useStore.getState().remove('habits', existing.id);
                    close();
                  }
                }
              : undefined
          }
        />
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3">
          <Field label="Icon" className="w-20">
            <input className="input text-center" value={h.icon ?? ''} onChange={(e) => set('icon', [...e.target.value].slice(-2).join(''))} placeholder="✨" maxLength={8} />
          </Field>
          <Field label="Name" error={err} className="flex-1">
            <input className="input" value={h.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Read 20 minutes" data-autofocus />
          </Field>
        </div>
        <Field label="Frequency">
          <Segmented value={h.frequency ?? 'daily'} onChange={(v) => set('frequency', v)} options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Times per week' }]} />
        </Field>
        {h.frequency === 'daily' ? (
          <Field label="Days" hint="Leave all off for every day">
            <div className="flex gap-1">
              {WEEKDAYS_MIN.map((d, i) => {
                const on = h.daysOfWeek?.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const s = new Set(h.daysOfWeek ?? []);
                      if (on) s.delete(i);
                      else s.add(i);
                      set('daysOfWeek', [...s].sort());
                    }}
                    className={cn('h-8 w-8 rounded-lg border text-xs font-medium', on ? 'border-accent/50 bg-accent/15 text-accent' : 'border-line bg-surface-2 text-muted')}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>
        ) : (
          <Field label="Target per week">
            <Segmented value={h.targetPerWeek ?? 3} onChange={(v) => set('targetPerWeek', v)} options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: `${n}×` }))} />
          </Field>
        )}
        <Field label="Color">
          <ColorPicker value={h.color ?? COLORS[0]} onChange={(c) => set('color', c)} />
        </Field>
        <Field label="Why it matters (optional)">
          <textarea className="input" rows={2} value={h.description ?? ''} onChange={(e) => set('description', e.target.value)} />
        </Field>
        {existing && (
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={!!h.archived} onChange={(e) => set('archived', e.target.checked)} className="accent-[rgb(var(--accent))]" />
            Archived (hidden from daily tracking, history kept)
          </label>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

export function GoalEditor({ id, horizon }: { id?: string; horizon?: Goal['horizon'] }) {
  const close = useUI((s) => s.close);
  const existing = useStore((s) => (id ? s.goals.find((g) => g.id === id) : undefined));
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const [g, setG] = useState<Partial<Goal>>(existing ?? { horizon: horizon ?? 'short', progressMode: 'manual', manualProgress: 0, milestones: [], status: 'active' });
  const [err, setErr] = useState('');
  const [ms, setMs] = useState('');
  const set = <K extends keyof Goal>(k: K, v: Goal[K] | undefined) => setG((p) => ({ ...p, [k]: v }));

  const save = () => {
    if (!g.title?.trim()) return setErr('Name your goal');
    if (g.progressMode === 'numeric' && (g.target === undefined || g.target === 0)) return setErr('Numeric goals need a non-zero target');
    const data = {
      ...g,
      title: g.title.trim(),
      description: opt(g.description),
      category: opt(g.category),
      unit: opt(g.unit),
      weekStart: g.horizon === 'weekly' ? g.weekStart ?? weekStartISO(todayISO(), weekStartsOn) : undefined,
    } as Goal;
    const s = useStore.getState();
    if (existing) s.update('goals', existing.id, data);
    else s.create('goals', data);
    toast.success(existing ? 'Goal saved' : 'Goal added');
    close();
  };

  return (
    <Modal
      open
      onClose={close}
      title={existing ? 'Edit goal' : 'New goal'}
      footer={
        <Footer
          close={close}
          saveLabel={existing ? 'Save' : 'Add goal'}
          onSave={save}
          onDelete={
            existing
              ? async () => {
                  if (await confirmAction({ title: 'Delete goal?', message: 'Linked tasks are kept but unlinked from this goal.' })) {
                    useStore.getState().deleteGoal(existing.id);
                    close();
                  }
                }
              : undefined
          }
        />
      }
    >
      <div className="space-y-4">
        <Field label="Goal" error={err}>
          <input className="input" value={g.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Save $3,000 for a car" data-autofocus />
        </Field>
        <Field label="Timeframe">
          <Segmented value={g.horizon ?? 'short'} onChange={(v) => set('horizon', v)} options={[{ value: 'weekly', label: 'This week' }, { value: 'short', label: 'Short-term' }, { value: 'long', label: 'Long-term' }]} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {g.horizon === 'weekly' ? (
            <Field label="Week starting">
              <input type="date" className="input" value={g.weekStart ?? weekStartISO(todayISO(), weekStartsOn)} onChange={(e) => set('weekStart', e.target.value ? weekStartISO(e.target.value, weekStartsOn) : undefined)} />
            </Field>
          ) : (
            <Field label="Target date">
              <input type="date" className="input" value={g.targetDate ?? ''} onChange={(e) => set('targetDate', e.target.value || undefined)} />
            </Field>
          )}
          <Field label="Category">
            <input className="input" value={g.category ?? ''} onChange={(e) => set('category', e.target.value)} placeholder="School, Health, Money…" />
          </Field>
        </div>
        <Field label="Measure progress by">
          <Segmented
            value={g.progressMode ?? 'manual'}
            onChange={(v) => set('progressMode', v)}
            options={[
              { value: 'manual', label: 'Percent' },
              { value: 'numeric', label: 'Number' },
              { value: 'milestones', label: 'Milestones' },
              { value: 'tasks', label: 'Linked tasks' },
            ]}
          />
        </Field>
        {g.progressMode === 'manual' && (
          <Field label={`Progress — ${Math.round(g.manualProgress ?? 0)}%`}>
            <input type="range" min={0} max={100} step={5} value={g.manualProgress ?? 0} onChange={(e) => set('manualProgress', Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" />
          </Field>
        )}
        {g.progressMode === 'numeric' && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Current">
              <input type="number" step="any" className="input" value={g.current ?? ''} onChange={(e) => set('current', optNum(e.target.value))} />
            </Field>
            <Field label="Target">
              <input type="number" step="any" className="input" value={g.target ?? ''} onChange={(e) => set('target', optNum(e.target.value))} />
            </Field>
            <Field label="Unit">
              <input className="input" value={g.unit ?? ''} onChange={(e) => set('unit', e.target.value)} placeholder="$, pages, lbs" />
            </Field>
          </div>
        )}
        {g.progressMode === 'tasks' && <p className="text-xs text-faint">Link tasks to this goal from the task editor (“Goal” field). Progress = completed linked tasks.</p>}
        {(g.progressMode === 'milestones' || (g.milestones?.length ?? 0) > 0) && (
          <Field label="Milestones">
            <div className="space-y-1.5">
              {g.milestones?.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={m.done} onChange={(e) => set('milestones', g.milestones!.map((x) => (x.id === m.id ? { ...x, done: e.target.checked } : x)))} className="accent-[rgb(var(--accent))]" aria-label={`Done: ${m.title}`} />
                  <span className={cn('flex-1 text-sm', m.done && 'text-faint line-through')}>{m.title}</span>
                  <IconButton label="Remove milestone" size="xs" onClick={() => set('milestones', g.milestones!.filter((x) => x.id !== m.id))}>
                    <X size={14} />
                  </IconButton>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  className="input"
                  value={ms}
                  onChange={(e) => setMs(e.target.value)}
                  placeholder="Add a milestone"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && ms.trim()) {
                      e.preventDefault();
                      set('milestones', [...(g.milestones ?? []), { id: uid('ms'), title: ms.trim(), done: false }]);
                      setMs('');
                    }
                  }}
                />
                <Button
                  icon={<Plus size={14} />}
                  onClick={() => {
                    if (!ms.trim()) return;
                    set('milestones', [...(g.milestones ?? []), { id: uid('ms'), title: ms.trim(), done: false }]);
                    setMs('');
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          </Field>
        )}
        <Field label="Why / notes">
          <textarea className="input" rows={2} value={g.description ?? ''} onChange={(e) => set('description', e.target.value)} />
        </Field>
        {existing && (
          <Field label="Status">
            <Segmented value={g.status ?? 'active'} onChange={(v) => set('status', v)} options={[{ value: 'active', label: 'Active' }, { value: 'achieved', label: 'Achieved' }, { value: 'dropped', label: 'Dropped' }]} />
          </Field>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

export function ClassEditor({ id }: { id?: string }) {
  const close = useUI((s) => s.close);
  const existing = useStore((s) => (id ? s.classes.find((c) => c.id === id) : undefined));
  const count = useStore((s) => s.classes.length);
  const periods = useStore((s) => s.settings.markingPeriods);
  const [c, setC] = useState<Partial<SchoolClass>>(existing ?? { color: COLORS[count % COLORS.length], level: 'regular', credits: 1, categories: [] });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = <K extends keyof SchoolClass>(k: K, v: SchoolClass[K] | undefined) => setC((p) => ({ ...p, [k]: v }));
  const totalWeight = useMemo(() => (c.categories ?? []).reduce((s, x) => s + x.weight, 0), [c.categories]);

  const setCat = (cid: string, patch: Partial<GradeCategory>) => set('categories', c.categories!.map((x) => (x.id === cid ? { ...x, ...patch } : x)));

  const save = () => {
    const e: Record<string, string> = {};
    if (!c.name?.trim()) e.name = 'Name the class';
    if (c.categories?.some((x) => !x.name.trim())) e.categories = 'Every category needs a name';
    else if (c.categories?.length && Math.abs(totalWeight - 100) > 0.01) e.categories = `Weights add up to ${totalWeight}% — they should total 100%`;
    setErr(e);
    if (Object.keys(e).length) return;
    const data = { ...c, name: c.name!.trim(), teacher: opt(c.teacher), room: opt(c.room), schedule: opt(c.schedule), categories: c.categories!.map((x) => ({ ...x, name: x.name.trim() })) } as SchoolClass;
    const s = useStore.getState();
    if (existing) s.update('classes', existing.id, data);
    else s.create('classes', { ...data, archived: false });
    toast.success(existing ? 'Class saved' : 'Class added');
    close();
  };

  return (
    <Modal
      open
      onClose={close}
      width="lg"
      title={existing ? 'Edit class' : 'New class'}
      footer={
        <Footer
          close={close}
          saveLabel={existing ? 'Save' : 'Add class'}
          onSave={save}
          onDelete={
            existing
              ? async () => {
                  const n = useStore.getState().tasks.filter((t) => t.classId === existing.id).length;
                  if (await confirmAction({ title: `Delete ${existing.name}?`, message: `This also deletes its ${n} assignment${n === 1 ? '' : 's'} and grades. To keep the history, archive the class instead.` })) {
                    useStore.getState().deleteClass(existing.id);
                    close();
                  }
                }
              : undefined
          }
        />
      }
    >
      <div className="space-y-4">
        <Field label="Class name" error={err.name}>
          <input className="input" value={c.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. AP Biology" data-autofocus />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Teacher">
            <input className="input" value={c.teacher ?? ''} onChange={(e) => set('teacher', e.target.value)} />
          </Field>
          <Field label="Room">
            <input className="input" value={c.room ?? ''} onChange={(e) => set('room', e.target.value)} />
          </Field>
          <Field label="Schedule">
            <input className="input" value={c.schedule ?? ''} onChange={(e) => set('schedule', e.target.value)} placeholder="Period 3 / MWF 9am" />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Level" hint="Used for weighted GPA">
            <select className="input" value={c.level} onChange={(e) => set('level', e.target.value as SchoolClass['level'])}>
              <option value="regular">Regular</option>
              <option value="honors">Honors (+0.5)</option>
              <option value="ap">AP / IB (+1.0)</option>
            </select>
          </Field>
          <Field label="Credits">
            <input type="number" min={0} max={10} step={0.25} className="input" value={c.credits ?? 1} onChange={(e) => set('credits', optNum(e.target.value) ?? 0)} />
          </Field>
          <Field label="Target grade (%)">
            <input type="number" min={0} max={110} className="input" value={c.targetGrade ?? ''} onChange={(e) => set('targetGrade', optNum(e.target.value))} placeholder="e.g. 90" />
          </Field>
        </div>
        <Field label="Color">
          <ColorPicker value={c.color ?? COLORS[0]} onChange={(v) => set('color', v)} />
        </Field>

        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-[13px] font-medium">Grade categories</p>
              <p className="text-xs text-faint">Optional. Without categories the grade is total points earned ÷ possible.</p>
            </div>
            <Button size="sm" icon={<Plus size={14} />} onClick={() => set('categories', [...(c.categories ?? []), { id: uid('gc'), name: '', weight: Math.max(0, 100 - totalWeight) }])}>
              Category
            </Button>
          </div>
          {c.categories?.map((cat) => (
            <div key={cat.id} className="mb-1.5 flex items-center gap-2">
              <input className="input" value={cat.name} onChange={(e) => setCat(cat.id, { name: e.target.value })} placeholder="Tests" aria-label="Category name" />
              <div className="relative w-24 shrink-0">
                <input type="number" min={0} max={100} className="input pr-6" value={cat.weight} onChange={(e) => setCat(cat.id, { weight: optNum(e.target.value) ?? 0 })} aria-label="Weight percent" />
                <span className="pointer-events-none absolute right-2.5 top-2 text-xs text-faint">%</span>
              </div>
              <IconButton label="Remove category" size="xs" onClick={() => set('categories', c.categories!.filter((x) => x.id !== cat.id))}>
                <X size={14} />
              </IconButton>
            </div>
          ))}
          {!!c.categories?.length && <p className={cn('mt-1 text-xs', Math.abs(totalWeight - 100) < 0.01 ? 'text-faint' : 'text-warn')}>Total: {totalWeight}%</p>}
          {err.categories && <p className="mt-1 text-xs text-bad">{err.categories}</p>}
        </div>

        {periods.length > 0 && (
          <div className="rounded-xl border border-line p-3">
            <p className="text-[13px] font-medium">Known marking-period grades</p>
            <p className="mb-2 text-xs text-faint">Optional. Used when a period has no graded assignments here (e.g. a grade from your school portal).</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {periods.map((p) => (
                <Field key={p.id} label={p.name}>
                  <input
                    type="number"
                    min={0}
                    max={110}
                    step="any"
                    className="input"
                    value={c.manualGrades?.[p.id] ?? ''}
                    onChange={(e) => {
                      const v = optNum(e.target.value);
                      const next = { ...(c.manualGrades ?? {}) };
                      if (v === undefined) delete next[p.id];
                      else next[p.id] = v;
                      set('manualGrades', Object.keys(next).length ? next : undefined);
                    }}
                    placeholder="—"
                  />
                </Field>
              ))}
            </div>
          </div>
        )}
        {existing && (
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={!!c.archived} onChange={(e) => set('archived', e.target.checked)} className="accent-[rgb(var(--accent))]" />
            Archived (finished class — hidden from current GPA and lists, history kept)
          </label>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

export function ProjectEditor({ id }: { id?: string }) {
  const close = useUI((s) => s.close);
  const existing = useStore((s) => (id ? s.projects.find((p) => p.id === id) : undefined));
  const count = useStore((s) => s.projects.length);
  const [p, setP] = useState<Partial<Project>>(existing ?? { status: 'active', color: COLORS[(count + 2) % COLORS.length], trackFinances: false, milestones: [], contacts: [], transactions: [] });
  const [err, setErr] = useState('');
  const set = <K extends keyof Project>(k: K, v: Project[K] | undefined) => setP((x) => ({ ...x, [k]: v }));

  const save = () => {
    if (!p.name?.trim()) return setErr('Name the project');
    if (p.startDate && p.deadline && p.deadline < p.startDate) return setErr('Deadline is before the start date');
    const data = { ...p, name: p.name.trim(), description: opt(p.description), nextAction: opt(p.nextAction) } as Project;
    const s = useStore.getState();
    if (existing) s.update('projects', existing.id, data);
    else {
      const created = s.create('projects', { ...data, archived: false });
      window.location.hash = `#/business/${created.id}`;
    }
    toast.success(existing ? 'Project saved' : 'Project created');
    close();
  };

  return (
    <Modal
      open
      onClose={close}
      title={existing ? 'Edit project' : 'New project'}
      description={existing ? undefined : 'Card shows, sales, detailing, digital products — anything you’re building.'}
      footer={<Footer close={close} saveLabel={existing ? 'Save' : 'Create project'} onSave={save} />}
    >
      <div className="space-y-4">
        <Field label="Name" error={err}>
          <input className="input" value={p.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Car detailing" data-autofocus />
        </Field>
        <Field label="Description">
          <textarea className="input" rows={3} value={p.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="What is it, and what does success look like?" />
        </Field>
        <Field label="Status">
          <Segmented value={p.status ?? 'active'} onChange={(v) => set('status', v)} options={PROJECT_STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <input type="date" className="input" value={p.startDate ?? ''} onChange={(e) => set('startDate', e.target.value || undefined)} />
          </Field>
          <Field label="Deadline">
            <input type="date" className="input" value={p.deadline ?? ''} onChange={(e) => set('deadline', e.target.value || undefined)} />
          </Field>
        </div>
        <Field label="Next action" hint="Shown when there’s no open task to suggest">
          <input className="input" value={p.nextAction ?? ''} onChange={(e) => set('nextAction', e.target.value)} />
        </Field>
        <Field label="Color">
          <ColorPicker value={p.color ?? COLORS[0]} onChange={(c) => set('color', c)} />
        </Field>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={!!p.trackFinances} onChange={(e) => set('trackFinances', e.target.checked)} className="accent-[rgb(var(--accent))]" />
          Track revenue &amp; expenses for this project
        </label>
      </div>
    </Modal>
  );
}
