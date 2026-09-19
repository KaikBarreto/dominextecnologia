import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Importa o MÓDULO REAL da edge (Deno). Ele é TS puro — sem `Deno.*`, sem
// import remoto — exatamente pra poder ser testado aqui: o vitest só varre
// `src/**` (ver vitest.config.ts). Mesmo arranjo do `edgeDbWrite.test.ts`.
import {
  computeLtvRollback,
  isRetryableWebhookError,
  RetryableWebhookError,
  retryableRethrow,
  splitRenewalCompanyUpdate,
  webhookResponseFor,
} from '../../supabase/functions/_shared/asaas-webhook-renewal';
import { findUncheckedWrites } from './edgeWriteAudit';

const webhookSource = readFileSync(
  resolve(process.cwd(), 'supabase/functions/asaas-webhook/index.ts'),
  'utf8',
);

/** Trecho do fonte em volta de um rótulo de escrita, pra afirmar sobre o portão usado. */
function aoRedor(label: string, antes = 400, depois = 1800): string {
  const i = webhookSource.indexOf(label);
  expect(i, `rótulo ausente no asaas-webhook: ${label}`).toBeGreaterThan(-1);
  return webhookSource.slice(Math.max(0, i - antes), i + depois);
}

describe('re-entrega: o 200 que apagava o evento', () => {
  // ⚠️ A INVERSÃO. Nas edges chamadas por usuário, lançar = mostrar erro na
  // tela. Aqui quem chama é a Asaas, que RE-ENTREGA enquanto não receber 2xx.
  // O webhook respondia 200 em TODO caminho — inclusive quando a escrita de
  // dinheiro falhava. Como o supabase-js não lança, a falha nem chegava no
  // catch: a Asaas recebia 200 e o evento morria ali.
  it('erro de re-entrega vira 500 com retry (a Asaas traz o evento de volta)', () => {
    const plan = webhookResponseFor(new RetryableWebhookError('renovação não gravada'));
    expect(plan.status).toBe(500);
    expect(plan.body).toEqual({ received: false, retry: true });
  });

  it('erro comum continua 200 (payload ruim re-entregue só trava a fila da conta)', () => {
    const plan = webhookResponseFor(new TypeError('payment.id undefined'));
    expect(plan.status).toBe(200);
    expect(plan.body.received).toBe(true);
  });

  it('a mensagem interna NUNCA vai no corpo — o endpoint é público', () => {
    const segredo = 'relation "companies" violates policy sensível';
    for (const erro of [new Error(segredo), new RetryableWebhookError(segredo)]) {
      expect(JSON.stringify(webhookResponseFor(erro).body)).not.toContain(segredo);
    }
  });

  it('reconhece a marca `retryable` sem depender de instanceof (erro cruza bundle)', () => {
    expect(isRetryableWebhookError({ retryable: true })).toBe(true);
    expect(isRetryableWebhookError(new Error('qualquer'))).toBe(false);
    expect(isRetryableWebhookError(null)).toBe(false);
    expect(isRetryableWebhookError('texto')).toBe(false);
  });

  it('retryableRethrow leva código e mensagem do banco pro log, e marca re-entrega', () => {
    const erro = retryableRethrow('marcação de inadimplência')({
      message: 'deadlock detected',
      code: '40P01',
    });
    expect(isRetryableWebhookError(erro)).toBe(true);
    expect(erro.message).toContain('40P01');
    expect(erro.message).toContain('deadlock detected');
  });
});

