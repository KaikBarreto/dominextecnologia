/**
 * Haversine formula to calculate distance between two GPS coordinates
 * @returns distance in kilometers
 */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function buildGoogleMapsDirectionsUrl(
  originLat: number, originLng: number,
  destinationAddress: string
): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${encodeURIComponent(destinationAddress)}`;
}

export function buildWazeUrl(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

export function buildCustomerAddress(customer: any): string {
  return [
    customer?.address,
    customer?.city,
    customer?.state,
    customer?.zip_code,
  ].filter(Boolean).join(', ');
}

/**
 * Monta o endereço de serviço próprio da OS (campos service_*).
 * Retorna '' quando a OS não tem endereço de serviço preenchido.
 */
export function buildServiceAddress(order: any): string {
  const street = [order?.service_address, order?.service_address_number]
    .filter(Boolean)
    .join(', ');
  return [
    street,
    order?.service_neighborhood,
    order?.service_city,
    order?.service_state,
    order?.service_zip_code,
  ].filter(Boolean).join(', ');
}

export interface ResolvedOsDestination {
  /** Coordenadas já salvas (OS de serviço → cliente). Null quando só há endereço pra geocodar. */
  coords: { lat: number; lng: number } | null;
  /** Endereço textual da fonte resolvida (serve pro fallback de geocode e pros links Maps/Waze). */
  address: string;
  /** De onde veio o destino: endereço de serviço da OS ou endereço do cliente. */
  source: 'os' | 'customer';
}

/**
 * Resolve o destino de navegação de uma OS com a prioridade:
 *   1. coordenada de serviço da OS (service_latitude/longitude)
 *   2. endereço de serviço da OS (buildServiceAddress → geocode no consumidor)
 *   3. coordenada do cliente (customer.latitude/longitude)
 *   4. endereço do cliente (buildCustomerAddress → geocode no consumidor)
 *
 * Síncrono: devolve as coords já salvas quando existem e o endereço da fonte
 * de maior prioridade que tiver dados. O geocode de fallback fica a cargo do
 * consumidor (ex: RouteToCustomerMap), usando `address`.
 *
 * `customer` pode ser passado à parte (o objeto da OS nem sempre traz o cliente
 * embutido); por padrão usa order.customer.
 */
export function resolveOsDestination(
  order: any,
  customer?: any,
): ResolvedOsDestination {
  const cust = customer ?? order?.customer ?? null;

  const sLat = order?.service_latitude != null ? Number(order.service_latitude) : null;
  const sLng = order?.service_longitude != null ? Number(order.service_longitude) : null;
  const hasServiceCoords = sLat != null && sLng != null && Number.isFinite(sLat) && Number.isFinite(sLng);
  const serviceAddress = buildServiceAddress(order);
  const hasServiceAddress = !!serviceAddress;

  // Endereço de serviço da OS tem prioridade total (coord ou texto).
  if (hasServiceCoords || hasServiceAddress) {
    return {
      coords: hasServiceCoords ? { lat: sLat as number, lng: sLng as number } : null,
      address: serviceAddress,
      source: 'os',
    };
  }

  const cLat = cust?.latitude != null ? Number(cust.latitude) : null;
  const cLng = cust?.longitude != null ? Number(cust.longitude) : null;
  const hasCustomerCoords = cLat != null && cLng != null && Number.isFinite(cLat) && Number.isFinite(cLng);

  return {
    coords: hasCustomerCoords ? { lat: cLat as number, lng: cLng as number } : null,
    address: cust ? buildCustomerAddress(cust) : '',
    source: 'customer',
  };
}

/**
 * Geocode an address using Nominatim (OpenStreetMap).
 * Caches result — call once per customer, then store lat/lng.
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
      { headers: { 'User-Agent': 'DomineXTecnologia/1.0' } }
    );
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
}

export interface OSRMRoute {
  geometry: GeoJSON.LineString;
  durationMinutes: number;
  distanceKm: number;
}

/**
 * Fetch driving route from OSRM public API.
 */
export async function fetchOSRMRoute(
  originLat: number, originLng: number,
  destLat: number, destLng: number
): Promise<OSRMRoute | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        geometry: route.geometry,
        durationMinutes: Math.round(route.duration / 60),
        distanceKm: Math.round((route.distance / 1000) * 10) / 10,
      };
    }
    return null;
  } catch {
    return null;
  }
}
