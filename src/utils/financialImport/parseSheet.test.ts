import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseFinancialSheet, type ParsedRow } from './parseSheet';
import { buildFinancialImportWorkbook } from './buildTemplate';
import { SUPPORTED_LOCALES, MOVEMENT_VALUE_TEXTS, SHEET_NAME_TEXTS, type SupportedLocale } from './templateCopy';

/** Monta um `.xlsx` em memória (ArrayBuffer) a partir de 1+ abas de array-of-arrays. */
function buildWorkbook(sheets: Array<{ name: string; rows: unknown[][] }>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

const DEFAULT_HEADER = [
  'Data',
  'Tipo',
  'Descrição',
  'Valor',
  'Categoria',
  'Conta',
  'Cliente/Fornecedor',
  'Centro de custo',
  'Forma de pagamento',
  'Pago?',
  'Data do pagamento',
  'Observações',
];

function movementsWorkbook(rows: unknown[][]): ArrayBuffer {
  return buildWorkbook([{ name: 'Movimentações', rows: [DEFAULT_HEADER, ...rows] }]);
}

function readyRows(rows: ParsedRow[]): ParsedRow[] {
  return rows.filter((r) => r.state === 'ready');
}

describe('parseFinancialSheet — data', () => {
  it('data como número de série do Excel (sem formatação de data) converte via SSF, sem off-by-one', async () => {
    // 46312 = 17/10/2026 (serial puro, confirmado via XLSX.SSF.parse_date_code; célula
    // tipo número, sem estilo de data — por isso `cellDates` não converte sozinho).
    const buf = movementsWorkbook([[46312, 'Entrada', 'Recebimento', 500, 'Vendas', 'Banco Principal']]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('2026-10-17');
    expect(rows[0].state).toBe('ready');
  });

  it('data como texto em 3 formatos (dd/mm/yyyy, yyyy-mm-dd, dd-mm-yy) todas resolvem pro mesmo dia', async () => {
    const buf = movementsWorkbook([
      ['17/10/2026', 'Entrada', 'A', 100, 'Vendas', 'Banco Principal'],
      ['2026-10-17', 'Entrada', 'B', 100, 'Vendas', 'Banco Principal'],
      ['17-10-26', 'Entrada', 'C', 100, 'Vendas', 'Banco Principal'],
    ]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows.map((r) => r.date)).toEqual(['2026-10-17', '2026-10-17', '2026-10-17']);
    expect(rows.every((r) => r.state === 'ready')).toBe(true);
  });

  it('data já convertida pelo SheetJS em Date nativo (cellDates) usa getters UTC, sem deslocar o dia', async () => {
    // Data literal como objeto Date no array-of-arrays: SheetJS grava como tipo 'd'.
    const buf = movementsWorkbook([
      [new Date(Date.UTC(2026, 9, 17)), 'Entrada', 'Recebimento', 500, 'Vendas', 'Banco Principal'],
    ]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].date).toBe('2026-10-17');
  });

  it('data inválida vira issue e needs_review, nunca quebra o parse', async () => {
    const buf = movementsWorkbook([['32/13/2026', 'Entrada', 'Recebimento', 500, 'Vendas', 'Banco Principal']]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].state).toBe('needs_review');
    expect(rows[0].date).toBeNull();
    expect(rows[0].issues.some((i) => i.includes('Data inválida'))).toBe(true);
  });
});

describe('parseFinancialSheet — valor', () => {
  it('"R$ 1.234,56" (formato BR, milhar ponto + decimal vírgula) parseia pro valor certo', async () => {
    const buf = movementsWorkbook([
      ['17/10/2026', 'Entrada', 'Recebimento grande', 'R$ 1.234,56', 'Vendas', 'Banco Principal'],
    ]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].amount).toBe(1234.56);
    expect(rows[0].state).toBe('ready');
  });

  it('valor negativo com Tipo "Saída" coerente: amount fica positivo (abs), direção vem do Tipo, sem issue', async () => {
    const buf = movementsWorkbook([['17/10/2026', 'Saída', 'Pagamento', -150, 'Fornecedores', 'Banco Principal']]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].amount).toBe(150);
    expect(rows[0].type).toBe('saida');
    expect(rows[0].state).toBe('ready');
  });

  it('sinal brigando com o Tipo (Tipo=Saída, Valor positivo) NUNCA escolhe em silêncio: needs_review com issue, direção fica a do Tipo', async () => {
    const buf = movementsWorkbook([['17/10/2026', 'Saída', 'Pagamento', 150, 'Fornecedores', 'Banco Principal']]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].state).toBe('needs_review');
    expect(rows[0].amount).toBe(150);
    expect(rows[0].type).toBe('saida');
    expect(rows[0].issues.some((i) => i.includes('não combinam'))).toBe(true);
  });

  it('Tipo vazio infere a direção pelo sinal, sem issue (não é conflito, é inferência unívoca)', async () => {
    const buf = movementsWorkbook([['17/10/2026', '', 'Pagamento', -150, 'Fornecedores', 'Banco Principal']]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].type).toBe('saida');
    expect(rows[0].amount).toBe(150);
    expect(rows[0].state).toBe('ready');
  });
});

