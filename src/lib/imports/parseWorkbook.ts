import type { WorkBook, WorkSheet } from 'xlsx';
import { canonicalRowsHash, sha256Hex } from './hash';
import {
  normalizeActive,
  normalizeCustomerType,
  normalizeDate,
  normalizeDocument,
  normalizeHeader,
  normalizePostalCode,
  normalizeState,
  normalizeText,
  parseBrazilianNumber,
} from './normalize';
import {
  DEFAULT_IMPORT_ROW_LIMIT,
  MIN_IMPORT_ROW_LIMIT,
  type CustomerImportRow,
  type EntityImportParseResult,
  type EquipmentImportRow,
  type ImportEntityKind,
  type ImportIssue,
  type ImportProvider,
  type ImportRowByKind,
  type InventoryImportRow,
  type ParseEntityImportOptions,
  type SupplierImportRow,
} from './types';

type Row = unknown[];
type HeaderIndex = Map<string, number[]>;

interface Detection {
  provider: ImportProvider;
  entity: ImportEntityKind;
  sheetName: string;
  sheet: WorkSheet;
  rows: Row[];
  headerIndex: number;
  score: number;
}

interface Signature {
  provider: ImportProvider;
  entity: ImportEntityKind;
  required: string[];
}

const SIGNATURES: Signature[] = [
  { provider: 'auvo', entity: 'customers', required: ['codigo', 'codigo externo', 'nome', 'cpf ou cnpj', 'usuario auvo responsavel'] },
  { provider: 'auvo', entity: 'suppliers', required: ['codigo externo', 'nome', 'cpf ou cnpj', 'status', 'cep do endereco de cobranca'] },
  { provider: 'auvo', entity: 'inventory', required: ['nome', 'estoque total', 'estoque empresa', 'custo unitario', 'valor unitario', 'origem do produto'] },
  { provider: 'dominex', entity: 'customers', required: ['nome', 'tipo pf pj', 'cpf cnpj', 'celular', 'numero'] },
  { provider: 'dominex', entity: 'suppliers', required: ['nome', 'contato', 'cpf cnpj', 'observacoes'] },
  { provider: 'dominex', entity: 'inventory', required: ['nome', 'sku', 'quantidade', 'estoque minimo', 'preco de venda'] },
  { provider: 'dominex', entity: 'equipment', required: ['documento do cliente', 'cliente', 'nome', 'marca', 'modelo', 'numero de serie'] },
];

const MAX_HEADER_SCAN_ROWS = 20;

function bytesOf(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function headerMap(row: Row): HeaderIndex {
  const map: HeaderIndex = new Map();
  row.forEach((value, index) => {
    const key = normalizeHeader(value);
    if (!key) return;
    map.set(key, [...(map.get(key) ?? []), index]);
  });
  return map;
}

function valueAt(row: Row, headers: HeaderIndex, ...aliases: string[]): unknown {
  for (const alias of aliases) {
    const index = headers.get(normalizeHeader(alias))?.[0];
    if (index !== undefined) return row[index];
  }
  return null;
}

function hasAnyValue(row: Row): boolean {
  return row.some((value) => value !== null && value !== undefined && String(value).trim() !== '');
}

function workbookRows(xlsx: typeof import('xlsx'), sheet: WorkSheet): Row[] {
  return xlsx.utils.sheet_to_json<Row>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });
}

function detectWorkbook(xlsx: typeof import('xlsx'), workbook: WorkBook): Detection | null {
  const candidates: Detection[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = workbookRows(xlsx, sheet);
    rows.slice(0, MAX_HEADER_SCAN_ROWS).forEach((row, headerIndex) => {
      const headers = new Set(row.map(normalizeHeader).filter(Boolean));
      for (const signature of SIGNATURES) {
        if (!signature.required.every((required) => headers.has(required))) continue;
        candidates.push({
          ...signature,
          sheetName,
          sheet,
          rows,
          headerIndex,
          score: signature.required.length,
        });
      }
    });
  }
  return candidates.sort((left, right) => right.score - left.score || left.headerIndex - right.headerIndex)[0] ?? null;
}

