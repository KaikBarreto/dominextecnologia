import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({rpc:vi.fn(),auth:{user:{id:'user-1'},profile:{company_id:'company-1',user_id:'user-1',is_active:true},roles:['admin'],permissions:['screen:pdv','fn:manage_pdv_settings'],hasPermissionRecord:true,loading:false,profileLoading:false}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>state.auth}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:state.rpc}}));
vi.mock('@/hooks/usePdvCashSessionsV2',()=>({PDV_CASH_V2_QUERY_ROOT:['pdv-cash-v2']}));
import { usePdvTerminalSettings } from './usePdvTerminalSettings';
const stock={id:'stock-shop',name:'Loja',purpose:'pdv',is_default:false};
const payload={terminals:[],stocks:[stock],store_stock:{stock_id:'stock-shop',revision:3,can_manage:true,can_create_stock:true,stocks:[stock]}};
function setup(){const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});return {client,wrapper:({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>};}
beforeEach(()=>{vi.clearAllMocks();state.auth={user:{id:'user-1'},profile:{company_id:'company-1',user_id:'user-1',is_active:true},roles:['admin'],permissions:['screen:pdv','fn:manage_pdv_settings'],hasPermissionRecord:true,loading:false,profileLoading:false};state.rpc.mockResolvedValue({data:payload,error:null});});
describe('configuração de estoque e caixas por contexto autorizado',()=>{
  it.each(['company','user','permissions','loading'] as const)('mascara os dados ao trocar %s',async change=>{
    const {wrapper}=setup();const {result,rerender}=renderHook(()=>usePdvTerminalSettings(),{wrapper});await waitFor(()=>expect(result.current.storeStock?.stockId).toBe('stock-shop'));
    state.rpc.mockImplementation(()=>new Promise(()=>{}));
    if(change==='company')state.auth.profile.company_id='company-2';if(change==='user'){state.auth.user.id='user-2';state.auth.profile.user_id='user-2';}if(change==='permissions')state.auth.permissions=[];if(change==='loading')state.auth.loading=true;
    rerender();expect(result.current.storeStock).toBeNull();expect(result.current.terminals).toEqual([]);expect(result.current.stocks).toEqual([]);
  });
  it('recusa callback antigo depois de sair e voltar ao mesmo contexto',async()=>{
    const {wrapper}=setup();const {result,rerender}=renderHook(()=>usePdvTerminalSettings(),{wrapper});await waitFor(()=>expect(result.current.storeStock).not.toBeNull());const oldSave=result.current.saveStoreStock.mutateAsync;
    state.auth.profile.company_id='company-2';rerender();state.auth.profile.company_id='company-1';rerender();await waitFor(()=>expect(result.current.storeStock).not.toBeNull());
    await expect(oldSave({stockId:'stock-shop',expectedRevision:3})).rejects.toThrow('A conta ou a permissão mudou');expect(state.rpc.mock.calls.filter(([name])=>name==='pdv_set_store_stock_v1')).toHaveLength(0);
  });
  it('não anuncia sucesso nem aplica resposta de gravação depois da troca de conta',async()=>{
    let resolveWrite!:(value:unknown)=>void;state.rpc.mockImplementation((name:string)=>name==='pdv_set_store_stock_v1'?new Promise(resolve=>{resolveWrite=resolve;}):Promise.resolve({data:payload,error:null}));
    const {wrapper}=setup();const {result,rerender}=renderHook(()=>usePdvTerminalSettings(),{wrapper});await waitFor(()=>expect(result.current.storeStock).not.toBeNull());
    const operation=result.current.saveStoreStock.mutateAsync({stockId:'stock-shop',expectedRevision:3}).catch(error=>error);await waitFor(()=>expect(resolveWrite).toBeDefined());state.auth.profile.company_id='company-2';rerender();
    await act(async()=>{resolveWrite({data:payload.store_stock,error:null});});expect(await operation).toEqual(expect.objectContaining({message:'A conta ou a permissão mudou. Abra esta configuração novamente.'}));
  });
  it('envia herança ao servidor sem confundir is_default e invalida todos os catálogos dependentes',async()=>{
    state.rpc.mockImplementation((name:string)=>Promise.resolve({data:name==='pdv_save_cash_terminal_v3'?{id:'cash-2',name:'Caixa 02',stock_id:'stock-shop',stock_binding_mode:'store_default',is_active:true,sort_order:2}:payload,error:null}));
    const {wrapper,client}=setup();const invalidation=vi.spyOn(client,'invalidateQueries');const {result}=renderHook(()=>usePdvTerminalSettings(),{wrapper});await waitFor(()=>expect(result.current.storeStock).not.toBeNull());
    await act(async()=>{await result.current.save.mutateAsync({name:'Caixa 02',stockId:'stock-shop',isActive:true,sortOrder:2,stockBindingMode:'store_default'});});
    expect(state.rpc).toHaveBeenCalledWith('pdv_save_cash_terminal_v3',expect.objectContaining({p_stock_id:null,p_stock_binding_mode:'store_default'}));
    for(const root of ['pdv-terminal-settings-v2','pdv-preorders','pdv-direct-sale-v2','stocks','company-settings'])expect(invalidation).toHaveBeenCalledWith({queryKey:[root]});
  });
  it('exige capacidade confirmada e mantém o erro do servidor em linguagem de loja',async()=>{
    state.rpc.mockResolvedValueOnce({data:{...payload,store_stock:{...payload.store_stock,can_manage:false}},error:null});const {wrapper}=setup();const {result}=renderHook(()=>usePdvTerminalSettings(),{wrapper});await waitFor(()=>expect(result.current.storeStock).not.toBeNull());
    await expect(result.current.createStoreStock.mutateAsync({name:'Loja',expectedRevision:3})).rejects.toThrow('Seu perfil não tem permissão');expect(state.rpc).toHaveBeenCalledTimes(1);
  });
  it('mapeia recusa do servidor sem expor detalhes técnicos',async()=>{
    const {wrapper}=setup();const {result}=renderHook(()=>usePdvTerminalSettings(),{wrapper});await waitFor(()=>expect(result.current.storeStock).not.toBeNull());state.rpc.mockResolvedValueOnce({data:null,error:{code:'23514',details:'code=pdv_store_stock_busy',message:'internal table'}});
    await expect(result.current.saveStoreStock.mutateAsync({stockId:'stock-shop',expectedRevision:3})).rejects.toThrow('Conclua os atendimentos pendentes');
  });
  it('permite caixa específico autorizado com padrão oculto e nega herança antes da chamada',async()=>{
    const hidden={...payload,store_stock:{...payload.store_stock,stock_id:null,default_unavailable:true,can_create_stock:false}};
    state.rpc.mockResolvedValue({data:hidden,error:null});
    const {wrapper}=setup();const {result}=renderHook(()=>usePdvTerminalSettings(),{wrapper});await waitFor(()=>expect(result.current.storeStock?.defaultUnavailable).toBe(true));
    expect(result.current.storeStock?.stockId).toBeNull();
    await expect(result.current.save.mutateAsync({name:'Caixa B',stockId:'stock-shop',stockBindingMode:'store_default',isActive:true,sortOrder:1})).rejects.toThrow('Escolha o estoque da loja');
    expect(state.rpc.mock.calls.filter(([name])=>name==='pdv_save_cash_terminal_v3')).toHaveLength(0);
    state.rpc.mockImplementation((name:string)=>Promise.resolve({data:name==='pdv_save_cash_terminal_v3'?{id:'cash-b',name:'Caixa B',stock_id:'stock-shop',stock_binding_mode:'specific',is_active:true,sort_order:1}:hidden,error:null}));
    await act(async()=>{await result.current.save.mutateAsync({name:'Caixa B',stockId:'stock-shop',stockBindingMode:'specific',isActive:true,sortOrder:1});});
    expect(state.rpc).toHaveBeenCalledWith('pdv_save_cash_terminal_v3',expect.objectContaining({p_stock_id:'stock-shop',p_stock_binding_mode:'specific'}));
  });

});