describe('o UPDATE da renovação, partido em VITAL x EXTRAS', () => {
  const vencimento = '2026-10-19T03:00:00.000Z';

  // O PORQUÊ: o Postgres recusa o UPDATE INTEIRO quando UM campo viola uma
  // constraint, e o supabase-js devolve isso calado. O objeto único carregava
  // `subscription_status: 'active'` (gate de acesso de quem acabou de pagar)
  // junto com plano/ciclo/limite vindos dos `pending_*`. Um `pending_*` fora do
  // CHECK deixaria o cliente pagante bloqueado, em silêncio.
  it('o VITAL tem só as duas colunas de acesso, em TODO cenário', () => {
    const cenarios = [
      {},
      { pending_subscription_value: 297 },
      { custom_price: 100, custom_price_months: 3, custom_price_payments_made: 1 },
      {
        pending_plan_code: 'basico',
        pending_billing_cycle: 'monthly',
        pending_max_users: 3,
        pending_modules: ['os', 'crm'],
        pending_subscription_value: 97,
      },
    ];
    for (const c of cenarios) {
      const { vital } = splitRenewalCompanyUpdate(c, vencimento);
      expect(Object.keys(vital).sort()).toEqual([
        'subscription_expires_at',
        'subscription_status',
      ]);
      expect(vital.subscription_status).toBe('active');
      expect(vital.subscription_expires_at).toBe(vencimento);
    }
  });

  it('empresa sem nada pendente não gera segundo UPDATE', () => {
    const split = splitRenewalCompanyUpdate({}, vencimento);
    expect(split.hasExtras).toBe(false);
    expect(split.extras).toEqual({});
    expect(split.downgrade).toBeNull();
  });

  it('valor agendado entra nos EXTRAS e limpa o pendente', () => {
    const { extras, hasExtras } = splitRenewalCompanyUpdate(
      { pending_subscription_value: 347 },
      vencimento,
    );
    expect(hasExtras).toBe(true);
    expect(extras).toEqual({ subscription_value: 347, pending_subscription_value: null });
  });

  it('promoção temporária conta mais um pagamento e encerra no último', () => {
    const meio = splitRenewalCompanyUpdate(
      { custom_price: 100, custom_price_months: 3, custom_price_payments_made: 1 },
      vencimento,
    );
    expect(meio.extras.custom_price_payments_made).toBe(2);
    expect(meio.extras.custom_price).toBeUndefined();

    const ultimo = splitRenewalCompanyUpdate(
      { custom_price: 100, custom_price_months: 3, custom_price_payments_made: 2 },
      vencimento,
    );
    expect(ultimo.extras.custom_price).toBeNull();
    expect(ultimo.extras.custom_price_months).toBeNull();
    expect(ultimo.extras.custom_price_payments_made).toBe(0);
  });

  it('promoção PERMANENTE não progride (não tem prazo pra acabar)', () => {
    const split = splitRenewalCompanyUpdate(
      {
        custom_price: 100,
        custom_price_months: 3,
        custom_price_payments_made: 1,
        custom_price_permanent: true,
      },
      vencimento,
    );
    expect(split.hasExtras).toBe(false);
  });

  it('downgrade agendado aplica plano/ciclo/limite e limpa TODOS os pending_*', () => {
    const { extras, downgrade } = splitRenewalCompanyUpdate(
      {
        pending_plan_code: 'basico',
        pending_billing_cycle: 'monthly',
        pending_max_users: 3,
        pending_modules: ['os', 42, 'crm'],
        pending_subscription_value: 97,
      },
      vencimento,
    );
    expect(extras.subscription_plan).toBe('basico');
    expect(extras.billing_cycle).toBe('monthly');
    expect(extras.max_users).toBe(3);
    for (const k of [
      'pending_plan_code',
      'pending_billing_cycle',
      'pending_max_users',
      'pending_modules',
      'pending_subscription_value',
    ]) {
      expect(extras[k], `pending não limpo: ${k}`).toBeNull();
    }
    // Filtra lixo não-string do jsonb sem derrubar o resto.
    expect(downgrade?.explicitModules).toEqual(['os', 'crm']);
  });

  it('downgrade SEM pending_modules pede resolução pelo plano (null ≠ conjunto vazio)', () => {
    // A diferença importa: `[]` mandaria REMOVER todos os módulos do cliente.
    const { downgrade } = splitRenewalCompanyUpdate({ pending_plan_code: 'basico' }, vencimento);
    expect(downgrade).toEqual({ planCode: 'basico', explicitModules: null });
  });
});

describe('devolução do mutex: desfazer o crédito de LTV', () => {
  it('subtrai o valor creditado, com centavo', () => {
    expect(computeLtvRollback(1000.5, 197.3)).toBe(803.2);
  });

  it('nunca deixa LTV negativo', () => {
    expect(computeLtvRollback(50, 197)).toBe(0);
  });

  it('trata LTV nulo/ausente como zero (empresa nova)', () => {
    expect(computeLtvRollback(null, 197)).toBe(0);
    expect(computeLtvRollback(undefined, 0)).toBe(0);
  });
});

