import { z } from 'zod';

import { authedProcedure, router } from '../trpc';

import { db } from '$lib/db';
import { geocodeAddress } from '$lib/geo/nominatim';
import { saveStay } from '$lib/server/utils/stay';
import { staySchema } from '$lib/zod/stay';

export const stayRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return await db
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
      ])
      .where('userId', '=', ctx.user.id)
      .orderBy('checkIn', 'desc')
      .execute();
  }),
  save: authedProcedure.input(staySchema).mutation(async ({ ctx, input }) => {
    return await saveStay(ctx.user.id, input);
  }),
  delete: authedProcedure
    .input(z.number().int().positive())
    .mutation(async ({ ctx, input }) => {
      const result = await db
        .deleteFrom('stay')
        .where('id', '=', input)
        .where('userId', '=', ctx.user.id)
        .execute();
      return result.length > 0;
    }),
  geocode: authedProcedure
    .input(z.object({ query: z.string().trim().min(3) }))
    .mutation(async ({ input }) => {
      return await geocodeAddress(input.query);
    }),
});
