import { useCallback, useState } from 'react';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useCanLaunchOsRevenue } from '@/hooks/useCanLaunchOsRevenue';
import { fetchOsRevenueTotals } from '@/hooks/useOsRevenueSummary';
import type { OsFinishRevenueDialogProps } from '@/components/financial/OsFinishRevenueDialog';

/**
 * O que a tela da OS sabe sobre o serviço que acabou de ser concluído, e que o
 * formulário de receita precisa pra nascer preenchido.
 */
export interface OsRevenueContext {
  serviceOrderId: string;
  osNumber?: number | null;
  customerId?: string | null;
  customerName?: string | null;
  /** Valor da OS. SUGESTÃO: o usuário edita no formulário. */
  suggestedAmount?: number | null;
}

export interface UseOsFinishRevenuePromptResult {
  /**
   * Abre a pergunta SE (toggle da empresa ligado) E (usuário tem permissão) E
   * (a OS ainda não tem receita lançada). Fora disso é no-op SILENCIOSO: sem
   * erro, sem toast, sem nada na tela.
   */
  maybeOpen: (ctx: OsRevenueContext) => Promise<void>;
  /** Spread direto em `<OsFinishRevenueDialog {...dialogProps} />`. */
  dialogProps: OsFinishRevenueDialogProps;
}

/**
 * Pergunta "houve alguma receita nesta OS?" no fechamento da Ordem de Serviço.
 *
 * REGRA-LEI DESTA FEATURE: lançar receita JAMAIS pode atrapalhar o fechamento
 * da OS. Quando `maybeOpen` é chamado, a OS **já está concluída e gravada** no
 * banco. Por isso todo o caminho é envolvido em try/catch e qualquer falha
 * (offline, RLS, servidor fora) resulta em NÃO ABRIR, em silêncio. Um erro na
 * tela aqui faria o técnico achar que o fechamento falhou.
 *
 * Idempotência: OS reaberta e refinalizada não pode gerar receita duplicada.
 * Antes de abrir, consulta se já existe lançamento de entrada não cancelado
 * amarrado àquela OS. Se existe, não abre.
 */
export function useOsFinishRevenuePrompt(): UseOsFinishRevenuePromptResult {
  const { settings } = useCompanySettings();
  const canLaunch = useCanLaunchOsRevenue();

  const [open, setOpen] = useState(false);
  // O contexto NÃO é limpo ao fechar de propósito: zerar na hora mataria a
  // animação de saída do drawer no mobile. Quem desmonta o conteúdo pesado é o
  // próprio OsFinishRevenueDialog, depois da transição.
  const [context, setContext] = useState<OsRevenueContext | null>(null);

  /**
   * Leitura tolerante do toggle: a interface `CompanySettings` e a tela de
   * Configurações são de outro Dev e podem ainda não declarar este campo. O
   * cast local não depende do trabalho dele. Mesmo padrão de
   * `useOsStockConsumptionEnabled` em src/hooks/useOsMaterials.ts.
   */
  const promptEnabled =
    (settings as { os_finish_revenue_prompt_enabled?: boolean | null } | null)
      ?.os_finish_revenue_prompt_enabled === true;

  const maybeOpen = useCallback(
    async (ctx: OsRevenueContext): Promise<void> => {
      try {
        if (!ctx?.serviceOrderId) return;
        if (!promptEnabled) return;
        if (!canLaunch) return;

        const totals = await fetchOsRevenueTotals(ctx.serviceOrderId);
        // `null` = a consulta FALHOU. Na dúvida, não abre: melhor não perguntar
        // do que arriscar uma receita duplicada numa OS que já tinha uma.
        if (!totals) return;
        if (totals.count > 0) return;

        setContext(ctx);
        setOpen(true);
      } catch (err) {
        // Log silencioso. A OS já está fechada; nada aqui pode virar erro de UI.
        if (import.meta.env.DEV) {
          console.warn('[receita ao finalizar OS] pergunta não exibida:', err);
        }
      }
    },
    [promptEnabled, canLaunch],
  );

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
  }, []);

  return {
    maybeOpen,
    dialogProps: { open, onOpenChange, context },
  };
}
