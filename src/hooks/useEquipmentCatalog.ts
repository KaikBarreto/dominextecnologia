import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Catálogo GLOBAL de equipamentos de ar-condicionado (consulta em campo).
 *
 * São tabelas globais (sem company_id) — qualquer técnico autenticado lê.
 * NÃO confundir com `equipment_categories` / `equipment` (multi-tenant, dados
 * do cliente). Aqui só leitura via React Query; nada de mutação.
 */

export interface EquipmentBrand {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  sort: number | null;
  created_at: string;
}

/** Categoria (tipo) do modelo: Split Hi-Wall, Cassete, Piso-Teto, etc. */
export interface EquipmentModelCategory {
  id: string;
  name: string;
}

/**
 * Domínio do catálogo. Hoje o banco só tem 'ar_condicionado' populado; os demais
 * existem no schema (enum/text) mas caem em catálogo vazio até serem cadastrados.
 */
export type EquipmentDomain =
  | 'ar_condicionado'
  | 'compressor'
  | 'linha_branca'
  | 'controle_remoto';

export interface EquipmentModel {
  id: string;
  brand_id: string;
  category_id: string | null;
  name: string;
  code: string | null;
  image_url: string | null;
  manual_url: string | null;
  /** Gás refrigerante do modelo (ex.: 'R-32', 'R-410A'); null quando não cadastrado. */
  refrigerant: string | null;
  /** Domínio do catálogo a que o modelo pertence. */
  domain: string;
  /**
   * FK self-ref para o compressor TÍPICO desta máquina (AC/linha branca),
   * ligado por capacidade/BTU. É referência, não o compressor exato. Null quando
   * não mapeado.
   */
  compressor_model_id?: string | null;
  created_at: string;
  /** Hidratado nas queries que fazem join com a marca. */
  brand?: Pick<EquipmentBrand, 'id' | 'name' | 'logo_url'> | null;
  /** Hidratado nas queries que fazem join com a categoria (tipo do equipamento). */
  category?: EquipmentModelCategory | null;
}

export interface EquipmentErrorCode {
  id: string;
  model_id: string;
  code: string;
  title: string | null;
  description: string | null;
  diagnosis: string | null;
  solution: string | null;
  component: string | null;
  created_at: string;
}

/**
 * Marcas que têm ≥1 modelo NO domínio informado, ordenadas por `sort`
 * (e nome como desempate). Faz 2 queries: pega os brand_ids distintos de
 * `equipment_models` daquele domínio e filtra as marcas por esses ids.
 * Domínios sem modelos cadastrados retornam lista vazia (catálogo em atualização).
 */
export function useEquipmentBrands(domain: string = 'ar_condicionado') {
  return useQuery({
    queryKey: ['equipment-catalog', 'brands', domain],
    queryFn: async () => {
      const { data: modelRows, error: modelErr } = await supabase
        .from('equipment_models')
        .select('brand_id')
        .eq('domain', domain);
      if (modelErr) throw modelErr;

      const brandIds = Array.from(
        new Set((modelRows ?? []).map((r) => r.brand_id).filter(Boolean)),
      );
      if (brandIds.length === 0) return [] as EquipmentBrand[];

      const { data, error } = await supabase
        .from('equipment_brands')
        .select('id, name, slug, logo_url, sort, created_at')
        .in('id', brandIds)
        .order('sort', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EquipmentBrand[];
    },
  });
}

/** Busca uma marca específica pelo id (pra mostrar nome/logo nos headers). */
export function useEquipmentBrand(brandId: string | null | undefined) {
  return useQuery({
    queryKey: ['equipment-catalog', 'brand', brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_brands')
        .select('id, name, slug, logo_url, sort, created_at')
        .eq('id', brandId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as EquipmentBrand | null;
    },
  });
}

/** Modelos de uma marca dentro de um domínio, ordenados por nome. */
export function useEquipmentModelsByBrand(
  brandId: string | null | undefined,
  domain: string = 'ar_condicionado',
) {
  return useQuery({
    queryKey: ['equipment-catalog', 'models-by-brand', brandId, domain],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_models')
        .select(
          'id, brand_id, category_id, name, code, image_url, manual_url, refrigerant, domain, compressor_model_id, created_at, category:equipment_model_categories(id, name)',
        )
        .eq('brand_id', brandId as string)
        .eq('domain', domain)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EquipmentModel[];
    },
  });
}

/** Um modelo pelo id, já com a marca hidratada (header da tela do modelo). */
export function useEquipmentModel(modelId: string | null | undefined) {
  return useQuery({
    queryKey: ['equipment-catalog', 'model', modelId],
    enabled: !!modelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_models')
        .select(
          'id, brand_id, category_id, name, code, image_url, manual_url, refrigerant, domain, compressor_model_id, created_at, brand:equipment_brands(id, name, logo_url), category:equipment_model_categories(id, name)',
        )
        .eq('id', modelId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as EquipmentModel | null;
    },
  });
}

/**
 * Busca modelos pelo `code` (ilike). Só dispara com termo não-vazio.
 * Hidrata a marca pra exibir na lista de resultados.
 */
export function useEquipmentModelsByCode(term: string) {
  const trimmed = term.trim();
  return useQuery({
    queryKey: ['equipment-catalog', 'models-by-code', trimmed],
    enabled: trimmed.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_models')
        .select(
          'id, brand_id, category_id, name, code, image_url, manual_url, refrigerant, domain, created_at, brand:equipment_brands(id, name, logo_url), category:equipment_model_categories(id, name)',
        )
        .ilike('code', `%${trimmed}%`)
        .order('name', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as EquipmentModel[];
    },
  });
}

/**
 * TODOS os modelos de um domínio com a marca hidratada.
 * Usado pela busca global client-side (catálogo é pequeno; sem paginação).
 */
export function useAllModelsWithBrand(domain: string = 'ar_condicionado') {
  return useQuery({
    queryKey: ['equipment-catalog', 'all-models', domain],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_models')
        .select(
          'id, brand_id, category_id, name, code, image_url, manual_url, refrigerant, domain, compressor_model_id, created_at, brand:equipment_brands(id, name, logo_url), category:equipment_model_categories(id, name)',
        )
        .eq('domain', domain)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EquipmentModel[];
    },
  });
}

