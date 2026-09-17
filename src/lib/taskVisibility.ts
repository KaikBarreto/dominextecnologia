/**
 * Régua ÚNICA de "quem enxerga qual tarefa" no client.
 *
 * Existe porque a mesma tarefa aparece em duas telas — a Agenda (`Schedule`) e
 * a aba Tarefas do CRM — e o plano da Onda E registrou como risco explícito as
 * duas divergirem: "se divergirem em regra de filtro, o usuário perde a
 * confiança nas duas". Então a regra mora aqui, e as duas telas importam.
 *
 * ⚠️ Esta régua é a metade de UX. A metade de segurança é a RLS
 * (`Tarefas visiveis a quem e responsavel`, migration
 * `20260919120000_tarefa_visibilidade_manage_tasks.sql`). As duas existem por
 * lei do projeto — filtro de client nunca substitui RLS.
 *
 * ⚠️ E as duas NÃO são idênticas de propósito, num ponto só: o usuário legado
 * (sem linha em `user_permissions`). A RLS **libera** — é o fallback que
 * impede a regra de trancar a base inteira de empresas que nunca configuraram
 * permissão. O client **nega**, decisão anterior tomada na Agenda ("sem o
 * acesso explícito, a tarefa só aparece pra quem é responsável por ela").
 * A direção é segura: a tela mostra MENOS que o banco permite, nunca mais.
 * O que não podia continuar era uma tela negar e a outra não.
 */

/** Chaves de permissão que dão visão total das tarefas. */
const FULL_TASK_ACCESS_KEYS = ['*', 'fn:view_all_schedule', 'fn:manage_tasks'] as const;

export interface TaskVisibilityIdentity {
  roles: string[];
  permissions: string[];
  /** true = a pessoa TEM linha em `user_permissions` e é avaliada estritamente. */
  hasPermissionRecord: boolean;
}

/**
 * Vê as tarefas de todo mundo?
 *
 * `fn:manage_tasks` ("Gerenciar Tarefas") cobre todas as tarefas.
 * `fn:view_all_schedule` ("Ver Toda a Agenda") cobre as do calendário — aqui no
 * client as duas liberam a listagem, e é a RLS que faz o recorte fino da tarefa
 * de CRM que nunca vai pro calendário (`show_in_schedule = false`).
 */
export function canSeeAllTasks({ roles, permissions, hasPermissionRecord }: TaskVisibilityIdentity): boolean {
  // Arrays com default: identidade ainda carregando (ou mock de teste
  // incompleto) tem que cair em "não vê tudo", nunca estourar nem liberar.
  const r = roles ?? [];
  const p = permissions ?? [];
  if (r.includes('admin') || r.includes('super_admin')) return true;
  if (!hasPermissionRecord) return false;
  return FULL_TASK_ACCESS_KEYS.some((key) => p.includes(key));
}

/** O mínimo que uma tarefa precisa expor pra ser avaliada. */
export interface TaskLike {
  technician_id?: string | null;
  team_id?: string | null;
  created_by?: string | null;
  _assignee_user_ids?: string[];
}

/**
 * A tarefa é "minha"? Espelha as cláusulas de posse da RLS, na mesma ordem:
 * responsável explícito, técnico legado, criador, ou membro da equipe dela.
 */
export function isMyTask(task: TaskLike, userId: string | undefined, myTeamIds: string[]): boolean {
  if (!userId) return false;
  if (task._assignee_user_ids?.includes(userId)) return true;
  if (task.technician_id === userId) return true;
  if (task.created_by === userId) return true;
  if (task.team_id && myTeamIds.includes(task.team_id)) return true;
  return false;
}
