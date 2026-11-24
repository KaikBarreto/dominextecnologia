import { usePdvReceiptSettings } from './usePdvReceiptSettings';
import { useToast } from './use-toast';
import { readDeviceReceiptFormat } from '@/lib/pdv/receipt/devicePreference';
import { resolvePdvReceiptStagePolicy, type PdvReceiptStage } from '@/lib/pdv/receipt/stagePolicy';
import { preparePdvStageReceiptAuto } from '@/lib/pdv/receipt/stageAuto';
import { openPendingPdfTab } from '@/utils/openPdfInTab';

// IDs persistidos são únicos. Mantém a deduplicação inclusive após remontar a tela.
const confirmedEvents = new Set<string>();

export function usePdvStageReceiptAuto() {
  const settings = usePdvReceiptSettings();
  const { toast } = useToast();
  function policy(stage: PdvReceiptStage) {
    const value = resolvePdvReceiptStagePolicy(settings.data, stage);
    return { ...value, format: readDeviceReceiptFormat() ?? value.format };
  }
  return {
    policy,
    prepare(stage: PdvReceiptStage, enabled = true) {
      const value = policy(stage);
      return preparePdvStageReceiptAuto({
        policy: { ...value, autoPrint: enabled && value.autoPrint },
        seen: confirmedEvents,
        openPending: () => openPendingPdfTab('Aguardando confirmação para gerar o comprovante...'),
        notify: (reason) => toast({
          title: reason === 'blocked' ? 'Abra o comprovante pelo botão' : 'Comprovante automático indisponível',
          description: reason === 'blocked'
            ? 'O navegador bloqueou a aba. Use o botão do comprovante para abrir e imprimir.'
            : 'A operação foi confirmada. Use o botão do comprovante para tentar novamente.',
        }),
      });
    },
  };
}
