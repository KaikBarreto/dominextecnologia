/**
 * Cálculo de impostos da NFS-e — FONTE ÚNICA da verdade pra prévia de emissão
 * de serviço na Dominex.
 *
 * Espelha a lógica canônica do EcoSistema. Retenções são valores absolutos em
 * R$; só alíquotas e campos com "percentual" no nome usam porcentagem.
 */

import type { NfseValoresState, NfseTaxResult, TpRetIssqn } from '@/components/fiscal/nova-nota/types';

/** Arredonda a 2 casas (padrão monetário). */
const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * Calcula os impostos da NFS-e de forma PURA.
 *
 * Regras:
 * - Base = valorServico (sem deduções — não suportadas).
 * - ISS = base × aliquotaIssqn/100.
 * - tpRetIssqn segue a tabela do layout nacional da NFS-e:
 *     '1' = NÃO retido · '2' = retido pelo tomador · '3' = retido pelo intermediário.
 *   Ou seja, o ISS é "retido" em qualquer valor DIFERENTE de '1'.
 * - Retenções federais = soma dos valores absolutos (PIS+COFINS+CSLL).
 * - Líquido = valorServico − totalRetencoesFederais − (ISS se retido).
 */
export function calculateNfseTaxes(
  valores: Pick<NfseValoresState, 'valorServico' | 'aliquotaIssqn' | 'tpRetIssqn' | 'valorPis' | 'valorCofins' | 'valorCsll' | 'valorInss' | 'valorIrrf' | 'deducoes' | 'descontoIncondicionado'>,
): NfseTaxResult {
  const {
    valorServico,
    aliquotaIssqn,
    tpRetIssqn,
    valorPis,
    valorCofins,
    valorCsll,
    valorInss,
    valorIrrf,
    deducoes,
    descontoIncondicionado,
  } = valores;

  const baseCalculo = Math.max(
    0,
    valorServico - (deducoes ?? 0) - (descontoIncondicionado ?? 0),
  );
  const issValor = round2(baseCalculo * (aliquotaIssqn / 100));
  // '1' = não retido; '2' e '3' = retido (pelo tomador / pelo intermediário).
  const issRetido = tpRetIssqn !== '1';

  const totalRetencoesFederais = round2(
    (valorPis ?? 0) +
      (valorCofins ?? 0) +
      (valorCsll ?? 0) +
      (valorInss ?? 0) +
      (valorIrrf ?? 0),
  );

  const valorLiquido = round2(
    valorServico -
      (descontoIncondicionado ?? 0) -
      totalRetencoesFederais -
      (issRetido ? issValor : 0),
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
