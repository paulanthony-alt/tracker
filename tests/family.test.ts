import { describe, expect, it } from 'vitest';
import { memberEmail, memberOf, newEmailTag, normalizeUsername, usernameProblem } from '../src/lib/family';
import { OWNER_EMAIL } from '../src/lib/firebaseConfig';

describe('family accounts', () => {
  it('maps sign-in emails to whose space they open', () => {
    expect(memberOf(OWNER_EMAIL)).toBe('owner');
    expect(memberOf(memberEmail('sam', newEmailTag()))).toBe('sam');
    expect(memberOf('riley.k9x2@member.vyro.example.com')).toBe('riley');
    // Lookalikes and other addresses open nothing.
    expect(memberOf('sam@member.vyro.example.com')).toBeNull();
    expect(memberOf('sam.a1@member.vyro.example.com.evil.io')).toBeNull();
    expect(memberOf('sam.a1@membervvyro.example.com')).toBeNull();
    expect(memberOf('someone@gmail.com')).toBeNull();
    expect(memberOf(undefined)).toBeNull();
  });

  it('checks usernames', () => {
    expect(normalizeUsername('  Sam ')).toBe('sam');
    for (const ok of ['sam', 'jordan', 'riley', 'alex2']) expect(usernameProblem(ok)).toBeNull();
    for (const bad of ['', 'e', 'Sam', 'sam smith', '2sam', 'owner', 'sam.k', 'x'.repeat(21)]) expect(usernameProblem(bad)).not.toBeNull();
  });

  it('makes a different sign-in email every time (so resets get a fresh account)', () => {
    const a = memberEmail('jordan', newEmailTag());
    const b = memberEmail('jordan', newEmailTag());
    expect(a).not.toBe(b);
    expect(memberOf(a)).toBe('jordan');
  });
});
