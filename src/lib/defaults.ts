import type { Settings, WidgetConfig } from '@shared/schema';
import { DEFAULT_NOTIFICATION_PREFS } from '@shared/notifications';

/** Widget sizes: sm = one column, md = two columns, lg = full width. */
export const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'briefing', visible: true, size: 'lg' },
  { id: 'priorities', visible: true, size: 'sm' },
  { id: 'schedule', visible: true, size: 'sm' },
  { id: 'tasks', visible: true, size: 'sm' },
  { id: 'habits', visible: true, size: 'sm' },
  { id: 'deadlines', visible: true, size: 'sm' },
  { id: 'goals', visible: true, size: 'sm' },
  { id: 'grades', visible: true, size: 'sm' },
  { id: 'projects', visible: true, size: 'sm' },
  { id: 'week', visible: true, size: 'sm' },
  { id: 'reminders', visible: true, size: 'sm' },
  { id: 'quicknote', visible: false, size: 'sm' },
];

export const WIDGET_META: Record<WidgetConfig['id'], { title: string; description: string }> = {
  briefing: { title: 'Daily briefing', description: 'Completion, alerts and what matters today' },
  schedule: { title: "Today's schedule", description: 'Events and timed tasks for today' },
  priorities: { title: 'Top 3 priorities', description: 'The three things that make today a win' },
  tasks: { title: 'Due today & overdue', description: 'Everything that needs attention now' },
  habits: { title: 'Habits', description: "Check off today's habits" },
  goals: { title: 'Weekly goals', description: "This week's goals and progress" },
  grades: { title: 'Grades', description: 'Class averages and GPA' },
  projects: { title: 'Active projects', description: 'Business projects in motion' },
  deadlines: { title: 'Upcoming deadlines', description: 'Next two weeks across everything' },
  reminders: { title: 'Reminders', description: 'Things to remember' },
  week: { title: 'This week', description: 'Tasks and habits completed per day' },
  quicknote: { title: 'Scratchpad', description: 'A quick note that saves as you type' },
};

export const COLORS = [
  '#4f8cff', // blue
  '#34d399', // green
  '#f59e0b', // amber
  '#f472b6', // pink
  '#a78bfa', // violet
  '#22d3ee', // cyan
  '#fb7185', // rose
  '#a3e635', // lime
  '#fb923c', // orange
  '#94a3b8', // slate
];

export function defaultSettings(now = Date.now()): Settings {
  return {
    id: 'settings',
    createdAt: now,
    updatedAt: now,
    name: '',
    theme: 'dark',
    accent: 'blue',
    weekStartsOn: 1,
    onboarded: false,
    widgets: DEFAULT_WIDGETS,
    taskCategories: ['Personal', 'School', 'Business', 'Health', 'Errands', 'Home'],
    noteFolders: ['General', 'School', 'Business', 'Ideas', 'Journal'],
    markingPeriods: [],
    gpaScale: 'weighted',
    pastTerms: [],
    alertDays: 3,
    notifications: DEFAULT_NOTIFICATION_PREFS,
  };
}

/** Merge persisted settings with defaults so new widgets/fields appear after upgrades. */
export function withDefaults(s: Settings | undefined): Settings {
  const d = defaultSettings();
  if (!s) return d;
  const merged = { ...d, ...s };
  const known = new Set(merged.widgets.map((w) => w.id));
  merged.widgets = [...merged.widgets, ...d.widgets.filter((w) => !known.has(w.id)).map((w) => ({ ...w, visible: false }))];
  return merged;
}
