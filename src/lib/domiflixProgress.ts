/**
 * Regras de gravação de progresso da Domiflix.
 *
 * Existem DOIS caminhos de escrita em `domiflix_user_progress` na tela do
 * player (`DomiflixWatch.tsx`):
 *   1. `saveProgressAsync`     → upsert via supabase-js (save periódico de 20s)
 *   2. `saveProgressKeepalive` → `fetch` cru com `keepalive: true` no REST,
 *      pra sobreviver ao unload/navegação
 *
 * Os dois montam o payload por AQUI, então qualquer guarda escrita nesta
 * função vale pros dois. Não duplicar essa lógica no call site.
 */

export interface DomiflixProgressPayload {
  user_id: string;
  episode_id: string;
  title_id: string;
  completed: boolean;
  watched_at: string;
  progress_seconds: number;
  duration_seconds: number;
}
/** Linha já existente do usuário pra esse episódio (se houver). */
export interface DomiflixExistingProgress {
  completed?: boolean | null;
  progress_seconds?: number | null;
  duration_seconds?: number | null;
}

export interface BuildDomiflixProgressPayloadInput {
  userId: string | null | undefined;
  episodeId: string | null | undefined;
  titleId: string | null | undefined;
  /** Segundo atual do player. */
  progressSeconds: number;
  /** Duração total lida do player (0 enquanto os metadados não carregaram). */
  durationSeconds: number;
  /** Progresso já salvo pra esse episódio, se o usuário já assistiu antes. */
  existing?: DomiflixExistingProgress | null;
  /** Injetável pra teste. */
  now?: Date;
}

/** Fração do vídeo a partir da qual o episódio conta como concluído. */
export const DOMIFLIX_COMPLETION_RATIO = 0.9;

/**
 * Monta o payload de progresso, ou `null` quando não há nada que valha a pena
 * gravar (sem sessão/episódio, ou menos de 2 segundos assistidos).
 *
 * Guardas contra regressão de progresso (bug do "reabrir aula concluída"):
 * - `completed` é MONOTÔNICO: uma vez `true`, nunca volta pra `false`.
 *   Reassistir uma aula concluída não desfaz a conclusão.
 * - `duration_seconds` nunca é zerado: enquanto o player não reporta a
 *   duração, reaproveita a duração já salva.
 */
export function buildDomiflixProgressPayload({
  userId,
  episodeId,
  titleId,
  progressSeconds: rawProgressSeconds,
  durationSeconds: rawDurationSeconds,
  existing,
  now,
}: BuildDomiflixProgressPayloadInput): DomiflixProgressPayload | null {
  if (!userId || !episodeId || !titleId) return null;

  const rawProgress = Math.round(rawProgressSeconds || 0);
  const rawDuration = Math.round(rawDurationSeconds || 0);

  // Enquanto o player não reporta duração, mantém a que já estava salva —
  // gravar 0 apagaria a barra de progresso da lista de episódios.
  const knownDuration = Math.max(0, Math.round(existing?.duration_seconds ?? 0));
  const duration = Math.max(0, rawDuration) || knownDuration;

  const progressSeconds = duration > 0 ? Math.min(rawProgress, duration) : rawProgress;
  if (progressSeconds <= 1) return null;

  const completedNow = duration > 0 ? progressSeconds / duration > DOMIFLIX_COMPLETION_RATIO : false;

  return {
    user_id: userId,
    episode_id: episodeId,
    title_id: titleId,
    // Conclusão não regride: reassistir do começo não tira o "concluído".
    completed: existing?.completed === true ? true : completedNow,
    watched_at: (now ?? new Date()).toISOString(),
    progress_seconds: progressSeconds,
    duration_seconds: duration,
  };
}
