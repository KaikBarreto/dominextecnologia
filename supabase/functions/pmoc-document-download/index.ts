import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { hasServiceDocumentLicense } from '../_shared/service-document-license.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNED_URL_TTL_SECONDS = 300;

const DOCUMENT_LABELS: Record<string, string> = {
  dossie_pmoc: 'Dossiê PMOC',
  cronograma_anual: 'Cronograma Anual PMOC',
  termo_rt: 'Termo de Responsabilidade Técnica',
  certificado: 'Certificado de Conformidade',
  planilha: 'Planilha PMOC',
};

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}

function failure(req: Request, code: string, message: string, status: number): Response {
  return json(req, { error: message, code }, status);
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeFilePart(value: string): string {
  return value
    // deno-lint-ignore no-control-regex -- nomes de arquivo não aceitam controles.
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function buildDownloadName(document: {
  doc_type: string;
  version: number;
  generated_at: string;
}, contractName: string): string {
  const date = /^\d{4}-\d{2}-\d{2}/.exec(document.generated_at)?.[0] ?? '';
  const parts = [
    DOCUMENT_LABELS[document.doc_type] ?? 'Documento PMOC',
    safeFilePart(contractName),
    date,
    `v${document.version}`,
  ].filter(Boolean);
  return `${parts.join(' - ')}.pdf`;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') {
    return failure(req, 'method_not_allowed', 'Método HTTP não suportado.', 405);
  }

  const authorization = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!authorization?.toLowerCase().startsWith('bearer ')) {
    return failure(req, 'unauthorized', 'Sua sessão expirou. Faça login novamente.', 401);
  }

  let body: { documentId?: string; contractId?: string };
  try {
    body = await req.json();
  } catch {
    return failure(req, 'invalid_body', 'Não foi possível identificar o documento solicitado.', 400);
  }

  const documentId = clean(body.documentId);
  const contractId = clean(body.contractId);
  if (!UUID_RE.test(documentId) || !UUID_RE.test(contractId)) {
    return failure(req, 'not_found', 'Documento não encontrado ou indisponível.', 404);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return failure(req, 'service_unavailable', 'O download está temporariamente indisponível. Tente novamente.', 503);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const token = authorization.slice(7).trim();
    const { data: identity, error: identityError } = await service.auth.getUser(token);
    const userId = identity?.user?.id;
    if (identityError || !userId) {
      return failure(req, 'unauthorized', 'Sua sessão expirou. Faça login novamente.', 401);
    }

    const [{ data: profile }, { data: roles }, { data: canManage, error: permissionError }] = await Promise.all([
      service.from('profiles').select('company_id,is_active').eq('user_id', userId).maybeSingle(),
      service.from('user_roles').select('role').eq('user_id', userId),
      service.rpc('can_manage_contracts', { _user_id: userId }),
    ]);
    const isSuperAdmin = (roles ?? []).some((row) => row.role === 'super_admin');

    const { data: document } = await service
      .from('pmoc_documents')
      .select('id,company_id,contract_id,doc_type,version,generated_at,pdf_storage_path')
      .eq('id', documentId)
      .eq('contract_id', contractId)
      .maybeSingle();

    // 404 único evita confirmar a existência de documento de outro tenant.
    if (!document || (!isSuperAdmin && document.company_id !== profile?.company_id)) {
      return failure(req, 'not_found', 'Documento não encontrado ou indisponível.', 404);
    }

    if ((!isSuperAdmin && profile?.is_active !== true) || permissionError || canManage !== true) {
      return failure(req, 'forbidden', 'Você não tem permissão para baixar documentos deste contrato.', 403);
    }

    if (!await hasServiceDocumentLicense(service, document.company_id, 'contract_document', isSuperAdmin)) {
      return failure(
        req,
        'module_unavailable',
        'Sua empresa não tem acesso a este documento. Confira os módulos contratados e a validade da assinatura.',
        403,
      );
    }

    const { data: contract } = await service
      .from('contracts')
      .select('id,company_id,name,is_pmoc')
      .eq('id', contractId)
      .eq('company_id', document.company_id)
      .eq('is_pmoc', true)
      .maybeSingle();
    if (!contract) {
      return failure(req, 'not_found', 'Documento não encontrado ou indisponível.', 404);
    }

    const expectedPrefix = `${document.company_id}/${contractId}/`;
    if (!document.pdf_storage_path?.startsWith(expectedPrefix)) {
      console.error('[pmoc-document-download] caminho inválido', {
        document_id: documentId.slice(0, 8),
        contract_id: contractId.slice(0, 8),
      });
      return failure(req, 'download_unavailable', 'Não foi possível preparar o download. Tente novamente.', 503);
    }

    const fileName = buildDownloadName(document, contract.name ?? '');
    const { data: signed, error: signedError } = await service.storage
      .from('pmoc-documents')
      .createSignedUrl(document.pdf_storage_path, SIGNED_URL_TTL_SECONDS, { download: fileName });
    if (signedError || !signed?.signedUrl) {
      return failure(req, 'download_unavailable', 'Não foi possível preparar o download. Tente novamente.', 503);
    }

    return json(req, { url: signed.signedUrl, expires_in: SIGNED_URL_TTL_SECONDS });
  } catch (error) {
    console.error('[pmoc-document-download] falha inesperada', {
      document_id: documentId.slice(0, 8),
      contract_id: contractId.slice(0, 8),
      message: error instanceof Error ? error.message : String(error),
    });
    return failure(req, 'download_unavailable', 'Não foi possível preparar o download. Tente novamente.', 503);
  }
});
