import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Flame,
  GraduationCap,
  Info,
  Plus,
  Sparkles,
  Star,
  Target,
  X,
} from 'lucide-react';
import type { Task } from '@shared/schema';
import { useStore } from '@/lib/store';
import { openModal } from '@/lib/ui';
import { useToday } from '@/lib/useToday';
import { addDaysISO, formatRelativeDay, formatShort, formatTime, timeToMinutes, weekStartISO, WEEKDAYS_SHORT, fromISO } from '@/lib/dates';
import { buildAlerts, dailyHabits, eventsInRange, priorityContext, todayCompletion, weekSummary } from '@/lib/insights';
import { isOpen, rankTasks } from '@/lib/priority';
import { currentStreak, isDoneOn, toggleCompletion, weekCount } from '@/lib/habits';
import { currentGpa, fmtGpa, letterGrade, overallAverage } from '@/lib/grades';
import { goalProgress, nextMilestone, projectOpenTasks, projectProgress } from '@/lib/progress';
import { cn, plural } from '@/lib/util';
import { toast } from '@/lib/toast';
import { Badge, Button, Checkbox, ColorDot, EmptyState, IconButton, ProgressBar, ProgressRing } from '@/components/ui/primitives';
import { TaskItem, toggleTopPriority } from '@/components/TaskItem';
import { ColumnChart } from '@/components/charts/Charts';

/** Subscribe to the whole store; widgets derive what they need with useMemo. */
const useAll = () => useStore((s) => s);

function InlineAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (title: string) => void }) {
  const [v, setV] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        onAdd(v.trim());
        setV('');
      }}
      className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-line px-2.5 transition-colors focus-within:border-line-strong"
    >
      <Plus size={14} className="shrink-0 text-faint" />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="h-9 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" aria-label={placeholder} />
    </form>
  );
}

const MoreLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} className="inline-flex items-center gap-1 text-xs text-faint hover:text-fg">
    {children} <ArrowRight size={12} />
  </a>
);

// ---------------------------------------------------------------------------