/** Código de erro com o modelo (e a marca do modelo) hidratados. */
export interface EquipmentErrorCodeWithModel extends EquipmentErrorCode {
  model?:
    | (Pick<
        EquipmentModel,
        'id' | 'name' | 'code' | 'image_url' | 'manual_url' | 'refrigerant' | 'brand_id'
      > & {
        brand?: Pick<EquipmentBrand, 'id' | 'name' | 'logo_url'> | null;
      })
    | null;
}

/**
 * Códigos de erro de UM domínio (AC, linha branca…) com modelo + marca hidratados.
 * Usado pela busca global client-side (agrupamento por `code`).
 *
 * IMPORTANTE: filtra por `equipment_models.domain` via embed `!inner`. Sem isso a
 * query trazia TODOS os ~1.5k códigos do catálogo de uma vez e o PostgREST cortava
 * silenciosamente em ~1000 linhas (ordenadas por `code`) — derrubando boa parte dos
 * códigos de linha branca da busca. Escopando por domínio, cada conjunto fica bem
 * menor (linha branca ~100) e nada some. `.limit(5000)` é folga extra de segurança.
 */
export function useAllErrorCodesWithModel(domain: string = 'ar_condicionado') {
  return useQuery({
    queryKey: ['equipment-catalog', 'all-error-codes', domain],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_error_codes')
        .select(
          'id, model_id, code, title, description, diagnosis, solution, component, created_at, model:equipment_models!inner(id, name, code, image_url, manual_url, refrigerant, brand_id, domain, brand:equipment_brands(id, name, logo_url))',
        )
        .eq('model.domain', domain)
        .order('code', { ascending: true })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as EquipmentErrorCodeWithModel[];
    },
  });
}

/** Ficha técnica de um compressor (1:1 com o modelo). Gás reusa model.refrigerant. */
export interface CompressorSpec {
  model_id: string;
  hp: string | null;
  capacidade_btu: string | null;
  aplicacao: string | null;
  tensao: string | null;
  frequencia: string | null;
  deslocamento_cm3: string | null;
  rla: number | null;
  lra: number | null;
  capacitor_trabalho: string | null;
  capacitor_partida: string | null;
  rele_protetor: string | null;
  oleo: string | null;
  conexoes: string | null;
  equivalencias: string | null;
  observacoes: string | null;
  created_at: string;
}

/** Ficha técnica do compressor de um modelo. Null quando ainda não cadastrada. */
export function useCompressorSpec(modelId: string | null | undefined) {
  return useQuery({
    queryKey: ['equipment-catalog', 'compressor-spec', modelId],
    enabled: !!modelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compressor_specs')
        .select('*')
        .eq('model_id', modelId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CompressorSpec | null;
    },
  });
}

/** Configuração de um controle remoto (1:1 com o modelo). */
export interface RemoteConfig {
  model_id: string;
  instrucoes: string | null;
  codigo_universal: string | null;
  reset: string | null;
  desbloqueio: string | null;
  modos: string | null;
  observacoes: string | null;
  created_at: string;
}

/** Configuração do controle remoto de um modelo. Null quando ainda não cadastrada. */
export function useRemoteConfig(modelId: string | null | undefined) {
  return useQuery({
    queryKey: ['equipment-catalog', 'remote-config', modelId],
    enabled: !!modelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('remote_configs')
        .select('*')
        .eq('model_id', modelId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as RemoteConfig | null;
    },
  });
}

/**
 * Conjunto de IDs de modelos (de um domínio) que têm ≥1 código de erro.
 * Usado pelos cards pra decidir se mostram a ação "Códigos de erro": nem todo
 * modelo de linha branca tem códigos cadastrados (geladeira simples, tanquinho),
 * e abrir uma tela vazia seria um beco sem saída.
 *
 * Faz 2 queries enxutas (só ids): modelos do domínio + códigos cujo model_id
 * cai nesse conjunto. Catálogo é pequeno; sem paginação.
 */
export function useModelIdsWithErrorCodes(domain: string = 'ar_condicionado') {
  return useQuery({
    queryKey: ['equipment-catalog', 'model-ids-with-codes', domain],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: modelRows, error: modelErr } = await supabase
        .from('equipment_models')
        .select('id')
        .eq('domain', domain);
      if (modelErr) throw modelErr;

      const modelIds = (modelRows ?? []).map((r) => r.id);
      if (modelIds.length === 0) return new Set<string>();

      const { data: codeRows, error: codeErr } = await supabase
        .from('equipment_error_codes')
        .select('model_id')
        .in('model_id', modelIds);
      if (codeErr) throw codeErr;

      return new Set<string>((codeRows ?? []).map((r) => r.model_id));
    },
  });
}

/** Todos os códigos de erro de um modelo (o filtro por code é client-side). */
export function useEquipmentErrorCodes(modelId: string | null | undefined) {
  return useQuery({
    queryKey: ['equipment-catalog', 'error-codes', modelId],
    enabled: !!modelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_error_codes')
        .select('id, model_id, code, title, description, diagnosis, solution, component, created_at')
        .eq('model_id', modelId as string)
        .order('code', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EquipmentErrorCode[];
    },
  });
}
