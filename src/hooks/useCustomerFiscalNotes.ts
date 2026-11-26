import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import { useGoodsFiscalAccess } from '@/hooks/useGoodsFiscalAccess';
import { useGoodsFiscalDocumentAction } from '@/hooks/useGoodsFiscal';
import { resolveNfseDisplayStatus } from '@/lib/fiscal/nfseStatusTruth';
import { goodsArtifactUrl, showGoodsArtifact } from '@/lib/fiscal/goodsArtifact';
import { openPendingPdfTab } from '@/utils/openPdfInTab';
import { invokeNfse } from '@/utils/nfseEdge';

/**
 * Notas fiscais emitidas pelo Dominex que aparecem sozinhas nas fichas de
 * cliente e de fornecedor. Este arquivo é a fronteira do Supabase dessas
 * listas: leitura (NF-e, NFC-e, NFS-e e notas recebidas) e o download dos
 * arquivos, reaproveitando as mesmas ações das telas fiscais.
 */

export type FiscalNoteModel = 'nfe' | 'nfce' | 'nfse';

export interface FiscalNote {
  /** Chave única na lista (modelo + id), nunca colide entre tabelas. */
  key: string;
  model: FiscalNoteModel;
  documentId: string;
  number: string | null;
  series: number | null;
  /** Data de autorização (ou criação, quando ainda não houver). */
  date: string;
  total: number | null;
  cancelled: boolean;
  hasPdf: boolean;
  hasXml: boolean;
  /** Só NFS-e: endereço do XML guardado na própria emissão. */
  xmlUrl: string | null;
  /** Só NFS-e: descrição do serviço, útil para a busca. */
  description: string | null;
}

export const FISCAL_NOTE_LABELS: Record<FiscalNoteModel, string> = {
  nfe: 'NF-e',
  nfce: 'NFC-e',
  nfse: 'NFS-e',
};

/** Linha crua devolvida por consultas sem tipo gerado (tabelas fiscais novas). */
type RawRow = Record<string, unknown>;

interface LooseBuilder extends PromiseLike<{ data: unknown; error: { message?: string } | null }> {
  eq: (column: string, value: string | number) => LooseBuilder;
  in: (column: string, values: string[]) => LooseBuilder;
  order: (column: string, options: { ascending: boolean }) => LooseBuilder;
  limit: (count: number) => LooseBuilder;
}
const looseClient = supabase as unknown as { from: (table: string) => { select: (fields: string) => LooseBuilder } };

const asRecord = (value: unknown): RawRow =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as RawRow) : {};

const GOODS_LIMIT = 200;

/** Converte uma linha de nfe_documents/nfce_documents na linha comum da lista. */
export function mapGoodsNote(row: RawRow, model: 'nfe' | 'nfce'): FiscalNote {
  const payload = asRecord(row.draft_payload);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const total = items.reduce<number>((sum, item) => sum + (Number(asRecord(item).total) || 0), 0);
  const number = row.number != null && row.number !== '' ? String(row.number) : null;
  return {
    key: `${model}:${String(row.id)}`,
    model,
    documentId: String(row.id),
    number,
    series: number && row.series != null ? Number(row.series) : null,
    date: String(row.authorized_at ?? row.created_at ?? ''),
    total,
    cancelled: row.status === 'cancelled',
    hasPdf: Boolean(row[model === 'nfe' ? 'danfe_pdf_path' : 'danfce_pdf_path']),
    hasXml: Boolean(row.processed_xml_path),
    xmlUrl: null,
    description: null,
  };
}

/** Converte uma linha de nfse_emissions; devolve null se a nota não for autorizada/cancelada de fato. */
export function mapNfseNote(row: RawRow): FiscalNote | null {
  const status = resolveNfseDisplayStatus({
    status: String(row.status ?? ''),
    status_fiscal_confirmado: row.status_fiscal_confirmado as boolean | null,
    status_fiscal_confirmado_em: row.status_fiscal_confirmado_em as string | null,
    chave_acesso: row.chave_acesso as string | null,
    error_message: row.error_message as string | null,
  });
  if (status !== 'autorizada' && status !== 'cancelada') return null;
  return {
    key: `nfse:${String(row.id)}`,
    model: 'nfse',
    documentId: String(row.id),
    number: row.numero_nfse ? String(row.numero_nfse) : null,
    series: null,
    date: String(row.emitida_em ?? row.created_at ?? ''),
    total: row.valor_servico != null ? Number(row.valor_servico) : null,
    cancelled: status === 'cancelada',
    hasPdf: true,
    hasXml: Boolean(row.xml_url),
    xmlUrl: typeof row.xml_url === 'string' && row.xml_url ? row.xml_url : null,
    description: typeof row.descricao_servico === 'string' ? row.descricao_servico : null,
  };
}

