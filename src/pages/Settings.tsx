import { useRef, useState } from 'react';
import { Database, Download, FlaskConical, HardDrive, KeyRound, Keyboard, LogOut, Plug, Trash2, Upload, X } from 'lucide-react';
import { BACKUP_FORMAT, BACKUP_VERSION, COLLECTIONS, emptySnapshot, validateBackup, type Backup } from '@shared/schema';
import { hasSampleData, useStore } from '@/lib/store';
import { defaultSettings } from '@/lib/defaults';
import { todayISO } from '@/lib/dates';
import { cn, downloadFile, plural } from '@/lib/util';
import { toast } from '@/lib/toast';
import { persistence } from '@/lib/persistence';
import { MIN_PASSWORD_LENGTH, OWNER_EMAIL } from '@/lib/firebaseConfig';
import { Badge, Button, Card, PageHeader } from '@/components/ui/primitives';
import { Modal, confirmAction } from '@/components/ui/Modal';
import { Field, Segmented } from '@/components/ui/Field';
import { loadSampleData, removeSampleDataWithConfirm } from '@/components/Onboarding';
import { NotificationSettings } from '@/components/NotificationSettings';
import { ConnectionsSettings } from '@/components/ConnectionsSettings';

export async function exportBackup() {
  const data = useStore.getState().snapshot();
  const backup: Backup = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
  downloadFile(`vyro-backup-${todayISO()}.json`, JSON.stringify(backup, null, 2));
  toast.success('Backup downloaded');
}

function ListEditor({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [v, setV] = useState('');
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span key={it} className="inline-flex h-7 items-center gap-1 rounded-lg bg-surface-3 pl-2.5 pr-1 text-xs text-muted">
            {it}
            <button type="button" aria-label={`Remove ${it}`} className="rounded p-0.5 text-faint hover:text-fg" onClick={() => onChange(items.filter((x) => x !== it))}>
              <X size={12} />
            </button>
          </span>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = v.trim();
            if (!t) return;
            if (items.includes(t)) return toast.error('Already in the list');
            onChange([...items, t.slice(0, 60)]);
            setV('');
          }}
        >
          <input className="input !h-7 !w-36 text-xs" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        </form>
      </div>
    </Field>
  );
}

