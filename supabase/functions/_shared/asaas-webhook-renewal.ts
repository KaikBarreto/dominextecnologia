// asaas-webhook-renewal.ts — decisões PURAS do webhook de cobrança da Auctus.
// ---------------------------------------------------------------------------
// Este módulo existe por dois motivos, e os dois são o mesmo bug de raiz:
// o `supabase-js` NÃO lança quando o banco recusa a escrita (ver
// `_shared/db-write.ts`). A partir daí, duas perguntas ficaram sem resposta
// escrita em lugar nenhum — e sem resposta escrita, sem teste:
//
//   1) "a falha desta escrita merece RE-ENTREGA do evento?"  → RetryableWebhookError
//   2) "quais campos podem viajar JUNTOS no mesmo UPDATE?"   → splitRenewalCompanyUpdate
//
// Módulo PURO de propósito (sem `Deno.*`, sem import remoto, sem I/O) pra ser
// importável pelo vitest a partir de `src/**` — é lá que ele é testado
// (`src/lib/asaasWebhookRenewal.test.ts`). Mesmo arranjo do `db-write.ts`.

// ───────────────────────────────────────────────────────────────────────────
// 1) RE-ENTREGA
// ───────────────────────────────────────────────────────────────────────────

/**
 * Erro que PEDE re-entrega do evento à Asaas.
 *
 * ⚠️ A INVERSÃO QUE MUDA TUDO NESTE ARQUIVO. Nas edges chamadas pelo usuário,
 * "lançar" significa devolver erro pra alguém que está olhando a tela. Aqui não
 * tem ninguém olhando: quem chama é a Asaas, que RE-ENTREGA o evento enquanto
 * não receber 2xx. Então lançar não é "desistir", é o ÚNICO caminho de
 * recuperação automática que existe — e responder 200 com a escrita falhada é
 * o que apaga o evento pra sempre.
 *
 * O webhook respondia 200 em TODO caminho, inclusive no catch de erro
 * inesperado ("pra Asaas não re-enfileirar"). Isso está certo pra payload ruim
 * (re-entregar um payload que nunca vai funcionar só trava a fila da Asaas) e
 * está ERRADO pra falha de escrita idempotente. `webhookResponseFor` separa os
 * dois: só o que foi marcado como retryable vira 500.
 */
export class RetryableWebhookError extends Error {
  readonly retryable = true;
  /** Erro original do banco, quando houve um. Nome próprio pra não colidir com `Error.cause`. */
  readonly dbError?: unknown;

  constructor(message: string, dbError?: unknown) {
    super(message);
    this.name = "RetryableWebhookError";
    this.dbError = dbError;
  }
}

/** `true` só pro erro que pede re-entrega (checa a marca, não o `instanceof`). */
export function isRetryableWebhookError(error: unknown): boolean {
  if (error instanceof RetryableWebhookError) return true;
  return !!error && typeof error === "object" && (error as { retryable?: unknown }).retryable === true;
}

/**
 * Fábrica pronta pro `rethrow` do `applyWrite`: transforma o erro do banco num
 * erro de re-entrega, mantendo `code`/`message` no texto pro log.
 */
export function retryableRethrow(label: string) {
  return (error: { message: string; code?: string | null }) =>
    new RetryableWebhookError(
      `${label} falhou (${error.code || "sem código"}): ${error.message}`,
      error,
    );
}

