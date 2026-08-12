import { describe, expect, it } from 'vitest';

import { mapToCalendarEvents, personColor } from './events';

import type { Flight } from '$lib/db/types';

const airport = (id: number, iata: string, tz: string) =>
  ({
    id,
    icao: `X${iata}`,
    iata,
    lat: 0,
    lon: 0,
    tz,
    name: `${iata} Airport`,
    municipality: null,
    type: 'large_airport',
    continent: 'NA',
    country: 'US',
  }) as unknown as Flight['from'];

const wireFlight = (overrides: Partial<Flight> = {}): Flight =>
  ({
    id: 1,
    date: '2026-08-15',
    datePrecision: 'day',
    departure: '2026-08-15T14:30:00.000Z',
    arrival: '2026-08-15T18:45:00.000Z',
    departureScheduled: null,
    arrivalScheduled: null,
    takeoffScheduled: null,
    takeoffActual: null,
    landingScheduled: null,
    landingActual: null,
    duration: 15_300,
    departureTerminal: null,
    departureGate: null,
    arrivalTerminal: null,
    arrivalGate: null,
    flightNumber: 'AC856',
    aircraftReg: null,
    note: null,
    from: airport(1, 'YYZ', 'America/Toronto'),
    to: airport(2, 'LHR', 'Europe/London'),
    aircraft: null,
    airline: null,
    passengers: [
      {
        id: 1,
        flightId: 1,
        userId: 'user-a',
        guestName: null,
        seat: null,
        seatNumber: null,
        seatClass: null,
        flightReason: null,
        user: { id: 'user-a', displayName: 'A', username: 'a' },
      },
    ],
    ...overrides,
  }) as unknown as Flight;

const users = [{ id: 'user-a' }, { id: 'user-b' }];

describe('mapToCalendarEvents', () => {
  it('maps a timed flight to a calendar event with wall times', () => {
    const result = mapToCalendarEvents(
      { flights: [wireFlight()], stays: [], events: [] },
      users,
    );
    expect(result).toHaveLength(1);
    const [ec] = result;
    expect(ec!.id).toBe('flight-1');
    expect(ec!.title).toContain('YYZ');
    expect(ec!.title).toContain('AC856');
    const start = ec!.start as Date;
    const end = ec!.end as Date;
    expect(start).toBeInstanceOf(Date);
    expect(Number.isNaN(start.getTime())).toBe(false);
    // 14:30 UTC is 10:30 in Toronto (EDT, UTC-4)
    expect(start.getHours()).toBe(10);
    expect(start.getMinutes()).toBe(30);
    // 18:45 UTC is 19:45 in London (BST, UTC+1)
    expect(end.getHours()).toBe(19);
    expect(end.getMinutes()).toBe(45);
  });

  it('skips month-precision flights', () => {
    const result = mapToCalendarEvents(
      { flights: [wireFlight({ datePrecision: 'month' })], stays: [], events: [] },
      users,
    );
    expect(result).toHaveLength(0);
  });

  it('falls back to an all-day event when no times exist', () => {
    const result = mapToCalendarEvents(
      {
        flights: [wireFlight({ departure: null, arrival: null, duration: null })],
        stays: [],
        events: [],
      },
      users,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.allDay).toBe(true);
    expect(result[0]!.start).toBe('2026-08-15');
  });

  it('spans stays through the checkout day with an exclusive end', () => {
    const result = mapToCalendarEvents(
      {
        flights: [],
        stays: [
          {
            id: 5,
            name: 'Hilton',
            city: null,
            checkIn: '2026-08-10',
            checkOut: '2026-08-12',
            userId: 'user-b',
          },
        ],
        events: [],
      },
      users,
    );
    expect(result[0]!.start).toBe('2026-08-10');
    expect(result[0]!.end).toBe('2026-08-13');
    expect(result[0]!.backgroundColor).toBe(personColor('user-b', users));
  });
});
