import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_PDV_RECEIPT_SETTINGS, type PdvReceiptSettings } from '@/lib/pdv/receipt/model';
import { resolvePdvReceiptStages, type PdvStageReceiptSettings, type StageReceiptSettings, type PdvReceiptStage } from '@/lib/pdv/receipt/stagePolicy';
import { usePdvAuthorizedQueryScope } from './pdvReportCache';

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
    pdv_receipt_screen_denied: 'Você não tem permissão para consultar os comprovantes do PDV.',
    pdv_receipt_settings_invalid: 'Revise o formato, a abertura automática e a quantidade de vias de cada etapa.',
    pdv_receipt_manage_denied: 'Você não tem permissão para alterar as configurações do PDV.',
  };
  return new PdvReceiptSettingsError(messages[code] ?? 'Não foi possível carregar as configurações do comprovante.', code);
}

export function projectPdvReceiptSettings(payload: unknown): PdvStageReceiptSettings {
  const value = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const format = value.default_format;
  const copies = value.copies;
  const legacy: PdvReceiptSettings = {
    defaultFormat: format === 'a4' || format === '58mm' || format === '80mm' ? format : DEFAULT_PDV_RECEIPT_SETTINGS.defaultFormat,
    autoPrint: value.auto_print === true,
    copies: copies === 2 || copies === 3 ? copies : 1,
  };
  const stages = resolvePdvReceiptStages(legacy);
  const raw = value.stages && typeof value.stages === 'object' ? value.stages as Record<string, unknown> : {};
  for (const stage of ['budget', 'sale', 'delivery'] as const) {
    if (!Object.prototype.hasOwnProperty.call(raw, stage)) continue;
    const candidate = raw[stage];
    if (!candidate || typeof candidate !== 'object') continue;
    const policy = candidate as Record<string, unknown>;
    stages[stage] = {
      autoPrint: policy.auto_print === true,
      format: policy.format === 'a4' || policy.format === '58mm' || policy.format === '80mm' ? policy.format : legacy.defaultFormat,
      copies: policy.copies === 2 || policy.copies === 3 ? policy.copies : 1,
    };
  }
  return { ...legacy, stages };
}

export const PDV_RECEIPT_SETTINGS_QUERY_ROOT = ['pdv', 'receipt-settings'] as const;

export function usePdvReceiptSettings() {
  const queryClient = useQueryClient();
  const scope = usePdvAuthorizedQueryScope();
  const key = [...PDV_RECEIPT_SETTINGS_QUERY_ROOT, ...scope.key] as const;
  const query = useQuery({
    queryKey: key,
    enabled: scope.ready,
    queryFn: async () => {
      const { data, error } = await rpc('pdv_get_receipt_settings_v3');
      if (error) throw mapError(error);
      return projectPdvReceiptSettings(data);
    },
  });
  const save = useMutation({
    mutationFn: async (settings: PdvReceiptSettings & { stages?: StageReceiptSettings }) => {
      if (!scope.ready) throw new PdvReceiptSettingsError('Aguarde a confirmação da sua sessão e tente novamente.', 'pdv_receipt_auth_required');
      const stages = settings.stages ?? resolvePdvReceiptStages(settings);
      const payload = Object.fromEntries((['budget', 'sale', 'delivery'] as PdvReceiptStage[]).map(stage => [stage, {
        auto_print: stages[stage].autoPrint, format: stages[stage].format, copies: stages[stage].copies,
      }]));
      const { data, error } = await rpc('pdv_save_receipt_settings_v3', {
        p_default_format: settings.defaultFormat,
        p_auto_print: stages.sale.autoPrint,
        p_copies: stages.sale.copies,
        p_stages: payload,
      });
      if (error) throw mapError(error);
      return projectPdvReceiptSettings(data);
    },
    onSuccess: async (settings) => {
      queryClient.setQueryData(key, settings);
      await queryClient.invalidateQueries({ queryKey: PDV_RECEIPT_SETTINGS_QUERY_ROOT });
    },
  });
  return { ...query, isLoading: query.isLoading || !scope.ready, save };
}
