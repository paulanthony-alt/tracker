import { useMemo, useState } from 'react';
import { Bell, CalendarPlus, CheckSquare, Flame, GraduationCap, NotebookPen, Sparkles } from 'lucide-react';
import { ASSIGNMENT_TYPES, type Task } from '@shared/schema';
import { useStore } from '@/lib/store';
import { useUI, type QuickAddKind } from '@/lib/ui';
import { parseQuickAdd } from '@/lib/quickparse';
import { useToday } from '@/lib/useToday';
import { toast } from '@/lib/toast';
import { cn, opt, optNum } from '@/lib/util';
import { COLORS } from '@/lib/defaults';
import { Badge, Button } from './ui/primitives';
import { Modal } from './ui/Modal';
import { Field, Segmented } from './ui/Field';

const TABS: { id: QuickAddKind; label: string; icon: React.ReactNode }[] = [
  { id: 'task', label: 'Task', icon: <CheckSquare size={14} /> },
  { id: 'assignment', label: 'Assignment', icon: <GraduationCap size={14} /> },
  { id: 'event', label: 'Event', icon: <CalendarPlus size={14} /> },
  { id: 'habit', label: 'Habit', icon: <Flame size={14} /> },
  { id: 'note', label: 'Note', icon: <NotebookPen size={14} /> },
  { id: 'reminder', label: 'Reminder', icon: <Bell size={14} /> },
];

