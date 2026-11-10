import { sanitizeSpreadsheetText } from './normalize';
import type { ImportEntityKind } from './types';

export const DOMINEX_IMPORT_HEADERS: Record<ImportEntityKind, readonly string[]> = {
  customers: [
    'ID externo', 'Nome*', 'Tipo (PF/PJ)', 'CPF/CNPJ', 'Razão social', 'Nome fantasia',
    'E-mail', 'Telefone', 'Celular', 'Endereço', 'Número', 'Complemento', 'Bairro',
    'Cidade', 'Estado', 'CEP', 'Observações', 'Origem', 'Inscrição estadual',
    'Inscrição municipal', 'Status',
  ],
  suppliers: [
    'ID externo', 'Nome*', 'Razão social', 'CPF/CNPJ', 'Contato', 'Telefone', 'E-mail',
    'Endereço', 'Número', 'Complemento', 'Bairro', 'Cidade', 'Estado', 'CEP',
    'Observações', 'Segmento', 'Status',
  ],
  inventory: [
    'ID externo', 'Nome*', 'SKU', 'Descrição', 'Categoria', 'Unidade', 'Quantidade',
    'Estoque mínimo', 'Custo unitário', 'Preço de venda', 'Status', 'NCM', 'CEST',
    'CFOP interno', 'CFOP interestadual', 'Origem fiscal', 'CST/CSOSN ICMS', 'CST PIS',
    'CST COFINS', 'CST IPI',
  ],
  equipment: [
    'ID externo', 'Documento do cliente', 'Cliente', 'Nome*', 'Marca', 'Modelo',
    'Número de série', 'Capacidade', 'Localização', 'Data de instalação', 'Garantia até',
    'Observações', 'Identificador', 'Status',
  ],
};

const TEMPLATE_FILE_NAMES: Record<ImportEntityKind, string> = {
  customers: 'modelo-dominex-clientes.xlsx',
  suppliers: 'modelo-dominex-fornecedores.xlsx',
  inventory: 'modelo-dominex-materiais.xlsx',
  equipment: 'modelo-dominex-equipamentos.xlsx',
};

const ENTITY_LABELS: Record<ImportEntityKind, string> = {
  customers: 'clientes',
  suppliers: 'fornecedores',
  inventory: 'materiais',
  equipment: 'equipamentos',
};

function exactArrayBuffer(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

/** Gera um arquivo vazio: nenhuma linha ou dado de cliente é embutido no molde. */
export async function buildDominexImportTemplate(entity: ImportEntityKind): Promise<ArrayBuffer> {
  const xlsx = await import('xlsx');
  const workbook = xlsx.utils.book_new();
  const instructions = [
    ['MODELO_DOMINEX_IMPORTACAO_V1'],
    ['Cadastro', ENTITY_LABELS[entity]],
    ['Como usar', 'Preencha uma linha por cadastro e não altere os nomes das colunas.'],
    ['Segurança', 'Cole somente valores. Fórmulas não são aceitas.'],
    ['Obrigatório', 'As colunas marcadas com * precisam ser preenchidas.'],
  ].map((row) => row.map(sanitizeSpreadsheetText));
  const instructionsSheet = xlsx.utils.aoa_to_sheet(instructions);
  instructionsSheet['!cols'] = [{ wch: 22 }, { wch: 78 }];
  xlsx.utils.book_append_sheet(workbook, instructionsSheet, 'Leia primeiro');

  const headers = [...DOMINEX_IMPORT_HEADERS[entity]].map(sanitizeSpreadsheetText);
  const dataSheet = xlsx.utils.aoa_to_sheet([headers]);
  dataSheet['!autofilter'] = { ref: `A1:${xlsx.utils.encode_col(headers.length - 1)}1` };
  dataSheet['!cols'] = headers.map((header) => ({ wch: Math.max(14, Math.min(28, header.length + 2)) }));
  xlsx.utils.book_append_sheet(workbook, dataSheet, 'Dados');

  const markerSheet = xlsx.utils.aoa_to_sheet([
    ['marker', 'MODELO_DOMINEX_IMPORTACAO_V1'],
    ['entity', entity],
  ]);
  xlsx.utils.book_append_sheet(workbook, markerSheet, '_Dominex');
  if (workbook.Workbook?.Sheets) {
    const marker = workbook.Workbook.Sheets.find((sheet) => sheet.name === '_Dominex');
    if (marker) marker.Hidden = 1;
  }

  const output = xlsx.write(workbook, { type: 'array', bookType: 'xlsx', compression: true });
  return exactArrayBuffer(output as ArrayBuffer | Uint8Array);
}

export function dominexImportTemplateFileName(entity: ImportEntityKind): string {
  return TEMPLATE_FILE_NAMES[entity];
}

export async function downloadDominexImportTemplate(entity: ImportEntityKind): Promise<void> {
  const data = await buildDominexImportTemplate(entity);
  const url = URL.createObjectURL(new Blob([data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = dominexImportTemplateFileName(entity);
    anchor.rel = 'noopener';
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
