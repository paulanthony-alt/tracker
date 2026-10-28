import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  Bell,
  Briefcase,
  CalendarDays,
  CalendarPlus,
  CheckSquare,
  Flame,
  GraduationCap,
  LayoutDashboard,
  NotebookPen,
  Search,
  Settings,
  Sparkles,
  Target,
  Download,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui';
import { searchAll, type SearchResult } from '@/lib/search';
import { navigate } from '@/lib/router';
import { cn } from '@/lib/util';
import { exportBackup } from '@/pages/Settings';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
  keywords?: string;
}

const ICONS: Record<SearchResult['type'], React.ReactNode> = {
  task: <CheckSquare size={15} />,
  assignment: <GraduationCap size={15} />,
  note: <NotebookPen size={15} />,
  project: <Briefcase size={15} />,
  class: <GraduationCap size={15} />,
  goal: <Target size={15} />,
  habit: <Flame size={15} />,
  event: <CalendarDays size={15} />,
  journal: <NotebookPen size={15} />,
  reminder: <Bell size={15} />,
};

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen);
  const setPalette = useUI((s) => s.setPalette);
  const openModal = useUI((s) => s.open);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const state = useStore();

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const commands: Command[] = useMemo(
    () => [
      { id: 'new-task', label: 'New task', icon: <CheckSquare size={15} />, hint: 'N', run: () => openModal({ kind: 'quickadd', tab: 'task' }), keywords: 'add create todo' },
      { id: 'new-assignment', label: 'New assignment', icon: <GraduationCap size={15} />, run: () => openModal({ kind: 'quickadd', tab: 'assignment' }), keywords: 'homework test quiz school' },
      { id: 'new-event', label: 'New event', icon: <CalendarPlus size={15} />, run: () => openModal({ kind: 'quickadd', tab: 'event' }), keywords: 'calendar schedule' },
      { id: 'new-note', label: 'New note', icon: <NotebookPen size={15} />, run: () => openModal({ kind: 'quickadd', tab: 'note' }), keywords: 'idea write' },
      { id: 'new-habit', label: 'New habit', icon: <Flame size={15} />, run: () => openModal({ kind: 'habit' }) },
      { id: 'new-goal', label: 'New goal', icon: <Target size={15} />, run: () => openModal({ kind: 'goal' }) },
      { id: 'new-project', label: 'New business project', icon: <Briefcase size={15} />, run: () => openModal({ kind: 'project' }) },
      { id: 'new-reminder', label: 'New reminder', icon: <Bell size={15} />, run: () => openModal({ kind: 'quickadd', tab: 'reminder' }) },
      { id: 'go-home', label: 'Go to Dashboard', icon: <LayoutDashboard size={15} />, hint: 'G D', run: () => navigate('/') },
      { id: 'go-tasks', label: 'Go to Tasks', icon: <CheckSquare size={15} />, hint: 'G T', run: () => navigate('/tasks') },
      { id: 'go-cal', label: 'Go to Calendar', icon: <CalendarDays size={15} />, hint: 'G C', run: () => navigate('/calendar') },
      { id: 'go-school', label: 'Go to School', icon: <GraduationCap size={15} />, hint: 'G S', run: () => navigate('/school') },
      { id: 'go-biz', label: 'Go to Business', icon: <Briefcase size={15} />, hint: 'G B', run: () => navigate('/business') },
      { id: 'go-habits', label: 'Go to Habits & Goals', icon: <Flame size={15} />, hint: 'G H', run: () => navigate('/habits') },
      { id: 'go-notes', label: 'Go to Notes', icon: <NotebookPen size={15} />, hint: 'G N', run: () => navigate('/notes') },
      { id: 'go-ai', label: 'Open Assistant', icon: <Sparkles size={15} />, run: () => navigate('/assistant'), keywords: 'ai plan briefing' },
      { id: 'go-review', label: 'Start weekly review', icon: <Target size={15} />, run: () => navigate('/habits?tab=review') },
      { id: 'go-plan', label: 'Plan my day', icon: <CalendarDays size={15} />, run: () => navigate('/habits?tab=plan') },
      { id: 'go-settings', label: 'Settings', icon: <Settings size={15} />, run: () => navigate('/settings') },
      { id: 'export', label: 'Export backup (JSON)', icon: <Download size={15} />, run: () => void exportBackup(), keywords: 'download save' },
    ],
    [openModal],
  );

  const ql = q.trim().toLowerCase();
  const matchedCommands = ql ? commands.filter((c) => `${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(ql)) : commands.slice(0, 8);
  const results = useMemo(() => (ql ? searchAll(state, ql, 30) : []), [state, ql]);
  const items: ({ kind: 'cmd'; cmd: Command } | { kind: 'res'; res: SearchResult })[] = [
    ...results.map((res) => ({ kind: 'res' as const, res })),
    ...matchedCommands.map((cmd) => ({ kind: 'cmd' as const, cmd })),
  ];

  useEffect(() => setActive(0), [ql]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const run = (i: number) => {
    const item = items[i];
    if (!item) return;
    setPalette(false);
    if (item.kind === 'cmd') item.cmd.run();
    else if (item.res.type === 'task' || item.res.type === 'assignment') openModal({ kind: 'task', id: item.res.id });
    else navigate(item.res.href);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 pt-[10vh]">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-[2px]" onClick={() => setPalette(false)} />
      <div className="relative w-full max-w-xl animate-pop-in overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-pop" role="dialog" aria-label="Search and commands">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={17} className="text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(active);
              } else if (e.key === 'Escape') setPalette(false);
            }}
            placeholder="Search tasks, notes, classes, projects… or type a command"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
            aria-label="Search"
          />
          <span className="kbd">esc</span>
        </div>
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto p-1.5">
          {ql && results.length === 0 && matchedCommands.length === 0 && <p className="px-3 py-8 text-center text-sm text-faint">No matches for “{q}”.</p>}
          {results.length > 0 && <p className="eyebrow px-2.5 pb-1 pt-2">Results</p>}
          {items.map((item, i) => {
            const first = item.kind === 'cmd' && (i === 0 || items[i - 1].kind === 'res');
            return (
              <div key={item.kind === 'cmd' ? item.cmd.id : `${item.res.type}-${item.res.id}`}>
                {first && <p className="eyebrow px-2.5 pb-1 pt-2">{ql ? 'Commands' : 'Quick actions'}</p>}
                <button
                  type="button"
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(i)}
                  className={cn('flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[13.5px]', active === i ? 'bg-surface-3' : '')}
                >
                  <span className="text-faint">{item.kind === 'cmd' ? item.cmd.icon : ICONS[item.res.type]}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {item.kind === 'cmd' ? item.cmd.label : item.res.title}
                    {item.kind === 'res' && item.res.subtitle && <span className="ml-2 text-xs text-faint">{item.res.subtitle}</span>}
                  </span>
                  {item.kind === 'res' && <span className="text-[11px] capitalize text-faint">{item.res.type}</span>}
                  {item.kind === 'cmd' && item.cmd.hint && <span className="kbd">{item.cmd.hint}</span>}
                  {active === i && <ArrowRight size={14} className="text-faint" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
