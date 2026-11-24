import {act, renderHook, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {ReactNode} from 'react';
import {parseCorePricing, useAdminBusinessCorePricing, type CorePricingInput} from './useAdminBusinessCorePricing';

const mock = vi.hoisted(() => ({rpc:vi.fn(), userId:'master-a', profileId:'master-a', active:true, master:true}));
vi.mock('@/integrations/supabase/client', () => ({supabase:{rpc:mock.rpc}}));
vi.mock('@/contexts/AuthContext', () => ({useAuth:() => ({user:{id:mock.userId},profile:{user_id:mock.profileId,is_active:mock.active},hasRole:()=>mock.master})}));
const record = (core:'services'|'retail'='services') => ({business_core:core,base_price:197,configured:true,revision:1,plans:[],addon:{code:core==='services'?'pdv':'service_operations',name:'Outro kit',price:200,is_active:true}});
const input:CorePricingInput = {business_core:'services',base_price:197,expected_base_price:197,revision:1,plans:[],addon:{price:200,is_active:true,expected_price:200,expected_active:true}};
function setup() {
  const client = new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  const wrapper = ({children}:{children:ReactNode}) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return {client,wrapper};
}

describe('preços administrativos: identidade e catálogo compartilhado', () => {
  beforeEach(() => {Object.assign(mock,{userId:'master-a',profileId:'master-a',active:true,master:true});mock.rpc.mockReset().mockResolvedValue({data:record(),error:null});});
  it.each(['inactive','other-profile','non-master'])('bloqueia leitura e gravação para %s', async reason => {
    if(reason==='inactive')mock.active=false;
    if(reason==='other-profile')mock.profileId='master-b';
    if(reason==='non-master')mock.master=false;
    const {wrapper} = setup();const {result}=renderHook(()=>useAdminBusinessCorePricing('services'),{wrapper});
    expect(result.current.allowed).toBe(false);
    await act(async()=>{await expect(result.current.save.mutateAsync(input)).rejects.toThrow('Seu perfil não permite gerenciar os preços.');});
    expect(mock.rpc).not.toHaveBeenCalled();expect(result.current.data).toBeUndefined();
  });
  it('recusa gravar o outro kit pelo formulário atual', async () => {
    const {wrapper}=setup();const {result}=renderHook(()=>useAdminBusinessCorePricing('services'),{wrapper});
    await waitFor(()=>expect(result.current.data).toBeDefined());mock.rpc.mockClear();
    await act(async()=>{await expect(result.current.save.mutateAsync({...input,business_core:'retail'})).rejects.toThrow('Seu perfil não permite');});
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it('invalida também o outro kit após alterar o preço compartilhado', async () => {
    const {client,wrapper}=setup();const {result}=renderHook(()=>useAdminBusinessCorePricing('services'),{wrapper});
    await waitFor(()=>expect(result.current.data).toBeDefined());
    client.setQueryData(['admin-business-core-pricing','master-a','retail'],record('retail'));
    client.setQueryData(['public-subscription-catalog','retail'],{});
    await act(async()=>{await result.current.save.mutateAsync(input);});
    expect(client.getQueryState(['admin-business-core-pricing','master-a','retail'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['public-subscription-catalog','retail'])?.isInvalidated).toBe(true);
  });
  it('mascara imediatamente o cache quando o perfil perde acesso', async () => {
    const {wrapper}=setup();const {result,rerender}=renderHook(()=>useAdminBusinessCorePricing('services'),{wrapper});
    await waitFor(()=>expect(result.current.data).toBeDefined());mock.active=false;rerender();
    expect(result.current.data).toBeUndefined();expect(result.current.allowed).toBe(false);
  });
  it('traduz recusa do servidor sem expor nomes internos', async () => {
    const {wrapper}=setup();const {result}=renderHook(()=>useAdminBusinessCorePricing('services'),{wrapper});
    await waitFor(()=>expect(result.current.data).toBeDefined());mock.rpc.mockResolvedValue({data:null,error:{code:'40001',message:'subscription_core_pricing internal'}});
    await act(async()=>{await expect(result.current.save.mutateAsync(input)).rejects.toThrow('Os preços mudaram. Recarregue a tela antes de salvar.');});
  });
  it('não aceita resposta com o adicional ou configuração de outro kit', () => {
    expect(()=>parseCorePricing({...record(),addon:record('retail').addon},'services')).toThrow('conferir os preços');
    expect(()=>parseCorePricing({...record(),configured:'true'},'services')).toThrow('conferir os preços');
  });
});
