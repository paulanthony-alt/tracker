import type { Recurrence } from '@shared/schema';
import { WEEKDAYS_MIN } from '@/lib/dates';
import { describeRecurrence } from '@/lib/recurrence';
import { cn } from '@/lib/util';

export function RecurrenceField({ value, onChange }: { value: Recurrence | undefined; onChange: (v: Recurrence | undefined) => void }) {
  const freq = value?.freq ?? 'none';
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          className="input"
          value={freq}
          aria-label="Repeat"
          onChange={(e) => {
            const f = e.target.value;
            if (f === 'none') onChange(undefined);
            else onChange({ freq: f as Recurrence['freq'], interval: value?.interval ?? 1, daysOfWeek: f === 'weekly' ? value?.daysOfWeek : undefined, until: value?.until });
          }}
        >
          <option value="none">Does not repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        {value && (
          <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
            every
            <input
              type="number"
              min={1}
              max={365}
              className="input !w-16"
              aria-label="Repeat interval"
              value={value.interval}
              onChange={(e) => onChange({ ...value, interval: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })}
            />
            {value.freq === 'daily' ? 'day(s)' : value.freq === 'weekly' ? 'week(s)' : 'month(s)'}
          </div>
        )}
      </div>
      {value?.freq === 'weekly' && (
        <div className="flex gap-1" role="group" aria-label="Repeat on">
          {WEEKDAYS_MIN.map((d, i) => {
            const on = value.daysOfWeek?.includes(i);
            return (
              <button
                key={i}
                type="button"
                aria-pressed={on}
                aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i]}
                onClick={() => {
                  const set = new Set(value.daysOfWeek ?? []);
                  if (on) set.delete(i);
                  else set.add(i);
                  onChange({ ...value, daysOfWeek: set.size ? [...set].sort() : undefined });
                }}
                className={cn('h-8 w-8 rounded-lg border text-xs font-medium transition-colors', on ? 'border-accent/50 bg-accent/15 text-accent' : 'border-line bg-surface-2 text-muted hover:text-fg')}
              >
                {d}
              </button>
            );
          })}
        </div>
      )}
      {value && (
        <div className="flex items-center gap-2 text-xs text-faint">
          <span>{describeRecurrence(value)}</span>
          <span className="ml-auto">until</span>
          <input type="date" className="input !h-8 !w-auto" aria-label="Repeat until" value={value.until ?? ''} onChange={(e) => onChange({ ...value, until: e.target.value || undefined })} />
        </div>
      )}
    </div>
  );
}
