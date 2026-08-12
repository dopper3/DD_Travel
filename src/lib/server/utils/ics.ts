import { resolveFlightTimeline } from '$lib/utils/data/flight-timeline';

import type { Flight } from '$lib/db/types';

type FeedStay = {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  checkIn: string;
  checkOut: string;
  userId: string;
};

type FeedEvent = {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  userId: string;
};

type FeedUser = { id: string; displayName: string };

const UID_DOMAIN = 'travel.coldwater.cc';

/** RFC 5545 TEXT escaping. */
const escapeText = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

/** Fold lines longer than 75 octets (continuation lines start with a space). */
const foldLine = (line: string): string => {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    // Continuation lines lose one octet to the leading space.
    const limit = parts.length === 0 ? 75 : 74;
    if (currentBytes + charBytes > limit) {
      parts.push(current);
      current = char;
      currentBytes = charBytes;
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }
  if (current) parts.push(current);
  return parts.join('\r\n ');
};

/** 20260811T143000Z from a real instant. */
const fmtUtc = (date: Date): string =>
  date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** 20260811 from YYYY-MM-DD. */
const fmtDay = (day: string): string => day.replace(/-/g, '');

/** YYYY-MM-DD plus n days (DTEND on all-day events is exclusive). */
const addDays = (day: string, n: number): string => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
};

/** Floating local time (no Z/TZID): 20260811T190000. */
const fmtFloating = (day: string, time: string): string =>
  `${fmtDay(day)}T${time.replace(':', '')}00`;

const vevent = (lines: (string | null)[]): string[] => [
  'BEGIN:VEVENT',
  ...lines.filter((l): l is string => l !== null),
  'END:VEVENT',
];

export const buildCalendarFeed = (
  data: { flights: Flight[]; stays: FeedStay[]; events: FeedEvent[] },
  users: FeedUser[],
): string => {
  const nameOf = (userId: string | null): string | null =>
    users.find((u) => u.id === userId)?.displayName ?? null;
  const suffix = (names: (string | null)[]): string => {
    const present = names.filter((n): n is string => n !== null);
    return present.length ? ` (${present.join(' & ')})` : '';
  };
  const dtstamp = `DTSTAMP:${fmtUtc(new Date())}`;

  const body: string[] = [];

  for (const flight of data.flights) {
    const timeline = resolveFlightTimeline(flight);
    // Month/year-precision historical entries would paint noise bars.
    if (timeline.precision !== 'day') continue;

    const from = flight.from?.iata ?? flight.from?.icao ?? '???';
    const to = flight.to?.iata ?? flight.to?.icao ?? '???';
    const passengers = flight.passengers.map((p) => nameOf(p.userId));
    const title = [
      `✈ ${from} → ${to}`,
      flight.flightNumber ? ` · ${flight.flightNumber}` : '',
      suffix(passengers),
    ].join('');
    const uid = `UID:flight-${flight.id}@${UID_DOMAIN}`;
    const summary = `SUMMARY:${escapeText(title)}`;

    const departure = timeline.effectiveDeparture;
    if (departure) {
      const start = new Date(departure.getTime());
      let end = timeline.effectiveArrival
        ? new Date(timeline.effectiveArrival.getTime())
        : null;
      if (!end || end <= start) {
        end =
          flight.duration !== null && flight.duration > 0
            ? new Date(start.getTime() + flight.duration * 1_000)
            : new Date(start.getTime() + 2 * 3_600_000);
      }
      body.push(
        ...vevent([
          uid,
          dtstamp,
          `DTSTART:${fmtUtc(start)}`,
          `DTEND:${fmtUtc(end)}`,
          summary,
        ]),
      );
    } else if (timeline.dateStart) {
      const d = timeline.dateStart;
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      body.push(
        ...vevent([
          uid,
          dtstamp,
          `DTSTART;VALUE=DATE:${fmtDay(day)}`,
          `DTEND;VALUE=DATE:${fmtDay(addDays(day, 1))}`,
          summary,
        ]),
      );
    }
  }

  for (const stay of data.stays) {
    const location = [stay.address, stay.city, stay.country]
      .filter(Boolean)
      .join(', ');
    body.push(
      ...vevent([
        `UID:stay-${stay.id}@${UID_DOMAIN}`,
        dtstamp,
        `DTSTART;VALUE=DATE:${fmtDay(stay.checkIn)}`,
        // Exclusive end: +1 day makes the bar span through the checkout day.
        `DTEND;VALUE=DATE:${fmtDay(addDays(stay.checkOut, 1))}`,
        `SUMMARY:${escapeText(`🏨 ${stay.name}${suffix([nameOf(stay.userId)])}`)}`,
        location ? `LOCATION:${escapeText(location)}` : null,
      ]),
    );
  }

  for (const event of data.events) {
    const summary = `SUMMARY:${escapeText(`📅 ${event.title}${suffix([nameOf(event.userId)])}`)}`;
    const shared = [
      `UID:event-${event.id}@${UID_DOMAIN}`,
      dtstamp,
      summary,
      event.location ? `LOCATION:${escapeText(event.location)}` : null,
      event.description ? `DESCRIPTION:${escapeText(event.description)}` : null,
    ];
    if (event.startTime === null) {
      body.push(
        ...vevent([
          ...shared,
          `DTSTART;VALUE=DATE:${fmtDay(event.startDate)}`,
          `DTEND;VALUE=DATE:${fmtDay(addDays(event.endDate ?? event.startDate, 1))}`,
        ]),
      );
    } else {
      // Floating local time: events carry no timezone; household-local is
      // what both subscribers expect.
      const start = fmtFloating(event.startDate, event.startTime);
      const end = event.endTime
        ? fmtFloating(event.endDate ?? event.startDate, event.endTime)
        : null;
      body.push(
        ...vevent([
          ...shared,
          `DTSTART:${start}`,
          end ? `DTEND:${end}` : null,
        ]),
      );
    }
  }

  const calendar = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DD Travel//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:DD Travel',
    'X-PUBLISHED-TTL:PT1H',
    ...body,
    'END:VCALENDAR',
  ];

  return calendar.map(foldLine).join('\r\n') + '\r\n';
};
