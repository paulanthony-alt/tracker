/**
 * Firebase backend: password-only sign-in (the email is fixed) and Firestore
 * storage with live sync between devices and an offline cache.
 *
 * Data layout: vyro/owner/{collection}/{recordId}. The path doesn't depend on
 * the account's uid, so if you ever reset the account (delete it in the Firebase
 * console and set a new password), your data is still there.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { deleteToken, getMessaging, getToken, isSupported as messagingSupported } from 'firebase/messaging';
import {
  EmailAuthProvider,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  clearIndexedDbPersistence,
  collection,
  deleteDoc,
  setDoc,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { COLLECTIONS, emptySnapshot, type CollectionName, type DataSnapshot, type SyncOp } from '@shared/schema';
import type { ImportState } from '@shared/imports';
import { firebaseConfig, firebaseVapidKey, OWNER_EMAIL, pushConfigured, useFirebaseEmulator } from './firebaseConfig';
import { PUSH_FLAG_KEY } from './notifier';

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let started = false;

function start() {
  if (started) return;
  started = true;
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  let localCache;
  try {
    // Keeps a copy on the device so the app opens offline and queued edits survive a reload.
    localCache = persistentLocalCache({ tabManager: persistentMultipleTabManager() });
  } catch {
    localCache = memoryLocalCache();
  }
  db = initializeFirestore(app, { localCache, ignoreUndefinedProperties: true });
  if (useFirebaseEmulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
}

const ownerCollection = (name: CollectionName) => collection(db, 'vyro', 'owner', name);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function watchAuth(cb: (user: User | null) => void): () => void {
  start();
  return onAuthStateChanged(auth, cb);
}

/** Turn Firebase error codes into messages a person can act on. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'That password is incorrect.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes, then try again.';
    case 'auth/network-request-failed':
      return 'Can’t reach Firebase. Check your internet connection and try again.';
    case 'auth/email-already-in-use':
      return 'A password is already set for this app. Sign in with it instead.';
    case 'auth/weak-password':
      return 'Choose a longer password.';
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'Password sign-in is turned off in your Firebase project. Turn on Authentication → Sign-in method → Email/Password in the Firebase console.';
    case 'auth/requires-recent-login':
      return 'For security, sign out and back in, then try again.';
    default:
      return err instanceof Error ? err.message : 'Something went wrong. Try again.';
  }
}

export async function signIn(password: string) {
  start();
  await signInWithEmailAndPassword(auth, OWNER_EMAIL, password);
}

/** First-time setup: creates the single account with the fixed email. */
export async function createAccount(password: string) {
  start();
  await createUserWithEmailAndPassword(auth, OWNER_EMAIL, password);
}

export async function changePassword(current: string, next: string) {
  start();
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error('Not signed in'), { code: 'auth/requires-recent-login' });
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(OWNER_EMAIL, current));
  await updatePassword(user, next);
}

let signingOut = false;
/** True while signing out; the page reloads right after, so the UI shouldn't react to it. */
export const isSigningOut = () => signingOut;

