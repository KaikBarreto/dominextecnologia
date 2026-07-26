// ─────────────────────────────────────────────────────────────────────────────
// discDossierPdf — gera o "dossiê PDF" do Perfil Comportamental (DISC) como Blob.
//
// Renderiza <DiscDossierDocument /> num container OFFSCREEN via createRoot,
// aguarda o recharts (DiscRadar) medir/desenhar + as imagens (logo) carregarem,
// captura com renderElementToPdfBlob (pdfPageRenderer) e devolve o Blob.
//
// O documento recebe `locale` por prop e lê MESSAGES direto — NÃO depende de
// AppLocaleProvider, então funciona no app logado E na tela pública anônima.
//
// ⚠️ QA obrigatório no navegador: recharts (DiscRadar) dentro de html2canvas
// offscreen é o ponto mais frágil (medição + timing). Se a roda de competências
// sair vazia/cortada no PDF, aumentar RENDER_SETTLE_MS abaixo.
// ─────────────────────────────────────────────────────────────────────────────

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderElementToPdfBlob } from '@/utils/pdfPageRenderer';
import {
  DiscDossierDocument,
  type DiscDossierDocumentProps,
} from '@/components/employees/disc/DiscDossierDocument';

// Tempo de acomodação após montar: recharts precisa de alguns frames pra medir o
// ResponsiveContainer e desenhar o SVG do radar antes do html2canvas capturar.
const RENDER_SETTLE_MS = 500;

// Espera por setTimeout (NÃO requestAnimationFrame): o navegador CONGELA o rAF
// em abas de fundo, então a geração ficava presa quando a aba do PDF roubava o
// foco. setTimeout dispara mesmo em background (só throttla pra ~1s).
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function generateDiscDossierPdf(
  props: DiscDossierDocumentProps,
): Promise<Blob> {
  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed; left:-9999px; top:0; width:794px; background:#ffffff; z-index:-1;';
  document.body.appendChild(container);

  const root = createRoot(container);
  try {
    root.render(createElement(DiscDossierDocument, props));

    // Deixa o layout assentar, depois settle pro recharts desenhar. Via
    // setTimeout pra funcionar mesmo com a aba do PDF em primeiro plano.
    await delay(60);
    await delay(RENDER_SETTLE_MS);

    const el = container.firstElementChild as HTMLElement | null;
    if (!el) throw new Error('Falha ao montar o dossiê para geração do PDF.');

    return await renderElementToPdfBlob(el);
  } finally {
    // Desmonta fora do ciclo de render pra não estourar warning do React.
    root.unmount();
    container.remove();
  }
}
