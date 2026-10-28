import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Bot, ClipboardList, Eye, KeyRound, Lock, RotateCcw, Sparkles, Square, Wand2 } from 'lucide-react';
import { useStore, type AppState } from '@/lib/store';
import { useToday } from '@/lib/useToday';
import { addDaysISO, formatLong, formatRelativeDay, formatTime, weekStartISO } from '@/lib/dates';
import { buildAiContext, buildAlerts, eventsInRange, priorityContext, todayCompletion, weekSummary } from '@/lib/insights';
import { rankTasks } from '@/lib/priority';
import { currentStreak, isDoneOn } from '@/lib/habits';
import { dailyHabits } from '@/lib/insights';
import { currentGpa, fmtGpa } from '@/lib/grades';
import { nextMilestone } from '@/lib/progress';
import { cn } from '@/lib/util';
import { Badge, Button, Card, PageHeader } from '@/components/ui/primitives';
import { Markdown } from '@/components/Markdown';

const dueWhen = (date: string, today: string) => {
  const rel = formatRelativeDay(date, today);
  return rel === 'Today' || rel === 'Tomorrow' ? rel.toLowerCase() : date < today ? `was due ${rel}` : `due ${rel}`;
};

/** A rule-based briefing that needs no AI: computed directly from your data. */
function localBriefing(s: AppState, today: string): string {
  const out: string[] = [];
  const c = todayCompletion(s, today);
  const ranked = rankTasks(s.tasks, priorityContext(s, today));
  const events = eventsInRange(s.events, today, today);
  const alerts = buildAlerts(s, today);
  out.push(`## ${formatLong(today)}`);
  out.push(
    c.total
      ? `You’ve finished **${c.done} of ${c.total}** things on today’s list (${Math.round(c.pct ?? 0)}%).`
      : 'Nothing is scheduled or due today yet.',
  );
  if (events.length) {
    out.push('', '### Schedule');
    for (const o of events) out.push(`- ${o.event.startTime ? `**${formatTime(o.event.startTime)}**` : 'All day'} — ${o.event.title}`);
  }
  if (ranked.length) {
    out.push('', '### Do these first');
    for (const { task, p } of ranked.slice(0, 5)) out.push(`- **${task.title}**${p.reasons.length ? ` — ${p.reasons.join(', ')}` : ''}`);
  }
  const critical = alerts.filter((a) => a.level !== 'info');
  if (critical.length) {
    out.push('', '### Needs attention');
    for (const a of critical.slice(0, 5)) out.push(`- ${a.title}${a.detail ? ` (${a.detail})` : ''}`);
  }
  const habits = dailyHabits(s.habits, today).filter((h) => !isDoneOn(h, today));
  if (habits.length) {
    out.push('', '### Habits left today');
    for (const h of habits) {
      const st = currentStreak(h, today, s.settings.weekStartsOn);
      out.push(`- ${h.icon ?? ''} ${h.name}${st ? ` — ${st}-day streak on the line` : ''}`);
    }
  }
  const projects = s.projects.filter((p) => !p.archived && p.status === 'active');
  if (projects.length) {
    out.push('', '### Business');
    for (const p of projects) {
      const next = s.tasks.filter((t) => t.projectId === p.id && t.status !== 'done' && !t.archived).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))[0];
      const ms = nextMilestone(p);
      out.push(`- **${p.name}** — next: ${next?.title ?? p.nextAction ?? 'no next action set'}${ms?.dueDate ? `; milestone “${ms.title}” ${dueWhen(ms.dueDate, today)}` : ''}`);
    }
  }
  const gpa = currentGpa(s.classes.filter((c) => !c.archived), s.tasks, s.settings.markingPeriods, s.settings.gpaScale);
  if (gpa.gpa !== null) out.push('', `Current GPA: **${fmtGpa(gpa.gpa)}**${s.settings.gpaGoal ? ` (goal ${s.settings.gpaGoal.toFixed(2)})` : ''}.`);
  const week = weekSummary(s, weekStartISO(today, s.settings.weekStartsOn));
  out.push('', `This week: ${week.completed.length} tasks completed, ${week.unfinished.length} still open${week.habitRate !== null ? `, ${Math.round(week.habitRate * 100)}% habit completion` : ''}.`);
  return out.join('\n');
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

