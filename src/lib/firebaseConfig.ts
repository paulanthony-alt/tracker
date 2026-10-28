/**
 * Firebase settings, read from VITE_FIREBASE_* variables at build time.
 * This file has no Firebase imports, so builds without Firebase stay small;
 * the SDK itself is loaded on demand from ./firebase.ts.
 *
 * The web config (apiKey etc.) is not a secret — it only identifies your
 * project. Access is protected by your password and by firestore.rules.
 */
const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
};

/** Web Push certificate (Firebase console → Project settings → Cloud Messaging). Needed for push. */
export const firebaseVapidKey = env.VITE_FIREBASE_VAPID_KEY as string | undefined;
export const pushConfigured = Boolean(firebaseVapidKey && firebaseConfig.messagingSenderId);

export const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

/** Connect to the local Firebase emulators instead of the real project (for testing). */
export const useFirebaseEmulator = env.VITE_FIREBASE_USE_EMULATOR === 'true';

/**
 * The one account this app signs in with. You only ever type the password.
 * Must match the email in firestore.rules.
 */
export const OWNER_EMAIL = 'vyro-owner@example.com';

/** Minimum password length for the account (Firebase itself requires 6). */
export const MIN_PASSWORD_LENGTH = 8;
