import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { supabaseAnon } from '@/integrations/supabase/anonClient';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCompany } from '@/hooks/useUserCompany';
import { SERVICE_ORDER_BUDGET_KEY } from '@/hooks/useServiceOrderBudget';
import { osFieldDraftKey, readOsFieldDraft, type OsCommercialDocument, type OsFieldBudget, type OsFieldDraft } from '@/lib/osCommercial';

export const OS_COMMERCIAL_KEY = 'os-commercial-document';
const rpc = (client: typeof supabase) => client.rpc.bind(client) as (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
export async function fetchOsCommercialDocument(osId: string, publicMode = true): Promise<OsCommercialDocument | null> {
  const { data, error } = await rpc(publicMode ? supabaseAnon : supabase)('get_os_commercial_document', { p_os_id: osId, p_public: publicMode });
  if (error) throw error;
  return data as OsCommercialDocument | null;
}
export function useOsCommercialDocument(osId: string, publicMode: boolean) {
  const { user } = useAuth();
  return useQuery({ queryKey: [OS_COMMERCIAL_KEY, osId, publicMode ? 'public' : user?.id],
    queryFn: () => fetchOsCommercialDocument(osId, publicMode), refetchOnWindowFocus: true });
}

export function useOsFieldBudget(osId?: string | null) {
  const { user } = useAuth();
  const { companyId } = useUserCompany();
  const client = useQueryClient();
  const scope = osId && user?.id && companyId ? osFieldDraftKey(companyId, user.id, osId) : null;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [local, setLocal] = useState<{ scope: string; draft: OsFieldDraft } | null>(null);
  const [saveError, setSaveError] = useState<{ scope: string; error: unknown } | null>(null);
  const [savingScope, setSavingScope] = useState<string | null>(null);
  const inFlight = useRef(false);
  const draft = scope && local?.scope === scope ? local.draft : scope ? readOsFieldDraft(scope) : null;
  const query = useQuery({ queryKey: ['service-orders', 'field-budget', scope], enabled: !!scope,
    queryFn: async () => {
      const { data, error } = await rpc(supabase)('get_os_field_budget', { p_os_id: osId });
      if (error) throw error;
      return data as OsFieldBudget;
    } });
  const change = useCallback((next: Pick<OsFieldDraft, 'items' | 'show_values'>) => {
    if (!scope || !query.data) return;
    const previous = local?.scope === scope ? local.draft : readOsFieldDraft(scope);
    const value: OsFieldDraft = { ...next, revision: previous?.revision ?? query.data.revision, requestId: crypto.randomUUID() };
    // Se o armazenamento estiver cheio, a UI deve avisar, nunca anunciar backup.
    localStorage.setItem(scope, JSON.stringify(value));
    setLocal({ scope, draft: value });
    setSaveError(null);
  }, [scope, query.data, local]);
  const save = useCallback(async () => {
    if (!scope || !osId || inFlight.current) return false;
    const pending = local?.scope === scope ? local.draft : readOsFieldDraft(scope);
    if (!pending) return true;
    inFlight.current = true;
    setSavingScope(scope);
    setSaveError(null);
    try {
      const { data, error } = await rpc(supabase)('save_os_field_budget', { p_os_id: osId,
        p_revision: pending.revision, p_request_id: pending.requestId, p_items: pending.items, p_show_values: pending.show_values });
      if (error) throw error;
      // Só limpa o snapshot enviado; outra aba/edição pode ter criado um novo.
      if (readOsFieldDraft(scope)?.requestId === pending.requestId) localStorage.removeItem(scope);
      if (scopeRef.current !== scope) return true;
      setLocal(null);
      client.setQueryData(['service-orders', 'field-budget', scope], data);
      await Promise.all([
        ['service-orders'], [SERVICE_ORDER_BUDGET_KEY, osId], [OS_COMMERCIAL_KEY, osId],
        ['os-revenue-suggested-amount', osId], ['dashboard-stats'],
      ].map(queryKey => client.invalidateQueries({ queryKey })));
      return true;
    } catch (error) {
      if (scopeRef.current === scope) setSaveError({ scope, error });
      return false;
    } finally { inFlight.current = false; if (scopeRef.current === scope) setSavingScope(null); }
  }, [scope, osId, local, client]);
  useEffect(() => {
    const onOnline = () => { void save(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [save]);
  // Recuperação explícita mantém o conteúdo divergente no aparelho até o usuário conferir.
  const rebase = () => {
    if (!scope || !draft || !query.data) return;
    const next = { ...draft, revision: query.data.revision, requestId: crypto.randomUUID() };
    localStorage.setItem(scope, JSON.stringify(next)); setLocal({ scope, draft: next }); setSaveError(null);
  };
  const discard = () => {
    if (!scope) return;
    localStorage.removeItem(scope); setLocal(null); setSaveError(null);
  };
  return { ...query, draft, change, save, rebase, discard, refresh: query.refetch,
    saving: savingScope === scope && !!scope, errorSaving: saveError?.scope === scope ? saveError.error : null };
}

export function useOsCommercialCatalog(enabled: boolean) {
  const { companyId } = useUserCompany();
  return useQuery({ queryKey: ['service-orders', 'commercial-catalog', companyId], enabled: enabled && !!companyId,
    queryFn: async () => {
      const [services, products] = await Promise.all([
        supabase.from('service_types').select('id,name,default_price').eq('company_id', companyId!).eq('is_active', true).order('name'),
        supabase.from('inventory').select('id,name,sale_price').eq('company_id', companyId!).is('customer_id', null).order('name'),
      ]);
      if (services.error) throw services.error;
      if (products.error) throw products.error;
      return [
        ...services.data.map(s => ({ key: `s:${s.id}`, item_type: 'servico' as const, service_type_id: s.id, inventory_id: null, description: s.name, unit_price: s.default_price ?? 0 })),
        ...products.data.map(p => ({ key: `p:${p.id}`, item_type: 'material' as const, inventory_id: p.id, service_type_id: null, description: p.name, unit_price: p.sale_price ?? 0 })),
      ];
    } });
}

export function useOsExecutionTemplates(enabled: boolean) {
  const { companyId } = useUserCompany();
  return useQuery({ queryKey: ['service-orders', 'execution-templates', companyId], enabled: enabled && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from('form_templates').select('id,name')
        .eq('company_id', companyId!).eq('is_active', true).order('name');
      if (error) throw error;
      return data;
    } });
}
