import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { usePdvTerminalSettings } from '@/hooks/usePdvTerminalSettings';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => Promise<void> | void;
}

export function PdvFirstCashSetupDialog({ open, onOpenChange, onCreated }: Props) {
  const { toast } = useToast();
  const settings = usePdvTerminalSettings(open);
  const [name, setName] = useState('Caixa 01');
  const [stockId, setStockId] = useState('');
  const preferredStockId = useMemo(
    () => (settings.stocks.find((stock) => stock.isDefault) ?? settings.stocks[0])?.id ?? '',
    [settings.stocks],
  );

  useEffect(() => {
    if (!open) return;
    setName('Caixa 01');
    setStockId(preferredStockId);
  }, [open, preferredStockId]);

  async function createAndContinue() {
    const normalizedName = name.trim();
    if (normalizedName.length < 2 || !stockId) return;
    try {
      await settings.save.mutateAsync({
        name: normalizedName,
        stockId,
        isActive: true,
        sortOrder: 1,
      });
      onOpenChange(false);
      await onCreated();
      toast({ title: 'Caixa cadastrado', description: 'Agora informe o dinheiro inicial para abrir.' });
    } catch (error) {
      toast({
        title: 'Não foi possível preparar o caixa',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Abrir o primeiro caixa"
      description="Faça esta configuração uma única vez. Depois, a abertura será direta."
      footer={<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="button" onClick={() => void createAndContinue()} disabled={settings.isLoading || settings.isError || settings.save.isPending || name.trim().length < 2 || !stockId}>{settings.save.isPending ? 'Preparando...' : 'Continuar para abertura'}</Button></div>}
    >
      {settings.isLoading ? <div className="space-y-3 py-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : null}
      {settings.isError ? <div className="py-2"><NoticeBanner variant="destructive" action="Tentar novamente" onClick={() => void settings.refetch()}>Não foi possível carregar os dados para preparar o caixa.</NoticeBanner></div> : null}
      {!settings.isLoading && !settings.isError && settings.stocks.length === 0 ? <div className="py-2"><NoticeBanner variant="warning" title="Cadastre um local de estoque primeiro">O caixa precisa saber de qual estoque os produtos serão retirados.</NoticeBanner></div> : null}
      {!settings.isLoading && !settings.isError && settings.stocks.length > 0 ? (
        <div className="space-y-5 py-2">
          <div className="space-y-2"><Label htmlFor="first-pdv-cash-name">Nome do caixa</Label><Input id="first-pdv-cash-name" value={name} maxLength={80} autoComplete="off" onChange={(event) => setName(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="first-pdv-cash-stock">Local de estoque</Label><Select value={stockId} onValueChange={setStockId}><SelectTrigger id="first-pdv-cash-stock"><SelectValue placeholder="Escolha o estoque" /></SelectTrigger><SelectContent>{settings.stocks.map((stock) => <SelectItem key={stock.id} value={stock.id}>{stock.name}{stock.isDefault ? ' · principal' : ''}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">As vendas deste caixa movimentarão este estoque.</p></div>
        </div>
      ) : null}
    </ResponsiveModal>
  );
}
