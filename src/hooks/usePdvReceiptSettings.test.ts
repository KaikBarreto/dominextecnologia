import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), scope: { key: ['scope', 'company-1', 'user-1'], ready: true } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('./pdvReportCache', () => ({ usePdvAuthorizedQueryScope: () => mocks.scope }));
import { projectPdvReceiptSettings, usePdvReceiptSettings } from './usePdvReceiptSettings';

describe('projectPdvReceiptSettings', () => {
  it('mantém somente a allowlist e compatibilidade segura com preferências antigas', () => {
    expect(projectPdvReceiptSettings({ default_format:'58mm',auto_print:true,copies:2,company_id:'privado',token:'privado' })).toEqual({
      defaultFormat:'58mm',autoPrint:true,copies:2,
      stages: {
        budget: { autoPrint:false,format:'58mm',copies:2 },
        sale: { autoPrint:true,format:'58mm',copies:2 },
        delivery: { autoPrint:false,format:'58mm',copies:2 },
      },
    });
  });
  it('usa defaults seguros para resposta inválida', () => {
    expect(projectPdvReceiptSettings({ default_format:'fiscal',auto_print:'sim',copies:99 })).toEqual({
      defaultFormat:'80mm',autoPrint:false,copies:1,
      stages: {
        budget: { autoPrint:false,format:'80mm',copies:1 },
        sale: { autoPrint:false,format:'80mm',copies:1 },
        delivery: { autoPrint:false,format:'80mm',copies:1 },
      },
    });
  });
  it('projeta somente os campos de cada etapa sem confundir false explícito com legado', () => {
    const stages = projectPdvReceiptSettings({ auto_print:true,stages: {
      budget: { auto_print:true, format:'a4', copies:3, company_id:'privado' },
      sale: { auto_print:false, format:'58mm', copies:2 },
      delivery: { auto_print:'true', format:'fiscal', copies:99 },
      unknown: { auto_print:true },
    } }).stages;
    expect(stages).toEqual({
      budget:{ autoPrint:true,format:'a4',copies:3 },
      sale:{ autoPrint:false,format:'58mm',copies:2 },
      delivery:{ autoPrint:false,format:'80mm',copies:1 },
    });
  });
  it('não usa propriedades herdadas do JSON de etapas', () => {
    const stages = Object.create({ budget:{ auto_print:true,format:'a4',copies:3 } });
    expect(projectPdvReceiptSettings({ stages }).stages.budget.autoPrint).toBe(false);
  });
});


describe('cache e gravação de comprovantes', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.scope = { key: ['scope', 'company-1', 'user-1'], ready: true };
  });
  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    return { client, ...renderHook(() => usePdvReceiptSettings(), { wrapper }) };
  }
  it('remove dados da empresa anterior assim que a identidade muda', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { default_format: 'a4' }, error: null })
      .mockResolvedValueOnce({ data: { default_format: '58mm' }, error: null });
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.data?.defaultFormat).toBe('a4'));
    mocks.scope = { key: ['scope', 'company-2', 'user-1'], ready: true };
    rerender();
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.defaultFormat).toBe('58mm'));
  });
  it('não consulta durante carregamento de autenticação', () => {
    mocks.scope.ready = false;
    const { result } = setup();
    expect(result.current.data).toBeUndefined();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('envia a allowlist v3 por etapa e atualiza o cache canônico', async () => {
    const settings = projectPdvReceiptSettings({ stages: { budget: { auto_print:true,format:'a4',copies:2 } } });
    mocks.rpc.mockResolvedValue({ data: { stages: { budget: { auto_print:true,format:'a4',copies:2 } } }, error:null });
    const { result, client } = setup();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await act(async () => { await result.current.save.mutateAsync(settings); });
    expect(mocks.rpc).toHaveBeenCalledWith('pdv_save_receipt_settings_v3', {
      p_default_format:'80mm',p_auto_print:false,p_copies:1,
      p_stages:{ budget:{auto_print:true,format:'a4',copies:2},sale:{auto_print:false,format:'80mm',copies:1},delivery:{auto_print:false,format:'80mm',copies:1} },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey:['pdv','receipt-settings'] });
  });
  it('mapeia falhas de permissão sem expor código interno', async () => {
    mocks.rpc.mockResolvedValue({ data:null,error:{ code:'42501',details:'code=pdv_receipt_manage_denied',message:'database secret details' } });
    const { result } = setup();
    await waitFor(() => expect(result.current.isError).toBe(true));
    await expect(result.current.save.mutateAsync(projectPdvReceiptSettings({}))).rejects.toThrow('Você não tem permissão para alterar as configurações do PDV.');
  });
});
