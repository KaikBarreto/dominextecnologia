import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { usePdvCustomerCredit } from '@/hooks/usePdvSale';

/**
 * Avisa sobre dívida em aberto antes da exclusão de um cliente com PDV.
 * Usa o mesmo resumo canônico de dívida/limite da venda, sem baixar o extrato
 * financeiro nem depender exclusivamente de lançamentos legados.
 * Este componente informa; não altera as regras de exclusão ou os recebíveis.
 * Sem o módulo, nenhum valor é consultado ou apresentado.
 */
export interface CustomerDeleteDebtNoticeProps {
  /** Cliente que está no diálogo. `null` enquanto fechado = nenhuma consulta. */
  customerId: string | null;
}

export function CustomerDeleteDebtNotice({ customerId }: CustomerDeleteDebtNoticeProps) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.customers;
  const { hasModule } = useCompanyModules();

  const pdvEnabled = hasModule('pdv');
  // Gate ANTES da query: sem o módulo o hook recebe null e nem consulta.
  const { credit } = usePdvCustomerCredit(pdvEnabled ? customerId : null);

  if (!pdvEnabled) return null;

  const debt = credit?.debt ?? 0;
  // Só avisa quando HÁ dívida. Saldo zero ou crédito a favor do cliente
  // (dívida canônica negativa) não é aviso, é ruído.
  if (!(debt > 0)) return null;

  return (
    <NoticeBanner
      variant="warning"
      title={t.deleteDebtTitle.replace('{value}', formatMoney(debt, currency, locale))}
    >
      {t.deleteDebtBody}
    </NoticeBanner>
  );
}
