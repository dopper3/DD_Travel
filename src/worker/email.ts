import Anthropic from '@anthropic-ai/sdk';
import type {
  D1Database,
  ForwardableEmailMessage,
} from '@cloudflare/workers-types';
import { EmailMessage } from 'cloudflare:email';
import { TZDate } from '@date-fns/tz';
import { CamelCasePlugin, Kysely, sql } from 'kysely';
import PostalMime from 'postal-mime';

import { D1Dialect, D1ResultPlugin } from '../lib/db/d1';
import type { DB } from '../lib/db/schema';
import {
  geocodeAddress,
  NOMINATIM_MIN_INTERVAL_MS,
} from '../lib/geo/nominatim';

/**
 * Email Worker handler: flight confirmations forwarded to the routed address
 * are parsed, extracted into structured flight data by Claude, and inserted
 * as flights for the owner/admin user.
 *
 * Runs outside the SvelteKit request context, so it builds its own Kysely
 * instance instead of going through $lib/server/data-layer.
 */

export interface EmailEnv {
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  /**
   * Optional env override for the allowlist. Normally the list is managed in
   * the UI (Settings -> Email Import) and stored in app_config; setting this
   * var also locks the UI field (config path emailImport.allowedSenders).
   */
  EMAIL_IMPORT_ALLOWED_SENDERS?: string;
  /**
   * Zone apex that receipt replies are sent from (e.g. "coldwater.cc").
   * Cloudflare refuses a reply whose sender domain is a subdomain of the
   * receiving zone. Falls back to the recipient's own domain when unset.
   */
  EMAIL_REPLY_DOMAIN?: string;
}

const SEAT_CLASSES = [
  'economy',
  'economy+',
  'business',
  'first',
  'private',
] as const;

interface ExtractedFlight {
  airline_name: string | null;
  airline_iata: string | null;
  flight_number: string | null;
  from_airport: string | null;
  to_airport: string | null;
  departure_date: string | null;
  departure_time: string | null;
  arrival_date: string | null;
  arrival_time: string | null;
  seat_number: string | null;
  seat_class: string | null;
  confirmation_code: string | null;
}

interface ExtractedHotel {
  hotel_name: string | null;
  address: string | null;
  city: string | null;
  country_code: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  confirmation_code: string | null;
}

interface Extraction {
  contains_flights: boolean;
  contains_hotels: boolean;
  flights: ExtractedFlight[];
  hotels: ExtractedHotel[];
}

interface ExtractedEvent {
  title: string | null;
  event_date: string | null;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
}

interface EventExtraction {
  contains_events: boolean;
  events: ExtractedEvent[];
}

