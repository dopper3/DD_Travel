import { AsyncLocalStorage } from 'node:async_hooks';

import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { CamelCasePlugin, Kysely } from 'kysely';

import { D1Dialect, D1ResultPlugin } from '$lib/db/d1';
import type { DB } from '$lib/db/schema';

export interface RequestContext {
  d1: D1Database;
  db: Kysely<DB>;
  uploads: R2Bucket | null;
}

const createContext = (
  d1: D1Database,
  uploads: R2Bucket | null,
): RequestContext => {
  const db = new Kysely<DB>({
    dialect: new D1Dialect(d1),
    plugins: [new CamelCasePlugin(), new D1ResultPlugin()],
  });
  return { d1, db, uploads };
};

/**
 * The D1 and R2 bindings are only reachable through `event.platform`, so the
 * per-request context is carried via AsyncLocalStorage. The many modules
 * importing `db` from $lib/db keep working unchanged through lazy proxies
 * onto this context.
 *
 * There is no fallback outside a request scope: all database access runs on
 * (or under emulation of) Cloudflare Workers with a D1 binding.
 */
const storage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(
  platformEnv: App.Platform['env'],
  work: (context: RequestContext) => T,
): T => {
  const context = createContext(platformEnv.DB, platformEnv.UPLOADS ?? null);
  return storage.run(context, () => work(context));
};

export const currentContext = (): RequestContext => {
  const context = storage.getStore();
  if (!context) {
    throw new Error(
      'No database available: code ran outside a request scope (no D1 binding). ' +
        'Database access is only possible while handling a request.',
    );
  }
  return context;
};
