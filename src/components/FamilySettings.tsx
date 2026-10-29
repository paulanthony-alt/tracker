import { useEffect, useState } from 'react';
import { KeyRound, Trash2, UserPlus, Users } from 'lucide-react';
import type { FamilyMember } from '@/lib/firebase';
import { MIN_PASSWORD_LENGTH } from '@/lib/firebaseConfig';
import { normalizeUsername, usernameProblem } from '@/lib/family';
import { toast } from '@/lib/toast';
import { Badge, Button, Card, IconButton } from './ui/primitives';
import { Modal, confirmAction } from './ui/Modal';

const loadFirebase = () => import('@/lib/firebase');
const errorText = async (err: unknown) => (await loadFirebase()).authErrorMessage(err);

function passwordProblem(pw: string, confirm: string) {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (pw !== confirm) return 'The two passwords don’t match.';
  return null;
}

/** The owner's own username. Set-ups from before family accounts don't have one yet. */
function OwnerUsername({ value, onSaved }: { value: string | null; onSaved: (u: string) => void }) {
  const [draft, setDraft] = useState(value ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(value ?? ''), [value]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = normalizeUsername(draft);
    const problem = usernameProblem(u);
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    try {
      await (await loadFirebase()).claimUsername(u);
      onSaved(u);
      toast.success(`You now sign in as “${u}”`);
    } catch (err) {
      setError(await errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="rounded-lg border border-line bg-surface-2/50 p-3" noValidate>
      <p className="eyebrow mb-2">Your username</p>
      <div className="flex gap-2">
        <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. alex" aria-label="Your username" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        <Button type="submit" disabled={busy || normalizeUsername(draft) === value}>
          {value ? 'Change' : 'Save'}
        </Button>
      </div>
      {error ? <p className="mt-1.5 text-xs text-bad">{error}</p> : <p className="mt-1.5 text-xs text-faint">{value ? 'You sign in with this and your password.' : 'Choose your username first. You’ll sign in with it from now on.'}</p>}
    </form>
  );
}

function AddMember({ disabled }: { disabled: boolean }) {
  const [form, setForm] = useState({ name: '', username: '', password: '', confirm: '' });
  const [touchedUsername, setTouchedUsername] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<{ name: string; username: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const username = normalizeUsername(form.username);
    const problem = (!form.name.trim() && 'Enter their name.') || usernameProblem(username) || passwordProblem(form.password, form.confirm);
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    try {
      await (await loadFirebase()).addFamilyMember(form.name, username, form.password);
      setAdded({ name: form.name.trim(), username });
      setForm({ name: '', username: '', password: '', confirm: '' });
      setTouchedUsername(false);
    } catch (err) {
      setError(await errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2" noValidate>
      <p className="eyebrow">Add someone</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className="input"
          placeholder="Name (e.g. Sam)"
          aria-label="Name"
          value={form.name}
          disabled={disabled || busy}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, username: touchedUsername ? f.username : e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') }))}
        />
        <input
          className="input"
          placeholder="Username (e.g. sam)"
          aria-label="Username"
          value={form.username}
          disabled={disabled || busy}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => (setTouchedUsername(true), setForm((f) => ({ ...f, username: e.target.value })))}
        />
        <input className="input" type="password" placeholder="Starting password" aria-label="Starting password" autoComplete="new-password" value={form.password} disabled={disabled || busy} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
        <input className="input" type="password" placeholder="Confirm password" aria-label="Confirm starting password" autoComplete="new-password" value={form.confirm} disabled={disabled || busy} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} />
      </div>
      {error && (
        <p role="alert" className="text-xs text-bad">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" size="sm" icon={<UserPlus size={14} />} disabled={busy || disabled}>
        {busy ? 'Adding…' : 'Add to family'}
      </Button>
      {added && (
        <p className="rounded-lg border border-good/25 bg-good/[0.07] px-3 py-2 text-[13px] leading-relaxed text-muted">
          <b className="text-fg">{added.name}</b> can now open {location.host} and sign in as <b className="font-mono text-fg">{added.username}</b> with the password you chose. They can change it in their own Settings.
        </p>
      )}
    </form>
  );
}

function ResetPassword({ member, onClose }: { member: FamilyMember; onClose: () => void }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(pw, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await (await loadFirebase()).resetFamilyPassword(member, pw);
      toast.success(`${member.name} can sign in with the new password`);
      onClose();
    } catch (err) {
      setError(await errorText(err));
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} width="sm" title={`New password for ${member.name}`} description="Use this if they’ve forgotten theirs. Their data stays exactly as it is.">
      <form onSubmit={submit} className="space-y-2 p-5" noValidate>
        <input className="input" type="password" placeholder="New password" aria-label="New password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        <input className="input" type="password" placeholder="Confirm new password" aria-label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <p className="text-xs text-faint">Devices they’re signed in on will ask them to sign in again.</p>
        {error && (
          <p role="alert" className="text-xs text-bad">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Set password'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Settings → Family. Only the owner sees this. */
export function FamilySettings() {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [ownerName, setOwnerName] = useState<string | null | undefined>(undefined);
  const [resetting, setResetting] = useState<FamilyMember | null>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void loadFirebase().then(async (fb) => {
      if (cancelled) return;
      stop = fb.watchFamily(setMembers);
      setOwnerName(await fb.ownerUsername().catch(() => null));
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <Card title="Family" icon={<Users size={15} />} subtitle="A private Vyro for each person">
      <p className="mb-4 text-[13px] leading-relaxed text-muted">
        Everyone you add gets their own Vyro on this same website: their own dashboard, school, habits, reminders and Google connection. Nobody can see anyone else’s, and that includes you.
      </p>
      <div className="space-y-4">
        {ownerName !== undefined && <OwnerUsername value={ownerName} onSaved={setOwnerName} />}

        {members.length > 0 && (
          <div className="divide-y divide-line/70 rounded-lg border border-line">
            {members.map((m) => (
              <div key={m.username} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/12 text-[13px] font-semibold text-accent">{m.name.slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{m.name}</p>
                  <p className="truncate font-mono text-[11px] text-faint">{m.username}</p>
                </div>
                <Badge tone="good">Active</Badge>
                <IconButton label={`New password for ${m.name}`} size="xs" onClick={() => setResetting(m)}>
                  <KeyRound size={13} />
                </IconButton>
                <IconButton
                  label={`Remove ${m.name}`}
                  size="xs"
                  onClick={async () => {
                    const ok = await confirmAction({
                      title: `Remove ${m.name}?`,
                      message: `${m.name} won’t be able to sign in any more. Their data stays saved but nobody can open it. Adding them again with the same username brings it back.`,
                      confirmLabel: 'Remove',
                      danger: true,
                    });
                    if (!ok) return;
                    try {
                      await (await loadFirebase()).removeFamilyMember(m);
                      toast.info(`${m.name} was removed`);
                    } catch (err) {
                      toast.error(await errorText(err));
                    }
                  }}
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>
            ))}
          </div>
        )}

        <AddMember disabled={!ownerName} />
        {!ownerName && ownerName !== undefined && <p className="text-xs text-faint">Save your username above first.</p>}
      </div>
      {resetting && <ResetPassword member={resetting} onClose={() => setResetting(null)} />}
    </Card>
  );
}
