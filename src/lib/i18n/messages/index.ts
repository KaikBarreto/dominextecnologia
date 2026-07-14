import type { LocaleCode } from '../locales';
import ptBr, { type Messages } from './pt-br';
import { enOverrides } from './en';
import { esOverrides } from './es';
import { frOverrides } from './fr';

export type { Messages };

/** Widen de literais do `as const` do pt-br pro tipo base da tradução. */
type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T;

/**
 * DeepPartial "traduzível" de um shape de mensagens. Cada locale não-default só
 * precisa fornecer as chaves que traduz; o resto cai no pt-br (fonte da verdade).
 * Funções mantêm a assinatura; arrays/tuplas viram arrays do tipo-base widened
 * (a tradução substitui o array inteiro); strings/números literais do `as const`
 * são widened pro tipo base (senão só o texto pt-br exato seria aceito).
 */
type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? DeepPartial<U>[]
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : Widen<T>;

export type MessagesOverride = DeepPartial<Messages>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Merge recursivo: começa do pt-br (base completa) e sobrepõe as chaves do
 * locale. Objetos aninhados fundem; arrays e valores primitivos substituem.
 * Garante que qualquer chave ausente na tradução caia no pt-br, nunca em vazio.
 */
function deepMerge<T>(base: T, override: DeepPartial<T> | undefined): T {
  if (override === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const key of Object.keys(override)) {
    out[key] = deepMerge(
      (base as Record<string, unknown>)[key],
      (override as Record<string, unknown>)[key] as never,
    );
  }
  return out as T;
}

export const MESSAGES: Record<LocaleCode, Messages> = {
  'pt-br': ptBr,
  en: deepMerge(ptBr, enOverrides),
  es: deepMerge(ptBr, esOverrides),
  fr: deepMerge(ptBr, frOverrides),
};
