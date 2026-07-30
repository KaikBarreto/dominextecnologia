/**
 * Motor de cálculo do custo mensal de um funcionário, com provisões
 * trabalhistas itemizadas e cientes do regime tributário.
 *
 * Base legal das provisões (regime aplicado à base de encargos):
 *  - FGTS 8%; 13º = base/12; Férias+1/3 = base/12 × 4/3;
 *  - FGTS sobre 13º e férias = (13º+férias) × 8%;
 *  - Multa rescisória (provisão) = Σ FGTS × 40%;
 *  - INSS patronal ~28,8% (20% + RAT/FAP + Terceiros) — SÓ Lucro Real/Presumido.
 *    Simples Nacional NÃO recolhe INSS patronal.
 */

export type Regime = "simples" | "lucro_real";
export type AdicionalTipo = "nenhum" | "periculosidade" | "insalubridade";

/** Salário mínimo de referência p/ insalubridade. Editável na UI; atualizar por ano. */
export const SALARIO_MINIMO_REFERENCIA = 1518;

export interface EmployeeCostInput {
  baseSalary: number;
  adicionalTipo: AdicionalTipo;
  periculosidadePercent: number;
  insalubridadeGrau: 10 | 20 | 40;
  salarioMinimo: number;
  horaExtra: number;
  regime: Regime;
  inssPatronalPercent: number;
  planoSaude: number;
  planoOdonto: number;
  seguroVida: number;
  transporte: number;
  refeicao: number;
  treinamentosAnual: number;
  asoAnual: number;
  epiAnual: number;
  celularAnual: number;
  monthlyHours: number;
}

export const defaultCostInput: EmployeeCostInput = {
  baseSalary: 0,
  adicionalTipo: "nenhum",
  periculosidadePercent: 30,
  insalubridadeGrau: 40,
  salarioMinimo: SALARIO_MINIMO_REFERENCIA,
  horaExtra: 0,
  regime: "simples",
  inssPatronalPercent: 28.8,
  planoSaude: 0,
  planoOdonto: 0,
  seguroVida: 0,
  transporte: 0,
  refeicao: 0,
  treinamentosAnual: 0,
  asoAnual: 0,
  epiAnual: 0,
  celularAnual: 0,
  monthlyHours: 176,
};

export interface EmployeeCostResult {
  baseEncargos: number;
  adicional: number;
  dsr: number;
  fgts: number;
  decimoTerceiro: number;
  ferias: number;
  fgtsSobre13Fer: number;
  multaRescisoria: number;
  beneficios: number;
  anuaisRateados: number;
  guardarPorMes: { ferias: number; decimoTerceiro: number; multaRescisoria: number };
  encargosDoMes: { fgts: number; fgtsSobre13Fer: number; inssPatronal: number };
  totalMensal: number;
  custoPercentual: number;
  horaHomem: number;
}

export function calculateEmployeeCost(input: EmployeeCostInput): EmployeeCostResult {
  const i = { ...defaultCostInput, ...input };

  const adicional =
    i.adicionalTipo === "periculosidade"
      ? i.baseSalary * (i.periculosidadePercent / 100)
      : i.adicionalTipo === "insalubridade"
        ? i.salarioMinimo * (i.insalubridadeGrau / 100)
        : 0;

  const dsr = i.horaExtra > 0 ? (i.horaExtra / 26) * 5 : 0;
  const baseEncargos = i.baseSalary + adicional + i.horaExtra + dsr;

  const fgts = baseEncargos * 0.08;
  const decimoTerceiro = baseEncargos / 12;
  const ferias = (baseEncargos / 12) * (4 / 3);
  const fgtsSobre13Fer = (decimoTerceiro + ferias) * 0.08;
  const multaRescisoria = (fgts + fgtsSobre13Fer) * 0.4;
  // INSS patronal (só Lucro Real/Presumido) incide sobre a remuneração do mês E sobre as
  // provisões de 13º e férias + 1/3 (o terço integra a base — STF Tema 985).
  const inssPatronal =
    i.regime === "simples"
      ? 0
      : (baseEncargos + decimoTerceiro + ferias) * (i.inssPatronalPercent / 100);

  const beneficios = i.planoSaude + i.planoOdonto + i.seguroVida + i.transporte + i.refeicao;
  const anuaisRateados = (i.treinamentosAnual + i.asoAnual + i.epiAnual + i.celularAnual) / 12;

  const totalMensal =
    baseEncargos +
    fgts +
    decimoTerceiro +
    ferias +
    fgtsSobre13Fer +
    multaRescisoria +
    inssPatronal +
    beneficios +
    anuaisRateados;

  return {
    baseEncargos,
    adicional,
    dsr,
    fgts,
    decimoTerceiro,
    ferias,
    fgtsSobre13Fer,
    multaRescisoria,
    beneficios,
    anuaisRateados,
    guardarPorMes: { ferias, decimoTerceiro, multaRescisoria },
    encargosDoMes: { fgts, fgtsSobre13Fer, inssPatronal },
    totalMensal,
    custoPercentual: i.baseSalary > 0 ? totalMensal / i.baseSalary : 0,
    horaHomem: i.monthlyHours > 0 ? totalMensal / i.monthlyHours : 0,
  };
}
