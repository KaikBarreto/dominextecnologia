import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { getPmocErrorMessage } from '@/utils/pmocErrorMessages';

/**
 * Mutations de geração de PDFs PMOC (Onda C/E/G — v1.9.x).
 *
 * - `useGenerateDossiePdf` → edge function `generate-pmoc-dossie-pdf`
 *   (capa + termo RT + certificado).
 * - `useGenerateCronogramaPdf` → edge function `generate-pmoc-cronograma-pdf`
 *   (12 meses, 1 página por mês).
 * - `useGenerateTrtPdf` (Onda E) → edge function `generate-pmoc-trt-pdf`
 *   (Termo de Responsabilidade Técnica em 1 página, gerável independente do Dossiê).
 *
 * Todas:
 *  - Exigem `Authorization` do usuário logado (RLS no DB + checagem same-tenant).
 *  - Retornam `{ pdf_url, version, cached, signature_status? }` ao sucesso.
 *  - Onda G: traduzem códigos de erro técnicos (`cnpj_missing` etc.) em
 *    mensagens amigáveis em PT-BR via `getPmocErrorMessage`, com CTA quando faz
 *    sentido (ex: "Ir pra Configurações").
 *
 * `signature_status` (Onda E) é propagado pelo Dossiê e pelo TRT — indica se
 * o PDF foi gerado com a assinatura real do RT (`signed`) ou com linha em
 * branco pra assinar à mão (`pending`). O Cronograma retorna `null`/ausente.
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-C-dossie-cronograma.md §4.2 / §4.3
 * Onda E: TRT separado + embed signature universal.
 * Onda G: erros amigáveis + CTA no toast.
 */

export type PmocSignatureStatus = 'signed' | 'pending';

export interface GeneratePmocPdfResult {
  pdf_url: string;
  version: number;
  cached: boolean;
  /** Onda E — só presente em respostas de TRT/Dossiê. */
  signature_status?: PmocSignatureStatus;
}

interface GenerateInput {
  contract_id: string;
}

type PmocEdgeFunctionName =
  | 'generate-pmoc-dossie-pdf'
  | 'generate-pmoc-cronograma-pdf'
  | 'generate-pmoc-trt-pdf'
  | 'generate-pmoc-certificado-pdf'
  | 'generate-pmoc-planilha-pdf';

/**
 * Erro tipado lançado pelo `callEdgeFunction`. Carrega o `code` curto vindo da
 * edge function (`cnpj_missing` etc.) quando disponível, pra que o `onError`
 * do hook traduza pra mensagem amigável.
 */
class PmocEdgeError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'PmocEdgeError';
  }
}

