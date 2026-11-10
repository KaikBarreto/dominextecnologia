type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

/**
 * Detecta quando a página está rodando pelo atalho/app instalado.
 *
 * O Safari no iOS pode salvar a URL em que o usuário tocou em
 * "Adicionar à Tela de Início", ignorando o start_url do manifesto. Assim,
 * uma instalação feita na landing volta a abrir `/` mesmo com o manifesto
 * apontando para `/dashboard`.
 */
export function isInstalledPwa(
  displayModeStandalone =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches,
  iosStandalone =
    typeof navigator !== "undefined" &&
    (navigator as NavigatorWithStandalone).standalone === true,
): boolean {
  return displayModeStandalone || iosStandalone;
}
