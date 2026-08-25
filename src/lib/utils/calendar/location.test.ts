import { describe, expect, it } from 'vitest';

import { mapToLocationEvents } from './location';

import type { Flight } from '$lib/db/types';

const airport = (iata: string, municipality: string | null) =>
  ({
    id: iata.charCodeAt(0),
    icao: `X${iata}`,
    iata,
    lat: 0,
    lon: 0,
    tz: 'UTC',
    name: `${iata} Airport`,
    municipality,
    type: 'large_airport',
    continent: 'NA',
    country: 'US',
  }) as unknown as Flight['from'];

const flight = (
  id: number,
  date: string,
  from: Flight['from'],
  to: Flight['to'],
  userId = 'user-a',
): Flight =>
  ({
    id,
    date,
    datePrecision: 'day',
    departure: `${date}T09:00:00.000Z`,
    arrival: `${date}T12:00:00.000Z`,
    departureScheduled: null,
    arrivalScheduled: null,
    takeoffScheduled: null,
    takeoffActual: null,
    landingScheduled: null,
    landingActual: null,
    duration: 10_800,
    flightNumber: null,
    from,
    to,
    aircraft: null,
    airline: null,
    passengers: [{ userId, user: null, guestName: null }],
  }) as unknown as Flight;

const home = airport('YYZ', 'Toronto');
const away = airport('LHR', 'London');

describe('mapToLocationEvents', () => {
  it('spans from arrival day until the day before the next departure', () => {
    const events = mapToLocationEvents(
      [
        flight(1, '2026-03-01', home, away),
        flight(2, '2026-03-08', away, home),
      ],
      'user-a',
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      title: '📍 London',
      start: '2026-03-01',
      end: '2026-03-08',
      allDay: true,
    });
    // The final segment is open-ended.
    expect(events[1]?.title).toBe('📍 Toronto');
    expect(events[1]?.start).toBe('2026-03-08');
    expect(String(events[1]?.end) > '2027-03-01').toBe(true);
  });

  it('skips same-day connections and other users, falls back to iata', () => {
    const gate = airport('FRA', null);
    const events = mapToLocationEvents(
      [
        flight(1, '2026-03-01', home, gate),
        flight(2, '2026-03-01', gate, away),
        flight(3, '2026-03-05', away, home, 'user-b'),
      ],
      'user-a',
    );

    // FRA layover collapses; user-b's flight contributes nothing.
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe('📍 London');
  });

  it('merges contiguous segments in the same city', () => {
    const events = mapToLocationEvents(
      [
        flight(1, '2026-03-01', home, away),
        // Day trip returning to the same city (e.g. LHR -> LHR sightseeing).
        flight(2, '2026-03-03', away, away),
      ],
      'user-a',
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.start).toBe('2026-03-01');
  });
});
