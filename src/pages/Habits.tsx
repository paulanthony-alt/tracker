import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Minus,
  NotebookPen,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Target,
  Trophy,
  Wand2,
  X,
} from 'lucide-react';
import type { Goal, Habit, TimeBlock } from '@shared/schema';
import { useStore } from '@/lib/store';
import { openModal } from '@/lib/ui';
import { setQuery, useRoute } from '@/lib/router';
import { useToday } from '@/lib/useToday';
import { addDaysISO, formatLong, formatRelativeDay, formatShort, formatTime, fromISO, isISODate, minutesToTime, rangeISO, timeToMinutes, todayISO, weekStartISO, WEEKDAYS_MIN, WEEKDAYS_SHORT } from '@/lib/dates';
import { bestStreak, completionRate, currentStreak, habitStartDate, isDoneOn, isScheduled, toggleCompletion, weekCount, dailyTotals } from '@/lib/habits';
import { goalProgress } from '@/lib/progress';
import { eventsInRange, planDay, weekSummary } from '@/lib/insights';
import { isOpen } from '@/lib/priority';
import { uid } from '@/lib/id';
import { cn, opt, pct, plural } from '@/lib/util';
import { toast } from '@/lib/toast';
import { Badge, Button, Card, Checkbox, EmptyState, IconButton, PageHeader, ProgressBar, Stat, Tabs } from '@/components/ui/primitives';
import { confirmAction } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { ColumnChart, HabitHeatmap } from '@/components/charts/Charts';
import { TaskItem, toggleTopPriority } from '@/components/TaskItem';

type Tab = 'habits' | 'goals' | 'journal' | 'plan' | 'review';

