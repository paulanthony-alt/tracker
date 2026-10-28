import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Repeat } from 'lucide-react';
import type { CalendarEvent, Task } from '@shared/schema';
import { useStore } from '@/lib/store';
import { openModal } from '@/lib/ui';
import { navigate, setQuery, useRoute } from '@/lib/router';
import { useToday } from '@/lib/useToday';
import { addDaysISO, addMonthsISO, formatTime, fromISO, isISODate, minutesToTime, monthStartISO, rangeISO, timeToMinutes, weekStartISO, WEEKDAYS_SHORT } from '@/lib/dates';
import { eventsInRange } from '@/lib/insights';
import { cn } from '@/lib/util';
import { toast } from '@/lib/toast';
import { format } from 'date-fns';
import { Button, IconButton, PageHeader, Tabs } from '@/components/ui/primitives';

type View = 'month' | 'week' | 'day';

interface Item {
  key: string;
  date: string;
  title: string;
  time?: string;
  end?: string;
  color?: string;
  kind: 'task' | 'event' | 'milestone' | 'deadline';
  done?: boolean;
  task?: Task;
  event?: CalendarEvent;
  recurring?: boolean;
  onOpen: () => void;
}

const HOUR_PX = 44;
const FIRST_HOUR = 6;

function useItems(start: string, end: string): Map<string, Item[]> {
  const tasks = useStore((s) => s.tasks);
  const events = useStore((s) => s.events);
  const projects = useStore((s) => s.projects);
  const classes = useStore((s) => s.classes);
  return useMemo(() => {
    const map = new Map<string, Item[]>();
    const push = (it: Item) => map.set(it.date, [...(map.get(it.date) ?? []), it]);
    for (const t of tasks) {
      if (t.archived || !t.dueDate || t.dueDate < start || t.dueDate > end) continue;
      const color = classes.find((c) => c.id === t.classId)?.color ?? projects.find((p) => p.id === t.projectId)?.color;
      push({ key: `t-${t.id}`, date: t.dueDate, title: t.title, time: t.dueTime, color, kind: 'task', done: t.status === 'done', task: t, onOpen: () => openModal({ kind: 'task', id: t.id }) });
    }
    for (const o of eventsInRange(events, start, end)) {
      const e = o.event;
      const color = e.color ?? classes.find((c) => c.id === e.classId)?.color ?? projects.find((p) => p.id === e.projectId)?.color;
      push({ key: `e-${e.id}-${o.date}`, date: o.date, title: e.title, time: e.startTime, end: e.endTime, color, kind: 'event', event: e, recurring: !!e.recurrence, onOpen: () => openModal({ kind: 'event', id: e.id }) });
    }
    for (const p of projects) {
      if (p.archived) continue;
      for (const m of p.milestones)
        if (m.dueDate && m.dueDate >= start && m.dueDate <= end)
          push({ key: `m-${p.id}-${m.id}`, date: m.dueDate, title: `◆ ${m.title}`, color: p.color, kind: 'milestone', done: m.done, onOpen: () => (window.location.hash = `#/business/${p.id}`) });
      if (p.deadline && p.deadline >= start && p.deadline <= end)
        push({ key: `d-${p.id}`, date: p.deadline, title: `⚑ ${p.name} deadline`, color: p.color, kind: 'deadline', onOpen: () => (window.location.hash = `#/business/${p.id}`) });
    }
    for (const list of map.values()) list.sort((a, b) => (a.time ?? '00:00').localeCompare(b.time ?? '00:00') || a.kind.localeCompare(b.kind));
    return map;
  }, [tasks, events, projects, classes, start, end]);
}

