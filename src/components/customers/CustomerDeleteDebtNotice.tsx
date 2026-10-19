import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { usePdvCustomerCredit } from '@/hooks/usePdvSale';

/**
 * Aviso de FIADO EM ABERTO dentro do diálogo de exclusão de cliente.
 *
 * POR QUE EXISTE: `customer_credit_ledger.customer_id` é ON DELETE CASCADE e o
 * saldo devedor NÃO é coluna de `customers` — é a soma do extrato. Então dá pra
 * excluir um cliente que deve R$ 800 na loja e a dívida sair de cena sem
 * ninguém ser avisado. O comportamento do banco está CERTO (eliminação LGPD
 * elimina mesmo, e o pedido sobrevive anonimizado por obrigação fiscal); o que
 * faltava era a tela DIZER o que está sendo abandonado.
 *
 * O que este componente NÃO faz, de propósito:
 *  - não bloqueia a exclusão (o direito do titular vence; isto é informação,
 *    não trava);
 *  - não aparece pra empresa sem o add-on `pdv` — nem o aviso, nem a consulta
 *    ao banco. Sem o módulo, o diálogo fica IDÊNTICO ao de antes do PDV.
 *
 * Reusa `usePdvCustomerCredit` (fonte única do saldo: soma do ledger) em vez de
 * repetir a regra do saldo num segundo lugar.
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
  // (amount negativo no ledger) não é aviso, é ruído.
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
