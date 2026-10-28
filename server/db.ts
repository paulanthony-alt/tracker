/**
 * Storage layer.
 *
 * Primary: SQLite via Node's built-in `node:sqlite` (Node 22.5+). Every record
 * is a row keyed by (collection, id) holding the validated JSON document.
 *
 * Fallback: if `node:sqlite` is unavailable (older Node), a JSON file with
 * atomic writes. Same interface, so the rest of the server doesn't care.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { COLLECTIONS, type CollectionName, type DataSnapshot, emptySnapshot } from '../shared/schema.ts';

export interface Store {
  kind: 'sqlite' | 'json';
  file: string;
  all(): DataSnapshot;
  put(collection: CollectionName, id: string, data: unknown): void;
  remove(collection: CollectionName, id: string): void;
  /** Run several writes atomically. */
  transaction(fn: () => void): void;
  replaceAll(data: DataSnapshot): void;
  count(): number;
}

function createSqliteStore(file: string): Store | null {
  let DatabaseSync: typeof import('node:sqlite').DatabaseSync;
  const emit = process.emitWarning;
  try {
    // node:sqlite prints an "experimental" warning on load; suppress just that one.
    process.emitWarning = ((w: string | Error, ...rest: unknown[]) => {
      if (String(typeof w === 'string' ? w : w.message).includes('SQLite')) return;
      return (emit as (...a: unknown[]) => void).call(process, w, ...rest);
    }) as typeof process.emitWarning;
    const require = createRequire(import.meta.url);
    ({ DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite'));
  } catch {
    return null;
  } finally {
    process.emitWarning = emit;
  }
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS records (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS records_collection ON records (collection);
  `);
  const selectAll = db.prepare('SELECT collection, data FROM records');
  const upsert = db.prepare(
    `INSERT INTO records (collection, id, data, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  );
  const del = db.prepare('DELETE FROM records WHERE collection = ? AND id = ?');
  const countStmt = db.prepare('SELECT COUNT(*) AS n FROM records');
  let depth = 0;

  const store: Store = {
    kind: 'sqlite',
    file,
    all() {
      const snap = emptySnapshot() as Record<string, unknown[]>;
      for (const row of selectAll.all() as { collection: string; data: string }[]) {
        if (snap[row.collection]) snap[row.collection].push(JSON.parse(row.data));
      }
      return snap as unknown as DataSnapshot;
    },
    put(collection, id, data) {
      upsert.run(collection, id, JSON.stringify(data), Date.now());
    },
    remove(collection, id) {
      del.run(collection, id);
    },
    transaction(fn) {
      // Nested calls join the outer transaction.
      if (depth > 0) return fn();
      depth++;
      db.exec('BEGIN');
      try {
        fn();
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      } finally {
        depth--;
      }
    },
    replaceAll(data) {
      store.transaction(() => {
        db.exec('DELETE FROM records');
        for (const name of COLLECTIONS) {
          for (const rec of data[name] as { id: string }[]) store.put(name, rec.id, rec);
        }
      });
    },
    count() {
      return Number((countStmt.get() as { n: number }).n);
    },
  };
  return store;
}

function createJsonStore(file: string): Store {
  let snap: DataSnapshot = emptySnapshot();
  if (fs.existsSync(file)) {
    try {
      snap = { ...emptySnapshot(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch (err) {
      // Never silently discard a file we can't read: keep a copy for recovery.
      const broken = `${file}.corrupt-${Date.now()}`;
      fs.copyFileSync(file, broken);
      console.error(`[db] Could not parse ${file}; a copy was saved to ${broken}.`, err);
    }
  }
  let inTx = false;
  const flush = () => {
    if (inTx) return;
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(snap));
    fs.renameSync(tmp, file);
  };
  const list = (c: CollectionName) => snap[c] as unknown as { id: string }[];

  const store: Store = {
    kind: 'json',
    file,
    all: () => structuredClone(snap),
    put(collection, id, data) {
      const arr = list(collection);
      const i = arr.findIndex((r) => r.id === id);
      if (i >= 0) arr[i] = data as { id: string };
      else arr.push(data as { id: string });
      flush();
    },
    remove(collection, id) {
      (snap as Record<string, unknown[]>)[collection] = list(collection).filter((r) => r.id !== id);
      flush();
    },
    transaction(fn) {
      if (inTx) return fn();
      const before = structuredClone(snap);
      inTx = true;
      try {
        fn();
      } catch (err) {
        snap = before;
        throw err;
      } finally {
        inTx = false;
      }
      flush();
    },
    replaceAll(data) {
      snap = structuredClone(data);
      flush();
    },
    count: () => COLLECTIONS.reduce((n, c) => n + snap[c].length, 0),
  };
  return store;
}

export function openStore(dataDir: string): Store {
  fs.mkdirSync(dataDir, { recursive: true });
  const sqlite = createSqliteStore(path.join(dataDir, 'life-os.db'));
  if (sqlite) return sqlite;
  console.warn('[db] node:sqlite is unavailable on this Node version; using a JSON file instead.');
  return createJsonStore(path.join(dataDir, 'life-os.json'));
}

/** Write a dated JSON snapshot to data/backups, keeping the most recent `keep`. */
export function writeDailyBackup(store: Store, dataDir: string, keep = 14): string | null {
  if (store.count() === 0) return null;
  const dir = path.join(dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, `life-os-${day}.json`);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      JSON.stringify({ format: 'life-os-backup', version: 1, exportedAt: new Date().toISOString(), data: store.all() }),
    );
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^life-os-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  for (const old of files.slice(0, Math.max(0, files.length - keep))) fs.rmSync(path.join(dir, old));
  return file;
}
