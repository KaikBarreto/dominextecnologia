import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, ArrowLeft, Building2, Map as MapIcon, List } from 'lucide-react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AnimatePresence, motion } from 'framer-motion';

interface Props {
  companies: Array<{ state?: string | null; city?: string | null; subscription_status?: string | null }>;
}

const BRAZIL_TOPO_JSON = 'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson';

const STATE_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
  PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

const STATE_ID_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAMES).map(([code, name]) => [name, code])
);

// Approximate lng/lat positions used for both labels and zoom origin calculations.
const STATE_LABEL_POSITIONS: Record<string, [number, number]> = {
  AC: [-70.5, -9.0], AL: [-36.6, -9.5], AP: [-51.0, 1.5], AM: [-64.5, -4.5],
  BA: [-41.5, -12.5], CE: [-39.5, -5.2], DF: [-47.9, -15.8], ES: [-40.3, -19.8],
  GO: [-49.5, -16.0], MA: [-45.0, -5.0], MT: [-55.5, -13.0], MS: [-55.0, -20.5],
  MG: [-44.5, -18.5], PA: [-53.0, -4.5], PB: [-36.8, -7.1], PR: [-51.5, -25.0],
  PE: [-37.5, -8.3], PI: [-42.8, -7.5], RJ: [-43.2, -22.2], RN: [-36.5, -5.8],
  RS: [-53.5, -29.5], RO: [-63.0, -10.8], RR: [-61.0, 2.5], SC: [-50.5, -27.3],
  SP: [-49.0, -22.2], SE: [-37.4, -10.6], TO: [-48.3, -10.0],
};

// Brazil bbox (lng/lat) approximate — used to map state position to a % transform-origin.
const BBOX = { lngMin: -75, lngMax: -34, latMin: -34, latMax: 6 };

function getStateZoomOrigin(stateCode: string): string {
  const pos = STATE_LABEL_POSITIONS[stateCode];
  if (!pos) return '50% 50%';
  const [lng, lat] = pos;
  const x = ((lng - BBOX.lngMin) / (BBOX.lngMax - BBOX.lngMin)) * 100;
  // y inverted: higher latitude => smaller y (top)
  const y = ((BBOX.latMax - lat) / (BBOX.latMax - BBOX.latMin)) * 100;
  return `${x.toFixed(1)}% ${y.toFixed(1)}%`;
}

function getColorForCount(count: number, maxCount: number = 20): string {
  if (count === 0) return '#E2E8F0';
  const normalized = Math.min(count / maxCount, 1);
  const lightness = 85 - normalized * 60;
  const saturation = 40 + normalized * 36;
  return `hsl(142, ${saturation}%, ${lightness}%)`;
}

