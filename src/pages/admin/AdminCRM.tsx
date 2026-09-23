import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Search, DollarSign, TrendingUp, Users, LayoutList, LayoutGrid, Filter, ClipboardList, User, GripVertical } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilterCheckboxGroup, type FilterCheckboxOption } from '@/components/mobile/FilterCheckboxGroup';
import { useAdminLeads, useAdminCrmStages, type AdminLead } from '@/hooks/useAdminCrm';
import { useCompanyOrigins } from '@/hooks/useCompanyOrigins';
import { AdminLeadFormDialog } from '@/components/admin/AdminLeadFormDialog';
import { AdminLeadDetailModal } from '@/components/admin/AdminLeadDetailModal';
import { AdminLeadCard } from '@/components/admin/AdminLeadCard';
import { IconPreview } from '@/components/customers/originIcons';
import { LossReasonDialog } from '@/components/crm/LossReasonDialog';
import { COMPANY_SEGMENTS } from '@/utils/companySegments';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn, fuzzyIncludesAny } from '@/lib/utils';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { StatCarousel, type StatCarouselItem } from '@/components/mobile/StatCarousel';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { AdminTasksTab } from '@/components/admin/tasks/AdminTasksTab';
import { useAdminTasksCount } from '@/hooks/useAdminTasks';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';

type DatePreset = 'all' | 'today' | 'this_week' | 'this_month' | 'this_year' | 'custom';
type ViewMode = 'kanban' | 'list';

function computeDateRange(preset: DatePreset, from: string, to: string): { from: Date | null; to: Date | null } {
  const now = new Date();
  switch (preset) {
    case 'today': return { from: startOfDay(now), to: endOfDay(now) };
    case 'this_week': return { from: startOfWeek(now, { weekStartsOn: 0 }), to: endOfWeek(now, { weekStartsOn: 0 }) };
    case 'this_month': return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'this_year': return { from: startOfYear(now), to: endOfYear(now) };
    case 'custom': return {
      from: from ? new Date(from + 'T00:00:00') : null,
      to: to ? new Date(to + 'T23:59:59') : null,
    };
    default: return { from: null, to: null };
  }
}

type CrmTabKey = 'crm' | 'tarefas';

export default function AdminCRM() {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: openTasksCount = 0 } = useAdminTasksCount();

  // Aba ativa: querystring tem prioridade; senão localStorage; senão 'crm'.
  const [activeTab, setActiveTab] = useState<CrmTabKey>(() => {
    const fromUrl = searchParams.get('tab');
    if (fromUrl === 'tarefas' || fromUrl === 'crm') return fromUrl;
    const saved = typeof window !== 'undefined' ? localStorage.getItem('admin-crm-active-tab') : null;
    return saved === 'tarefas' ? 'tarefas' : 'crm';
  });

  // Sincroniza ?tab= na URL se vier vazia (sem empilhar histórico).
  useEffect(() => {
    if (searchParams.get('tab') !== activeTab) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', activeTab);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleTabChange = (v: string) => {
    const key = (v === 'tarefas' ? 'tarefas' : 'crm') as CrmTabKey;
    setActiveTab(key);
    localStorage.setItem('admin-crm-active-tab', key);
  };

  const tasksLabel = (
    <span className="inline-flex items-center gap-1.5">
      Tarefas
      {openTasksCount > 0 && (
        <Badge className="h-4 min-w-4 px-1 text-[10px] bg-primary text-primary-foreground border-0">
          {openTasksCount}
        </Badge>
      )}
    </span>
  );

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 pt-4 lg:pt-6">
        {isMobile ? (
          <MobilePillTabs
            tabs={[
              { value: 'crm', label: 'CRM' },
              {
                value: 'tarefas',
                label: openTasksCount > 0 ? `Tarefas (${openTasksCount})` : 'Tarefas',
                icon: <ClipboardList className="h-4 w-4" />,
              },
            ]}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        ) : (
          <TabsList>
            <TabsTrigger value="crm">CRM</TabsTrigger>
            <TabsTrigger value="tarefas">{tasksLabel}</TabsTrigger>
          </TabsList>
        )}
      </div>

      <TabsContent value="crm" className="mt-0">
        <CrmTab />
      </TabsContent>

      <TabsContent value="tarefas" className="mt-0">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6">
          <AdminTasksTab />
        </div>
      </TabsContent>
    </Tabs>
  );
}

