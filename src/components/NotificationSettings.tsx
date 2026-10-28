import { useEffect, useState } from 'react';
import { BellRing, Smartphone, Trash2 } from 'lucide-react';
import type { NotificationPrefs } from '@shared/schema';
import { DEFAULT_NOTIFICATION_PREFS } from '@shared/notifications';
import { useStore } from '@/lib/store';
import { requestSystemPermission, sendTestNotification, systemPermission, type PermissionState } from '@/lib/notifier';
import { firebaseEnabled } from '@/lib/firebaseConfig';
import type { PushAvailability, PushDevice } from '@/lib/firebase';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/util';
import { Badge, Button, Card, IconButton } from './ui/primitives';
import { confirmAction } from './ui/Modal';

const LEADS_EVENT = [null, 0, 5, 10, 15, 30, 60];
const LEADS_TASK = [null, 15, 30, 60, 120, 180, 1440];
const leadLabel = (n: number | null) => (n === null ? 'Off' : n === 0 ? 'When it starts' : n < 60 ? `${n} min before` : n === 1440 ? '1 day before' : `${n / 60} hr before`);

function Toggle({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface-3 ring-1 ring-inset ring-line-strong')}
    >
      <span className={cn('absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0')} />
    </button>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-[13px]">{label}</p>
        {hint && <p className="text-xs text-faint">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function PushSection() {
  const [availability, setAvailability] = useState<PushAvailability | 'loading'>('loading');
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [thisId, setThisId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop: (() => void) | undefined;
    void import('@/lib/firebase').then(async (fb) => {
      setAvailability(await fb.pushAvailability());
      setThisId(fb.thisDeviceId());
      stop = fb.watchDevices(setDevices);
    });
    return () => stop?.();
  }, []);

  const enabledHere = !!thisId && devices.some((d) => d.id === thisId);

  const toggle = async () => {
    setBusy(true);
    const fb = await import('@/lib/firebase');
    try {
      if (enabledHere) {
        await fb.disablePush();
        toast.info('Push turned off for this device');
      } else {
        await fb.enablePush();
        toast.success('This device will get reminders even when Vyro is closed');
      }
      setThisId(fb.thisDeviceId());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t change push settings');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="flex items-center gap-2 text-[13px] font-medium">
        <Smartphone size={14} className="text-faint" /> When Vyro is closed
      </p>
      {availability === 'not-configured' ? (
        <p className="mt-1 text-xs leading-relaxed text-muted">Push needs two more values in <code>.env</code> (your Web Push key and sender ID) and the scheduled sender on GitHub. See README → Notifications.</p>
      ) : availability === 'emulator' ? (
        <p className="mt-1 text-xs text-muted">Push isn’t available with the local emulators. It works once you deploy to your Firebase project.</p>
      ) : (
        <>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Phones and computers with push turned on get reminders even when Vyro isn’t open. They’re checked every 10 minutes, so a reminder can arrive a few minutes early; it always shows the exact time.
            {availability === 'unsupported' && ' On iPhone/iPad, add Vyro to your Home Screen first, then open it from there.'}
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[13px]">Push to this device</span>
            <Button size="sm" variant={enabledHere ? 'secondary' : 'primary'} disabled={busy || availability === 'loading'} onClick={() => void toggle()}>
              {busy ? 'Working…' : enabledHere ? 'Turn off' : 'Turn on'}
            </Button>
          </div>
          {devices.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="eyebrow">Devices receiving push</p>
              {devices.map((d) => (
                <div key={d.id} className="flex items-center gap-2 rounded-lg px-1 py-1 text-[13px]">
                  <span className="flex-1 truncate">
                    {d.label}
                    {d.id === thisId && <span className="ml-2 text-xs text-faint">(this device)</span>}
                  </span>
                  <IconButton
                    label={`Remove ${d.label}`}
                    size="xs"
                    onClick={async () => {
                      if (await confirmAction({ title: `Stop push to ${d.label}?`, confirmLabel: 'Remove' })) {
                        const fb = await import('@/lib/firebase');
                        await fb.removeDevice(d.id);
                        setThisId(fb.thisDeviceId());
                      }
                    }}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function NotificationSettings() {
  const prefs = useStore((s) => s.settings.notifications ?? DEFAULT_NOTIFICATION_PREFS);
  const updateSettings = useStore((s) => s.updateSettings);
  const storageMode = useStore((s) => s.storageMode);
  const [permission, setPermission] = useState<PermissionState>(systemPermission);
  const set = (patch: Partial<NotificationPrefs>) => updateSettings({ notifications: { ...prefs, ...patch } });

  return (
    <Card title="Notifications" icon={<BellRing size={15} />}>
      <div className="rounded-xl border border-line bg-surface-2/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[13px] font-medium">On this device</p>
            <p className="text-xs text-faint">
              {permission === 'granted'
                ? 'System notifications are on while Vyro is open.'
                : permission === 'denied'
                  ? 'Blocked. Allow notifications for this site in your browser settings.'
                  : permission === 'unsupported'
                    ? 'This browser can’t show system notifications. You’ll still see alerts inside Vyro.'
                    : 'Alerts show inside Vyro. Turn on system notifications to see them in other tabs too.'}
            </p>
          </div>
          <div className="flex gap-2">
            {permission === 'default' && (
              <Button size="sm" variant="primary" onClick={async () => setPermission(await requestSystemPermission())}>
                Turn on
              </Button>
            )}
            <Button size="sm" onClick={sendTestNotification}>
              Send test
            </Button>
          </div>
        </div>
        {permission === 'granted' && <Badge tone="good" className="mt-2">Allowed</Badge>}
      </div>

      <div className="mt-3 divide-y divide-line">
        <Row label="Notifications" hint="Master switch for everything below">
          <Toggle id="notif-enabled" label="Notifications" checked={prefs.enabled} onChange={(v) => set({ enabled: v })} />
        </Row>
        <div className={cn(!prefs.enabled && 'pointer-events-none opacity-50')}>
          <Row label="Reminders" hint="At each reminder’s date and time">
            <Toggle id="notif-reminders" label="Reminders" checked={prefs.reminders} onChange={(v) => set({ reminders: v })} />
          </Row>
          <Row label="Default reminder time" hint="For reminders with a date but no time">
            <input type="time" className="input !h-8 !w-32" value={prefs.defaultReminderTime} onChange={(e) => e.target.value && set({ defaultReminderTime: e.target.value })} aria-label="Default reminder time" />
          </Row>
          <Row label="Events">
            <select className="input !h-8 !w-40" value={String(prefs.eventLeadMinutes)} onChange={(e) => set({ eventLeadMinutes: e.target.value === 'null' ? null : Number(e.target.value) })} aria-label="Event notifications">
              {LEADS_EVENT.map((n) => (
                <option key={String(n)} value={String(n)}>
                  {leadLabel(n)}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Tasks with a due time">
            <select className="input !h-8 !w-40" value={String(prefs.taskLeadMinutes)} onChange={(e) => set({ taskLeadMinutes: e.target.value === 'null' ? null : Number(e.target.value) })} aria-label="Task notifications">
              {LEADS_TASK.map((n) => (
                <option key={String(n)} value={String(n)}>
                  {leadLabel(n)}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Morning summary" hint="What’s due, overdue and on the calendar">
            <div className="flex items-center gap-2">
              {prefs.digestTime !== null && <input type="time" className="input !h-8 !w-28" value={prefs.digestTime} onChange={(e) => e.target.value && set({ digestTime: e.target.value })} aria-label="Morning summary time" />}
              <Toggle id="notif-digest" label="Morning summary" checked={prefs.digestTime !== null} onChange={(v) => set({ digestTime: v ? DEFAULT_NOTIFICATION_PREFS.digestTime : null })} />
            </div>
          </Row>
          <Row label="Habit nudge" hint="Evening reminder for unfinished daily habits">
            <div className="flex items-center gap-2">
              {prefs.habitNudgeTime !== null && <input type="time" className="input !h-8 !w-28" value={prefs.habitNudgeTime} onChange={(e) => e.target.value && set({ habitNudgeTime: e.target.value })} aria-label="Habit nudge time" />}
              <Toggle id="notif-habits" label="Habit nudge" checked={prefs.habitNudgeTime !== null} onChange={(v) => set({ habitNudgeTime: v ? '20:00' : null })} />
            </div>
          </Row>
        </div>
      </div>

      {firebaseEnabled && storageMode === 'firebase' ? (
        <PushSection />
      ) : (
        <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-faint">Notifications appear while Vyro is open in a tab. To get them on your phone when Vyro is closed, use the Firebase setup (README → Notifications).</p>
      )}
    </Card>
  );
}
