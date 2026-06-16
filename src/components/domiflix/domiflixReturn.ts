/**
 * Persistência durável da origem de entrada na Domiflix.
 *
 * Problema que resolve: os pontos de entrada (TopNavbar / Sidebar / MoreMenu /
 * CommandPalette) navegam pra /domiflix passando `state.from = location.pathname`.
 * Mas navegação DENTRO da Domiflix (abrir título, assistir, perfil — tudo via
 * `navigate("/domiflix/...")` SEM state) apaga esse `from`. Quando o usuário clica
 * "Voltar ao sistema", o handler já não enxerga a origem e cai num fallback que
 * o mantém preso dentro da Domiflix.
 *
 * Solução: na ENTRADA (quando `state.from` existe e NÃO é uma rota /domiflix),
 * gravamos a origem no sessionStorage (durável durante a sessão da aba, não é
 * sobrescrita pela navegação interna que vem com state nulo). Os botões "Voltar
 * ao sistema" (desktop + mobile) leem dessa fonte durável.
 */

export const DOMIFLIX_RETURN_KEY = "domiflix_return_to";

function isExternalToDomiflix(path?: string | null): path is string {
  return !!path && path.length > 0 && !path.startsWith("/domiflix");
}

/**
 * Captura a origem de entrada na Domiflix.
 *
 * Só grava quando `from` aponta pra uma rota FORA da Domiflix — assim a navegação
 * interna (que chega com state nulo, ou eventualmente com from interno) nunca
 * sobrescreve a origem real do sistema principal.
 */
export function captureDomiflixOrigin(from?: string | null): void {
  if (!isExternalToDomiflix(from)) return;
  try {
    sessionStorage.setItem(DOMIFLIX_RETURN_KEY, from);
  } catch {
    // sessionStorage indisponível (modo privado / bloqueio) — ignora.
  }
}

/**
 * Resolve o caminho de retorno pro sistema principal.
 *
 * Retorna o 1º válido (não-vazio e que NÃO começa com "/domiflix") entre:
 *   1. `stateFrom` (caso o usuário tenha clicado direto de um ponto de entrada)
 *   2. o que foi persistido no sessionStorage na entrada
 * Se nenhum for válido, cai no "/dashboard" (mesmo fallback de antes).
 */
export function getDomiflixReturnPath(stateFrom?: string | null): string {
  if (isExternalToDomiflix(stateFrom)) return stateFrom;
  try {
    const stored = sessionStorage.getItem(DOMIFLIX_RETURN_KEY);
    if (isExternalToDomiflix(stored)) return stored;
  } catch {
    // sessionStorage indisponível — cai no fallback.
  }
  return "/dashboard";
}
