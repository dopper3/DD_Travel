import { z } from 'zod';

import { TRPCError } from '@trpc/server';

import { currentContext } from '$lib/server/data-layer';
import { isPublicDemo } from '$lib/server/demo/mode';
import { permissionProcedure, router } from '$lib/server/trpc';

export const sqlRouter = router({
  execute: permissionProcedure('tools.sql.execute')
    .input(z.string())
    .query(async ({ input }) => {
      // The permission is never granted in a demo; this also covers the owner.
      if (isPublicDemo()) throw new TRPCError({ code: 'FORBIDDEN' });
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
