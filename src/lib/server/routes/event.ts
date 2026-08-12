import { z } from 'zod';

import { authedProcedure, router } from '../trpc';

import { db } from '$lib/db';
import { saveEvent } from '$lib/server/utils/event';
import { eventSchema } from '$lib/zod/event';

export const eventRouter = router({
  save: authedProcedure.input(eventSchema).mutation(async ({ ctx, input }) => {
    return await saveEvent(ctx.user.id, input);
  }),
  // Household-wide: any authed user may delete any event.
  delete: authedProcedure
    .input(z.number().int().positive())
    .mutation(async ({ input }) => {
      const result = await db
        .deleteFrom('event')
        .where('id', '=', input)
        .execute();
      return result.length > 0;
    }),
});
