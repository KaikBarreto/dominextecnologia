import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseEntityImportWorkbook } from './parseWorkbook';
import { DOMINEX_IMPORT_HEADERS } from './templates';

function workbook(
  sheets: Array<{ name: string; rows: unknown[][] }>,
  bookType: 'xlsx' | 'xls' = 'xlsx',
): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer;
}

function rowFor(headers: readonly string[], values: Record<string, unknown>): unknown[] {
  return headers.map((header) => values[header] ?? '');
}

describe('parseEntityImportWorkbook — Modelo Dominex', () => {
  it('detecta e normaliza clientes por cabeçalho, incluindo número brasileiro e documento textual', async () => {
    const headers = DOMINEX_IMPORT_HEADERS.customers;
    const data = workbook([{ name: 'Dados', rows: [
      [...headers],
      rowFor(headers, {
        'ID externo': 'cli-ficticio-001',
        'Nome*': 'Cliente Fictício Exemplo',
        'Tipo (PF/PJ)': 'PJ',
        'CPF/CNPJ': '11.222.333/0001-81',
        'Razão social': 'Empresa Fictícia de Testes Ltda.',
        'Celular': '(11) 98888-7777',
        'Número': '100',
        'Status': 'Ativo',
      }),
    ] }]);

    const result = await parseEntityImportWorkbook({ entity: 'customers', data });
    expect(result.errors).toEqual([]);
    expect(result.source).toMatchObject({ provider: 'dominex', entity: 'customers', headerRow: 1 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      sourceId: 'cli-ficticio-001',
      name: 'Cliente Fictício Exemplo',
      customerType: 'pj',
      document: '11222333000181',
      active: true,
    });
    expect(result.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.canonicalHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('lê Modelo Dominex de fornecedores salvo como .xls', async () => {
    const headers = DOMINEX_IMPORT_HEADERS.suppliers;
    const data = workbook([{ name: 'Dados', rows: [
      [...headers],
      rowFor(headers, {
        'Nome*': 'Fornecedor Fictício',
        'CPF/CNPJ': '11.222.333/0001-81',
        'Contato': 'Contato de Teste',
        'Observações': 'Fixture sem dados reais',
      }),
    ] }], 'xls');

    const result = await parseEntityImportWorkbook({ entity: 'suppliers', data });
    expect(result.errors).toEqual([]);
    expect(result.source?.provider).toBe('dominex');
    expect(result.rows[0]).toMatchObject({ name: 'Fornecedor Fictício', document: '11222333000181' });
  });

  it('normaliza equipamento e vínculo de cliente somente no Modelo Dominex', async () => {
    const headers = DOMINEX_IMPORT_HEADERS.equipment;
    const data = workbook([{ name: 'Dados', rows: [
      [...headers],
      rowFor(headers, {
        'ID externo': 'eq-ficticio-001',
        'Documento do cliente': '529.982.247-25',
        'Cliente': 'Cliente Fictício Exemplo',
        'Nome*': 'Equipamento de Teste',
        'Marca': 'Marca Exemplo',
        'Modelo': 'Modelo X',
        'Número de série': 'SERIE-FICTICIA-001',
        'Data de instalação': '10/11/2026',
        'Garantia até': '10/11/2027',
        'Status': 'ativo',
      }),
    ] }]);

    const result = await parseEntityImportWorkbook({ entity: 'equipment', data });
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      customerDocument: '52998224725',
      customerName: 'Cliente Fictício Exemplo',
      name: 'Equipamento de Teste',
      installDate: '2026-11-10',
      warrantyUntil: '2027-11-10',
      status: 'active',
    });
  });

  it('gera o mesmo hash canônico quando apenas a ordem das linhas muda', async () => {
    const headers = DOMINEX_IMPORT_HEADERS.suppliers;
    const first = rowFor(headers, { 'Nome*': 'Fornecedor Fictício A', 'Observações': 'Fixture A' });
    const second = rowFor(headers, { 'Nome*': 'Fornecedor Fictício B', 'Observações': 'Fixture B' });
    const left = workbook([{ name: 'Dados', rows: [[...headers], first, second] }]);
    const right = workbook([{ name: 'Dados', rows: [[...headers], second, first] }]);

    const [a, b] = await Promise.all([
      parseEntityImportWorkbook({ entity: 'suppliers', data: left }),
      parseEntityImportWorkbook({ entity: 'suppliers', data: right }),
    ]);
    expect(a.canonicalHash).toBe(b.canonicalHash);
    expect(a.fileHash).not.toBe(b.fileHash);
  });
});

describe('parseEntityImportWorkbook — Auvo', () => {
  it('remove deterministicamente a linha descritiva e usa o estoque total consolidado', async () => {
    const headers = [
      'Nome', 'Descrição', 'Estoque total', 'Estoque empresa', 'Categoria', 'Status',
      'Custo unitário', 'Valor unitário', 'Estoque mínimo', 'Unidade', 'Origem do produto', 'SKU',
    ];
    const data = workbook([{ name: 'produtos_exportados', rows: [
      headers,
      ['Nome do produto.', '', 'Estoque total.', 'Estoque empresa.', '', "Status do produto. 'Ativo' ou 'Inativo'", 'Custo.', 'Venda.', 'Mínimo.', 'Unidade.', 'Origem.', 'SKU.'],
      ['Material Fictício', 'Somente teste', '7,5', '-2,5', 'TESTE', 'Ativo', 'R$ 1.234,56', '2.000,00', '3', '', '0', 'SKU-FICTICIO'],
    ] }]);

    const result = await parseEntityImportWorkbook({ entity: 'inventory', data });
    expect(result.errors).toEqual([]);
    expect(result.source).toMatchObject({ provider: 'auvo', entity: 'inventory', skippedDescriptionRows: [2] });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ quantity: 7.5, costPrice: 1234.56, salePrice: 2000 });
    expect(result.warnings.map((issue) => issue.code)).toContain('unidade_ausente');
    expect(result.warnings.map((issue) => issue.code)).not.toContain('quantidade_negativa');
  });

  it('mapeia o endereço de cobrança do cliente Auvo para o endereço cadastral', async () => {
    const headers = [
      'Código', 'Código externo', 'Nome', 'CPF ou CNPJ', 'Usuário Auvo responsável', 'Status',
      'CEP do endereço de cobrança', 'Logradouro do endereço de cobrança',
      'Número do endereço de cobrança', 'Complemento do endereço de cobrança',
      'Bairro do endereço de cobrança', 'Cidade do endereço de cobrança',
      'Estado do endereço de cobrança',
    ];
    const data = workbook([{ name: 'clientes_auvo', rows: [
      headers,
      ['Código.', 'Código externo.', 'Nome.', 'Documento.', 'Responsável.', 'Status do cliente no cadastro.', '', '', '', '', '', '', ''],
      ['fixture-001', '', 'Cliente Fictício', '529.982.247-25', 'Usuário de Teste', 'Ativo', '01001000', 'Rua de Teste', '100', 'Sala 1', 'Centro', 'Cidade Exemplo', 'SP'],
    ] }]);

    const result = await parseEntityImportWorkbook({ entity: 'customers', data });
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      address: 'Rua de Teste',
      addressNumber: '100',
      complement: 'Sala 1',
      neighborhood: 'Centro',
      city: 'Cidade Exemplo',
      state: 'SP',
      zipCode: '01001000',
    });
  });

  it('lê fornecedor Auvo e ignora a linha descritiva conhecida', async () => {
    const headers = [
      'Código externo', 'Nome', 'Razão social', 'CPF ou CNPJ', 'Status', 'Telefone',
      'E-mail', 'Falar com', 'Observação', 'Segmento', 'CEP do endereço de cobrança',
      'Logradouro do endereço de cobrança', 'Número do endereço de cobrança',
      'Bairro do endereço de cobrança', 'Complemento do endereço de cobrança',
      'Cidade do endereço de cobrança', 'Estado do endereço de cobrança',
    ];
    const data = workbook([{ name: 'fornecedores_auvo', rows: [
      headers,
      ['Código externo.', 'Nome.', '', 'Documento.', 'Status do fornecedor no cadastro.', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['', 'Fornecedor Fictício', '', '11.222.333/0001-81', 'Ativo', '', '', '', '', '', '01001000', 'Rua de Teste', '100', 'Centro', '', 'Cidade Exemplo', 'SP'],
    ] }]);

    const result = await parseEntityImportWorkbook({ entity: 'suppliers', data });
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ name: 'Fornecedor Fictício', zipCode: '01001000', state: 'SP' });
  });

  it('rejeita explicitamente Auvo quando o destino pedido é equipamentos', async () => {
    const data = workbook([{ name: 'produtos_auvo', rows: [[
      'Nome', 'Estoque total', 'Estoque empresa', 'Custo unitário', 'Valor unitário', 'Origem do produto', 'Status',
    ], [
      'Material Fictício', '1', '1', '10', '20', '0', 'Ativo',
    ]] }]);
    const result = await parseEntityImportWorkbook({ entity: 'equipment', data });
    expect(result.rows).toEqual([]);
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'fonte_nao_suportada' }));
  });
});

