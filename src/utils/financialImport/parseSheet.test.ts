import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseFinancialSheet, type ParsedRow } from './parseSheet';
import { buildFinancialImportWorkbook } from './buildTemplate';
import {
  SUPPORTED_LOCALES,
  MOVEMENT_VALUE_TEXTS,
  SHEET_NAME_TEXTS,
  PAYMENT_METHOD_LABEL_TEXTS,
  MOVEMENT_COLUMN_HEADER_TEXTS,
  type MovementColumnKey,
  type SupportedLocale,
} from './templateCopy';

/**
 * Preenche uma linha de dados no molde GERADO, localizando cada coluna pelo
 * NOME do cabeçalho real — nunca por posição.
 *
 * ⚠️ Antes isto era um array posicional com um `''` pra cada coluna, e um
 * comentário pedindo "mesma ordem de MOVEMENT_COLUMN_LAYOUT". Já quebrou DUAS
 * vezes por isso: na separação Cliente/Fornecedor e na entrada do Vencimento
 * (18/10/2026). Toda coluna nova no molde fazia 8 testes falharem com
 * `needs_review` em vez de `ready`, sem nenhum deles apontar a causa — e, pior,
 * um deslocamento silencioso podia passar como verde se as duas colunas
 * trocadas aceitassem texto livre. Por nome, coluna nova não afeta nada.
 */
function addMovementRow(
  sheet: NonNullable<ReturnType<Awaited<ReturnType<typeof buildFinancialImportWorkbook>>['getWorksheet']>>,
  locale: SupportedLocale,
  dados: Partial<Record<MovementColumnKey, unknown>>,
): void {
  const headers = MOVEMENT_COLUMN_HEADER_TEXTS[locale];
  const headerRow = sheet.getRow(1);
  const indexByHeader = new Map<string, number>();
  headerRow.eachCell((cell, col) => {
    if (cell.value != null) indexByHeader.set(String(cell.value).trim(), col);
  });

  const linha = sheet.addRow([]);
  for (const [chave, valor] of Object.entries(dados) as Array<[MovementColumnKey, unknown]>) {
    const rotulo = headers[chave];
    const col = indexByHeader.get(rotulo);
    // Falha ALTO: cabeçalho que o molde não escreveu significa que a chave
    // mudou de nome e o teste estaria medindo outra coisa.
    expect(col, `coluna "${rotulo}" (${chave}) não existe no molde gerado em ${locale}`).toBeDefined();
    linha.getCell(col as number).value = valor as never;
  }
  linha.commit();
}

