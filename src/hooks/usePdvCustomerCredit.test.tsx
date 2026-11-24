import {act, renderHook, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import type {ReactNode} from 'react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),single:vi.fn(),from:vi.fn(),scope:{ready:true,key:['company-A','user-A']}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mocks.rpc,from:mocks.from}}));
vi.mock('@/hooks/pdvReportCache',()=>({invalidatePdvReportCaches:vi.fn(),usePdvAuthorizedQueryScope:()=>mocks.scope}));
import {pdvCustomerCreditErrorMessage, usePdvCustomerCredit} from './usePdvSale';
function wrapper(){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return ({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;}
describe('dívida canônica do cliente no PDV',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.scope={ready:true,key:['company-A','user-A']};mocks.rpc.mockReturnValue({single:mocks.single});mocks.single.mockResolvedValue({data:{credit_limit:1000,debt:80},error:null});});
 it('mostra os80 reais do resumo, sem consultar ledger legado nem extrato detalhado',async()=>{const{result}=renderHook(()=>usePdvCustomerCredit('customer-A'),{wrapper:wrapper()});await waitFor(()=>expect(result.current.credit).toEqual({creditLimit:1000,debt:80}));expect(mocks.rpc).toHaveBeenCalledWith('pdv_get_customer_credit_summary_v3',{p_customer_id:'customer-A'});expect(mocks.from).not.toHaveBeenCalled();});
 it('preserva saldo assinado e limite não configurado',async()=>{mocks.single.mockResolvedValue({data:{credit_limit:null,debt:-20},error:null});const{result}=renderHook(()=>usePdvCustomerCredit('customer-A'),{wrapper:wrapper()});await waitFor(()=>expect(result.current.credit).toEqual({creditLimit:null,debt:-20}));});
 it('não inventa dívida zero quando a consulta falha',async()=>{mocks.single.mockResolvedValue({data:null,error:{code:'internal'}});const{result}=renderHook(()=>usePdvCustomerCredit('customer-A'),{wrapper:wrapper()});await waitFor(()=>expect(result.current.isError).toBe(true));expect(result.current.credit).toBeNull();});
 it('rejeita resposta incompleta sem assumir zero',async()=>{mocks.single.mockResolvedValue({data:{credit_limit:1000},error:null});const{result}=renderHook(()=>usePdvCustomerCredit('customer-A'),{wrapper:wrapper()});await waitFor(()=>expect(result.current.isError).toBe(true));expect(result.current.credit).toBeNull();});
 it('não consulta sem identidade confirmada ou sem cliente',()=>{mocks.scope={ready:false,key:['pending']};const{result,rerender}=renderHook(({id})=>usePdvCustomerCredit(id),{initialProps:{id:'customer-A' as string|null},wrapper:wrapper()});expect(result.current.credit).toBeNull();expect(mocks.rpc).not.toHaveBeenCalled();mocks.scope={ready:true,key:['company-A','user-A']};rerender({id:null});expect(mocks.rpc).not.toHaveBeenCalled();});
 it('descarta retorno atrasado de outro usuário e mascara o valor ao revogar acesso',async()=>{let resolve!:(v:unknown)=>void;mocks.single.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const{result,rerender}=renderHook(()=>usePdvCustomerCredit('customer-A'),{wrapper:wrapper()});await waitFor(()=>expect(mocks.single).toHaveBeenCalledOnce());mocks.scope={ready:true,key:['company-B','user-B']};rerender();await waitFor(()=>expect(result.current.credit?.debt).toBe(80));await act(async()=>{resolve({data:{credit_limit:9999,debt:999},error:null});});expect(result.current.credit?.debt).toBe(80);mocks.scope={ready:false,key:['company-B','user-B','revoked']};rerender();expect(result.current.credit).toBeNull();});
 it.each([
  ['pdv_counter_auth_required','Sua sessão expirou'],
  ['pdv_customer_credit_summary_forbidden','Seu perfil não permite'],
  ['pdv_customer_credit_summary_customer_not_found','Este cliente não está disponível'],
  ['pdv_counter_module_denied','Seu perfil não permite'],
  ['pdv_counter_screen_denied','Seu perfil não permite'],
  ['pdv_counter_company_required','Seu perfil não permite'],
  ['pdv_counter_subscription_denied','conferir a assinatura'],
  ['pdv_counter_profile_inactive','Seu acesso está desativado'],
 ])('orienta a família de domínio %s sem expor erro técnico',(code,hint)=>{
  const message=pdvCustomerCreditErrorMessage({details:'code='+code,message:'private_table internal SQLSTATE'});
  expect(message).toContain(hint);expect(message).not.toMatch(/private_table|SQLSTATE|pdv_/);
 });

});
