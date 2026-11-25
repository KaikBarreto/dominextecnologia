import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { assertRowsAffected } from '@/lib/supabaseMutation';
import type { Tables } from '@/integrations/supabase/types';
import { useUserCompany } from '@/hooks/useUserCompany';
import { sanitizeStorageFileName } from '@/utils/storagePath';
import { tenantFileOptions } from '@/utils/tenantStorage';
import { getContractAttachmentSignedUrl } from '@/hooks/useContractAttachments';
import { requestPmocDocumentDownloadUrl } from '@/hooks/usePmocDocuments';
import {
  FISCAL_NOTE_LABELS,
  fetchCustomerNfseNotes,
  useCustomerGoodsNotes,
  type FiscalNote,
} from '@/hooks/useCustomerFiscalNotes';

type CustomerDocumentRow = Tables<'customer_documents'>;
/**
 * De onde a linha veio:
 * - `manual`: upload feito na ficha do cliente;
 * - `pmoc`: documento PMOC gerado por uma OS concluída;
 * - `fiscal`: nota emitida pelo Dominex (NF-e, NFC-e, NFS-e);
 * - `contract_attachment`: anexo de um contrato do cliente;
 * - `contract_pmoc`: documento PMOC gerado pelo contrato;
 * - `shortcut`: atalho para um documento gerado na hora (orçamento, OS, contrato).
 */
export type CustomerDocumentSource =
  | 'manual'
  | 'pmoc'
  | 'fiscal'
  | 'contract_attachment'
  | 'contract_pmoc'
  | 'shortcut';

export type CustomerShortcutKind = 'quote' | 'service_order' | 'contract';

export interface CustomerDocumentShortcut {
  kind: CustomerShortcutKind;
  /** Rota do app que mostra o registro. */
  path: string;
  /** Orçamento abre em nova aba (visualização da proposta); os demais navegam no app. */
  newTab: boolean;
}

export type CustomerDocument = CustomerDocumentRow & {
  source: CustomerDocumentSource;
  pmoc_document_id?: string | null;
  service_order_id?: string | null;
  contract_id?: string | null;
  fiscal?: FiscalNote;
  shortcut?: CustomerDocumentShortcut;
};
export type CustomerDocumentKind = 'invoice' | 'document';
export type CustomerDocumentType = 'nfse' | 'nfe_product' | 'contract' | 'other';

export interface UploadCustomerDocumentInput {
  file: File;
  kind: CustomerDocumentKind;
  type: CustomerDocumentType;
  title: string;
  description?: string;
  documentNumber?: string;
  issueDate?: string;
  amount?: number | null;
  visibleInPortal: boolean;
}

interface LinkedPmocDocument {
  id: string;
  doc_type: string;
  file_name: string;
  pdf_storage_path: string;
  generated_at: string;
  valid_until: string | null;
  service_order_id: string;
  service_orders: { order_number: number | null } | Array<{ order_number: number | null }> | null;
}

interface CustomerPmocLink {
  id: string;
  company_id: string;
  customer_id: string;
  created_at: string;
  service_order_pmoc_documents: LinkedPmocDocument | LinkedPmocDocument[] | null;
}

function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

type RawRow = Record<string, unknown>;

const PMOC_CONTRACT_DOC_LABELS: Record<string, string> = {
  dossie_pmoc: 'Dossiê PMOC',
  cronograma_anual: 'Cronograma anual PMOC',
  termo_rt: 'Termo do responsável técnico',
  certificado: 'Certificado de conformidade',
  planilha: 'Planilha PMOC',
};

/** Quantos atalhos de cada tipo (orçamento, OS, contrato) entram na lista. */
export const CUSTOMER_SHORTCUT_LIMIT = 50;

