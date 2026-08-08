import { Kysely, type RawBuilder, sql } from 'kysely';

import type { DB } from './schema';

import { currentContext } from '$lib/server/data-layer';

/**
 * `db` is a lazy proxy onto the per-request context (see
 * $lib/server/data-layer) so that the request's D1 binding is used while all
 * existing import sites stay unchanged.
 */
const lazy = <T extends object>(get: () => T): T =>
  new Proxy({} as T, {
    get(_target, prop) {
      const instance = get();
      const value = Reflect.get(instance, prop, instance);
      return typeof value === 'function' ? value.bind(instance) : value;
    },
    has(_target, prop) {
      return Reflect.has(get(), prop);
    },
  });

export const db: Kysely<DB> = lazy(() => currentContext().db);

export function json<T>(obj: T): RawBuilder<T> {
  return sql`${JSON.stringify(obj)}`;
}
