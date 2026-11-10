import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20261106143000_assinatura_contrato_fonte_unica_e_nfse_status.sql',
);
const sql = readFileSync(migrationPath, 'utf8');

const normalizedSql = sql.replace(/\s+/g, ' ');

function section(start: string, end: string): string {
  const startAt = sql.indexOf(start);
  const endAt = sql.indexOf(end, startAt + start.length);
  expect(startAt, `início ausente: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endAt, `fim ausente: ${end}`).toBeGreaterThan(startAt);
  return sql.slice(startAt, endAt);
}

describe('migration da assinatura contratual como fonte financeira única', () => {
  it('mantém a RPC privilegiada restrita ao service_role', () => {
    const rpc = section(
      'CREATE OR REPLACE FUNCTION public.ensure_contract_subscription_receivable(',
      'COMMENT ON FUNCTION public.ensure_contract_subscription_receivable',
    );

    expect(rpc).toContain('SECURITY DEFINER');
    expect(rpc).toContain("SET search_path TO 'public'");
    expect(normalizedSql).toContain(
      'REVOKE ALL ON FUNCTION public.ensure_contract_subscription_receivable(uuid, uuid) FROM PUBLIC, anon, authenticated;',
    );
    expect(normalizedSql).toContain(
      'GRANT EXECUTE ON FUNCTION public.ensure_contract_subscription_receivable(uuid, uuid) TO service_role;',
    );
  });

  it('deriva cobrança, assinatura e contrato dentro do mesmo tenant sob locks', () => {
    const rpc = section(
      'CREATE OR REPLACE FUNCTION public.ensure_contract_subscription_receivable(',
      'REVOKE ALL ON FUNCTION public.ensure_contract_subscription_receivable',
    );

    expect(rpc).toMatch(/tenant_charges tc[\s\S]*tc\.company_id = p_company_id[\s\S]*FOR UPDATE/);
    expect(rpc).toMatch(/tenant_subscriptions s[\s\S]*s\.company_id = p_company_id[\s\S]*s\.source_type = 'contract'/);
    expect(rpc).toMatch(/contracts c[\s\S]*c\.id = v_subscription\.source_id[\s\S]*c\.company_id = p_company_id/);
    expect(rpc).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('ft.company_id IS DISTINCT FROM tc.company_id');
    expect(sql).toContain('Vínculo cobrança/contrato inválido para esta empresa.');
  });

  it('garante idempotência física e reaproveita somente parcela aberta idêntica', () => {
    expect(normalizedSql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_transactions_one_mother_per_charge ON public.financial_transactions (tenant_charge_id)',
    );
    expect(sql).toMatch(/GROUP BY ft\.tenant_charge_id\s+HAVING count\(\*\) > 1/);

    const rpc = section(
      'CREATE OR REPLACE FUNCTION public.ensure_contract_subscription_receivable(',
      'REVOKE ALL ON FUNCTION public.ensure_contract_subscription_receivable',
    );
    expect(rpc).toContain("ft.is_paid IS DISTINCT FROM true");
    expect(rpc).toContain('COALESCE(ft.amount_received, 0) = 0');
    expect(rpc).toContain('ft.cancelled_at IS NULL');
    expect(rpc).toContain('ft.tenant_charge_id IS NULL');
    expect(rpc).toContain('round(ft.amount, 2) = round(v_charge.value, 2)');
    expect(rpc).toContain('ft.customer_id IS NOT DISTINCT FROM v_customer_id');
    expect(rpc).toContain("'status', 'linked_existing'");
    expect(rpc).toContain('WHEN unique_violation THEN');
  });

  it('não rouba histórico e deixa divergência operacional visível', () => {
    const rpc = section(
      'CREATE OR REPLACE FUNCTION public.ensure_contract_subscription_receivable(',
      'REVOKE ALL ON FUNCTION public.ensure_contract_subscription_receivable',
    );
    const deletedGuard = rpc.indexOf("upper(COALESCE(v_charge.status, '')) = 'DELETED'");
    const existingMirror = rpc.indexOf('SELECT ft.* INTO v_existing');

    expect(deletedGuard).toBeGreaterThanOrEqual(0);
    expect(existingMirror).toBeGreaterThan(deletedGuard);
    expect(rpc).toContain('COALESCE(contract_id, v_contract.id)');
    expect(rpc).toContain('COALESCE(transaction_date, due_date, v_due_date)');
    expect(rpc).toContain("finance_sync_status = 'conflict'");
    expect(rpc).toContain('finance_sync_error = v_message');
    expect(rpc).toContain("'status', 'conflict'");
    expect(rpc).toContain('COALESCE(v_charge.post_to_finance, true) = false');
    expect(rpc).toContain('v_auto_post = false');
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.financial_transactions/i);
  });

  it('delega criação e autocura legadas ao caminho contratual canônico', () => {
    const createPatch = section('DO $patch_create_receivable$', '$patch_create_receivable$;');
    expect(sql).toContain("'public.create_tenant_charge_receivable(uuid,uuid,uuid,numeric,date,text,uuid,text,uuid,uuid)'::regprocedure");
    expect(sql).toContain("'public.rebuild_tenant_charge_receivable(uuid,text)'::regprocedure");
    expect(sql.match(/ensure_contract_subscription_receivable/g)?.length).toBeGreaterThanOrEqual(5);
    expect(sql).toContain('molde de create_tenant_charge_receivable mudou');
    expect(sql).toContain('molde de rebuild_tenant_charge_receivable mudou');
    expect(createPatch).toContain("RAISE WARNING ''[create_tenant_charge_receivable] %''");
    expect(createPatch).toContain('RETURN NULL;');
    expect(createPatch).not.toContain("USING ERRCODE = ''23001''");
  });

  it('faz backfill sem recriar DELETED e baixa cobranças pagas pelo caminho canônico', () => {
    const backfill = section('DO $backfill_contract_subscriptions$', '$backfill_contract_subscriptions$;');

    expect(backfill).toContain("s.source_type = 'contract'");
    expect(backfill).toContain("('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH')");
    expect(backfill).toContain('public.apply_tenant_charge_payment(');
    expect(backfill).toContain('public.ensure_contract_subscription_receivable(');
    expect(sql).toContain("'status', 'skipped_deleted'");
    expect(sql).toContain('ON CONFLICT (company_id, financial_transaction_id) DO NOTHING');
  });

  it('impede duas recorrências vivas e preserva o histórico financeiro', () => {
    expect(sql).toContain('CREATE TRIGGER trg_contract_subscription_is_canonical');
    expect(sql).toContain('CREATE TRIGGER trg_block_internal_recurrence_with_live_subscription');
    expect(sql).toMatch(/SET finance_indeterminate = false[\s\S]*s\.source_type = 'contract'/);
    expect(sql).toContain("s.status <> 'cancelled'");
    expect(sql).toContain('Não ative outra recorrência no Financeiro');
  });
});

describe('status vivos canônicos da NFS-e automática', () => {
  it('bloqueia exatamente os sete status vivos e nunca o pending legado', () => {
    const helper = section(
      'CREATE OR REPLACE FUNCTION public.nfse_auto_emission_blocks',
      'REVOKE ALL ON FUNCTION public.nfse_auto_emission_blocks',
    );
    const expectedStatuses = [
      'pendente',
      'confirmacao_pendente',
      'processando',
      'autorizada',
      'falhou',
      'cancelamento_pendente',
      'cancelada',
    ];

    expectedStatuses.forEach((status) => expect(helper).toContain(`'${status}'`));
    expect(helper).not.toMatch(/'pending'/);
    expect(helper).not.toMatch(/'rascunho'|'rejeitada'/);
  });

  it('substitui e audita os três produtores sem deixar regressão de pending', () => {
    const patch = section('DO $patch_nfse_live_status$', '$patch_nfse_live_status$;');
    const audit = section('DO $audit$', '$audit$;');

    [
      'public.trg_nfse_auto_enqueue_on_payment()',
      'public.nfse_auto_enqueue_due_jobs()',
      'public.nfse_auto_enfileirar(uuid,text)',
    ].forEach((signature) => {
      expect(patch).toContain(`'${signature}'`);
      expect(audit).toContain(`'${signature}'`);
    });
    expect(patch).toContain('public.nfse_auto_emission_blocks(e.status)');
    expect(audit).toContain("position('''pending''' IN v_src) > 0");
    expect(audit).toContain("position('nfse_auto_emission_blocks' IN v_src) = 0");
  });
});
