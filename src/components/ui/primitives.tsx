import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/util';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'xs' | 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 active:brightness-95 shadow-[0_1px_0_0_rgb(255_255_255/0.15)_inset]',
  secondary: 'bg-surface-2 text-fg border border-line hover:bg-surface-3 hover:border-line-strong',
  subtle: 'bg-surface-2 text-muted hover:text-fg hover:bg-surface-3',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
  danger: 'bg-bad/10 text-bad border border-bad/25 hover:bg-bad/20',
};
const SIZES: Record<Size, string> = {
  xs: 'h-7 px-2 text-xs gap-1 rounded-md',
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
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
    <section className={cn('card flex flex-col', className)}>
      {(title || action) && (
        <header className="flex min-h-[52px] items-center gap-2 px-4 pt-3">
          {icon && <span className="text-faint">{icon}</span>}
          <div className="min-w-0 flex-1">
            {title && <h2 className="truncate text-[13px] font-semibold tracking-tight">{title}</h2>}
            {subtitle && <p className="truncate text-xs text-faint">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn('flex-1 px-4 pb-4 pt-2', bodyClassName)}>{children}</div>
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
    neutral: 'bg-surface-3 text-muted',
    accent: 'bg-accent/12 text-accent',
    good: 'bg-good/12 text-good',
    warn: 'bg-warn/12 text-warn',
    bad: 'bg-bad/12 text-bad',
  };
  return (
    <span className={cn('inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] font-medium', tones[tone], className)}>
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
        checked ? 'border-transparent' : 'border-line-strong hover:border-faint',
        className,
      )}
      style={{ width: size, height: size, background: checked ? color ?? 'rgb(var(--accent))' : undefined }}
    >
      <Check
        strokeWidth={3.2}
        className={cn('transition-all duration-150', checked ? 'scale-100 opacity-100' : 'scale-50 opacity-0 group-hover:scale-75 group-hover:opacity-30')}
        style={{ width: size * 0.62, height: size * 0.62, color: checked ? '#0b0b0d' : 'rgb(var(--faint))' }}
      />
    </button>
  );
}

export function ProgressBar({ value, color, className, height = 6 }: { value: number | null; color?: string; className?: string; height?: number }) {
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn('w-full overflow-hidden rounded-full bg-surface-3', className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${v}%`, background: color ?? 'rgb(var(--accent))' }} />
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
      <svg width={size} height={size} className="-rotate-90">
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
        />
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
    <div role="tablist" className={cn('inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-line bg-surface p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-lg font-medium transition-colors',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
            value === o.value ? 'bg-surface-3 text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
          {o.count !== undefined && o.count > 0 && (
            <span className={cn('rounded px-1 text-[10px] tabular-nums', value === o.value ? 'bg-surface-2 text-muted' : 'bg-surface-2 text-faint')}>{o.count}</span>
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
      {icon && <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface-2 text-faint">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-[13px] leading-relaxed text-faint">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="card px-4 py-3.5">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold tracking-tight', tone === 'good' && 'text-good', tone === 'warn' && 'text-warn', tone === 'bad' && 'text-bad')}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-faint">{sub}</p>}
    </div>
  );
}

export function ColorDot({ color, size = 8 }: { color?: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color ?? 'rgb(var(--faint))' }} />;
}
