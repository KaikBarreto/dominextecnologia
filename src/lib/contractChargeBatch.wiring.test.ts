// Trava de FIAÇÃO do lote de cobrança.
//
// O módulo puro prova quem entra na fila. Ele não consegue provar COMO a tela
// executa a fila, e é aí que moram as duas decisões que não podem ser desfeitas
// se alguém mexer sem ler:
//
//   • a forma de pagamento vai em ABERTO (o cliente escolhe no link). Trocar
//     por 'BOLETO' num descuido emite 24 boletos irreversíveis;
//   • a execução é SEQUENCIAL. Um `Promise.all` aqui é rate limit no meio de
//     uma operação que cria dinheiro de verdade.
//
// Por isso este teste lê o fonte do laço e trava as duas. É barato e pega
// exatamente o que o teste de unidade não alcança.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SCREEN = 'src/pages/ContractDetail.tsx';
const src = readFileSync(resolve(process.cwd(), SCREEN), 'utf-8');

/** Só o corpo de `handleRunBatchCharge`, pra não pegar carona em outro trecho. */
function batchRunner(): string {
  const start = src.indexOf('const handleRunBatchCharge');
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf('const handleApplyLinksToAllParcels', start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('a rodada de cobrança em lote', () => {
  const runner = batchRunner();

  it('deixa a forma de pagamento em aberto: o cliente escolhe no link', () => {
    expect(runner).toContain("billing_type: 'UNDEFINED'");
    // Nenhuma forma fechada pelo gestor no lote.
    expect(runner).not.toMatch(/billing_type:\s*'(PIX|BOLETO|CREDIT_CARD)'/);
  });

  it('é sequencial: nada de disparar N chamadas ao gateway de uma vez', () => {
    expect(runner).not.toContain('Promise.all');
    expect(runner).not.toContain('Promise.allSettled');
    // `for ... of` + await dentro do laço é o formato esperado.
    expect(runner).toMatch(/for\s*\(const .* of queue\)/);
    expect(runner).toContain('await createTenantCharge.mutateAsync');
  });

  it('liga a cobrança à parcela, o que também ativa o dedupe da edge', () => {
    expect(runner).toContain("source_type: 'contract_installment'");
    expect(runner).toContain('source_id: t.id');
  });

  it('o valor vem da partição (valor da parcela), nunca de um campo da tela', () => {
    expect(runner).toContain('value: entry.value');
  });

  it('o vencimento passa por resolveChargeDueDate (a Asaas recusa data no passado)', () => {
    expect(runner).toContain('resolveChargeDueDate(t.due_date');
  });

  it('continua depois de uma falha, e só aborta por shouldAbortBatch', () => {
    expect(runner).toContain('shouldAbortBatch(consecutiveFailures)');
    // Sucesso zera o contador: falhas alternadas não podem abortar a rodada.
    expect(runner).toContain('consecutiveFailures = 0');
  });

  it('a mensagem de erro que vai pro resumo é a que veio da Asaas', () => {
    expect(runner).toContain('getErrorMessage(err)');
  });
});

describe('a tela não reimplementa a elegibilidade', () => {
  it('usa partitionInstallmentsForBatch, e não um filtro próprio de is_paid', () => {
    expect(src).toContain('partitionInstallmentsForBatch');
  });

  it('a confirmação conta a FILA, não a seleção', () => {
    // Prometer 12 e criar 9 é a divergência tela x gateway que o módulo existe
    // pra evitar: os dois números têm que sair da mesma partição.
    expect(src).toContain('batchChargePartition.queue.length');
    expect(src).toContain('batchChargePartition.total');
  });

  it('não puxa a listagem de tenant_charges da empresa inteira só pra ter o create', () => {
    expect(src).toContain('useTenantCharges({ enabled: false })');
  });
});
