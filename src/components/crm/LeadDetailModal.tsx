import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  User, Phone, Mail, Calendar, DollarSign, TrendingUp, 
  MessageSquare, Clock, Plus, Send, Edit, Trash2, X
} from 'lucide-react';
import { 
  useLeadInteractions, 
  type Lead, 
  type LeadStatus,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
  INTERACTION_TYPES,
  useLeads
} from '@/hooks/useLeads';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface LeadDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  onEdit: (lead: Lead) => void;
}

const STATUSES: { value: LeadStatus; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'proposta', label: 'Proposta' },
  { value: 'negociacao', label: 'Negociação' },
  { value: 'fechado_ganho', label: 'Negócio Fechado (Ganho)' },
  { value: 'fechado_perdido', label: 'Negócio Perdido' },
];

export function LeadDetailModal({ open, onOpenChange, lead, onEdit }: LeadDetailModalProps) {
  const { interactions, isLoading: loadingInteractions, createInteraction } = useLeadInteractions(lead?.id || null);
  const { updateLead, deleteLead } = useLeads();
  
  const [newInteraction, setNewInteraction] = useState({
    type: '',
    description: '',
    next_action: '',
    next_action_date: '',
  });
  const [isAddingInteraction, setIsAddingInteraction] = useState(false);

  if (!lead) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleStatusChange = async (newStatus: LeadStatus) => {
    await updateLead.mutateAsync({ id: lead.id, status: newStatus });
  };

  const handleAddInteraction = async () => {
    if (!newInteraction.type || !newInteraction.description) return;
    
    await createInteraction.mutateAsync({
      lead_id: lead.id,
      interaction_type: newInteraction.type,
      description: newInteraction.description,
      next_action: newInteraction.next_action || null,
      next_action_date: newInteraction.next_action_date || null,
    });
    
    setNewInteraction({ type: '', description: '', next_action: '', next_action_date: '' });
    setIsAddingInteraction(false);
  };

  const handleDelete = async () => {
    if (confirm('Tem certeza que deseja excluir este lead?')) {
      await deleteLead.mutateAsync(lead.id);
      onOpenChange(false);
    }
  };

  const getInteractionIcon = (type: string) => {
    const found = INTERACTION_TYPES.find(t => t.value === type);
    return found?.icon || '📝';
  };

  const getInteractionLabel = (type: string) => {
    const found = INTERACTION_TYPES.find(t => t.value === type);
    return found?.label || type;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-xl font-bold">{lead.title}</DialogTitle>
              {lead.customers && (
                <p className="text-muted-foreground flex items-center gap-1.5 mt-1">
                  <User className="h-4 w-4" />
                  {lead.customers.name}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => onEdit(lead)}>
                <Edit className="h-4 w-4 mr-1" />
                Editar
              </Button>
              <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="detalhes" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="flex-shrink-0">
            <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
            <TabsTrigger value="historico">
              Histórico ({interactions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="detalhes" className="flex-1 overflow-auto mt-4 space-y-6">
            {/* Status */}
            <div className="flex flex-wrap items-center gap-3">
              <Label className="text-muted-foreground">Status:</Label>
              <Select value={lead.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge className={LEAD_STATUS_COLORS[lead.status]}>
                {LEAD_STATUS_LABELS[lead.status]}
              </Badge>
            </div>

            {/* Info Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <DollarSign className="h-4 w-4" />
                  <span className="text-xs">Valor Estimado</span>
                </div>
                <p className="text-xl font-bold text-primary">
                  {lead.value ? formatCurrency(lead.value) : 'Não informado'}
                </p>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs">Probabilidade</span>
                </div>
                <p className="text-xl font-bold">{lead.probability || 50}%</p>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Calendar className="h-4 w-4" />
                  <span className="text-xs">Previsão Fechamento</span>
                </div>
                <p className="text-sm font-medium">
                  {lead.expected_close_date 
                    ? format(new Date(lead.expected_close_date), "dd 'de' MMM, yyyy", { locale: ptBR })
                    : 'Não definida'}
                </p>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <MessageSquare className="h-4 w-4" />
                  <span className="text-xs">Origem</span>
                </div>
                <p className="text-sm font-medium">{lead.source || 'Não informada'}</p>
              </div>
            </div>

            {/* Customer Contact */}
            {lead.customers && (
              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Contato do Cliente
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {lead.customers.phone && (
                    <a 
                      href={`tel:${lead.customers.phone}`}
                      className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                    >
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {lead.customers.phone}
                    </a>
                  )}
                  {lead.customers.email && (
                    <a 
                      href={`mailto:${lead.customers.email}`}
                      className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                    >
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {lead.customers.email}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            {lead.notes && (
              <div className="rounded-lg border p-4">
                <h4 className="font-semibold mb-2">Observações</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.notes}</p>
              </div>
            )}

            {/* Timeline info */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Criado em: {format(new Date(lead.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
              <p>Atualizado: {formatDistanceToNow(new Date(lead.updated_at), { addSuffix: true, locale: ptBR })}</p>
            </div>
          </TabsContent>

          <TabsContent value="historico" className="flex-1 overflow-hidden flex flex-col mt-4">
            {/* Add Interaction Button */}
            <div className="flex-shrink-0 mb-4">
              {!isAddingInteraction ? (
                <Button onClick={() => setIsAddingInteraction(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Nova Interação
                </Button>
              ) : (
                <div className="rounded-lg border p-4 space-y-4 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Registrar Interação</h4>
                    <Button variant="ghost" size="icon" onClick={() => setIsAddingInteraction(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Tipo de Interação *</Label>
                      <Select
                        value={newInteraction.type}
                        onValueChange={(value) => setNewInteraction(prev => ({ ...prev, type: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {INTERACTION_TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.icon} {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Próxima Ação</Label>
                      <Input
                        value={newInteraction.next_action}
                        onChange={(e) => setNewInteraction(prev => ({ ...prev, next_action: e.target.value }))}
                        placeholder="Ex: Enviar proposta"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Descrição *</Label>
                    <Textarea
                      value={newInteraction.description}
                      onChange={(e) => setNewInteraction(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Descreva o que foi conversado..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Data da Próxima Ação</Label>
                    <Input
                      type="date"
                      value={newInteraction.next_action_date}
                      onChange={(e) => setNewInteraction(prev => ({ ...prev, next_action_date: e.target.value }))}
                    />
                  </div>

                  <Button 
                    onClick={handleAddInteraction}
                    disabled={!newInteraction.type || !newInteraction.description || createInteraction.isPending}
                    className="gap-2"
                  >
                    <Send className="h-4 w-4" />
                    Registrar
                  </Button>
                </div>
              )}
            </div>

            {/* Interactions Timeline */}
            <ScrollArea className="flex-1">
              {loadingInteractions ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-20 bg-muted/50 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : interactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-medium">Nenhuma interação registrada</h3>
                  <p className="text-sm text-muted-foreground">
                    Clique em "Nova Interação" para registrar o primeiro contato
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {interactions.map((interaction, index) => (
                    <div key={interaction.id} className="relative">
                      {index < interactions.length - 1 && (
                        <div className="absolute left-4 top-10 bottom-0 w-px bg-border" />
                      )}
                      <div className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-lg">
                          {getInteractionIcon(interaction.interaction_type)}
                        </div>
                        <div className="flex-1 pb-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-sm">
                                {getInteractionLabel(interaction.interaction_type)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(interaction.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                              </p>
                            </div>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                            {interaction.description}
                          </p>
                          {interaction.next_action && (
                            <div className="mt-2 flex items-center gap-2 text-xs bg-warning/10 text-warning p-2 rounded">
                              <Clock className="h-3 w-3" />
                              <span>Próxima ação: {interaction.next_action}</span>
                              {interaction.next_action_date && (
                                <span>
                                  ({format(new Date(interaction.next_action_date), 'dd/MM/yyyy', { locale: ptBR })})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
