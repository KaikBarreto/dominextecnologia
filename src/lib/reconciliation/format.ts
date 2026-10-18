import { formatMoney } from '@/lib/format';
import type { LocaleCode } from '@/lib/i18n/locales';

/**
 * `formatMoney` usa o hífen (`-`) que o `Intl.NumberFormat` devolve pra
 * negativo — as telas de conciliação usam o sinal de menos tipográfico
 * (`−`, U+2212) em todo lugar que mostra saldo/diferença/valor que pode ficar
 * negativo (linha do extrato, rodapé de fechamento, resumo de import).
 * Única função pra isso: nasceu em `ImportOfxDialog.tsx`, promovida pra aqui
 * pra não duplicar e divergir de novo.
 */
export function formatSignedMoney(value: number, currency: string, locale: LocaleCode): string {
  return value < 0 ? `−${formatMoney(Math.abs(value), currency, locale)}` : formatMoney(value, currency, locale);
}
