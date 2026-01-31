import { useState, useMemo } from 'react';
import { TrendingUp, Plus, DollarSign, Filter, Search, X, Users, Target, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { 
  useLeads, 
  type Lead, 
  LEAD_SOURCES 
} from '@/hooks/useLeads';
import { useUsers } from '@/hooks/useUsers';
import { useCrmStages, type CrmStage } from '@/hooks/useCrmStages';
import { LeadFormDialog } from '@/components/crm/LeadFormDialog';
import { LeadDetailModal } from '@/components/crm/LeadDetailModal';
import { LeadCard } from '@/components/crm/LeadCard';
import { StageManagerDialog } from '@/components/crm/StageManagerDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface Filters {
  search: string;
  source: string;
  assignedTo: string;
  minValue: string;
  maxValue: string;
}

export default function CRM() {
  const { leads, isLoading, updateLead, stats } = useLeads();
  const { users } = useUsers();
  const { stages, isLoading: stagesLoading, getStageColorClass } = useCrmStages();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  
  const [filters, setFilters] = useState<Filters>({
    search: '',
    source: '',
    assignedTo: '',
    minValue: '',
    maxValue: '',
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Apply filters
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesTitle = lead.title.toLowerCase().includes(searchLower);
        const matchesCustomer = lead.customers?.name?.toLowerCase().includes(searchLower);
        if (!matchesTitle && !matchesCustomer) return false;
      }
      
      // Source filter
      if (filters.source && lead.source !== filters.source) return false;
      
      // Assigned to filter
      if (filters.assignedTo && lead.assigned_to !== filters.assignedTo) return false;
      
      // Value range filters
      if (filters.minValue && (lead.value || 0) < parseFloat(filters.minValue)) return false;
      if (filters.maxValue && (lead.value || 0) > parseFloat(filters.maxValue)) return false;
      
      return true;
    });
  }, [leads, filters]);

  // Group filtered leads by stage_id
  const leadsByStage = useMemo(() => {
    return filteredLeads.reduce((acc, lead) => {
      const stageId = lead.stage_id || 'unassigned';
      if (!acc[stageId]) acc[stageId] = [];
      acc[stageId].push(lead);
      return acc;
    }, {} as Record<string, Lead[]>);
  }, [filteredLeads]);

  // Calculate value by stage
  const valueByStage = useMemo(() => {
    return Object.entries(leadsByStage).reduce((acc, [stageId, stageLeads]) => {
      acc[stageId] = stageLeads.reduce((sum, lead) => sum + (lead.value || 0), 0);
      return acc;
    }, {} as Record<string, number>);
  }, [leadsByStage]);

  const activeFiltersCount = Object.values(filters).filter(v => v !== '').length;

  const clearFilters = () => {
    setFilters({
      search: '',
      source: '',
      assignedTo: '',
      minValue: '',
      maxValue: '',
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
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
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('leadId');
    if (leadId) {
      await updateLead.mutateAsync({ id: leadId, stage_id: stageId });
    }
  };

  const getStageGradient = (color: string) => {
    switch (color) {
      case 'muted': return 'from-muted/50 to-muted/30';
      case 'info': return 'from-info/15 to-info/5';
      case 'warning': return 'from-warning/15 to-warning/5';
      case 'success': return 'from-success/15 to-success/5';
      case 'destructive': return 'from-destructive/15 to-destructive/5';
      case 'primary': return 'from-primary/15 to-primary/5';
      default: return 'from-muted/50 to-muted/30';
    }
  };

  const getStageHeaderBorder = (color: string) => {
    switch (color) {
      case 'muted': return 'border-muted-foreground/30';
      case 'info': return 'border-info/50';
      case 'warning': return 'border-warning/50';
      case 'success': return 'border-success/50';
      case 'destructive': return 'border-destructive/50';
      case 'primary': return 'border-primary/50';
      default: return 'border-muted-foreground/30';
    }
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">CRM</h1>
          <p className="text-muted-foreground">Gerencie oportunidades e leads</p>
        </div>
        <div className="flex gap-2">
          <StageManagerDialog>
            <Button variant="outline" size="icon" title="Gerenciar Estágios">
              <Settings2 className="h-4 w-4" />
            </Button>
          </StageManagerDialog>
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Oportunidade
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-card to-primary/5 border-primary/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Leads</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-12 mt-1" />
                ) : (
                  <p className="text-3xl font-bold">{stats.total}</p>
                )}
              </div>
              <div className="rounded-full bg-primary/10 p-3">
                <Target className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card to-success/5 border-success/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor Total</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-success">{formatCurrency(stats.totalValue)}</p>
                )}
              </div>
              <div className="rounded-full bg-success/10 p-3">
                <DollarSign className="h-6 w-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dynamic stats based on stages */}
        {stages.filter(s => s.is_won).slice(0, 1).map(wonStage => (
          <Card key={wonStage.id} className="bg-gradient-to-br from-card to-success/5 border-success/20">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{wonStage.name}</p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-24 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-success">
                      {formatCurrency(valueByStage[wonStage.id] || 0)}
                    </p>
                  )}
                </div>
                <div className="rounded-full bg-success/10 p-3">
                  <TrendingUp className="h-6 w-6 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {stages.filter(s => !s.is_won && !s.is_lost).slice(0, 2).map((stage, index) => (
          <Card key={stage.id} className={cn(
            "bg-gradient-to-br from-card",
            index === 0 ? "to-warning/5 border-warning/20" : "to-info/5 border-info/20"
          )}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stage.name}</p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-24 mt-1" />
                  ) : (
                    <p className={cn("text-2xl font-bold", index === 0 ? "text-warning" : "text-info")}>
                      {formatCurrency(valueByStage[stage.id] || 0)}
                    </p>
                  )}
                </div>
                <div className={cn("rounded-full p-3", index === 0 ? "bg-warning/10" : "bg-info/10")}>
                  {index === 0 ? <TrendingUp className="h-6 w-6 text-warning" /> : <Users className="h-6 w-6 text-info" />}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
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
                <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
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
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
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
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
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

              <Button 
                className="w-full" 
                onClick={() => setFiltersOpen(false)}
              >
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
            <Badge variant="secondary" className="gap-1">
              Origem: {filters.source}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => setFilters(prev => ({ ...prev, source: '' }))}
              />
            </Badge>
          )}
          {filters.assignedTo && (
            <Badge variant="secondary" className="gap-1">
              Vendedor: {users.find(u => u.user_id === filters.assignedTo)?.full_name || 'N/A'}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => setFilters(prev => ({ ...prev, assignedTo: '' }))}
              />
            </Badge>
          )}
          {filters.minValue && (
            <Badge variant="secondary" className="gap-1">
              Min: {formatCurrency(parseFloat(filters.minValue))}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => setFilters(prev => ({ ...prev, minValue: '' }))}
              />
            </Badge>
          )}
          {filters.maxValue && (
            <Badge variant="secondary" className="gap-1">
              Max: {formatCurrency(parseFloat(filters.maxValue))}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => setFilters(prev => ({ ...prev, maxValue: '' }))}
              />
            </Badge>
          )}
        </div>
      )}

      {/* Pipeline Kanban */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5" />
            Pipeline de Vendas
            {filteredLeads.length !== leads.length && (
              <Badge variant="outline" className="ml-2">
                {filteredLeads.length} de {leads.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(isLoading || stagesLoading) ? (
            <div className="flex gap-4 overflow-x-auto p-4">
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
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Settings2 className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">Nenhum estágio configurado</h3>
              <p className="text-muted-foreground max-w-sm">
                Clique no botão de configurações para criar estágios do pipeline
              </p>
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <TrendingUp className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">
                {leads.length === 0 ? 'Nenhuma oportunidade' : 'Nenhum resultado encontrado'}
              </h3>
              <p className="text-muted-foreground max-w-sm">
                {leads.length === 0 
                  ? 'Clique em "Nova Oportunidade" para começar a gerenciar seu pipeline de vendas'
                  : 'Tente ajustar os filtros para encontrar as oportunidades desejadas'}
              </p>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto p-4 pb-6">
              {stages.map((stage) => (
                <div
                  key={stage.id}
                  className="min-w-[300px] max-w-[300px] flex-shrink-0"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, stage.id)}
                >
                  {/* Column Header */}
                  <div className={`rounded-t-lg bg-gradient-to-r ${getStageGradient(stage.color)} border-b-2 ${getStageHeaderBorder(stage.color)} p-3`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={cn(getStageColorClass(stage.color), 'font-semibold')}>
                          {stage.name}
                        </Badge>
                        <span className="text-xs font-medium bg-background/80 px-2 py-0.5 rounded-full">
                          {leadsByStage[stage.id]?.length || 0}
                        </span>
                      </div>
                    </div>
                    {(valueByStage[stage.id] || 0) > 0 && (
                      <p className="text-sm font-semibold mt-2 text-foreground">
                        {formatCurrency(valueByStage[stage.id] || 0)}
                      </p>
                    )}
                  </div>

                  {/* Cards */}
                  <ScrollArea className="h-[450px] rounded-b-lg border border-t-0 bg-muted/20">
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
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <LeadFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        lead={editingLead}
      />

      {/* Detail Modal */}
      <LeadDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        lead={detailLead}
        onEdit={(lead) => {
          setDetailOpen(false);
          handleEdit(lead);
        }}
      />
    </div>
  );
}
