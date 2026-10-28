/**
 * Persistence adapter.
 *
 *  - "server" mode (normal): data lives in the SQLite database behind /api.
 *    Every change is queued, coalesced per record, and flushed in small
 *    batches. Unsent changes are mirrored to localStorage, so closing the tab
 *    or losing the server mid-edit doesn't lose work — they're re-sent on the
 *    next load.
 *  - "local" mode (fallback): when no server is reachable (e.g. the app was
 *    opened as static files), the whole dataset is kept in this browser's
 *    localStorage. It is per-browser and per-device, and clearing site data
 *    erases it — the UI says so and offers export.
 */
import { COLLECTIONS, type CollectionName, type DataSnapshot, type SyncOp, emptySnapshot } from '@shared/schema';

export type StorageMode = 'server' | 'local';
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

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flushOnUnload());
      window.addEventListener('online', () => this.schedule(0));
    }
  }

  setListeners(onStatus: Listener, onReject: RejectListener) {
    this.onStatus = onStatus;
    this.onReject = onReject;
  }

  /** Decide the mode and load all data. */
  async boot(): Promise<DataSnapshot> {
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
    const data = normaliseSnapshot(await res.json());

    // Re-apply changes that never reached the server last time.
    const unsent = this.readPending();
    if (unsent.length) {
      for (const op of unsent) {
        applyOp(data, op);
        this.pending.set(keyOf(op), op);
      }
      this.schedule(0);
    }

    // First run against an empty server, but this browser has local-only data: move it over.
    const localRaw = safeGet(LOCAL_KEY);
    if (this.health && this.health.records === 0 && localRaw && !unsent.length) {
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
      safeRemove(PENDING_KEY);
      this.onStatus(ok ? 'saved' : 'error', ok ? undefined : 'Browser storage is full or blocked — export a backup.');
      return;
    }
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

  private flushOnUnload() {
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

  private readPending(): SyncOp[] {
    const raw = safeGet(PENDING_KEY);
    if (!raw) return [];
    try {
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  private writePending() {
    if (this.mode !== 'server') return;
    if (this.pending.size) safeSet(PENDING_KEY, JSON.stringify([...this.pending.values()]));
    else safeRemove(PENDING_KEY);
  }

  /** Replace everything (import / reset). */
  async replaceAll(data: DataSnapshot): Promise<{ skipped: number }> {
    this.pending.clear();
    safeRemove(PENDING_KEY);
    if (this.mode === 'local') {
      if (!safeSet(LOCAL_KEY, JSON.stringify(data))) throw new Error('Browser storage is full or blocked.');
      return { skipped: 0 };
    }
    const res = await fetchWithTimeout(
      'api/import',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'life-os-backup', version: 1, exportedAt: new Date().toISOString(), data }),
      },
      30000,
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `Import failed (HTTP ${res.status})`);
    return { skipped: body.skipped ?? 0 };
  }
}

const keyOf = (op: SyncOp) => `${op.collection}:${op.id}`;

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