function formatDateOnly(value: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

/** Linha-base: campos que só existem nos uploads manuais ficam vazios nas linhas automáticas. */
function autoRow(
  customerId: string,
  companyId: string,
  fields: Partial<CustomerDocumentRow> & Pick<CustomerDocumentRow, 'id' | 'title' | 'created_at'>,
): CustomerDocumentRow {
  return {
    company_id: companyId,
    customer_id: customerId,
    document_kind: 'document',
    document_type: 'other',
    description: null,
    document_number: null,
    issue_date: null,
    amount: null,
    storage_path: '',
    file_name: fields.title,
    mime_type: null,
    size_bytes: null,
    is_visible_in_portal: false,
    uploaded_by: null,
    updated_at: fields.created_at,
    ...fields,
  };
}

/** Nota emitida pelo Dominex vira uma linha da sub-aba "Notas fiscais". */
export function fiscalNoteToDocument(note: FiscalNote, customerId: string, companyId: string): CustomerDocument {
  const label = FISCAL_NOTE_LABELS[note.model];
  return {
    ...autoRow(customerId, companyId, {
      id: note.key,
      title: note.number ? `${label} nº ${note.number}` : label,
      created_at: note.date,
      document_kind: 'invoice',
      document_type: note.model === 'nfse' ? 'nfse' : 'nfe_product',
      description: note.description,
      document_number: note.number,
      issue_date: note.date.slice(0, 10) || null,
      amount: note.total,
      mime_type: 'application/pdf',
    }),
    source: 'fiscal',
    fiscal: note,
  };
}

export function contractAttachmentToDocument(
  row: RawRow,
  contractName: string | null,
  customerId: string,
  companyId: string,
): CustomerDocument {
  const name = String(row.display_name ?? '') || 'Anexo do contrato';
  return {
    ...autoRow(customerId, companyId, {
      id: `contract-attachment:${String(row.id)}`,
      title: name,
      created_at: String(row.created_at ?? ''),
      description: contractName ? `Contrato ${contractName}` : null,
      issue_date: typeof row.created_at === 'string' ? row.created_at.slice(0, 10) : null,
      storage_path: String(row.storage_path ?? ''),
      file_name: name,
      mime_type: (row.mime_type as string | null) ?? null,
      size_bytes: (row.size_bytes as number | null) ?? null,
    }),
    source: 'contract_attachment',
    contract_id: String(row.contract_id ?? ''),
  };
}

/** Só a versão mais recente de cada tipo de documento PMOC, por contrato. */
export function latestPmocDocuments(rows: RawRow[]): RawRow[] {
  const latest = new Map<string, RawRow>();
  for (const row of rows) {
    const key = `${String(row.contract_id)}:${String(row.doc_type)}`;
    const current = latest.get(key);
    if (!current || Number(row.version) > Number(current.version)) latest.set(key, row);
  }
  return [...latest.values()];
}

export function contractPmocToDocument(
  row: RawRow,
  contractName: string | null,
  customerId: string,
  companyId: string,
): CustomerDocument {
  const label = PMOC_CONTRACT_DOC_LABELS[String(row.doc_type)] ?? 'Documento PMOC';
  const validUntil = formatDateOnly(row.valid_until as string | null);
  const generatedAt = String(row.generated_at ?? '');
  return {
    ...autoRow(customerId, companyId, {
      id: `contract-pmoc:${String(row.id)}`,
      title: label,
      created_at: generatedAt,
      description: [contractName ? `Contrato ${contractName}` : null, validUntil ? `válido até ${validUntil}` : null]
        .filter(Boolean).join(' · ') || null,
      document_number: `v${String(row.version)}`,
      issue_date: generatedAt.slice(0, 10) || null,
      storage_path: String(row.pdf_storage_path ?? ''),
      file_name: `${label} v${String(row.version)}.pdf`,
      mime_type: 'application/pdf',
    }),
    source: 'contract_pmoc',
    pmoc_document_id: String(row.id),
    contract_id: String(row.contract_id ?? ''),
  };
}

export function shortcutToDocument(
  kind: CustomerShortcutKind,
  row: RawRow,
  customerId: string,
  companyId: string,
): CustomerDocument {
  const createdAt = String(row.created_at ?? '');
  let title: string;
  let path: string;
  let newTab = false;
  let description: string | null = null;
  let documentNumber: string | null = null;
  let amount: number | null = null;
  if (kind === 'quote') {
    documentNumber = String(row.quote_number ?? '');
    title = `Orçamento nº ${documentNumber}`;
    // A visualização da proposta é a mesma que a tela de orçamentos abre.
    path = `/proposta/${String(row.token)}?preview=1`;
    newTab = true;
    const total = row.total_value ?? row.total_price;
    amount = total != null ? Number(total) : null;
  } else if (kind === 'service_order') {
    documentNumber = String(row.order_number ?? '').padStart(6, '0');
    title = `Ordem de serviço ${documentNumber}`;
    path = `/ordens-servico?os=${encodeURIComponent(String(row.id))}`;
    description = typeof row.description === 'string' && row.description.trim() ? row.description.trim() : null;
  } else {
    title = String(row.name ?? '') || 'Contrato';
    path = `/contratos/${String(row.id)}`;
  }
  return {
    ...autoRow(customerId, companyId, {
      id: `shortcut:${kind}:${String(row.id)}`,
      title,
      created_at: createdAt,
      description,
      document_number: documentNumber,
      issue_date: createdAt.slice(0, 10) || null,
      amount,
      document_type: kind === 'contract' ? 'contract' : 'other',
    }),
    source: 'shortcut',
    shortcut: { kind, path, newTab },
  };
}

const SOURCE_FAILURE_LABELS = {
  fiscal: 'notas fiscais de serviço',
  contracts: 'contratos',
  attachments: 'anexos de contrato',
  pmocDocs: 'documentos PMOC do contrato',
  quotes: 'orçamentos',
  serviceOrders: 'ordens de serviço',
} as const;
type SourceKey = keyof typeof SOURCE_FAILURE_LABELS;

const BUCKET = 'customer-documents';
export const CUSTOMER_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;

const GENERAL_EXTENSIONS = new Set([
  'pdf', 'xml', 'txt', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx',
]);
const INVOICE_EXTENSIONS = new Set(['pdf', 'xml']);

function validateFile(file: File, kind: CustomerDocumentKind): void {
  if (file.size <= 0) throw new Error('O arquivo está vazio.');
  if (file.size > CUSTOMER_DOCUMENT_MAX_BYTES) {
    throw new Error('O arquivo deve ter no máximo 15 MB.');
  }
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const allowed = kind === 'invoice' ? INVOICE_EXTENSIONS : GENERAL_EXTENSIONS;
  if (!allowed.has(extension)) {
    throw new Error(kind === 'invoice'
      ? 'Notas fiscais aceitam arquivos PDF ou XML.'
      : 'Formato não permitido. Use PDF, XML, imagem, Word, Excel ou texto.');
  }
}

/**
 * Busca o que o sistema já guarda do cliente fora dos uploads: NFS-e, anexos e
 * documentos PMOC dos contratos, e atalhos de orçamentos, OS e contratos. Cada
 * fonte falha sozinha; as que falharem voltam em `failed`.
 */
export async function fetchAutomaticDocuments(
  customerId: string,
  companyId: string,
): Promise<{ documents: CustomerDocument[]; failed: string[] }> {
  const failed: SourceKey[] = [];
  const safe = async <T,>(key: SourceKey, work: () => PromiseLike<T>, fallback: T): Promise<T> => {
    try {
      return await work();
    } catch {
      failed.push(key);
      return fallback;
    }
  };
  const orThrow = <T,>(result: { data: T | null; error: unknown }): T => {
    if (result.error) throw result.error;
    return (result.data ?? []) as T;
  };

  const [nfse, contracts, quotes, serviceOrders] = await Promise.all([
    safe('fiscal', () => fetchCustomerNfseNotes(companyId, customerId), [] as FiscalNote[]),
    safe('contracts', async () => orThrow(await supabase
      .from('contracts')
      .select('id, name, created_at')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })), [] as RawRow[]),
    safe('quotes', async () => orThrow(await supabase
      .from('quotes')
      .select('id, quote_number, token, total_value, total_price, created_at')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(CUSTOMER_SHORTCUT_LIMIT)), [] as RawRow[]),
    safe('serviceOrders', async () => orThrow(await supabase
      .from('service_orders')
      .select('id, order_number, description, created_at')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(CUSTOMER_SHORTCUT_LIMIT)), [] as RawRow[]),
  ]);

  const contractNames = new Map(contracts.map((contract) => [String(contract.id), (contract.name as string | null) ?? null]));
  const contractIds = contracts.map((contract) => String(contract.id));

  const [attachments, pmocDocs] = contractIds.length === 0
    ? [[] as RawRow[], [] as RawRow[]]
    : await Promise.all([
      safe('attachments', async () => orThrow(await supabase
        .from('contract_attachments')
        .select('id, contract_id, display_name, storage_path, mime_type, size_bytes, created_at')
        .eq('company_id', companyId)
        .in('contract_id', contractIds)
        .order('created_at', { ascending: false })), [] as RawRow[]),
      safe('pmocDocs', async () => orThrow(await supabase
        .from('pmoc_documents')
        .select('id, contract_id, doc_type, version, pdf_storage_path, generated_at, valid_until')
        .eq('company_id', companyId)
        .in('contract_id', contractIds)
        .order('version', { ascending: false })), [] as RawRow[]),
    ]);

  const nameOf = (row: RawRow) => contractNames.get(String(row.contract_id)) ?? null;
  const documents: CustomerDocument[] = [
    ...nfse.map((note) => fiscalNoteToDocument(note, customerId, companyId)),
    ...attachments.map((row) => contractAttachmentToDocument(row, nameOf(row), customerId, companyId)),
    ...latestPmocDocuments(pmocDocs).map((row) => contractPmocToDocument(row, nameOf(row), customerId, companyId)),
    ...quotes.map((row) => shortcutToDocument('quote', row, customerId, companyId)),
    ...serviceOrders.map((row) => shortcutToDocument('service_order', row, customerId, companyId)),
    ...contracts.slice(0, CUSTOMER_SHORTCUT_LIMIT).map((row) => shortcutToDocument('contract', row, customerId, companyId)),
  ];
  return { documents, failed: failed.map((key) => SOURCE_FAILURE_LABELS[key]) };
}

