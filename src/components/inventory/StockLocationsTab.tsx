import { useEffect, useState } from 'react';
import { ArrowLeft, MapPin, Plus, Settings, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/mobile/EmptyState';
import { ListDetailLayout } from '@/components/ui/ListDetailLayout';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStocks, type Stock } from '@/hooks/useStocks';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';

interface Props {
  stocks: Stock[];
  context: 'general' | 'store';
  pdvEnabled: boolean;
  canManage: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onConfigure: (id: string) => void;
}

/** Cadastro dos locais: catálogo e saldos continuam na mesma tela de estoque. */
export function StockLocationsTab({ stocks, context, pdvEnabled, canManage, selectedId, onSelect, onConfigure }: Props) {
  const { createStock, renameStock, deleteStock, setDefaultStock } = useStocks();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [purpose, setPurpose] = useState<'pdv' | 'operacional'>(context === 'store' ? 'pdv' : 'operacional');
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const selected = stocks.find(stock => stock.id === selectedId) ?? null;
  const [name, setName] = useState('');
  useEffect(() => { setName(selected?.name ?? ''); }, [selected?.id, selected?.name]);
  useEffect(() => { if (!selected) { setDetailOpen(false); setDeleteId(null); } }, [selected]);
  const pending = createStock.isPending || renameStock.isPending || setDefaultStock.isPending || deleteStock.isPending;

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || pending || newName.trim().length < 2) return;
    try {
      const created = await createStock.mutateAsync({ name: newName.trim(), purpose: context === 'store' ? 'pdv' : purpose });
      onSelect(created.id);
      setDetailOpen(true);
      setNewName('');
      setCreating(false);
    } catch { /* O hook apresenta a orientação de domínio. */ }
  };

  return (
    <section aria-label="Gerenciar locais de estoque" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">Cada local compartilha o catálogo e mantém seus próprios saldos, mínimos e pessoas com acesso.</p>
        {canManage && <Button onClick={() => setCreating(true)} className="gap-2"><Plus className="h-4 w-4" />Criar local{context === 'store' ? ' de loja' : ''}</Button>}
      </div>
      {creating && canManage && (
        <form onSubmit={create} aria-label="Criar local" className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
          <div className="min-w-[12rem] flex-1 space-y-2"><Label htmlFor="new-stock-name">Nome do local</Label><Input id="new-stock-name" autoFocus minLength={2} maxLength={80} value={newName} onChange={event => setNewName(event.target.value)} placeholder="Ex.: Loja centro, galpão ou van" disabled={pending} /></div>
          {pdvEnabled && context === 'general' && <div className="space-y-2"><Label htmlFor="new-stock-purpose">Tipo do local</Label><Select value={purpose} onValueChange={value => setPurpose(value as 'pdv' | 'operacional')} disabled={pending}><SelectTrigger id="new-stock-purpose" className="min-w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="operacional">Operacional</SelectItem><SelectItem value="pdv">Loja</SelectItem></SelectContent></Select></div>}
          <Button type="button" variant="outline" disabled={pending} onClick={() => setCreating(false)} className="hover:bg-destructive hover:text-white">Cancelar</Button>
          <Button type="submit" disabled={pending || newName.trim().length < 2}>{createStock.isPending ? 'Criando...' : 'Criar local'}</Button>
        </form>
      )}
      <ListDetailLayout
        items={stocks.map(stock => ({ id: stock.id, title: stock.name, subtitle: `${pdvEnabled ? stock.purpose === 'pdv' ? 'Loja' : 'Operacional' : 'Local de estoque'}${stock.is_default ? ' · Principal geral' : ''}`, leading: <MapPin className="h-4 w-4" /> }))}
        selectedId={selected?.id}
        listTitle="Locais de estoque"
        searchPlaceholder="Buscar local"
        emptyLabel={context === 'store' ? 'Nenhum local de loja disponível' : 'Nenhum local disponível'}
        mobileDetailOpen={detailOpen && !!selected}
        onSelect={id => { onSelect(id); setDetailOpen(true); }}
      >
          {!selected ? <EmptyState icon={<MapPin className="h-10 w-10" />} title="Selecione um local" description="Veja os dados e configure os materiais e o acesso deste local." /> : <div className="space-y-5 rounded-xl border p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" onClick={() => setDetailOpen(false)} className="gap-2 lg:hidden hover:bg-destructive hover:text-white"><ArrowLeft className="h-4 w-4" />Voltar aos locais</Button>{canManage && <Button variant="outline" onClick={() => onConfigure(selected.id)} className="gap-2"><Settings className="h-4 w-4" />Configurar materiais e acesso</Button>}</div>
            <form onSubmit={event => { event.preventDefault(); if (canManage && name.trim() && !pending && name.trim().length >= 2) renameStock.mutate({ id: selected.id, name: name.trim() }); }} className="space-y-2"><Label htmlFor="stock-detail-name">Nome do local</Label><div className="flex flex-wrap gap-2"><Input id="stock-detail-name" minLength={2} maxLength={80} value={name} onChange={event => setName(event.target.value)} disabled={!canManage || pending} className="min-w-[12rem] flex-1" />{canManage && <Button type="submit" disabled={pending || name.trim().length < 2 || name.trim() === selected.name}>Salvar nome</Button>}</div></form>
            <div className="flex flex-wrap gap-2"><Badge className="bg-primary text-primary-foreground">{pdvEnabled ? selected.purpose === 'pdv' ? 'Loja' : 'Operacional' : 'Local de estoque'}</Badge>{selected.is_default && <Badge className="bg-primary text-primary-foreground"><Star className="mr-1 h-3 w-3" />Principal geral</Badge>}</div>
            <p className="text-sm text-muted-foreground">O principal geral organiza as operações de estoque.{pdvEnabled && ' O local padrão das vendas é escolhido nas Configurações do PDV.'}</p>
            {canManage && !selected.is_default && <div className="flex justify-end border-t pt-4"><RowActionsMenu actions={[
              ...(context === 'general' ? [{ label: 'Definir como principal geral', icon: Star, onClick: () => setDefaultStock.mutate(selected.id), disabled: pending }] : []),
              { label: 'Excluir local', icon: Trash2, variant: 'delete' as const, onClick: () => setDeleteId(selected.id), disabled: pending },
            ]} /></div>}
          </div>}
      </ListDetailLayout>
      <AlertDialog open={!!deleteId && !!selected && canManage} onOpenChange={open => { if (!open && !deleteStock.isPending) setDeleteId(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir local</AlertDialogTitle><AlertDialogDescription>Excluir “{selected?.name}”? A exclusão só é permitida para locais sem saldo, histórico ou vínculos. O histórico de operações será preservado.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleteStock.isPending} className="hover:bg-destructive hover:text-white">Cancelar</AlertDialogCancel><Button variant="destructive" disabled={deleteStock.isPending} onClick={async () => { if (!canManage || !deleteId) return; try { await deleteStock.mutateAsync(deleteId); setDeleteId(null); } catch { /* Hook apresenta erro. */ } }}>{deleteStock.isPending ? 'Excluindo...' : 'Excluir local'}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </section>
  );
}
