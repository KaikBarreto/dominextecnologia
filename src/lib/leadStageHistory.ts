// Lógica pura por trás do registro automático de "mudança de estágio" na aba
// Histórico da oportunidade (tabela lead_interactions, reaproveitada — sem
// tabela nova). Fica fora do hook de propósito: dá pra testar sem mockar
// Supabase. `useLeads.ts` (grava, no updateLead) e `LeadDetailModal.tsx`
// (lê, na aba Histórico) só chamam essas funções.
//
// Pedido do CEO (2026-09-19): arrastar o card no funil, mover pelo menu de 3
// pontos mobile, trocar no select do modal de detalhe, editar pelo form geral
// (LeadFormDialog) ou confirmar o motivo de perda — todo caminho que muda
// `leads.stage_id` passa por `useLeads().updateLead`, que é o único lugar que
// grava no banco. Centralizar aqui garante que nenhum caminho fica de fora.

/** interaction_type reservado pro registro automático de troca de estágio.
 * De propósito NÃO entra em getInteractionTypes() (useLeads.ts): é gerado
 * pelo sistema, nunca aparece como opção no dropdown de "Nova Interação". */
export const STAGE_CHANGE_INTERACTION_TYPE = 'mudanca_estagio';

export interface StageChangeSnapshot {
  from_stage_id: string | null;
  from_stage_name: string | null;
  to_stage_id: string;
  to_stage_name: string | null;
}

/**
 * Decide se uma mudança de estágio deve virar registro no histórico. Soltar
 * o card na MESMA coluna, ou salvar o form de edição sem mexer no estágio,
 * não pode gerar registro, senão o histórico vira ruído.
 */
export function shouldLogStageChange(
  previousStageId: string | null,
  nextStageId: string | null | undefined,
): nextStageId is string {
  return !!nextStageId && nextStageId !== previousStageId;
}

/** Snapshot dos nomes no momento da troca (não só o id): se o estágio for
 * renomeado ou excluído depois, o histórico continua contando a história
 * certa — mesmo raciocínio de `service_type_delete_recoverable_via_snapshot`. */
export function buildStageChangeDescription(snapshot: StageChangeSnapshot): string {
  return JSON.stringify(snapshot);
}

/** Parse defensivo: `description` é `string | null` livre no banco, então
 * qualquer JSON inesperado (ou texto de uma interação manual antiga) cai em
 * `null` em vez de quebrar a aba Histórico. */
export function parseStageChangeDescription(raw: string | null | undefined): StageChangeSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.to_stage_id !== 'string') return null;
    return {
      from_stage_id: typeof parsed.from_stage_id === 'string' ? parsed.from_stage_id : null,
      from_stage_name: typeof parsed.from_stage_name === 'string' ? parsed.from_stage_name : null,
      to_stage_id: parsed.to_stage_id,
      to_stage_name: typeof parsed.to_stage_name === 'string' ? parsed.to_stage_name : null,
    };
  } catch {
    return null;
  }
}
