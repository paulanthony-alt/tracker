/**
 * Persistence adapter.
 *
 *  - "server" mode (normal): data lives in the SQLite database behind /api.
 *    Every change is queued, coalesced per record, and flushed in small
 *    batches. Unsent changes are mirrored to localStorage, so closing the tab
 *    or losing the server mid-edit doesn't lose work — they're re-sent on the
 *    next load.
 *  - "firebase" mode: when the app is built with Firebase settings, data lives
 *    in Cloud Firestore under your account. Firestore keeps a copy on the
 *    device (works offline) and streams changes made on your other devices.
 *  - "local" mode (fallback): when no server is reachable (e.g. the app was
 *    opened as static files), the whole dataset is kept in this browser's
 *    localStorage. It is per-browser and per-device, and clearing site data
 *    erases it — the UI says so and offers export.
 */
import { BACKUP_FORMAT, COLLECTIONS, type CollectionName, type DataSnapshot, type SyncOp, emptySnapshot } from '@shared/schema';
import { firebaseEnabled } from './firebaseConfig';
import type { RemoteChange } from './firebase';

export type StorageMode = 'server' | 'local' | 'firebase';
export type SyncStatus = 'saved' | 'saving' | 'offline' | 'error';

const LOCAL_KEY = 'lifeos.data.v1';
const PENDING_KEY = 'lifeos.pending.v1';

const safeGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const safeSet = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};
const safeRemove = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
};