/** Monta um `.xlsx` em memória (ArrayBuffer) a partir de 1+ abas de array-of-arrays. */
function buildWorkbook(sheets: Array<{ name: string; rows: unknown[][] }>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

// Molde NOVO (desde 2026-10-18): "Cliente" e "Fornecedor" são colunas
// separadas, no lugar da antiga "Cliente/Fornecedor" única.
const DEFAULT_HEADER = [
  'Data',
  'Tipo',
  'Descrição',
  'Valor',
  'Categoria',
  'Conta',
  'Cliente',
  'Fornecedor',
  'Centro de custo',
  'Forma de pagamento',
  'Pago?',
  'Data do pagamento',
  'Observações',
];

/** Molde VELHO (antes de 2026-10-18) — coluna ÚNICA "Cliente/Fornecedor", pro teste de compatibilidade. */
const OLD_HEADER = [
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

  /**
   * ⚠️ Este teste já afirmou o CONTRÁRIO (que Tipo=Saída com valor positivo era
   * conflito) e isso era um BUG, não um contrato: a aba "Leia primeiro" do
   * molde manda o cliente escrever o valor SEMPRE positivo e deixar o Tipo
   * decidir a direção. Com a regra antiga, uma planilha preenchida exatamente
   * como o molde instrui saía 100% em "precisa conferir" — medido em
   * 18/10/2026: 15 de 22 linhas de uma planilha de QA. Número positivo não é
   * afirmação de direção neste molde; só o NEGATIVO é.
   */
  it('Tipo=Saída com valor POSITIVO é o jeito que o molde MANDA preencher: ready, sem aviso', async () => {
    const buf = movementsWorkbook([['17/10/2026', 'Saída', 'Pagamento', 150, 'Fornecedores', 'Banco Principal']]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].state).toBe('ready');
    expect(rows[0].amount).toBe(150);
    expect(rows[0].type).toBe('saida');
    expect(rows[0].issues).toEqual([]);
  });

  it('o ÚNICO conflito real (valor NEGATIVO com Tipo=Entrada) ainda cai em needs_review, direção fica a do Tipo', async () => {
    const buf = movementsWorkbook([['17/10/2026', 'Entrada', 'Recebimento', -150, 'Vendas', 'Banco Principal']]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].state).toBe('needs_review');
    expect(rows[0].amount).toBe(150);
    expect(rows[0].type).toBe('entrada');
    expect(rows[0].issues.some((i) => i.includes('não combinam'))).toBe(true);
  });

  it('Tipo=Entrada com valor positivo: ready (o caso trivial, pra provar que o conflito não vazou pro outro lado)', async () => {
    const buf = movementsWorkbook([['17/10/2026', 'Entrada', 'Recebimento', 150, 'Vendas', 'Banco Principal']]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].state).toBe('ready');
    expect(rows[0].type).toBe('entrada');
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
      ['17/10/2026', 'Entrada', 'Recebimento', 100, 'Vendas', 'Banco Principal', '', '', '', '', '', '', '', 'NF-123'],
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
      // índices 6-9 = Cliente/Fornecedor/Centro de custo/Forma de pagamento (vazios),
      // 10 = Pago? ("Não"), 11 = Data do pagamento (vazia).
      ['17/10/2026', 'Entrada', 'Recebimento', 100, 'Vendas', 'Banco Principal', '', '', '', '', 'Não', ''],
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
      categories: [{ name: 'Vendas', color: '#16A34A', type: 'ambos' }],
      costCenters: [{ name: 'Administrativo', color: '#7C3AED' }],
      customers: [{ name: 'Cliente Teste' }],
      suppliers: [{ name: 'Fornecedor Teste' }],
      paymentMethods: ['Pix'],
      locale,
      currencyCode: 'BRL',
    });

    const sheetNames = SHEET_NAME_TEXTS[locale];
    const sheet = workbook.getWorksheet(sheetNames.movements);
    expect(sheet).toBeDefined();
    const values = MOVEMENT_VALUE_TEXTS[locale];

    addMovementRow(sheet!, locale, {
      date: '17/10/2026',
      type: values.entrada,
      description: 'Recebimento de teste',
      amount: 1234.56,
      category: 'Vendas',
      account: 'Banco Principal',
      customer: 'Cliente Teste',
      supplier: 'Fornecedor Teste',
      costCenter: 'Administrativo',
      paymentMethod: 'Pix',
      isPaid: values.sim,
      paidDate: '17/10/2026',
    });

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
    expect(row.customer).toBe('Cliente Teste');
    expect(row.supplier).toBe('Fornecedor Teste');
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
        categories: [{ name: 'Fornecedores', color: '#DC2626', type: 'saida' }],
        costCenters: [],
        customers: [],
        suppliers: [],
        paymentMethods: [],
        locale,
        currencyCode: 'BRL',
      });

      const sheetNames = SHEET_NAME_TEXTS[locale];
      const sheet = workbook.getWorksheet(sheetNames.movements);
      const values = MOVEMENT_VALUE_TEXTS[locale];

      addMovementRow(sheet!, locale, {
        date: '17/10/2026',
        type: values.saida,
        description: 'Pagamento de teste',
        amount: -99.9, // sinal coerente com Tipo = saída, pra não disparar o aviso de conflito
        category: 'Fornecedores',
        account: 'Banco Principal',
        // Linha NÃO paga COM vencimento: é o único caso em que o vencimento
        // tem efeito, e é o caso que o molde não cobria até 18/10/2026.
        dueDate: '15/11/2026',
        isPaid: values.nao,
      });

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
      expect(row.dueDate).toBe('2026-11-15');
    },
    20_000,
  );
});

