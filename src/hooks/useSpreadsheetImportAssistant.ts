import { useCallback, useMemo, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  downloadDominexImportTemplate,
  parseEntityImportWorkbook,
  type ImportIssue,
  type ImportRowByKind,
} from '@/lib/imports';

export type SpreadsheetImportEntity = 'customers' | 'suppliers' | 'inventory' | 'equipment';
export type SpreadsheetImportSource = 'dominex' | 'auvo';
export type SpreadsheetImportPhase =
  | 'idle'
  | 'loading'
  | 'preview'
  | 'conflict'
  | 'submitting'
  | 'success'
  | 'error'
  | 'recovery';

export interface SpreadsheetImportIssue {
  id: string;
  severity: 'warning' | 'conflict' | 'error';
  title: string;
  description: string;
  row?: number;
}

export interface SpreadsheetImportCounts {
  create: number;
  update: number;
  conflict: number;
  blocked: number;
}

export interface SpreadsheetImportPreview {
  fileName: string;
  fileSize: number;
  totalRows?: number;
  validRows?: number;
  columns?: string[];
  rows?: Array<Record<string, string | number | null>>;
  counts?: SpreadsheetImportCounts;
  issues: SpreadsheetImportIssue[];
  canImport: boolean;
  blockedReason?: string;
}

export interface SpreadsheetImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  message?: string;
}

export interface SpreadsheetImportRequest {
  entity: SpreadsheetImportEntity;
  source: SpreadsheetImportSource;
  file: File;
  stockId?: string;
}

export interface SpreadsheetImportGateway {
  prepare(request: SpreadsheetImportRequest): Promise<SpreadsheetImportPreview>;
  execute(request: SpreadsheetImportRequest, preview: SpreadsheetImportPreview): Promise<SpreadsheetImportResult>;
  downloadTemplate?(entity: SpreadsheetImportEntity): Promise<void>;
}

type SqlRow = Record<string, string | number | boolean | null>;
interface SqlPayload {
  customers: SqlRow[];
  suppliers: SqlRow[];
  materials: SqlRow[];
  equipment: SqlRow[];
}

interface ServerDecision {
  action?: 'create' | 'update' | 'conflict' | 'blocked';
  message?: string;
  row_index?: number;
  target_name?: string;
}

interface ServerSummary {
  input?: number;
  create?: number;
  update?: number;
  conflict?: number;
  blocked?: number;
}

interface ServerPreview {
  can_apply?: boolean;
  preview_hash?: string;
  file_already_imported?: boolean;
  summary?: Record<string, ServerSummary | undefined>;
  rows?: Record<string, ServerDecision[] | undefined>;
}

interface ServerImportEntityResult {
  input?: number;
  created?: number;
  updated?: number;
}

interface ServerImportResult {
  already_applied?: boolean;
  customers?: ServerImportEntityResult;
  suppliers?: ServerImportEntityResult;
  materials?: ServerImportEntityResult;
  equipment?: ServerImportEntityResult;
}

interface RpcErrorLike {
  code?: string;
  message?: string;
}

