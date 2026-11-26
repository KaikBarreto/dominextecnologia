import { useEffect, useState } from 'react';
import { OsCustomerValuesToggle } from '@/components/service-orders/OsCustomerValuesToggle';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { useEquipment } from '@/hooks/useEquipment';
import { useOsExecutionTemplates } from '@/hooks/useOsCommercial';
import type { Quote } from '@/hooks/useQuotes';
import type { QuoteExecutionAssignment } from '@/lib/quoteServiceDistribution';

interface Props {
  open: boolean;
  quote: Quote | null;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (execution: QuoteExecutionAssignment[], showValues: boolean) => void;
}

/** A conversão comercial não exige distribuir serviços nem inferir checklists. */
export function QuoteServiceDistributionDialog({ open, quote, loading, onOpenChange, onConfirm }: Props) {
  const { equipment: rawEquipment, isLoading: loadingEquipment, isError: equipmentError, refetch: reloadEquipment } = useEquipment(quote?.customer_id ?? undefined);
  const [showValues, setShowValues] = useState(false);
  const [prepareExecution, setPrepareExecution] = useState(false);
  const [execution, setExecution] = useState<QuoteExecutionAssignment[]>([]);
  const templates = useOsExecutionTemplates(open && prepareExecution);
  const equipment = quote?.customer_id ? rawEquipment : [];
  useEffect(() => {
    if (open) { setShowValues(false); setPrepareExecution(false); setExecution([]); }
  }, [open, quote?.id]);
  const toggleEquipment = (id: string, checked: boolean) => setExecution(current => checked
    ? [...current, { equipment_id: id, form_template_ids: [] }]
    : current.filter(row => row.equipment_id !== id));
  const toggleChecklist = (equipmentId: string, id: string, checked: boolean) => setExecution(current => current.map(row => row.equipment_id !== equipmentId ? row : {
    ...row, form_template_ids: checked ? [...row.form_template_ids, id] : row.form_template_ids.filter(value => value !== id),
  }));
  return <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Gerar OS"
    description={`Orçamento #${quote?.quote_number ?? ''} · Serviços, produtos e valores serão copiados. A execução pode ser preparada agora ou depois, na OS.`}
    className="sm:max-w-[760px]" footer={<div className="flex w-full justify-end gap-3">
      <Button variant="cancel" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
      <Button disabled={loading || (prepareExecution && (loadingEquipment || equipmentError || templates.isPending || templates.isError))}
        onClick={() => onConfirm(prepareExecution ? execution : [], showValues)}>{loading ? 'Gerando…' : 'Gerar OS'}</Button>
    </div>}>
    <div className="space-y-5">
      <OsCustomerValuesToggle checked={showValues} onChange={setShowValues} disabled={loading} />
      <div className="flex items-start justify-between gap-4 border-t pt-5">
        <div className="space-y-1"><Label htmlFor="quote-prepare-execution" className="text-base">Definir equipamentos e checklists agora</Label>
          <p className="text-sm text-muted-foreground">Opcional. Os serviços definem os valores; os checklists definem o que será executado em cada equipamento.</p></div>
        <Switch id="quote-prepare-execution" checked={prepareExecution} onCheckedChange={setPrepareExecution} disabled={loading} className="shrink-0" />
      </div>
      {prepareExecution && <div className="space-y-4">
        {(loadingEquipment || templates.isPending) && <p role="status">Carregando equipamentos e checklists…</p>}
        {equipmentError && <NoticeBanner variant="warning">Não foi possível carregar os equipamentos. <button className="underline" onClick={() => void reloadEquipment()}>Tentar novamente</button></NoticeBanner>}
        {templates.isError && <NoticeBanner variant="warning">Não foi possível carregar os checklists. <button className="underline" onClick={() => void templates.refetch()}>Tentar novamente</button></NoticeBanner>}
        {!equipment.length && !loadingEquipment && <p className="text-sm text-muted-foreground">Este cliente ainda não possui equipamentos. Você pode cadastrá-los e preparar a execução depois, na OS.</p>}
        {equipment.map(item => {
          const selected = execution.find(row => row.equipment_id === item.id);
          return <section key={item.id} className="space-y-3 border-t py-4">
            <label className="flex cursor-pointer items-start gap-3"><Checkbox checked={!!selected} onCheckedChange={checked => toggleEquipment(item.id, checked === true)} disabled={loading} className="mt-0.5" />
              <span className="min-w-0"><span className="block break-words font-semibold">{item.name}</span><span className="text-sm text-muted-foreground">{[item.brand, item.model, item.identifier].filter(Boolean).join(' · ')}</span></span></label>
            {selected && <fieldset className="space-y-3 pl-7"><legend className="mb-3 text-sm font-medium">Checklists deste equipamento</legend>
              {!templates.isPending && !templates.data?.length && <p className="text-sm text-muted-foreground">Nenhum checklist ativo. O equipamento será incluído sem checklist.</p>}
              {templates.data?.map(template => <label key={template.id} className="flex cursor-pointer items-start gap-3 text-sm"><Checkbox checked={selected.form_template_ids.includes(template.id)} disabled={loading}
                onCheckedChange={checked => toggleChecklist(item.id, template.id, checked === true)} /><span className="break-words">{template.name}</span></label>)}
            </fieldset>}
          </section>;
        })}
      </div>}
    </div>
  </ResponsiveModal>;
}