/** Sign out and remove the offline copy of your data from this device. */
export async function signOutUser() {
  start();
  signingOut = true;
  await signOut(auth);
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {
    /* another tab still has the cache open; it's cleared next time */
  }
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export interface RemoteChange {
  collection: CollectionName;
  upserts: { id: string }[];
  deletes: string[];
}

/**
 * Subscribe to every collection. Resolves with the full dataset once each
 * collection has delivered its first snapshot; after that, changes made on
 * other devices are passed to `onChange`. Our own writes are skipped (the
 * store already has them).
 */
export function subscribeAll(onChange: (c: RemoteChange) => void, onError: (message: string) => void): { initial: Promise<DataSnapshot>; stop: () => void } {
  start();
  const data = emptySnapshot() as Record<string, unknown[]>;
  const pending = new Set<CollectionName>(COLLECTIONS);
  const unsubs: (() => void)[] = [];
  let resolve!: (d: DataSnapshot) => void;
  let reject!: (e: Error) => void;
  const initial = new Promise<DataSnapshot>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  for (const name of COLLECTIONS) {
    let first = true;
    unsubs.push(
      onSnapshot(
        ownerCollection(name),
        { includeMetadataChanges: false },
        (snap) => {
          if (first) {
            first = false;
            data[name] = snap.docs.map((d) => d.data());
            pending.delete(name);
            if (pending.size === 0) resolve(data as unknown as DataSnapshot);
            return;
          }
          const upserts: { id: string }[] = [];
          const deletes: string[] = [];
          for (const ch of snap.docChanges()) {
            if (ch.doc.metadata.hasPendingWrites) continue;
            if (ch.type === 'removed') deletes.push(ch.doc.id);
            else upserts.push(ch.doc.data() as { id: string });
          }
          if (upserts.length || deletes.length) onChange({ collection: name, upserts, deletes });
        },
        (err) => {
          const msg = err.code === 'permission-denied' ? 'Firebase refused access. Check that firestore.rules is deployed and that you’re signed in.' : err.message;
          if (pending.size) reject(new Error(msg));
          else onError(msg);
        },
      ),
    );
  }
  return { initial, stop: () => unsubs.forEach((u) => u()) };
}

/**
 * Write a batch of changes. Firestore applies them to the local cache right
 * away (so they survive going offline); the promise resolves when the server
 * has them.
 */
export async function writeOps(ops: SyncOp[]): Promise<void> {
  start();
  const commits: Promise<void>[] = [];
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 450)) {
      const ref = doc(ownerCollection(op.collection as CollectionName), op.id);
      if (op.op === 'delete') batch.delete(ref);
      else batch.set(ref, op.data as Record<string, unknown>);
    }
    // Committing queues the batch locally right away; the promise settles on server ack.
    commits.push(batch.commit());
  }
  await Promise.all(commits);
}

/** Replace everything (import / erase): delete all existing records, then write the new set. */
export async function replaceAllRemote(next: DataSnapshot): Promise<void> {
  start();
  const ops: SyncOp[] = [];
  for (const name of COLLECTIONS) {
    const existing = await getDocs(ownerCollection(name));
    const keep = new Set((next[name] as { id: string }[]).map((r) => r.id));
    for (const d of existing.docs) if (!keep.has(d.id)) ops.push({ op: 'delete', collection: name, id: d.id });
    for (const rec of next[name] as { id: string }[]) ops.push({ op: 'put', collection: name, id: rec.id, data: rec });
  }
  await writeOps(ops);
}

// ---------------------------------------------------------------------------
// Push notifications (Firebase Cloud Messaging, free)
// ---------------------------------------------------------------------------

export interface PushDevice {
  id: string;
  label: string;
  createdAt: number;
  updatedAt: number;
}

const DEVICE_ID_KEY = 'lifeos.push.device.v1';
const devicesCollection = () => collection(db, 'vyro', 'owner', 'devices');

export type PushAvailability = 'ready' | 'not-configured' | 'emulator' | 'unsupported';

export async function pushAvailability(): Promise<PushAvailability> {
  if (useFirebaseEmulator) return 'emulator';
  if (!pushConfigured) return 'not-configured';
  try {
    return (await messagingSupported()) ? 'ready' : 'unsupported';
  } catch {
    return 'unsupported';
  }
}

