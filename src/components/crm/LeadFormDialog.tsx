import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSectionLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CustomerSelectField } from '@/components/customers/CustomerSelectField';
import { OriginSelectField } from '@/components/customers/OriginSelectField';
import { AssigneeMultiSelect } from '@/components/schedule/AssigneeMultiSelect';
import { useLeads, type Lead, type LeadInsert } from '@/hooks/useLeads';
import { useCustomers } from '@/hooks/useCustomers';
import { useUsers } from '@/hooks/useUsers';
import { useCrmStages } from '@/hooks/useCrmStages';
import { useCrmPipelines } from '@/hooks/useCrmPipelines';
import { IconPreview } from '@/components/customers/originIcons';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { readPastedCents } from '@/lib/money-paste-mask';

interface LeadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: Lead | null;
  /**
   * Cliente pré-selecionado quando o formulário é aberto a partir da ficha do
   * cliente (Customers.tsx / CustomerDetail.tsx). O campo Cliente nasce
   * preenchido e TRAVADO (não só pré-selecionado) — quem entrou por dentro da
   * ficha do cliente pra criar uma oportunidade não tem intenção de trocar o
   * cliente ali; permitir a troca seria abrir espaço pra acidente. Ignorado
   * quando `lead` (edição) está presente.
   */
  presetCustomerId?: string | null;
  /**
   * Funil selecionado na tela de onde este formulário foi aberto (Onda D —
   * multi-pipeline). Só usado pra escolher o ESTÁGIO PADRÃO de uma
   * oportunidade NOVA: sem isso, "stages[0]" seria o primeiro estágio em
   * ordem global da empresa, que pode pertencer a QUALQUER funil — criar uma
   * oportunidade a partir do Funil B não pode fazer ela nascer no Funil A por
   * acaso. Ignorado em edição (o estágio já vem do lead).
   */
  presetPipelineId?: string | null;
}