// The structured-outputs compiler caps union-typed parameters (nullable via
// anyOf) at 16 per schema; with flights + hotels we exceed that. Plain string
// fields with an empty-string sentinel avoid unions entirely; '' is
// normalized back to null after parsing.
const str = (description: string) => ({
  type: 'string',
  description: `${description}. Use an empty string if unknown or not present.`,
});

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['contains_flights', 'contains_hotels', 'flights', 'hotels'],
  properties: {
    contains_flights: {
      type: 'boolean',
      description:
        'True only if this email confirms one or more booked flights for the recipient.',
    },
    contains_hotels: {
      type: 'boolean',
      description:
        'True only if this email confirms one or more hotel/lodging reservations for the recipient.',
    },
    flights: {
      type: 'array',
      description: 'One entry per flight leg. Empty if not a confirmation.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'airline_name',
          'airline_iata',
          'flight_number',
          'from_airport',
          'to_airport',
          'departure_date',
          'departure_time',
          'arrival_date',
          'arrival_time',
          'seat_number',
          'seat_class',
          'confirmation_code',
        ],
        properties: {
          airline_name: str('Operating airline name'),
          airline_iata: str('2-character IATA airline code'),
          flight_number: str('Full flight number, e.g. "DL 123" -> "DL123"'),
          from_airport: str(
            'IATA (preferred) or ICAO code of the departure airport',
          ),
          to_airport: str(
            'IATA (preferred) or ICAO code of the arrival airport',
          ),
          departure_date: str('Local departure date, YYYY-MM-DD'),
          departure_time: str('Local departure time, 24h HH:MM'),
          arrival_date: str(
            'Local arrival date, YYYY-MM-DD (may be the day after departure)',
          ),
          arrival_time: str('Local arrival time, 24h HH:MM'),
          seat_number: str('Seat assignment, e.g. 12A'),
          seat_class: str(
            `Cabin class, one of: ${SEAT_CLASSES.join(', ')}. Map e.g. "Main Cabin"/"Coach" to economy, "Premium Economy"/"Comfort+" to economy+.`,
          ),
          confirmation_code: str('Booking reference / record locator'),
        },
      },
    },
    hotels: {
      type: 'array',
      description: 'One entry per distinct hotel reservation. Empty if none.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'hotel_name',
          'address',
          'city',
          'country_code',
          'check_in_date',
          'check_out_date',
          'confirmation_code',
        ],
        properties: {
          hotel_name: str('Property name, e.g. "Hilton Garden Inn Downtown"'),
          address: str('Street address as written in the email'),
          city: str('City/town of the property'),
          country_code: str('ISO 3166-1 alpha-2 country code, e.g. "US"'),
          check_in_date: str('Check-in date, YYYY-MM-DD'),
          check_out_date: str('Check-out date, YYYY-MM-DD'),
          confirmation_code: str('Hotel booking confirmation number'),
        },
      },
    },
  },
} as const;

// Same conventions as EXTRACTION_SCHEMA: every leaf is a plain string with an
// empty-string sentinel (no anyOf/nullable — the structured-outputs compiler
// caps union-typed parameters at 16).
const EVENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['contains_events', 'events'],
  properties: {
    contains_events: {
      type: 'boolean',
      description:
        'True only if this email describes one or more concrete calendar events (appointment, reservation, ticket, party, concert, activity, ...).',
    },
    events: {
      type: 'array',
      description: 'One entry per distinct event. Empty if none.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'event_date',
          'start_time',
          'end_date',
          'end_time',
          'location',
          'notes',
        ],
        properties: {
          title: str('Short event title, e.g. "Dinner at Canoe"'),
          event_date: str('Event start date, YYYY-MM-DD'),
          start_time: str(
            'Local start time, 24h HH:MM. Empty for all-day events',
          ),
          end_date: str('End date if the event spans multiple days, YYYY-MM-DD'),
          end_time: str('Local end time, 24h HH:MM'),
          location: str('Venue name and/or address as written'),
          notes: str(
            'Confirmation numbers, dress code, or other useful details',
          ),
        },
      },
    },
  },
} as const;

const stripHtml = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const toInstant = (
  date: string | null,
  time: string | null,
  tz: string,
): TZDate | null => {
  if (!date || !time) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if ([y, m, d, hh, mm].some((n) => n === undefined || Number.isNaN(n))) {
    return null;
  }
  return new TZDate(y!, m! - 1, d!, hh!, mm!, tz);
};

// The schemas use '' as the unknown-sentinel (see `str` above); restore the
// null-based shape the importers expect.
const emptyToNull = <T extends object>(obj: T): T =>
  Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      key,
      typeof value === 'string' && value.trim() === '' ? null : value,
    ]),
  ) as T;