interface PreparedBatch {
  entity: SpreadsheetImportEntity;
  source: SpreadsheetImportSource;
  stockId?: string;
  fileHash: string;
  previewHash: string;
  payload: SqlPayload;
  clientRequestId: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls'];
const SERVER_ENTITY_KEY: Record<SpreadsheetImportEntity, keyof SqlPayload> = {
  customers: 'customers',
  suppliers: 'suppliers',
  inventory: 'materials',
  equipment: 'equipment',
};

function isUuid(value: string | null | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function joinedAddress(parts: Array<string | null>): string | null {
  const value = parts.filter((part): part is string => !!part?.trim()).join(', ');
  return value || null;
}

function targetId(...values: Array<string | null>): string | null {
  return values.find(isUuid) ?? null;
}

function mapCustomer(row: ImportRowByKind['customers']): SqlRow {
  return {
    target_id: targetId(row.sourceId, row.externalId), name: row.name,
    customer_type: row.customerType, document: row.document, company_name: row.companyName,
    nome_fantasia: row.tradeName, email: row.email, phone: row.phone, celular: row.mobile,
    address: row.address, address_number: row.addressNumber, street_number: row.addressNumber,
    complement: row.complement, neighborhood: row.neighborhood, city: row.city, state: row.state,
    zip_code: row.zipCode, notes: row.notes, origin: row.origin,
    inscricao_estadual: row.stateRegistration, inscricao_municipal: row.municipalRegistration,
  };
}

function mapSupplier(row: ImportRowByKind['suppliers']): SqlRow {
  return {
    target_id: targetId(row.sourceId, row.externalId), name: row.name, cpf_cnpj: row.document,
    email: row.email, phone: row.phone, contact_name: row.contactName,
    address: joinedAddress([row.address, row.addressNumber, row.complement, row.neighborhood, row.city, row.state, row.zipCode]),
    notes: row.notes,
  };
}

function mapMaterial(row: ImportRowByKind['inventory']): SqlRow {
  return {
    target_id: targetId(row.sourceId), name: row.name, sku: row.sku, unit: row.unit,
    category: row.category, description: row.description, cost_price: row.costPrice,
    sale_price: row.salePrice, min_quantity: row.minimumQuantity, stock_quantity: row.quantity,
    fiscal_ncm: row.fiscalNcm, fiscal_cest: row.fiscalCest,
    fiscal_cfop_internal: row.fiscalCfopInternal, fiscal_cfop_interstate: row.fiscalCfopInterstate,
    fiscal_origin: row.fiscalOrigin, fiscal_icms_code: row.fiscalIcmsCode,
    fiscal_pis_cst: row.fiscalPisCst, fiscal_cofins_cst: row.fiscalCofinsCst,
    fiscal_ipi_cst: row.fiscalIpiCst, active: row.active,
    barcode: null, supplier_id: null, is_sellable: true, notes: null,
  };
}

function mapEquipment(row: ImportRowByKind['equipment']): SqlRow {
  return {
    customer_document: row.customerDocument, customer_name: row.customerName, name: row.name,
    brand: row.brand, model: row.model, serial_number: row.serialNumber, capacity: row.capacity,
    location: row.location, install_date: row.installDate, warranty_until: row.warrantyUntil,
    notes: row.notes, identifier: row.identifier, status: row.status,
  };
}

function buildPayload<K extends SpreadsheetImportEntity>(entity: K, rows: ImportRowByKind[K][]): SqlPayload {
  const payload: SqlPayload = { customers: [], suppliers: [], materials: [], equipment: [] };
  if (entity === 'customers') payload.customers = (rows as ImportRowByKind['customers'][]).map(mapCustomer);
  if (entity === 'suppliers') payload.suppliers = (rows as ImportRowByKind['suppliers'][]).map(mapSupplier);
  if (entity === 'inventory') payload.materials = (rows as ImportRowByKind['inventory'][]).map(mapMaterial);
  if (entity === 'equipment') payload.equipment = (rows as ImportRowByKind['equipment'][]).map(mapEquipment);
  return payload;
}

function aggregateParserIssues(issues: ImportIssue[], severity: 'warning' | 'error'): SpreadsheetImportIssue[] {
  const groups = new Map<string, { issue: ImportIssue; count: number; rows: number[] }>();
  issues.forEach((issue) => {
    const key = `${issue.code}|${issue.message}|${issue.column ?? ''}`;
    const group = groups.get(key) ?? { issue, count: 0, rows: [] };
    group.count += 1;
    if (issue.row && group.rows.length < 3) group.rows.push(issue.row);
    groups.set(key, group);
  });
  const entries = [...groups.values()];
  const visible: SpreadsheetImportIssue[] = entries.slice(0, 20).map(({ issue, count, rows }, index) => ({
    id: `${severity}-${issue.code}-${index}`,
    severity,
    title: severity === 'error' ? 'Corrija a planilha' : 'Confira esta informação',
    description: count === 1
      ? issue.message
      : `${issue.message} ${count.toLocaleString('pt-BR')} ocorrências${rows.length ? `; exemplos nas linhas ${rows.join(', ')}` : ''}.`,
    row: count === 1 ? issue.row : undefined,
  }));
  if (entries.length > visible.length) visible.push({
    id: `${severity}-remaining-groups`, severity,
    title: severity === 'error' ? 'Há outros tipos de erro' : 'Há outros avisos',
    description: `${entries.length - visible.length} grupos adicionais foram resumidos para manter a prévia rápida.`,
  });
  return visible;
}

function friendlyRpcError(error: RpcErrorLike, stage: 'preview' | 'execute'): Error {
  const message = (error.message ?? '').toLowerCase();
  if (error.code === '42501' || message.includes('permiss') || message.includes('sessao') || message.includes('assinatura')) {
    return new Error('Seu acesso não permite esta importação. Confirme suas permissões e a situação da assinatura.');
  }
  if (error.code === '40001' || message.includes('conferencia expirou')) {
    return new Error('A conferência expirou porque os cadastros mudaram. Gere uma nova prévia e tente novamente.');
  }
  if (error.code === '54000' || message.includes('limite') || message.includes('excede')) {
    return new Error('A planilha ultrapassa o limite seguro da importação. Divida os dados em arquivos menores.');
  }
  if (error.code === 'PGRST202' || message.includes('could not find the function')) {
    return new Error('A importação ainda não está disponível neste ambiente. Atualize a página mais tarde.');
  }
  if (message.includes('failed to fetch') || message.includes('network')) {
    return new Error('Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.');
  }
  return new Error(stage === 'preview'
    ? 'Não foi possível conferir os cadastros agora. Tente novamente.'
    : 'Não foi possível concluir a importação. Nenhum dado foi alterado.');
}

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function serverCounts(preview: ServerPreview, entity: SpreadsheetImportEntity): SpreadsheetImportCounts {
  const summary = preview.summary?.[SERVER_ENTITY_KEY[entity]] ?? {};
  return {
    create: safeNumber(summary.create), update: safeNumber(summary.update),
    conflict: safeNumber(summary.conflict), blocked: safeNumber(summary.blocked),
  };
}

function decisionLabel(action?: ServerDecision['action']): string {
  if (action === 'create') return 'Novo cadastro';
  if (action === 'update') return 'Atualização';
  if (action === 'conflict') return 'Conflito';
  return 'Bloqueado';
}

function previewRows(preview: ServerPreview, entity: SpreadsheetImportEntity, parsedRows: ImportRowByKind[SpreadsheetImportEntity][]) {
  return (preview.rows?.[SERVER_ENTITY_KEY[entity]] ?? []).map((decision, index) => {
    const sourceIndex = Math.max(0, safeNumber(decision.row_index) - 1);
    const sourceRow = parsedRows[sourceIndex] ?? parsedRows[index];
    return {
      Linha: sourceRow?.rowNumber ?? sourceIndex + 1,
      Cadastro: sourceRow?.name ?? decision.target_name ?? '—',
      Ação: decisionLabel(decision.action),
      Motivo: decision.message ?? null,
    };
  });
}

function serverIssues(preview: ServerPreview, entity: SpreadsheetImportEntity, parsedRows: ImportRowByKind[SpreadsheetImportEntity][]): SpreadsheetImportIssue[] {
  const groups = new Map<string, { action: 'conflict' | 'blocked'; message: string; count: number; rows: number[] }>();
  (preview.rows?.[SERVER_ENTITY_KEY[entity]] ?? [])
    .filter((decision): decision is ServerDecision & { action: 'conflict' | 'blocked' } => decision.action === 'conflict' || decision.action === 'blocked')
    .forEach((decision) => {
      const message = decision.message ?? 'Revise os dados desta linha antes de importar.';
      const key = `${decision.action}|${message}`;
      const group = groups.get(key) ?? { action: decision.action, message, count: 0, rows: [] };
      group.count += 1;
      const sourceIndex = Math.max(0, safeNumber(decision.row_index) - 1);
      const rowNumber = parsedRows[sourceIndex]?.rowNumber;
      if (rowNumber && group.rows.length < 3) group.rows.push(rowNumber);
      groups.set(key, group);
    });

  return [...groups.values()].map((group, index) => ({
    id: `server-${group.action}-${index}`,
    severity: group.action === 'conflict' ? 'conflict' : 'error',
    title: group.action === 'conflict' ? 'Conflito de cadastro' : 'Linha bloqueada',
    description: group.count === 1
      ? group.message
      : `${group.message} ${group.count.toLocaleString('pt-BR')} ocorrências; exemplos nas linhas ${group.rows.join(', ')}.`,
    row: group.count === 1 ? group.rows[0] : undefined,
  }));
}

function isServerPreview(value: unknown): value is ServerPreview {
  return !!value && typeof value === 'object' && typeof (value as ServerPreview).preview_hash === 'string';
}

function isServerImportResult(value: unknown): value is ServerImportResult {
  return !!value && typeof value === 'object';
}

async function invalidateImportCaches(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['customers'] }),
    queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
    queryClient.invalidateQueries({ queryKey: ['inventory'] }),
    queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] }),
    queryClient.invalidateQueries({ queryKey: ['inventory-movements'] }),
    queryClient.invalidateQueries({ queryKey: ['equipment'] }),
  ]);
}