/** A readable name for this device, e.g. "iPhone · Safari". */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${os} · ${browser}`;
}

async function hashId(token: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return [...bytes].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const pushError = (code: string, message: string) => Object.assign(new Error(message), { code });

/** Ask permission, register this device for push and save it so the sender can reach it. */
export async function enablePush(): Promise<void> {
  start();
  const availability = await pushAvailability();
  if (availability === 'emulator') throw pushError('push/emulator', 'Push needs a real Firebase project (it isn’t available with the emulators).');
  if (availability === 'not-configured') throw pushError('push/not-configured', 'Add your Web Push key to .env and deploy again (see README → Notifications).');
  if (availability === 'unsupported')
    throw pushError('push/unsupported', /iPhone|iPad/.test(navigator.userAgent) ? 'On iPhone and iPad, first add Vyro to your Home Screen (Share → Add to Home Screen), then open it from there.' : 'This browser doesn’t support push notifications.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw pushError('push/denied', 'Notifications are blocked for this site. Allow them in your browser or system settings, then try again.');
  const registration = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey: firebaseVapidKey, serviceWorkerRegistration: registration });
  if (!token) throw pushError('push/no-token', 'Couldn’t get a push address for this device. Try again.');
  const id = await hashId(token);
  const now = Date.now();
  await setDoc(doc(devicesCollection(), id), { id, token, label: deviceLabel(), createdAt: now, updatedAt: now });
  localStorage.setItem(DEVICE_ID_KEY, id);
  localStorage.setItem(PUSH_FLAG_KEY, 'true');
}

export async function disablePush(): Promise<void> {
  start();
  const id = localStorage.getItem(DEVICE_ID_KEY);
  try {
    await deleteToken(getMessaging(app));
  } catch {
    /* token already gone */
  }
  if (id) await deleteDoc(doc(devicesCollection(), id));
  localStorage.removeItem(DEVICE_ID_KEY);
  localStorage.removeItem(PUSH_FLAG_KEY);
}

export const thisDeviceId = () => localStorage.getItem(DEVICE_ID_KEY);

export function watchDevices(cb: (devices: PushDevice[]) => void): () => void {
  start();
  return onSnapshot(
    devicesCollection(),
    (snap) => cb(snap.docs.map((d) => d.data() as PushDevice).sort((a, b) => b.updatedAt - a.updatedAt)),
    () => cb([]),
  );
}

export async function removeDevice(id: string) {
  start();
  await deleteDoc(doc(devicesCollection(), id));
  if (id === localStorage.getItem(DEVICE_ID_KEY)) {
    localStorage.removeItem(DEVICE_ID_KEY);
    localStorage.removeItem(PUSH_FLAG_KEY);
  }
}

// ---------------------------------------------------------------------------
// Google Classroom / Calendar connection (see shared/imports.ts)
// ---------------------------------------------------------------------------

const linksDoc = (id: 'key' | 'state') => doc(db, 'vyro', 'owner', 'links', id);
const inboxCollection = () => collection(db, 'vyro', 'owner', 'inbox');

/** What the Google sync script last sent, one document per account and source. */
export function watchInbox(cb: (docs: unknown[]) => void): () => void {
  start();
  return onSnapshot(
    inboxCollection(),
    (snap) => cb(snap.docs.map((d) => d.data())),
    () => cb([]),
  );
}

export function watchSyncKey(cb: (key: string | null) => void): () => void {
  start();
  return onSnapshot(
    linksDoc('key'),
    (snap) => cb(snap.exists() ? ((snap.data().key as string) ?? null) : null),
    () => cb(null),
  );
}

/** A new random sync key. Scripts holding an older key stop working. */
export async function createSyncKey(): Promise<string> {
  start();
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const key = [...crypto.getRandomValues(new Uint8Array(48))].map((b) => alphabet[b % alphabet.length]).join('');
  await setDoc(linksDoc('key'), { id: 'key', key, createdAt: Date.now() });
  return key;
}

export async function readImportState(): Promise<ImportState> {
  start();
  const snap = await getDoc(linksDoc('state'));
  return (snap.exists() ? (snap.data().imported as ImportState) : undefined) ?? {};
}

export async function writeImportState(imported: ImportState): Promise<void> {
  start();
  await setDoc(linksDoc('state'), { id: 'state', imported, updatedAt: Date.now() });
}

export async function removeInbox(id: string): Promise<void> {
  start();
  await deleteDoc(doc(inboxCollection(), id));
}
