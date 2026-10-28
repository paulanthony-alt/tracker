import { isValidElement, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/util';

/**
 * A labelled form field. Wraps a single native input/select/textarea in a
 * <label> (click-to-focus + accessible name); anything else — button groups,
 * pickers — gets a role="group" container instead, so the label text can't
 * accidentally "click" the first button inside it.
 */
export function Field({ label, error, hint, children, className }: { label?: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  const native = isValidElement(children) && typeof children.type === 'string' && ['input', 'select', 'textarea'].includes(children.type);
  const labelId = useId();
  const body = (
    <>
      {label && (
        <span className="label" id={native ? undefined : labelId}>
          {label}
        </span>
      )}
      {children}
      {error ? <span className="mt-1 block text-xs text-bad">{error}</span> : hint ? <span className="mt-1 block text-xs text-faint">{hint}</span> : null}
    </>
  );
  return native ? (
    <label className={cn('block', className)}>{body}</label>
  ) : (
    <div role="group" aria-labelledby={label ? labelId : undefined} className={cn('block', className)}>
      {body}
    </div>
  );
}

/** Tag input: type and press Enter or comma. */
export function TagInput({ value, onChange, placeholder = 'Add tag…' }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const t = draft.trim().replace(/^#/, '').toLowerCase();
    if (t && !value.includes(t) && t.length <= 40) onChange([...value, t]);
    setDraft('');
  };
  return (
    <div className="input flex h-auto min-h-9 flex-wrap items-center gap-1 py-1">
      {value.map((t) => (
        <span key={t} className="inline-flex h-6 items-center gap-1 rounded-md bg-surface-3 pl-2 pr-1 text-xs text-muted">
          #{t}
          <button type="button" aria-label={`Remove ${t}`} className="rounded px-1 text-faint hover:text-fg" onClick={() => onChange(value.filter((x) => x !== t))}>
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={commit}
        placeholder={value.length ? '' : placeholder}
        aria-label="Add tag"
        className="h-7 min-w-[80px] flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
      />
    </div>
  );
}

/** Lightweight popover menu anchored to a trigger. */
export function Popover({
  trigger,
  children,
  align = 'end',
  width = 240,
}: {
  trigger: (props: { open: boolean; toggle: () => void; ref: React.RefObject<HTMLButtonElement | null> }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const left = align === 'end' ? r.right - width : r.left;
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(left, window.innerWidth - width - 8)) });
    const onDown = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, align, width]);

  return (
    <>
      {trigger({ open, toggle: () => setOpen((o) => !o), ref })}
      {open &&
        createPortal(
          <div
            ref={panel}
            className="fixed z-[60] animate-pop-in overflow-hidden rounded-xl border border-line-strong bg-surface p-1 shadow-pop"
            style={{ top: pos.top, left: pos.left, width, maxHeight: `calc(100vh - ${pos.top + 16}px)`, overflowY: 'auto' }}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  );
}

export function MenuItem({ icon, children, onClick, danger, hint }: { icon?: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean; hint?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] transition-colors',
        danger ? 'text-bad hover:bg-bad/10' : 'text-fg hover:bg-surface-3',
      )}
    >
      {icon && <span className={cn('shrink-0', danger ? 'text-bad' : 'text-faint')}>{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {hint && <span className="text-xs text-faint">{hint}</span>}
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
}) {
  return (
    <div className="inline-flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-8 min-w-8 rounded-lg border px-2.5 text-xs font-medium transition-colors',
            value === o.value ? 'border-accent/50 bg-accent/12 text-accent' : 'border-line bg-surface-2 text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
