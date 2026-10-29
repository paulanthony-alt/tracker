/**
 * Automatic backups (Firebase version). Each person's Vyro saves a copy of
 * itself once a day, and a safety copy before anything that replaces all data
 * (erase, import, restore). Copies live in that person's own private space, so
 * only they can see or restore them. Settings → Backups lists them.
 */
import { BACKUP_FORMAT, BACKUP_VERSION, COLLECTIONS, validateBackup, type Backup } from '@shared/schema';
import { useStore } from './store';
import { todayISO } from './dates';
import { downloadFile } from './util';
import type { BackupInfo } from './firebase';

export type BackupKind = 'daily' | 'manual' | 'before-restore' | 'before-erase' | 'before-import';

export const BACKUP_LABEL: Record<string, string> = {
  daily: 'Daily backup',
  manual: 'Saved by you',
  'before-restore': 'Before a restore',
  'before-erase': 'Before erasing everything',
  'before-import': 'Before importing a file',
};

/** How many to keep: a week of daily copies, plus the most recent other ones. */
const KEEP_DAILY = 7;
const KEEP_OTHER = 5;

const loadFirebase = () => import('./firebase');

function serialize() {
  const data = useStore.getState().snapshot();
  const backup: Backup = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
  return { json: JSON.stringify(backup), records: COLLECTIONS.reduce((n, c) => n + (c === 'settings' ? 0 : data[c].length), 0) };
}

async function prune(list: BackupInfo[]) {
  const fb = await loadFirebase();
  const daily = list.filter((b) => b.kind === 'daily').slice(KEEP_DAILY);
  const other = list.filter((b) => b.kind !== 'daily').slice(KEEP_OTHER);
  await Promise.all([...daily, ...other].map((b) => fb.deleteBackup(b)));
}

export async function takeBackup(kind: BackupKind): Promise<void> {
  const fb = await loadFirebase();
  const { json, records } = serialize();
  // One daily copy per day: whichever device makes it first, the others just overwrite it.
  const id = kind === 'daily' ? `daily-${todayISO()}` : `${kind}-${Date.now()}`;
  await fb.saveBackup({ id, kind, createdAt: Date.now(), records }, json);
  await prune(await fb.listBackups());
}

/** Make today's daily copy if there isn't one yet; checks again every hour while Vyro is open. */
export function startDailyBackups(): () => void {
  if (useStore.getState().storageMode !== 'firebase') return () => {};
  const check = async () => {
    try {
      const fb = await loadFirebase();
      const today = todayISO();
      if ((await fb.listBackups()).some((b) => b.id === `daily-${today}`)) return;
      await takeBackup('daily');
    } catch (err) {
      console.warn('[backups] daily backup skipped', err);
    }
  };
  // Give the app a moment to finish loading and syncing first.
  const first = setTimeout(() => void check(), 20_000);
  const hourly = setInterval(() => void check(), 3_600_000);
  return () => {
    clearTimeout(first);
    clearInterval(hourly);
  };
}

async function load(info: BackupInfo) {
  const fb = await loadFirebase();
  const json = await fb.readBackup(info);
  const result = validateBackup(JSON.parse(json));
  if (!result.ok) throw new Error(result.error);
  return { json, data: result.data };
}

/** Put everything back as it was in this backup (after saving a safety copy of now). */
export async function restoreBackup(info: BackupInfo): Promise<void> {
  const { data } = await load(info);
  await takeBackup('before-restore');
  const s = useStore.getState();
  await s.replaceAll(data.settings.length ? data : { ...data, settings: [s.settings] });
}

export async function downloadBackup(info: BackupInfo): Promise<void> {
  const { json } = await load(info);
  downloadFile(`vyro-backup-${new Date(info.createdAt).toISOString().slice(0, 10)}.json`, JSON.stringify(JSON.parse(json), null, 2));
}