export function HabitsPage() {
  const route = useRoute();
  const tab = (route.query.get('tab') as Tab) || 'habits';
  return (
    <div>
      <PageHeader
        title="Habits & Goals"
        subtitle="Build routines, chase goals, reflect and plan."
        actions={
          tab === 'habits' ? (
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => openModal({ kind: 'habit' })}>
              Habit
            </Button>
          ) : tab === 'goals' ? (
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => openModal({ kind: 'goal' })}>
              Goal
            </Button>
          ) : undefined
        }
      />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={(v) => {
          setQuery('date', null);
          setQuery('tab', v === 'habits' ? null : v);
        }}
        options={[
          { value: 'habits', label: 'Habits' },
          { value: 'goals', label: 'Goals' },
          { value: 'journal', label: 'Journal' },
          { value: 'plan', label: 'Daily plan' },
          { value: 'review', label: 'Weekly review' },
        ]}
      />
      {tab === 'habits' && <HabitsTab />}
      {tab === 'goals' && <GoalsTab />}
      {tab === 'journal' && <JournalTab />}
      {tab === 'plan' && <PlanTab />}
      {tab === 'review' && <ReviewTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function HabitsTab() {
  const habits = useStore((s) => s.habits);
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const update = useStore((s) => s.update);
  const today = useToday();
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const active = habits.filter((h) => !h.archived).sort((a, b) => a.order - b.order);
  const archived = habits.filter((h) => h.archived);
  const days = rangeISO(addDaysISO(today, -6), 7);

  const stats = useMemo(() => {
    const week = dailyTotals(active, rangeISO(addDaysISO(today, -6), 7));
    const month = dailyTotals(active, rangeISO(addDaysISO(today, -29), 30));
    const sum = (l: typeof week) => {
      const due = l.reduce((n, d) => n + d.due, 0);
      return due ? l.reduce((n, d) => n + d.done, 0) / due : null;
    };
    const best = active.reduce((m, h) => Math.max(m, currentStreak(h, today, weekStartsOn)), 0);
    return { week: sum(week), month: sum(month), best, chart: month };
  }, [active, today, weekStartsOn]);

  const move = (h: Habit, dir: -1 | 1) => {
    const i = active.findIndex((x) => x.id === h.id);
    const other = active[i + dir];
    if (!other) return;
    update('habits', h.id, { order: other.order });
    update('habits', other.id, { order: h.order });
  };

  if (!habits.length)
    return (
      <div className="card">
        <EmptyState icon={<Flame size={18} />} title="Design your own routine" action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => openModal({ kind: 'habit' })}>Add your first habit</Button>}>
          No presets — add the habits that matter to you. Daily, specific weekdays, or a target number of times per week. Streaks and completion stats are calculated automatically.
        </EmptyState>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Last 7 days" value={pct(stats.week === null ? null : stats.week * 100)} sub="of scheduled daily habits" />
        <Stat label="Last 30 days" value={pct(stats.month === null ? null : stats.month * 100)} sub="completion rate" />
        <Stat label="Longest current streak" value={stats.best ? `${stats.best}` : '—'} sub={stats.best ? 'days / weeks' : 'Start one today'} />
        <Stat label="Active habits" value={active.length} sub={archived.length ? `${archived.length} archived` : undefined} />
      </div>

      <Card title="This week" bodyClassName="overflow-x-auto">
        <table className="w-full min-w-[420px] sm:min-w-[560px]">
          <thead>
            <tr className="text-xs text-faint">
              <th className="pb-2 text-left font-medium">Habit</th>
              {days.map((d, di) => (
                <th key={d} className={cn('w-10 pb-2 text-center font-medium', d === today && 'text-accent', di < 3 && 'hidden sm:table-cell')}>
                  <div>{WEEKDAYS_MIN[fromISO(d).getDay()]}</div>
                  <div className="text-[10px] tabular-nums">{Number(d.slice(8))}</div>
                </th>
              ))}
              <th className="w-16 pb-2 text-right font-medium">Streak</th>
              <th className="w-14 pb-2 text-right font-medium">30d</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {active.map((h, i) => {
              const streak = currentStreak(h, today, weekStartsOn);
              const rate = completionRate(h, addDaysISO(today, -29), today, weekStartsOn);
              const start = habitStartDate(h);
              return (
                <HabitRow key={h.id} h={h} expanded={expanded === h.id} onExpand={() => setExpanded(expanded === h.id ? null : h.id)}>
                  <td className="py-1.5 pr-3">
                    <button type="button" onClick={() => setExpanded(expanded === h.id ? null : h.id)} className="flex min-w-0 items-center gap-2 text-left">
                      <span className="w-5 text-center">{h.icon || <span className="inline-block h-2 w-2 rounded-full" style={{ background: h.color }} />}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">{h.name}</span>
                        <span className="block text-[11px] text-faint">
                          {h.frequency === 'weekly'
                            ? `${weekCount(h, weekStartISO(today, weekStartsOn))}/${h.targetPerWeek} this week`
                            : h.daysOfWeek?.length
                              ? h.daysOfWeek.map((d) => WEEKDAYS_SHORT[d]).join(' ')
                              : 'Every day'}
                        </span>
                      </span>
                    </button>
                  </td>
                  {days.map((d, di) => {
                    const sched = isScheduled(h, d) && d >= start;
                    return (
                      <td key={d} className={cn('text-center', di < 3 && 'hidden sm:table-cell')}>
                        {sched || isDoneOn(h, d) ? (
                          <Checkbox checked={isDoneOn(h, d)} onChange={() => update('habits', h.id, { completions: toggleCompletion(h, d) })} label={`${h.name} on ${formatShort(d)}`} color={h.color} size={22} className="mx-auto" />
                        ) : (
                          <span className="mx-auto block h-1 w-1 rounded-full bg-line-strong" title="Not scheduled" />
                        )}
                      </td>
                    );
                  })}
                  <td className="text-right">
                    <span className={cn('inline-flex items-center gap-1 text-[13px] tabular-nums', streak ? 'text-warn' : 'text-faint')}>
                      <Flame size={13} />
                      {streak}
                    </span>
                  </td>
                  <td className="text-right text-[13px] tabular-nums text-muted">{rate === null ? '—' : `${Math.round(rate * 100)}%`}</td>
                  <td className="text-right">
                    <div className="flex justify-end">
                      <IconButton label="Move up" size="xs" disabled={i === 0} onClick={() => move(h, -1)}>
                        <ArrowUp size={13} />
                      </IconButton>
                      <IconButton label="Move down" size="xs" disabled={i === active.length - 1} onClick={() => move(h, 1)}>
                        <ArrowDown size={13} />
                      </IconButton>
                      <IconButton label={`Edit ${h.name}`} size="xs" onClick={() => openModal({ kind: 'habit', id: h.id })}>
                        <Pencil size={13} />
                      </IconButton>
                    </div>
                  </td>
                </HabitRow>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-faint">Click a habit to see its history. You can also check off past days.</p>
      </Card>

      <Card title="Daily habit completion · last 30 days">
        <ColumnChart
          label="Daily habits completed per day, last 30 days"
          height={110}
          data={stats.chart.map((d) => ({ key: d.date, label: Number(d.date.slice(8)) % 5 === 0 || d.date === today ? String(Number(d.date.slice(8))) : '', value: d.done, detail: `${formatShort(d.date)} · ${d.done}/${d.due}`, highlight: d.date === today }))}
          format={(n) => plural(n, 'habit')}
        />
      </Card>

      {archived.length > 0 && (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
          </Button>
          {showArchived && (
            <div className="mt-2 space-y-1">
              {archived.map((h) => (
                <div key={h.id} className="card flex items-center gap-3 px-4 py-2.5 text-[13px]">
                  <span>{h.icon}</span>
                  <span className="flex-1 text-muted">{h.name}</span>
                  <span className="text-xs text-faint">{plural(h.completions.length, 'check-in')}</span>
                  <Button size="xs" onClick={() => update('habits', h.id, { archived: false })}>
                    Restore
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => openModal({ kind: 'habit', id: h.id })}>
                    Edit
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HabitRow({ h, expanded, children }: { h: Habit; expanded: boolean; onExpand: () => void; children: React.ReactNode }) {
  const today = useToday();
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const update = useStore((s) => s.update);
  return (
    <>
      <tr className="border-t border-line">{children}</tr>
      {expanded && (
        <tr>
          <td colSpan={11} className="pb-4 pt-1">
            <div className="flex flex-wrap items-start gap-6 rounded-xl bg-surface-2/60 p-3">
              <HabitHeatmap
                today={today}
                weekStartsOn={weekStartsOn}
                color={h.color}
                startDate={habitStartDate(h)}
                isDone={(d) => isDoneOn(h, d)}
                isScheduled={(d) => isScheduled(h, d)}
                onToggle={(d) => update('habits', h.id, { completions: toggleCompletion(h, d) })}
              />
              <div className="space-y-1 text-xs text-muted">
                <p>
                  Best streak: <span className="font-semibold text-fg">{bestStreak(h, today, weekStartsOn)}</span>
                </p>
                <p>
                  Total check-ins: <span className="font-semibold text-fg">{h.completions.length}</span>
                </p>
                <p>
                  Since: <span className="text-fg">{formatShort(habitStartDate(h))}</span>
                </p>
                {h.description && <p className="max-w-xs pt-1 text-faint">{h.description}</p>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function GoalCard({ g }: { g: Goal }) {
  const tasks = useStore((s) => s.tasks);
  const update = useStore((s) => s.update);
  const today = useToday();
  const p = goalProgress(g, tasks);
  const linked = tasks.filter((t) => t.goalId === g.id && !t.archived);
  const step = g.target && Math.abs(g.target) >= 100 ? Math.round(Math.abs(g.target) / 20) : 1;
  return (
    <div className={cn('card p-4', g.status !== 'active' && 'opacity-70')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => openModal({ kind: 'goal', id: g.id })} className="text-left text-[14px] font-medium hover:text-accent">
            {g.title}
          </button>
          <p className="mt-0.5 text-xs text-faint">
            {[g.category, g.targetDate && `by ${formatShort(g.targetDate)}${g.targetDate < today && g.status === 'active' ? ' (passed)' : ''}`].filter(Boolean).join(' · ') || (g.horizon === 'weekly' ? `Week of ${formatShort(g.weekStart!)}` : 'No deadline')}
          </p>
        </div>
        {g.status === 'achieved' ? <Badge tone="good">Achieved</Badge> : g.status === 'dropped' ? <Badge>Dropped</Badge> : null}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <ProgressBar value={p.pct} color={p.pct === 100 ? 'rgb(var(--good))' : undefined} className="flex-1" />
        <span className="text-xs tabular-nums text-muted">{p.label}</span>
      </div>
      {g.status === 'active' && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {g.progressMode === 'numeric' && (
            <>
              <IconButton label="Decrease" size="xs" variant="secondary" onClick={() => update('goals', g.id, { current: (g.current ?? 0) - step })}>
                <Minus size={13} />
              </IconButton>
              <IconButton label="Increase" size="xs" variant="secondary" onClick={() => update('goals', g.id, { current: (g.current ?? 0) + step })}>
                <Plus size={13} />
              </IconButton>
              <span className="text-[11px] text-faint">±{step}</span>
            </>
          )}
          {g.progressMode === 'manual' &&
            [0, 25, 50, 75, 100].map((v) => (
              <button key={v} type="button" onClick={() => update('goals', g.id, { manualProgress: v })} className={cn('h-6 rounded-md px-2 text-[11px] tabular-nums', Math.round(g.manualProgress ?? 0) === v ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-faint hover:text-fg')}>
                {v}%
              </button>
            ))}
          <Button size="xs" variant="ghost" className="ml-auto" icon={<Trophy size={12} />} onClick={() => (update('goals', g.id, { status: 'achieved' }), toast.success('Goal achieved! 🎉'))}>
            Mark achieved
          </Button>
        </div>
      )}
      {g.milestones.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-line pt-3">
          {g.milestones.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-center gap-2 text-[13px]">
              <input type="checkbox" checked={m.done} onChange={(e) => update('goals', g.id, { milestones: g.milestones.map((x) => (x.id === m.id ? { ...x, done: e.target.checked } : x)) })} className="accent-[rgb(var(--accent))]" />
              <span className={cn(m.done && 'text-faint line-through')}>{m.title}</span>
            </label>
          ))}
        </div>
      )}
      {g.progressMode === 'tasks' && linked.length > 0 && (
        <div className="-mx-2.5 mt-2 border-t border-line pt-2">
          {linked.slice(0, 4).map((t) => (
            <TaskItem key={t.id} task={t} compact />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalsTab() {
  const goals = useStore((s) => s.goals);
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const today = useToday();
  const [week, setWeek] = useState(weekStartISO(today, weekStartsOn));
  const [showDone, setShowDone] = useState(false);
  const weekly = goals.filter((g) => g.horizon === 'weekly' && g.weekStart === week);
  const short = goals.filter((g) => g.horizon === 'short' && (showDone || g.status === 'active'));
  const long = goals.filter((g) => g.horizon === 'long' && (showDone || g.status === 'active'));
  const finished = goals.filter((g) => g.horizon !== 'weekly' && g.status !== 'active').length;
  const thisWeek = weekStartISO(today, weekStartsOn);

  const carryOver = () => {
    const prev = goals.filter((g) => g.horizon === 'weekly' && g.weekStart === addDaysISO(week, -7) && g.status === 'active');
    if (!prev.length) return toast.info('No unfinished goals last week');
    for (const g of prev) {
      const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = g;
      void _i, _c, _u;
      useStore.getState().create('goals', { ...rest, weekStart: week, sample: undefined });
    }
    toast.success(`Carried over ${plural(prev.length, 'goal')}`);
  };

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-[13px] font-semibold">Weekly goals</h2>
          <div className="flex items-center gap-1">
            <IconButton label="Previous week" size="xs" onClick={() => setWeek(addDaysISO(week, -7))}>
              <ChevronLeft size={14} />
            </IconButton>
            <span className="text-xs text-muted">
              {week === thisWeek ? 'This week' : `Week of ${formatShort(week)}`}
            </span>
            <IconButton label="Next week" size="xs" onClick={() => setWeek(addDaysISO(week, 7))}>
              <ChevronRight size={14} />
            </IconButton>
          </div>
          <div className="ml-auto flex gap-2">
            <Button size="xs" variant="ghost" onClick={carryOver}>
              Carry over unfinished
            </Button>
            <Button size="xs" icon={<Plus size={13} />} onClick={() => openModal({ kind: 'goal', horizon: 'weekly' })}>
              Weekly goal
            </Button>
          </div>
        </div>
        {weekly.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {weekly.map((g) => (
              <GoalCard key={g.id} g={g} />
            ))}
          </div>
        ) : (
          <div className="card">
            <EmptyState compact icon={<Target size={18} />} title="No goals for this week">
              Weekly goals are small, concrete wins: “Finish the lab report”, “List 20 cards”, “4 workouts”.
            </EmptyState>
          </div>
        )}
      </section>
      {(['short', 'long'] as const).map((h) => {
        const list = h === 'short' ? short : long;
        return (
          <section key={h}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-[13px] font-semibold">{h === 'short' ? 'Short-term goals' : 'Long-term goals'}</h2>
              <span className="text-xs text-faint">{h === 'short' ? 'weeks to months' : 'months to years'}</span>
              <Button size="xs" className="ml-auto" icon={<Plus size={13} />} onClick={() => openModal({ kind: 'goal', horizon: h })}>
                Goal
              </Button>
            </div>
            {list.length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {list.map((g) => (
                  <GoalCard key={g.id} g={g} />
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-faint">None yet.</p>
            )}
          </section>
        );
      })}
      {finished > 0 && (
        <Button size="sm" variant="ghost" onClick={() => setShowDone((v) => !v)}>
          {showDone ? 'Hide' : 'Show'} achieved & dropped ({finished})
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

const MOODS = ['😞', '😕', '😐', '🙂', '😄'];

function useDebouncedSave<T>(value: T, save: (v: T) => void, delay = 600) {
  const first = useRef(true);
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => saveRef.current(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
}

function JournalTab() {
  const route = useRoute();
  const today = useToday();
  const qd = route.query.get('date');
  const date = qd && isISODate(qd) ? qd : today;
  const journal = useStore((s) => s.journal);
  const entry = journal.find((j) => j.date === date);
  const past = [...journal].filter((j) => j.date !== date).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <JournalEditor key={date} date={date} />
      </div>
      <Card title="Past entries" icon={<NotebookPen size={15} />}>
        {past.length === 0 && <p className="text-[13px] text-faint">Your previous entries will appear here.</p>}
        <div className="max-h-[520px] space-y-1 overflow-y-auto">
          {past.map((j) => (
            <a key={j.id} href={`#/habits?tab=journal&date=${j.date}`} className="block rounded-lg px-2 py-2 hover:bg-surface-2">
              <div className="flex items-center gap-2 text-[13px]">
                <span>{j.mood ? MOODS[j.mood - 1] : '📝'}</span>
                <span className="font-medium">{formatRelativeDay(j.date, today)}</span>
                <span className="text-xs text-faint">{formatShort(j.date)}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs text-faint">{j.content || j.wins || 'No text'}</p>
            </a>
          ))}
        </div>
        {entry && date !== today && (
          <a href="#/habits?tab=journal" className="mt-2 block text-xs text-accent hover:underline">
            Back to today →
          </a>
        )}
      </Card>
    </div>
  );
}

function JournalEditor({ date }: { date: string }) {
  const today = useToday();
  const entry = useStore((s) => s.journal.find((j) => j.date === date));
  const upsert = useStore((s) => s.upsertJournal);
  const remove = useStore((s) => s.remove);
  const [draft, setDraft] = useState({ content: entry?.content ?? '', wins: entry?.wins ?? '', gratitude: entry?.gratitude ?? '', mood: entry?.mood, energy: entry?.energy });
  const [saved, setSaved] = useState(true);
  useDebouncedSave(draft, (d) => {
    if (!entry && !d.content.trim() && !d.wins.trim() && !d.gratitude.trim() && !d.mood && !d.energy) return;
    upsert(date, { content: d.content, wins: opt(d.wins), gratitude: opt(d.gratitude), mood: d.mood, energy: d.energy });
    setSaved(true);
  });
  const change = (patch: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  };
  return (
    <Card
      title={date === today ? 'Today’s entry' : formatLong(date)}
      subtitle={date === today ? formatLong(date) : undefined}
      action={
        <div className="flex items-center gap-2">
          <input type="date" className="input !h-8 !w-auto text-xs" value={date} max={today} onChange={(e) => e.target.value && setQuery('date', e.target.value === today ? null : e.target.value)} aria-label="Entry date" />
          <span className="text-xs text-faint">{saved ? (entry ? 'Saved' : '') : 'Saving…'}</span>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="label">Mood</p>
            <div className="flex gap-1">
              {MOODS.map((m, i) => (
                <button key={i} type="button" aria-label={`Mood ${i + 1} of 5`} aria-pressed={draft.mood === i + 1} onClick={() => change({ mood: draft.mood === i + 1 ? undefined : i + 1 })} className={cn('h-9 w-9 rounded-lg text-lg transition-all', draft.mood === i + 1 ? 'scale-110 bg-accent/15' : 'opacity-50 grayscale hover:opacity-100 hover:grayscale-0')}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="label">Energy</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-label={`Energy ${n} of 5`} aria-pressed={draft.energy === n} onClick={() => change({ energy: draft.energy === n ? undefined : n })} className={cn('h-9 w-7 rounded-md transition-colors', (draft.energy ?? 0) >= n ? 'bg-warn/70' : 'bg-surface-3 hover:bg-line-strong')} />
              ))}
            </div>
          </div>
        </div>
        <Field label="What’s on your mind?">
          <textarea className="input min-h-[180px]" value={draft.content} onChange={(e) => change({ content: e.target.value })} placeholder="How did today go? What did you learn? What’s worrying you?" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Wins">
            <textarea className="input" rows={3} value={draft.wins} onChange={(e) => change({ wins: e.target.value })} placeholder="Something that went well" />
          </Field>
          <Field label="Grateful for">
            <textarea className="input" rows={3} value={draft.gratitude} onChange={(e) => change({ gratitude: e.target.value })} placeholder="One thing you’re thankful for" />
          </Field>
        </div>
        {entry && (
          <div className="flex justify-end">
            <Button
              size="xs"
              variant="ghost"
              className="!text-bad"
              onClick={async () => {
                if (await confirmAction({ title: 'Delete this journal entry?' })) {
                  remove('journal', entry.id);
                  setDraft({ content: '', wins: '', gratitude: '', mood: undefined, energy: undefined });
                }
              }}
            >
              Delete entry
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function PlanTab() {
  const today = useToday();
  const [date, setDate] = useState(today);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs
          size="sm"
          value={date === today ? 'today' : date === addDaysISO(today, 1) ? 'tomorrow' : 'other'}
          onChange={(v) => setDate(v === 'today' ? today : addDaysISO(today, 1))}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'tomorrow', label: 'Tomorrow' },
          ]}
        />
        <input type="date" className="input !h-8 !w-auto text-xs" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Plan date" />
        <span className="text-[13px] text-muted">{formatLong(date)}</span>
      </div>
      <DayPlanner key={date} date={date} />
    </div>
  );
}

function DayPlanner({ date }: { date: string }) {
  const s = useStore();
  const plan = s.dayPlans.find((p) => p.date === date);
  const [intention, setIntention] = useState(plan?.intention ?? '');
  const [notes, setNotes] = useState(plan?.notes ?? '');
  const [block, setBlock] = useState({ start: '', end: '', label: '' });
  const [auto, setAuto] = useState(() => {
    // Default free window: after school on weekdays, from 9am on weekends — but never in the past.
    const wd = fromISO(date).getDay();
    let start = wd === 0 || wd === 6 ? '09:00' : '15:30';
    if (date === todayISO()) {
      const now = new Date();
      const mins = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15;
      if (mins > timeToMinutes(start)) start = minutesToTime(Math.min(mins, 22 * 60));
    }
    return { start, end: '22:00' };
  });
  const [preview, setPreview] = useState<TimeBlock[] | null>(null);
  useDebouncedSave(intention, (v) => s.upsertDayPlan(date, { intention: opt(v) }));
  useDebouncedSave(notes, (v) => s.upsertDayPlan(date, { notes: opt(v) }));

  const top = (plan?.topTaskIds ?? []).map((id) => s.tasks.find((t) => t.id === id)).filter(Boolean);
  const candidates = s.tasks.filter((t) => isOpen(t) && !plan?.topTaskIds.includes(t.id) && (!t.dueDate || t.dueDate <= addDaysISO(date, 7))).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const blocks = [...(plan?.timeBlocks ?? [])].sort((a, b) => a.start.localeCompare(b.start));
  const dayEvents = eventsInRange(s.events, date, date).filter((o) => o.event.startTime);
  const setBlocks = (timeBlocks: TimeBlock[]) => s.upsertDayPlan(date, { timeBlocks });

  const addBlock = () => {
    if (!block.label.trim() || !block.start || !block.end) return toast.error('Add a start, end and label');
    if (block.end <= block.start) return toast.error('End must be after start');
    setBlocks([...blocks, { id: uid('blk'), start: block.start, end: block.end, label: block.label.trim() }]);
    setBlock({ start: block.end, end: '', label: '' });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Card title="Intention" icon={<Sparkles size={15} />}>
          <input className="input" value={intention} onChange={(e) => setIntention(e.target.value)} placeholder="e.g. Get ahead on APUSH, ship every order" aria-label="Intention for the day" maxLength={500} />
        </Card>
        <Card title="Top 3 priorities" icon={<Star size={15} />}>
          <div className="-mx-2.5">
            {top.map((t, i) => (
              <div key={t!.id} className="flex items-center">
                <span className="w-6 shrink-0 pl-2.5 text-xs font-semibold text-faint">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <TaskItem task={t!} compact />
                </div>
              </div>
            ))}
          </div>
          {top.length < 3 && (
            <select
              className="input mt-2"
              value=""
              onChange={(e) => e.target.value && toggleTopPriority(e.target.value, date)}
              aria-label="Add a priority"
            >
              <option value="">+ Choose a task ({3 - top.length} left)</option>
              {candidates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                  {t.dueDate ? ` — ${formatRelativeDay(t.dueDate, date)}` : ''}
                </option>
              ))}
            </select>
          )}
        </Card>
        <Card title="Notes for the day">
          <textarea className="input" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Errands, reminders, anything" aria-label="Notes for the day" />
        </Card>
      </div>

      <Card
        title="Time blocks"
        icon={<CalendarClock size={15} />}
        action={
          blocks.length > 0 && (
            <Button
              size="xs"
              variant="ghost"
              onClick={async () => {
                if (await confirmAction({ title: 'Clear all time blocks?', confirmLabel: 'Clear' })) setBlocks([]);
              }}
            >
              Clear
            </Button>
          )
        }
      >
        <div className="mb-4 rounded-xl border border-line bg-surface-2/50 p-3">
          <p className="flex items-center gap-1.5 text-[13px] font-medium">
            <Wand2 size={14} className="text-accent" /> Auto-plan
          </p>
          <p className="mt-0.5 text-xs text-faint">Fits your highest-priority tasks into the free time between events. Uses task estimates (or sensible defaults).</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            from <input type="time" className="input !h-8 !w-auto" value={auto.start} onChange={(e) => setAuto({ ...auto, start: e.target.value })} aria-label="Free from" />
            to <input type="time" className="input !h-8 !w-auto" value={auto.end} onChange={(e) => setAuto({ ...auto, end: e.target.value })} aria-label="Free until" />
            <Button size="sm" onClick={() => setPreview(planDay(s, date, { start: auto.start || '08:00', end: auto.end || '22:00' }))}>
              Suggest a plan
            </Button>
          </div>
          {preview && (
            <div className="mt-3">
              {preview.length === 0 ? (
                <p className="text-xs text-faint">Nothing to schedule in that window.</p>
              ) : (
                <ol className="space-y-1">
                  {preview.map((b) => (
                    <li key={b.id} className="flex gap-2 text-[13px]">
                      <span className="w-28 shrink-0 tabular-nums text-faint">
                        {formatTime(b.start)}–{formatTime(b.end)}
                      </span>
                      <span className={cn(b.taskId ? 'text-fg' : 'text-muted')}>{b.label}</span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="mt-2 flex gap-2">
                <Button
                  size="xs"
                  variant="primary"
                  icon={<Check size={12} />}
                  disabled={!preview.length}
                  onClick={() => {
                    setBlocks(preview);
                    setPreview(null);
                    toast.success('Plan applied');
                  }}
                >
                  Use this plan
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setPreview(null)}>
                  Discard
                </Button>
              </div>
            </div>
          )}
        </div>

        {dayEvents.length > 0 && (
          <ol className="mb-1 space-y-1">
            {dayEvents.map((o) => (
              <li key={o.event.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                <span className="w-32 shrink-0 text-xs tabular-nums text-faint">
                  {formatTime(o.event.startTime)}
                  {o.event.endTime ? ` – ${formatTime(o.event.endTime)}` : ''}
                </span>
                <span className="h-3.5 w-[3px] shrink-0 rounded-full" style={{ background: o.event.color ?? 'rgb(var(--accent))' }} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{o.event.title}</span>
                <span className="text-[11px] text-faint">event</span>
              </li>
            ))}
          </ol>
        )}
        {blocks.length === 0 ? (
          <p className="px-2 text-[13px] text-faint">No time blocks yet. Add them below or use Auto-plan.</p>
        ) : (
          <ol className="space-y-1">
            {blocks.map((b) => {
              const task = b.taskId ? s.tasks.find((t) => t.id === b.taskId) : undefined;
              return (
                <li key={b.id} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                  <span className="w-32 shrink-0 text-xs tabular-nums text-faint">
                    {formatTime(b.start)} – {formatTime(b.end)}
                  </span>
                  {task && <Checkbox checked={task.status === 'done'} onChange={() => s.toggleTask(task.id)} label={`Complete ${task.title}`} round size={16} />}
                  <span className={cn('min-w-0 flex-1 truncate text-[13px]', task?.status === 'done' && 'text-faint line-through')}>{b.label}</span>
                  <IconButton label="Remove block" size="xs" className="opacity-0 group-hover:opacity-100" onClick={() => setBlocks(blocks.filter((x) => x.id !== b.id))}>
                    <X size={13} />
                  </IconButton>
                </li>
              );
            })}
          </ol>
        )}
        <div className="mt-3 grid grid-cols-[auto_auto_1fr_auto] gap-2">
          <input type="time" className="input !w-auto" value={block.start} onChange={(e) => setBlock({ ...block, start: e.target.value })} aria-label="Block start" />
          <input type="time" className="input !w-auto" value={block.end} onChange={(e) => setBlock({ ...block, end: e.target.value })} aria-label="Block end" />
          <input className="input" value={block.label} onChange={(e) => setBlock({ ...block, label: e.target.value })} placeholder="What" onKeyDown={(e) => e.key === 'Enter' && addBlock()} aria-label="Block label" />
          <IconButton label="Add block" variant="secondary" size="md" onClick={addBlock}>
            <Plus size={15} />
          </IconButton>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ReviewTab() {
  const s = useStore();
  const today = useToday();
  const weekStartsOn = s.settings.weekStartsOn;
  const [week, setWeek] = useState(weekStartISO(addDaysISO(today, -2), weekStartsOn));
  const summary = useMemo(() => weekSummary(s, week), [s, week]);
  const review = s.reviews.find((r) => r.weekStart === week);
  const [form, setForm] = useState({ wentWell: review?.wentWell ?? '', challenges: review?.challenges ?? '', priorities: review?.nextWeekPriorities ?? [], rating: review?.rating });
  const [newP, setNewP] = useState('');
  useEffect(() => {
    setForm({ wentWell: review?.wentWell ?? '', challenges: review?.challenges ?? '', priorities: review?.nextWeekPriorities ?? [], rating: review?.rating });
    // Only reset when switching weeks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);
  useDebouncedSave(form, (f) => {
    if (!review && !f.wentWell && !f.challenges && !f.priorities.length && !f.rating) return;
    s.upsertReview(week, { wentWell: opt(f.wentWell), challenges: opt(f.challenges), nextWeekPriorities: f.priorities, rating: f.rating });
  });
  const end = addDaysISO(week, 6);
  const nextWeek = addDaysISO(week, 7);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <IconButton label="Previous week" variant="secondary" onClick={() => setWeek(addDaysISO(week, -7))}>
          <ChevronLeft size={16} />
        </IconButton>
        <IconButton label="Next week" variant="secondary" onClick={() => setWeek(addDaysISO(week, 7))}>
          <ChevronRight size={16} />
        </IconButton>
        <h2 className="text-base font-semibold">
          {formatShort(week)} – {formatShort(end)}
        </h2>
        {review?.completedAt && <Badge tone="good">Reviewed</Badge>}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tasks completed" value={summary.completed.length} />
        <Stat label="Still open (due this week)" value={summary.unfinished.length} tone={summary.unfinished.length ? 'warn' : 'good'} />
        <Stat label="Daily habit rate" value={pct(summary.habitRate === null ? null : summary.habitRate * 100)} />
        <Stat label="Milestones hit" value={summary.milestonesHit.length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Accomplishments" icon={<Trophy size={15} />}>
          {summary.completed.length === 0 && summary.milestonesHit.length === 0 ? (
            <p className="text-[13px] text-faint">Nothing completed this week yet.</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto text-[13px]">
              {summary.milestonesHit.map(({ project, milestone }) => (
                <li key={milestone.id} className="flex items-center gap-2">
                  <span className="text-good">◆</span> {milestone.title} <span className="text-xs text-faint">· {project.name}</span>
                </li>
              ))}
              {summary.completed.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <Check size={13} className="shrink-0 text-good" />
                  <span className="truncate">{t.title}</span>
                </li>
              ))}
            </ul>
          )}
          {summary.goals.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-line pt-3">
              <p className="eyebrow">Weekly goals</p>
              {summary.goals.map(({ goal, progress }) => (
                <div key={goal.id} className="flex items-center gap-3 text-[13px]">
                  <span className="min-w-0 flex-1 truncate">{goal.title}</span>
                  <ProgressBar value={progress.pct} className="!w-20" />
                  <span className="w-10 text-right text-xs tabular-nums text-faint">{pct(progress.pct)}</span>
                </div>
              ))}
            </div>
          )}
          {summary.weeklyHabits.length > 0 && (
            <div className="mt-4 space-y-1 border-t border-line pt-3">
              <p className="eyebrow">Weekly habits</p>
              {summary.weeklyHabits.map(({ habit, count }) => (
                <p key={habit.id} className="text-[13px]">
                  {habit.icon} {habit.name}: <span className={count >= habit.targetPerWeek ? 'text-good' : 'text-warn'}>{count}/{habit.targetPerWeek}</span>
                </p>
              ))}
            </div>
          )}
        </Card>

        <Card title="Unfinished" icon={<ArrowRight size={15} />} subtitle="Decide what happens to each">
          {summary.unfinished.length === 0 ? (
            <p className="text-[13px] text-faint">Nothing left over. 👏</p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {summary.unfinished.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg px-1 py-1">
                  <Checkbox checked={false} onChange={() => s.toggleTask(t.id)} label={`Complete ${t.title}`} round size={16} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{t.title}</span>
                  <span className="text-xs text-faint">{t.dueDate && formatShort(t.dueDate)}</span>
                  <Button size="xs" variant="ghost" onClick={() => (s.update('tasks', t.id, { dueDate: nextWeek }), toast.info(`Moved to ${formatShort(nextWeek)}`))}>
                    Next week
                  </Button>
                </div>
              ))}
              {summary.unfinished.length > 1 && (
                <Button size="xs" className="mt-2" onClick={() => (summary.unfinished.forEach((t) => s.update('tasks', t.id, { dueDate: nextWeek })), toast.success('All moved to next week'))}>
                  Move all to {formatShort(nextWeek)}
                </Button>
              )}
            </div>
          )}
        </Card>

        <Card title="Reflection">
          <div className="space-y-3">
            <Field label="What went well?">
              <textarea className="input" rows={3} value={form.wentWell} onChange={(e) => setForm({ ...form, wentWell: e.target.value })} />
            </Field>
            <Field label="What was hard / what will I change?">
              <textarea className="input" rows={3} value={form.challenges} onChange={(e) => setForm({ ...form, challenges: e.target.value })} />
            </Field>
            <div>
              <p className="label">Rate the week</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" aria-label={`${n} stars`} onClick={() => setForm({ ...form, rating: form.rating === n ? undefined : n })} className={cn('transition-colors', (form.rating ?? 0) >= n ? 'text-warn' : 'text-line-strong hover:text-faint')}>
                    <Star size={20} fill="currentColor" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Priorities for next week" icon={<Target size={15} />}>
          <ol className="space-y-1">
            {form.priorities.map((p, i) => (
              <li key={i} className="group flex items-center gap-2 text-[13px]">
                <span className="w-4 text-xs text-faint">{i + 1}.</span>
                <span className="flex-1">{p}</span>
                <IconButton label="Remove" size="xs" className="opacity-0 group-hover:opacity-100" onClick={() => setForm({ ...form, priorities: form.priorities.filter((_, j) => j !== i) })}>
                  <X size={13} />
                </IconButton>
              </li>
            ))}
          </ol>
          {form.priorities.length < 10 && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newP.trim()) return;
                setForm({ ...form, priorities: [...form.priorities, newP.trim().slice(0, 300)] });
                setNewP('');
              }}
            >
              <input className="input" value={newP} onChange={(e) => setNewP(e.target.value)} placeholder="Add a priority" aria-label="Add a priority" />
              <IconButton type="submit" label="Add priority" variant="secondary" size="md">
                <Plus size={15} />
              </IconButton>
            </form>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!form.priorities.length}
              onClick={() => {
                const existing = new Set(s.goals.filter((g) => g.weekStart === nextWeek).map((g) => g.title));
                let n = 0;
                for (const title of form.priorities) {
                  if (existing.has(title)) continue;
                  s.create('goals', { title, horizon: 'weekly', weekStart: nextWeek, progressMode: 'manual', manualProgress: 0, milestones: [], status: 'active' });
                  n++;
                }
                toast.success(n ? `Created ${plural(n, 'weekly goal')} for next week` : 'Those goals already exist');
              }}
            >
              Turn into next week’s goals
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Check size={14} />}
              onClick={() => {
                s.upsertReview(week, { wentWell: opt(form.wentWell), challenges: opt(form.challenges), nextWeekPriorities: form.priorities, rating: form.rating, completedAt: Date.now() });
                toast.success('Weekly review saved');
              }}
            >
              {review?.completedAt ? 'Update review' : 'Complete review'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
