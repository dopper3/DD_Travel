import { authedProcedure, router } from '../trpc';

import { db } from '$lib/db';
import { appConfig } from '$lib/server/utils/config';
import { listAllFlights } from '$lib/server/utils/flight';
import { generateString } from '$lib/server/utils/random';

const EVENT_COLUMNS = [
  'id',
  'title',
  'description',
  'location',
  'lat',
  'lon',
  'startDate',
  'startTime',
  'endDate',
  'endTime',
  'source',
  'userId',
] as const;

const getOrCreateFeedToken = async (): Promise<string> => {
  const config = await appConfig.get();
  const existing = config?.calendar.feedToken;
  if (existing) return existing;

  const token = generateString();
  await appConfig.set({ calendar: { feedToken: token } });
  return token;
};

// The calendar is shared household-wide: every authed user of this private
// instance sees all users' flights, stays, and events (color-coded by person
// client-side). This intentionally bypasses the admin-only scoping of
// flight.list / stay.list, which remain unchanged for the map and lists.
export const calendarRouter = router({
  list: authedProcedure.query(async () => {
    const [flights, stays, events] = await Promise.all([
      listAllFlights(),
      db
        .selectFrom('stay')
        .select([
          'id',
          'name',
          'address',
          'city',
          'country',
          'lat',
          'lon',
          'checkIn',
          'checkOut',
          'confirmationCode',
          'note',
          'source',
          'userId',
        ])
        .orderBy('checkIn', 'desc')
        .execute(),
      db
        .selectFrom('event')
        .select(EVENT_COLUMNS)
        .orderBy('startDate', 'desc')
        .execute(),
    ]);
    return { flights, stays, events };
  }),
  feedUrl: authedProcedure.query(async ({ ctx }) => {
    const token = await getOrCreateFeedToken();
    return `${ctx.url.origin}/api/calendar/${token}.ics`;
  }),
  regenerateFeedToken: authedProcedure.mutation(async ({ ctx }) => {
    const token = generateString();
    await appConfig.set({ calendar: { feedToken: token } });
    return `${ctx.url.origin}/api/calendar/${token}.ics`;
  }),
});
