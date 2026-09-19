// Trava de FIAÇÃO da cobrança contínua.
//
// O teste puro (contract-billing.test.ts) prova que `resolveContractBillingRule`
// nunca produz a flag sem o passo e a âncora. Mas isso só protege quem PASSA
// por ele: nada impede alguém de escrever `finance_indeterminate: true` num
// objeto literal na tela e mandar direto pro Supabase, e aí quem recusa é o
// `CHECK contracts_finance_indeterminate_requires_rule` do banco, em produção,
// no meio de uma criação de contrato.
//
// Esta suíte lê o FONTE das duas telas e garante que o único caminho continua
// sendo o helper. Não é elegante, é barato e pega exatamente a regressão que o
// teste de unidade não alcança.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

const SCREENS = [
  'src/components/contracts/ContractFormDialog.tsx',
  'src/pages/ContractDetail.tsx',
];

describe('as telas só montam a regra pelo helper', () => {
  it.each(SCREENS)('%s não escreve finance_indeterminate à mão', (path) => {
    const src = read(path);
    // Qualquer `finance_indeterminate:` num literal seria um segundo caminho
    // de gravação, fora da garantia do helper.
    expect(src).not.toMatch(/finance_indeterminate\s*:/);
    // Leitura (`finance_indeterminate` sem dois-pontos) é permitida: a aba
    // Financeiro precisa saber se a cobrança contínua está ligada pra desenhar
    // o painel.
  });

  it.each(SCREENS)('%s importa resolveContractBillingRule', (path) => {
    expect(read(path)).toContain('resolveContractBillingRule');
  });

  it('a tela de criação e a aba Financeiro são as ÚNICAS a gravar a regra', () => {
    // Se aparecer uma terceira superfície, ela tem que entrar nesta lista de
    // propósito (e ganhar as mesmas travas), não passar despercebida.
    const hook = read('src/hooks/useContracts.ts');
    expect(hook).toContain('updateContractFinanceRule');
  });
});

describe('o hook carrega os TRÊS campos, não só a flag', () => {
  const hook = read('src/hooks/useContracts.ts');

  it('createContract manda os três no payload do insert', () => {
    for (const field of [
      'finance_indeterminate: input.finance_indeterminate',
      'finance_interval_months: input.finance_interval_months',
      'finance_anchor_date: input.finance_anchor_date',
    ]) {
      expect(hook).toContain(field);
    }
  });

  it('updateContractFinanceRule recebe a regra PRONTA, nunca campos soltos', () => {
    // O tipo do input é `{ contractId, rule: ContractFinanceRule }`: não dá pra
    // mandar a flag sem o resto sem mudar a assinatura.
    expect(hook).toContain('rule: ContractFinanceRule');
    expect(hook).toContain(".update(input.rule as any)");
  });
});
