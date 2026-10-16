// Regra da EMISSÃO AUTOMÁTICA DE NFS-e de um contrato recorrente.
//
// Molde IDÊNTICO a `buildContractFinanceRule`/`ContractFinanceRule` em
// @/lib/contract-billing: um tipo que é o patch EXATO que vai pro banco
// (nunca mais, nunca menos campos) e uma função que valida ANTES de montar o
// patch. Arquivo PRÓPRIO (não dentro de contract-billing.ts) porque isto é
// domínio FISCAL, não cadência de cobrança — são decisões independentes.
//
// Plano-pai: docs/planos/2026-10-16-nfse-automatica-contrato.md (§3.1)
// Migration: supabase/migrations/20261016140000_nfse_automatica_por_contrato_onda1.sql
//
// NUNCA inclui `nfse_auto_enabled_at` / `nfse_auto_enabled_by`: essas duas
// colunas são carimbadas por um trigger do banco (precisa ver o usuário da
// sessão via auth.uid()); escrevê-las pelo app estragaria esse rastro de
// autoria. O patch daqui simplesmente não tem essas chaves.

export type ContractNfseAutoTrigger = 'dia_fixo' | 'vencimento' | 'pagamento';

export interface ContractNfseAutoRule {
  nfse_auto_enabled: boolean;
  nfse_auto_trigger: ContractNfseAutoTrigger;
  nfse_auto_day: number | null;
  nfse_auto_description: string | null;
  nfse_codigo_servico: string | null;
  nfse_codigo_tributacao_municipal: string | null;
  nfse_codigo_nbs: string | null;
  nfse_iss_aliquota: number | null;
}

export interface ContractNfseAutoRuleInput {
  enabled: boolean;
  trigger: ContractNfseAutoTrigger;
  /** `null`/vazio = sem dia escolhido ainda. */
  day: number | null;
  description: string | null;
  codigoServico: string | null;
  codigoTributacaoMunicipal: string | null;
  codigoNbs: string | null;
  issAliquota: number | null;
}

/**
 * Dia obrigatório SÓ quando a automação está LIGADA no modo `dia_fixo` —
 * espelha o CHECK `contracts_nfse_auto_day_required` do banco (migration
 * 20261016140000). Fora dessa combinação, o dia pode estar vazio sem
 * problema (ex.: configurando o modo antes de ligar, ou mudou pra outro
 * modo sem apagar o dia que tinha).
 */
export function nfseAutoDayRequired(enabled: boolean, trigger: ContractNfseAutoTrigger): boolean {
  return enabled && trigger === 'dia_fixo';
}

export function isValidNfseAutoDay(day: number | null): boolean {
  return Number.isInteger(day) && (day as number) >= 1 && (day as number) <= 31;
}

/**
 * Monta a regra. Falha ALTO (mensagem em PT-BR leigo) quando o conjunto é
 * exatamente o que o CHECK do banco recusaria — ligado + dia_fixo sem dia
 * válido. O chamador (autosave da aba Financeiro) tem que checar
 * `nfseAutoDayRequired`/`isValidNfseAutoDay` ANTES de chamar esta função, pra
 * nunca deixar o erro chegar até aqui como surpresa — este throw é a segunda
 * trava, não a primeira.
 */
export function buildContractNfseAutoRule(input: ContractNfseAutoRuleInput): ContractNfseAutoRule {
  if (nfseAutoDayRequired(input.enabled, input.trigger) && !isValidNfseAutoDay(input.day)) {
    throw new Error('Escolha um dia do mês (1 a 31) antes de ligar a nota automática neste modo.');
  }
  const trim = (v: string | null) => {
    const t = (v ?? '').trim();
    return t.length > 0 ? t : null;
  };
  return {
    nfse_auto_enabled: input.enabled,
    nfse_auto_trigger: input.trigger,
    nfse_auto_day: input.day,
    nfse_auto_description: trim(input.description),
    nfse_codigo_servico: trim(input.codigoServico),
    nfse_codigo_tributacao_municipal: trim(input.codigoTributacaoMunicipal),
    nfse_codigo_nbs: trim(input.codigoNbs),
    nfse_iss_aliquota: input.issAliquota,
  };
}
