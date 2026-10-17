import { useMemo } from 'react';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { formatDate } from '@/lib/format';
import type { ServiceOrderOption } from '@/hooks/useServiceOrderOptions';

export interface ServiceOrderSelectFieldProps {
  value?: string;
  onValueChange: (id: string) => void;
  /** Lista já carregada pelo pai (`useServiceOrderOptions`). */
  serviceOrders: ServiceOrderOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Rótulo da opção "nenhuma OS" — deixa DESvincular, não só vincular. */
  noneLabel?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

/** Valor sentinela do "sem OS". `SearchableSelect` usa cmdk, e item com value
 *  vazio quebra (mesma armadilha do Radix Select) — por isso não é ''. */
export const SERVICE_ORDER_NONE = '__none__';

/**
 * Select de Ordem de Serviço pra vincular um lançamento ou uma cobrança.
 * Mesmo desenho do `CustomerSelectField`/`SupplierSelectField`, SEM o botão
 * "+": não se cria OS de dentro do Financeiro, só se escolhe uma existente.
 *
 * Mostra número da OS + cliente, com a data como sublabel, porque é assim que
 * a pessoa do financeiro reconhece a OS no papel.
 */
export function ServiceOrderSelectField({
  value,
  onValueChange,
  serviceOrders,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  noneLabel,
  disabled,
  className,
  id,
}: ServiceOrderSelectFieldProps) {
  const { locale, timezone } = useAppLocaleContext();

  const options = useMemo(() => {
    const lista = serviceOrders.map((os) => {
      const numero = os.order_number != null ? `OS #${os.order_number}` : 'OS';
      const cliente = os.customer_name?.trim();
      return {
        value: os.id,
        label: cliente ? `${numero} · ${cliente}` : numero,
        sublabel: os.scheduled_date ? formatDate(os.scheduled_date, locale, timezone) : undefined,
      };
    });
    // Desvincular tem que ser possível: sem esta opção, quem amarrou por engano
    // ficaria preso ao vínculo pra sempre.
    return noneLabel ? [{ value: SERVICE_ORDER_NONE, label: noneLabel }, ...lista] : lista;
  }, [serviceOrders, locale, timezone, noneLabel]);

  return (
    <SearchableSelect
      id={id}
      options={options}
      value={value || SERVICE_ORDER_NONE}
      onValueChange={(v) => onValueChange(v === SERVICE_ORDER_NONE ? '' : v)}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyMessage={emptyMessage}
      disabled={disabled}
      className={className}
    />
  );
}
