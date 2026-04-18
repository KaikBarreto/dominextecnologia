import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as LucideIcons from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, MessageCircle, Pencil, Trash2, X, Check } from 'lucide-react';
import { phoneMask } from '@/utils/masks';
import { useAdminLeadInteractions, useAdminCrmStages, useAdminLeads, ADMIN_INTERACTION_TYPES, type AdminLead } from '@/hooks/useAdminCrm';
import { useCompanyOrigins } from '@/hooks/useCompanyOrigins';
import { useAuth } from '@/contexts/AuthContext';
import { COMPANY_SEGMENTS, getSegment } from '@/utils/companySegments';
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
  const { deleteLead, updateLead, leads } = useAdminLeads();
  const { user } = useAuth();

  // Use fresh data from query instead of stale prop
  const lead = leads.find(l => l.id === leadProp.id) || leadProp;
  const stage = stages.find(s => s.id === lead.stage_id);

  const [newType, setNewType] = useState('ligacao');
  const [newDesc, setNewDesc] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [form, setForm] = useState({
    title: '',
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    value: '',
    source: '',
    segment: '',
    stage_id: '',
    expected_close_date: '',
    notes: '',
  });

  useEffect(() => {
    setForm({
      title: lead.title || '',
      company_name: lead.company_name || '',
      contact_name: lead.contact_name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      value: lead.value ? String(lead.value) : '',
      source: lead.source || '',
      segment: lead.segment || '',
      stage_id: lead.stage_id || '',
      expected_close_date: lead.expected_close_date || '',
      notes: lead.notes || '',
    });
  }, [lead]);

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

  const handleSaveEdit = () => {
    if (!form.title.trim()) return;
    updateLead.mutate({
      id: lead.id,
      title: form.title.trim(),
      company_name: form.company_name || null,
      contact_name: form.contact_name || null,
      email: form.email || null,
      phone: form.phone || null,
      value: form.value ? Number(form.value) : 0,
      source: form.source || null,
      segment: form.segment || null,
      stage_id: form.stage_id || null,
      expected_close_date: form.expected_close_date || null,
      notes: form.notes || null,
    });
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setForm({
      title: lead.title || '',
      company_name: lead.company_name || '',
      contact_name: lead.contact_name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      value: lead.value ? String(lead.value) : '',
      source: lead.source || '',
      segment: lead.segment || '',
      stage_id: lead.stage_id || '',
      expected_close_date: lead.expected_close_date || '',
      notes: lead.notes || '',
    });
    setIsEditing(false);
  };

  const originInfo = lead.source ? origins.find(o => o.name === lead.source) : null;
  const selectedOriginEdit = origins.find(o => o.name === form.source);
  const segmentInfo = getSegment(lead.segment);
  const selectedSegmentEdit = getSegment(form.segment);

  const formatCurrency = (v: number | null) => v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-';

  return (
    <>
      <ResponsiveModal open={open} onOpenChange={v => { if (!v) setIsEditing(false); onOpenChange(v); }} title={isEditing ? 'Editando Lead' : 'Lead'}>
        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-4 pr-2">
            {/* Action buttons */}
            <div className="flex items-center gap-2 justify-end">
              {isEditing ? (
                <>
                  <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                    <X className="h-3.5 w-3.5 mr-1.5" /> Cancelar
                  </Button>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={handleSaveEdit} disabled={!form.title.trim()}>
                    <Check className="h-3.5 w-3.5 mr-1.5" /> Salvar
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    className="bg-orange-500 hover:bg-orange-600 text-white"
                    onClick={() => setIsEditing(true)}
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
                </>
              )}
            </div>

            {isEditing ? (
              /* ---- EDIT MODE ---- */
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground mb-2">Informações Principais</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Título *</Label>
                      <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Título da negociação" />
                    </div>
                    <div>
                      <Label className="text-xs">Telefone</Label>
                      <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: phoneMask(e.target.value) }))} placeholder="(00) 00000-0000" />
                    </div>
                    <div>
                      <Label className="text-xs">E-mail</Label>
                      <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contato@empresa.com" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Origem</Label>
                      <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                        <SelectTrigger
                          className={selectedOriginEdit ? 'text-white font-medium border-transparent' : ''}
                          style={selectedOriginEdit ? { backgroundColor: selectedOriginEdit.color || '#6B7280' } : undefined}
                        >
                          {selectedOriginEdit ? (
                            <div className="flex items-center gap-2">
                              <OriginIcon name={selectedOriginEdit.icon || 'Globe'} className="h-3.5 w-3.5 text-white" />
                              <span>{selectedOriginEdit.name}</span>
                            </div>
                          ) : (
                            <SelectValue placeholder="Selecione a origem" />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          {origins.map(o => (
                            <SelectItem
                              key={o.id}
                              value={o.name}
                              className="cursor-pointer rounded-md my-0.5 transition-colors hover:!text-white [&[data-highlighted]]:!text-white"
                              style={{
                                ['--origin-color' as any]: o.color || '#6B7280',
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <div className="h-4 w-4 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: o.color || '#6B7280' }}>
                                  <OriginIcon name={o.icon || 'Globe'} className="h-2.5 w-2.5 text-white" />
                                </div>
                                <span>{o.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Segmento</Label>
                      <Select value={form.segment} onValueChange={v => setForm(f => ({ ...f, segment: v }))}>
                        <SelectTrigger
                          className={selectedSegmentEdit ? 'text-white font-medium border-transparent' : ''}
                          style={selectedSegmentEdit ? { backgroundColor: selectedSegmentEdit.color } : undefined}
                        >
                          {selectedSegmentEdit ? (
                            <div className="flex items-center gap-2">
                              <selectedSegmentEdit.icon className="h-3.5 w-3.5 text-white" />
                              <span className="truncate">{selectedSegmentEdit.label}</span>
                            </div>
                          ) : (
                            <SelectValue placeholder="Selecione o segmento" />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          {COMPANY_SEGMENTS.map(s => (
                            <SelectItem key={s.value} value={s.value} className="cursor-pointer rounded-md my-0.5">
                              <div className="flex items-center gap-2">
                                <div className="h-4 w-4 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: s.color }}>
                                  <s.icon className="h-2.5 w-2.5 text-white" />
                                </div>
                                <span>{s.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground mb-2">Detalhes da Negociação</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Empresa</Label>
                      <Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Nome da empresa" />
                    </div>
                    <div>
                      <Label className="text-xs">Contato</Label>
                      <Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Nome do contato" />
                    </div>
                    <div>
                      <Label className="text-xs">Valor (R$)</Label>
                      <Input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0,00" />
                    </div>
                    <div>
                      <Label className="text-xs">Etapa</Label>
                      <Select value={form.stage_id} onValueChange={v => setForm(f => ({ ...f, stage_id: v }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {stages.map(s => (
                            <SelectItem key={s.id} value={s.id}>
                              <div className="flex items-center gap-2">
                                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                                {s.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Previsão de Fechamento</Label>
                      <Input type="date" value={form.expected_close_date} onChange={e => setForm(f => ({ ...f, expected_close_date: e.target.value }))} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Observações</Label>
                      <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Anotações sobre a negociação..." />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ---- VIEW MODE ---- */
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
              </div>
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