export function createSpreadsheetImportGateway(queryClient: QueryClient): SpreadsheetImportGateway {
  const preparedByFile = new WeakMap<File, PreparedBatch>();
  return {
    async prepare(request) {
      const normalizedName = request.file.name.toLowerCase();
      if (!SUPPORTED_EXTENSIONS.some((extension) => normalizedName.endsWith(extension))) {
        throw new Error('Selecione uma planilha Excel nos formatos .xlsx ou .xls.');
      }
      if (request.file.size === 0) throw new Error('A planilha está vazia. Escolha outro arquivo.');
      if (request.file.size > MAX_FILE_SIZE) throw new Error('A planilha deve ter no máximo 10 MB.');

      const parsed = await parseEntityImportWorkbook({ entity: request.entity, data: await request.file.arrayBuffer() });
      const parserIssues = [
        ...aggregateParserIssues(parsed.errors, 'error'),
        ...aggregateParserIssues(parsed.warnings, 'warning'),
      ];
      if (parsed.errors.length > 0 || !parsed.source) {
        return {
          fileName: request.file.name, fileSize: request.file.size, totalRows: parsed.rows.length,
          validRows: 0, issues: parserIssues, canImport: false,
          blockedReason: 'Corrija os erros da planilha antes de continuar.',
        };
      }
      if (parsed.source.provider !== request.source) {
        return {
          fileName: request.file.name, fileSize: request.file.size, totalRows: parsed.rows.length,
          validRows: 0, canImport: false, blockedReason: 'Escolha a origem correspondente ao arquivo.',
          issues: [...parserIssues, {
            id: 'source-mismatch', severity: 'error', title: 'Origem diferente da selecionada',
            description: `Esta planilha foi reconhecida como ${parsed.source.provider === 'auvo' ? 'Exportação da Auvo' : 'Modelo Dominex'}. Volte e escolha a origem correta.`,
          }],
        };
      }

      const payload = buildPayload(request.entity, parsed.rows);
      let rawPreview: unknown;
      try {
        const { data, error } = await supabase.rpc('preview_legacy_master_data', {
          p_file_hash: parsed.fileHash,
          p_customers: payload.customers,
          p_suppliers: payload.suppliers,
          p_materials: payload.materials,
          p_equipment: payload.equipment,
          ...(request.stockId ? { p_stock_id: request.stockId } : {}),
        });
        if (error) throw error;
        rawPreview = data;
      } catch (error) {
        throw friendlyRpcError(error as RpcErrorLike, 'preview');
      }
      if (!isServerPreview(rawPreview)) throw new Error('O servidor não retornou uma conferência válida. Tente novamente.');

      const counts = serverCounts(rawPreview, request.entity);
      const typedRows = parsed.rows as ImportRowByKind[SpreadsheetImportEntity][];
      const issues = [...parserIssues, ...serverIssues(rawPreview, request.entity, typedRows)];
      if (rawPreview.file_already_imported) issues.push({
        id: 'file-already-imported', severity: 'warning', title: 'Arquivo já processado',
        description: 'Este arquivo já foi importado. Confirmar novamente não duplicará os cadastros.',
      });

      preparedByFile.set(request.file, {
        entity: request.entity, source: request.source, stockId: request.stockId,
        fileHash: parsed.fileHash, previewHash: rawPreview.preview_hash!, payload,
        clientRequestId: createRequestId(),
      });
      return {
        fileName: request.file.name, fileSize: request.file.size, totalRows: parsed.rows.length,
        validRows: counts.create + counts.update, columns: ['Linha', 'Cadastro', 'Ação', 'Motivo'],
        rows: previewRows(rawPreview, request.entity, typedRows), counts, issues,
        canImport: rawPreview.can_apply === true,
        blockedReason: rawPreview.can_apply === true ? undefined : 'Resolva os conflitos e as linhas bloqueadas antes de importar.',
      };
    },

    async execute(request) {
      const prepared = preparedByFile.get(request.file);
      if (!prepared || prepared.entity !== request.entity || prepared.source !== request.source || prepared.stockId !== request.stockId) {
        throw new Error('A conferência não corresponde às escolhas atuais. Confira a planilha novamente.');
      }
      let rawResult: unknown;
      try {
        const { data, error } = await supabase.rpc('import_legacy_master_data', {
          p_client_request_id: prepared.clientRequestId, p_file_hash: prepared.fileHash,
          p_customers: prepared.payload.customers, p_suppliers: prepared.payload.suppliers,
          p_materials: prepared.payload.materials, p_equipment: prepared.payload.equipment,
          ...(request.stockId ? { p_stock_id: request.stockId } : {}),
          p_source: request.source, p_preview_hash: prepared.previewHash,
        });
        if (error) throw error;
        rawResult = data;
      } catch (error) {
        throw friendlyRpcError(error as RpcErrorLike, 'execute');
      }
      if (!isServerImportResult(rawResult)) throw new Error('O servidor não confirmou a importação. Tente novamente.');

      await invalidateImportCaches(queryClient);
      const results = [rawResult.customers, rawResult.suppliers, rawResult.materials, rawResult.equipment];
      const input = results.reduce((total, item) => total + safeNumber(item?.input), 0);
      const inserted = results.reduce((total, item) => total + safeNumber(item?.created), 0);
      const updated = results.reduce((total, item) => total + safeNumber(item?.updated), 0);
      const alreadyApplied = rawResult.already_applied === true;
      return {
        inserted: alreadyApplied ? 0 : inserted,
        updated: alreadyApplied ? 0 : updated,
        skipped: alreadyApplied ? input : Math.max(0, input - inserted - updated),
        message: alreadyApplied
          ? 'Este arquivo já havia sido importado. Nenhum cadastro foi duplicado.'
          : 'Os cadastros foram importados e as listas já foram atualizadas.',
      };
    },
    downloadTemplate: downloadDominexImportTemplate,
  };
}

