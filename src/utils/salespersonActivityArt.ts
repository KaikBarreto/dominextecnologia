// ─────────────────────────────────────────────────────────────────────────────
// salespersonActivityArt — gera a arte compartilhável (PNG 1080×1350) do
// período de atividade comercial de um vendedor e oferece baixar/compartilhar.
//
// Espelha o padrão já usado em `processPopPdf.ts`/`discDossierPdf.ts`: monta
// <ActivityArtCard /> num container OFFSCREEN via createRoot, espera fontes +
// layout assentarem, captura e desmonta em `finally`.
//
// Captura via `html-to-image` (toBlob) — NÃO `html2canvas`: já nos custou bug
// com SVG rasterizado no tamanho intrínseco (ver `graphExport.ts`).
//
// As funções puras (`activityArtFileName`, `formatConversionRate`,
// `goalProgress`) vivem em `@/utils/activityArtFormat` e são reexportadas aqui:
// única fonte de verdade do cálculo, sem ciclo de import com o componente.
// ─────────────────────────────────────────────────────────────────────────────

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ActivityArtCard,
  type ActivityArtCardProps,
} from '@/components/admin/salesperson/ActivityArtCard';
import { activityArtFileName } from '@/utils/activityArtFormat';

// As puras moram em `activityArtFormat` (módulo sem React) pra não fechar ciclo
// card → gerador → card. Reexportadas aqui porque este é o ponto de entrada
// público da arte: quem já importa daqui não precisa saber da reorganização.
export type { ActivityPeriod, GoalProgressResult } from '@/utils/activityArtFormat';
export { activityArtFileName, formatConversionRate, goalProgress } from '@/utils/activityArtFormat';

/** Igual a `ActivityArtCardProps`, exceto que recebe a URL remota da foto em
 * vez da data URL já pronta — o pré-carregamento acontece aqui dentro. */
export interface ActivityArtInput extends Omit<ActivityArtCardProps, 'salespersonPhotoDataUrl'> {
  salespersonPhotoUrl: string | null;
}

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;

// setTimeout e NÃO requestAnimationFrame: o navegador congela o rAF em aba de
// fundo, e a geração ficava presa quando a aba roubava o foco (mesma lição de
// `processPopPdf.ts`/`discDossierPdf.ts`).
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const RENDER_SETTLE_MS = 200;


// ─────────────────────────────────────────────────────────────────────────────
// Geração da imagem
// ─────────────────────────────────────────────────────────────────────────────

/** Busca a foto remota e converte em data URL ANTES da captura — imagem
 * remota não pré-carregada sai em branco no html-to-image (CORS/timing).
 * Falha no fetch não derruba a geração: cai no monograma (retorna null). */
async function preloadPhotoAsDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler a foto do vendedor.'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Gera o PNG da arte de atividade e devolve o Blob (sem baixar/compartilhar). */
export async function generateActivityArtBlob(data: ActivityArtInput): Promise<Blob> {
  const { salespersonPhotoUrl, ...cardData } = data;
  const salespersonPhotoDataUrl = await preloadPhotoAsDataUrl(salespersonPhotoUrl);

  const container = document.createElement('div');
  container.style.cssText =
    `position:fixed; left:-9999px; top:0; width:${CARD_WIDTH}px; height:${CARD_HEIGHT}px; background:#0C0C0C; z-index:-1;`;
  document.body.appendChild(container);

  const root = createRoot(container);
  try {
    root.render(createElement(ActivityArtCard, { ...cardData, salespersonPhotoDataUrl }));

    // Espera as fontes carregarem — senão o texto sai com fonte de fallback e
    // o layout desencontra (medidas diferentes da versão final).
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // best-effort — segue com o que já carregou
      }
    }

    await delay(60);
    await delay(RENDER_SETTLE_MS);

    const el = container.firstElementChild as HTMLElement | null;
    if (!el) throw new Error('Falha ao montar a arte de atividade.');

    const { toBlob } = await import('html-to-image');
    const blob = await toBlob(el, {
      pixelRatio: 2,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      backgroundColor: '#0C0C0C',
    });

    if (!blob) throw new Error('Falha ao gerar a imagem da atividade.');
    return blob;
  } finally {
    // Desmonta fora do ciclo de render pra não estourar warning do React.
    root.unmount();
    container.remove();
  }
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Gera a arte e baixa direto (sem abrir nova aba). */
export async function downloadActivityArtPng(data: ActivityArtInput): Promise<void> {
  const blob = await generateActivityArtBlob(data);
  const filename = activityArtFileName(data.salespersonName, data.activityDate, data.period);
  triggerBlobDownload(blob, filename);
}

/** Gera a arte e compartilha via Web Share API quando disponível (com
 * arquivo); cai pro download quando a API não existe, não suporta arquivo, ou
 * o compartilhamento falha por um motivo que não seja cancelamento do usuário. */
export async function shareActivityArtPng(data: ActivityArtInput): Promise<void> {
  const blob = await generateActivityArtBlob(data);
  const filename = activityArtFileName(data.salespersonName, data.activityDate, data.period);
  const file = new File([blob], filename, { type: 'image/png' });

  const canShareFile =
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] });

  if (canShareFile) {
    try {
      await navigator.share({ files: [file], title: 'Atividade comercial' });
      return;
    } catch (err) {
      // Cancelado pelo usuário: não é erro, não cai no fallback de download
      // (senão o PNG baixa sozinho depois de o vendedor desistir de compartilhar).
      if (err instanceof Error && err.name === 'AbortError') return;
      // Qualquer outro motivo de falha: cai no download abaixo.
    }
  }

  triggerBlobDownload(blob, filename);
}
