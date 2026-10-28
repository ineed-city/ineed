// Called only after the user presses the location button; never track in the background.
export async function detectArea(geo: Geolocation | undefined, request: typeof fetch = fetch): Promise<string> {
  if (!geo) throw new Error('unsupported');
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    geo.getCurrentPosition(resolve, error => reject(new Error(error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable')), {
      enableHighAccuracy: false, timeout: 12000, maximumAge: 0,
    });
  });
  const { latitude, longitude, accuracy } = position.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !Number.isFinite(accuracy) || accuracy > 10000) throw new Error('inaccurate');
  const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
  url.searchParams.set('latitude', latitude.toFixed(3));
  url.searchParams.set('longitude', longitude.toFixed(3));
  url.searchParams.set('localityLanguage', 'en');
  const response = await request(url.toString(), { signal: AbortSignal.timeout(10000), credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  if (!response.ok) throw new Error('lookup');
  const data = await response.json();
  const parts = [data.locality, data.city, data.principalSubdivision, data.countryName]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(value => value.trim());
  if ((!data.locality && !data.city) || !data.countryName) throw new Error('lookup');
  const area = [...new Set(parts)].join(', ');
  if (area.length > 100) throw new Error('lookup');
  return area;
}