export function LeadFormDialog({ open, onOpenChange, lead, presetCustomerId, presetPipelineId }: LeadFormDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.crm;
  const tOrigins = MESSAGES[locale].app.equipment.origins;

  const { createLead, updateLead } = useLeads();
  const { customers } = useCustomers();
  const { users } = useUsers();
  const { stages, getStageHex } = useCrmStages();
  // Onda D — multi-pipeline: com mais de um funil, as etapas do select
  // aparecem agrupadas por funil (nome do funil como cabeçalho de seção).
  // Escolher uma etapa de outro funil MOVE a oportunidade pra ele — o banco
  // resolve pipeline_id sozinho a partir do stage_id (ver useLeads.ts / a
  // migration do D1); esta tela só avisa que isso vai acontecer.
  const { pipelines } = useCrmPipelines();
  const hasMultiplePipelines = pipelines.length > 1;
  const isEditing = !!lead;

  // Primeiro estágio do funil de onde a tela veio (presetPipelineId), se veio
  // de algum; senão o primeiro em ordem global (comportamento pré-D2).
  // Memoizado num id só (string) — não a lista inteira — porque o efeito de
  // reset do formulário abaixo depende deste valor, e depender do array
  // `stages` diretamente o rodaria de novo a cada refetch que troca a
  // identidade do array sem trocar o conteúdo.
  const defaultStageIdForNewLead = useMemo(() => {
    const scoped = presetPipelineId ? stages.filter((s) => s.pipeline_id === presetPipelineId) : stages;
    return (scoped.length > 0 ? scoped[0].id : stages[0]?.id) ?? null;
  }, [stages, presetPipelineId]);

  const [formData, setFormData] = useState<Partial<LeadInsert>>({
    title: '',
    customer_id: null,
    value: 0,
    probability: 50,
    source: '',
    stage_id: null,
    expected_close_date: null,
    notes: '',
  });

  // Responsáveis (Onda C — multi-responsável): o primeiro da lista é o
  // principal (convenção explicada no hint abaixo do campo). Persistido à
  // parte de `formData` porque o hook trata a lista via `lead_assignees`,
  // nunca via `leads.assigned_to` direto (ver useLeads.ts).
  const [assigneeUserIds, setAssigneeUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (lead) {
      setFormData({
        title: lead.title,
        customer_id: lead.customer_id,
        value: lead.value || 0,
        probability: lead.probability || 50,
        source: lead.source || '',
        stage_id: lead.stage_id,
        expected_close_date: lead.expected_close_date,
        notes: lead.notes || '',
      });
      // lead.assignees já vem ordenado com o principal primeiro (useLeads).
      setAssigneeUserIds(
        lead.assignees?.length ? lead.assignees.map((a) => a.user_id) : lead.assigned_to ? [lead.assigned_to] : []
      );
    } else {
      setFormData({
        title: '',
        customer_id: presetCustomerId || null,
        value: 0,
        probability: 50,
        source: '',
        stage_id: defaultStageIdForNewLead,
        expected_close_date: null,
        notes: '',
      });
      setAssigneeUserIds([]);
    }
    // Depende do id do estágio padrão (primitivo), não do array inteiro: o
    // efeito só precisa rodar de novo quando o default muda de fato, e assim
    // não depende da identidade da lista (que troca a cada refetch).
  }, [lead, open, defaultStageIdForNewLead, presetCustomerId]);

  // Cliente travado: só quando vem pré-selecionado E não é edição (editar uma
  // oportunidade existente nunca trava o cliente, mesmo que `presetCustomerId`
  // tenha sido passado por engano pelo chamador).
  const isCustomerLocked = !isEditing && !!presetCustomerId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isEditing && lead) {
      await updateLead.mutateAsync({ id: lead.id, ...formData, assignee_user_ids: assigneeUserIds });
    } else {
      await createLead.mutateAsync({ ...formData, assignee_user_ids: assigneeUserIds } as LeadInsert & { assignee_user_ids: string[] });
    }

    onOpenChange(false);
  };

  const handleChange = (field: keyof LeadInsert, value: string | number | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {isEditing ? t.form.titleEdit : t.form.titleNew}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">{t.form.opportunityTitle}</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder={t.form.opportunityTitlePlaceholder}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customer_id">{t.form.customer}</Label>
              <CustomerSelectField
                id="customer_id"
                customers={customers}
                value={formData.customer_id || 'none'}
                onValueChange={(value) =>
                  handleChange('customer_id', value === 'none' ? null : value)
                }
                placeholder={t.form.customerPlaceholder}
                searchPlaceholder={t.form.customerSearch}
                allowNone
                noneValue="none"
                noneLabel={t.form.customerNone}
                onCreated={(id) => handleChange('customer_id', id)}
                disabled={isCustomerLocked}
              />
              {isCustomerLocked && (
                <p className="text-xs text-muted-foreground">{t.form.customerLockedHint}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <AssigneeMultiSelect
                technicians={users.map((user) => ({
                  user_id: user.user_id,
                  full_name: user.full_name,
                  avatar_url: user.avatar_url,
                }))}
                teams={[]}
                selectedUserIds={assigneeUserIds}
                selectedTeamIds={[]}
                onChangeUsers={setAssigneeUserIds}
                onChangeTeams={() => {}}
                label={t.form.salesperson}
                usersLabel={t.form.salespersonUsersLabel}
              />
              <p className="text-xs text-muted-foreground">{t.form.salespersonHint}</p>
              {assigneeUserIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {assigneeUserIds.map((uid, idx) => {
                    const user = users.find((u) => u.user_id === uid);
                    if (!user) return null;
                    return (
                      <Badge
                        key={uid}
                        variant={idx === 0 ? 'default' : 'secondary'}
                        className="gap-1.5 pl-1 pr-2 font-normal"
                      >
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                            {user.full_name?.charAt(0)?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate max-w-[120px]">{user.full_name}</span>
                        {idx === 0 && (
                          <span className="text-[9px] font-bold uppercase tracking-wide">
                            {t.form.salespersonPrimaryBadge}
                          </span>
                        )}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="source">{t.form.origin}</Label>
              <OriginSelectField
                id="source"
                value={formData.source || 'none'}
                onValueChange={(value) => handleChange('source', value === 'none' ? '' : value)}
                placeholder={t.form.originPlaceholder}
                searchPlaceholder={t.form.originSearch}
                allowNone
                noneValue="none"
                noneLabel={t.form.originNone}
                createDialogTitle={tOrigins.quickCreateTitle}
                createNameLabel={tOrigins.quickCreateNameLabel}
                createNamePlaceholder={tOrigins.quickCreateNamePlaceholder}
                createColorLabel={tOrigins.quickCreateColorLabel}
                createIconLabel={tOrigins.quickCreateIconLabel}
                createSubmitLabel={tOrigins.quickCreateSubmit}
                createCancelLabel={tOrigins.quickCreateCancel}
                createAriaLabel={tOrigins.createAriaLabel}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="stage_id">{t.form.stage}</Label>
              <Select
                value={formData.stage_id || 'none'}
                onValueChange={(value) =>
                  handleChange('stage_id', value === 'none' ? null : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t.form.stagePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.form.stageNone}</SelectItem>
                  {hasMultiplePipelines
                    ? pipelines.map((pipeline) => {
                        const stagesInPipeline = stages.filter((s) => s.pipeline_id === pipeline.id);
                        if (stagesInPipeline.length === 0) return null;
                        return (
                          <SelectGroup key={pipeline.id}>
                            <SelectSectionLabel>{pipeline.name}</SelectSectionLabel>
                            {stagesInPipeline.map((stage) => (
                              <SelectItem key={stage.id} value={stage.id}>
                                <div className="flex items-center gap-2">
                                  {stage.icon ? (
                                    <span className="shrink-0" style={{ color: getStageHex(stage.color) }}>
                                      <IconPreview name={stage.icon} className="h-3 w-3" />
                                    </span>
                                  ) : (
                                    <span
                                      className="h-2.5 w-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: getStageHex(stage.color) }}
                                    />
                                  )}
                                  {stage.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        );
                      })
                    : stages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          <div className="flex items-center gap-2">
                            {stage.icon ? (
                              <span className="shrink-0" style={{ color: getStageHex(stage.color) }}>
                                <IconPreview name={stage.icon} className="h-3 w-3" />
                              </span>
                            ) : (
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: getStageHex(stage.color) }}
                              />
                            )}
                            {stage.name}
                          </div>
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
              {hasMultiplePipelines && (
                <p className="text-xs text-muted-foreground">{t.form.stagePipelineHint}</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="value">{t.form.estimatedValue}</Label>
              <Input
                id="value"
                type="number"
                min="0"
                step="0.01"
                value={formData.value || 0}
                onChange={(e) => handleChange('value', parseFloat(e.target.value) || 0)}
                onPaste={(e) => {
                  // Colar valor pronto (ex. "4.550" de uma planilha) num
                  // `<input type="number">` é lido pelo navegador como
                  // decimal internacional e vira 4,55 — 1000x menor (bug
                  // real do sócio). `readPastedCents` lê o texto como valor
                  // de verdade em PT-BR/internacional antes do navegador
                  // decidir sozinho.
                  const cents = readPastedCents(e);
                  if (cents == null) return;
                  handleChange('value', cents / 100);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="probability">{t.form.probability}</Label>
              <Input
                id="probability"
                type="number"
                min="0"
                max="100"
                value={formData.probability || 50}
                onChange={(e) => handleChange('probability', parseInt(e.target.value) || 50)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expected_close_date">{t.form.closeDate}</Label>
              <Input
                id="expected_close_date"
                type="date"
                value={formData.expected_close_date || ''}
                onChange={(e) => handleChange('expected_close_date', e.target.value || null)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t.form.notes}</Label>
            <Textarea
              id="notes"
              value={formData.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder={t.form.notesPlaceholder}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t.form.cancel}
            </Button>
            <Button type="submit" disabled={createLead.isPending || updateLead.isPending}>
              {createLead.isPending || updateLead.isPending ? t.form.saving : t.form.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
