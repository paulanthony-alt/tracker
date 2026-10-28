import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, Calculator, CalendarClock, GraduationCap, NotebookPen, Pencil, Plus, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import type { MarkingPeriod, SchoolClass, Task } from '@shared/schema';
import { useStore } from '@/lib/store';
import { openModal } from '@/lib/ui';
import { navigate, setQuery, useRoute } from '@/lib/router';
import { useToday } from '@/lib/useToday';
import { addDaysISO, daysBetween, formatRelativeDay, formatShort } from '@/lib/dates';
import {
  applyHypotheticals,
  computeAverage,
  cumulativeGpa,
  currentGpa,
  fmtGpa,
  fmtPct,
  gradeImpact,
  isGraded,
  letterGrade,
  overallAverage,
  periodFor,
  scoreNeeded,
  taskPercent,
  type HypotheticalGrade,
} from '@/lib/grades';
import { isOpen, rankTasks } from '@/lib/priority';
import { priorityContext } from '@/lib/insights';
import { uid } from '@/lib/id';
import { cn, optNum, plural } from '@/lib/util';
import { toast } from '@/lib/toast';
import { Badge, Button, Card, ColorDot, EmptyState, IconButton, PageHeader, ProgressBar, Stat, Tabs } from '@/components/ui/primitives';
import { confirmAction } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { TaskList } from '@/components/TaskItem';
import { NoteCard } from './Notes';

type Tab = 'overview' | 'assignments' | 'missing' | 'grades' | 'calculator' | 'planner' | 'notes';

export function SchoolPage() {
  const route = useRoute();
  if (route.path[1] === 'class' && route.path[2]) return <ClassDetail id={route.path[2]} />;
  return <SchoolHome />;
}

function useSchool() {
  const classes = useStore((s) => s.classes);
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const active = useMemo(() => classes.filter((c) => !c.archived), [classes]);
  const assignments = useMemo(() => tasks.filter((t) => t.classId && !t.archived), [tasks]);
  return { classes, active, tasks, assignments, settings, periods: settings.markingPeriods };
}

