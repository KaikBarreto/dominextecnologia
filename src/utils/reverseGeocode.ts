const cache = new Map<string, string>();
let lastCall = 0;

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = cacheKey(lat, lng);
  if (cache.has(key)) return cache.get(key)!;

  // Rate limit: 1 req/sec for Nominatim
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastCall));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18`,
      { headers: { 'Accept-Language': 'pt-BR' } }
    );
    if (!res.ok) throw new Error('Nominatim error');
    const data = await res.json();
    const addr = data.address;
    if (!addr) {
      const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      cache.set(key, fallback);
      return fallback;
    }

    // Build a short readable address
    const parts: string[] = [];
    const road = addr.road || addr.pedestrian || addr.footway || addr.cycleway || '';
    if (road) {
      parts.push(road);
      if (addr.house_number) parts[parts.length - 1] += `, ${addr.house_number}`;
    }
    const neighborhood = addr.suburb || addr.neighbourhood || addr.quarter || '';
    if (neighborhood) parts.push(neighborhood);
    const city = addr.city || addr.town || addr.village || addr.municipality || '';
    if (city) parts.push(city);

    const result = parts.length > 0 ? parts.join(' - ') : (data.display_name?.split(',').slice(0, 3).join(',') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    cache.set(key, result);
    return result;
  } catch {
    const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    cache.set(key, fallback);
    return fallback;
  }
}

/**
 * Reverse geocode multiple coordinates, respecting rate limits.
 * Returns a Map of "lat,lng" (4 decimals) -> address string.
 */
export async function batchReverseGeocode(
  coords: Array<{ lat: number; lng: number }>,
  maxCalls = 10
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const unique = new Map<string, { lat: number; lng: number }>();

  for (const c of coords) {
    const key = cacheKey(c.lat, c.lng);
    if (cache.has(key)) {
      results.set(key, cache.get(key)!);
    } else if (!unique.has(key)) {
      unique.set(key, c);
    }
  }

  let calls = 0;
  for (const [key, c] of unique) {
    if (calls >= maxCalls) {
      results.set(key, `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`);
      continue;
    }
    const addr = await reverseGeocode(c.lat, c.lng);
    results.set(key, addr);
    calls++;
  }

  return results;
}
