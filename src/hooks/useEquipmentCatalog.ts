import { withEquipmentAssetReferences } from '@/data/equipmentCatalogAssets';
import { curatedEquipmentModel, curatedEquipmentModels, mergeCuratedEquipmentModels, type CatalogModelProvenance } from '@/data/curatedEquipmentModels';
import { readCatalogPages } from '@/lib/catalogPagination';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getEquipmentCodeReference, mergeEquipmentErrorCodeReferences } from '@/data/equipmentErrorCodeReferences';

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
  /** JSON de traduções: {"en":{"name":"..."},"es":{...},"fr":{...}} */
  i18n?: import('@/integrations/supabase/types').Json | null;
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
  /**
   * Tipo do manual/documento ligado ao modelo: 'instalacao' | 'servico' |
   * 'usuario' | 'guia' | 'datasheet'. Null/desconhecido cai no rótulo genérico.
   * Usado pra rotular o botão de download (ver `rotuloManual`).
   */
  manual_type?: string | null;
  /** Gás refrigerante do modelo (ex.: 'R-32', 'R-410A'); null quando não cadastrado. */
  refrigerant: string | null;
  /** Consumo mensal OFICIAL (Procel/INMETRO) em kWh/mês; null quando não cadastrado. */
  consumo_kwh_mes: number | null;
  /** Potência nominal em W; base da estimativa de consumo quando não há valor oficial. Null quando não cadastrado. */
  potencia_w: number | null;
  /** Domínio do catálogo a que o modelo pertence. */
  domain: string;
  /**
   * FK self-ref para o compressor TÍPICO desta máquina (AC/linha branca),
   * ligado por capacidade/BTU. É referência, não o compressor exato. Null quando
   * não mapeado.
   */
  compressor_model_id?: string | null;
  created_at: string;
  /** JSON de traduções: {"en":{"name":"..."},"es":{...},"fr":{...}} */
  i18n?: import('@/integrations/supabase/types').Json | null;
  /** Hidratado nas queries que fazem join com a marca. */
  brand?: Pick<EquipmentBrand, 'id' | 'name' | 'logo_url'> | null;
  /** Hidratado nas queries que fazem join com a categoria (tipo do equipamento). */
  category?: EquipmentModelCategory | null;
  /** Procedência de modelo conferido no catálogo oficial; não é dado de cliente. */
  catalog_reference?: CatalogModelProvenance;
}

/**
 * Tipo do mapa de traduções de tipos de manual, compatível com
 * `MESSAGES[locale].app.technicianTools.catalog.manualTypes`.
 */
export interface ManualTypeLabels {
  instalacao: string;
  servico: string;
  usuario: string;
  guia: string;
  datasheet: string;
  default: string;
  aplicacao?: string;
  catalogo_tecnico?: string;
  ficha_eletrica?: string;
  manual?: string;
}

/**
 * Rótulo amigável do botão de download conforme o `manual_type`.
 * Quando `labels` é passado (objeto de tradução), usa-o; senão cai no pt-br
 * hardcoded para retrocompatibilidade. Tipos desconhecidos/null → `labels.default`.
 */
