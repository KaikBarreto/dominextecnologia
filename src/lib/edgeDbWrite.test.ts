import { describe, expect, it } from 'vitest';
// Importa o MÓDULO REAL da edge function (Deno), não uma cópia. O helper é TS puro
// (sem `Deno.*`, sem import remoto) exatamente pra poder ser testado aqui: o vitest
// só varre `src/**` (ver vitest.config.ts), então esta é a única forma de provar o
// comportamento do portão de escrita sem duplicar a lógica.
import {
  applyWrite,
  tryWrite,
  WriteWarnings,
  formatRecovery,
  type DbWriteError,
} from '../../supabase/functions/_shared/db-write';

/**
 * Dublê de query do supabase-js. O ponto do arquivo inteiro: o cliente NÃO lança
 * quando o banco recusa — ele RESOLVE com `{ error }`. Um `await` sem checagem
 * segue pelo caminho feliz.
 */
function query(error: DbWriteError | null) {
  return Promise.resolve({ error });
}

const dbRefusal: DbWriteError = {
  message: 'new row for relation "x" violates check constraint "x_status_check"',
  code: '23514',
};

describe('o motivo do helper existir: supabase-js não lança', () => {
  it('a query recusada pelo banco RESOLVE (não rejeita) — o try/catch nunca dispara', async () => {
    let caiuNoCatch = false;
    try {
      // Exatamente o padrão que criou o bug: await sem olhar `error`.
      await query(dbRefusal);
    } catch {
      caiuNoCatch = true;
    }
    expect(caiuNoCatch).toBe(false);
  });
});

describe('applyWrite — escrita fatal', () => {
  it('LANÇA quando o banco recusa (é o que vira resposta de erro na edge)', async () => {
    await expect(
      applyWrite('marcação do pagamento como CONFIRMED', query(dbRefusal), { logger: () => {} }),
    ).rejects.toThrow(/marcação do pagamento como CONFIRMED falhou/);
  });

  it('não lança quando a escrita passa', async () => {
    await expect(applyWrite('qualquer', query(null))).resolves.toBeUndefined();
  });

  it('loga a mensagem crua do banco e lança o erro traduzido quando há rethrow', async () => {
    class ValidationError extends Error {}
    const logs: string[] = [];
    await expect(
      applyWrite('agendamento do downgrade (companies.pending_*)', query(dbRefusal), {
        logger: (m) => logs.push(m),
        rethrow: () => new ValidationError('Não foi possível agendar a mudança de plano. Tente de novo.'),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    // A mensagem do Postgres fica no log (diagnóstico), não na resposta do usuário.
    expect(logs.join('\n')).toContain('x_status_check');
    expect(logs.join('\n')).toContain('23514');
  });
});

describe('tryWrite — escrita não-fatal, mas nunca silenciosa', () => {
  it('devolve false, registra aviso e loga a linha de recuperação', async () => {
    const warnings = new WriteWarnings();
    const logs: string[] = [];
    const ok = await tryWrite(
      'histórico de pagamento da empresa (company_payments)',
      query(dbRefusal),
      {
        warnings,
        logger: (m) => logs.push(m),
        recovery: { company_id: 'c-1', asaas_payment_id: 'pay_123', amount: 297.5 },
      },
    );
    expect(ok).toBe(false);
    expect(warnings.hasAny).toBe(true);
    expect(warnings.list[0]).toContain('histórico de pagamento da empresa');
    // A linha de log tem TUDO que permite refazer o lançamento à mão.
    const log = logs.join('\n');
    expect(log).toContain('RECUPERAR À MÃO');
    expect(log).toContain('company_id=c-1');
    expect(log).toContain('asaas_payment_id=pay_123');
    expect(log).toContain('amount=297.5');
  });

  it('devolve true e não avisa quando a escrita passa', async () => {
    const warnings = new WriteWarnings();
    const ok = await tryWrite('x', query(null), { warnings, recovery: { a: 1 } });
    expect(ok).toBe(true);
    expect(warnings.hasAny).toBe(false);
    expect(warnings.toBody()).toEqual({});
  });

  it('trata 23505 (já existe) como sucesso idempotente, sem aviso', async () => {
    // É o caso real do índice único parcial de admin_financial_transactions: o
    // webhook chegou primeiro e já lançou a receita. Não é falha.
    const warnings = new WriteWarnings();
    const logs: string[] = [];
    const ok = await tryWrite(
      'receita da assinatura (admin_financial_transactions)',
      query({ message: 'duplicate key value', code: '23505' }),
      { warnings, logger: (m) => logs.push(m), ignoreCodes: ['23505'], recovery: { company_id: 'c-1' } },
    );
    expect(ok).toBe(true);
    expect(warnings.hasAny).toBe(false);
    expect(logs).toHaveLength(0);
  });

  it('NÃO engole um erro diferente só porque 23505 está na lista', async () => {
    const warnings = new WriteWarnings();
    const ok = await tryWrite('receita', query(dbRefusal), {
      warnings,
      logger: () => {},
      ignoreCodes: ['23505'],
      recovery: { company_id: 'c-1' },
    });
    expect(ok).toBe(false);
    expect(warnings.hasAny).toBe(true);
  });
});

describe('WriteWarnings — sucesso com pendência não se passa por sucesso limpo', () => {
  it('só espalha `warnings` no corpo quando existe alguma pendência', () => {
    const limpo = new WriteWarnings();
    expect({ success: true, ...limpo.toBody() }).toEqual({ success: true });

    const comAviso = new WriteWarnings();
    comAviso.add('receita da assinatura: não foi gravada.');
    const body = { success: true, ...comAviso.toBody() };
    expect(body).toHaveProperty('warnings');
    expect((body as { warnings: string[] }).warnings).toHaveLength(1);
  });

  it('a lista é uma cópia (ninguém mexe no coletor por fora)', () => {
    const w = new WriteWarnings();
    w.add('a');
    w.list.push('b');
    expect(w.list).toEqual(['a']);
  });
});

describe('formatRecovery', () => {
  it('serializa numa linha grepável e não engole null/undefined', () => {
    expect(formatRecovery({ company_id: 'c-1', asaas_payment_id: null, amount: 0 }))
      .toBe('company_id=c-1 asaas_payment_id=- amount=0');
  });
});
