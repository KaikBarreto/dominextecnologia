import {useState} from 'react';
import {RotateCcw, Save} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {CurrencyField} from '@/components/ui/CurrencyField';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Switch} from '@/components/ui/switch';
import {Tabs, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {Skeleton} from '@/components/ui/skeleton';
import {AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle} from '@/components/ui/alert-dialog';
import {useAdminBusinessCorePricing, type CorePricing, type CorePricingInput} from '@/hooks/useAdminBusinessCorePricing';
import type {BusinessCore} from '@/lib/businessCore';

function PriceInput({id, label, value, onChange, disabled}: {id:string; label:string; value:number; onChange:(v:number)=>void; disabled:boolean}) {
  return <CurrencyField symbol="R$" className="w-full sm:w-36"><Input id={id} aria-label={label} inputMode="decimal" autoComplete="off" disabled={disabled}
    value={value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
    onFocus={event => event.target.select()}
    onChange={event => onChange(Number(event.target.value.replace(/\D/g,''))/100)} /></CurrencyField>;
}

function PricingForm({initial, saving, onSave, onDirty}: {initial:CorePricing; saving:boolean; onSave:(v:CorePricingInput)=>Promise<unknown>; onDirty:()=>void}) {
  const base=197;
  const [plans, setPlans] = useState(initial.plans.map(p => ({...p,price:p.price ?? 0})));
  const [addon, setAddon] = useState({...initial.addon,price:initial.addon.price ?? 0});
  const [dirty, setDirty] = useState(false);
  const change = (action:()=>void) => {action(); setDirty(true); onDirty();};
  const validPrice = (v:number) => Number.isFinite(v) && v>=0 && v<=1000000;
  const valid = initial.configured && initial.base_price===base && validPrice(base) && plans.every(p => validPrice(p.price) && (!p.is_active || p.price>0)) && validPrice(addon.price) && (!addon.is_active || addon.price>0);
  const save = async () => {
    const input:CorePricingInput = {business_core:initial.business_core,revision:initial.revision,base_price:base,expected_base_price:initial.base_price,
      plans:plans.map(p => {const before=initial.plans.find(x=>x.id===p.id)!; return {id:p.id!,price:['start','retail_start'].includes(p.code)?base:p.price,is_active:p.is_active,expected_price:before.price,expected_active:before.is_active};}),
      addon:{price:addon.price,is_active:addon.is_active,expected_price:initial.addon.price,expected_active:initial.addon.is_active}};
    try {await onSave(input); toast.success('Preços atualizados. Os contratos existentes mantêm seus valores.');}
    catch (error) {toast.error(error instanceof Error ? error.message : 'Não foi possível salvar os preços.');}
  };
  return <div className="space-y-6">
    <section className="space-y-3">
      <div><h3 className="font-semibold">Essencial</h3><p className="text-sm text-muted-foreground">Loja e Serviços têm o mesmo preço fixo mensal. Adicionais e usuários extras são cobrados à parte.</p></div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><Label htmlFor="core-base-price">Loja ou Serviços</Label>
        <output id="core-base-price" aria-label="Preço mensal do kit" className="text-xl font-bold tabular-nums">R$ 197,00 <span className="text-sm font-normal text-muted-foreground">/ mês</span></output></div>
    </section>
    <section className="space-y-2"><h3 className="font-semibold">Planos prontos</h3><p className="text-sm text-muted-foreground">Ative somente os planos que podem ser vendidos. Os valores abaixo são mensais.</p>
      <div className="divide-y">{plans.map(plan=><div key={plan.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-center">
        <Label htmlFor={`price-${plan.id}`}>{plan.name}</Label>
        {['start','retail_start'].includes(plan.code)?<output aria-label={`Preço do plano ${plan.name}`} className="font-semibold tabular-nums">R$ 197,00</output>:<PriceInput id={`price-${plan.id}`} label={`Preço do plano ${plan.name}`} value={plan.price} disabled={saving} onChange={v=>change(()=>setPlans(plans.map(p=>p.id===plan.id?{...p,price:v}:p)))} />}
        <div className="flex items-center gap-2"><Switch id={`active-${plan.id}`} aria-label={`Vender plano ${plan.name}`} checked={plan.is_active} disabled={saving} onCheckedChange={v=>change(()=>setPlans(plans.map(p=>p.id===plan.id?{...p,is_active:v}:p)))} /><Label htmlFor={`active-${plan.id}`}>Disponível</Label></div>
      </div>)}</div>
    </section>
    <section className="space-y-3"><h3 className="font-semibold">Adicionar o outro kit</h3><p className="text-sm text-muted-foreground">{initial.business_core==='retail'?'A Loja já inclui o PDV (Loja). Serviços adiciona OS, agenda, serviços e equipamentos.':'Serviços já inclui OS. Loja adiciona PDV (Loja), caixa e atendimento de balcão.'}</p><p className="text-sm text-muted-foreground">O preço do adicional é compartilhado: alterar aqui também atualiza o outro kit. A disponibilidade é definida separadamente.</p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-center"><Label htmlFor="core-addon-price">{initial.business_core==='retail'?'Serviços':'PDV (Loja)'}</Label>
        <PriceInput id="core-addon-price" label="Preço mensal do adicional" value={addon.price} disabled={saving} onChange={v=>change(()=>setAddon({...addon,price:v}))} />
        <div className="flex items-center gap-2"><Switch id="core-addon-active" aria-label="Vender o adicional" checked={addon.is_active} disabled={saving} onCheckedChange={v=>change(()=>setAddon({...addon,is_active:v}))} /><Label htmlFor="core-addon-active">Disponível</Label></div>
      </div>
    </section>
    <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">Alterações valem para novas contratações e novas cotações.</p><Button disabled={!dirty || !valid || saving} onClick={()=>void save()}><Save className="mr-2 h-4 w-4" />{saving?'Salvando…':'Salvar preços'}</Button></div>
    {!valid && dirty && <p className="text-sm text-destructive" role="alert">Confira os valores. Planos e adicionais disponíveis para venda precisam ter preço maior que zero.</p>}
  </div>;
}

export function BusinessCorePricingSettings() {
  const [core, setCore] = useState<BusinessCore>('services');
  const [dirty, setDirty] = useState(false);
  const [pendingCore, setPendingCore] = useState<BusinessCore | null>(null);
  const query = useAdminBusinessCorePricing(core);
  const selectCore = (value:BusinessCore) => {if(value===core)return; if(dirty){setPendingCore(value);return;}setCore(value);};
  return <div className="max-w-4xl space-y-6">
    <div><h2 className="text-xl font-bold">Kits e preços</h2><p className="mt-1 text-sm text-muted-foreground">Defina os preços de Loja e Serviços. Uma empresa pode contratar os dois kits.</p></div>
    <Tabs value={core} onValueChange={v=>selectCore(v as BusinessCore)}><TabsList variant="underline"><TabsTrigger variant="underline" value="services">Serviços</TabsTrigger><TabsTrigger variant="underline" value="retail">Loja</TabsTrigger></TabsList></Tabs>
    {!query.allowed ? <p>Seu perfil não permite gerenciar os preços.</p> : query.isLoading ? <div className="space-y-4"><Skeleton className="h-20"/><Skeleton className="h-48"/><Skeleton className="h-20"/></div>
      : query.isError ? <div className="space-y-3" role="alert"><p>{query.error.message}</p><Button variant="outline" onClick={()=>void query.refetch()}><RotateCcw className="mr-2 h-4 w-4"/>Tentar novamente</Button></div>
      : query.data && <PricingForm key={`${core}-${query.data.revision}`} initial={query.data} saving={query.save.isPending} onDirty={()=>setDirty(true)} onSave={async value=>{const result=await query.save.mutateAsync(value);setDirty(false);return result;}} />}
    <AlertDialog open={!!pendingCore} onOpenChange={v=>{if(!v)setPendingCore(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Descartar os preços não salvos?</AlertDialogTitle><AlertDialogDescription>As alterações deste kit serão descartadas ao trocar de aba.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Continuar editando</AlertDialogCancel><AlertDialogAction onClick={()=>{if(pendingCore)setCore(pendingCore);setDirty(false);setPendingCore(null);}}>Descartar alterações</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