export function useCustomerDocuments(customerId?: string) {
  const { companyId } = useUserCompany();
  const queryClient = useQueryClient();
  const queryKey = ['customer-documents', customerId];

  const baseQuery = useQuery({
    queryKey,
    enabled: !!customerId && !!companyId,
    queryFn: async () => {
      const [manualResult, pmocResult] = await Promise.all([
        supabase
          .from('customer_documents')
          .select('*')
          .eq('customer_id', customerId!)
          .order('created_at', { ascending: false }),
        supabase
          .from('service_order_pmoc_document_links')
          .select(`
            id, company_id, customer_id, created_at,
            service_order_pmoc_documents!inner(
              id, doc_type, file_name, pdf_storage_path, generated_at,
              valid_until, service_order_id,
              service_orders!inner(order_number)
            )
          `)
          .eq('customer_id', customerId!)
          .order('created_at', { ascending: false }),
      ]);
      if (manualResult.error) throw manualResult.error;
      if (pmocResult.error) throw pmocResult.error;

      const manual = (manualResult.data ?? []).map((document) => ({
        ...document,
        source: 'manual' as const,
      }));
      const links = (pmocResult.data ?? []) as unknown as CustomerPmocLink[];
      const pmoc = links.flatMap((link): CustomerDocument[] => {
        const document = firstRelation(link.service_order_pmoc_documents);
        if (!document) return [];
        const order = firstRelation(document.service_orders);
        const certificate = document.doc_type === 'certificado_conformidade';
        return [{
          id: link.id,
          company_id: link.company_id,
          customer_id: link.customer_id,
          document_kind: 'document',
          document_type: 'other',
          title: certificate ? 'Certificado de conformidade' : 'Relatório de serviço PMOC',
          description: 'Gerado automaticamente a partir de uma ordem de serviço concluída.',
          document_number: order?.order_number != null ? `OS ${String(order.order_number).padStart(6, '0')}` : null,
          issue_date: document.generated_at?.slice(0, 10) ?? null,
          amount: null,
          storage_path: document.pdf_storage_path,
          file_name: document.file_name,
          mime_type: 'application/pdf',
          size_bytes: null,
          is_visible_in_portal: false,
          uploaded_by: null,
          created_at: document.generated_at ?? link.created_at,
          updated_at: document.generated_at ?? link.created_at,
          source: 'pmoc',
          pmoc_document_id: document.id,
          service_order_id: document.service_order_id,
        }];
      });

      // Fontes automáticas: o que já existe no sistema e é deste cliente. Uma
      // fonte que falhar não derruba os uploads; a tela avisa que a lista pode
      // estar incompleta.
      const auto = await fetchAutomaticDocuments(customerId!, companyId!);
      return {
        documents: [...manual, ...pmoc, ...auto.documents] as CustomerDocument[],
        failedSources: auto.failed,
      };
    },
  });

  const goodsNotes = useCustomerGoodsNotes(customerId);

  const mergedDocuments = useMemo(() => {
    if (!baseQuery.data || !customerId) return undefined;
    const notes = companyId
      ? goodsNotes.notes.map((note) => fiscalNoteToDocument(note, customerId, companyId))
      : [];
    return [...baseQuery.data.documents, ...notes]
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [baseQuery.data, goodsNotes.notes, customerId, companyId]);

  const list = {
    data: mergedDocuments,
    isLoading: baseQuery.isLoading || goodsNotes.isLoading,
    isError: baseQuery.isError,
    refetch: baseQuery.refetch,
    failedSources: baseQuery.data?.failedSources ?? [],
  };

  const upload = useMutation({
    mutationFn: async (input: UploadCustomerDocumentInput) => {
      if (!customerId) throw new Error('Cliente não informado.');
      if (!companyId) throw new Error('Empresa do usuário não encontrada.');
      if (!input.title.trim()) throw new Error('Informe um título para o arquivo.');
      validateFile(input.file, input.kind);

      const safeName = sanitizeStorageFileName(input.file.name);
      const storagePath = `${companyId}/${customerId}/${crypto.randomUUID()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, input.file, await tenantFileOptions({
          contentType: input.file.type || undefined,
          upsert: false,
        }));
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from('customer_documents')
        .insert({
          company_id: companyId,
          customer_id: customerId,
          document_kind: input.kind,
          document_type: input.type,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          document_number: input.documentNumber?.trim() || null,
          issue_date: input.issueDate || null,
          amount: input.amount ?? null,
          storage_path: storagePath,
          file_name: input.file.name,
          mime_type: input.file.type || null,
          size_bytes: input.file.size,
          is_visible_in_portal: input.visibleInPortal,
        })
        .select()
        .single();

      if (error) {
        await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => undefined);
        throw error;
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const setVisibility = useMutation({
    mutationFn: async ({ id, visible }: { id: string; visible: boolean }) => {
      assertRowsAffected(
        await supabase
          .from('customer_documents')
          .update({ is_visible_in_portal: visible }, { count: 'exact' })
          .eq('id', id)
          .eq('customer_id', customerId!),
        'update',
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (document: Pick<CustomerDocument, 'id' | 'storage_path' | 'source'>) => {
      if (document.source !== 'manual') throw new Error('Este documento é gerado pelo sistema e não pode ser excluído por esta tela.');
      assertRowsAffected(
        await supabase
          .from('customer_documents')
          .delete({ count: 'exact' })
          .eq('id', document.id)
          .eq('customer_id', customerId!),
        'delete',
      );
      await supabase.storage.from(BUCKET).remove([document.storage_path]).catch(() => undefined);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const getSignedUrl = async (
    document: Pick<CustomerDocument, 'storage_path' | 'file_name' | 'source' | 'pmoc_document_id' | 'contract_id'>,
  ) => {
    if (document.source === 'contract_attachment') {
      const url = await getContractAttachmentSignedUrl(document.storage_path);
      if (!url) throw new Error('Não foi possível abrir o arquivo.');
      return url;
    }
    if (document.source === 'contract_pmoc') {
      if (!document.pmoc_document_id || !document.contract_id) throw new Error('Não foi possível abrir o arquivo.');
      // A edge relê o documento e valida tenant e permissão; o navegador não assina o caminho.
      return requestPmocDocumentDownloadUrl(
        { id: document.pmoc_document_id, contract_id: document.contract_id },
        document.contract_id,
      );
    }
    const bucket = document.source === 'pmoc' ? 'pmoc-documents' : BUCKET;
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(document.storage_path, 60, { download: document.file_name });
    if (error || !data?.signedUrl) throw error ?? new Error('Não foi possível abrir o arquivo.');
    return data.signedUrl;
  };

  return { list, upload, setVisibility, remove, getSignedUrl };
}
