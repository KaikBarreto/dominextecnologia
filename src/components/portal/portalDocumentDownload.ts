import { supabase } from '@/integrations/supabase/client';

export type PortalDocumentSource =
  | 'manual'
  | 'contract_attachment'
  | 'dominex_nfse'
  | 'dominex_nfe'
  | 'dominex_nfce';

export type PortalDocumentFormat = 'pdf' | 'xml';

export interface PortalDocumentDownloadRequest {
  portalToken: string;
  sessionToken: string | null;
  documentId: string;
  source: PortalDocumentSource;
  /** Só faz sentido para NF-e e NFC-e; a edge ignora nas demais fontes. */
  format?: PortalDocumentFormat;
}

export type PortalDocumentDownloadResult =
  | { kind: 'url'; url: string }
  | { kind: 'pdf_base64'; base64: string };

/**
 * Fronteira com o Supabase para o download de documentos do portal público.
 * A edge revalida o acesso pelo token/sessão do visitante antes de assinar.
 */
export async function requestPortalDocumentDownload(
  request: PortalDocumentDownloadRequest,
): Promise<PortalDocumentDownloadResult> {
  const body: Record<string, unknown> = {
    portalToken: request.portalToken,
    sessionToken: request.sessionToken || null,
    documentId: request.documentId,
    source: request.source,
  };
  if (request.format) body.format = request.format;

  const { data, error } = await supabase.functions.invoke('customer-portal-document-download', { body });
  if (error || !data) throw error ?? new Error('Arquivo indisponível.');
  if (typeof data.url === 'string' && data.url) return { kind: 'url', url: data.url };
  if (typeof data.pdf_base64 === 'string' && data.pdf_base64) {
    return { kind: 'pdf_base64', base64: data.pdf_base64 };
  }
  throw new Error('Arquivo indisponível.');
}
