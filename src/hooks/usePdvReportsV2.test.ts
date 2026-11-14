import { readFileSync } from 'node:fs';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { invalidatePdvReportCaches, PdvReportContractError, pdvProjectionSourceLabel, projectPdvDocuments, projectPdvHistory, projectPdvPartialProjection } from './usePdvReportsV2';

const partialBase = {
  scope: 'pdv_partial', projection: 'dre_competence', from: '2026-11-01', to: '2026-11-07',
  total_count: 1, limit: 25, offset: 0, has_more: false,
  revenue: 100, cmv: null, expense: 0, result: null, cash_flow: 40,
  initial_balance: null, opening_availability: null, closing_availability: null,
  availability_status: 'not_calculated_for_partial_projection',
};

describe('projeções seguras dos relatórios PDV v2', () => {
  it('usa somente RPCs v3 e chaves segregadas pelo escopo autorizado', () => {
    const source = readFileSync('src/hooks/usePdvReportsV2.ts', 'utf8');
    expect(source).toContain("call('pdv_partial_projection_report_v3'");
    expect(source).toContain("call('pdv_global_event_history_v3'");
    expect(source).toContain("call('pdv_document_index_v3'");
    expect(source.match(/\.\.\.scope\.key/g)).toHaveLength(3);
    expect(source).not.toMatch(/call\('pdv_(partial_projection_report|global_event_history|document_index)_v2'/);
  });

  it('preserva CMV e resultado desconhecidos sem convertê-los em zero', () => {
    const report = projectPdvPartialProjection({
      ...partialBase,
      entries: [{ event_id: 'evento-1', event_date: '2026-11-07', source_type: 'delivery_v2', revenue: 100, cmv: null, expense: 0, cash_flow: 0 }],
    });
    expect(report.scope).toBe('pdv_partial');
    expect(report.cmv).toBeNull();
    expect(report.result).toBeNull();
    expect(report.entries[0].cmv).toBeNull();
  });

  it('mantém valor restrito como null no histórico', () => {
    const history = projectPdvHistory({
      scope: 'pdv_global_history', from: '2026-11-01', to: '2026-11-07', cash_session_id: null,
      total_count: 1, limit: 25, offset: 0, has_more: false,
      entries: [{ event_id: 'evento-2', event_type: 'delivery', event_date: '2026-11-07', cash_session_id: null, cash_session_label: 'Caixa não identificado', label: 'Retirada do pedido 42', amount: null, direction: null, deep_link: '/pdv/expedicao' }],
    });
    expect(history.entries[0].amount).toBeNull();
    expect(history.entries[0].eventType).toBe('delivery');
  });

  it('projeta apenas metadados mínimos do índice de comprovantes', () => {
    const result = projectPdvDocuments({
      scope: 'pdv_document_index',
      total_count: 1, limit: 25, offset: 0, has_more: false,
      documents: [{ id: 'doc-1', document_type: 'delivery_receipt', order_id: 'pedido-1', delivery_id: 'retirada-1', created_at: '2026-11-07T10:00:00Z', deep_link: '/pdv/expedicao' }],
    });
    expect(result.documents[0]).toEqual({
      id: 'doc-1', documentType: 'delivery_receipt', orderId: 'pedido-1', deliveryId: 'retirada-1',
      createdAt: '2026-11-07T10:00:00Z', deepLink: '/pdv/expedicao',
    });
  });

  it('rejeita scope, saldo parcial, número ou data inválidos sem criar zero', () => {
    expect(() => projectPdvPartialProjection({ ...partialBase, scope: 'global', entries: [] })).toThrow(PdvReportContractError);
    expect(() => projectPdvPartialProjection({ ...partialBase, initial_balance: 0, entries: [] })).toThrow(PdvReportContractError);
    expect(() => projectPdvPartialProjection({ ...partialBase, revenue: 'não-numérico', entries: [] })).toThrow(PdvReportContractError);
    expect(() => projectPdvPartialProjection({ ...partialBase, from: '2026-02-31', entries: [] })).toThrow(PdvReportContractError);
  });

  it.each([null, '', false, [], {}, '100'])('rejeita valor não numérico estrito: %j', (invalid) => {
    expect(() => projectPdvPartialProjection({
      ...partialBase,
      revenue: invalid,
      entries: [],
    })).toThrow(PdvReportContractError);
  });

  it.each([undefined, '', false, [], {}, '10'])('rejeita nullable inválido em vez de convertê-lo: %j', (invalid) => {
    expect(() => projectPdvPartialProjection({
      ...partialBase,
      cmv: invalid,
      entries: [],
    })).toThrow(PdvReportContractError);
  });

  it('mapeia origem interna por allowlist e nunca expõe código desconhecido', () => {
    expect(pdvProjectionSourceLabel('pdv_card_fee')).toBe('Taxa de cartão');
    expect(pdvProjectionSourceLabel('internal_new_code')).toBe('Outro evento do PDV');
  });

  it('preserva página com mais de 25 eventos e aceita página vazia válida', () => {
    const entries = Array.from({ length: 26 }, (_, index) => ({
      event_id: `evento-${index}`, event_type: 'delivery', event_date: '2026-11-07',
      cash_session_id: null, cash_session_label: 'Caixa não identificado', label: `Retirada ${index}`,
      amount: null, direction: null, deep_link: '/pdv/expedicao',
    }));
    expect(projectPdvHistory({ scope: 'pdv_global_history', total_count: 26, limit: 50, offset: 0, has_more: false, entries }).entries).toHaveLength(26);
    expect(projectPdvDocuments({ scope: 'pdv_document_index', total_count: 0, limit: 25, offset: 0, has_more: false, documents: [] }).documents).toEqual([]);
  });

  it('invalida recorte PDV, compras/vendas e Curva ABC juntos', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    await invalidatePdvReportCaches(client);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv', 'reports-v2'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['material-purchase-report'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'abc-report'] });
  });
});
