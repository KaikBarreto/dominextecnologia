import { FileText, RotateCcw } from 'lucide-react';
import { FullscreenWizardAction, FullscreenWizardNotice } from '@/components/ui/FullscreenWizard';

/** Recuperação não bloqueante para fluxos fullscreen; os demais usam DraftResumeDialog. */
export function DraftResumeNotice({ onResume, onDiscard, expiresAt, persistence, hasConflict }: {
  onResume: () => void;
  onDiscard: () => void;
  expiresAt?: number | null;
  persistence?: 'account' | 'local';
  hasConflict?: boolean;
}) {
  const expires = expiresAt && Number.isFinite(expiresAt)
    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(expiresAt)
    : null;
  return <FullscreenWizardNotice
    title={hasConflict ? 'Rascunho alterado em outro dispositivo' : 'Rascunho encontrado'}
    description={hasConflict
      ? 'A versão da conta mudou. Retomar abre essa versão; começar do zero substitui o rascunho da conta.'
      : persistence === 'account'
      ? `Este rascunho é seu e pode ser retomado em outro dispositivo.${expires ? ` Disponível até ${expires}; cada edição renova o prazo de 30 dias.` : ''}`
      : 'Retome o rascunho ou comece a preencher um novo orçamento.'}
    icon={<FileText />}
    actions={<>
      <FullscreenWizardAction variant="cancel" className="gap-1.5 px-3 text-sm sm:px-4" onClick={onDiscard}><RotateCcw className="hidden sm:block" />Começar do zero</FullscreenWizardAction>
      <FullscreenWizardAction className="gap-1.5 px-3 text-sm sm:px-4" onClick={onResume}><FileText />Retomar</FullscreenWizardAction>
    </>}
  />;
}
