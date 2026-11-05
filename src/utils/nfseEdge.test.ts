import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke } },
}));

import { invokeNfse } from './nfseEdge';

function httpError(status: number, body: Record<string, unknown>) {
  return {
    message: 'Functions returned an error',
    context: new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  };
}

describe('invokeNfse', () => {
  beforeEach(() => invoke.mockReset());

  it('preserva indisponibilidade temporária sem fingir que a emissão não foi ativada', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(503, {
        error: 'cobertura_indisponivel',
        message: 'Não conseguimos confirmar a liberação do município agora.',
      }),
    });

    const result = await invokeNfse('nfse-check-coverage', { ibge: '5205802' });

    expect(result.unconfigured).toBe(false);
    expect(result.unavailable).toBe(true);
    expect(result.errorCode).toBe('cobertura_indisponivel');
    expect(result.message).toBe('Não conseguimos confirmar a liberação do município agora.');
  });

  it('mantém mensagem de ativação apenas para nfse_unconfigured', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(503, {
        error: 'nfse_unconfigured',
        message: 'detalhe técnico que não deve aparecer',
      }),
    });

    const result = await invokeNfse('nfse-emit', {});

    expect(result.unconfigured).toBe(true);
    expect(result.unavailable).toBe(true);
    expect(result.message).toBe('Emissão de notas ainda não ativada. Tente novamente em breve.');
  });
});
