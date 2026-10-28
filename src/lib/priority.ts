import type { MarkingPeriod, SchoolClass, Task } from '@shared/schema';
import { daysBetween } from './dates';
import { gradeImpact, periodFor } from './grades';

export interface PriorityScore {
  score: number;
  reasons: string[];
  /** Percentage points of a class average at stake, if known. */
  impact: number | null;
}

const IMPORTANCE: Record<Task['priority'], number> = { low: 0, medium: 10, high: 22, urgent: 34 };
const TYPE_WEIGHT: Partial<Record<NonNullable<Task['assignmentType']>, number>> = {
  test: 12,
  project: 11,
  essay: 10,
  quiz: 8,
  lab: 6,
  homework: 3,
};

export interface PriorityContext {
  today: string;
  classes: SchoolClass[];
  tasks: Task[];
  periods: MarkingPeriod[];
}

/**
 * Score an open task on urgency (due date), importance (priority) and — for
 * school work — how much of the class grade it can move. Higher = do sooner.
 * Every component is explained in `reasons` so the ranking is never a black box.
 */
export function scoreTask(task: Task, ctx: PriorityContext): PriorityScore {
  const reasons: string[] = [];
  let score = 0;

  if (task.dueDate) {
    const d = daysBetween(ctx.today, task.dueDate);
    if (d < 0) {
      score += 50 + Math.min(-d * 3, 20);
      reasons.push(d === -1 ? '1 day overdue' : `${-d} days overdue`);
    } else if (d === 0) {
      score += 45;
      reasons.push('Due today');
    } else if (d === 1) {
      score += 38;
      reasons.push('Due tomorrow');
    } else if (d <= 3) {
      score += 30;
      reasons.push(`Due in ${d} days`);
    } else if (d <= 7) {
      score += 20;
      reasons.push('Due this week');
    } else if (d <= 14) score += 10;
    else score += 4;
  } else {
    score += 6;
  }

  score += IMPORTANCE[task.priority];
  if (task.priority === 'urgent' || task.priority === 'high') reasons.push(`${task.priority[0].toUpperCase()}${task.priority.slice(1)} priority`);

  let impact: number | null = null;
  if (task.classId) {
    const cls = ctx.classes.find((c) => c.id === task.classId);
    const period = task.dueDate ? periodFor(task.dueDate, ctx.periods) : undefined;
    impact = gradeImpact(task, cls, ctx.tasks, period);
    if (impact !== null) {
      score += Math.min(impact * 1.5, 25);
      if (impact >= 1) reasons.push(`Up to ${impact.toFixed(1)} pts of grade`);
    } else if (task.assignmentType && TYPE_WEIGHT[task.assignmentType]) {
      score += TYPE_WEIGHT[task.assignmentType]!;
      if ((TYPE_WEIGHT[task.assignmentType] ?? 0) >= 8) reasons.push(`${task.assignmentType[0].toUpperCase()}${task.assignmentType.slice(1)}`);
    }
  }

  if (task.status === 'in_progress') {
    score += 4;
    reasons.push('In progress');
  }
  return { score: Math.round(score * 10) / 10, reasons, impact };
}

export const isOpen = (t: Task) => t.status !== 'done' && !t.archived;
export const isOverdue = (t: Task, today: string) => isOpen(t) && !!t.dueDate && t.dueDate < today;

export function rankTasks(tasks: Task[], ctx: PriorityContext): { task: Task; p: PriorityScore }[] {
  return tasks
    .filter(isOpen)
    .map((task) => ({ task, p: scoreTask(task, ctx) }))
    .sort((a, b) => b.p.score - a.p.score || (a.task.dueDate ?? '9999').localeCompare(b.task.dueDate ?? '9999'));
}
