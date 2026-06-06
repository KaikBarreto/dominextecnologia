import { useEffect, useState } from 'react';
import { Loader2, RotateCcw, Save, Building2 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PmocRichTextEditor } from './PmocRichTextEditor';
import type { PmocVariableContext } from '@/utils/pmocVariables';

/**
 * Modal de edição rich-text dos termos PMOC (Onda C — v1.9.x).
 *
 * Usado pelo gestor pra editar:
 *  - Termo de Responsabilidade Técnica
 *  - Certificado de Conformidade
 *
 * Comportamento:
 *  - ResponsiveModal: drawer no mobile, dialog no desktop
 *    (regra de memória `feedback_modais_mobile_sao_drawer`).
 *  - "Salvar" persiste o HTML via callback `onSave`.
 *  - "Restaurar texto padrão" abre AlertDialog confirmando — sobrescreve com
 *    o template-base (NULL no banco).
 *  - Fechar com alterações pendentes pede confirmação.
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-C-dossie-cronograma.md §5.3 (passo 6)
 */

export interface PmocDocEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** HTML atual (do banco). Quando vazio/null, usa `defaultHtml`. */
  initialHtml: string | null | undefined;
  /** Template-base, mostrado quando não há texto customizado. */
  defaultHtml: string;
  /** Salva HTML editado. */
  onSave: (html: string) => Promise<void>;
  /** Reset pra template padrão (envia NULL no banco). Opcional. */
  onResetToDefault?: () => Promise<void>;
  /**
   * Carrega no editor o conteúdo do MODELO PADRÃO da empresa pro doc atual.
   * Retorna o HTML a popular (NÃO salva sozinho — só popula). Opcional; quando
   * ausente, o botão "Puxar template padrão da empresa" não aparece.
   */
  onPullCompanyTemplate?: () => string;
  /**
   * Desabilita o botão "Puxar template padrão da empresa" (ex: empresa nunca
   * definiu modelo). Quando true, o botão fica desabilitado com tooltip.
   */
  pullCompanyTemplateDisabled?: boolean;
  /** Loader externo (vem do hook). */
  isSaving?: boolean;
  /** Dica explicativa exibida acima do editor. */
  helperText?: string;
  /**
   * Contexto runtime das variáveis PMOC. Usado pelo editor pra pintar badges
   * (azul = valor cheio, vermelho = vazio). Opcional — sem ele, badges sempre
   * mostram "(vazio)".
   */
  templateContext?: PmocVariableContext | null;
}

export function PmocDocEditorDialog({
  open,
  onOpenChange,
  title,
  initialHtml,
  defaultHtml,
  onSave,
  onResetToDefault,
  onPullCompanyTemplate,
  pullCompanyTemplateDisabled = false,
  isSaving = false,
  helperText,
  templateContext,
}: PmocDocEditorDialogProps) {
  const isMobile = useIsMobile();
  const seed = initialHtml && initialHtml.trim() !== '' ? initialHtml : defaultHtml;
  const [html, setHtml] = useState<string>(seed);
  const [isDirty, setIsDirty] = useState(false);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Sincroniza quando reabrir com novo conteúdo
  useEffect(() => {
    if (open) {
      const fresh = initialHtml && initialHtml.trim() !== '' ? initialHtml : defaultHtml;
      setHtml(fresh);
      setIsDirty(false);
    }
  }, [open, initialHtml, defaultHtml]);

  const handleChange = (next: string) => {
    setHtml(next);
    setIsDirty(true);
  };

  const handleSave = async () => {
    try {
      await onSave(html);
      setIsDirty(false);
      onOpenChange(false);
    } catch {
      // Toast já é emitido pelo hook
    }
  };

  const handleAttemptClose = (next: boolean) => {
    if (!next && isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    onOpenChange(next);
  };

  const handleConfirmDiscard = () => {
    setShowDiscardConfirm(false);
    setIsDirty(false);
    onOpenChange(false);
  };

  const handlePullCompanyTemplate = () => {
    if (!onPullCompanyTemplate) return;
    const incoming = onPullCompanyTemplate();
    setHtml(incoming);
    setIsDirty(true);
    // Não salva — o gestor revisa e salva (igual ao "Restaurar texto padrão").
  };

  const handleResetConfirmed = async () => {
    setShowResetConfirm(false);
    if (!onResetToDefault) return;
    try {
      await onResetToDefault();
      // Conteúdo volta pro template — usuário vê o default na próxima abertura.
      setHtml(defaultHtml);
      setIsDirty(false);
      onOpenChange(false);
    } catch {
      // Toast já emitido
    }
  };

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        {onResetToDefault && (
          <Button
            type="button"
            variant="edit-ghost"
            size="sm"
            onClick={() => setShowResetConfirm(true)}
            disabled={isSaving}
            className="min-h-[40px]"
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Restaurar texto padrão
          </Button>
        )}
        {onPullCompanyTemplate && (
          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* span wrapper: botão desabilitado não dispara tooltip sozinho */}
                <span className="inline-flex">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePullCompanyTemplate}
                    disabled={isSaving || pullCompanyTemplateDisabled}
                    className="min-h-[40px]"
                  >
                    <Building2 className="mr-1 h-3.5 w-3.5" />
                    Puxar template padrão da empresa
                  </Button>
                </span>
              </TooltipTrigger>
              {pullCompanyTemplateDisabled && (
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Sua empresa ainda não definiu um modelo padrão para este documento.
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => handleAttemptClose(false)}
          disabled={isSaving}
          className="min-h-[40px]"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={isSaving || !isDirty}
          className="min-h-[40px]"
        >
          {isSaving ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1 h-3.5 w-3.5" />
          )}
          Salvar
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={handleAttemptClose}
        title={title}
        footer={footer}
        // Onda G: desktop ganha até 1024px de largura pra edição confortável
        // de textos longos. No mobile, ResponsiveModal vira drawer full-height
        // (não regride — `sm:` aplica só ≥640px).
        className="sm:!max-w-5xl"
      >
        <div className="space-y-3 px-1 pt-1 sm:px-2">
          {helperText && (
            <p className="rounded-md border border-info/30 bg-info/10 px-3 py-2 text-xs text-info">
              {helperText}
            </p>
          )}
          <PmocRichTextEditor
            value={html}
            onChange={handleChange}
            // Mobile: 280px (cabe na altura do drawer com o teclado).
            // Desktop: 520px — área de edição respira mais pra textos longos.
            // O componente já tem max-h interno de 60vh + overflow-y, então
            // não estoura tela.
            minHeight={isMobile ? 280 : 520}
            placeholder="Edite o texto do documento PMOC…"
            templateContext={templateContext}
          />
          <p className="text-[11px] text-muted-foreground">
            Este texto será embutido no PDF do dossiê PMOC ao gerar uma nova versão.
          </p>
        </div>
      </ResponsiveModal>

      {/* Confirm reset */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar texto padrão?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai sobrescrever suas edições com o template original. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetConfirmed}
              disabled={isSaving}
              className="bg-warning text-warning-foreground hover:bg-warning/90"
            >
              {isSaving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />}
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm discard dirty */}
      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem alterações não salvas. Se sair agora, elas serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
