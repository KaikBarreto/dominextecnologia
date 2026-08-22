import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import type { WhatsappSettings } from './useWhatsappSettings';

export type WhatsappConnectionStatus = 'disconnected' | 'qr' | 'connected' | 'banned';

export interface WhatsappConnectResult {
  qr?: string | null;
  connection_status: WhatsappConnectionStatus;
}

/**
 * Invoca a edge function `whatsapp-connect` para criar/recuperar a instância
 * da Evolution API e obter o QR code ou o status atual.
 *
 * Como a edge não está no ar durante o desenvolvimento, todos os erros de rede
 * são tratados com elegância (isError=true, sem throw).
 */
export function useWhatsappConnection(companyId: string | null | undefined) {
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!companyId) return;
    setIsConnecting(true);
    setIsError(false);
    setErrorMessage(null);
    setQrCode(null);

    try {
      const { data, error } = await supabase.functions.invoke<WhatsappConnectResult>(
        'whatsapp-connect',
        { body: { company_id: companyId } },
      );

      if (error) throw error;
      if (!data) throw new Error('Resposta vazia da função.');

      setQrCode(data.qr ?? null);

      // Atualiza o cache de settings otimisticamente com o novo status
      queryClient.setQueryData<WhatsappSettings | null>(
        ['whatsapp-settings', companyId],
        (old) =>
          old
            ? { ...old, connection_status: data.connection_status }
            : null,
      );
    } catch (err: unknown) {
      setIsError(true);
      const msg =
        err instanceof Error ? err.message : 'Erro ao conectar ao WhatsApp.';
      setErrorMessage(msg);
    } finally {
      setIsConnecting(false);
    }
  }, [companyId, queryClient]);

  return { connect, isConnecting, qrCode, isError, errorMessage };
}
