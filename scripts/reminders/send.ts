/**
 * Vyro push sender. Runs on a schedule (GitHub Actions, every 30 minutes —
 * see .github/workflows/reminders.yml), reads your data from Firestore, and
 * pushes anything due soon to every device that turned push on.
 *
 * Each run covers [now − GRACE, now + LOOKAHEAD): items are sent up to
 * LOOKAHEAD minutes early (the text shows the exact time) and late runs still
 * catch up. Every notification is recorded in vyro/owner/sent so it is never
 * sent twice.
 *
 * Environment:
 *   FIREBASE_SERVICE_ACCOUNT  service-account JSON (GitHub secret)
 *   LOOKAHEAD_MINUTES         default 30 (match the schedule interval)
 *   GRACE_MINUTES             default 45
 *   DRY_RUN=1                 log what would be sent, record nothing
 *   FIRESTORE_EMULATOR_HOST   test against the emulator (GCLOUD_PROJECT = project id)
 */
import { createHash } from 'node:crypto';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { DEFAULT_NOTIFICATION_PREFS, dueNotifications, type DueNotification } from '../../shared/notifications.ts';
import { isValidTimeZone } from '../../shared/calendar.ts';
import type { CalendarEvent, Habit, NotificationPrefs, Project, Reminder, SchoolClass, Settings, Task } from '../../shared/schema.ts';

const LOOKAHEAD = Number(process.env.LOOKAHEAD_MINUTES ?? 30) * 60_000;
const GRACE = Number(process.env.GRACE_MINUTES ?? 45) * 60_000;
const DRY_RUN = process.env.DRY_RUN === '1';
const KEEP_SENT_MS = 3 * 86_400_000;
/** Tokens FCM says will never work again; their device entries are removed. */
const DEAD_TOKEN_CODES = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);

interface Device {
  id: string;
  token: string;
  label: string;
}

async function main() {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  if (!serviceAccount && !emulator) {
    console.log('FIREBASE_SERVICE_ACCOUNT is not set, so there is nothing to do. See README → Notifications.');
    return;
  }
  const app = serviceAccount ? initializeApp({ credential: cert(JSON.parse(serviceAccount)) }) : initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-vyro' });
  const db = getFirestore(app);
  const root = db.collection('vyro').doc('owner');
  const all = async <T,>(name: string) => (await root.collection(name).get()).docs.map((d) => d.data() as T);

  const [reminders, events, tasks, habits, classes, projects, settingsDocs, devices] = await Promise.all([
    all<Reminder>('reminders'),
    all<CalendarEvent>('events'),
    all<Task>('tasks'),
    all<Habit>('habits'),
    all<SchoolClass>('classes'),
    all<Project>('projects'),
    all<Settings>('settings'),
    all<Device>('devices'),
  ]);
  const settings = settingsDocs.find((s) => s.id === 'settings');
  const prefs: NotificationPrefs = settings?.notifications ?? DEFAULT_NOTIFICATION_PREFS;
  const timeZone = isValidTimeZone(settings?.timeZone) ? settings!.timeZone! : 'UTC';

  if (!devices.length) {
    console.log('No devices have push turned on (Settings → Notifications → Push to this device).');
    return;
  }

  const now = Date.now();
  const due = dueNotifications({ reminders, events, tasks, habits, classes, projects }, prefs, timeZone, now - GRACE, now + LOOKAHEAD);
  console.log(`Time zone ${timeZone}; ${due.length} notification(s) in window; ${devices.length} device(s).`);

  const messaging = getMessaging(app);
  const dead = new Set<string>();
  let sent = 0;
  let skipped = 0;
  let failures = 0;

  for (const n of due) {
    const marker = root.collection('sent').doc(createHash('sha256').update(n.key).digest('hex').slice(0, 40));
    if (DRY_RUN) {
      const exists = (await marker.get()).exists;
      console.log(`${exists ? 'already sent' : 'would send'}: ${describe(n)}`);
      continue;
    }
    try {
      // create() fails if the marker exists, so two overlapping runs can't double-send.
      await marker.create({ key: n.key, at: n.at, sentAt: now });
    } catch (err) {
      if ((err as { code?: number }).code === 6 /* ALREADY_EXISTS */) {
        skipped++;
        continue;
      }
      throw err;
    }
    const live = devices.filter((d) => !dead.has(d.id));
    if (!live.length) break;
    const ttlSeconds = Math.max(300, Math.round((n.at + 3_600_000 - now) / 1000));
    let res;
    try {
      res = await messaging.sendEachForMulticast({
        tokens: live.map((d) => d.token),
        data: { title: n.title, body: n.body, url: n.url, tag: n.key, important: String(Boolean(n.important)) },
        webpush: { headers: { Urgency: n.important ? 'high' : 'normal', TTL: String(ttlSeconds) } },
      });
    } catch (err) {
      // e.g. a bad service account: forget the marker so a later run can retry.
      await marker.delete();
      failures++;
      console.error(`Send failed (will retry): ${describe(n)}\n  ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    let otherErrors = 0;
    res.responses.forEach((r, i) => {
      if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) dead.add(live[i].id);
      else if (!r.success) {
        otherErrors++;
        console.warn(`  ${live[i].label}: ${r.error?.code ?? 'unknown error'}`);
      }
    });
    if (res.successCount === 0) {
      // Nothing delivered: forget the marker so the next run tries again.
      await marker.delete();
      if (otherErrors) failures++;
      console.warn(`Not delivered (will retry): ${describe(n)}`);
    } else {
      sent++;
      console.log(`Sent to ${res.successCount}/${live.length}: ${describe(n)}`);
    }
  }

  for (const id of dead) {
    await root.collection('devices').doc(id).delete();
    console.log(`Removed a device that no longer accepts push (${devices.find((d) => d.id === id)?.label ?? id}).`);
  }

  if (!DRY_RUN) {
    const old = await root.collection('sent').where('sentAt', '<', now - KEEP_SENT_MS).get();
    await Promise.all(old.docs.map((d) => d.ref.delete()));
  }
  console.log(`Done: ${sent} sent, ${skipped} already sent earlier${failures ? `, ${failures} failed` : ''}${DRY_RUN ? ' (dry run)' : ''}.`);
  // A failed run shows up red in GitHub Actions so problems don't go unnoticed.
  if (failures) process.exitCode = 1;
}

const describe = (n: DueNotification) => `[${n.kind}] ${n.title} — ${n.body} @ ${new Date(n.at).toISOString()}`;

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
