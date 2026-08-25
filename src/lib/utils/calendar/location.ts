import { addDays, type EcEvent } from './events';

import type { Flight } from '$lib/db/types';
import { resolveFlightTimeline } from '$lib/utils/data/flight-timeline';

// Neutral bar: presence is ambient context, not a person-colored item.
const LOCATION_COLOR = '#4b5563'; // gray-600

/** How far past the last known arrival the final segment extends. */
const OPEN_ENDED_DAYS = 366;

const dayString = (d: {
  getFullYear(): number;
  getMonth(): number;
  getDate(): number;
}): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type Leg = {
  departDay: string;
  arriveDay: string;
  city: string;
  flightId: number;
  sortKey: number;
};

/**
 * Derives "where am I" presence segments for one user from their flights:
 * after each arrival the user is in the arrival city until the next
 * departure day (travel days themselves show the flight bar instead). The
 * segment after the last known flight is open-ended.
 */
export const mapToLocationEvents = (
  flights: Flight[],
  userId: string,
): EcEvent[] => {
  const legs: Leg[] = [];

  for (const flight of flights) {
    if (!flight.passengers.some((p) => p.userId === userId)) continue;
    const timeline = resolveFlightTimeline(flight);
    if (timeline.precision !== 'day') continue;

    // Wall-clock days in each airport's own timezone (TZDate getters).
    const departSource = timeline.effectiveDeparture ?? timeline.dateStart;
    const arriveSource = timeline.effectiveArrival ?? timeline.dateStart;
    if (!departSource || !arriveSource) continue;

    const city =
      flight.to?.municipality ?? flight.to?.iata ?? flight.to?.icao ?? null;
    if (!city) continue;

    legs.push({
      departDay: dayString(departSource),
      arriveDay: dayString(arriveSource),
      city,
      flightId: flight.id,
      sortKey: departSource.getTime(),
    });
  }

  legs.sort((a, b) => a.sortKey - b.sortKey);

  type Segment = {
    start: string;
    endExclusive: string;
    city: string;
    flightId: number;
  };
  const segments: Segment[] = [];

  for (const [i, leg] of legs.entries()) {
    const next = legs[i + 1];
    const start = leg.arriveDay;
    // From arrival day through the day before the next departure, so
    // consecutive segments meet without overlap; the last segment is
    // open-ended so "home" (or wherever you are now) stays visible.
    const endExclusive = next
      ? next.departDay
      : addDays(leg.arriveDay, OPEN_ENDED_DAYS);
    if (endExclusive <= start) continue; // same-day connection

    const previous = segments.at(-1);
    if (previous && previous.city === leg.city && start <= previous.endExclusive) {
      previous.endExclusive =
        endExclusive > previous.endExclusive
          ? endExclusive
          : previous.endExclusive;
      continue;
    }
    segments.push({ start, endExclusive, city: leg.city, flightId: leg.flightId });
  }

  return segments.map((segment, i) => ({
    id: `location-${i}`,
    title: `📍 ${segment.city}`,
    start: segment.start,
    end: segment.endExclusive,
    allDay: true,
    backgroundColor: LOCATION_COLOR,
    extendedProps: { type: 'location', id: segment.flightId },
  }));
};
