import { memo } from 'react';
import { Archive, Copy, Flag, MoreHorizontal, Pencil, Repeat, Star, Trash2 } from 'lucide-react';
import type { Task } from '@shared/schema';
import { useStore } from '@/lib/store';
import { openModal } from '@/lib/ui';
import { formatRelativeDay, formatTime } from '@/lib/dates';
import { taskPercent } from '@/lib/grades';
import { cn } from '@/lib/util';
import { useToday } from '@/lib/useToday';
import { toast } from '@/lib/toast';
import { Badge, Checkbox, IconButton } from './ui/primitives';
import { confirmAction } from './ui/Modal';
import { MenuItem, Popover } from './ui/Field';

export const PRIORITY_COLOR: Record<Task['priority'], string> = {
  urgent: 'rgb(var(--bad))',
  high: 'rgb(var(--warn))',
  medium: 'rgb(var(--accent))',
  low: 'rgb(var(--faint))',
};

export async function deleteTaskWithConfirm(task: Task) {
  const ok = await confirmAction({ title: 'Delete this task?', message: <>“{task.title}” will be permanently deleted.</> });
  if (ok) {
    useStore.getState().remove('tasks', task.id);
    toast.info('Task deleted');
  }
}

export function toggleTopPriority(taskId: string, date: string) {
  const s = useStore.getState();
  const plan = s.dayPlans.find((p) => p.date === date);
  const ids = plan?.topTaskIds ?? [];
  if (ids.includes(taskId)) s.upsertDayPlan(date, { topTaskIds: ids.filter((i) => i !== taskId) });
  else if (ids.length >= 3) toast.error('You already have 3 priorities for today. Remove one first.');
  else s.upsertDayPlan(date, { topTaskIds: [...ids, taskId] });
}

interface Props {
  task: Task;
  /** Show class/project name. */
  context?: boolean;
  reasons?: string[];
  compact?: boolean;
  draggable?: boolean;
}

export const TaskItem = memo(function TaskItem({ task, context = true, reasons, compact, draggable = true }: Props) {
  const today = useToday();
  const toggle = useStore((s) => s.toggleTask);
  const cls = useStore((s) => (task.classId ? s.classes.find((c) => c.id === task.classId) : undefined));
  const project = useStore((s) => (task.projectId ? s.projects.find((p) => p.id === task.projectId) : undefined));
  const isTop = useStore((s) => s.dayPlans.find((p) => p.date === today)?.topTaskIds.includes(task.id) ?? false);
  const done = task.status === 'done';
  const overdue = !done && task.dueDate && task.dueDate < today;
  const dueToday = !done && task.dueDate === today;
  const color = cls?.color ?? project?.color;
  const pct = taskPercent(task);

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/x-task-id', task.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => openModal({ kind: 'task', id: task.id })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) openModal({ kind: 'task', id: task.id });
      }}
      tabIndex={0}
      role="button"
      aria-label={`Open ${task.title}`}
      className={cn(
        'group relative flex cursor-pointer items-start gap-3 rounded-xl px-2.5 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2',
        compact ? 'py-1.5' : 'py-2',
      )}
    >
      <Checkbox
        checked={done}
        onChange={() => toggle(task.id)}
        label={done ? `Mark “${task.title}” not done` : `Complete “${task.title}”`}
        round
        color={color}
        className="mt-[1px]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn('truncate text-[13.5px] leading-5', done && 'text-faint line-through decoration-faint/60')}>{task.title}</span>
          {(task.priority === 'urgent' || task.priority === 'high') && !done && (
            <Flag size={12} className="shrink-0" style={{ color: PRIORITY_COLOR[task.priority] }} aria-label={`${task.priority} priority`} />
          )}
          {task.recurrence && <Repeat size={12} className="shrink-0 text-faint" aria-label="Repeats" />}
        </div>
        {!compact || task.dueDate || cls || project ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-faint">
            {task.dueDate && (
              <span className={cn(overdue && 'font-medium text-bad', dueToday && 'font-medium text-accent')}>
                {formatRelativeDay(task.dueDate, today)}
                {task.dueTime && ` · ${formatTime(task.dueTime)}`}
              </span>
            )}
            {context && (cls || project) && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                <span className="truncate">{cls?.name ?? project?.name}</span>
              </span>
            )}
            {task.assignmentType && task.assignmentType !== 'homework' && task.assignmentType !== 'other' && (
              <span className="capitalize">{task.assignmentType}</span>
            )}
            {pct !== null && <Badge tone={pct >= 90 ? 'good' : pct >= 70 ? 'neutral' : 'bad'}>{pct.toFixed(0)}%</Badge>}
            {!compact && task.tags.slice(0, 3).map((t) => <span key={t}>#{t}</span>)}
            {reasons && reasons.length > 0 && !done && <span className="text-muted">{reasons.slice(0, 2).join(' · ')}</span>}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        {!done && (
          <IconButton
            label={isTop ? 'Remove from today’s top 3' : 'Add to today’s top 3'}
            size="xs"
            onClick={(e) => {
              e.stopPropagation();
              toggleTopPriority(task.id, today);
            }}
            className={cn(isTop && '!text-warn')}
          >
            <Star size={14} fill={isTop ? 'currentColor' : 'none'} />
          </IconButton>
        )}
        <div onClick={(e) => e.stopPropagation()}>
          <Popover
            width={190}
            trigger={({ toggle: t, ref }) => (
              <IconButton ref={ref} label="More actions" size="xs" onClick={t}>
                <MoreHorizontal size={15} />
              </IconButton>
            )}
          >
            {(close) => (
              <>
                <MenuItem icon={<Pencil size={14} />} onClick={() => (close(), openModal({ kind: 'task', id: task.id }))}>
                  Edit
                </MenuItem>
                <MenuItem
                  icon={<Copy size={14} />}
                  onClick={() => {
                    close();
                    const { id: _i, createdAt: _c, updatedAt: _u, completedAt: _d, ...rest } = task;
                    void _i, _c, _u, _d;
                    useStore.getState().create('tasks', { ...rest, title: `${task.title} (copy)`, status: 'todo', pointsEarned: undefined, sample: undefined });
                    toast.success('Task duplicated');
                  }}
                >
                  Duplicate
                </MenuItem>
                <MenuItem
                  icon={<Archive size={14} />}
                  onClick={() => {
                    close();
                    useStore.getState().update('tasks', task.id, { archived: !task.archived });
                    toast.info(task.archived ? 'Task restored' : 'Task archived', task.archived ? undefined : { label: 'Undo', run: () => useStore.getState().update('tasks', task.id, { archived: false }) });
                  }}
                >
                  {task.archived ? 'Unarchive' : 'Archive'}
                </MenuItem>
                <MenuItem icon={<Trash2 size={14} />} danger onClick={() => (close(), void deleteTaskWithConfirm(task))}>
                  Delete
                </MenuItem>
              </>
            )}
          </Popover>
        </div>
      </div>
    </div>
  );
});

export function TaskList({ tasks, empty, context, reasons }: { tasks: Task[]; empty?: React.ReactNode; context?: boolean; reasons?: Record<string, string[]> }) {
  if (!tasks.length) return <>{empty ?? null}</>;
  return (
    <div className="-mx-2.5 flex flex-col">
      {tasks.map((t) => (
        <TaskItem key={t.id} task={t} context={context} reasons={reasons?.[t.id]} />
      ))}
    </div>
  );
}