describe('parseFinancialSheet — cabeçalho', () => {
  it('cabeçalho reordenado E renomeado ("Valor" → "Valor (R$)") mapeia por nome, nunca por posição', async () => {
    const reordered = [
      ['Valor (R$)', 'Conta', 'Tipo', 'Data', 'Categoria', 'Descrição'],
      [1234.5, 'Banco Principal', 'Entrada', '17/10/2026', 'Vendas', 'Recebimento'],
    ];
    const buf = buildWorkbook([{ name: 'Movimentações', rows: reordered }]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(1234.5);
    expect(rows[0].account).toBe('Banco Principal');
    expect(rows[0].type).toBe('entrada');
    expect(rows[0].date).toBe('2026-10-17');
    expect(rows[0].category).toBe('Vendas');
    expect(rows[0].description).toBe('Recebimento');
    expect(rows[0].state).toBe('ready');
  });

  it('coluna extra desconhecida é ignorada sem reclamar', async () => {
    const withExtra = [
      [...DEFAULT_HEADER, 'Nota Fiscal'],
      ['17/10/2026', 'Entrada', 'Recebimento', 100, 'Vendas', 'Banco Principal', '', '', '', '', '', '', 'NF-123'],
    ];
    const buf = buildWorkbook([{ name: 'Movimentações', rows: withExtra }]);
    const { rows, warnings } = await parseFinancialSheet(buf);
    expect(rows[0].state).toBe('ready');
    expect(warnings.join(' ')).not.toContain('Nota Fiscal');
  });
});

describe('parseFinancialSheet — lixo estrutural', () => {
  it('linha sem Data e sem Valor (sobra no fim do arquivo) é ignorada em silêncio (skipped, sem issues)', async () => {
    const buf = movementsWorkbook([
      ['17/10/2026', 'Entrada', 'Recebimento', 100, 'Vendas', 'Banco Principal'],
      [null, null, null, null, null, null],
      ['', '', '', '', '', ''],
    ]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows).toHaveLength(3);
    expect(rows[0].state).toBe('ready');
    expect(rows[1].state).toBe('skipped');
    expect(rows[1].issues).toEqual([]);
    expect(rows[2].state).toBe('skipped');
  });

  it('categoria/conta que não existem no sistema não derrubam a linha (não é problema do parser)', async () => {
    const buf = movementsWorkbook([
      ['17/10/2026', 'Entrada', 'Recebimento', 100, 'Categoria Inventada', 'Conta Que Não Existe'],
    ]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].state).toBe('ready');
    expect(rows[0].category).toBe('Categoria Inventada');
    expect(rows[0].account).toBe('Conta Que Não Existe');
  });
});

describe('parseFinancialSheet — aba certa', () => {
  it('escolhe a aba "Movimentações" mesmo quando não é a primeira, sem aviso de fallback', async () => {
    const buf = buildWorkbook([
      { name: 'Leia primeiro', rows: [['Instruções'], ['Preencha a aba seguinte']] },
      { name: 'Movimentações', rows: [DEFAULT_HEADER, ['17/10/2026', 'Entrada', 'Recebimento', 100, 'Vendas', 'Banco Principal']] },
    ]);
    const { rows, warnings } = await parseFinancialSheet(buf);
    expect(rows).toHaveLength(1);
    expect(warnings.some((w) => w.includes('Não encontrei'))).toBe(false);
  });

  it('aba renomeada (sem nenhum nome parecido com "Movimentações") cai no fallback por cabeçalho reconhecível, com aviso', async () => {
    const buf = buildWorkbook([
      { name: 'Leia primeiro', rows: [['Instruções']] },
      { name: 'Dados', rows: [DEFAULT_HEADER, ['17/10/2026', 'Entrada', 'Recebimento', 100, 'Vendas', 'Banco Principal']] },
    ]);
    const { rows, warnings } = await parseFinancialSheet(buf);
    expect(rows).toHaveLength(1);
    expect(warnings.some((w) => w.includes('Dados'))).toBe(true);
  });
});

