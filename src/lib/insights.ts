/**
 * Rule-based "smart" features. These work offline and without any AI key:
 * daily completion, alerts, the weekly summary and an automatic day planner.
 */
import type { CalendarEvent, Habit, Task, TimeBlock } from '@shared/schema';
import type { AppState } from './store';
import { addDaysISO, daysBetween, formatRelativeDay, formatTime, minutesToTime, rangeISO, timeToMinutes, toISO, weekStartISO } from './dates';
import { currentStreak, isDoneOn, isScheduled, habitStartDate, weekCount } from './habits';
import { isOpen, rankTasks, type PriorityContext } from './priority';
import { occurrencesInRange } from './recurrence';
import { goalProgress, nextMilestone } from './progress';
import { currentGpa, fmtPct, letterGrade, overallAverage } from './grades';
import { uid } from './id';

export const priorityContext = (s: AppState, today: string): PriorityContext => ({
  today,
  classes: s.classes,
  tasks: s.tasks,
  periods: s.settings.markingPeriods,
});

const completedOn = (t: Task, date: string) => t.status === 'done' && !!t.completedAt && toISO(new Date(t.completedAt)) === date;

export function dailyHabits(habits: Habit[], date: string) {
  return habits.filter((h) => !h.archived && h.frequency === 'daily' && isScheduled(h, date) && date >= habitStartDate(h));
}

export function todayCompletion(s: AppState, today: string) {
  const taskItems = s.tasks.filter(
    (t) => !t.archived && ((isOpen(t) && t.dueDate && t.dueDate <= today) || (t.status === 'done' && (t.dueDate === today || completedOn(t, today)))),
  );
  const habits = dailyHabits(s.habits, today);
  const weekly = s.habits.filter((h) => !h.archived && h.frequency === 'weekly');
  const tasksDone = taskItems.filter((t) => t.status === 'done').length;
  const habitsDone = habits.filter((h) => isDoneOn(h, today)).length + weekly.filter((h) => isDoneOn(h, today)).length;
  const total = taskItems.length + habits.length + weekly.filter((h) => isDoneOn(h, today)).length;
  const done = tasksDone + habitsDone;
  return {
    done,
    total,
    pct: total ? (done / total) * 100 : null,
    tasks: { done: tasksDone, total: taskItems.length },
    habits: { done: habits.filter((h) => isDoneOn(h, today)).length, total: habits.length },
  };
}

/** "today", "tomorrow", "on Fri", "on Nov 4" — reads naturally mid-sentence. */
function whenText(date: string, today: string) {
  const rel = formatRelativeDay(date, today);
  return rel === 'Today' || rel === 'Tomorrow' ? rel.toLowerCase() : `on ${rel}`;
}

export interface Alert {
  id: string;
  level: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  /** Hash route to open. */
  href: string;
}

export function buildAlerts(s: AppState, today: string): Alert[] {
  const alerts: Alert[] = [];
  const horizon = addDaysISO(today, s.settings.alertDays);
  const className = (id?: string) => s.classes.find((c) => c.id === id)?.name;

  const overdue = s.tasks.filter((t) => isOpen(t) && t.dueDate && t.dueDate < today);
  const overdueSchool = overdue.filter((t) => t.classId);
  if (overdueSchool.length) {
    alerts.push({
      id: 'overdue-school',
      level: 'critical',
      title: `${overdueSchool.length} overdue assignment${overdueSchool.length > 1 ? 's' : ''}`,
      detail: overdueSchool.slice(0, 3).map((t) => `${t.title}${className(t.classId) ? ` (${className(t.classId)})` : ''}`).join(' · '),
      href: '#/school?tab=missing',
    });
  }
  const overdueOther = overdue.filter((t) => !t.classId);
  if (overdueOther.length) {
    alerts.push({
      id: 'overdue-tasks',
      level: 'warning',
      title: `${overdueOther.length} overdue task${overdueOther.length > 1 ? 's' : ''}`,
      detail: overdueOther.slice(0, 3).map((t) => t.title).join(' · '),
      href: '#/tasks?view=overdue',
    });
  }
  for (const t of s.tasks) {
    if (!isOpen(t) || !t.classId || !t.dueDate || t.dueDate < today || t.dueDate > horizon) continue;
    if (t.assignmentType !== 'test' && t.assignmentType !== 'quiz' && t.assignmentType !== 'project' && t.priority !== 'urgent') continue;
    alerts.push({
      id: `soon-${t.id}`,
      level: daysBetween(today, t.dueDate) <= 1 ? 'warning' : 'info',
      title: `${t.assignmentType ? t.assignmentType[0].toUpperCase() + t.assignmentType.slice(1) : 'Due'} ${whenText(t.dueDate, today)}: ${t.title}`,
      detail: className(t.classId) ?? '',
      href: `#/school?task=${t.id}`,
    });
  }
  for (const p of s.projects) {
    if (p.archived || p.status === 'completed') continue;
    const m = nextMilestone(p);
    if (m?.dueDate && m.dueDate <= horizon) {
      alerts.push({
        id: `ms-${p.id}-${m.id}`,
        level: m.dueDate < today ? 'warning' : 'info',
        title: `Milestone ${m.dueDate < today ? 'overdue' : whenText(m.dueDate, today)}: ${m.title}`,
        detail: p.name,
        href: `#/business/${p.id}`,
      });
    }
    if (p.deadline && p.deadline >= today && p.deadline <= horizon) {
      alerts.push({ id: `dl-${p.id}`, level: 'warning', title: `Project deadline ${whenText(p.deadline, today)}`, detail: p.name, href: `#/business/${p.id}` });
    }
  }
  for (const h of s.habits) {
    if (h.archived || h.frequency !== 'daily' || !isScheduled(h, today) || isDoneOn(h, today)) continue;
    const streak = currentStreak(h, today, s.settings.weekStartsOn);
    if (streak >= 3) alerts.push({ id: `streak-${h.id}`, level: 'info', title: `Keep your ${streak}-day ${h.name} streak`, detail: 'Not checked off yet today', href: '#/habits' });
  }
  for (const r of s.reminders) {
    if (!r.done && r.date && r.date <= today) alerts.push({ id: `rem-${r.id}`, level: r.date < today ? 'warning' : 'info', title: r.title, detail: r.date < today ? 'Reminder past due' : 'Reminder for today', href: '#/' });
  }
  const order = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}

