import type { components } from './schema';
import { simulatorApiUrl } from './client';
import { fetchApi, readApiResponse } from './http-response';

export type MapDisplaySettings = components['schemas']['MapSettingsRead'];

/** Read the owner's global display configuration; a missing provider is an error. */
export async function getMapSettings(signal?: AbortSignal): Promise<MapDisplaySettings> {
  const response = await fetchApi(simulatorApiUrl('/map-settings'), {
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });
  const value = await readApiResponse<unknown>(response, 'Не удалось загрузить настройки карты.');
  const row = value as Partial<MapDisplaySettings> | null;
  if (
    !row ||
    typeof row !== 'object' ||
    !Number.isSafeInteger(row.version) ||
    (row.version ?? 0) < 1 ||
    (row.provider !== 'STANDARD' && row.provider !== 'YANDEX') ||
    (row.provider === 'STANDARD' && row.yandex_api_key !== null) ||
    (row.provider === 'YANDEX' &&
      (typeof row.yandex_api_key !== 'string' ||
        !row.yandex_api_key.trim() ||
        row.yandex_api_key.length > 256))
  ) {
    throw new Error('Сервис вернул некорректные настройки карты. Повторите загрузку.');
  }
  return row as MapDisplaySettings;
}
