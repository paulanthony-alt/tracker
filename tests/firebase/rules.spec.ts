/**
 * Security-rules tests. They run against the Firestore emulator:
 *   npm run test:rules
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { OWNER_EMAIL } from '../../src/lib/firebaseConfig';

let env: RulesTestEnvironment;
const task = (id: string) => ({ id, title: 'Test', status: 'todo', priority: 'medium', tags: [], archived: false, createdAt: 1, updatedAt: 1 });
const owner = () => env.authenticatedContext('owner-uid', { email: OWNER_EMAIL, firebase: { sign_in_provider: 'password' } }).firestore();

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-vyro',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  });
});
afterAll(() => env?.cleanup());
beforeEach(() => env.clearFirestore());

describe('firestore.rules', () => {
  it('uses the same owner email as the app', () => {
    if (!readFileSync('firestore.rules', 'utf8').includes(`'${OWNER_EMAIL}'`)) throw new Error('OWNER_EMAIL in firebaseConfig.ts and firestore.rules differ');
  });

  it('lets the owner create, read, update and delete records', async () => {
    const ref = doc(owner(), 'vyro/owner/tasks/t1');
    await assertSucceeds(setDoc(ref, task('t1')));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(setDoc(ref, { ...task('t1'), title: 'Changed' }));
    await assertSucceeds(deleteDoc(ref));
  });

  it('keeps working after the account is recreated with a new uid (password reset)', async () => {
    await assertSucceeds(setDoc(doc(owner(), 'vyro/owner/tasks/t1'), task('t1')));
    const recreated = env.authenticatedContext('brand-new-uid', { email: OWNER_EMAIL, firebase: { sign_in_provider: 'password' } }).firestore();
    await assertSucceeds(getDoc(doc(recreated, 'vyro/owner/tasks/t1')));
  });

  it('rejects records whose id does not match the document', async () => {
    await assertFails(setDoc(doc(owner(), 'vyro/owner/tasks/t1'), task('other')));
  });

  it('rejects unknown collections and paths outside vyro/owner', async () => {
    await assertFails(setDoc(doc(owner(), 'vyro/owner/secrets/x'), { id: 'x' }));
    await assertFails(setDoc(doc(owner(), 'somewhere/else'), { id: 'else' }));
  });

  it('blocks signed-out visitors', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'vyro/owner/tasks/t1'), task('t1'));
    });
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'vyro/owner/tasks/t1')));
    await assertFails(setDoc(doc(anon, 'vyro/owner/tasks/t2'), task('t2')));
  });

  it('blocks any other account, even a signed-in one', async () => {
    const stranger = env.authenticatedContext('stranger', { email: 'someone@else.com', firebase: { sign_in_provider: 'password' } }).firestore();
    await assertFails(getDoc(doc(stranger, 'vyro/owner/tasks/t1')));
    await assertFails(setDoc(doc(stranger, 'vyro/owner/tasks/t1'), task('t1')));
    // Same email but signed in some other way (e.g. a forged custom token) is also refused.
    const otherProvider = env.authenticatedContext('x', { email: OWNER_EMAIL, firebase: { sign_in_provider: 'custom' } }).firestore();
    await assertFails(getDoc(doc(otherProvider, 'vyro/owner/tasks/t1')));
  });

  describe('Google sync inbox', () => {
    const KEY = 'k'.repeat(40);
    const inbox = (id: string, key = KEY, extra: Record<string, unknown> = {}) => ({ id, key, source: id.split('-')[0], syncedAt: 1, items: [], ...extra });
    const anon = () => env.unauthenticatedContext().firestore();
    beforeEach(async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'vyro/owner/links/key'), { id: 'key', key: KEY });
      });
    });

    it('accepts a signed-out write that carries the sync key', async () => {
      await assertSucceeds(setDoc(doc(anon(), 'vyro/owner/inbox/calendar-abc123'), inbox('calendar-abc123')));
      await assertSucceeds(setDoc(doc(anon(), 'vyro/owner/inbox/classroom-abc123'), inbox('classroom-abc123', KEY, { account: 'me@school.org', from: '2026-10-01', to: '2027-01-01' })));
    });

    it('rejects a wrong key, a missing key document, or reads', async () => {
      await assertFails(setDoc(doc(anon(), 'vyro/owner/inbox/calendar-abc123'), inbox('calendar-abc123', 'x'.repeat(40))));
      await assertFails(getDoc(doc(anon(), 'vyro/owner/inbox/calendar-abc123')));
      await assertFails(getDoc(doc(anon(), 'vyro/owner/links/key')));
      await env.withSecurityRulesDisabled(async (ctx) => {
        await deleteDoc(doc(ctx.firestore(), 'vyro/owner/links/key'));
      });
      await assertFails(setDoc(doc(anon(), 'vyro/owner/inbox/calendar-abc123'), inbox('calendar-abc123')));
    });

    it('rejects odd document ids, extra fields, oversized lists and other collections', async () => {
      await assertFails(setDoc(doc(anon(), 'vyro/owner/inbox/tasks-abc123'), inbox('tasks-abc123')));
      await assertFails(setDoc(doc(anon(), 'vyro/owner/inbox/calendar-abc123'), inbox('calendar-abc123', KEY, { source: 'classroom' })));
      await assertFails(setDoc(doc(anon(), 'vyro/owner/inbox/calendar-abc123'), inbox('calendar-abc123', KEY, { extra: true })));
      await assertFails(setDoc(doc(anon(), 'vyro/owner/inbox/calendar-abc123'), inbox('calendar-abc123', KEY, { items: Array(601).fill({}) })));
      await assertFails(setDoc(doc(anon(), 'vyro/owner/tasks/t1'), { ...task('t1'), key: KEY }));
    });

    it('lets the owner read and clear the inbox and manage the key', async () => {
      await assertSucceeds(setDoc(doc(owner(), 'vyro/owner/links/key'), { id: 'key', key: 'n'.repeat(40) }));
      await assertSucceeds(setDoc(doc(anon(), 'vyro/owner/inbox/calendar-abc123'), inbox('calendar-abc123', 'n'.repeat(40))));
      await assertSucceeds(getDoc(doc(owner(), 'vyro/owner/inbox/calendar-abc123')));
      await assertSucceeds(deleteDoc(doc(owner(), 'vyro/owner/inbox/calendar-abc123')));
    });
  });
});
