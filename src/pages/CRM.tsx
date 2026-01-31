import { useState } from 'react';
import { TrendingUp, Plus, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeads, type Lead, type LeadStatus, LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from '@/hooks/useLeads';
import { LeadFormDialog } from '@/components/crm/LeadFormDialog';
import { LeadCard } from '@/components/crm/LeadCard';
import { ScrollArea } from '@/components/ui/scroll-area';

const PIPELINE_STAGES: LeadStatus[] = ['lead', 'proposta', 'negociacao', 'fechado_ganho', 'fechado_perdido'];

export default function CRM() {
  const { leads, isLoading, leadsByStatus, valueByStatus, updateLead, stats } = useLeads();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

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
      case 'lead': return 'bg-muted/50';
      case 'proposta': return 'bg-info/10';
      case 'negociacao': return 'bg-warning/10';
      case 'fechado_ganho': return 'bg-success/10';
      case 'fechado_perdido': return 'bg-destructive/10';
      default: return 'bg-muted/50';
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
        <Card className="bg-gradient-to-br from-card to-primary/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Leads</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-12 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">{stats.total}</p>
                )}
              </div>
              <TrendingUp className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card to-success/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor Total</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-success">{formatCurrency(stats.totalValue)}</p>
                )}
              </div>
              <DollarSign className="h-8 w-8 text-success" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card to-warning/5">
          <CardContent className="p-6">
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
              <TrendingUp className="h-8 w-8 text-warning" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card to-info/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Em Proposta</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-info">
                    {formatCurrency(valueByStatus['proposta'] || 0)}
                  </p>
                )}
              </div>
              <TrendingUp className="h-8 w-8 text-info" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Kanban */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Pipeline de Vendas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {PIPELINE_STAGES.slice(0, 4).map((_, i) => (
                <div key={i} className="min-w-[280px] flex-shrink-0">
                  <Skeleton className="h-8 w-full mb-4" />
                  <div className="space-y-3">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <TrendingUp className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">Nenhuma oportunidade</h3>
              <p className="text-muted-foreground">
                Clique em "Nova Oportunidade" para começar
              </p>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {PIPELINE_STAGES.map((status) => (
                <div
                  key={status}
                  className="min-w-[280px] flex-shrink-0"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, status)}
                >
                  {/* Column Header */}
                  <div className={`rounded-lg p-3 mb-4 ${getStageColor(status)}`}>
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">{LEAD_STATUS_LABELS[status]}</h3>
                      <span className="text-xs bg-background px-2 py-0.5 rounded-full">
                        {leadsByStatus[status]?.length || 0}
                      </span>
                    </div>
                    {(valueByStatus[status] || 0) > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatCurrency(valueByStatus[status] || 0)}
                      </p>
                    )}
                  </div>

                  {/* Cards */}
                  <ScrollArea className="h-[400px] pr-3">
                    <div className="space-y-3">
                      {(leadsByStatus[status] || []).map((lead) => (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, lead)}
                          className="cursor-grab active:cursor-grabbing"
                        >
                          <LeadCard lead={lead} onEdit={handleEdit} />
                        </div>
                      ))}
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
    </div>
  );
}