function CrmTab() {
  const { user } = useAuth();
  const { leads, isLoading, updateLead } = useAdminLeads();
  const { stages, isLoading: stagesLoading, reorderStages } = useAdminCrmStages();
  const { origins } = useCompanyOrigins();

  // Mapa user_id -> vendedor (pra mostrar avatar do responsável no card quando o
  // lead tem responsible_id apontando pra um usuário vinculado a um vendedor).
  const { data: salespeopleBasic = [] } = useQuery({
    queryKey: ['salespeople-basic-with-photo'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salespeople_basic')
        .select('id, name, user_id, photo_url');
      if (error) throw error;
      return data || [];
    },
  });

  const salespersonByUserId = useMemo(() => {
    const m = new Map<string, { id: string; name: string; photo_url: string | null }>();
    for (const sp of salespeopleBasic) {
      if (sp.user_id && sp.id && sp.name) {
        m.set(sp.user_id, { id: sp.id, name: sp.name, photo_url: sp.photo_url ?? null });
      }
    }
    return m;
  }, [salespeopleBasic]);

  const isMobile = useIsMobile();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<AdminLead | null>(null);
  const [detailLead, setDetailLead] = useState<AdminLead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [lossDialogOpen, setLossDialogOpen] = useState(false);
  const [pendingLossDrop, setPendingLossDrop] = useState<{ leadId: string; stageId: string; leadTitle: string } | null>(null);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dropTargetStageId, setDropTargetStageId] = useState<string | null>(null);

  // Arrastar a COLUNA (cabeçalho da etapa) pra reordenar o funil — mesmo
  // mecanismo nativo já usado pra mover card entre colunas, sem lib extra. A
  // área arrastável fica restrita ao cabeçalho, então segurar no card continua
  // movendo o card. Desligado no mobile: o gesto colide com o scroll horizontal
  // por toque e o drag HTML5 nativo não é confiável em touch.
  const [draggedStageId, setDraggedStageId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  // Durante a busca, etapa sem resultado some do quadro (o funil fica legível
  // com 8 colunas e 1 resultado). Vale só pra busca atual — trocar o texto
  // volta o padrão.
  const [showEmptyStages, setShowEmptyStages] = useState(false);

  // View mode mobile (kanban default, conforme briefing). Desktop sempre kanban.
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  // Filters — Origem/Segmento/Responsável multi-select (array vazio = inativo); Data range fica single.
  const [filterOrigin, setFilterOrigin] = useState<string[]>([]);
  const [filterSegment, setFilterSegment] = useState<string[]>([]);
  const [filterResponsible, setFilterResponsible] = useState<string[]>([]);
  const [filterDatePreset, setFilterDatePreset] = useState<DatePreset>('all');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');

  // Opções de Responsável = usuários do admin (salespeople_basic com user_id).
  // value = user_id (= auth uid de responsible_id), label = nome.
  const responsibleOptions = useMemo<FilterCheckboxOption[]>(
    () => Array.from(salespersonByUserId.entries()).map(([userId, sp]) => ({
      value: userId,
      label: sp.name,
    })),
    [salespersonByUserId],
  );

  // Default: ao abrir, filtra pelos leads do próprio usuário logado (quando ele é
  // um responsável atribuível). Aplica UMA vez — depois disso, limpar o filtro de
  // Responsável persiste (a ref impede re-aplicação do default).
  const didInitResponsibleRef = useRef(false);
  useEffect(() => {
    if (didInitResponsibleRef.current) return;
    if (salespersonByUserId.size === 0) return; // lista ainda carregando
    didInitResponsibleRef.current = true;
    if (user?.id && salespersonByUserId.has(user.id)) {
      setFilterResponsible([user.id]);
    }
  }, [salespersonByUserId, user?.id]);

  useEffect(() => {
    setShowEmptyStages(false);
  }, [search]);

  const activeFilterCount =
    (filterOrigin.length > 0 ? 1 : 0) +
    (filterSegment.length > 0 ? 1 : 0) +
    (filterResponsible.length > 0 ? 1 : 0) +
    (filterDatePreset !== 'all' ? 1 : 0);

  const clearFilters = () => {
    setFilterOrigin([]);
    setFilterSegment([]);
    setFilterResponsible([]);
    setFilterDatePreset('all');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  const filteredLeads = useMemo(() => {
    const { from, to } = computeDateRange(filterDatePreset, filterDateFrom, filterDateTo);
    return leads.filter(l => {
      if (
        search &&
        !fuzzyIncludesAny(
          [l.title, l.company_name, l.contact_name, l.phone, l.email],
          search,
        )
      ) return false;
      if (filterOrigin.length > 0 && (!l.source || !filterOrigin.includes(l.source))) return false;
      if (filterSegment.length > 0 && (!l.segment || !filterSegment.includes(l.segment))) return false;
      if (filterResponsible.length > 0 && (!l.responsible_id || !filterResponsible.includes(l.responsible_id))) return false;
      if (from || to) {
        const created = new Date(l.created_at);
        if (from && created < from) return false;
        if (to && created > to) return false;
      }
      return true;
    });
  }, [leads, search, filterOrigin, filterSegment, filterResponsible, filterDatePreset, filterDateFrom, filterDateTo]);

  const leadsByStage = useMemo(() => {
    const map: Record<string, AdminLead[]> = {};
    for (const stage of stages) map[stage.id] = [];
    for (const lead of filteredLeads) {
      if (lead.stage_id && map[lead.stage_id]) map[lead.stage_id].push(lead);
    }
    return map;
  }, [filteredLeads, stages]);

  const getLeadsByStage = (stageId: string) => leadsByStage[stageId] || [];

  // Só a BUSCA esconde etapa vazia. Filtro de origem/segmento/responsável NÃO
  // esconde: ali o usuário está recortando o funil e quer continuar vendo a
  // forma dele (mesma régua do CRM do tenant).
  const hidesEmptyStages = !!search.trim() && !showEmptyStages;
  const visibleStages = useMemo(
    () => (hidesEmptyStages ? stages.filter(st => (leadsByStage[st.id]?.length || 0) > 0) : stages),
    [hidesEmptyStages, stages, leadsByStage],
  );
  const hiddenStagesCount = stages.length - visibleStages.length;

  // Métricas refletem o mesmo conjunto exibido no kanban (filteredLeads),
  // pra evitar inconsistência entre cards e colunas quando há filtro aplicado.
  const totalValue = filteredLeads.reduce((s, l) => s + Number(l.value || 0), 0);
  const activeLeads = filteredLeads.filter(l => {
    const stage = stages.find(s => s.id === l.stage_id);
    return !stage?.is_won && !stage?.is_lost;
  });
  const wonLeadsCount = filteredLeads.filter(l => stages.find(s => s.id === l.stage_id)?.is_won).length;

  // Itens do StatCarousel mobile: Total + Em Negociação + Ganhos + 1 chip por estágio.
  const statItems: StatCarouselItem[] = useMemo(() => {
    const base: StatCarouselItem[] = [
      {
        key: 'total',
        label: 'Total',
        count: filteredLeads.length,
        icon: <Users className="h-4 w-4" />,
        accentColor: 'hsl(var(--primary))',
      },
      {
        key: 'active',
        label: 'Em Negociação',
        count: activeLeads.length,
        icon: <TrendingUp className="h-4 w-4" />,
        accentColor: 'hsl(var(--warning))',
      },
      {
        key: 'won',
        label: 'Ganhos',
        count: wonLeadsCount,
        icon: <DollarSign className="h-4 w-4" />,
        accentColor: 'hsl(var(--success))',
      },
    ];
    const perStage: StatCarouselItem[] = stages.map(stage => ({
      key: `stage-${stage.id}`,
      label: stage.name,
      count: getLeadsByStage(stage.id).length,
      icon: <TrendingUp className="h-4 w-4" />,
      accentColor: stage.color,
    }));
    return [...base, ...perStage];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredLeads, activeLeads.length, wonLeadsCount, stages]);

  // Drag de coluna (reordenar etapa) e drag de card compartilham os mesmos
  // handlers do <div> da coluna. O que separa um do outro é o payload
  // `stageId` no dataTransfer: só o cabeçalho da etapa o grava.
  const handleStageDragStart = (e: React.DragEvent, stageId: string) => {
    e.stopPropagation();
    setDraggedStageId(stageId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('stageId', stageId);
  };

  const handleStageDragEnd = () => {
    setDraggedStageId(null);
    setDragOverStageId(null);
  };

  const handleColumnDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedStageId) {
      if (draggedStageId !== stageId) setDragOverStageId(stageId);
    } else {
      setDropTargetStageId(stageId);
    }
  };

  const handleColumnDragLeave = (stageId: string) => {
    setDropTargetStageId(prev => (prev === stageId ? null : prev));
    setDragOverStageId(prev => (prev === stageId ? null : prev));
  };

  const handleColumnDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const draggedFromEvent = e.dataTransfer.getData('stageId');
    if (draggedFromEvent) {
      setDragOverStageId(null);
      setDraggedStageId(null);
      if (draggedFromEvent === stageId) return;
      // Reordena sobre `stages` (lista COMPLETA), nunca sobre `visibleStages`:
      // gravar posição a partir de uma lista parcial embaralharia o funil.
      const draggedIndex = stages.findIndex(st => st.id === draggedFromEvent);
      const targetIndex = stages.findIndex(st => st.id === stageId);
      if (draggedIndex === -1 || targetIndex === -1) return;
      const newOrder = [...stages];
      const [removed] = newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, removed);
      reorderStages.mutate(newOrder.map(st => st.id));
      return;
    }
    handleDrop(stageId);
  };

  const handleDrop = (stageId: string) => {
    setDropTargetStageId(null);
    if (!draggedLeadId) return;
    const targetStage = stages.find(s => s.id === stageId);
    if (targetStage?.is_lost) {
      const lead = leads.find(l => l.id === draggedLeadId);
      setPendingLossDrop({ leadId: draggedLeadId, stageId, leadTitle: lead?.title || '' });
      setLossDialogOpen(true);
    } else {
      updateLead.mutate({ id: draggedLeadId, stage_id: stageId });
    }
    setDraggedLeadId(null);
  };

  const handleLossConfirm = (reason: string) => {
    if (pendingLossDrop) {
      updateLead.mutate({ id: pendingLossDrop.leadId, stage_id: pendingLossDrop.stageId, loss_reason: reason });
    }
    setPendingLossDrop(null);
    setLossDialogOpen(false);
  };

  const getOriginInfo = (sourceName: string | null) => {
    if (!sourceName) return null;
    return origins.find(o => o.name === sourceName);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  };

  const formatCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  const openWhatsApp = (phone: string | null, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!phone) return;
    const digits = phone.replace(/\D/g, '');
    const number = digits.length <= 11 ? `55${digits}` : digits;
    window.open(`https://wa.me/${number}`, '_blank');
  };

  if (isLoading || stagesLoading) {
    return (
      <div className={cn('container mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4', isMobile && 'pb-24')}>
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-4 overflow-x-auto">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-96 w-72 shrink-0" />)}
        </div>
      </div>
    );
  }

  // Conteúdo do FilterSheet (compartilhado mobile/desktop via primitivo).
  const filtersContent = (
    <FiltersForm
      origins={origins}
      filterOrigin={filterOrigin} setFilterOrigin={setFilterOrigin}
      filterSegment={filterSegment} setFilterSegment={setFilterSegment}
      responsibleOptions={responsibleOptions}
      filterResponsible={filterResponsible} setFilterResponsible={setFilterResponsible}
      filterDatePreset={filterDatePreset} setFilterDatePreset={setFilterDatePreset}
      filterDateFrom={filterDateFrom} setFilterDateFrom={setFilterDateFrom}
      filterDateTo={filterDateTo} setFilterDateTo={setFilterDateTo}
      isMobile={isMobile}
      viewMode={viewMode}
      setViewMode={setViewMode}
    />
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn('container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-4', isMobile && 'pb-24')}>
        {/* Header — mobile compacto, desktop inline original */}
        {isMobile ? (
          <MobilePageHeader
            title="CRM/Tarefas"
            subtitle="Pipeline de vendas da Dominex"
            icon={TrendingUp}
          />
        ) : (
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-foreground">CRM/Tarefas</h1>
            <p className="text-sm text-muted-foreground">Pipeline de vendas da Dominex</p>
          </div>
        )}

        {/* Stats: mobile = carrossel (Total + Negociação + Ganhos + 1 chip por estágio).
            Desktop = grid 4 cards original (inclui Valor Total). */}
        {isMobile ? (
          <StatCarousel items={statItems} loading={isLoading || stagesLoading} />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card><CardContent className="p-3"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Total de Leads</p><p className="text-lg font-bold">{filteredLeads.length}</p></div></div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Em Negociação</p><p className="text-lg font-bold">{activeLeads.length}</p></div></div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Valor Total</p><p className="text-lg font-bold">{formatCurrency(totalValue)}</p></div></div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-green-500" /><div><p className="text-xs text-muted-foreground">Ganhos</p><p className="text-lg font-bold text-green-600">{wonLeadsCount}</p></div></div></CardContent></Card>
          </div>
        )}

        {/* Search + Actions */}
        {isMobile ? (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar leads..."
                className="pl-9 h-10"
              />
            </div>
            <FilterSheet
              triggerLabel="Filtros"
              activeCount={activeFilterCount + (viewMode !== 'kanban' ? 1 : 0)}
              onClear={clearFilters}
            >
              {filtersContent}
            </FilterSheet>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="relative flex-1 sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar leads..." className="pl-9" />
            </div>
            <div className="flex gap-2 sm:ml-auto">
              <DesktopFilterPopover
                origins={origins}
                filterOrigin={filterOrigin} setFilterOrigin={setFilterOrigin}
                filterSegment={filterSegment} setFilterSegment={setFilterSegment}
                responsibleOptions={responsibleOptions}
                filterResponsible={filterResponsible} setFilterResponsible={setFilterResponsible}
                filterDatePreset={filterDatePreset} setFilterDatePreset={setFilterDatePreset}
                filterDateFrom={filterDateFrom} setFilterDateFrom={setFilterDateFrom}
                filterDateTo={filterDateTo} setFilterDateTo={setFilterDateTo}
                activeFilterCount={activeFilterCount}
                onClear={clearFilters}
              />
              <Button onClick={() => { setEditingLead(null); setDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" /> Novo Lead
              </Button>
            </div>
          </div>
        )}

        {/* Visualização — Kanban (mobile e desktop) OU Lista (mobile opt-in via FilterSheet) */}
        {isMobile && viewMode === 'list' ? (
          // === MOBILE LIST VIEW =================================================
          filteredLeads.length === 0 ? (
            <EmptyState
              icon={<TrendingUp className="h-12 w-12" />}
              title={search || activeFilterCount > 0 ? 'Nenhum lead encontrado' : 'Nenhum lead'}
              description={search || activeFilterCount > 0 ? 'Tente filtros diferentes.' : 'Toque em "Novo Lead" para começar.'}
            />
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              {filteredLeads.map((lead) => {
                const stage = stages.find(s => s.id === lead.stage_id);
                const originInfo = getOriginInfo(lead.source);
                const value = Number(lead.value || 0);
                const responsible = lead.responsible_id ? salespersonByUserId.get(lead.responsible_id) ?? null : null;
                return (
                  <MobileListItem
                    key={lead.id}
                    onClick={() => { setDetailLead(lead); setDetailOpen(true); }}
                    leading={
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-white text-xs font-medium"
                        style={{ backgroundColor: stage?.color || '#00C597' }}
                      >
                        {getInitials(lead.title)}
                      </div>
                    }
                    title={
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{lead.title}</span>
                      </div>
                    }
                    subtitle={
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        {lead.company_name && (
                          <span className="text-primary font-medium truncate max-w-[130px]">
                            {lead.company_name}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <User className="h-3 w-3 shrink-0" />
                          {responsible ? (
                            <span className="font-medium text-foreground truncate max-w-[100px]">{responsible.name.split(' ')[0]}</span>
                          ) : (
                            <span className="italic">Sem responsável</span>
                          )}
                        </span>
                      </div>
                    }
                    trailing={
                      <div className="flex flex-col items-end gap-1">
                        {stage && (
                          <Badge
                            className="text-[10px] px-2 py-0.5 whitespace-nowrap text-white border-0"
                            style={{ backgroundColor: stage.color }}
                          >
                            {stage.name}
                          </Badge>
                        )}
                        {value > 0 && (
                          <span className="text-xs font-semibold text-green-600">{formatCurrency(value)}</span>
                        )}
                      </div>
                    }
                  />
                );
              })}
            </div>
          )
        ) : (
          // === KANBAN VIEW (mobile e desktop) ===================================
          // Repaginado pra bater com o funil do CRM do cliente: cabeçalho de
          // coluna colorido inteiro (com ícone da etapa, contagem e total),
          // card da oportunidade em componente próprio (AdminLeadCard) e as
          // duas mecânicas que faltavam aqui — esconder etapa vazia durante a
          // busca e arrastar a coluna pra reordenar o funil.
          <div className="space-y-2">
            {hiddenStagesCount > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {hiddenStagesCount === 1
                    ? '1 etapa sem resultado está escondida'
                    : `${hiddenStagesCount} etapas sem resultado estão escondidas`}
                </span>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => setShowEmptyStages(true)}
                >
                  Mostrar todas
                </Button>
              </div>
            )}

            {stages.length === 0 ? (
              <EmptyState
                icon={<TrendingUp className="h-12 w-12" />}
                title="Nenhuma etapa configurada"
                description="Crie as etapas do funil em Configurações para começar a usar o CRM."
              />
            ) : visibleStages.length === 0 ? (
              /* Só cai aqui quando a BUSCA escondeu todas as etapas. Funil COM
                 etapas e SEM lead continua desenhando as colunas: sem coluna, o
                 usuário fica sem alvo pra arrastar card pra dentro. */
              <EmptyState
                icon={<TrendingUp className="h-12 w-12" />}
                title="Nenhum lead encontrado"
                description="Tente outra busca ou outros filtros."
              />
            ) : (
              <div className="flex gap-3 sm:gap-4 lg:gap-6 overflow-x-auto pb-4 -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6">
                {visibleStages.map(stage => {
                  const stageLeads = leadsByStage[stage.id] || [];
                  const stageTotal = stageLeads.reduce((acc, l) => acc + Number(l.value || 0), 0);
                  const isDropTarget = dropTargetStageId === stage.id && !draggedStageId;
                  // Reordenar fica DESLIGADO enquanto o funil esconde as vazias:
                  // arrastar aqui reordenaria uma lista PARCIAL e gravaria a
                  // ordem errada pra todo mundo.
                  const canDragStage = !isMobile && !hidesEmptyStages;
                  return (
                    <div
                      key={stage.id}
                      className={cn(
                        'w-[280px] sm:w-[300px] shrink-0 flex flex-col transition-opacity',
                        draggedStageId === stage.id && 'opacity-50',
                      )}
                      onDragOver={e => handleColumnDragOver(e, stage.id)}
                      onDragLeave={() => handleColumnDragLeave(stage.id)}
                      onDrop={e => handleColumnDrop(e, stage.id)}
                    >
                      <div
                        className={cn(
                          'rounded-t-lg p-3 text-white shrink-0',
                          canDragStage && 'cursor-grab active:cursor-grabbing',
                          dragOverStageId === stage.id && 'ring-2 ring-inset ring-white',
                        )}
                        style={{ backgroundColor: stage.color }}
                        draggable={canDragStage}
                        onDragStart={e => handleStageDragStart(e, stage.id)}
                        onDragEnd={handleStageDragEnd}
                        title={canDragStage ? 'Arraste para reordenar a etapa' : undefined}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {canDragStage && <GripVertical className="h-3.5 w-3.5 text-white/60 shrink-0" />}
                            {stage.icon && <IconPreview name={stage.icon} className="h-3.5 w-3.5 shrink-0" />}
                            <span className="font-semibold text-sm truncate">{stage.name}</span>
                          </div>
                          <span className="text-xs font-medium bg-white/20 px-2 py-0.5 rounded-full shrink-0">
                            {stageLeads.length}
                          </span>
                        </div>
                        {/* Sempre renderizada (mesmo em R$ 0,00) — senão a coluna
                            perde essa linha e o cabeçalho fica mais baixo que os
                            vizinhos. */}
                        <p className="text-sm font-semibold mt-1.5 text-white/90">
                          {formatCurrency(stageTotal)}
                        </p>
                      </div>

                      <ScrollArea
                        className={cn(
                          'rounded-b-lg border border-t-0 bg-card transition-all',
                          isMobile ? 'h-[calc(100vh-420px)]' : 'h-[calc(100vh-360px)]',
                          isDropTarget && 'ring-2 ring-inset ring-primary bg-primary/5',
                        )}
                      >
                        <div className="space-y-3 p-3">
                          {stageLeads.length === 0 ? (
                            isDropTarget ? (
                              <div className="text-center py-12 text-sm text-primary">Solte aqui para mover</div>
                            ) : (
                              <EmptyState
                                size="compact"
                                icon={<TrendingUp className="h-10 w-10" />}
                                title="Sem leads"
                              />
                            )
                          ) : (
                            stageLeads.map(lead => (
                              <div
                                key={lead.id}
                                draggable
                                onDragStart={() => setDraggedLeadId(lead.id)}
                                onDragEnd={() => { setDraggedLeadId(null); setDropTargetStageId(null); }}
                                className={cn(
                                  'cursor-grab active:cursor-grabbing transition-all',
                                  draggedLeadId === lead.id && 'opacity-40 scale-95',
                                )}
                              >
                                <AdminLeadCard
                                  lead={lead}
                                  origin={getOriginInfo(lead.source)}
                                  responsible={
                                    lead.responsible_id
                                      ? salespersonByUserId.get(lead.responsible_id) ?? null
                                      : null
                                  }
                                  onClick={() => { setDetailLead(lead); setDetailOpen(true); }}
                                />
                              </div>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <AdminLeadFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editingLead={editingLead} />
        {detailLead && (
          <AdminLeadDetailModal open={detailOpen} onOpenChange={setDetailOpen} lead={detailLead} />
        )}
        <LossReasonDialog
          open={lossDialogOpen}
          onOpenChange={setLossDialogOpen}
          leadTitle={pendingLossDrop?.leadTitle || ''}
          onConfirm={handleLossConfirm}
        />

        {/* FAB Novo Lead no mobile */}
        {isMobile && (
          <FABButton
            icon={<Plus className="h-5 w-5" />}
            label="Lead"
            onClick={() => { setEditingLead(null); setDialogOpen(true); }}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

// ============================================================================
// Form de filtros — reaproveitado mobile (FilterSheet) e desktop (Sheet/Popover).
// No mobile, inclui um toggle de visualização List/Kanban no topo.
// ============================================================================
interface FiltersFormProps {
  origins: { id: string; name: string; color?: string | null; icon?: string | null }[];
  filterOrigin: string[];
  setFilterOrigin: (v: string[]) => void;
  filterSegment: string[];
  setFilterSegment: (v: string[]) => void;
  responsibleOptions: FilterCheckboxOption[];
  filterResponsible: string[];
  setFilterResponsible: (v: string[]) => void;
  filterDatePreset: DatePreset;
  setFilterDatePreset: (v: DatePreset) => void;
  filterDateFrom: string;
  setFilterDateFrom: (v: string) => void;
  filterDateTo: string;
  setFilterDateTo: (v: string) => void;
  isMobile?: boolean;
  viewMode?: ViewMode;
  setViewMode?: (v: ViewMode) => void;
}

function FiltersForm({
  origins, filterOrigin, setFilterOrigin, filterSegment, setFilterSegment,
  responsibleOptions, filterResponsible, setFilterResponsible,
  filterDatePreset, setFilterDatePreset,
  filterDateFrom, setFilterDateFrom, filterDateTo, setFilterDateTo,
  isMobile, viewMode, setViewMode,
}: FiltersFormProps) {
  return (
    <div className="space-y-4">
      {isMobile && viewMode !== undefined && setViewMode && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Visualização</Label>
          <div className="flex rounded-lg border overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 text-sm transition-colors',
                viewMode === 'kanban' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'
              )}
            >
              <LayoutGrid className="h-4 w-4" /> Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 text-sm transition-colors',
                viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'
              )}
            >
              <LayoutList className="h-4 w-4" /> Lista
            </button>
          </div>
        </div>
      )}

      <FilterCheckboxGroup
        label="Origem"
        options={origins.map<FilterCheckboxOption>(o => ({
          value: o.name,
          label: o.name,
          color: o.color || undefined,
        }))}
        selected={filterOrigin}
        onChange={setFilterOrigin}
        emptyLabel="Todas"
      />

      <FilterCheckboxGroup
        label="Segmento"
        options={COMPANY_SEGMENTS.map<FilterCheckboxOption>(s => ({
          value: s.value,
          label: s.label,
          color: s.color,
        }))}
        selected={filterSegment}
        onChange={setFilterSegment}
        emptyLabel="Todos"
      />

      <FilterCheckboxGroup
        label="Responsável"
        options={responsibleOptions}
        selected={filterResponsible}
        onChange={setFilterResponsible}
        emptyLabel="Todos"
      />

      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Data de Geração</Label>
        <Select value={filterDatePreset} onValueChange={(v) => setFilterDatePreset(v as DatePreset)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os períodos</SelectItem>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="this_week">Esta semana</SelectItem>
            <SelectItem value="this_month">Este mês</SelectItem>
            <SelectItem value="this_year">Este ano</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>
        {filterDatePreset === 'custom' && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <Label className="text-xs text-muted-foreground">De</Label>
              <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Até</Label>
              <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Filtros no desktop — preservam o visual atual via Sheet lateral.
// Encapsulado pra reduzir ruído no componente principal.
// ============================================================================
interface DesktopFilterPopoverProps {
  origins: { id: string; name: string; color?: string | null; icon?: string | null }[];
  filterOrigin: string[];
  setFilterOrigin: (v: string[]) => void;
  filterSegment: string[];
  setFilterSegment: (v: string[]) => void;
  responsibleOptions: FilterCheckboxOption[];
  filterResponsible: string[];
  setFilterResponsible: (v: string[]) => void;
  filterDatePreset: DatePreset;
  setFilterDatePreset: (v: DatePreset) => void;
  filterDateFrom: string;
  setFilterDateFrom: (v: string) => void;
  filterDateTo: string;
  setFilterDateTo: (v: string) => void;
  activeFilterCount: number;
  onClear: () => void;
}

function DesktopFilterPopover(props: DesktopFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="relative">
        <Filter className="h-4 w-4 mr-2" /> Filtros
        {props.activeFilterCount > 0 && (
          <Badge className="ml-2 h-5 px-1.5 bg-primary text-primary-foreground border-0">{props.activeFilterCount}</Badge>
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader><SheetTitle>Filtros</SheetTitle></SheetHeader>
          <div className="flex-1 overflow-y-auto py-4">
            <FiltersForm
              origins={props.origins}
              filterOrigin={props.filterOrigin} setFilterOrigin={props.setFilterOrigin}
              filterSegment={props.filterSegment} setFilterSegment={props.setFilterSegment}
              responsibleOptions={props.responsibleOptions}
              filterResponsible={props.filterResponsible} setFilterResponsible={props.setFilterResponsible}
              filterDatePreset={props.filterDatePreset} setFilterDatePreset={props.setFilterDatePreset}
              filterDateFrom={props.filterDateFrom} setFilterDateFrom={props.setFilterDateFrom}
              filterDateTo={props.filterDateTo} setFilterDateTo={props.setFilterDateTo}
            />
          </div>
          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={props.onClear}>Limpar</Button>
            <Button onClick={() => setOpen(false)}>Aplicar</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
