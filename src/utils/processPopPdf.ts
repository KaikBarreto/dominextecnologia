// ─────────────────────────────────────────────────────────────────────────────
// processPopPdf — gera o POP (Procedimento Operacional Padrão) de um processo.
//
// Espelha `discDossierPdf.ts`: renderiza <ProcessPopDocument /> num container
// OFFSCREEN via createRoot, espera as imagens (logo do tenant + o desenho do
// fluxograma embutido) carregarem, captura com `renderElementToPdfBlob` e
// devolve o Blob.
//
// O documento recebe `locale` por prop e lê MESSAGES direto — não depende do
// AppLocaleProvider, então serve igual no app logado e numa tela pública.
// ─────────────────────────────────────────────────────────────────────────────

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderElementToPdfBlob } from '@/utils/pdfPageRenderer';
import {
  ProcessPopDocument,
  type ProcessPopDocumentProps,
} from '@/components/employees/processes/ProcessPopDocument';

// Tempo de acomodação após montar. Aqui não há recharts (o fluxograma entra
// como imagem pronta), então basta o layout assentar.
const RENDER_SETTLE_MS = 180;

// setTimeout e NÃO requestAnimationFrame: o navegador congela o rAF em aba de
// fundo, e a geração ficava presa quando a aba do PDF roubava o foco.
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function generateProcessPopPdf(props: ProcessPopDocumentProps): Promise<Blob> {
  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed; left:-9999px; top:0; width:794px; background:#ffffff; z-index:-1;';
  document.body.appendChild(container);

  const root = createRoot(container);
  try {
    root.render(createElement(ProcessPopDocument, props));

    await delay(60);
    await delay(RENDER_SETTLE_MS);

    const el = container.firstElementChild as HTMLElement | null;
    if (!el) throw new Error('Falha ao montar o POP para geração do PDF.');

    return await renderElementToPdfBlob(el);
  } finally {
    // Desmonta fora do ciclo de render pra não estourar warning do React.
    root.unmount();
    container.remove();
  }
}
