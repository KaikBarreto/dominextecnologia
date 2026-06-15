import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FileDown, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DOMINEX_LOGO_BLACK_BASE64 } from '@/utils/dominexLogoBase64';
import { downloadTermsOfUsePdf } from '@/utils/termsOfUsePdfGenerator';
import {
  TERMS_SECTIONS,
  DOMINEX_LEGAL,
  TERMS_INTRO,
  TERMS_META_LINE,
} from '@/data/termsOfUse';
import { useTermsOfService } from '@/hooks/useTermsOfService';
import { formatBrtDateTime } from '@/lib/date-br';

interface TermsOfServiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Modo leitura (Configurações): fecha normalmente e mostra apenas "Baixar PDF".
   * Quando false/ausente, o modal é de ACEITE obrigatório: bloqueia ESC, clique
   * fora e botão X — único caminho de fechamento é aceitar os termos.
   */
  readOnly?: boolean;
}

/** Renderiza **negrito inline** dentro do JSX, preservando o resto como texto. */
function renderTextWithBold(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export const TermsOfServiceModal = ({
  open,
  onOpenChange,
  readOnly = false,
}: TermsOfServiceModalProps) => {
  const [accepted, setAccepted] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const { acceptTerms, isAccepting, acceptedAt } = useTermsOfService();
  // Só no modo leitura mostramos a data do aceite (no modo obrigatório a
  // pessoa ainda não aceitou). `formatBrtDateTime` devolve null se vazio.
  const acceptedAtLabel = readOnly ? formatBrtDateTime(acceptedAt) : null;

  // No modo aceite o modal é "travado": não fecha por ESC / clique fora / X.
  const isLocked = !readOnly;

  const handleDownloadPdf = async () => {
    try {
      setGeneratingPdf(true);
      await downloadTermsOfUsePdf();
    } catch (err) {
      console.error('[TermsOfServiceModal] erro ao gerar PDF:', err);
      toast.error('Erro ao gerar o PDF dos termos. Tente novamente.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleAccept = () => {
    acceptTerms(undefined, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isLocked) onOpenChange(o); }}>
      <DialogContent
        // No modo travado escondemos o X do canto (botão filho do DialogContent)
        // e bloqueamos ESC / clique fora / interação externa.
        className={cn(
          'flex flex-col gap-0 p-0 w-[95vw] max-w-3xl max-h-[92dvh] overflow-hidden',
          isLocked && '[&>button]:hidden',
        )}
        aria-describedby={undefined}
        onEscapeKeyDown={(e) => { if (isLocked) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (isLocked) e.preventDefault(); }}
        onInteractOutside={(e) => { if (isLocked) e.preventDefault(); }}
      >
        {/* Cabeçalho com logo + título */}
        <div className="bg-background border-b border-border px-4 py-3 md:p-6 shrink-0">
          <div className="flex flex-col items-center gap-2 md:gap-3">
            <img
              src={DOMINEX_LOGO_BLACK_BASE64}
              alt="Dominex"
              className="h-7 sm:h-9 md:h-11 w-auto dark:invert"
            />
            <h1 className="text-sm sm:text-base md:text-xl font-bold text-center uppercase tracking-tight leading-tight text-foreground">
              Termos de Uso — Dominex
            </h1>
          </div>
          <p className="mt-2 md:mt-4 text-[11px] sm:text-xs md:text-sm text-muted-foreground text-center leading-snug md:leading-relaxed">
            {TERMS_INTRO}
          </p>
          <p className="mt-1.5 md:mt-2 text-[10px] sm:text-[11px] md:text-xs text-muted-foreground text-center leading-tight">
            {TERMS_META_LINE}
          </p>
          {acceptedAtLabel && (
            <p className="mt-1 text-[10px] sm:text-[11px] md:text-xs text-muted-foreground text-center leading-tight flex items-center justify-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 md:h-3.5 md:w-3.5 text-green-600 dark:text-green-500 shrink-0" />
              Aceito em {acceptedAtLabel}
            </p>
          )}
        </div>

        {/* Corpo com scroll — div nativo (overflow-y-auto) é mais confiável que
            o ScrollArea do Radix dentro de flex com altura por max-h. */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 md:px-6 md:py-4">
          <div className="space-y-4 md:space-y-6 pr-1">
            {TERMS_SECTIONS.map((section, sectionIndex) => (
              <div
                key={sectionIndex}
                className="border-b border-border pb-3 md:pb-4 last:border-0"
              >
                <h2 className="text-sm sm:text-base md:text-lg font-bold uppercase mb-2 md:mb-3 text-foreground">
                  {section.title}
                </h2>
                <div className="space-y-2 md:space-y-3">
                  {section.items.map((item, itemIndex) => (
                    <div
                      key={itemIndex}
                      className="text-[11px] sm:text-xs md:text-sm leading-snug md:leading-relaxed text-foreground"
                    >
                      {(item.subtitle || item.text) && (
                        <p>
                          {item.subtitle && (
                            <span className="font-semibold">{item.subtitle} </span>
                          )}
                          {item.text && renderTextWithBold(item.text)}
                        </p>
                      )}
                      {item.list && (
                        <ul className="ml-4 md:ml-6 mt-1.5 md:mt-2 space-y-1">
                          {item.list.map((listItem, listIndex) => (
                            <li key={listIndex} className="text-muted-foreground">
                              • {renderTextWithBold(listItem)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rodapé institucional */}
        <div className="border-t border-border bg-muted/30 px-4 py-2 md:px-6 md:py-3 shrink-0">
          <p className="text-[9px] sm:text-[10px] md:text-xs text-center text-muted-foreground leading-tight">
            {DOMINEX_LEGAL.site} | {DOMINEX_LEGAL.razaoSocial} | CNPJ: {DOMINEX_LEGAL.cnpj}
          </p>
        </div>

        {/* Ações */}
        {readOnly ? (
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 px-4 pb-4 pt-3 md:px-6 md:pb-6 shrink-0 border-t border-border/50 bg-background">
            <Button
              variant="outline"
              onClick={handleDownloadPdf}
              disabled={generatingPdf}
              className="w-full sm:flex-1 h-10 gap-2"
            >
              <FileDown className="h-4 w-4" />
              {generatingPdf ? 'Gerando PDF...' : 'Baixar PDF'}
            </Button>
            <Button
              variant="default"
              onClick={() => onOpenChange(false)}
              className="w-full sm:flex-1 h-10"
            >
              Fechar
            </Button>
          </div>
        ) : (
          <div className="space-y-3 md:space-y-4 px-4 pb-4 pt-3 md:px-6 md:pb-6 shrink-0 border-t border-border/50 bg-background">
            <label
              htmlFor="accept-terms"
              className="flex items-start gap-3 p-3 md:p-4 border-2 border-primary/30 rounded-lg bg-primary/5 cursor-pointer"
            >
              <Checkbox
                id="accept-terms"
                checked={accepted}
                onCheckedChange={(checked) => setAccepted(checked === true)}
                className="mt-0.5 shrink-0"
              />
              <span className="text-[11px] sm:text-xs md:text-sm font-medium leading-snug md:leading-relaxed">
                Li e concordo com os Termos de Uso do Dominex
              </span>
            </label>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
              <Button
                variant="outline"
                onClick={handleDownloadPdf}
                disabled={generatingPdf}
                className="h-11 sm:h-10 gap-2"
              >
                <FileDown className="h-4 w-4" />
                {generatingPdf ? 'Gerando PDF...' : 'Baixar PDF'}
              </Button>
              <Button
                onClick={handleAccept}
                disabled={!accepted || isAccepting}
                className="h-11 sm:h-10 min-w-[150px] font-semibold"
              >
                {isAccepting ? 'Confirmando...' : 'Aceito os Termos'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