export function QuickAdd({ tab: initialTab = 'task', defaults }: { tab?: QuickAddKind; defaults?: Partial<Task> & { date?: string } }) {
  const close = useUI((s) => s.close);
  const open = useUI((s) => s.open);
  const [tab, setTab] = useState<QuickAddKind>(initialTab);
  const today = useToday();
  const classes = useStore((s) => s.classes);
  const projects = useStore((s) => s.projects);
  const habitCount = useStore((s) => s.habits.length);
  const folders = useStore((s) => s.settings.noteFolders);

  const [text, setText] = useState('');
  const [a, setA] = useState({ title: '', classId: defaults?.classId ?? '', type: 'homework' as NonNullable<Task['assignmentType']>, due: defaults?.date ?? '', points: '' });
  const [ev, setEv] = useState({ title: '', date: defaults?.date ?? today, start: '', end: '' });
  const [hb, setHb] = useState({ name: '', freq: 'daily' as 'daily' | 'weekly', target: 3 });
  const [nt, setNt] = useState({ title: '', content: '', folder: folders[0] ?? 'General' });
  const [rm, setRm] = useState({ title: '', date: defaults?.date ?? '', time: '', important: false });
  const [error, setError] = useState('');

  const activeClasses = useMemo(() => classes.filter((c) => !c.archived), [classes]);
  const parsed = useMemo(
    () => parseQuickAdd(text, today, { classes: activeClasses.map((c) => ({ id: c.id, name: c.name })), projects: projects.map((p) => ({ id: p.id, name: p.name })) }),
    [text, today, activeClasses, projects],
  );

  const s = useStore.getState;
  const submit = () => {
    setError('');
    switch (tab) {
      case 'task': {
        if (!parsed.title) return setError('Type what you need to do');
        s().addTask({ title: parsed.title, dueDate: parsed.dueDate ?? defaults?.dueDate ?? defaults?.date, dueTime: parsed.dueTime, priority: parsed.priority ?? defaults?.priority ?? 'medium', tags: parsed.tags, classId: parsed.classId ?? defaults?.classId, projectId: parsed.projectId ?? defaults?.projectId, assignmentType: parsed.classId || defaults?.classId ? 'homework' : undefined });
        toast.success('Task added');
        break;
      }
      case 'assignment': {
        if (!a.title.trim()) return setError('Name the assignment');
        if (!a.classId) return setError(activeClasses.length ? 'Choose a class' : 'Add a class first in School');
        s().addTask({ title: a.title, classId: a.classId, assignmentType: a.type, dueDate: a.due || undefined, pointsPossible: optNum(a.points), category: 'School', priority: a.type === 'test' || a.type === 'project' ? 'high' : 'medium' });
        toast.success('Assignment added');
        break;
      }
      case 'event': {
        if (!ev.title.trim()) return setError('Name the event');
        if (!ev.date) return setError('Pick a date');
        if (ev.start && ev.end && ev.end <= ev.start) return setError('End time must be after the start');
        s().create('events', { title: ev.title.trim(), date: ev.date, startTime: ev.start || undefined, endTime: ev.end || undefined });
        toast.success('Event added');
        break;
      }
      case 'habit': {
        if (!hb.name.trim()) return setError('Name the habit');
        s().create('habits', { name: hb.name.trim(), frequency: hb.freq, targetPerWeek: hb.freq === 'weekly' ? hb.target : 1, color: COLORS[habitCount % COLORS.length], completions: [], archived: false, order: habitCount });
        toast.success('Habit added');
        break;
      }
      case 'note': {
        if (!nt.title.trim() && !nt.content.trim()) return setError('Write something first');
        const n = s().create('notes', { title: nt.title.trim(), content: nt.content, folder: nt.folder, tags: [], pinned: false, isTemplate: false, links: [], archived: false });
        toast.success('Note saved', { label: 'Open', run: () => (window.location.hash = `#/notes/${n.id}`) });
        break;
      }
      case 'reminder': {
        if (!rm.title.trim()) return setError('What should you remember?');
        if (rm.time && !rm.date) return setError('Pick a date for the reminder time');
        s().create('reminders', { title: rm.title.trim(), date: opt(rm.date), time: opt(rm.time), important: rm.important || undefined, done: false });
        toast.success('Reminder added');
        break;
      }
    }
    close();
  };

  return (
    <Modal
      open
      onClose={close}
      title="Quick add"
      width="md"
      footer={
        <>
          {tab === 'task' && (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={() =>
                open({
                  kind: 'task',
                  defaults: { title: parsed.title, dueDate: parsed.dueDate ?? defaults?.date, dueTime: parsed.dueTime, priority: parsed.priority, tags: parsed.tags, classId: parsed.classId ?? defaults?.classId, projectId: parsed.projectId ?? defaults?.projectId },
                })
              }
            >
              More options
            </Button>
          )}
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            Add {TABS.find((t) => t.id === tab)!.label.toLowerCase()}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <div className="-mx-1 flex gap-1 overflow-x-auto pb-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setError('');
              }}
              className={cn('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors', tab === t.id ? 'bg-surface-3 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'task' && (
          <div>
            <input
              key="task"
              className="input !h-11 text-[15px]"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Ship eBay orders tomorrow 4pm !high #shipping"
              aria-label="Task"
              data-autofocus
            />
            <div className="mt-2 flex min-h-6 flex-wrap items-center gap-1.5">
              {parsed.tokens.length ? (
                <>
                  <Sparkles size={13} className="text-accent" />
                  {parsed.tokens.map((t) => (
                    <Badge key={t} tone="accent">
                      {t}
                    </Badge>
                  ))}
                </>
              ) : (
                <p className="text-xs text-faint">
                  Understands <span className="text-muted">today, tomorrow, fri, next week, in 3 days, 11/14, 5pm</span>, <span className="text-muted">!high</span>, <span className="text-muted">#tag</span>,{' '}
                  <span className="text-muted">@class</span>, <span className="text-muted">+project</span>.
                </p>
              )}
            </div>
          </div>
        )}

        {tab === 'assignment' && (
          <div className="space-y-3">
            <Field label="Assignment">
              <input key="a" className="input" value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} placeholder="e.g. Lab report: titration" data-autofocus autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Class">
                <select className="input" value={a.classId} onChange={(e) => setA({ ...a, classId: e.target.value })}>
                  <option value="">{activeClasses.length ? 'Choose…' : 'No classes yet'}</option>
                  {activeClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Type">
                <select className="input" value={a.type} onChange={(e) => setA({ ...a, type: e.target.value as typeof a.type })}>
                  {ASSIGNMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t === 'study' ? 'Study session' : t[0].toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Due">
                <input type="date" className="input" value={a.due} onChange={(e) => setA({ ...a, due: e.target.value })} />
              </Field>
              <Field label="Points possible">
                <input type="number" min={0} className="input" value={a.points} onChange={(e) => setA({ ...a, points: e.target.value })} placeholder="optional" />
              </Field>
            </div>
          </div>
        )}

        {tab === 'event' && (
          <div className="space-y-3">
            <Field label="Event">
              <input key="e" className="input" value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} placeholder="e.g. Shift at work" data-autofocus autoFocus />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Date">
                <input type="date" className="input" value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} />
              </Field>
              <Field label="Start">
                <input type="time" className="input" value={ev.start} onChange={(e) => setEv({ ...ev, start: e.target.value })} />
              </Field>
              <Field label="End">
                <input type="time" className="input" value={ev.end} onChange={(e) => setEv({ ...ev, end: e.target.value })} />
              </Field>
            </div>
          </div>
        )}

        {tab === 'habit' && (
          <div className="space-y-3">
            <Field label="Habit">
              <input key="h" className="input" value={hb.name} onChange={(e) => setHb({ ...hb, name: e.target.value })} placeholder="e.g. Stretch 10 minutes" data-autofocus autoFocus />
            </Field>
            <Segmented value={hb.freq} onChange={(v) => setHb({ ...hb, freq: v })} options={[{ value: 'daily', label: 'Every day' }, { value: 'weekly', label: 'Times per week' }]} />
            {hb.freq === 'weekly' && <Segmented value={hb.target} onChange={(v) => setHb({ ...hb, target: v })} options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${n}×` }))} />}
            <p className="text-xs text-faint">Set specific weekdays, color and icon later from Habits.</p>
          </div>
        )}

        {tab === 'note' && (
          <div className="space-y-3">
            <input key="n" className="input" value={nt.title} onChange={(e) => setNt({ ...nt, title: e.target.value })} placeholder="Title" aria-label="Title" data-autofocus autoFocus />
            <textarea className="input" rows={5} value={nt.content} onChange={(e) => setNt({ ...nt, content: e.target.value })} placeholder="Idea, notes, anything…" aria-label="Content" />
            <select className="input" value={nt.folder} onChange={(e) => setNt({ ...nt, folder: e.target.value })} aria-label="Folder">
              {folders.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>
        )}

        {tab === 'reminder' && (
          <div className="space-y-3">
            <input key="r" className="input" value={rm.title} onChange={(e) => setRm({ ...rm, title: e.target.value })} placeholder="e.g. Bring permission slip" aria-label="Reminder" data-autofocus autoFocus />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <input type="date" className="input" value={rm.date} onChange={(e) => setRm({ ...rm, date: e.target.value })} />
              </Field>
              <Field label="Time">
                <input type="time" className="input" value={rm.time} onChange={(e) => setRm({ ...rm, time: e.target.value, date: rm.date || today })} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={rm.important} onChange={(e) => setRm({ ...rm, important: e.target.checked })} className="accent-[rgb(var(--accent))]" />
              Important (stays on screen until you act on it)
            </label>
            <p className="text-xs text-faint">With a date, you’ll get a notification at that time (or at your default reminder time).</p>
          </div>
        )}
        {error && <p className="text-xs text-bad">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
