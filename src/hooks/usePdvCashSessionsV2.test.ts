import { QueryClient } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  buildPdvCashEventV2Args,
  buildPdvCashEventV2AttemptPayload,
  buildPdvCloseCashV2Args,
  buildPdvOpenCashV2Args,
  buildPdvReopenCashV2Args,
  buildPdvReopenCashV2AttemptPayload,
  createPdvCashV2AttemptId,
  invalidatePdvCashV2Caches,
  createPdvCashV2AttemptRegistry,
  mapPdvCashV2Error,
  projectPdvCashCloseV2Result,
  projectPdvCashHistoryV2Page,
  projectPdvCashReopenV2Result,
  projectPdvCashV2SessionReport,
  projectPdvCashV2Session,
  projectPdvCashV2SessionList,
  projectPdvCashV2Snapshot,
  projectPdvCashV2Terminals,
  resolvePdvCashV2Attempt,
  selectPdvCashV2Gate,
  selectPdvCashV2Route,
} from './usePdvCashSessionsV2';

describe('W1A-04 caixa multissessão v2', () => {
  it('envia abertura com conta, terminal e chave idempotente explícitos', () => {
    expect(buildPdvOpenCashV2Args({
      terminalId: 'terminal-1',
      cashAccountId: 'account-1',
      openingAmount: 150.25,
      attemptId: 'attempt-open',
    })).toEqual({
      p_terminal_id: 'terminal-1',
      p_cash_account_id: 'account-1',
      p_opening_amount: 150.25,
      p_idempotency_key: 'attempt-open',
    });
  });

  it('mantém suprimento e sangria somente na custódia física', () => {
    expect(buildPdvCashEventV2Args({
      sessionId: 'session-1',
      cashAccountId: 'account-1',
      kind: 'withdrawal',
      amount: 40,
      description: null,
      notes: 'Retorno à tesouraria',
      attemptId: 'attempt-event',
    })).toEqual({
      p_session_id: 'session-1',
      p_cash_account_id: 'account-1',
      p_entry_kind: 'withdrawal',
      p_amount: 40,
      p_description: 'Dinheiro retirado do caixa',
      p_notes: 'Retorno à tesouraria',
      p_idempotency_key: 'attempt-event',
    });
  });

  it('fecha com o valor contado sem aceitar esperado calculado pelo navegador', () => {
    const args = buildPdvCloseCashV2Args({
      sessionId: 'session-1',
      cashAccountId: 'account-1',
      countedAmount: 192.1,
      notes: null,
      attemptId: 'attempt-close',
    });
    expect(args).toEqual({
      p_session_id: 'session-1',
      p_cash_account_id: 'account-1',
      p_counted_amount: 192.1,
      p_notes: null,
      p_idempotency_key: 'attempt-close',
    });
    expect(args).not.toHaveProperty('p_expected_amount');
    expect(args).not.toHaveProperty('p_difference');
  });

  it('reabre por RPC com motivo normalizado e chave idempotente explícita', () => {
    const payload = buildPdvReopenCashV2AttemptPayload({
      sourceSessionId: 'session-closed', cashAccountId: 'account-1', reason: '  fechamento antecipado  ',
    });
    expect(payload.reason).toBe('fechamento antecipado');
    expect(buildPdvReopenCashV2Args({ ...payload, attemptId: 'reopen-attempt' })).toEqual({
      p_source_session_id: 'session-closed',
      p_cash_account_id: 'account-1',
      p_reason: 'fechamento antecipado',
      p_idempotency_key: 'reopen-attempt',
    });
    expect(projectPdvCashReopenV2Result({
      ok: true, source_session_id: 'session-closed', session_id: 'session-new',
      terminal_id: 'terminal-1', operator_id: 'operator-1', opening_amount: 98,
      opened_at: '2026-11-07T20:00:00Z',
    })).toMatchObject({ sessionId: 'session-new', sourceSessionId: 'session-closed', openingAmount: 98 });
  });

  it('gera uma chave nova por tentativa e permite reutilizar a mesma no retry', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValueOnce('uuid-1').mockReturnValueOnce('uuid-2') });
    const first = createPdvCashV2AttemptId('event');
    const second = createPdvCashV2AttemptId('event');
    expect(first).toBe('pdv-cash-event-uuid-1');
    expect(second).toBe('pdv-cash-event-uuid-2');
    vi.unstubAllGlobals();
  });

  it('reutiliza a chave somente quando o payload canônico é idêntico', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValueOnce('uuid-a').mockReturnValueOnce('uuid-b') });
    const first = resolvePdvCashV2Attempt(null, 'close', { sessionId: 's1', countedAmount: 100, notes: null });
    const retry = resolvePdvCashV2Attempt(first, 'close', { notes: null, countedAmount: 100, sessionId: 's1' });
    const edited = resolvePdvCashV2Attempt(retry, 'close', { sessionId: 's1', countedAmount: 101, notes: null });
    expect(retry).toBe(first);
    expect(edited.key).toBe('pdv-cash-close-uuid-b');
    expect(edited.key).not.toBe(first.key);
    vi.unstubAllGlobals();
  });

  it('mantém a tentativa ambígua ao reabrir e separa payload editado ou conta trocada', () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn()
        .mockReturnValueOnce('lost-response')
        .mockReturnValueOnce('edited-payload')
        .mockReturnValueOnce('changed-account')
        .mockReturnValueOnce('after-success'),
    });
    const registry = createPdvCashV2AttemptRegistry();
    const original = buildPdvCashEventV2AttemptPayload({
      sessionId: 'session-1', cashAccountId: 'account-frozen', kind: 'supply', amount: 50, description: null, notes: null,
    });

    const firstSubmit = registry.resolve('event', 'session-1:supply', original);
    // Simula resposta perdida, fechamento do modal e reabertura: não houve complete.
    const reopenedRetry = registry.resolve('event', 'session-1:supply', original);
    const edited = registry.resolve('event', 'session-1:supply', { ...original, amount: 55 });
    const changedAccount = registry.resolve('event', 'session-1:supply', {
      ...original, cashAccountId: 'account-configured-later',
    });

    expect(reopenedRetry).toBe(firstSubmit);
    expect(edited.key).toBe('pdv-cash-event-edited-payload');
    expect(changedAccount.key).toBe('pdv-cash-event-changed-account');
    expect(changedAccount.key).not.toBe(firstSubmit.key);

    registry.complete('event', 'session-1:supply', original);
    expect(registry.resolve('event', 'session-1:supply', original).key)
      .toBe('pdv-cash-event-after-success');
    vi.unstubAllGlobals();
  });

  it('falha fechado em loading, erro e resposta desconhecida; false explícito mantém legado', () => {
    expect(selectPdvCashV2Gate({ loading: true, error: null })).toBe('loading');
    expect(selectPdvCashV2Gate({ loading: false, error: new Error('offline') })).toBe('error');
    expect(selectPdvCashV2Gate({ loading: false, error: null })).toBe('unknown');
    expect(selectPdvCashV2Gate({ loading: false, error: null, capability: { enabled: false } })).toBe('legacy');
    expect(selectPdvCashV2Gate({ loading: false, error: null, capability: { enabled: true } })).toBe('v2');
  });

  it('impede operador B de entrar no writer v1 quando operador A mantém sessão v2 aberta', () => {
    const companyHasOpenV2FromOperatorA = true;
    const operatorBRoute = selectPdvCashV2Route({
      capabilityGate: 'legacy',
      maintenanceLoading: false,
      maintenanceError: null,
      hasOpenV2Session: companyHasOpenV2FromOperatorA,
    });
    expect(operatorBRoute).toBe('maintenance');
    expect(selectPdvCashV2Route({
      capabilityGate: 'legacy',
      maintenanceLoading: false,
      maintenanceError: null,
      hasOpenV2Session: false,
    })).toBe('blocked');
    expect(selectPdvCashV2Route({
      capabilityGate: 'legacy',
      maintenanceLoading: false,
      maintenanceError: new Error('projeção indisponível'),
    })).toBe('blocked');
    expect(selectPdvCashV2Route({
      capabilityGate: 'legacy',
      maintenanceLoading: false,
      maintenanceError: null,
    })).toBe('blocked');
  });

  it('sonda presença v2 na empresa sem filtrar operador nem expor detalhes da sessão', () => {
    const source = readFileSync('src/hooks/usePdvCashSessionsV2.ts', 'utf8');
    const start = source.indexOf('export function usePdvCashV2MaintenancePresence');
    const end = source.indexOf('\nfunction record(', start);
    const presenceHook = source.slice(start, end);
    expect(presenceHook).toContain("rpc('pdv_has_open_cash_session_v2')");
    expect(presenceHook).not.toContain("from('pdv_cash_sessions')");
    expect(presenceHook).not.toContain('opened_by');
    expect(presenceHook).not.toContain('cash_account_id');
    expect(presenceHook).not.toContain(".select('id");
  });

  it('projeta lista segura com operador e paginação confirmados pelo servidor', () => {
    const projected = projectPdvCashV2SessionList({
      has_more: true,
      rows: [{
        id: 's1', company_id: 'c1', terminal_id: 't1', terminal_name: 'Balcão',
        opened_by: 'u1', operator_name: 'Maria', opened_at: '2026-11-07T08:00:00Z',
        opening_amount: 100, cash_account_id: 'a1', cash_account_name_snapshot: 'Cofre',
        contract_version: 2, status: 'aberta', closed_at: null, counted_amount: null,
        expected_amount: null, difference: null, notes: null,
      }],
    });
    expect(projected.rows).toHaveLength(1);
    expect(projected.operators).toEqual({ u1: 'Maria' });
    expect(projected.hasMore).toBe(true);
  });

  it('projeta a página do histórico e marca caixa que já tem continuação', () => {
    const page = projectPdvCashHistoryV2Page({
      terminals: [{ id: 't1', name: 'Balcão' }], has_more: false, can_manage_others: true,
      rows: [{
        id: 's1', company_id: 'c1', terminal_id: 't1', terminal_name: 'Balcão',
        opened_by: 'u1', operator_name: 'Maria', opened_at: '2026-11-07T08:00:00Z',
        opening_amount: 100, cash_account_id: 'a1', cash_account_name_snapshot: 'Cofre',
        contract_version: 2, status: 'fechada', closed_at: '2026-11-07T18:00:00Z',
        counted_amount: 98, expected_amount: 100, difference: -2, notes: null, was_reopened: true,
      }],
    });
    expect(page.rows[0].wasReopened).toBe(true);
    expect(page.canManageOthers).toBe(true);
  });

  it('projeta relatório individual com movimentos do caixa exato', () => {
    const report = projectPdvCashV2SessionReport({
      session_id: 's1', terminal_name: 'Balcão', operator_name: 'Maria', closed_by_name: 'Gestor',
      opened_at: '2026-11-07T08:00:00Z', closed_at: '2026-11-07T18:00:00Z', cash_account_name: 'Cofre',
      opening_amount: 100, expected_amount: 100, counted_amount: 98, difference: -2,
      cash_receipts: 10, cash_payments: 0, supplies: 0, withdrawals: 10, refunds: 0,
      final_position: 0, notes: null,
      entries: [{ id: 'e1', kind: 'opening', amount: 100, created_at: '2026-11-07T08:00:00Z', description: null, notes: null, payment_method: null }],
    });
    expect(report.sessionId).toBe('s1');
    expect(report.entries).toHaveLength(1);
    expect(report.difference).toBe(-2);
  });

  it('falha fechado em terminais ou lista de sessões com formato inesperado', () => {
    expect(() => projectPdvCashV2Terminals({ id: 't1' }))
      .toThrow('lista de terminais inválida');
    expect(() => projectPdvCashV2SessionList({ rows: [], has_more: 'sim' }))
      .toThrow('lista de caixas inválida');
  });

  it('mantém o estoque ligado ao caixa na projeção operacional', () => {
    expect(projectPdvCashV2Terminals([{ id: 't1', name: 'Caixa 01', stock_id: 'stock-1' }]))
      .toEqual([{ id: 't1', name: 'Caixa 01', stockId: 'stock-1' }]);
  });

  it('recusa números e datas inválidos sem transformar em zero ou data atual', () => {
    expect(() => projectPdvCashV2Snapshot({
      account_id: 'a1', account_name: 'Cofre', account_active: true,
      balance: 'não-numérico', custody: 0, available: 0,
      open_v2_sessions: 1, open_legacy_sessions: 0, reconciliation_required: false,
    })).toThrow('saldo do cofre inválido');
    expect(() => projectPdvCashV2Snapshot({
      account_id: 'a1', account_name: 'Cofre', account_active: true,
      balance: null, custody: 0, available: 0,
      open_v2_sessions: 1, open_legacy_sessions: 0, reconciliation_required: false,
    })).toThrow('saldo do cofre inválido');

    expect(() => projectPdvCashCloseV2Result({
      session_id: 's1', expected_amount: 100, counted_amount: 100,
      difference: 0, closing_return: 100, adjustment_kind: null,
      closed_at: 'data-quebrada',
    })).toThrow('data de fechamento inválida');

    expect(() => projectPdvCashV2Session({
      id: 's1', company_id: 'c1', terminal_id: 't1', opened_by: 'u1',
      opened_at: '2026-11-07T08:00:00Z', opening_amount: Number.NaN,
      cash_account_id: 'a1', cash_account_name_snapshot: 'Cofre', contract_version: 2,
      status: 'aberta', closed_at: null, counted_amount: null,
      expected_amount: null, difference: null, notes: null,
    })).toThrow('valor de abertura inválido');
  });

  it('mapeia recusas de domínio e não expõe SQL no fallback', () => {
    expect(mapPdvCashV2Error({ details: 'PDV_CASH_SESSION_FORBIDDEN' }).message)
      .toBe('Você não pode movimentar o caixa de outro operador.');
    expect(mapPdvCashV2Error({ details: 'PDV_CASH_FINANCE_EVENT_FORBIDDEN' }).message)
      .toBe('Você não tem permissão para lançar receitas ou despesas no caixa.');
    expect(mapPdvCashV2Error({
      message: 'duplicate key violates constraint segredo_interno',
      details: 'Key (company_id)=(tenant-real) already exists',
    }).message).toBe('Não foi possível concluir a operação do caixa. Tente novamente.');
  });

  it('invalida relatórios, materiais e Curva ABC após qualquer mutation v2', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    await invalidatePdvCashV2Caches(client);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv', 'reports-v2'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['material-purchase-report'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'abc-report'] });
  });
});
