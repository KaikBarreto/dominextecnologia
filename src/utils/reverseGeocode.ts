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

const STATE_TO_UF: Record<string, string> = {
  'acre': 'AC', 'alagoas': 'AL', 'amapá': 'AP', 'amazonas': 'AM',
  'bahia': 'BA', 'ceará': 'CE', 'distrito federal': 'DF', 'espírito santo': 'ES',
  'goiás': 'GO', 'maranhão': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
  'minas gerais': 'MG', 'pará': 'PA', 'paraíba': 'PB', 'paraná': 'PR',
  'pernambuco': 'PE', 'piauí': 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', 'rondônia': 'RO',
  'roraima': 'RR', 'santa catarina': 'SC', 'são paulo': 'SP', 'sergipe': 'SE',
  'tocantins': 'TO',
};

function stateToUF(state: string): string {
  if (!state) return '';
  if (state.length === 2) return state.toUpperCase();
  return STATE_TO_UF[state.toLowerCase()] || state;
}

const shortCache = new Map<string, string>();

/**
 * Endereço CONCISO pra carimbo de assinatura / check-in / check-out:
 * "{logradouro}{, nº} - {bairro} - {cidade} - {UF}". Sem CEP nem país.
 *
 * Reusa o mesmo parse do AddressAutocomplete (logradouro/bairro/cidade/UF) a
 * partir das partes do Nominatim. Respeita o rate-limit de 1 req/s (mesmo
 * relógio do reverseGeocode). Em falha (rede/sem endereço), retorna `null` —
 * o chamador continua gravando só a coordenada.
 */
export async function reverseGeocodeShort(lat: number, lng: number): Promise<string | null> {
  const key = cacheKey(lat, lng);
  if (shortCache.has(key)) return shortCache.get(key)!;

  // Rate limit compartilhado com reverseGeocode: 1 req/s pro Nominatim.
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
    if (!addr) return null;

    const parts: string[] = [];
    const road = addr.road || addr.pedestrian || addr.footway || addr.cycleway || '';
    if (road) {
      let line = road;
      if (addr.house_number) line += `, ${addr.house_number}`;
      parts.push(line);
    }
    const neighborhood = addr.suburb || addr.neighbourhood || addr.quarter || '';
    if (neighborhood) parts.push(neighborhood);
    const city = addr.city || addr.town || addr.village || addr.municipality || '';
    if (city) parts.push(city);
    const uf = stateToUF(addr.state || '');
    if (uf) parts.push(uf);

    if (parts.length === 0) return null;
    const result = parts.join(' - ');
    shortCache.set(key, result);
    return result;
  } catch {
    return null;
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
