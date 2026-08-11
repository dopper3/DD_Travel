/**
 * Minimal client for the free OpenStreetMap Nominatim geocoder.
 *
 * Framework-free on purpose: the email Worker (src/worker) imports this via a
 * relative path, so nothing here may use $lib aliases or SvelteKit modules.
 *
 * Usage policy (https://operations.osmfoundation.org/policies/nominatim/):
 * identifying User-Agent with contact info, max 1 request/second. Callers
 * making multiple lookups must space them (see NOMINATIM_MIN_INTERVAL_MS).
 */

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT =
  'DD-Travel/1.0 (self-hosted travel log; ddegagne@outlook.com)';

export const NOMINATIM_MIN_INTERVAL_MS = 1100;

export type GeocodeResult = {
  lat: number;
  lon: number;
  displayName: string;
  city: string | null;
  /** Uppercase ISO 3166-1 alpha-2 */
  countryCode: string | null;
};

interface NominatimPlace {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    country_code?: string;
  };
}

/**
 * Free-text search, best match only. Returns null on failure or no result —
 * never throws, so both entry paths (email import, UI form) degrade to
 * manual placement.
 */
export const geocodeAddress = async (
  query: string,
): Promise<GeocodeResult | null> => {
  const q = query.trim();
  if (!q) return null;

  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!response.ok) {
      console.warn(`Nominatim ${response.status} for "${q}"`);
      return null;
    }
    const places = (await response.json()) as NominatimPlace[];
    const place = places[0];
    if (!place) return null;

    const lat = Number(place.lat);
    const lon = Number(place.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

    const address = place.address ?? {};
    return {
      lat,
      lon,
      displayName: place.display_name,
      city:
        address.city ??
        address.town ??
        address.village ??
        address.municipality ??
        null,
      countryCode: address.country_code?.toUpperCase() ?? null,
    };
  } catch (err) {
    console.warn(`Nominatim request failed for "${q}":`, err);
    return null;
  }
};