/** Move a dragged task or one-off event to a new day (and optionally a time). */
function handleDrop(e: React.DragEvent, date: string, time?: string) {
  e.preventDefault();
  const s = useStore.getState();
  const taskId = e.dataTransfer.getData('text/x-task-id');
  const eventId = e.dataTransfer.getData('text/x-event-id');
  if (taskId) {
    const t = s.tasks.find((x) => x.id === taskId);
    if (!t) return;
    s.update('tasks', taskId, { dueDate: date, ...(time ? { dueTime: time } : {}) });
    toast.success(`Moved “${t.title}”`, { label: 'Undo', run: () => s.update('tasks', taskId, { dueDate: t.dueDate, dueTime: t.dueTime }) });
  } else if (eventId) {
    const ev = s.events.find((x) => x.id === eventId);
    if (!ev) return;
    if (ev.recurrence) {
      toast.error('Repeating events can’t be dragged — edit the event to change its schedule.');
      return;
    }
    const patch: Partial<CalendarEvent> = { date };
    if (time && ev.startTime) {
      const dur = ev.endTime ? timeToMinutes(ev.endTime) - timeToMinutes(ev.startTime) : 60;
      patch.startTime = time;
      patch.endTime = minutesToTime(Math.min(timeToMinutes(time) + dur, 23 * 60 + 59));
    }
    s.update('events', eventId, patch);
    toast.success(`Moved “${ev.title}”`, { label: 'Undo', run: () => s.update('events', eventId, { date: ev.date, startTime: ev.startTime, endTime: ev.endTime }) });
  }
}