describe('parseFinancialSheet — Vencimento', () => {
  /**
   * Cabeçalho PRÓPRIO com "Vencimento" no fim, em vez de mexer no
   * `DEFAULT_HEADER`: as linhas dos outros testes são arrays posicionais mais
   * curtos que o cabeçalho, então inserir uma coluna NO MEIO do
   * `DEFAULT_HEADER` deslocaria silenciosamente os valores deles.
   */
  const HEADER_COM_VENCIMENTO = [...DEFAULT_HEADER, 'Vencimento'];
  const linha = (pago: string, vencimento: unknown) => [
    '17/10/2026',
    'Saída',
    'Aluguel',
    -2500,
    'Fornecedores',
    'Banco Principal',
    '',
    '',
    '',
    '',
    pago,
    '',
    '',
    vencimento,
  ];
  const parse = async (pago: string, vencimento: unknown) => {
    const buf = buildWorkbook([
      { name: 'Movimentações', rows: [HEADER_COM_VENCIMENTO, linha(pago, vencimento)] },
    ]);
    const { rows } = await parseFinancialSheet(buf);
    return rows.filter((r) => r.state !== 'skipped')[0];
  };

  it('vencimento em dd/mm/aaaa numa linha não paga é lido e a linha fica pronta', async () => {
    const row = await parse('Não', '15/11/2026');
    expect(row.dueDate).toBe('2026-11-15');
    expect(row.isPaid).toBe(false);
    expect(row.state).toBe('ready');
  });

  it('vencimento como número de série do Excel converte sem off-by-one', async () => {
    // 46341 = 15/11/2026 (mesma via do serial de `date`: XLSX.SSF).
    const row = await parse('Não', 46341);
    expect(row.dueDate).toBe('2026-11-15');
  });

  it('vencimento em branco fica null — o FALLBACK (vence na data do lançamento) é do servidor, não do parser', async () => {
    const row = await parse('Não', '');
    expect(row.dueDate).toBeNull();
    // Em branco não é problema: a planilha antiga nem tinha esta coluna.
    expect(row.state).toBe('ready');
  });

  it('vencimento inválido vira issue e needs_review, nunca quebra o parse', async () => {
    const row = await parse('Não', '31/02/2026 ou depois');
    expect(row.dueDate).toBeNull();
    expect(row.state).toBe('needs_review');
    expect(row.issues.some((i) => i.toLowerCase().includes('vencimento'))).toBe(true);
  });

  it('linha PAGA com vencimento preenchido: o parser repassa, quem ignora e avisa é o servidor', async () => {
    // O parser não decide regra de negócio — se decidisse aqui E no resolvedor,
    // os dois poderiam discordar e a tela mostraria algo diferente do gravado.
    const row = await parse('Sim', '15/11/2026');
    expect(row.isPaid).toBe(true);
    expect(row.dueDate).toBe('2026-11-15');
    expect(row.state).toBe('ready');
  });

  it('"Data de vencimento" NÃO é engolido pela coluna genérica "Data"', async () => {
    const buf = buildWorkbook([
      {
        name: 'Movimentações',
        rows: [
          ['Data', 'Tipo', 'Descrição', 'Valor', 'Categoria', 'Conta', 'Pago?', 'Data de vencimento'],
          ['17/10/2026', 'Saída', 'Aluguel', -2500, 'Fornecedores', 'Banco Principal', 'Não', '15/11/2026'],
        ],
      },
    ]);
    const { rows } = await parseFinancialSheet(buf);
    const row = rows.filter((r) => r.state !== 'skipped')[0];
    expect(row.date).toBe('2026-10-17');
    expect(row.dueDate).toBe('2026-11-15');
  });
});

