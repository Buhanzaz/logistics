import { describe, expect, it, vi } from 'vitest';
import { getMapSettings } from '../src/api/map-settings';

describe('global logistics map configuration', () => {
  it('uses the operator API without authorization', async () => {
    const settings = { version: 2, provider: 'YANDEX', yandex_api_key: 'browser-test-key' };
    const fetch = vi.fn().mockResolvedValue(Response.json(settings));
    vi.stubGlobal('fetch', fetch);
    expect(await getMapSettings()).toEqual(settings);
    expect(fetch).toHaveBeenCalledWith(
      '/api/map-settings',
      expect.objectContaining({
        cache: 'no-store',
      }),
    );
    expect(new Headers((fetch.mock.calls[0]?.[1] as RequestInit)?.headers).has('Authorization')).toBe(false);
  });

  it.each([
    {},
    { version: 0, provider: 'STANDARD', yandex_api_key: null },
    { version: 1, provider: 'UNKNOWN', yandex_api_key: null },
    { version: 1, provider: 'YANDEX', yandex_api_key: null },
    { version: 1, provider: 'YANDEX', yandex_api_key: ' ' },
    { version: 1, provider: 'STANDARD', yandex_api_key: 'unexpected-key' },
  ])('rejects incomplete configuration instead of inventing a map', async (value) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(value)));
    await expect(getMapSettings()).rejects.toThrow('некорректные настройки');
  });

  it('surfaces the owner service failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ code: 'MAP_SETTINGS_UNAVAILABLE' }, { status: 503 })),
    );
    await expect(getMapSettings()).rejects.toMatchObject({ status: 503 });
  });
});
