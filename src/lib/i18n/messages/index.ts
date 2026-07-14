import type { LocaleCode } from '../locales';
import ptBr, { type Messages } from './pt-br';
import en from './en';
import es from './es';
import fr from './fr';

export type { Messages };

export const MESSAGES: Record<LocaleCode, Messages> = {
  'pt-br': ptBr,
  en,
  es,
  fr,
};
