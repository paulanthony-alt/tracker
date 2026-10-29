/**
 * Firebase backend: username + password sign-in and Firestore storage with live
 * sync between devices and an offline cache.
 *
 * Each person has a private space: vyro/{member}/{collection}/{recordId}, where
 * member is "owner" for whoever set Vyro up and the username for everyone they
 * added in Settings → Family (see ./family.ts and firestore.rules). The owner's
 * path doesn't depend on the account's uid, so if they ever reset their account
 * (delete it in the Firebase console and set it up again), their data is still there.
 */
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { deleteToken, getMessaging, getToken, isSupported as messagingSupported } from 'firebase/messaging';
import {
  EmailAuthProvider,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
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
import { memberEmail, memberOf, newEmailTag, normalizeUsername, OWNER_MEMBER, usernameProblem } from './family';

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

/** Whose space the signed-in account opens: "owner" or their username. */
export function currentMember(): string {
  start();
  const member = memberOf(auth.currentUser?.email);
  if (!member) throw Object.assign(new Error('This account isn’t a Vyro account. Sign out and sign in with your username.'), { code: 'vyro/not-a-member' });
  return member;
}
export function isOwnerAccount(): boolean {
  start();
  return memberOf(auth.currentUser?.email) === OWNER_MEMBER;
}

const memberCollection = (name: string) => collection(db, 'vyro', currentMember(), name);
const ownerFamily = () => collection(db, 'vyro', OWNER_MEMBER, 'family');
const directoryDoc = (name: string) => doc(db, 'vyro-directory', name);

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
      return 'Vyro is already set up. Sign in with your username and password instead.';
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

const vyroError = (code: string, message: string) => Object.assign(new Error(message), { code });

function checkUsername(raw: string): string {
  const username = normalizeUsername(raw);
  const problem = usernameProblem(username);
  if (problem) throw vyroError('vyro/bad-username', problem);
  return username;
}

async function readDirectory(name: string): Promise<{ email?: string; username?: string } | null> {
  const snap = await getDoc(directoryDoc(name));
  return snap.exists() ? (snap.data() as { email?: string; username?: string }) : null;
}

/** The owner's username, or null if they haven't chosen one yet (set-ups from before family accounts). */
export async function ownerUsername(): Promise<string | null> {
  start();
  return (await readDirectory('_owner'))?.username ?? null;
}

export async function signIn(rawUsername: string, password: string) {
  start();
  const username = checkUsername(rawUsername);
  const entry = await readDirectory(username);
  if (entry?.email) {
    await signInWithEmailAndPassword(auth, entry.email, password);
    return;
  }
  if (await ownerUsername()) throw vyroError('vyro/unknown-username', `There’s no Vyro account called “${username}”. Check the spelling.`);
  // Vyro was set up before usernames existed: this is the owner, and the name they typed becomes theirs.
  await signInWithEmailAndPassword(auth, OWNER_EMAIL, password);
  await claimUsername(username);
}

/** First-time setup: creates the owner's account and claims their username. */
export async function createAccount(rawUsername: string, password: string) {
  start();
  const username = checkUsername(rawUsername);
  const taken = await readDirectory(username);
  if (taken?.email && taken.email !== OWNER_EMAIL) throw vyroError('vyro/username-taken', `“${username}” is already someone else’s username. Pick another.`);
  await createUserWithEmailAndPassword(auth, OWNER_EMAIL, password);
  await claimUsername(username);
}

/** Owner only: set or change the owner's own username. */
export async function claimUsername(rawUsername: string) {
  start();
  const username = checkUsername(rawUsername);
  const taken = await readDirectory(username);
  if (taken?.email && taken.email !== OWNER_EMAIL) throw vyroError('vyro/username-taken', `“${username}” is already someone else’s username. Pick another.`);
  const previous = await ownerUsername();
  const batch = writeBatch(db);
  if (previous && previous !== username) batch.delete(directoryDoc(previous));
  batch.set(directoryDoc(username), { id: username, email: OWNER_EMAIL });
  batch.set(directoryDoc('_owner'), { id: '_owner', username });
  await batch.commit();
}

export async function changePassword(current: string, next: string) {
  start();
  const user = auth.currentUser;
  if (!user?.email) throw Object.assign(new Error('Not signed in'), { code: 'auth/requires-recent-login' });
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
  await updatePassword(user, next);
}

// ---------------------------------------------------------------------------
// Family (owner only)
// ---------------------------------------------------------------------------

export interface FamilyMember {
  id: string;
  username: string;
  name: string;
  uid: string;
  email: string;
  createdAt: number;
  updatedAt: number;
}

export function watchFamily(cb: (members: FamilyMember[]) => void): () => void {
  start();
  return onSnapshot(
    ownerFamily(),
    (snap) => cb(snap.docs.map((d) => d.data() as FamilyMember).sort((a, b) => a.createdAt - b.createdAt)),
    () => cb([]),
  );
}

/**
 * Create a sign-in account for someone else without signing the owner out:
 * a throwaway second Firebase app does the sign-up, then is discarded.
 */
async function createMemberLogin(email: string, password: string): Promise<string> {
  const helper = initializeApp(firebaseConfig, `vyro-family-${Date.now()}`);
  const helperAuth = initializeAuth(helper, { persistence: inMemoryPersistence });
  if (useFirebaseEmulator) connectAuthEmulator(helperAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  try {
    const cred = await createUserWithEmailAndPassword(helperAuth, email, password);
    return cred.user.uid;
  } finally {
    await signOut(helperAuth).catch(() => undefined);
    await deleteApp(helper).catch(() => undefined);
  }
}

/** Point a username at a fresh sign-in account (used when adding someone and when resetting their password). */
async function bindMember(username: string, name: string, password: string, createdAt?: number) {
  const email = memberEmail(username, newEmailTag());
  const uid = await createMemberLogin(email, password);
  const now = Date.now();
  const batch = writeBatch(db);
  batch.set(doc(ownerFamily(), username), { id: username, username, name, uid, email, createdAt: createdAt ?? now, updatedAt: now } satisfies FamilyMember);
  batch.set(directoryDoc(username), { id: username, email });
  await batch.commit();
}

export async function addFamilyMember(name: string, rawUsername: string, password: string) {
  start();
  const username = checkUsername(rawUsername);
  if (await readDirectory(username)) throw vyroError('vyro/username-taken', `“${username}” is already taken. Pick another username.`);
  await bindMember(username, name.trim() || username, password);
}

/**
 * Give a member a new password when they've forgotten theirs. Passwords can't be
 * changed for someone else from the browser, so this makes them a fresh sign-in
 * account and points their username (and their data) at it. Devices they were
 * signed in on will ask them to sign in again.
 */
export async function resetFamilyPassword(member: FamilyMember, password: string) {
  start();
  await bindMember(member.username, member.name, password, member.createdAt);
}

/** Remove someone's access. Their data stays in the database but nobody can open it. */
export async function removeFamilyMember(member: FamilyMember) {
  start();
  const batch = writeBatch(db);
  batch.delete(doc(ownerFamily(), member.username));
  batch.delete(directoryDoc(member.username));
  await batch.commit();
}

let signingOut = false;
/** True while signing out; the page reloads right after, so the UI shouldn't react to it. */
export const isSigningOut = () => signingOut;

/** Sign out and remove the offline copy of your data from this device. */
export async function signOutUser() {
  start();
  signingOut = true;
  // Stop this device getting this person's reminders, in case someone else signs in on it next.
  await disablePush().catch(() => undefined);
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
export function subscribeAll(onChange: (c: RemoteChange) => void, onError: (message: string, code?: string) => void): { initial: Promise<DataSnapshot>; stop: () => void } {
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
        memberCollection(name),
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
          const msg = err.code === 'permission-denied' ? 'Vyro couldn’t open your data. If your password was just changed, sign out and sign in again. (If you set up Vyro: check that firestore.rules is deployed.)' : err.message;
          if (pending.size) reject(new Error(msg));
          else onError(msg, err.code);
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
      const ref = doc(memberCollection(op.collection as CollectionName), op.id);
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
    const existing = await getDocs(memberCollection(name));
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
const devicesCollection = () => memberCollection('devices');

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

const linksDoc = (id: 'key' | 'state') => doc(memberCollection('links'), id);
const inboxCollection = () => memberCollection('inbox');

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
