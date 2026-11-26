import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { OsCustomerValuesToggle } from './OsCustomerValuesToggle';
import { useOsCommercialCatalog, type useOsFieldBudget } from '@/hooks/useOsCommercial';
import { osCommercialError, osCommercialLineTotal, type OsCommercialItem } from '@/lib/osCommercial';
import { OsCommercialSummary } from '@/components/technician/OsCommercialSummary';

export function OsFieldBudgetEditor({ open, onOpenChange, budget }: { open: boolean; onOpenChange: (open: boolean) => void; budget: ReturnType<typeof useOsFieldBudget> }) {
  const catalog = useOsCommercialCatalog(open);
  const { currency = 'BRL' } = useAppLocaleContext();
  const [selection, setSelection] = useState('');
  const [search, setSearch] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const data = budget.data;
  const itemsLocked = budget.saving || data?.is_billed;
  const items = budget.draft?.items ?? data?.items ?? [];
  const show = budget.draft?.show_values ?? data?.show_values ?? false;
  const total = Math.round((items.reduce((sum, item) => sum + osCommercialLineTotal(item), 0) + (data?.adjustment ?? 0)) * 100) / 100;
  const change = (next: OsCommercialItem[], showValues = show) => {
    try { budget.change({ items: next, show_values: showValues }); setStorageError(false); }
    catch { setStorageError(true); }
  };
  const update = (index: number, patch: Partial<OsCommercialItem>) => change(items.map((item, i) => i === index ? { ...item, ...patch } : item));
  const conflict = (budget.errorSaving as { code?: string })?.code === 'OSC01';
  return <><ResponsiveModal open={open} onOpenChange={onOpenChange} title="Serviços e valores" description="Confira os itens que serão cobrados nesta OS." className="sm:max-w-3xl"
    footer={data && <div className="w-full space-y-3">
      <div className="flex flex-wrap justify-between gap-3 font-semibold"><span>Total com ajustes e descontos</span><span>{total.toLocaleString('pt-BR', { style: 'currency', currency })}</span></div>
      <Button className="h-12 w-full" disabled={budget.saving || !budget.draft || conflict || storageError || total < 0 || items.some(item => !item.description.trim() || !Number.isFinite(item.quantity) || Math.abs(item.quantity * 1000 - Math.round(item.quantity * 1000)) > 0.00001 || item.quantity <= 0 || !Number.isFinite(item.unit_price) || item.unit_price < 0)} onClick={() => void budget.save()}>{budget.saving ? 'Salvando…' : 'Salvar serviços e valores'}</Button>
    </div>}>
    <div className="space-y-6">
      {budget.isPending ? <p role="status">Carregando orçamento…</p> : budget.isError ? <NoticeBanner variant="warning">Não foi possível carregar os itens. <button onClick={() => void budget.refresh()} className="underline">Tentar novamente</button></NoticeBanner> : data && <>
        <OsCustomerValuesToggle checked={show} onChange={value => change(items, value)} disabled={budget.saving} />
        <p className="text-sm text-muted-foreground">{data.is_billed ? 'Esta OS já foi faturada. Os itens estão preservados; você ainda pode escolher mostrar os valores ao cliente.' : data.can_price ? 'Você pode ajustar itens, quantidades e preços.' : 'Você pode incluir e remover itens do catálogo e ajustar quantidades. Para mudar preços, peça a permissão ao responsável.'}</p>
        {!items.length && <p className="py-4 text-sm text-muted-foreground">Nenhum serviço ou produto adicionado.</p>}
        {items.map((item, i) => <div key={item.id ?? i} className="space-y-3 border-b pb-4">
          <div className="flex items-start justify-between gap-3"><p className="break-words font-semibold">{item.description}</p><Button size="icon" variant="ghost" aria-label={`Remover ${item.description}`} disabled={itemsLocked} onClick={() => change(items.filter((_, index) => index !== i))}><Trash2 className="h-4 w-4" /></Button></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label htmlFor={`os-qty-${i}`}>Quantidade</Label><Input id={`os-qty-${i}`} type="number" min="0.001" step="0.001" value={item.quantity} disabled={itemsLocked} onChange={e => update(i, { quantity: Number(e.target.value) })} className="h-12 text-base" /></div>
            <div className="space-y-1"><Label htmlFor={`os-price-${i}`}>Preço unitário ({currency === 'BRL' ? 'R$' : currency})</Label><Input id={`os-price-${i}`} type="number" min="0" step="0.01" value={item.unit_price} disabled={!data.can_price || itemsLocked} onChange={e => update(i, { unit_price: Number(e.target.value) })} className="h-12 text-base" /></div>
            <p className="col-span-2 self-end py-3 font-semibold tabular-nums sm:col-span-1">{osCommercialLineTotal(item).toLocaleString('pt-BR', { style: 'currency', currency })}</p>
          </div>
        </div>)}
        <div className="space-y-3">
          <Label htmlFor="os-catalog-search">Adicionar do catálogo</Label>
          <Input id="os-catalog-search" placeholder="Buscar serviço ou produto" value={search} disabled={itemsLocked} onChange={e => setSearch(e.target.value)} className="h-12 text-base" />
          {catalog.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar o catálogo. <button onClick={() => void catalog.refetch()} className="underline">Tentar novamente</button></p>}
          <div className="flex flex-wrap gap-2">
            <select aria-label="Serviço ou produto do catálogo" value={selection} onChange={e => setSelection(e.target.value)} disabled={itemsLocked || catalog.isPending} className="h-12 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base">
              <option value="">{catalog.isPending ? 'Carregando catálogo…' : 'Selecionar item'}</option>
              {(catalog.data ?? []).filter(item => item.description.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map(item => <option key={item.key} value={item.key}>{item.item_type === 'material' ? 'Produto' : 'Serviço'} · {item.description}</option>)}
            </select>
            <Button className="h-12 gap-2" disabled={!selection || itemsLocked} onClick={() => { const item = catalog.data?.find(row => row.key === selection); if (item) { change([...items, { item_type: item.item_type, description: item.description, unit_price: item.unit_price, service_type_id: item.service_type_id, inventory_id: item.inventory_id, quantity: 1 }]); setSelection(''); } }}><Plus className="h-4 w-4" />Adicionar</Button>
          </div>
          {data.can_price && !data.is_billed && <Button variant="outline" disabled={itemsLocked} onClick={() => change([...items, { item_type: 'servico', description: 'Serviço adicional', quantity: 1, unit_price: 0 }])}>Adicionar serviço avulso</Button>}
        </div>
        {data.can_price && items.map((item, i) => !item.id && !item.service_type_id && !item.inventory_id && <div key={i} className="space-y-1"><Label htmlFor={`os-description-${i}`}>Descrição do serviço avulso</Label><Input id={`os-description-${i}`} value={item.description} disabled={itemsLocked} onChange={e => update(i, { description: e.target.value })} /></div>)}
        {budget.draft && <NoticeBanner variant="info">Alterações guardadas neste aparelho. Salve com internet para atualizar a OS e o relatório do cliente. <button type="button" disabled={budget.saving} className="underline" onClick={() => setConfirmDiscard(true)}>Descartar alterações locais</button></NoticeBanner>}
        {storageError && <p role="alert" className="text-sm text-destructive">O aparelho está sem espaço para guardar a alteração. Libere espaço e tente novamente.</p>}
        {!!budget.errorSaving && <NoticeBanner variant="warning">{osCommercialError(budget.errorSaving)}</NoticeBanner>}
        {conflict && <div className="space-y-3">
          <Button variant="outline" onClick={async () => { await budget.refresh(); setReviewing(true); }}>Conferir versão atual</Button>
          {reviewing && <><OsCommercialSummary summary={{ items: data.items, adjustment: data.adjustment, total: data.total, currency }} /><p className="text-sm">Confira acima a versão salva por outra pessoa. Seus itens editados continuam no formulário.</p><Button variant="outline" onClick={() => { budget.rebase(); setReviewing(false); }}>Usar meus itens sobre esta versão</Button></>}
        </div>}

      </>}
    </div>
  </ResponsiveModal>
    <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Descartar alterações locais?</AlertDialogTitle><AlertDialogDescription>Os itens guardados somente neste aparelho serão descartados. A versão já salva na OS será preservada.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Continuar editando</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { budget.discard(); setStorageError(false); }}>Descartar alterações</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
