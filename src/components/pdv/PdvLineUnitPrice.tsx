import { cartLineNetUnitPrice, type CartLine } from '@/lib/pdv/cart';

interface PdvLineUnitPriceProps {
  line: Pick<CartLine, 'quantity' | 'unitPrice' | 'discountAmount'>;
  formatCurrency: (value: number) => string;
}

/**
 * Preço por unidade de venda de uma linha do carrinho. Com desconto na linha,
 * o preço de tabela aparece riscado e, ao lado, o valor efetivamente cobrado
 * por un/kg/m — mesmo padrão do total da linha (bruto riscado + líquido).
 * A unidade ("/ un") continua por conta de quem renderiza.
 */
export function PdvLineUnitPrice({ line, formatCurrency }: PdvLineUnitPriceProps) {
  const netUnitPrice = cartLineNetUnitPrice(line);
  if (netUnitPrice == null) return <>{formatCurrency(line.unitPrice)}</>;
  return (
    <>
      <s className="font-normal line-through opacity-70" data-testid="pdv-line-unit-price-original">{formatCurrency(line.unitPrice)}</s>{' '}
      <span className="font-semibold text-foreground" data-testid="pdv-line-unit-price-net">{formatCurrency(netUnitPrice)}</span>
    </>
  );
}
