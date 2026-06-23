import { useState, useEffect, useMemo, useCallback } from 'react';
import { MapPin, Navigation, Clock, ExternalLink, User, LogIn, LogOut } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { haversineDistance, formatDistance } from '@/utils/geolocation';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { StatCarousel } from '@/components/mobile/StatCarousel';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { FilterButton } from '@/components/ui/FilterButton';
import { EmptyState } from '@/components/mobile/EmptyState';
import { TrackingEventListItem } from '@/components/tracking/TrackingEventListItem';
import { useUserCompany } from '@/hooks/useUserCompany';
import { reverseGeocodeShort } from '@/utils/reverseGeocode';

interface LocationRecord {
  id: string;
  user_id: string;
  service_order_id: string | null;
  lat: number;
  lng: number;
  event_type: string;
  created_at: string;
  address: string | null;
}

interface Profile {
  user_id: string;
  full_name: string;
}

/**
 * Endereço + coordenada na timeline do desktop. Usa o `address` gravado no banco
 * (eventos-chave); senão resolve sob demanda pela fila do reverseGeocodeShort.
 * Enquanto não resolve, mostra só a coordenada (fallback gracioso).
 */
function TimelineAddress({ lat, lng, address }: { lat: number; lng: number; address: string | null }) {
  const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const [resolved, setResolved] = useState<string | null>(address ?? null);

  useEffect(() => {
    if (address) {
      setResolved(address);
      return;
    }
    let active = true;
    reverseGeocodeShort(lat, lng).then((addr) => {
      if (active && addr) setResolved(addr);
    });
    return () => {
      active = false;
    };
  }, [address, lat, lng]);

  if (resolved) {
    return (
      <span className="text-xs">
        <span className="text-foreground/90 font-medium">{resolved}</span>
        <span className="text-muted-foreground/70 font-mono ml-2">{coords}</span>
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground font-mono">{coords}</span>;
}

// Gera iniciais (máx 2 caracteres) — usado no avatar dos eventos no mobile.
function getInitials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function TechnicianTracking() {
  const isMobile = useIsMobile();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  // Multi-select: vazio = nenhum técnico selecionado (não roda query).
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const { companyId } = useUserCompany();

  useEffect(() => {
    supabase.from('profiles').select('user_id, full_name').then(({ data }) => {
      setProfiles(data || []);
    });
  }, []);

  // Carga do histórico do dia selecionado para os técnicos escolhidos.
  // `showSpinner=false` é usado no refresh silencioso do realtime (não pisca a tela).
  const fetchLocations = useCallback(
    async (showSpinner = true) => {
      if (selectedUserIds.length === 0 || !selectedDate) {
        setLocations([]);
        return;
      }
      if (showSpinner) setLoading(true);

      const startOfDay = `${selectedDate}T00:00:00.000Z`;
      const endOfDay = `${selectedDate}T23:59:59.999Z`;

      const { data } = await supabase
        .from('technician_locations' as any)
        .select('*')
        .in('user_id', selectedUserIds)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false });

      setLocations((data as LocationRecord[]) || []);
      if (showSpinner) setLoading(false);
    },
    [selectedUserIds, selectedDate],
  );

  useEffect(() => {
    fetchLocations(true);
  }, [fetchLocations]);

  // Realtime — quando o dia selecionado é hoje, novos pontos GPS dos técnicos
  // escolhidos atualizam a lista/timeline sozinhos (refresh silencioso). Para
  // datas passadas não há inserts novos, então nem assinamos. 1 canal por
  // instância, cleanup com removeChannel.
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  useEffect(() => {
    if (!companyId || selectedUserIds.length === 0 || selectedDate !== todayStr) return;

    const selected = new Set(selectedUserIds);
    const channel = supabase
      .channel(`tracking-locations-${companyId}-${selectedDate}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'technician_locations',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const userId = (payload.new as any)?.user_id;
          if (userId && selected.has(userId)) {
            fetchLocations(false);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, selectedUserIds, selectedDate, todayStr, fetchLocations]);

  const sortedAsc = useMemo(
    () => [...locations].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    ),
    [locations],
  );
  const pagination = useDataPagination(locations);

  const stats = useMemo(() => {
    if (sortedAsc.length === 0) return { checkIns: 0, checkOuts: 0, totalDistance: 0, timeInField: 0 };

    let totalDistance = 0;
    for (let i = 1; i < sortedAsc.length; i++) {
      totalDistance += haversineDistance(
        sortedAsc[i - 1].lat, sortedAsc[i - 1].lng,
        sortedAsc[i].lat, sortedAsc[i].lng,
      );
    }

    const checkIns = sortedAsc.filter((l) => l.event_type === 'check_in').length;
    const checkOuts = sortedAsc.filter((l) => l.event_type === 'check_out').length;

    let timeInField = 0;
    const firstCheckIn = sortedAsc.find((l) => l.event_type === 'check_in');
    const lastCheckOut = [...sortedAsc].reverse().find((l) => l.event_type === 'check_out');
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

  // Quando um único técnico está selecionado, mostramos avatar/nome no item.
  // Com múltiplos, fallback genérico (lista mista de eventos).
  const selectedTechnician =
    selectedUserIds.length === 1 ? profiles.find((p) => p.user_id === selectedUserIds[0]) : null;
  const selectedTechnicianName = selectedTechnician?.full_name;
  const selectedTechnicianInitials = getInitials(selectedTechnicianName);

  // Stat items para o StatCarousel (mobile-first). Desktop reusa via grid auto-fit.
  const formattedTimeInField =
    stats.timeInField > 0
      ? `${Math.floor(stats.timeInField / 60)}h${Math.round(stats.timeInField % 60)
          .toString()
          .padStart(2, '0')}`
      : '0';
  const formattedDistance = formatDistance(stats.totalDistance);

  // StatCarousel espera `count: number`. Pra distância e tempo (que são strings
  // formatadas), montamos cards customizados no desktop e versão própria no mobile.
  // Opção conservadora: usa o StatCarousel pra check-in/check-out (numéricos) e
  // mostra distância/tempo em chips adicionais com mesmo visual.
  const statItems = [
    {
      key: 'check_ins',
      label: 'Check-ins',
      count: stats.checkIns,
      icon: <LogIn className="h-4 w-4" />,
      accentColor: 'hsl(142, 71%, 45%)', // verde
    },
    {
      key: 'check_outs',
      label: 'Check-outs',
      count: stats.checkOuts,
      icon: <LogOut className="h-4 w-4" />,
      accentColor: 'hsl(0, 72%, 51%)', // vermelho
    },
  ];

  // Contagem de filtros ativos no mobile (técnico + data diferente de hoje).
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const activeFilterCount = (selectedUserIds.length > 0 ? 1 : 0) + (selectedDate !== todayStr ? 1 : 0);

  const clearFilters = () => {
    setSelectedUserIds([]);
    setSelectedDate(todayStr);
  };

  // Conteúdo dos filtros — reusado inline no desktop e dentro da FilterSheet no mobile.
  const filterContent = (
    <div className={cn(isMobile ? 'space-y-4' : 'flex flex-col sm:flex-row gap-3 items-start')}>
      <div className={isMobile ? '' : 'sm:w-[320px]'}>
        <FilterCheckboxGroup
          label="Técnico"
          options={profiles.map((p) => ({ value: p.user_id, label: p.full_name }))}
          selected={selectedUserIds}
          onChange={setSelectedUserIds}
          emptyLabel="Selecione ao menos um"
        />
      </div>

      <div className={isMobile ? '' : 'sm:w-[200px]'}>
        {isMobile && (
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Data</label>
        )}
        {!isMobile && (
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 block">Data</label>
        )}
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full"
        />
      </div>
    </div>
  );

  // Chips de KPIs extras (distância + tempo em campo) — números formatados
  // não cabem no StatCarousel (que exige count:number). Mantemos cards próprios
  // no mesmo visual, alinhados ao carrossel.
  const extraStatsMobile = (
    <div className="relative -mx-3 mt-2">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-4 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-background to-transparent" />
      <div className="flex gap-2 overflow-x-auto px-3 pb-1 snap-x scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="snap-start shrink-0 flex flex-col justify-between h-[88px] min-w-[140px] p-3 rounded-2xl border border-border bg-card shadow-sm text-left">
          <div className="flex items-start justify-between gap-2">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full text-white shrink-0"
              style={{ backgroundColor: 'hsl(217, 91%, 60%)' }}
            >
              <Navigation className="h-4 w-4" />
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground truncate text-right mt-1">
              Distância
            </span>
          </div>
          <span className="text-xl font-bold leading-none truncate">{formattedDistance}</span>
        </div>
        <div className="snap-start shrink-0 flex flex-col justify-between h-[88px] min-w-[140px] p-3 rounded-2xl border border-border bg-card shadow-sm text-left">
          <div className="flex items-start justify-between gap-2">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full text-white shrink-0"
              style={{ backgroundColor: 'hsl(38, 92%, 50%)' }}
            >
              <Clock className="h-4 w-4" />
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground truncate text-right mt-1">
              Tempo em campo
            </span>
          </div>
          <span className="text-xl font-bold leading-none truncate">{formattedTimeInField}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className={cn('space-y-6', isMobile && 'pb-8 space-y-4')}>
      <MobilePageHeader
        title="Rastreamento de Técnicos"
        subtitle="Histórico de deslocamentos por técnico e dia"
        icon={Navigation}
      />

      {/* ----------------------------------------------------------------- */}
      {/* Filtros — mobile: chip resumo + FilterSheet. Desktop: inline.      */}
      {/* ----------------------------------------------------------------- */}
      {isMobile ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <FilterSheet
              triggerLabel="Filtros"
              activeCount={activeFilterCount}
              onClear={clearFilters}
            >
              {filterContent}
            </FilterSheet>
            <div className="flex-1 min-w-0 flex items-center gap-2 text-xs text-muted-foreground truncate">
              {selectedUserIds.length === 0 ? (
                <span className="truncate">Selecione um técnico</span>
              ) : selectedTechnician ? (
                <>
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{selectedTechnician.full_name}</span>
                  <span className="opacity-50">•</span>
                  <span className="shrink-0">{format(new Date(selectedDate + 'T00:00:00'), 'dd/MM/yyyy')}</span>
                </>
              ) : (
                <>
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{selectedUserIds.length} técnicos</span>
                  <span className="opacity-50">•</span>
                  <span className="shrink-0">{format(new Date(selectedDate + 'T00:00:00'), 'dd/MM/yyyy')}</span>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        // Desktop: técnico + data consolidados num único FilterButton.
        // Resumo inline ao lado mostra o que está aplicado pra não esconder
        // todo o contexto atrás do botão.
        <div className="flex items-center gap-3">
          <FilterButton
            activeCount={activeFilterCount}
            onClear={clearFilters}
          >
            <FilterCheckboxGroup
              label="Técnico"
              options={profiles.map((p) => ({ value: p.user_id, label: p.full_name }))}
              selected={selectedUserIds}
              onChange={setSelectedUserIds}
              emptyLabel="Selecione ao menos um"
            />
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 block">
                Data
              </label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full"
              />
            </div>
          </FilterButton>
          <div className="flex items-center gap-2 text-sm text-muted-foreground truncate">
            {selectedUserIds.length === 0 ? (
              <span className="truncate">Selecione um técnico</span>
            ) : selectedTechnician ? (
              <>
                <User className="h-4 w-4 shrink-0" />
                <span className="truncate">{selectedTechnician.full_name}</span>
                <span className="opacity-50">•</span>
                <span className="shrink-0">{format(new Date(selectedDate + 'T00:00:00'), 'dd/MM/yyyy')}</span>
              </>
            ) : (
              <>
                <User className="h-4 w-4 shrink-0" />
                <span className="truncate">{selectedUserIds.length} técnicos</span>
                <span className="opacity-50">•</span>
                <span className="shrink-0">{format(new Date(selectedDate + 'T00:00:00'), 'dd/MM/yyyy')}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Stats (KPIs do dia) — só renderiza com dados.                      */}
      {/* ----------------------------------------------------------------- */}
      {locations.length > 0 && (
        <>
          {isMobile ? (
            <div className="space-y-2">
              <StatCarousel items={statItems} />
              {extraStatsMobile}
            </div>
          ) : (
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
                  <p className="text-2xl font-bold">{formattedDistance}</p>
                  <p className="text-xs text-muted-foreground">Distância total</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">
                    {stats.timeInField > 0 ? formattedTimeInField : '-'}
                  </p>
                  <p className="text-xs text-muted-foreground">Tempo em campo</p>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Lista / Timeline                                                   */}
      {/* ----------------------------------------------------------------- */}
      {loading ? (
        isMobile ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Carregando...</p>
        )
      ) : locations.length === 0 ? (
        isMobile ? (
          <EmptyState
            icon={<MapPin className="h-12 w-12" />}
            title={selectedUserIds.length > 0 ? 'Nenhum registro encontrado' : 'Selecione um técnico'}
            description={
              selectedUserIds.length > 0
                ? 'Nenhum deslocamento foi registrado nesta data.'
                : 'Escolha um técnico e uma data para ver o histórico de deslocamentos.'
            }
          />
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <MapPin className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>
                {selectedUserIds.length > 0
                  ? 'Nenhum registro encontrado para esta data.'
                  : 'Selecione um técnico para ver o histórico.'}
              </p>
            </CardContent>
          </Card>
        )
      ) : isMobile ? (
        // ---------------------------------------------------------------
        // Mobile: lista nativa (sem timeline visual). Cada item é uma
        // linha "estilo iOS" com avatar + horário/badge + coord + link.
        // ---------------------------------------------------------------
        <>
          <div className="rounded-xl border bg-card overflow-hidden">
            {pagination.paginatedItems.map((loc) => (
              <TrackingEventListItem
                key={loc.id}
                id={loc.id}
                lat={loc.lat}
                lng={loc.lng}
                createdAt={loc.created_at}
                eventType={loc.event_type}
                address={loc.address}
                technicianName={selectedTechnicianName}
                technicianInitials={selectedTechnicianInitials}
              />
            ))}
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
        </>
      ) : (
        // ---------------------------------------------------------------
        // Desktop: timeline original, 100% preservada.
        // ---------------------------------------------------------------
        <div className="space-y-4">
          <div className="relative pl-6 border-l-2 border-border space-y-4">
            {pagination.paginatedItems.map((loc) => (
              <div key={loc.id} className="relative">
                <div className="absolute -left-[calc(1.5rem+5px)] top-1 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background" />
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <span className="text-xs text-muted-foreground font-mono min-w-[50px]">
                    {format(new Date(loc.created_at), 'HH:mm:ss')}
                  </span>
                  <Badge variant={eventTypeBadgeVariant[loc.event_type] || 'secondary'} className="w-fit text-xs">
                    {eventTypeLabel[loc.event_type] || loc.event_type}
                  </Badge>
                  <TimelineAddress lat={loc.lat} lng={loc.lng} address={loc.address} />
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