export interface WebhookResponsePlan {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Traduz o erro que escapou do handler na resposta que a Asaas vai ler.
 *
 * - retryable  → 500 `{ received: false, retry: true }` (a Asaas re-entrega).
 * - qualquer outro → 200 `{ received: true }` (comportamento original: payload
 *   ruim / bug de código não melhora sendo re-entregue, e re-entregar trava a
 *   fila da conta inteira).
 *
 * Em NENHUM dos dois a mensagem interna vai no corpo — ela vai pro log. O corpo
 * antigo devolvia `error: (error as Error).message` pra um endpoint público.
 */
export function webhookResponseFor(error: unknown): WebhookResponsePlan {
  if (isRetryableWebhookError(error)) {
    return { status: 500, body: { received: false, retry: true } };
  }
  return { status: 200, body: { received: true, error: "erro interno" } };
}

// ───────────────────────────────────────────────────────────────────────────
// 2) O UPDATE DA RENOVAÇÃO, PARTIDO EM DOIS
// ───────────────────────────────────────────────────────────────────────────

/** Campos de `companies` que a renovação lê pra montar o update. */
export interface RenewalCompanySnapshot {
  pending_subscription_value?: number | null;
  custom_price?: number | null;
  custom_price_months?: number | null;
  custom_price_payments_made?: number | null;
  custom_price_permanent?: boolean | null;
  pending_plan_code?: string | null;
  pending_billing_cycle?: string | null;
  pending_max_users?: number | null;
  pending_modules?: unknown;
}

export interface RenewalUpdateSplit {
  /**
   * O que NÃO pode falhar: a empresa volta a `active` e o vencimento anda.
   * É o gate de acesso do tenant. Exatamente 2 colunas, de tipo trivial —
   * escrito sozinho, só falha por indisponibilidade (que a re-entrega cura).
   */
  vital: { subscription_status: "active"; subscription_expires_at: string };
  /**
   * O resto: promoção temporária, valor agendado e downgrade. Campos que vêm de
   * dado do usuário/painel (plano, ciclo, limite de usuários) e portanto podem
   * bater em CHECK/FK. Vão num UPDATE SEPARADO de propósito.
   */
  extras: Record<string, unknown>;
  hasExtras: boolean;
  /** Presente só quando existe downgrade agendado a aplicar nesta renovação. */
  downgrade: { planCode: string; explicitModules: string[] | null } | null;
}

/**
 * Parte o update da renovação em VITAL + EXTRAS.
 *
 * ⚠️ O PORQUÊ (incidente Pix Automático, 2026-09-19, mesma família): quando um
 * único campo do objeto viola uma constraint, o Postgres recusa o UPDATE
 * INTEIRO — e o `supabase-js` devolve isso em `{ error }`, calado. Foi assim que
 * um `pix_auto_status` inválido derrubou junto o `status` que viajava no mesmo
 * objeto. Aqui o objeto único carregava `subscription_status: 'active'` (o gate
 * de acesso do cliente que ACABOU de pagar) no mesmo pacote que
 * `subscription_plan`/`billing_cycle`/`max_users` vindos de `pending_*`. Um
 * `pending_billing_cycle` fora do CHECK deixaria o cliente pagante sem acesso,
 * em silêncio.
 *
 * Partido: o vital vai sozinho e é FATAL (re-entrega), os extras vão depois e
 * são não-fatais. Se os extras falharem, os `pending_*` NÃO são limpos — o
 * downgrade é reavaliado na próxima renovação em vez de sumir.
 *
 * Função pura: não lê nem escreve banco. Os módulos-alvo do downgrade
 * (quando `pending_modules` é nulo) precisam de um SELECT no plano e ficam a
 * cargo do chamador — por isso `explicitModules: null` significa "resolver pelo
 * plano", e não "conjunto vazio".
 */
export function splitRenewalCompanyUpdate(
  company: RenewalCompanySnapshot,
  newExpiration: string,
): RenewalUpdateSplit {
  const vital = {
    subscription_status: "active" as const,
    subscription_expires_at: newExpiration,
  };
  const extras: Record<string, unknown> = {};

  // Valor agendado (upgrade/mudança de preço já acordada) vira o valor corrente.
  if (company.pending_subscription_value !== null && company.pending_subscription_value !== undefined) {
    extras.subscription_value = company.pending_subscription_value;
    extras.pending_subscription_value = null;
  }

  // Preço promocional temporário: conta mais um pagamento e encerra no fim do prazo.
  if (
    company.custom_price !== null &&
    company.custom_price !== undefined &&
    company.custom_price_months !== null &&
    company.custom_price_months !== undefined &&
    !company.custom_price_permanent
  ) {
    const paymentsMade = (company.custom_price_payments_made || 0) + 1;
    extras.custom_price_payments_made = paymentsMade;
    if (paymentsMade >= company.custom_price_months) {
      extras.custom_price = null;
      extras.custom_price_months = null;
      extras.custom_price_payments_made = 0;
    }
  }

  // Downgrade agendado: só efetiva numa renovação confirmada.
  let downgrade: RenewalUpdateSplit["downgrade"] = null;
  if (company.pending_plan_code !== null && company.pending_plan_code !== undefined) {
    extras.subscription_plan = company.pending_plan_code;
    if (company.pending_billing_cycle !== null && company.pending_billing_cycle !== undefined) {
      extras.billing_cycle = company.pending_billing_cycle;
    }
    if (company.pending_max_users !== null && company.pending_max_users !== undefined) {
      extras.max_users = company.pending_max_users;
    }
    extras.pending_plan_code = null;
    extras.pending_billing_cycle = null;
    extras.pending_max_users = null;
    extras.pending_modules = null;
    extras.pending_subscription_value = null;

    downgrade = {
      planCode: company.pending_plan_code,
      explicitModules: Array.isArray(company.pending_modules)
        ? company.pending_modules.filter((m): m is string => typeof m === "string")
        : null,
    };
  }

  return { vital, extras, hasExtras: Object.keys(extras).length > 0, downgrade };
}

// ───────────────────────────────────────────────────────────────────────────
// 3) DEVOLUÇÃO DO MUTEX
// ───────────────────────────────────────────────────────────────────────────

/**
 * Novo LTV depois de desfazer um crédito. Centavo-safe e nunca negativo.
 *
 * Existe porque devolver o mutex `credit_ltv_once_for_payment` exige desfazer
 * as DUAS coisas que ele fez: o carimbo `ltv_credited_at` e a soma no
 * `companies.ltv`. Soltar só o carimbo faria o LTV contar o mesmo pagamento
 * duas vezes na re-entrega.
 */
export function computeLtvRollback(currentLtv: unknown, amount: number): number {
  const atual = Number(currentLtv) || 0;
  const valor = Number(amount) || 0;
  return Math.max(0, Math.round((atual - valor) * 100) / 100);
}
