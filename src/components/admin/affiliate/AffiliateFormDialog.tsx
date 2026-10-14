import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { NumericInput } from '@/components/ui/numeric-input';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { phoneMask } from '@/utils/masks';
import {
  useCreateAffiliate,
  useUpdateAffiliate,
  type AffiliateWithMetrics,
} from '@/hooks/useAffiliateData';

interface AffiliateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingAffiliate?: AffiliateWithMetrics | null;
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  first_payment_pct: string;
  recurring_pct: string;
  /**
   * String crua do campo "Duração da recorrência". Vazio = sem prazo (grava
   * `null`); "0" é um valor DIGITADO e válido (grava `0` = só a primeira
   * venda). Nunca confundir os dois — é o bug fácil deste form.
   */
  recurring_months: string;
  is_active: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  phone: '',
  first_payment_pct: '0',
  recurring_pct: '0',
  recurring_months: '',
  is_active: true,
};

/** Seed de campo decimal (NumericInput usa vírgula, não ponto). */
const seedDecimal = (v: number | null | undefined): string =>
  v == null ? '0' : String(v).replace('.', ',');

export function AffiliateFormDialog({
  open,
  onOpenChange,
  editingAffiliate,
}: AffiliateFormDialogProps) {
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const createMutation = useCreateAffiliate();
  const updateMutation = useUpdateAffiliate();
  const isPending = submitting || createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (!open) return;
    if (editingAffiliate) {
      setFormData({
        name: editingAffiliate.name,
        email: editingAffiliate.email || '',
        phone: editingAffiliate.phone || '',
        first_payment_pct: seedDecimal(editingAffiliate.first_payment_pct),
        recurring_pct: seedDecimal(editingAffiliate.recurring_pct),
        // null -> '' (sem prazo); 0 -> '0' (string "0", não cai no vazio por engano).
        recurring_months:
          editingAffiliate.recurring_months == null
            ? ''
            : String(editingAffiliate.recurring_months),
        is_active: editingAffiliate.is_active ?? true,
      });
    } else {
      setFormData(EMPTY_FORM);
    }
  }, [editingAffiliate, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    setSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        first_payment_pct: Number(formData.first_payment_pct.replace(',', '.')) || 0,
        recurring_pct: Number(formData.recurring_pct.replace(',', '.')) || 0,
        // Campo vazio -> null (sem prazo). NUNCA vira 0 aqui: "0" só quando a
        // pessoa digitou "0" de propósito ("só a primeira venda").
        recurring_months:
          formData.recurring_months.trim() === ''
            ? null
            : parseInt(formData.recurring_months, 10),
        is_active: formData.is_active,
      };
      if (editingAffiliate) {
        await updateMutation.mutateAsync({ id: editingAffiliate.id, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch (error) {
      // toasts de erro já são disparados pelos hooks de mutation
      console.error('Erro ao salvar afiliado:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const footerContent = (
    <div className="flex gap-2">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
        Cancelar
      </Button>
      <Button type="submit" form="affiliate-form" disabled={isPending} className="flex-1">
        {isPending ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={editingAffiliate ? 'Editar Afiliado' : 'Novo Afiliado'}
      description="Preencha as informações do afiliado"
      footer={footerContent}
    >
      <form id="affiliate-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="col-span-1 sm:col-span-2 space-y-2">
            <Label htmlFor="aff-name">Nome*</Label>
            <Input
              id="aff-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aff-email">Email</Label>
            <Input
              id="aff-email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aff-phone">Telefone</Label>
            <Input
              id="aff-phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: phoneMask(e.target.value) })}
              placeholder="(00) 00000-0000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aff-first-pct">% Primeiro Pagamento</Label>
            <NumericInput
              id="aff-first-pct"
              decimal
              maxDecimals={2}
              value={formData.first_payment_pct}
              onValueChange={(v) => setFormData({ ...formData, first_payment_pct: v })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aff-recurring-pct">% Recorrente</Label>
            <NumericInput
              id="aff-recurring-pct"
              decimal
              maxDecimals={2}
              value={formData.recurring_pct}
              onValueChange={(v) => setFormData({ ...formData, recurring_pct: v })}
            />
          </div>
          <div className="col-span-1 sm:col-span-2 space-y-2">
            <Label htmlFor="aff-recurring-months">Duração da recorrência</Label>
            <NumericInput
              id="aff-recurring-months"
              value={formData.recurring_months}
              onValueChange={(v) => setFormData({ ...formData, recurring_months: v })}
              placeholder="Sem prazo"
            />
            <p className="text-[11px] text-muted-foreground">
              Nº de mensalidades pagas depois da primeira venda. Em branco = sem prazo.
            </p>
          </div>
          <div className="col-span-1 sm:col-span-2 flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="aff-active" className="cursor-pointer">
              Afiliado Ativo
            </Label>
            <Switch
              id="aff-active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
          </div>
        </div>
      </form>
    </ResponsiveModal>
  );
}
