import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PDV_CASH_V2_QUERY_ROOT } from '@/hooks/usePdvCashSessionsV2';
import { usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';

type RpcResult = { data: unknown; error: { code?: string; details?: string; message?: string } | null };
type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;
export const PDV_TERMINAL_SETTINGS_ROOT = ['pdv-terminal-settings-v2'] as const;
export type PdvStockBindingMode = 'specific' | 'store_default';
export interface PdvTerminalSetting { id: string; name: string; stockId: string; stockBindingMode: PdvStockBindingMode; isActive: boolean; sortOrder: number }
export interface PdvTerminalStockOption { id: string; name: string; purpose: string; isDefault: boolean }
export interface PdvStoreStockSetting { defaultUnavailable?: boolean; stockId: string | null; revision: number; canManage: boolean; canCreateStock: boolean; stocks: PdvTerminalStockOption[] }
export interface PdvTerminalSettingsData { terminals: PdvTerminalSetting[]; stocks: PdvTerminalStockOption[]; storeStock: PdvStoreStockSetting }
export interface SavePdvTerminalInput { id?: string | null; name: string; stockId: string; stockBindingMode?: PdvStockBindingMode; isActive: boolean; sortOrder: number }
interface StoreStockInput { stockId: string; expectedRevision: number }
interface CreateStoreStockInput { name: string; expectedRevision: number }
interface Owner { key: string | null }
const CONTEXT_ERROR = 'A conta ou a permissão mudou. Abra esta configuração novamente.';
const LOAD_ERROR = 'Não foi possível carregar a configuração dos caixas. Atualize a página e tente novamente.';
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function requiredText(value: unknown, label: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`Não foi possível confirmar ${label}. Atualize a página e tente novamente.`); return value; }
function projectStock(raw: unknown): PdvTerminalStockOption { const stock=record(raw); return {id:requiredText(stock.id,'o local de estoque'),name:requiredText(stock.name,'o nome do local de estoque'),purpose:typeof stock.purpose==='string'?stock.purpose:'operacional',isDefault:stock.is_default===true}; }
function projectTerminal(value: unknown): PdvTerminalSetting {
  const row=record(value);
  if (row.stock_binding_mode !== 'specific' && row.stock_binding_mode !== 'store_default') throw new Error(LOAD_ERROR);
  return {id:requiredText(row.id,'o caixa salvo'),name:requiredText(row.name,'o nome do caixa'),stockId:requiredText(row.stock_id,'o estoque do caixa'),stockBindingMode:row.stock_binding_mode,isActive:row.is_active===true,sortOrder:typeof row.sort_order==='number'?row.sort_order:Number(row.sort_order??0)};
}
export function projectPdvStoreStock(value: unknown): PdvStoreStockSetting {
  const row=record(value);
  if (row.default_unavailable !== undefined && typeof row.default_unavailable !== 'boolean') throw new Error(LOAD_ERROR);
  const defaultUnavailable=row.default_unavailable===true;
  const stockId=defaultUnavailable?null:row.stock_id;
  if (!Array.isArray(row.stocks) || !(stockId===null || typeof stockId==='string' && stockId.trim()) || !Number.isSafeInteger(row.revision) || Number(row.revision)<0 || typeof row.can_manage!=='boolean' || typeof row.can_create_stock!=='boolean') throw new Error(LOAD_ERROR);
  const stocks=row.stocks.map(projectStock);
  if (stockId!==null && !stocks.some(stock=>stock.id===stockId)) throw new Error(LOAD_ERROR);
  return {stockId:stockId as string|null,defaultUnavailable,revision:row.revision as number,canManage:row.can_manage,canCreateStock:row.can_create_stock,stocks};
}
export function projectPdvTerminalSettings(value: unknown): PdvTerminalSettingsData {
  const payload=record(value);
  if (!Array.isArray(payload.terminals) || !Array.isArray(payload.stocks)) throw new Error(LOAD_ERROR);
  return {terminals:payload.terminals.map(projectTerminal),stocks:payload.stocks.map(projectStock),storeStock:projectPdvStoreStock(payload.store_stock)};
}
export function safePdvTerminalSettingsError(error: RpcResult['error']): Error {
  const detail=`${error?.details??''}`.toLowerCase();
  if (detail.includes('pdv_terminal_name_invalid') || detail.includes('pdv_store_stock_name_invalid')) return new Error('Informe um nome entre 2 e 80 caracteres.');
  if (detail.includes('pdv_terminal_stock_not_found') || detail.includes('pdv_store_stock_unavailable') || detail.includes('pdv_store_stock_invalid')) return new Error('O local de estoque selecionado não está mais disponível. Escolha outro local.');
  if (detail.includes('pdv_terminal_in_use') || detail.includes('pdv_store_stock_in_use') || detail.includes('pdv_store_stock_busy')) return new Error('Conclua os atendimentos pendentes e feche os caixas que usam o estoque da loja antes de alterá-lo.');
  if (detail.includes('pdv_store_stock_conflict') || error?.code==='40001') return new Error('O estoque da loja foi alterado em outro atendimento. Atualize a configuração antes de salvar.');
  if (detail.includes('pdv_store_stock_required')) return new Error('Escolha o estoque da loja na aba Operação antes de cadastrar o caixa.');
  if (detail.includes('pdv_module') || detail.includes('subscription')) return new Error('O PDV não está disponível para esta empresa. Confira o módulo e a assinatura.');
  if (detail.includes('pdv_counter_action_denied') || error?.code==='42501') return new Error('Seu perfil não tem permissão para alterar esta configuração da loja.');
  return new Error('Não foi possível salvar a configuração. Atualize a página e tente novamente.');
}
export function usePdvTerminalSettings(enabled=true) {
  const scope=usePdvAuthorizedQueryScope();
  const queryClient=useQueryClient();
  const scopeKey=scope.ready && enabled?JSON.stringify(scope.key):null;
  const ownerRef=useRef<Owner>({key:scopeKey});
  if (ownerRef.current.key!==scopeKey) ownerRef.current={key:scopeKey};
  const owner=ownerRef.current;
  const assertOwner=(candidate:Owner)=>{if (!candidate.key || ownerRef.current!==candidate) throw new Error(CONTEXT_ERROR);};
  const query=useQuery({queryKey:[...PDV_TERMINAL_SETTINGS_ROOT,...scope.key],enabled:Boolean(scopeKey),queryFn:async()=>{
    assertOwner(owner);const {data,error}=await rpc('pdv_list_cash_terminal_settings_v2');assertOwner(owner);
    if (error) throw safePdvTerminalSettingsError(error);return projectPdvTerminalSettings(data);
  }});
  const data=scopeKey && !query.isError?query.data:undefined;
  const live=useRef({owner,data});live.current={owner,data};
  const authorize=(candidate:Owner,create=false)=>{
    assertOwner(candidate);if (live.current.owner!==candidate || !live.current.data?.storeStock.canManage || (create && !live.current.data.storeStock.canCreateStock)) throw new Error('Seu perfil não tem permissão para alterar esta configuração da loja.');
  };
  const invalidate=async()=>{await Promise.all([
    PDV_TERMINAL_SETTINGS_ROOT,PDV_CASH_V2_QUERY_ROOT,['pdv-terminals'],['pdv-preorders'],['pdv-direct-sale-v2'],['pdv-counter'],['stocks'],['company-settings'],['inventory-stock-levels'],
  ].map(queryKey=>queryClient.invalidateQueries({queryKey})));};
  const terminalMutation=useMutation({mutationFn:async({input,owner:operationOwner}:{input:SavePdvTerminalInput;owner:Owner})=>{
    authorize(operationOwner);
    const mode=input.stockBindingMode??(input.id?'specific':'store_default');
    if (mode==='store_default' && (!live.current.data?.storeStock.stockId || live.current.data.storeStock.defaultUnavailable)) throw new Error('Escolha o estoque da loja na aba Operação antes de cadastrar o caixa.');
    const {data:result,error}=await rpc('pdv_save_cash_terminal_v3',{p_terminal_id:input.id??null,p_name:input.name,p_stock_id:mode==='store_default'?null:input.stockId,p_is_active:input.isActive,p_sort_order:input.sortOrder,p_stock_binding_mode:mode});
    assertOwner(operationOwner);if(error)throw safePdvTerminalSettingsError(error);return projectTerminal(result);
  },onSuccess:invalidate});
  const storeMutation=useMutation({mutationFn:async({input,owner:operationOwner}:{input:StoreStockInput|CreateStoreStockInput;owner:Owner})=>{
    const creating='name' in input;authorize(operationOwner,creating);
    if (!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0) throw new Error('Atualize a configuração antes de salvar.');
    const args=creating?{p_name:input.name,p_expected_revision:input.expectedRevision}:{p_stock_id:input.stockId,p_expected_revision:input.expectedRevision};
    const {data:result,error}=await rpc(creating?'pdv_create_store_stock_v1':'pdv_set_store_stock_v1',args);assertOwner(operationOwner);
    if(error)throw safePdvTerminalSettingsError(error);return projectPdvStoreStock(record(result).store_stock??result);
  },onSuccess:invalidate});
  return {
    scopeKey,terminals:data?.terminals??[],stocks:data?.stocks??[],storeStock:data?.storeStock??null,
    isLoading:enabled && (!scope.ready||query.isLoading),isError:Boolean(scopeKey&&query.isError),error:scopeKey?query.error??null:null,refetch:query.refetch,
    save:{mutateAsync:(input:SavePdvTerminalInput)=>terminalMutation.mutateAsync({input,owner}),isPending:terminalMutation.isPending&&terminalMutation.variables?.owner===owner},
    saveStoreStock:{mutateAsync:(input:StoreStockInput)=>storeMutation.mutateAsync({input,owner}),isPending:storeMutation.isPending&&storeMutation.variables?.owner===owner},
    createStoreStock:{mutateAsync:(input:CreateStoreStockInput)=>storeMutation.mutateAsync({input,owner}),isPending:storeMutation.isPending&&storeMutation.variables?.owner===owner},
  };
}
