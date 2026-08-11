import { afterEach, describe, expect, it, vi } from 'vitest';

import { geocodeAddress } from './nominatim';

const mockFetch = (response: unknown, ok = true, status = 200) => {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => response,
  });
  vi.stubGlobal('fetch', fn);
  return fn;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('geocodeAddress', () => {
  it('maps a nominatim place to a GeocodeResult', async () => {
    mockFetch([
      {
        lat: '44.9778',
        lon: '-93.2650',
        display_name: 'Hilton, Minneapolis, Minnesota, USA',
        address: { city: 'Minneapolis', country_code: 'us' },
      },
    ]);

    const result = await geocodeAddress('Hilton Minneapolis');
    expect(result).toEqual({
      lat: 44.9778,
      lon: -93.265,
      displayName: 'Hilton, Minneapolis, Minnesota, USA',
      city: 'Minneapolis',
      countryCode: 'US',
    });
  });

  it('falls back through town/village/municipality for city', async () => {
    mockFetch([
      {
        lat: '1',
        lon: '2',
        display_name: 'Somewhere',
        address: { town: 'Smallville', country_code: 'ca' },
      },
    ]);

    const result = await geocodeAddress('somewhere');
    expect(result?.city).toBe('Smallville');
    expect(result?.countryCode).toBe('CA');
  });

  it('returns null on empty results', async () => {
    mockFetch([]);
    expect(await geocodeAddress('nowhere at all')).toBeNull();
  });

  it('returns null on http error', async () => {
    mockFetch('Too Many Requests', false, 429);
    expect(await geocodeAddress('anywhere')).toBeNull();
  });

  it('returns null on fetch rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    expect(await geocodeAddress('anywhere')).toBeNull();
  });

  it('returns null for blank queries without fetching', async () => {
    const fn = mockFetch([]);
    expect(await geocodeAddress('   ')).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });
});