describe('parseFinancialSheet — Pago? e Data do pagamento', () => {
  it('"Pago?" em branco assume Sim, e "Data do pagamento" em branco usa a Data', async () => {
    const buf = movementsWorkbook([
      ['17/10/2026', 'Entrada', 'Recebimento', 100, 'Vendas', 'Banco Principal', '', '', '', '', ''],
    ]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].isPaid).toBe(true);
    expect(rows[0].paidDate).toBe('2026-10-17');
  });

  it('"Pago? = Não" não força Data do pagamento', async () => {
    const buf = movementsWorkbook([
      ['17/10/2026', 'Entrada', 'Recebimento', 100, 'Vendas', 'Banco Principal', '', '', '', 'Não', ''],
    ]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].isPaid).toBe(false);
    expect(rows[0].paidDate).toBeNull();
  });
});

describe('parseFinancialSheet — contentKey (base da trava de duplicidade)', () => {
  it('2 pagamentos idênticos no mesmo dia geram o MESMO contentKey (dedup fica a cargo de quem chama, não do parser)', async () => {
    const buf = movementsWorkbook([
      ['17/10/2026', 'Entrada', 'Mensalidade', 500, 'Vendas', 'Banco X'],
      ['17/10/2026', 'Entrada', 'Mensalidade', 500, 'Vendas', 'Banco X'],
    ]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows).toHaveLength(2);
    expect(rows[0].contentKey).toBe(rows[1].contentKey);
    expect(rows[0].contentKey).toMatch(/^[0-9a-f]{8}$/);
  });

  it('contentKey muda quando valor, data, descrição ou conta mudam', async () => {
    const buf = movementsWorkbook([
      ['17/10/2026', 'Entrada', 'Mensalidade', 500, 'Vendas', 'Banco X'],
      ['18/10/2026', 'Entrada', 'Mensalidade', 500, 'Vendas', 'Banco X'],
    ]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].contentKey).not.toBe(rows[1].contentKey);
  });
});

describe('parseFinancialSheet — volume', () => {
  it('processa até ~5000 linhas e trunca (com aviso) o que passar disso, sem travar', async () => {
    const rowsInput = Array.from({ length: 5005 }, (_, i) => [
      '17/10/2026',
      'Entrada',
      `Linha ${i}`,
      100,
      'Vendas',
      'Banco Principal',
    ]);
    const buf = movementsWorkbook(rowsInput);
    const { rows, warnings } = await parseFinancialSheet(buf);
    expect(rows).toHaveLength(5000);
    expect(warnings.some((w) => w.includes('5000'))).toBe(true);
  }, 20_000);
});

describe('parseFinancialSheet — campos obrigatórios ausentes na linha', () => {
  it('Descrição/Categoria/Conta vazias geram issues e needs_review, mas não derrubam a linha', async () => {
    const buf = movementsWorkbook([['17/10/2026', 'Entrada', '', 100, '', '']]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].state).toBe('needs_review');
    expect(rows[0].issues).toEqual(
      expect.arrayContaining(['Descrição não informada.', 'Categoria não informada.', 'Conta não informada.']),
    );
  });
});

describe('parseFinancialSheet — sanity de contadores', () => {
  it('conta prontas x pra conferir no mesmo arquivo', async () => {
    const buf = movementsWorkbook([
      ['17/10/2026', 'Entrada', 'Recebimento', 100, 'Vendas', 'Banco Principal'],
      ['17/10/2026', 'Saída', 'Pagamento', 50, '', 'Banco Principal'], // sem categoria → needs_review
    ]);
    const { rows } = await parseFinancialSheet(buf);
    expect(readyRows(rows)).toHaveLength(1);
    expect(rows.filter((r) => r.state === 'needs_review')).toHaveLength(1);
  });
});

