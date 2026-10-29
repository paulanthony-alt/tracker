import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import type { User } from 'firebase/auth';
import { MIN_PASSWORD_LENGTH, OWNER_EMAIL } from '@/lib/firebaseConfig';
import { BootScreen, BrandMark } from './BrandMark';
import { Button } from './ui/primitives';

const loadFirebase = () => import('@/lib/firebase');

function PasswordInput({ id, value, onChange, placeholder, autoComplete, autoFocus }: { id: string; value: string; onChange: (v: string) => void; placeholder: string; autoComplete: string; autoFocus?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        className="input !h-11 pr-11 text-[15px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-label={placeholder}
      />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-md text-faint hover:text-fg" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

const LAST_USERNAME_KEY = 'vyro.lastUsername';
const readLastUsername = () => {
  try {
    return localStorage.getItem(LAST_USERNAME_KEY) ?? '';
  } catch {
    return '';
  }
};

export function LoginScreen() {
  const [mode, setMode] = useState<'signin' | 'create'>('signin');
  const [username, setUsername] = useState(readLastUsername);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** The owner's username; null if usernames haven't been set up yet (new, or set up before family accounts). */
  const [ownerName, setOwnerName] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    void loadFirebase()
      .then((fb) => fb.ownerUsername())
      .then(setOwnerName)
      .catch(() => setOwnerName(null));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim()) return setError('Enter your username.');
    if (!password) return setError('Enter your password.');
    if (mode === 'create') {
      if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      if (password !== confirm) return setError('The two passwords don’t match.');
    }
    setBusy(true);
    try {
      const fb = await loadFirebase();
      if (mode === 'create') await fb.createAccount(username, password);
      else await fb.signIn(username, password);
      try {
        localStorage.setItem(LAST_USERNAME_KEY, username.trim().toLowerCase());
      } catch {
        /* not remembered; that's fine */
      }
      // The auth watcher swaps this screen for the app.
    } catch (err) {
      const fb = await loadFirebase();
      setError(fb.authErrorMessage(err));
      setBusy(false);
    }
  };

  const firstRun = ownerName === null;
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="relative mb-6">
            <div className="absolute -inset-10 rounded-full bg-accent/25 blur-3xl" aria-hidden />
            <BrandMark full className="relative h-24 w-24 rounded-[22px] shadow-pop" />
          </div>
          <p className="eyebrow mb-2 flex items-center gap-2 text-accent/90">
            <span className="led text-accent" aria-hidden />
            {mode === 'create' ? 'First-time setup' : 'Secure access'}
          </p>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">{mode === 'create' ? 'Set up Vyro' : 'Welcome back'}</h1>
          <p className="mt-1.5 text-[13px] text-muted">
            {mode === 'create' ? 'Choose a username and password. They unlock Vyro on all your devices.' : 'Sign in with your username and password.'}
          </p>
        </div>
        <form onSubmit={submit} className="card hud space-y-3 p-5" noValidate>
          <input
            id="username"
            name="username"
            className="input !h-11 text-[15px]"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            aria-label="Username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus={!username}
          />
          <PasswordInput id="password" value={password} onChange={setPassword} placeholder={mode === 'create' ? 'New password' : 'Password'} autoComplete={mode === 'create' ? 'new-password' : 'current-password'} autoFocus={!!username} />
          {mode === 'create' && <PasswordInput id="password-confirm" value={confirm} onChange={setConfirm} placeholder="Confirm password" autoComplete="new-password" />}
          {mode === 'create' && <p className="text-xs text-faint">Username: letters and numbers, like “alex”. Password: at least {MIN_PASSWORD_LENGTH} characters.</p>}
          {mode === 'signin' && firstRun && <p className="text-xs leading-relaxed text-faint">First sign-in since usernames were added? Type the username you’d like (for example your first name). It’s saved as yours.</p>}
          {error && (
            <p role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-[13px] text-bad">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" className="!h-10 w-full" disabled={busy} icon={busy ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}>
            {mode === 'create' ? 'Create account' : 'Unlock'}
          </Button>
        </form>
        <div className="mt-4 text-center text-xs text-faint">
          {mode === 'create' ? (
            <button type="button" className="hover:text-fg" onClick={() => (setMode('signin'), setError(''), setConfirm(''))}>
              Already set up? Sign in instead
            </button>
          ) : (
            firstRun && (
              <button type="button" className="hover:text-fg" onClick={() => (setMode('create'), setError(''))}>
                First time here? Set up Vyro
              </button>
            )
          )}
        </div>
        {mode === 'signin' && (
          <details className="mx-auto mt-5 max-w-xs text-center text-xs text-faint">
            <summary className="cursor-pointer hover:text-fg">Forgot your password?</summary>
            <p className="mt-2 leading-relaxed">Ask the person who set up Vyro for your family. They can give you a new one in Settings → Family.</p>
            <p className="mt-2 leading-relaxed">
              If that’s you: in the Firebase console, open Authentication → Users and delete <span className="font-mono">{OWNER_EMAIL}</span>, then{' '}
              <button type="button" className="text-accent hover:underline" onClick={() => (setMode('create'), setError(''))}>
                set up Vyro again
              </button>{' '}
              with your username. Your data is kept.
            </p>
          </details>
        )}
      </div>
    </div>
  );
}

/** Shows the password screen until signed in, then renders the app. */
export function FirebaseGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | 'loading'>('loading');
  const [error, setError] = useState('');
  const unsub = useRef<() => void>(undefined);
  useEffect(() => {
    let cancelled = false;
    loadFirebase()
      .then((fb) => {
        if (cancelled) return;
        unsub.current = fb.watchAuth((u) => {
          // Sign-out reloads the page; don't flash the password screen first.
          if (!u && fb.isSigningOut()) return;
          setUser(u);
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load Firebase.'));
    return () => {
      cancelled = true;
      unsub.current?.();
    };
  }, []);

  if (error)
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-[13px] text-bad">
        Couldn’t start Firebase: {error}
      </div>
    );
  if (user === 'loading')
    return (
      <BootScreen />
    );
  if (!user) return <LoginScreen />;
  return <>{children}</>;
}