const SUGGESTIONS = [
  { label: 'Plan my day', prompt: 'Plan my day. Build a realistic hour-by-hour schedule around my fixed events, starting from now, with the most important work first and short breaks.' },
  { label: 'What should I prioritize?', prompt: 'What should I prioritize right now and why? Give me the top 5 with a one-line reason each, and call out anything that will hurt my grades or business if I ignore it.' },
  { label: 'Summarize my week', prompt: 'Summarize my week so far: what I got done, what is slipping, and the 3 most important things for the rest of the week.' },
  { label: 'Weekly review', prompt: 'Run a weekly review with me: accomplishments, unfinished tasks and what to do with them, habit consistency, and suggested priorities for next week.' },
  { label: 'Raise my grades', prompt: 'Looking at my classes and assignments, where can I gain the most grade points in the next two weeks? Be specific.' },
];

const STORAGE_KEY = 'lifeos.assistant.chat';

export function AssistantPage() {
  const s = useStore();
  const today = useToday();
  const mode = s.storageMode;
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(mode === 'server' ? null : false);
  const [model, setModel] = useState('');
  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]');
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const briefing = useMemo(() => localBriefing(s, today), [s, today]);
  const context = useMemo(() => buildAiContext(s, today), [s, today]);

  useEffect(() => {
    if (mode !== 'server') return;
    fetch('api/ai/status')
      .then((r) => r.json())
      .then((d) => {
        setAiEnabled(!!d.enabled);
        setModel(d.model ?? '');
      })
      .catch(() => setAiEnabled(false));
  }, [mode]);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      /* ignore */
    }
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const history = [...messages.filter((m) => !m.error), { role: 'user' as const, content }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const now = new Date();
    try {
      const res = await fetch('api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.slice(-20).map((m) => ({ role: m.role, content: m.content.slice(0, 8000) })),
          context: context.slice(0, 80_000),
          today: `${formatLong(today)}, ${now.getFullYear()} — local time ${formatTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)}`,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Request failed (HTTP ${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.replace(/^data: /, '');
          if (!line) continue;
          const evt = JSON.parse(line) as { type: string; text?: string; message?: string };
          if (evt.type === 'text') {
            acc += evt.text;
            setMessages((m) => [...m.slice(0, -1), { role: 'assistant', content: acc }]);
          } else if (evt.type === 'error') throw new Error(evt.message);
          else if (evt.type === 'notice') acc += `\n\n_${evt.message}_`;
        }
      }
      if (!acc) throw new Error('The assistant returned an empty response.');
    } catch (err) {
      if (ctrl.signal.aborted) {
        setMessages((m) => (m[m.length - 1]?.content ? m : m.slice(0, -1)));
      } else {
        setMessages((m) => [...m.slice(0, -1), { role: 'assistant', content: err instanceof Error ? err.message : 'Something went wrong.', error: true }]);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  return (
    <div>
      <PageHeader
        title="Assistant"
        subtitle="Summaries, day planning and priority suggestions from your own data."
        actions={
          aiEnabled ? (
            <Badge tone="good">
              <Sparkles size={11} /> AI connected{model ? ` · ${model}` : ''}
            </Badge>
          ) : aiEnabled === false ? (
            <Badge tone="neutral">
              <Lock size={11} /> AI not configured
            </Badge>
          ) : undefined
        }
      />
      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          {aiEnabled ? (
            <div className="card flex h-[calc(100vh-220px)] min-h-[480px] flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
                {messages.length === 0 && (
                  <div className="py-8 text-center">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-accent/12 text-accent">
                      <Bot size={20} />
                    </div>
                    <p className="mt-3 text-sm font-medium">Ask about your day, week, grades or projects</p>
                    <p className="mx-auto mt-1 max-w-sm text-xs text-faint">The assistant reads a snapshot of your dashboard each time you ask. It can’t change your data — it tells you what to do.</p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      {SUGGESTIONS.map((sg) => (
                        <Button key={sg.label} size="sm" onClick={() => void send(sg.prompt)}>
                          {sg.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[88%] rounded-2xl px-4 py-2.5', m.role === 'user' ? 'bg-accent/15 text-[14px]' : m.error ? 'border border-bad/30 bg-bad/10 text-[13px] text-bad' : 'bg-surface-2')}>
                      {m.role === 'assistant' && !m.error ? (
                        m.content ? (
                          <Markdown source={m.content} />
                        ) : (
                          <span className="inline-flex gap-1 py-1">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-faint" />
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-faint [animation-delay:150ms]" />
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-faint [animation-delay:300ms]" />
                          </span>
                        )
                      ) : (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <form
                className="flex items-end gap-2 border-t border-line p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(input);
                }}
              >
                {messages.length > 0 && (
                  <Button variant="ghost" size="md" className="!px-2" title="New conversation" aria-label="New conversation" onClick={() => setMessages([])} disabled={busy}>
                    <RotateCcw size={16} />
                  </Button>
                )}
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  rows={1}
                  placeholder="Ask anything about your schedule, tasks, grades…"
                  className="input max-h-40 min-h-9 flex-1 resize-none"
                  aria-label="Message"
                  maxLength={8000}
                />
                {busy ? (
                  <Button variant="secondary" size="md" className="!px-2.5" aria-label="Stop" onClick={() => abortRef.current?.abort()}>
                    <Square size={14} fill="currentColor" />
                  </Button>
                ) : (
                  <Button type="submit" variant="primary" size="md" className="!px-2.5" aria-label="Send" disabled={!input.trim()}>
                    <ArrowUp size={16} />
                  </Button>
                )}
              </form>
            </div>
          ) : (
            <Card title="AI assistant" icon={<KeyRound size={15} />}>
              <p className="text-[13.5px] leading-relaxed text-muted">
                The conversational assistant needs an <span className="font-medium text-fg">Anthropic API key</span>. The key stays on the server — it’s never sent to the browser.
              </p>
              {mode === 'firebase' ? (
                <p className="mt-3 rounded-xl border border-line bg-surface-2 p-3 text-xs leading-relaxed text-muted">
                  On Firebase, keeping the key secret requires Cloud Functions, which only run on the paid Blaze plan. To use the chat for free, run Vyro on your computer with <code className="rounded bg-surface-3 px-1">npm start</code> and an API key in <code className="rounded bg-surface-3 px-1">.env</code>.
                </p>
              ) : mode === 'local' ? (
                <p className="mt-3 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs leading-relaxed text-warn">
                  You’re running Vyro without its server, so AI isn’t available. Start it with <code className="rounded bg-surface-3 px-1">npm start</code> to enable the database and the assistant.
                </p>
              ) : (
                <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13px] text-muted">
                  <li>
                    Create an API key at <span className="text-fg">console.anthropic.com</span>.
                  </li>
                  <li>
                    Copy <code className="rounded bg-surface-3 px-1 text-xs">.env.example</code> to <code className="rounded bg-surface-3 px-1 text-xs">.env</code> in the project folder.
                  </li>
                  <li>
                    Set <code className="rounded bg-surface-3 px-1 text-xs">ANTHROPIC_API_KEY=sk-ant-…</code> and restart the server.
                  </li>
                </ol>
              )}
              <p className="mt-4 text-xs text-faint">Everything else in Vyro — prioritization, alerts, the briefing on the right, auto-planning your day and weekly reviews — works without AI.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href="#/habits?tab=plan">
                  <Button size="sm" icon={<Wand2 size={14} />}>
                    Auto-plan my day
                  </Button>
                </a>
                <a href="#/habits?tab=review">
                  <Button size="sm" icon={<ClipboardList size={14} />}>
                    Weekly review
                  </Button>
                </a>
              </div>
            </Card>
          )}
          {aiEnabled && (
            <div className="mt-3 text-xs text-faint">
              <button type="button" className="inline-flex items-center gap-1 hover:text-fg" onClick={() => setShowContext((v) => !v)}>
                <Eye size={12} /> {showContext ? 'Hide' : 'Show'} exactly what is sent
              </button>
              <span> · When you send a message, this snapshot of your data is sent to Anthropic’s API to generate the answer.</span>
              {showContext && <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-surface p-3 font-mono text-[11px] text-muted">{context}</pre>}
            </div>
          )}
        </div>
        <Card title="Daily briefing" icon={<Sparkles size={15} />} subtitle="Calculated from your data — no AI needed" className="h-fit xl:col-span-2">
          <Markdown source={briefing} />
          <p className="mt-4 border-t border-line pt-3 text-[11px] text-faint">Upcoming: {eventsInRange(s.events, addDaysISO(today, 1), addDaysISO(today, 7)).length} events in the next 7 days.</p>
        </Card>
      </div>
    </div>
  );
}
