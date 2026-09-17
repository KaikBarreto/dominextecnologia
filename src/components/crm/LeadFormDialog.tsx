import { useState, useEffect } from 'react';
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User } from 'lucide-react';
import { CustomerSelectField } from '@/components/customers/CustomerSelectField';
import { OriginSelectField } from '@/components/customers/OriginSelectField';
import { useLeads, type Lead, type LeadInsert } from '@/hooks/useLeads';
import { useCustomers } from '@/hooks/useCustomers';
import { useUsers } from '@/hooks/useUsers';
import { useCrmStages } from '@/hooks/useCrmStages';
import { IconPreview } from '@/components/customers/originIcons';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

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
}

export function LeadFormDialog({ open, onOpenChange, lead, presetCustomerId }: LeadFormDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.crm;
  const tOrigins = MESSAGES[locale].app.equipment.origins;

  const { createLead, updateLead } = useLeads();
  const { customers } = useCustomers();
  const { users } = useUsers();
  const { stages, getStageHex } = useCrmStages();
  const isEditing = !!lead;

  const [formData, setFormData] = useState<Partial<LeadInsert>>({
    title: '',
    customer_id: null,
    value: 0,
    probability: 50,
    source: '',
    stage_id: null,
    expected_close_date: null,
    assigned_to: null,
    notes: '',
  });

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
        assigned_to: lead.assigned_to,
        notes: lead.notes || '',
      });
    } else {
      // Set default stage to first stage if available
      const defaultStageId = stages.length > 0 ? stages[0].id : null;
      setFormData({
        title: '',
        customer_id: presetCustomerId || null,
        value: 0,
        probability: 50,
        source: '',
        stage_id: defaultStageId,
        expected_close_date: null,
        assigned_to: null,
        notes: '',
      });
    }
    // Depende do 1º estágio, não do array inteiro: o efeito só precisa rodar de
    // novo quando o default muda, e assim não depende da identidade da lista.
  }, [lead, open, stages[0]?.id, presetCustomerId]);

  // Cliente travado: só quando vem pré-selecionado E não é edição (editar uma
  // oportunidade existente nunca trava o cliente, mesmo que `presetCustomerId`
  // tenha sido passado por engano pelo chamador).
  const isCustomerLocked = !isEditing && !!presetCustomerId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isEditing && lead) {
      await updateLead.mutateAsync({ id: lead.id, ...formData });
    } else {
      await createLead.mutateAsync(formData as LeadInsert);
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

            <div className="space-y-2">
              <Label htmlFor="assigned_to">{t.form.salesperson}</Label>
              <Select
                value={formData.assigned_to || 'none'}
                onValueChange={(value) =>
                  handleChange('assigned_to', value === 'none' ? null : value)
                }
              >
                <SelectTrigger id="assigned_to">
                  <SelectValue placeholder={t.form.salespersonPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <div className="flex items-center gap-2">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted shrink-0">
                        <User className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <span>{t.form.salespersonNone}</span>
                    </div>
                  </SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                            {user.full_name?.charAt(0)?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span>{user.full_name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  {stages.map((stage) => (
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
