import { useState, useMemo } from 'react';
import { Plus, Search, DollarSign, TrendingUp, Users, Filter, X } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminLeads, useAdminCrmStages, type AdminLead } from '@/hooks/useAdminCrm';
import { useCompanyOrigins } from '@/hooks/useCompanyOrigins';
import { useProfiles } from '@/hooks/useProfiles';
import { AdminLeadFormDialog } from '@/components/admin/AdminLeadFormDialog';
import { AdminLeadDetailModal } from '@/components/admin/AdminLeadDetailModal';
import { LossReasonDialog } from '@/components/crm/LossReasonDialog';
import { COMPANY_SEGMENTS, getSegment } from '@/utils/companySegments';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

function OriginIcon({ name, className }: { name: string; className?: string }) {
  const LucideIcon = (LucideIcons as any)[name];
  if (!LucideIcon) return null;
  return <LucideIcon className={className || 'h-3 w-3'} />;
}

export default function AdminCRM() {
  const { leads, isLoading, updateLead } = useAdminLeads();
  const { stages, isLoading: stagesLoading } = useAdminCrmStages();
  const { origins } = useCompanyOrigins();
  const { data: profiles } = useProfiles();

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

  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterOrigin, setFilterOrigin] = useState<string>('all');
  const [filterSegment, setFilterSegment] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');

  const activeFilterCount =
    (filterOrigin !== 'all' ? 1 : 0) +
    (filterSegment !== 'all' ? 1 : 0) +
    (filterDateFrom ? 1 : 0) +
    (filterDateTo ? 1 : 0);

  const filteredLeads = useMemo(() => {
    const q = search.toLowerCase();
    return leads.filter(l => {
      if (search && !(
        l.title.toLowerCase().includes(q) ||
        l.company_name?.toLowerCase().includes(q) ||
        l.contact_name?.toLowerCase().includes(q)
      )) return false;
      if (filterOrigin !== 'all' && l.source !== filterOrigin) return false;
      if (filterSegment !== 'all' && l.segment !== filterSegment) return false;
      if (filterDateFrom && new Date(l.created_at) < new Date(filterDateFrom + 'T00:00:00')) return false;
      if (filterDateTo && new Date(l.created_at) > new Date(filterDateTo + 'T23:59:59')) return false;
      return true;
    });
  }, [leads, search, filterOrigin, filterSegment, filterDateFrom, filterDateTo]);

  const getLeadsByStage = (stageId: string) => filteredLeads.filter(l => l.stage_id === stageId);

  const totalValue = leads.reduce((s, l) => s + Number(l.value || 0), 0);
  const activeLeads = leads.filter(l => {
    const stage = stages.find(s => s.id === l.stage_id);
    return !stage?.is_won && !stage?.is_lost;
  });

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

  const getOwnerProfile = (userId: string | null) => {
    if (!userId || !profiles) return null;
    return profiles.find(p => p.user_id === userId);
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
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-4 overflow-x-auto">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-96 w-72 shrink-0" />)}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-foreground">CRM Comercial</h1>
          <p className="text-sm text-muted-foreground">Pipeline de vendas da Dominex</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="p-3"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Total de Leads</p><p className="text-lg font-bold">{leads.length}</p></div></div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Em Negociação</p><p className="text-lg font-bold">{activeLeads.length}</p></div></div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Valor Total</p><p className="text-lg font-bold">{formatCurrency(totalValue)}</p></div></div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-green-500" /><div><p className="text-xs text-muted-foreground">Ganhos</p><p className="text-lg font-bold text-green-600">{leads.filter(l => stages.find(s => s.id === l.stage_id)?.is_won).length}</p></div></div></CardContent></Card>
        </div>

        {/* Search + Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar leads..." className="pl-9" />
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={() => setFiltersOpen(true)} className="relative">
              <Filter className="h-4 w-4 mr-2" /> Filtros
              {activeFilterCount > 0 && (
                <Badge className="ml-2 h-5 px-1.5 bg-primary text-primary-foreground border-0">{activeFilterCount}</Badge>
              )}
            </Button>
            <Button onClick={() => { setEditingLead(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Novo Lead
            </Button>
          </div>
        </div>

        {/* Kanban — rolagem horizontal sempre, colunas com largura fixa */}
        <div className="flex gap-3 sm:gap-4 lg:gap-6 overflow-x-auto pb-4 -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6">
          {stages.map(stage => {
            const stageLeads = getLeadsByStage(stage.id);
            const stageTotal = stageLeads.reduce((s, l) => s + Number(l.value || 0), 0);
            const isDropTarget = dropTargetStageId === stage.id;
            return (
              <div
                key={stage.id}
                className="w-[300px] shrink-0"
                onDragOver={e => { e.preventDefault(); setDropTargetStageId(stage.id); }}
                onDragLeave={() => setDropTargetStageId(null)}
                onDrop={() => handleDrop(stage.id)}
              >
                <div className="mb-4">
                  <div
                    className={cn('w-full rounded-full mb-3 transition-all', isDropTarget ? 'h-2' : 'h-1')}
                    style={{ backgroundColor: stage.color }}
                  />
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm tracking-wide text-foreground uppercase truncate">{stage.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{stageLeads.length} {stageLeads.length === 1 ? 'lead' : 'leads'}</span>
                      <span className="text-xs font-medium text-foreground">{formatCurrency(stageTotal)}</span>
                    </div>
                  </div>
                </div>

                <div className={cn('min-h-[200px] rounded-lg transition-all duration-300', isDropTarget && 'bg-primary/10 ring-2 ring-primary ring-dashed scale-[1.02]')}>
                  <ScrollArea className="h-[calc(100vh-360px)]">
                    <div className="space-y-2 sm:space-y-3 pr-2 p-1">
                      {stageLeads.length === 0 ? (
                        <div className={cn('text-center py-12 text-muted-foreground text-sm border-2 border-dashed rounded-lg transition-all', isDropTarget && 'border-primary bg-primary/5 text-primary')}>
                          {isDropTarget ? 'Solte aqui para mover' : 'Nenhum lead'}
                        </div>
                      ) : stageLeads.map(lead => {
                        const originInfo = getOriginInfo(lead.source);
                        const segmentData = getSegment(lead.segment);
                        const owner = getOwnerProfile(lead.created_by);
                        const isDragging = draggedLeadId === lead.id;
                        return (
                          <div
                            key={lead.id}
                            draggable
                            onDragStart={() => setDraggedLeadId(lead.id)}
                            onDragEnd={() => { setDraggedLeadId(null); setDropTargetStageId(null); }}
                            onClick={() => { setDetailLead(lead); setDetailOpen(true); }}
                            className={cn(
                              'group bg-card rounded-lg border shadow-sm hover:shadow-md transition-all duration-300 cursor-grab active:cursor-grabbing relative',
                              isDragging && 'opacity-40 scale-95 rotate-1 shadow-xl ring-2 ring-primary'
                            )}
                          >
                            <div className="p-2.5 sm:p-3 pb-1.5 sm:pb-2">
                              <div className="flex items-start gap-2.5 sm:gap-3">
                                <Avatar className="h-9 w-9 sm:h-10 sm:w-10 shrink-0" style={{ backgroundColor: '#00C597' }}>
                                  <AvatarFallback className="text-white text-[11px] sm:text-xs font-medium bg-transparent">
                                    {getInitials(lead.title)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-bold text-sm text-foreground truncate">{lead.title}</h4>
                                  {lead.company_name && (
                                    <p className="text-primary text-sm font-medium truncate">{lead.company_name}</p>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="px-2.5 sm:px-3 pb-2 space-y-1.5">
                              {Number(lead.value || 0) > 0 && (
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Valor:</span>
                                  <span className="text-sm font-semibold text-green-600">{formatCurrency(Number(lead.value))}</span>
                                </div>
                              )}
                              {originInfo && (
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Origem:</span>
                                  <Badge className="text-xs px-2 py-0.5 h-5 font-normal text-white border-0 max-w-[55%] gap-1" style={{ backgroundColor: originInfo.color || '#6B7280' }}>
                                    <OriginIcon name={originInfo.icon || 'Globe'} className="h-2.5 w-2.5 shrink-0" />
                                    <span className="truncate">{originInfo.name}</span>
                                  </Badge>
                                </div>
                              )}
                              {segmentData && (
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Segmento:</span>
                                  <Badge className="text-xs px-2 py-0.5 h-5 font-normal text-white border-0 max-w-[60%] gap-1" style={{ backgroundColor: segmentData.color }}>
                                    <segmentData.icon className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{segmentData.label}</span>
                                  </Badge>
                                </div>
                              )}
                            </div>

                            <div className="px-2.5 sm:px-3 pb-2.5 sm:pb-3 flex items-center justify-between border-t pt-2 mt-1">
                              <div className="flex items-center gap-1.5">
                                {owner && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Avatar className="h-6 w-6 border-2 border-background">
                                        <AvatarImage src={owner.avatar_url || undefined} />
                                        <AvatarFallback className="text-[9px] bg-primary text-primary-foreground">
                                          {getInitials(owner.full_name || 'U')}
                                        </AvatarFallback>
                                      </Avatar>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="text-xs">
                                      <p className="font-medium">{owner.full_name}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                {lead.phone && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={(e) => openWhatsApp(lead.phone, e)}
                                        className="h-6 w-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-muted hover:bg-[#25D366] [&:hover_svg]:fill-white"
                                      >
                                        <svg className="h-3.5 w-3.5 fill-muted-foreground" viewBox="0 0 24 24">
                                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                                          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.637l4.687-1.227A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.336 0-4.512-.767-6.263-2.063l-.438-.338-2.848.746.762-2.774-.371-.59A9.95 9.95 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
                                        </svg>
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="text-xs">WhatsApp</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                              {lead.expected_close_date && (
                                <span className="text-xs text-muted-foreground">
                                  {new Date(lead.expected_close_date).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            );
          })}
        </div>

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

        {/* Filters: Sheet on desktop, Drawer on mobile */}
        {isMobile ? (
          <Drawer open={filtersOpen} onOpenChange={setFiltersOpen}>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Filtros</DrawerTitle>
              </DrawerHeader>
              <div className="px-4 pb-4 overflow-y-auto">
                <FiltersForm
                  origins={origins}
                  filterOrigin={filterOrigin}
                  setFilterOrigin={setFilterOrigin}
                  filterSegment={filterSegment}
                  setFilterSegment={setFilterSegment}
                  filterDateFrom={filterDateFrom}
                  setFilterDateFrom={setFilterDateFrom}
                  filterDateTo={filterDateTo}
                  setFilterDateTo={setFilterDateTo}
                />
              </div>
              <DrawerFooter>
                <Button variant="outline" onClick={() => {
                  setFilterOrigin('all'); setFilterSegment('all');
                  setFilterDateFrom(''); setFilterDateTo('');
                }}>Limpar</Button>
                <Button onClick={() => setFiltersOpen(false)}>Aplicar</Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        ) : (
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
              <SheetHeader>
                <SheetTitle>Filtros</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto py-4">
                <FiltersForm
                  origins={origins}
                  filterOrigin={filterOrigin}
                  setFilterOrigin={setFilterOrigin}
                  filterSegment={filterSegment}
                  setFilterSegment={setFilterSegment}
                  filterDateFrom={filterDateFrom}
                  setFilterDateFrom={setFilterDateFrom}
                  filterDateTo={filterDateTo}
                  setFilterDateTo={setFilterDateTo}
                />
              </div>
              <SheetFooter className="gap-2">
                <Button variant="outline" onClick={() => {
                  setFilterOrigin('all'); setFilterSegment('all');
                  setFilterDateFrom(''); setFilterDateTo('');
                }}>Limpar</Button>
                <Button onClick={() => setFiltersOpen(false)}>Aplicar</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </TooltipProvider>
  );
}

interface FiltersFormProps {
  origins: { id: string; name: string; color?: string | null; icon?: string | null }[];
  filterOrigin: string;
  setFilterOrigin: (v: string) => void;
  filterSegment: string;
  setFilterSegment: (v: string) => void;
  filterDateFrom: string;
  setFilterDateFrom: (v: string) => void;
  filterDateTo: string;
  setFilterDateTo: (v: string) => void;
}

function FiltersForm({
  origins, filterOrigin, setFilterOrigin, filterSegment, setFilterSegment,
  filterDateFrom, setFilterDateFrom, filterDateTo, setFilterDateTo,
}: FiltersFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Origem</Label>
        <Select value={filterOrigin} onValueChange={setFilterOrigin}>
          <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {origins.map(o => (
              <SelectItem key={o.id} value={o.name}>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded" style={{ backgroundColor: o.color || '#6B7280' }} />
                  <span>{o.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Segmento</Label>
        <Select value={filterSegment} onValueChange={setFilterSegment}>
          <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {COMPANY_SEGMENTS.map(s => (
              <SelectItem key={s.value} value={s.value}>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded flex items-center justify-center" style={{ backgroundColor: s.color }}>
                    <s.icon className="h-2.5 w-2.5 text-white" />
                  </div>
                  <span>{s.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Data de Geração</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">De</Label>
            <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Até</Label>
            <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}