function formulaIssues(workbook: WorkBook): ImportIssue[] {
  const issues: ImportIssue[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    for (const [address, rawCell] of Object.entries(sheet)) {
      if (address.startsWith('!')) continue;
      const cell = rawCell as { f?: string };
      if (cell.f) {
        issues.push({
          code: 'formula_nao_permitida',
          message: 'A planilha contém fórmula. Substitua fórmulas por valores antes de importar.',
          sheet: sheetName,
          column: address,
        });
      }
    }
  }
  return issues;
}

function isAuvoDescriptionRow(entity: ImportEntityKind, row: Row, headers: HeaderIndex, dataIndex: number): boolean {
  if (dataIndex !== 0) return false;
  const status = normalizeHeader(valueAt(row, headers, 'Status'));
  if (entity === 'customers') return status.startsWith('status do cliente');
  if (entity === 'suppliers') return status.startsWith('status do fornecedor');
  if (entity === 'inventory') return status.startsWith('status do produto');
  return false;
}

function addRequiredNameIssue(errors: ImportIssue[], row: number, name: string) {
  if (name) return;
  errors.push({ code: 'campo_obrigatorio', message: 'Informe o nome.', row, column: 'Nome' });
}

function addDocumentWarning(warnings: ImportIssue[], row: number, document: string | null) {
  if (!document || document.length === 11 || document.length === 14) return;
  warnings.push({
    code: 'documento_invalido',
    message: 'O CPF/CNPJ não tem 11 nem 14 dígitos e precisa ser conferido.',
    row,
    column: 'CPF/CNPJ',
  });
}

function parseNumberField(
  raw: unknown,
  rowNumber: number,
  column: string,
  errors: ImportIssue[],
): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = parseBrazilianNumber(raw);
  if (value === null) {
    errors.push({ code: 'numero_invalido', message: `O valor de ${column} é inválido.`, row: rowNumber, column });
  }
  return value;
}

function parseDateField(
  raw: unknown,
  rowNumber: number,
  column: string,
  errors: ImportIssue[],
  warnings: ImportIssue[],
): string | null {
  const parsed = normalizeDate(raw);
  if (parsed.legacy) {
    warnings.push({
      code: 'data_legada_ignorada',
      message: `A data de ${column} anterior a 1900 foi tratada como não informada.`,
      row: rowNumber,
      column,
    });
  } else if (parsed.invalid) {
    errors.push({ code: 'data_invalida', message: `A data de ${column} é inválida.`, row: rowNumber, column });
  }
  return parsed.value;
}

function joinedNotes(...values: unknown[]): string | null {
  return values.map(normalizeText).filter(Boolean).join('\n') || null;
}

