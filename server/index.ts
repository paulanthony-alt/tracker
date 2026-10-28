/**
 * Life OS API server.
 *
 *   GET  /api/health          storage + AI status
 *   GET  /api/data            every record, grouped by collection
 *   POST /api/sync            batch of put/delete operations (validated)
 *   GET  /api/export          full backup as a downloadable JSON file
 *   POST /api/import          replace all data with a validated backup
 *   GET  /api/ai/status       whether the AI assistant is configured
 *   POST /api/ai/chat         streamed assistant reply (Server-Sent Events)
 *
 * In production (`npm start`) it also serves the built web app from /dist.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  collectionSchemas,
  isCollection,
  syncOpSchema,
  validateBackup,
} from '../shared/schema.ts';
import { openStore, writeDailyBackup } from './db.ts';
import { aiChat, aiStatus } from './ai.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotEnv(path.join(root, '.env'));

const isProd = process.env.NODE_ENV === 'production';
const port = Number(isProd ? (process.env.PORT ?? 3000) : (process.env.API_PORT ?? 3001));
// Bind to localhost by default: this is personal data. Set HOST=0.0.0.0 to expose on your network.
const host = process.env.HOST ?? '127.0.0.1';
const dataDir = path.resolve(root, process.env.DATA_DIR ?? 'data');

const store = openStore(dataDir);
const backupFile = writeDailyBackup(store, dataDir);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, storage: store.kind, records: store.count(), ai: aiStatus().enabled });
});

app.get('/api/data', (_req, res) => {
  res.json(store.all());
});

const syncBody = z.object({ ops: z.array(syncOpSchema).max(5000) });

app.post('/api/sync', (req, res) => {
  const body = syncBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Malformed sync request.' });
    return;
  }
  const errors: { index: number; collection: string; id: string; message: string }[] = [];
  let applied = 0;
  store.transaction(() => {
    body.data.ops.forEach((op, index) => {
      if (!isCollection(op.collection)) {
        errors.push({ index, collection: op.collection, id: op.id, message: 'Unknown collection' });
        return;
      }
      if (op.op === 'delete') {
        store.remove(op.collection, op.id);
        applied++;
        return;
      }
      const parsed = collectionSchemas[op.collection].safeParse(op.data);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        errors.push({
          index,
          collection: op.collection,
          id: op.id,
          message: `${issue.path.join('.') || 'record'}: ${issue.message}`,
        });
        return;
      }
      if (parsed.data.id !== op.id) {
        errors.push({ index, collection: op.collection, id: op.id, message: 'id mismatch' });
        return;
      }
      store.put(op.collection, op.id, parsed.data);
      applied++;
    });
  });
  res.json({ applied, errors });
});

app.get('/api/export', (_req, res) => {
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="life-os-backup-${stamp}.json"`);
  res.json({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data: store.all() });
});

app.post('/api/import', (req, res) => {
  const result = validateBackup(req.body);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  // Safety net: snapshot current data before replacing it.
  writeSnapshot('pre-import');
  store.replaceAll(result.data);
  res.json({ ok: true, skipped: result.skipped, records: store.count() });
});

app.get('/api/ai/status', (_req, res) => res.json(aiStatus()));
app.post('/api/ai/chat', aiChat);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

if (isProd) {
  const dist = path.join(root, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.error('dist/ is missing. Run `npm run build` first (npm start does this for you).');
    process.exit(1);
  }
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[server]', err);
  if (res.headersSent) return;
  const status = (err as { status?: number }).status;
  if (status === 413) res.status(413).json({ error: 'Request too large.' });
  else if (status === 400) res.status(400).json({ error: 'Invalid JSON.' });
  else res.status(500).json({ error: 'Internal server error.' });
});

app.listen(port, host, () => {
  const url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;
  console.log(`\n  Life OS ${isProd ? 'app' : 'API'} running at ${url}`);
  console.log(`  Storage: ${store.kind} → ${path.relative(root, store.file)} (${store.count()} records)`);
  if (backupFile) console.log(`  Daily backup: ${path.relative(root, backupFile)}`);
  console.log(`  AI assistant: ${aiStatus().enabled ? `enabled (${aiStatus().model})` : 'off — set ANTHROPIC_API_KEY in .env to enable'}\n`);
});

function writeSnapshot(label: string) {
  const dir = path.join(dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${label}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data: store.all() }));
}

/** Minimal .env loader (KEY=value lines) so no extra dependency is needed. */
function loadDotEnv(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trimStart().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined && value !== '') process.env[m[1]] = value;
  }
}
