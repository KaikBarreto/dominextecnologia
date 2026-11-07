import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type OsPmocDocumentType = 'relatorio_servico' | 'certificado_conformidade';

export interface OsPmocProductOption {
  id: string;
  name: string;
  pmoc_manufacturer: string | null;
  pmoc_anvisa_registration: string | null;
  pmoc_batch_number: string | null;
  pmoc_manufactured_on: string | null;
  pmoc_expires_on: string | null;
  consumedInOrder: boolean;
}
export interface GenerateOsPmocDocumentInput {
  doc_type: OsPmocDocumentType;
  inventory_id: string;
  responsible_technician_id: string;
}

export interface GenerateOsPmocDocumentResult {
  pdf_url: string;
  file_name: string;
  version: number;
  valid_until: string | null;
  cached: boolean;
}

class OsPmocDocumentError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'OsPmocDocumentError';
  }
}

async function callGenerator(
  serviceOrderId: string,
  input: GenerateOsPmocDocumentInput,
): Promise<GenerateOsPmocDocumentResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new OsPmocDocumentError('unauthorized', 'Sua sessão expirou. Entre novamente.');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('Ambiente Supabase não configurado.');
  const result = await fetch(`${supabaseUrl}/functions/v1/generate-os-pmoc-document`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ service_order_id: serviceOrderId, ...input }),
  });
  const body = await result.json().catch(() => null) as (GenerateOsPmocDocumentResult & { code?: string; message?: string }) | null;
  if (!result.ok || !body?.pdf_url) {
    throw new OsPmocDocumentError(
      body?.code ?? 'document_generation_failed',
      body?.message ?? 'Não foi possível gerar o documento PMOC.',
    );
  }
  return body;
}

async function downloadGeneratedDocument(result: GenerateOsPmocDocumentResult): Promise<void> {
  const response = await fetch(result.pdf_url);
  if (!response.ok) throw new Error('O PDF foi gerado, mas não foi possível iniciar o download.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = result.file_name;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Dados e geração dos documentos PMOC emitidos diretamente por uma OS. */
export function useOsPmocDocuments(serviceOrderId: string | null, enabled = true) {
  const queryClient = useQueryClient();
  const normalizedServiceOrderId = serviceOrderId ?? '';
  const optionsQuery = useQuery({
    queryKey: ['service-order-pmoc-options', normalizedServiceOrderId],
    enabled: enabled && Boolean(normalizedServiceOrderId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data: order, error: orderError } = await supabase
        .from('service_orders')
        .select('id, company_id, completed_at, check_out_time, contract_id')
        .eq('id', normalizedServiceOrderId)
        .single();
      if (orderError) throw orderError;

      const [{ data: products, error: productError }, { data: consumed, error: consumedError }, contractResult, settingsResult] = await Promise.all([
        supabase
          .from('inventory')
          .select('id, name, pmoc_manufacturer, pmoc_anvisa_registration, pmoc_batch_number, pmoc_manufactured_on, pmoc_expires_on')
          .eq('company_id', order.company_id)
          .eq('is_pmoc_product', true)
          .is('archived_at', null)
          .order('name'),
        supabase
          .from('service_order_materials')
          .select('inventory_id, committed_quantity')
          .eq('service_order_id', normalizedServiceOrderId)
          .gt('committed_quantity', 0),
        order.contract_id
          ? supabase.from('contracts').select('responsible_technician_id').eq('id', order.contract_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from('company_settings').select('timezone').eq('company_id', order.company_id).maybeSingle(),
      ]);
      if (productError) throw productError;
      if (consumedError) throw consumedError;
      if (contractResult.error) throw contractResult.error;
      if (settingsResult.error) throw settingsResult.error;

      const consumedIds = new Set((consumed ?? []).map((row) => row.inventory_id));
      const completionInstant = order.completed_at ?? order.check_out_time;
      let completionDate = '';
      if (completionInstant) {
        const formatIn = (timeZone: string) => new Intl.DateTimeFormat('en-CA', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(completionInstant));
        try {
          completionDate = formatIn(settingsResult.data?.timezone || 'America/Sao_Paulo');
        } catch {
          completionDate = formatIn('America/Sao_Paulo');
        }
      }
      const productOptions = (products ?? [])
        .filter((product) => {
          if (!completionDate) return true;
          if (product.pmoc_manufactured_on && product.pmoc_manufactured_on > completionDate) return false;
          return !product.pmoc_expires_on || product.pmoc_expires_on >= completionDate;
        })
        .map((product) => ({ ...product, consumedInOrder: consumedIds.has(product.id) })) as OsPmocProductOption[];

      return {
        products: productOptions.sort((a, b) => Number(b.consumedInOrder) - Number(a.consumedInOrder)),
        contractId: order.contract_id,
        contractResponsibleTechnicianId: contractResult.data?.responsible_technician_id ?? null,
      };
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (input: GenerateOsPmocDocumentInput) => {
      if (!normalizedServiceOrderId) throw new Error('Ordem de serviço não selecionada.');
      const result = await callGenerator(normalizedServiceOrderId, input);
      await downloadGeneratedDocument(result);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-order-pmoc-documents', normalizedServiceOrderId] });
    },
  });

  return {
    products: optionsQuery.data?.products ?? [],
    contractId: optionsQuery.data?.contractId ?? null,
    contractResponsibleTechnicianId: optionsQuery.data?.contractResponsibleTechnicianId ?? null,
    isLoadingOptions: optionsQuery.isLoading,
    optionsError: optionsQuery.error,
    generateDocument: generateMutation.mutateAsync,
    isGenerating: generateMutation.isPending,
  };
}
