import { cn } from '@/lib/util';

/** The Vyro "V" mark. `full` shows the complete app icon with the wordmark. */
export function BrandMark({ className, full }: { className?: string; full?: boolean }) {
  return <img src={full ? 'icons/icon-192.png' : 'icons/mark-128.png'} alt="" aria-hidden draggable={false} className={cn('shrink-0 select-none', className)} />;
}

/** The "VYRO" wordmark, drawn in the current text colour so it works in both themes. */
export function Wordmark({ className }: { className?: string }) {
  const mask = 'url(icons/wordmark.png) center / contain no-repeat';
  return <span role="img" aria-label="Vyro" className={cn('inline-block aspect-[434/64] shrink-0 bg-current', className)} style={{ mask, WebkitMask: mask }} />;
}

/** The V mark and wordmark side by side, as used in the app header. */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <BrandMark className="h-8 w-8 rounded-lg" />
      <Wordmark className="h-3.5 text-fg" />
    </span>
  );
}

/** Full-screen loading state while Vyro starts up. */
export function BootScreen({ label = 'Initializing' }: { label?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4" role="status" aria-label="Loading">
      <div className="relative">
        <div className="absolute -inset-6 animate-pulse rounded-full bg-accent/20 blur-2xl" aria-hidden />
        <BrandMark className="relative h-12 w-12 rounded-xl" />
      </div>
      <p className="eyebrow flex items-center gap-2">
        <span className="led animate-pulse text-accent" aria-hidden />
        {label}
      </p>
    </div>
  );
}
