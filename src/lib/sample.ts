/**
 * Realistic, clearly-labelled sample data. Every record carries `sample: true`
 * (settings entries use a `sample_` id prefix) so "Remove sample data" can
 * delete exactly these records and nothing you've entered yourself.
 */
import type {
  CalendarEvent,
  DataSnapshot,
  Goal,
  Habit,
  JournalEntry,
  MarkingPeriod,
  Note,
  PastTerm,
  Project,
  Reminder,
  SchoolClass,
  Task,
} from '@shared/schema';
import { addDaysISO, fromISO, weekStartISO, weekdayOf } from './dates';
import { COLORS } from './defaults';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function schoolYearPeriods(today: string): MarkingPeriod[] {
  const d = fromISO(today);
  const startYear = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  const y = startYear;
  return [
    { id: 'sample_mp1', name: 'Q1', start: `${y}-09-02`, end: `${y}-11-07` },
    { id: 'sample_mp2', name: 'Q2', start: `${y}-11-10`, end: `${y + 1}-01-23` },
    { id: 'sample_mp3', name: 'Q3', start: `${y + 1}-01-26`, end: `${y + 1}-04-03` },
    { id: 'sample_mp4', name: 'Q4', start: `${y + 1}-04-06`, end: `${y + 1}-06-19` },
  ];
}