async function fetchGoodsNotes(
  model: 'nfe' | 'nfce',
  companyId: string,
  column: 'customer_id' | 'supplier_id' | 'order_id',
  partyId: string | string[],
): Promise<FiscalNote[]> {
  const pdfColumn = model === 'nfe' ? 'danfe_pdf_path' : 'danfce_pdf_path';
  const scoped = looseClient
    .from(model === 'nfe' ? 'nfe_documents' : 'nfce_documents')
    .select(`id,status,environment,series,number,draft_payload,processed_xml_path,${pdfColumn},authorized_at,created_at`)
    .eq('company_id', companyId);
  const { data, error } = await (Array.isArray(partyId) ? scoped.in(column, partyId) : scoped.eq(column, partyId))
    .eq('environment', 1)
    .in('status', ['authorized', 'cancelled'])
    .order('created_at', { ascending: false })
    .limit(GOODS_LIMIT);
  if (error) throw new Error('Não foi possível carregar as notas fiscais.');
  return (Array.isArray(data) ? data : []).map((row) => mapGoodsNote(asRecord(row), model));
}

/**
 * NFC-e nascida de venda do PDV não grava o cliente nela, só o pedido: o dono é o
 * cliente do pedido. Busca os pedidos recentes do cliente e as NFC-e deles. É a
 * mesma regra que o portal do cliente usa no banco.
 */
async function fetchNfceFromPdvOrders(companyId: string, customerId: string): Promise<FiscalNote[]> {
  const orders = await looseClient
    .from('pdv_orders')
    .select('id')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(GOODS_LIMIT);
  if (orders.error) throw new Error('Não foi possível carregar as notas fiscais.');
  const orderIds = (Array.isArray(orders.data) ? orders.data : [])
    .map((row) => asRecord(row).id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (orderIds.length === 0) return [];
  return fetchGoodsNotes('nfce', companyId, 'order_id', orderIds);
}

/** NF-e e NFC-e de produto do cliente. Só consulta quando o usuário tem permissão fiscal. */
export function useCustomerGoodsNotes(customerId?: string) {
  const access = useGoodsFiscalAccess();
  const query = useQuery({
    queryKey: [...access.key, 'customer-notes', customerId],
    enabled: access.allowed && !!customerId,
    queryFn: async () => {
      const [nfe, nfce, nfceFromPdv] = await Promise.all([
        fetchGoodsNotes('nfe', access.companyId!, 'customer_id', customerId!),
        fetchGoodsNotes('nfce', access.companyId!, 'customer_id', customerId!),
        fetchNfceFromPdvOrders(access.companyId!, customerId!),
      ]);
      // A mesma NFC-e pode vir pelos dois caminhos (cliente gravado e pedido do cliente).
      const seen = new Set<string>();
      return [...nfe, ...nfce, ...nfceFromPdv].filter((note) => {
        if (seen.has(note.key)) return false;
        seen.add(note.key);
        return true;
      });
    },
  });
  // Sem permissão a lista simplesmente não traz notas de produto, sem aviso de erro.
  return { notes: access.allowed ? query.data ?? [] : [], isLoading: access.allowed && query.isLoading };
}

/** NFS-e autorizadas ou canceladas do cliente (produção). */
export async function fetchCustomerNfseNotes(companyId: string, customerId: string): Promise<FiscalNote[]> {
  const { data, error } = await supabase
    .from('nfse_emissions')
    .select('id, status, status_fiscal_confirmado, status_fiscal_confirmado_em, chave_acesso, error_message, numero_nfse, valor_servico, emitida_em, created_at, xml_url, descricao_servico')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .in('status', ['autorizada', 'cancelada'])
    // Nota de teste não é documento do cliente; legado sem ambiente continua valendo.
    .or('fiscal_ambiente.is.null,fiscal_ambiente.neq.homologacao')
    .order('created_at', { ascending: false })
    .limit(GOODS_LIMIT);
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const note = mapNfseNote(row as unknown as RawRow);
    return note ? [note] : [];
  });
}

// ─── Ficha do fornecedor ──────────────────────────────────────────────────────

export interface SupplierInboundNote {
  id: string;
  number: string | null;
  series: string | null;
  issuer: string | null;
  total: number | null;
  date: string | null;
  cancelled: boolean;
  summaryOnly: boolean;
}

export function mapInboundNote(row: RawRow): SupplierInboundNote {
  return {
    id: String(row.id),
    number: row.numero != null ? String(row.numero) : null,
    series: row.serie != null ? String(row.serie) : null,
    issuer: typeof row.emitente_nome === 'string' ? row.emitente_nome : null,
    total: row.valor != null ? Number(row.valor) : null,
    date: typeof row.data_emissao === 'string' ? row.data_emissao : null,
    cancelled: row.situacao_sefaz === 'cancelada',
    summaryOnly: row.resumo === true,
  };
}

