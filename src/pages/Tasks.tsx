import { useEffect, useMemo, useState } from 'react';
import { Archive, CheckSquare, Download, Plus, Search, Sparkles, X } from 'lucide-react';
import type { Task } from '@shared/schema';
import { useStore } from '@/lib/store';
import { openModal } from '@/lib/ui';
import { setQuery, useRoute } from '@/lib/router';
import { useToday } from '@/lib/useToday';
import { addDaysISO, daysBetween } from '@/lib/dates';
import { rankTasks, type PriorityScore } from '@/lib/priority';
import { priorityContext } from '@/lib/insights';
import { parseQuickAdd } from '@/lib/quickparse';
import { cn, csvEscape, downloadFile, plural } from '@/lib/util';
import { toast } from '@/lib/toast';
import { Badge, Button, EmptyState, PageHeader, Tabs } from '@/components/ui/primitives';
import { confirmAction } from '@/components/ui/Modal';
import { TaskItem } from '@/components/TaskItem';

type View = 'smart' | 'today' | 'upcoming' | 'overdue' | 'all' | 'completed' | 'archived';
type Sort = 'smart' | 'due' | 'priority' | 'created' | 'title';
const PRI_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

export function TasksPage() {
  const route = useRoute();
  const view = (route.query.get('view') as View) || 'smart';
  const s = useStore();
  const today = useToday();
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | 'personal' | 'school' | 'business'>('all');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [priority, setPriority] = useState('');
  const [sort, setSort] = useState<Sort>('smart');
  const [capture, setCapture] = useState('');

  // Deep link: #/tasks?task=<id> opens the editor.
  const deepTask = route.query.get('task');
  useEffect(() => {
    if (deepTask) {
      openModal({ kind: 'task', id: deepTask });
      setQuery('task', null);
    }
  }, [deepTask]);

  const scores = useMemo(() => {
    const m = new Map<string, PriorityScore>();
    for (const r of rankTasks(s.tasks, priorityContext(s, today))) m.set(r.task.id, r.p);
    return m;
  }, [s, today]);

  const allTags = useMemo(() => [...new Set(s.tasks.flatMap((t) => t.tags))].sort(), [s.tasks]);
  const allCategories = useMemo(() => [...new Set([...s.settings.taskCategories, ...s.tasks.map((t) => t.category).filter(Boolean) as string[]])], [s.tasks, s.settings.taskCategories]);

  const counts = useMemo(() => {
    const c = { today: 0, overdue: 0, upcoming: 0, completed: 0, archived: 0, all: 0 };
    const week = addDaysISO(today, 7);
    for (const t of s.tasks) {
      if (t.archived) {
        c.archived++;
        continue;
      }
      if (t.status === 'done') {
        c.completed++;
        continue;
      }
      c.all++;
      if (t.dueDate && t.dueDate < today) c.overdue++;
      else if (t.dueDate === today) c.today++;
      else if (t.dueDate && t.dueDate <= week) c.upcoming++;
    }
    return c;
  }, [s.tasks, today]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const week = addDaysISO(today, 7);
    let list = s.tasks.filter((t) => {
      if (view === 'archived') return t.archived;
      if (t.archived) return false;
      if (view === 'completed') return t.status === 'done';
      if (t.status === 'done') return false;
      if (view === 'today') return t.dueDate === today || (!!t.dueDate && t.dueDate < today);
      if (view === 'overdue') return !!t.dueDate && t.dueDate < today;
      if (view === 'upcoming') return !!t.dueDate && t.dueDate > today && t.dueDate <= week;
      return true;
    });
    if (type === 'school') list = list.filter((t) => t.classId);
    if (type === 'business') list = list.filter((t) => t.projectId);
    if (type === 'personal') list = list.filter((t) => !t.classId && !t.projectId);
    if (category) list = list.filter((t) => t.category === category);
    if (tag) list = list.filter((t) => t.tags.includes(tag));
    if (priority) list = list.filter((t) => t.priority === priority);
    if (ql) list = list.filter((t) => `${t.title} ${t.notes ?? ''} ${t.tags.join(' ')}`.toLowerCase().includes(ql));
    const by: Record<Sort, (a: Task, b: Task) => number> = {
      smart: (a, b) => (scores.get(b.id)?.score ?? 0) - (scores.get(a.id)?.score ?? 0),
      due: (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || (a.dueTime ?? '').localeCompare(b.dueTime ?? ''),
      priority: (a, b) => PRI_ORDER[a.priority] - PRI_ORDER[b.priority] || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
      created: (a, b) => b.createdAt - a.createdAt,
      title: (a, b) => a.title.localeCompare(b.title),
    };
    const sorter = view === 'completed' || view === 'archived' ? (a: Task, b: Task) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt) : by[sort];
    return [...list].sort(sorter);
  }, [s.tasks, view, type, category, tag, priority, q, sort, scores, today]);

  const groups = useMemo(() => {
    if (view !== 'all' || sort === 'smart') return null;
    const g: Record<string, Task[]> = { Overdue: [], Today: [], Tomorrow: [], 'Next 7 days': [], Later: [], 'No date': [] };
    for (const t of filtered) {
      if (!t.dueDate) g['No date'].push(t);
      else {
        const d = daysBetween(today, t.dueDate);
        g[d < 0 ? 'Overdue' : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d <= 7 ? 'Next 7 days' : 'Later'].push(t);
      }
    }
    return Object.entries(g).filter(([, l]) => l.length);
  }, [filtered, view, sort, today]);

  const parsed = parseQuickAdd(capture, today, { classes: s.classes.map((c) => ({ id: c.id, name: c.name })), projects: s.projects.map((p) => ({ id: p.id, name: p.name })) });
  const activeFilters = [type !== 'all', category, tag, priority, q].filter(Boolean).length;

  const exportCsv = () => {
    const cls = (id?: string) => s.classes.find((c) => c.id === id)?.name ?? '';
    const prj = (id?: string) => s.projects.find((p) => p.id === id)?.name ?? '';
    const rows = [
      ['Title', 'Status', 'Priority', 'Due date', 'Due time', 'Class', 'Project', 'Category', 'Tags', 'Points earned', 'Points possible', 'Notes'],
      ...filtered.map((t) => [t.title, t.status, t.priority, t.dueDate, t.dueTime, cls(t.classId), prj(t.projectId), t.category, t.tags.join(' '), t.pointsEarned, t.pointsPossible, t.notes]),
    ];
    downloadFile(`tasks-${today}.csv`, rows.map((r) => r.map(csvEscape).join(',')).join('\n'), 'text/csv');
  };

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle="Every task, assignment and business to-do in one list. Ranked by due date, importance and grade impact."
        actions={
          <>
            <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={exportCsv} disabled={!filtered.length}>
              CSV
            </Button>
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => openModal({ kind: 'task' })}>
              New task
            </Button>
          </>
        }
      />

      <form
        className="card mb-4 flex items-center gap-3 px-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!parsed.title) return;
          s.addTask({ title: parsed.title, dueDate: parsed.dueDate, dueTime: parsed.dueTime, priority: parsed.priority ?? 'medium', tags: parsed.tags, classId: parsed.classId, projectId: parsed.projectId, assignmentType: parsed.classId ? 'homework' : undefined });
          toast.success('Captured');
          setCapture('');
        }}
      >
        <Plus size={16} className="text-faint" />
        <input
          value={capture}
          onChange={(e) => setCapture(e.target.value)}
          placeholder="Quick capture — e.g. “Email Dana about table placement fri !high +cardshow”"
          className="h-12 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
          aria-label="Quick capture"
        />
        <div className="hidden flex-wrap gap-1 md:flex">
          {parsed.tokens.map((t) => (
            <Badge key={t} tone="accent">
              {t}
            </Badge>
          ))}
        </div>
        {capture && (
          <Button type="submit" size="sm" variant="primary">
            Add
          </Button>
        )}
      </form>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs
          value={view}
          onChange={(v) => setQuery('view', v === 'smart' ? null : v)}
          options={[
            { value: 'smart', label: <span className="inline-flex items-center gap-1.5"><Sparkles size={13} /> Do first</span> },
            { value: 'today', label: 'Today', count: counts.today + counts.overdue },
            { value: 'upcoming', label: 'Next 7 days', count: counts.upcoming },
            { value: 'overdue', label: 'Overdue', count: counts.overdue },
            { value: 'all', label: 'All open', count: counts.all },
            { value: 'completed', label: 'Completed' },
            { value: 'archived', label: 'Archived' },
          ]}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-2.5 text-faint" />
          <input className="input pl-8" placeholder="Filter tasks…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter tasks" />
        </div>
        <select className="input !w-auto" value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Type">
          <option value="all">All types</option>
          <option value="personal">Personal</option>
          <option value="school">School</option>
          <option value="business">Business</option>
        </select>
        <select className="input !w-auto" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          <option value="">Any priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="input !w-auto" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">Any category</option>
          {allCategories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {allTags.length > 0 && (
          <select className="input !w-auto" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag">
            <option value="">Any tag</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
        )}
        {view !== 'completed' && view !== 'archived' && (
          <select className="input !w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="smart">Sort: Smart priority</option>
            <option value="due">Sort: Due date</option>
            <option value="priority">Sort: Priority</option>
            <option value="created">Sort: Newest</option>
            <option value="title">Sort: A–Z</option>
          </select>
        )}
        {activeFilters > 0 && (
          <Button
            size="sm"
            variant="ghost"
            icon={<X size={14} />}
            onClick={() => {
              setQ('');
              setType('all');
              setCategory('');
              setTag('');
              setPriority('');
            }}
          >
            Clear filters
          </Button>
        )}
        {view === 'completed' && filtered.length > 0 && (
          <Button
            size="sm"
            className="ml-auto"
            icon={<Archive size={14} />}
            onClick={async () => {
              if (await confirmAction({ title: `Archive ${plural(filtered.length, 'completed task')}?`, message: 'Archived tasks are hidden from lists but keep their history and grades. You can restore them from the Archived view.', confirmLabel: 'Archive', danger: false })) {
                for (const t of filtered) s.update('tasks', t.id, { archived: true });
                toast.success('Completed tasks archived');
              }
            }}
          >
            Archive all
          </Button>
        )}
      </div>

      <div className="card p-2 sm:p-3">
        {filtered.length === 0 ? (
          <EmptyState icon={<CheckSquare size={18} />} title={activeFilters ? 'No tasks match these filters' : view === 'overdue' ? 'Nothing overdue' : view === 'today' ? 'Nothing due today' : view === 'completed' ? 'No completed tasks yet' : view === 'archived' ? 'Archive is empty' : 'No tasks yet'}>
            {activeFilters ? 'Try clearing a filter.' : view === 'smart' || view === 'all' ? 'Capture anything above — dates, priorities, #tags, @class and +project are understood.' : null}
          </EmptyState>
        ) : groups ? (
          groups.map(([label, list]) => (
            <div key={label} className="mb-2">
              <p className={cn('eyebrow px-2.5 pb-1 pt-2', label === 'Overdue' && '!text-bad')}>
                {label} · {list.length}
              </p>
              <div className="flex flex-col">
                {list.map((t) => (
                  <TaskItem key={t.id} task={t} reasons={scores.get(t.id)?.reasons} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col">
            {filtered.map((t, i) => (
              <div key={t.id} className="flex items-center">
                {view === 'smart' && sort === 'smart' && <span className="hidden w-7 shrink-0 text-right text-xs tabular-nums text-faint sm:block">{i + 1}</span>}
                <div className="min-w-0 flex-1">
                  <TaskItem task={t} reasons={view === 'completed' || view === 'archived' ? undefined : scores.get(t.id)?.reasons} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {view === 'smart' && filtered.length > 0 && (
        <p className="mt-3 text-xs text-faint">
          “Do first” ranks open tasks by urgency (due date), importance (priority) and — for graded school work — how many points of your class average are at stake. The reasons appear under each task.
        </p>
      )}
    </div>
  );
}
