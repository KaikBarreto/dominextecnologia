import { cn } from '@/lib/utils';

interface PriceAmountProps {
  /** Valor em reais (ex: 197, 447, 449.9). */
  value: number;
  /**
   * Tamanho + cor do número inteiro. Passe aqui (vai no wrapper) — os centavos,
   * o "R$" e o sufixo escalam por `em` relativo a este tamanho.
   * Ex: "text-4xl font-extrabold text-primary".
   */
  className?: string;
  /** Prefixo de moeda. Default "R$". Passe "" pra esconder. */
  prefix?: string;
  /** Sufixo (ex: "/mês"). Opcional. */
  suffix?: string;
}

/**
 * Exibe um preço com os centavos ",00" menores e alinhados ao TOPO do valor,
 * antes do sufixo (/mês). Padrão de pricing usado na landing, checkout e seleção
 * de planos. O tamanho/cor vem do `className` (no wrapper); centavos/prefixo/sufixo
 * são frações em `em` desse tamanho, então acompanham automaticamente.
 */
export function PriceAmount({ value, className, prefix = 'R$', suffix }: PriceAmountProps) {
  const totalCents = Math.round((Number(value) || 0) * 100);
  const intPart = Math.floor(totalCents / 100).toLocaleString('pt-BR');
  const cents = String(Math.abs(totalCents % 100)).padStart(2, '0');

  return (
    <span className={cn('inline-flex items-baseline leading-none', className)}>
      {prefix && (
        <span className="text-[0.42em] font-medium opacity-70 mr-1 self-center">{prefix}</span>
      )}
      <span>{intPart}</span>
      <span className="text-[0.4em] font-bold self-start ml-0.5">,{cents}</span>
      {suffix && (
        <span className="text-[0.34em] font-medium opacity-60 ml-1 self-end mb-[0.18em]">{suffix}</span>
      )}
    </span>
  );
}
