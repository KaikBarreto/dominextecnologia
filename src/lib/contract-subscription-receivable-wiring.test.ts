import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('wiring da assinatura contratual no webhook', () => {
  const webhook = source('supabase/functions/tenant-asaas-webhook/index.ts');

  it('carrega a origem da assinatura e usa a RPC canônica somente para contratos', () => {
    expect(webhook).toContain('source_type, source_id');
    expect(webhook).toContain('sub?.source_type === "contract"');
    expect(webhook).toContain('ensure_contract_subscription_receivable');
    expect(webhook).toContain('create_tenant_charge_receivable');
  });
});

describe('wiring dos estados operacionais e fiscais', () => {
  const hook = source('src/hooks/useNfseAutoJobs.ts');
  const detail = source('src/pages/ContractDetail.tsx');
  const runner = source('supabase/functions/nfse-auto-runner/index.ts');
  const types = source('src/integrations/supabase/types.ts');

  it('consulta conflitos persistidos e não depende apenas da próxima data', () => {
    expect(hook).toContain(".in('finance_sync_status', ['conflict', 'error'])");
    expect(hook).toContain('hasFinanceSyncError');
  });

  it('só oferece criar parcela quando realmente não existe uma fonte', () => {
    const missingSourceBlock = detail.slice(
      detail.indexOf("nfseReadiness?.state === 'missing_source'"),
      detail.indexOf("nfseReadiness?.state === 'missing_source'") + 800,
    );
    const waitingBlock = detail.slice(
      detail.indexOf("nfseReadiness?.state === 'waiting_asaas_cycle'"),
      detail.indexOf("nfseReadiness?.state === 'sync_error'"),
    );

    expect(missingSourceBlock).toContain('openBillingSetup');
    expect(waitingBlock).not.toContain('openBillingSetup');
  });

  it('usa os sete status canônicos da NFS-e no runner', () => {
    [
      'PENDENTE',
      'CONFIRMACAO_PENDENTE',
      'PROCESSANDO',
      'AUTORIZADA',
      'FALHOU',
      'CANCELAMENTO_PENDENTE',
      'CANCELADA',
    ].forEach((status) => expect(runner).toContain(`NFSE_STATUS.${status}`));
    expect(runner).not.toContain('const STATUS_NOTA_VIVA = ["pending"');
  });

  it('mantém tipos gerados alinhados às novas colunas e RPC', () => {
    const tenantChargesTypes = types.slice(
      types.indexOf('tenant_charges: {'),
      types.indexOf('tenant_payment_accounts: {'),
    );
    const subscriptionPaymentsTypes = types.slice(
      types.indexOf('subscription_payments: {'),
      types.indexOf('tenant_charges: {'),
    );

    expect(tenantChargesTypes).toContain('finance_sync_status: string | null');
    expect(tenantChargesTypes).toContain('finance_sync_error: string | null');
    expect(tenantChargesTypes).toContain('finance_sync_checked_at: string | null');
    expect(subscriptionPaymentsTypes).not.toContain('finance_sync_status');
    expect(types).toContain('ensure_contract_subscription_receivable: {');
  });
});