/** NF-e de entrada emitidas pelo Dominex e NF-e recebidas de um fornecedor. */
export function useSupplierFiscalNotes(supplierId?: string) {
  const access = useGoodsFiscalAccess();
  const { companyId } = useUserCompany();

  const issued = useQuery({
    queryKey: [...access.key, 'supplier-notes', supplierId],
    enabled: access.allowed && !!supplierId,
    queryFn: () => fetchGoodsNotes('nfe', access.companyId!, 'supplier_id', supplierId!),
  });

  const received = useQuery({
    queryKey: ['supplier-inbound-nfe', companyId, supplierId],
    enabled: !!companyId && !!supplierId,
    queryFn: async (): Promise<SupplierInboundNote[]> => {
      // `xml_content` fica de fora de propósito: a lista nunca carrega o XML inteiro.
      const { data, error } = await looseClient
        .from('inbound_nfe')
        .select('id, numero, serie, emitente_nome, valor, data_emissao, situacao_sefaz, resumo')
        .eq('company_id', companyId!)
        .eq('supplier_id', supplierId!)
        .order('data_emissao', { ascending: false })
        .limit(GOODS_LIMIT);
      if (error) throw new Error('Não foi possível carregar as notas recebidas.');
      return (Array.isArray(data) ? data : []).map((row) => mapInboundNote(asRecord(row)));
    },
  });

  return {
    issued: access.allowed ? issued.data ?? [] : [],
    received: received.data ?? [],
    isLoading: (access.allowed && issued.isLoading) || received.isLoading,
    isError: received.isError || (access.allowed && issued.isError),
  };
}

// ─── Download dos arquivos ───────────────────────────────────────────────────

/**
 * Baixa DANFE/PDF e XML de uma nota pela mesma ação das telas fiscais.
 * A aba é reservada no clique (síncrono) para o navegador não bloquear.
 */
export function useFiscalNoteDownloads() {
  const action = useGoodsFiscalDocumentAction();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const downloadGoods = async (note: FiscalNote, kind: 'pdf' | 'xml') => {
    const pdfLabel = note.model === 'nfce' ? 'DANFC-e' : 'DANFE';
    const pending = openPendingPdfTab(kind === 'xml' ? 'Preparando XML fiscal…' : `Preparando ${pdfLabel}…`);
    try {
      const result = await action.mutateAsync({
        model: note.model === 'nfce' ? 65 : 55,
        documentId: note.documentId,
        action: 'artifact',
        kind,
      });
      if (!alive.current) {
        pending?.close();
        return;
      }
      const url = goodsArtifactUrl(result.url);
      if (!url) throw new Error('Não foi possível liberar o arquivo fiscal. Tente novamente.');
      if (!showGoodsArtifact(pending, url)) {
        toast.message('O navegador não abriu a nova aba.', {
          action: { label: 'Abrir arquivo', onClick: () => window.open(url, '_blank', 'noopener,noreferrer') },
        });
      }
    } catch (error) {
      pending?.close();
      if (alive.current) toast.error((error as Error).message);
    }
  };

  const downloadNfsePdf = async (note: FiscalNote) => {
    const pending = openPendingPdfTab('Preparando PDF da NFS-e…');
    try {
      const res = await invokeNfse<{ pdfBase64?: string | null; pdfUrl?: string | null; nomeArquivo?: string }>(
        'nfse-danfse',
        { emissionId: note.documentId },
      );
      if (!res.ok || (!res.data?.pdfBase64 && !res.data?.pdfUrl)) {
        pending?.close();
        toast.error(res.message ?? 'Não foi possível gerar o PDF da nota.');
        return;
      }
      const name = res.data.nomeArquivo || `NFSe-${note.number ?? note.documentId.slice(0, 8)}.pdf`;
      const href = res.data.pdfBase64
        ? URL.createObjectURL(
            new Blob([Uint8Array.from(atob(res.data.pdfBase64), (c) => c.charCodeAt(0))], { type: 'application/pdf' }),
          )
        : res.data.pdfUrl!;
      if (pending && !pending.closed) {
        pending.location.href = href;
      } else {
        const a = document.createElement('a');
        a.href = href;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      // Revoga só o blob criado aqui, depois de a aba terminar de carregar.
      if (res.data.pdfBase64) setTimeout(() => URL.revokeObjectURL(href), 120_000);
    } catch {
      pending?.close();
      toast.error('Não foi possível gerar o PDF da nota.');
    }
  };

  const downloadNfseXml = (note: FiscalNote) => {
    if (!note.xmlUrl) {
      toast.error('O XML desta nota ainda não está disponível.');
      return;
    }
    // Documento fiscal se baixa, não se abre em aba nova.
    const a = document.createElement('a');
    a.href = note.xmlUrl;
    a.download = `NFSe-${note.number ?? note.documentId.slice(0, 8)}.xml`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const download = async (note: FiscalNote, kind: 'pdf' | 'xml') => {
    if (busyKey) return;
    setBusyKey(note.key);
    try {
      if (note.model === 'nfse') {
        if (kind === 'pdf') await downloadNfsePdf(note);
        else downloadNfseXml(note);
      } else {
        await downloadGoods(note, kind);
      }
    } finally {
      if (alive.current) setBusyKey(null);
    }
  };

  return { download, busyKey };
}
