import { useState, useEffect, useMemo } from 'react';
import { MapPin, Clock, Navigation, ExternalLink, CalendarIcon, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { haversineDistance, formatDistance } from '@/utils/geolocation';

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

export default function TechnicianTracking() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('profiles').select('user_id, full_name').then(({ data }) => {
      setProfiles(data || []);
    });
  }, []);

  useEffect(() => {
    if (!selectedUserId || !selectedDate) return;
    setLoading(true);

    const startOfDay = `${selectedDate}T00:00:00.000Z`;
    const endOfDay = `${selectedDate}T23:59:59.999Z`;

    supabase
      .from('technician_locations' as any)
      .select('*')
      .eq('user_id', selectedUserId)
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .order('created_at', { ascending: false })
      .then(({ data }: { data: any[] | null }) => {
        setLocations((data as LocationRecord[]) || []);
        setLoading(false);
      });
  }, [selectedUserId, selectedDate]);

  const sortedAsc = useMemo(() => [...locations].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()), [locations]);

  const stats = useMemo(() => {
    if (sortedAsc.length === 0) return { checkIns: 0, checkOuts: 0, totalDistance: 0, timeInField: 0 };

    let totalDistance = 0;
    for (let i = 1; i < sortedAsc.length; i++) {
      totalDistance += haversineDistance(
        sortedAsc[i - 1].lat, sortedAsc[i - 1].lng,
        sortedAsc[i].lat, sortedAsc[i].lng
      );
    }

    const checkIns = sortedAsc.filter(l => l.event_type === 'check_in').length;
    const checkOuts = sortedAsc.filter(l => l.event_type === 'check_out').length;

    let timeInField = 0;
    const firstCheckIn = sortedAsc.find(l => l.event_type === 'check_in');
    const lastCheckOut = [...sortedAsc].reverse().find(l => l.event_type === 'check_out');
    if (firstCheckIn && lastCheckOut) {
      timeInField = (new Date(lastCheckOut.created_at).getTime() - new Date(firstCheckIn.created_at).getTime()) / 60000;
    }

    return { checkIns, checkOuts, totalDistance, timeInField };
  }, [sortedAsc]);

  const eventTypeLabel: Record<string, string> = {
    check_in: 'Check-in',
    check_out: 'Check-out',
    tracking: 'Rastreamento',
  };

  const eventTypeBadgeVariant: Record<string, 'success' | 'destructive' | 'secondary'> = {
    check_in: 'success',
    check_out: 'destructive',
    tracking: 'secondary',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rastreamento de Técnicos</h1>
        <p className="text-muted-foreground">Histórico de deslocamentos por técnico e dia</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
          <SelectTrigger className="sm:w-[280px]">
            <SelectValue placeholder="Selecione um técnico" />
          </SelectTrigger>
          <SelectContent>
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
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{stats.checkIns}</p>
              <p className="text-xs text-muted-foreground">Check-ins</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{stats.checkOuts}</p>
              <p className="text-xs text-muted-foreground">Check-outs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{formatDistance(stats.totalDistance)}</p>
              <p className="text-xs text-muted-foreground">Distância total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">
                {stats.timeInField > 0 ? `${Math.floor(stats.timeInField / 60)}h${Math.round(stats.timeInField % 60).toString().padStart(2, '0')}` : '-'}
              </p>
              <p className="text-xs text-muted-foreground">Tempo em campo</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : locations.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <MapPin className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>{selectedUserId ? 'Nenhum registro encontrado para esta data.' : 'Selecione um técnico para ver o histórico.'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative pl-6 border-l-2 border-border space-y-4">
          {locations.map((loc, i) => (
            <div key={loc.id} className="relative">
              <div className="absolute -left-[calc(1.5rem+5px)] top-1 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background" />
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                <span className="text-xs text-muted-foreground font-mono min-w-[50px]">
                  {format(new Date(loc.created_at), 'HH:mm:ss')}
                </span>
                <Badge variant={eventTypeBadgeVariant[loc.event_type] || 'secondary'} className="w-fit text-xs">
                  {eventTypeLabel[loc.event_type] || loc.event_type}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                </span>
                <a
                  href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  <ExternalLink className="h-3 w-3" /> Ver no mapa
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
