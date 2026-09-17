import { useCallback, useState } from 'react';
import { useCanLaunchLeadRevenue } from '@/hooks/useCanLaunchLeadRevenue';
import { fetchLeadWonTransactionId } from '@/hooks/useLeadWonRevenue';
import type { LeadWonRevenueDialogProps } from '@/components/financial/LeadWonRevenueDialog';

/**
 * O que a tela do CRM sabe sobre a oportunidade que acabou de ser ganha, e que
 * o formulário de receita precisa pra nascer preenchido.
 */
export interface LeadRevenueContext {
  leadId: string;
  /** Título da oportunidade — vira parte da descrição do lançamento. */
  leadTitle: string;
  customerId?: string | null;
  customerName?: string | null;
  /** `leads.value` (valor ESTIMADO). SUGESTÃO: o usuário edita no formulário. */
  suggestedAmount?: number | null;
}

export interface UseLeadWonRevenuePromptResult {
  /**
   * Abre a oferta SE (usuário pode criar lançamento) E (a oportunidade ainda
   * não gerou receita). Fora disso é no-op SILENCIOSO. Devolve `true` só
   * quando a oferta realmente abriu — quem chama usa isso pra decidir se
   * precisa fechar o modal de detalhe antes.
   */
  maybeOpen: (
    ctx: LeadRevenueContext,
    opts?: { beforeOpen?: () => void },
  ) => Promise<boolean>;
  /** Spread direto em `<LeadWonRevenueDialog {...dialogProps} />`. */
  dialogProps: LeadWonRevenueDialogProps;
}

/**
 * Oferta "quer lançar a receita?" quando a oportunidade vai pra um estágio de
 * ganho (`crm_stages.is_won`).
 *
 * REGRA-LEI DESTA FEATURE: é OFERTA, NUNCA BLOQUEIO. Quando `maybeOpen` é
 * chamado, o estágio **já mudou e já foi gravado**. Todo o caminho é envolvido
 * em try/catch e qualquer falha de leitura resulta em NÃO ABRIR, em silêncio —
 * um erro na tela aqui faria o vendedor achar que a venda não foi marcada como
 * ganha.
 *
 * Idempotência: tirar do ganho e colocar de volta, ou arrastar duas vezes, não
 * pode gerar duas receitas. Antes de abrir, lê `leads.won_transaction_id`
 * DIRETO DO BANCO (não do cache do React Query, que pode estar velho). Se já
 * tem lançamento, não abre.
 */
export function useLeadWonRevenuePrompt(): UseLeadWonRevenuePromptResult {
  const canLaunch = useCanLaunchLeadRevenue();

  const [open, setOpen] = useState(false);
  // O contexto NÃO é limpo ao fechar de propósito: zerar na hora mataria a
  // animação de saída do drawer no mobile. Quem desmonta o conteúdo pesado é o
  // próprio LeadWonRevenueDialog, depois da transição.
  const [context, setContext] = useState<LeadRevenueContext | null>(null);

  const maybeOpen = useCallback(
    async (ctx: LeadRevenueContext, opts?: { beforeOpen?: () => void }): Promise<boolean> => {
      try {
        if (!ctx?.leadId) return false;
        if (!canLaunch) return false;

        const link = await fetchLeadWonTransactionId(ctx.leadId);
        // `null` = a consulta FALHOU. Na dúvida, não abre: melhor não oferecer
        // do que arriscar uma receita duplicada numa oportunidade que já tem.
        if (!link) return false;
        if (link.transactionId) return false;

        // Roda ANTES de abrir pra quem chama fechar o modal de detalhe no mesmo
        // tick (mesmo cuidado do LossReasonDialog em CRM.tsx: dois Dialogs Radix
        // empilhados já deram bug de foco/pointer-events).
        opts?.beforeOpen?.();
        setContext(ctx);
        setOpen(true);
        return true;
      } catch (err) {
        // Log silencioso. O estágio já mudou; nada aqui pode virar erro de UI.
        if (import.meta.env.DEV) {
          console.warn('[receita da oportunidade ganha] oferta não exibida:', err);
        }
        return false;
      }
    },
    [canLaunch],
  );

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
  }, []);

  return {
    maybeOpen,
    dialogProps: { open, onOpenChange, context },
  };
}
