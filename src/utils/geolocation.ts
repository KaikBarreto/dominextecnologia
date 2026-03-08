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
