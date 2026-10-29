import { useEffect, useState } from 'react';
import { Download, History, RotateCcw, Save } from 'lucide-react';
import type { BackupInfo } from '@/lib/firebase';
import { BACKUP_LABEL, downloadBackup, restoreBackup, takeBackup } from '@/lib/backups';
import { toast } from '@/lib/toast';
import { plural } from '@/lib/util';
import { Badge, Button, Card, IconButton } from './ui/primitives';
import { confirmAction } from './ui/Modal';

const when = (ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Settings → Backups (Firebase version): automatic copies of your data, with one-click restore. */
export function BackupsCard() {
  const [list, setList] = useState<BackupInfo[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void import('@/lib/firebase').then((fb) => {
      if (!cancelled) stop = fb.watchBackups(setList);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  const run = async (key: string, fn: () => Promise<void>, done: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card
      title="Backups"
      icon={<History size={15} />}
      subtitle="Automatic copies of your Vyro"
      action={
        <Button size="xs" icon={<Save size={12} />} disabled={!!busy} onClick={() => void run('now', () => takeBackup('manual'), 'Backup saved')}>
          {busy === 'now' ? 'Saving…' : 'Back up now'}
        </Button>
      }
    >
      <p className="mb-3 text-[13px] leading-relaxed text-muted">
        Vyro saves a copy of your data once a day and keeps the last week, plus a safety copy before anything that replaces everything (erasing, importing or restoring). Only you can see these.
      </p>
      {list === null ? (
        <p className="text-[13px] text-faint">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-[13px] text-faint">The first one is saved automatically a few seconds after you open Vyro each day.</p>
      ) : (
        <div className="divide-y divide-line/70 rounded-lg border border-line">
          {list.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px]">{when(b.createdAt)}</p>
                <p className="truncate text-xs text-faint">{plural(b.records, 'record')}</p>
              </div>
              <Badge tone={b.kind === 'daily' ? 'neutral' : 'accent'}>{BACKUP_LABEL[b.kind] ?? b.kind}</Badge>
              <IconButton label={`Download the backup from ${when(b.createdAt)}`} size="xs" disabled={!!busy} onClick={() => void run(`dl-${b.id}`, () => downloadBackup(b), 'Backup downloaded')}>
                <Download size={13} />
              </IconButton>
              <Button
                size="xs"
                icon={<RotateCcw size={12} />}
                disabled={!!busy}
                onClick={async () => {
                  const ok = await confirmAction({
                    title: `Restore the backup from ${when(b.createdAt)}?`,
                    message: `Everything in your Vyro goes back to how it was then (${plural(b.records, 'record')}). Changes since then are replaced, but a safety copy of right now is saved first, so you can undo this.`,
                    confirmLabel: 'Restore',
                  });
                  if (ok) void run(`rs-${b.id}`, () => restoreBackup(b), 'Restored. Your devices update in a moment.');
                }}
              >
                {busy === `rs-${b.id}` ? 'Restoring…' : 'Restore'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
