import { useState, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGoodsFiscalSettings } from './useGoodsFiscalSettings';
import { useGoodsFiscalAccess } from './useGoodsFiscalAccess';
import { projectGoodsSnapshot, useGoodsFiscalSourceImport } from './useGoodsFiscal';
const state = vi.hoisted(() => ({ userId:'operator-a', profileUserId:'operator-a', companyId:'company-a', loading:false, profileLoading:false, profileActive:true as boolean | null | undefined, permissions:['fn:emit_fiscal_goods'],roles:['comercial'],rpc:vi.fn(),from:vi.fn(),invoke:vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({useAuth:()=>({user:{id:state.userId},profile:{user_id:state.profileUserId,company_id:state.companyId,is_active:state.profileActive},loading:state.loading,profileLoading:state.profileLoading,permissions:state.permissions,roles:state.roles})}));
vi.mock('@/integrations/supabase/client', () => ({supabase:{rpc:state.rpc,from:state.from,functions:{invoke:state.invoke}}}));
function Wrapper({children}:{children:ReactNode}) { const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:false}}})); return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
describe('autorização e isolamento da ponte fiscal',()=>{
 beforeEach(()=>{vi.clearAllMocks();Object.assign(state,{userId:'operator-a',profileUserId:'operator-a',companyId:'company-a',loading:false,profileLoading:false,profileActive:true,permissions:['fn:emit_fiscal_goods'],roles:['comercial']});state.rpc.mockResolvedValue({data:true,error:null});state.from.mockImplementation((table:string)=>({select:()=>({eq:()=>({maybeSingle:()=>Promise.resolve({data:{enabled:true,series:table==='company_nfce_settings'?41:22,uf:'RJ'},error:null})})})}));state.invoke.mockResolvedValue({data:{ok:true},error:null});});
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
 it.each([false, null, undefined])('mascara perfil inativo/desconhecido (%s) no mesmo render sem nova consulta',async active=>{
  const {result,rerender}=renderHook(()=>useGoodsFiscalAccess(),{wrapper:Wrapper});
  await waitFor(()=>expect(result.current.allowed).toBe(true));
  const previousScope=result.current.scopeId;const calls=state.rpc.mock.calls.length;
  state.profileActive=active;rerender();
  expect(result.current.allowed).toBe(false);expect(result.current.scopeId).not.toBe(previousScope);expect(state.rpc).toHaveBeenCalledTimes(calls);
 });
 it.each([false, null, undefined])('não consulta inicialmente sem perfil ativo confirmado (%s)',active=>{
  state.profileActive=active;const {result}=renderHook(()=>useGoodsFiscalAccess(),{wrapper:Wrapper});
  expect(result.current.allowed).toBe(false);expect(state.rpc).not.toHaveBeenCalled();
 });
 it('revalida ao retornar ao perfil A ativo e descarta autorização anterior',async()=>{
  const {result,rerender}=renderHook(()=>useGoodsFiscalAccess(),{wrapper:Wrapper});
  await waitFor(()=>expect(result.current.allowed).toBe(true));
  const scopeA=result.current.scopeId;state.profileActive=false;rerender();expect(result.current.allowed).toBe(false);
  let complete!:(value:unknown)=>void;state.rpc.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
  state.profileActive=true;rerender();expect(result.current.scopeId).toBe(scopeA);expect(result.current.allowed).toBe(false);
  await waitFor(()=>expect(complete).toBeDefined());await act(async()=>{complete({data:true,error:null});});
  await waitFor(()=>expect(result.current.allowed).toBe(true));
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
 it.each([false,null,undefined])('settings não consulta sem perfil ativo (%s)',active=>{
  state.profileActive=active;const {result}=renderHook(()=>useGoodsFiscalSettings(),{wrapper:Wrapper});
  expect(result.current.settings.nfce.enabled).toBe(false);expect(state.from).not.toHaveBeenCalled();
 });
 it('settings mascara cache imediatamente após inativação e revalida retorno A',async()=>{
  const {result,rerender}=renderHook(()=>useGoodsFiscalSettings(),{wrapper:Wrapper});
  await waitFor(()=>expect(result.current.settings.nfce.series).toBe(41));const calls=state.from.mock.calls.length;
  state.profileActive=false;rerender();expect(result.current.settings.nfce.enabled).toBe(false);expect(result.current.settings.nfce.series).toBe(1);expect(state.from).toHaveBeenCalledTimes(calls);
  const complete:Array<(value:unknown)=>void>=[];state.from.mockImplementation(()=>({select:()=>({eq:()=>({maybeSingle:()=>new Promise(resolve=>complete.push(resolve))})})}));
  state.profileActive=true;rerender();expect(result.current.settings.nfce.enabled).toBe(false);expect(result.current.isLoading).toBe(true);
  await waitFor(()=>expect(complete).toHaveLength(2));await act(async()=>{complete.forEach(resolve=>resolve({data:{enabled:true,series:77},error:null}));});
  await waitFor(()=>expect(result.current.settings.nfce.series).toBe(77));
 });
 it('settings permite administrador ativo sem ação de emissão',async()=>{
  state.roles=['admin'];state.permissions=[];const {result}=renderHook(()=>useGoodsFiscalSettings(),{wrapper:Wrapper});
  await waitFor(()=>expect(result.current.settings.nfce.series).toBe(41));expect(state.rpc).not.toHaveBeenCalled();
 });
 it('settings não envia save com perfil inativo e rejeita resposta de contexto antigo',async()=>{
  const {result,rerender}=renderHook(()=>useGoodsFiscalSettings(),{wrapper:Wrapper});await waitFor(()=>expect(result.current.settings.nfce.enabled).toBe(true));
  const form=result.current.settings;state.profileActive=false;rerender();await act(async()=>{await expect(result.current.save(form)).rejects.toThrow('contexto fiscal não está disponível');});expect(state.invoke).not.toHaveBeenCalled();
  state.profileActive=true;rerender();await waitFor(()=>expect(result.current.settings.nfce.enabled).toBe(true));
  let complete!:(value:unknown)=>void;state.invoke.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
  let pending!:Promise<unknown>;act(()=>{pending=result.current.save(form);});await waitFor(()=>expect(complete).toBeDefined());state.profileActive=false;rerender();
  await act(async()=>{complete({data:{ok:true},error:null});await expect(pending).rejects.toThrow('contexto fiscal mudou');});
 });
 it('settings descarta retorno quando o contexto visual desmontou',async()=>{
  const {result,unmount}=renderHook(()=>useGoodsFiscalSettings(),{wrapper:Wrapper});await waitFor(()=>expect(result.current.settings.nfce.enabled).toBe(true));
  let complete!:(value:unknown)=>void;state.invoke.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
  let pending!:Promise<unknown>;act(()=>{pending=result.current.save(result.current.settings);});await waitFor(()=>expect(complete).toBeDefined());unmount();
  await act(async()=>{complete({data:{ok:true},error:null});await expect(pending).rejects.toThrow('contexto fiscal mudou');});
 });
 it('projetor conserva troco e alíquota zero sem inventar classificação',()=>{
  const result=projectGoodsSnapshot({sourceType:'pdv_sale',sourceId:'sale',items:[{icmsRate:0,pisRate:0,cofinsRate:0,quantity:1,unitPrice:10,total:8,discount:2}],payments:[{method:'01',amount:10,change:2}],party:null});
  expect(result.items[0]).toMatchObject({icmsRate:0,pisRate:0,cofinsRate:0,ncm:null,discount:2});expect(result.payments).toEqual([{method:'01',amount:10,change:2,deferred:false}]);expect(result.party).toBeNull();
 });
 it('importação atrasada não retorna depois que a tela desmonta',async()=>{
  let complete!:(v:unknown)=>void;state.rpc.mockImplementation((name:string)=>name==='fiscal_can_emit_goods'?Promise.resolve({data:true,error:null}):new Promise(resolve=>{complete=resolve;}));
  const {result,unmount}=renderHook(()=>({access:useGoodsFiscalAccess(),importer:useGoodsFiscalSourceImport()}),{wrapper:Wrapper});await waitFor(()=>expect(result.current.access.allowed).toBe(true));
  let pending!:Promise<unknown>;act(()=>{pending=result.current.importer.mutateAsync({sourceType:'pdv_sale',sourceId:'sale-a'});});await waitFor(()=>expect(complete).toBeDefined());unmount();
  await act(async()=>{complete({data:{sourceType:'pdv_sale',sourceId:'sale-a',items:[]},error:null});await expect(pending).rejects.toThrow('contexto de acesso mudou');});
 });

});
