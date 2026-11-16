import {renderHook,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';
import {projectGoodsReadiness,useGoodsFiscalReadiness} from './useGoodsFiscalReadiness';
const state=vi.hoisted(()=>({allowed:true,scope:'company-a',invoke:vi.fn()}));
vi.mock('./useGoodsFiscalAccess',()=>({useGoodsFiscalAccess:()=>({allowed:state.allowed,key:['goods-fiscal',state.scope]})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:(...args:unknown[])=>state.invoke(...args)}}}));
const ready={ok:true,ready:true,environment:'homologacao',issues:[]};
function wrapper(){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return ({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;}
describe('prontidão fiscal',()=>{
 beforeEach(()=>{state.allowed=true;state.scope='company-a';state.invoke.mockReset();state.invoke.mockResolvedValue({data:ready,error:null});});
 it('consulta somente leitura e mascara imediatamente ao perder permissão',async()=>{
  const {result,rerender}=renderHook(()=>useGoodsFiscalReadiness(65),{wrapper:wrapper()});
  await waitFor(()=>expect(result.current.data?.ready).toBe(true));
  expect(state.invoke).toHaveBeenCalledWith('fiscal-goods-document',{body:{action:'readiness',model:65}});
  state.allowed=false;rerender();expect(result.current.data).toBeUndefined();
 });
 it('trocar empresa não reutiliza prontidão nem resposta atrasada da anterior',async()=>{
  let finish!:(value:unknown)=>void;state.invoke.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const {result,rerender}=renderHook(()=>useGoodsFiscalReadiness(65),{wrapper:wrapper()});
  state.scope='company-b';state.invoke.mockResolvedValue({data:{...ready,ready:false,issues:[{code:'issuer_incomplete',message:'Complete a inscrição estadual.',section:'empresa'}]},error:null});rerender();
  await waitFor(()=>expect(result.current.data?.issues[0].message).toBe('Complete a inscrição estadual.'));
  finish({data:ready,error:null});await waitFor(()=>expect(result.current.data?.ready).toBe(false));
 });
 it('não consulta quando desabilitado e falha fechado em erro',async()=>{
  const {result,rerender}=renderHook(({enabled})=>useGoodsFiscalReadiness(65,enabled),{initialProps:{enabled:false},wrapper:wrapper()});
  expect(state.invoke).not.toHaveBeenCalled();state.invoke.mockResolvedValue({data:null,error:{message:'technical failure'}});rerender({enabled:true});await waitFor(()=>expect(result.current.isError).toBe(true));expect(result.current.data).toBeUndefined();
 });
 it.each([{}, {...ready,ready:'true'}, {...ready,issues:[{code:'x',message:'SQLSTATE private detail',section:'empresa'}]}])('rejeita payload inesperado sem expor detalhes',value=>{expect(()=>projectGoodsReadiness(value)).toThrow('Não foi possível conferir');});
});
