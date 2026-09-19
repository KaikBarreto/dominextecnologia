import { useMemo } from 'react';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { filterAccountsForReceivable } from '@/lib/financial-account-filter';
import { buildAccountOptions } from '@/components/financial/accountSelectOptions';

/**
 * Select da CONTA DE RECEBIMENTO da etapa Financeiro do wizard de contrato.
 *
 * Por que é um componente separado e não está inline no ContractFormDialog:
 * `useFinancialAccounts()` pagina `financial_transactions` INTEIRA para calcular
 * o saldo das contas, e o `ContractFormDialog` fica SEMPRE montado nas telas de
 * Contratos e Detalhe do Cliente (o `open` só esconde). Chamar o hook lá em cima
 * faria as duas telas puxarem o extrato inteiro só pra existir um campo. Aqui
 * dentro, o hook só dispara quando a etapa Financeiro está de fato na tela.
 *
 * O estado (id e rótulo) continua morando no wizard: o rótulo volta pelo
 * `onChange` pra a etapa de Revisão poder mostrar o nome da conta escolhida sem
 * precisar do hook pesado.
 */
export interface ContractReceivingAccountFieldProps {
  value: string;
  /** Devolve id + rótulo da conta (rótulo vazio quando a seleção é limpa). */
  onChange: (accountId: string, accountLabel: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
}

export function ContractReceivingAccountField({
  value,
  onChange,
  placeholder,
  searchPlaceholder,
}: ContractReceivingAccountFieldProps) {
  const { accounts } = useFinancialAccounts();

  // Só contas de RECEBIMENTO: cartão de crédito fica de fora (é conta de saída,
  // a fatura que a empresa paga). Sem esse filtro o saldo ficaria como se o
  // dinheiro do cliente tivesse caído dentro do cartão.
  const options = useMemo(
    () => buildAccountOptions(accounts as any),
    [accounts],
  );

  return (
    <SearchableSelect
      options={options}
      value={value}
      onValueChange={(v) => onChange(v, options.find((o) => o.value === v)?.label ?? '')}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
    />
  );
}
