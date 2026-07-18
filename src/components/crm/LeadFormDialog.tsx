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
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useLeads, type Lead, type LeadInsert } from '@/hooks/useLeads';
import { useCustomers } from '@/hooks/useCustomers';
import { useUsers } from '@/hooks/useUsers';
import { useCrmStages } from '@/hooks/useCrmStages';
import { useCustomerOrigins } from '@/hooks/useCustomerOrigins';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface LeadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: Lead | null;
}

export function LeadFormDialog({ open, onOpenChange, lead }: LeadFormDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.crm;

  const { createLead, updateLead } = useLeads();
  const { customers } = useCustomers();
  const { users } = useUsers();
  const { stages } = useCrmStages();
  const { activeOrigins } = useCustomerOrigins();
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
        customer_id: null,
        value: 0,
        probability: 50,
        source: '',
        stage_id: defaultStageId,
        expected_close_date: null,
        assigned_to: null,
        notes: '',
      });
    }
  }, [lead, open, stages]);

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
              <SearchableSelect
                options={[
                  { value: 'none', label: t.form.customerNone },
                  ...customers.map((c) => ({
                    value: c.id,
                    label: c.name,
                    sublabel: c.document || c.email || undefined,
                  })),
                ]}
                value={formData.customer_id || 'none'}
                onValueChange={(value) =>
                  handleChange('customer_id', value === 'none' ? null : value)
                }
                placeholder={t.form.customerPlaceholder}
                searchPlaceholder={t.form.customerSearch}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="assigned_to">{t.form.salesperson}</Label>
              <Select
                value={formData.assigned_to || 'none'}
                onValueChange={(value) =>
                  handleChange('assigned_to', value === 'none' ? null : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t.form.salespersonPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.form.salespersonNone}</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="source">{t.form.origin}</Label>
              <Select
                value={formData.source || 'none'}
                onValueChange={(value) => handleChange('source', value === 'none' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t.form.originPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.form.originNone}</SelectItem>
                  {activeOrigins.map((origin) => (
                    <SelectItem key={origin.id} value={origin.name}>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: origin.color }}
                        />
                        {origin.name}
                      </span>
                    </SelectItem>
                  ))}
                  {formData.source && !activeOrigins.some((o) => o.name === formData.source) && (
                    <SelectItem value={formData.source}>{formData.source}</SelectItem>
                  )}
                </SelectContent>
              </Select>
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
                      {stage.name}
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
