import { FileText, RotateCcw } from 'lucide-react';
import { FullscreenWizardAction, FullscreenWizardNotice } from '@/components/ui/FullscreenWizard';

/** Recuperação não bloqueante para fluxos fullscreen; os demais usam DraftResumeDialog. */
export function DraftResumeNotice({ onResume, onDiscard }: { onResume: () => void; onDiscard: () => void }) {
  return <FullscreenWizardNotice
    title="Rascunho encontrado"
    description="Retome o rascunho ou comece a preencher um novo orçamento."
    icon={<FileText />}
    actions={<>
      <FullscreenWizardAction variant="cancel" className="gap-1.5 px-3 text-sm sm:px-4" onClick={onDiscard}><RotateCcw className="hidden sm:block" />Começar do zero</FullscreenWizardAction>
      <FullscreenWizardAction className="gap-1.5 px-3 text-sm sm:px-4" onClick={onResume}><FileText />Retomar</FullscreenWizardAction>
    </>}
  />;
}
