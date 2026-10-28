/**
 * In-app notifications. While Vyro is open (in any tab, on any device),
 * this checks every few seconds for reminders, events and tasks coming due,
 * shows a card in the app and — if you've allowed it — a system notification.
 *
 * Notifications while the app is closed come from push (Firebase setup +
 * scripts/reminders); see README.
 */
import { create } from 'zustand';
import { DEFAULT_NOTIFICATION_PREFS, dueNotifications, type DueNotification } from '@shared/notifications';
import { useStore } from './store';

const FIRED_KEY = 'lifeos.notify.fired.v1';
const LAST_KEY = 'lifeos.notify.last.v1';
/** Set on devices that receive push, so the open app doesn't show the same alert twice. */
export const PUSH_FLAG_KEY = 'lifeos.push.enabled.v1';
const CATCH_UP_MS = 12 * 60 * 60_000;

export interface ActiveAlert extends DueNotification {
  /** It came due while the app was closed. */
  missed: boolean;
}

interface AlertState {
  alerts: ActiveAlert[];
  push(a: ActiveAlert): void;
  dismiss(key: string): void;
  clear(): void;
}

export const useAlerts = create<AlertState>()((set, get) => ({
  alerts: [],
  push: (a) => set({ alerts: [...get().alerts.filter((x) => x.key !== a.key), a].slice(-12) }),
  dismiss: (key) => set({ alerts: get().alerts.filter((a) => a.key !== key) }),
  clear: () => set({ alerts: [] }),
}));

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: alerts may repeat after a reload */
  }
};

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function systemPermission(): PermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  try {
    return Notification.permission;
  } catch {
    return 'unsupported';
  }
}

export async function requestSystemPermission(): Promise<PermissionState> {
  if (systemPermission() === 'unsupported') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return systemPermission();
  }
}

const pushActiveHere = () => read(PUSH_FLAG_KEY, false);

/** Show an OS-level notification (via the service worker when available, so it works on Android). */
async function showSystem(n: DueNotification) {
  if (systemPermission() !== 'granted') return;
  const options: NotificationOptions & { requireInteraction?: boolean } = {
    body: n.body,
    tag: n.key,
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    data: { url: n.url },
    requireInteraction: !!n.important,
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(n.title, options);
      return;
    }
  } catch {
    /* fall back to the page-level API */
  }
  try {
    const note = new Notification(n.title, options);
    note.onclick = () => {
      window.focus();
      if (n.url) window.location.hash = n.url;
      note.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

function check() {
  const s = useStore.getState();
  if (!s.ready || s.loadError) return;
  const prefs = s.settings.notifications ?? DEFAULT_NOTIFICATION_PREFS;
  const now = Date.now();
  // First run on this device: start from now rather than replaying history.
  let from = read<number | null>(LAST_KEY, null) ?? now;
  if (now - from > CATCH_UP_MS) from = now - CATCH_UP_MS;
  const to = now + 1;
  const due = dueNotifications(
    { reminders: s.reminders, events: s.events, tasks: s.tasks, habits: s.habits, classes: s.classes, projects: s.projects },
    prefs,
    browserTimeZone(),
    from,
    to,
  );
  const fired = read<Record<string, number>>(FIRED_KEY, {});
  for (const n of due) {
    if (fired[n.key]) continue;
    fired[n.key] = now;
    const missed = now - n.at > 2 * 60_000;
    useAlerts.getState().push({ ...n, missed });
    // Push already alerts this device when it's set up; don't double up.
    if (!missed && !pushActiveHere()) void showSystem(n);
  }
  for (const [k, t] of Object.entries(fired)) if (now - t > 4 * 86_400_000) delete fired[k];
  write(FIRED_KEY, fired);
  write(LAST_KEY, to);
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startNotifier() {
  if (timer) return;
  check();
  timer = setInterval(check, 15_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
}

export function sendTestNotification() {
  const n: DueNotification = {
    key: `test:${Date.now()}`,
    at: Date.now(),
    kind: 'reminder',
    title: 'Test notification',
    body: 'Reminders will look like this.',
    url: '#/settings',
  };
  useAlerts.getState().push({ ...n, missed: false });
  void showSystem(n);
}

/** Register the service worker (notifications on Android, push, home-screen install). */
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(() => {
    /* not allowed here (e.g. inside an embedded preview); everything else still works */
  });
  // Tapping a notification while the app is open asks it to show the right page.
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data as { type?: string; url?: string } | null;
    if (msg?.type === 'navigate' && typeof msg.url === 'string' && msg.url.startsWith('#/')) window.location.hash = msg.url;
  });
}
