import { useState, useMemo } from 'react';
import { fuzzyIncludes, cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  TrendingUp,
  Plus,
  DollarSign,
  Filter,
  Search,
  X,
  Users,
  Target,
  Settings2,
  Webhook,
  LayoutList,
  LayoutGrid,
  User,
  Calendar,
  Pencil,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import {
  useLeads,
  type Lead,
  LEAD_SOURCES,
} from '@/hooks/useLeads';
import { useUsers } from '@/hooks/useUsers';
import { useCrmStages } from '@/hooks/useCrmStages';
import { LeadFormDialog } from '@/components/crm/LeadFormDialog';
import { LeadDetailModal } from '@/components/crm/LeadDetailModal';
import { LeadCard } from '@/components/crm/LeadCard';
import { StageManagerDialog } from '@/components/crm/StageManagerDialog';
import { WebhookManagerDialog } from '@/components/crm/WebhookManagerDialog';
import { LossReasonDialog } from '@/components/crm/LossReasonDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { StatCarousel, type StatCarouselItem } from '@/components/mobile/StatCarousel';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';

interface Filters {
  search: string;
  source: string;
  assignedTo: string;
  minValue: string;
  maxValue: string;
}

type ViewMode = 'list' | 'kanban';

export default function CRM() {
  const isMobile = useIsMobile();
  const { leads, isLoading, updateLead } = useLeads();
  const { users } = useUsers();
  const { stages, isLoading: stagesLoading } = useCrmStages();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Loss reason dialog
  const [lossDialogOpen, setLossDialogOpen] = useState(false);
  const [pendingLossDrop, setPendingLossDrop] = useState<{ leadId: string; stageId: string; leadTitle: string } | null>(null);

  const [filters, setFilters] = useState<Filters>({
    search: '',
    source: '',
    assignedTo: '',
    minValue: '',
    maxValue: '',
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Mobile-only: alternância List/Kanban. Default mobile = Lista; desktop = Kanban.
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  // Apply filters
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      if (filters.search) {
        const matchesTitle = fuzzyIncludes(lead.title, filters.search);
        const matchesCustomer = fuzzyIncludes(lead.customers?.name, filters.search);
        if (!matchesTitle && !matchesCustomer) return false;
      }
      if (filters.source && lead.source !== filters.source) return false;
      if (filters.assignedTo && lead.assigned_to !== filters.assignedTo) return false;
      if (filters.minValue && (lead.value || 0) < parseFloat(filters.minValue)) return false;
      if (filters.maxValue && (lead.value || 0) > parseFloat(filters.maxValue)) return false;
      return true;
    });
  }, [leads, filters]);

  // Group filtered leads by stage_id — assign leads without stage to the first stage
  const leadsByStage = useMemo(() => {
    const firstStageId = stages.length > 0 ? stages[0].id : null;
    return filteredLeads.reduce((acc, lead) => {
      const stageId = lead.stage_id || firstStageId || 'unassigned';
      if (!acc[stageId]) acc[stageId] = [];
      acc[stageId].push(lead);
      return acc;
    }, {} as Record<string, Lead[]>);
  }, [filteredLeads, stages]);

  // Calculate value by stage
  const valueByStage = useMemo(() => {
    return Object.entries(leadsByStage).reduce((acc, [stageId, stageLeads]) => {
      acc[stageId] = stageLeads.reduce((sum, lead) => sum + (lead.value || 0), 0);
      return acc;
    }, {} as Record<string, number>);
  }, [leadsByStage]);

  // Compute stats from filtered leads (not all leads)
  const filteredStats = useMemo(() => ({
    total: filteredLeads.length,
    totalValue: filteredLeads.reduce((sum, lead) => sum + (lead.value || 0), 0),
  }), [filteredLeads]);

  const activeFiltersCount = Object.values(filters).filter(v => v !== '').length;

  const clearFilters = () => {
    setFilters({ search: '', source: '', assignedTo: '', minValue: '', maxValue: '' });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handleEdit = (lead: Lead) => {
    setEditingLead(lead);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditingLead(null);
  };

  const handleLeadClick = (lead: Lead) => {
    setDetailLead(lead);
    setDetailOpen(true);
  };

  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    e.dataTransfer.setData('leadId', lead.id);
    e.dataTransfer.setData('leadTitle', lead.title);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('leadId');
    const leadTitle = e.dataTransfer.getData('leadTitle');
    if (!leadId) return;

    const targetStage = stages.find(s => s.id === stageId);
    if (targetStage?.is_lost) {
      setPendingLossDrop({ leadId, stageId, leadTitle });
      setLossDialogOpen(true);
      return;
    }

    await updateLead.mutateAsync({ id: leadId, stage_id: stageId });
  };

  const handleLossConfirm = async (reason: string, details: string) => {
    if (!pendingLossDrop) return;
    const lossNotes = `Motivo da perda: ${reason}${details ? `\n${details}` : ''}`;
    await updateLead.mutateAsync({
      id: pendingLossDrop.leadId,
      stage_id: pendingLossDrop.stageId,
      notes: lossNotes,
    });
    setLossDialogOpen(false);
    setPendingLossDrop(null);
  };

  // Mobile-only: ao mudar de stage via menu de ações no MobileListItem.
  const handleMoveToStage = async (lead: Lead, stageId: string) => {
    const targetStage = stages.find(s => s.id === stageId);
    if (targetStage?.is_lost) {
      setPendingLossDrop({ leadId: lead.id, stageId, leadTitle: lead.title });
      setLossDialogOpen(true);
      return;
    }
    await updateLead.mutateAsync({ id: lead.id, stage_id: stageId });
  };

  // Map stage color to style - supports both legacy named colors and hex
  const getStageHeaderStyle = (color: string): { className?: string; style?: React.CSSProperties } => {
    const legacyMap: Record<string, string> = {
      muted: 'bg-muted-foreground',
      info: 'bg-info',
      warning: 'bg-warning',
      success: 'bg-success',
      destructive: 'bg-destructive',
      primary: 'bg-primary',
    };
    if (legacyMap[color]) return { className: legacyMap[color] };
    return { style: { backgroundColor: color } };
  };

  // Hex resolvido para usar nos chips do StatCarousel.
  const getStageHexFallback = (color: string): string => {
    const legacyMap: Record<string, string> = {
      muted: '#6b7280',
      info: '#0ea5e9',
      warning: '#f59e0b',
      success: '#22c55e',
      destructive: '#ef4444',
      primary: '#2563eb',
    };
    return legacyMap[color] || color || '#6b7280';
  };

  // Stat items pro StatCarousel: 1 chip por stage (count), com cor do stage.
  // Tap no chip filtra leads daquela stage (na view list só mostra essa stage).
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const statItems: StatCarouselItem[] = stages.map((stage) => ({
    key: stage.id,
    label: stage.name,
    count: leadsByStage[stage.id]?.length || 0,
    icon: <TrendingUp className="h-4 w-4" />,
    accentColor: getStageHexFallback(stage.color),
    active: stageFilter === stage.id,
    onClick: () => setStageFilter(stageFilter === stage.id ? null : stage.id),
  }));

  // Lista mobile final: aplica stageFilter por cima dos filtros.
  const mobileListLeads = useMemo(() => {
    if (!stageFilter) return filteredLeads;
    const firstStageId = stages.length > 0 ? stages[0].id : null;
    return filteredLeads.filter((lead) => (lead.stage_id || firstStageId) === stageFilter);
  }, [filteredLeads, stageFilter, stages]);

  // Conteúdo do FilterSheet (mobile) — origem, vendedor, faixa de valor, view toggle.
  const filterSheetContent = (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Origem</label>
        <Select
          value={filters.source || 'all'}
          onValueChange={(value) => setFilters(prev => ({ ...prev, source: value === 'all' ? '' : value }))}
        >
          <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {LEAD_SOURCES.map(src => (
              <SelectItem key={src} value={src}>{src}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Vendedor</label>
        <Select
          value={filters.assignedTo || 'all'}
          onValueChange={(value) => setFilters(prev => ({ ...prev, assignedTo: value === 'all' ? '' : value }))}
        >
          <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {users.map(user => (
              <SelectItem key={user.user_id} value={user.user_id}>
                {user.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Valor mínimo</label>
          <Input
            type="number"
            placeholder="R$ 0"
            value={filters.minValue}
            onChange={(e) => setFilters(prev => ({ ...prev, minValue: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Valor máximo</label>
          <Input
            type="number"
            placeholder="R$ 999.999"
            value={filters.maxValue}
            onChange={(e) => setFilters(prev => ({ ...prev, maxValue: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Visualização</label>
        <div className="flex rounded-lg border overflow-hidden w-fit">
          <button
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm transition-colors',
              viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
            )}
            onClick={() => setViewMode('list')}
            type="button"
          >
            <LayoutList className="h-4 w-4" /> Lista
          </button>
          <button
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm transition-colors',
              viewMode === 'kanban' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
            )}
            onClick={() => setViewMode('kanban')}
            type="button"
          >
            <LayoutGrid className="h-4 w-4" /> Kanban
          </button>
        </div>
      </div>

      <div className="pt-2 border-t space-y-2">
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Configurações</label>
        <StageManagerDialog>
          <Button variant="outline" className="w-full justify-start gap-2" type="button">
            <Settings2 className="h-4 w-4" />
            Gerenciar estágios
          </Button>
        </StageManagerDialog>
        <WebhookManagerDialog>
          <Button variant="outline" className="w-full justify-start gap-2" type="button">
            <Webhook className="h-4 w-4" />
            Configurar webhooks
          </Button>
        </WebhookManagerDialog>
      </div>
    </div>
  );

  // Resumo (chip mobile): primeira stage "won" e primeira stage neutra
  const wonStage = stages.find(s => s.is_won);
  const neutralStage = stages.find(s => !s.is_won && !s.is_lost);

  // Resumo (header mobile) — total e valor total como dois chips de destaque.
  const summaryRow = (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-2xl border bg-primary text-white p-3 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-white/70">Total de leads</p>
          {isLoading ? (
            <Skeleton className="h-7 w-12 mt-1 bg-white/20" />
          ) : (
            <p className="text-2xl font-bold leading-none mt-1">{filteredStats.total}</p>
          )}
        </div>
        <Target className="h-5 w-5 opacity-80 shrink-0" />
      </div>
      <div className="rounded-2xl border bg-success text-white p-3 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-white/70">Valor total</p>
          {isLoading ? (
            <Skeleton className="h-7 w-20 mt-1 bg-white/20" />
          ) : (
            <p className="text-lg font-bold leading-tight mt-1 truncate">{formatCurrency(filteredStats.totalValue)}</p>
          )}
        </div>
        <DollarSign className="h-5 w-5 opacity-80 shrink-0" />
      </div>
    </div>
  );

  // ------------------------------------------------------------------
  // KANBAN — mesmo bloco usado em mobile e desktop.
  // No mobile, scroll horizontal preservado.
  // ------------------------------------------------------------------
  const kanbanBlock = (
    <div className="overflow-hidden">
      {!isMobile && (
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Pipeline de Vendas</h2>
          {filteredLeads.length !== leads.length && (
            <Badge variant="outline" className="ml-2">
              {filteredLeads.length} de {leads.length}
            </Badge>
          )}
        </div>
      )}

      {(isLoading || stagesLoading) ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="min-w-[280px] flex-shrink-0">
              <Skeleton className="h-8 w-full mb-4" />
              <div className="space-y-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : stages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Settings2 className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">Nenhum estágio configurado</h3>
            <p className="text-muted-foreground max-w-sm">
              Toque em configurações para criar estágios do pipeline
            </p>
          </CardContent>
        </Card>
      ) : filteredLeads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <TrendingUp className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">
              {leads.length === 0 ? 'Nenhuma oportunidade' : 'Nenhum resultado encontrado'}
            </h3>
            <p className="text-muted-foreground max-w-sm">
              {leads.length === 0
                ? 'Toque em "Nova Oportunidade" para começar a gerenciar seu pipeline de vendas'
                : 'Tente ajustar os filtros para encontrar as oportunidades desejadas'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto pb-4 -mx-1 px-1">
          <div className="flex gap-3 sm:gap-4" style={{ minWidth: `${stages.length * 280}px` }}>
            {stages.map((stage) => (
              <div
                key={stage.id}
                className="w-[260px] sm:w-[300px] flex-shrink-0"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                <div
                  className={cn('rounded-t-lg p-3 text-white', getStageHeaderStyle(stage.color).className)}
                  style={getStageHeaderStyle(stage.color).style}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{stage.name}</span>
                      <span className="text-xs font-medium bg-white/20 px-2 py-0.5 rounded-full">
                        {leadsByStage[stage.id]?.length || 0}
                      </span>
                    </div>
                  </div>
                  {(valueByStage[stage.id] || 0) > 0 && (
                    <p className="text-sm font-semibold mt-1.5 text-white/90">
                      {formatCurrency(valueByStage[stage.id] || 0)}
                    </p>
                  )}
                </div>

                <ScrollArea className="h-[450px] rounded-b-lg border border-t-0 bg-card">
                  <div className="space-y-3 p-3">
                    {(leadsByStage[stage.id] || []).map((lead) => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lead)}
                        className="cursor-grab active:cursor-grabbing"
                      >
                        <LeadCard
                          lead={lead}
                          onClick={() => handleLeadClick(lead)}
                        />
                      </div>
                    ))}
                    {(leadsByStage[stage.id]?.length || 0) === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        Arraste leads para cá
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ------------------------------------------------------------------
  // LISTA MOBILE — uma linha por lead, ações no menu de 3 pontos
  // (mover para estágio, editar, excluir é fora de escopo).
  // ------------------------------------------------------------------
  const mobileListBlock = (
    <>
      {isLoading || stagesLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full" />
          ))}
        </div>
      ) : mobileListLeads.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="h-12 w-12" />}
          title={leads.length === 0 ? 'Nenhuma oportunidade' : 'Nenhum resultado encontrado'}
          description={
            leads.length === 0
              ? 'Toque em "Novo Lead" para começar a gerenciar seu pipeline'
              : 'Tente ajustar os filtros ou estágio selecionado'
          }
        />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          {mobileListLeads.map((lead) => {
            const currentStage = stages.find(s => s.id === lead.stage_id) || stages[0];
            const stageHex = currentStage ? getStageHexFallback(currentStage.color) : '#6b7280';

            // Ações: editar + mover para cada outra stage.
            const moveActions: ItemAction[] = stages
              .filter((s) => s.id !== currentStage?.id)
              .map((s) => ({
                key: `move-${s.id}`,
                label: `Mover para ${s.name}`,
                icon: (
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: getStageHexFallback(s.color) }}
                  />
                ),
                onClick: () => handleMoveToStage(lead, s.id),
              }));

            const itemActions: ItemAction[] = [
              {
                key: 'edit',
                label: 'Editar',
                icon: <Pencil className="h-4 w-4" />,
                variant: 'edit',
                onClick: () => handleEdit(lead),
              },
              ...moveActions,
            ];

            return (
              <MobileListItem
                key={lead.id}
                onClick={() => handleLeadClick(lead)}
                actions={itemActions}
                leading={
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: stageHex }}
                  >
                    <TrendingUp className="h-5 w-5" />
                  </div>
                }
                title={
                  <span className="truncate">{lead.title}</span>
                }
                subtitle={
                  <div className="flex items-center gap-2 flex-wrap">
                    {lead.customers?.name && (
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {lead.customers.name}
                      </span>
                    )}
                    {lead.value && lead.value > 0 ? (
                      <span className="inline-flex items-center gap-1 text-primary font-medium">
                        <DollarSign className="h-3 w-3" />
                        {formatCurrency(lead.value)}
                      </span>
                    ) : null}
                    {lead.expected_close_date && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(lead.expected_close_date), 'dd/MM', { locale: ptBR })}
                      </span>
                    )}
                  </div>
                }
                trailing={
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-2 py-0.5 whitespace-nowrap text-white border-0"
                    style={{ backgroundColor: stageHex }}
                  >
                    {currentStage?.name || '—'}
                  </Badge>
                }
              />
            );
          })}
        </div>
      )}
    </>
  );

  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------
  if (isMobile) {
    return (
      <div className="space-y-4 pb-24 min-w-0">
        <MobilePageHeader
          title="CRM"
          subtitle="Pipeline de vendas"
          icon={TrendingUp}
        />

        {summaryRow}

        {/* Busca + filtros */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar lead ou cliente..."
              className="pl-10 h-10"
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            />
          </div>
          <FilterSheet
            triggerLabel="Filtros"
            activeCount={activeFiltersCount + (viewMode === 'list' ? 0 : 0)}
            onClear={clearFilters}
          >
            {filterSheetContent}
          </FilterSheet>
        </div>

        {/* StatCarousel — 1 chip por stage; tap filtra (apenas view lista). */}
        {stages.length > 0 && viewMode === 'list' && (
          <StatCarousel items={statItems} loading={isLoading || stagesLoading} />
        )}

        {/* Indicador da stage filtrada (mobile lista) */}
        {viewMode === 'list' && stageFilter && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              Estágio: {stages.find(s => s.id === stageFilter)?.name}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setStageFilter(null)} />
            </Badge>
          </div>
        )}

        {/* Conteúdo */}
        {viewMode === 'list' ? mobileListBlock : kanbanBlock}

        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label="Novo Lead"
          onClick={() => setDialogOpen(true)}
        />

        {/* Dialogs */}
        <LeadFormDialog
          open={dialogOpen}
          onOpenChange={handleDialogClose}
          lead={editingLead}
        />
        <LeadDetailModal
          open={detailOpen}
          onOpenChange={setDetailOpen}
          lead={detailLead}
          onEdit={(lead) => {
            setDetailOpen(false);
            handleEdit(lead);
          }}
        />
        <LossReasonDialog
          open={lossDialogOpen}
          onOpenChange={(open) => {
            setLossDialogOpen(open);
            if (!open) setPendingLossDrop(null);
          }}
          onConfirm={handleLossConfirm}
          leadTitle={pendingLossDrop?.leadTitle}
        />
      </div>
    );
  }

  // ------------------------------------------------------------------
  // DESKTOP — layout original 100% preservado.
  // ------------------------------------------------------------------
  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="CRM"
        subtitle="Gerencie oportunidades e leads"
        icon={TrendingUp}
        actions={
          <>
            <StageManagerDialog>
              <Button variant="outline" size="icon" title="Gerenciar Estágios">
                <Settings2 className="h-4 w-4" />
              </Button>
            </StageManagerDialog>
            <WebhookManagerDialog>
              <Button variant="outline" size="icon" title="Configurar Webhooks">
                <Webhook className="h-4 w-4" />
              </Button>
            </WebhookManagerDialog>
            <Button onClick={() => setDialogOpen(true)} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="h-4 w-4" />
              Nova Oportunidade
            </Button>
          </>
        }
      />

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-0 bg-primary text-white">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col items-center text-center gap-2 sm:flex-row sm:justify-between sm:text-left">
              <div className="min-w-0 w-full">
                <p className="text-sm text-white/70">Total de Leads</p>
                {isLoading ? <Skeleton className="h-8 w-12 mt-1 bg-white/20" /> : <p className="text-2xl sm:text-3xl font-bold">{filteredStats.total}</p>}
              </div>
              <div className="rounded-full bg-white/20 p-3 shrink-0 hidden sm:flex"><Target className="h-6 w-6" /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-success text-white">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col items-center text-center gap-2 sm:flex-row sm:justify-between sm:text-left">
              <div className="min-w-0 w-full">
                <p className="text-sm text-white/70">Valor Total</p>
                {isLoading ? <Skeleton className="h-8 w-24 mt-1 bg-white/20" /> : <p className="text-xl sm:text-2xl font-bold truncate">{formatCurrency(filteredStats.totalValue)}</p>}
              </div>
              <div className="rounded-full bg-white/20 p-3 shrink-0 hidden sm:flex"><DollarSign className="h-6 w-6" /></div>
            </div>
          </CardContent>
        </Card>

        {wonStage && (
          <Card key={wonStage.id} className="border-0 bg-info text-white">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col items-center text-center gap-2 sm:flex-row sm:justify-between sm:text-left">
                <div className="min-w-0 w-full">
                  <p className="text-sm text-white/70 truncate">{wonStage.name}</p>
                  {isLoading ? <Skeleton className="h-8 w-24 mt-1 bg-white/20" /> : <p className="text-xl sm:text-2xl font-bold truncate">{formatCurrency(valueByStage[wonStage.id] || 0)}</p>}
                </div>
                <div className="rounded-full bg-white/20 p-3 shrink-0 hidden sm:flex"><TrendingUp className="h-6 w-6" /></div>
              </div>
            </CardContent>
          </Card>
        )}

        {neutralStage && (
          <Card key={neutralStage.id} className="border-0 bg-warning text-white">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col items-center text-center gap-2 sm:flex-row sm:justify-between sm:text-left">
                <div className="min-w-0 w-full">
                  <p className="text-sm text-white/70 truncate">{neutralStage.name}</p>
                  {isLoading ? <Skeleton className="h-8 w-24 mt-1 bg-white/20" /> : <p className="text-xl sm:text-2xl font-bold truncate">{formatCurrency(valueByStage[neutralStage.id] || 0)}</p>}
                </div>
                <div className="rounded-full bg-white/20 p-3 shrink-0 hidden sm:flex"><Users className="h-6 w-6" /></div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por título ou cliente..."
            className="pl-10"
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
          />
        </div>

        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filtros
              {activeFiltersCount > 0 && (
                <Badge className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs bg-primary text-white">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Filtros</h4>
                {activeFiltersCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
                    <X className="h-3 w-3 mr-1" />
                    Limpar
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <Label>Origem</Label>
                <Select
                  value={filters.source || 'all'}
                  onValueChange={(value) => setFilters(prev => ({ ...prev, source: value === 'all' ? '' : value }))}
                >
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {LEAD_SOURCES.map(src => (
                      <SelectItem key={src} value={src}>{src}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Vendedor</Label>
                <Select
                  value={filters.assignedTo || 'all'}
                  onValueChange={(value) => setFilters(prev => ({ ...prev, assignedTo: value === 'all' ? '' : value }))}
                >
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {users.map(user => (
                      <SelectItem key={user.user_id} value={user.user_id}>
                        {user.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Valor Mínimo</Label>
                  <Input
                    type="number"
                    placeholder="R$ 0"
                    value={filters.minValue}
                    onChange={(e) => setFilters(prev => ({ ...prev, minValue: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor Máximo</Label>
                  <Input
                    type="number"
                    placeholder="R$ 999.999"
                    value={filters.maxValue}
                    onChange={(e) => setFilters(prev => ({ ...prev, maxValue: e.target.value }))}
                  />
                </div>
              </div>

              <Button className="w-full" onClick={() => setFiltersOpen(false)}>
                Aplicar Filtros
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active Filters Display */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.source && (
            <Badge className="gap-1 bg-foreground text-background">
              Origem: {filters.source}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setFilters(prev => ({ ...prev, source: '' }))} />
            </Badge>
          )}
          {filters.assignedTo && (
            <Badge className="gap-1 bg-foreground text-background">
              Vendedor: {users.find(u => u.user_id === filters.assignedTo)?.full_name || 'N/A'}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setFilters(prev => ({ ...prev, assignedTo: '' }))} />
            </Badge>
          )}
          {filters.minValue && (
            <Badge className="gap-1 bg-foreground text-background">
              Min: {formatCurrency(parseFloat(filters.minValue))}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setFilters(prev => ({ ...prev, minValue: '' }))} />
            </Badge>
          )}
          {filters.maxValue && (
            <Badge className="gap-1 bg-foreground text-background">
              Max: {formatCurrency(parseFloat(filters.maxValue))}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setFilters(prev => ({ ...prev, maxValue: '' }))} />
            </Badge>
          )}
        </div>
      )}

      {kanbanBlock}

      <LeadFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        lead={editingLead}
      />
      <LeadDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        lead={detailLead}
        onEdit={(lead) => {
          setDetailOpen(false);
          handleEdit(lead);
        }}
      />
      <LossReasonDialog
        open={lossDialogOpen}
        onOpenChange={(open) => {
          setLossDialogOpen(open);
          if (!open) setPendingLossDrop(null);
        }}
        onConfirm={handleLossConfirm}
        leadTitle={pendingLossDrop?.leadTitle}
      />
    </div>
  );
}
