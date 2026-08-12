import { router } from '../trpc';

import { userRouter } from './user';

import { aircraftRouter } from '$lib/server/routes/aircraft';
import { airlineRouter } from '$lib/server/routes/airline';
import { airportRouter } from '$lib/server/routes/airport';
import { autocompleteRouter } from '$lib/server/routes/autocomplete';
import { calendarRouter } from '$lib/server/routes/calendar';
import { customFieldRouter } from '$lib/server/routes/custom-field';
import { eventRouter } from '$lib/server/routes/event';
import { flightRouter } from '$lib/server/routes/flight';
import { flightTrackRouter } from '$lib/server/routes/flight-track';
import { oauthRouter } from '$lib/server/routes/oauth';
import { shareRouter } from '$lib/server/routes/share';
import { sqlRouter } from '$lib/server/routes/sql';
import { stayRouter } from '$lib/server/routes/stay';
import { visitedCountriesRouter } from '$lib/server/routes/visited-countries';
import { weatherRouter } from '$lib/server/routes/weather';

export const appRouter = router({
  user: userRouter,
  aircraft: aircraftRouter,
  airline: airlineRouter,
  airport: airportRouter,
  flight: flightRouter,
  flightTrack: flightTrackRouter,
  customField: customFieldRouter,
  oauth: oauthRouter,
  autocomplete: autocompleteRouter,
  share: shareRouter,
  stay: stayRouter,
  event: eventRouter,
  calendar: calendarRouter,
  visitedCountries: visitedCountriesRouter,
  sql: sqlRouter,
  weather: weatherRouter,
});

export type AppRouter = typeof appRouter;
