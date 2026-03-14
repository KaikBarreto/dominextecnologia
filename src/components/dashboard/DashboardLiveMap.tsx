import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MapPin, Map as MapIcon, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

interface TechInField {
  name: string;
  avatarUrl?: string;
  lat: number;
  lng: number;
  customerName: string;
}

export function DashboardLiveMap({ technicians, isLoading }: { technicians: TechInField[]; isLoading: boolean }) {
  const navigate = useNavigate();
  const [MapComponent, setMapComponent] = useState<React.ComponentType<any> | null>(null);

  // Lazy-load leaflet components
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import('react-leaflet'),
      import('leaflet/dist/leaflet.css'),
      import('leaflet'),
    ]).then(([rl, , L]) => {
      if (cancelled) return;
      // Fix default marker icon
      delete (L.default.Icon.Default.prototype as any)._getIconUrl;
      L.default.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const MapWrapper = ({ techs }: { techs: TechInField[] }) => {
        const isDark = document.documentElement.classList.contains('dark');
        const tileUrl = isDark
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

        const center = techs.length > 0
          ? [techs[0].lat, techs[0].lng] as [number, number]
          : [-22.9, -43.2] as [number, number];

        return (
          <rl.MapContainer
            center={center}
            zoom={12}
            style={{ height: '240px', borderRadius: '0.5rem' }}
            scrollWheelZoom={false}
            zoomControl={false}
          >
            <rl.TileLayer url={tileUrl} attribution='&copy; <a href="https://carto.com">CARTO</a>' />
            {techs.map((tech, i) => (
              <rl.Marker key={i} position={[tech.lat, tech.lng]}>
                <rl.Popup>
                  <div className="text-sm">
                    <p className="font-semibold">{tech.name}</p>
                    <p className="text-xs text-muted-foreground">{tech.customerName}</p>
                  </div>
                </rl.Popup>
              </rl.Marker>
            ))}
          </rl.MapContainer>
        );
      };

      setMapComponent(() => MapWrapper);
    }).catch(() => {});

    return () => { cancelled = true; };
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm lg:text-base font-semibold flex items-center gap-2">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              Equipe em Campo
            </CardTitle>
            <Badge className="bg-primary text-primary-foreground border-primary hover:bg-primary/90 gap-1 text-xs">
              <span className="h-2 w-2 rounded-full bg-primary-foreground animate-pulse" />
              Ao vivo
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-[240px] w-full rounded-lg" />
          ) : technicians.length > 0 ? (
            <>
              {MapComponent ? (
                <MapComponent techs={technicians} />
              ) : (
                <Skeleton className="h-[240px] w-full rounded-lg" />
              )}
              {/* Technician avatars below */}
              <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                {technicians.map((tech, i) => (
                  <div key={i} className="flex flex-col items-center gap-1 min-w-[60px]">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={tech.avatarUrl} />
                      <AvatarFallback className="text-[10px] bg-muted">{tech.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="text-[10px] text-muted-foreground text-center truncate w-full">{tech.name.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="p-3 rounded-full bg-muted mb-3">
                <MapIcon className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhum técnico em campo agora</p>
              <button
                onClick={() => navigate('/mapa-ao-vivo')}
                className="text-xs text-primary font-medium mt-2 hover:underline flex items-center gap-1"
              >
                Abrir Mapa ao Vivo <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