export function rotuloManual(
  manualType: string | null | undefined,
  labels?: ManualTypeLabels,
): string {
  const l: ManualTypeLabels = labels ?? {
    instalacao: 'Manual de Instalação',
    servico: 'Manual de Serviço',
    usuario: 'Manual do Usuário',
    guia: 'Guia Rápido',
    datasheet: 'Datasheet',
    default: 'Baixar Manual',
  };
  switch (manualType) {
    case 'instalacao': return l.instalacao;
    case 'servico':    return l.servico;
    case 'usuario':    return l.usuario;
    case 'guia':       return l.guia;
    case 'datasheet':  return l.datasheet;
    case 'aplicacao': return l.aplicacao ?? 'Manual de aplicação';
    case 'catalogo_tecnico': return l.catalogo_tecnico ?? 'Catálogo técnico';
    case 'ficha_eletrica': return l.ficha_eletrica ?? 'Ficha elétrica';
    case 'manual': return l.manual ?? l.default;
    default:           return l.default;
  }
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
  /** JSON de traduções: {"en":{"title","description","diagnosis","solution","component"},...} */
  i18n?: import('@/integrations/supabase/types').Json | null;
  created_at: string;
  /** Código complementar de manual validado; não foi gravado no catálogo remoto. */
  reference_id?: string;
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
      const modelRows = await readCatalogPages((from, to) => supabase
        .from('equipment_models')
        .select('id, brand_id')
        .eq('domain', domain).order('id').range(from, to));

      const brandIds = Array.from(
        new Set([...modelRows.map((r) => r.brand_id), ...curatedEquipmentModels({ domain }).map(model => model.brand_id)].filter(Boolean)),
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
      const data = await readCatalogPages((from, to) => supabase
        .from('equipment_models')
        .select(
          'id, brand_id, category_id, name, code, image_url, manual_url, manual_type, refrigerant, consumo_kwh_mes, potencia_w, domain, compressor_model_id, i18n, created_at, category:equipment_model_categories(id, name, i18n)',
        )
        .eq('brand_id', brandId as string)
        .eq('domain', domain)
        .order('name', { ascending: true }).order('id').range(from, to));
      return mergeCuratedEquipmentModels(data as EquipmentModel[], { brandId: brandId as string, domain }).map(model => withEquipmentAssetReferences(model));
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
          'id, brand_id, category_id, name, code, image_url, manual_url, manual_type, refrigerant, consumo_kwh_mes, potencia_w, domain, compressor_model_id, i18n, created_at, brand:equipment_brands(id, name, logo_url), category:equipment_model_categories(id, name, i18n)',
        )
        .eq('id', modelId as string)
        .maybeSingle();
      if (error) throw error;
      const model = data ? mergeCuratedEquipmentModels([data as EquipmentModel]).find(entry => entry.id === data.id) : curatedEquipmentModel(modelId);
      return model ? withEquipmentAssetReferences(model) : null;
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
          'id, brand_id, category_id, name, code, image_url, manual_url, manual_type, refrigerant, domain, i18n, created_at, brand:equipment_brands(id, name, logo_url), category:equipment_model_categories(id, name, i18n)',
        )
        .ilike('code', `%${trimmed}%`)
        .order('name', { ascending: true })
        .limit(50);
      if (error) throw error;
      return mergeCuratedEquipmentModels((data ?? []) as EquipmentModel[], { term: trimmed }).map(model => withEquipmentAssetReferences(model));
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
      const data = await readCatalogPages((from, to) => supabase
        .from('equipment_models')
        .select(
          'id, brand_id, category_id, name, code, image_url, manual_url, manual_type, refrigerant, consumo_kwh_mes, potencia_w, domain, compressor_model_id, i18n, created_at, brand:equipment_brands(id, name, logo_url), category:equipment_model_categories(id, name, i18n)',
        )
        .eq('domain', domain)
        .order('name', { ascending: true }).order('id').range(from, to));
      return mergeCuratedEquipmentModels(data as EquipmentModel[], { domain }).map(model => withEquipmentAssetReferences(model));
    },
  });
}