function SchoolHome() {
  const route = useRoute();
  const tab = (route.query.get('tab') as Tab) || 'overview';
  const { active, assignments } = useSchool();
  const today = useToday();
  const missing = assignments.filter((t) => isOpen(t) && t.dueDate && t.dueDate < today);

  const deepTask = route.query.get('task');
  useEffect(() => {
    if (deepTask) {
      openModal({ kind: 'task', id: deepTask });
      setQuery('task', null);
    }
  }, [deepTask]);

  return (
    <div>
      <PageHeader
        title="School"
        subtitle="Classes, assignments, grades and study plans."
        actions={
          <>
            <Button size="sm" icon={<Plus size={14} />} onClick={() => openModal({ kind: 'class' })}>
              Class
            </Button>
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => openModal({ kind: 'task', defaults: { classId: active[0]?.id, assignmentType: 'homework', category: 'School' } })} disabled={!active.length} title={active.length ? undefined : 'Add a class first'}>
              Assignment
            </Button>
          </>
        }
      />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={(v) => setQuery('tab', v === 'overview' ? null : v)}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'assignments', label: 'Assignments' },
          { value: 'missing', label: 'Missing', count: missing.length },
          { value: 'grades', label: 'Grades & GPA' },
          { value: 'calculator', label: 'Grade calculator' },
          { value: 'planner', label: 'Study planner' },
          { value: 'notes', label: 'Notes' },
        ]}
      />
      {active.length === 0 && tab !== 'grades' ? (
        <div className="card">
          <EmptyState icon={<GraduationCap size={18} />} title="Add your first class" action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => openModal({ kind: 'class' })}>Add class</Button>}>
            Add each class with its teacher and (optionally) grade categories like Tests 50% / Homework 20%. Then add assignments — they’ll appear here, on your calendar and on the dashboard.
          </EmptyState>
        </div>
      ) : (
        <>
          {tab === 'overview' && <Overview />}
          {tab === 'assignments' && <Assignments />}
          {tab === 'missing' && <Missing />}
          {tab === 'grades' && <Grades />}
          {tab === 'calculator' && <GradeCalculator />}
          {tab === 'planner' && <StudyPlanner />}
          {tab === 'notes' && <SchoolNotes />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Overview() {
  const s = useStore();
  const { active, assignments, settings, periods, tasks } = useSchool();
  const today = useToday();
  const gpa = useMemo(() => currentGpa(active, tasks, periods, settings.gpaScale), [active, tasks, periods, settings.gpaScale]);
  const cumulative = cumulativeGpa(settings.pastTerms, gpa);
  const ranked = useMemo(() => rankTasks(assignments, priorityContext(s, today)).slice(0, 6), [assignments, s, today]);
  const missing = assignments.filter((t) => isOpen(t) && t.dueDate && t.dueDate < today);
  const tests = assignments.filter((t) => isOpen(t) && t.dueDate && t.dueDate >= today && t.dueDate <= addDaysISO(today, 14) && (t.assignmentType === 'test' || t.assignmentType === 'quiz')).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const period = periodFor(today, periods);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Current GPA (${settings.gpaScale})`} value={fmtGpa(gpa.gpa)} sub={gpa.classesCounted ? `${plural(gpa.classesCounted, 'class', 'classes')} with grades` : 'Enter grades to calculate'} />
        <Stat label="Cumulative GPA" value={fmtGpa(cumulative)} sub={settings.pastTerms.length ? `incl. ${plural(settings.pastTerms.length, 'past term')}` : 'Add past terms in Grades & GPA'} />
        <Stat
          label="GPA goal"
          value={settings.gpaGoal?.toFixed(2) ?? '—'}
          sub={settings.gpaGoal === undefined ? 'Set one in Grades & GPA' : gpa.gpa === null ? 'No grades yet' : gpa.gpa >= settings.gpaGoal ? 'On track' : `${(settings.gpaGoal - gpa.gpa).toFixed(2)} below`}
          tone={settings.gpaGoal !== undefined && gpa.gpa !== null ? (gpa.gpa >= settings.gpaGoal ? 'good' : 'warn') : undefined}
        />
        <Stat label="Missing work" value={missing.length} sub={missing.length ? 'Overdue assignments' : 'All caught up'} tone={missing.length ? 'bad' : 'good'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Do these first" icon={<Sparkles size={15} />} subtitle="Ranked by due date, importance and grade impact" className="lg:col-span-2">
          {ranked.length ? (
            <TaskList tasks={ranked.map((r) => r.task)} reasons={Object.fromEntries(ranked.map((r) => [r.task.id, r.p.reasons]))} />
          ) : (
            <EmptyState compact title="No open assignments">Nice. Add new ones as they’re assigned.</EmptyState>
          )}
        </Card>
        <Card title="Tests & quizzes" icon={<CalendarClock size={15} />} subtitle="Next 2 weeks">
          {tests.length ? (
            <div className="space-y-2">
              {tests.map((t) => {
                const c = active.find((x) => x.id === t.classId);
                const studied = assignments.filter((x) => x.assignmentType === 'study' && x.classId === t.classId && x.dueDate && x.dueDate <= t.dueDate! && x.dueDate >= addDaysISO(t.dueDate!, -7));
                return (
                  <button key={t.id} type="button" onClick={() => openModal({ kind: 'task', id: t.id })} className="block w-full rounded-lg border border-line px-3 py-2 text-left hover:border-line-strong">
                    <div className="flex items-center gap-2">
                      <ColorDot color={c?.color} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{t.title}</span>
                      <span className={cn('text-xs', daysBetween(today, t.dueDate!) <= 2 ? 'text-warn' : 'text-faint')}>{formatRelativeDay(t.dueDate!, today)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-faint">
                      {c?.name} · {studied.length ? `${plural(studied.length, 'study session')} planned` : 'No study sessions planned'}
                    </p>
                  </button>
                );
              })}
              <a href="#/school?tab=planner" className="block pt-1 text-xs text-accent hover:underline">
                Open study planner →
              </a>
            </div>
          ) : (
            <EmptyState compact title="No tests or quizzes coming up" />
          )}
        </Card>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold">Classes{period ? ` · ${period.name}` : ''}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((c) => (
            <ClassCard key={c.id} cls={c} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ClassCard({ cls }: { cls: SchoolClass }) {
  const { tasks, periods } = useSchool();
  const today = useToday();
  const avg = overallAverage(cls, tasks, periods);
  const open = tasks.filter((t) => t.classId === cls.id && isOpen(t)).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const missing = open.filter((t) => t.dueDate && t.dueDate < today).length;
  return (
    <a href={`#/school/class/${cls.id}`} className="card block p-4 transition-colors hover:border-line-strong">
      <div className="flex items-start gap-3">
        <span className="mt-1 h-8 w-1 shrink-0 rounded-full" style={{ background: cls.color }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{cls.name}</p>
          <p className="truncate text-xs text-faint">{[cls.teacher, cls.schedule, cls.level !== 'regular' && cls.level.toUpperCase()].filter(Boolean).join(' · ') || 'No details'}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold tabular-nums tracking-tight">{avg.average === null ? '—' : avg.average.toFixed(1)}</p>
          <p className="text-xs text-faint">{letterGrade(avg.average)}{avg.source === 'manual' ? ' · entered' : ''}</p>
        </div>
      </div>
      <ProgressBar value={avg.average} color={cls.color} className="mt-3" height={4} />
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="truncate text-faint">{open[0] ? `Next: ${open[0].title}${open[0].dueDate ? ` · ${formatRelativeDay(open[0].dueDate, today)}` : ''}` : 'Nothing due'}</span>
        {missing > 0 ? <Badge tone="bad">{missing} missing</Badge> : cls.targetGrade !== undefined && avg.average !== null ? <Badge tone={avg.average >= cls.targetGrade ? 'good' : 'warn'}>Target {cls.targetGrade}%</Badge> : null}
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------

function Assignments() {
  const { active, assignments } = useSchool();
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState<'open' | 'graded' | 'all'>('open');
  const list = assignments
    .filter((t) => (!classId || t.classId === classId) && (status === 'all' ? true : status === 'open' ? isOpen(t) : isGraded(t)))
    .sort((a, b) => (status === 'graded' ? (b.dueDate ?? '').localeCompare(a.dueDate ?? '') : (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')));
  const byClass = active.map((c) => ({ c, items: list.filter((t) => t.classId === c.id) })).filter((g) => g.items.length);
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input !w-auto" value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class">
          <option value="">All classes</option>
          {active.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Tabs size="sm" value={status} onChange={setStatus} options={[{ value: 'open', label: 'To do' }, { value: 'graded', label: 'Graded' }, { value: 'all', label: 'All' }]} />
      </div>
      {byClass.length === 0 ? (
        <div className="card">
          <EmptyState compact icon={<BookOpen size={18} />} title={status === 'graded' ? 'No graded assignments yet' : 'No assignments here'}>
            {status === 'graded' ? 'Enter points earned on an assignment to record a grade.' : 'Add assignments with the button above or the global New button.'}
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {byClass.map(({ c, items }) => (
            <Card key={c.id} title={<span className="inline-flex items-center gap-2"><ColorDot color={c.color} />{c.name}</span>} action={<IconButton label={`Add assignment to ${c.name}`} size="xs" onClick={() => openModal({ kind: 'task', defaults: { classId: c.id, assignmentType: 'homework', category: 'School' } })}><Plus size={14} /></IconButton>}>
              <TaskList tasks={items} context={false} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Missing() {
  const s = useStore();
  const { assignments } = useSchool();
  const today = useToday();
  const ranked = rankTasks(assignments.filter((t) => t.dueDate && t.dueDate < today), priorityContext(s, today));
  return (
    <Card title="Missing assignments" icon={<AlertTriangle size={15} className="text-bad" />} subtitle="Past due and not done — ordered by how much they can still help your grade">
      {ranked.length ? (
        <TaskList tasks={ranked.map((r) => r.task)} reasons={Object.fromEntries(ranked.map((r) => [r.task.id, r.p.reasons]))} />
      ) : (
        <EmptyState compact title="No missing work">Everything past due is turned in. 🎉</EmptyState>
      )}
      {ranked.length > 0 && <p className="mt-3 text-xs text-faint">Tip: if a teacher won’t accept something late, open it and mark it excused or enter a 0 so your average stays accurate.</p>}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function Grades() {
  const { active, classes, tasks, settings, periods } = useSchool();
  const updateSettings = useStore((s) => s.updateSettings);
  const gpa = currentGpa(active, tasks, periods, settings.gpaScale);
  const cumulative = cumulativeGpa(settings.pastTerms, gpa);
  const [mp, setMp] = useState<Partial<MarkingPeriod>>({});
  const [term, setTerm] = useState({ name: '', gpa: '', credits: '' });
  const [err, setErr] = useState('');

  const addPeriod = () => {
    if (!mp.name?.trim() || !mp.start || !mp.end) return setErr('Name, start and end are required');
    if (mp.end < mp.start) return setErr('End date is before the start');
    if (periods.some((p) => !(mp.end! < p.start || mp.start! > p.end))) return setErr('Overlaps an existing marking period');
    updateSettings({ markingPeriods: [...periods, { id: uid('mp'), name: mp.name.trim(), start: mp.start, end: mp.end }].sort((a, b) => a.start.localeCompare(b.start)) });
    setMp({});
    setErr('');
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="GPA" className="lg:col-span-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-faint">Current term</p>
              <p className="text-2xl font-semibold tabular-nums">{fmtGpa(gpa.gpa)}</p>
            </div>
            <div>
              <p className="text-xs text-faint">Cumulative</p>
              <p className="text-2xl font-semibold tabular-nums">{fmtGpa(cumulative)}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Scale">
              <select className="input" value={settings.gpaScale} onChange={(e) => updateSettings({ gpaScale: e.target.value as typeof settings.gpaScale })}>
                <option value="weighted">Weighted (Honors +0.5, AP +1)</option>
                <option value="unweighted">Unweighted (4.0)</option>
              </select>
            </Field>
            <Field label="GPA goal">
              <input type="number" step={0.01} min={0} max={6} className="input" value={settings.gpaGoal ?? ''} onChange={(e) => updateSettings({ gpaGoal: optNum(e.target.value) })} placeholder="e.g. 3.80" />
            </Field>
          </div>
          {settings.gpaGoal !== undefined && cumulative !== null && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-faint">
                <span>Cumulative vs goal</span>
                <span>{((cumulative / settings.gpaGoal) * 100).toFixed(0)}%</span>
              </div>
              <ProgressBar value={(cumulative / settings.gpaGoal) * 100} color={cumulative >= settings.gpaGoal ? 'rgb(var(--good))' : undefined} />
            </div>
          )}
          <p className="mt-3 text-xs text-faint">Letter → points: A/A+ 4.0, A- 3.7, B+ 3.3, B 3.0 … D- 0.7, F 0. Classes without grades yet aren’t counted.</p>
        </Card>

        <Card title="Grades by marking period" className="lg:col-span-2" bodyClassName="overflow-x-auto">
          {periods.length === 0 && <p className="mb-3 text-xs text-faint">Add marking periods below to see grades per quarter/semester. Until then, all graded work counts toward one average.</p>}
          <table className="w-full min-w-[480px] text-[13px]">
            <thead>
              <tr className="text-left text-xs text-faint">
                <th className="py-2 pr-3 font-medium">Class</th>
                {periods.map((p) => (
                  <th key={p.id} className="px-2 py-2 text-right font-medium">
                    {p.name}
                  </th>
                ))}
                <th className="py-2 pl-2 text-right font-medium">Overall</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => {
                const overall = overallAverage(c, tasks, periods);
                return (
                  <tr key={c.id} className={cn('border-t border-line', c.archived && 'opacity-50')}>
                    <td className="py-2 pr-3">
                      <a href={`#/school/class/${c.id}`} className="inline-flex items-center gap-2 hover:text-accent">
                        <ColorDot color={c.color} />
                        {c.name}
                        {c.archived && <span className="text-xs text-faint">(archived)</span>}
                      </a>
                    </td>
                    {periods.map((p) => {
                      const r = computeAverage(c, tasks, p);
                      return (
                        <td key={p.id} className="px-2 py-2 text-right tabular-nums" title={r.source === 'manual' ? 'Entered manually' : r.source === 'none' ? 'Not enough grading information' : `${r.graded} graded`}>
                          {r.average === null ? <span className="text-faint">—</span> : `${r.average.toFixed(1)} ${letterGrade(r.average)}`}
                          {r.source === 'manual' && <span className="text-faint">*</span>}
                        </td>
                      );
                    })}
                    <td className="py-2 pl-2 text-right font-semibold tabular-nums">{overall.average === null ? <span className="font-normal text-faint">—</span> : `${overall.average.toFixed(1)} ${letterGrade(overall.average)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-faint">* entered manually (no graded assignments in that period). “—” means not enough grading information yet.</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Marking periods">
          <div className="space-y-1">
            {periods.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5 text-[13px]">
                <span className="w-16 font-medium">{p.name}</span>
                <span className="flex-1 text-muted">
                  {formatShort(p.start)} – {formatShort(p.end)}
                </span>
                <IconButton
                  label={`Remove ${p.name}`}
                  size="xs"
                  onClick={async () => {
                    if (await confirmAction({ title: `Remove ${p.name}?`, message: 'Assignments are kept; manual grades entered for this period are ignored.', confirmLabel: 'Remove' })) updateSettings({ markingPeriods: periods.filter((x) => x.id !== p.id) });
                  }}
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
            <input className="input" placeholder="Q1" value={mp.name ?? ''} onChange={(e) => setMp({ ...mp, name: e.target.value })} aria-label="Period name" />
            <input type="date" className="input" value={mp.start ?? ''} onChange={(e) => setMp({ ...mp, start: e.target.value })} aria-label="Start" />
            <input type="date" className="input" value={mp.end ?? ''} onChange={(e) => setMp({ ...mp, end: e.target.value })} aria-label="End" />
            <Button onClick={addPeriod} icon={<Plus size={14} />}>
              Add
            </Button>
          </div>
          {err && <p className="mt-1 text-xs text-bad">{err}</p>}
        </Card>

        <Card title="Past terms" subtitle="Used for cumulative GPA">
          <div className="space-y-1">
            {settings.pastTerms.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5 text-[13px]">
                <span className="flex-1">{t.name}</span>
                <span className="tabular-nums text-muted">{t.gpa.toFixed(2)} GPA</span>
                <span className="w-20 text-right tabular-nums text-faint">{t.credits} credits</span>
                <IconButton label={`Remove ${t.name}`} size="xs" onClick={() => updateSettings({ pastTerms: settings.pastTerms.filter((x) => x.id !== t.id) })}>
                  <Trash2 size={13} />
                </IconButton>
              </div>
            ))}
            {!settings.pastTerms.length && <p className="text-xs text-faint">No past terms yet.</p>}
          </div>
          <form
            className="mt-3 grid grid-cols-[1.4fr_1fr_1fr_auto] gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const g = optNum(term.gpa);
              const c = optNum(term.credits);
              if (!term.name.trim() || g === undefined || c === undefined || g < 0 || g > 6 || c <= 0) return toast.error('Enter a name, a GPA (0–6) and credits');
              updateSettings({ pastTerms: [...settings.pastTerms, { id: uid('pt'), name: term.name.trim(), gpa: g, credits: c }] });
              setTerm({ name: '', gpa: '', credits: '' });
            }}
          >
            <input className="input" placeholder="9th grade" value={term.name} onChange={(e) => setTerm({ ...term, name: e.target.value })} aria-label="Term name" />
            <input className="input" type="number" step={0.01} placeholder="GPA" value={term.gpa} onChange={(e) => setTerm({ ...term, gpa: e.target.value })} aria-label="GPA" />
            <input className="input" type="number" step={0.5} placeholder="Credits" value={term.credits} onChange={(e) => setTerm({ ...term, credits: e.target.value })} aria-label="Credits" />
            <Button type="submit" icon={<Plus size={14} />}>
              Add
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function GradeCalculator() {
  const { active, tasks, periods } = useSchool();
  const today = useToday();
  const [classId, setClassId] = useState(active[0]?.id ?? '');
  const [scope, setScope] = useState<string>(periodFor(today, periods)?.id ?? 'all');
  const [hypos, setHypos] = useState<HypotheticalGrade[]>([]);
  const [target, setTarget] = useState('90');
  const [needPossible, setNeedPossible] = useState('100');
  const [needCat, setNeedCat] = useState('');
  const cls = active.find((c) => c.id === classId) ?? active[0];
  const period = periods.find((p) => p.id === scope);

  useEffect(() => {
    setHypos([]);
    setNeedCat(active.find((c) => c.id === classId)?.categories[0]?.id ?? '');
    // Reset what-ifs when switching classes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);
  if (!cls) return null;

  const classTasks = tasks.filter((t) => t.classId === cls.id && !t.archived && !t.excused);
  const scoped = classTasks.filter((t) => !period || (t.dueDate && t.dueDate >= period.start && t.dueDate <= period.end));
  const ungraded = scoped.filter((t) => !isGraded(t) && t.pointsPossible && t.assignmentType !== 'study');
  const graded = scoped.filter(isGraded);
  const current = computeAverage(cls, classTasks, period);
  const projected = computeAverage(cls, applyHypotheticals(cls, classTasks, hypos), period);
  const delta = current.average !== null && projected.average !== null ? projected.average - current.average : null;
  const need = scoreNeeded(cls, applyHypotheticals(cls, classTasks, hypos), optNum(target) ?? 90, optNum(needPossible) ?? 100, needCat || undefined, period);

  const setHypo = (taskId: string | undefined, id: string, patch: Partial<HypotheticalGrade>) =>
    setHypos((h) => {
      const existing = h.find((x) => x.id === id);
      if (existing) return h.map((x) => (x.id === id ? { ...x, ...patch } : x));
      return [...h, { id, taskId, earned: 0, possible: 100, ...patch }];
    });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="flex flex-wrap gap-2">
          <select className="input !w-auto" value={cls.id} onChange={(e) => setClassId(e.target.value)} aria-label="Class">
            {active.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="input !w-auto" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Marking period">
            <option value="all">All work</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {hypos.length > 0 && (
            <Button variant="ghost" size="md" icon={<X size={14} />} onClick={() => setHypos([])}>
              Reset what-ifs
            </Button>
          )}
        </div>

        <Card title="What if I score…" icon={<Calculator size={15} />} subtitle="Enter hypothetical scores. Nothing here changes your real grades.">
          {ungraded.length === 0 && <p className="mb-2 text-[13px] text-faint">No upcoming assignments with point values. Add a hypothetical one below.</p>}
          <div className="space-y-1.5">
            {ungraded.map((t) => {
              const h = hypos.find((x) => x.taskId === t.id);
              return (
                <div key={t.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {t.title}
                    {t.dueDate && <span className="ml-2 text-xs text-faint">{formatRelativeDay(t.dueDate, today)}</span>}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    className="input !w-20 text-right"
                    placeholder="—"
                    aria-label={`Hypothetical score for ${t.title}`}
                    value={h?.earned ?? ''}
                    onChange={(e) => {
                      const v = optNum(e.target.value);
                      if (v === undefined) setHypos((hs) => hs.filter((x) => x.taskId !== t.id));
                      else setHypo(t.id, `t_${t.id}`, { earned: v, possible: t.pointsPossible!, categoryId: t.gradeCategoryId });
                    }}
                  />
                  <span className="w-14 text-xs tabular-nums text-faint">/ {t.pointsPossible}</span>
                </div>
              );
            })}
            {hypos
              .filter((h) => !h.taskId)
              .map((h) => (
                <div key={h.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-accent">Hypothetical assignment</span>
                  {cls.categories.length > 0 && (
                    <select className="input !h-9 !w-32" value={h.categoryId ?? ''} onChange={(e) => setHypo(undefined, h.id, { categoryId: e.target.value || undefined })} aria-label="Category">
                      <option value="">Category…</option>
                      {cls.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <input type="number" min={0} step="any" className="input !w-20 text-right" value={h.earned} onChange={(e) => setHypo(undefined, h.id, { earned: optNum(e.target.value) ?? 0 })} aria-label="Points earned" />
                  <span className="text-xs text-faint">/</span>
                  <input type="number" min={1} step="any" className="input !w-20 text-right" value={h.possible} onChange={(e) => setHypo(undefined, h.id, { possible: Math.max(1, optNum(e.target.value) ?? 1) })} aria-label="Points possible" />
                  <IconButton label="Remove" size="xs" onClick={() => setHypos((hs) => hs.filter((x) => x.id !== h.id))}>
                    <X size={14} />
                  </IconButton>
                </div>
              ))}
          </div>
          <Button size="sm" className="mt-3" icon={<Plus size={14} />} onClick={() => setHypo(undefined, uid('h'), { earned: 90, possible: 100, categoryId: cls.categories[0]?.id })}>
            Add hypothetical assignment
          </Button>
          {graded.length > 0 && (
            <details className="mt-4 text-[13px]">
              <summary className="cursor-pointer text-xs text-faint hover:text-fg">Re-score graded work ({graded.length})</summary>
              <div className="mt-2 space-y-1.5">
                {graded.map((t) => {
                  const h = hypos.find((x) => x.taskId === t.id);
                  return (
                    <div key={t.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-muted">{t.title}</span>
                      <span className="text-xs tabular-nums text-faint">was {t.pointsEarned}</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="input !w-20 text-right"
                        placeholder={String(t.pointsEarned)}
                        value={h?.earned ?? ''}
                        aria-label={`Re-score ${t.title}`}
                        onChange={(e) => {
                          const v = optNum(e.target.value);
                          if (v === undefined) setHypos((hs) => hs.filter((x) => x.taskId !== t.id));
                          else setHypo(t.id, `t_${t.id}`, { earned: v, possible: t.pointsPossible!, categoryId: t.gradeCategoryId });
                        }}
                      />
                      <span className="w-14 text-xs tabular-nums text-faint">/ {t.pointsPossible}</span>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Result">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-faint">Current</p>
              <p className="text-2xl font-semibold tabular-nums">{fmtPct(current.average)}</p>
              <p className="text-xs text-faint">{letterGrade(current.average)}</p>
            </div>
            <div>
              <p className="text-xs text-faint">Projected</p>
              <p className={cn('text-2xl font-semibold tabular-nums', delta !== null && delta > 0.05 && 'text-good', delta !== null && delta < -0.05 && 'text-bad')}>{fmtPct(projected.average)}</p>
              <p className="text-xs text-faint">
                {letterGrade(projected.average)}
                {delta !== null && Math.abs(delta) >= 0.05 && ` · ${delta > 0 ? '+' : ''}${delta.toFixed(1)}`}
              </p>
            </div>
          </div>
          {current.categories.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {projected.categories.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  <span className="w-24 truncate text-muted">{c.name}</span>
                  <span className="w-10 text-faint">{c.weight}%</span>
                  <ProgressBar value={c.percent} height={4} className="flex-1" color={cls.color} />
                  <span className="w-12 text-right tabular-nums">{c.percent === null ? '—' : c.percent.toFixed(1)}</span>
                </div>
              ))}
            </div>
          )}
          {current.average === null && <p className="mt-3 text-xs text-faint">Not enough grading information for a current average yet — enter at least one graded assignment.</p>}
        </Card>

        <Card title="What do I need?" icon={<Wand2 size={15} />}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Target average %">
              <input type="number" className="input" value={target} onChange={(e) => setTarget(e.target.value)} />
            </Field>
            <Field label="Next assignment worth">
              <input type="number" className="input" value={needPossible} onChange={(e) => setNeedPossible(e.target.value)} />
            </Field>
            {cls.categories.length > 0 && (
              <Field label="In category" className="col-span-2">
                <select className="input" value={needCat} onChange={(e) => setNeedCat(e.target.value)}>
                  <option value="">Choose…</option>
                  {cls.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.weight}%)
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <div className="mt-3 rounded-xl bg-surface-2 p-3 text-[13px]">
            {cls.categories.length > 0 && !needCat ? (
              <span className="text-faint">Choose a category to calculate.</span>
            ) : need.alreadyThere ? (
              <span className="text-good">You’re already at or above {target}% — even a 0 keeps you there.</span>
            ) : need.needed === null ? (
              <span className="text-bad">Not reachable with a single {needPossible}-point assignment, even with extra credit.</span>
            ) : (
              <span>
                You need <span className="font-semibold text-fg">{need.needed.toFixed(1)} / {needPossible}</span> ({((need.needed / (optNum(needPossible) ?? 100)) * 100).toFixed(0)}%)
                {need.needed > (optNum(needPossible) ?? 100) && <span className="text-warn"> — that’s above 100%.</span>}
              </span>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function StudyPlanner() {
  const { active, assignments, tasks, periods } = useSchool();
  const addTask = useStore((s) => s.addTask);
  const today = useToday();
  const upcoming = assignments
    .filter((t) => isOpen(t) && t.dueDate && t.dueDate >= today && t.assignmentType !== 'study' && t.assignmentType !== 'homework')
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const sessions = assignments.filter((t) => t.assignmentType === 'study' && isOpen(t)).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));

  const plan = async (t: Task) => {
    const days = daysBetween(today, t.dueDate!);
    if (days < 1) return toast.error('It’s due today — study now!');
    const n = Math.min(t.assignmentType === 'test' ? 3 : 2, days);
    // Spread sessions across the days before the due date (spaced repetition-ish).
    const offsets = n === 1 ? [1] : n === 2 ? [Math.max(2, Math.ceil(days / 2)), 1] : [Math.min(days, 5), Math.max(2, Math.ceil(Math.min(days, 5) / 2)), 1];
    const dates = [...new Set(offsets.map((o) => addDaysISO(t.dueDate!, -Math.min(o, days))))].filter((d) => d >= today);
    if (!(await confirmAction({ title: `Plan ${plural(dates.length, 'study session')}?`, message: `For “${t.title}” on ${dates.map((d) => formatShort(d)).join(', ')} (45 min each). They’ll appear in your tasks and calendar.`, confirmLabel: 'Add sessions', danger: false }))) return;
    dates.forEach((d, i) => addTask({ title: `Study: ${t.title}${dates.length > 1 ? ` (${i + 1}/${dates.length})` : ''}`, classId: t.classId, assignmentType: 'study', dueDate: d, estimateMinutes: 45, category: 'School', priority: t.priority === 'urgent' || t.priority === 'high' ? 'high' : 'medium' }));
    toast.success('Study sessions added');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Coming up" icon={<CalendarClock size={15} />} subtitle="Tests, quizzes, projects and essays">
        {upcoming.length === 0 ? (
          <EmptyState compact title="Nothing big coming up" />
        ) : (
          <div className="space-y-2">
            {upcoming.map((t) => {
              const c = active.find((x) => x.id === t.classId);
              const planned = sessions.filter((x) => x.classId === t.classId && x.title.includes(t.title)).length;
              const impact = gradeImpact(t, c, tasks, t.dueDate ? periodFor(t.dueDate, periods) : undefined);
              return (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                  <ColorDot color={c?.color} />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openModal({ kind: 'task', id: t.id })}>
                    <p className="truncate text-[13px] font-medium">{t.title}</p>
                    <p className="truncate text-xs text-faint">
                      <span className="capitalize">{t.assignmentType}</span> · {c?.name} · {formatRelativeDay(t.dueDate!, today)}
                      {impact !== null && ` · ${impact.toFixed(1)} pts at stake`}
                    </p>
                  </button>
                  {planned ? <Badge tone="good">{planned} planned</Badge> : <Button size="xs" icon={<Sparkles size={12} />} onClick={() => void plan(t)}>Plan sessions</Button>}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <Card
        title="Study sessions"
        icon={<BookOpen size={15} />}
        action={
          <Button size="xs" icon={<Plus size={13} />} onClick={() => openModal({ kind: 'task', defaults: { classId: active[0]?.id, assignmentType: 'study', estimateMinutes: 45, category: 'School', dueDate: today } })}>
            Session
          </Button>
        }
      >
        {sessions.length ? (
          <TaskList tasks={sessions} />
        ) : (
          <EmptyState compact title="No study sessions planned">
            Use “Plan sessions” on an upcoming test, or add one manually. Sessions count as tasks and show on your calendar.
          </EmptyState>
        )}
      </Card>
    </div>
  );
}

function SchoolNotes() {
  const notes = useStore((s) => s.notes);
  const { active } = useSchool();
  const create = useStore((s) => s.create);
  const linked = notes.filter((n) => !n.archived && !n.isTemplate && (n.folder === 'School' || n.links.some((l) => l.type === 'class')));
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {active.map((c) => (
          <Button
            key={c.id}
            size="sm"
            icon={<NotebookPen size={13} />}
            onClick={() => {
              const n = create('notes', { title: `${c.name} notes`, content: '', folder: 'School', tags: [], pinned: false, isTemplate: false, links: [{ type: 'class', id: c.id }], archived: false });
              navigate(`/notes/${n.id}`);
            }}
          >
            New {c.name} note
          </Button>
        ))}
      </div>
      {linked.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {linked.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState compact icon={<NotebookPen size={18} />} title="No school notes yet">
            Notes in the School folder or linked to a class appear here.
          </EmptyState>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ClassDetail({ id }: { id: string }) {
  const cls = useStore((s) => s.classes.find((c) => c.id === id));
  const { tasks, periods } = useSchool();
  const notes = useStore((s) => s.notes);
  const today = useToday();
  const [scope, setScope] = useState<string>('all');
  if (!cls)
    return (
      <div className="card">
        <EmptyState title="Class not found" action={<Button onClick={() => navigate('/school')}>Back to School</Button>} />
      </div>
    );
  const period = periods.find((p) => p.id === scope);
  const avg = period ? computeAverage(cls, tasks, period) : overallAverage(cls, tasks, periods);
  const work = tasks.filter((t) => t.classId === cls.id && !t.archived && (!period || (t.dueDate && t.dueDate >= period.start && t.dueDate <= period.end)));
  const open = work.filter(isOpen).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const graded = work.filter(isGraded).sort((a, b) => (b.dueDate ?? '').localeCompare(a.dueDate ?? ''));
  const classNotes = notes.filter((n) => !n.archived && n.links.some((l) => l.type === 'class' && l.id === cls.id));

  return (
    <div>
      <a href="#/school" className="mb-3 inline-block text-xs text-faint hover:text-fg">
        ← School
      </a>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            <span className="h-6 w-1.5 rounded-full" style={{ background: cls.color }} />
            {cls.name}
            {cls.archived && <Badge>Archived</Badge>}
          </span>
        }
        subtitle={[cls.teacher, cls.room && `Room ${cls.room}`, cls.schedule, cls.level !== 'regular' && cls.level.toUpperCase(), `${cls.credits} credit${cls.credits === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button size="sm" icon={<Pencil size={14} />} onClick={() => openModal({ kind: 'class', id: cls.id })}>
              Edit
            </Button>
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => openModal({ kind: 'task', defaults: { classId: cls.id, assignmentType: 'homework', category: 'School' } })}>
              Assignment
            </Button>
          </>
        }
      />
      {periods.length > 0 && (
        <Tabs className="mb-4" size="sm" value={scope} onChange={setScope} options={[{ value: 'all', label: 'Overall' }, ...periods.map((p) => ({ value: p.id, label: p.name }))]} />
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Grade">
          <p className="text-4xl font-semibold tabular-nums tracking-tight">{fmtPct(avg.average)}</p>
          <p className="mt-1 text-sm text-muted">
            {letterGrade(avg.average)}
            {avg.source === 'manual' && ' · entered manually'}
            {cls.targetGrade !== undefined && avg.average !== null && <span className={avg.average >= cls.targetGrade ? 'text-good' : 'text-warn'}> · target {cls.targetGrade}%</span>}
          </p>
          <p className="mt-1 text-xs text-faint">{avg.graded ? `${plural(avg.graded, 'graded assignment')}` : 'No graded work yet'}</p>
          {avg.categories.length > 0 && (
            <div className="mt-4 space-y-2">
              {avg.categories.map((c) => (
                <div key={c.id}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted">
                      {c.name} <span className="text-faint">· {c.weight}%</span>
                    </span>
                    <span className="tabular-nums">{c.percent === null ? <span className="text-faint">no grades</span> : `${c.percent.toFixed(1)}%`}</span>
                  </div>
                  <ProgressBar value={c.percent} color={cls.color} height={4} />
                </div>
              ))}
            </div>
          )}
          {avg.uncategorized > 0 && <p className="mt-3 text-xs text-warn">{plural(avg.uncategorized, 'graded assignment')} without a category aren’t counted. Edit them to assign a category.</p>}
          <a href="#/school?tab=calculator" className="mt-4 inline-block text-xs text-accent hover:underline">
            Open grade calculator →
          </a>
        </Card>
        <Card title={`To do · ${open.length}`} className="lg:col-span-2">
          {open.length ? <TaskList tasks={open} context={false} /> : <EmptyState compact title="Nothing to do for this class" />}
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title={`Graded · ${graded.length}`} className="lg:col-span-2" bodyClassName="overflow-x-auto">
          {graded.length ? (
            <table className="w-full min-w-[420px] text-[13px]">
              <thead>
                <tr className="text-left text-xs text-faint">
                  <th className="py-1.5 font-medium">Assignment</th>
                  <th className="py-1.5 font-medium">Category</th>
                  <th className="py-1.5 font-medium">Date</th>
                  <th className="py-1.5 text-right font-medium">Score</th>
                  <th className="py-1.5 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {graded.map((t) => {
                  const pct = taskPercent(t)!;
                  return (
                    <tr key={t.id} className="cursor-pointer border-t border-line hover:bg-surface-2" onClick={() => openModal({ kind: 'task', id: t.id })}>
                      <td className="max-w-[220px] truncate py-2 pr-2">{t.title}</td>
                      <td className="py-2 pr-2 text-muted">{cls.categories.find((c) => c.id === t.gradeCategoryId)?.name ?? '—'}</td>
                      <td className="py-2 pr-2 text-faint">{t.dueDate ? formatShort(t.dueDate) : '—'}</td>
                      <td className="py-2 text-right tabular-nums text-muted">
                        {t.pointsEarned}/{t.pointsPossible}
                      </td>
                      <td className={cn('py-2 text-right font-medium tabular-nums', pct >= 90 ? 'text-good' : pct < 70 ? 'text-bad' : '')}>{pct.toFixed(0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState compact title="No grades yet">Open an assignment and enter points earned to record a grade.</EmptyState>
          )}
        </Card>
        <Card
          title="Notes"
          action={
            <IconButton
              label="New note for this class"
              size="xs"
              onClick={() => {
                const n = useStore.getState().create('notes', { title: `${cls.name} — ${formatShort(today)}`, content: '', folder: 'School', tags: [], pinned: false, isTemplate: false, links: [{ type: 'class', id: cls.id }], archived: false });
                navigate(`/notes/${n.id}`);
              }}
            >
              <Plus size={14} />
            </IconButton>
          }
        >
          {classNotes.length ? (
            <div className="space-y-1">
              {classNotes.map((n) => (
                <a key={n.id} href={`#/notes/${n.id}`} className="block truncate rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface-2">
                  {n.title || 'Untitled'}
                </a>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-faint">No notes linked to this class.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
