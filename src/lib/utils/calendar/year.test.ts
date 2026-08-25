import { describe, expect, it } from 'vitest';

import { bucketEventsByDay } from './year';

import type { EcEvent } from './events';

const stay = (overrides: Partial<EcEvent> = {}): EcEvent => ({
  id: 'stay-1',
  title: '🏨 Hilton',
  start: '2026-08-10',
  // Exclusive end, as produced by mapToCalendarEvents (checkout +1 day).
  end: '2026-08-13',
  allDay: true,
  backgroundColor: '#3b82f6',
  extendedProps: { type: 'stay', id: 1 },
  ...overrides,
});

describe('bucketEventsByDay', () => {
  it('spans all-day ranges up to the exclusive end', () => {
    const days = bucketEventsByDay([stay()], 2026);

    expect(days.get(Date.UTC(2026, 7, 10))?.titles).toEqual(['🏨 Hilton']);
    expect(days.get(Date.UTC(2026, 7, 12))?.titles).toEqual(['🏨 Hilton']);
    expect(days.get(Date.UTC(2026, 7, 13))).toBeUndefined();
  });

  it('buckets timed events on every day they touch', () => {
    const days = bucketEventsByDay(
      [
        stay({
          allDay: false,
          start: new Date(2026, 0, 31, 22, 0),
          end: new Date(2026, 1, 1, 6, 30),
        }),
      ],
      2026,
    );

    expect(days.get(Date.UTC(2026, 0, 31))).toBeDefined();
    expect(days.get(Date.UTC(2026, 1, 1))).toBeDefined();
    expect(days.get(Date.UTC(2026, 1, 2))).toBeUndefined();
  });

  it('clips events to the requested year and dedupes colors', () => {
    const days = bucketEventsByDay(
      [
        stay({ start: '2025-12-30', end: '2026-01-03' }),
        stay({
          id: 'stay-2',
          title: '🏨 Other',
          start: '2026-01-01',
          end: '2026-01-02',
        }),
      ],
      2026,
    );

    expect(days.get(Date.UTC(2025, 11, 31))).toBeUndefined();
    const newYear = days.get(Date.UTC(2026, 0, 1));
    expect(newYear?.titles).toHaveLength(2);
    expect(newYear?.colors).toEqual(['#3b82f6']);
  });
});
