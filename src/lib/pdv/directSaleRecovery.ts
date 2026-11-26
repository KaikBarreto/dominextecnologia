import type { PdvSaleAttempt } from './sale-drafts';
import type { PdvDraftPersistResult } from '@/hooks/usePdvServerDraftSync';

export const PDV_DIRECT_SALE_REVIEW_MESSAGE = 'A última tentativa precisa ser conferida em Pedidos antes de reenviar. O conteúdo deste atendimento foi preservado.';
export const PDV_DIRECT_SALE_PERSIST_MESSAGE = 'Não foi possível confirmar o salvamento da tentativa na conta. A venda não foi enviada. Mantenha esta aba aberta e tente novamente.';
export const PDV_DIRECT_SALE_SCOPE_MESSAGE = 'O contexto do caixa mudou. A venda não foi enviada. Volte ao atendimento correto antes de continuar.';

export function pdvDirectSaleIdempotencyKey(attemptId: string): string {
  return `direct-sale-v3-${attemptId}`;
}

export function createDurablePdvDirectSaleAttempt(signature: string, id: string = crypto.randomUUID()): PdvSaleAttempt {
  return { signature, clientRequestId: id, orderId: null, directSaleVersion: 3, idempotencyKey: pdvDirectSaleIdempotencyKey(id) };
}

export function isDurablePdvDirectSaleAttempt(attempt: PdvSaleAttempt): boolean {
  return attempt.directSaleVersion === 3 && typeof attempt.idempotencyKey === 'string'
    && attempt.idempotencyKey.length >= 8 && attempt.idempotencyKey.length <= 200
    && attempt.idempotencyKey.trim() === attempt.idempotencyKey
    && (!attempt.orderId || attempt.confirmedSale?.orderId === attempt.orderId);
}

type ConfirmedSale = NonNullable<PdvSaleAttempt['confirmedSale']>;

/**
 * Tentativas criadas nesta sessão da página cujo envio nunca ficou sem
 * resposta. Só elas podem ser descartadas quando o servidor recusa a venda:
 * a recusa desfaz a transação inteira, então a chave idempotente não ficou
 * gravada e não existe pedido. Tentativa recuperada do navegador, enviada em
 * paralelo ou com um envio anterior sem resposta pode já ter criado o pedido
 * (a recusa seguinte pode vir de uma validação anterior à checagem da chave)
 * e continua exigindo conferência em Pedidos.
 */
const releasableAttempts = new Set<string>();
const attemptsBeingSent = new Set<string>();
export type PdvAttemptPersistence = { server: PdvDraftPersistResult; localSaved: boolean };

/** A barreira é confirmação de persistência, não um setState ou efeito agendado. */
export async function completeDurablePdvDirectSale({ attempt: previous, signature, persist, complete, onConfirmed, isScopeCurrent = () => true,
  isDefinitiveRejection, release }: {
  attempt: PdvSaleAttempt | null;
  signature: string;
  persist: (attempt: PdvSaleAttempt) => Promise<PdvAttemptPersistence>;
  complete: (attempt: PdvSaleAttempt) => Promise<ConfirmedSale>;
  onConfirmed: (attempt: PdvSaleAttempt, sale: ConfirmedSale) => void;
  isScopeCurrent?: () => boolean;
  /** O servidor respondeu recusando a venda: nada foi gravado nesta requisição. */
  isDefinitiveRejection?: (error: unknown) => boolean;
  /** Remove a tentativa recusada do atendimento para o operador corrigir e reenviar. */
  release?: (attempt: PdvSaleAttempt) => unknown;
}) {
  const attempt = previous ?? createDurablePdvDirectSaleAttempt(signature);
  if (!previous) releasableAttempts.add(attempt.clientRequestId);
  if (!isDurablePdvDirectSaleAttempt(attempt) || attempt.signature !== signature) throw new Error(PDV_DIRECT_SALE_REVIEW_MESSAGE);
  if (!attempt.confirmedSale) {
    if (!isScopeCurrent()) throw new Error(PDV_DIRECT_SALE_SCOPE_MESSAGE);
    const saved = await persist(attempt);
    if (!isScopeCurrent()) throw new Error(PDV_DIRECT_SALE_SCOPE_MESSAGE);
    if (saved.server === 'scope_changed') throw new Error(PDV_DIRECT_SALE_SCOPE_MESSAGE);
    if (saved.server === 'conflict') throw new Error('Há versões diferentes deste atendimento. A venda não foi enviada. Volte ao atendimento e revise as versões antes de finalizar.');
    if (saved.server === 'not_found') throw new Error('Este atendimento não está mais disponível para finalizar. A venda não foi enviada. Volte aos atendimentos para conferir.');
    if (saved.server !== 'saved') throw new Error(PDV_DIRECT_SALE_PERSIST_MESSAGE);
  }
  const sale = attempt.confirmedSale ?? await sendDurableAttempt(attempt, complete, async error => {
    if (isDefinitiveRejection?.(error) !== true || !isScopeCurrent()) return;
    // A recusa do servidor continua sendo a mensagem que o operador lê.
    try { await release?.(attempt); } catch { /* A limpeza é refeita pelo autosave ou pela conferência. */ }
  });
  const confirmed = { ...attempt, orderId: sale.orderId, confirmedSale: sale };
  if (!isScopeCurrent()) return { sale, attempt: confirmed,
    persistence: { server: 'scope_changed' as const, localSaved: false } };
  // Confirmação financeira nunca volta a ser "falha da venda" por causa de
  // upload, armazenamento local ou uma segunda gravação do rascunho.
  let saving: Promise<PdvAttemptPersistence>;
  // persist instala estado e backup local de forma síncrona antes de aguardar
  // o servidor; nenhum efeito visual ou upload antecede essa gravação.
  try { saving = persist(confirmed); }
  catch { saving = Promise.resolve({ server: 'unavailable', localSaved: false }); }
  try { if (isScopeCurrent()) onConfirmed(confirmed, sale); }
  catch { /* Um efeito posterior não transforma um commit em venda falha. */ }
  const persistence = await saving.catch(() => ({ server: 'unavailable' as const, localSaved: false }));
  return { sale, attempt: confirmed, persistence };
}

async function sendDurableAttempt(
  attempt: PdvSaleAttempt,
  complete: (attempt: PdvSaleAttempt) => Promise<ConfirmedSale>,
  onProvablyRefused: (error: unknown) => Promise<void>,
): Promise<ConfirmedSale> {
  const id = attempt.clientRequestId;
  if (attemptsBeingSent.has(id)) releasableAttempts.delete(id);
  attemptsBeingSent.add(id);
  try {
    const sale = await complete(attempt);
    releasableAttempts.delete(id);
    return sale;
  } catch (error) {
    // Qualquer desfecho encerra a elegibilidade: liberada, a tentativa deixa
    // de existir; sem resposta, o pedido pode existir no servidor.
    if (releasableAttempts.delete(id)) await onProvablyRefused(error);
    throw error;
  } finally {
    attemptsBeingSent.delete(id);
  }
}