function Chip({ it, compact }: { it: Item; compact?: boolean }) {
  const draggable = it.kind === 'task' || (it.kind === 'event' && !it.recurring);
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => {
        if (it.task) e.dataTransfer.setData('text/x-task-id', it.task.id);
        if (it.event) e.dataTransfer.setData('text/x-event-id', it.event.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={(e) => {
        e.stopPropagation();
        it.onOpen();
      }}
      title={`${it.time ? `${formatTime(it.time)} ` : ''}${it.title}`}
      className={cn(
        'flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left transition-colors hover:bg-surface-3',
        compact ? 'h-5 text-[11px]' : 'h-6 text-xs',
        it.done && 'opacity-50',
        draggable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      {it.kind === 'event' ? (
        <span className="h-3 w-[3px] shrink-0 rounded-full" style={{ background: it.color ?? 'rgb(var(--accent))' }} />
      ) : (
        <span className={cn('h-2 w-2 shrink-0 rounded-full border', it.done ? 'border-transparent' : '')} style={{ borderColor: it.color ?? 'rgb(var(--faint))', background: it.done ? it.color ?? 'rgb(var(--faint))' : 'transparent' }} />
      )}
      {it.time && <span className="shrink-0 tabular-nums text-faint">{formatTime(it.time).replace(' ', '').toLowerCase()}</span>}
      <span className={cn('truncate', it.done && 'line-through')}>{it.title}</span>
      {it.recurring && !compact && <Repeat size={10} className="shrink-0 text-faint" />}
    </button>
  );
}

function MonthView({ anchor, today, weekStartsOn }: { anchor: string; today: string; weekStartsOn: 0 | 1 }) {
  const first = weekStartISO(monthStartISO(anchor), weekStartsOn);
  const days = rangeISO(first, 42);
  const items = useItems(days[0], days[41]);
  const month = anchor.slice(0, 7);
  const [over, setOver] = useState<string | null>(null);
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="px-2 py-2 text-[11px] font-medium text-faint">
            {WEEKDAYS_SHORT[(i + weekStartsOn) % 7]}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const list = items.get(d) ?? [];
          const inMonth = d.startsWith(month);
          return (
            <div
              key={d}
              onClick={() =>
                // Phones: open the day's agenda. Larger screens: quick-add on that day.
                window.matchMedia('(max-width: 639px)').matches
                  ? navigate(`/calendar?view=day&date=${d}`)
                  : openModal({ kind: 'quickadd', tab: 'task', defaults: { date: d, dueDate: d } })
              }
              onDragOver={(e) => {
                e.preventDefault();
                setOver(d);
              }}
              onDragLeave={() => setOver((o) => (o === d ? null : o))}
              onDrop={(e) => {
                setOver(null);
                handleDrop(e, d);
              }}
              className={cn(
                'group min-h-[64px] cursor-pointer border-line p-1 transition-colors hover:bg-surface-2/60 sm:min-h-[112px]',
                i % 7 !== 6 && 'border-r',
                i < 35 && 'border-b',
                !inMonth && 'bg-bg/40',
                over === d && 'bg-accent/10',
              )}
            >
              <div className="mb-0.5 flex items-center justify-between px-1">
                <a
                  href={`#/calendar?view=day&date=${d}`}
                  onClick={(e) => e.stopPropagation()}
                  className={cn('flex h-6 min-w-6 items-center justify-center rounded-full text-xs tabular-nums hover:bg-surface-3', d === today ? 'bg-accent font-semibold text-accent-fg hover:bg-accent' : inMonth ? 'text-muted' : 'text-faint/60')}
                >
                  {Number(d.slice(8))}
                </a>
                <Plus size={13} className="text-faint opacity-0 group-hover:opacity-100" />
              </div>
              <div className="hidden space-y-px sm:block">
                {list.slice(0, 3).map((it) => (
                  <Chip key={it.key} it={it} compact />
                ))}
                {list.length > 3 && (
                  <a href={`#/calendar?view=day&date=${d}`} onClick={(e) => e.stopPropagation()} className="block px-1.5 text-[11px] text-faint hover:text-fg">
                    +{list.length - 3} more
                  </a>
                )}
              </div>
              {list.length > 0 && (
                <div className="flex flex-wrap gap-1 px-1 pt-1 sm:hidden" aria-label={`${list.length} items`}>
                  {list.slice(0, 6).map((it) => (
                    <span key={it.key} className={cn('h-1.5 w-1.5 rounded-full', it.done && 'opacity-40')} style={{ background: it.color ?? 'rgb(var(--accent))' }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function layoutLanes(items: Item[]) {
  const timed = items
    .filter((i) => i.time)
    .map((i) => {
      const start = timeToMinutes(i.time!);
      const end = i.end ? Math.max(timeToMinutes(i.end), start + 20) : start + (i.kind === 'task' ? 30 : 60);
      return { it: i, start, end, lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.start - b.start);
  const laneEnds: number[] = [];
  let cluster: typeof timed = [];
  let clusterEnd = -1;
  const flush = () => {
    const n = Math.max(1, ...cluster.map((c) => c.lane + 1));
    for (const c of cluster) c.lanes = n;
    cluster = [];
    laneEnds.length = 0;
  };
  for (const t of timed) {
    if (t.start >= clusterEnd && cluster.length) flush();
    let lane = laneEnds.findIndex((e) => e <= t.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = t.end;
    t.lane = lane;
    cluster.push(t);
    clusterEnd = Math.max(clusterEnd, t.end);
  }
  flush();
  return timed;
}

function TimeGrid({ days, today }: { days: string[]; today: string }) {
  const items = useItems(days[0], days[days.length - 1]);
  const hours = Array.from({ length: 24 - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return (
    <div className="card overflow-hidden">
      <div className="grid border-b border-line" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="border-r border-line px-1 py-2 text-[10px] text-faint">all-day</div>
        {days.map((d) => {
          const allDay = (items.get(d) ?? []).filter((i) => !i.time);
          return (
            <div key={d} className="min-w-0 border-r border-line p-1 last:border-r-0" onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, d)}>
              <a href={`#/calendar?view=day&date=${d}`} className="mb-1 flex items-baseline gap-1.5 px-1">
                <span className="text-[11px] text-faint">{WEEKDAYS_SHORT[fromISO(d).getDay()]}</span>
                <span className={cn('text-sm font-semibold tabular-nums', d === today && 'text-accent')}>{Number(d.slice(8))}</span>
              </a>
              <div className="space-y-px">
                {allDay.map((it) => (
                  <Chip key={it.key} it={it} compact={days.length > 1} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="relative max-h-[62vh] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div className="border-r border-line">
            {hours.map((h) => (
              <div key={h} className="relative border-b border-line/60 text-right" style={{ height: HOUR_PX }}>
                <span className="absolute -top-2 right-1.5 text-[10px] tabular-nums text-faint">{h === FIRST_HOUR ? '' : formatTime(`${String(h).padStart(2, '0')}:00`)}</span>
              </div>
            ))}
          </div>
          {days.map((d) => {
            const timed = layoutLanes(items.get(d) ?? []);
            return (
              <div key={d} className="relative border-r border-line last:border-r-0">
                {hours.map((h) => (
                  <div
                    key={h}
                    className="border-b border-line/60 transition-colors hover:bg-surface-2/50"
                    style={{ height: HOUR_PX }}
                    onClick={() => openModal({ kind: 'event', date: d, time: `${String(h).padStart(2, '0')}:00` })}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(e, d, `${String(h).padStart(2, '0')}:00`)}
                    title="Click to add an event"
                  />
                ))}
                {d === today && nowMin >= FIRST_HOUR * 60 && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-bad" style={{ top: ((nowMin - FIRST_HOUR * 60) / 60) * HOUR_PX }}>
                    <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-bad" />
                  </div>
                )}
                {timed.map(({ it, start, end, lane, lanes }) => {
                  const top = Math.max(0, ((start - FIRST_HOUR * 60) / 60) * HOUR_PX);
                  const height = Math.max(18, ((end - Math.max(start, FIRST_HOUR * 60)) / 60) * HOUR_PX - 2);
                  const color = it.color ?? (it.kind === 'task' ? 'rgb(var(--warn))' : 'rgb(var(--accent))');
                  return (
                    <button
                      key={it.key}
                      type="button"
                      draggable={it.kind === 'task' || (it.kind === 'event' && !it.recurring)}
                      onDragStart={(e) => {
                        if (it.task) e.dataTransfer.setData('text/x-task-id', it.task.id);
                        if (it.event) e.dataTransfer.setData('text/x-event-id', it.event.id);
                      }}
                      onClick={it.onOpen}
                      className={cn('absolute z-[5] flex flex-col items-stretch justify-start overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight transition-[filter] hover:brightness-125', it.done && 'opacity-50')}
                      style={{
                        top,
                        height,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                        borderColor: color,
                        background: `color-mix(in srgb, ${color} 18%, rgb(var(--surface)))`,
                      }}
                      title={it.title}
                    >
                      <span className={cn('block truncate font-medium', it.done && 'line-through')}>{it.title}</span>
                      {height > 30 && (
                        <span className="block truncate text-faint">
                          {formatTime(it.time)}
                          {it.end ? ` – ${formatTime(it.end)}` : ''}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function CalendarPage() {
  const route = useRoute();
  const today = useToday();
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const view = (route.query.get('view') as View) || 'month';
  const qd = route.query.get('date');
  const anchor = qd && isISODate(qd) ? qd : today;

  const shift = (dir: -1 | 1) => {
    const next = view === 'month' ? addMonthsISO(monthStartISO(anchor), dir) : addDaysISO(anchor, dir * (view === 'week' ? 7 : 1));
    setQuery('date', next);
  };
  const weekStart = weekStartISO(anchor, weekStartsOn);
  const title =
    view === 'month'
      ? format(fromISO(anchor), 'MMMM yyyy')
      : view === 'week'
        ? `${format(fromISO(weekStart), 'MMM d')} – ${format(fromISO(addDaysISO(weekStart, 6)), weekStart.slice(5, 7) === addDaysISO(weekStart, 6).slice(5, 7) ? 'd, yyyy' : 'MMM d, yyyy')}`
        : format(fromISO(anchor), 'EEEE, MMMM d');

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Tasks, assignments, events and milestones together. Drag items to reschedule; click a day to add."
        actions={
          <>
            <Button size="sm" icon={<Plus size={14} />} onClick={() => openModal({ kind: 'event', date: anchor })}>
              Event
            </Button>
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => openModal({ kind: 'quickadd', tab: 'task', defaults: { date: anchor } })}>
              Task
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <IconButton label="Previous" variant="secondary" onClick={() => shift(-1)}>
            <ChevronLeft size={16} />
          </IconButton>
          <IconButton label="Next" variant="secondary" onClick={() => shift(1)}>
            <ChevronRight size={16} />
          </IconButton>
          <Button size="sm" variant="secondary" onClick={() => setQuery('date', null)}>
            Today
          </Button>
        </div>
        <h2 className="order-first min-w-0 basis-full truncate text-base font-semibold tracking-tight sm:order-none sm:flex-1 sm:basis-auto">{title}</h2>
        <Tabs
          size="sm"
          value={view}
          onChange={(v) => setQuery('view', v === 'month' ? null : v)}
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
        />
      </div>
      {view === 'month' && <MonthView anchor={anchor} today={today} weekStartsOn={weekStartsOn} />}
      {view === 'week' && (
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <TimeGrid days={rangeISO(weekStart, 7)} today={today} />
          </div>
        </div>
      )}
      {view === 'day' && <TimeGrid days={[anchor]} today={today} />}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-[3px] rounded-full bg-accent" /> Event
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full border border-faint" /> Task / assignment
        </span>
        <span>◆ Milestone</span>
        <span>⚑ Project deadline</span>
        <span className="inline-flex items-center gap-1">
          <Repeat size={11} /> Repeating
        </span>
      </div>
    </div>
  );
}
