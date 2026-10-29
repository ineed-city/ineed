// Used after an explicit one-time request or opt-in to foreground automatic updates.
export async function detectArea(geo: Geolocation | undefined, request: typeof fetch = fetch, signal?: AbortSignal): Promise<string> {
  if (!geo) throw new Error('unsupported');
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    // Some browsers leave the permission prompt pending beyond the native timeout.
    let settled = false;
    const finish = (position?: GeolocationPosition, reason?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      if (position) resolve(position); else reject(new Error(reason));
    };
    const cancel = () => finish(undefined, 'cancelled');
    const timer = setTimeout(() => finish(undefined, 'timeout'), 15000);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    try {
      // Keep this synchronous with the user's tap, including on Safari.
      geo.getCurrentPosition(position => finish(position), error => finish(undefined, error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable'), {
        enableHighAccuracy: false, timeout: 12000, maximumAge: 0,
      });
    } catch { finish(undefined, 'unavailable'); }
  });
  if (signal?.aborted) throw new Error('cancelled');
  const { latitude, longitude, accuracy } = position.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !Number.isFinite(accuracy) || accuracy > 10000) throw new Error('inaccurate');
  const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
  url.searchParams.set('latitude', latitude.toFixed(3));
  url.searchParams.set('longitude', longitude.toFixed(3));
  url.searchParams.set('localityLanguage', 'en');
  // AbortController also supports Safari versions without AbortSignal.timeout.
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(), 10000);
  let data;
  try {
    const response = await request(url.toString(), { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
    if (!response.ok) throw new Error('lookup');
    data = await response.json();
  } catch { throw new Error(signal?.aborted ? 'cancelled' : 'lookup'); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  if (signal?.aborted) throw new Error('cancelled');
  const parts = [data.locality, data.city, data.principalSubdivision, data.countryName]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(value => value.trim());
  if ((!data.locality && !data.city) || !data.countryName) throw new Error('lookup');
  const area = [...new Set(parts)].join(', ');
  if (area.length > 100) throw new Error('lookup');
  return area;
}
