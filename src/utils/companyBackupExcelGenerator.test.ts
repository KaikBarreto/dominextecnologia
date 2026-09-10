import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { generateCompanyBackupExcel, type BackupSheet } from './companyBackupExcelGenerator';

/**
 * Prova que o backup gera um .xlsx ÍNTEGRO e que a aba Resumo bate com a
 * contagem real. É o critério de pronto nº 2/3 do plano
 * docs/planos/2026-09-10-exportar-dados-empresa-excel.md — sem isso, "build
 * verde" não diz nada sobre o arquivo que o cliente abre.
 */

const cwd = process.cwd();
let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'backup-xlsx-'));
  process.chdir(dir);
});

afterAll(() => {
  process.chdir(cwd);
  rmSync(dir, { recursive: true, force: true });
});

const LONG = 'x'.repeat(40_000); // acima do limite duro de célula do Excel

const sheets: readonly BackupSheet[] = [
  {
    key: 'customers',
    columns: [{ key: 'name' }, { key: 'document' }, { key: 'notes' }],
    rows: [
      ['Padaria do Zé', '12.345.678/0001-90', LONG],
      ['Condomínio Alfa', '987.654.321-00', null],
    ],
  },
  {
    key: 'financialTransactions',
    columns: [{ key: 'description' }, { key: 'amount', type: 'money' }],
    rows: [
      ['Manutenção preventiva', 1250.5],
      ['Troca de compressor', 3400],
    ],
  },
];

describe('generateCompanyBackupExcel', () => {
  it('gera um .xlsx legível, com Resumo batendo e sem célula estourada', async () => {
    await generateCompanyBackupExcel({
      companyName: 'Climatize Refrigeração',
      locale: 'pt-br',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      generatedAt: new Date('2026-09-10T12:00:00Z'),
      sheets,
    });

    const files = readdirSync(dir).filter((f) => f.endsWith('.xlsx'));
    expect(files).toHaveLength(1);
    // Nome do arquivo: prefixo + empresa em slug + data no fuso da empresa.
    expect(files[0]).toBe('backup-climatize-refrigeracao-2026-09-10.xlsx');

    // Round-trip: se o arquivo estivesse corrompido, o read explodiria aqui.
    // `cellNF` é obrigatório: por padrão o SheetJS NÃO devolve o formato
    // numérico (`z`) na leitura, e a asserção de moeda daria falso negativo.
    const wb = XLSX.read(readFileSync(join(dir, files[0])), { type: 'buffer', cellNF: true });

    // Resumo é a PRIMEIRA aba, seguida de uma aba por dataset.
    expect(wb.SheetNames).toHaveLength(3);

    const resumo = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      blankrows: false,
    });
    const flat = resumo.flat().map(String);
    expect(flat).toContain('Climatize Refrigeração');
    // Contagem de linhas de cada aba aparece no Resumo (2 e 2 => total 4).
    const totalRow = resumo.find((r) => r.some((c) => String(c).includes('4')));
    expect(totalRow).toBeDefined();

    // Aba de clientes: cabeçalho TRADUZIDO, não a chave crua do banco.
    const clientes = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[1]], {
      header: 1,
      blankrows: false,
    });
    expect(clientes[0]).toEqual(['Nome', 'CPF/CNPJ', 'Observações']);
    expect(clientes).toHaveLength(3); // header + 2 linhas
    // Texto gigante foi capado — acima do limite o Excel recusa o arquivo.
    expect(String(clientes[1][2]).length).toBeLessThanOrEqual(32_000);

    // Coluna monetária continua NUMBER (dá pra somar no Excel), com formato.
    const fin = wb.Sheets[wb.SheetNames[2]];
    const cell = fin['B2'] as { t?: string; v?: number; z?: string } | undefined;
    expect(cell?.t).toBe('n');
    expect(cell?.v).toBe(1250.5);
    expect(cell?.z).toBeTruthy();
  });
});