describe('asaas-webhook — a fronteira fatal x não-fatal, no fonte real', () => {
  // A prova comportamental completa exigiria subir a edge com um Postgres; o
  // que dá pra travar aqui é a ESTRUTURA da decisão, que é onde o bug mora.
  // Cada teste abaixo corresponde a uma linha que, antes, era
  // `await supabase.from(...)` sem checagem nenhuma.

  it('o detector NÃO está cego neste arquivo (controle negativo)', () => {
    // Sem isto, o teste de "zero escrita crua" passaria por engano se o
    // blanking de comentários/strings quebrasse e cegasse o arquivo inteiro.
    const contaminado =
      webhookSource + '\nawait supabase.from("salesperson_sales").insert({ amount: 1 });\n';
    const achados = findUncheckedWrites(contaminado);
    expect(achados).toHaveLength(1);
    expect(achados[0].table).toBe('salesperson_sales');
  });

  it('ANTES do mutex: materializar a linha de renovação é FATAL', () => {
    // Era só um console.error. Sem a linha, o mutex não acha o que reivindicar,
    // devolve FALSE e o webhook trata como "já processado": a renovação inteira
    // sumia em silêncio. Nada reivindicado ainda → re-entrega conserta.
    const trecho = aoRedor('materialização da linha de renovação (subscription_payments)');
    expect(trecho).toContain('tryWrite');
    expect(trecho).toContain('ignoreCodes: ["23505"]');
    expect(trecho).toContain('throw new RetryableWebhookError');
  });

  it('o mutex de LTV falhando pede re-entrega (antes virava 200 e o pagamento sumia)', () => {
    const i = webhookSource.indexOf('credit_ltv_once_for_payment falhou');
    expect(i).toBeGreaterThan(-1);
    const trecho = webhookSource.slice(i, i + 900);
    expect(trecho).toContain('throw new RetryableWebhookError');
    expect(trecho).not.toContain('return { processed: false, reason: "erro no mutex de LTV" }');
  });

  it('a renovação da empresa (VITAL) devolve o mutex ANTES de pedir re-entrega', () => {
    // Esta é a decisão mais delicada do arquivo: depois do mutex reivindicado,
    // re-entregar SEM devolvê-lo traria o evento de volta só pra ser descartado
    // como "já processado" — a renovação some do mesmo jeito, com a fila travada.
    const trecho = aoRedor('renovação da empresa (companies: status + vencimento)', 200, 1600);
    expect(trecho).toContain('tryWrite');
    expect(trecho).toContain('abortarDevolvendoMutex');

    const helper = webhookSource.indexOf('const abortarDevolvendoMutex');
    const release = webhookSource.indexOf('releaseLtvClaim(supabase', helper);
    const throwIdx = webhookSource.indexOf('throw new RetryableWebhookError', helper);
    expect(release).toBeGreaterThan(helper);
    expect(throwIdx).toBeGreaterThan(release);
  });

  it('DEPOIS do mutex, o único throw de re-entrega é o que vem da devolução', () => {
    // Qualquer outro throw nesse trecho seria um 500 que não repara nada.
    const winner = webhookSource.indexOf('A partir daqui somos o WINNER');
    const fimDaFuncao = webhookSource.indexOf('const COMPANY_COLS', winner);
    expect(winner).toBeGreaterThan(-1);
    expect(fimDaFuncao).toBeGreaterThan(winner);
    const posMutex = webhookSource.slice(winner, fimDaFuncao);
    expect(posMutex.split('throw new RetryableWebhookError')).toHaveLength(2);
    expect(posMutex.indexOf('releaseLtvClaim')).toBeLessThan(
      posMutex.indexOf('throw new RetryableWebhookError'),
    );
  });

  it('a devolução do mutex tira o LTV ANTES de soltar o carimbo', () => {
    // Invertido, uma falha no meio deixaria o mutex livre com o LTV já somado:
    // a re-entrega somaria de novo e infla o LTV (já aconteceu no EcoSistema).
    const inicio = webhookSource.indexOf('async function releaseLtvClaim');
    const trecho = webhookSource.slice(inicio, inicio + 2200);
    const estorno = trecho.indexOf('estorno do LTV creditado');
    const liberacao = trecho.indexOf('liberação do mutex de LTV');
    expect(estorno).toBeGreaterThan(-1);
    expect(liberacao).toBeGreaterThan(estorno);
  });

  it('leitura recusada NÃO vira "primeira venda" — devolve o mutex e reprocessa', () => {
    // A mentira de LEITURA da mesma família: `const { data } = await …` descarta
    // o `error`, `data` vem undefined e os três sinais dão "não encontrei". Uma
    // RENOVAÇÃO virava PRIMEIRA VENDA: comissão indevida + vencimento
    // re-ancorado em hoje (quem pagou adiantado perdia os dias acumulados).
    expect(webhookSource).toContain('Promise<boolean | null>');
    const i = webhookSource.indexOf('const isFirstSale = await detectIsFirstSale');
    const trecho = webhookSource.slice(i, i + 900);
    expect(trecho).toContain('isFirstSale === null');
    expect(trecho).toContain('abortarDevolvendoMutex');
  });

  it('na dúvida sobre comissão já existente, NÃO paga (pagar em dobro não volta)', () => {
    const i = webhookSource.indexOf('if (isFirstSale && company.salesperson_id)');
    const trecho = webhookSource.slice(i, i + 1600);
    expect(trecho).toContain('error: existingSaleErr');
    expect(trecho).toContain('if (existingSaleErr)');
    expect(trecho).toContain('} else if (!existingSale) {');
  });

  it.each([
    // Escrita pós-mutex → não-fatal, com recuperação. Re-entregar seria no-op.
    ['histórico de pagamento da empresa (company_payments)'],
    ['receita da assinatura (admin_financial_transactions)'],
    ['rastro do pagamento (subscription_payments: paid_at + due_date do ciclo)'],
    ['comissão do vendedor (salesperson_sales)'],
  ])('pós-mutex é não-fatal e leva linha de recuperação: %s', (label) => {
    const trecho = aoRedor(label, 300, 2000);
    expect(trecho).toContain('tryWrite');
    expect(trecho).toContain('recovery:');
  });

  it.each([
    // Dinheiro que NÃO tem segundo caminho de recuperação → alerta humano.
    ['comissão do vendedor (salesperson_sales)', 'salesperson_commission_not_recorded'],
    ['receita da assinatura (admin_financial_transactions)', 'subscription_income_not_recorded'],
    [
      'rastro do pagamento (subscription_payments: paid_at + due_date do ciclo)',
      'subscription_payment_trace_failed',
    ],
    ['histórico de pagamento da empresa (company_payments)', 'company_payment_not_recorded'],
  ])('%s falhando gera alerta ao admin (%s)', (label, tipoAlerta) => {
    expect(aoRedor(label, 300, 3200)).toContain(tipoAlerta);
  });

  it.each([
    // Idempotente + nada reivindicado → FATAL, porque a re-entrega conserta.
    ['registro do pagamento órfão (ledger_asaas)'],
    ['vínculo da cobrança à assinatura (subscription_payments)'],
    ['marcação de inadimplência (subscription_payments)'],
    ['desativação da empresa inadimplente (companies)'],
  ])('escrita idempotente e sem mutex é FATAL: %s', (label) => {
    const trecho = aoRedor(label, 300, 900);
    expect(trecho).toContain('applyWrite');
    expect(trecho).toContain('retryableRethrow');
  });

  it('o alerta de pagamento órfão é a exceção consciente: o ledger é fatal, o aviso não', () => {
    // Re-entregar o evento só pra repetir um aviso vira ruído na fila da Asaas,
    // e o dinheiro já está preservado no ledger (que É fatal, teste acima).
    const trecho = aoRedor('alerta de pagamento órfão (admin_notifications)', 400, 1200);
    expect(trecho).toContain('tryWrite');
    expect(trecho).not.toContain('applyWrite');
  });

  it('o backfill do asaas_customer_id só reflete em memória se GRAVOU', () => {
    // Antes o objeto passava a dizer que a company tinha customer mesmo com a
    // escrita recusada — é o ponteiro cuja ausência já duplicou customer na Asaas.
    const trecho = aoRedor('backfill do asaas_customer_id (companies)', 600, 900);
    expect(trecho).toContain('tryWrite');
    expect(trecho).toMatch(/if \(backfilled\)[\s\S]*match\.asaas_customer_id = incomingCustomer/);
  });

  it('o catch de topo decide a resposta pelo tipo do erro, não por reflexo', () => {
    expect(webhookSource).toContain('webhookResponseFor(error)');
    expect(webhookSource).not.toContain('return json({ received: true, error: (error as Error).message })');
  });

  it('a autenticação do webhook continua fail-closed (não afrouxar junto)', () => {
    expect(webhookSource).toContain('ASAAS_WEBHOOK_TOKEN');
    expect(webhookSource).toContain('timingSafeEqual(providedToken, expectedToken)');
    expect(webhookSource).toContain('Unauthorized webhook');
  });
});
