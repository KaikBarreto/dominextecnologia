import { useState, useEffect, useMemo } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { useIsMobile } from "@/hooks/use-mobile";
import { Loader2 } from "lucide-react";

const STATE_IBGE_CODES: Record<string, number> = {
  AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32,
  GO: 52, MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41,
  PE: 26, PI: 22, RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42,
  SP: 35, SE: 28, TO: 17,
};

const CACHE_VERSION = "v4";
const geoCache = new Map<string, any>();
const nameCache = new Map<string, Map<string, string>>();

function normalizeCity(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ---- GeoJSON winding order fix for d3/react-simple-maps ----
// d3-geo interpreta a orientação para decidir o "interior" do polígono na esfera.
// Para polígonos pequenos (municípios), anel externo deve estar em sentido horário (CW)
// e buracos em sentido anti-horário (CCW). Quando invertido, ocorre o efeito
// "mundo menos município" (retângulo gigante cobrindo o canvas).

function ringArea(ring: number[][]): number {
  let area = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const j = (i + 1) % n;
    area += ring[i][0] * ring[j][1];
    area -= ring[j][0] * ring[i][1];
  }
  return area / 2;
}

function rewindRing(ring: number[][], clockwise: boolean): number[][] {
  const area = ringArea(ring);
  // area > 0 => CCW | area < 0 => CW
  const isCCW = area > 0;
  if (clockwise && isCCW) return ring.slice().reverse();
  if (!clockwise && !isCCW) return ring.slice().reverse();
  return ring;
}

function rewindPolygon(coords: number[][][]): number[][][] {
  return coords.map((ring, i) => {
    // First ring = outer = clockwise (CW)
    // Subsequent rings = holes = counter-clockwise (CCW)
    return rewindRing(ring, i === 0);
  });
}

function rewindGeometry(geom: any): any {
  if (!geom || !geom.type) return geom;
  if (geom.type === "Polygon") {
    return { ...geom, coordinates: rewindPolygon(geom.coordinates) };
  }
  if (geom.type === "MultiPolygon") {
    return {
      ...geom,
      coordinates: geom.coordinates.map((poly: number[][][]) => rewindPolygon(poly)),
    };
  }
  return geom;
}

function rewindGeoJSON(geojson: any): any {
  if (!geojson?.features) return geojson;
  return {
    ...geojson,
    features: geojson.features.map((f: any) => ({
      ...f,
      geometry: rewindGeometry(f.geometry),
    })),
  };
}

function getGeometryAbsArea(geometry: any): number {
  if (!geometry) return 0;
  if (geometry.type === "Polygon") {
    return Math.abs(ringArea(geometry.coordinates[0] ?? []));
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.reduce((sum: number, poly: number[][][]) => {
      return sum + Math.abs(ringArea(poly[0] ?? []));
    }, 0);
  }
  return 0;
}

// ---- Bounds & projection ----

function computeBounds(geojson: any) {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;

  function walk(coords: any) {
    if (typeof coords[0] === "number") {
      if (coords[0] < minLng) minLng = coords[0];
      if (coords[0] > maxLng) maxLng = coords[0];
      if (coords[1] < minLat) minLat = coords[1];
      if (coords[1] > maxLat) maxLat = coords[1];
    } else {
      for (const c of coords) walk(c);
    }
  }

  for (const f of geojson.features) walk(f.geometry.coordinates);
  return { minLng, maxLng, minLat, maxLat };
}

function computeProjection(
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number },
  isMobile: boolean
): { center: [number, number]; scale: number } {
  const center: [number, number] = [
    (bounds.minLng + bounds.maxLng) / 2,
    (bounds.minLat + bounds.maxLat) / 2,
  ];

  const lngSpan = bounds.maxLng - bounds.minLng || 1;
  const svgW = 800;
  const svgH = isMobile ? 500 : 600;
  const padding = 0.75;

  // Horizontal: scale = availablePixels / longitudeSpanInRadians
  const lngRad = lngSpan * (Math.PI / 180);
  const scaleX = (svgW * padding) / lngRad;

  // Vertical: Mercator y = ln(tan(π/4 + φ/2))
  const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
  const ySpan = Math.abs(mercY(bounds.maxLat) - mercY(bounds.minLat)) || 0.01;
  const scaleY = (svgH * padding) / ySpan;

  const scale = Math.min(scaleX, scaleY);

  // Sanity check
  if (!isFinite(scale) || scale <= 0) {
    return { center: [-50, -15], scale: 2000 };
  }

  return { center, scale };
}

function getColorForCount(count: number, maxCount: number = 20): string {
  if (count === 0) return "#F1F5F9";
  const normalized = Math.min(count / maxCount, 1);
  const lightness = 75 - normalized * 50;
  const saturation = 45 + normalized * 35;
  return `hsl(142, ${saturation}%, ${lightness}%)`;
}

// ---- Component ----

interface StateMapViewProps {
  stateCode: string;
  cityDistribution: Record<string, number>;
}