export function buildSampleData(today: string): {
  data: Omit<DataSnapshot, 'settings'>;
  markingPeriods: MarkingPeriod[];
  pastTerms: PastTerm[];
  gpaGoal: number;
} {
  const now = Date.now();
  const day = 86_400_000;
  const rnd = seeded(42);
  const base = { sample: true as const, createdAt: now - 45 * day, updatedAt: now };
  const d = (n: number) => addDaysISO(today, n);
  const ts = (n: number) => now + n * day;
  const periods = schoolYearPeriods(today);
  const current = periods.find((p) => today >= p.start && today <= p.end) ?? periods[0];
  /** A date inside the current marking period, n days before today but not before it starts. */
  const past = (n: number) => {
    const v = d(-n);
    return v < current.start ? current.start : v;
  };

  // ---------------------------------------------------------------- classes
  const cat = (id: string, name: string, weight: number) => ({ id, name, weight });
  const classes: SchoolClass[] = [
    {
      ...base, id: 'sample_apush', name: 'AP US History', teacher: 'Mr. Delgado', room: '214', schedule: 'Period 1',
      color: COLORS[0], level: 'ap', credits: 1, archived: false, targetGrade: 90,
      categories: [cat('apush_t', 'Tests', 50), cat('apush_q', 'Quizzes', 20), cat('apush_h', 'Homework', 15), cat('apush_e', 'Essays', 15)],
    },
    {
      ...base, id: 'sample_precalc', name: 'Pre-Calculus', teacher: 'Ms. Okafor', room: '108', schedule: 'Period 2',
      color: COLORS[1], level: 'honors', credits: 1, archived: false, targetGrade: 90,
      categories: [cat('pc_t', 'Tests', 60), cat('pc_q', 'Quizzes', 25), cat('pc_h', 'Homework', 15)],
    },
    {
      ...base, id: 'sample_eng', name: 'English 11', teacher: 'Mrs. Patel', room: '302', schedule: 'Period 3',
      color: COLORS[3], level: 'regular', credits: 1, archived: false,
      categories: [],
    },
    {
      ...base, id: 'sample_chem', name: 'Chemistry', teacher: 'Dr. Reyes', room: 'Lab B', schedule: 'Period 5',
      color: COLORS[2], level: 'honors', credits: 1, archived: false,
      categories: [cat('ch_t', 'Tests', 45), cat('ch_l', 'Labs', 35), cat('ch_h', 'Homework', 20)],
    },
    {
      ...base, id: 'sample_span', name: 'Spanish III', teacher: 'Sra. Molina', room: '220', schedule: 'Period 6',
      color: COLORS[4], level: 'regular', credits: 1, archived: false, categories: [],
    },
  ];

  const tasks: Task[] = [];
  let order = 0;
  const task = (t: Partial<Task> & { title: string }) =>
    tasks.push({ ...base, id: `sample_t${++order}`, status: 'todo', priority: 'medium', tags: [], archived: false, ...t } as Task);
  const graded = (t: Partial<Task> & { title: string; pointsPossible: number; score: number }) => {
    const { score, ...rest } = t;
    // Completed on its due date (5pm), so weekly stats reflect when the work was actually done.
    const doneAt = t.dueDate ? fromISO(t.dueDate).getTime() + 17 * 3_600_000 : ts(-1);
    task({ ...rest, status: 'done', pointsEarned: Math.round(t.pointsPossible * score), completedAt: Math.min(doneAt, now), category: 'School' });
  };

  // Graded work in the current period
  graded({ title: 'Unit 1 Test: Colonial America', classId: 'sample_apush', gradeCategoryId: 'apush_t', assignmentType: 'test', dueDate: past(30), pointsPossible: 100, score: 0.88 });
  graded({ title: 'Reading quiz ch. 3', classId: 'sample_apush', gradeCategoryId: 'apush_q', assignmentType: 'quiz', dueDate: past(20), pointsPossible: 20, score: 0.95 });
  graded({ title: 'DBQ practice essay', classId: 'sample_apush', gradeCategoryId: 'apush_e', assignmentType: 'essay', dueDate: past(14), pointsPossible: 50, score: 0.82 });
  graded({ title: 'Ch. 4 outline', classId: 'sample_apush', gradeCategoryId: 'apush_h', assignmentType: 'homework', dueDate: past(9), pointsPossible: 10, score: 1 });
  graded({ title: 'Functions test', classId: 'sample_precalc', gradeCategoryId: 'pc_t', assignmentType: 'test', dueDate: past(25), pointsPossible: 100, score: 0.84 });
  graded({ title: 'Quiz 2.1 – 2.3', classId: 'sample_precalc', gradeCategoryId: 'pc_q', assignmentType: 'quiz', dueDate: past(12), pointsPossible: 30, score: 0.8 });
  graded({ title: 'Problem set 5', classId: 'sample_precalc', gradeCategoryId: 'pc_h', assignmentType: 'homework', dueDate: past(6), pointsPossible: 20, score: 0.9 });
  graded({ title: 'Gatsby ch. 1–3 response', classId: 'sample_eng', assignmentType: 'essay', dueDate: past(18), pointsPossible: 50, score: 0.92 });
  graded({ title: 'Vocab quiz 4', classId: 'sample_eng', assignmentType: 'quiz', dueDate: past(8), pointsPossible: 25, score: 0.96 });
  graded({ title: 'Stoichiometry lab', classId: 'sample_chem', gradeCategoryId: 'ch_l', assignmentType: 'lab', dueDate: past(16), pointsPossible: 40, score: 0.9 });
  graded({ title: 'Atomic structure test', classId: 'sample_chem', gradeCategoryId: 'ch_t', assignmentType: 'test', dueDate: past(21), pointsPossible: 100, score: 0.79 });
  graded({ title: 'Worksheet 3B', classId: 'sample_chem', gradeCategoryId: 'ch_h', assignmentType: 'homework', dueDate: past(5), pointsPossible: 10, score: 1 });
  graded({ title: 'Oral presentation', classId: 'sample_span', assignmentType: 'project', dueDate: past(15), pointsPossible: 100, score: 0.91 });
  graded({ title: 'Preterite vs imperfect quiz', classId: 'sample_span', assignmentType: 'quiz', dueDate: past(7), pointsPossible: 20, score: 0.85 });

  // Missing + upcoming work
  task({ title: 'Ch. 5 reading notes', classId: 'sample_apush', gradeCategoryId: 'apush_h', assignmentType: 'homework', dueDate: d(-2), pointsPossible: 10, priority: 'high', category: 'School' });
  task({ title: 'Titration lab report', classId: 'sample_chem', gradeCategoryId: 'ch_l', assignmentType: 'lab', dueDate: d(-1), pointsPossible: 40, priority: 'high', category: 'School', estimateMinutes: 60 });
  task({ title: 'Problem set 6', classId: 'sample_precalc', gradeCategoryId: 'pc_h', assignmentType: 'homework', dueDate: d(0), dueTime: '23:59', pointsPossible: 20, category: 'School', estimateMinutes: 45 });
  task({ title: 'Unit 2 Test: Revolution & Constitution', classId: 'sample_apush', gradeCategoryId: 'apush_t', assignmentType: 'test', dueDate: d(2), pointsPossible: 100, priority: 'high', category: 'School' });
  task({ title: 'Study for Unit 2 test', classId: 'sample_apush', assignmentType: 'study', dueDate: d(1), estimateMinutes: 60, category: 'School' });
  task({ title: 'Trig identities quiz', classId: 'sample_precalc', gradeCategoryId: 'pc_q', assignmentType: 'quiz', dueDate: d(4), pointsPossible: 30, category: 'School' });
  task({ title: 'Gatsby final essay', classId: 'sample_eng', assignmentType: 'essay', dueDate: d(9), pointsPossible: 100, priority: 'high', category: 'School', estimateMinutes: 90 });
  task({ title: 'Vocab quiz 5', classId: 'sample_eng', assignmentType: 'quiz', dueDate: d(3), pointsPossible: 25, category: 'School', estimateMinutes: 20 });
  task({ title: 'Gas laws test', classId: 'sample_chem', gradeCategoryId: 'ch_t', assignmentType: 'test', dueDate: d(7), pointsPossible: 100, category: 'School' });
  task({ title: 'Cultural project: Día de Muertos', classId: 'sample_span', assignmentType: 'project', dueDate: d(5), pointsPossible: 100, category: 'School', estimateMinutes: 90 });

  // --------------------------------------------------------------- projects
  const projects: Project[] = [
    {
      ...base, id: 'sample_cardshow', name: 'Card Show — Vendor Table', status: 'active', color: COLORS[2],
      description: 'Run a vendor table at the regional sports card show. Goal: move older inventory and pick up graded rookies.',
      startDate: d(-20), deadline: d(24), trackFinances: true, archived: false,
      nextAction: 'Confirm table placement with the organizer',
      milestones: [
        { id: 'cs_m1', title: 'Book table', dueDate: d(-14), done: true },
        { id: 'cs_m2', title: 'Price & sleeve inventory', dueDate: d(10), done: false },
        { id: 'cs_m3', title: 'Display cases + signage ready', dueDate: d(20), done: false },
        { id: 'cs_m4', title: 'Show day', dueDate: d(24), done: false },
      ],
      contacts: [
        { id: 'cs_c1', name: 'Dana Whitfield', role: 'Show organizer', email: 'dana@example.com', phone: '(555) 201-3344' },
        { id: 'cs_c2', name: 'Marcus Lee', role: 'Shares table / trade partner', phone: '(555) 410-9821' },
      ],
      transactions: [
        { id: 'cs_x1', date: d(-14), type: 'expense', amount: 85, description: 'Table fee', category: 'Fees' },
        { id: 'cs_x2', date: d(-6), type: 'expense', amount: 42.5, description: 'Top loaders + penny sleeves', category: 'Supplies' },
      ],
    },
    {
      ...base, id: 'sample_cardsales', name: 'Card Sales (eBay + Whatnot)', status: 'active', color: COLORS[0],
      description: 'Ongoing online sales of singles and lots. Reinvest profits into graded cards.',
      startDate: d(-120), trackFinances: true, archived: false,
      milestones: [
        { id: 'sl_m1', title: '100 sales on eBay', done: true, dueDate: d(-30) },
        { id: 'sl_m2', title: 'First Whatnot stream', dueDate: d(12), done: false },
      ],
      contacts: [{ id: 'sl_c1', name: 'PSA submissions', role: 'Grading service', email: 'support@example.com' }],
      transactions: [
        { id: 'sl_x1', date: d(-25), type: 'revenue', amount: 140, description: 'Rookie auto sale', category: 'Sales' },
        { id: 'sl_x2', date: d(-18), type: 'revenue', amount: 62, description: '3 card lot', category: 'Sales' },
        { id: 'sl_x3', date: d(-15), type: 'expense', amount: 75, description: 'Grading submission (3 cards)', category: 'Grading' },
        { id: 'sl_x4', date: d(-9), type: 'revenue', amount: 210, description: 'Graded PSA 9 sale', category: 'Sales' },
        { id: 'sl_x5', date: d(-4), type: 'expense', amount: 18.4, description: 'Shipping supplies', category: 'Supplies' },
        { id: 'sl_x6', date: d(-2), type: 'revenue', amount: 48, description: 'Singles', category: 'Sales' },
      ],
    },
    {
      ...base, id: 'sample_detail', name: 'Car Detailing', status: 'planning', color: COLORS[5],
      description: 'Weekend mobile detailing for neighbors and family friends. Start with interior + wash packages.',
      startDate: d(-10), deadline: d(40), trackFinances: true, archived: false,
      milestones: [
        { id: 'cd_m1', title: 'Buy starter supplies', dueDate: d(6), done: false },
        { id: 'cd_m2', title: 'Pricing sheet + flyer', dueDate: d(8), done: false },
        { id: 'cd_m3', title: 'First 3 paying customers', dueDate: d(30), done: false },
      ],
      contacts: [{ id: 'cd_c1', name: 'Mrs. Alvarez', role: 'Neighbor — interested in interior detail', phone: '(555) 778-1200' }],
      transactions: [{ id: 'cd_x1', date: d(-3), type: 'expense', amount: 64.99, description: 'Shop vac (used)', category: 'Equipment' }],
    },
    {
      ...base, id: 'sample_digital', name: 'Digital Products', status: 'idea', color: COLORS[4],
      description: 'Notion/printable study planners for students. Validate demand before building.',
      trackFinances: false, archived: false, milestones: [], contacts: [], transactions: [],
      nextAction: 'Ask 10 classmates what planner they would pay for',
    },
  ];

  task({ title: 'Confirm table placement with organizer', projectId: 'sample_cardshow', dueDate: d(1), priority: 'high', category: 'Business' });
  task({ title: 'Sort and price rookie binder', projectId: 'sample_cardshow', milestoneId: 'cs_m2', dueDate: d(6), category: 'Business', estimateMinutes: 90 });
  task({ title: 'Order 2 tabletop display cases', projectId: 'sample_cardshow', milestoneId: 'cs_m3', dueDate: d(12), category: 'Business' });
  task({ title: 'Ship sold orders', projectId: 'sample_cardsales', dueDate: d(0), priority: 'urgent', category: 'Business', estimateMinutes: 30, tags: ['shipping'] });
  task({ title: 'List 15 new singles on eBay', projectId: 'sample_cardsales', dueDate: d(3), category: 'Business', recurrence: { freq: 'weekly', interval: 1 }, estimateMinutes: 60 });
  task({ title: 'Plan first Whatnot stream lineup', projectId: 'sample_cardsales', milestoneId: 'sl_m2', dueDate: d(8), category: 'Business' });
  task({ title: 'Compare detailing supply kits', projectId: 'sample_detail', milestoneId: 'cd_m1', dueDate: d(4), category: 'Business' });
  task({ title: 'Design pricing flyer', projectId: 'sample_detail', milestoneId: 'cd_m2', dueDate: d(8), category: 'Business' });
  task({ title: 'Upload first batch of listings', projectId: 'sample_cardsales', status: 'done', completedAt: ts(-1), dueDate: d(-1), category: 'Business' });

  // ---------------------------------------------------------------- personal
  task({ title: 'Renew driver’s permit appointment', dueDate: d(5), priority: 'high', category: 'Errands' });
  task({ title: 'Clean room + laundry', dueDate: d(0), category: 'Home', estimateMinutes: 45, recurrence: { freq: 'weekly', interval: 1 } });
  task({ title: 'Call grandma', dueDate: d(2), category: 'Personal', estimateMinutes: 20 });
  task({ title: 'Research summer internships', category: 'Personal', priority: 'low', tags: ['career'] });
  task({ title: 'Return library books', dueDate: d(-1), category: 'Errands', status: 'done', completedAt: ts(-1) });
  task({ title: 'Meal prep for the week', dueDate: d(-3), category: 'Health', status: 'done', completedAt: ts(-3) });

  // ------------------------------------------------------------------ habits
  const habitDefs: { id: string; name: string; icon: string; color: string; freq: 'daily' | 'weekly'; days?: number[]; target: number; rate: number }[] = [
    { id: 'sample_h1', name: 'Workout', icon: '💪', color: COLORS[1], freq: 'daily', days: [1, 2, 3, 4, 5], target: 1, rate: 0.8 },
    { id: 'sample_h2', name: 'Read 20 minutes', icon: '📚', color: COLORS[0], freq: 'daily', target: 1, rate: 0.7 },
    { id: 'sample_h3', name: 'Study session (45 min)', icon: '🎯', color: COLORS[2], freq: 'daily', days: [0, 1, 2, 3, 4], target: 1, rate: 0.75 },
    { id: 'sample_h4', name: 'Phone off by 11pm', icon: '🌙', color: COLORS[4], freq: 'daily', target: 1, rate: 0.55 },
    { id: 'sample_h5', name: 'Spanish practice', icon: '🗣️', color: COLORS[3], freq: 'weekly', target: 3, rate: 0.5 },
  ];
  const habits: Habit[] = habitDefs.map((h, i) => {
    const completions: string[] = [];
    for (let n = 42; n >= 1; n--) {
      const date = d(-n);
      if (h.days && !h.days.includes(weekdayOf(date))) continue;
      // Recent days are more consistent so streaks look like real streaks.
      const r = n <= 6 && i < 3 ? 0 : rnd();
      if (r < h.rate) completions.push(date);
    }
    if (i === 1) completions.push(today);
    return {
      ...base, id: h.id, name: h.name, icon: h.icon, color: h.color, frequency: h.freq, daysOfWeek: h.days,
      targetPerWeek: h.target, completions, archived: false, order: i, createdAt: now - 43 * day,
    };
  });

  // ------------------------------------------------------------------- goals
  const week = weekStartISO(today, 1);
  const goals: Goal[] = [
    { ...base, id: 'sample_g1', title: 'Ace the APUSH Unit 2 test', horizon: 'weekly', weekStart: week, progressMode: 'manual', manualProgress: 40, milestones: [], status: 'active', category: 'School' },
    { ...base, id: 'sample_g2', title: 'Hit 5 workouts this week', horizon: 'weekly', weekStart: week, progressMode: 'numeric', current: 2, target: 5, unit: 'workouts', milestones: [], status: 'active', category: 'Health' },
    { ...base, id: 'sample_g3', title: 'Get Card Show inventory ready', horizon: 'weekly', weekStart: week, progressMode: 'tasks', milestones: [], status: 'active', category: 'Business' },
    { ...base, id: 'sample_g4', title: 'Raise Pre-Calc to an A-', horizon: 'short', targetDate: periods[0].end > today ? periods[0].end : d(30), progressMode: 'milestones', status: 'active', category: 'School',
      milestones: [
        { id: 'g4m1', title: 'Go to Ms. Okafor’s office hours', done: true },
        { id: 'g4m2', title: 'Redo missed test problems', done: false },
        { id: 'g4m3', title: 'Score 90%+ on next quiz', done: false },
      ] },
    { ...base, id: 'sample_g5', title: 'Save $3,000 for a car', horizon: 'long', targetDate: d(240), progressMode: 'numeric', current: 1240, target: 3000, unit: '$', milestones: [], status: 'active', category: 'Money' },
    { ...base, id: 'sample_g6', title: 'Graduate with a 3.8+ GPA', horizon: 'long', progressMode: 'manual', manualProgress: 55, milestones: [], status: 'active', category: 'School' },
  ];
  for (const t of tasks) if (t.projectId === 'sample_cardshow') t.goalId = 'sample_g3';

  // ------------------------------------------------------------------ events
  const mwf = [1, 3, 5];
  const events: CalendarEvent[] = [
    { ...base, id: 'sample_e1', title: 'Soccer practice', date: d(-((weekdayOf(today) + 6) % 7)), startTime: '16:00', endTime: '17:45', location: 'North field', color: COLORS[1], recurrence: { freq: 'weekly', interval: 1, daysOfWeek: mwf } },
    { ...base, id: 'sample_e2', title: 'Shift at Rosie’s Diner', date: d(1), startTime: '17:00', endTime: '21:00', color: COLORS[8], recurrence: { freq: 'weekly', interval: 1 } },
    { ...base, id: 'sample_e3', title: 'Chem tutoring', date: d(0), startTime: '15:00', endTime: '15:45', location: 'Lab B', classId: 'sample_chem', color: COLORS[2] },
    { ...base, id: 'sample_e4', title: 'Card show', date: d(24), startTime: '09:00', endTime: '16:00', location: 'Expo Center Hall C', projectId: 'sample_cardshow', color: COLORS[2] },
    { ...base, id: 'sample_e5', title: 'Dentist', date: d(6), startTime: '10:30', endTime: '11:15' },
    { ...base, id: 'sample_e6', title: 'SAT practice test', date: d(11), startTime: '08:00', endTime: '12:00', location: 'Library', color: COLORS[0] },
  ];

  const reminders: Reminder[] = [
    { ...base, id: 'sample_r1', title: 'Bring permission slip for field trip', date: d(0), done: false },
    { ...base, id: 'sample_r2', title: 'Ask Marcus about splitting the table fee', date: d(2), done: false },
    { ...base, id: 'sample_r3', title: 'Pay phone bill', date: d(9), done: false },
  ];

  let noteCount = 0;
  const note = (n: Partial<Note> & { title: string; content: string }): Note => ({
    ...base, id: `sample_n${++noteCount}`, folder: 'General', tags: [], pinned: false, isTemplate: false, links: [], archived: false, ...n,
  });
  const notes: Note[] = [
    note({ title: 'Card show checklist', folder: 'Business', pinned: true, links: [{ type: 'project', id: 'sample_cardshow' }], tags: ['checklist'],
      content: '## Bring\n- [x] Table cloth\n- [ ] 2 display cases\n- [ ] Price stickers\n- [ ] Cash box + $100 in small bills\n- [ ] Card reader (charged)\n\n## Pricing rules\n- Commons in dollar box\n- Rookies: 80% of last 3 sold comps\n- Graded: firm unless bundling' }),
    note({ title: 'APUSH Unit 2 study guide', folder: 'School', links: [{ type: 'class', id: 'sample_apush' }], tags: ['study'],
      content: '## Key themes\n- Causes of the Revolution: taxation, Enlightenment ideas, salutary neglect ending\n- Articles of Confederation weaknesses\n- Constitutional Convention compromises (Great Compromise, 3/5)\n\n## Practice\n- [ ] Review ch. 5–6 notes\n- [ ] Do 2 practice SAQs\n- [ ] Flashcards: 40 terms' }),
    note({ title: 'Detailing package ideas', folder: 'Ideas', links: [{ type: 'project', id: 'sample_detail' }],
      content: '**Basic wash** — $35: exterior wash, tires, windows\n**Interior** — $60: vacuum, wipe-down, glass\n**Full** — $90: both + quick wax\n\nIdea: punch card — 5th wash free.' }),
    note({ title: 'Planner product survey questions', folder: 'Ideas', links: [{ type: 'project', id: 'sample_digital' }],
      content: '1. What do you use to track homework now?\n2. Would you pay $5 for a template?\n3. Digital or printable?\n4. Must-have sections?' }),
    note({ title: 'Meeting notes', folder: 'General', isTemplate: true,
      content: '## Meeting — {{date}}\n**With:** \n\n### Agenda\n- \n\n### Notes\n- \n\n### Action items\n- [ ] ' }),
    note({ title: 'Class notes', folder: 'School', isTemplate: true,
      content: '## {{date}} — Topic: \n\n### Key ideas\n- \n\n### Questions to ask\n- \n\n### Summary (3 sentences)\n' }),
  ];

  const journal: JournalEntry[] = [
    { ...base, id: 'sample_j1', date: d(-1), mood: 4, energy: 3, content: 'Productive day. Finished problem set early and got two listings up. Need to start the lab report sooner next time instead of the night before.', wins: 'Sold the PSA 9 for asking price.', gratitude: 'Coach letting me leave early for tutoring.' },
    { ...base, id: 'sample_j2', date: d(-3), mood: 3, energy: 2, content: 'Tired after practice. Skipped reading. Want to protect 9–10pm for studying.', wins: 'Meal prepped for the week.' },
  ];

  return {
    data: { tasks, classes, projects, habits, goals, events, reminders, notes, journal, dayPlans: [], reviews: [] },
    markingPeriods: periods,
    pastTerms: [
      { id: 'sample_pt1', name: '9th grade', gpa: 3.62, credits: 7 },
      { id: 'sample_pt2', name: '10th grade', gpa: 3.71, credits: 7 },
    ],
    gpaGoal: 3.8,
  };
}
