import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { GOODS_FISCAL_ROOT } from '@/hooks/useGoodsFiscalAccess';
import { goodsFiscalError } from '@/lib/fiscal/goodsErrors';

export interface NfeSeries {
  id: string;
  label: string;
  series: number;
  nextNumber: number;
  direction: 'entrada' | 'saida' | 'ambos';
  active: boolean;
}

export interface GoodsFiscalScenario {
  id: string;
  name: string;
  direction: 'entrada' | 'saida';
  operationNature: string;
  destinationScope: 'interna' | 'interestadual' | 'ambos';
  cfopInternal: string;
  cfopInterstate: string;
  icmsCode: string;
  icmsRate: number | null;
  icmsReductionRate: number | null;
  pisCst: string;
  pisRate: number | null;
  cofinsCst: string;
  cofinsRate: number | null;
  ipiCst: string;
  ipiRate: number | null;
  notes: string;
  active: boolean;
  applicationStatus: 'draft' | 'blocked';
}

export interface GoodsFiscalCarrier {
  id: string;
  name: string;
  document: string;
  stateRegistration: string;
  address: string;
  addressNumber: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  municipalityCode: string;
  rntc: string;
  vehiclePlate: string;
  vehicleState: string;
  active: boolean;
}

type Result = { data: unknown; error: { message?: string } | null };
type ListBuilder = { eq: (column: string, value: string) => ListBuilder; order: (column: string, options?: { ascending?: boolean }) => Promise<Result> };
type TableBuilder = { select: (columns: string) => ListBuilder };
const table = (name: string) => (supabase.from as unknown as (tableName: string) => TableBuilder)(name);
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';
const nullableNumber = (value: unknown) => value == null ? null : Number(value);

async function invoke(body: unknown) {
  const { data, error } = await supabase.functions.invoke('fiscal-goods-settings', { body });
  if (error) {
    const response = (error as unknown as { context?: Response }).context;
    const payload = response && typeof response.clone === 'function' ? await response.clone().json().catch(() => ({})) : {};
    throw new Error(goodsFiscalError(payload));
  }
  const result = object(data);
  if (result.error) throw new Error(goodsFiscalError(result));
  return result;
}

export function useGoodsFiscalCatalogs() {
  const { user, profile, profileLoading, loading } = useAuth();
  const companyId = profile?.user_id === user?.id ? profile?.company_id : null;
  const enabled = !!companyId && profile?.is_active === true && loading === false && profileLoading === false;
  const client = useQueryClient();
  const key = [...GOODS_FISCAL_ROOT, companyId, user?.id, 'catalogs'];
  const query = useQuery({
    queryKey: key,
    enabled,
    staleTime: 0,
    queryFn: async () => {
      const [seriesResult, scenariosResult, carriersResult] = await Promise.all([
        table('nfe_series').select('id,label,series,next_number,direction,active').eq('company_id', companyId!).order('series', { ascending: true }),
        table('fiscal_goods_scenarios').select('id,name,direction,operation_nature,destination_scope,cfop_internal,cfop_interstate,icms_code,icms_rate,icms_reduction_rate,pis_cst,pis_rate,cofins_cst,cofins_rate,ipi_cst,ipi_rate,notes,active,application_status').eq('company_id', companyId!).order('name', { ascending: true }),
        table('fiscal_goods_carriers').select('id,name,document,state_registration,address,address_number,complement,neighborhood,city,state,zip_code,municipality_code,rntc,vehicle_plate,vehicle_state,active').eq('company_id', companyId!).order('name', { ascending: true }),
      ]);
      if (seriesResult.error || scenariosResult.error || carriersResult.error) throw new Error('Não foi possível carregar os cadastros fiscais.');
      const series: NfeSeries[] = (Array.isArray(seriesResult.data) ? seriesResult.data : []).map((entry) => { const row = object(entry); return { id: text(row.id), label: text(row.label), series: Number(row.series), nextNumber: Number(row.next_number), direction: row.direction as NfeSeries['direction'], active: row.active === true }; });
      const scenarios: GoodsFiscalScenario[] = (Array.isArray(scenariosResult.data) ? scenariosResult.data : []).map((entry) => { const row = object(entry); return {
        id: text(row.id), name: text(row.name), direction: row.direction as GoodsFiscalScenario['direction'], operationNature: text(row.operation_nature), destinationScope: row.destination_scope as GoodsFiscalScenario['destinationScope'],
        cfopInternal: text(row.cfop_internal), cfopInterstate: text(row.cfop_interstate), icmsCode: text(row.icms_code), icmsRate: nullableNumber(row.icms_rate), icmsReductionRate: nullableNumber(row.icms_reduction_rate),
        pisCst: text(row.pis_cst), pisRate: nullableNumber(row.pis_rate), cofinsCst: text(row.cofins_cst), cofinsRate: nullableNumber(row.cofins_rate), ipiCst: text(row.ipi_cst), ipiRate: nullableNumber(row.ipi_rate),
        notes: text(row.notes), active: row.active === true, applicationStatus: row.application_status as GoodsFiscalScenario['applicationStatus'],
      }; });
      const carriers: GoodsFiscalCarrier[] = (Array.isArray(carriersResult.data) ? carriersResult.data : []).map((entry) => { const row = object(entry); return {
        id: text(row.id), name: text(row.name), document: text(row.document), stateRegistration: text(row.state_registration), address: text(row.address), addressNumber: text(row.address_number), complement: text(row.complement),
        neighborhood: text(row.neighborhood), city: text(row.city), state: text(row.state), zipCode: text(row.zip_code), municipalityCode: text(row.municipality_code), rntc: text(row.rntc), vehiclePlate: text(row.vehicle_plate), vehicleState: text(row.vehicle_state), active: row.active === true,
      }; });
      return { series, scenarios, carriers };
    },
  });
  const mutate = useMutation({
    mutationFn: invoke,
    onSuccess: () => client.invalidateQueries({ queryKey: GOODS_FISCAL_ROOT }),
  });
  return {
    series: enabled ? query.data?.series ?? [] : [],
    scenarios: enabled ? query.data?.scenarios ?? [] : [],
    carriers: enabled ? query.data?.carriers ?? [] : [],
    isLoading: enabled && query.isLoading,
    isError: enabled && query.isError,
    refetch: query.refetch,
    isMutating: mutate.isPending,
    upsertSeries: (record: Partial<NfeSeries>) => mutate.mutateAsync({ action: 'upsert_series', record }),
    deleteSeries: (id: string) => mutate.mutateAsync({ action: 'delete_series', id }),
    upsertScenario: (record: Partial<GoodsFiscalScenario>) => mutate.mutateAsync({ action: 'upsert_scenario', record }),
    deleteScenario: (id: string) => mutate.mutateAsync({ action: 'delete_scenario', id }),
    upsertCarrier: (record: Partial<GoodsFiscalCarrier>) => mutate.mutateAsync({ action: 'upsert_carrier', record }),
    deleteCarrier: (id: string) => mutate.mutateAsync({ action: 'delete_carrier', id }),
  };
}