const extractTravelData = async (
  env: EmailEnv,
  subject: string,
  body: string,
): Promise<Extraction> => {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8192,
    // Adaptive thinking must be set explicitly on Opus 4.8; without it the
    // constrained JSON output intermittently leaves one array empty in
    // mixed flight+hotel emails.
    thinking: { type: 'adaptive' },
    system:
      'You extract flight and hotel booking details from travel confirmation ' +
      'emails. An email may contain flights, a hotel reservation, or both ' +
      '(e.g. a travel-agency itinerary). ' +
      'Read the ENTIRE email and identify every booking before you write ' +
      'anything. ' +
      'Report each flight leg separately (a connection is two legs). ' +
      'Flight dates and times are local to the respective airport; hotel ' +
      'dates are local to the property. ' +
      'Only report bookings that are actually confirmed for the traveler — ' +
      'ignore advertisements, upgrade offers, and suggestions. ' +
      'Whenever you set contains_flights or contains_hotels to true, the ' +
      'matching array MUST contain one entry per booking — never leave it ' +
      'empty. ' +
      'For cancellations, or emails that confirm nothing, set both booleans ' +
      'false and return no entries.',
    output_config: {
      format: {
        type: 'json_schema',
        schema: EXTRACTION_SCHEMA,
      },
    },
    messages: [
      {
        role: 'user',
        content: `Subject: ${subject}\n\n${body}`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Extraction refused by model');
  }
  const text = response.content.find((block) => block.type === 'text');
  if (!text || text.type !== 'text') {
    throw new Error('No text block in extraction response');
  }
  const raw = JSON.parse(text.text) as Extraction;

  return {
    contains_flights: raw.contains_flights,
    contains_hotels: raw.contains_hotels,
    flights: (raw.flights ?? []).map(emptyToNull),
    hotels: (raw.hotels ?? []).map(emptyToNull),
  };
};

const findOwner = async (db: Kysely<DB>): Promise<{ id: string }> => {
  const owner = await db
    .selectFrom('user')
    .select('id')
    .orderBy(
      sql`CASE "role" WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`,
    )
    .limit(1)
    .executeTakeFirst();
  if (!owner) throw new Error('No user found to assign imports to');
  return owner;
};

const importFlights = async (
  db: Kysely<DB>,
  owner: { id: string },
  flights: ExtractedFlight[],
): Promise<{ imported: string[]; skipped: string[] }> => {
  const findAirport = async (code: string | null) => {
    if (!code) return null;
    const c = code.trim().toUpperCase();
    if (!c) return null;
    const matches = await db
      .selectFrom('airport')
      .select(['id', 'tz', 'iata', 'icao'])
      .where((eb) => eb.or([eb('iata', '=', c), eb('icao', '=', c)]))
      .execute();
    return matches.find((a) => a.iata === c) ?? matches[0] ?? null;
  };

  const findAirline = async (
    iata: string | null,
    name: string | null,
  ): Promise<number | null> => {
    if (iata) {
      const byIata = await db
        .selectFrom('airline')
        .select('id')
        .where('iata', '=', iata.trim().toUpperCase())
        .executeTakeFirst();
      if (byIata) return byIata.id;
    }
    if (name) {
      const byName = await db
        .selectFrom('airline')
        .select('id')
        .where('name', 'like', `%${name.trim()}%`)
        .executeTakeFirst();
      if (byName) return byName.id;
    }
    return null;
  };

  const imported: string[] = [];
  const skipped: string[] = [];

  for (const flight of flights) {
    const label =
      `${flight.flight_number ?? '??'} ${flight.from_airport ?? '?'}->` +
      `${flight.to_airport ?? '?'} on ${flight.departure_date ?? '?'}`;

    if (!flight.departure_date) {
      skipped.push(`${label}: no departure date`);
      continue;
    }

    const flightNumber = flight.flight_number?.replace(/\s+/g, '') ?? null;
    if (flightNumber) {
      const duplicate = await db
        .selectFrom('flight')
        .select('id')
        .where('date', '=', flight.departure_date)
        .where('flightNumber', '=', flightNumber)
        .executeTakeFirst();
      if (duplicate) {
        skipped.push(`${label}: already exists (flight ${duplicate.id})`);
        continue;
      }
    }

    const from = await findAirport(flight.from_airport);
    const to = await findAirport(flight.to_airport);
    const airlineId = await findAirline(
      flight.airline_iata,
      flight.airline_name,
    );

    const departure = from
      ? toInstant(flight.departure_date, flight.departure_time, from.tz)
      : null;
    const arrival = to
      ? toInstant(
          flight.arrival_date ?? flight.departure_date,
          flight.arrival_time,
          to.tz,
        )
      : null;

    let duration: number | null = null;
    if (departure && arrival) {
      const seconds = Math.round(
        (arrival.getTime() - departure.getTime()) / 1000,
      );
      if (seconds > 0) duration = seconds;
    }

    const seatClass = SEAT_CLASSES.find((c) => c === flight.seat_class) ?? null;

    const created = await db
      .insertInto('flight')
      .values({
        date: flight.departure_date,
        datePrecision: 'day',
        // TZDate.toISOString() keeps the local offset; the app stores UTC Z
        // strings, so normalize through a plain Date.
        departure: departure
          ? new Date(departure.getTime()).toISOString()
          : null,
        arrival: arrival ? new Date(arrival.getTime()).toISOString() : null,
        departureScheduled: null,
        arrivalScheduled: null,
        takeoffScheduled: null,
        takeoffActual: null,
        landingScheduled: null,
        landingActual: null,
        duration,
        departureTerminal: null,
        departureGate: null,
        arrivalTerminal: null,
        arrivalGate: null,
        flightNumber,
        aircraftReg: null,
        note: flight.confirmation_code
          ? `Imported from email (confirmation ${flight.confirmation_code})`
          : 'Imported from email',
        fromId: from?.id ?? null,
        toId: to?.id ?? null,
        aircraftId: null,
        airlineId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    await db
      .insertInto('flightPassenger')
      .values({
        flightId: created.id,
        userId: owner.id,
        guestName: null,
        seat: null,
        seatNumber: flight.seat_number,
        seatClass,
        flightReason: null,
      })
      .execute();

    imported.push(label);
  }

  return { imported, skipped };
};

const extractEventData = async (
  env: EmailEnv,
  subject: string,
  body: string,
): Promise<EventExtraction> => {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8192,
    // Adaptive thinking must be set explicitly on Opus 4.8 (see
    // extractTravelData).
    thinking: { type: 'adaptive' },
    system:
      'You extract calendar events from emails a person forwards to their ' +
      'personal travel calendar. The email may be a forwarded invitation, ' +
      'reservation, ticket, or a short note the person wrote themselves ' +
      '(e.g. "Dinner with the Smiths Friday 7pm"). ' +
      'Read the ENTIRE email and identify every distinct event before you ' +
      'write anything; report each event exactly once. ' +
      'Dates and times are local to the event venue. ' +
      'When the email gives a relative date (e.g. "Friday"), resolve it ' +
      'against the email’s sent date if present, otherwise leave the ' +
      'date empty. ' +
      'Whenever you set contains_events to true, the events array MUST ' +
      'contain one entry per event — never leave it empty. ' +
      'For emails that contain no concrete event, set contains_events false ' +
      'and return no entries.',
    output_config: {
      format: {
        type: 'json_schema',
        schema: EVENT_SCHEMA,
      },
    },
    messages: [
      {
        role: 'user',
        content: `Subject: ${subject}\n\n${body}`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Extraction refused by model');
  }
  const text = response.content.find((block) => block.type === 'text');
  if (!text || text.type !== 'text') {
    throw new Error('No text block in extraction response');
  }
  const raw = JSON.parse(text.text) as EventExtraction;

  return {
    contains_events: raw.contains_events,
    events: (raw.events ?? []).map(emptyToNull),
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const importStays = async (
  db: Kysely<DB>,
  owner: { id: string },
  hotels: ExtractedHotel[],
): Promise<{ imported: string[]; skipped: string[] }> => {
  const imported: string[] = [];
  const skipped: string[] = [];
  let geocodeCalls = 0;

  const spacedGeocode = async (query: string) => {
    if (geocodeCalls > 0) await sleep(NOMINATIM_MIN_INTERVAL_MS);
    geocodeCalls++;
    return await geocodeAddress(query);
  };

  for (const hotel of hotels) {
    const name = hotel.hotel_name?.trim() ?? null;
    const checkIn = hotel.check_in_date;
    const label = `${name ?? 'Unknown hotel'}, ${checkIn ?? '?'} -> ${hotel.check_out_date ?? '?'}`;

    if (!name || !checkIn) {
      skipped.push(`${label}: missing hotel name or check-in date`);
      continue;
    }

    const duplicate = await db
      .selectFrom('stay')
      .select('id')
      .where('userId', '=', owner.id)
      .where('name', '=', name)
      .where('checkIn', '=', checkIn)
      .executeTakeFirst();
    if (duplicate) {
      skipped.push(`${label}: already exists (stay ${duplicate.id})`);
      continue;
    }

    // Nominatim's free-text search fails on over-specified queries (hotel
    // name + full street address together typically returns nothing), so try
    // progressively simpler shapes: name+city, then street address, then
    // bare name.
    let geocode = await spacedGeocode(
      [name, hotel.city].filter(Boolean).join(', '),
    );
    if (!geocode && hotel.address) {
      geocode = await spacedGeocode(
        [hotel.address, hotel.city, hotel.country_code]
          .filter(Boolean)
          .join(', '),
      );
    }
    if (!geocode && hotel.city) {
      geocode = await spacedGeocode(name);
    }

    await db
      .insertInto('stay')
      .values({
        name,
        address: hotel.address,
        city: hotel.city ?? geocode?.city ?? null,
        country:
          hotel.country_code?.trim().toUpperCase() ??
          geocode?.countryCode ??
          null,
        lat: geocode?.lat ?? null,
        lon: geocode?.lon ?? null,
        checkIn,
        checkOut: hotel.check_out_date ?? checkIn,
        confirmationCode: hotel.confirmation_code,
        note: 'Imported from email',
        source: 'email',
        userId: owner.id,
      })
      .execute();

    imported.push(
      geocode
        ? label
        : `${label} (location not found - set it manually in the app)`,
    );
  }

  return { imported, skipped };
};

const importEvents = async (
  db: Kysely<DB>,
  owner: { id: string },
  events: ExtractedEvent[],
): Promise<{ imported: string[]; skipped: string[] }> => {
  const imported: string[] = [];
  const skipped: string[] = [];

  for (const event of events) {
    const title = event.title?.trim() ?? null;
    const startDate = event.event_date;
    const label = `${title ?? 'Untitled event'}, ${startDate ?? '?'}${event.start_time ? ` ${event.start_time}` : ''}`;

    if (!title || !startDate) {
      skipped.push(`${label}: missing title or date`);
      continue;
    }

    const duplicate = await db
      .selectFrom('event')
      .select('id')
      .where('userId', '=', owner.id)
      .where('title', '=', title)
      .where('startDate', '=', startDate)
      .executeTakeFirst();
    if (duplicate) {
      skipped.push(`${label}: already exists (event ${duplicate.id})`);
      continue;
    }

    await db
      .insertInto('event')
      .values({
        title,
        description: event.notes,
        location: event.location,
        startDate,
        startTime: event.start_time,
        endDate: event.end_date,
        endTime: event.end_time,
        source: 'email',
        userId: owner.id,
      })
      .execute();

    imported.push(label);
  }

  return { imported, skipped };
};

const loadAllowedSenders = async (db: Kysely<DB>): Promise<string> => {
  const row = await db
    .selectFrom('appConfig')
    .select('config')
    .executeTakeFirst();
  if (!row?.config) return '';
  const config =
    typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
  const senders = (config as { emailImport?: { allowedSenders?: unknown } })
    .emailImport?.allowedSenders;
  return typeof senders === 'string' ? senders : '';
};

const sendReply = async (
  message: ForwardableEmailMessage,
  env: EmailEnv,
  subject: string,
  inReplyTo: string | null,
  body: string,
): Promise<void> => {
  if (!inReplyTo) {
    console.log('Incoming email has no Message-ID; skipping receipt reply');
    return;
  }
  const [localPart, receivedDomain] = message.to.split('@');
  // Cloudflare matches a reply's sender domain against the ZONE that received
  // the mail, not the address it was sent to: replying as
  // flights@travel.coldwater.cc is refused with "mail from is not from the
  // correct domain". EMAIL_REPLY_DOMAIN pins the zone apex.
  const domain = env.EMAIL_REPLY_DOMAIN?.trim() || receivedDomain;
  if (!domain) {
    console.error(`Cannot derive a reply domain from "${message.to}"`);
    return;
  }
  const from = `${localPart}@${domain}`;
  // Cloudflare validates the thread chain: References must be the incoming
  // message's own References followed by its Message-ID, or the reply is
  // refused with "provided References header is invalid". Forwarded mail
  // usually carries a chain already, so sending just the Message-ID fails.
  const priorReferences = message.headers
    .get('references')
    ?.replace(/\s+/g, ' ')
    .trim();
  const references =
    !priorReferences || priorReferences.endsWith(inReplyTo)
      ? (priorReferences ?? inReplyTo)
      : `${priorReferences} ${inReplyTo}`;
  const raw = [
    `From: DD Travel <${from}>`,
    `To: ${message.from}`,
    `Subject: ${/^re:/i.test(subject) ? subject : `Re: ${subject}`}`,
    `In-Reply-To: ${inReplyTo}`,
    `References: ${references}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    // RFC 5322 requires Date. mimetext adds it for you; a hand-rolled message
    // does not, and receivers read a missing Date as a spam signal.
    `Date: ${new Date().toUTCString().replace(/GMT$/, '+0000')}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
    '',
  ].join('\r\n');
  await message.reply(new EmailMessage(from, message.from, raw));
};

export const handleFlightEmail = async (
  message: ForwardableEmailMessage,
  env: EmailEnv,
): Promise<void> => {
  const db = new Kysely<DB>({
    dialect: new D1Dialect(env.DB),
    plugins: [new CamelCasePlugin(), new D1ResultPlugin()],
  });

  const sender = message.from.trim().toLowerCase();
  // Entries are exact addresses, or whole domains when prefixed with "@"
  // (e.g. "@coldwater.cc" allows any sender at that domain). Managed in the
  // UI (Settings -> Email Import); the env var, when set, takes precedence.
  const allowed = (
    env.EMAIL_IMPORT_ALLOWED_SENDERS ?? (await loadAllowedSenders(db))
  )
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length) {
    message.setReject('Flight import not configured');
    return;
  }
  const senderAllowed = allowed.some((entry) =>
    entry.startsWith('@') ? sender.endsWith(entry) : sender === entry,
  );
  if (!senderAllowed) {
    message.setReject('Sender not authorized');
    return;
  }

  // Cast: workers-types' ReadableStream is not assignable to the DOM one
  // postal-mime expects, but they are the same object at runtime.
  const parsed = await new PostalMime().parse(
    message.raw as unknown as ReadableStream,
  );
  const subject = parsed.subject ?? '(no subject)';
  const inReplyTo =
    parsed.messageId ?? message.headers.get('message-id') ?? null;

  // Dispatch by recipient: event@/events@ creates calendar events; any other
  // routed address runs the flight+hotel confirmation flow. Email Routing
  // invokes the worker once per envelope recipient, so `to` is a single
  // address.
  const isEventAddress = ['event', 'events'].includes(
    message.to.split('@')[0]?.trim().toLowerCase() ?? '',
  );

  let summary: string;
  try {
    const body = parsed.text?.trim() || stripHtml(parsed.html ?? '');
    if (!body) {
      summary = 'Nothing imported: the email body was empty.';
    } else if (isEventAddress) {
      let extraction = await extractEventData(env, subject, body);
      // Same flag/array inconsistency guard as the travel flow.
      if (extraction.contains_events && !extraction.events.length) {
        console.log(
          `Event extraction for "${subject}" inconsistent (flag set, array empty); retrying`,
        );
        extraction = await extractEventData(env, subject, body);
      }
      console.log(
        `Event extraction for "${subject}": ${JSON.stringify(extraction)}`,
      );

      if (!extraction.events.length) {
        summary =
          'Nothing imported: no calendar event was found in this email.';
      } else {
        const owner = await findOwner(db);
        const result = await importEvents(db, owner, extraction.events);
        const lines: string[] = [];
        if (result.imported.length) {
          lines.push(`Imported ${result.imported.length} event(s):`);
          lines.push(...result.imported.map((l) => `  - ${l}`));
        }
        if (!result.imported.length && !result.skipped.length) {
          lines.push('Nothing imported.');
        }
        if (result.skipped.length) {
          lines.push('Skipped:');
          lines.push(...result.skipped.map((l) => `  - ${l}`));
        }
        summary = lines.join('\n');
      }
    } else {
      let extraction = await extractTravelData(env, subject, body);
      // Occasionally a boolean is set but its array comes back empty; a
      // single retry reliably resolves it.
      if (
        (extraction.contains_flights && !extraction.flights.length) ||
        (extraction.contains_hotels && !extraction.hotels.length)
      ) {
        console.log(
          `Extraction for "${subject}" inconsistent (flag set, array empty); retrying`,
        );
        extraction = await extractTravelData(env, subject, body);
      }
      console.log(`Extraction for "${subject}": ${JSON.stringify(extraction)}`);
      const hasFlights = extraction.flights.length > 0;
      const hasHotels = extraction.hotels.length > 0;

      if (!hasFlights && !hasHotels) {
        summary =
          'Nothing imported: this does not look like a flight or hotel confirmation email.';
      } else {
        const owner = await findOwner(db);
        const lines: string[] = [];
        const skipped: string[] = [];

        // Flights and hotels import independently: a failure in one must not
        // lose the other (travel-agency emails often contain both).
        if (hasFlights) {
          try {
            const result = await importFlights(db, owner, extraction.flights);
            if (result.imported.length) {
              lines.push(`Imported ${result.imported.length} flight(s):`);
              lines.push(...result.imported.map((l) => `  - ${l}`));
            }
            skipped.push(...result.skipped);
          } catch (err) {
            console.error(`Flight import failed for "${subject}":`, err);
            lines.push(
              `Flight import failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        if (hasHotels) {
          try {
            const result = await importStays(db, owner, extraction.hotels);
            if (result.imported.length) {
              lines.push(`Imported ${result.imported.length} hotel stay(s):`);
              lines.push(...result.imported.map((l) => `  - ${l}`));
            }
            skipped.push(...result.skipped);
          } catch (err) {
            console.error(`Stay import failed for "${subject}":`, err);
            lines.push(
              `Hotel stay import failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        if (!lines.length && !skipped.length) {
          lines.push('Nothing imported.');
        }
        if (skipped.length) {
          lines.push('Skipped:');
          lines.push(...skipped.map((l) => `  - ${l}`));
        }
        summary = lines.join('\n');
      }
    }
  } catch (err) {
    console.error(`Travel email "${subject}" failed:`, err);
    summary = `Import failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  console.log(`Travel email "${subject}": ${summary.replaceAll('\n', ' | ')}`);

  try {
    await sendReply(message, env, subject, inReplyTo, summary);
  } catch (err) {
    console.error(`Travel email "${subject}": receipt reply failed:`, err);
  }
};
