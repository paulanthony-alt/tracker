/**
 * End-to-end test of the push sender (scripts/reminders/send.ts) against the
 * Firestore emulator. Real delivery needs a Firebase project, so this checks
 * everything up to the hand-off to Firebase Cloud Messaging.
 *   npm run test:rules
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { DEFAULT_NOTIFICATION_PREFS } from '../../shared/notifications';

let env: RulesTestEnvironment;
const PROJECT = 'demo-vyro';

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) } });
});
afterAll(() => env?.cleanup());
beforeEach(() => env.clearFirestore());

const put = (path: string, data: object) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data));

function runSender(extra: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, ['scripts/reminders/send.ts'], {
    env: { ...process.env, GCLOUD_PROJECT: PROJECT, FIREBASE_SERVICE_ACCOUNT: '', ...extra },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { out: `${r.stdout}${r.stderr}`, code: r.status };
}

/** A reminder due `mins` from now, in UTC so the test doesn't depend on the machine's zone. */
function reminderIn(mins: number, title = 'Bring permission slip') {
  const t = new Date(Date.now() + mins * 60_000);
  return { id: 'r1', title, date: t.toISOString().slice(0, 10), time: t.toISOString().slice(11, 16), done: false, createdAt: 1, updatedAt: 1 };
}

async function seed(reminder = reminderIn(10)) {
  await put('vyro/owner/settings/settings', { id: 'settings', timeZone: 'UTC', notifications: { ...DEFAULT_NOTIFICATION_PREFS, digestTime: null, tomorrowTime: null } });
  await put(`vyro/owner/reminders/${reminder.id}`, reminder);
  await put('vyro/owner/devices/d1', { id: 'd1', token: 'fake-token', label: 'Test phone', createdAt: 1, updatedAt: 1 });
  return reminder;
}

describe('push sender', () => {
  it('does nothing until a device has push turned on', async () => {
    await put('vyro/owner/reminders/r1', reminderIn(10));
    const { out, code } = runSender({ DRY_RUN: '1' });
    expect(code).toBe(0);
    expect(out).toContain('no devices have push turned on');
  });

  it('finds reminders due within the lookahead window', async () => {
    await seed();
    const { out, code } = runSender({ DRY_RUN: '1', VERBOSE_LOGS: '1' });
    expect(code).toBe(0);
    expect(out).toContain('would send: [reminder] Bring permission slip');
  });

  it('keeps titles, time zone and device names out of the log by default (public Actions logs)', async () => {
    await seed();
    const { out } = runSender({ DRY_RUN: '1' });
    expect(out).toMatch(/would send: \[reminder\] due \d\d:\d\d UTC/);
    expect(out).not.toContain('Bring permission slip');
    expect(out).not.toContain('Test phone');
    expect(out).not.toContain('Time zone');
  });

  it('skips reminders outside the window and ones already marked done', async () => {
    await seed(reminderIn(90)); // beyond the 30-minute default lookahead
    await put('vyro/owner/reminders/r2', { ...reminderIn(5, 'Done already'), id: 'r2', done: true });
    const { out } = runSender({ DRY_RUN: '1' });
    expect(out).toContain('0 notification(s) in window');
  });

  it('never sends the same notification twice', async () => {
    const r = await seed();
    const key = `rem:r1:${r.date}T${r.time}`;
    await put(`vyro/owner/sent/${createHash('sha256').update(key).digest('hex').slice(0, 40)}`, { key, at: 0, sentAt: Date.now() });
    const { out } = runSender({ DRY_RUN: '1', VERBOSE_LOGS: '1' });
    expect(out).toContain('already sent: [reminder] Bring permission slip');
  });

  it("sends each family member's reminders from their own space, and keeps names out of the log", async () => {
    await put('vyro/owner/family/sam', { id: 'sam', username: 'sam', name: 'Sam', uid: 'u-sam', email: 'sam.a1@member.vyro.example.com', createdAt: 1, updatedAt: 1 });
    await put('vyro/sam/settings/settings', { id: 'settings', timeZone: 'UTC', notifications: { ...DEFAULT_NOTIFICATION_PREFS, digestTime: null, tomorrowTime: null } });
    await put('vyro/sam/reminders/r9', { ...reminderIn(10, 'Sam’s soccer cleats'), id: 'r9' });
    await put('vyro/sam/devices/d9', { id: 'd9', token: 'fake-token-sam', label: 'Sam’s phone', createdAt: 1, updatedAt: 1 });
    await seed();
    const verbose = runSender({ DRY_RUN: '1', VERBOSE_LOGS: '1' });
    expect(verbose.out).toContain('would send: [reminder] Bring permission slip');
    expect(verbose.out).toContain('would send: [reminder] Sam’s soccer cleats');
    expect(verbose.out).toMatch(/sam: 1 notification\(s\) in window/);
    const quiet = runSender({ DRY_RUN: '1' });
    expect(quiet.out).toContain('Account 2 of 2: 1 notification(s) in window');
    expect(quiet.out).not.toMatch(/sam/i);
  });

  it('keeps a reminder queued for retry when Firebase Messaging rejects the send', async () => {
    await seed();
    // No real credentials here, so the hand-off to FCM fails — exactly the case that must retry.
    const failed = runSender();
    expect(failed.code).toBe(1);
    expect(failed.out).toMatch(/Send failed \(will retry\)|Not delivered \(will retry\)/);
    const again = runSender({ DRY_RUN: '1', VERBOSE_LOGS: '1' });
    expect(again.out).toContain('would send: [reminder] Bring permission slip');
  });
});
