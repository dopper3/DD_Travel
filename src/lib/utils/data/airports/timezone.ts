import tzLookup from 'tz-lookup';

/**
 * Timezone lookup via tz-lookup (pure JS, Workers-compatible) instead of the
 * upstream geo-tz (which loads large data files from disk via node:fs).
 * tz-lookup trades a little coastal precision for a tiny footprint, which is
 * fine for airport coordinates.
 *
 * Manual timezone overrides for airports where the lookup returns incorrect
 * results. Key: ICAO code, Value: Correct IANA timezone
 *
 * OOL (Gold Coast): Located right on the Queensland/NSW border.
 * Lookup can return Australia/Sydney (NSW, has DST) but it should be
 * Australia/Brisbane (Queensland, no DST) as the airport operates on QLD time.
 */
const TIMEZONE_OVERRIDES: Record<string, string> = {
  YBCG: 'Australia/Brisbane', // Gold Coast (OOL)
};

export const getAirportTimezone = (
  icao: string,
  latitude: number,
  longitude: number,
) => {
  const override = TIMEZONE_OVERRIDES[icao];
  if (override) return override;

  try {
    return tzLookup(latitude, longitude) ?? null;
  } catch {
    // tz-lookup throws on out-of-range coordinates
    return null;
  }
};

/**
 * geo-tz needed its import cache bounded during bulk imports; tz-lookup keeps
 * everything in memory already, so this is now just a pass-through kept for
 * API compatibility with the airport source sync.
 */
export const withBoundedGeoTzCache = async <T>(
  work: () => Promise<T>,
): Promise<T> => {
  return work();
};
