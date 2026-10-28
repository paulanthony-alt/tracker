import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Archive, Briefcase, CalendarClock, DollarSign, Download, Lightbulb, Mail, Pencil, Phone, Plus, Trash2, Users, X } from 'lucide-react';
import type { Contact, Project, ProjectStatus, Transaction } from '@shared/schema';
import { PROJECT_STATUSES } from '@shared/schema';
import { useStore } from '@/lib/store';
import { openModal } from '@/lib/ui';
import { navigate, setQuery, useRoute } from '@/lib/router';
import { useToday } from '@/lib/useToday';
import { daysBetween, formatRelativeDay, formatShort, fromISO } from '@/lib/dates';
import { money, nextMilestone, projectFinances, projectOpenTasks, projectProgress } from '@/lib/progress';
import { isOpen } from '@/lib/priority';
import { uid } from '@/lib/id';
import { cn, csvEscape, downloadFile, opt, optNum, plural } from '@/lib/util';
import { toast } from '@/lib/toast';
import { Badge, Button, Card, ColorDot, EmptyState, IconButton, PageHeader, ProgressBar, Stat, Tabs } from '@/components/ui/primitives';
import { confirmAction } from '@/components/ui/Modal';
import { TaskList } from '@/components/TaskItem';
import { ColumnChart } from '@/components/charts/Charts';

const STATUS_TONE: Record<ProjectStatus, 'accent' | 'good' | 'warn' | 'neutral'> = {
  active: 'good',
  planning: 'accent',
  idea: 'neutral',
  paused: 'warn',
  completed: 'neutral',
};
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function BusinessPage() {
  const route = useRoute();
  if (route.path[1]) return <ProjectDetail id={route.path[1]} />;
  return <BusinessHome />;
}

