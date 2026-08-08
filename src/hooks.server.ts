import { type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import type { Cookie } from 'lucia';

import '$lib/zod/setup';
import { lucia } from '$lib/server/auth';
import { runWithRequestContext } from '$lib/server/data-layer';
import { appConfig } from '$lib/server/utils/config';

/**
 * Establishes the per-request data layer (the D1 database and R2 uploads
 * bindings) for everything downstream.
 *
 * The upstream ServerInit work (airport seeding, airline/aircraft sync, icon
 * sync) is intentionally NOT run here: the database is pre-seeded and those
 * jobs are admin-triggered actions on this deployment.
 */
const requestContextHandle: Handle = async ({ event, resolve }) => {
  const env = event.platform?.env;
  if (!env?.DB) {
    // No bindings (e.g. prerendering at build time): no data layer available.
    return resolve(event);
  }

  return runWithRequestContext(env, async () => {
    await ensureConfigLoaded();
    return resolve(event);
  });
};

// Config is merged from env into the DB once per isolate lifetime.
let configLoaded: Promise<void> | undefined;
const ensureConfigLoaded = (): Promise<void> => {
  configLoaded ??= (async () => {
    await appConfig.get();
    await appConfig.loadFromEnv();
  })().catch((err) => {
    configLoaded = undefined;
    throw err;
  });
  return configLoaded;
};

const authHandle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get(lucia.sessionCookieName);
  if (!sessionId) {
    event.locals.user = null;
    event.locals.session = null;
    return resolve(event);
  }

  const { session, user } = await lucia.validateSession(sessionId);
  let sessionCookie: Cookie | undefined;
  if (session?.fresh) {
    sessionCookie = lucia.createSessionCookie(session.id);
  }
  if (!session) {
    sessionCookie = lucia.createBlankSessionCookie();
  }
  if (sessionCookie) {
    event.cookies.set(sessionCookie.name, sessionCookie.value, {
      path: '.',
      ...sessionCookie.attributes,
    });
  }

  event.locals.user = user;
  event.locals.session = session;
  return resolve(event);
};

/*
 * https://github.com/sveltejs/kit/issues/11084
 * Fixed in sveltekit v3, by gating Link header generation behind config.kit.output.linkHeaderPreload
 */
const dropExcessiveLinkHeaderHandle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  if (Number(response.headers.get('Link')?.length) > 3700) {
    response.headers.delete('Link');
  }
  return response;
};

export const handle: Handle = sequence(
  requestContextHandle,
  authHandle,
  dropExcessiveLinkHeaderHandle,
);
