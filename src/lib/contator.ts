/**
 * Dimensionamento de partida DIRETA de motor TRIFÁSICO: contator (AC-3) + relé térmico.
 *
 * 100% client-side / offline — apenas aritmética por fórmula.
 *
 * Motivo: máquina trifásica NÃO usa capacitor. A partida é feita pelas 3 fases
 * e a manobra/proteção é por CONTATORA (categoria AC-3) + RELÉ TÉRMICO. Estimar
 * capacitor para trifásico é erro de correção (risco de queimar o motor).
 *
 * A corrente nominal (In) vem da PLACA do motor. Em trifásico, BTU não é entrada
 * confiável — por isso a entrada é por Corrente (A da placa) ou Potência (CV).
 */

/** Tensões trifásicas usuais no Brasil (V). */
export const TENSOES_TRIFASICAS = [220, 380] as const;
export type TensaoTrifasica = (typeof TENSOES_TRIFASICAS)[number];

/**
 * Linha comercial de contatores por corrente de emprego em AC-3 (amperes).
 * Valores típicos de catálogo (WEG CWB / Schneider / Siemens).
 */
export const CONTATORES_AC3 = [9, 12, 18, 25, 32, 40, 50, 65, 80, 95] as const;

/** Conversão de potência mecânica: 1 CV ≈ 735,5 W. */
const WATTS_POR_CV = 735.5;

/** Fator de serviço aplicado sobre In para a corrente de emprego do contator. */
export const FATOR_SERVICO = 1.15;

/** Defaults de placa (motor WEG W22 premium IR3 — referência de mercado). */
export const RENDIMENTO_PADRAO = 0.828; // η = 82,8%
export const COSPHI_PADRAO = 0.82; // cosφ = 0,82

export interface ResultadoContator {
  /** Corrente nominal do motor (A). */
  correnteNominal: number;
  /** Corrente de emprego = In × FS (A). */
  correnteEmprego: number;
  /** Contator comercial AC-3 recomendado (A). */
  contatorAC3: number;
  /** true quando Ie ultrapassa a maior corrente da linha → consultar especialista. */
  acimaDaLinha: boolean;
  /** Ajuste sugerido do relé térmico (≈ In), em A. */
  releTermico: number;
}

/**
 * Corrente nominal a partir da potência em CV de um motor trifásico:
 *   In = P_watts / (√3 × V × η × cosφ),  com P_watts = CV × 735,5
 *
 * Validação: 1 CV, 220 V, η=0,828, cosφ=0,82 →
 *   735,5 / (1,7320508 × 220 × 0,828 × 0,82) ≈ 2,84 A  (placa WEG ≈ 2,90 A). ✓
 *
 * Retorna null para entradas inválidas (estado neutro na UI).
 */
export function correnteNominalPorCV(
  cv: number,
  tensao: number,
  rendimento: number = RENDIMENTO_PADRAO,
  cosphi: number = COSPHI_PADRAO,
): number | null {
  if (!cv || cv <= 0 || !tensao || tensao <= 0) return null;
  if (!rendimento || rendimento <= 0 || !cosphi || cosphi <= 0) return null;
  const potenciaWatts = cv * WATTS_POR_CV;
  const inA = potenciaWatts / (Math.sqrt(3) * tensao * rendimento * cosphi);
  return Math.round(inA * 100) / 100;
}

/** Menor contator AC-3 cuja corrente é >= a corrente de emprego. */
function contatorAcimaDe(correnteEmprego: number): { valor: number; acimaDaLinha: boolean } {
  const escolhido = CONTATORES_AC3.find((c) => c >= correnteEmprego);
  if (escolhido === undefined) {
    return { valor: CONTATORES_AC3[CONTATORES_AC3.length - 1], acimaDaLinha: true };
  }
  return { valor: escolhido, acimaDaLinha: false };
}

/**
 * Dimensiona contator AC-3 + relé térmico a partir da corrente nominal (In) do motor.
 *
 * - Ie = In × 1,15 (fator de serviço).
 * - Contator = menor da linha AC-3 acima de Ie.
 *   Ex.: In=2,90 → Ie=3,35 → contator 9 A AC-3. ✓
 * - Relé térmico: regular para ~In.
 *
 * Retorna null para In inválido (estado neutro na UI).
 */
export function dimensionarContator(correnteNominal: number): ResultadoContator | null {
  if (!correnteNominal || correnteNominal <= 0) return null;

  const correnteEmprego = Math.round(correnteNominal * FATOR_SERVICO * 100) / 100;
  const { valor: contatorAC3, acimaDaLinha } = contatorAcimaDe(correnteEmprego);

  return {
    correnteNominal: Math.round(correnteNominal * 100) / 100,
    correnteEmprego,
    contatorAC3,
    acimaDaLinha,
    releTermico: Math.round(correnteNominal * 100) / 100,
  };
}