export function SettingsPage() {
  const s = useStore();
  const settings = s.settings;
  const update = s.updateSettings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState('');
  const sample = hasSampleData(s);
  const total = COLLECTIONS.filter((c) => c !== 'settings').reduce((n, c) => n + (s[c as Exclude<typeof c, 'settings'>] as unknown[]).length, 0);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  const importFile = async (file: File) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return toast.error('That file isn’t valid JSON.');
    }
    const result = validateBackup(parsed);
    if (!result.ok) return toast.error(result.error);
    const count = COLLECTIONS.reduce((n, c) => n + result.data[c].length, 0);
    const ok = await confirmAction({
      title: 'Replace all data with this backup?',
      message: (
        <>
          The backup contains {plural(count, 'record')}
          {result.skipped ? ` (${plural(result.skipped, 'invalid record')} will be skipped)` : ''}. Your current {plural(total, 'record')} will be replaced.
          {s.storageMode === 'server' ? ' A safety copy of the current database is saved to data/backups first.' : ' Export a backup first if you might want your current data back.'}
          {s.storageMode === 'firebase' && ' The change syncs to all your devices.'}
        </>
      ),
      confirmLabel: 'Replace data',
    });
    if (!ok) return;
    try {
      await s.replaceAll(result.data.settings.length ? result.data : { ...result.data, settings: [settings] });
      toast.success('Backup restored');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    }
  };

  const resetAll = async () => {
    try {
      await s.replaceAll({ ...emptySnapshot(), settings: [defaultSettings()] });
      setResetOpen(false);
      setResetText('');
      toast.success('All data erased');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reset failed');
    }
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Make Vyro yours. Manage your data, backups and integrations." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Profile & appearance">
          <div className="space-y-4">
            <Field label="Your name" hint="Used in your greeting">
              <input className="input" value={settings.name} maxLength={60} onChange={(e) => update({ name: e.target.value })} />
            </Field>
            <Field label="Theme">
              <Segmented value={settings.theme} onChange={(v) => update({ theme: v })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} />
            </Field>
            <Field label="Accent color">
              <div className="flex gap-2">
                {(
                  [
                    ['blue', '#4f8cff'],
                    ['green', '#34d399'],
                    ['violet', '#a78bfa'],
                    ['amber', '#f5a524'],
                  ] as const
                ).map(([name, hex]) => (
                  <button
                    key={name}
                    type="button"
                    aria-label={`${name} accent`}
                    aria-pressed={settings.accent === name}
                    onClick={() => update({ accent: name })}
                    className={cn('h-8 w-8 rounded-full border-2 transition-transform hover:scale-110', settings.accent === name ? 'border-fg' : 'border-transparent')}
                    style={{ background: hex }}
                  />
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Week starts on">
                <select className="input" value={settings.weekStartsOn} onChange={(e) => update({ weekStartsOn: Number(e.target.value) as 0 | 1 })}>
                  <option value={1}>Monday</option>
                  <option value={0}>Sunday</option>
                </select>
              </Field>
              <Field label="Deadline alerts" hint="How far ahead to warn">
                <select className="input" value={settings.alertDays} onChange={(e) => update({ alertDays: Number(e.target.value) })}>
                  {[1, 2, 3, 5, 7, 14].map((n) => (
                    <option key={n} value={n}>
                      {plural(n, 'day')}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </Card>

        <Card title="Organization">
          <div className="space-y-4">
            <ListEditor label="Task categories" items={settings.taskCategories} onChange={(v) => update({ taskCategories: v })} placeholder="Add category" />
            <ListEditor label="Note folders" items={settings.noteFolders} onChange={(v) => update({ noteFolders: v.length ? v : ['General'] })} placeholder="Add folder" />
            <p className="text-xs text-faint">Removing a category or folder doesn’t change existing tasks or notes. Marking periods, GPA scale and past terms live in School → Grades & GPA.</p>
          </div>
        </Card>

        <NotificationSettings />

        <ConnectionsSettings />

        {s.storageMode === 'firebase' && <AccountCard />}

        <Card title="Your data" icon={s.storageMode !== 'local' ? <Database size={15} /> : <HardDrive size={15} />}>
          <div className={cn('rounded-xl border p-3 text-[13px] leading-relaxed', s.storageMode !== 'local' ? 'border-good/25 bg-good/[0.06]' : 'border-warn/30 bg-warn/[0.08]')}>
            {s.storageMode === 'firebase' ? (
              <>
                <p className="font-medium text-fg">Saved to your Firebase account</p>
                <p className="mt-1 text-muted">
                  Stored in Cloud Firestore in your own Firebase project and synced live to every device where you unlock Vyro. Each device also keeps an offline copy, so the app opens and saves without internet and catches up when you reconnect. Signing out removes that copy from the device.
                </p>
              </>
            ) : s.storageMode === 'server' ? (
              <>
                <p className="font-medium text-fg">Saved to a local database</p>
                <p className="mt-1 text-muted">
                  Stored in <code className="text-xs">data/vyro.db</code> ({persistence.health?.storage === 'json' ? 'JSON file — your Node version has no built-in SQLite' : 'SQLite'}) on the computer running the server. A dated backup is written to <code className="text-xs">data/backups/</code> each day the server starts (last 14 kept).
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-fg">Saved in this browser only</p>
                <p className="mt-1 text-muted">No server is connected, so data lives in this browser’s storage. It won’t sync to other devices, and clearing site data erases it. Export backups regularly, or run <code className="text-xs">npm start</code> to use the database.</p>
              </>
            )}
          </div>
          <p className="mt-3 text-xs text-faint">
            {plural(total, 'record')} · {s.tasks.length} tasks · {s.notes.length} notes · {s.habits.length} habits · {s.projects.length} projects
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon={<Download size={14} />} onClick={() => void exportBackup()}>
              Export backup (JSON)
            </Button>
            <Button icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>
              Import backup
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = '';
              }}
            />
          </div>
          <p className="mt-2 text-xs text-faint">Tasks and business transactions can also be exported as CSV from their pages.</p>
        </Card>

        <Card title="Sample data" icon={<FlaskConical size={15} />}>
          <p className="text-[13px] text-muted">Sample records are tagged so they can be removed without touching anything you entered.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {sample ? (
              <>
                <Badge tone="accent">Sample data loaded</Badge>
                <Button size="sm" onClick={() => void removeSampleDataWithConfirm()}>
                  Remove sample data
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={async () => {
                  if (await confirmAction({ title: 'Load sample data?', message: 'Adds example classes, assignments, projects, habits, goals, events and notes alongside your own data. You can remove them later in one click.', confirmLabel: 'Load sample data', danger: false })) {
                    loadSampleData();
                    toast.success('Sample data loaded');
                  }
                }}
              >
                Load sample data
              </Button>
            )}
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-[13px] font-medium text-bad">Danger zone</p>
            <p className="mt-0.5 text-xs text-faint">Permanently erase every task, class, project, habit, goal, note and journal entry.</p>
            <Button size="sm" variant="danger" className="mt-2" icon={<Trash2 size={14} />} onClick={() => setResetOpen(true)}>
              Erase all data…
            </Button>
          </div>
        </Card>

        <Card title="Integrations" icon={<Plug size={15} />}>
          <ul className="space-y-3 text-[13px]">
            <li className="flex items-start gap-3">
              <Badge tone={s.aiAvailable ? 'good' : 'neutral'}>{s.aiAvailable ? 'Connected' : s.storageMode === 'firebase' ? 'Needs paid plan' : 'Needs API key'}</Badge>
              <div>
                <p className="font-medium">AI assistant (Anthropic Claude)</p>
                <p className="text-xs text-faint">
                  {s.storageMode === 'firebase'
                    ? 'Chat that summarizes tasks, plans your day and suggests priorities. Keeping an API key secret needs a server; on Firebase that means Cloud Functions, which require the paid Blaze plan. Running Vyro locally with npm start also enables it.'
                    : 'Chat that summarizes tasks, plans your day and suggests priorities. Set ANTHROPIC_API_KEY in .env on the server. The key is never exposed to the browser.'}
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <Badge tone="good">Built in</Badge>
              <div>
                <p className="font-medium">Smart features (no key needed)</p>
                <p className="text-xs text-faint">Priority ranking, grade-impact, alerts, daily briefing, auto day-planner, weekly review, search.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <Badge>Not included</Badge>
              <div>
                <p className="font-medium">Google Calendar / school portal sync</p>
                <p className="text-xs text-faint">Would require OAuth credentials and a hosted callback URL. Add events and grades here directly, or import a JSON backup.</p>
              </div>
            </li>
          </ul>
        </Card>

        <Card title="Keyboard shortcuts" icon={<Keyboard size={15} />}>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-[13px]">
            {[
              [`${isMac ? '⌘' : 'Ctrl'} K  or  /`, 'Search everything & run commands'],
              ['N', 'Quick add'],
              ['G then D / T / C / S / B / H / N / A', 'Go to Dashboard, Tasks, Calendar, School, Business, Habits, Notes, Assistant'],
              ['Esc', 'Close dialogs'],
            ].map(([k, d]) => (
              <div key={k} className="contents">
                <dt>
                  <span className="kbd !h-6 px-1.5">{k}</span>
                </dt>
                <dd className="text-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Erase all data?"
        width="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={resetText !== 'ERASE'} onClick={() => void resetAll()}>
              Erase everything
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">
          This permanently deletes all {plural(total, 'record')}. {s.storageMode === 'server' ? 'A safety copy is written to data/backups first.' : 'Export a backup first if you might need it.'}
        </p>
        <Field label='Type "ERASE" to confirm' className="mt-4">
          <input className="input" value={resetText} onChange={(e) => setResetText(e.target.value)} autoComplete="off" />
        </Field>
      </Modal>
    </div>
  );
}

function AccountCard() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.current) return setError('Enter your current password.');
    if (form.next.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for the new password.`);
    if (form.next !== form.confirm) return setError('The new passwords don’t match.');
    setBusy(true);
    const fb = await import('@/lib/firebase');
    try {
      await fb.changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      toast.success('Password changed. Use the new one on your other devices next time they ask.');
    } catch (err) {
      setError(fb.authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const [signingOut, setSigningOut] = useState(false);
  const signOutHere = async () => {
    setSigningOut(true);
    const synced = await persistence.waitForSync(5000);
    setSigningOut(false);
    if (!synced) {
      const ok = await confirmAction({
        title: 'Some changes haven’t synced yet',
        message: 'This device is offline or still uploading. Signing out now removes the offline copy, so those changes would be lost. Reconnect and wait for “Synced” in the sidebar to be safe.',
        confirmLabel: 'Sign out anyway',
      });
      if (!ok) return;
    }
    const fb = await import('@/lib/firebase');
    persistence.stop();
    await fb.signOutUser();
    location.reload();
  };

  return (
    <Card title="Account" icon={<KeyRound size={15} />}>
      <p className="text-[13px] text-muted">Your password unlocks Vyro on every device. There’s no email to remember; the app uses a fixed account behind the scenes.</p>
      <form className="mt-4 space-y-2" onSubmit={change} noValidate>
        <input type="email" name="username" autoComplete="username" value={OWNER_EMAIL} readOnly hidden />
        <input id="pw-current" type="password" className="input" placeholder="Current password" autoComplete="current-password" aria-label="Current password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input id="pw-new" type="password" className="input" placeholder="New password" autoComplete="new-password" aria-label="New password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
          <input id="pw-confirm" type="password" className="input" placeholder="Confirm new password" autoComplete="new-password" aria-label="Confirm new password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        </div>
        {error && <p role="alert" className="text-xs text-bad">{error}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" disabled={busy}>
            Change password
          </Button>
          <Button variant="ghost" icon={<LogOut size={14} />} onClick={() => void signOutHere()} disabled={signingOut}>
            {signingOut ? 'Finishing sync…' : 'Sign out on this device'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
