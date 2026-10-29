import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Copy, ExternalLink, GraduationCap, KeyRound, Link2, Trash2 } from 'lucide-react';
import { parseInbox } from '@shared/imports';
import { useStore } from '@/lib/store';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { buildSyncScript } from '@/lib/syncScript';
import { toast } from '@/lib/toast';
import { plural } from '@/lib/util';
import { Badge, Button, Card, IconButton } from './ui/primitives';
import { confirmAction } from './ui/Modal';

function ago(ms: number) {
  const min = Math.round((Date.now() - ms) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  return hr < 48 ? `${hr} hr ago` : `${Math.round(hr / 24)} days ago`;
}

const STEPS = [
  <>
    On a computer, sign in to the Google account that has your classes (your school account) and open{' '}
    <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
      script.google.com <ExternalLink size={11} />
    </a>
    . A new, empty project opens.
  </>,
  <>Delete the few lines already in the editor, then paste the Vyro script (use <b>Copy script</b> below).</>,
  <>
    On the left, click the <b>+</b> next to <b>Services</b>, choose <b>Google Classroom API</b>, and click <b>Add</b>.
  </>,
  <>
    Click the save icon. In the menu next to <b>Run</b>, pick <b>setup</b>, then click <b>Run</b>.
  </>,
  <>
    Google asks for permission: click <b>Review permissions</b>, pick your account and <b>Allow</b>. If it says the app isn’t verified, click <b>Advanced → Go to … (unsafe)</b>. It’s your own script, so that’s expected.
  </>,
  <>That’s it. It runs by itself every 30 minutes, and your classes, assignments and calendar show up in Vyro.</>,
];

export function ConnectionsSettings() {
  const storageMode = useStore((s) => s.storageMode);
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [inbox, setInbox] = useState<unknown[]>([]);
  const [busy, setBusy] = useState(false);
  const [member, setMember] = useState('owner');

  useEffect(() => {
    if (storageMode !== 'firebase') return;
    const stops: (() => void)[] = [];
    let cancelled = false;
    void import('@/lib/firebase').then((fb) => {
      if (cancelled) return;
      setMember(fb.currentMember());
      stops.push(fb.watchSyncKey(setKey), fb.watchInbox(setInbox));
    });
    return () => {
      cancelled = true;
      stops.forEach((s) => s());
    };
  }, [storageMode]);

  const connections = useMemo(() => parseInbox(inbox), [inbox]);
  const script = useMemo(() => (key ? buildSyncScript({ projectId: firebaseConfig.projectId ?? '', apiKey: firebaseConfig.apiKey ?? '', member, key }) : ''), [key, member]);

  if (storageMode !== 'firebase')
    return (
      <Card title="Google Classroom & Calendar" icon={<Link2 size={15} />}>
        <p className="text-[13px] leading-relaxed text-muted">Connecting Google needs the online (Firebase) version of Vyro. See README → Firebase setup.</p>
      </Card>
    );

  const newKey = async () => {
    setBusy(true);
    try {
      const fb = await import('@/lib/firebase');
      await fb.createSyncKey();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t create the connection');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      toast.success('Script copied. Paste it into script.google.com');
    } catch {
      toast.error('Couldn’t copy. Open “Show the script” and copy it from there.');
    }
  };

  return (
    <Card title="Google Classroom & Calendar" icon={<Link2 size={15} />} subtitle="Bring in your classes, assignments and events automatically">
      {connections.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {connections.map(({ doc, items }) => (
            <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/50 px-3 py-2">
              <span className="text-faint">{doc.source === 'classroom' ? <GraduationCap size={16} /> : <CalendarDays size={16} />}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px]">
                  {doc.source === 'classroom' ? 'Google Classroom' : 'Google Calendar'}
                  {doc.account && <span className="text-faint"> · {doc.account}</span>}
                </p>
                <p className="text-xs text-faint">
                  Updated {ago(doc.syncedAt)} · {doc.source === 'classroom' ? plural(items.filter((i) => i.kind === 'work').length, 'assignment') : plural(items.length, 'event')}
                </p>
              </div>
              <Badge tone={Date.now() - doc.syncedAt < 3 * 3_600_000 ? 'good' : 'warn'}>{Date.now() - doc.syncedAt < 3 * 3_600_000 ? 'Connected' : 'Not updating'}</Badge>
              <IconButton
                label={`Forget ${doc.source === 'classroom' ? 'Google Classroom' : 'Google Calendar'}${doc.account ? ` (${doc.account})` : ''}`}
                size="xs"
                onClick={async () => {
                  const ok = await confirmAction({
                    title: 'Forget this connection?',
                    message: 'Items already brought in stay in Vyro. To stop updates for good, also delete the script at script.google.com (or reset the key below).',
                    confirmLabel: 'Forget',
                  });
                  if (ok) await (await import('@/lib/firebase')).removeInbox(doc.id);
                }}
              >
                <Trash2 size={13} />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      {key === undefined ? (
        <p className="text-[13px] text-faint">Loading…</p>
      ) : key === null ? (
        <div className="space-y-3">
          <p className="text-[13px] leading-relaxed text-muted">
            A small script runs in your own Google account and sends your Google Classroom classes and assignments, and your Google Calendar events, to Vyro every 30 minutes. It works with school accounts, because the script is yours. It can only add to Vyro; it can’t read anything in it.
          </p>
          <Button variant="primary" size="sm" disabled={busy} onClick={() => void newKey()}>
            {busy ? 'Setting up…' : 'Set up the connection'}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <ol className="space-y-2.5">
            {STEPS.map((step, i) => (
              <li key={i} className="flex gap-3 text-[13px] leading-relaxed">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/12 text-[11px] font-semibold text-accent">{i + 1}</span>
                <span className="text-muted">{step}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" icon={<Copy size={14} />} onClick={() => void copy()}>
              Copy script
            </Button>
          </div>
          <details className="group rounded-xl border border-line">
            <summary className="cursor-pointer px-3 py-2 text-[13px] text-muted">Show the script</summary>
            <textarea readOnly value={script} onFocus={(e) => e.currentTarget.select()} className="h-56 w-full resize-y rounded-b-xl border-t border-line bg-surface-2 p-3 font-mono text-[11px] leading-snug" aria-label="Vyro sync script" />
          </details>
          <div className="space-y-1.5 border-t border-line pt-3 text-xs leading-relaxed text-faint">
            <p>
              <b className="font-medium text-muted">Calendar on another account?</b> Follow the same steps signed in to that account (for example your personal Gmail). You can skip step 3 if it has no classes.
            </p>
            <p>
              <b className="font-medium text-muted">What comes in:</b> your active classes, assignments due in the last month through the next six months (turned-in work is checked off, returned grades fill in), and calendar events from two weeks ago to four months ahead. Edit them like anything else. If you delete one, it won’t come back.
            </p>
            <p>
              <b className="font-medium text-muted">Grade portals</b> (PowerSchool, Infinite Campus, Skyward and similar) don’t let apps connect, so add those grades in School → Grades &amp; GPA.
            </p>
            <div className="flex items-center justify-between gap-3 pt-1">
              <span>Script shared by accident? Reset the key; old copies stop working.</span>
              <Button
                size="xs"
                icon={<KeyRound size={12} />}
                disabled={busy}
                onClick={async () => {
                  const ok = await confirmAction({ title: 'Reset the key?', message: 'Every copy of the script stops working. Copy the new script into each Google account again.', confirmLabel: 'Reset key', danger: true });
                  if (ok) await newKey();
                }}
              >
                Reset key
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
