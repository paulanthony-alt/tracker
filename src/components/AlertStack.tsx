import { Bell, BookOpen, CalendarClock, CalendarDays, CalendarRange, CheckSquare, Flame, Sun, X } from 'lucide-react';
import { useAlerts, type ActiveAlert } from '@/lib/notifier';
import { useStore } from '@/lib/store';
import { openModal } from '@/lib/ui';
import { toISO } from '@/lib/dates';
import { cn } from '@/lib/util';
import { toast } from '@/lib/toast';
import { Button, IconButton } from './ui/primitives';

const ICON: Record<ActiveAlert['kind'], React.ReactNode> = {
  reminder: <Bell size={16} />,
  event: <CalendarClock size={16} />,
  task: <CheckSquare size={16} />,
  digest: <Sun size={16} />,
  habits: <Flame size={16} />,
  tomorrow: <CalendarDays size={16} />,
  week: <CalendarRange size={16} />,
  study: <BookOpen size={16} />,
};

function snoozeReminder(id: string, minutes: number) {
  const later = new Date(Date.now() + minutes * 60_000);
  const time = `${String(later.getHours()).padStart(2, '0')}:${String(later.getMinutes()).padStart(2, '0')}`;
  useStore.getState().update('reminders', id, { date: toISO(later), time, done: false });
  toast.info(`Snoozed until ${later.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
}

function AlertCard({ a }: { a: ActiveAlert }) {
  const dismiss = useAlerts((s) => s.dismiss);
  const s = useStore.getState;
  const close = () => dismiss(a.key);
  const open = () => {
    close();
    if (a.kind === 'task' && a.refId) openModal({ kind: 'task', id: a.refId });
    else window.location.hash = a.url;
  };
  return (
    <div
      role="alert"
      className={cn(
        'pointer-events-auto w-full animate-toast-in rounded-2xl border bg-surface-2 p-3.5 shadow-pop',
        a.important ? 'border-warn/50' : 'border-line-strong',
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', a.important ? 'bg-warn/15 text-warn' : 'bg-accent/12 text-accent')}>{ICON[a.kind]}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium leading-5">{a.title}</p>
          <p className="mt-0.5 whitespace-pre-line text-xs text-muted">{a.body}</p>
          {a.missed && <p className="mt-0.5 text-[11px] text-faint">Came due while Vyro was closed</p>}
        </div>
        <IconButton label="Dismiss" size="xs" onClick={close} className="-mr-1 -mt-1">
          <X size={14} />
        </IconButton>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 pl-11">
        {a.kind === 'reminder' && a.refId && (
          <>
            <Button size="xs" variant="primary" onClick={() => (s().update('reminders', a.refId!, { done: true }), close())}>
              Done
            </Button>
            <Button size="xs" onClick={() => (snoozeReminder(a.refId!, 10), close())}>
              Snooze 10 min
            </Button>
            <Button size="xs" variant="ghost" onClick={() => (snoozeReminder(a.refId!, 60), close())}>
              1 hour
            </Button>
          </>
        )}
        {a.kind === 'task' && a.refId && (
          <>
            <Button size="xs" variant="primary" onClick={() => (s().toggleTask(a.refId!), close())}>
              Mark done
            </Button>
            <Button size="xs" onClick={open}>
              Open
            </Button>
          </>
        )}
        {(a.kind === 'event' || a.kind === 'digest' || a.kind === 'habits') && (
          <Button size="xs" onClick={open}>
            Open
          </Button>
        )}
      </div>
    </div>
  );
}

export function AlertStack() {
  const alerts = useAlerts((s) => s.alerts);
  const clear = useAlerts((s) => s.clear);
  if (!alerts.length) return null;
  const shown = alerts.slice(-3).reverse();
  return (
    <div className="pointer-events-none fixed right-0 top-16 z-[65] flex w-full max-w-sm flex-col gap-2 px-3 sm:right-4 sm:px-0" aria-live="assertive">
      {shown.map((a) => (
        <AlertCard key={a.key} a={a} />
      ))}
      {alerts.length > 3 && (
        <button type="button" onClick={clear} className="pointer-events-auto self-end rounded-lg bg-surface-2 px-2.5 py-1 text-xs text-muted shadow-pop hover:text-fg">
          +{alerts.length - 3} more · Dismiss all
        </button>
      )}
    </div>
  );
}
