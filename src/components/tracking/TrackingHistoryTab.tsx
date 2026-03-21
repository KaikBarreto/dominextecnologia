import { useState, useEffect, useMemo, useCallback } from 'react';
import { MapPin, ExternalLink, Navigation, Clock, ArrowDownUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { haversineDistance, formatDistance } from '@/utils/geolocation';
import { batchReverseGeocode } from '@/utils/reverseGeocode';

interface LocationRecord {
  id: string;
  user_id: string;
  service_order_id: string | null;
  lat: number;
  lng: number;
  event_type: string;
  created_at: string;
}

interface Profile {
  user_id: string;
  full_name: string;
}

const ALL_TECHNICIANS = '__all__';

const eventConfig: Record<string, { label: string; color: string; icon: string }> = {
  check_in: { label: 'Check-in', color: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30', icon: '🟢' },
  check_out: { label: 'Check-out', color: 'bg-red-500/15 text-red-700 border-red-500/30', icon: '🔴' },
  tracking: { label: 'Rastreamento', color: 'bg-blue-500/15 text-blue-700 border-blue-500/30', icon: '🔵' },
  en_route: { label: 'A Caminho', color: 'bg-indigo-500/15 text-indigo-700 border-indigo-500/30', icon: '🟣' },
};

export function TrackingHistoryTab() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>(ALL_TECHNICIANS);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [addressMap, setAddressMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    supabase.from('profiles').select('user_id, full_name').then(({ data }) => {
      setProfiles(data || []);
    });
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true);

    const startOfDay = `${selectedDate}T00:00:00.000Z`;
    const endOfDay = `${selectedDate}T23:59:59.999Z`;

    let query = supabase
      .from('technician_locations' as any)
      .select('*')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (selectedUserId && selectedUserId !== ALL_TECHNICIANS) {
      query = query.eq('user_id', selectedUserId);
    }

    query.then(({ data }: { data: any[] | null }) => {
      setLocations((data as LocationRecord[]) || []);
      setLoading(false);
    });
  }, [selectedUserId, selectedDate]);

  const profileMap = useMemo(() => new Map(profiles.map(p => [p.user_id, p.full_name])), [profiles]);

  const sortedAsc = useMemo(
    () => [...locations].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [locations]
  );

  const pagination = useDataPagination(locations);

  // Resolve addresses for the current page of locations
  const resolveAddresses = useCallback(async (items: LocationRecord[]) => {
    if (items.length === 0) return;
    const coords = items.map(l => ({ lat: l.lat, lng: l.lng }));
    const resolved = await batchReverseGeocode(coords, 15);
    setAddressMap(prev => {
      const next = new Map(prev);
      resolved.forEach((v, k) => next.set(k, v));
      return next;
    });
  }, []);

  useEffect(() => {
    resolveAddresses(pagination.paginatedItems);
  }, [pagination.paginatedItems, resolveAddresses]);

  const stats = useMemo(() => {
    if (sortedAsc.length === 0) return { checkIns: 0, checkOuts: 0, totalDistance: 0, timeInField: 0 };

    let totalDistance = 0;
    // Group by user for distance calc
    const byUser = new Map<string, LocationRecord[]>();
    for (const loc of sortedAsc) {
      if (!byUser.has(loc.user_id)) byUser.set(loc.user_id, []);
      byUser.get(loc.user_id)!.push(loc);
    }
    byUser.forEach(userLocs => {
      for (let i = 1; i < userLocs.length; i++) {
        totalDistance += haversineDistance(
          userLocs[i - 1].lat, userLocs[i - 1].lng,
          userLocs[i].lat, userLocs[i].lng
        );
      }
    });

    const checkIns = sortedAsc.filter(l => l.event_type === 'check_in').length;
    const checkOuts = sortedAsc.filter(l => l.event_type === 'check_out').length;

    let timeInField = 0;
    byUser.forEach(userLocs => {
      const firstIn = userLocs.find(l => l.event_type === 'check_in');
      const lastOut = [...userLocs].reverse().find(l => l.event_type === 'check_out');
      if (firstIn && lastOut) {
        timeInField += (new Date(lastOut.created_at).getTime() - new Date(firstIn.created_at).getTime()) / 60000;
      }
    });

    return { checkIns, checkOuts, totalDistance, timeInField };
  }, [sortedAsc]);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
          <SelectTrigger className="sm:w-[280px]">
            <SelectValue placeholder="Todos os técnicos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TECHNICIANS}>Todos os técnicos</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.user_id} value={p.user_id}>
                {p.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="sm:w-[200px]"
        />
      </div>

      {/* Stats */}
      {locations.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { value: stats.checkIns, label: 'Check-ins', icon: '🟢' },
            { value: stats.checkOuts, label: 'Check-outs', icon: '🔴' },
            { value: formatDistance(stats.totalDistance), label: 'Distância total', icon: '📍' },
            {
              value: stats.timeInField > 0
                ? `${Math.floor(stats.timeInField / 60)}h${Math.round(stats.timeInField % 60).toString().padStart(2, '0')}`
                : '-',
              label: 'Tempo em campo',
              icon: '⏱️',
            },
          ].map((stat, i) => (
            <Card key={i} className="border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <span className="text-xl">{stat.icon}</span>
                <div>
                  <p className="text-xl font-bold leading-none">{stat.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Log List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : locations.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            <MapPin className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>Nenhum registro encontrado para esta data.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {pagination.paginatedItems.map((loc) => {
              const cfg = eventConfig[loc.event_type] || eventConfig.tracking;
              const techName = profileMap.get(loc.user_id) || 'Técnico';
              const showTechName = selectedUserId === ALL_TECHNICIANS;

              return (
                <Card key={loc.id} className="border-border/50 hover:shadow-sm transition-shadow">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                      {/* Time column */}
                      <div className="flex flex-col items-center gap-0.5 min-w-[52px] pt-0.5">
                        <span className="text-sm font-mono font-semibold">
                          {format(new Date(loc.created_at), 'HH:mm')}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {format(new Date(loc.created_at), ':ss')}
                        </span>
                      </div>

                      {/* Divider */}
                      <div className="w-px h-10 bg-border self-center" />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={`text-[11px] font-medium ${cfg.color}`}>
                            {cfg.icon} {cfg.label}
                          </Badge>
                          {showTechName && (
                            <span className="text-xs font-medium text-foreground truncate">
                              {techName}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                          </span>
                          <a
                            href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"
                          >
                            <ExternalLink className="h-3 w-3" /> Mapa
                          </a>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <DataTablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            from={pagination.from}
            to={pagination.to}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </div>
      )}
    </div>
  );
}
