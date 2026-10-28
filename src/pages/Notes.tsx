import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Archive, ArrowLeft, Eye, FileText, Folder, FolderPlus, LayoutTemplate, Link2, NotebookPen, Pencil, Pin, Plus, Search, Trash2, X } from 'lucide-react';
import type { Note, NoteLink } from '@shared/schema';
import { useStore } from '@/lib/store';
import { navigate, useRoute } from '@/lib/router';
import { formatLong, todayISO } from '@/lib/dates';
import { cn, plural } from '@/lib/util';
import { toast } from '@/lib/toast';
import { Badge, Button, EmptyState, IconButton, PageHeader } from '@/components/ui/primitives';
import { confirmAction } from '@/components/ui/Modal';
import { MenuItem, Popover, TagInput } from '@/components/ui/Field';
import { Markdown, toggleCheckboxLine } from '@/components/Markdown';

type Filter = { kind: 'all' } | { kind: 'pinned' } | { kind: 'folder'; name: string } | { kind: 'templates' } | { kind: 'archived' };

const preview = (n: Note) => n.content.replace(/^#+\s*/gm, '').replace(/[*`>[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 140);

export function NoteCard({ note }: { note: Note }) {
  return (
    <a href={`#/notes/${note.id}`} className="card block p-4 transition-colors hover:border-line-strong">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{note.title || 'Untitled'}</p>
        {note.pinned && <Pin size={13} className="shrink-0 text-warn" />}
      </div>
      <p className="mt-1 line-clamp-3 min-h-[3em] text-xs leading-relaxed text-faint">{preview(note) || 'Empty note'}</p>
      <p className="mt-2 text-[11px] text-faint">
        {note.folder} · {formatDistanceToNow(note.updatedAt, { addSuffix: true })}
      </p>
    </a>
  );
}

export function createNoteFromTemplate(template?: Note, folder?: string) {
  const content = template ? template.content.replace(/\{\{date\}\}/g, formatLong(todayISO())) : '';
  const n = useStore.getState().create('notes', {
    title: template ? `${template.title} — ${todayISO()}` : '',
    content,
    folder: folder ?? template?.folder ?? 'General',
    tags: template?.tags ?? [],
    pinned: false,
    isTemplate: false,
    links: [],
    archived: false,
  });
  navigate(`/notes/${n.id}`);
  return n;
}

export function NotesPage() {
  const route = useRoute();
  const id = route.path[1];
  const notes = useStore((s) => s.notes);
  const folders = useStore((s) => s.settings.noteFolders);
  const updateSettings = useStore((s) => s.updateSettings);
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [q, setQ] = useState('');
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const templates = notes.filter((n) => n.isTemplate && !n.archived);

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return notes
      .filter((n) => {
        if (filter.kind === 'archived') return n.archived;
        if (n.archived) return false;
        if (filter.kind === 'templates') return n.isTemplate;
        if (n.isTemplate) return false;
        if (filter.kind === 'pinned') return n.pinned;
        if (filter.kind === 'folder') return n.folder === filter.name;
        return true;
      })
      .filter((n) => !ql || `${n.title} ${n.content} ${n.tags.join(' ')}`.toLowerCase().includes(ql))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  }, [notes, filter, q]);

  const count = (f: (n: Note) => boolean) => notes.filter((n) => !n.archived && !n.isTemplate && f(n)).length;
  const allFolders = [...new Set([...folders, ...notes.map((n) => n.folder)])];
  const newNote = () => createNoteFromTemplate(undefined, filter.kind === 'folder' ? filter.name : undefined);

  const FilterBtn = ({ f, label, icon, n }: { f: Filter; label: string; icon: React.ReactNode; n?: number }) => {
    const active = JSON.stringify(f) === JSON.stringify(filter);
    return (
      <button
        type="button"
        onClick={() => {
          setFilter(f);
          if (id) navigate('/notes');
        }}
        className={cn('flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors', active ? 'bg-surface-3 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}
      >
        <span className="text-faint">{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        {n !== undefined && n > 0 && <span className="text-[11px] tabular-nums text-faint">{n}</span>}
      </button>
    );
  };

  return (
    <div>
      <PageHeader
        title="Notes"
        subtitle="Ideas, class notes, checklists and meeting notes — searchable and linked to your projects, classes and goals."
        actions={
          <>
            {templates.length > 0 && (
              <Popover
                width={240}
                trigger={({ toggle, ref }) => (
                  <Button ref={ref} size="sm" icon={<LayoutTemplate size={14} />} onClick={toggle}>
                    From template
                  </Button>
                )}
              >
                {(close) => (
                  <>
                    {templates.map((t) => (
                      <MenuItem key={t.id} icon={<FileText size={14} />} onClick={() => (close(), createNoteFromTemplate(t))}>
                        {t.title || 'Untitled template'}
                      </MenuItem>
                    ))}
                  </>
                )}
              </Popover>
            )}
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={newNote}>
              New note
            </Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className={cn('space-y-4', id && 'hidden lg:block')}>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-2.5 text-faint" />
            <input className="input pl-8" placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notes" />
          </div>
          <div className="space-y-0.5">
            <FilterBtn f={{ kind: 'all' }} label="All notes" icon={<NotebookPen size={14} />} n={count(() => true)} />
            <FilterBtn f={{ kind: 'pinned' }} label="Pinned" icon={<Pin size={14} />} n={count((n) => n.pinned)} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between px-2.5">
              <p className="eyebrow">Folders</p>
              <IconButton label="New folder" size="xs" onClick={() => setNewFolder('')}>
                <FolderPlus size={13} />
              </IconButton>
            </div>
            {newFolder !== null && (
              <form
                className="mb-1 px-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newFolder.trim();
                  if (!name) return setNewFolder(null);
                  if (allFolders.includes(name)) return toast.error('That folder already exists');
                  updateSettings({ noteFolders: [...folders, name] });
                  setNewFolder(null);
                  setFilter({ kind: 'folder', name });
                }}
              >
                <input
                  className="input !h-8 text-xs"
                  value={newFolder}
                  maxLength={60}
                  autoFocus
                  placeholder="Folder name, then Enter"
                  aria-label="New folder name"
                  onChange={(e) => setNewFolder(e.target.value)}
                  onBlur={() => !newFolder.trim() && setNewFolder(null)}
                  onKeyDown={(e) => e.key === 'Escape' && setNewFolder(null)}
                />
              </form>
            )}
            <div className="space-y-0.5">
              {allFolders.map((f) => (
                <div key={f} className="group relative">
                  <FilterBtn f={{ kind: 'folder', name: f }} label={f} icon={<Folder size={14} />} n={count((n) => n.folder === f)} />
                  {count((n) => n.folder === f) === 0 && folders.includes(f) && (
                    <button type="button" aria-label={`Delete folder ${f}`} className="absolute right-1.5 top-1.5 hidden rounded p-0.5 text-faint hover:text-bad group-hover:block" onClick={() => updateSettings({ noteFolders: folders.filter((x) => x !== f) })}>
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-0.5">
            <FilterBtn f={{ kind: 'templates' }} label="Templates" icon={<LayoutTemplate size={14} />} n={templates.length} />
            <FilterBtn f={{ kind: 'archived' }} label="Archived" icon={<Archive size={14} />} />
          </div>
        </aside>

        <div className="min-w-0">
          {id ? (
            <NoteEditor key={id} id={id} />
          ) : list.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<NotebookPen size={18} />}
                title={q ? `No notes match “${q}”` : filter.kind === 'templates' ? 'No templates yet' : 'No notes here yet'}
                action={!q && <Button variant="primary" icon={<Plus size={14} />} onClick={newNote}>New note</Button>}
              >
                {filter.kind === 'templates' ? 'Open any note and turn on “Use as template” to reuse its structure. Use {{date}} to insert the date.' : 'Notes support Markdown: # headings, - lists, - [ ] checklists, **bold**.'}
              </EmptyState>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((n) => (
                <NoteCard key={n.id} note={n} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NoteEditor({ id }: { id: string }) {
  const note = useStore((s) => s.notes.find((n) => n.id === id));
  const folders = useStore((s) => s.settings.noteFolders);
  const projects = useStore((s) => s.projects);
  const classes = useStore((s) => s.classes);
  const goals = useStore((s) => s.goals);
  const update = useStore((s) => s.update);
  const remove = useStore((s) => s.remove);
  const [title, setTitle] = useState(note?.title ?? '');
  const [content, setContent] = useState(note?.content ?? '');
  const [mode, setMode] = useState<'edit' | 'preview'>(note && note.content.trim() ? 'preview' : 'edit');
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ title, content });
  latest.current = { title, content };

  // Persist pending text if the editor unmounts mid-debounce.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        const s = useStore.getState();
        if (s.notes.some((n) => n.id === id)) s.update('notes', id, { title: latest.current.title, content: latest.current.content });
      }
    },
    [id],
  );

  if (!note)
    return (
      <div className="card">
        <EmptyState title="Note not found" action={<Button onClick={() => navigate('/notes')}>All notes</Button>}>
          It may have been deleted.
        </EmptyState>
      </div>
    );

  const scheduleSave = (next: { title?: string; content?: string }) => {
    setSaving(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      update('notes', id, { title: next.title ?? latest.current.title, content: next.content ?? latest.current.content });
      setSaving(false);
    }, 500);
  };

  const linkName = (l: NoteLink) => (l.type === 'project' ? projects.find((p) => p.id === l.id)?.name : l.type === 'class' ? classes.find((c) => c.id === l.id)?.name : goals.find((g) => g.id === l.id)?.title);
  const linkHref = (l: NoteLink) => (l.type === 'project' ? `#/business/${l.id}` : l.type === 'class' ? `#/school/class/${l.id}` : '#/habits?tab=goals');
  const addLink = (l: NoteLink) => {
    if (note.links.some((x) => x.id === l.id)) return;
    update('notes', id, { links: [...note.links, l] });
  };
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <div className="card flex min-h-[70vh] flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        <IconButton label="Back to notes" size="sm" onClick={() => navigate('/notes')}>
          <ArrowLeft size={16} />
        </IconButton>
        <select className="input !h-8 !w-auto text-xs" value={note.folder} onChange={(e) => update('notes', id, { folder: e.target.value })} aria-label="Folder">
          {[...new Set([...folders, note.folder])].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <Popover
          width={260}
          align="start"
          trigger={({ toggle, ref }) => (
            <Button ref={ref} size="sm" variant="ghost" icon={<Link2 size={14} />} onClick={toggle}>
              Link
            </Button>
          )}
        >
          {(close) => (
            <div className="max-h-80 overflow-y-auto">
              {[
                { type: 'project' as const, label: 'Projects', items: projects.filter((p) => !p.archived).map((p) => ({ id: p.id, name: p.name })) },
                { type: 'class' as const, label: 'Classes', items: classes.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name })) },
                { type: 'goal' as const, label: 'Goals', items: goals.filter((g) => g.status === 'active').map((g) => ({ id: g.id, name: g.title })) },
              ].map((group) =>
                group.items.length ? (
                  <div key={group.type}>
                    <p className="eyebrow px-2 pb-1 pt-2">{group.label}</p>
                    {group.items.map((it) => (
                      <MenuItem key={it.id} onClick={() => (addLink({ type: group.type, id: it.id }), close())} hint={note.links.some((l) => l.id === it.id) ? 'linked' : undefined}>
                        {it.name}
                      </MenuItem>
                    ))}
                  </div>
                ) : null,
              )}
              {!projects.length && !classes.length && !goals.length && <p className="p-3 text-xs text-faint">Create a project, class or goal to link notes to it.</p>}
            </div>
          )}
        </Popover>
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-2 hidden text-[11px] text-faint sm:inline">{saving ? 'Saving…' : `Saved · ${plural(words, 'word')}`}</span>
          <Button size="sm" variant="ghost" icon={mode === 'edit' ? <Eye size={14} /> : <Pencil size={14} />} onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}>
            {mode === 'edit' ? 'Preview' : 'Edit'}
          </Button>
          <IconButton label={note.pinned ? 'Unpin' : 'Pin'} size="sm" className={cn(note.pinned && '!text-warn')} onClick={() => update('notes', id, { pinned: !note.pinned })}>
            <Pin size={15} fill={note.pinned ? 'currentColor' : 'none'} />
          </IconButton>
          <IconButton
            label={note.archived ? 'Unarchive' : 'Archive'}
            size="sm"
            onClick={() => {
              update('notes', id, { archived: !note.archived });
              toast.info(note.archived ? 'Note restored' : 'Note archived');
              if (!note.archived) navigate('/notes');
            }}
          >
            <Archive size={15} />
          </IconButton>
          <IconButton
            label="Delete note"
            size="sm"
            className="hover:!text-bad"
            onClick={async () => {
              if (await confirmAction({ title: 'Delete this note?', message: `“${note.title || 'Untitled'}” will be permanently deleted.` })) {
                if (timer.current) clearTimeout(timer.current);
                timer.current = null;
                remove('notes', id);
                navigate('/notes');
                toast.info('Note deleted');
              }
            }}
          >
            <Trash2 size={15} />
          </IconButton>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-5 py-4 sm:px-8">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            scheduleSave({ title: e.target.value });
          }}
          placeholder="Untitled"
          className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-faint"
          aria-label="Note title"
          maxLength={200}
          autoFocus={!note.title}
        />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {note.isTemplate && <Badge tone="accent">Template</Badge>}
          {note.links.map((l) => (
            <span key={l.id} className="inline-flex h-6 items-center gap-1 rounded-md bg-surface-3 pl-2 pr-1 text-xs text-muted">
              <a href={linkHref(l)} className="hover:text-accent">
                {l.type === 'project' ? '◆' : l.type === 'class' ? '🎓' : '🎯'} {linkName(l) ?? 'Deleted'}
              </a>
              <button type="button" aria-label="Remove link" className="rounded px-1 text-faint hover:text-fg" onClick={() => update('notes', id, { links: note.links.filter((x) => x.id !== l.id) })}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="mt-4 flex-1">
          {mode === 'edit' ? (
            <textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                scheduleSave({ content: e.target.value });
              }}
              placeholder={'Start writing…\n\n# Heading\n- list item\n- [ ] checklist item\n**bold** *italic* `code` [link](https://…)'}
              className="h-full min-h-[46vh] w-full resize-none bg-transparent font-mono text-[13.5px] leading-relaxed outline-none placeholder:text-faint"
              aria-label="Note content"
              autoFocus={!!note.title}
            />
          ) : content.trim() ? (
            <div onDoubleClick={() => setMode('edit')}>
              <Markdown
                source={content}
                onToggleCheckbox={(line) => {
                  const next = toggleCheckboxLine(content, line);
                  setContent(next);
                  scheduleSave({ content: next });
                }}
              />
            </div>
          ) : (
            <button type="button" className="text-[13px] text-faint hover:text-fg" onClick={() => setMode('edit')}>
              Empty note — click to write
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-line px-5 py-3 sm:px-8">
        <div className="min-w-[200px] flex-1">
          <TagInput value={note.tags} onChange={(tags) => update('notes', id, { tags })} />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={note.isTemplate} onChange={(e) => update('notes', id, { isTemplate: e.target.checked })} className="accent-[rgb(var(--accent))]" />
          Use as template
        </label>
        <span className="text-[11px] text-faint">Edited {formatDistanceToNow(note.updatedAt, { addSuffix: true })}</span>
      </div>
    </div>
  );
}
