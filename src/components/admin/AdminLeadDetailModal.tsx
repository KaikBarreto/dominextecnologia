import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as LucideIcons from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Building2, User, Mail, Phone, DollarSign, Calendar, Plus, MessageCircle, Pencil, Trash2 } from 'lucide-react';
import { phoneMask } from '@/utils/masks';
import { useAdminLeadInteractions, useAdminCrmStages, useAdminLeads, ADMIN_INTERACTION_TYPES, type AdminLead } from '@/hooks/useAdminCrm';
import { useCompanyOrigins } from '@/hooks/useCompanyOrigins';
import { useAuth } from '@/contexts/AuthContext';
import { AdminLeadFormDialog } from '@/components/admin/AdminLeadFormDialog';
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

export function AdminLeadDetailModal({ open, onOpenChange, lead }: Props) {
  const { interactions, createInteraction } = useAdminLeadInteractions(lead.id);
  const { stages } = useAdminCrmStages();
  const { origins } = useCompanyOrigins();
  const { deleteLead } = useAdminLeads();
  const { user } = useAuth();
  const stage = stages.find(s => s.id === lead.stage_id);

  const [newType, setNewType] = useState('ligacao');
  const [newDesc, setNewDesc] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

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

  const formatCurrency = (v: number | null) => v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-';

  return (
    <>
      <ResponsiveModal open={open} onOpenChange={onOpenChange} title={lead.title}>
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

            {/* Info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {lead.company_name && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4" /> {lead.company_name}
                </div>
              )}
              {lead.contact_name && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-4 w-4" /> {lead.contact_name}
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" /> {lead.email}
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" /> {phoneMask(lead.phone)}
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="h-4 w-4" /> {formatCurrency(lead.value)}
              </div>
              {lead.expected_close_date && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" /> {format(new Date(lead.expected_close_date + 'T12:00:00'), 'dd/MM/yyyy')}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {stage && (
                <Badge style={{ backgroundColor: stage.color, color: '#fff' }}>{stage.name}</Badge>
              )}
              {lead.source && originInfo && (
                <Badge
                  className="border-0 flex items-center gap-1"
                  style={{ backgroundColor: originInfo.color || '#6B7280', color: '#fff' }}
                >
                  <OriginIcon name={originInfo.icon || 'Globe'} className="h-3 w-3" />
                  {lead.source}
                </Badge>
              )}
              {lead.source && !originInfo && (
                <Badge variant="outline">{lead.source}</Badge>
              )}
            </div>

            {lead.notes && (
              <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">{lead.notes}</p>
            )}

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

      <AdminLeadFormDialog open={editOpen} onOpenChange={setEditOpen} editingLead={lead} />

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
