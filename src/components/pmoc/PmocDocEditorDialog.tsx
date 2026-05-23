import { useEffect, useState } from 'react';
import { Loader2, RotateCcw, Save } from 'lucide-react';
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
import { PmocRichTextEditor } from './PmocRichTextEditor';

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
  /** Loader externo (vem do hook). */
  isSaving?: boolean;
  /** Dica explicativa exibida acima do editor. */
  helperText?: string;
}

export function PmocDocEditorDialog({
  open,
  onOpenChange,
  title,
  initialHtml,
  defaultHtml,
  onSave,
  onResetToDefault,
  isSaving = false,
  helperText,
}: PmocDocEditorDialogProps) {
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
      <div className="flex items-center gap-2">
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
      >
        <div className="space-y-3 pt-1">
          {helperText && (
            <p className="rounded-md border border-info/30 bg-info/10 px-3 py-2 text-xs text-info">
              {helperText}
            </p>
          )}
          <PmocRichTextEditor
            value={html}
            onChange={handleChange}
            minHeight={280}
            placeholder="Edite o texto do documento PMOC…"
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
