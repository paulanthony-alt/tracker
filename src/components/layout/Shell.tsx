import { useMemo, type ReactNode } from 'react';
import { create } from 'zustand';
import {
  AlertTriangle,
  Bell,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ChevronsLeft,
  ChevronsRight,
  Cloud,
  CloudOff,
  Flame,
  GraduationCap,
  HardDrive,
  Info,
  LayoutDashboard,
  Loader2,
  Menu,
  NotebookPen,
  Plus,
  Search,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui';
import { useRoute } from '@/lib/router';
import { useToday } from '@/lib/useToday';
import { buildAlerts } from '@/lib/insights';
import { isOverdue } from '@/lib/priority';
import { cn } from '@/lib/util';
import { useToasts } from '@/lib/toast';
import { Button, IconButton } from '../ui/primitives';
import { Popover } from '../ui/Field';

const NAV = [
  { href: '#/', id: '', label: 'Dashboard', icon: LayoutDashboard },
  { href: '#/tasks', id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { href: '#/calendar', id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { href: '#/school', id: 'school', label: 'School', icon: GraduationCap },
  { href: '#/business', id: 'business', label: 'Business', icon: Briefcase },
  { href: '#/habits', id: 'habits', label: 'Habits & Goals', icon: Flame },
  { href: '#/notes', id: 'notes', label: 'Notes', icon: NotebookPen },
  { href: '#/assistant', id: 'assistant', label: 'Assistant', icon: Sparkles },
];

function useBadges() {
  const today = useToday();
  const tasks = useStore((s) => s.tasks);
  return useMemo(() => {
    let overdue = 0;
    let missing = 0;
    let dueToday = 0;
    for (const t of tasks) {
      if (isOverdue(t, today)) {
        overdue++;
        if (t.classId) missing++;
      } else if (t.status !== 'done' && !t.archived && t.dueDate === today) dueToday++;
    }
    return { tasks: overdue + dueToday, overdue, school: missing };
  }, [tasks, today]);
}

function SyncIndicator({ collapsed }: { collapsed: boolean }) {
  const mode = useStore((s) => s.storageMode);
  const status = useStore((s) => s.syncStatus);
  const detail = useStore((s) => s.syncDetail);
  const info =
    mode === 'local'
      ? { icon: <HardDrive size={14} />, text: 'Saved in this browser', tone: 'text-warn', title: 'No server connected — data is stored in this browser only. Export backups from Settings.' }
      : status === 'saving'
        ? { icon: <Loader2 size={14} className="animate-spin" />, text: 'Saving…', tone: 'text-faint', title: 'Saving to the database' }
        : status === 'offline'
          ? { icon: <CloudOff size={14} />, text: mode === 'firebase' ? 'Offline — saved on device' : 'Offline — changes queued', tone: 'text-warn', title: mode === 'firebase' ? 'You’re offline. Changes are saved on this device and sync when you reconnect.' : `Can’t reach the server (${detail ?? 'network'}). Changes are kept and will sync automatically.` }
          : status === 'error'
            ? { icon: <AlertTriangle size={14} />, text: 'Some changes rejected', tone: 'text-bad', title: detail ?? 'The server rejected a change' }
            : { icon: <Cloud size={14} />, text: mode === 'firebase' ? 'Synced' : 'All changes saved', tone: 'text-faint', title: mode === 'firebase' ? 'Saved to your Firebase account and synced to your devices' : 'Saved to the local database' };
  return (
    <a href="#/settings" title={info.title} className={cn('flex h-8 items-center gap-2 rounded-lg px-2.5 text-xs hover:bg-surface-2', info.tone, collapsed && 'justify-center px-0')}>
      {info.icon}
      {!collapsed && <span className="truncate">{info.text}</span>}
    </a>
  );
}

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const route = useRoute();
  const badges = useBadges();
  const name = useStore((s) => s.settings.name);
  const section = route.path[0] ?? '';
  const badgeFor = (id: string) => (id === 'tasks' ? badges.tasks : id === 'school' ? badges.school : 0);

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-14 items-center gap-2.5 px-4', collapsed && 'justify-center px-0')}>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-3">
          <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
            <circle cx="16" cy="16" r="9" fill="none" stroke="rgb(var(--line-strong))" strokeWidth="3.5" />
            <path d="M16 7a9 9 0 0 1 8.5 12" fill="none" stroke="rgb(var(--accent))" strokeWidth="3.5" strokeLinecap="round" />
          </svg>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-4 tracking-tight">Vyro</p>
            <p className="truncate text-[11px] text-faint">{name ? `${name}’s workspace` : 'Personal workspace'}</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-2" aria-label="Main">
        {NAV.map((item) => {
          const active = section === item.id;
          const count = badgeFor(item.id);
          return (
            <a
              key={item.id}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                'group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13px] font-medium transition-colors',
                active ? 'bg-surface-3 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
                collapsed && 'justify-center px-0',
              )}
            >
              <item.icon size={17} className={cn('shrink-0', active ? 'text-accent' : 'text-faint group-hover:text-muted')} />
              {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
              {count > 0 &&
                (collapsed ? (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-bad" />
                ) : (
                  <span className={cn('rounded-md px-1.5 text-[11px] tabular-nums', item.id === 'school' || badges.overdue ? 'bg-bad/15 text-bad' : 'bg-surface-3 text-muted')}>{count}</span>
                ))}
            </a>
          );
        })}
      </nav>

      <div className="space-y-0.5 border-t border-line px-2.5 py-2.5">
        <SyncIndicator collapsed={collapsed} />
        <a
          href="#/settings"
          onClick={onNavigate}
          className={cn('flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13px] font-medium', section === 'settings' ? 'bg-surface-3 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg', collapsed && 'justify-center px-0')}
          title={collapsed ? 'Settings' : undefined}
        >
          <Settings size={17} className="text-faint" />
          {!collapsed && 'Settings'}
        </a>
        {!onNavigate && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn('hidden h-9 w-full items-center gap-3 rounded-lg px-2.5 text-[13px] text-faint hover:bg-surface-2 hover:text-fg lg:flex', collapsed && 'justify-center px-0')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight size={17} /> : <ChevronsLeft size={17} />}
            {!collapsed && 'Collapse'}
          </button>
        )}
      </div>
    </div>
  );
}

