import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_PDV_RECEIPT_SETTINGS, type PdvReceiptFormat, type PdvReceiptSettings } from '@/lib/pdv/receipt/model';

type RpcError = { message?: string; details?: string; code?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;

export class PdvReceiptSettingsError extends Error {
  constructor(message: string, public readonly domainCode: string) { super(message); }
}

function errorCode(error: RpcError) {
  return /(?:^|\s)code=([a-z0-9_]+)/i.exec(error.details ?? '')?.[1] ?? 'pdv_receipt_unknown';
}

function mapError(error: RpcError) {
  const code = errorCode(error);
  const messages: Record<string, string> = {
    pdv_receipt_auth_required: 'Sua sessão expirou. Entre novamente.',
    pdv_receipt_company_required: 'Seu usuário não possui uma empresa ativa.',
    pdv_receipt_module_denied: 'O módulo PDV não está disponível para esta empresa.',
    pdv_receipt_screen_denied: 'Você não tem permissão para alterar as configurações do PDV.',
    pdv_receipt_settings_invalid: 'Revise o formato e a quantidade de vias.',
  };
  return new PdvReceiptSettingsError(messages[code] ?? 'Não foi possível carregar as configurações do comprovante.', code);
}

export function projectPdvReceiptSettings(payload: unknown): PdvReceiptSettings {
  const value = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const format = value.default_format;
  const copies = value.copies;
  return {
    defaultFormat: format === 'a4' || format === '58mm' || format === '80mm' ? format : DEFAULT_PDV_RECEIPT_SETTINGS.defaultFormat,
    autoPrint: value.auto_print === true,
    copies: copies === 2 || copies === 3 ? copies : 1,
  };
}

const key = ['pdv', 'receipt-settings'] as const;

export function usePdvReceiptSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await rpc('pdv_get_receipt_settings_v2');
      if (error) throw mapError(error);
      return projectPdvReceiptSettings(data);
    },
  });
  const save = useMutation({
    mutationFn: async (settings: { defaultFormat: PdvReceiptFormat; autoPrint: boolean; copies: 1 | 2 | 3 }) => {
      const { data, error } = await rpc('pdv_save_receipt_settings_v2', {
        p_default_format: settings.defaultFormat,
        p_auto_print: settings.autoPrint,
        p_copies: settings.copies,
      });
      if (error) throw mapError(error);
      return projectPdvReceiptSettings(data);
    },
    onSuccess: (settings) => queryClient.setQueryData(key, settings),
  });
  return { ...query, save };
}