export interface Occurrence {
  event: CalendarEvent;
  date: string;
}

export function eventsInRange(events: CalendarEvent[], start: string, end: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const e of events) for (const date of occurrencesInRange(e.date, e.recurrence, start, end)) out.push({ event: e, date });
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.event.startTime ?? '').localeCompare(b.event.startTime ?? ''));
}

export function weekSummary(s: AppState, weekStart: string) {
  const days = rangeISO(weekStart, 7);
  const end = days[6];
  const perDay = days.map((date) => {
    const tasksDone = s.tasks.filter((t) => completedOn(t, date)).length;
    const habits = dailyHabits(s.habits, date);
    return { date, tasksDone, habitsDue: habits.length, habitsDone: habits.filter((h) => isDoneOn(h, date)).length };
  });
  const completed = s.tasks.filter((t) => t.status === 'done' && t.completedAt && toISO(new Date(t.completedAt)) >= weekStart && toISO(new Date(t.completedAt)) <= end);
  const unfinished = s.tasks.filter((t) => isOpen(t) && t.dueDate && t.dueDate <= end);
  const habitsDue = perDay.reduce((n, d) => n + d.habitsDue, 0);
  const habitsDone = perDay.reduce((n, d) => n + d.habitsDone, 0);
  const weeklyHabits = s.habits.filter((h) => !h.archived && h.frequency === 'weekly').map((h) => ({ habit: h, count: weekCount(h, weekStart) }));
  const goals = s.goals.filter((g) => g.horizon === 'weekly' && g.weekStart === weekStart);
  const milestonesHit = s.projects.flatMap((p) => p.milestones.filter((m) => m.done && m.dueDate && m.dueDate >= weekStart && m.dueDate <= end).map((m) => ({ project: p, milestone: m })));
  return {
    days: perDay,
    completed,
    unfinished,
    habitRate: habitsDue ? habitsDone / habitsDue : null,
    weeklyHabits,
    goals: goals.map((g) => ({ goal: g, progress: goalProgress(g, s.tasks) })),
    milestonesHit,
  };
}

/**
 * Automatic day planner: drops the highest-priority open tasks into the free
 * gaps between today's fixed events. Durations come from estimates, or a
 * sensible default by assignment type.
 */
export function planDay(
  s: AppState,
  date: string,
  opts: { start: string; end: string; breakMinutes?: number; maxTasks?: number },
): TimeBlock[] {
  const busy = eventsInRange(s.events, date, date)
    .filter((o) => o.event.startTime)
    .map((o) => {
      const start = timeToMinutes(o.event.startTime!);
      const end = o.event.endTime ? timeToMinutes(o.event.endTime) : start + 60;
      return { start, end };
    })
    .sort((a, b) => a.start - b.start);

  let cursor = timeToMinutes(opts.start);
  const endOfDay = timeToMinutes(opts.end);
  const gaps: { start: number; end: number }[] = [];
  for (const b of busy) {
    if (b.start > cursor) gaps.push({ start: cursor, end: Math.min(b.start, endOfDay) });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < endOfDay) gaps.push({ start: cursor, end: endOfDay });

  const defaultMinutes = (t: Task) => {
    if (t.estimateMinutes) return t.estimateMinutes;
    switch (t.assignmentType) {
      case 'test':
        return 60;
      case 'project':
      case 'essay':
        return 60;
      case 'quiz':
      case 'study':
        return 45;
      default:
        return 30;
    }
  };

  const ranked = rankTasks(s.tasks, priorityContext(s, date)).filter((r) => !r.task.dueDate || r.task.dueDate <= addDaysISO(date, 14));
  // Only task blocks are stored; fixed events are always read live from the calendar.
  const blocks: TimeBlock[] = [];
  const breakMin = opts.breakMinutes ?? 10;
  let placed = 0;
  for (const { task } of ranked) {
    if (placed >= (opts.maxTasks ?? 6)) break;
    const need = Math.min(defaultMinutes(task), 120);
    const gap = gaps.find((g) => g.end - g.start >= need);
    if (!gap) continue;
    blocks.push({ id: uid('blk'), start: minutesToTime(gap.start), end: minutesToTime(gap.start + need), label: task.title, taskId: task.id });
    gap.start += need + breakMin;
    placed++;
  }
  return blocks.sort((a, b) => a.start.localeCompare(b.start));
}