// Sidebar collapse is a per-device preference, so it lives in localStorage.
const readCollapsed = () => {
  try {
    return localStorage.getItem('lifeos.sidebar') === 'collapsed';
  } catch {
    return false;
  }
};
const useLayout = create<{ collapsed: boolean }>(() => ({ collapsed: readCollapsed() }));
function toggleCollapsed() {
  const next = !useLayout.getState().collapsed;
  useLayout.setState({ collapsed: next });
  try {
    localStorage.setItem('lifeos.sidebar', next ? 'collapsed' : 'expanded');
  } catch {
    /* ignore */
  }
}

function AlertsButton() {
  const state = useStore();
  const today = useToday();
  const alerts = useMemo(() => buildAlerts(state, today), [state, today]);
  const urgent = alerts.filter((a) => a.level !== 'info').length;
  return (
    <Popover
      width={340}
      trigger={({ toggle, ref }) => (
        <IconButton ref={ref} label={`Alerts (${alerts.length})`} onClick={toggle} className="relative">
          <Bell size={17} />
          {alerts.length > 0 && <span className={cn('absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-bg', urgent ? 'bg-bad' : 'bg-accent')} />}
        </IconButton>
      )}
    >
      {(close) => (
        <div>
          <p className="eyebrow px-2.5 pb-1.5 pt-2">Alerts</p>
          {alerts.length === 0 ? (
            <p className="px-2.5 pb-3 text-[13px] text-faint">You’re all caught up — nothing overdue or due soon.</p>
          ) : (
            alerts.slice(0, 12).map((a) => (
              <a key={a.id} href={a.href} onClick={close} className="flex gap-2.5 rounded-lg px-2.5 py-2 hover:bg-surface-3">
                <span className={cn('mt-0.5', a.level === 'critical' ? 'text-bad' : a.level === 'warning' ? 'text-warn' : 'text-accent')}>
                  {a.level === 'info' ? <Info size={15} /> : <AlertTriangle size={15} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] leading-5">{a.title}</span>
                  {a.detail && <span className="block truncate text-xs text-faint">{a.detail}</span>}
                </span>
              </a>
            ))
          )}
        </div>
      )}
    </Popover>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const collapsed = useLayout((s) => s.collapsed);
  const mobileOpen = useUI((s) => s.mobileNavOpen);
  const setMobile = useUI((s) => s.setMobileNav);
  const setPalette = useUI((s) => s.setPalette);
  const open = useUI((s) => s.open);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div className="flex h-full">
      <aside className={cn('hidden shrink-0 border-r border-line bg-surface/60 transition-[width] duration-200 lg:block', collapsed ? 'w-[64px]' : 'w-[232px]')}>
        <SidebarContent collapsed={collapsed} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={() => setMobile(false)} />
          <aside className="absolute inset-y-0 left-0 w-[264px] animate-slide-in border-r border-line bg-surface pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
            <IconButton label="Close menu" className="absolute right-2 top-[calc(0.75rem+env(safe-area-inset-top))]" onClick={() => setMobile(false)}>
              <X size={17} />
            </IconButton>
            <SidebarContent collapsed={false} onNavigate={() => setMobile(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-bg/85 px-3 backdrop-blur-md sm:px-5">
          <IconButton label="Open menu" className="lg:hidden" onClick={() => setMobile(true)}>
            <Menu size={18} />
          </IconButton>
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="flex h-9 min-w-0 max-w-md flex-1 items-center gap-2.5 rounded-lg border border-line bg-surface px-3 text-left text-[13px] text-faint transition-colors hover:border-line-strong hover:text-muted"
          >
            <Search size={15} className="shrink-0" />
            <span className="flex-1 truncate">Search everything…</span>
            <span className="kbd hidden sm:inline-flex">{isMac ? '⌘' : 'Ctrl'} K</span>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <AlertsButton />
            <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => open({ kind: 'quickadd' })} className="ml-1" title="Quick add (N)">
              <span className="hidden sm:inline">New</span>
            </Button>
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex max-w-sm animate-toast-in items-center gap-2.5 rounded-xl border border-line-strong bg-surface-2 px-3.5 py-2.5 text-[13px] shadow-pop">
          {t.kind === 'success' ? <CheckCircle2 size={16} className="shrink-0 text-good" /> : t.kind === 'error' ? <AlertTriangle size={16} className="shrink-0 text-bad" /> : <Info size={16} className="shrink-0 text-accent" />}
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="shrink-0 font-medium text-accent hover:underline"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" aria-label="Dismiss" className="shrink-0 text-faint hover:text-fg" onClick={() => dismiss(t.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
