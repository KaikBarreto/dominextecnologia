import { usePdvAnimatedNumber } from '@/components/pdv/caixa/usePdvAnimatedNumber';

interface PdvAnimatedMoneyProps {
  value: number;
  visible: boolean;
  money: (value: number) => string;
  hiddenText?: string;
}

/** Valor monetario animado, mantendo a preferencia de privacidade do Caixa. */
export function PdvAnimatedMoney({
  value,
  visible,
  money,
  hiddenText = '•••••',
}: PdvAnimatedMoneyProps) {
  const displayed = usePdvAnimatedNumber(value);
  return <>{visible ? money(displayed) : hiddenText}</>;
}
