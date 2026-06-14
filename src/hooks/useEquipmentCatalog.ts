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

export interface EquipmentModel {
  id: string;
  brand_id: string;
  category_id: string | null;
  name: string;
  code: string | null;
  image_url: string | null;
  manual_url: string | null;
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

/** Lista todas as marcas, ordenadas por `sort` (e nome como desempate). */
export function useEquipmentBrands() {
  return useQuery({
    queryKey: ['equipment-catalog', 'brands'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_brands')
        .select('id, name, slug, logo_url, sort, created_at')
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

/** Modelos de uma marca, ordenados por nome. */
export function useEquipmentModelsByBrand(brandId: string | null | undefined) {
  return useQuery({
    queryKey: ['equipment-catalog', 'models-by-brand', brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_models')
        .select(
          'id, brand_id, category_id, name, code, image_url, manual_url, created_at, category:equipment_model_categories(id, name)',
        )
        .eq('brand_id', brandId as string)
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
          'id, brand_id, category_id, name, code, image_url, manual_url, created_at, brand:equipment_brands(id, name, logo_url), category:equipment_model_categories(id, name)',
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
          'id, brand_id, category_id, name, code, image_url, manual_url, created_at, brand:equipment_brands(id, name, logo_url), category:equipment_model_categories(id, name)',
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
 * TODOS os modelos do catálogo com a marca hidratada.
 * Usado pela busca global client-side (catálogo é pequeno; sem paginação).
 */
export function useAllModelsWithBrand() {
  return useQuery({
    queryKey: ['equipment-catalog', 'all-models'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_models')
        .select(
          'id, brand_id, category_id, name, code, image_url, manual_url, created_at, brand:equipment_brands(id, name, logo_url), category:equipment_model_categories(id, name)',
        )
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EquipmentModel[];
    },
  });
}

/** Código de erro com o modelo (e a marca do modelo) hidratados. */
export interface EquipmentErrorCodeWithModel extends EquipmentErrorCode {
  model?:
    | (Pick<EquipmentModel, 'id' | 'name' | 'code' | 'image_url' | 'manual_url' | 'brand_id'> & {
        brand?: Pick<EquipmentBrand, 'id' | 'name' | 'logo_url'> | null;
      })
    | null;
}

/**
 * TODOS os códigos de erro do catálogo com o modelo + marca hidratados.
 * Usado pela busca global client-side (agrupamento por `code`).
 */
export function useAllErrorCodesWithModel() {
  return useQuery({
    queryKey: ['equipment-catalog', 'all-error-codes'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_error_codes')
        .select(
          'id, model_id, code, title, description, diagnosis, solution, component, created_at, model:equipment_models(id, name, code, image_url, manual_url, brand_id, brand:equipment_brands(id, name, logo_url))',
        )
        .order('code', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EquipmentErrorCodeWithModel[];
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