export function AdminBrazilMapChart({ companies }: Props) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ name: string; count: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [zoomTarget, setZoomTarget] = useState<string | null>(null); // animating zoom-in
  const [zoomOutFrom, setZoomOutFrom] = useState<string | null>(null); // animating zoom-out
  const [drillView, setDrillView] = useState<'list' | 'map'>('list');

  const activeCompanies = useMemo(
    () => companies.filter((c) => c.subscription_status === 'active' || c.subscription_status === 'testing'),
    [companies]
  );

  const stateDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    activeCompanies.forEach((c) => {
      const uf = (c.state || '').trim().toUpperCase();
      if (uf && STATE_NAMES[uf]) dist[uf] = (dist[uf] || 0) + 1;
    });
    return dist;
  }, [activeCompanies]);

  const cityDistribution = useMemo(() => {
    if (!selectedState) return {} as Record<string, number>;
    const dist: Record<string, number> = {};
    activeCompanies.forEach((c) => {
      if ((c.state || '').toUpperCase() === selectedState && c.city) {
        const city = c.city.trim();
        dist[city] = (dist[city] || 0) + 1;
      }
    });
    return dist;
  }, [activeCompanies, selectedState]);

  const sortedCities = useMemo(
    () => Object.entries(cityDistribution).sort((a, b) => b[1] - a[1]),
    [cityDistribution]
  );

  const totalMapped = useMemo(() => Object.values(stateDistribution).reduce((a, b) => a + b, 0), [stateDistribution]);
  const maxCount = useMemo(() => Math.max(...Object.values(stateDistribution), 1), [stateDistribution]);

  const topStates = useMemo(
    () => Object.entries(stateDistribution).sort((a, b) => b[1] - a[1]).slice(0, 5),
    [stateDistribution]
  );

  const cityMax = sortedCities.length > 0 ? sortedCities[0][1] : 1;
  const stateTotal = selectedState ? stateDistribution[selectedState] || 0 : 0;

  const handleStateClick = (code: string, count: number) => {
    if (count === 0) return;
    setZoomTarget(code);
    setTimeout(() => {
      setSelectedState(code);
      setDrillView('list');
      setZoomTarget(null);
    }, 450);
  };

  const handleBackToMap = () => {
    const previous = selectedState;
    setZoomOutFrom(previous);
    setSelectedState(null);
    setTimeout(() => setZoomOutFrom(null), 500);
  };

  return (
    <Card className="min-h-[500px] lg:min-h-[580px] overflow-hidden">
      <CardContent className="p-4 lg:p-6 h-full">
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 h-full">
          {/* Sidebar */}
          <div className="flex flex-col gap-4 lg:w-56 lg:shrink-0">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <div>
                <h3 className="text-base sm:text-lg font-semibold leading-none tracking-tight">Distribuição Geográfica</h3>
                <span className="text-sm font-normal text-muted-foreground">{totalMapped} clientes mapeados</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Escala de Densidade</h4>
              <div className="flex flex-col gap-1">
                <div
                  className="h-4 w-full rounded-sm border border-border/50"
                  style={{
                    background:
                      'linear-gradient(to right, #E2E8F0 0%, hsl(142, 40%, 85%) 2%, hsl(142, 50%, 70%) 25%, hsl(142, 60%, 55%) 50%, hsl(142, 70%, 40%) 75%, hsl(142, 76%, 25%) 100%)',
                  }}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0</span><span>5</span><span>10</span><span>20+</span>
                </div>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {selectedState ? (
                <motion.div key="cities" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }} className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Cidades em {STATE_NAMES[selectedState] || selectedState}</h4>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {sortedCities.slice(0, 8).map(([city, count], i) => (
                      <div key={city} className="flex items-center justify-between text-sm px-2 py-1 rounded-md hover:bg-muted/50">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">{i + 1}</span>
                          <span className="font-medium truncate max-w-[100px]">{city}</span>
                        </div>
                        <span className="text-muted-foreground text-xs">{count}</span>
                      </div>
                    ))}
                    {sortedCities.length === 0 && (
                      <p className="text-xs text-muted-foreground px-2 py-1">Nenhuma cidade identificada</p>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div key="states" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }} className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Top Estados</h4>
                  <div className="space-y-1.5">
                    {topStates.length > 0 ? topStates.map(([code, count], i) => (
                      <div
                        key={code}
                        className={`flex items-center justify-between text-sm px-2 py-1 rounded-md transition-colors cursor-pointer ${hoveredState === code ? 'bg-muted' : 'hover:bg-muted/50'}`}
                        onMouseEnter={() => setHoveredState(code)}
                        onMouseLeave={() => setHoveredState(null)}
                        onClick={() => handleStateClick(code, count)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">{i + 1}</span>
                          <span className="font-medium">{code}</span>
                        </div>
                        <span className="text-muted-foreground">{count} {count === 1 ? 'empresa' : 'empresas'}</span>
                      </div>
                    )) : (
                      <p className="text-xs text-muted-foreground px-2 py-1">Sem dados de localização</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Map / Drilldown */}
          <div className="flex-1 flex flex-col relative min-h-[400px] lg:min-h-[500px] overflow-hidden" onMouseMove={(e) => tooltip && setTooltipPos({ x: e.clientX, y: e.clientY })}>
            {selectedState && (
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" onClick={handleBackToMap} className="gap-1.5 text-muted-foreground hover:text-primary-foreground hover:bg-primary">
                    <ArrowLeft className="h-4 w-4" />Voltar
                  </Button>
                  <div>
                    <h3 className="text-base font-semibold">{STATE_NAMES[selectedState]} ({selectedState})</h3>
                    <p className="text-xs text-muted-foreground">{stateTotal} {stateTotal === 1 ? 'empresa' : 'empresas'} • {sortedCities.length} {sortedCities.length === 1 ? 'cidade' : 'cidades'}</p>
                  </div>
                </div>
                <div className="inline-flex rounded-md border bg-muted p-0.5">
                  <Button size="sm" variant={drillView === 'map' ? 'default' : 'ghost'} className="h-7 gap-1.5 px-2.5" onClick={() => setDrillView('map')}>
                    <MapIcon className="h-3.5 w-3.5" />Map
                  </Button>
                  <Button size="sm" variant={drillView === 'list' ? 'default' : 'ghost'} className="h-7 gap-1.5 px-2.5" onClick={() => setDrillView('list')}>
                    <List className="h-3.5 w-3.5" />List
                  </Button>
                </div>
              </div>
            )}

            <AnimatePresence mode="wait">
              {selectedState ? (
                <motion.div
                  key={`drill-${selectedState}-${drillView}`}
                  initial={{ scale: 2.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                  style={{ transformOrigin: getStateZoomOrigin(selectedState) }}
                  className="flex-1 flex flex-col"
                >
                  {drillView === 'list' ? (
                    <ScrollArea className="flex-1">
                      <div className="space-y-2 pr-2">
                        {sortedCities.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                            <Building2 className="h-10 w-10 mb-2 opacity-40" />
                            <p className="text-sm">Nenhuma cidade identificada</p>
                          </div>
                        ) : (
                          sortedCities.map(([city, count], i) => {
                            const w = (count / cityMax) * 100;
                            // gradient: índice 0 = mais escuro
                            const intensity = 1 - i / Math.max(sortedCities.length, 1);
                            const lightness = 70 - intensity * 45; // 25..70
                            return (
                              <div key={city} className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground w-5 text-right font-medium">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-sm font-medium truncate">{city}</span>
                                    <span className="text-sm text-muted-foreground ml-2 whitespace-nowrap">{count} {count === 1 ? 'empresa' : 'empresas'}</span>
                                  </div>
                                  <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{
                                        width: `${w}%`,
                                        background: `linear-gradient(90deg, hsl(142, 70%, ${lightness + 15}%), hsl(142, 76%, ${lightness}%))`,
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                      <div className="text-center space-y-2">
                        <MapIcon className="h-12 w-12 mx-auto opacity-30" />
                        <p>Visualização de mapa do estado em breve.</p>
                        <p className="text-xs">Use a aba List para ver as cidades.</p>
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="brazil-map"
                  initial={zoomOutFrom ? { scale: 2.2, opacity: 0 } : { opacity: 1 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  style={zoomOutFrom ? { transformOrigin: getStateZoomOrigin(zoomOutFrom) } : undefined}
                  className="flex-1 relative"
                >
                  <motion.div
                    animate={zoomTarget ? { scale: 2.2, opacity: 0 } : { scale: 1, opacity: 1 }}
                    transition={{ duration: 0.45, ease: 'easeIn' }}
                    style={zoomTarget ? { transformOrigin: getStateZoomOrigin(zoomTarget) } : undefined}
                    className="w-full h-full"
                  >
                    <ComposableMap
                      projection="geoMercator"
                      projectionConfig={{ scale: 700, center: [-54, -15] }}
                      style={{ width: '100%', height: '100%' }}
                    >
                      <Geographies geography={BRAZIL_TOPO_JSON}>
                        {({ geographies }) =>
                          geographies.map((geo) => {
                            const name = geo.properties.name;
                            const code = STATE_ID_TO_CODE[name];
                            const count = code ? stateDistribution[code] || 0 : 0;
                            const fill = getColorForCount(count, maxCount);
                            return (
                              <Geography
                                key={geo.rsmKey}
                                geography={geo}
                                fill={fill}
                                stroke="#fff"
                                strokeWidth={0.5}
                                style={{
                                  default: { outline: 'none', transition: 'all 0.2s' },
                                  hover: { outline: 'none', fill: count > 0 ? 'hsl(142, 76%, 36%)' : '#CBD5E1', cursor: count > 0 ? 'pointer' : 'default' },
                                  pressed: { outline: 'none' },
                                }}
                                onMouseEnter={(e: any) => {
                                  setHoveredState(code);
                                  setTooltip({ name: STATE_NAMES[code] || name, count });
                                  setTooltipPos({ x: e.clientX, y: e.clientY });
                                }}
                                onMouseLeave={() => { setHoveredState(null); setTooltip(null); }}
                                onClick={() => handleStateClick(code, count)}
                              />
                            );
                          })
                        }
                      </Geographies>
                      {Object.entries(STATE_LABEL_POSITIONS).map(([code, pos]) => {
                        const count = stateDistribution[code] || 0;
                        if (count === 0) return null;
                        return (
                          <Marker key={code} coordinates={pos}>
                            <text textAnchor="middle" y={3} style={{ fontSize: 9, fontWeight: 'bold', fill: '#1e293b', pointerEvents: 'none' }}>
                              {code}
                            </text>
                          </Marker>
                        );
                      })}
                    </ComposableMap>
                  </motion.div>
                  {tooltip && (
                    <div
                      className="fixed z-50 pointer-events-none bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-xs"
                      style={{ left: tooltipPos.x + 12, top: tooltipPos.y + 12 }}
                    >
                      <p className="font-semibold">{tooltip.name}</p>
                      <p className="text-muted-foreground">{tooltip.count} {tooltip.count === 1 ? 'empresa' : 'empresas'}</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
