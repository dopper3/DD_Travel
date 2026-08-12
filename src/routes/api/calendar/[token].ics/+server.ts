import { error } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

import { db } from '$lib/db';
import { appConfig } from '$lib/server/utils/config';
import { listAllFlights } from '$lib/server/utils/flight';
import { buildCalendarFeed } from '$lib/server/utils/ics';

// Unauthenticated: the secret token in the URL is the credential, so phones'
// calendar apps can subscribe. 404 (not 401) on mismatch to avoid confirming
// the endpoint exists.
export const GET: RequestHandler = async ({ params }) => {
  const config = await appConfig.get();
  const token = config?.calendar.feedToken;
  if (!token || params.token !== token) {
    error(404, 'Not found');
  }

  const [flights, stays, events, users] = await Promise.all([
    listAllFlights(),
    db
      .selectFrom('stay')
      .select([
        'id',
        'name',
        'address',
        'city',
        'country',
        'checkIn',
        'checkOut',
        'userId',
      ])
      .execute(),
    db
      .selectFrom('event')
      .select([
        'id',
        'title',
        'description',
        'location',
        'startDate',
        'startTime',
        'endDate',
        'endTime',
        'userId',
      ])
      .execute(),
    db.selectFrom('user').select(['id', 'displayName']).execute(),
  ]);

  const ics = buildCalendarFeed({ flights, stays, events }, users);

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, max-age=600',
    },
  });
};
