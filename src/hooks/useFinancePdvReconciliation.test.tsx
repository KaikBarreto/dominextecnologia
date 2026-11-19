import {act,renderHook,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),auth:{} as Record<string,unknown>,scope:'A',module:true}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mocks.rpc}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>mocks.auth}));
vi.mock('@/hooks/useCompanyModules',()=>({useCompanyModules:()=>({isLoading:false,hasModule:()=>mocks.module})}));
vi.mock('@/hooks/pdvReportCache',()=>({usePdvAuthorizedQueryScope:()=>({ready:true,key:[mocks.scope]})}));
import {useFinancePdvReconciliation,useFinancePdvReconciliationAccess,useFinancePdvReconciliationEntry} from './useFinancePdvReconciliation';
const report=()=>({snapshot:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',scope:'company_shadow',coverage_status:'incomplete',company_result:null,company_cash_flow:null,projection:'dre_competence',from:'2026-11-14',to:'2026-11-15',total_count:0,limit:50,offset:0,has_more:false,entries:[],commercial:{revenue:65,cmv:30,expense:0,result:35,cash_flow:0},acquisitions:{amount:422,fully_paid_amount:22,count:2}});
const input={from:'2026-11-14',to:'2026-11-15',projection:'dre_competence' as const,enabled:true};
let client:QueryClient;
function wrapper({children}:{children:ReactNode}){return <QueryClientProvider client={client}>{children}</QueryClientProvider>;}
beforeEach(()=>{client=new QueryClient({defaultOptions:{queries:{retry:false}}});mocks.rpc.mockReset();mocks.scope='A';mocks.module=true;mocks.auth={user:{id:'user-A'},profile:{user_id:'user-A',company_id:'company-A',is_active:true},roles:['comercial'],permissions:['screen:finance','fn:view_finance_totals','fn:operate_other_pdv_cash'],hasPermissionRecord:true};});
describe('conferência financeira autorizada',()=>{
 it('consulta datas civis e nunca envia company/user ao servidor',async()=>{
  mocks.rpc.mockResolvedValue({data:report(),error:null});const {result}=renderHook(()=>useFinancePdvReconciliation(input),{wrapper});
  await waitFor(()=>expect(result.current.isSuccess).toBe(true));
  expect(mocks.rpc).toHaveBeenCalledWith('finance_get_pdv_reconciliation_v3',{p_projection:'dre_competence',p_from:'2026-11-14',p_to:'2026-11-15',p_limit:50,p_offset:0});
  expect(result.current.data?.companyResult).toBeNull();
 });
 it.each(['no-cross-cash','inactive','no-module','mismatched-profile'])('falha fechado para %s sem consulta',scenario=>{
  if(scenario==='no-cross-cash')mocks.auth.permissions=['screen:finance','fn:view_finance_totals'];
  if(scenario==='inactive')(mocks.auth.profile as Record<string,unknown>).is_active=false;
  if(scenario==='no-module')mocks.module=false;
  if(scenario==='mismatched-profile')(mocks.auth.profile as Record<string,unknown>).user_id='old-user';
  const {result}=renderHook(()=>useFinancePdvReconciliation(input),{wrapper});
  expect(result.current.allowed).toBe(false);expect(result.current.data).toBeUndefined();expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it('admin da empresa entra como Acesso Total, mesmo sem cadastro de permissões',()=>{
  mocks.auth.roles=['admin'];mocks.auth.permissions=[];mocks.auth.hasPermissionRecord=false;
  const {result}=renderHook(()=>useFinancePdvReconciliationAccess(),{wrapper});
  expect(result.current.allowed).toBe(true);
 });
 it.each([
  ['gestor sem a chave de outro caixa',{roles:['gestor'],permissions:['screen:finance','fn:view_finance_totals'],hasPermissionRecord:true}],
  ['gestor sem cadastro',{roles:['gestor'],permissions:[],hasPermissionRecord:false}],
  ['usuário sem cadastro',{roles:['comercial'],permissions:['*'],hasPermissionRecord:false}],
 ])('barra %s',(_label,patch)=>{
  Object.assign(mocks.auth,patch);
  const {result}=renderHook(()=>useFinancePdvReconciliationAccess(),{wrapper});
  expect(result.current.allowed).toBe(false);
 });
 it('scopeKey muda quando o acesso muda',()=>{
  const {result,rerender}=renderHook(()=>useFinancePdvReconciliationAccess(),{wrapper});const before=result.current.scopeKey;
  mocks.auth.permissions=['screen:finance'];rerender();expect(result.current.allowed).toBe(false);expect(result.current.scopeKey).not.toBe(before);
 });
 it('mascara dados já carregados no mesmo render de revogação',async()=>{
  mocks.rpc.mockResolvedValue({data:report(),error:null});const {result,rerender}=renderHook(()=>useFinancePdvReconciliation(input),{wrapper});
  await waitFor(()=>expect(result.current.data?.commercial.revenue).toBe(65));
  mocks.auth.permissions=['screen:finance'];rerender();expect(result.current.data).toBeUndefined();
 });
 it('descarta resposta atrasada ao trocar a identidade antes do retorno',async()=>{
  let resolve:(v:unknown)=>void=()=>{};mocks.rpc.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  const {result,rerender}=renderHook(()=>useFinancePdvReconciliation(input),{wrapper});await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledOnce());
  mocks.scope='B';mocks.auth.permissions=[];rerender();await act(async()=>{resolve({data:report(),error:null});});expect(result.current.data).toBeUndefined();
 });
 it('detalhe reaplica período e não aceita movimento de outra chave',async()=>{
  mocks.rpc.mockResolvedValue({data:{event_key:'other',event_date:'2026-11-15',source_role:'delivery_v2',source_id:'id',source_scope:'pdv_commercial',revenue:65,cmv:30,expense:0,cash_flow:0,purchase_amount:0,purchase_paid_amount:0},error:null});
  const {result}=renderHook(()=>useFinancePdvReconciliationEntry({...input,eventKey:'expected'}),{wrapper});
  await waitFor(()=>expect(result.current.isError).toBe(true));expect(result.current.data).toBeUndefined();expect(result.current.error?.message).toMatch(/não pertence/);
 });
 it('mapeia autorização sem mostrar códigos ou mensagens SQL',async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:{code:'42501',message:'private_function_table_sql'}});const {result}=renderHook(()=>useFinancePdvReconciliation(input),{wrapper});
  await waitFor(()=>expect(result.current.isError).toBe(true));expect(result.current.error?.message).toBe('Seu perfil não permite consultar esta conferência.');
 });
});
