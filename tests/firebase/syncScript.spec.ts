/**
 * Replays the Google sync script's real requests against the Firestore
 * emulator with the real security rules:  npm run test:rules
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDocs, collection, setDoc } from 'firebase/firestore';
import { parseInbox } from '../../shared/imports';
import { runSyncScript } from '../helpers/appsScript';

const KEY = 'z'.repeat(40);
const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = HOST.split(':');
  env = await initializeTestEnvironment({ projectId: 'demo-vyro', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) } });
});
afterAll(() => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'vyro/owner/links/key'), { id: 'key', key: KEY });
  });
});

/** Send the captured requests to the emulator instead of production. */
async function replay(key: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-28T16:00:00Z'));
  const { requests } = runSyncScript({ projectId: 'demo-vyro', apiKey: 'test-api-key', member: 'owner', key });
  vi.useRealTimers();
  return Promise.all(
    requests.map((r) =>
      fetch(r.url.replace('https://firestore.googleapis.com', `http://${HOST}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: r.payload }).then((res) => res.status),
    ),
  );
}

describe('Google sync script → Firestore', () => {
  it('is accepted by the security rules and readable by the app', async () => {
    expect(await replay(KEY)).toEqual([200, 200]);
    await env.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDocs(collection(ctx.firestore(), 'vyro/owner/inbox'));
      const inbox = parseInbox(snap.docs.map((d) => d.data()));
      expect(inbox.map((d) => d.doc.source).sort()).toEqual(['calendar', 'classroom']);
      expect(inbox.find((d) => d.doc.source === 'classroom')!.items.length).toBe(3);
    });
  });

  it('is refused with the wrong key', async () => {
    expect(await replay('w'.repeat(40))).toEqual([403, 403]);
  });
});
