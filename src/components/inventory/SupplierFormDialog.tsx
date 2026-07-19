import { useEffect, useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useSuppliers, type Supplier, type SupplierInput } from '@/hooks/useSuppliers';

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
  notes: '',
};

export function SupplierFormDialog({ open, onOpenChange, supplier, onCreated }: SupplierFormDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.supplierForm;
  const { createSupplier, updateSupplier } = useSuppliers();
  const isEditing = !!supplier;
  const [form, setForm] = useState<SupplierInput>(EMPTY);

  useEffect(() => {
    if (!open) return;
    if (supplier) {
      setForm({
        name: supplier.name,
        cpf_cnpj: supplier.cpf_cnpj ?? '',
        contact_name: supplier.contact_name ?? '',
        phone: supplier.phone ?? '',
        email: supplier.email ?? '',
        notes: supplier.notes ?? '',
      });
    } else {
      setForm(EMPTY);
    }
  }, [supplier, open]);

  const change = (field: keyof SupplierInput, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) return;
    if (isEditing && supplier) {
      await updateSupplier.mutateAsync({ id: supplier.id, ...form });
    } else {
      const created = await createSupplier.mutateAsync(form);
      onCreated?.(created);
    }
    onOpenChange(false);
  };

  const isPending = createSupplier.isPending || updateSupplier.isPending;

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
          <Button onClick={handleSubmit as any} disabled={isPending || !form.name?.trim()} className="flex-1">
            {isPending ? t.saving : t.save}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>{t.fields.name}</Label>
          <Input value={form.name} onChange={(e) => change('name', e.target.value)} placeholder={t.fields.namePlaceholder} required />
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
          <Label>{t.fields.notes}</Label>
          <Textarea value={form.notes ?? ''} onChange={(e) => change('notes', e.target.value)} placeholder={t.fields.notesPlaceholder} rows={2} />
        </div>
      </form>
    </ResponsiveModal>
  );
}