async function callEdgeFunction(
  functionName: PmocEdgeFunctionName,
  contractId: string,
): Promise<GeneratePmocPdfResult> {
  const { data: session } = await supabase.auth.getSession();
  const accessToken = session.session?.access_token;
  if (!accessToken) {
    throw new PmocEdgeError('session_expired');
  }

  const supabaseUrl = (import.meta as unknown as { env?: { VITE_SUPABASE_URL?: string } }).env
    ?.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Ambiente Supabase não configurado.');
  }

  const url = `${supabaseUrl}/functions/v1/${functionName}?contract_id=${encodeURIComponent(contractId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 404) {
    throw new PmocEdgeError('edge_not_deployed');
  }
  if (res.status === 400) {
    const body = await res.json().catch(() => ({ error: 'unknown' }));
    const code = typeof body?.error === 'string' ? body.error : 'unknown';
    throw new PmocEdgeError(code);
  }
  if (res.status === 401 || res.status === 403) {
    throw new PmocEdgeError('permission_denied');
  }
  if (!res.ok) {
    throw new Error('Não foi possível gerar o PDF agora.');
  }

  const json = (await res.json()) as GeneratePmocPdfResult;
  if (!json.pdf_url) {
    throw new Error('Resposta inválida da geração de PDF.');
  }
  return json;
}

/**
 * Resolve o code de erro a ser traduzido — prefere `PmocEdgeError.code`, senão
 * usa a `Error.message` (que ainda pode bater como match parcial).
 */
function extractErrorCode(err: unknown): string {
  if (err instanceof PmocEdgeError) return err.code;
  if (err instanceof Error) return err.message;
  return String(err ?? '');
}

/**
 * Auto-geração da V1 dos documentos PMOC ao CRIAR um contrato (2026-06).
 *
 * Dispara, em segundo plano e SEQUENCIALMENTE, a geração de:
 *   1. Termo de Responsabilidade Técnica (TRT)
 *   2. Certificado de Conformidade
 *   3. Cronograma Anual
 *   4. Dossiê PMOC (por último — agrega TRT + Certificado)
 *
 * Best-effort: cada erro individual é capturado e IGNORADO (apenas logado).
 * Se faltar CNPJ/RT, aquele documento só não gera — o gestor gera manual depois
 * pela aba Documentos. NÃO bloqueia navegação nem lança erro pro chamador.
 *
 * Não usa toast aqui (o chamador decide se quer feedback discreto), e não invalida
 * queries (a aba Documentos do contrato refaz a query ao ser aberta).
 *
 * Importante: chamar SÓ pra contratos `is_pmoc=true`.
 */
export async function autoGeneratePmocDocsV1(contractId: string): Promise<void> {
  if (!contractId) return;

  // Ordem: TRT → Certificado → Cronograma → Dossiê (dossiê por último).
  const steps: PmocEdgeFunctionName[] = [
    'generate-pmoc-trt-pdf',
    'generate-pmoc-certificado-pdf',
    'generate-pmoc-cronograma-pdf',
    'generate-pmoc-dossie-pdf',
  ];

  for (const fn of steps) {
    try {
      await callEdgeFunction(fn, contractId);
    } catch (err) {
      // Best-effort: documento que falhar (ex: cnpj_missing, sem RT) só não é
      // gerado agora. O gestor pode gerar manualmente depois.
      console.warn(`[autoGeneratePmocDocsV1] ${fn} falhou (ignorado):`, err);
    }
  }
}

export function useGenerateDossiePdf() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contract_id }: GenerateInput) =>
      callEdgeFunction('generate-pmoc-dossie-pdf', contract_id),
    onSuccess: (result, { contract_id }) => {
      queryClient.invalidateQueries({ queryKey: ['pmoc-documents', contract_id] });
      toast({
        title: result.cached ? 'PDF já estava atualizado' : 'Dossiê PMOC gerado!',
        description: result.cached
          ? 'Os dados não mudaram desde a última versão. Usando a versão atual.'
          : `Versão ${result.version} criada com sucesso.`,
      });
    },
    onError: (err: unknown) => {
      const code = extractErrorCode(err);
      const msg = getPmocErrorMessage(code, 'Erro ao gerar dossiê');
      toast({
        variant: 'destructive',
        title: msg.title,
        description: msg.description,
        action: msg.cta
          ? (
            <ToastAction
              altText={msg.cta.label}
              onClick={() => {
                window.location.href = msg.cta!.path;
              }}
            >
              {msg.cta.label}
            </ToastAction>
          )
          : undefined,
      });
    },
  });
}

export function useGenerateCronogramaPdf() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contract_id }: GenerateInput) =>
      callEdgeFunction('generate-pmoc-cronograma-pdf', contract_id),
    onSuccess: (result, { contract_id }) => {
      queryClient.invalidateQueries({ queryKey: ['pmoc-documents', contract_id] });
      toast({
        title: result.cached ? 'Cronograma já estava atualizado' : 'Cronograma anual gerado!',
        description: result.cached
          ? 'Sem mudanças no cronograma desde a última geração.'
          : `Versão ${result.version} criada com sucesso.`,
      });
    },
    onError: (err: unknown) => {
      const code = extractErrorCode(err);
      const msg = getPmocErrorMessage(code, 'Erro ao gerar cronograma');
      toast({
        variant: 'destructive',
        title: msg.title,
        description: msg.description,
        action: msg.cta
          ? (
            <ToastAction
              altText={msg.cta.label}
              onClick={() => {
                window.location.href = msg.cta!.path;
              }}
            >
              {msg.cta.label}
            </ToastAction>
          )
          : undefined,
      });
    },
  });
}

/**
 * Onda E — gera o TRT (Termo de Responsabilidade Técnica) standalone.
 *
 * 1 página A4. Pode ser regenerado independente do Dossiê. O backend embute
 * a assinatura real do RT quando disponível; caso contrário, deixa linha em
 * branco e devolve `signature_status: 'pending'` pra UI sinalizar.
 */
export function useGenerateTrtPdf() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contract_id }: GenerateInput) =>
      callEdgeFunction('generate-pmoc-trt-pdf', contract_id),
    onSuccess: (result, { contract_id }) => {
      queryClient.invalidateQueries({ queryKey: ['pmoc-documents', contract_id] });

      // Mensagem condicional baseada em cache + signature_status.
      const baseTitle = result.cached ? 'TRT já estava atualizado' : 'TRT gerado!';
      let description: string;
      if (result.cached) {
        description = 'Os dados não mudaram desde a última versão. Usando a versão atual.';
      } else if (result.signature_status === 'pending') {
        description = `Versão ${result.version} criada. A assinatura do RT ainda não foi cadastrada — o PDF saiu com linha em branco pra assinar à mão.`;
      } else {
        description = `Versão ${result.version} criada com sucesso.`;
      }

      toast({ title: baseTitle, description });
    },
    onError: (err: unknown) => {
      const code = extractErrorCode(err);
      const msg = getPmocErrorMessage(code, 'Erro ao gerar TRT');
      toast({
        variant: 'destructive',
        title: msg.title,
        description: msg.description,
        action: msg.cta
          ? (
            <ToastAction
              altText={msg.cta.label}
              onClick={() => {
                window.location.href = msg.cta!.path;
              }}
            >
              {msg.cta.label}
            </ToastAction>
          )
          : undefined,
      });
    },
  });
}

/**
 * Gera o Certificado de Conformidade standalone (paridade com o TRT).
 *
 * 1 página A4. Pode ser regenerado independente do Dossiê. Espelha
 * `useGenerateTrtPdf`: o backend embute a assinatura real do RT quando
 * disponível; caso contrário, deixa linha em branco e devolve
 * `signature_status: 'pending'` pra UI sinalizar.
 */
/**
 * Fase 4 — gera a "Planilha PMOC" standalone (espelha o modelo do cliente:
 * identificação + RT + relação de equipamentos + plano M/T/S/A + matriz 12
 * meses + registro de execução). Também vive embutida no Dossiê.
 */
export function useGeneratePlanilhaPdf() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contract_id }: GenerateInput) =>
      callEdgeFunction('generate-pmoc-planilha-pdf', contract_id),
    onSuccess: (result, { contract_id }) => {
      queryClient.invalidateQueries({ queryKey: ['pmoc-documents', contract_id] });
      toast({
        title: result.cached ? 'Planilha já estava atualizada' : 'Planilha PMOC gerada!',
        description: result.cached
          ? 'Os dados não mudaram desde a última versão. Usando a versão atual.'
          : `Versão ${result.version} criada com sucesso.`,
      });
    },
    onError: (err: unknown) => {
      const code = extractErrorCode(err);
      const msg = getPmocErrorMessage(code, 'Erro ao gerar planilha');
      toast({
        variant: 'destructive',
        title: msg.title,
        description: msg.description,
        action: msg.cta
          ? (
            <ToastAction
              altText={msg.cta.label}
              onClick={() => {
                window.location.href = msg.cta!.path;
              }}
            >
              {msg.cta.label}
            </ToastAction>
          )
          : undefined,
      });
    },
  });
}

export function useGenerateCertificadoPdf() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contract_id }: GenerateInput) =>
      callEdgeFunction('generate-pmoc-certificado-pdf', contract_id),
    onSuccess: (result, { contract_id }) => {
      queryClient.invalidateQueries({ queryKey: ['pmoc-documents', contract_id] });

      const baseTitle = result.cached ? 'Certificado já estava atualizado' : 'Certificado gerado!';
      let description: string;
      if (result.cached) {
        description = 'Os dados não mudaram desde a última versão. Usando a versão atual.';
      } else if (result.signature_status === 'pending') {
        description = `Versão ${result.version} criada. A assinatura do RT ainda não foi cadastrada — o PDF saiu com linha em branco pra assinar à mão.`;
      } else {
        description = `Versão ${result.version} criada com sucesso.`;
      }

      toast({ title: baseTitle, description });
    },
    onError: (err: unknown) => {
      const code = extractErrorCode(err);
      const msg = getPmocErrorMessage(code, 'Erro ao gerar Certificado');
      toast({
        variant: 'destructive',
        title: msg.title,
        description: msg.description,
        action: msg.cta
          ? (
            <ToastAction
              altText={msg.cta.label}
              onClick={() => {
                window.location.href = msg.cta!.path;
              }}
            >
              {msg.cta.label}
            </ToastAction>
          )
          : undefined,
      });
    },
  });
}
