import { useEffect, useRef, useState } from 'react';
import { Package, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { usePdvTerminalSettings } from '@/hooks/usePdvTerminalSettings';

type Settings = ReturnType<typeof usePdvTerminalSettings>;
export function PdvStoreStockSettings({canManage}:{canManage:boolean}) {
  const settings=usePdvTerminalSettings();
  return <section aria-labelledby="pdv-store-stock-title" className="space-y-4 border-t pt-6">
    <div className="flex items-start gap-3"><div className="rounded-lg bg-primary p-2 text-primary-foreground"><Package className="h-5 w-5" /></div><div><h2 id="pdv-store-stock-title" className="text-lg font-semibold">Estoque da loja</h2><p className="text-sm text-muted-foreground">As vendas saem deste local. As compras entram nele.</p></div></div>
    {settings.isLoading?<div aria-label="Carregando estoque da loja" className="space-y-2"><Skeleton className="h-5 w-32"/><Skeleton className="h-10 w-full max-w-lg"/></div>:settings.isError?<NoticeBanner variant="warning" action="Tentar novamente" onClick={()=>void settings.refetch()}>Não foi possível carregar o estoque da loja. Nenhuma alteração foi liberada.</NoticeBanner>:settings.storeStock?<StoreStockForm key={settings.scopeKey} settings={settings} canManage={canManage}/>:null}
  </section>;
}
function StoreStockForm({settings,canManage}:{settings:Settings;canManage:boolean}) {
  const {toast}=useToast();
  const config=settings.storeStock!;
  const allowed=canManage&&config.canManage;
  const [stockId,setStockId]=useState(config.stockId??'');
  const [creating,setCreating]=useState(false);
  const [name,setName]=useState('Estoque da loja');
  const nameRef=useRef<HTMLInputElement>(null);
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
  useEffect(()=>{setStockId(config.stockId??'');},[config.stockId]);
  useEffect(()=>{if(creating)nameRef.current?.focus();},[creating]);
  const busy=settings.saveStoreStock.isPending||settings.createStoreStock.isPending;
  async function save(create=false) {
    if (!allowed||busy||(create&&!config.canCreateStock))return;
    try {
      if(create)await settings.createStoreStock.mutateAsync({name:name.trim(),expectedRevision:config.revision});
      else await settings.saveStoreStock.mutateAsync({stockId,expectedRevision:config.revision});
      if(!alive.current)return;
      setCreating(false);toast({title:create?'Estoque da loja criado':'Estoque da loja atualizado'});
    } catch(error) {if(alive.current)toast({title:'Não foi possível configurar o estoque',description:error instanceof Error?error.message:'Atualize e tente novamente.',variant:'destructive'});}
  }
  return <div className="max-w-xl space-y-3">
    {config.defaultUnavailable&&<p className="text-sm text-muted-foreground">O estoque padrão da loja não está disponível para seu perfil. Use um local autorizado nas opções do caixa.</p>}
    {config.stocks.length>0?<div className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="min-w-0 flex-1 space-y-2"><Label htmlFor="pdv-store-stock">Local usado pela loja</Label><Select value={stockId} onValueChange={setStockId} disabled={!allowed||busy}><SelectTrigger id="pdv-store-stock"><SelectValue placeholder="Escolher local de estoque"/></SelectTrigger><SelectContent>{config.stocks.map(stock=><SelectItem key={stock.id} value={stock.id}>{stock.name}</SelectItem>)}</SelectContent></Select></div>{allowed&&<Button type="button" variant="outline" onClick={()=>void save()} disabled={busy||!stockId||stockId===config.stockId}>{busy?'Salvando…':'Salvar estoque'}</Button>}</div>:<p className="text-sm">A loja ainda não tem um local de estoque disponível.</p>}
    {allowed&&config.canCreateStock&&!creating&&<Button type="button" variant="ghost" className="px-0" disabled={busy} onClick={()=>setCreating(true)}><Plus className="h-4 w-4"/>Criar local de estoque</Button>}
    {creating&&allowed&&config.canCreateStock&&<form className="space-y-3 border-t pt-3" onSubmit={event=>{event.preventDefault();void save(true);}}><div className="space-y-2"><Label htmlFor="pdv-store-stock-name">Nome do local</Label><Input ref={nameRef} id="pdv-store-stock-name" value={name} maxLength={80} autoComplete="off" disabled={busy} onChange={event=>setName(event.target.value)}/></div><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="cancel-ghost" disabled={busy} onClick={()=>setCreating(false)}>Cancelar</Button><Button type="submit" disabled={busy||name.trim().length<2}>{busy?<RefreshCw className="h-4 w-4 animate-spin"/>:<Plus className="h-4 w-4"/>}{busy?'Criando…':'Criar e usar na loja'}</Button></div></form>}
    {!allowed&&<p className="text-sm text-muted-foreground">Seu perfil pode consultar, mas não alterar o estoque da loja.</p>}
    {config.stockId&&<p className="text-xs text-muted-foreground">Os caixas que usam o estoque da loja acompanham esta escolha. Caixas com estoque próprio mantêm o local definido.</p>}
  </div>;
}
