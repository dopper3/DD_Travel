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
      // @ts-expect-error - Lucia reads snake_case columns without Kysely's mapper
      roleId: db.role_id,
      // D1 returns raw SQLite rows here, so booleans arrive as 0/1.
      // @ts-expect-error - Same as above
      isOwner: Boolean(db.is_owner),
      // @ts-expect-error - Same as above
      roleAssignmentSource: db.role_assignment_source,
      // @ts-expect-error - Same as above
      oauthId: db.oauth_id,
      // The hash stays out of the session user; only its presence matters.
      hasPassword: db.password !== null,
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
      // @ts-expect-error - Same as above
      landingPage: db.landing_page,
    };
  },
});

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: DB['user'];
  }
}
