import { useCallback, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useCanLaunchOsRevenue } from '@/hooks/useCanLaunchOsRevenue';
import type { OsRevenueContext } from '@/hooks/useOsFinishRevenuePrompt';

/**
 * Ação "Faturar OS", em UM lugar só.
 *
 * A ação nasceu só no `ServiceOrderViewDialog` e ficou invisível em todas as
 * outras superfícies onde o usuário olha uma OS (menu da tabela, lista do
 * mobile, painel da agenda). Reclamação do CEO em 17/10/2026: "não tá intuitivo
 * e aplicado em tudo quanto é OS". Em vez de repetir a trava de permissão, o
 * estado do diálogo e a montagem do contexto em cada tela, tudo mora aqui.
 *
 * Quem consome faz três coisas:
 *   const billing = useOsBillingAction();
 *   1. `billing.canBill` decide se o item de menu/botão EXISTE (sem permissão,
 *      nenhum botão novo aparece — lei do CEO: faturar nunca é obrigatório);
 *   2. `billing.open(os)` abre o diálogo já com o contexto daquela OS;
 *   3. renderiza `billing.dialog` uma vez na árvore da tela.
 *
 * ⚠️ A trava de verdade (contagem dupla) mora no BANCO e na edge. Isto aqui é
 * só a porta de entrada.
 */

/** Recorte de uma OS que a ação precisa. Serve pra linha de tabela, card ou painel. */
export interface OsBillingSource {
  id: string;
  order_number?: number | null;
  customer_id?: string | null;
  customer?: { name?: string | null } | null;
  total_value?: number | null;
}

export interface OsBillingAction {
  /** Pode ver a ação? `screen:finance` + `fn:os_finish_revenue`. */
  canBill: boolean;
  /** Abre o diálogo pra esta OS. */
  open: (os: OsBillingSource) => void;
  /** Contexto da OS aberta no momento (null quando fechado). */
  context: OsRevenueContext | null;
  /** Estado do diálogo, pra quem precisa controlar o render. */
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}

/**
 * Monta o `OsRevenueContext` a partir de uma OS. MESMA fonte de valor sugerido
 * que o prompt automático de fechamento usa (`total_value`) — se divergir, o
 * usuário vê um número no fechamento e outro no botão manual.
 */
export function buildOsBillingContext(os: OsBillingSource): OsRevenueContext {
  return {
    serviceOrderId: os.id,
    osNumber: os.order_number ?? null,
    customerId: os.customer_id ?? null,
    customerName: os.customer?.name ?? null,
    suggestedAmount: os.total_value ?? null,
  };
}

export function useOsBillingAction(): OsBillingAction {
  const { hasScreenAccess } = useAuth();
  const { hasScreen } = useCompanyModules();
  const canLaunchRevenue = useCanLaunchOsRevenue();

  // Mesmo gate do `ServiceOrderViewDialog`: a tela de Financeiro tem que estar
  // acessível (permissão E módulo) e o usuário precisa da permissão fina. A
  // régua anti-default-allow de `useCanLaunchOsRevenue` trata usuário legado
  // sem configuração como `false` DE PROPÓSITO — não "consertar".
  const canBill = hasScreenAccess('screen:finance') && hasScreen('screen:finance') && canLaunchRevenue;

  const [isOpen, setOpen] = useState(false);
  const [context, setContext] = useState<OsRevenueContext | null>(null);

  const open = useCallback((os: OsBillingSource) => {
    setContext(buildOsBillingContext(os));
    setOpen(true);
  }, []);

  return { canBill, open, context, isOpen, setOpen };
}
