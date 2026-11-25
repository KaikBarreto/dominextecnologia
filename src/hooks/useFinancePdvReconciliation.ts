import {useEffect,useRef} from 'react';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/contexts/AuthContext';
import {useCompanyModules} from '@/hooks/useCompanyModules';
import {usePdvAuthorizedQueryScope} from '@/hooks/pdvReportCache';
import {hasPdvExplicitPermission} from '@/components/pdv/caixa-v2/pdvCashAccess';
import {FINANCE_PDV_RECONCILIATION_ROOT,loadFinancePdvExport,parseFinancePdvEntry,parseFinancePdvReconciliation,type FinancePdvProjection} from '@/lib/financePdvReconciliation';
export {FINANCE_PDV_RECONCILIATION_ROOT} from '@/lib/financePdvReconciliation';
type RpcResult = {data:unknown;error:{code?:string}|null};
const rpc = supabase.rpc.bind(supabase) as unknown as (name:string,args:Record<string,unknown>)=>PromiseLike<RpcResult>;
export function financePdvReadError(error: {code?:string}|null) {
  if (error?.code === '42501') return new Error('Seu perfil não permite consultar esta conferência.');
  if (error?.code === '22023') return new Error('Revise o período da conferência.');
  if (error?.code === 'P0002') return new Error('Este movimento não está disponível neste período.');
  return new Error('Não foi possível carregar a conferência. Tente novamente.');
}
async function readFinancePdv(name:string,args:Record<string,unknown>):Promise<RpcResult> {
  // O SDK retorna um builder thenable, sem catch/finally. Await assimila esse
  // contrato e mantém falhas de transporte na mesma tradução segura da leitura.
  try { return await rpc(name,args); }
  catch { throw financePdvReadError(null); }
}
export function useFinancePdvReconciliationAccess() {
  const auth = useAuth(), modules = useCompanyModules(), scope = usePdvAuthorizedQueryScope();
  // Mesma trava do servidor (finance_pdv_reconciliation_context_v3): admin da empresa entra como Acesso Total; demais só com '*' ou chave nominal.
  const explicit = (permission:string) => hasPdvExplicitPermission(auth, permission);
  const allowed = scope.ready && auth.profile?.user_id === auth.user?.id && auth.profile?.is_active === true && !modules.isLoading && modules.hasModule('pdv')
    && ['screen:finance','fn:view_finance_totals','fn:operate_other_pdv_cash'].every(explicit);
  return {allowed,scopeKey:JSON.stringify([...scope.key,allowed])};
}
export function useFinancePdvReconciliation(input:{from:string;to:string;projection:FinancePdvProjection;offset?:number;enabled:boolean}) {
  const access = useFinancePdvReconciliationAccess();
  const identity=JSON.stringify([access.scopeKey,input.from,input.to,input.projection,input.enabled]);
  const current=useRef(identity);current.current=identity;
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const query = useQuery({queryKey:[...FINANCE_PDV_RECONCILIATION_ROOT,access.scopeKey,input.from,input.to,input.projection,input.offset ?? 0],enabled:access.allowed && input.enabled,
    queryFn:async ({signal}) => {
      const captured=identity;
      const response=await readFinancePdv('finance_get_pdv_reconciliation_v3',{p_projection:input.projection,p_from:input.from,p_to:input.to,p_limit:50,p_offset:input.offset ?? 0});
      if(signal.aborted || !mounted.current || current.current!==captured) throw new Error('Consulta encerrada.');
      if(response.error) throw financePdvReadError(response.error);
      const data=parseFinancePdvReconciliation(response.data);
      if(data.from!==input.from || data.to!==input.to || data.projection!==input.projection || data.offset!==(input.offset ?? 0)) throw new Error('O período da conferência mudou. Atualize e tente novamente.');
      return data;
    },retry:false,staleTime:0});
  async function exportEntries() {
    if(!access.allowed || !input.enabled) throw new Error('Seu perfil não permite exportar esta conferência.');
    const captured=identity;
    return loadFinancePdvExport(async offset=>{
      const response=await readFinancePdv('finance_get_pdv_reconciliation_v3',{p_projection:input.projection,p_from:input.from,p_to:input.to,p_limit:200,p_offset:offset});
      if(response.error) throw financePdvReadError(response.error);
      const page=parseFinancePdvReconciliation(response.data);
      if(page.projection!==input.projection || page.from!==input.from || page.to!==input.to || page.offset!==offset) throw new Error('A conferência mudou. Inicie a exportação novamente.');
      return page;
    },()=>mounted.current && current.current===captured);
  }
  return {...query,data:access.allowed && input.enabled ? query.data : undefined,allowed:access.allowed,exportEntries};
}
export function useFinancePdvReconciliationEntry(input:{eventKey:string|null;from:string;to:string;projection:FinancePdvProjection}) {
  const access = useFinancePdvReconciliationAccess();
  const identity=JSON.stringify([access.scopeKey,input]);
  const current=useRef(identity);current.current=identity;
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const query=useQuery({queryKey:[...FINANCE_PDV_RECONCILIATION_ROOT,'entry',access.scopeKey,input],enabled:access.allowed && !!input.eventKey,
    queryFn:async ({signal})=>{
      const captured=identity;
      const response=await readFinancePdv('finance_get_pdv_reconciliation_entry_v3',{p_event_key:input.eventKey,p_projection:input.projection,p_from:input.from,p_to:input.to});
      if(signal.aborted || !mounted.current || captured!==current.current) throw new Error('Consulta encerrada.');
      if(response.error) throw financePdvReadError(response.error);
      const data=parseFinancePdvEntry(response.data);
      if(data.eventKey!==input.eventKey || data.eventDate<input.from || data.eventDate>input.to) throw new Error('O movimento recebido não pertence a esta conferência.');
      return data;
    },retry:false,staleTime:0});
  return {...query,data:access.allowed && input.eventKey ? query.data : undefined};
}
