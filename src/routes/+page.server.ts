import { redirect } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

import { resolve } from '$app/paths';
import { trpcServer } from '$lib/server/server';

export const load: PageServerLoad = async (event) => {
  // Honor the user's preferred landing page on full page loads only —
  // in-app navigation to the map (a data request) must keep working.
  if (!event.isDataRequest && event.locals.user?.landingPage === 'calendar') {
    redirect(302, resolve('/calendar'));
  }

  await trpcServer.flight.list.ssr({ scope: 'mine' }, event);
  await trpcServer.flightTrack.list.ssr({ scope: 'mine' }, event);
};
