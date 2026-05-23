import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Mutations de geração de PDFs PMOC (Onda C/E — v1.9.x).
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
 *  - Disparam toast amigável em PT-BR no erro.
 *
 * `signature_status` (Onda E) é propagado pelo Dossiê e pelo TRT — indica se
 * o PDF foi gerado com a assinatura real do RT (`signed`) ou com linha em
 * branco pra assinar à mão (`pending`). O Cronograma retorna `null`/ausente.
 *
 * Quando o Database ainda não deployou a edge function (404), mostramos
 * mensagem clara enquanto aguarda.
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-C-dossie-cronograma.md §4.2 / §4.3
 * Onda E: TRT separado + embed signature universal.
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
  | 'generate-pmoc-trt-pdf';

async function callEdgeFunction(
  functionName: PmocEdgeFunctionName,
  contractId: string,
): Promise<GeneratePmocPdfResult> {
  const { data: session } = await supabase.auth.getSession();
  const accessToken = session.session?.access_token;
  if (!accessToken) {
    throw new Error('Sessão expirada. Faça login novamente.');
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
    throw new Error('Geração de PDF em breve. Aguarde a próxima atualização.');
  }
  if (res.status === 400) {
    const body = await res.json().catch(() => ({ error: 'Dados insuficientes' }));
    throw new Error(body?.error ?? 'Dados do contrato insuficientes para gerar o PDF.');
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('Você não tem permissão para gerar este documento.');
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
    onError: (err: Error) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao gerar dossiê',
        description: err.message,
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
    onError: (err: Error) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao gerar cronograma',
        description: err.message,
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
    onError: (err: Error) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao gerar TRT',
        description: err.message,
      });
    },
  });
}
