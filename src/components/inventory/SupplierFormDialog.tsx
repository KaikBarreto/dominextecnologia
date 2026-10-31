import { useEffect, useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useSuppliers, type Supplier, type SupplierInput } from '@/hooks/useSuppliers';
import { usePartyLabels } from '@/hooks/usePartyLabels';
import { missingRequiredPartyFields, usePartyFieldConfig } from '@/hooks/usePartyFieldConfig';
import { PartyFieldsForm } from '@/components/customers/PartyFieldsForm';
import { PartyLabelMultiSelect } from '@/components/customers/PartyLabelMultiSelect';
import { useToast } from '@/hooks/use-toast';

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier | null;
  /** Chamado com o fornecedor recém-criado (usado pelo QuickSupplier na cotação). */
  onCreated?: (supplier: Supplier) => void;
}

const EMPTY: SupplierInput = {
  name: '',
  cpf_cnpj: '',
  contact_name: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
  label_id: null,
  custom_fields: {},
};

export function SupplierFormDialog({ open, onOpenChange, supplier, onCreated }: SupplierFormDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.supplierForm;
  const { createSupplier, updateSupplier } = useSuppliers();
  const { labels, labelIdsFor, setEntityLabels, isLoading: labelsLoading } = usePartyLabels();
  const { fields: partyFields } = usePartyFieldConfig('supplier');
  const { toast } = useToast();
  const isEditing = !!supplier;
  const [form, setForm] = useState<SupplierInput>(EMPTY);
  const [customFieldErrors, setCustomFieldErrors] = useState<string[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [labelsInitialized, setLabelsInitialized] = useState(false);
  const selectableLabels = labels.filter((label) => label.is_active || selectedLabelIds.includes(label.id));

  useEffect(() => {
    if (!open) return;
    setCustomFieldErrors([]);
    setSelectedLabelIds(supplier ? (labelIdsFor('supplier', supplier.id).length ? labelIdsFor('supplier', supplier.id) : supplier.label_id ? [supplier.label_id] : []) : []);
    setLabelsInitialized(!supplier || !labelsLoading);
    if (supplier) {
      setForm({
        name: supplier.name,
        cpf_cnpj: supplier.cpf_cnpj ?? '',
        contact_name: supplier.contact_name ?? '',
        phone: supplier.phone ?? '',
        email: supplier.email ?? '',
        address: supplier.address ?? '',
        notes: supplier.notes ?? '',
        label_id: (supplier as Supplier & { label_id?: string | null }).label_id ?? null,
        custom_fields: ((supplier as Supplier & { custom_fields?: Record<string, unknown> }).custom_fields ?? {}),
      });
    } else {
      setForm(EMPTY);
    }
  }, [supplier, open, labelIdsFor, labelsLoading]);

  useEffect(() => {
    if (!open || !supplier || labelsLoading || labelsInitialized) return;
    const ids = labelIdsFor('supplier', supplier.id);
    setSelectedLabelIds(ids.length ? ids : supplier.label_id ? [supplier.label_id] : []);
    setLabelsInitialized(true);
  }, [open, supplier, labelsLoading, labelsInitialized, labelIdsFor]);

  const change = (field: keyof SupplierInput, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) return;
    const missingFields = missingRequiredPartyFields(partyFields, form.custom_fields ?? {});
    if (missingFields.length > 0) {
      setCustomFieldErrors(missingFields.map((field) => field.field_key));
      toast({ variant: 'destructive', title: 'Campos obrigatórios', description: 'Preencha os campos personalizados obrigatórios.' });
      return;
    }
    setCustomFieldErrors([]);
    let savedId: string;
    let createdSupplier: Supplier | null = null;
    const payload = { ...form, label_id: selectedLabelIds[0] ?? null };
    if (isEditing && supplier) {
      await updateSupplier.mutateAsync({ id: supplier.id, ...payload });
      savedId = supplier.id;
    } else {
      const created = await createSupplier.mutateAsync(payload);
      savedId = created.id;
      createdSupplier = created;
    }
    await setEntityLabels.mutateAsync({ entityType: 'supplier', entityId: savedId, labelIds: selectedLabelIds });
    if (createdSupplier) onCreated?.(createdSupplier);
    onOpenChange(false);
  };

  const isPending = createSupplier.isPending || updateSupplier.isPending || labelsLoading;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? t.titleEdit : t.titleNew}
      className="sm:max-w-[520px]"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t.cancel}
          </Button>
          <Button type="submit" form="supplier-form" disabled={isPending || !form.name?.trim()} className="flex-1">
            {isPending ? t.saving : t.save}
          </Button>
        </div>
      }
    >
      <form id="supplier-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>{t.fields.name}</Label>
          <Input value={form.name} onChange={(e) => change('name', e.target.value)} placeholder={t.fields.namePlaceholder} required />
        </div>
        <div className="space-y-2">
          <Label>Etiquetas</Label>
          <PartyLabelMultiSelect labels={selectableLabels} value={selectedLabelIds} onValueChange={(ids) => { setSelectedLabelIds(ids); setLabelsInitialized(true); }} disabled={labelsLoading} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t.fields.taxId}</Label>
            <Input value={form.cpf_cnpj ?? ''} onChange={(e) => change('cpf_cnpj', e.target.value)} placeholder={t.fields.taxIdPlaceholder} />
          </div>
          <div className="space-y-2">
            <Label>{t.fields.contact}</Label>
            <Input value={form.contact_name ?? ''} onChange={(e) => change('contact_name', e.target.value)} placeholder={t.fields.contactPlaceholder} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t.fields.phone}</Label>
            <Input value={form.phone ?? ''} onChange={(e) => change('phone', e.target.value)} placeholder={t.fields.phonePlaceholder} />
          </div>
          <div className="space-y-2">
            <Label>{t.fields.email}</Label>
            <Input type="email" value={form.email ?? ''} onChange={(e) => change('email', e.target.value)} placeholder={t.fields.emailPlaceholder} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t.fields.address}</Label>
          <Input value={form.address ?? ''} onChange={(e) => change('address', e.target.value)} placeholder={t.fields.addressPlaceholder} />
        </div>
        <PartyFieldsForm
          entityType="supplier"
          values={form.custom_fields ?? {}}
          onChange={(custom_fields) => setForm((prev) => ({ ...prev, custom_fields }))}
          errors={customFieldErrors}
        />
        <div className="space-y-2">
          <Label>{t.fields.notes}</Label>
          <Textarea value={form.notes ?? ''} onChange={(e) => change('notes', e.target.value)} placeholder={t.fields.notesPlaceholder} rows={2} />
        </div>
      </form>
    </ResponsiveModal>
  );
}
