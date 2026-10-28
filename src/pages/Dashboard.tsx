import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, LayoutGrid, RotateCcw, Check } from 'lucide-react';
import type { WidgetConfig, WidgetId } from '@shared/schema';
import { useStore } from '@/lib/store';
import { useToday } from '@/lib/useToday';
import { formatLong, greeting } from '@/lib/dates';
import { DEFAULT_WIDGETS, WIDGET_META } from '@/lib/defaults';
import { cn } from '@/lib/util';
import { Button, Card, IconButton } from '@/components/ui/primitives';
import { SampleBanner } from '@/components/Onboarding';
import {
  BriefingWidget,
  DeadlinesWidget,
  GoalsWidget,
  GradesWidget,
  HabitsWidget,
  PrioritiesWidget,
  ProjectsWidget,
  QuickNoteWidget,
  RemindersWidget,
  ScheduleWidget,
  TasksWidget,
  WeekWidget,
} from '@/widgets/Widgets';

const COMPONENTS: Record<WidgetId, () => React.JSX.Element> = {
  briefing: BriefingWidget,
  schedule: ScheduleWidget,
  priorities: PrioritiesWidget,
  tasks: TasksWidget,
  habits: HabitsWidget,
  goals: GoalsWidget,
  grades: GradesWidget,
  projects: ProjectsWidget,
  deadlines: DeadlinesWidget,
  reminders: RemindersWidget,
  week: WeekWidget,
  quicknote: QuickNoteWidget,
};

const LINKS: Partial<Record<WidgetId, string>> = {
  schedule: '#/calendar?view=day',
  tasks: '#/tasks',
  habits: '#/habits',
  goals: '#/habits?tab=goals',
  grades: '#/school?tab=grades',
  projects: '#/business',
  deadlines: '#/calendar',
};

const SIZE_CLASS: Record<WidgetConfig['size'], string> = {
  sm: '',
  md: 'md:col-span-2',
  lg: 'md:col-span-2 xl:col-span-3',
};
const SIZE_LABEL: Record<WidgetConfig['size'], string> = { sm: 'Normal', md: 'Wide', lg: 'Full width' };
const NEXT_SIZE: Record<WidgetConfig['size'], WidgetConfig['size']> = { sm: 'md', md: 'lg', lg: 'sm' };

export function Dashboard() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const today = useToday();
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState<WidgetId | null>(null);
  const widgets = settings.widgets;
  const visible = widgets.filter((w) => w.visible);
  const hidden = widgets.filter((w) => !w.visible);

  const setWidgets = (next: WidgetConfig[]) => updateSettings({ widgets: next });
  const move = (id: WidgetId, dir: -1 | 1) => {
    const order = [...widgets];
    const vis = order.filter((w) => w.visible);
    const i = vis.findIndex((w) => w.id === id);
    const j = i + dir;
    if (j < 0 || j >= vis.length) return;
    const a = order.findIndex((w) => w.id === vis[i].id);
    const b = order.findIndex((w) => w.id === vis[j].id);
    [order[a], order[b]] = [order[b], order[a]];
    setWidgets(order);
  };
  const dropOn = (targetId: WidgetId) => {
    if (!dragId || dragId === targetId) return;
    const order = widgets.filter((w) => w.id !== dragId);
    const idx = order.findIndex((w) => w.id === targetId);
    order.splice(idx, 0, widgets.find((w) => w.id === dragId)!);
    setWidgets(order);
    setDragId(null);
  };
  const patch = (id: WidgetId, p: Partial<WidgetConfig>) => setWidgets(widgets.map((w) => (w.id === id ? { ...w, ...p } : w)));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-faint">{formatLong(today)}</p>
          <h1 className="mt-0.5 text-[24px] font-semibold tracking-tight">
            {greeting()}
            {settings.name ? `, ${settings.name}` : ''}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {editing && (
            <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => setWidgets(DEFAULT_WIDGETS)}>
              Reset layout
            </Button>
          )}
          <Button size="sm" variant={editing ? 'primary' : 'secondary'} icon={editing ? <Check size={14} /> : <LayoutGrid size={14} />} onClick={() => setEditing((e) => !e)}>
            {editing ? 'Done' : 'Customize'}
          </Button>
        </div>
      </div>

      <SampleBanner />

      {editing && (
        <div className="card mb-4 p-4">
          <p className="text-[13px] font-medium">Customize your dashboard</p>
          <p className="mt-0.5 text-xs text-faint">Drag widgets (or use the arrows) to reorder, change their width, or hide them. Hidden widgets can be added back below.</p>
          {hidden.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {hidden.map((w) => (
                <Button key={w.id} size="sm" icon={<Eye size={14} />} onClick={() => patch(w.id, { visible: true })} title={WIDGET_META[w.id].description}>
                  Add {WIDGET_META[w.id].title}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="card py-16 text-center">
          <p className="text-sm font-medium">All widgets are hidden</p>
          <Button className="mt-4" size="sm" onClick={() => setEditing(true)}>
            Customize dashboard
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((w, i) => {
            const Comp = COMPONENTS[w.id];
            const meta = WIDGET_META[w.id];
            return (
              <div
                key={w.id}
                className={cn(SIZE_CLASS[w.size], 'min-w-0 transition-opacity', dragId === w.id && 'opacity-40')}
                draggable={editing}
                onDragStart={() => setDragId(w.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => editing && e.preventDefault()}
                onDrop={() => dropOn(w.id)}
              >
                <Card
                  className={cn('h-full', editing && 'ring-1 ring-accent/30')}
                  title={meta.title}
                  action={
                    editing ? (
                      <div className="flex items-center gap-0.5">
                        <GripVertical size={15} className="mr-1 hidden cursor-grab text-faint md:block" aria-hidden />
                        <IconButton label="Move up" size="xs" onClick={() => move(w.id, -1)} disabled={i === 0}>
                          <ArrowUp size={14} />
                        </IconButton>
                        <IconButton label="Move down" size="xs" onClick={() => move(w.id, 1)} disabled={i === visible.length - 1}>
                          <ArrowDown size={14} />
                        </IconButton>
                        <Button size="xs" variant="ghost" onClick={() => patch(w.id, { size: NEXT_SIZE[w.size] })} title="Change width">
                          {SIZE_LABEL[w.size]}
                        </Button>
                        <IconButton label="Hide widget" size="xs" onClick={() => patch(w.id, { visible: false })}>
                          <EyeOff size={14} />
                        </IconButton>
                      </div>
                    ) : LINKS[w.id] ? (
                      <a href={LINKS[w.id]} className="text-xs text-faint hover:text-fg">
                        Open
                      </a>
                    ) : undefined
                  }
                >
                  <div className={cn(editing && 'pointer-events-none select-none opacity-70')}>
                    <Comp />
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