/** Código de erro com o modelo (e a marca do modelo) hidratados. */
export interface EquipmentErrorCodeWithModel extends EquipmentErrorCode {
  model?:
    | (Pick<
        EquipmentModel,
        'id' | 'name' | 'code' | 'image_url' | 'manual_url' | 'refrigerant' | 'brand_id' | 'domain'
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
      const data = await readCatalogPages((from, to) => supabase
        .from('equipment_error_codes')
        .select(
          'id, model_id, code, title, description, diagnosis, solution, component, i18n, created_at, model:equipment_models!inner(id, name, code, image_url, manual_url, refrigerant, brand_id, domain, brand:equipment_brands(id, name, logo_url))',
        )
        .eq('model.domain', domain)
        .order('code', { ascending: true }).order('id').range(from, to));
      const existing = ((data ?? []) as EquipmentErrorCodeWithModel[]).map(entry => ({ ...entry, model: entry.model ? withEquipmentAssetReferences(entry.model) : entry.model }));
      // A busca global precisa encontrar os mesmos códigos disponíveis no detalhe.
      const models: NonNullable<EquipmentErrorCodeWithModel['model']>[] | null = await readCatalogPages<NonNullable<EquipmentErrorCodeWithModel['model']>>((from, to) => supabase
        .from('equipment_models')
        .select('id, name, code, image_url, manual_url, refrigerant, brand_id, domain, brand:equipment_brands(id, name, logo_url)')
        .eq('domain', domain).order('id').range(from, to)).catch(() => null);
      // Falha na leitura auxiliar não deve esconder códigos já cadastrados.
      if (!models) return existing;
      const supplemental: EquipmentErrorCodeWithModel[] = [];
      const existingByModel = new Map<string, EquipmentErrorCode[]>();
      for (const entry of existing) {
        const group = existingByModel.get(entry.model_id) ?? [];
        group.push(entry);
        existingByModel.set(entry.model_id, group);
      }
      for (const rawModel of mergeCuratedEquipmentModels<NonNullable<EquipmentErrorCodeWithModel['model']>>(models, { domain })) {
        const model = withEquipmentAssetReferences(rawModel);
        if (!getEquipmentCodeReference(model)) continue;
        const modelExisting = existingByModel.get(model.id) ?? [];
        const merged = mergeEquipmentErrorCodeReferences(modelExisting, model);
        supplemental.push(...merged.filter((entry) => !modelExisting.some((saved) => saved.code.toUpperCase().replace(/\s/g, '') === entry.code.toUpperCase().replace(/\s/g, '')))
          .map((entry) => ({ ...entry, model })));
      }
      return [...existing, ...supplemental].sort((a, b) => a.code.localeCompare(b.code));
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
      const modelRows = await readCatalogPages((from, to) => supabase
        .from('equipment_models')
        .select('id, brand_id, code, domain, brand:equipment_brands(name)')
        .eq('domain', domain).order('id').range(from, to));
      const models = mergeCuratedEquipmentModels(modelRows, { domain });
      if (models.length === 0) return new Set<string>();

      const codeRows = await readCatalogPages((from, to) => supabase
        .from('equipment_error_codes')
        .select('id, model_id, model:equipment_models!inner(domain)')
        .eq('model.domain', domain).order('id').range(from, to));

      return new Set<string>([
        ...(codeRows ?? []).map((r) => r.model_id),
        ...models.filter((model) => getEquipmentCodeReference(model)).map((model) => model.id),
      ]);
    },
  });
}

/**
 * Fluido refrigerante (gás) do catálogo GLOBAL — tabela `refrigerant_gases`.
 * É consulta de campo (não confundir com o `refrigerant` textual dos modelos de AC).
 * `ficha_url` é sempre o PDF NOSSO (Storage); `guia_oficial_url` é o PDF do
 * fabricante quando existir. `cor` é o hex da bolinha do gás (régua: gás sempre
 * com cor) — null cai num cinza neutro na UI.
 */
export interface RefrigerantGas {
  id: string;
  code: string;
  name: string | null;
  composicao: string | null;
  tipo: string | null;
  gwp: number | null;
  odp: number | null;
  ponto_ebulicao_c: number | null;
  glide_k: number | null;
  classe_seguranca: string | null;
  oleo: string | null;
  substitui: string | null;
  aplicacao: string | null;
  cor: string | null;
  observacoes: string | null;
  /** PDF NOSSO — sempre presente. */
  ficha_url: string | null;
  /** PDF oficial do fabricante — pode ser null. */
  guia_oficial_url: string | null;
  sort: number | null;
}

/**
 * Catálogo GLOBAL de fluidos refrigerantes, ordenado por `sort`.
 * Leitura pra qualquer técnico autenticado (RLS authenticated); nada de mutação.
 */
export function useRefrigerantGases() {
  return useQuery({
    queryKey: ['equipment-catalog', 'refrigerant-gases'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('refrigerant_gases')
        .select('*')
        .order('sort', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as RefrigerantGas[];
    },
  });
}

/** Todos os códigos de erro de um modelo (o filtro por code é client-side). */
export function useEquipmentErrorCodes(modelId: string | null | undefined) {
  return useQuery({
    queryKey: ['equipment-catalog', 'error-codes', modelId],
    enabled: !!modelId,
    queryFn: async () => {
      const [{ data, error }, { data: model, error: modelError }] = await Promise.all([
        supabase.from('equipment_error_codes')
          .select('id, model_id, code, title, description, diagnosis, solution, component, i18n, created_at')
          .eq('model_id', modelId as string).order('code', { ascending: true }),
        supabase.from('equipment_models')
          .select('id, code, domain, brand:equipment_brands(name)')
          .eq('id', modelId as string).maybeSingle(),
      ]);
      if (error) throw error;
      const existing = (data ?? []) as EquipmentErrorCode[];
      const identity = model ?? curatedEquipmentModel(modelId);
      if (modelError && !identity) return existing;
      return identity ? mergeEquipmentErrorCodeReferences(existing, identity) : existing;
    },
  });
}