function BusinessHome() {
  const route = useRoute();
  const filter = (route.query.get('status') as ProjectStatus | 'all' | 'archived') || 'all';
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const today = useToday();
  const live = projects.filter((p) => !p.archived);
  const shown = filter === 'archived' ? projects.filter((p) => p.archived) : filter === 'all' ? live : live.filter((p) => p.status === filter);
  const totals = useMemo(() => {
    let revenue = 0;
    let expenses = 0;
    for (const p of live) if (p.trackFinances) {
      const f = projectFinances(p);
      revenue += f.revenue;
      expenses += f.expenses;
    }
    return { revenue, expenses, profit: revenue - expenses, tracked: live.some((p) => p.trackFinances) };
  }, [live]);
  const openTasks = tasks.filter((t) => t.projectId && isOpen(t) && live.some((p) => p.id === t.projectId));
  const milestones = live
    .flatMap((p) => p.milestones.filter((m) => !m.done).map((m) => ({ p, m })))
    .sort((a, b) => (a.m.dueDate ?? '9999').localeCompare(b.m.dueDate ?? '9999'))
    .slice(0, 8);

  return (
    <div>
      <PageHeader
        title="Business"
        subtitle="Your command center for side hustles and projects."
        actions={
          <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => openModal({ kind: 'project' })}>
            New project
          </Button>
        }
      />
      {live.length === 0 && filter !== 'archived' ? (
        <div className="card">
          <EmptyState icon={<Briefcase size={18} />} title="Start your first project" action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => openModal({ kind: 'project' })}>New project</Button>}>
            A project can be anything you’re building: a card show table, online card sales, car detailing, a digital product. Each gets tasks, milestones, contacts, notes and optional revenue tracking.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Active projects" value={live.filter((p) => p.status === 'active').length} sub={`${live.length} total`} />
            <Stat label="Open tasks" value={openTasks.length} sub={`${openTasks.filter((t) => t.dueDate && t.dueDate < today).length} overdue`} tone={openTasks.some((t) => t.dueDate && t.dueDate < today) ? 'warn' : undefined} />
            <Stat label="Revenue (tracked)" value={totals.tracked ? money(totals.revenue) : '—'} sub={totals.tracked ? `${money(totals.expenses)} expenses` : 'Enable per project'} />
            <Stat label="Profit (tracked)" value={totals.tracked ? money(totals.profit) : '—'} tone={totals.tracked ? (totals.profit >= 0 ? 'good' : 'bad') : undefined} />
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <Tabs
                className="mb-3"
                size="sm"
                value={filter}
                onChange={(v) => setQuery('status', v === 'all' ? null : v)}
                options={[{ value: 'all', label: 'All' }, ...PROJECT_STATUSES.map((s) => ({ value: s, label: cap(s), count: live.filter((p) => p.status === s).length })), { value: 'archived', label: 'Archived' }]}
              />
              {shown.length === 0 ? (
                <div className="card">
                  <EmptyState compact title="No projects here" />
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {shown.map((p) => (
                    <ProjectCard key={p.id} p={p} />
                  ))}
                </div>
              )}
            </div>
            <Card title="Upcoming milestones" icon={<CalendarClock size={15} />} className="h-fit">
              {milestones.length ? (
                <ol className="relative ml-1 border-l border-line pl-4">
                  {milestones.map(({ p, m }) => (
                    <li key={`${p.id}-${m.id}`} className="relative mb-3 last:mb-0">
                      <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-surface" style={{ background: p.color }} />
                      <a href={`#/business/${p.id}`} className="block hover:text-accent">
                        <p className="text-[13px] font-medium">{m.title}</p>
                        <p className="text-xs text-faint">
                          {p.name}
                          {m.dueDate && <span className={cn(m.dueDate < today && 'text-bad')}> · {formatRelativeDay(m.dueDate, today)}</span>}
                        </p>
                      </a>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState compact title="No open milestones">Add milestones inside a project to see a timeline here.</EmptyState>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function ProjectCard({ p }: { p: Project }) {
  const tasks = useStore((s) => s.tasks);
  const today = useToday();
  const prog = projectProgress(p, tasks);
  const open = projectOpenTasks(p, tasks).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const ms = nextMilestone(p);
  const fin = p.trackFinances ? projectFinances(p) : null;
  return (
    <a href={`#/business/${p.id}`} className="card flex flex-col p-4 transition-colors hover:border-line-strong">
      <div className="flex items-start gap-2.5">
        <span className="mt-1.5"><ColorDot color={p.color} size={10} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{p.name}</p>
          {p.description && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-faint">{p.description}</p>}
        </div>
        <Badge tone={STATUS_TONE[p.status]}>{cap(p.status)}</Badge>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <ProgressBar value={prog.pct} color={p.color} height={5} className="flex-1" />
        <span className="text-xs tabular-nums text-faint">{prog.pct === null ? '—' : `${Math.round(prog.pct)}%`}</span>
      </div>
      <div className="mt-3 space-y-1 text-xs">
        <p className="truncate text-muted">
          <span className="text-faint">Next action · </span>
          {open[0]?.title ?? p.nextAction ?? <span className="text-faint">none set</span>}
        </p>
        {ms && (
          <p className="truncate text-muted">
            <span className="text-faint">Milestone · </span>
            {ms.title}
            {ms.dueDate && <span className={cn('text-faint', ms.dueDate < today && '!text-bad')}> ({formatRelativeDay(ms.dueDate, today)})</span>}
          </p>
        )}
      </div>
      <div className="mt-auto flex items-center gap-3 pt-3 text-xs text-faint">
        <span>{plural(open.length, 'open task')}</span>
        {p.deadline && <span className={cn(p.deadline < today && p.status !== 'completed' && 'text-bad')}>Due {formatShort(p.deadline)}</span>}
        {fin && <span className={cn('ml-auto font-medium tabular-nums', fin.profit >= 0 ? 'text-good' : 'text-bad')}>{money(fin.profit)}</span>}
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------

function ProjectDetail({ id }: { id: string }) {
  const p = useStore((s) => s.projects.find((x) => x.id === id));
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const events = useStore((s) => s.events);
  const update = useStore((s) => s.update);
  const addTask = useStore((s) => s.addTask);
  const today = useToday();
  const [showDone, setShowDone] = useState(false);
  const [newTask, setNewTask] = useState('');
  if (!p)
    return (
      <div className="card">
        <EmptyState title="Project not found" action={<Button onClick={() => navigate('/business')}>Back to Business</Button>} />
      </div>
    );
  const prog = projectProgress(p, tasks);
  const linked = tasks.filter((t) => t.projectId === p.id && !t.archived);
  const open = linked.filter(isOpen).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const done = linked.filter((t) => t.status === 'done');
  const projectNotes = notes.filter((n) => !n.archived && n.links.some((l) => l.type === 'project' && l.id === p.id));
  const projectEvents = events.filter((e) => e.projectId === p.id && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const setP = (patch: Partial<Project>) => update('projects', p.id, patch);

  return (
    <div>
      <a href="#/business" className="mb-3 inline-block text-xs text-faint hover:text-fg">
        ← Business
      </a>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            <ColorDot color={p.color} size={12} />
            {p.name}
            {p.archived && <Badge>Archived</Badge>}
          </span>
        }
        subtitle={p.description}
        actions={
          <>
            <select className="input !h-8 !w-auto text-xs" value={p.status} onChange={(e) => setP({ status: e.target.value as ProjectStatus })} aria-label="Status">
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {cap(s)}
                </option>
              ))}
            </select>
            <Button size="sm" icon={<Pencil size={14} />} onClick={() => openModal({ kind: 'project', id: p.id })}>
              Edit
            </Button>
            <IconButton label={p.archived ? 'Unarchive project' : 'Archive project'} variant="secondary" onClick={() => (setP({ archived: !p.archived }), toast.info(p.archived ? 'Project restored' : 'Project archived'))}>
              <Archive size={15} />
            </IconButton>
            <IconButton
              label="Delete project"
              variant="secondary"
              className="hover:!text-bad"
              onClick={async () => {
                if (await confirmAction({ title: `Delete ${p.name}?`, message: `This permanently deletes the project and its ${plural(linked.length, 'task')}, milestones, contacts and transactions. Linked notes are kept. Archive it instead to keep the history.` })) {
                  useStore.getState().deleteProject(p.id);
                  navigate('/business');
                  toast.info('Project deleted');
                }
              }}
            >
              <Trash2 size={15} />
            </IconButton>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card px-4 py-3.5">
          <p className="text-xs text-muted">Progress</p>
          <p className="mt-1 text-xl font-semibold">{prog.pct === null ? '—' : `${Math.round(prog.pct)}%`}</p>
          <ProgressBar value={prog.pct} color={p.color} className="mt-2" height={4} />
          <p className="mt-1 text-xs text-faint">{prog.label}</p>
        </div>
        <Stat label="Deadline" value={p.deadline ? formatShort(p.deadline) : '—'} sub={p.deadline ? (daysBetween(today, p.deadline) >= 0 ? `${plural(daysBetween(today, p.deadline), 'day')} left` : 'Passed') : 'No deadline'} tone={p.deadline && p.deadline < today && p.status !== 'completed' ? 'bad' : undefined} />
        <Stat label="Open tasks" value={open.length} sub={`${done.length} done`} />
        <div className="card px-4 py-3.5">
          <p className="text-xs text-muted">Next action</p>
          <p className="mt-1 line-clamp-2 text-[13px] font-medium">{open[0]?.title ?? p.nextAction ?? <span className="font-normal text-faint">Add a task or set a next action</span>}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card
            title={`Tasks · ${open.length}`}
            action={
              <Button size="xs" variant="ghost" onClick={() => setShowDone((v) => !v)}>
                {showDone ? 'Hide' : 'Show'} done ({done.length})
              </Button>
            }
          >
            <TaskList tasks={showDone ? [...open, ...done] : open} context={false} empty={<p className="py-2 text-[13px] text-faint">No open tasks. Add the next step below.</p>} />
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTask.trim()) return;
                addTask({ title: newTask.trim(), projectId: p.id, category: 'Business' });
                setNewTask('');
              }}
            >
              <input className="input" value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a task to this project" aria-label="New project task" />
              <Button type="submit" icon={<Plus size={14} />}>
                Add
              </Button>
              <Button variant="ghost" onClick={() => openModal({ kind: 'task', defaults: { projectId: p.id, category: 'Business' } })}>
                More…
              </Button>
            </form>
          </Card>
          <Milestones p={p} />
          {p.trackFinances ? (
            <Finances p={p} />
          ) : (
            <div className="card flex flex-wrap items-center gap-3 p-4">
              <DollarSign size={16} className="text-faint" />
              <p className="flex-1 text-[13px] text-muted">Track revenue and expenses for this project?</p>
              <Button size="sm" onClick={() => setP({ trackFinances: true })}>
                Enable finances
              </Button>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <Contacts p={p} />
          <Ideas p={p} notes={projectNotes} />
          {projectEvents.length > 0 && (
            <Card title="Upcoming events" icon={<CalendarClock size={15} />}>
              {projectEvents.slice(0, 5).map((e) => (
                <button key={e.id} type="button" onClick={() => openModal({ kind: 'event', id: e.id })} className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-[13px] hover:bg-surface-2">
                  <span className="w-16 text-xs text-faint">{formatRelativeDay(e.date, today)}</span>
                  <span className="truncate">{e.title}</span>
                </button>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Milestones({ p }: { p: Project }) {
  const update = useStore((s) => s.update);
  const tasks = useStore((s) => s.tasks);
  const today = useToday();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const set = (milestones: Project['milestones']) => update('projects', p.id, { milestones });
  const sorted = [...p.milestones].sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  return (
    <Card title={`Milestones · ${p.milestones.filter((m) => m.done).length}/${p.milestones.length}`}>
      {sorted.length === 0 && <p className="mb-2 text-[13px] text-faint">Break the project into checkpoints — e.g. “Book table”, “Inventory priced”, “Show day”.</p>}
      <div className="space-y-0.5">
        {sorted.map((m) => {
          const count = tasks.filter((t) => t.milestoneId === m.id && !t.archived);
          return (
            <div key={m.id} className="group flex items-center gap-3 rounded-lg px-1 py-1.5">
              <input type="checkbox" checked={m.done} onChange={(e) => set(p.milestones.map((x) => (x.id === m.id ? { ...x, done: e.target.checked } : x)))} className="h-4 w-4 accent-[rgb(var(--accent))]" aria-label={`Done: ${m.title}`} />
              <span className={cn('min-w-0 flex-1 truncate text-[13px]', m.done && 'text-faint line-through')}>{m.title}</span>
              {count.length > 0 && <span className="text-xs text-faint">{count.filter((t) => t.status === 'done').length}/{count.length} tasks</span>}
              <input
                type="date"
                className="input !h-7 !w-[132px] text-xs"
                value={m.dueDate ?? ''}
                onChange={(e) => set(p.milestones.map((x) => (x.id === m.id ? { ...x, dueDate: e.target.value || undefined } : x)))}
                aria-label={`Due date for ${m.title}`}
              />
              {m.dueDate && !m.done && m.dueDate < today && <Badge tone="bad">Late</Badge>}
              <IconButton
                label="Delete milestone"
                size="xs"
                className="opacity-0 group-hover:opacity-100"
                onClick={async () => {
                  if (await confirmAction({ title: 'Delete milestone?', message: `“${m.title}” will be removed. Tasks linked to it are kept.` })) {
                    set(p.milestones.filter((x) => x.id !== m.id));
                    for (const t of tasks.filter((t) => t.milestoneId === m.id)) update('tasks', t.id, { milestoneId: undefined });
                  }
                }}
              >
                <X size={13} />
              </IconButton>
            </div>
          );
        })}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          set([...p.milestones, { id: uid('ms'), title: title.trim(), dueDate: date || undefined, done: false }]);
          setTitle('');
          setDate('');
        }}
      >
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New milestone" aria-label="New milestone" />
        <input type="date" className="input !w-[150px]" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Milestone date" />
        <Button type="submit" icon={<Plus size={14} />}>
          Add
        </Button>
      </form>
    </Card>
  );
}

function Contacts({ p }: { p: Project }) {
  const update = useStore((s) => s.update);
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);
  const [err, setErr] = useState('');
  const save = () => {
    if (!editing?.name?.trim()) return setErr('Name is required');
    if (editing.email && !/^\S+@\S+\.\S+$/.test(editing.email)) return setErr('That email doesn’t look right');
    const c: Contact = { id: editing.id ?? uid('ct'), name: editing.name.trim(), role: opt(editing.role), email: opt(editing.email), phone: opt(editing.phone), notes: opt(editing.notes) };
    const exists = p.contacts.some((x) => x.id === c.id);
    update('projects', p.id, { contacts: exists ? p.contacts.map((x) => (x.id === c.id ? c : x)) : [...p.contacts, c] });
    setEditing(null);
    setErr('');
  };
  return (
    <Card title="Contacts" icon={<Users size={15} />} action={!editing && <IconButton label="Add contact" size="xs" onClick={() => setEditing({})}><Plus size={14} /></IconButton>}>
      {p.contacts.length === 0 && !editing && <p className="text-[13px] text-faint">Organizers, customers, suppliers, partners.</p>}
      <div className="space-y-2">
        {p.contacts.map((c) => (
          <div key={c.id} className="group rounded-xl border border-line p-2.5">
            <div className="flex items-start gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-muted">{c.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{c.name}</p>
                {c.role && <p className="truncate text-xs text-faint">{c.role}</p>}
              </div>
              <div className="flex opacity-0 group-hover:opacity-100">
                <IconButton label="Edit contact" size="xs" onClick={() => setEditing(c)}>
                  <Pencil size={13} />
                </IconButton>
                <IconButton
                  label="Delete contact"
                  size="xs"
                  onClick={async () => {
                    if (await confirmAction({ title: `Delete ${c.name}?` })) update('projects', p.id, { contacts: p.contacts.filter((x) => x.id !== c.id) });
                  }}
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>
            </div>
            {(c.email || c.phone) && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 pl-10 text-xs">
                {c.email && (
                  <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-muted hover:text-accent">
                    <Mail size={12} />
                    {c.email}
                  </a>
                )}
                {c.phone && (
                  <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 text-muted hover:text-accent">
                    <Phone size={12} />
                    {c.phone}
                  </a>
                )}
              </div>
            )}
            {c.notes && <p className="mt-1.5 pl-10 text-xs text-faint">{c.notes}</p>}
          </div>
        ))}
      </div>
      {editing && (
        <div className="mt-2 space-y-2 rounded-xl border border-line-strong p-3">
          <input className="input" placeholder="Name" value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus aria-label="Name" />
          <input className="input" placeholder="Role (e.g. organizer)" value={editing.role ?? ''} onChange={(e) => setEditing({ ...editing, role: e.target.value })} aria-label="Role" />
          <div className="grid grid-cols-2 gap-2">
            <input className="input" type="email" placeholder="Email" value={editing.email ?? ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} aria-label="Email" />
            <input className="input" type="tel" placeholder="Phone" value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} aria-label="Phone" />
          </div>
          <textarea className="input" rows={2} placeholder="Notes" value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} aria-label="Notes" />
          {err && <p className="text-xs text-bad">{err}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => (setEditing(null), setErr(''))}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={save}>
              Save contact
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Ideas({ p, notes }: { p: Project; notes: ReturnType<typeof useStore.getState>['notes'] }) {
  const create = useStore((s) => s.create);
  const [idea, setIdea] = useState('');
  return (
    <Card title="Notes & ideas" icon={<Lightbulb size={15} />}>
      <div className="space-y-1">
        {notes.map((n) => (
          <a key={n.id} href={`#/notes/${n.id}`} className="block rounded-lg px-2 py-1.5 hover:bg-surface-2">
            <p className="truncate text-[13px]">{n.title || 'Untitled'}</p>
            {n.content && <p className="truncate text-xs text-faint">{n.content.replace(/[#*\-[\]]/g, '').slice(0, 80)}</p>}
          </a>
        ))}
        {notes.length === 0 && <p className="text-[13px] text-faint">Capture ideas, checklists and meeting notes for this project.</p>}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!idea.trim()) return;
          create('notes', { title: idea.trim().slice(0, 200), content: '', folder: 'Ideas', tags: ['idea'], pinned: false, isTemplate: false, links: [{ type: 'project', id: p.id }], archived: false });
          setIdea('');
          toast.success('Idea saved to Notes');
        }}
      >
        <input className="input" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Quick idea…" aria-label="Quick idea" />
        <IconButton type="submit" label="Save idea" variant="secondary" size="md">
          <Plus size={15} />
        </IconButton>
      </form>
    </Card>
  );
}

function Finances({ p }: { p: Project }) {
  const update = useStore((s) => s.update);
  const today = useToday();
  const [tx, setTx] = useState<{ type: Transaction['type']; amount: string; description: string; date: string; category: string }>({ type: 'revenue', amount: '', description: '', date: today, category: '' });
  const [err, setErr] = useState('');
  const fin = projectFinances(p);
  const sorted = [...p.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of p.transactions) {
      const k = t.date.slice(0, 7);
      m.set(k, (m.get(k) ?? 0) + (t.type === 'revenue' ? t.amount : 0));
    }
    const months: string[] = [];
    const d = fromISO(today);
    for (let i = 5; i >= 0; i--) months.push(format(new Date(d.getFullYear(), d.getMonth() - i, 1), 'yyyy-MM'));
    return months.map((k) => ({ key: k, label: format(fromISO(`${k}-01`), 'MMM'), value: Math.round((m.get(k) ?? 0) * 100) / 100, highlight: k === today.slice(0, 7) }));
  }, [p.transactions, today]);

  const add = () => {
    const amount = optNum(tx.amount);
    if (!tx.description.trim()) return setErr('Add a description');
    if (amount === undefined || amount <= 0) return setErr('Enter an amount above 0');
    if (!tx.date) return setErr('Pick a date');
    update('projects', p.id, { transactions: [...p.transactions, { id: uid('tx'), type: tx.type, amount: Math.round(amount * 100) / 100, description: tx.description.trim(), date: tx.date, category: opt(tx.category) }] });
    setTx({ ...tx, amount: '', description: '', category: '' });
    setErr('');
  };

  const exportCsv = () => {
    const rows = [['Date', 'Type', 'Amount', 'Description', 'Category'], ...sorted.map((t) => [t.date, t.type, t.amount, t.description, t.category])];
    downloadFile(`${p.name.replace(/\W+/g, '-').toLowerCase()}-transactions.csv`, rows.map((r) => r.map(csvEscape).join(',')).join('\n'), 'text/csv');
  };

  return (
    <Card
      title="Finances"
      icon={<DollarSign size={15} />}
      action={
        <div className="flex gap-1">
          <IconButton label="Export transactions CSV" size="xs" onClick={exportCsv} disabled={!sorted.length}>
            <Download size={13} />
          </IconButton>
          <Button size="xs" variant="ghost" onClick={() => update('projects', p.id, { trackFinances: false })} title="Hide finances (transactions are kept)">
            Hide
          </Button>
        </div>
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-xs text-faint">Revenue</p>
          <p className="text-lg font-semibold tabular-nums">{money(fin.revenue)}</p>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-xs text-faint">Expenses</p>
          <p className="text-lg font-semibold tabular-nums">{money(fin.expenses)}</p>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-xs text-faint">Profit</p>
          <p className={cn('text-lg font-semibold tabular-nums', fin.profit >= 0 ? 'text-good' : 'text-bad')}>{money(fin.profit)}</p>
        </div>
      </div>
      {p.transactions.some((t) => t.type === 'revenue') && (
        <div className="mb-4">
          <p className="mb-2 text-xs text-faint">Revenue by month</p>
          <ColumnChart data={byMonth} height={90} label="Revenue by month" format={(n) => money(n)} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[110px_110px_1fr_130px_auto]">
        <select className="input" value={tx.type} onChange={(e) => setTx({ ...tx, type: e.target.value as Transaction['type'] })} aria-label="Type">
          <option value="revenue">Revenue</option>
          <option value="expense">Expense</option>
        </select>
        <input className="input" type="number" min={0} step={0.01} placeholder="Amount" value={tx.amount} onChange={(e) => setTx({ ...tx, amount: e.target.value })} aria-label="Amount" />
        <input className="input col-span-2 sm:col-span-1" placeholder="Description" value={tx.description} onChange={(e) => setTx({ ...tx, description: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="Description" />
        <input className="input" type="date" value={tx.date} onChange={(e) => setTx({ ...tx, date: e.target.value })} aria-label="Date" />
        <Button onClick={add} icon={<Plus size={14} />}>
          Add
        </Button>
      </div>
      {err && <p className="mt-1 text-xs text-bad">{err}</p>}
      {sorted.length > 0 && (
        <div className="mt-3 max-h-72 overflow-y-auto">
          <table className="w-full text-[13px]">
            <tbody>
              {sorted.map((t) => (
                <tr key={t.id} className="group border-t border-line">
                  <td className="w-20 py-2 text-xs text-faint">{formatShort(t.date)}</td>
                  <td className="py-2">
                    {t.description}
                    {t.category && <span className="ml-2 text-xs text-faint">{t.category}</span>}
                  </td>
                  <td className={cn('py-2 text-right font-medium tabular-nums', t.type === 'revenue' ? 'text-good' : 'text-muted')}>
                    {t.type === 'revenue' ? '+' : '−'}
                    {money(t.amount)}
                  </td>
                  <td className="w-8 py-2 text-right">
                    <IconButton
                      label="Delete transaction"
                      size="xs"
                      className="opacity-0 group-hover:opacity-100"
                      onClick={async () => {
                        if (await confirmAction({ title: 'Delete transaction?', message: `${t.description} · ${money(t.amount)}` })) update('projects', p.id, { transactions: p.transactions.filter((x) => x.id !== t.id) });
                      }}
                    >
                      <X size={13} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
