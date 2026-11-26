import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useId } from 'react';

export function OsCustomerValuesToggle({ checked, onChange, disabled }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return <div className="flex items-start justify-between gap-4 py-3">
    <div className="space-y-1">
      <Label htmlFor={id} className="text-base">Mostrar valores para o cliente</Label>
      <p className="text-sm text-muted-foreground">Inclui serviços, produtos, quantidades, preços e total no relatório, no PDF e no link da OS. Custos e margens ficam internos.</p>
    </div>
    <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-1 shrink-0" />
  </div>;
}