describe('parseFinancialSheet — dia que não existe no mês', () => {
  /**
   * 31/02, 31/04, 31/06, 31/09 e 31/11 são erros de digitação banais. Até
   * 18/10/2026 o parser aceitava todos (a checagem era só `dia <= 31`) e
   * devolvia `2026-02-31` sem UM aviso. Esse texto casava com o guard de
   * formato do servidor e estourava no `::date`, derrubando a conferência
   * INTEIRA — não só a linha errada. Hoje o servidor se protege, mas o aviso
   * nasce aqui, onde dá pra dizer qual célula está errada.
   */
  const comData = (dataLancamento: string, vencimento = '') =>
    buildWorkbook([{ name: 'Movimentações', rows: [
      ['Data', 'Tipo', 'Descrição', 'Valor', 'Categoria', 'Conta', 'Pago?', 'Vencimento'],
      [dataLancamento, 'Saída', 'Compra de gás', 100, 'Fornecedores', 'Banco Principal', 'Não', vencimento],
    ] }]);

  it.each(['31/02/2026', '31/04/2026', '31/06/2026', '31/09/2026', '31/11/2026', '30/02/2026'])(
    '"%s" é recusada com aviso, nunca vira data torta',
    async (ruim) => {
      const { rows } = await parseFinancialSheet(comData(ruim));
      const row = rows.filter((r) => r.state !== 'skipped')[0];
      expect(row.date).toBeNull();
      expect(row.state).toBe('needs_review');
      expect(row.issues.some((i) => i.toLowerCase().includes('data inválida'))).toBe(true);
    },
  );

  it('o MESMO erro no Vencimento também é pego', async () => {
    const { rows } = await parseFinancialSheet(comData('15/10/2026', '31/04/2026'));
    const row = rows.filter((r) => r.state !== 'skipped')[0];
    expect(row.date).toBe('2026-10-15');
    expect(row.dueDate).toBeNull();
    expect(row.issues.some((i) => i.toLowerCase().includes('vencimento'))).toBe(true);
  });

  it('29/02 em ano BISSEXTO continua válida (não virou restrição burra)', async () => {
    const { rows } = await parseFinancialSheet(comData('29/02/2028'));
    const row = rows.filter((r) => r.state !== 'skipped')[0];
    expect(row.date).toBe('2028-02-29');
  });

  it('29/02 em ano NÃO bissexto é recusada', async () => {
    const { rows } = await parseFinancialSheet(comData('29/02/2026'));
    expect(rows.filter((r) => r.state !== 'skipped')[0].date).toBeNull();
  });

  it('último dia de cada mês de 31 e de 30 dias continua passando', async () => {
    for (const [data, esperado] of [['31/01/2026', '2026-01-31'], ['30/04/2026', '2026-04-30'], ['31/12/2026', '2026-12-31']] as const) {
      const { rows } = await parseFinancialSheet(comData(data));
      expect(rows.filter((r) => r.state !== 'skipped')[0].date).toBe(esperado);
    }
  });
});