export function StateMapView({ stateCode, cityDistribution }: StateMapViewProps) {
  const isMobile = useIsMobile();
  const [geoData, setGeoData] = useState<any>(null);
  const [cityNames, setCityNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [projConfig, setProjConfig] = useState<{ center: [number, number]; scale: number }>({
    center: [-50, -15],
    scale: 2000,
  });
  const [hoveredCity, setHoveredCity] = useState<{ name: string; count: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const ibgeCode = STATE_IBGE_CODES[stateCode];
  const geoCacheKey = `${stateCode}:${CACHE_VERSION}`;

  useEffect(() => {
    if (!ibgeCode) {
      setError(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);

    const geoUrl = `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${ibgeCode}?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio`;
    const namesUrl = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${stateCode}/municipios?orderBy=nome`;

    const geoPromise = geoCache.has(geoCacheKey)
      ? Promise.resolve(geoCache.get(geoCacheKey))
      : fetch(geoUrl)
          .then((r) => r.json())
          .then((raw) => rewindGeoJSON(raw));

    const namesPromise = nameCache.has(stateCode)
      ? Promise.resolve(nameCache.get(stateCode)!)
      : fetch(namesUrl)
          .then((r) => r.json())
          .then((cities: Array<{ id: number; nome: string }>) => {
            const map = new Map<string, string>();
            cities.forEach((c) => map.set(String(c.id), c.nome));
            return map;
          });

    Promise.all([geoPromise, namesPromise])
      .then(([geo, names]) => {
        geoCache.set(geoCacheKey, geo);
        nameCache.set(stateCode, names);
        setGeoData(geo);
        setCityNames(names);

        const bounds = computeBounds(geo);
        setProjConfig(computeProjection(bounds, isMobile));
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading state map:", err);
        setError(true);
        setLoading(false);
      });
  }, [stateCode, ibgeCode, isMobile, geoCacheKey]);

  const normalizedDistribution = useMemo(() => {
    const map = new Map<string, number>();
    Object.entries(cityDistribution).forEach(([city, count]) => {
      map.set(normalizeCity(city), count);
    });
    return map;
  }, [cityDistribution]);

  const ibgeCityCountMap = useMemo(() => {
    const map = new Map<string, number>();
    cityNames.forEach((ibgeName) => {
      const normalized = normalizeCity(ibgeName);
      if (normalizedDistribution.has(normalized)) {
        map.set(normalized, normalizedDistribution.get(normalized)!);
        return;
      }
      for (const [addrCity, count] of normalizedDistribution) {
        const shorter = addrCity.length < normalized.length ? addrCity : normalized;
        if (shorter.length >= 4 && (normalized.includes(addrCity) || addrCity.includes(normalized))) {
          map.set(normalized, count);
          return;
        }
      }
    });
    return map;
  }, [cityNames, normalizedDistribution]);

  const maxCount = useMemo(
    () => Math.max(...Object.values(cityDistribution), 1),
    [cityDistribution]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px]">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm">Carregando mapa do estado...</span>
        </div>
      </div>
    );
  }

  if (error || !geoData) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px] text-muted-foreground">
        <span className="text-sm">Não foi possível carregar o mapa</span>
      </div>
    );
  }

  return (
    <div
      className="relative w-full h-full"
      onMouseMove={(e) => hoveredCity && setTooltipPos({ x: e.clientX, y: e.clientY })}
    >
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{
          center: projConfig.center,
          scale: projConfig.scale,
        }}
        style={{
          width: "100%",
          height: "100%",
          maxHeight: isMobile ? 380 : 500,
        }}
      >
        <Geographies geography={geoData}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const codarea = geo.properties?.codarea || geo.properties?.CD_MUN || geo.id;
              const cityName = cityNames.get(String(codarea)) || "";
              const normalized = normalizeCity(cityName);
              const count = ibgeCityCountMap.get(normalized) || 0;
              const hasCompanies = count > 0;
              const geometryArea = getGeometryAbsArea(geo.geometry);
              const isOutlierGeometry = geometryArea > 1000;

              if (isOutlierGeometry) return null;

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onMouseEnter={(e) => {
                    if (cityName) {
                      setHoveredCity({ name: cityName, count });
                      setTooltipPos({ x: e.clientX, y: e.clientY });
                    }
                  }}
                  onMouseLeave={() => setHoveredCity(null)}
                  style={{
                    default: {
                      fill: getColorForCount(count, maxCount),
                      stroke: hasCompanies ? "#64748B" : "#CBD5E1",
                      strokeWidth: hasCompanies ? 0.5 : 0.2,
                      outline: "none",
                      transition: "fill 0.2s ease",
                    },
                    hover: {
                      fill: hasCompanies
                        ? getColorForCount(count, maxCount)
                        : "#E2E8F0",
                      stroke: "#475569",
                      strokeWidth: 0.8,
                      outline: "none",
                      filter: hasCompanies ? "brightness(0.88)" : undefined,
                      cursor: "default",
                    },
                    pressed: {
                      fill: getColorForCount(count, maxCount),
                      outline: "none",
                    },
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>

      {hoveredCity && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 bg-popover text-popover-foreground text-sm rounded-lg shadow-lg border"
          style={{
            left: tooltipPos.x + 10,
            top: tooltipPos.y - 40,
          }}
        >
          <div className="font-semibold">{hoveredCity.name}</div>
          <div className="text-muted-foreground">
            {hoveredCity.count === 0
              ? "Nenhuma empresa"
              : hoveredCity.count === 1
              ? "1 empresa"
              : `${hoveredCity.count} empresas`}
          </div>
        </div>
      )}
    </div>
  );
}
