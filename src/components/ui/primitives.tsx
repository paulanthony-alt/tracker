import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/util';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'xs' | 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-fg shadow-glow [background-image:linear-gradient(180deg,rgb(255_255_255/0.14),transparent)] hover:brightness-110 active:brightness-95',
  secondary: 'bg-surface-2/80 text-fg border border-line hover:border-accent/45 hover:bg-surface-3',
  subtle: 'bg-surface-2 text-muted hover:text-fg hover:bg-surface-3',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
  danger: 'bg-bad/10 text-bad border border-bad/30 hover:bg-bad/20',
};
const SIZES: Record<Size, string> = {
  xs: 'h-7 px-2 text-xs gap-1 rounded-md',
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-md',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton(
  { label, className, size = 'sm', variant = 'ghost', children, ...rest },
  ref,
) {
  const dims = size === 'xs' ? 'h-7 w-7' : size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  return (
    <Button ref={ref} aria-label={label} title={label} variant={variant} size={size} className={cn(dims, '!px-0', className)} {...rest}>
      {children}
    </Button>
  );
});

export function Card({
  title,
  icon,
  action,
  children,
  className,
  bodyClassName,
  subtitle,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('card flex min-w-0 flex-col', className)}>
      {(title || action) && (
        <header className="flex min-h-[46px] items-center gap-2.5 border-b border-line/70 px-4 py-2">
          {icon ? <span className="text-accent/90 [&>svg]:h-[14px] [&>svg]:w-[14px]">{icon}</span> : <span className="h-3 w-[3px] shrink-0 rounded-full bg-accent shadow-[0_0_8px_rgb(var(--accent)/0.8)]" aria-hidden />}
          <div className="min-w-0 flex-1">
            {title && <h2 className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-fg/90">{title}</h2>}
            {subtitle && <p className="truncate text-xs text-faint">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn('flex-1 px-4 pb-4 pt-3.5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
  dot,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'good' | 'warn' | 'bad';
  className?: string;
  dot?: string;
}) {
  const tones = {
    neutral: 'border-line-strong/70 bg-surface-3/60 text-muted',
    accent: 'border-accent/30 bg-accent/10 text-accent',
    good: 'border-good/30 bg-good/10 text-good',
    warn: 'border-warn/30 bg-warn/10 text-warn',
    bad: 'border-bad/30 bg-bad/10 text-bad',
  };
  return (
    <span className={cn('inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded border px-1.5 text-[11px] font-medium', tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  round,
  color,
  size = 18,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  round?: boolean;
  color?: string;
  size?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        'group relative inline-flex shrink-0 items-center justify-center border-[1.5px] transition-all duration-150',
        round ? 'rounded-full' : 'rounded-[6px]',
        checked ? 'border-transparent shadow-[0_0_10px_-2px_rgb(var(--accent)/0.7)]' : 'border-line-strong hover:border-accent/60',
        className,
      )}
      style={{ width: size, height: size, background: checked ? color ?? 'rgb(var(--accent))' : undefined }}
    >
      <Check
        strokeWidth={3.2}
        className={cn('transition-all duration-150', checked ? 'scale-100 opacity-100' : 'scale-50 opacity-0 group-hover:scale-75 group-hover:opacity-30')}
        style={{ width: size * 0.62, height: size * 0.62, color: checked ? (color ? '#0b0b0d' : 'rgb(var(--accent-fg))') : 'rgb(var(--faint))' }}
      />
    </button>
  );
}

export function ProgressBar({ value, color, className, height = 5 }: { value: number | null; color?: string; className?: string; height?: number }) {
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn('w-full overflow-hidden rounded-full bg-surface-3 shadow-[inset_0_0_0_1px_rgb(var(--line)/0.6)]', className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${v}%`, background: color ?? 'linear-gradient(90deg, rgb(var(--accent) / 0.75), rgb(var(--accent)))', boxShadow: `0 0 10px -1px ${color ?? 'rgb(var(--accent) / 0.8)'}` }}
      />
    </div>
  );
}

export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  color,
  children,
  label,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--surface-3))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? 'rgb(var(--accent))'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
          style={{ filter: `drop-shadow(0 0 ${Math.max(3, stroke * 0.8)}px ${color ?? 'rgb(var(--accent) / 0.75)'})` }}
        />
        {/* Thin gaps every 9° split the ring into segments, like a gauge. */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--surface))" strokeWidth={stroke + 2} strokeDasharray={`1.2 ${(c / 40 - 1.2).toFixed(3)}`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="tablist" className={cn('inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-line bg-surface/80 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-md font-medium transition-colors',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
            value === o.value ? 'bg-surface-3 text-fg shadow-[inset_0_-1.5px_0_rgb(var(--accent)),0_1px_0_rgb(255_255_255/0.03)_inset]' : 'text-muted hover:bg-surface-2 hover:text-fg',
          )}
        >
          {o.label}
          {o.count !== undefined && o.count > 0 && (
            <span className={cn('rounded px-1 font-mono text-[10px] tabular-nums', value === o.value ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-faint')}>{o.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  compact,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-6' : 'py-14')}>
      {icon && <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-accent/80 shadow-[0_0_24px_-8px_rgb(var(--accent)/0.6)]">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-[13px] leading-relaxed text-faint">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, kicker }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; kicker?: ReactNode }) {
  return (
    <div className="relative mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
      <div className="min-w-0">
        {kicker && <p className="eyebrow mb-1.5 text-accent/90">{kicker}</p>}
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      <span className="absolute -bottom-px left-0 h-px w-24 bg-accent shadow-[0_0_10px_rgb(var(--accent))]" aria-hidden />
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="card px-4 py-3.5">
      <p className="eyebrow">{label}</p>
      <p className={cn('readout mt-1.5 text-2xl font-semibold', tone === 'good' && 'text-good', tone === 'warn' && 'text-warn', tone === 'bad' && 'text-bad')}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-faint">{sub}</p>}
    </div>
  );
}

export function ColorDot({ color, size = 8 }: { color?: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color ?? 'rgb(var(--faint))' }} />;
}