describe('parseFinancialSheet — colisão "Si"/"No" (igualdade exata, nunca includes)', () => {
  it('"No" (não, en/es) marca Pago como não, sem precisar de acento', async () => {
    const buf = movementsWorkbook([
      ['17/10/2026', 'Entrada', 'Recebimento', 100, 'Vendas', 'Banco Principal', '', '', '', '', 'No', ''],
    ]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].isPaid).toBe(false);
    expect(rows[0].issues.some((i) => i.includes('não reconhecido'))).toBe(false);
  });

  it('"Si"/"Sí" (sim, es) marca Pago como sim', async () => {
    const buf = movementsWorkbook([
      ['17/10/2026', 'Entrada', 'A', 100, 'Vendas', 'Banco Principal', '', '', '', '', 'Si', ''],
      ['17/10/2026', 'Entrada', 'B', 100, 'Vendas', 'Banco Principal', '', '', '', '', 'Sí', ''],
    ]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].isPaid).toBe(true);
    expect(rows[1].isPaid).toBe(true);
  });

  it('"Nota", "Novembro" e "Nome" em "Pago?" NUNCA casam com "Não" por substring — ficam unrecognized (assumido Sim, com aviso)', async () => {
    const buf = movementsWorkbook([
      ['17/10/2026', 'Entrada', 'A', 100, 'Vendas', 'Banco Principal', '', '', '', '', 'Nota', ''],
      ['17/10/2026', 'Entrada', 'B', 100, 'Vendas', 'Banco Principal', '', '', '', '', 'Novembro', ''],
      ['17/10/2026', 'Entrada', 'C', 100, 'Vendas', 'Banco Principal', '', '', '', '', 'Nome', ''],
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

describe('parseFinancialSheet — Cliente e Fornecedor (colunas separadas do molde novo)', () => {
  it('coluna "Cliente" preenchida vai pra `customer`, "Fornecedor" fica null quando vazia', async () => {
    const buf = movementsWorkbook([
      ['17/10/2026', 'Entrada', 'Recebimento', 100, 'Vendas', 'Banco Principal', 'Cliente ABC Ltda', ''],
    ]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].customer).toBe('Cliente ABC Ltda');
    expect(rows[0].supplier).toBeNull();
    // Molde novo nunca escreve "Cliente/Fornecedor" — a coluna não existe no
    // header, então `counterparty` fica null, sem confundir com `customer`.
    expect(rows[0].counterparty).toBeNull();
    expect(rows[0].state).toBe('ready');
  });

  it('coluna "Fornecedor" preenchida vai pra `supplier`, "Cliente" fica null quando vazia', async () => {
    const buf = movementsWorkbook([
      ['17/10/2026', 'Saída', 'Pagamento', -100, 'Fornecedores', 'Banco Principal', '', 'Fornecedor XYZ Ltda'],
    ]);
    const { rows } = await parseFinancialSheet(buf);
    expect(rows[0].supplier).toBe('Fornecedor XYZ Ltda');
    expect(rows[0].customer).toBeNull();
    expect(rows[0].counterparty).toBeNull();
    expect(rows[0].state).toBe('ready');
  });

  it('planilha ANTIGA, com a coluna única "Cliente/Fornecedor" (molde pré-2026-10-18), continua reconhecida — vai pra `counterparty`, nunca pra `customer`/`supplier`', async () => {
    const buf = buildWorkbook([
      {
        name: 'Movimentações',
        rows: [
          OLD_HEADER,
          ['17/10/2026', 'Entrada', 'Recebimento', 100, 'Vendas', 'Banco Principal', 'Cliente ou Fornecedor Antigo'],
        ],
      },
    ]);
    const { rows, warnings } = await parseFinancialSheet(buf);
    expect(rows[0].counterparty).toBe('Cliente ou Fornecedor Antigo');
    expect(rows[0].customer).toBeNull();
    expect(rows[0].supplier).toBeNull();
    expect(rows[0].state).toBe('ready');
    // Nem "Cliente" nem "Fornecedor" são obrigatórias — a coluna única velha
    // não dispara nenhum aviso de coluna ausente.
    expect(warnings.join(' ')).not.toContain('Cliente');
    expect(warnings.join(' ')).not.toContain('Fornecedor');
  });
});

describe('parseFinancialSheet — rótulo de forma de pagamento (passthrough, servidor resolve)', () => {
  // `parseSheet.ts` NÃO classifica forma de pagamento (diferente de Tipo/
  // Pago?) — o texto da célula volta intacto, seja código cru ("pix") ou
  // rótulo humano no idioma do molde ("Cartão de Débito"/"Debit Card"/
  // "Tarjeta de Débito"/"Carte de Débit"). É o servidor
  // (`_financial_import_payment_method`) que resolve os dois. Este teste
  // prova que o rótulo escrito pelo `buildTemplate.ts` em cada um dos 4
  // idiomas volta IGUAL depois do round-trip, sem o parser alterar nada.
  it.each(SUPPORTED_LOCALES)('rótulo de "Cartão de Débito" em "%s" volta intacto do round-trip', async (locale) => {
    const label = PAYMENT_METHOD_LABEL_TEXTS[locale].cartao_debito;
    const workbook = await buildFinancialImportWorkbook({
      companyName: 'Empresa Teste',
      logo: null,
      primaryColor: null,
      accounts: [{ name: 'Banco Principal', color: '#2563EB' }],
      categories: [{ name: 'Vendas', color: '#16A34A', type: 'ambos' }],
      costCenters: [],
      customers: [],
      suppliers: [],
      paymentMethods: [label],
      locale,
      currencyCode: 'BRL',
    });

    const sheetNames = SHEET_NAME_TEXTS[locale];
    const sheet = workbook.getWorksheet(sheetNames.movements);
    const values = MOVEMENT_VALUE_TEXTS[locale];

    addMovementRow(sheet!, locale, {
      date: '17/10/2026',
      type: values.entrada,
      description: 'Recebimento de teste',
      amount: 100,
      category: 'Vendas',
      account: 'Banco Principal',
      paymentMethod: label,
      isPaid: values.sim,
      paidDate: '17/10/2026',
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const { rows } = await parseFinancialSheet(bufferToArrayBuffer(buffer));
    const dataRows = rows.filter((r) => r.state !== 'skipped');
    expect(dataRows).toHaveLength(1);
    expect(dataRows[0].paymentMethod).toBe(label);
  }, 20_000);
});
