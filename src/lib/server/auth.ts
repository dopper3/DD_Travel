import { D1Adapter } from '@lucia-auth/adapter-sqlite';
import { Lucia, type Adapter } from 'lucia';

import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { DB } from '$lib/db/schema';
import { currentContext } from '$lib/server/data-layer';

const TABLE_NAMES = { user: 'user', session: 'session' };

/**
 * Lucia's D1 adapter needs the request's D1 binding, which is only available
 * inside a request scope, while the `lucia` instance itself is a module-level
 * singleton. This adapter delegates every call to a D1Adapter created from
 * the current request context (construction is trivially cheap).
 *
 * Note: the D1 adapter stores session.expires_at as unix SECONDS (integer),
 * unlike the previous Postgres adapter which used a timestamptz column.
 */
const requestAdapter = (): Adapter =>
  new D1Adapter(currentContext().d1, TABLE_NAMES);

const adapter: Adapter = {
  getSessionAndUser: (sessionId) =>
    requestAdapter().getSessionAndUser(sessionId),
  getUserSessions: (userId) => requestAdapter().getUserSessions(userId),
  setSession: (session) => requestAdapter().setSession(session),
  updateSessionExpiration: (sessionId, expiresAt) =>
    requestAdapter().updateSessionExpiration(sessionId, expiresAt),
  deleteSession: (sessionId) => requestAdapter().deleteSession(sessionId),
  deleteUserSessions: (userId) => requestAdapter().deleteUserSessions(userId),
  deleteExpiredSessions: () => requestAdapter().deleteExpiredSessions(),
};

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    attributes: {
      secure: !dev && env.ORIGIN?.startsWith('https://'),
    },
  },
  getUserAttributes(db) {
    return {
      username: db.username,
      // @ts-expect-error - Lucia reads raw rows so the camel case translation layer does not get applied here
      displayName: db.display_name,
      role: db.role,
      // @ts-expect-error - Same as above
      oauthId: db.oauth_id,
      // @ts-expect-error - Same as above
      distanceUnit: db.distance_unit,
      // @ts-expect-error - Same as above
      windSpeedUnit: db.wind_speed_unit,
      // @ts-expect-error - Same as above
      temperatureUnit: db.temperature_unit,
      // @ts-expect-error - Same as above
      pressureUnit: db.pressure_unit,
      // @ts-expect-error - Same as above
      timeFormat: db.time_format,
      // @ts-expect-error - Same as above
      dateFormat: db.date_format,
      // @ts-expect-error - Same as above
      weekStartsOn: db.week_starts_on,
      // @ts-expect-error - Same as above
      flightTimeDisplay: db.flight_time_display,
    };
  },
});

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: DB['user'];
  }
}
