import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { create } from 'zustand';
import { cn } from '@/lib/util';
import { Button, IconButton } from './primitives';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'md',
  description,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === 'Tab' && panel.current) {
        const items = panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    // Focus the first field (or the panel) on open.
    requestAnimationFrame(() => {
      const target = panel.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]), textarea, select') ?? panel.current;
      target?.focus();
    });
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:p-6 sm:pt-[8vh]">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92vh] w-full animate-pop-in flex-col rounded-t-2xl border border-line-strong bg-surface shadow-pop focus:outline-none sm:max-h-[84vh] sm:rounded-2xl',
          widths[width],
        )}
      >
        {title && (
          <div className="flex items-start gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
              {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
            </div>
            <IconButton label="Close" size="xs" onClick={onClose} className="-mr-1.5 -mt-0.5">
              <X size={16} />
            </IconButton>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Confirmation dialog — `await confirmAction({...})` anywhere.
// ---------------------------------------------------------------------------

interface ConfirmRequest {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

const useConfirm = create<{ req: ConfirmRequest | null }>(() => ({ req: null }));

export function confirmAction(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useConfirm.setState({ req: { ...opts, resolve } }));
}

export function ConfirmHost() {
  const req = useConfirm((s) => s.req);
  const done = (ok: boolean) => {
    req?.resolve(ok);
    useConfirm.setState({ req: null });
  };
  return (
    <Modal
      open={!!req}
      onClose={() => done(false)}
      title={req?.title}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => done(false)}>
            Cancel
          </Button>
          <Button variant={req?.danger === false ? 'primary' : 'danger'} onClick={() => done(true)} data-autofocus>
            {req?.confirmLabel ?? 'Delete'}
          </Button>
        </>
      }
    >
      <div className="text-[13px] leading-relaxed text-muted">{req?.message ?? 'This cannot be undone.'}</div>
    </Modal>
  );
}