export function BriefingWidget() {
  const s = useAll();
  const today = useToday();
  const completion = useMemo(() => todayCompletion(s, today), [s, today]);
  const alerts = useMemo(() => buildAlerts(s, today), [s, today]);
  const next = useMemo(() => rankTasks(s.tasks, priorityContext(s, today))[0], [s, today]);
  const events = useMemo(() => eventsInRange(s.events, today, today), [s.events, today]);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const nextEvent = events.find((o) => o.event.startTime && timeToMinutes(o.event.endTime ?? o.event.startTime) >= nowMin);
  const overdueCount = s.tasks.filter((t) => isOpen(t) && t.dueDate && t.dueDate < today).length;

  const pct = completion.pct;
  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-stretch">
      <div className="flex items-center gap-4 md:w-[280px] md:shrink-0 md:border-r md:border-line md:pr-5">
        <ProgressRing value={pct} size={84} stroke={7} label={`Today ${pct === null ? 'no items' : `${Math.round(pct)}% complete`}`}>
          <div className="text-center">
            <p className="text-lg font-semibold leading-5 tabular-nums">{pct === null ? '—' : `${Math.round(pct)}%`}</p>
            <p className="text-[10px] text-faint">today</p>
          </div>
        </ProgressRing>
        <div className="min-w-0 space-y-1.5 text-[13px]">
          <p className="text-muted">
            <span className="font-semibold text-fg tabular-nums">
              {completion.tasks.done}/{completion.tasks.total}
            </span>{' '}
            tasks done
          </p>
          <p className="text-muted">
            <span className="font-semibold text-fg tabular-nums">
              {completion.habits.done}/{completion.habits.total}
            </span>{' '}
            habits checked
          </p>
          {overdueCount > 0 ? (
            <p className="font-medium text-bad">{plural(overdueCount, 'overdue item')}</p>
          ) : (
            <p className="text-good">Nothing overdue</p>
          )}
        </div>
      </div>

      <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="eyebrow mb-2">Focus next</p>
          {next ? (
            <button type="button" onClick={() => openModal({ kind: 'task', id: next.task.id })} className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-line-strong">
              <p className="truncate text-[13.5px] font-medium">{next.task.title}</p>
              <p className="mt-0.5 truncate text-xs text-faint">{next.p.reasons.join(' · ') || 'Highest priority open task'}</p>
            </button>
          ) : (
            <p className="text-[13px] text-faint">No open tasks. Add one with the New button.</p>
          )}
          <p className="eyebrow mb-1.5 mt-4">Next on your calendar</p>
          {nextEvent ? (
            <p className="truncate text-[13px]">
              <span className="font-medium tabular-nums text-accent">{formatTime(nextEvent.event.startTime)}</span> <span className="text-muted">{nextEvent.event.title}</span>
            </p>
          ) : (
            <p className="text-[13px] text-faint">Nothing else scheduled today.</p>
          )}
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <p className="eyebrow">Alerts</p>
            {alerts.length > 4 && <span className="text-xs text-faint">+{alerts.length - 4} more</span>}
          </div>
          {alerts.length === 0 ? (
            <p className="text-[13px] text-faint">You’re all caught up.</p>
          ) : (
            <ul className="space-y-1">
              {alerts.slice(0, 4).map((a) => (
                <li key={a.id}>
                  <a href={a.href} className="flex items-start gap-2 rounded-lg py-1 text-[13px] hover:text-fg">
                    <span className={cn('mt-0.5 shrink-0', a.level === 'critical' ? 'text-bad' : a.level === 'warning' ? 'text-warn' : 'text-accent')}>
                      {a.level === 'info' ? <Info size={14} /> : <AlertTriangle size={14} />}
                    </span>
                    <span className="min-w-0 truncate text-muted">{a.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="#/habits?tab=plan">
              <Button size="xs" icon={<CalendarClock size={13} />}>
                Plan my day
              </Button>
            </a>
            <a href="#/assistant">
              <Button size="xs" icon={<Sparkles size={13} />}>
                Ask assistant
              </Button>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function PrioritiesWidget() {
  const s = useAll();
  const today = useToday();
  const plan = s.dayPlans.find((p) => p.date === today);
  const top = (plan?.topTaskIds ?? []).map((id) => s.tasks.find((t) => t.id === id)).filter(Boolean) as Task[];
  const suggestions = useMemo(
    () => rankTasks(s.tasks, priorityContext(s, today)).filter((r) => !plan?.topTaskIds.includes(r.task.id)).slice(0, 3 - top.length),
    [s, today, plan, top.length],
  );
  return (
    <div>
      {plan?.intention && <p className="mb-2 text-[13px] italic text-muted">“{plan.intention}”</p>}
      {top.length === 0 && <p className="mb-1 text-[13px] text-faint">Pick the three things that would make today a win.</p>}
      <div className="-mx-2.5">
        {top.map((t, i) => (
          <div key={t.id} className="flex items-center">
            <span className="w-5 shrink-0 pl-2.5 text-xs font-semibold tabular-nums text-faint">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <TaskItem task={t} compact />
            </div>
          </div>
        ))}
      </div>
      {top.length < 3 && suggestions.length > 0 && (
        <div className="mt-2">
          <p className="eyebrow mb-1">Suggested</p>
          {suggestions.map(({ task, p }) => (
            <div key={task.id} className="group flex items-center gap-2 rounded-lg py-1">
              <IconButton label={`Add “${task.title}” to top 3`} size="xs" onClick={() => toggleTopPriority(task.id, today)} className="hover:!text-warn">
                <Star size={14} />
              </IconButton>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-muted">{task.title}</p>
                <p className="truncate text-[11px] text-faint">{p.reasons.slice(0, 2).join(' · ')}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {top.length < 3 && (
        <InlineAdd
          placeholder="Add a priority for today"
          onAdd={(title) => {
            const t = s.addTask({ title, dueDate: today, priority: 'high' });
            toggleTopPriority(t.id, today);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ScheduleWidget() {
  const events = useStore((s) => s.events);
  const tasks = useStore((s) => s.tasks);
  const today = useToday();
  const dayPlan = useStore((s) => s.dayPlans.find((p) => p.date === today));
  const items = useMemo(() => {
    const list: { key: string; time?: string; end?: string; title: string; sub?: string; color?: string; onClick: () => void; kind: string }[] = [];
    for (const o of eventsInRange(events, today, today))
      list.push({ key: `e-${o.event.id}`, time: o.event.startTime, end: o.event.endTime, title: o.event.title, sub: o.event.location, color: o.event.color, onClick: () => openModal({ kind: 'event', id: o.event.id }), kind: 'event' });
    for (const t of tasks)
      if (t.dueDate === today && t.dueTime && isOpen(t)) list.push({ key: `t-${t.id}`, time: t.dueTime, title: t.title, sub: 'Due', onClick: () => openModal({ kind: 'task', id: t.id }), kind: 'task' });
    for (const b of dayPlan?.timeBlocks ?? []) {
      const task = b.taskId ? tasks.find((t) => t.id === b.taskId) : undefined;
      if (b.taskId && (!task || task.status === 'done')) continue;
      list.push({ key: `b-${b.id}`, time: b.start, end: b.end, title: b.label, sub: 'Planned', onClick: () => (task ? openModal({ kind: 'task', id: task.id }) : (window.location.hash = '#/habits?tab=plan')), kind: 'block' });
    }
    return list.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  }, [events, tasks, today, dayPlan]);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (!items.length)
    return (
      <EmptyState compact icon={<CalendarDays size={18} />} title="Nothing scheduled today" action={<Button size="sm" icon={<Plus size={14} />} onClick={() => openModal({ kind: 'event', date: today })}>Add event</Button>}>
        Add classes, shifts or practices as repeating events.
      </EmptyState>
    );
  return (
    <ol className="relative space-y-0.5">
      {items.map((it) => {
        const past = it.time && timeToMinutes(it.end ?? it.time) < nowMin;
        const current = it.time && it.end && timeToMinutes(it.time) <= nowMin && timeToMinutes(it.end) >= nowMin;
        return (
          <li key={it.key}>
            <button type="button" onClick={it.onClick} className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2', past && 'opacity-50')}>
              <span className="w-16 shrink-0 text-xs tabular-nums text-faint">{it.time ? formatTime(it.time) : 'All day'}</span>
              <span className={cn('h-8 w-[3px] shrink-0 rounded-full', current && 'animate-pulse')} style={{ background: it.color ?? (it.kind === 'task' ? 'rgb(var(--warn))' : it.kind === 'block' ? 'rgb(var(--line-strong))' : 'rgb(var(--accent))') }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{it.title}</span>
                <span className="block truncate text-[11px] text-faint">
                  {it.end ? `until ${formatTime(it.end)}` : ''}
                  {it.sub ? `${it.end ? ' · ' : ''}${it.sub}` : ''}
                </span>
              </span>
              {current && <Badge tone="accent">Now</Badge>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------

export function TasksWidget() {
  const s = useAll();
  const today = useToday();
  const ranked = useMemo(() => rankTasks(s.tasks, priorityContext(s, today)), [s, today]);
  const overdue = ranked.filter((r) => r.task.dueDate && r.task.dueDate < today);
  const dueToday = ranked.filter((r) => r.task.dueDate === today);
  const doneToday = s.tasks.filter((t) => t.status === 'done' && t.dueDate === today);
  const list = [...overdue, ...dueToday];
  return (
    <div>
      {list.length === 0 && doneToday.length === 0 ? (
        <EmptyState compact icon={<Target size={18} />} title="Nothing due today">
          Tasks and assignments due today and anything overdue will appear here.
        </EmptyState>
      ) : (
        <>
          {overdue.length > 0 && <p className="eyebrow mb-1 !text-bad">Overdue · {overdue.length}</p>}
          <div className="-mx-2.5">
            {overdue.slice(0, 5).map((r) => (
              <TaskItem key={r.task.id} task={r.task} compact />
            ))}
          </div>
          {dueToday.length > 0 && <p className="eyebrow mb-1 mt-2">Today · {dueToday.length}</p>}
          <div className="-mx-2.5">
            {dueToday.slice(0, 6).map((r) => (
              <TaskItem key={r.task.id} task={r.task} compact />
            ))}
            {doneToday.slice(0, 3).map((t) => (
              <TaskItem key={t.id} task={t} compact />
            ))}
          </div>
          {overdue.length + dueToday.length > 11 && <MoreLink href="#/tasks?view=today">See all</MoreLink>}
        </>
      )}
      <InlineAdd placeholder="Add a task for today" onAdd={(title) => (s.addTask({ title, dueDate: today }), toast.success('Added for today'))} />
    </div>
  );
}

// ---------------------------------------------------------------------------

export function HabitsWidget() {
  const habits = useStore((s) => s.habits);
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const update = useStore((s) => s.update);
  const today = useToday();
  const daily = dailyHabits(habits, today).sort((a, b) => a.order - b.order);
  const weekly = habits.filter((h) => !h.archived && h.frequency === 'weekly');
  const week = weekStartISO(today, weekStartsOn);
  if (!daily.length && !weekly.length)
    return (
      <EmptyState compact icon={<Flame size={18} />} title="No habits yet" action={<Button size="sm" icon={<Plus size={14} />} onClick={() => openModal({ kind: 'habit' })}>Add a habit</Button>}>
        Build your own routine — daily, weekdays only, or a few times a week.
      </EmptyState>
    );
  return (
    <div className="space-y-0.5">
      {[...daily, ...weekly].map((h) => {
        const done = isDoneOn(h, today);
        const streak = currentStreak(h, today, weekStartsOn);
        const count = h.frequency === 'weekly' ? weekCount(h, week) : 0;
        return (
          <div key={h.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
            <Checkbox checked={done} onChange={() => update('habits', h.id, { completions: toggleCompletion(h, today) })} label={`${done ? 'Uncheck' : 'Check'} ${h.name}`} color={h.color} size={20} />
            <span className="w-5 text-center text-sm">{h.icon}</span>
            <span className={cn('min-w-0 flex-1 truncate text-[13px]', done && 'text-muted')}>{h.name}</span>
            {h.frequency === 'weekly' ? (
              <span className="text-xs tabular-nums text-faint">
                {count}/{h.targetPerWeek} wk
              </span>
            ) : null}
            {streak > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs tabular-nums text-warn" title={`${streak} ${h.frequency === 'weekly' ? 'week' : 'day'} streak`}>
                <Flame size={12} />
                {streak}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function GoalsWidget() {
  const goals = useStore((s) => s.goals);
  const tasks = useStore((s) => s.tasks);
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const today = useToday();
  const week = weekStartISO(today, weekStartsOn);
  const weekly = goals.filter((g) => g.horizon === 'weekly' && g.weekStart === week && g.status !== 'dropped');
  const longer = goals.filter((g) => g.horizon !== 'weekly' && g.status === 'active').slice(0, 2);
  const overall = weekly.length ? weekly.reduce((n, g) => n + (goalProgress(g, tasks).pct ?? 0), 0) / weekly.length : null;
  return (
    <div className="space-y-3">
      {weekly.length === 0 ? (
        <EmptyState compact icon={<Target size={18} />} title="No goals for this week" action={<Button size="sm" icon={<Plus size={14} />} onClick={() => openModal({ kind: 'goal', horizon: 'weekly' })}>Set a weekly goal</Button>} />
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <p className="text-xs text-faint">Week of {formatShort(week)}</p>
            <p className="text-xs text-muted">
              <span className="font-semibold tabular-nums text-fg">{Math.round(overall ?? 0)}%</span> overall
            </p>
          </div>
          {weekly.map((g) => {
            const p = goalProgress(g, tasks);
            return (
              <button key={g.id} type="button" onClick={() => openModal({ kind: 'goal', id: g.id })} className="block w-full text-left">
                <div className="mb-1 flex items-center justify-between gap-2 text-[13px]">
                  <span className={cn('truncate', g.status === 'achieved' && 'text-muted line-through')}>{g.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-faint">{p.label}</span>
                </div>
                <ProgressBar value={p.pct} color={p.pct === 100 ? 'rgb(var(--good))' : undefined} />
              </button>
            );
          })}
        </>
      )}
      {longer.length > 0 && (
        <div className="border-t border-line pt-3">
          <p className="eyebrow mb-2">Bigger goals</p>
          {longer.map((g) => {
            const p = goalProgress(g, tasks);
            return (
              <div key={g.id} className="mb-2 flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{g.title}</span>
                <ProgressBar value={p.pct} className="!w-20" />
                <span className="w-9 text-right text-xs tabular-nums text-faint">{p.pct === null ? '—' : `${Math.round(p.pct)}%`}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function GradesWidget() {
  const classes = useStore((s) => s.classes);
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const active = classes.filter((c) => !c.archived);
  const gpa = useMemo(() => currentGpa(active, tasks, settings.markingPeriods, settings.gpaScale), [active, tasks, settings]);
  if (!active.length)
    return (
      <EmptyState compact icon={<GraduationCap size={18} />} title="No classes yet" action={<Button size="sm" icon={<Plus size={14} />} onClick={() => openModal({ kind: 'class' })}>Add a class</Button>}>
        Add your classes to track assignments and grades.
      </EmptyState>
    );
  return (
    <div>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="text-xs text-faint">{settings.gpaScale === 'weighted' ? 'Weighted' : 'Unweighted'} GPA</p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{fmtGpa(gpa.gpa)}</p>
        </div>
        {settings.gpaGoal !== undefined && gpa.gpa !== null && (
          <Badge tone={gpa.gpa >= settings.gpaGoal ? 'good' : 'warn'}>
            Goal {settings.gpaGoal.toFixed(2)} · {gpa.gpa >= settings.gpaGoal ? 'on track' : `${(settings.gpaGoal - gpa.gpa).toFixed(2)} to go`}
          </Badge>
        )}
      </div>
      <div className="space-y-2">
        {active.map((c) => {
          const a = overallAverage(c, tasks, settings.markingPeriods);
          const below = c.targetGrade !== undefined && a.average !== null && a.average < c.targetGrade;
          return (
            <a key={c.id} href={`#/school/class/${c.id}`} className="flex items-center gap-2.5 rounded-lg py-0.5 hover:text-fg">
              <ColorDot color={c.color} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{c.name}</span>
              <ProgressBar value={a.average} color={c.color} className="!w-16" height={4} />
              <span className={cn('w-12 text-right text-[13px] font-medium tabular-nums', below && 'text-warn')}>{a.average === null ? '—' : `${a.average.toFixed(1)}`}</span>
              <span className="w-6 text-xs text-faint">{letterGrade(a.average)}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ProjectsWidget() {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const today = useToday();
  const active = projects.filter((p) => !p.archived && (p.status === 'active' || p.status === 'planning'));
  if (!active.length)
    return (
      <EmptyState compact title="No active projects" action={<Button size="sm" icon={<Plus size={14} />} onClick={() => openModal({ kind: 'project' })}>New project</Button>}>
        Track side hustles — card sales, detailing, digital products.
      </EmptyState>
    );
  return (
    <div className="space-y-3">
      {active.slice(0, 4).map((p) => {
        const prog = projectProgress(p, tasks);
        const ms = nextMilestone(p);
        const open = projectOpenTasks(p, tasks).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
        const nextAction = open[0]?.title ?? p.nextAction;
        return (
          <a key={p.id} href={`#/business/${p.id}`} className="block rounded-xl border border-line p-3 transition-colors hover:border-line-strong hover:bg-surface-2">
            <div className="flex items-center gap-2">
              <ColorDot color={p.color} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{p.name}</span>
              <span className="text-xs tabular-nums text-faint">{prog.pct === null ? '—' : `${Math.round(prog.pct)}%`}</span>
            </div>
            <ProgressBar value={prog.pct} color={p.color} className="mt-2" height={4} />
            <div className="mt-2 space-y-0.5 text-xs text-faint">
              {nextAction && (
                <p className="truncate">
                  <span className="text-muted">Next:</span> {nextAction}
                </p>
              )}
              {ms && (
                <p className="truncate">
                  <span className="text-muted">Milestone:</span> {ms.title}
                  {ms.dueDate && <span className={cn(ms.dueDate < today && 'text-bad')}> · {formatRelativeDay(ms.dueDate, today)}</span>}
                </p>
              )}
            </div>
          </a>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function DeadlinesWidget() {
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const classes = useStore((s) => s.classes);
  const today = useToday();
  const end = addDaysISO(today, 14);
  const items = useMemo(() => {
    const out: { key: string; date: string; title: string; sub?: string; color?: string; onClick: () => void; overdue: boolean }[] = [];
    for (const t of tasks) {
      if (!isOpen(t) || !t.dueDate || t.dueDate > end) continue;
      const cls = classes.find((c) => c.id === t.classId);
      const prj = projects.find((p) => p.id === t.projectId);
      out.push({ key: t.id, date: t.dueDate, title: t.title, sub: cls?.name ?? prj?.name, color: cls?.color ?? prj?.color, onClick: () => openModal({ kind: 'task', id: t.id }), overdue: t.dueDate < today });
    }
    for (const p of projects) {
      if (p.archived) continue;
      for (const m of p.milestones)
        if (!m.done && m.dueDate && m.dueDate <= end) out.push({ key: `${p.id}-${m.id}`, date: m.dueDate, title: `◆ ${m.title}`, sub: p.name, color: p.color, onClick: () => (window.location.hash = `#/business/${p.id}`), overdue: m.dueDate < today });
      if (p.deadline && p.deadline >= today && p.deadline <= end && p.status !== 'completed')
        out.push({ key: `${p.id}-dl`, date: p.deadline, title: `Deadline: ${p.name}`, color: p.color, onClick: () => (window.location.hash = `#/business/${p.id}`), overdue: false });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [tasks, projects, classes, today, end]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof items>();
    for (const it of items) {
      const k = it.overdue ? 'overdue' : it.date;
      m.set(k, [...(m.get(k) ?? []), it]);
    }
    return [...m.entries()];
  }, [items]);
  if (!items.length)
    return (
      <EmptyState compact icon={<CalendarClock size={18} />} title="No deadlines in the next 2 weeks">
        Anything with a due date — assignments, business tasks, milestones — shows up here.
      </EmptyState>
    );
  return (
    <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1">
      {groups.slice(0, 8).map(([k, list]) => (
        <div key={k}>
          <p className={cn('eyebrow mb-1', k === 'overdue' && '!text-bad')}>{k === 'overdue' ? 'Overdue' : `${formatRelativeDay(k, today)} · ${WEEKDAYS_SHORT[fromISO(k).getDay()]} ${formatShort(k)}`}</p>
          {list.map((it) => (
            <button key={it.key} type="button" onClick={it.onClick} className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-surface-2">
              <ColorDot color={it.color} size={7} />
              <span className="min-w-0 flex-1 truncate text-[13px]">{it.title}</span>
              {it.sub && <span className="max-w-[40%] truncate text-xs text-faint">{it.sub}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function RemindersWidget() {
  const reminders = useStore((s) => s.reminders);
  const update = useStore((s) => s.update);
  const create = useStore((s) => s.create);
  const remove = useStore((s) => s.remove);
  const today = useToday();
  const open = reminders.filter((r) => !r.done).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  return (
    <div>
      {open.length === 0 && <p className="py-2 text-[13px] text-faint">No reminders. Jot down anything you need to remember.</p>}
      <div className="space-y-0.5">
        {open.map((r) => (
          <div key={r.id} className="group flex items-center gap-2.5 rounded-lg px-1 py-1">
            <Checkbox
              checked={false}
              onChange={() => {
                update('reminders', r.id, { done: true });
                toast.info('Reminder done', { label: 'Undo', run: () => update('reminders', r.id, { done: false }) });
              }}
              label={`Done: ${r.title}`}
              round
              size={16}
            />
            <span className="min-w-0 flex-1 truncate text-[13px]">{r.title}</span>
            {r.date && <span className={cn('text-xs', r.date < today ? 'text-bad' : r.date === today ? 'text-accent' : 'text-faint')}>{formatRelativeDay(r.date, today)}</span>}
            <IconButton label="Delete reminder" size="xs" className="opacity-0 group-hover:opacity-100" onClick={() => remove('reminders', r.id)}>
              <X size={13} />
            </IconButton>
          </div>
        ))}
      </div>
      <InlineAdd placeholder="Add a reminder" onAdd={(title) => create('reminders', { title, done: false })} />
    </div>
  );
}

// ---------------------------------------------------------------------------

export function WeekWidget() {
  const s = useAll();
  const today = useToday();
  const week = weekStartISO(today, s.settings.weekStartsOn);
  const summary = useMemo(() => weekSummary(s, week), [s, week]);
  const data = summary.days.map((d) => ({
    key: d.date,
    label: WEEKDAYS_SHORT[fromISO(d.date).getDay()],
    value: d.tasksDone,
    detail: d.habitsDue ? `habits ${d.habitsDone}/${d.habitsDue}` : undefined,
    highlight: d.date === today,
  }));
  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-surface-2 py-2">
          <p className="text-lg font-semibold tabular-nums">{summary.completed.length}</p>
          <p className="text-[11px] text-faint">tasks done</p>
        </div>
        <div className="rounded-lg bg-surface-2 py-2">
          <p className="text-lg font-semibold tabular-nums">{summary.habitRate === null ? '—' : `${Math.round(summary.habitRate * 100)}%`}</p>
          <p className="text-[11px] text-faint">habit rate</p>
        </div>
        <div className="rounded-lg bg-surface-2 py-2">
          <p className={cn('text-lg font-semibold tabular-nums', summary.unfinished.length > 0 && 'text-warn')}>{summary.unfinished.length}</p>
          <p className="text-[11px] text-faint">still open</p>
        </div>
      </div>
      <p className="mb-2 text-xs text-faint">Tasks completed per day</p>
      <ColumnChart data={data} height={96} label="Tasks completed per day this week" format={(n) => plural(n, 'task')} />
      <div className="mt-3 flex justify-end">
        <MoreLink href="#/habits?tab=review">Weekly review</MoreLink>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const SCRATCH_ID = 'not_scratchpad';

export function QuickNoteWidget() {
  const note = useStore((s) => s.notes.find((n) => n.id === SCRATCH_ID));
  const [value, setValue] = useState(note?.content ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const save = (content: string) => {
    const st = useStore.getState();
    if (st.notes.some((n) => n.id === SCRATCH_ID)) st.update('notes', SCRATCH_ID, { content });
    else st.create('notes', { id: SCRATCH_ID, title: 'Scratchpad', content, folder: 'General', tags: [], pinned: false, isTemplate: false, links: [], archived: false });
  };
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          const v = e.target.value;
          timer.current = setTimeout(() => save(v), 500);
        }}
        rows={7}
        placeholder="Brain dump… saves automatically."
        className="input resize-none"
        aria-label="Scratchpad"
      />
      <div className="mt-1 flex justify-between text-[11px] text-faint">
        <span>Saved to Notes → General</span>
        <a href={`#/notes/${SCRATCH_ID}`} className="hover:text-fg">
          Open
        </a>
      </div>
    </div>
  );
}
