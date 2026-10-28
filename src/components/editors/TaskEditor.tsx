import { useMemo, useState } from 'react';
import { Briefcase, CheckSquare, GraduationCap, Trash2 } from 'lucide-react';
import { ASSIGNMENT_TYPES, PRIORITIES, type Task } from '@shared/schema';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui';
import { opt, optNum, cn } from '@/lib/util';
import { toast } from '@/lib/toast';
import { gradeImpact, periodFor } from '@/lib/grades';
import { Button } from '../ui/primitives';
import { Modal } from '../ui/Modal';
import { Field, Segmented, TagInput } from '../ui/Field';
import { RecurrenceField } from './RecurrenceField';
import { deleteTaskWithConfirm } from '../TaskItem';

type Kind = 'task' | 'assignment' | 'business';

export function TaskEditor({ id, defaults }: { id?: string; defaults?: Partial<Task> }) {
  const close = useUI((s) => s.close);
  const existing = useStore((s) => (id ? s.tasks.find((t) => t.id === id) : undefined));
  const allClasses = useStore((s) => s.classes);
  const allProjects = useStore((s) => s.projects);
  const allGoals = useStore((s) => s.goals);
  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);
  const projects = useMemo(() => allProjects.filter((p) => !p.archived), [allProjects]);
  const goals = useMemo(() => allGoals.filter((g) => g.status === 'active'), [allGoals]);
  const categories = useStore((s) => s.settings.taskCategories);
  const allTasks = useStore((s) => s.tasks);
  const periods = useStore((s) => s.settings.markingPeriods);

  const initial: Partial<Task> = existing ?? { status: 'todo', priority: 'medium', tags: [], ...defaults };
  const [t, setT] = useState<Partial<Task>>(initial);
  const [kind, setKind] = useState<Kind>(initial.classId ? 'assignment' : initial.projectId ? 'business' : 'task');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Task>(k: K, v: Task[K] | undefined) => setT((p) => ({ ...p, [k]: v }));

  const cls = classes.find((c) => c.id === t.classId);
  const project = projects.find((p) => p.id === t.projectId);

  const impact = useMemo(() => {
    if (kind !== 'assignment' || !cls || !t.pointsPossible || t.pointsEarned !== undefined) return null;
    const draft = { ...(existing ?? {}), ...t, id: existing?.id ?? 'draft', classId: cls.id } as Task;
    const others = allTasks.filter((x) => x.id !== draft.id);
    return gradeImpact(draft, cls, [...others, draft], draft.dueDate ? periodFor(draft.dueDate, periods) : undefined);
  }, [kind, cls, t, existing, allTasks, periods]);

  if (id && !existing) {
    return (
      <Modal open onClose={close} title="Task not found" width="sm">
        <p className="text-sm text-muted">This task no longer exists — it may have been deleted.</p>
      </Modal>
    );
  }

  const save = () => {
    const e: Record<string, string> = {};
    if (!t.title?.trim()) e.title = 'Give it a title';
    if (kind === 'assignment' && !t.classId) e.classId = classes.length ? 'Choose a class' : 'Add a class first (School → Add class)';
    if (kind === 'business' && !t.projectId) e.projectId = projects.length ? 'Choose a project' : 'Create a project first (Business → New project)';
    if (t.dueTime && !t.dueDate) e.dueDate = 'A time needs a date';
    if (t.pointsEarned !== undefined && t.pointsPossible === undefined) e.pointsPossible = 'Enter points possible';
    if (t.pointsEarned !== undefined && t.pointsPossible !== undefined && t.pointsEarned > t.pointsPossible * 2) e.pointsEarned = 'That’s more than double the points possible';
    setErrors(e);
    if (Object.keys(e).length) return;

    const patch: Partial<Task> = {
      ...t,
      title: t.title!.trim(),
      notes: opt(t.notes),
      category: opt(t.category),
      classId: kind === 'assignment' ? t.classId : undefined,
      assignmentType: kind === 'assignment' ? t.assignmentType ?? 'homework' : undefined,
      gradeCategoryId: kind === 'assignment' && cls?.categories.some((c) => c.id === t.gradeCategoryId) ? t.gradeCategoryId : undefined,
      pointsPossible: kind === 'assignment' ? t.pointsPossible : undefined,
      pointsEarned: kind === 'assignment' ? t.pointsEarned : undefined,
      excused: kind === 'assignment' && t.excused ? true : undefined,
      projectId: kind === 'business' ? t.projectId : undefined,
      milestoneId: kind === 'business' && project?.milestones.some((m) => m.id === t.milestoneId) ? t.milestoneId : undefined,
    };
    // Entering a grade implies the work is done.
    if (patch.pointsEarned !== undefined && patch.status !== 'done') {
      patch.status = 'done';
      patch.completedAt = Date.now();
    }
    if (patch.status === 'done' && !patch.completedAt) patch.completedAt = Date.now();
    if (patch.status !== 'done') patch.completedAt = undefined;

    const store = useStore.getState();
    if (existing) {
      store.update('tasks', existing.id, patch);
      toast.success('Saved');
    } else {
      store.addTask({ ...patch, title: patch.title! });
      toast.success(kind === 'assignment' ? 'Assignment added' : 'Task added');
    }
    close();
  };

  return (
    <Modal
      open
      onClose={close}
      width="lg"
      title={existing ? 'Edit task' : kind === 'assignment' ? 'New assignment' : 'New task'}
      description={existing ? undefined : 'Entered once — it shows up in every section it belongs to and on the calendar.'}
      footer={
        <>
          {existing && (
            <Button variant="ghost" className="mr-auto !text-bad" icon={<Trash2 size={15} />} onClick={async () => { await deleteTaskWithConfirm(existing); if (!useStore.getState().tasks.some((x) => x.id === existing.id)) close(); }}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            {existing ? 'Save changes' : 'Add'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type">
          {(
            [
              ['task', 'Task', <CheckSquare size={14} key="t" />],
              ['assignment', 'Assignment', <GraduationCap size={14} key="a" />],
              ['business', 'Business task', <Briefcase size={14} key="b" />],
            ] as const
          ).map(([k, label, icon]) => (
            <button
              type="button"
              role="radio"
              aria-checked={kind === k}
              key={k}
              onClick={() => setKind(k)}
              className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors', kind === k ? 'border-accent/50 bg-accent/12 text-accent' : 'border-line bg-surface-2 text-muted hover:text-fg')}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        <Field label="Title" error={errors.title}>
          <input className="input" value={t.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder={kind === 'assignment' ? 'e.g. Chapter 6 problem set' : 'What needs to happen?'} maxLength={300} data-autofocus />
        </Field>

        {kind === 'assignment' && (
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface-2/50 p-3 sm:grid-cols-2">
            <Field label="Class" error={errors.classId}>
              <select className="input" value={t.classId ?? ''} onChange={(e) => set('classId', e.target.value || undefined)}>
                <option value="">Choose…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Type">
              <select className="input capitalize" value={t.assignmentType ?? 'homework'} onChange={(e) => set('assignmentType', e.target.value as Task['assignmentType'])}>
                {ASSIGNMENT_TYPES.map((a) => (
                  <option key={a} value={a}>
                    {a === 'study' ? 'Study session' : a[0].toUpperCase() + a.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            {cls && cls.categories.length > 0 && (
              <Field label="Grade category">
                <select className="input" value={t.gradeCategoryId ?? ''} onChange={(e) => set('gradeCategoryId', e.target.value || undefined)}>
                  <option value="">Uncategorized</option>
                  {cls.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.weight}%)
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Points earned" error={errors.pointsEarned} hint="Leave blank until graded">
                <input className="input" type="number" min={0} step="any" inputMode="decimal" value={t.pointsEarned ?? ''} onChange={(e) => set('pointsEarned', optNum(e.target.value))} placeholder="—" />
              </Field>
              <Field label="Points possible" error={errors.pointsPossible}>
                <input className="input" type="number" min={0} step="any" inputMode="decimal" value={t.pointsPossible ?? ''} onChange={(e) => set('pointsPossible', optNum(e.target.value))} placeholder="e.g. 100" />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted sm:col-span-2">
              <input type="checkbox" checked={!!t.excused} onChange={(e) => set('excused', e.target.checked || undefined)} className="accent-[rgb(var(--accent))]" />
              Excused / dropped (doesn’t count toward the average)
            </label>
            {impact !== null && (
              <p className="text-xs text-muted sm:col-span-2">
                Grade impact: up to <span className="font-semibold text-fg">{impact.toFixed(1)} percentage points</span> of your {cls?.name} average depend on this.
              </p>
            )}
          </div>
        )}

        {kind === 'business' && (
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface-2/50 p-3 sm:grid-cols-2">
            <Field label="Project" error={errors.projectId}>
              <select className="input" value={t.projectId ?? ''} onChange={(e) => set('projectId', e.target.value || undefined)}>
                <option value="">Choose…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Milestone">
              <select className="input" value={t.milestoneId ?? ''} onChange={(e) => set('milestoneId', e.target.value || undefined)} disabled={!project?.milestones.length}>
                <option value="">{project?.milestones.length ? 'None' : 'No milestones'}</option>
                {project?.milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Due date" error={errors.dueDate} className="col-span-1 sm:col-span-2">
            <input type="date" className="input" value={t.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || undefined)} />
          </Field>
          <Field label="Time">
            <input type="time" className="input" value={t.dueTime ?? ''} onChange={(e) => set('dueTime', e.target.value || undefined)} />
          </Field>
          <Field label="Estimate (min)">
            <input type="number" min={0} max={1440} step={5} className="input" value={t.estimateMinutes ?? ''} onChange={(e) => set('estimateMinutes', optNum(e.target.value) !== undefined ? Math.round(optNum(e.target.value)!) : undefined)} placeholder="30" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Priority">
            <Segmented value={t.priority ?? 'medium'} onChange={(v) => set('priority', v)} options={PRIORITIES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))} />
          </Field>
          <Field label="Status">
            <Segmented
              value={t.status ?? 'todo'}
              onChange={(v) => set('status', v)}
              options={[
                { value: 'todo', label: 'To do' },
                { value: 'in_progress', label: 'In progress' },
                { value: 'done', label: 'Done' },
              ]}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Category">
            <select className="input" value={t.category ?? ''} onChange={(e) => set('category', e.target.value || undefined)}>
              <option value="">None</option>
              {[...new Set([...categories, ...(t.category ? [t.category] : [])])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Goal">
            <select className="input" value={t.goalId ?? ''} onChange={(e) => set('goalId', e.target.value || undefined)}>
              <option value="">Not linked</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Tags">
          <TagInput value={t.tags ?? []} onChange={(v) => set('tags', v)} />
        </Field>

        <Field label="Repeat">
          <RecurrenceField value={t.recurrence} onChange={(v) => set('recurrence', v)} />
        </Field>

        <Field label="Notes">
          <textarea className="input" rows={3} value={t.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Details, links, sub-steps…" />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
