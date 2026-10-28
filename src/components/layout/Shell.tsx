import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { BrandLockup, BrandMark, Wordmark } from '../BrandMark';
import { Button, IconButton } from '../ui/primitives';
import { Popover } from '../ui/Field';

const NAV = [
  { href: '#/', id: '', label: 'Dashboard', icon: LayoutDashboard, group: 'Overview' },
  { href: '#/tasks', id: 'tasks', label: 'Tasks', icon: CheckSquare, group: 'Overview' },
  { href: '#/calendar', id: 'calendar', label: 'Calendar', icon: CalendarDays, group: 'Overview' },
  { href: '#/school', id: 'school', label: 'School', icon: GraduationCap, group: 'Areas' },
  { href: '#/business', id: 'business', label: 'Business', icon: Briefcase, group: 'Areas' },
  { href: '#/habits', id: 'habits', label: 'Habits & Goals', icon: Flame, group: 'Areas' },
  { href: '#/notes', id: 'notes', label: 'Notes', icon: NotebookPen, group: 'Tools' },
  { href: '#/assistant', id: 'assistant', label: 'Assistant', icon: Sparkles, group: 'Tools' },
];
const GROUPS = ['Overview', 'Areas', 'Tools'] as const;
const sectionLabel = (id: string) => (id === 'settings' ? 'Settings' : (NAV.find((n) => n.id === id)?.label ?? 'Dashboard'));

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
        ? { icon: <Loader2 size={14} className="animate-spin" />, text: 'Saving…', tone: 'text-info', title: 'Saving to the database' }
        : status === 'offline'
          ? { icon: <CloudOff size={14} />, text: mode === 'firebase' ? 'Offline — saved on device' : 'Offline — changes queued', tone: 'text-warn', title: mode === 'firebase' ? 'You’re offline. Changes are saved on this device and sync when you reconnect.' : `Can’t reach the server (${detail ?? 'network'}). Changes are kept and will sync automatically.` }
          : status === 'error'
            ? { icon: <AlertTriangle size={14} />, text: 'Some changes rejected', tone: 'text-bad', title: detail ?? 'The server rejected a change' }
            : { icon: <Cloud size={14} />, text: mode === 'firebase' ? 'Synced' : 'All changes saved', tone: 'text-good', title: mode === 'firebase' ? 'Saved to your Firebase account and synced to your devices' : 'Saved to the local database' };
  return (
    <a href="#/settings" title={info.title} className={cn('flex h-8 items-center gap-2.5 rounded-md px-2.5 hover:bg-surface-2', collapsed && 'justify-center px-0')}>
      <span className={cn('led', info.tone, status === 'saving' && 'animate-pulse')} aria-hidden />
      {!collapsed && <span className={cn('truncate font-mono text-[10.5px] uppercase tracking-[0.12em]', info.tone === 'text-good' ? 'text-muted' : info.tone)}>{info.text}</span>}
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
      <div className={cn('flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4', collapsed && 'justify-center px-0')}>
        <BrandMark className="h-8 w-8 rounded-lg shadow-[0_0_18px_-4px_rgb(var(--accent)/0.7)]" />
        {!collapsed && (
          <div className="min-w-0">
            <Wordmark className="mb-1 block h-2.5 text-fg" />
            <p className="truncate text-[11px] text-faint">{name ? `${name}’s workspace` : 'Personal workspace'}</p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-2 pt-3" aria-label="Main">
        {GROUPS.map((group) => (
          <div key={group} className="mb-3">
            {collapsed ? <div className="mx-auto mb-1.5 h-px w-6 bg-line" /> : <p className="eyebrow mb-1 px-2.5 text-[10px]">{group}</p>}
            <div className="space-y-0.5">
              {NAV.filter((n) => n.group === group).map((item) => {
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
                      'group relative flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px] font-medium transition-colors',
                      active ? 'bg-gradient-to-r from-accent/[0.16] to-accent/[0.02] text-fg shadow-[inset_0_0_0_1px_rgb(var(--accent)/0.18)]' : 'text-muted hover:bg-surface-2 hover:text-fg',
                      collapsed && 'justify-center px-0',
                    )}
                  >
                    {active && <span className="absolute -left-2.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-accent shadow-[0_0_12px_rgb(var(--accent))]" aria-hidden />}
                    <item.icon size={17} className={cn('shrink-0', active ? 'text-accent drop-shadow-[0_0_6px_rgb(var(--accent)/0.7)]' : 'text-faint group-hover:text-muted')} />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {count > 0 &&
                      (collapsed ? (
                        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-bad" />
                      ) : (
                        <span className={cn('rounded border px-1.5 font-mono text-[10.5px] tabular-nums', item.id === 'school' || badges.overdue ? 'border-bad/30 bg-bad/10 text-bad' : 'border-line-strong bg-surface-3 text-muted')}>{count}</span>
                      ))}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-0.5 border-t border-line px-2.5 pb-2.5 pt-2">
        <SyncIndicator collapsed={collapsed} />
        <a
          href="#/settings"
          onClick={onNavigate}
          className={cn('flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px] font-medium', section === 'settings' ? 'bg-gradient-to-r from-accent/[0.16] to-accent/[0.02] text-fg shadow-[inset_0_0_0_1px_rgb(var(--accent)/0.18)]' : 'text-muted hover:bg-surface-2 hover:text-fg', collapsed && 'justify-center px-0')}
          title={collapsed ? 'Settings' : undefined}
        >
          <Settings size={17} className="text-faint" />
          {!collapsed && 'Settings'}
        </a>
        {!onNavigate && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn('hidden h-9 w-full items-center gap-3 rounded-md px-2.5 text-[13px] text-faint hover:bg-surface-2 hover:text-fg lg:flex', collapsed && 'justify-center px-0')}
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
          {alerts.length > 0 && <span className={cn('led absolute right-1.5 top-1.5', urgent ? 'text-bad' : 'text-accent')} />}
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

/** Live local time for the header, ticking every second. */
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const [clock, ampm] = time.split(/\s(?=[AP]M$)/i);
  return (
    <div className="hidden items-center gap-3 border-r border-line pr-3 md:flex" aria-label={`Local time ${time}`}>
      <div className="text-right leading-none">
        <p className="readout text-[15px] font-medium text-fg">
          {clock}
          {ampm && <span className="ml-1 text-[10px] text-faint">{ampm}</span>}
        </p>
        <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-faint">{now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</p>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const section = useRoute().path[0] ?? '';
  const collapsed = useLayout((s) => s.collapsed);
  const mobileOpen = useUI((s) => s.mobileNavOpen);
  const setMobile = useUI((s) => s.setMobileNav);
  const setPalette = useUI((s) => s.setPalette);
  const open = useUI((s) => s.open);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div className="flex h-full">
      <aside className={cn('hidden shrink-0 border-r border-line bg-surface/70 backdrop-blur-sm transition-[width] duration-200 lg:block', collapsed ? 'w-[64px]' : 'w-[236px]')}>
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
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-bg/75 px-3 backdrop-blur-md sm:gap-3 sm:px-5">
          <IconButton label="Open menu" className="lg:hidden" onClick={() => setMobile(true)}>
            <Menu size={18} />
          </IconButton>
          <a href="#/" aria-label="Vyro home" className="shrink-0 lg:hidden">
            <BrandLockup />
          </a>
          <p className="hidden shrink-0 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] lg:flex">
            <span className="text-faint">Vyro</span>
            <span className="text-line-strong">/</span>
            <span className="text-fg">{sectionLabel(section)}</span>
          </p>
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="hidden h-9 min-w-0 max-w-md flex-1 items-center gap-2.5 rounded-md border border-line bg-surface/70 px-3 text-left text-[13px] text-faint transition-colors hover:border-accent/40 hover:text-muted sm:flex lg:ml-4"
          >
            <Search size={15} className="shrink-0" />
            <span className="flex-1 truncate">Search everything…</span>
            <span className="kbd hidden sm:inline-flex">{isMac ? '⌘' : 'Ctrl'} K</span>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <Clock />
            <IconButton label="Search" className="sm:hidden" onClick={() => setPalette(true)}>
              <Search size={17} />
            </IconButton>
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
        <div key={t.id} className="pointer-events-auto flex max-w-sm animate-toast-in items-center gap-2.5 rounded-lg border border-line-strong bg-surface-2/95 px-3.5 py-2.5 text-[13px] shadow-pop backdrop-blur">
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