describe('parseEntityImportWorkbook — segurança e limites', () => {
  it('rejeita o arquivo inteiro quando encontra fórmula', async () => {
    const headers = DOMINEX_IMPORT_HEADERS.suppliers;
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([[...headers], rowFor(headers, { 'Nome*': 'Fornecedor Fictício' })]);
    sheet.B2 = { t: 'n', f: '1+1', v: 2 };
    XLSX.utils.book_append_sheet(wb, sheet, 'Dados');
    const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const result = await parseEntityImportWorkbook({ entity: 'suppliers', data });
    expect(result.rows).toEqual([]);
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'formula_nao_permitida', sheet: 'Dados' }));
  });

  it('preserva texto literal iniciado por operador quando a célula não é fórmula', async () => {
    const headers = DOMINEX_IMPORT_HEADERS.suppliers;
    const data = workbook([{ name: 'Dados', rows: [
      [...headers],
      rowFor(headers, { 'Nome*': '=1+1', 'Observações': 'Fixture sintética' }),
    ] }]);
    const result = await parseEntityImportWorkbook({ entity: 'suppliers', data });
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ name: '=1+1' });
  });

  it('impõe limite de 5.000 linhas e não aceita configuração menor que o piso', async () => {
    const headers = DOMINEX_IMPORT_HEADERS.suppliers;
    const rows = Array.from({ length: 5_001 }, (_, index) => rowFor(headers, {
      'ID externo': `fixture-${index + 1}`,
      'Nome*': `Fornecedor Fictício ${index + 1}`,
      'Observações': 'Linha gerada em memória para teste de limite',
    }));
    const data = workbook([{ name: 'Dados', rows: [[...headers], ...rows] }]);
    const result = await parseEntityImportWorkbook({ entity: 'suppliers', data, maxRows: 100 });
    expect(result.rows).toEqual([]);
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'limite_de_linhas' }));
  }, 20_000);

  it('rejeita planilha sem assinatura conhecida', async () => {
    const data = workbook([{ name: 'Aleatória', rows: [['Coluna A', 'Coluna B'], ['x', 'y']] }]);
    const result = await parseEntityImportWorkbook({ entity: 'customers', data });
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'formato_nao_reconhecido' }));
  });
});
