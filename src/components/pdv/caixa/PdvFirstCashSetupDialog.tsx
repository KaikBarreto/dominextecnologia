import '@/components/pdv/PdvWorkspace.css';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { PdvTerminalStockFields } from '@/components/pdv/settings/PdvTerminalSettings';
import { usePdvTerminalSettings, type PdvStockBindingMode } from '@/hooks/usePdvTerminalSettings';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => Promise<void> | void;
}

export function PdvFirstCashSetupDialog({ open, onOpenChange, onCreated }: Props) {
  const settings = usePdvTerminalSettings(open);
  return <FirstCashSetupContent key={settings.scopeKey ?? 'pending'} settings={settings} open={open} onOpenChange={onOpenChange} onCreated={onCreated} />;
}
function FirstCashSetupContent({open,onOpenChange,onCreated,settings}:Props & {settings:ReturnType<typeof usePdvTerminalSettings>}) {
  const { toast } = useToast();
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
  const [name, setName] = useState('Caixa 01');
  const [stockId, setStockId] = useState('');
  const [stockBindingMode,setStockBindingMode]=useState<PdvStockBindingMode>('store_default');
  const currentScope=useRef(settings.scopeKey);currentScope.current=settings.scopeKey;
  const preferredStockId=settings.storeStock?.stockId??'';

  useEffect(() => {
    if (!open) return;
    setName('Caixa 01');
    setStockBindingMode('store_default');
    setStockId(preferredStockId);
  }, [open, preferredStockId, settings.scopeKey]);

  async function createAndContinue() {
    const normalizedName = name.trim();
    if (normalizedName.length < 2 || !stockId || settings.isError || settings.storeStock?.canManage !== true) return;
    const operationScope=settings.scopeKey;
    try {
      await settings.save.mutateAsync({
        name: normalizedName,
        stockId,
        stockBindingMode,
        isActive: true,
        sortOrder: 1,
      });
      if(!alive.current||currentScope.current!==operationScope)return;
      onOpenChange(false);
      await onCreated();
      toast({ title: 'Caixa cadastrado', description: 'Agora informe o dinheiro inicial para abrir.' });
    } catch (error) {
      if(!alive.current||currentScope.current!==operationScope)return;
      toast({
        title: 'Não foi possível preparar o caixa',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <ResponsiveModal drawerClassName="pdv-dialog" className="pdv-dialog"
      open={open}
      onOpenChange={onOpenChange}
      title="Abrir o primeiro caixa"
      description="Faça esta configuração uma única vez. Depois, a abertura será direta."
      footer={<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="button" onClick={() => void createAndContinue()} disabled={settings.isLoading || settings.isError || settings.save.isPending || settings.storeStock?.canManage !== true || name.trim().length < 2 || !stockId}>{settings.save.isPending ? 'Preparando...' : 'Continuar para abertura'}</Button></div>}
    >
      {settings.isLoading ? <div className="space-y-3 py-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : null}
      {settings.isError ? <div className="py-2"><NoticeBanner variant="destructive" action="Tentar novamente" onClick={() => void settings.refetch()}>Não foi possível carregar os dados para preparar o caixa.</NoticeBanner></div> : null}
      {!settings.isLoading && !settings.isError && settings.stocks.length === 0 ? <div className="py-2"><NoticeBanner variant="warning" title="Cadastre um local de estoque primeiro">O caixa precisa saber de qual estoque os produtos serão retirados.</NoticeBanner></div> : null}
      {!settings.isLoading && !settings.isError && settings.stocks.length > 0 ? (
        <div className="space-y-5 py-2">
          <div className="space-y-2"><Label htmlFor="first-pdv-cash-name">Nome do caixa</Label><Input id="first-pdv-cash-name" value={name} maxLength={80} autoComplete="off" onChange={(event) => setName(event.target.value)} /></div>
          {/* Local de estoque: o mesmo seletor e vínculo das configurações. */}
          {settings.storeStock&&<PdvTerminalStockFields stocks={settings.stocks} storeStock={settings.storeStock} stockId={stockId} bindingMode={stockBindingMode} onChange={(id,mode)=>{setStockId(id);setStockBindingMode(mode);}} disabled={settings.save.isPending||!settings.storeStock.canManage}/>}

        </div>
      ) : null}
    </ResponsiveModal>
  );
}