/**
 * Converte o `Buffer` que `exceljs` devolve (`workbook.xlsx.writeBuffer()`)
 * pro `ArrayBuffer` que `parseFinancialSheet` espera — mesma régua de tipo
 * do navegador (`fetch().arrayBuffer()`), só que em Node/vitest o exceljs
 * devolve `Buffer` (subclasse de `Uint8Array`), não `ArrayBuffer` puro.
 */
/**
 * `workbook.xlsx.writeBuffer()` é tipado pelo PRÓPRIO `exceljs` como
 * `Buffer` — mas o `exceljs/index.d.ts` declara `interface Buffer extends
 * ArrayBuffer {}` dentro do escopo do módulo, sombreando o `Buffer` global
 * do Node só pra efeito de tipo (o valor em runtime é um `Buffer` de
 * verdade). `parseFinancialSheet` recebe `ArrayBuffer` e usa
 * `new Uint8Array(bytes)` por dentro, que aceita tanto `ArrayBuffer` quanto
 * qualquer `Uint8Array`/`Buffer` (copia os bytes do jeito certo nos dois
 * casos) — o cast abaixo só resolve a divergência de TIPO, o runtime
 * funciona igual.
 */
function bufferToArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
  return buffer;
}

describe('parseFinancialSheet — round-trip do molde multilíngue (buildFinancialImportWorkbook → parseFinancialSheet)', () => {
  // É EXATAMENTE o round-trip que a decisão original (molde sempre PT-BR)
  // protegia. Gera o molde de verdade em cada um dos 4 idiomas, preenche uma
  // linha com os valores canônicos do dropdown daquele locale (ex: "Income"/
  // "Yes" em inglês) e relê com o parser — cabeçalho E linha têm que sair
  // certos nos 4, sem aviso de fallback de aba.
  it.each(SUPPORTED_LOCALES)('molde gerado em "%s" é relido com cabeçalho e linha corretos', async (locale) => {
    const workbook = await buildFinancialImportWorkbook({
      companyName: 'Empresa Teste',
      logo: null,
      primaryColor: null,
      accounts: [{ name: 'Banco Principal', color: '#2563EB' }],
      categories: [{ name: 'Vendas', color: '#16A34A' }],
      costCenters: [{ name: 'Administrativo', color: '#7C3AED' }],
      paymentMethods: ['Pix'],
      locale,
      currencyCode: 'BRL',
    });

    const sheetNames = SHEET_NAME_TEXTS[locale];
    const sheet = workbook.getWorksheet(sheetNames.movements);
    expect(sheet).toBeDefined();
    const values = MOVEMENT_VALUE_TEXTS[locale];

    // Mesma ordem de `MOVEMENT_COLUMN_LAYOUT` em `buildTemplate.ts`: date,
    // type, description, amount, category, account, counterparty,
    // costCenter, paymentMethod, isPaid, paidDate, notes.
    sheet!.addRow([
      '17/10/2026',
      values.entrada,
      'Recebimento de teste',
      1234.56,
      'Vendas',
      'Banco Principal',
      'Cliente Teste',
      'Administrativo',
      'Pix',
      values.sim,
      '17/10/2026',
      '',
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    const { rows, warnings } = await parseFinancialSheet(bufferToArrayBuffer(buffer));

    expect(warnings.some((w) => w.includes('Não encontrei'))).toBe(false);
    // O molde reserva validação até a linha 2000 (`MOVEMENT_DATA_ROWS_END`),
    // o que faz o exceljs materializar células vazias nessa faixa inteira —
    // todas voltam `skipped` (sem issue), só a linha que preenchemos é dados
    // de verdade. Mesmo filtro do helper `readyRows` já usado no arquivo.
    const dataRows = rows.filter((r) => r.state !== 'skipped');
    expect(dataRows).toHaveLength(1);
    const row = dataRows[0];
    expect(row.state).toBe('ready');
    expect(row.date).toBe('2026-10-17');
    expect(row.type).toBe('entrada');
    expect(row.amount).toBe(1234.56);
    expect(row.category).toBe('Vendas');
    expect(row.account).toBe('Banco Principal');
    expect(row.counterparty).toBe('Cliente Teste');
    expect(row.costCenter).toBe('Administrativo');
    expect(row.paymentMethod).toBe('Pix');
    expect(row.isPaid).toBe(true);
    expect(row.paidDate).toBe('2026-10-17');
  }, 20_000);

  it.each(SUPPORTED_LOCALES)(
    'molde gerado em "%s" com Tipo = saída e Pago = não também relê certo',
    async (locale) => {
      const workbook = await buildFinancialImportWorkbook({
        companyName: 'Empresa Teste',
        logo: null,
        primaryColor: null,
        accounts: [{ name: 'Banco Principal', color: '#2563EB' }],
        categories: [{ name: 'Fornecedores', color: '#DC2626' }],
        costCenters: [],
        paymentMethods: [],
        locale,
        currencyCode: 'BRL',
      });

      const sheetNames = SHEET_NAME_TEXTS[locale];
      const sheet = workbook.getWorksheet(sheetNames.movements);
      const values = MOVEMENT_VALUE_TEXTS[locale];

      sheet!.addRow([
        '17/10/2026',
        values.saida,
        'Pagamento de teste',
        -99.9, // sinal coerente com Tipo = saída, pra não disparar o aviso de conflito
        'Fornecedores',
        'Banco Principal',
        '',
        '',
        '',
        values.nao,
        '',
        '',
      ]);

      const buffer = await workbook.xlsx.writeBuffer();
      const { rows } = await parseFinancialSheet(bufferToArrayBuffer(buffer));

      const dataRows = rows.filter((r) => r.state !== 'skipped');
      expect(dataRows).toHaveLength(1);
      const row = dataRows[0];
      expect(row.state).toBe('ready');
      expect(row.type).toBe('saida');
      expect(row.amount).toBe(99.9);
      expect(row.isPaid).toBe(false);
      expect(row.paidDate).toBeNull();
    },
    20_000,
  );
});

describe('parseFinancialSheet — colisão "Si"/"No" (igualdade exata, nunca includes)', () => {
  it('"No" (não, en/es) marca Pago como não, sem precisar de acento', async () => {
    const buf = movementsWorkbook([
      ['17/10/2026', 'Entrada', 'Recebimento', 100, 'Vendas', 'Banco Principal', '', '', '', 'No', ''],
    ]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].isPaid).toBe(false);
    expect(rows[0].issues.some((i) => i.includes('não reconhecido'))).toBe(false);
  });

  it('"Si"/"Sí" (sim, es) marca Pago como sim', async () => {
    const buf = movementsWorkbook([
      ['17/10/2026', 'Entrada', 'A', 100, 'Vendas', 'Banco Principal', '', '', '', 'Si', ''],
      ['17/10/2026', 'Entrada', 'B', 100, 'Vendas', 'Banco Principal', '', '', '', 'Sí', ''],
    ]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].isPaid).toBe(true);
    expect(rows[1].isPaid).toBe(true);
  });

  it('"Nota", "Novembro" e "Nome" em "Pago?" NUNCA casam com "Não" por substring — ficam unrecognized (assumido Sim, com aviso)', async () => {
    const buf = movementsWorkbook([
      ['17/10/2026', 'Entrada', 'A', 100, 'Vendas', 'Banco Principal', '', '', '', 'Nota', ''],
      ['17/10/2026', 'Entrada', 'B', 100, 'Vendas', 'Banco Principal', '', '', '', 'Novembro', ''],
      ['17/10/2026', 'Entrada', 'C', 100, 'Vendas', 'Banco Principal', '', '', '', 'Nome', ''],
    ]);
    const { rows } = await parseFinancialSheet(buf);
    for (const row of rows) {
      // "unrecognized" vira isPaid=true (default) + issue, NUNCA isPaid=false
      // por engano de substring.
      expect(row.isPaid).toBe(true);
      expect(row.issues.some((i) => i.includes('não reconhecido'))).toBe(true);
    }
  });

  it('"Credit"/"Debit" (inglês, fora do dropdown oficial) classificam Tipo corretamente', async () => {
    // Sinal do valor coerente com o Tipo em ambas as linhas (mesmo padrão dos
    // testes acima), pra isolar só a classificação de texto, sem disparar o
    // aviso de "sinal brigando com o Tipo".
    const buf = movementsWorkbook([
      ['17/10/2026', 'Credit', 'Recebimento', 100, 'Vendas', 'Banco Principal'],
      ['17/10/2026', 'Debit', 'Pagamento', -50, 'Fornecedores', 'Banco Principal'],
    ]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].type).toBe('entrada');
    expect(rows[0].state).toBe('ready');
    expect(rows[1].type).toBe('saida');
    expect(rows[1].state).toBe('ready');
  });
});
