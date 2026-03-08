

## Plan: Route + ETA from Technician to Customer (En Route)

### Problem
Customers table has no lat/lng. We need coordinates to draw a route and estimate arrival time.

### Approach

**Use free APIs (no API key needed):**
- **Nominatim** (OpenStreetMap) for geocoding customer address → lat/lng
- **OSRM** (Open Source Routing Machine) for route geometry + ETA

Both are free public APIs with reasonable rate limits.

### Database Changes

1. **Add `lat` and `lng` columns to `customers` table** — cache geocoded coordinates so we don't re-geocode every time.

```sql
ALTER TABLE public.customers ADD COLUMN lat numeric;
ALTER TABLE public.customers ADD COLUMN lng numeric;
```

### Implementation

#### 1. Geocoding utility (`src/utils/geolocation.ts`)
- Add `geocodeAddress(address: string): Promise<{lat, lng} | null>` using Nominatim API
- Add `fetchOSRMRoute(origin, destination): Promise<{geometry, durationMinutes, distanceKm}>` using OSRM public API (`https://router.project-osrm.org/route/v1/driving/{lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson`)
- The OSRM response includes route geometry (GeoJSON) and duration in seconds

#### 2. Auto-geocode customer on OS load
- When loading an OS where the customer has no lat/lng cached, call Nominatim to geocode the address, then update the customer record with the result
- This happens once per customer; subsequent loads use cached values

#### 3. LiveMap (`src/pages/LiveMap.tsx`)
- For technicians with `event_type === 'en_route'` or `'tracking'` that have a `service_order_id`:
  - Fetch the linked OS's customer address/lat/lng
  - Call OSRM for the route from tech location → customer location
  - Draw the route as a polyline on the map
  - Show ETA in the tooltip (e.g., "Chegada em ~12 min")
  - Add a destination marker (red pin) for the customer location

#### 4. PublicTrackingMap (`src/components/schedule/PublicTrackingMap.tsx`)
- Fetch the OS → customer data (address, lat, lng)
- If customer has lat/lng, call OSRM for route + ETA
- Draw the route polyline from tech to customer
- Show a customer destination marker
- Display ETA banner (e.g., "Previsão de chegada: ~12 minutos")
- Update route on each realtime location update

### Files to Modify/Create

| File | Action |
|------|--------|
| DB Migration | Add `lat`, `lng` to `customers` |
| `src/utils/geolocation.ts` | Add `geocodeAddress()`, `fetchOSRMRoute()` |
| `src/pages/LiveMap.tsx` | Draw route polylines + ETA for en_route techs |
| `src/components/schedule/PublicTrackingMap.tsx` | Draw route + show ETA banner |

### Technical Notes
- OSRM public server has usage limits; for production scale a self-hosted instance would be better, but for this use case it's fine
- Nominatim requires a `User-Agent` header and max 1 req/sec — we cache results in the DB so it's minimal usage
- Route polyline uses GeoJSON geometry from OSRM, rendered via Leaflet's `L.geoJSON` or `L.polyline`

