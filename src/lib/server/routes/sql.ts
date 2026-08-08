import { z } from 'zod';

import { currentContext } from '$lib/server/data-layer';
import { ownerProcedure, router } from '$lib/server/trpc';

export const sqlRouter = router({
  execute: ownerProcedure.input(z.string()).query(async ({ input }) => {
    try {
      // raw({ columnNames: true }) returns the column names as the first row.
      const [cols = [], ...rows] = await currentContext()
        .d1.prepare(input)
        .raw({ columnNames: true });
      return { cols: cols as string[], rows };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Query failed' };
    }
  }),
});
