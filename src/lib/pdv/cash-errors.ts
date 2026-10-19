/**
 * Mensagem de erro das RPCs de caixa do PDV.
 *
 * POR QUE NÃO USAR `getErrorMessage` DIRETO: ele resolve por SQLSTATE ANTES de
 * olhar o texto, e as RPCs de caixa levantam mensagens PT-BR JÁ ESCRITAS PRO
 * OPERADOR carimbadas com códigos genéricos. Passar pelo mapa mataria a única
 * informação útil da tela:
 *
 *   RAISE 'Disponível no cofre: R$ 320,00. Reduza o valor de abertura...'  (23514)
 *     → getErrorMessage devolveria "Algum valor está fora do permitido".
 *   RAISE 'O terminal "Loja Balcão" já tem um caixa aberto...'             (23505)
 *     → devolveria "Já existe um registro com esses dados."
 *
 * Então aqui a ordem inverte: mensagem do servidor primeiro (ela é a boa),
 * `getErrorMessage` só quando o texto é técnico/inglês ou não existe.
 */

import { getErrorMessage } from '@/utils/errorMessages';

type ErrorLike = { code?: string; message?: string; details?: string; hint?: string };

/**
 * Mesma lista de sentinelas do `errorMessages.ts`: texto claramente cru de
 * banco/HTTP não é mostrado ao cliente final.
 */
function looksTechnical(raw: string): boolean {
  const m = raw.toLowerCase();
  return (
    m.includes('syntax error') ||
    (m.includes('relation') && m.includes('does not exist')) ||
    (m.includes('column') && m.includes('does not exist')) ||
    m.includes('permission denied') ||
    m.includes('violates') ||
    m.includes('invalid input syntax') ||
    (m.includes('constraint') && (m.includes('failed') || m.includes('violation'))) ||
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    /^pgrst\d+/i.test(raw) ||
    /^\d{2}[a-z0-9]{3}\s/i.test(raw)
  );
}

/** Texto PT-BR pro operador: prefere o que o servidor escreveu. */
export function pdvCashErrorMessage(error: unknown, fallback?: string): string {
  const raw = (error && typeof error === 'object' ? (error as ErrorLike).message : null) ?? '';
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed && !looksTechnical(trimmed)) return trimmed;
  return fallback ? getErrorMessage(error, fallback) : getErrorMessage(error);
}

/**
 * O erro é "não cabe no cofre"?
 *
 * `pdv_open_cash_session` usa ERRCODE 23514 pra exatamente um caso: valor de
 * abertura acima do disponível com controle estrito ligado. É esse erro que
 * destrava as duas saídas da tela ("Abrir com valor menor" e "Ajustar o saldo
 * do cofre"). O casamento por texto é cinto de segurança pra o dia em que
 * alguém acrescentar outro CHECK à mesma RPC.
 */
export function isCofreLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as ErrorLike;
  if (e.code !== '23514') return false;
  return /cofre/i.test(e.message ?? '');
}

/** O cofre não foi configurado em Configurações do PDV (ERRCODE 23502 das RPCs). */
export function isCofreNotConfiguredError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as ErrorLike;
  return e.code === '23502' && /cofre/i.test(e.message ?? '');
}
