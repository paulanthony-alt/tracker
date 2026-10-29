/**
 * Family accounts: who is signed in, and how usernames map to sign-in emails.
 * Pure helpers (no Firebase imports), shared by the app and the tests.
 *
 * The owner (whoever set Vyro up) signs in with OWNER_EMAIL and keeps their data
 * at vyro/owner. Everyone else is a member the owner added in Settings → Family:
 * their data is at vyro/{username}, and their sign-in email is
 * "{username}.{tag}@member.vyro.example.com". The tag changes whenever the owner
 * resets their password (which creates a fresh account), so it's looked up by
 * username in vyro-directory rather than guessed. These addresses never receive
 * mail; example.com is reserved for exactly this kind of use.
 */
import { OWNER_EMAIL } from './firebaseConfig';

export const MEMBER_EMAIL_DOMAIN = 'member.vyro.example.com';
export const OWNER_MEMBER = 'owner';

const USERNAME = /^[a-z][a-z0-9]{1,19}$/;

export const normalizeUsername = (s: string) => s.trim().toLowerCase();

/** Why a username can't be used, or null if it's fine. */
export function usernameProblem(username: string): string | null {
  if (!username) return 'Enter a username.';
  if (!USERNAME.test(username)) return 'Usernames are 2–20 letters or numbers, starting with a letter (no spaces).';
  if (username === OWNER_MEMBER) return 'That username is reserved. Pick another.';
  return null;
}

export const memberEmail = (username: string, tag: string) => `${username}.${tag}@${MEMBER_EMAIL_DOMAIN}`;

/** Whose space a signed-in email opens: "owner", a username, or null if it isn't a Vyro account. */
export function memberOf(email: string | null | undefined): string | null {
  if (!email) return null;
  if (email === OWNER_EMAIL) return OWNER_MEMBER;
  const m = new RegExp(`^([a-z][a-z0-9]{1,19})\\.[a-z0-9]+@${MEMBER_EMAIL_DOMAIN.replace(/\./g, '\\.')}$`).exec(email);
  return m ? m[1] : null;
}

/** A short random tag for a member's sign-in email. */
export const newEmailTag = () => Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');