/** Compact plain-text snapshot sent to the (optional) AI assistant. */
export function buildAiContext(s: AppState, today: string): string {
  const lines: string[] = [];
  const name = (id: string | undefined, list: { id: string; name: string }[]) => list.find((x) => x.id === id)?.name;
  const ranked = rankTasks(s.tasks, priorityContext(s, today));
  lines.push(`User: ${s.settings.name || 'unknown'}`);
  lines.push('', '## Open tasks (ranked by the app; score, reasons)');
  for (const { task: t, p } of ranked.slice(0, 60)) {
    const where = t.classId ? ` [class: ${name(t.classId, s.classes)}]` : t.projectId ? ` [project: ${name(t.projectId, s.projects)}]` : '';
    lines.push(
      `- ${t.title}${where} · ${t.priority}${t.dueDate ? ` · due ${t.dueDate}${t.dueTime ? ` ${t.dueTime}` : ''}` : ''}${t.estimateMinutes ? ` · ~${t.estimateMinutes}m` : ''}${t.assignmentType ? ` · ${t.assignmentType}` : ''} · score ${p.score}${p.reasons.length ? ` (${p.reasons.join(', ')})` : ''}`,
    );
  }
  const upcoming = eventsInRange(s.events, today, addDaysISO(today, 7));
  lines.push('', '## Events next 7 days');
  for (const o of upcoming) lines.push(`- ${o.date}${o.event.startTime ? ` ${formatTime(o.event.startTime)}${o.event.endTime ? `–${formatTime(o.event.endTime)}` : ''}` : ' (all day)'}: ${o.event.title}`);
  lines.push('', '## Habits (today)');
  for (const h of s.habits.filter((h) => !h.archived)) {
    lines.push(`- ${h.name} (${h.frequency}${h.frequency === 'weekly' ? `, ${weekCount(h, weekStartISO(today, s.settings.weekStartsOn))}/${h.targetPerWeek} this week` : ''}) · streak ${currentStreak(h, today, s.settings.weekStartsOn)} · ${isDoneOn(h, today) ? 'done today' : 'not done today'}`);
  }
  lines.push('', '## Classes');
  const gpa = currentGpa(s.classes, s.tasks, s.settings.markingPeriods, s.settings.gpaScale);
  for (const c of s.classes.filter((c) => !c.archived)) {
    const a = overallAverage(c, s.tasks, s.settings.markingPeriods);
    lines.push(`- ${c.name}: ${fmtPct(a.average)} (${letterGrade(a.average)})${c.targetGrade ? ` · target ${c.targetGrade}%` : ''}`);
  }
  lines.push(`GPA (${s.settings.gpaScale}): ${gpa.gpa?.toFixed(2) ?? 'n/a'}${s.settings.gpaGoal ? ` · goal ${s.settings.gpaGoal}` : ''}`);
  lines.push('', '## Projects');
  for (const p of s.projects.filter((p) => !p.archived)) {
    const m = nextMilestone(p);
    lines.push(`- ${p.name} (${p.status})${p.deadline ? ` · deadline ${p.deadline}` : ''}${m ? ` · next milestone: ${m.title}${m.dueDate ? ` (${m.dueDate})` : ''}` : ''}${p.nextAction ? ` · next action: ${p.nextAction}` : ''}`);
  }
  lines.push('', '## Goals');
  for (const g of s.goals.filter((g) => g.status === 'active')) lines.push(`- [${g.horizon}] ${g.title}: ${goalProgress(g, s.tasks).label}${g.targetDate ? ` · by ${g.targetDate}` : ''}`);
  const plan = s.dayPlans.find((p) => p.date === today);
  if (plan) {
    lines.push('', "## Today's plan");
    if (plan.intention) lines.push(`Intention: ${plan.intention}`);
    for (const id of plan.topTaskIds) {
      const t = s.tasks.find((x) => x.id === id);
      if (t) lines.push(`Top priority: ${t.title}${t.status === 'done' ? ' (done)' : ''}`);
    }
  }
  return lines.join('\n');
}
