/** Tabelas oficiais da folha CLT, versionadas pela competência. */
export interface InssFaixa { ate: number; aliquota: number }
export interface IrrfFaixa { ate: number; aliquota: number; deduzir: number }

export interface IrrfReduction {
  isencaoTotalAte: number;
  reducaoMaxima: number;
  reducaoParcialAte: number;
  parcelaFixa: number;
  fatorRenda: number;
}

export interface PayrollTables {
  validFrom: `${number}-${number}`;
  salarioMinimoFederal: number;
  inss: InssFaixa[];
  irrf: {
    faixas: IrrfFaixa[];
    deducaoDependente: number;
    descontoSimplificado: number;
    reducao?: IrrfReduction;
  };
}

const INSS_2025: InssFaixa[] = [
  { ate: 1518, aliquota: 0.075 },
  { ate: 2793.88, aliquota: 0.09 },
  { ate: 4190.83, aliquota: 0.12 },
  { ate: 8157.41, aliquota: 0.14 },
];

const IRRF_2025_JAN_ABR = {
  faixas: [
    { ate: 2259.2, aliquota: 0, deduzir: 0 },
    { ate: 2826.65, aliquota: 0.075, deduzir: 169.44 },
    { ate: 3751.05, aliquota: 0.15, deduzir: 381.44 },
    { ate: 4664.68, aliquota: 0.225, deduzir: 662.77 },
    { ate: Infinity, aliquota: 0.275, deduzir: 896 },
  ],
  deducaoDependente: 189.59,
  descontoSimplificado: 564.8,
};

const IRRF_DESDE_MAIO_2025 = {
  faixas: [
    { ate: 2428.8, aliquota: 0, deduzir: 0 },
    { ate: 2826.65, aliquota: 0.075, deduzir: 182.16 },
    { ate: 3751.05, aliquota: 0.15, deduzir: 394.16 },
    { ate: 4664.68, aliquota: 0.225, deduzir: 675.49 },
    { ate: Infinity, aliquota: 0.275, deduzir: 908.73 },
  ],
  deducaoDependente: 189.59,
  descontoSimplificado: 607.2,
};

const TABLES_BY_COMPETENCE: PayrollTables[] = [
  { validFrom: "2025-1", salarioMinimoFederal: 1518, inss: INSS_2025, irrf: IRRF_2025_JAN_ABR },
  { validFrom: "2025-5", salarioMinimoFederal: 1518, inss: INSS_2025, irrf: IRRF_DESDE_MAIO_2025 },
  {
    validFrom: "2026-1",
    salarioMinimoFederal: 1621,
    inss: [
      { ate: 1621, aliquota: 0.075 },
      { ate: 2902.84, aliquota: 0.09 },
      { ate: 4354.27, aliquota: 0.12 },
      { ate: 8475.55, aliquota: 0.14 },
    ],
    irrf: {
      ...IRRF_DESDE_MAIO_2025,
      reducao: {
        isencaoTotalAte: 5000,
        reducaoMaxima: 312.89,
        reducaoParcialAte: 7350,
        parcelaFixa: 978.62,
        fatorRenda: 0.133145,
      },
    },
  },
];

export const EARLIEST_PAYROLL_YEAR = 2025;
export const LATEST_PAYROLL_YEAR = 2026;

const competenceKey = (year: number, month: number) => year * 100 + month;
const validFromKey = (validFrom: PayrollTables["validFrom"]) => {
  const [year, month] = validFrom.split("-").map(Number);
  return competenceKey(year, month);
};

export function hasPayrollTables(competenceYear: number, competenceMonth = 12): boolean {
  return Number.isInteger(competenceYear)
    && Number.isInteger(competenceMonth)
    && competenceMonth >= 1
    && competenceMonth <= 12
    && competenceYear >= EARLIEST_PAYROLL_YEAR
    && competenceYear <= LATEST_PAYROLL_YEAR;
}

export function getPayrollTables(competenceYear: number, competenceMonth = 12): PayrollTables {
  if (!hasPayrollTables(competenceYear, competenceMonth)) {
    throw new Error(
      `Não há tabela oficial de folha cadastrada para ${String(competenceMonth).padStart(2, "0")}/${competenceYear}.`,
    );
  }
  const target = competenceKey(competenceYear, competenceMonth);
  const table = [...TABLES_BY_COMPETENCE]
    .reverse()
    .find((candidate) => validFromKey(candidate.validFrom) <= target);
  if (!table) {
    throw new Error(
      `Não há tabela oficial de folha cadastrada para ${String(competenceMonth).padStart(2, "0")}/${competenceYear}.`,
    );
  }
  return table;
}
