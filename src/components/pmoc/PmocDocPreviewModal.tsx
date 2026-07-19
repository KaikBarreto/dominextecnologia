import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { PenLine } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { substituteVariables, buildPreviewContext } from '@/utils/pmocVariables';
import type { PmocVariableContext } from '@/utils/pmocVariables';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

/**
 * Prévia do documento PMOC (folha A4 branca).
 *
 * Mostra o conteúdo ATUAL do editor rich-text já com as variáveis substituídas.
 * A prévia é SEMPRE preenchida: usamos `buildPreviewContext`, que prioriza o
 * valor REAL do `templateContext` e cai em valores genéricos de exemplo
 * (`PMOC_PREVIEW_SAMPLE`) pro que estiver faltando. Assim a prévia do template
 * padrão da empresa (sem contrato/cliente) aparece toda preenchida com exemplos,
 * e a prévia de um contrato mostra dados reais + genérico só onde faltar. Nunca
 * cai na linha pontilhada.
 *
 * Sanitização: o HTML vem do nosso próprio editor (conteúdo controlado pelo
 * TipTap), mas aplicamos DOMPurify como segunda camada antes do
 * `dangerouslySetInnerHTML`, espelhando a whitelist do `PmocRichTextEditor`.
 *
 * Mobile-first: a folha A4 cabe na largura da tela (scroll vertical); no
 * desktop aparece centralizada com cara de folha (sombra + margens).
 */

export interface PmocDocPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** HTML atual do editor (com nós `<span data-pmoc-var>`). */
  html: string;
  /** Contexto runtime das variáveis. Ausente = template da empresa. */
  templateContext?: PmocVariableContext | null;
}

/** Sanitiza o HTML já substituído antes de renderizar na folha de prévia. */
function sanitizePreviewHtml(input: string): string {
  if (!input) return '';
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u',
      'ul', 'ol', 'li',
      'h2', 'h3',
      'a', 'span', 'div',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}

export function PmocDocPreviewModal({
  open,
  onOpenChange,
  html,
  templateContext,
}: PmocDocPreviewModalProps) {
  const { locale } = useAppLocaleContext();
  const dp = MESSAGES[locale].app.pmoc.docPreview;

  // Contexto da prévia: valores reais quando existem, genéricos de exemplo pro
  // que faltar. Garante folha SEMPRE preenchida (nunca linha pontilhada).
  const previewContext = useMemo(
    () => buildPreviewContext(templateContext),
    [templateContext],
  );

  // Substitui variáveis pelo previewContext e sanitiza o resultado. Memoizado
  // pra não reprocessar a cada render.
  const renderedHtml = useMemo(() => {
    const substituted = substituteVariables(html || '', previewContext);
    return sanitizePreviewHtml(substituted);
  }, [html, previewContext]);

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={dp.title}
      className="sm:!max-w-4xl"
    >
      {/* Fundo neutro pra a folha branca "saltar" como documento. */}
      <div className="flex justify-center bg-muted/40 px-2 py-4 sm:px-6 sm:py-6">
        {/* Folha A4 retrato: largura limitada a 210mm, proporção mantida pelo
            conteúdo (cresce verticalmente conforme o texto). No mobile ocupa a
            largura toda; no desktop fica centralizada com cara de folha. */}
        <div className="w-full max-w-[210mm] rounded-sm bg-white text-black shadow-lg ring-1 ring-black/5">
          <div
            className="pmoc-preview-sheet px-6 py-8 sm:px-12 sm:py-14"
            // Conteúdo controlado (TipTap) + sanitizado acima.
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />

          {/* Rodapé da folha: bloco visual demarcando onde a assinatura do RT
              entra no PDF. Espelha o bloco automático do signature-embed.ts:
              "X" marcando o ponto → linha → nome do RT → modalidade/CFT. */}
          <div className="border-t border-dashed border-black/20 px-6 pb-8 pt-8 sm:px-12">
            <div className="mx-auto max-w-xs text-center">
              {/* "X" grande e discreto marcando onde assinar ("assine aqui"). */}
              <div
                className="select-none text-3xl font-semibold leading-none text-black/25"
                aria-hidden="true"
              >
                ✗
              </div>
              {/* Linha de assinatura. */}
              <div className="mt-1 border-b border-black/50" aria-hidden="true">
                &nbsp;
              </div>
              {/* Nome do RT (do contexto da prévia: real ou genérico). */}
              <p className="mt-1.5 text-[12px] font-semibold text-black/80">
                {previewContext['rt.nome']}
              </p>
              {/* Modalidade + CFT, em linha menor e cinza. */}
              <p className="text-[10px] text-black/50">
                {previewContext['rt.modalidade']} — CFT {previewContext['rt.cft_crea']}
              </p>
            </div>
            <p className="mt-5 flex items-center justify-center gap-1.5 text-[10px] leading-snug text-black/40">
              <PenLine className="h-3 w-3 shrink-0" aria-hidden="true" />
              {dp.signatureFooter}
            </p>
          </div>
        </div>
      </div>

      {/* Estilos básicos das tags do documento — isolados na folha de prévia
          pra ficar legível como papel (independe do tema dark da app). */}
      <style>{`
        .pmoc-preview-sheet {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 14px;
          line-height: 1.7;
          color: #1a1a1a;
        }
        .pmoc-preview-sheet h2 {
          font-size: 18px;
          font-weight: 700;
          margin: 0 0 0.6em;
        }
        .pmoc-preview-sheet h3 {
          font-size: 15px;
          font-weight: 700;
          margin: 1em 0 0.4em;
        }
        .pmoc-preview-sheet p {
          margin: 0 0 0.8em;
          text-align: justify;
        }
        .pmoc-preview-sheet strong, .pmoc-preview-sheet b {
          font-weight: 700;
        }
        .pmoc-preview-sheet em, .pmoc-preview-sheet i {
          font-style: italic;
        }
        .pmoc-preview-sheet u {
          text-decoration: underline;
        }
        .pmoc-preview-sheet ul, .pmoc-preview-sheet ol {
          margin: 0 0 0.8em;
          padding-left: 1.5em;
        }
        .pmoc-preview-sheet li {
          margin: 0 0 0.3em;
        }
        .pmoc-preview-sheet a {
          color: #1d4ed8;
          text-decoration: underline;
        }
      `}</style>
    </ResponsiveModal>
  );
}
