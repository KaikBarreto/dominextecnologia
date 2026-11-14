import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20261108018000_pdv_cash_writer_explicit_gate.sql',
  'utf8',
);

describe('gate explícito dos writers do Caixa', () => {
  it('não usa cirurgia textual em runtime', () => {
    expect(sql).not.toContain('pg_get_functiondef');
    expect(sql).not.toContain('replace(v_definition');
    expect(sql).toContain('pdv_record_cash_event_explicit_core_018_v2');
    expect(sql).toContain('pdv_reopen_cash_session_explicit_core_018_v2');
  });

  it('valida o ator antes de chamar cada core', () => {
    expect(sql).toMatch(/pdv_record_cash_event_v2[\s\S]*pdv_assert_cash_session_actor_v3[\s\S]*pdv_record_cash_event_explicit_core_018_v2/);
    expect(sql).toMatch(/pdv_close_cash_session_v2[\s\S]*pdv_assert_cash_session_actor_v3[\s\S]*pdv_close_cash_session_explicit_core_018_v2/);
    expect(sql).toMatch(/pdv_reopen_cash_session_v2[\s\S]*fn:reopen_pdv_cash[\s\S]*pdv_assert_cash_session_actor_v3[\s\S]*pdv_reopen_cash_session_explicit_core_018_v2/);
    expect(sql).toContain('pdv_can_operate_other_cash_v2');
  });

  it('revalida o contexto de acesso e preserva replay concluído', () => {
    expect(sql).toContain('FROM public.pdv_cash_v2_context()');
    expect(sql).toContain('FROM public.pdv_cash_history_context_v2()');
    expect(sql).toContain('pdv_completed_cash_operation_replay_v3');
    expect(sql).toMatch(/pdv_record_cash_event_v2[\s\S]*pdv_completed_cash_operation_replay_v3[\s\S]*pdv_assert_cash_session_actor_v3\(p_session_id,p_cash_account_id,true\)/);
    expect(sql).toMatch(/pdv_close_cash_session_v2[\s\S]*pdv_completed_cash_operation_replay_v3[\s\S]*pdv_assert_cash_session_actor_v3\(p_session_id,p_cash_account_id,true\)/);
  });

  it('substitui as leituras legadas por projeções nominais', () => {
    expect(sql).toContain('pdv_list_cash_sessions_wrapper_015_v2');
    expect(sql).toContain('pdv_cash_session_projection_v3');
    expect(sql).toContain("'can_manage_others',v_can_other");
    expect(sql).not.toContain('fn:edit_pdv_sales');
  });

  it('associa venda liquidada e limita os filtros de caixa ao próprio operador', () => {
    expect(sql).toContain('payment.settlement_transaction_id=e.financial_transaction_id');
    expect(sql).toContain('payment.financial_transaction_id=e.financial_transaction_id');
    expect(sql).toMatch(/FROM public\.pdv_terminals t[\s\S]*v_can_other OR EXISTS\([\s\S]*own_session\.opened_by=v_context\.user_id/);
  });
});
