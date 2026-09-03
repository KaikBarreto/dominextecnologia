/**
 * Cálculo de impostos da NFS-e para o provedor Fisqal — FONTE ÚNICA da verdade
 * pra prévia de emissão de serviço na Dominex.
 *
 * Espelha a lógica de `EcoSistema/src/utils/nfseTaxes.ts`, mas restrita aos
 * campos que a Fisqal aceita. Campos OMITIDOS deliberadamente (a Fisqal não
 * suporta): INSS, IRRF, deduções da base, desconto condicionado, desconto
 * incondicionado.
 *
 * `NfseValoresFisqal.valorPis/valorCofins/valorCsll` são valores em R$ (não %),
 * pois a Fisqal recebe o valor absoluto de cada retenção federal.
 */

import type { NfseValoresState, NfseFisqalTaxResult, TpRetIssqn } from '@/components/fiscal/nova-nota/types';

/** Arredonda a 2 casas (padrão monetário). */
const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * Calcula os impostos da NFS-e (Fisqal) de forma PURA.
 *
 * Regras:
 * - Base = valorServico (sem deduções — a Fisqal não aceita).
 * - ISS = base × aliquotaIssqn/100.
 * - tpRetIssqn segue a tabela do layout nacional da NFS-e:
 *     '1' = NÃO retido · '2' = retido pelo tomador · '3' = retido pelo intermediário.
 *   Ou seja, o ISS é "retido" em qualquer valor DIFERENTE de '1'.
 * - Retenções federais = soma dos valores absolutos (PIS+COFINS+CSLL).
 * - Líquido = valorServico − totalRetencoesFederais − (ISS se retido).
 */
export function calculateNfseFisqalTaxes(
  valores: Pick<NfseValoresState, 'valorServico' | 'aliquotaIssqn' | 'tpRetIssqn' | 'valorPis' | 'valorCofins' | 'valorCsll'>,
): NfseFisqalTaxResult {
  const {
    valorServico,
    aliquotaIssqn,
    tpRetIssqn,
    valorPis,
    valorCofins,
    valorCsll,
  } = valores;

  const baseCalculo = Math.max(0, valorServico);
  const issValor = round2(baseCalculo * (aliquotaIssqn / 100));
  // '1' = não retido; '2' e '3' = retido (pelo tomador / pelo intermediário).
  const issRetido = tpRetIssqn !== '1';

  const totalRetencoesFederais = round2((valorPis ?? 0) + (valorCofins ?? 0) + (valorCsll ?? 0));

  const valorLiquido = round2(
    valorServico - totalRetencoesFederais - (issRetido ? issValor : 0),
  );

  return {
    baseCalculo: round2(baseCalculo),
    issValor,
    totalRetencoesFederais,
    valorLiquido,
  };
}

/**
 * Utilitário: no layout nacional, tpRetIssqn '1' é "não retido"; '2' (tomador) e
 * '3' (intermediário) significam ISS retido na fonte.
 */
export function isIssRetido(tpRetIssqn: TpRetIssqn): boolean {
  return tpRetIssqn !== '1';
}
