import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as LucideIcons from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, MessageCircle, Pencil, Trash2 } from 'lucide-react';
import { phoneMask } from '@/utils/masks';
import { useAdminLeadInteractions, useAdminCrmStages, useAdminLeads, ADMIN_INTERACTION_TYPES, type AdminLead } from '@/hooks/useAdminCrm';
import { useCompanyOrigins } from '@/hooks/useCompanyOrigins';
import { useAuth } from '@/contexts/AuthContext';
import { getSegment } from '@/utils/companySegments';
import { SalespersonAvatar } from '@/components/admin/salesperson/SalespersonAvatar';
import { AdminLeadFormDialog } from './AdminLeadFormDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function OriginIcon({ name, className }: { name: string; className?: string }) {
  const LucideIcon = (LucideIcons as any)[name];
  if (!LucideIcon) return null;
  return <LucideIcon className={className || 'h-3 w-3'} />;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: AdminLead;
}

export function AdminLeadDetailModal({ open, onOpenChange, lead: leadProp }: Props) {
  const { interactions, createInteraction } = useAdminLeadInteractions(leadProp.id);
  const { stages } = useAdminCrmStages();
  const { origins } = useCompanyOrigins();
  const { deleteLead, leads } = useAdminLeads();
  const { user } = useAuth();

  const lead = leads.find(l => l.id === leadProp.id) || leadProp;
  const stage = stages.find(s => s.id === lead.stage_id);

  // Vendedores (com foto) p/ resolver o responsável pelo lead.
  const { data: salespeople = [] } = useQuery({
    queryKey: ['salespeople-basic-lead-detail'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salespeople_basic')
        .select('id, name, user_id, photo_url');
      if (error) throw error;
      return data || [];
    },
  });
  const responsibleSalesperson = lead.responsible_id
    ? salespeople.find((sp: any) => sp.user_id === lead.responsible_id) || null
    : null;

  const [newType, setNewType] = useState('ligacao');
  const [newDesc, setNewDesc] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const handleAddInteraction = () => {
    if (!newDesc.trim()) return;
    createInteraction.mutate({
      lead_id: lead.id,
      interaction_type: newType,
      description: newDesc.trim(),
      created_by: user?.id,
    });
    setNewDesc('');
    setShowForm(false);
  };

  const handleDelete = () => {
    deleteLead.mutate(lead.id);
    setDeleteConfirmOpen(false);
    onOpenChange(false);
  };

  const originInfo = lead.source ? origins.find(o => o.name === lead.source) : null;
  const segmentInfo = getSegment(lead.segment);

  const formatCurrency = (v: number | null) => v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-';

  return (
    <>
      <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Lead">
        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-4 pr-2">
            {/* Action buttons */}
            <div className="flex items-center gap-2 justify-end">
              <Button
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Excluir
              </Button>
            </div>

            {/* ---- VIEW MODE ---- */}
            <div className="space-y-4">
              {/* Contato */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Contato</h3>
                <p className="text-base font-bold mb-2">{lead.title}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <span className="text-[11px] text-muted-foreground/70">Telefone</span>
                    <p className="font-medium">{lead.phone ? phoneMask(lead.phone) : <span className="text-muted-foreground/40 italic font-normal">—</span>}</p>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground/70">E-mail</span>
                    <p className="font-medium truncate">{lead.email || <span className="text-muted-foreground/40 italic font-normal">—</span>}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[11px] text-muted-foreground/70">Origem</span>
                    <div className="mt-0.5">
                      {originInfo ? (
                        <Badge className="border-0 flex items-center gap-1 w-fit" style={{ backgroundColor: originInfo.color || '#6B7280', color: '#fff' }}>
                          <OriginIcon name={originInfo.icon || 'Globe'} className="h-3 w-3" />
                          {lead.source}
                        </Badge>
                      ) : lead.source ? (
                        <Badge variant="outline">{lead.source}</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground/40 italic">—</span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[11px] text-muted-foreground/70">Segmento</span>
                    <div className="mt-0.5">
                      {segmentInfo ? (
                        <Badge className="border-0 flex items-center gap-1 w-fit" style={{ backgroundColor: segmentInfo.color, color: '#fff' }}>
                          <segmentInfo.icon className="h-3 w-3" />
                          {segmentInfo.label}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground/40 italic">—</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Negociação */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Negociação</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <span className="text-[11px] text-muted-foreground/70">Empresa</span>
                    <p className="font-medium">{lead.company_name || <span className="text-muted-foreground/40 italic font-normal">—</span>}</p>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground/70">Contato</span>
                    <p className="font-medium">{lead.contact_name || <span className="text-muted-foreground/40 italic font-normal">—</span>}</p>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground/70">Valor</span>
                    <p className="font-medium text-green-600">{formatCurrency(lead.value)}</p>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground/70">Etapa</span>
                    <div className="mt-0.5">
                      {stage ? (
                        <Badge style={{ backgroundColor: stage.color, color: '#fff' }}>{stage.name}</Badge>
                      ) : (
                        <span className="text-muted-foreground/40 italic">—</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground/70">Previsão de Fechamento</span>
                    <p className="font-medium">{lead.expected_close_date ? format(new Date(lead.expected_close_date + 'T12:00:00'), 'dd/MM/yyyy') : <span className="text-muted-foreground/40 italic font-normal">—</span>}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[11px] text-muted-foreground/70">Responsável</span>
                    <div className="mt-0.5">
                      {responsibleSalesperson ? (
                        <div className="flex items-center gap-2">
                          <SalespersonAvatar
                            name={responsibleSalesperson.name}
                            photoUrl={(responsibleSalesperson as any).photo_url}
                            size="sm"
                          />
                          <span className="font-medium">{responsibleSalesperson.name}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground/40 italic">Sem responsável</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Observações */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Observações</h3>
                <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg whitespace-pre-wrap">
                  {lead.notes || 'Nenhuma observação registrada.'}
                </p>
              </div>

              {stage?.is_lost && lead.loss_reason && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Motivo da perda</h3>
                    <p className="text-sm text-muted-foreground bg-destructive/10 p-3 rounded-lg whitespace-pre-wrap">
                      {lead.loss_reason}
                    </p>
                  </div>
                </>
              )}
            </div>

            <Separator />

            {/* Interactions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" /> Interações ({interactions.length})
                </h3>
                <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Nova
                </Button>
              </div>

              {showForm && (
                <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                  <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ADMIN_INTERACTION_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Descreva a interação..." rows={2} />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
                    <Button size="sm" onClick={handleAddInteraction} disabled={!newDesc.trim()}>Salvar</Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {interactions.map(i => {
                  const typeInfo = ADMIN_INTERACTION_TYPES.find(t => t.value === i.interaction_type);
                  return (
                    <div key={i.id} className="border rounded-lg p-3 text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{typeInfo?.icon} {typeInfo?.label || i.interaction_type}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(i.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      {i.description && <p className="text-muted-foreground">{i.description}</p>}
                    </div>
                  );
                })}
                {interactions.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma interação registrada</p>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </ResponsiveModal>

      <AdminLeadFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editingLead={lead}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lead?</AlertDialogTitle>
            <AlertDialogDescription>
              O lead "{lead.title}" será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={handleDelete}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
