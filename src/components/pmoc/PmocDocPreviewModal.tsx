import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { PenLine } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { substituteVariables } from '@/utils/pmocVariables';
import type { PmocVariableContext } from '@/utils/pmocVariables';

/**
 * Prévia do documento PMOC (folha A4 branca).
 *
 * Mostra o conteúdo ATUAL do editor rich-text já com as variáveis substituídas
 * pelos valores reais (via `substituteVariables`). Quando `templateContext` está
 * ausente (caso do template padrão da empresa, sem contrato/cliente), as
 * variáveis vazias caem na linha pontilhada — é o comportamento esperado
 * ("como está ficando").
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
  // Substitui variáveis pelo valor real (ou linha pontilhada quando vazio) e
  // sanitiza o resultado. Memoizado pra não reprocessar a cada render.
  const renderedHtml = useMemo(() => {
    const substituted = substituteVariables(html || '', templateContext);
    return sanitizePreviewHtml(substituted);
  }, [html, templateContext]);

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Prévia do documento"
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

          {/* Rodapé da folha: onde a assinatura do RT entrará no PDF. */}
          <div className="border-t border-dashed border-black/20 px-6 pb-8 pt-6 sm:px-12">
            <div className="mx-auto max-w-xs text-center">
              <div className="mb-1 border-b border-black/40" aria-hidden="true">
                &nbsp;
              </div>
              <p className="text-[11px] text-black/60">
                Assinatura do Responsável Técnico
              </p>
            </div>
            <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-snug text-black/50">
              <PenLine className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              A assinatura do Responsável Técnico é adicionada automaticamente no
              rodapé do PDF.
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
