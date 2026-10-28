import { useState } from 'react';
import { cn } from '@/lib/util';
import { addDaysISO, formatShort, weekStartISO, rangeISO, WEEKDAYS_MIN } from '@/lib/dates';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Shown in the tooltip under the value. */
  detail?: string;
  highlight?: boolean;
}

/**
 * Single-series column chart. HTML-based so it stays crisp at any width.
 * Columns ≤24px, 4px rounded data end, square at the baseline; hover tooltip.
 */
export function ColumnChart({
  data,
  height = 120,
  format = (n) => String(n),
  max,
  label,
}: {
  data: BarDatum[];
  height?: number;
  format?: (n: number) => string;
  max?: number;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const top = Math.max(max ?? 0, ...data.map((d) => d.value), 1);
  const ticks = [top, top / 2, 0];
  return (
    <figure className="w-full" aria-label={label}>
      <div className="relative flex" style={{ height }}>
        {/* gridlines */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {ticks.map((t, i) => (
            <div key={i} className={cn('relative border-t', i === ticks.length - 1 ? 'border-line-strong' : 'border-line')}>
              <span className="absolute -top-2 right-full mr-1.5 text-[10px] tabular-nums text-faint">{Number.isInteger(t) ? t : t.toFixed(1)}</span>
            </div>
          ))}
        </div>
        <div className="relative ml-5 flex flex-1 items-end justify-around gap-1">
          {data.map((d, i) => (
            <div
              key={d.key}
              className="relative flex h-full flex-1 cursor-default items-end justify-center"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${d.label}: ${format(d.value)}${d.detail ? `, ${d.detail}` : ''}`}
            >
              <div
                className={cn('w-full max-w-[24px] rounded-t-[4px] transition-[height,opacity] duration-500 ease-out', d.highlight ? 'bg-accent' : 'bg-accent/45', hover !== null && hover !== i && 'opacity-60')}
                style={{ height: `${(d.value / top) * 100}%`, minHeight: d.value > 0 ? 3 : 0 }}
              />
              {hover === i && (
                <div className="pointer-events-none absolute bottom-full z-10 mb-1.5 whitespace-nowrap rounded-lg border border-line-strong bg-surface-2 px-2.5 py-1.5 text-xs shadow-pop">
                  <p className="font-medium text-fg">{format(d.value)}</p>
                  <p className="text-faint">
                    {d.label}
                    {d.detail ? ` · ${d.detail}` : ''}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="ml-5 mt-1.5 flex justify-around gap-1">
        {data.map((d) => (
          <span key={d.key} className={cn('flex-1 text-center text-[11px]', d.highlight ? 'font-medium text-fg' : 'text-faint')}>
            {d.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

/**
 * Habit calendar heatmap: one cell per day, columns are weeks.
 * Done = habit colour; scheduled-but-missed = muted; not scheduled = faint outline.
 */
export function HabitHeatmap({
  weeks = 16,
  today,
  weekStartsOn,
  color,
  isDone,
  isScheduled,
  startDate,
  onToggle,
}: {
  weeks?: number;
  today: string;
  weekStartsOn: 0 | 1;
  color: string;
  isDone: (d: string) => boolean;
  isScheduled: (d: string) => boolean;
  startDate: string;
  onToggle?: (d: string) => void;
}) {
  const first = addDaysISO(weekStartISO(today, weekStartsOn), -7 * (weeks - 1));
  const cols = Array.from({ length: weeks }, (_, w) => rangeISO(addDaysISO(first, w * 7), 7));
  const dayLabels = Array.from({ length: 7 }, (_, i) => WEEKDAYS_MIN[(i + weekStartsOn) % 7]);
  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      <div className="flex flex-col gap-1 pr-1">
        {dayLabels.map((l, i) => (
          <span key={i} className="flex h-3 items-center text-[9px] leading-none text-faint">
            {i % 2 === 0 ? l : ''}
          </span>
        ))}
      </div>
      {cols.map((days, w) => (
        <div key={w} className="flex flex-col gap-1">
          {days.map((d) => {
            const future = d > today;
            const before = d < startDate;
            const done = isDone(d);
            const scheduled = isScheduled(d);
            return (
              <button
                key={d}
                type="button"
                disabled={future || !onToggle}
                onClick={() => onToggle?.(d)}
                title={`${formatShort(d)} — ${done ? 'done' : future ? 'upcoming' : scheduled && !before ? 'missed' : 'not scheduled'}`}
                aria-label={`${formatShort(d)}: ${done ? 'done' : 'not done'}`}
                className={cn('h-3 w-3 rounded-[3px] transition-transform enabled:hover:scale-125', d === today && 'ring-1 ring-fg/60 ring-offset-1 ring-offset-surface')}
                style={{
                  background: done ? color : future || before ? 'transparent' : scheduled ? 'rgb(var(--surface-3))' : 'transparent',
                  boxShadow: !done && (future || before || !scheduled) ? 'inset 0 0 0 1px rgb(var(--line))' : undefined,
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
