import { resolveFlightTimeline } from '$lib/utils/data/flight-timeline';

import type { EventListItem, Flight, PublicUser } from '$lib/db/types';

export type CalendarStay = {
  id: number;
  name: string;
  city: string | null;
  checkIn: string;
  checkOut: string;
  userId: string;
};

export type CalendarItemType = 'flight' | 'stay' | 'event';

export type EcEvent = {
  id: string;
  title: string;
  start: Date | string;
  end: Date | string;
  allDay?: boolean;
  backgroundColor?: string;
  extendedProps: { type: CalendarItemType; id: number };
};

const PERSON_COLORS = ['#3b82f6', '#f59e0b'] as const; // blue-500, amber-500
const SHARED_COLOR = '#8b5cf6'; // violet-500: a flight both people are on
const UNKNOWN_COLOR = '#6b7280'; // gray-500: guests / unknown

/** Deterministic per-person color: users sorted by id → blue, amber, ... */
export const personColor = (
  userId: string | null,
  users: Pick<PublicUser, 'id'>[],
): string => {
  if (userId === null) return UNKNOWN_COLOR;
  const index = [...users]
    .sort((a, b) => a.id.localeCompare(b.id))
    .findIndex((u) => u.id === userId);
  return PERSON_COLORS[index] ?? SHARED_COLOR;
};

const flightColor = (
  flight: Flight,
  users: Pick<PublicUser, 'id'>[],
): string => {
  const ids = new Set(
    flight.passengers
      .map((p) => p.userId)
      .filter((id): id is string => id !== null),
  );
  if (ids.size === 0) return UNKNOWN_COLOR;
  if (ids.size > 1) return SHARED_COLOR;
  return personColor([...ids][0] ?? null, users);
};

/**
 * A TZDate carries the airport's timezone; the calendar should show that
 * wall-clock time regardless of the browser's zone, so rebuild a naive
 * local Date from its displayed parts.
 */
const wallTime = (tz: {
  getFullYear(): number;
  getMonth(): number;
  getDate(): number;
  getHours(): number;
  getMinutes(): number;
}): Date =>
  new Date(
    tz.getFullYear(),
    tz.getMonth(),
    tz.getDate(),
    tz.getHours(),
    tz.getMinutes(),
  );

const addDays = (day: string, n: number): string => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
};

export const mapToCalendarEvents = (
  data: { flights: Flight[]; stays: CalendarStay[]; events: EventListItem[] },
  users: Pick<PublicUser, 'id'>[],
): EcEvent[] => {
  const result: EcEvent[] = [];

  for (const flight of data.flights) {
    const timeline = resolveFlightTimeline(flight);
    // Month/year-precision entries would paint month-long noise bars.
    if (timeline.precision !== 'day') continue;

    const from = flight.from?.iata ?? flight.from?.icao ?? '???';
    const to = flight.to?.iata ?? flight.to?.icao ?? '???';
    const title = `✈ ${from} → ${to}${flight.flightNumber ? ` · ${flight.flightNumber}` : ''}`;
    const backgroundColor = flightColor(flight, users);
    const base = {
      id: `flight-${flight.id}`,
      title,
      backgroundColor,
      extendedProps: { type: 'flight' as const, id: flight.id },
    };

    const departure = timeline.effectiveDeparture;
    if (departure) {
      const start = wallTime(departure);
      let end = timeline.effectiveArrival
        ? wallTime(timeline.effectiveArrival)
        : null;
      // Westward date-line crossings can make the arrival wall time precede
      // the departure wall time; fall back to a duration-based end.
      if (!end || end <= start) {
        end =
          flight.duration !== null && flight.duration > 0
            ? new Date(start.getTime() + flight.duration * 1_000)
            : new Date(start.getTime() + 2 * 3_600_000);
      }
      result.push({ ...base, start, end });
    } else if (timeline.dateStart) {
      const d = timeline.dateStart;
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      result.push({ ...base, start: day, end: addDays(day, 1), allDay: true });
    }
  }

  for (const stay of data.stays) {
    result.push({
      id: `stay-${stay.id}`,
      title: `🏨 ${stay.name}`,
      start: stay.checkIn,
      // Exclusive end: +1 day spans the bar through the checkout day.
      end: addDays(stay.checkOut, 1),
      allDay: true,
      backgroundColor: personColor(stay.userId, users),
      extendedProps: { type: 'stay', id: stay.id },
    });
  }

  for (const event of data.events) {
    const base = {
      id: `event-${event.id}`,
      title: `📅 ${event.title}`,
      backgroundColor: personColor(event.userId, users),
      extendedProps: { type: 'event' as const, id: event.id },
    };
    if (event.startTime === null) {
      result.push({
        ...base,
        start: event.startDate,
        end: addDays(event.endDate ?? event.startDate, 1),
        allDay: true,
      });
    } else {
      const start = `${event.startDate} ${event.startTime}`;
      // Without an explicit end, show a default one-hour block.
      const end = event.endTime
        ? `${event.endDate ?? event.startDate} ${event.endTime}`
        : new Date(
            new Date(`${event.startDate}T${event.startTime}`).getTime() +
              3_600_000,
          );
      result.push({ ...base, start, end });
    }
  }

  return result;
};
