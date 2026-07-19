// ─────────────────────────────────────────────────────────────────────────────
// i18n do APP LOGADO — AGREGADOR do namespace `app`, organizado por DOMÍNIO.
//
// Cada DOMÍNIO é um arquivo próprio (app/common.ts, app/shell.ts, app/os.ts, ...)
// com as 4 traduções JUNTAS chaveadas por locale. Isto permite que os devs de
// domínios diferentes (OS, Financeiro, Clientes...) editem arquivos DIFERENTES
// sem conflito de merge.
//
// Este index monta, PARA CADA LOCALE, o objeto `{ common, shell, ... }` fatiado
// no locale certo. O resultado (`appByLocale`) alimenta o namespace `app` de cada
// locale no sistema de mensagens (messages/index.ts), preservando o deepMerge com
// fallback pt-br (chave ausente num locale cai no pt-br).
//
// ─────────────────────────────────────────────────────────────────────────────
// COMO ADICIONAR UM DOMÍNIO NOVO (ex.: OS, Financeiro, Clientes):
//
//   1. Crie `src/lib/i18n/messages/app/<dominio>.ts` seguindo o formato de
//      app/common.ts / app/shell.ts:
//
//        export const <dominio> = {
//          'pt-br': { ... },   // FONTE — texto EXATO de hoje
//          en:      { ... },
//          es:      { ... },
//          fr:      { ... },
//        };
//
//      Preencha os 4 locales (pt-br é obrigatório; se um locale faltar uma chave,
//      cai no pt-br pelo deepMerge — o app nunca quebra, mas por convenção
//      traduza os 4). Cada domínio de app é editado por 1 dev, sem colidir com os
//      outros arquivos.
//
//   2. Importe e registre AQUI, em dois lugares:
//        • o import no topo;
//        • a linha `<dominio>: <dominio>[locale]` dentro de `sliceForLocale`.
//
//   3. Consuma na tela via:
//        const { locale } = useAppLocaleContext();
//        const t = MESSAGES[locale].app.<dominio>;
//
//   O tipo `AppMessages` (inferido daqui) reflete automaticamente o novo domínio,
//   e `Messages['app']` no site também (messages/pt-br.ts re-exporta este shape).
// ─────────────────────────────────────────────────────────────────────────────

import type { LocaleCode } from '../../locales';
import { common } from './common';
import { shell } from './shell';
import { dashboard } from './dashboard';
import { os } from './os';
import { customers } from './customers';
import { finance } from './finance';
import { inventory } from './inventory';
import { schedule } from './schedule';
import { pmoc } from './pmoc';
import { crm } from './crm';
import { employees } from './employees';
import { equipment } from './equipment';
import { contracts } from './contracts';
import { nfse } from './nfse';
import { timeclock } from './timeclock';
import { settings } from './settings';

// Registre cada domínio novo aqui (import acima + linha em sliceForLocale abaixo).
function sliceForLocale(locale: LocaleCode) {
  return {
    common: common[locale],
    shell: shell[locale],
    dashboard: dashboard[locale],
    os: os[locale],
    customers: customers[locale],
    finance: finance[locale],
    inventory: inventory[locale],
    schedule: schedule[locale],
    pmoc: pmoc[locale],
    crm: crm[locale],
    employees: employees[locale],
    equipment: equipment[locale],
    contracts: contracts[locale],
    nfse: nfse[locale],
    timeclock: timeclock[locale],
    settings: settings[locale],
    // <dominio>: <dominio>[locale],
  };
}

/** Shape do namespace `app`, no locale pt-br (a base/fonte). */
export type AppMessages = ReturnType<typeof sliceForLocale>;

/**
 * Namespace `app` já fatiado por locale. Cada locale recebe SUA fatia de cada
 * domínio; o site (messages/index.ts) usa `appByLocale[locale]` como o `app` de
 * cada locale, mantendo o deepMerge/fallback pt-br do resto do sistema.
 */
export const appByLocale: Record<LocaleCode, AppMessages> = {
  'pt-br': sliceForLocale('pt-br'),
  en: sliceForLocale('en'),
  es: sliceForLocale('es'),
  fr: sliceForLocale('fr'),
};
