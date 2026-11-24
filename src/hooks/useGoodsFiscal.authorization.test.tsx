import { useState, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGoodsFiscalAccess } from './useGoodsFiscalAccess';
import { projectGoodsSnapshot, useGoodsFiscalSourceImport } from './useGoodsFiscal';
const state = vi.hoisted(() => ({ userId:'operator-a', profileUserId:'operator-a', companyId:'company-a', loading:false, profileLoading:false, permissions:['fn:emit_fiscal_goods'],roles:['comercial'],rpc:vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({useAuth:()=>({user:{id:state.userId},profile:{user_id:state.profileUserId,company_id:state.companyId},loading:state.loading,profileLoading:state.profileLoading,permissions:state.permissions,roles:state.roles})}));
vi.mock('@/integrations/supabase/client', () => ({supabase:{rpc:state.rpc}}));
function Wrapper({children}:{children:ReactNode}) { const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:false}}})); return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
describe('autorização e isolamento da ponte fiscal',()=>{
 beforeEach(()=>{vi.clearAllMocks();Object.assign(state,{userId:'operator-a',profileUserId:'operator-a',companyId:'company-a',loading:false,profileLoading:false,permissions:['fn:emit_fiscal_goods'],roles:['comercial']});state.rpc.mockResolvedValue({data:true,error:null});});
 it.each(['company','user','permission','loading'] as const)('mascara no mesmo render quando muda %s',async kind=>{
  const {result,rerender}=renderHook(()=>useGoodsFiscalAccess(),{wrapper:Wrapper});
  await waitFor(()=>expect(result.current.allowed).toBe(true));
  state.rpc.mockImplementation(()=>new Promise(()=>{}));
  if(kind==='company')state.companyId='company-b';
  if(kind==='user'){state.userId='operator-b';state.profileUserId='operator-b';}
  if(kind==='permission')state.permissions=[];
  if(kind==='loading')state.profileLoading=true;
  rerender();expect(result.current.allowed).toBe(false);
 });
 it('nega perfil de outro usuário e erro de verificação',async()=>{
  state.profileUserId='previous';const {result,rerender}=renderHook(()=>useGoodsFiscalAccess(),{wrapper:Wrapper});expect(result.current.allowed).toBe(false);expect(state.rpc).not.toHaveBeenCalled();
  state.profileUserId=state.userId;state.rpc.mockResolvedValue({data:true,error:{code:'permission'}});rerender();await waitFor(()=>expect(state.rpc).toHaveBeenCalled());expect(result.current.allowed).toBe(false);
 });
 it('descarta resposta de importação atrasada depois da troca de empresa',async()=>{
  let complete!:(v:unknown)=>void;
  state.rpc.mockImplementation((name:string)=>name==='fiscal_can_emit_goods'?Promise.resolve({data:true,error:null}):new Promise(resolve=>{complete=resolve;}));
  const {result,rerender}=renderHook(()=>({access:useGoodsFiscalAccess(),importer:useGoodsFiscalSourceImport()}),{wrapper:Wrapper});await waitFor(()=>expect(result.current.access.allowed).toBe(true));
  let promise!:Promise<unknown>;act(()=>{promise=result.current.importer.mutateAsync({sourceType:'pdv_sale',sourceId:'sale-a'});});
  await waitFor(()=>expect(complete).toBeDefined());state.companyId='company-b';rerender();
  await act(async()=>{complete({data:{sourceType:'pdv_sale',sourceId:'sale-a',items:[]},error:null});await expect(promise).rejects.toThrow('contexto de acesso mudou');});
 });
 it('projetor conserva troco e alíquota zero sem inventar classificação',()=>{
  const result=projectGoodsSnapshot({sourceType:'pdv_sale',sourceId:'sale',items:[{icmsRate:0,pisRate:0,cofinsRate:0,quantity:1,unitPrice:10,total:8,discount:2}],payments:[{method:'01',amount:10,change:2}],party:null});
  expect(result.items[0]).toMatchObject({icmsRate:0,pisRate:0,cofinsRate:0,ncm:null,discount:2});expect(result.payments).toEqual([{method:'01',amount:10,change:2}]);expect(result.party).toBeNull();
 });
});