function parseCustomer(
  provider: ImportProvider,
  row: Row,
  headers: HeaderIndex,
  rowNumber: number,
  errors: ImportIssue[],
  warnings: ImportIssue[],
): CustomerImportRow {
  const document = normalizeDocument(valueAt(row, headers, 'CPF ou CNPJ', 'CPF/CNPJ'));
  const companyName = normalizeText(valueAt(row, headers, 'Razão social'));
  const name = normalizeText(valueAt(row, headers, 'Nome')) ?? '';
  addRequiredNameIssue(errors, rowNumber, name);
  addDocumentWarning(warnings, rowNumber, document);

  return {
    rowNumber,
    sourceId: normalizeText(valueAt(row, headers, 'Código', 'ID externo')),
    externalId: normalizeText(valueAt(row, headers, 'Código externo')),
    name,
    customerType: normalizeCustomerType(valueAt(row, headers, 'Tipo (PF/PJ)', 'Tipo'), document, companyName),
    document,
    companyName,
    tradeName: normalizeText(valueAt(row, headers, 'Nome fantasia')),
    email: normalizeText(valueAt(row, headers, 'E-mail corporativo', 'E-mail')),
    phone: normalizeText(valueAt(row, headers, 'Telefone corporativo', 'Telefone')),
    mobile: normalizeText(valueAt(row, headers, 'Celular')),
    contactName: normalizeText(valueAt(row, headers, 'Falar com', 'Contato')),
    address: normalizeText(valueAt(row, headers, 'Endereço', 'Logradouro do endereço de cobrança')),
    addressNumber: normalizeText(valueAt(row, headers, 'Número', 'Número do endereço de cobrança')),
    complement: normalizeText(valueAt(row, headers, 'Complemento do Endereço', 'Complemento', 'Complemento do endereço de cobrança')),
    neighborhood: normalizeText(valueAt(row, headers, 'Bairro', 'Bairro do endereço de cobrança')),
    city: normalizeText(valueAt(row, headers, 'Cidade', 'Cidade do endereço de cobrança')),
    state: normalizeState(valueAt(row, headers, 'Estado', 'Estado do endereço de cobrança')),
    zipCode: normalizePostalCode(valueAt(row, headers, 'CEP', 'CEP do endereço de cobrança')),
    notes: joinedNotes(valueAt(row, headers, 'Observação', 'Observações'), valueAt(row, headers, 'Observação Interna')),
    origin: normalizeText(valueAt(row, headers, 'Origem')),
    stateRegistration: normalizeText(valueAt(row, headers, 'Inscrição Estadual')),
    municipalRegistration: normalizeText(valueAt(row, headers, 'Inscrição Municipal')),
    latitude: parseNumberField(valueAt(row, headers, 'Latitude'), rowNumber, 'Latitude', errors),
    longitude: parseNumberField(valueAt(row, headers, 'Longitude'), rowNumber, 'Longitude', errors),
    active: normalizeActive(valueAt(row, headers, 'Status'), true),
    registeredAt: parseDateField(valueAt(row, headers, 'Data de cadastro'), rowNumber, 'Data de cadastro', errors, warnings),
    lastVisitAt: parseDateField(valueAt(row, headers, 'Última visita'), rowNumber, 'Última visita', errors, warnings),
  };
}

function composeAddress(row: Row, headers: HeaderIndex): string | null {
  const street = normalizeText(valueAt(row, headers, 'Endereço', 'Logradouro do endereço de cobrança'));
  const number = normalizeText(valueAt(row, headers, 'Número', 'Número do endereço de cobrança'));
  return [street, number].filter(Boolean).join(', ') || null;
}

function parseSupplier(
  row: Row,
  headers: HeaderIndex,
  rowNumber: number,
  errors: ImportIssue[],
  warnings: ImportIssue[],
): SupplierImportRow {
  const name = normalizeText(valueAt(row, headers, 'Nome')) ?? '';
  const document = normalizeDocument(valueAt(row, headers, 'CPF ou CNPJ', 'CPF/CNPJ'));
  addRequiredNameIssue(errors, rowNumber, name);
  addDocumentWarning(warnings, rowNumber, document);
  return {
    rowNumber,
    sourceId: normalizeText(valueAt(row, headers, 'ID externo')),
    externalId: normalizeText(valueAt(row, headers, 'Código externo')),
    name,
    legalName: normalizeText(valueAt(row, headers, 'Razão social')),
    document,
    contactName: normalizeText(valueAt(row, headers, 'Falar com', 'Contato')),
    phone: normalizeText(valueAt(row, headers, 'Telefone')),
    email: normalizeText(valueAt(row, headers, 'E-mail')),
    address: composeAddress(row, headers),
    addressNumber: normalizeText(valueAt(row, headers, 'Número', 'Número do endereço de cobrança')),
    complement: normalizeText(valueAt(row, headers, 'Complemento', 'Complemento do endereço de cobrança')),
    neighborhood: normalizeText(valueAt(row, headers, 'Bairro', 'Bairro do endereço de cobrança')),
    city: normalizeText(valueAt(row, headers, 'Cidade', 'Cidade do endereço de cobrança')),
    state: normalizeState(valueAt(row, headers, 'Estado', 'Estado do endereço de cobrança')),
    zipCode: normalizePostalCode(valueAt(row, headers, 'CEP', 'CEP do endereço de cobrança')),
    notes: normalizeText(valueAt(row, headers, 'Observação', 'Observações')),
    segment: normalizeText(valueAt(row, headers, 'Segmento')),
    active: normalizeActive(valueAt(row, headers, 'Status'), true),
  };
}

