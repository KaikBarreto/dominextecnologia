import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';

/**
 * Fronteira do Supabase para a TRILHA DE USO do certificado digital A1.
 *
 * Existe porque os Termos de Uso (item 12.5) prometem, com todas as letras,
 * que o registro de uso do certificado "fica disponível para consulta da sua
 * empresa". Sem esta tela a cláusula seria falsa.
 *
 * Segurança: a trilha é append-only. A empresa só LÊ o próprio registro (RLS
 * por company_id); escrita é exclusiva do backend. O `.eq('company_id', ...)`
 * daqui é UX/performance — quem garante o isolamento é a RLS.
 *
 * Paginação: a trilha cresce a cada nota emitida, então nunca carregamos tudo.
 * Trazemos os mais recentes e o "ver mais" aumenta a janela.
 */

export interface FiscalCertificateAuditEntry {
  id: string;
  /** upload | decifra | revogacao (o rótulo em PT-BR é resolvido na UI). */
  operacao: string;
  /** Detalhe da operação (ex.: chave de acesso da nota). Pode ser nulo. */
  contexto: string | null;
  created_at: string;
}

/** Quantos registros por página. */
export const AUDIT_PAGE_SIZE = 50;

export function useFiscalCertificateAudit({ enabled = true }: { enabled?: boolean } = {}) {
  const { companyId } = useUserCompany();
  const queryClient = useQueryClient();
  const [limit, setLimit] = useState(AUDIT_PAGE_SIZE);

  const query = useQuery({
    queryKey: ['fiscal-certificate-audit', companyId, limit],
    enabled: !!companyId && enabled,
    // Mantém a lista anterior visível enquanto a janela maior carrega — sem
    // piscar vazio ao tocar em "ver mais".
    placeholderData: (previous) => previous,
    queryFn: async (): Promise<FiscalCertificateAuditEntry[]> => {
      const { data, error } = await supabase
        .from('fiscal_certificate_audit')
        .select('id, operacao, contexto, created_at')
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });

  const entries = query.data ?? [];

  return {
    entries,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    /** Encheu a janela → provavelmente há mais histórico. */
    hasMore: entries.length >= limit,
    loadMore: () => setLimit((current) => current + AUDIT_PAGE_SIZE),
    refetch: query.refetch,
    /** Invalida todas as janelas (usar após enviar/remover certificado). */
    invalidate: () =>
      queryClient.invalidateQueries({ queryKey: ['fiscal-certificate-audit', companyId] }),
  };
}

/**
 * Invalidador isolado da trilha, para telas que PROVOCAM eventos de
 * certificado (envio/remoção) sem renderizar a lista elas mesmas.
 */
export function useFiscalCertificateAuditInvalidator() {
  const queryClient = useQueryClient();
  const { companyId } = useUserCompany();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['fiscal-certificate-audit', companyId] }),
    [queryClient, companyId],
  );
}
