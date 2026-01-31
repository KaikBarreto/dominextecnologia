import { useState, useMemo } from 'react';
import { TrendingUp, Plus, DollarSign, Filter, Search, X, Users, Target } from 'lucide-react';
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
  type LeadStatus, 
  LEAD_STATUS_LABELS, 
  LEAD_STATUS_COLORS,
  LEAD_SOURCES 
} from '@/hooks/useLeads';
import { useUsers } from '@/hooks/useUsers';
import { LeadFormDialog } from '@/components/crm/LeadFormDialog';
import { LeadDetailModal } from '@/components/crm/LeadDetailModal';
import { LeadCard } from '@/components/crm/LeadCard';
import { ScrollArea } from '@/components/ui/scroll-area';

const PIPELINE_STAGES: LeadStatus[] = ['lead', 'proposta', 'negociacao', 'fechado_ganho', 'fechado_perdido'];

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

  // Group filtered leads by status
  const leadsByStatus = useMemo(() => {
    return filteredLeads.reduce((acc, lead) => {
      const status = lead.status;
      if (!acc[status]) acc[status] = [];
      acc[status].push(lead);
      return acc;
    }, {} as Record<LeadStatus, Lead[]>);
  }, [filteredLeads]);

  // Calculate value by status
  const valueByStatus = useMemo(() => {
    return Object.entries(leadsByStatus).reduce((acc, [status, statusLeads]) => {
      acc[status as LeadStatus] = statusLeads.reduce((sum, lead) => sum + (lead.value || 0), 0);
      return acc;
    }, {} as Record<LeadStatus, number>);
  }, [leadsByStatus]);

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

  const handleDrop = async (e: React.DragEvent, newStatus: LeadStatus) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('leadId');
    if (leadId) {
      await updateLead.mutateAsync({ id: leadId, status: newStatus });
    }
  };

  const getStageColor = (status: LeadStatus) => {
    switch (status) {
      case 'lead': return 'from-muted/50 to-muted/30';
      case 'proposta': return 'from-info/15 to-info/5';
      case 'negociacao': return 'from-warning/15 to-warning/5';
      case 'fechado_ganho': return 'from-success/15 to-success/5';
      case 'fechado_perdido': return 'from-destructive/15 to-destructive/5';
      default: return 'from-muted/50 to-muted/30';
    }
  };

  const getStageHeaderColor = (status: LeadStatus) => {
    switch (status) {
      case 'lead': return 'border-muted-foreground/30';
      case 'proposta': return 'border-info/50';
      case 'negociacao': return 'border-warning/50';
      case 'fechado_ganho': return 'border-success/50';
      case 'fechado_perdido': return 'border-destructive/50';
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
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Oportunidade
        </Button>
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

        <Card className="bg-gradient-to-br from-card to-warning/5 border-warning/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Em Negociação</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-warning">
                    {formatCurrency(valueByStatus['negociacao'] || 0)}
                  </p>
                )}
              </div>
              <div className="rounded-full bg-warning/10 p-3">
                <TrendingUp className="h-6 w-6 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card to-info/5 border-info/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Propostas</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-info">
                    {formatCurrency(valueByStatus['proposta'] || 0)}
                  </p>
                )}
              </div>
              <div className="rounded-full bg-info/10 p-3">
                <Users className="h-6 w-6 text-info" />
              </div>
            </div>
          </CardContent>
        </Card>
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
          {isLoading ? (
            <div className="flex gap-4 overflow-x-auto p-4">
              {PIPELINE_STAGES.slice(0, 4).map((_, i) => (
                <div key={i} className="min-w-[280px] flex-shrink-0">
                  <Skeleton className="h-8 w-full mb-4" />
                  <div className="space-y-3">
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-28 w-full" />
                  </div>
                </div>
              ))}
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
              {PIPELINE_STAGES.map((status) => (
                <div
                  key={status}
                  className="min-w-[300px] max-w-[300px] flex-shrink-0"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, status)}
                >
                  {/* Column Header */}
                  <div className={`rounded-t-lg bg-gradient-to-r ${getStageColor(status)} border-b-2 ${getStageHeaderColor(status)} p-3`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={`${LEAD_STATUS_COLORS[status]} font-semibold`}>
                          {LEAD_STATUS_LABELS[status]}
                        </Badge>
                        <span className="text-xs font-medium bg-background/80 px-2 py-0.5 rounded-full">
                          {leadsByStatus[status]?.length || 0}
                        </span>
                      </div>
                    </div>
                    {(valueByStatus[status] || 0) > 0 && (
                      <p className="text-sm font-semibold mt-2 text-foreground">
                        {formatCurrency(valueByStatus[status] || 0)}
                      </p>
                    )}
                  </div>

                  {/* Cards */}
                  <ScrollArea className="h-[450px] rounded-b-lg border border-t-0 bg-muted/20">
                    <div className="space-y-3 p-3">
                      {(leadsByStatus[status] || []).map((lead) => (
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
                      {(leadsByStatus[status]?.length || 0) === 0 && (
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