function parseInventory(
  provider: ImportProvider,
  row: Row,
  headers: HeaderIndex,
  rowNumber: number,
  errors: ImportIssue[],
  warnings: ImportIssue[],
): InventoryImportRow {
  const name = normalizeText(valueAt(row, headers, 'Nome')) ?? '';
  addRequiredNameIssue(errors, rowNumber, name);
  const quantityRaw = provider === 'auvo'
    ? valueAt(row, headers, 'Estoque total')
    : valueAt(row, headers, 'Quantidade');
  const quantity = parseNumberField(quantityRaw, rowNumber, 'Quantidade', errors);
  const unit = normalizeText(valueAt(row, headers, 'Unidade'));
  if (!unit) warnings.push({ code: 'unidade_ausente', message: 'A unidade não foi informada e precisa ser conferida.', row: rowNumber, column: 'Unidade' });
  if (quantity !== null && quantity < 0) warnings.push({ code: 'quantidade_negativa', message: 'A quantidade está negativa e precisa ser conferida.', row: rowNumber, column: 'Quantidade' });
  return {
    rowNumber,
    sourceId: normalizeText(valueAt(row, headers, 'ID externo')),
    name,
    sku: normalizeText(valueAt(row, headers, 'SKU')),
    description: normalizeText(valueAt(row, headers, 'Descrição')),
    category: normalizeText(valueAt(row, headers, 'Categoria')),
    unit,
    quantity,
    minimumQuantity: parseNumberField(valueAt(row, headers, 'Estoque mínimo'), rowNumber, 'Estoque mínimo', errors),
    costPrice: parseNumberField(valueAt(row, headers, 'Custo unitário'), rowNumber, 'Custo unitário', errors),
    salePrice: parseNumberField(valueAt(row, headers, 'Preço de venda', 'Valor unitário'), rowNumber, 'Preço de venda', errors),
    active: normalizeActive(valueAt(row, headers, 'Status'), true),
    fiscalNcm: normalizeText(valueAt(row, headers, 'NCM')),
    fiscalCest: normalizeText(valueAt(row, headers, 'CEST')),
    fiscalCfopInternal: normalizeText(valueAt(row, headers, 'CFOP interno', 'CFOP')),
    fiscalCfopInterstate: normalizeText(valueAt(row, headers, 'CFOP interestadual')),
    fiscalOrigin: normalizeText(valueAt(row, headers, 'Origem fiscal', 'Origem do produto')),
    fiscalIcmsCode: normalizeText(valueAt(row, headers, 'CST/CSOSN ICMS', 'Código da situação tributária do ICMS')),
    fiscalPisCst: normalizeText(valueAt(row, headers, 'CST PIS', 'Código da situação tributária do PIS')),
    fiscalCofinsCst: normalizeText(valueAt(row, headers, 'CST COFINS', 'Código da situação tributária do Cofins')),
    fiscalIpiCst: normalizeText(valueAt(row, headers, 'CST IPI', 'Código da situação tributária do IPI')),
  };
}

function parseEquipment(
  row: Row,
  headers: HeaderIndex,
  rowNumber: number,
  errors: ImportIssue[],
  warnings: ImportIssue[],
): EquipmentImportRow {
  const name = normalizeText(valueAt(row, headers, 'Nome')) ?? '';
  const customerDocument = normalizeDocument(valueAt(row, headers, 'Documento do cliente'));
  addRequiredNameIssue(errors, rowNumber, name);
  addDocumentWarning(warnings, rowNumber, customerDocument);
  return {
    rowNumber,
    sourceId: normalizeText(valueAt(row, headers, 'ID externo')),
    customerDocument,
    customerName: normalizeText(valueAt(row, headers, 'Cliente')),
    name,
    brand: normalizeText(valueAt(row, headers, 'Marca')),
    model: normalizeText(valueAt(row, headers, 'Modelo')),
    serialNumber: normalizeText(valueAt(row, headers, 'Número de série')),
    capacity: normalizeText(valueAt(row, headers, 'Capacidade')),
    location: normalizeText(valueAt(row, headers, 'Localização')),
    installDate: parseDateField(valueAt(row, headers, 'Data de instalação'), rowNumber, 'Data de instalação', errors, warnings),
    warrantyUntil: parseDateField(valueAt(row, headers, 'Garantia até'), rowNumber, 'Garantia até', errors, warnings),
    notes: normalizeText(valueAt(row, headers, 'Observações')),
    identifier: normalizeText(valueAt(row, headers, 'Identificador')),
    status: normalizeActive(valueAt(row, headers, 'Status'), true) ? 'active' : 'inactive',
  };
}

