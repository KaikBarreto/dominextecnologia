import { useEffect, useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useLeads } from '@/hooks/useLeads';
import { useCrmStages } from '@/hooks/useCrmStages';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { readPastedCents } from '@/lib/money-paste-mask';
import type { Customer } from '@/types/database';

interface CreateOpportunityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}

/**
 * Ação "Criar oportunidade no CRM" a partir do cliente. Cria um lead já
 * vinculado (`customer_id`), herdando o título a partir do nome do cliente.
 * Reusa `useLeads().createLead` — nada de chamada direta ao Supabase aqui.
 */
export function CreateOpportunityDialog({ open, onOpenChange, customer }: CreateOpportunityDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.customers.opportunityDialog;

  const { createLead } = useLeads();
  const { stages } = useCrmStages();

  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open && customer) {
      setTitle(customer.name);
      setValue('');
      setNotes('');
    }
  }, [open, customer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !title.trim()) return;

    const defaultStageId = stages.length > 0 ? stages[0].id : null;

    await createLead.mutateAsync({
      title: title.trim(),
      customer_id: customer.id,
      value: value ? parseFloat(value) : 0,
      stage_id: defaultStageId,
      notes: notes.trim() || null,
    } as any);

    onOpenChange(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.title}
      description={t.description}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button type="submit" form="create-opportunity-form" disabled={createLead.isPending || !title.trim()}>
            {createLead.isPending ? t.submitting : t.submit}
          </Button>
        </div>
      }
    >
      <form id="create-opportunity-form" onSubmit={handleSubmit} className="space-y-4 px-4 py-2 sm:px-0">
        <div className="space-y-2">
          <Label>{t.customerLabel}</Label>
          <Input value={customer?.name ?? ''} disabled readOnly />
        </div>

        <div className="space-y-2">
          <Label htmlFor="opportunity-title">{t.fieldTitle}</Label>
          <Input
            id="opportunity-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.fieldTitlePlaceholder}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="opportunity-value">{t.fieldValue}</Label>
          <Input
            id="opportunity-value"
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onPaste={(e) => {
              // Colar valor pronto (ex. "4.550" de uma planilha) num
              // `<input type="number">` é lido pelo navegador como decimal
              // internacional e vira 4,55 — 1000x menor (bug real do sócio).
              // `readPastedCents` lê o texto como valor de verdade em
              // PT-BR/internacional antes do navegador decidir sozinho.
              const cents = readPastedCents(e);
              if (cents == null) return;
              setValue(cents ? (cents / 100).toFixed(2) : '');
            }}
            placeholder="0,00"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="opportunity-notes">{t.fieldNotes}</Label>
          <Textarea
            id="opportunity-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t.fieldNotesPlaceholder}
            rows={3}
          />
        </div>
      </form>
    </ResponsiveModal>
  );
}
