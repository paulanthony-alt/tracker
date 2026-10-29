/**
 * Security-rules tests. They run against the Firestore emulator:
 *   npm run test:rules
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
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

  describe('family members', () => {
    const memberEmail = (u: string, n = 'a1') => `${u}.${n}@member.vyro.example.com`;
    const as = (uid: string, email: string) => env.authenticatedContext(uid, { email, firebase: { sign_in_provider: 'password' } }).firestore();
    const sam = () => as('sam-uid', memberEmail('sam'));
    const jordan = () => as('jordan-uid', memberEmail('jordan'));
    beforeEach(async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        for (const [u, uid] of [['sam', 'sam-uid'], ['jordan', 'jordan-uid']])
          await setDoc(doc(db, `vyro/owner/family/${u}`), { id: u, username: u, name: u, uid, email: memberEmail(u), createdAt: 1, updatedAt: 1 });
        await setDoc(doc(db, 'vyro/owner/tasks/alex1'), task('alex1'));
        await setDoc(doc(db, 'vyro/jordan/tasks/jordan1'), task('jordan1'));
      });
    });

    it('each member can use their own space', async () => {
      await assertSucceeds(setDoc(doc(sam(), 'vyro/sam/tasks/e1'), task('e1')));
      await assertSucceeds(getDoc(doc(sam(), 'vyro/sam/tasks/e1')));
      await assertSucceeds(deleteDoc(doc(sam(), 'vyro/sam/tasks/e1')));
    });

    it("nobody can open anyone else's space, the owner included", async () => {
      await assertFails(getDoc(doc(sam(), 'vyro/owner/tasks/alex1')));
      await assertFails(setDoc(doc(sam(), 'vyro/owner/tasks/x'), task('x')));
      await assertFails(getDoc(doc(sam(), 'vyro/jordan/tasks/jordan1')));
      await assertFails(setDoc(doc(sam(), 'vyro/jordan/tasks/x'), task('x')));
      await assertFails(getDoc(doc(owner(), 'vyro/jordan/tasks/jordan1')));
      await assertFails(setDoc(doc(owner(), 'vyro/sam/tasks/x'), task('x')));
      await assertSucceeds(getDoc(doc(jordan(), 'vyro/jordan/tasks/jordan1')));
    });

    it('accounts the owner did not add get nothing, even with a matching email', async () => {
      const impostor = as('impostor-uid', memberEmail('sam', 'zz'));
      await assertFails(getDoc(doc(impostor, 'vyro/sam/tasks/e1')));
      await assertFails(setDoc(doc(impostor, 'vyro/sam/tasks/e1'), task('e1')));
      const riley = as('riley-uid', memberEmail('riley'));
      await assertFails(setDoc(doc(riley, 'vyro/riley/tasks/k1'), task('k1')));
    });

    it('after a password reset only the new account works', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'vyro/owner/family/sam'), { id: 'sam', username: 'sam', name: 'Sam', uid: 'sam-uid-2', email: memberEmail('sam', 'b2'), createdAt: 1, updatedAt: 2 });
      });
      await assertFails(getDoc(doc(sam(), 'vyro/sam/tasks/e1')));
      await assertSucceeds(setDoc(doc(as('sam-uid-2', memberEmail('sam', 'b2')), 'vyro/sam/tasks/e1'), task('e1')));
    });

    it('backups stay in their own space', async () => {
      await assertSucceeds(setDoc(doc(sam(), 'vyro/sam/backups/daily-2026-10-29'), { id: 'daily-2026-10-29', kind: 'daily', createdAt: 1, records: 3, parts: 1 }));
      await assertSucceeds(setDoc(doc(sam(), 'vyro/sam/backupParts/daily-2026-10-29-0'), { id: 'daily-2026-10-29-0', text: '{}' }));
      await assertFails(getDoc(doc(jordan(), 'vyro/sam/backupParts/daily-2026-10-29-0')));
      await assertFails(getDoc(doc(owner(), 'vyro/sam/backups/daily-2026-10-29')));
    });

    it('only the owner manages the family list', async () => {
      await assertSucceeds(getDoc(doc(owner(), 'vyro/owner/family/sam')));
      await assertFails(getDoc(doc(sam(), 'vyro/owner/family/sam')));
      await assertFails(setDoc(doc(sam(), 'vyro/owner/family/sam'), { id: 'sam', uid: 'sam-uid' }));
      await assertFails(setDoc(doc(sam(), 'vyro/owner/family/riley'), { id: 'riley', uid: 'sam-uid' }));
    });

    it('username directory: anyone can look up one name, nobody can list, only the owner writes', async () => {
      await assertSucceeds(setDoc(doc(owner(), 'vyro-directory/sam'), { id: 'sam', email: memberEmail('sam') }));
      await assertSucceeds(setDoc(doc(owner(), 'vyro-directory/_owner'), { id: '_owner', username: 'alex' }));
      const anon = env.unauthenticatedContext().firestore();
      await assertSucceeds(getDoc(doc(anon, 'vyro-directory/sam')));
      await assertFails(getDocs(collection(anon, 'vyro-directory')));
      await assertFails(setDoc(doc(anon, 'vyro-directory/mallory'), { id: 'mallory', email: 'x@y.z' }));
      await assertFails(setDoc(doc(sam(), 'vyro-directory/sam'), { id: 'sam', email: 'me@evil.example' }));
      await assertFails(setDoc(doc(owner(), 'vyro-directory/sam'), { id: 'sam', email: memberEmail('sam'), extra: 1 }));
      await assertSucceeds(deleteDoc(doc(owner(), 'vyro-directory/sam')));
    });

    it("a member's Google script writes only to that member's inbox, with that member's key", async () => {
      const KEY = 'e'.repeat(40);
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'vyro/sam/links/key'), { id: 'key', key: KEY });
      });
      const anon = env.unauthenticatedContext().firestore();
      const body = { id: 'calendar-abc123', key: KEY, source: 'calendar', syncedAt: 1, items: [] };
      await assertSucceeds(setDoc(doc(anon, 'vyro/sam/inbox/calendar-abc123'), body));
      await assertFails(setDoc(doc(anon, 'vyro/jordan/inbox/calendar-abc123'), body));
      await assertFails(setDoc(doc(anon, 'vyro/owner/inbox/calendar-abc123'), body));
    });
  });
});
