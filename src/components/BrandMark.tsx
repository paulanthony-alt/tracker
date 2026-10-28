import { cn } from '@/lib/util';

/** The Vyro "V" mark. `full` shows the complete app icon with the wordmark. */
export function BrandMark({ className, full }: { className?: string; full?: boolean }) {
  return <img src={full ? 'icons/icon-192.png' : 'icons/mark-128.png'} alt="" aria-hidden draggable={false} className={cn('shrink-0 select-none', className)} />;
}
