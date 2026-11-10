export const MIN_IMPORT_ROW_LIMIT = 5_000;
export const DEFAULT_IMPORT_ROW_LIMIT = MIN_IMPORT_ROW_LIMIT;

export type ImportEntityKind = 'customers' | 'suppliers' | 'inventory' | 'equipment';
export type ImportProvider = 'dominex' | 'auvo';

export type ImportIssueCode =
  | 'arquivo_invalido'
  | 'nenhuma_linha'
  | 'formato_nao_reconhecido'
  | 'fonte_nao_suportada'
  | 'entidade_incorreta'
  | 'formula_nao_permitida'
  | 'limite_de_linhas'
  | 'campo_obrigatorio'
  | 'documento_invalido'
  | 'numero_invalido'
  | 'data_invalida'
  | 'data_legada_ignorada'
  | 'quantidade_negativa'
  | 'unidade_ausente';

export interface ImportIssue {
  code: ImportIssueCode;
  message: string;
  row?: number;
  column?: string;
  sheet?: string;
}

export interface ImportSource {
  provider: ImportProvider;
  entity: ImportEntityKind;
  sheetName: string;
  /** Linha do cabeçalho como o Excel mostra (base 1). */
  headerRow: number;
  /** Linhas explicativas do exportador removidas antes da normalização. */
  skippedDescriptionRows: number[];
}

export interface CustomerImportRow {
  rowNumber: number;
  sourceId: string | null;
  externalId: string | null;
  name: string;
  customerType: 'pf' | 'pj';
  document: string | null;
  companyName: string | null;
  tradeName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  contactName: string | null;
  address: string | null;
  addressNumber: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  notes: string | null;
  origin: string | null;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
  registeredAt: string | null;
  lastVisitAt: string | null;
}

export interface SupplierImportRow {
  rowNumber: number;
  sourceId: string | null;
  externalId: string | null;
  name: string;
  legalName: string | null;
  document: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  addressNumber: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  notes: string | null;
  segment: string | null;
  active: boolean;
}

export interface InventoryImportRow {
  rowNumber: number;
  sourceId: string | null;
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  unit: string | null;
  quantity: number | null;
  minimumQuantity: number | null;
  costPrice: number | null;
  salePrice: number | null;
  active: boolean;
  fiscalNcm: string | null;
  fiscalCest: string | null;
  fiscalCfopInternal: string | null;
  fiscalCfopInterstate: string | null;
  fiscalOrigin: string | null;
  fiscalIcmsCode: string | null;
  fiscalPisCst: string | null;
  fiscalCofinsCst: string | null;
  fiscalIpiCst: string | null;
}

export interface EquipmentImportRow {
  rowNumber: number;
  sourceId: string | null;
  customerDocument: string | null;
  customerName: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  capacity: string | null;
  location: string | null;
  installDate: string | null;
  warrantyUntil: string | null;
  notes: string | null;
  identifier: string | null;
  status: 'active' | 'inactive';
}

export interface ImportRowByKind {
  customers: CustomerImportRow;
  suppliers: SupplierImportRow;
  inventory: InventoryImportRow;
  equipment: EquipmentImportRow;
}

export interface EntityImportParseResult<K extends ImportEntityKind> {
  rows: ImportRowByKind[K][];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  source: ImportSource | null;
  /** SHA-256 dos bytes recebidos, útil para auditoria do arquivo original. */
  fileHash: string;
  /** SHA-256 das linhas normalizadas, sem número de linha e independente da ordem. */
  canonicalHash: string | null;
}

export interface ParseEntityImportOptions<K extends ImportEntityKind> {
  entity: K;
  data: ArrayBuffer | Uint8Array;
  /** Nunca pode reduzir o piso de 5.000 linhas. */
  maxRows?: number;
}
