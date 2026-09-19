// Espelho NO CLIENT da regra de acesso a funil do CRM. A fonte da verdade é
// `public.can_access_pipeline` (migration 20260918110000_crm_pipeline_access.sql),
// aplicada por policies RESTRICTIVE em crm_pipelines, crm_stages e leads.
//
// POR QUE EXISTE (e o que NÃO é)
// ---------------------------------------------------------------------------
// RLS é segurança; filtro no client é UX. Quem lista os funis que o usuário
// pode ver É A RLS: `useCrmPipelines()` já devolve SÓ os funis acessíveis,
// porque a policy "Funis restritos a quem tem acesso" recorta o SELECT. Este
// módulo existe pra (a) deixar a regra escrita e testável no front e (b) ser o
// segundo filtro dos seletores que MOVEM oportunidade entre funis, pra tela e
// banco nunca discordarem sobre o que pode aparecer na lista.
//
// LIMITE CONHECIDO, de propósito: um usuário comum só enxerga as PRÓPRIAS
// linhas de `crm_pipeline_access` (policy "Users view own crm_pipeline_access").
// Então, pra ele, "funil sem nenhuma linha visível" não distingue "funil
// aberto" de "funil restrito a outras pessoas" — e esta função devolveria
// `true` nos dois casos. Isso NÃO abre acesso nenhum: o funil restrito a
// terceiros nem chega na lista `pipelines`, porque a RLS já o removeu do
// SELECT. Por isso a entrada desta função é SEMPRE a lista vinda do banco,
// nunca uma lista montada no client.
export interface PipelineAccessRowLike {
  pipeline_id: string;
  user_id: string;
}

export interface PipelineLike {
  id: string;
  name: string;
}

export interface PipelineAccessContext {
  /** Linhas de `crm_pipeline_access` que ESTE usuário consegue ler. */
  accessRows: PipelineAccessRowLike[];
  userId: string | null | undefined;
  /** `fn:manage_crm` — passa por cima da ACL, igual ao passo 1 da função SQL. */
  canManageCrm: boolean;
}

/**
 * Mesma ordem de avaliação de `public.can_access_pipeline`:
 *   manage_crm  OU  funil sem nenhuma linha de ACL  OU  usuário listado.
 */
export function canAccessPipelineClient(pipelineId: string, ctx: PipelineAccessContext): boolean {
  if (ctx.canManageCrm) return true;
  const rowsForPipeline = ctx.accessRows.filter((a) => a.pipeline_id === pipelineId);
  if (rowsForPipeline.length === 0) return true;
  if (!ctx.userId) return false;
  return rowsForPipeline.some((a) => a.user_id === ctx.userId);
}

/**
 * Funis que podem aparecer num seletor de "mover para o funil". Recebe a lista
 * JÁ RECORTADA PELA RLS (useCrmPipelines) e só estreita mais.
 */
export function filterAccessiblePipelines<T extends PipelineLike>(
  pipelines: T[],
  ctx: PipelineAccessContext,
): T[] {
  return pipelines.filter((p) => canAccessPipelineClient(p.id, ctx));
}
