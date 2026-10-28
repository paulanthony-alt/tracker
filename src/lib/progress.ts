import type { Goal, Project, Task } from '@shared/schema';
import { isOpen } from './priority';

export interface Progress {
  /** 0–100, or null when there's nothing to measure yet. */
  pct: number | null;
  label: string;
}

export function goalProgress(goal: Goal, tasks: Task[]): Progress {
  if (goal.status === 'achieved') return { pct: 100, label: 'Achieved' };
  switch (goal.progressMode) {
    case 'manual': {
      const pct = goal.manualProgress ?? 0;
      return { pct, label: `${Math.round(pct)}%` };
    }
    case 'numeric': {
      const { current = 0, target, unit = '' } = goal;
      if (target === undefined || target === 0) return { pct: null, label: 'Set a target' };
      const pct = Math.max(0, Math.min(100, (current / target) * 100));
      const fmt = (n: number) => (unit === '$' ? `$${n.toLocaleString()}` : `${n.toLocaleString()}${unit ? ` ${unit}` : ''}`);
      return { pct, label: `${fmt(current)} / ${fmt(target)}` };
    }
    case 'milestones': {
      const total = goal.milestones.length;
      if (!total) return { pct: null, label: 'Add milestones' };
      const done = goal.milestones.filter((m) => m.done).length;
      return { pct: (done / total) * 100, label: `${done} / ${total} milestones` };
    }
    case 'tasks': {
      const linked = tasks.filter((t) => t.goalId === goal.id && !t.archived);
      if (!linked.length) return { pct: null, label: 'Link tasks to this goal' };
      const done = linked.filter((t) => t.status === 'done').length;
      return { pct: (done / linked.length) * 100, label: `${done} / ${linked.length} tasks` };
    }
  }
}

export function projectProgress(project: Project, tasks: Task[]): Progress {
  const linked = tasks.filter((t) => t.projectId === project.id && !t.archived);
  const total = linked.length + project.milestones.length;
  if (project.status === 'completed') return { pct: 100, label: 'Completed' };
  if (!total) return { pct: null, label: 'No tasks or milestones yet' };
  const done = linked.filter((t) => t.status === 'done').length + project.milestones.filter((m) => m.done).length;
  return { pct: (done / total) * 100, label: `${done} / ${total} done` };
}

export function projectFinances(project: Project) {
  let revenue = 0;
  let expenses = 0;
  for (const t of project.transactions) {
    if (t.type === 'revenue') revenue += t.amount;
    else expenses += t.amount;
  }
  return { revenue, expenses, profit: revenue - expenses };
}

export function nextMilestone(project: Project) {
  return [...project.milestones]
    .filter((m) => !m.done)
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))[0];
}

export function projectOpenTasks(project: Project, tasks: Task[]) {
  return tasks.filter((t) => t.projectId === project.id && isOpen(t));
}

export const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 === 0 ? 0 : 2 });
