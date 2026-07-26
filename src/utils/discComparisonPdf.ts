// ─────────────────────────────────────────────────────────────────────────────
// discComparisonPdf — gera o "PDF de comparação" entre DOIS funcionários no
// Perfil Comportamental (DISC) como Blob.
//
// Renderiza <DiscComparisonDocument /> num container OFFSCREEN via createRoot,
// aguarda o recharts (radares cruzados) medir/desenhar + as imagens (logo)
// carregarem, captura com renderElementToPdfBlob (pdfPageRenderer) e devolve o
// Blob.
//
// O documento recebe `locale` por prop e lê MESSAGES direto — NÃO depende de
// AppLocaleProvider.
//
// ⚠️ QA obrigatório no navegador: recharts dentro de html2canvas offscreen é o
// ponto mais frágil (medição + timing). Se os radares saírem vazios/cortados no
// PDF, aumentar RENDER_SETTLE_MS abaixo.
// ─────────────────────────────────────────────────────────────────────────────

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderElementToPdfBlob } from '@/utils/pdfPageRenderer';
import {
  DiscComparisonDocument,
  type DiscComparisonDocumentProps,
} from '@/components/employees/disc/DiscComparisonDocument';

// Tempo de acomodação após montar: recharts precisa de alguns frames pra medir o
// ResponsiveContainer e desenhar o SVG dos radares antes do html2canvas capturar.
const RENDER_SETTLE_MS = 500;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export async function generateDiscComparisonPdf(
  props: DiscComparisonDocumentProps,
): Promise<Blob> {
  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed; left:-9999px; top:0; width:794px; background:#ffffff; z-index:-1;';
  document.body.appendChild(container);

  const root = createRoot(container);
  try {
    root.render(createElement(DiscComparisonDocument, props));

    // 2x rAF pra garantir layout, depois settle pro recharts desenhar.
    await nextFrame();
    await nextFrame();
    await new Promise((r) => setTimeout(r, RENDER_SETTLE_MS));

    const el = container.firstElementChild as HTMLElement | null;
    if (!el) throw new Error('Falha ao montar a comparação para geração do PDF.');

    return await renderElementToPdfBlob(el);
  } finally {
    // Desmonta fora do ciclo de render pra não estourar warning do React.
    root.unmount();
    container.remove();
  }
}
