import { useState } from 'react';
import { Database, FlaskConical, HardDrive, Sparkles, X } from 'lucide-react';
import { hasSampleData, useStore } from '@/lib/store';
import { buildSampleData } from '@/lib/sample';
import { todayISO } from '@/lib/dates';
import { toast } from '@/lib/toast';
import { Button, IconButton } from './ui/primitives';
import { Modal, confirmAction } from './ui/Modal';
import { Field } from './ui/Field';

export function loadSampleData() {
  const s = useStore.getState();
  const sample = buildSampleData(todayISO());
  s.addRecords(sample.data);
  const st = useStore.getState().settings;
  s.updateSettings({
    markingPeriods: st.markingPeriods.length ? st.markingPeriods : sample.markingPeriods,
    pastTerms: [...st.pastTerms.filter((p) => !p.id.startsWith('sample_')), ...sample.pastTerms],
    gpaGoal: st.gpaGoal ?? sample.gpaGoal,
  });
}

export async function removeSampleDataWithConfirm() {
  const ok = await confirmAction({
    title: 'Remove sample data?',
    message: 'All sample classes, assignments, projects, habits, goals, events and notes will be deleted. Anything you created yourself stays.',
    confirmLabel: 'Remove sample data',
  });
  if (!ok) return;
  useStore.getState().removeSampleData();
  toast.success('Sample data removed — it’s all yours now');
}

export function SampleBanner() {
  const has = useStore(hasSampleData);
  const [hidden, setHidden] = useState(false);
  if (!has || hidden) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/25 bg-accent/[0.07] px-4 py-3">
      <FlaskConical size={17} className="hidden shrink-0 text-accent sm:block" />
      <p className="min-w-[240px] flex-1 basis-[240px] text-[13px] text-muted">
        <span className="font-medium text-fg">You’re exploring sample data.</span> Every number shown is calculated from these example records, not your real life. Remove them when you’re ready to start.
      </p>
      <Button size="sm" onClick={() => void removeSampleDataWithConfirm()}>
        Remove sample data
      </Button>
      <IconButton label="Hide banner" size="xs" onClick={() => setHidden(true)}>
        <X size={14} />
      </IconButton>
    </div>
  );
}

export function Onboarding() {
  const onboarded = useStore((s) => s.settings.onboarded);
  const mode = useStore((s) => s.storageMode);
  const updateSettings = useStore((s) => s.updateSettings);
  const [name, setName] = useState('');
  if (onboarded) return null;

  const finish = (withSample: boolean) => {
    updateSettings({ name: name.trim().slice(0, 60), onboarded: true });
    if (withSample) {
      loadSampleData();
      toast.success('Sample data loaded — remove it anytime from the banner or Settings');
    }
  };

  return (
    <Modal open onClose={() => finish(false)} width="md">
      <div className="py-2">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/12 text-accent">
          <Sparkles size={20} />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">Welcome to Vyro</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">One place for school, side businesses, habits, goals, tasks and notes. Everything you enter once shows up wherever it belongs.</p>
        <Field label="What should we call you?" className="mt-5">
          <input
            className="input !h-10"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your first name"
            maxLength={60}
            data-autofocus
            onKeyDown={(e) => e.key === 'Enter' && finish(false)}
          />
        </Field>
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 p-3 text-xs leading-relaxed text-muted">
          {mode !== 'local' ? <Database size={15} className="mt-0.5 shrink-0 text-good" /> : <HardDrive size={15} className="mt-0.5 shrink-0 text-warn" />}
          {mode === 'firebase' ? (
            <span>Your data is saved to your own Firebase project and syncs to every device where you unlock Vyro with your password.</span>
          ) : mode === 'server' ? (
            <span>Your data is saved to a private SQLite database on this computer (the <code>data/</code> folder). Nothing is sent anywhere else.</span>
          ) : (
            <span>No server is running, so data is saved in this browser only. Run the app with <code>npm start</code> for database storage, and export backups from Settings.</span>
          )}
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button variant="primary" className="flex-1" onClick={() => finish(false)}>
            Start fresh
          </Button>
          <Button className="flex-1" icon={<FlaskConical size={15} />} onClick={() => finish(true)}>
            Explore with sample data
          </Button>
        </div>
        <p className="mt-3 text-center text-[11px] text-faint">Sample data is clearly labelled and can be removed in one click.</p>
      </div>
    </Modal>
  );
}
