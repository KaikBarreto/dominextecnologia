import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { tables, errors, calls, access } = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  errors: {} as Record<string, boolean>,
  calls: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
  access: { allowed: true },
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const call = { table, filters: [] as Array<[string, unknown]> };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'order', 'limit', 'or']) builder[method] = () => builder;
    for (const method of ['eq', 'in']) {
      builder[method] = (column: string, value: unknown) => {
        call.filters.push([column, value]);
        return builder;
      };
    }
    builder.then = (resolve: (value: unknown) => unknown) =>
      resolve(errors[table] ? { data: null, error: { message: 'falhou' } } : { data: tables[table] ?? [], error: null });
    return builder;
  };
  return { supabase: { from, storage: { from: vi.fn() }, functions: { invoke: vi.fn() }, rpc: vi.fn() } };
});
vi.mock('@/hooks/useUserCompany', () => ({ useUserCompany: () => ({ companyId: 'company-1' }) }));
vi.mock('@/hooks/useGoodsFiscalAccess', () => ({
  GOODS_FISCAL_ROOT: ['goods-fiscal'],
  useGoodsFiscalAccess: () => ({
    allowed: access.allowed,
    companyId: 'company-1',
    key: ['goods-fiscal', 'identity'],
    scopeId: 'scope',
    isLoading: false,
    userId: 'user-1',
  }),
}));
vi.mock('@/hooks/useGoodsFiscal', () => ({ useGoodsFiscalDocumentAction: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/utils/nfseEdge', () => ({ invokeNfse: vi.fn() }));
vi.mock('@/utils/tenantStorage', () => ({ tenantFileOptions: vi.fn() }));

import {
  contractPmocToDocument,
  fetchAutomaticDocuments,
  latestPmocDocuments,
  shortcutToDocument,
  useCustomerDocuments,
} from '@/hooks/useCustomerDocuments';
import { mapGoodsNote, mapNfseNote } from '@/hooks/useCustomerFiscalNotes';

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  for (const key of Object.keys(errors)) delete errors[key];
  calls.length = 0;
  access.allowed = true;
});

describe('mapeamento das notas automáticas', () => {
  it('soma os itens da NF-e e marca cancelada', () => {
    const note = mapGoodsNote({
      id: 'n1', status: 'cancelled', number: 10, series: 1, authorized_at: '2026-11-02T10:00:00Z',
      created_at: '2026-11-01T10:00:00Z', danfe_pdf_path: 'a.pdf', processed_xml_path: 'a.xml',
      draft_payload: { items: [{ total: 100.5 }, { total: 49.5 }] },
    }, 'nfe');
    expect(note).toMatchObject({ model: 'nfe', number: '10', series: 1, total: 150, cancelled: true, hasPdf: true, hasXml: true });
    expect(note.date).toBe('2026-11-02T10:00:00Z');
  });

  it('NFC-e usa o PDF da NFC-e', () => {
    const note = mapGoodsNote({ id: 'n2', status: 'authorized', number: 3, created_at: '2026-11-01', danfce_pdf_path: 'c.pdf', draft_payload: {} }, 'nfce');
    expect(note).toMatchObject({ model: 'nfce', hasPdf: true, hasXml: false, cancelled: false });
  });

  it('NFS-e sem confirmação oficial não entra', () => {
    expect(mapNfseNote({ id: 's1', status: 'autorizada', status_fiscal_confirmado: false })).toBeNull();
    const note = mapNfseNote({
      id: 's2', status: 'cancelada', status_fiscal_confirmado: true, status_fiscal_confirmado_em: '2026-10-02T00:00:00Z', numero_nfse: '77', valor_servico: 300, xml_url: 'https://x/y.xml', created_at: '2026-10-01',
    });
    expect(note).toMatchObject({ model: 'nfse', number: '77', total: 300, cancelled: true, hasXml: true });
  });

  it('mantém só a versão mais recente de cada tipo de documento PMOC por contrato', () => {
    const latest = latestPmocDocuments([
      { id: 'a1', contract_id: 'c1', doc_type: 'dossie_pmoc', version: 1 },
      { id: 'a2', contract_id: 'c1', doc_type: 'dossie_pmoc', version: 3 },
      { id: 'a3', contract_id: 'c1', doc_type: 'termo_rt', version: 1 },
      { id: 'b1', contract_id: 'c2', doc_type: 'dossie_pmoc', version: 1 },
    ]);
    expect(latest.map((row) => row.id).sort()).toEqual(['a2', 'a3', 'b1']);
  });

  it('documento PMOC do contrato guarda o id para a edge de download', () => {
    const doc = contractPmocToDocument(
      { id: 'p1', contract_id: 'c1', doc_type: 'certificado', version: 2, pdf_storage_path: 'x.pdf', generated_at: '2026-11-01T00:00:00Z', valid_until: '2027-01-10' },
      'Contrato A', 'cust', 'company-1',
    );
    expect(doc).toMatchObject({ source: 'contract_pmoc', title: 'Certificado de conformidade', pmoc_document_id: 'p1', contract_id: 'c1' });
    expect(doc.description).toContain('válido até 10/01/2027');
  });

  it('atalhos usam as rotas existentes', () => {
    expect(shortcutToDocument('quote', { id: 'q', quote_number: 5, token: 'tok', created_at: '2026-11-01' }, 'c', 'co').shortcut)
      .toEqual({ kind: 'quote', path: '/proposta/tok?preview=1', newTab: true });
    expect(shortcutToDocument('service_order', { id: 'os-1', order_number: 12, created_at: '2026-11-01' }, 'c', 'co').shortcut?.path)
      .toBe('/ordens-servico?os=os-1');
    expect(shortcutToDocument('contract', { id: 'k1', name: 'Contrato X', created_at: '2026-11-01' }, 'c', 'co').shortcut?.path)
      .toBe('/contratos/k1');
  });
});

describe('fetchAutomaticDocuments', () => {
  it('mescla as fontes, filtra por empresa e cliente e limita os atalhos', async () => {
    tables.nfse_emissions = [
      { id: 's1', status: 'autorizada', status_fiscal_confirmado: true, status_fiscal_confirmado_em: '2026-11-03T00:00:00Z', numero_nfse: '1', created_at: '2026-11-03' },
    ];
    tables.contracts = [{ id: 'k1', name: 'Contrato A', created_at: '2026-10-01' }];
    tables.contract_attachments = [{ id: 'att1', contract_id: 'k1', display_name: 'Laudo.pdf', storage_path: 'p', created_at: '2026-10-05' }];
    tables.pmoc_documents = [
      { id: 'pd1', contract_id: 'k1', doc_type: 'dossie_pmoc', version: 1, pdf_storage_path: 'a', generated_at: '2026-10-06' },
      { id: 'pd2', contract_id: 'k1', doc_type: 'dossie_pmoc', version: 2, pdf_storage_path: 'b', generated_at: '2026-10-07' },
    ];
    tables.quotes = [{ id: 'q1', quote_number: 9, token: 't', created_at: '2026-10-02' }];
    tables.service_orders = [{ id: 'os1', order_number: 4, created_at: '2026-10-03' }];

    const result = await fetchAutomaticDocuments('cust-1', 'company-1');
    expect(result.failed).toEqual([]);
    const sources = result.documents.map((doc) => doc.source).sort();
    expect(sources).toEqual(['contract_attachment', 'contract_pmoc', 'fiscal', 'shortcut', 'shortcut', 'shortcut']);
    expect(result.documents.find((doc) => doc.source === 'contract_pmoc')?.pmoc_document_id).toBe('pd2');

    for (const table of ['nfse_emissions', 'contracts', 'quotes', 'service_orders']) {
      const call = calls.find((entry) => entry.table === table)!;
      expect(call.filters).toContainEqual(['company_id', 'company-1']);
      expect(call.filters).toContainEqual(['customer_id', 'cust-1']);
    }
    const attachmentsCall = calls.find((entry) => entry.table === 'contract_attachments')!;
    expect(attachmentsCall.filters).toContainEqual(['contract_id', ['k1']]);
  });

  it('uma fonte que falha não derruba as demais e é informada', async () => {
    errors.quotes = true;
    tables.service_orders = [{ id: 'os1', order_number: 4, created_at: '2026-10-03' }];
    const result = await fetchAutomaticDocuments('cust-1', 'company-1');
    expect(result.failed).toEqual(['orçamentos']);
    expect(result.documents).toHaveLength(1);
  });

  it('sem contratos não consulta anexos nem documentos PMOC', async () => {
    await fetchAutomaticDocuments('cust-1', 'company-1');
    expect(calls.some((entry) => entry.table === 'contract_attachments')).toBe(false);
    expect(calls.some((entry) => entry.table === 'pmoc_documents')).toBe(false);
  });
});

describe('useCustomerDocuments', () => {
  const seed = () => {
    tables.customer_documents = [{
      id: 'm1', company_id: 'company-1', customer_id: 'cust-1', document_kind: 'invoice', document_type: 'nfe_product',
      title: 'Nota externa', created_at: '2026-09-01T00:00:00Z',
    }];
    tables.nfe_documents = [{ id: 'n1', status: 'authorized', number: 8, authorized_at: '2026-11-05T10:00:00Z', created_at: '2026-11-05T10:00:00Z', danfe_pdf_path: 'p', draft_payload: { items: [{ total: 10 }] } }];
    tables.nfce_documents = [];
  };

  it('com permissão fiscal traz NF-e junto dos uploads', async () => {
    seed();
    const { result } = renderHook(() => useCustomerDocuments('cust-1'), { wrapper });
    await waitFor(() => expect(result.current.list.data).toBeDefined());
    await waitFor(() => expect(result.current.list.data!.some((doc) => doc.fiscal?.model === 'nfe')).toBe(true));
    const docs = result.current.list.data!;
    expect(docs.map((doc) => doc.id)).toEqual(['nfe:n1', 'm1']);
    const nfeCall = calls.find((entry) => entry.table === 'nfe_documents')!;
    expect(nfeCall.filters).toContainEqual(['environment', 1]);
    expect(nfeCall.filters).toContainEqual(['status', ['authorized', 'cancelled']]);
    expect(nfeCall.filters).toContainEqual(['customer_id', 'cust-1']);
  });

  it('NFC-e de venda do PDV entra pelo cliente do pedido, sem duplicar', async () => {
    seed();
    tables.pdv_orders = [{ id: 'o1' }];
    // O mock devolve a mesma linha para a busca por cliente e para a busca por pedido.
    tables.nfce_documents = [{ id: 'c1', status: 'authorized', number: 31, authorized_at: '2026-11-06T10:00:00Z', created_at: '2026-11-06T10:00:00Z', danfce_pdf_path: 'p', draft_payload: { items: [{ total: 25 }] } }];
    const { result } = renderHook(() => useCustomerDocuments('cust-1'), { wrapper });
    await waitFor(() => expect(result.current.list.data?.some((doc) => doc.fiscal?.model === 'nfce')).toBe(true));
    expect(result.current.list.data!.filter((doc) => doc.fiscal?.model === 'nfce')).toHaveLength(1);
    const orders = calls.find((entry) => entry.table === 'pdv_orders')!;
    expect(orders.filters).toContainEqual(['company_id', 'company-1']);
    expect(orders.filters).toContainEqual(['customer_id', 'cust-1']);
    const byOrder = calls.filter((entry) => entry.table === 'nfce_documents').find((entry) => entry.filters.some(([column]) => column === 'order_id'))!;
    expect(byOrder.filters).toContainEqual(['order_id', ['o1']]);
    expect(byOrder.filters).toContainEqual(['company_id', 'company-1']);
    expect(byOrder.filters).toContainEqual(['environment', 1]);
  });

  it('sem permissão fiscal não consulta nem mostra NF-e e NFC-e, sem erro', async () => {
    seed();
    access.allowed = false;
    const { result } = renderHook(() => useCustomerDocuments('cust-1'), { wrapper });
    await waitFor(() => expect(result.current.list.data).toBeDefined());
    expect(result.current.list.data!.map((doc) => doc.id)).toEqual(['m1']);
    expect(result.current.list.isError).toBe(false);
    expect(calls.some((entry) => entry.table === 'nfe_documents' || entry.table === 'nfce_documents' || entry.table === 'pdv_orders')).toBe(false);
  });
});
