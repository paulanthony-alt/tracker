import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui';
import { navigate, useRoute } from '@/lib/router';
import { Shell, Toaster } from '@/components/layout/Shell';
import { ConfirmHost } from '@/components/ui/Modal';
import { CommandPalette } from '@/components/CommandPalette';
import { QuickAdd } from '@/components/QuickAdd';
import { TaskEditor } from '@/components/editors/TaskEditor';
import { ClassEditor, EventEditor, GoalEditor, HabitEditor, ProjectEditor, ReminderEditor } from '@/components/editors/Editors';
import { Onboarding } from '@/components/Onboarding';
import { AlertStack } from '@/components/AlertStack';
import { browserTimeZone, startNotifier } from '@/lib/notifier';
import { startImports } from '@/lib/imports';
import { BootScreen } from '@/components/BrandMark';
import { StartupSequence, startupAnimationEnabled } from '@/components/StartupSequence';
import { FirebaseGate } from '@/components/Login';
import { firebaseEnabled } from '@/lib/firebaseConfig';
import { Button } from '@/components/ui/primitives';
import { Dashboard } from '@/pages/Dashboard';
import { TasksPage } from '@/pages/Tasks';
import { CalendarPage } from '@/pages/Calendar';
import { SchoolPage } from '@/pages/School';
import { BusinessPage } from '@/pages/Business';
import { HabitsPage } from '@/pages/Habits';
import { NotesPage } from '@/pages/Notes';
import { AssistantPage } from '@/pages/Assistant';
import { SettingsPage } from '@/pages/Settings';

function ModalHost() {
  const modal = useUI((s) => s.modal);
  if (!modal) return null;
  // `key` remounts the editor when switching between records.
  switch (modal.kind) {
    case 'task':
      return <TaskEditor key={modal.id ?? 'new'} id={modal.id} defaults={modal.defaults} />;
    case 'quickadd':
      return <QuickAdd tab={modal.tab} defaults={modal.defaults} />;
    case 'event':
      return <EventEditor key={modal.id ?? 'new'} id={modal.id} date={modal.date} time={modal.time} />;
    case 'habit':
      return <HabitEditor key={modal.id ?? 'new'} id={modal.id} />;
    case 'goal':
      return <GoalEditor key={modal.id ?? 'new'} id={modal.id} horizon={modal.horizon} />;
    case 'class':
      return <ClassEditor key={modal.id ?? 'new'} id={modal.id} />;
    case 'project':
      return <ProjectEditor key={modal.id ?? 'new'} id={modal.id} />;
    case 'reminder':
      return <ReminderEditor key={modal.id ?? 'new'} id={modal.id} />;
  }
}

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  const accent = useStore((s) => s.settings.accent);
  useEffect(() => {
    const apply = () => {
      const resolved = theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
      document.documentElement.dataset.theme = resolved;
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', resolved === 'light' ? '#f6f6f7' : '#09090b');
    };
    apply();
    document.documentElement.dataset.accent = accent;
    try {
      localStorage.setItem('lifeos.theme', theme);
      localStorage.setItem('lifeos.accent', accent);
    } catch {
      /* ignore */
    }
    if (theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme, accent]);
}

const GO: Record<string, string> = { d: '/', t: '/tasks', c: '/calendar', s: '/school', b: '/business', h: '/habits', n: '/notes', a: '/assistant' };

function useShortcuts() {
  useEffect(() => {
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      const ui = useUI.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.setPalette(!ui.paletteOpen);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || ui.modal || ui.paletteOpen) return;
      if (e.key === '/') {
        e.preventDefault();
        ui.setPalette(true);
      } else if (e.key === 'n' || e.key === 'q') {
        e.preventDefault();
        ui.open({ kind: 'quickadd' });
      } else if (e.key === 'g') {
        pendingG = Date.now();
      } else if (Date.now() - pendingG < 1200 && GO[e.key]) {
        navigate(GO[e.key]);
        pendingG = 0;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function Page() {
  const route = useRoute();
  useEffect(() => {
    document.getElementById('main')?.scrollTo({ top: 0 });
  }, [route.path.join('/')]);
  switch (route.path[0] ?? '') {
    case '':
      return <Dashboard />;
    case 'tasks':
      return <TasksPage />;
    case 'calendar':
      return <CalendarPage />;
    case 'school':
      return <SchoolPage />;
    case 'business':
      return <BusinessPage />;
    case 'habits':
      return <HabitsPage />;
    case 'notes':
      return <NotesPage />;
    case 'assistant':
      return <AssistantPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return (
        <div className="py-24 text-center">
          <p className="text-sm font-medium">Page not found</p>
          <Button className="mt-4" size="sm" onClick={() => navigate('/')}>
            Back to dashboard
          </Button>
        </div>
      );
  }
}

export function App() {
  useTheme();
  return firebaseEnabled ? (
    <FirebaseGate>
      <Main />
    </FirebaseGate>
  ) : (
    <Main />
  );
}

function Main() {
  // Play the startup sequence once each time the app opens (after sign-in in the Firebase version).
  const [intro, setIntro] = useState(startupAnimationEnabled);
  const name = useStore((s) => s.settings.name);
  const ready = useStore((s) => s.ready);
  const loadError = useStore((s) => s.loadError);
  return (
    <>
      <MainContent ready={ready} loadError={loadError} />
      {intro && <StartupSequence ready={ready} name={name || undefined} onDone={() => setIntro(false)} />}
    </>
  );
}

function MainContent({ ready, loadError }: { ready: boolean; loadError: string | null }) {
  useShortcuts();
  useEffect(() => {
    void useStore.getState().init();
  }, []);
  useEffect(() => {
    if (!ready || loadError) return;
    // Remember this device's time zone so scheduled push reminders fire at your local time.
    const tz = browserTimeZone();
    if (useStore.getState().settings.timeZone !== tz) useStore.getState().updateSettings({ timeZone: tz });
    startNotifier();
  }, [ready, loadError]);
  // Bring in Google Classroom and Calendar (Settings → Connections) once your data has loaded.
  useEffect(() => (ready && !loadError ? startImports() : undefined), [ready, loadError]);

  if (!ready)
    return (
      <BootScreen />
    );
  if (loadError)
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="card max-w-md p-6 text-center">
          <AlertTriangle className="mx-auto text-bad" />
          <p className="mt-3 font-medium">Couldn’t load your data</p>
          <p className="mt-1 text-[13px] text-muted">{loadError}</p>
          <p className="mt-3 text-xs text-faint">{firebaseEnabled ? 'Your data is safe in Firebase. Check your connection, then reload.' : 'Your data is safe in the database. Check that the server is running, then reload.'}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button onClick={() => location.reload()}>Reload</Button>
            {firebaseEnabled && (
              // e.g. your password was reset on another device: sign in again with the new one.
              <Button
                variant="ghost"
                onClick={async () => {
                  const fb = await import('@/lib/firebase');
                  await fb.signOutUser();
                  location.reload();
                }}
              >
                Sign out
              </Button>
            )}
          </div>
        </div>
      </div>
    );

  return (
    <>
      <Shell>
        <Page />
      </Shell>
      <ModalHost />
      <CommandPalette />
      <AlertStack />
      <ConfirmHost />
      <Onboarding />
      <Toaster />
    </>
  );
}