function emptyResult<K extends ImportEntityKind>(fileHash: string, errors: ImportIssue[]): EntityImportParseResult<K> {
  return { rows: [], errors, warnings: [], source: null, fileHash, canonicalHash: null };
}

export async function parseEntityImportWorkbook<K extends ImportEntityKind>(
  options: ParseEntityImportOptions<K>,
): Promise<EntityImportParseResult<K>> {
  const bytes = bytesOf(options.data);
  const fileHash = await sha256Hex(bytes);
  let xlsx: typeof import('xlsx');
  let workbook: WorkBook;
  try {
    xlsx = await import('xlsx');
    workbook = xlsx.read(bytes, { type: 'array', raw: true, cellDates: true, cellFormula: true });
  } catch {
    return emptyResult(fileHash, [{ code: 'arquivo_invalido', message: 'Não foi possível abrir a planilha.' }]);
  }

  const formulas = formulaIssues(workbook);
  if (formulas.length > 0) return emptyResult(fileHash, formulas);

  const detection = detectWorkbook(xlsx, workbook);
  if (!detection) {
    return emptyResult(fileHash, [{ code: 'formato_nao_reconhecido', message: 'O arquivo não corresponde a um Modelo Dominex nem a um export compatível da Auvo.' }]);
  }
  if (options.entity === 'equipment' && detection.provider === 'auvo') {
    return emptyResult(fileHash, [{
      code: 'fonte_nao_suportada',
      message: 'A importação de equipamentos por arquivo Auvo não é suportada. Use o Modelo Dominex de equipamentos.',
    }]);
  }
  if (detection.entity !== options.entity) {
    return emptyResult(fileHash, [{
      code: 'entidade_incorreta',
      message: 'A planilha pertence a outro tipo de cadastro.',
    }]);
  }

  const headers = headerMap(detection.rows[detection.headerIndex]);
  const skippedDescriptionRows: number[] = [];
  const dataRows = detection.rows
    .slice(detection.headerIndex + 1)
    .map((row, dataIndex) => ({ row, dataIndex, rowNumber: detection.headerIndex + dataIndex + 2 }))
    .filter(({ row }) => hasAnyValue(row))
    .filter(({ row, dataIndex, rowNumber }) => {
      const skip = detection.provider === 'auvo'
        && isAuvoDescriptionRow(detection.entity, row, headers, dataIndex);
      if (skip) skippedDescriptionRows.push(rowNumber);
      return !skip;
    });

  const limit = Math.max(MIN_IMPORT_ROW_LIMIT, options.maxRows ?? DEFAULT_IMPORT_ROW_LIMIT);
  const source = {
    provider: detection.provider,
    entity: detection.entity,
    sheetName: detection.sheetName,
    headerRow: detection.headerIndex + 1,
    skippedDescriptionRows,
  } as const;
  if (dataRows.length > limit) {
    return {
      rows: [],
      errors: [{ code: 'limite_de_linhas', message: `A planilha excede o limite de ${limit} linhas.` }],
      warnings: [],
      source,
      fileHash,
      canonicalHash: null,
    };
  }

  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const parsedRows = dataRows.map(({ row, rowNumber }) => {
    if (options.entity === 'customers') return parseCustomer(detection.provider, row, headers, rowNumber, errors, warnings);
    if (options.entity === 'suppliers') return parseSupplier(row, headers, rowNumber, errors, warnings);
    if (options.entity === 'inventory') return parseInventory(detection.provider, row, headers, rowNumber, errors, warnings);
    return parseEquipment(row, headers, rowNumber, errors, warnings);
  }) as ImportRowByKind[K][];

  if (parsedRows.length === 0) {
    errors.push({ code: 'nenhuma_linha', message: 'A planilha não contém linhas para importar.' });
  }
  const canonicalHash = await canonicalRowsHash(options.entity, parsedRows);
  return { rows: parsedRows, errors, warnings, source, fileHash, canonicalHash };
}
