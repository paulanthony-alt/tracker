import { useEffect, useState } from 'react';
import { todayISO } from './dates';

/** Today's date as YYYY-MM-DD; re-renders when the day rolls over. */
export function useToday(): string {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const t = setInterval(() => {
      const now = todayISO();
      setToday((prev) => (prev === now ? prev : now));
    }, 30_000);
    return () => clearInterval(t);
  }, []);
  return today;
}
