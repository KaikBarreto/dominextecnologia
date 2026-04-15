import { useState, useMemo } from 'react';
import { Plus, Search, DollarSign, TrendingUp, Users, Pencil, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminLeads, useAdminCrmStages, type AdminLead } from '@/hooks/useAdminCrm';
import { AdminLeadFormDialog } from '@/components/admin/AdminLeadFormDialog';
import { AdminLeadDetailModal } from '@/components/admin/AdminLeadDetailModal';
import { LossReasonDialog } from '@/components/crm/LossReasonDialog';

export default function AdminCRM() {
  const { leads, isLoading, updateLead } = useAdminLeads();
  const { stages, isLoading: stagesLoading } = useAdminCrmStages();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<AdminLead | null>(null);
  const [detailLead, setDetailLead] = useState<AdminLead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [lossDialogOpen, setLossDialogOpen] = useState(false);
  const [pendingLossDrop, setPendingLossDrop] = useState<{ leadId: string; stageId: string; leadTitle: string } | null>(null);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);

  const filteredLeads = useMemo(() => {
    if (!search) return leads;
    const q = search.toLowerCase();
    return leads.filter(l =>
      l.title.toLowerCase().includes(q) ||
      l.company_name?.toLowerCase().includes(q) ||
      l.contact_name?.toLowerCase().includes(q)
    );
  }, [leads, search]);

  const getLeadsByStage = (stageId: string) => filteredLeads.filter(l => l.stage_id === stageId);
  const unstagedLeads = filteredLeads.filter(l => !l.stage_id || !stages.find(s => s.id === l.stage_id));

  const totalValue = leads.reduce((s, l) => s + Number(l.value || 0), 0);
  const activeLeads = leads.filter(l => {
    const stage = stages.find(s => s.id === l.stage_id);
    return !stage?.is_won && !stage?.is_lost;
  });

  const handleDrop = (stageId: string) => {
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

  const formatCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

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
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-foreground">CRM Comercial</h1>
          <p className="text-sm text-muted-foreground">Pipeline de vendas da Dominex</p>
        </div>
        <Button onClick={() => { setEditingLead(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Lead
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Total de Leads</p>
                <p className="text-lg font-bold">{leads.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Em Negociação</p>
                <p className="text-lg font-bold">{activeLeads.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Valor Total</p>
                <p className="text-lg font-bold">{formatCurrency(totalValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Ganhos</p>
                <p className="text-lg font-bold text-green-600">
                  {leads.filter(l => stages.find(s => s.id === l.stage_id)?.is_won).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar leads..." className="pl-9" />
      </div>

      {/* Kanban */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map(stage => {
          const stageLeads = getLeadsByStage(stage.id);
          return (
            <div
              key={stage.id}
              className="w-72 shrink-0 flex flex-col rounded-xl bg-muted/30 border"
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(stage.id)}
            >
              {/* Stage Header */}
              <div className="p-3 border-b flex items-center gap-2">
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                <span className="text-sm font-semibold truncate">{stage.name}</span>
                <Badge variant="secondary" className="ml-auto text-[10px]">{stageLeads.length}</Badge>
              </div>

              {/* Cards */}
              <ScrollArea className="flex-1 max-h-[60vh]">
                <div className="p-2 space-y-2">
                  {stageLeads.map(lead => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => setDraggedLeadId(lead.id)}
                      className="bg-card border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow space-y-2"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-sm font-medium leading-tight">{lead.title}</p>
                        <div className="flex gap-0.5 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => { setDetailLead(lead); setDetailOpen(true); }}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => { setEditingLead(lead); setDialogOpen(true); }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {lead.company_name && (
                        <p className="text-xs text-muted-foreground truncate">{lead.company_name}</p>
                      )}
                      <div className="flex items-center justify-between">
                        {lead.value ? (
                          <span className="text-xs font-semibold text-green-600">{formatCurrency(Number(lead.value))}</span>
                        ) : <span />}
                        {lead.source && (
                          <Badge variant="outline" className="text-[10px]">{lead.source}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                  {stageLeads.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">Nenhum lead</p>
                  )}
                </div>
              </ScrollArea>
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
    </div>
  );
}
