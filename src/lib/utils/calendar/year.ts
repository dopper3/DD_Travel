import type { EcEvent } from './events';

export type YearDay = {
  colors: string[];
  titles: string[];
};

const DAY_MS = 86_400_000;

/** Local calendar day of a start/end value, as a UTC-midnight timestamp. */
const dayStamp = (value: Date | string): number => {
  if (value instanceof Date) {
    return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  }
  // 'YYYY-MM-DD' or 'YYYY-MM-DD HH:mm'
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
};

/**
 * Buckets calendar events into every day of `year` they cover, keyed by the
 * day's UTC-midnight timestamp (Date.UTC(year, month, day)).
 */
export const bucketEventsByDay = (
  events: EcEvent[],
  year: number,
): Map<number, YearDay> => {
  const first = Date.UTC(year, 0, 1);
  const last = Date.UTC(year, 11, 31);
  const days = new Map<number, YearDay>();

  for (const event of events) {
    const start = dayStamp(event.start);
    // All-day events carry an exclusive end date; timed events end on the
    // day their end timestamp falls on.
    let end = event.allDay ? dayStamp(event.end) - DAY_MS : dayStamp(event.end);
    if (end < start) end = start;

    for (
      let day = Math.max(start, first);
      day <= Math.min(end, last);
      day += DAY_MS
    ) {
      let info = days.get(day);
      if (!info) {
        info = { colors: [], titles: [] };
        days.set(day, info);
      }
      const color = event.backgroundColor ?? '#6b7280';
      if (!info.colors.includes(color)) info.colors.push(color);
      info.titles.push(event.title);
    }
  }

  return days;
};
