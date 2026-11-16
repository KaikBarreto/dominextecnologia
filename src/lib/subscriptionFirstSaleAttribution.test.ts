import { describe, expect, it, vi } from 'vitest';
import { recordFirstSaleAttribution } from '../../supabase/functions/_shared/subscription-first-sale-attribution';

describe('atribuição canônica da primeira venda', () => {
  it.each([{ recorded: true }, { recorded: false, eligible: false }, { recorded: false, already_recorded: true }])('usa somente empresa e pagamento persistido: %j', async data => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    await recordFirstSaleAttribution({ rpc }, 'fictitious-company', 'pay_fictitious');
    expect(rpc).toHaveBeenCalledWith('record_subscription_first_sale_attribution', {
      p_company_id: 'fictitious-company', p_asaas_payment_id: 'pay_fictitious',
    });
  });
  it.each([{ data: {}, error: null }, { data: null, error: { code: 'fictitious_database_error' } }])('resposta desconhecida exige conciliação: %j', async response => {
    await expect(recordFirstSaleAttribution({ rpc: vi.fn().mockResolvedValue(response) }, 'fictitious-company', 'pay_fictitious'))
      .rejects.toThrow('Não foi possível registrar a atribuição da primeira venda.');
  });
});
