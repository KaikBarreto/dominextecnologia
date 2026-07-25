// ─────────────────────────────────────────────────────────────────────────────
// DiscGenerateLinkModal — modal/drawer de confirmação antes de gerar o link
// de avaliação DISC. Permite ao gestor escolher se o funcionário verá o
// resultado ao final (toggle por avaliação).
//
// O valor inicial do toggle vem de company_settings.disc_show_result_to_employee
// (padrão da empresa). NULL/undefined → assume true como fallback.
//
// Regras da casa:
//  • ResponsiveModal → drawer no mobile, dialog no desktop.
//  • Modal não fecha ao clicar fora (régua da casa).
//  • LabeledSwitch para a escolha binária.
//  • i18n nos 4 idiomas.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Loader2, Link2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Button } from '@/components/ui/button';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { MESSAGES } from '@/lib/i18n/messages';

interface DiscGenerateLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado quando o gestor confirma. Recebe o valor escolhido do toggle. */
  onConfirm: (showResult: boolean) => void;
  /** True enquanto a mutation de gerar link está em andamento. */
  isGenerating: boolean;
}

export function DiscGenerateLinkModal({
  open,
  onOpenChange,
  onConfirm,
  isGenerating,
}: DiscGenerateLinkModalProps) {
  const { locale } = useAppLocaleContext();
  const { settings } = useCompanySettings();

  // Valor padrão: lê da config da empresa, fallback true.
  const companyDefault = settings?.disc_show_result_to_employee ?? true;

  // Estado local do toggle — resetado toda vez que o modal abre.
  const [showResult, setShowResult] = useState<boolean>(companyDefault);

  // Sincroniza o toggle com o default da empresa quando o modal abre.
  // (Reseta se o usuário fechou sem confirmar e reabriu.)
  const handleOpenChange = (o: boolean) => {
    if (o) setShowResult(settings?.disc_show_result_to_employee ?? true);
    onOpenChange(o);
  };

  const t = MESSAGES[locale].app.employees.form.disc;
  // overview.generateLinkModal ou profilePage.generateLinkModal têm os mesmos textos.
  const tModal = t.overview.generateLinkModal;

  const handleConfirm = () => {
    onConfirm(showResult);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title={tModal.title}
      footer={
        <Button
          className="w-full gap-2"
          onClick={handleConfirm}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
          {tModal.confirmButton}
        </Button>
      }
    >
      <div className="space-y-5 py-2">
        {/* Toggle principal */}
        <div className="flex flex-col gap-3">
          <LabeledSwitch
            value={showResult ? 'on' : 'off'}
            onChange={(v) => setShowResult(v === 'on')}
            off={{ value: 'off', label: tModal.showResultOffLabel }}
            on={{ value: 'on', label: tModal.showResultLabel }}
            aria-label={tModal.showResultLabel}
          />
          {/* Texto de apoio */}
          <p className="text-xs leading-relaxed text-muted-foreground rounded-xl border border-dashed border-border px-3 py-2.5">
            {tModal.showResultHint}
          </p>
        </div>
      </div>
    </ResponsiveModal>
  );
}
