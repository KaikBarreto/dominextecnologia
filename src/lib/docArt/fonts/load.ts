// =============================================================================
// docArt/fonts/load.ts — Registra no navegador as mesmas faces que vão no PDF.
// =============================================================================
// O preview só é fiel se a tela medir e desenhar com a MESMA fonte que o
// pdf-lib embute. Por isso as faces não vêm do Google Fonts nem do sistema:
// vêm do mesmo base64 de `data.ts`, registradas via FontFace API com um nome
// próprio ("DocArt Sans" / "DocArt Display") para não colidir com uma
// Montserrat/Playfair que o usuário tenha instalada — métricas diferentes
// dariam quebra de linha diferente.
//
// O `data.ts` tem 100 KB, então entra por import DINÂMICO: quem nunca abre o
// editor de certificado não paga por ele.
// =============================================================================

const FACES: Array<{ family: string; weight: string; key: string }> = [
  { family: 'DocArt Display', weight: '400', key: 'DISPLAY_REGULAR' },
  { family: 'DocArt Display', weight: '700', key: 'DISPLAY_BOLD' },
  { family: 'DocArt Sans', weight: '400', key: 'SANS_REGULAR' },
  { family: 'DocArt Sans', weight: '700', key: 'SANS_BOLD' },
];

let pending: Promise<boolean> | null = null;

/**
 * Carrega as faces uma única vez por sessão. Resolve `true` quando o navegador
 * já pode medir com elas; `false` em ambiente sem FontFace (SSR, jsdom) ou se
 * o carregamento falhar — nesses casos o renderizador cai no fallback e o
 * preview fica aproximado, mas não quebra.
 */
export function loadDocArtFonts(): Promise<boolean> {
  if (pending) return pending;

  pending = (async () => {
    if (typeof document === 'undefined' || typeof FontFace === 'undefined') return false;
    try {
      const data = (await import('./data')) as unknown as Record<string, string>;
      await Promise.all(
        FACES.map(async ({ family, weight, key }) => {
          const base64 = data[key];
          if (!base64) return;
          const face = new FontFace(family, `url(data:font/ttf;base64,${base64})`, {
            weight,
            style: 'normal',
          });
          await face.load();
          document.fonts.add(face);
        }),
      );
      return true;
    } catch (err) {
      console.warn('[docArt] não foi possível carregar as fontes do certificado:', err);
      return false;
    }
  })();

  return pending;
}