interface UseSpreadsheetImportAssistantOptions {
  entity: SpreadsheetImportEntity;
  initialSource?: SpreadsheetImportSource;
  gateway?: SpreadsheetImportGateway;
}

export function useSpreadsheetImportAssistant({ entity, initialSource = 'dominex', gateway }: UseSpreadsheetImportAssistantOptions) {
  const queryClient = useQueryClient();
  const resolvedGateway = useMemo(() => gateway ?? createSpreadsheetImportGateway(queryClient), [gateway, queryClient]);
  const [source, setSource] = useState<SpreadsheetImportSource>(initialSource);
  const [stockId, setStockId] = useState<string>();
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<SpreadsheetImportPreview>();
  const [result, setResult] = useState<SpreadsheetImportResult>();
  const [phase, setPhase] = useState<SpreadsheetImportPhase>('idle');
  const [error, setError] = useState<string>();

  const request = useMemo<SpreadsheetImportRequest | null>(() => file ? {
    entity, source, file, ...(stockId ? { stockId } : {}),
  } : null, [entity, file, source, stockId]);

  const prepare = useCallback(async (nextFile: File) => {
    setFile(nextFile); setPreview(undefined); setResult(undefined); setError(undefined); setPhase('loading');
    try {
      const nextPreview = await resolvedGateway.prepare({ entity, source, file: nextFile, ...(stockId ? { stockId } : {}) });
      setPreview(nextPreview);
      setPhase(nextPreview.issues.some((issue) => issue.severity === 'conflict') ? 'conflict' : 'preview');
      return nextPreview;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível conferir a planilha.');
      setPhase('error');
      return undefined;
    }
  }, [entity, resolvedGateway, source, stockId]);

  const execute = useCallback(async () => {
    if (!request || !preview || !preview.canImport) return;
    setError(undefined); setPhase('submitting');
    try {
      setResult(await resolvedGateway.execute(request, preview));
      setPhase('success');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a importação.');
      setPhase('recovery');
    }
  }, [preview, request, resolvedGateway]);

  const resetFile = useCallback(() => {
    setFile(undefined); setPreview(undefined); setResult(undefined); setError(undefined); setPhase('idle');
  }, []);
  const resetAll = useCallback((nextSource = initialSource) => {
    setSource(nextSource); setStockId(undefined); resetFile();
  }, [initialSource, resetFile]);

  return {
    source,
    setSource: (nextSource: SpreadsheetImportSource) => { setSource(nextSource); resetFile(); },
    stockId,
    setStockId: (nextStockId: string | undefined) => { setStockId(nextStockId); resetFile(); },
    file, preview, result, phase, error, prepare, execute, resetFile, resetAll,
    downloadTemplate: resolvedGateway.downloadTemplate ? () => resolvedGateway.downloadTemplate!(entity) : undefined,
  };
}