function normaliseSnapshot(raw: unknown): DataSnapshot {
  const snap = emptySnapshot();
  if (raw && typeof raw === 'object') {
    for (const c of COLLECTIONS) {
      const list = (raw as Record<string, unknown>)[c];
      if (Array.isArray(list)) (snap as Record<string, unknown[]>)[c] = list;
    }
  }
  return snap;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 4000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface ServerHealth {
  ok: boolean;
  storage: 'sqlite' | 'json';
  records: number;
  ai: boolean;
}

type Listener = (status: SyncStatus, detail?: string) => void;
type RejectListener = (errors: { collection: string; id: string; message: string }[]) => void;
type RemoteListener = (change: RemoteChange) => void;
type FirebaseModule = typeof import('./firebase');

export class Persistence {
  mode: StorageMode = 'local';
  health: ServerHealth | null = null;
  private pending = new Map<string, SyncOp>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private retryMs = 2000;
  private localSnapshot: (() => DataSnapshot) | null = null;
  private onStatus: Listener = () => {};
  private onReject: RejectListener = () => {};
  private onRemote: RemoteListener = () => {};
  private fb: FirebaseModule | null = null;
  private stopRemote: (() => void) | null = null;
  /** Firebase writes handed to the SDK but not yet confirmed by the server. */
  private unacked = 0;
  /** Where unsent changes are kept on this device; one per person in Firebase mode. */
  private pendingKey = PENDING_KEY;
  /**
   * Called when Firebase stops letting this session read or write, e.g. the
   * password was reset on another device. The app then asks to sign in again.
   */
  onAccessLost: ((message: string) => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flushOnUnload());
      // Phones often close a backgrounded app without any unload event, so save when hidden too.
      window.addEventListener('pagehide', () => this.flushOnUnload());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.flushOnUnload();
      });
      window.addEventListener('online', () => this.schedule(0));
    }
  }

  setListeners(onStatus: Listener, onReject: RejectListener, onRemote?: RemoteListener) {
    this.onStatus = onStatus;
    this.onReject = onReject;
    if (onRemote) this.onRemote = onRemote;
  }

  /** Stop listening for remote changes (sign-out). */
  stop() {
    this.stopRemote?.();
    this.stopRemote = null;
  }

  private handleRemote(change: RemoteChange) {
    // A record we still have queued locally is newer than what arrived; keep ours.
    const upserts = change.upserts.filter((r) => !this.pending.has(`${change.collection}:${r.id}`));
    const deletes = change.deletes.filter((id) => !this.pending.has(`${change.collection}:${id}`));
    if (upserts.length || deletes.length) this.onRemote({ collection: change.collection, upserts, deletes });
  }

  /** Decide the mode and load all data. */
  async boot(): Promise<DataSnapshot> {
    if (firebaseEnabled) {
      this.mode = 'firebase';
      this.fb = await import('./firebase');
      // Someone else may use this device too: keep each person's unsent changes apart.
      const member = this.fb.currentMember();
      this.pendingKey = member === 'owner' ? PENDING_KEY : `${PENDING_KEY}.${member}`;
      const { initial, stop } = this.fb.subscribeAll(
        (c) => this.handleRemote(c),
        (msg, code) => (code === 'permission-denied' ? this.accessLost(msg) : this.onStatus('error', msg)),
      );
      this.stopRemote = stop;
      const data = await initial;
      return this.afterLoad(data, COLLECTIONS.every((c) => data[c].length === 0));
    }
    try {
      const res = await fetchWithTimeout('api/health', {}, 2500);
      const health = (await res.json()) as ServerHealth;
      if (!res.ok || !health.ok) throw new Error('unhealthy');
      this.health = health;
      this.mode = 'server';
    } catch {
      this.mode = 'local';
    }

    if (this.mode === 'local') {
      const raw = safeGet(LOCAL_KEY);
      try {
        return normaliseSnapshot(raw ? JSON.parse(raw) : null);
      } catch {
        return emptySnapshot();
      }
    }

    const res = await fetchWithTimeout('api/data', {}, 10000);
    if (!res.ok) throw new Error(`Could not load data (HTTP ${res.status})`);
    return this.afterLoad(normaliseSnapshot(await res.json()), this.health?.records === 0);
  }

  /** Shared by server and Firebase modes after the remote data has loaded. */
  private afterLoad(data: DataSnapshot, remoteEmpty: boolean): DataSnapshot {
    // Re-apply changes that never reached the server last time.
    // Skip any that the database already has (or that were changed since, e.g. on another device).
    const unsent = this.readPending().filter((op) => !isSuperseded(data, op));
    safeRemove(this.pendingKey);
    if (unsent.length) {
      for (const op of unsent) {
        applyOp(data, op);
        this.pending.set(keyOf(op), op);
      }
      this.writePending();
      this.schedule(0);
    }

    // First run against an empty database, but this browser has local-only data: move it over.
    const localRaw = safeGet(LOCAL_KEY);
    if (remoteEmpty && localRaw && !unsent.length) {
      try {
        const local = normaliseSnapshot(JSON.parse(localRaw));
        for (const c of COLLECTIONS) {
          for (const rec of local[c] as { id: string }[]) this.enqueue({ op: 'put', collection: c, id: rec.id, data: rec });
        }
        safeRemove(LOCAL_KEY);
        return local;
      } catch {
        /* ignore malformed local data */
      }
    }
    return data;
  }

  /** In local mode the store hands us a getter for the full snapshot. */
  bindSnapshot(get: () => DataSnapshot) {
    this.localSnapshot = get;
  }

  enqueue(op: SyncOp) {
    this.pending.set(keyOf(op), op);
    this.writePending();
    this.schedule(this.mode === 'server' ? 350 : 250);
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), ms);
  }

  async flush(): Promise<void> {
    this.timer = null;
    if (this.mode === 'local') {
      if (!this.localSnapshot) return;
      const ok = safeSet(LOCAL_KEY, JSON.stringify(this.localSnapshot()));
      this.pending.clear();
      safeRemove(this.pendingKey);
      this.onStatus(ok ? 'saved' : 'error', ok ? undefined : 'Browser storage is full or blocked — export a backup.');
      return;
    }
    if (this.mode === 'firebase') return this.flushFirebase();
    if (this.inFlight || this.pending.size === 0) return;
    this.inFlight = true;
    const batch = [...this.pending.values()].slice(0, 500);
    this.onStatus('saving');
    try {
      const res = await fetchWithTimeout(
        'api/sync',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops: batch }) },
        15000,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = (await res.json()) as { applied: number; errors: { collection: string; id: string; message: string }[] };
      // Only drop ops that weren't replaced by a newer edit while the request was in flight.
      for (const op of batch) if (this.pending.get(keyOf(op)) === op) this.pending.delete(keyOf(op));
      this.writePending();
      this.retryMs = 2000;
      if (result.errors.length) this.onReject(result.errors);
      this.onStatus(result.errors.length ? 'error' : this.pending.size ? 'saving' : 'saved');
    } catch (err) {
      this.onStatus('offline', err instanceof Error ? err.message : 'Network error');
      this.retryMs = Math.min(this.retryMs * 2, 30000);
      this.inFlight = false;
      this.schedule(this.retryMs);
      return;
    }
    this.inFlight = false;
    if (this.pending.size) this.schedule(50);
  }

  /**
   * Hand queued changes to Firestore. The SDK stores them on the device
   * immediately and uploads them when online, so our queue can be cleared now.
   */
  private flushFirebase() {
    if (!this.fb || this.pending.size === 0) return;
    const ops = [...this.pending.values()];
    this.pending.clear();
    this.writePending();
    this.unacked++;
    this.onStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'saving', 'Offline — changes are saved on this device and will sync when you reconnect.');
    this.fb
      .writeOps(ops)
      .then(() => {
        this.unacked--;
        if (this.unacked === 0 && this.pending.size === 0) this.onStatus('saved');
      })
      .catch((err: unknown) => {
        this.unacked--;
        const code = (err as { code?: string })?.code;
        if (code === 'permission-denied') {
          // Keep these changes on the device; they're re-applied after signing in again.
          for (const op of ops) if (!this.pending.has(keyOf(op))) this.pending.set(keyOf(op), op);
          this.writePending();
          this.accessLost('Vyro couldn’t save your changes because your sign-in is no longer valid (for example, your password was reset). Sign out and sign in again; your recent changes are kept on this device.');
          return;
        }
        this.onStatus('error', err instanceof Error ? err.message : 'Sync failed');
      });
  }

  private accessLost(message: string) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stop();
    this.onStatus('error', message);
    this.onAccessLost?.(message);
  }

  private flushOnUnload() {
    if (this.mode === 'firebase') {
      // Hand the queue to Firestore, but keep the on-device copy: the page may close before
      // Firestore has stored it. The next start re-applies whatever the database doesn't have.
      const ops = [...this.pending.values()];
      this.flushFirebase();
      if (ops.length) safeSet(this.pendingKey, JSON.stringify(ops));
      return;
    }
    if (this.mode === 'local') {
      if (this.pending.size && this.localSnapshot) safeSet(LOCAL_KEY, JSON.stringify(this.localSnapshot()));
      return;
    }
    if (!this.pending.size) return;
    this.writePending();
    try {
      const body = new Blob([JSON.stringify({ ops: [...this.pending.values()] })], { type: 'application/json' });
      navigator.sendBeacon?.('api/sync', body);
    } catch {
      /* pending ops are already saved locally and will be retried */
    }
  }

  get hasPending() {
    return this.pending.size > 0;
  }

  /** Changes not yet confirmed by the server (queued here or inside the Firebase SDK). */
  get hasUnsynced() {
    return this.pending.size > 0 || this.unacked > 0;
  }

  /** Send anything queued and wait (up to `ms`) for the server to confirm. Returns true when fully synced. */
  async waitForSync(ms = 5000): Promise<boolean> {
    await this.flush();
    const until = Date.now() + ms;
    while (this.hasUnsynced && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
    return !this.hasUnsynced;
  }

  private readPending(): SyncOp[] {
    const raw = safeGet(this.pendingKey);
    if (!raw) return [];
    try {
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  private writePending() {
    if (this.mode === 'local') return;
    if (this.pending.size) safeSet(this.pendingKey, JSON.stringify([...this.pending.values()]));
    else safeRemove(this.pendingKey);
  }

  /** Replace everything (import / reset). */
  async replaceAll(data: DataSnapshot): Promise<{ skipped: number }> {
    this.pending.clear();
    safeRemove(this.pendingKey);
    if (this.mode === 'local') {
      if (!safeSet(LOCAL_KEY, JSON.stringify(data))) throw new Error('Browser storage is full or blocked.');
      return { skipped: 0 };
    }
    if (this.mode === 'firebase') {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('You’re offline. Reconnect to replace your data.');
      await this.fb!.replaceAllRemote(data);
      return { skipped: 0 };
    }
    const res = await fetchWithTimeout(
      'api/import',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), data }),
      },
      30000,
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `Import failed (HTTP ${res.status})`);
    return { skipped: body.skipped ?? 0 };
  }
}

const keyOf = (op: SyncOp) => `${op.collection}:${op.id}`;

/** True if the loaded data already has this saved change, or a newer version of the record. */
function isSuperseded(data: DataSnapshot, op: SyncOp): boolean {
  if (op.op !== 'put') return false;
  const list = (data as Record<string, { id: string; updatedAt?: number }[]>)[op.collection as CollectionName];
  const current = list?.find((r) => r.id === op.id);
  const incoming = (op.data as { updatedAt?: number } | null)?.updatedAt;
  return typeof current?.updatedAt === 'number' && typeof incoming === 'number' && current.updatedAt >= incoming;
}

function applyOp(data: DataSnapshot, op: SyncOp) {
  const list = (data as Record<string, { id: string }[]>)[op.collection as CollectionName];
  if (!list) return;
  const i = list.findIndex((r) => r.id === op.id);
  if (op.op === 'delete') {
    if (i >= 0) list.splice(i, 1);
  } else if (i >= 0) list[i] = op.data as { id: string };
  else list.push(op.data as { id: string });
}

export const persistence = new Persistence();
