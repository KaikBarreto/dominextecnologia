import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { projectPdvDirectSaleCatalogV2 } from '@/hooks/usePdvDirectSaleV2';
import { resolveStorageUrl } from '@/hooks/useSignedUrl';

export const PDV_DEMO_EMAIL = 'demo@dominex.app';
export function isPdvDemoBridgeReady(data: unknown, nonce: string): boolean {
  if (!data || typeof data !== 'object') return false;
  const request = data as Record<string, unknown>;
  return request.type === 'dominex-demo-ready' && request.nonce === nonce;
}

export function isTrustedPdvDemoBridgeEvent(
  event: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  source: Window | null,
  nonce: string,
  expectedOrigin: string,
): boolean {
  return Boolean(source) && Boolean(expectedOrigin) && event.origin === expectedOrigin
    && event.source === source && isPdvDemoBridgeReady(event.data, nonce);
}

export interface PdvLiveDemoPayload {
  company: { name: string; logoDataUrl?: string };
  products: Array<{ id: string; name: string; unit: string; price: number | null; stock: number; photo?: string }>;
  customers: Array<{ id: string; name: string; cpfCnpj: string; phone: string; address: string }>;
  accounts: Array<{ id: string; name: string; kind: 'cash' | 'bank' }>;
  registers: Array<{ id: string; name: string }>;
}

export interface PdvDemoAccess {
  development: boolean;
  email: string | null | undefined;
  userId: string | null | undefined;
  companyId: string | null | undefined;
  loading: boolean;
  active: boolean;
  moduleAllowed: boolean;
  screenAllowed: boolean;
}

/** O e-mail é uma restrição adicional do preview, nunca substitui RLS/permissões. */
export function canReadPdvDemoPreview(access: PdvDemoAccess): boolean {
  return access.development && !access.loading && access.active
    && access.email?.trim().toLowerCase() === PDV_DEMO_EMAIL
    && Boolean(access.userId && access.companyId)
    && access.moduleAllowed && access.screenAllowed;
}

function readImageAsDataUrl(blob: Blob): Promise<string | undefined> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined);
    reader.onerror = () => resolve(undefined);
    reader.readAsDataURL(blob);
  });
}

/** URLs assinadas ficam na origem autenticada; o iframe recebe só a imagem. */
async function previewImage(url: string | null | undefined, signal: AbortSignal): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const resolved = await resolveStorageUrl(url);
    if (!resolved) return undefined;
    const parsed = new URL(resolved, window.location.origin);
    if (parsed.origin !== window.location.origin && !(parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co'))) return undefined;
    const response = await fetch(parsed.href, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) return undefined;
    const blob = await response.blob();
    if (blob.size > 5_000_000 || !/^image\/(?:png|jpeg|webp)$/.test(blob.type)) return undefined;
    return readImageAsDataUrl(blob);
  } catch {
    return undefined;
  }
}

type RpcResult = { data: unknown; error: unknown };
const readCatalog = () => (supabase.rpc as unknown as (name: string) => Promise<RpcResult>)('pdv_get_direct_sale_catalog_v2');

/** Apenas consultas. Não importa nem chama setup/ensure, mutations ou service_role. */
export function usePdvLiveDemoReview(access: PdvDemoAccess, canReadCustomerContacts: boolean) {
  return useQuery({
    queryKey: ['pdv-live-demo-review', access.userId ?? null, access.companyId ?? null, canReadCustomerContacts],
    enabled: canReadPdvDemoPreview(access),
    retry: false,
    staleTime: 15_000,
    gcTime: 0,
    refetchOnWindowFocus: false,
    meta: { persist: false },
    queryFn: async ({ signal }): Promise<PdvLiveDemoPayload> => {
      if (!canReadPdvDemoPreview(access)) throw new Error('Entre na conta demo com acesso ao PDV para abrir esta prévia.');
      // Confirma a sessão no Auth antes da leitura; não confiar só no localStorage.
      const { data: identity, error: identityError } = await supabase.auth.getUser();
      if (identityError || identity.user?.id !== access.userId || identity.user.email?.toLowerCase() !== PDV_DEMO_EMAIL) {
        throw new Error('A sessão da conta demo precisa ser confirmada. Entre novamente.');
      }
      const { data: profile, error: profileError } = await supabase.from('profiles')
        .select('company_id, is_active').eq('user_id', identity.user.id).maybeSingle();
      if (profileError || !profile?.company_id || profile.company_id !== access.companyId || profile.is_active === false) {
        throw new Error('Não foi possível confirmar a empresa da conta demo. Recarregue a página.');
      }
      const companyId = profile.company_id;
      const [catalogResult, companyResult] = await Promise.all([
        readCatalog(),
        supabase.from('company_settings').select('name, logo_url').eq('company_id', companyId).maybeSingle(),
      ]);
      if (catalogResult.error || companyResult.error) throw new Error('Não foi possível carregar o catálogo real. Confira o acesso ao PDV e tente novamente.');
      const catalog = projectPdvDirectSaleCatalogV2(catalogResult.data);
      const contactById = new Map<string, { document: string | null; phone: string | null; celular: string | null; address: string | null; address_number: string | null; neighborhood: string | null; city: string | null; state: string | null }>();
      // A permissão de clientes é adicional à de operar o caixa. Nunca ampliar o RPC.
      if (canReadCustomerContacts && catalog.customers.length) {
        for (let offset = 0; offset < catalog.customers.length; offset += 200) {
          const ids = catalog.customers.slice(offset, offset + 200).map((customer) => customer.id);
          const { data, error } = await supabase.from('customers')
            .select('id, document, phone, celular, address, address_number, neighborhood, city, state')
            .eq('company_id', companyId).eq('is_deleted', false).in('id', ids);
          if (error) throw new Error('Não foi possível consultar os clientes da conta demo. Tente novamente.');
          for (const row of data ?? []) contactById.set(row.id, row);
        }
      }
      // Lote curto para fotos: evita centenas de downloads simultâneos.
      const products: PdvLiveDemoPayload['products'] = [];
      for (let offset = 0; offset < catalog.materials.length; offset += 6) {
        const batch = await Promise.all(catalog.materials.slice(offset, offset + 6).map(async (material) => ({
          id: material.id, name: material.name, unit: material.unit, price: material.salePrice,
          stock: material.availableByStock.reduce((total, stock) => total + stock.availableQuantity, 0),
          photo: await previewImage(material.imageUrl, signal),
        })));
        products.push(...batch);
        if (signal.aborted) throw new Error('Consulta interrompida.');
      }
      const logoDataUrl = await previewImage(companyResult.data?.logo_url, signal);
      return {
        company: { name: companyResult.data?.name || 'Conta demo', ...(logoDataUrl ? { logoDataUrl } : {}) },
        products,
        customers: catalog.customers.map((customer) => {
          const contact = contactById.get(customer.id);
          return {
            id: customer.id, name: customer.name, cpfCnpj: contact?.document ?? '', phone: contact?.celular || contact?.phone || '',
            address: [contact?.address, contact?.address_number, contact?.neighborhood, contact?.city, contact?.state].filter(Boolean).join(', '),
          };
        }),
        accounts: [
          ...(catalog.cashAccount ? [{ id: catalog.cashAccount.id, name: catalog.cashAccount.name, kind: 'cash' as const }] : []),
          ...catalog.bankAccounts.map(({ id, name }) => ({ id, name, kind: 'bank' as const })),
        ],
        registers: catalog.terminals.map(({ id, name }) => ({ id, name })),
      };
    },
  });
}
