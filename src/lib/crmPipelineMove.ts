// Regra de "para onde a oportunidade cai ao mudar de FUNIL".
//
// A etapa atual não existe no funil de destino, então alguém tem que decidir
// onde o card aterrissa. DECISÃO: a PRIMEIRA etapa do funil de destino (a
// lista de `crm_stages` já vem ordenada por `position`). É o equivalente a
// recomeçar o fluxo naquele funil, é o que Kommo e RD Station fazem, e evita o
// pior cenário: o card entrar numa etapa de ganho/perda sem ninguém pedir.
//
// Fica fora do componente pra poder ser testada sem montar o modal.
export interface StageLike {
  id: string;
  name: string;
  pipeline_id: string;
  position?: number;
}

/**
 * Primeira etapa do funil, ou `null` quando o funil ainda não tem etapa
 * nenhuma (funil recém-criado). `null` NÃO pode virar um update: sem etapa
 * válida no destino, a oportunidade ficaria órfã num funil sem coluna.
 */
export function firstStageOfPipeline<T extends StageLike>(stages: T[], pipelineId: string): T | null {
  const inPipeline = stages.filter((s) => s.pipeline_id === pipelineId);
  if (inPipeline.length === 0) return null;
  // Não confia só na ordem de chegada: se `position` veio, ordena por ela.
  const sorted = inPipeline.every((s) => typeof s.position === 'number')
    ? [...inPipeline].sort((a, b) => (a.position as number) - (b.position as number))
    : inPipeline;
  return sorted[0];
}
