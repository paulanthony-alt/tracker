import type { AppState } from './store';

export interface SearchResult {
  type: 'task' | 'assignment' | 'note' | 'project' | 'class' | 'goal' | 'habit' | 'event' | 'journal' | 'reminder';
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  score: number;
}

function scoreText(q: string, title: string, body = ''): number {
  const t = title.toLowerCase();
  const b = body.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/\s+/).some((w) => w.startsWith(q))) return 65;
  if (t.includes(q)) return 50;
  if (b.includes(q)) return 25;
  return 0;
}

/** Search everything. Each whitespace-separated term must match somewhere. */
export function searchAll(s: AppState, query: string, limit = 40): SearchResult[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const results: SearchResult[] = [];
  const add = (r: Omit<SearchResult, 'score'>, title: string, body: string) => {
    let total = 0;
    for (const term of terms) {
      const sc = scoreText(term, title, body);
      if (!sc) return;
      total += sc;
    }
    results.push({ ...r, score: total / terms.length });
  };
  const cls = (id?: string) => s.classes.find((c) => c.id === id)?.name;
  const prj = (id?: string) => s.projects.find((p) => p.id === id)?.name;

  for (const t of s.tasks) {
    if (t.archived) continue;
    const isA = !!t.classId;
    add(
      {
        type: isA ? 'assignment' : 'task',
        id: t.id,
        title: t.title,
        subtitle: [cls(t.classId) ?? prj(t.projectId), t.dueDate && `due ${t.dueDate}`, t.status === 'done' && 'done'].filter(Boolean).join(' · '),
        href: `#/tasks?task=${t.id}`,
      },
      t.title,
      `${t.notes ?? ''} ${t.tags.join(' ')} ${t.category ?? ''} ${cls(t.classId) ?? ''} ${prj(t.projectId) ?? ''}`,
    );
  }
  for (const n of s.notes) {
    if (n.archived) continue;
    add({ type: 'note', id: n.id, title: n.title || 'Untitled', subtitle: `${n.folder}${n.isTemplate ? ' · template' : ''}`, href: `#/notes/${n.id}` }, n.title, `${n.content} ${n.tags.join(' ')}`);
  }
  for (const p of s.projects) add({ type: 'project', id: p.id, title: p.name, subtitle: p.status, href: `#/business/${p.id}` }, p.name, `${p.description ?? ''} ${p.contacts.map((c) => `${c.name} ${c.role ?? ''} ${c.email ?? ''}`).join(' ')} ${p.milestones.map((m) => m.title).join(' ')}`);
  for (const c of s.classes) add({ type: 'class', id: c.id, title: c.name, subtitle: c.teacher, href: `#/school/class/${c.id}` }, c.name, `${c.teacher ?? ''} ${c.room ?? ''}`);
  for (const g of s.goals) add({ type: 'goal', id: g.id, title: g.title, subtitle: `${g.horizon} goal`, href: `#/habits?tab=goals&goal=${g.id}` }, g.title, g.description ?? '');
  for (const h of s.habits) add({ type: 'habit', id: h.id, title: h.name, subtitle: h.frequency, href: '#/habits' }, h.name, h.description ?? '');
  for (const e of s.events) add({ type: 'event', id: e.id, title: e.title, subtitle: e.date, href: `#/calendar?date=${e.date}&view=day` }, e.title, `${e.location ?? ''} ${e.notes ?? ''}`);
  for (const j of s.journal) add({ type: 'journal', id: j.id, title: `Journal — ${j.date}`, subtitle: j.content.slice(0, 60), href: `#/habits?tab=journal&date=${j.date}` }, '', `${j.content} ${j.wins ?? ''} ${j.gratitude ?? ''}`);
  for (const r of s.reminders) add({ type: 'reminder', id: r.id, title: r.title, subtitle: r.date, href: '#/' }, r.title, '');

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
