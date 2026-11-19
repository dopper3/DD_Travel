import { authedProcedure, permissionProcedure, router } from '../trpc';

import { db } from '$lib/db';
import {
  disableFeed,
  enableFeed,
  getFeed,
  regenerateFeedToken,
  updateFeed,
} from '$lib/server/utils/calendar-feed';
import { appConfig } from '$lib/server/utils/config';
import { listAllFlights } from '$lib/server/utils/flight';
import { generateString } from '$lib/server/utils/random';
import { calendarUpdateSchema } from '$lib/zod/calendar';

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

// Two calendar features share this router:
//  - list / feedUrl / regenerateFeedToken: the household-wide travel calendar
//    (flights, stays, and events of every user) and its shared iCal feed.
//  - get / enable / update / regenerate / disable: upstream AirTrail's
//    per-user flight calendar feed (Settings -> Export).
export const calendarRouter = router({
  // The calendar is shared household-wide: every authed user of this private
  // instance sees all users' flights, stays, and events (color-coded by person
  // client-side). This intentionally bypasses the per-user scoping of
  // flight.list / stay.list, which remain unchanged for the map and lists.
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

  get: authedProcedure.query(async ({ ctx: { user } }) => {
    const feed = await getFeed(user.id);
    if (!feed) {
      return { enabled: false as const };
    }

    return {
      enabled: true as const,
      token: feed.token,
      reminderOffsetMinutes: feed.reminderOffsetMinutes,
      showEmoji: feed.showEmoji,
      lastFetched: feed.lastFetched,
    };
  }),

  enable: permissionProcedure('flight.export.own').mutation(
    async ({ ctx: { user } }) => {
      return await enableFeed(user.id);
    },
  ),

  update: permissionProcedure('flight.export.own')
    .input(calendarUpdateSchema)
    .mutation(async ({ ctx: { user }, input }) => {
      return await updateFeed(user.id, input);
    }),

  regenerate: permissionProcedure('flight.export.own').mutation(
    async ({ ctx: { user } }) => {
      return await regenerateFeedToken(user.id);
    },
  ),

  disable: authedProcedure.mutation(async ({ ctx: { user } }) => {
    await disableFeed(user.id);
    return { ok: true as const };
  }),
});
