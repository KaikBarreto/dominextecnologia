/**
 * Tabelas de INSS e IRRF do empregado, versionadas por ano da competência.
 * ATENÇÃO: valores MUDAM por ano/portaria. Referência abaixo = COMPETÊNCIA 2025.
 * Confirme a competência vigente na fonte oficial (Receita Federal / INSS) antes
 * de usar em produção. Para adicionar um novo ano, crie a constante e registre em TABLES_BY_YEAR.
 */

export interface InssFaixa { ate: number; aliquota: number }
export interface IrrfFaixa { ate: number; aliquota: number; deduzir: number }
export interface PayrollTables {
  inss: InssFaixa[];
  irrf: { faixas: IrrfFaixa[]; deducaoDependente: number; descontoSimplificado: number };
}

const TABELA_2025: PayrollTables = {
  inss: [
    { ate: 1518.0, aliquota: 0.075 },
    { ate: 2793.88, aliquota: 0.09 },
    { ate: 4190.83, aliquota: 0.12 },
    { ate: 8157.41, aliquota: 0.14 },
  ],
  irrf: {
    faixas: [
      { ate: 2259.2, aliquota: 0, deduzir: 0 },
      { ate: 2826.65, aliquota: 0.075, deduzir: 169.44 },
      { ate: 3751.05, aliquota: 0.15, deduzir: 381.44 },
      { ate: 4664.68, aliquota: 0.225, deduzir: 662.77 },
      { ate: Infinity, aliquota: 0.275, deduzir: 896.0 },
    ],
    deducaoDependente: 189.59,
    descontoSimplificado: 564.8,
  },
};

const TABLES_BY_YEAR: Record<number, PayrollTables> = {
  2025: TABELA_2025,
  2026: TABELA_2025, // placeholder até publicação oficial de 2026 — CONFIRMAR e substituir
};

export const LATEST_PAYROLL_YEAR = 2026;

export function getPayrollTables(competenceYear: number): PayrollTables {
  return TABLES_BY_YEAR[competenceYear] ?? TABLES_BY_YEAR[LATEST_PAYROLL_YEAR];
}
