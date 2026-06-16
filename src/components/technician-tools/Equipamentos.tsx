import { useEffect, useMemo, useState, type ReactNode, type ComponentType } from 'react';
import {
  ArrowLeft,
  Boxes,
  Search,
  Loader2,
  Download,
  AlertCircle,
  ChevronRight,
  PackageSearch,
  Star,
  SlidersHorizontal,
  AirVent,
  Refrigerator,
  Cpu,
  Settings2,
  FileText,
  Zap,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CompressorGlyph, RemoteGlyph } from '@/components/icons/MenuIcons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import {
  useEquipmentBrands,
  useEquipmentModel,
  useEquipmentModelsByBrand,
  useEquipmentErrorCodes,
  useModelIdsWithErrorCodes,
  useAllModelsWithBrand,
  useAllErrorCodesWithModel,
  type EquipmentBrand,
  type EquipmentModel,
  type EquipmentDomain,
} from '@/hooks/useEquipmentCatalog';
import { CompressorFicha } from './CompressorFicha';
import { RemoteConfig } from './RemoteConfig';
import { CatalogImage } from './CatalogImage';
import {
  registrarModeloRecente,
  isModeloFavorito,
  toggleModeloFavorito,
  useToolHistory,
} from '@/lib/technicianToolsHistory';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel';
import { getRefrigerante, REFRIGERANTES } from '@/lib/refrigerantes';
import { RefrigeranteInflamavel } from '@/components/technician-tools/RefrigeranteInflamavel';
import { idealForeground } from '@/lib/colorContrast';

/**
 * Marcas mais conhecidas de COMPRESSORES, em ordem de prioridade.
 * No domínio 'compressor' essas marcas aparecem primeiro na lista (nesta ordem);
 * as demais seguem a ordenação padrão do catálogo (sort/name) como desempate.
 * Comparação por nome normalizado (minúsculo, sem acento).
 */
const MARCAS_PRIORITARIAS_COMPRESSOR = ['gree', 'embraco', 'lg', 'samsung'];

/** Marcas que vêm primeiro no domínio 'linha_branca' (mesma lógica do compressor). */
const MARCAS_PRIORITARIAS_LINHA_BRANCA = ['brastemp', 'consul', 'electrolux', 'lg', 'samsung'];

/** Normaliza texto pra busca: minúsculo + sem acento. */
function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Ordena as marcas de um domínio para exibição (grid e carrossel).
 * Nos domínios 'compressor' e 'linha_branca' as marcas mais conhecidas vêm
 * primeiro, na ordem de MARCAS_PRIORITARIAS_COMPRESSOR / MARCAS_PRIORITARIAS_LINHA_BRANCA;
 * as demais preservam a ordem que veio do hook (sort/name) como desempate.
 * Nos outros domínios, ordem inalterada.
 * Sort estável: itens com mesma prioridade mantêm a ordem original.
 */
function ordenarMarcas(brands: EquipmentBrand[], domain: EquipmentDomain): EquipmentBrand[] {
  const prioritarias =
    domain === 'compressor'
      ? MARCAS_PRIORITARIAS_COMPRESSOR
      : domain === 'linha_branca'
        ? MARCAS_PRIORITARIAS_LINHA_BRANCA
        : null;
  if (!prioritarias) return brands;
  const prioridade = (b: EquipmentBrand) => {
    const idx = prioritarias.indexOf(norm(b.name));
    return idx === -1 ? prioritarias.length : idx;
  };
  return brands
    .map((b, i) => ({ b, i }))
    .sort((a, c) => prioridade(a.b) - prioridade(c.b) || a.i - c.i)
    .map((x) => x.b);
}

/**
 * Extrai a potência (BTUs) do nome do modelo, quando presente.
 * Ex: "Cassete 60.000 BTUs Inverter" → "60.000 BTUs". Retorna null se não achar.
 */
function extrairBtu(name: string): string | null {
  const m = name.match(/(\d{1,3}(?:[.\s]\d{3})+|\d{4,6})\s*BTU?s?/i);
  if (!m) return null;
  const num = m[1].replace(/\s/g, '.');
  return `${num} BTUs`;
}

/**
 * Extrai a potência (BTUs) como NÚMERO puro do nome do modelo.
 * Ex: "Cassete 60.000 BTUs Inverter" → 60000. Retorna null se não achar.
 * Reaproveita a mesma regex de `extrairBtu`.
 */
function btuNumero(name: string): number | null {
  const m = name.match(/(\d{1,3}(?:[.\s]\d{3})+|\d{4,6})\s*BTU?s?/i);
  if (!m) return null;
  const digits = m[1].replace(/[.\s]/g, '');
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/** Formata um número de BTU para exibição. Ex: 9000 → "9.000 BTUs". */
function formatarBtu(n: number): string {
  return `${n.toLocaleString('pt-BR')} BTUs`;
}

/**
 * Ordena modelos por potência (BTU) crescente, de forma ESTÁVEL.
 * Modelos sem BTU detectável vão pro fim, mantendo a ordem relativa original.
 */
function ordenarPorBtu<T extends { name: string }>(modelos: T[]): T[] {
  return modelos
    .map((m, i) => ({ m, i, btu: btuNumero(m.name) }))
    .sort((a, b) => {
      if (a.btu == null && b.btu == null) return a.i - b.i;
      if (a.btu == null) return 1;
      if (b.btu == null) return -1;
      if (a.btu !== b.btu) return a.btu - b.btu;
      return a.i - b.i;
    })
    .map((x) => x.m);
}

/** Valor usado como "gás não definido" no filtro de refrigerante (sentinela). */
const GAS_SEM_DEFINIR = '__sem_gas__';

/**
 * Deriva as opções do filtro de gás refrigerante a partir de uma lista de modelos.
 * - Gases distintos presentes em `refrigerant` (string não-vazia), ordenados pela
 *   ordem canônica do catálogo REFRIGERANTES (gases conhecidos primeiro) e, como
 *   desempate, alfabético — ordenação estável independente dos dados.
 * - Cada opção carrega a cor do gás (bolinha) e o id pra resolver a chama (régua).
 * - Se algum modelo está sem gás definido, adiciona a opção "Sem gás definido" no fim.
 * Só faz sentido no domínio ar_condicionado.
 */
function gasOptionsFromModels(
  models: { refrigerant?: string | null }[],
): { value: string; label: string; color?: string; refrigId?: string }[] {
  const gases = new Set<string>();
  let temSemGas = false;
  for (const m of models) {
    const g = (m.refrigerant ?? '').trim();
    if (g) gases.add(g);
    else temSemGas = true;
  }

  const ordemCanonica = REFRIGERANTES.map((r) => r.id);
  const prioridade = (g: string) => {
    const idx = ordemCanonica.indexOf(g);
    return idx === -1 ? ordemCanonica.length : idx;
  };

  const opcoes = Array.from(gases)
    .sort((a, b) => prioridade(a) - prioridade(b) || a.localeCompare(b, 'pt-BR'))
    .map((g) => {
      const refrig = getRefrigerante(g);
      return {
        value: g,
        label: refrig?.nome ?? g,
        color: refrig?.cor,
        refrigId: refrig ? g : undefined,
      };
    });

  if (temSemGas) {
    opcoes.push({ value: GAS_SEM_DEFINIR, label: 'Sem gás definido', color: undefined, refrigId: undefined });
  }
  return opcoes;
}

/** Predicado do filtro de gás: vazio = todos; senão casa o `refrigerant` do modelo. */
function modeloCasaGas(model: { refrigerant?: string | null }, selectedGases: string[]): boolean {
  if (selectedGases.length === 0) return true;
  const g = (model.refrigerant ?? '').trim();
  if (!g) return selectedGases.includes(GAS_SEM_DEFINIR);
  return selectedGases.includes(g);
}

/** Remove caracteres inválidos de nome de arquivo e colapsa espaços. */
function sanitizarNomeArquivo(nome: string): string {
  return nome
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Baixa o manual (PDF) salvando com nome legível em vez do UUID do storage.
 * Fallback para window.open se o fetch do blob falhar (ex: CORS).
 */
async function baixarManual(url: string, nome: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(u);
  } catch {
    window.open(url, '_blank');
  }
}

/** Domínios do catálogo, na ordem das sub-abas (cada um com ícone). */
const DOMAIN_OPTIONS: { value: EquipmentDomain; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { value: 'ar_condicionado', label: 'Ar Condicionado', icon: AirVent },
  { value: 'compressor', label: 'Compressores', icon: CompressorGlyph },
  { value: 'linha_branca', label: 'Linha Branca', icon: Refrigerator },
  { value: 'controle_remoto', label: 'Controles Remotos', icon: RemoteGlyph },
];

/**
 * Título da página por domínio ativo: "Catálogo - <label do domínio>".
 * Reusa o label de DOMAIN_OPTIONS pra não duplicar texto.
 */
function tituloCatalogo(domain: EquipmentDomain): string {
  const label = DOMAIN_OPTIONS.find((o) => o.value === domain)?.label ?? 'Equipamentos';
  return `Catálogo - ${label}`;
}

type View =
  | { kind: 'brands' }
  | { kind: 'models'; brand: EquipmentBrand }
  | { kind: 'errors'; model: EquipmentModel; initialCode?: string; brand?: EquipmentBrand }
  | { kind: 'compressor'; model: EquipmentModel; brand?: EquipmentBrand }
  | { kind: 'remote'; model: EquipmentModel; brand?: EquipmentBrand };

/**
 * Seletor de domínio do catálogo — abas com sublinhado (mesmo estilo das subabas
 * do Superaquecimento), roláveis horizontalmente no mobile. Cada domínio tem ícone.
 */
function DomainSelector({
  value,
  onChange,
}: {
  value: EquipmentDomain;
  onChange: (d: EquipmentDomain) => void;
}) {
  return (
    <div className="flex gap-1 border-b overflow-x-auto no-scrollbar">
      {DOMAIN_OPTIONS.map((o) => {
        const Icon = o.icon;
        const ativo = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={ativo}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap shrink-0',
              ativo
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Catálogo de equipamentos de ar-condicionado para consulta em campo.
 * Navegação interna por estado (igual padrão da Conversão): marcas → modelos →
 * códigos de erro. A busca do topo é GLOBAL (marca, modelo, código de erro) e
 * é resolvida client-side dentro da própria tela inicial.
 */
export function Equipamentos({ modeloInicialId }: { modeloInicialId?: string }) {
  const [domain, setDomain] = useState<EquipmentDomain>('ar_condicionado');
  const [view, setView] = useState<View>({ kind: 'brands' });

  // Trocar de domínio reseta a navegação interna pra lista de marcas daquele domínio.
  const onChangeDomain = (d: EquipmentDomain) => {
    setDomain(d);
    setView({ kind: 'brands' });
  };

  // Deep-link: abre direto na tela de detalhe do modelo recebido (Recentes/Favoritos).
  // O deep-link atual é só de AC (códigos de erro); mantém o comportamento.
  const { data: modeloDeepLink, isLoading: loadingDeepLink } = useEquipmentModel(modeloInicialId);
  useEffect(() => {
    if (modeloDeepLink) setView({ kind: 'errors', model: modeloDeepLink });
  }, [modeloDeepLink]);

  // Enquanto resolve o deep-link, mostra loading em vez de piscar a lista de marcas.
  if (modeloInicialId && view.kind === 'brands' && loadingDeepLink) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Detalhe abre direto pelo componente do domínio do modelo (a partir da lista).
  // Cada tela tem seu próprio header com voltar; o seletor de domínio some.
  if (view.kind === 'models') {
    return (
      <ModelosList
        brand={view.brand}
        domain={domain}
        onBack={() => setView({ kind: 'brands' })}
        onSelectBrand={(b) => setView({ kind: 'models', brand: b })}
        onSelectDetail={(model) => setView({ kind: detailKind(domain), model, brand: view.brand })}
      />
    );
  }

  if (view.kind === 'errors') {
    const originBrand = view.brand;
    return (
      <CodigosErro
        model={view.model}
        initialCode={view.initialCode}
        onBack={() =>
          setView(originBrand ? { kind: 'models', brand: originBrand } : { kind: 'brands' })
        }
      />
    );
  }

  if (view.kind === 'compressor') {
    const originBrand = view.brand;
    return (
      <CompressorFicha
        model={view.model}
        onBack={() =>
          setView(originBrand ? { kind: 'models', brand: originBrand } : { kind: 'brands' })
        }
      />
    );
  }

  if (view.kind === 'remote') {
    const originBrand = view.brand;
    return (
      <RemoteConfig
        model={view.model}
        onBack={() =>
          setView(originBrand ? { kind: 'models', brand: originBrand } : { kind: 'brands' })
        }
      />
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <DomainSelector value={domain} onChange={onChangeDomain} />
      {domain === 'controle_remoto' ? (
        <RemotesList
          onSelectDetail={(model) => setView({ kind: 'remote', model })}
        />
      ) : (
        <BrandsList
          domain={domain}
          onSelectBrand={(brand) => setView({ kind: 'models', brand })}
          onSelectModelDetail={(model) => setView({ kind: detailKind(domain), model })}
          onSelectModelErrors={(model, initialCode) =>
            setView({ kind: 'errors', model, initialCode })
          }
        />
      )}
    </div>
  );
}

/** Qual tela de detalhe abrir ao tocar a ação primária do card, por domínio. */
function detailKind(domain: EquipmentDomain): 'errors' | 'compressor' | 'remote' {
  if (domain === 'compressor') return 'compressor';
  if (domain === 'controle_remoto') return 'remote';
  // ar_condicionado e linha_branca usam a tela de códigos de erro.
  return 'errors';
}

/* ------------------------------------------------------------------ */
/* Tela 1 — marcas + busca por código de modelo                        */
/* ------------------------------------------------------------------ */

/** Uma máquina onde um dado código de erro ocorre. */
interface CodeOccurrence {
  errorCodeId: string;
  modelId: string;
  modelName: string;
  brandName: string;
  /** Modelo hidratado (com marca) pra navegar direto pra tela de erros. */
  model: EquipmentModel;
}

/** Um código de erro agrupado: aparece uma vez, com as máquinas onde ocorre. */
interface GroupedErrorCode {
  code: string;
  title: string | null;
  occurrences: CodeOccurrence[];
}

function BrandsList({
  domain,
  onSelectBrand,
  onSelectModelDetail,
  onSelectModelErrors,
}: {
  domain: EquipmentDomain;
  onSelectBrand: (brand: EquipmentBrand) => void;
  /** Ação primária do card (erros / ficha / configurar, conforme o domínio). */
  onSelectModelDetail: (model: EquipmentModel) => void;
  onSelectModelErrors: (model: EquipmentModel, initialCode?: string) => void;
}) {
  const { data: brands = [], isLoading } = useEquipmentBrands(domain);

  // Ordenação compartilhada com o carrossel da tela de modelos (ordenarMarcas):
  // no domínio Compressores as marcas mais conhecidas vêm primeiro.
  const brandsOrdenadas = useMemo(() => ordenarMarcas(brands, domain), [brands, domain]);

  const { data: allModels = [], isLoading: loadingModels } = useAllModelsWithBrand(domain);
  // Códigos de erro escopados ao domínio ativo (AC, linha branca…). Antes a busca
  // puxava o catálogo inteiro e o PostgREST truncava em ~1000 linhas, sumindo com
  // os códigos de linha branca; escopar por domínio resolve e espelha o AC.
  const { data: allErrorCodes = [], isLoading: loadingCodes } = useAllErrorCodesWithModel(domain);
  // IDs com código de erro — usado só na linha branca pra esconder a ação
  // "Códigos de erro" em modelos sem códigos.
  const { data: modelIdsWithCodes } = useModelIdsWithErrorCodes(domain);

  // A busca por código de erro só faz sentido nos domínios que têm códigos
  // (AC e linha branca). Nos demais, só busca de marca/equipamento.
  const errorSearchEnabled = domain === 'ar_condicionado' || domain === 'linha_branca';
  // IDs de modelos do domínio atual — restringe os resultados de código de erro
  // (allErrorCodes é global) ao domínio selecionado.
  const domainModelIds = useMemo(() => new Set(allModels.map((m) => m.id)), [allModels]);

  const [termoRaw, setTermoRaw] = useState('');
  const [termo, setTermo] = useState('');

  // Debounce leve da busca.
  useEffect(() => {
    const id = setTimeout(() => setTermo(termoRaw.trim()), 180);
    return () => clearTimeout(id);
  }, [termoRaw]);

  // Filtros (só valem quando a busca está vazia — busca é universal).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedBtus, setSelectedBtus] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  // Filtro de gás refrigerante: só no domínio ar_condicionado.
  const [selectedGases, setSelectedGases] = useState<string[]>([]);
  const gasFilterEnabled = domain === 'ar_condicionado';
  // Trocar de domínio limpa a seleção de gás (filtro não existe fora do AC).
  useEffect(() => {
    if (!gasFilterEnabled) setSelectedGases([]);
  }, [gasFilterEnabled]);

  const q = norm(termo);
  const searching = q.length > 0;

  // Opções de Potência derivadas de TODOS os modelos (BTU distintos, crescente).
  const btuOptions = useMemo(() => {
    const set = new Set<number>();
    for (const m of allModels) {
      const n = btuNumero(m.name);
      if (n != null) set.add(n);
    }
    return Array.from(set)
      .sort((a, b) => a - b)
      .map((n) => ({ value: String(n), label: formatarBtu(n) }));
  }, [allModels]);

  // Opções de Tipo derivadas das categorias presentes (alfabético).
  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of allModels) {
      const name = m.category?.name;
      if (name) set.add(name);
    }
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((name) => ({ value: name, label: name }));
  }, [allModels]);

  // Opções de Gás refrigerante (só no ar_condicionado), derivadas dos modelos.
  const gasOptions = useMemo(
    () => (gasFilterEnabled ? gasOptionsFromModels(allModels) : []),
    [allModels, gasFilterEnabled],
  );

  const activeFilterCount =
    selectedBtus.length + selectedTypes.length + (gasFilterEnabled ? selectedGases.length : 0);
  const filtering = !searching && activeFilterCount > 0;

  // Modelos que casam com os filtros ativos (todas as marcas).
  const filteredModels = useMemo(() => {
    if (!filtering) return [];
    const matched = allModels.filter(
      (m) =>
        (selectedBtus.length === 0 || selectedBtus.includes(String(btuNumero(m.name)))) &&
        (selectedTypes.length === 0 || selectedTypes.includes(m.category?.name ?? '')) &&
        (!gasFilterEnabled || modeloCasaGas(m, selectedGases)),
    );
    return ordenarPorBtu(matched);
  }, [allModels, filtering, selectedBtus, selectedTypes, selectedGases, gasFilterEnabled]);

  const limparFiltros = () => {
    setSelectedBtus([]);
    setSelectedTypes([]);
    setSelectedGases([]);
  };

  // Modelos que casam por nome do modelo, código do modelo OU nome da marca.
  const modelHits = useMemo(() => {
    if (!searching) return [];
    return allModels.filter((m) => {
      const brandName = m.brand?.name ?? '';
      return (
        norm(m.name).includes(q) ||
        norm(m.code).includes(q) ||
        norm(brandName).includes(q)
      );
    });
  }, [allModels, q, searching]);

  // Códigos de erro que casam por code/título/descrição, agrupados por `code`.
  // Só nos domínios com códigos, e restritos aos modelos do domínio atual.
  const codeGroups = useMemo<GroupedErrorCode[]>(() => {
    if (!searching || !errorSearchEnabled) return [];
    const hits = allErrorCodes.filter(
      (ec) =>
        (domainModelIds.size === 0 || (ec.model && domainModelIds.has(ec.model.id))) &&
        (norm(ec.code).includes(q) ||
          norm(ec.title).includes(q) ||
          norm(ec.description).includes(q)),
    );

    const byCode = new Map<string, GroupedErrorCode>();
    for (const ec of hits) {
      const key = ec.code.toUpperCase();
      const m = ec.model;
      if (!m) continue;
      const occ: CodeOccurrence = {
        errorCodeId: ec.id,
        modelId: m.id,
        modelName: m.name,
        brandName: m.brand?.name ?? 'Marca',
        model: {
          id: m.id,
          brand_id: m.brand_id,
          category_id: null,
          name: m.name,
          code: m.code,
          image_url: m.image_url,
          manual_url: m.manual_url,
          refrigerant: m.refrigerant ?? null,
          domain,
          created_at: '',
          brand: m.brand ?? null,
        },
      };
      const existing = byCode.get(key);
      if (existing) {
        existing.occurrences.push(occ);
        // Mantém o primeiro título não-vazio como representativo.
        if (!existing.title && ec.title) existing.title = ec.title;
      } else {
        byCode.set(key, { code: ec.code, title: ec.title, occurrences: [occ] });
      }
    }
    return Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [allErrorCodes, q, searching, errorSearchEnabled, domainModelIds, domain]);

  const loadingSearch = loadingModels || (errorSearchEnabled && loadingCodes);
  const nadaEncontrado =
    searching && !loadingSearch && modelHits.length === 0 && codeGroups.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight md:text-xl">{tituloCatalogo(domain)}</h2>
          <p className="text-sm text-muted-foreground md:text-base">
            {errorSearchEnabled
              ? 'Consulte modelos e códigos de erro.'
              : 'Consulte os modelos do catálogo.'}
          </p>
        </div>
        {allModels.length > 0 && (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-primary px-2.5 py-1 text-sm font-bold text-primary-foreground">
            {allModels.length} equipamentos
          </span>
        )}
      </div>

      {/* Busca global do catálogo + botão de filtros */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={
                errorSearchEnabled
                  ? 'Buscar por marca, equipamento ou código de erro'
                  : 'Buscar por marca ou equipamento'
              }
              value={termoRaw}
              onChange={(e) => setTermoRaw(e.target.value)}
              className="h-14 pl-10 text-lg"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFiltersOpen(true)}
            className={cn('h-14 shrink-0', activeFilterCount > 0 && 'border-primary/50 text-primary')}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>
        {!searching && !filtering && (
          <p className="text-xs text-muted-foreground">
            Ou selecione uma marca para ver os modelos.
          </p>
        )}
      </div>

      {/* Painel de filtros */}
      <ResponsiveModal
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Filtros"
        footer={
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={limparFiltros}
              disabled={activeFilterCount === 0}
            >
              Limpar filtros
            </Button>
            <Button type="button" onClick={() => setFiltersOpen(false)}>
              Ver resultados
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <FilterCheckboxGroup
            label="Potência"
            options={btuOptions}
            selected={selectedBtus}
            onChange={setSelectedBtus}
            emptyLabel="Todas"
          />
          <FilterCheckboxGroup
            label="Tipo"
            options={typeOptions}
            selected={selectedTypes}
            onChange={setSelectedTypes}
            emptyLabel="Todos"
          />
          {gasFilterEnabled && gasOptions.length > 0 && (
            <FilterCheckboxGroup
              label="Gás refrigerante"
              options={gasOptions.map((o) => ({
                value: o.value,
                label: o.label,
                color: o.color,
                suffix: o.refrigId ? <RefrigeranteInflamavel refrigId={o.refrigId} size={14} /> : null,
              }))}
              selected={selectedGases}
              onChange={setSelectedGases}
              emptyLabel="Todos"
            />
          )}
        </div>
      </ResponsiveModal>

      {/* RESULTADOS DA BUSCA GLOBAL */}
      {searching ? (
        loadingSearch ? (
          <LoadingBlock />
        ) : nadaEncontrado ? (
          <EmptyState
            title="Nenhum resultado encontrado"
            message={`Não localizamos nada para "${termo}". Tente outra marca, modelo ou código.`}
          />
        ) : (
          <div className="space-y-6">
            {modelHits.length > 0 && (
              <section className="space-y-3">
                <SectionHeader label="Equipamentos" count={modelHits.length} />
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {modelHits.map((model) => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      domain={domain}
                      brandName={model.brand?.name ?? 'Marca'}
                      hasErrorCodes={modelIdsWithCodes?.has(model.id) ?? false}
                      onSelectDetail={() => onSelectModelDetail(model)}
                    />
                  ))}
                </div>
              </section>
            )}

            {codeGroups.length > 0 && (
              <section className="space-y-3">
                <SectionHeader label="Códigos de Erro" count={codeGroups.length} />
                {codeGroups.map((group) => (
                  <ErrorCodeGroupCard
                    key={group.code}
                    group={group}
                    onSelectMachine={(occ) => onSelectModelErrors(occ.model, group.code)}
                  />
                ))}
              </section>
            )}
          </div>
        )
      ) : filtering ? (
        /* FILTROS ATIVOS — lista de modelos (todas as marcas) que casam */
        loadingModels ? (
          <LoadingBlock />
        ) : filteredModels.length === 0 ? (
          <EmptyState
            title="Nenhum equipamento encontrado"
            message="Nenhum modelo corresponde aos filtros selecionados. Ajuste a potência ou o tipo."
          />
        ) : (
          <section className="space-y-3">
            <SectionHeader label="Equipamentos" count={filteredModels.length} />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filteredModels.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  domain={domain}
                  brandName={model.brand?.name ?? 'Marca'}
                  hasErrorCodes={modelIdsWithCodes?.has(model.id) ?? false}
                  onSelectDetail={() => onSelectModelDetail(model)}
                />
              ))}
            </div>
          </section>
        )
      ) : /* BROWSE NORMAL — grid de marcas */ isLoading ? (
        <LoadingBlock />
      ) : brands.length === 0 ? (
        <EmptyState
          title="Catálogo em atualização"
          message="As marcas e modelos para consulta estão sendo cadastrados. Volte em breve."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {brandsOrdenadas.map((brand) => (
            <button
              key={brand.id}
              type="button"
              onClick={() => onSelectBrand(brand)}
              className={cn(
                // Card inteiro branco fixo nos 2 temas pra logos coloridos/escuros
                // não sumirem no dark mode. bg-white é proposital — não usar token aqui.
                'flex h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-white p-4 text-center shadow-sm transition-all',
                'hover:border-primary/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              )}
            >
              {brand.logo_url ? (
                <CatalogImage
                  src={brand.logo_url}
                  alt={brand.name}
                  // Caixa de tamanho UNIFORME pra todas as logos da grade ficarem
                  // visualmente parecidas (mesma altura/largura máxima), maiores que
                  // antes. object-contain mantém a proporção sem distorcer.
                  containerClassName="flex h-16 w-full items-center justify-center"
                  className="max-h-14 max-w-[72%] object-contain"
                />
              ) : (
                // Cor escura fixa (não text-foreground) pra ficar legível sobre o
                // card branco também no dark mode.
                <span className="text-3xl font-semibold leading-tight text-neutral-800">
                  {brand.name}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Cabeçalho discreto de seção de resultado. */
function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

/** Card de um código de erro agrupado, listando as máquinas onde ocorre. */
function ErrorCodeGroupCard({
  group,
  onSelectMachine,
}: {
  group: GroupedErrorCode;
  onSelectMachine: (occ: CodeOccurrence) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="rounded-lg bg-primary px-2.5 py-1 text-sm font-bold uppercase tracking-wide text-primary-foreground">
          {group.code}
        </span>
        {group.title && (
          <span className="min-w-0 truncate text-sm font-semibold">{group.title}</span>
        )}
      </div>

      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {group.occurrences.length === 1 ? 'Máquina' : 'Máquinas'}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {group.occurrences.map((occ) => (
          <button
            key={occ.errorCodeId}
            type="button"
            onClick={() => onSelectMachine(occ)}
            className={cn(
              'flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-left text-xs font-medium transition-all',
              'hover:border-primary/40 hover:bg-muted active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <span className="text-muted-foreground">{occ.brandName}</span>
            <span className="text-foreground">{occ.modelName}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tela 2 — modelos de uma marca                                       */
/* ------------------------------------------------------------------ */

function ModelosList({
  brand,
  domain,
  onBack,
  onSelectBrand,
  onSelectDetail,
}: {
  brand: EquipmentBrand;
  domain: EquipmentDomain;
  onBack: () => void;
  onSelectBrand: (brand: EquipmentBrand) => void;
  onSelectDetail: (model: EquipmentModel) => void;
}) {
  const { data: models = [], isLoading } = useEquipmentModelsByBrand(brand.id, domain);
  const { data: brands = [] } = useEquipmentBrands(domain);
  // IDs com código de erro — usado só na linha branca pra esconder a ação
  // "Códigos de erro" em modelos sem códigos.
  const { data: modelIdsWithCodes } = useModelIdsWithErrorCodes(domain);

  // Mesma ordenação do grid de marcas (BrandsList) — no compressor, marcas
  // conhecidas primeiro. O carrossel inteiro (ordem, índice, snap) usa essa lista.
  const brandsOrdenadas = useMemo(() => ordenarMarcas(brands, domain), [brands, domain]);

  // Carrossel de marcas: a marca atual fica no centro, vizinhas espiam nas
  // laterais. Snapar/tocar numa marca diferente troca a marca ativa (onSelectBrand).
  const [api, setApi] = useState<CarouselApi>();
  const brandIndex = useMemo(
    () => Math.max(0, brandsOrdenadas.findIndex((b) => b.id === brand.id)),
    [brandsOrdenadas, brand.id],
  );
  const [selectedSnap, setSelectedSnap] = useState(brandIndex);

  // Ao snapar numa marca diferente, troca a marca ativa (guard por id evita loop).
  useEffect(() => {
    if (!api) return;
    const onSelect = () => {
      const idx = api.selectedScrollSnap();
      setSelectedSnap(idx);
      const novaMarca = brandsOrdenadas[idx];
      if (novaMarca && novaMarca.id !== brand.id) onSelectBrand(novaMarca);
    };
    api.on('select', onSelect);
    return () => {
      api.off('select', onSelect);
    };
  }, [api, brandsOrdenadas, brand.id, onSelectBrand]);

  // Quando a marca muda (re-render após onSelectBrand), centraliza o carrossel
  // na nova marca sem animação. Guard por índice evita re-disparar select.
  useEffect(() => {
    if (!api) return;
    if (api.selectedScrollSnap() !== brandIndex) {
      api.scrollTo(brandIndex, true);
      setSelectedSnap(brandIndex);
    }
  }, [brand.id, api, brandIndex]);

  // Busca local (nome / código / BTU) com debounce leve.
  const [termoRaw, setTermoRaw] = useState('');
  const [termo, setTermo] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setTermo(termoRaw.trim()), 180);
    return () => clearTimeout(id);
  }, [termoRaw]);

  // Filtros escopados aos modelos DESTA marca.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedBtus, setSelectedBtus] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  // Filtro de gás refrigerante: só no domínio ar_condicionado.
  const [selectedGases, setSelectedGases] = useState<string[]>([]);
  const gasFilterEnabled = domain === 'ar_condicionado';
  useEffect(() => {
    if (!gasFilterEnabled) setSelectedGases([]);
  }, [gasFilterEnabled]);

  const q = norm(termo);

  // Opções de Potência derivadas dos modelos desta marca (BTU distintos, crescente).
  const btuOptions = useMemo(() => {
    const set = new Set<number>();
    for (const m of models) {
      const n = btuNumero(m.name);
      if (n != null) set.add(n);
    }
    return Array.from(set)
      .sort((a, b) => a - b)
      .map((n) => ({ value: String(n), label: formatarBtu(n) }));
  }, [models]);

  // Opções de Tipo derivadas das categorias presentes nesta marca (alfabético).
  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of models) {
      const name = m.category?.name;
      if (name) set.add(name);
    }
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((name) => ({ value: name, label: name }));
  }, [models]);

  // Opções de Gás refrigerante (só no ar_condicionado), derivadas desta marca.
  const gasOptions = useMemo(
    () => (gasFilterEnabled ? gasOptionsFromModels(models) : []),
    [models, gasFilterEnabled],
  );

  const activeFilterCount =
    selectedBtus.length + selectedTypes.length + (gasFilterEnabled ? selectedGases.length : 0);
  const limparFiltros = () => {
    setSelectedBtus([]);
    setSelectedTypes([]);
    setSelectedGases([]);
  };

  // Lista final: busca + filtros (vazio = todos), ordenada por BTU crescente.
  const modelosVisiveis = useMemo(() => {
    const filtrados = models.filter((m) => {
      const buscaOk =
        q.length === 0 ||
        norm(m.name).includes(q) ||
        norm(m.code).includes(q) ||
        norm(extrairBtu(m.name)).includes(q);
      const btuOk =
        selectedBtus.length === 0 || selectedBtus.includes(String(btuNumero(m.name)));
      const tipoOk =
        selectedTypes.length === 0 || selectedTypes.includes(m.category?.name ?? '');
      const gasOk = !gasFilterEnabled || modeloCasaGas(m, selectedGases);
      return buscaOk && btuOk && tipoOk && gasOk;
    });
    return ordenarPorBtu(filtrados);
  }, [models, q, selectedBtus, selectedTypes, selectedGases, gasFilterEnabled]);

  const semResultado =
    !isLoading && models.length > 0 && modelosVisiveis.length === 0;

  return (
    <div className="space-y-6 pb-8">
      <Header icon={Boxes} title={tituloCatalogo(domain)} subtitle={brand.name} onBack={onBack} />

      {/* Carrossel de marcas: a atual no centro, vizinhas espiando nas laterais.
          Deslizar/tocar numa marca troca a marca ativa (mostra os modelos dela). */}
      {brandsOrdenadas.length > 1 ? (
        <Carousel
          opts={{ align: 'center', startIndex: brandIndex }}
          setApi={setApi}
          className="-mx-1"
        >
          <CarouselContent>
            {brandsOrdenadas.map((b, i) => {
              const ativo = i === selectedSnap;
              return (
                <CarouselItem key={b.id} className="basis-2/3">
                  <button
                    type="button"
                    onClick={() => api?.scrollTo(i)}
                    aria-label={`Ver modelos da ${b.name}`}
                    className={cn(
                      // Card branco fixo nos 2 temas (proposital) pra logos coloridos
                      // não sumirem no dark mode.
                      'flex h-28 w-full items-center justify-center rounded-2xl border border-border bg-white p-6 transition-all duration-200',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      ativo ? 'scale-100 opacity-100 shadow-sm' : 'scale-95 opacity-50',
                    )}
                  >
                    {b.logo_url ? (
                      <CatalogImage
                        src={b.logo_url}
                        alt={b.name}
                        // Mesmo padrão uniforme da grade de marcas (BrandsList):
                        // logos visualmente parecidas em tamanho, sem distorcer.
                        containerClassName="flex h-16 w-full items-center justify-center"
                        className="max-h-14 max-w-[72%] object-contain"
                      />
                    ) : (
                      <span className="text-3xl font-semibold text-neutral-800">{b.name}</span>
                    )}
                  </button>
                </CarouselItem>
              );
            })}
          </CarouselContent>
        </Carousel>
      ) : (
        /* Marca única: card estático (carrossel não faz sentido). */
        <div className="flex items-center justify-center rounded-2xl border border-border bg-white p-6">
          {brand.logo_url ? (
            <CatalogImage
              src={brand.logo_url}
              alt={brand.name}
              containerClassName="flex h-16 w-full items-center justify-center"
              className="max-h-14 max-w-[72%] object-contain"
            />
          ) : (
            <span className="text-3xl font-semibold text-neutral-800">{brand.name}</span>
          )}
        </div>
      )}

      {/* Busca + filtros escopados a esta marca */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar equipamento ou código..."
            value={termoRaw}
            onChange={(e) => setTermoRaw(e.target.value)}
            className="h-14 pl-10 text-lg"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setFiltersOpen(true)}
          className={cn('h-14 shrink-0', activeFilterCount > 0 && 'border-primary/50 text-primary')}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
          {activeFilterCount > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      <ResponsiveModal
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Filtros"
        footer={
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={limparFiltros}
              disabled={activeFilterCount === 0}
            >
              Limpar filtros
            </Button>
            <Button type="button" onClick={() => setFiltersOpen(false)}>
              Ver resultados
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <FilterCheckboxGroup
            label="Potência"
            options={btuOptions}
            selected={selectedBtus}
            onChange={setSelectedBtus}
            emptyLabel="Todas"
          />
          <FilterCheckboxGroup
            label="Tipo"
            options={typeOptions}
            selected={selectedTypes}
            onChange={setSelectedTypes}
            emptyLabel="Todos"
          />
          {gasFilterEnabled && gasOptions.length > 0 && (
            <FilterCheckboxGroup
              label="Gás refrigerante"
              options={gasOptions.map((o) => ({
                value: o.value,
                label: o.label,
                color: o.color,
                suffix: o.refrigId ? <RefrigeranteInflamavel refrigId={o.refrigId} size={14} /> : null,
              }))}
              selected={selectedGases}
              onChange={setSelectedGases}
              emptyLabel="Todos"
            />
          )}
        </div>
      </ResponsiveModal>

      {isLoading ? (
        <LoadingBlock />
      ) : models.length === 0 ? (
        <EmptyState
          title="Nenhum modelo cadastrado"
          message={`Ainda não há modelos da ${brand.name} no catálogo.`}
        />
      ) : semResultado ? (
        <EmptyState
          title="Nenhum equipamento encontrado"
          message="Nenhum modelo corresponde à busca ou aos filtros. Ajuste os critérios."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {modelosVisiveis.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              domain={domain}
              brandName={brand.name}
              hasErrorCodes={modelIdsWithCodes?.has(model.id) ?? false}
              onSelectDetail={() => onSelectDetail(model)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Controles Remotos — lista global (sem etapa de marca)               */
/* ------------------------------------------------------------------ */

/**
 * Paleta de cores SATURADAS o suficiente pra contrastar com texto branco.
 * O badge da marca usa texto branco fixo (pedido do CEO), então todas as cores
 * aqui são escuras/médias (nada de tons claros). A escolha é determinística por
 * nome de marca (hash → índice), pra mesma marca cair sempre na mesma cor.
 */
const BRAND_BADGE_COLORS = [
  '#0369a1', // sky-700
  '#7c3aed', // violet-600
  '#be123c', // rose-700
  '#15803d', // green-700
  '#c2410c', // orange-700
  '#0e7490', // cyan-700
  '#9333ea', // purple-600
  '#1d4ed8', // blue-700
  '#b45309', // amber-700
  '#0f766e', // teal-700
];

/** Hash simples (djb2) do nome normalizado → índice estável na paleta. */
function brandBadgeColor(name: string): string {
  const s = norm(name);
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff;
  }
  const idx = Math.abs(h) % BRAND_BADGE_COLORS.length;
  return BRAND_BADGE_COLORS[idx];
}

/**
 * Lista GLOBAL de controles remotos: pula a etapa de marca e mostra TODOS os
 * controles do domínio numa lista única. Cada card traz um badge saturado com a
 * marca (texto branco). Busca filtra por nome do controle e por marca.
 */
function RemotesList({
  onSelectDetail,
}: {
  onSelectDetail: (model: EquipmentModel) => void;
}) {
  const { data: models = [], isLoading } = useAllModelsWithBrand('controle_remoto');

  const [termoRaw, setTermoRaw] = useState('');
  const [termo, setTermo] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setTermo(termoRaw.trim()), 180);
    return () => clearTimeout(id);
  }, [termoRaw]);

  const q = norm(termo);

  // Filtra por nome do controle OU nome da marca; ordena por marca, depois nome.
  const visiveis = useMemo(() => {
    const filtrados = models.filter((m) => {
      if (q.length === 0) return true;
      const brandName = m.brand?.name ?? '';
      return norm(m.name).includes(q) || norm(brandName).includes(q);
    });
    return [...filtrados].sort((a, b) => {
      const ba = a.brand?.name ?? '';
      const bb = b.brand?.name ?? '';
      const cmp = ba.localeCompare(bb, 'pt-BR');
      if (cmp !== 0) return cmp;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [models, q]);

  const semResultado = !isLoading && models.length > 0 && visiveis.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight md:text-xl">
            {tituloCatalogo('controle_remoto')}
          </h2>
          <p className="text-sm text-muted-foreground md:text-base">
            Consulte os controles remotos do catálogo.
          </p>
        </div>
        {models.length > 0 && (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-primary px-2.5 py-1 text-sm font-bold text-primary-foreground">
            {models.length} controles
          </span>
        )}
      </div>

      {/* Busca global por nome do controle ou marca */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Buscar por marca ou controle"
          value={termoRaw}
          onChange={(e) => setTermoRaw(e.target.value)}
          className="h-14 pl-10 text-lg"
        />
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : models.length === 0 ? (
        <EmptyState
          title="Catálogo em atualização"
          message="Os controles remotos para consulta estão sendo cadastrados. Volte em breve."
        />
      ) : semResultado ? (
        <EmptyState
          title="Nenhum controle encontrado"
          message={`Não localizamos nada para "${termo}". Tente outra marca ou controle.`}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {visiveis.map((model) => (
            <RemoteCard
              key={model.id}
              model={model}
              brandName={model.brand?.name ?? 'Marca'}
              onSelectDetail={() => onSelectDetail(model)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Card de um controle remoto na lista global: foto + nome + badge de marca. */
function RemoteCard({
  model,
  brandName,
  onSelectDetail,
}: {
  model: EquipmentModel;
  brandName: string;
  onSelectDetail: () => void;
}) {
  const temFoto = Boolean(model.image_url);
  const [viewerOpen, setViewerOpen] = useState(false);
  const badgeColor = brandBadgeColor(brandName);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* TOPO — foto do controle (full width, object-contain) */}
      {temFoto ? (
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          aria-label={`Ampliar foto de ${model.name}`}
          className="flex h-44 w-full cursor-pointer items-center justify-center bg-white p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <CatalogImage
            src={model.image_url!}
            alt={model.name}
            containerClassName="h-full w-full"
            className="h-full w-full object-contain"
          />
        </button>
      ) : (
        <div className="flex h-44 w-full flex-col items-center justify-center gap-1 bg-white">
          <PackageSearch className="h-12 w-12 text-neutral-300" />
          <span className="text-xs text-neutral-400">Sem foto</span>
        </div>
      )}

      <div className="p-4">
        <p className="text-center text-base font-semibold leading-snug text-foreground">
          {model.name}
        </p>
        {/* Badge de marca: fundo saturado + texto branco (pedido do CEO). */}
        <div className="mt-2 flex justify-center">
          <span
            className="rounded-md px-2.5 py-0.5 text-xs font-semibold text-white"
            style={{ backgroundColor: badgeColor }}
          >
            {brandName}
          </span>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onSelectDetail}
          className="mt-4 w-full"
        >
          <Settings2 className="h-4 w-4" />
          Ver detalhes técnicos
        </Button>
      </div>

      {temFoto && (
        <ImagePreviewModal
          src={model.image_url!}
          alt={model.name}
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Consumo de energia — config global (tarifa/horas) + cálculo          */
/* ------------------------------------------------------------------ */

/**
 * Config GLOBAL da ferramenta (não por modelo): tarifa em R$/kWh e horas de uso
 * por dia. Persiste por aparelho em localStorage, igual à aba Usabilidade —
 * chave própria, default decidido aqui (não no load). É só conveniência: se o
 * localStorage falhar, cai no default sem quebrar.
 */
const ENERGIA_CONFIG_KEY = 'catalogo-energia-config';
const ENERGIA_DEFAULTS = { tarifa: 0.9, horasDia: 8 } as const;
/** Evento disparado no window quando a config de energia muda (sync entre cards). */
const ENERGIA_CONFIG_EVENT = 'energia-config-change';

interface EnergiaConfig {
  /** R$ por kWh. */
  tarifa: number;
  /** Horas de uso por dia (base da estimativa por potência). */
  horasDia: number;
}

function lerEnergiaConfig(): EnergiaConfig {
  try {
    const raw = localStorage.getItem(ENERGIA_CONFIG_KEY);
    if (!raw) return { ...ENERGIA_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<EnergiaConfig>;
    const tarifa = Number(parsed.tarifa);
    const horasDia = Number(parsed.horasDia);
    return {
      tarifa: Number.isFinite(tarifa) && tarifa > 0 ? tarifa : ENERGIA_DEFAULTS.tarifa,
      horasDia:
        Number.isFinite(horasDia) && horasDia > 0 && horasDia <= 24
          ? horasDia
          : ENERGIA_DEFAULTS.horasDia,
    };
  } catch {
    return { ...ENERGIA_DEFAULTS };
  }
}

function salvarEnergiaConfig(cfg: EnergiaConfig): void {
  try {
    localStorage.setItem(ENERGIA_CONFIG_KEY, JSON.stringify(cfg));
  } catch {
    /* localStorage cheio/indisponível — silencioso, é só conveniência. */
  }
  // Avisa os outros cards montados pra recalcularem na hora (sem reabrir a tela).
  try {
    window.dispatchEvent(new CustomEvent(ENERGIA_CONFIG_EVENT));
  } catch {
    /* ambiente sem window — ignora. */
  }
}

/**
 * Hook de config de energia REATIVO e COMPARTILHADO entre todos os cards montados.
 * Ao aplicar tarifa/horas em qualquer card, dispara `energia-config-change` no
 * window; os demais cards ouvem esse evento (e o `storage` cross-tab) e re-leem o
 * localStorage, refletindo a mudança imediatamente. Defaults decididos aqui.
 */
function useEnergiaConfig(): [EnergiaConfig, (next: EnergiaConfig) => void] {
  const [cfg, setCfg] = useState<EnergiaConfig>(() => lerEnergiaConfig());

  useEffect(() => {
    const reler = () => setCfg(lerEnergiaConfig());
    window.addEventListener(ENERGIA_CONFIG_EVENT, reler);
    window.addEventListener('storage', reler);
    return () => {
      window.removeEventListener(ENERGIA_CONFIG_EVENT, reler);
      window.removeEventListener('storage', reler);
    };
  }, []);

  const update = (next: EnergiaConfig) => {
    setCfg(next);
    salvarEnergiaConfig(next); // dispara o evento → demais cards re-leem
  };
  return [cfg, update];
}

/** Moeda BR. */
function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** kWh com vírgula decimal (2 casas máx, sem zeros à toa). */
function kwh(v: number): string {
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kWh`;
}

/**
 * Bloco "Consumo de energia" do card de detalhe (só AC e linha branca).
 *
 * Hora e mês são SEMPRE coerentes entre si: mês = hora × horasDia × 30.
 *
 * - Com `consumo_kwh_mes` OFICIAL: ele é a verdade do mês. A hora vira o consumo
 *   MÉDIO por hora de uso → kWh/h = mês ÷ (horasDia × 30). Rótulo do mês sem
 *   "(estimado)" (é oficial), mas a nota de estimativa continua. Mexer nas horas
 *   muda a hora exibida (faz sentido: mesma energia mensal espalhada por mais/menos horas).
 * - Sem oficial, com `potencia_w`: kWh/h = W/1000 (potência nominal) e
 *   mês = hora × horasDia × 30 (estimado). Rótulo "(estimado · X h/dia)".
 * - Sem nenhum dado → "Consumo não informado". Nunca inventa número.
 *
 * gasto/h = kWh/h × tarifa; gasto/mês = kWh/mês × tarifa.
 */
function ConsumoEnergia({ model }: { model: EquipmentModel }) {
  const [cfg, setCfg] = useEnergiaConfig();
  const [open, setOpen] = useState(false);
  const [tarifaStr, setTarifaStr] = useState(() => String(cfg.tarifa).replace('.', ','));
  const [horasStr, setHorasStr] = useState(() => String(cfg.horasDia).replace('.', ','));

  // Defensivo: selects de busca por código não trazem as colunas → tratar como ausente.
  const potencia = typeof model.potencia_w === 'number' ? model.potencia_w : null;
  const oficialMes = typeof model.consumo_kwh_mes === 'number' ? model.consumo_kwh_mes : null;

  const temDado = potencia != null || oficialMes != null;

  // Horas mensais de uso (base da relação hora ↔ mês). Sempre > 0 (config validada).
  const horasMes = cfg.horasDia * 30;

  // Consumo por hora de OPERAÇÃO = base fixa do equipamento; o mês escala com as
  // horas/dia (mês = hora × horasDia × 30) — as horas SEMPRE mexem no mês.
  // - Oficial (Procel): ancorado ao consumo mensal em ENERGIA_DEFAULTS.horasDia (8h/dia);
  //   por-hora = oficial ÷ (8 × 30). A 8h/dia o mês bate o oficial; a 12h, ×1,5; a 24h, ×3.
  // - Sem oficial: por-hora = potência nominal (W/1000); inverter consome menos que isso.
  let kwhHora: number | null = null;
  if (oficialMes != null) {
    kwhHora = oficialMes / (ENERGIA_DEFAULTS.horasDia * 30);
  } else if (potencia != null) {
    kwhHora = potencia / 1000;
  }
  const kwhMes = kwhHora != null ? kwhHora * horasMes : null;
  const baseEhPotencia = oficialMes == null && kwhMes != null;

  const gastoHora = kwhHora != null ? kwhHora * cfg.tarifa : null;
  const gastoMes = kwhMes != null ? kwhMes * cfg.tarifa : null;

  function commitConfig() {
    const t = Number(tarifaStr.replace(',', '.'));
    const h = Number(horasStr.replace(',', '.'));
    setCfg({
      tarifa: Number.isFinite(t) && t > 0 ? t : ENERGIA_DEFAULTS.tarifa,
      horasDia: Number.isFinite(h) && h > 0 && h <= 24 ? h : ENERGIA_DEFAULTS.horasDia,
    });
    setOpen(false);
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Zap className="h-4 w-4 text-amber-500" />
          Consumo de energia
        </div>
        <Popover
          open={open}
          onOpenChange={(o) => {
            // Ao abrir, sincroniza os inputs com o estado atual.
            if (o) {
              setTarifaStr(String(cfg.tarifa).replace('.', ','));
              setHorasStr(String(cfg.horasDia).replace('.', ','));
            }
            setOpen(o);
          }}
        >
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Ajustar
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 space-y-3">
            <p className="text-sm font-medium text-foreground">Tarifa e uso</p>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Tarifa (R$/kWh)</label>
              <Input
                inputMode="decimal"
                value={tarifaStr}
                onChange={(e) => setTarifaStr(e.target.value)}
                placeholder="0,90"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Horas de uso por dia</label>
              <Input
                inputMode="decimal"
                value={horasStr}
                onChange={(e) => setHorasStr(e.target.value)}
                placeholder="8"
              />
            </div>
            <Button size="sm" className="w-full" onClick={commitConfig}>
              Aplicar
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      {!temDado ? (
        <p className="mt-2 text-xs text-muted-foreground">Consumo não informado</p>
      ) : (
        <div className="mt-2 space-y-1.5 text-sm">
          {kwhHora != null && (
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 text-muted-foreground">Por hora</span>
              <span className="shrink-0 whitespace-nowrap text-right font-medium text-foreground">
                {kwh(kwhHora)}/h
                {gastoHora != null && (
                  <span className="ml-1 text-muted-foreground">· {brl(gastoHora)}</span>
                )}
              </span>
            </div>
          )}
          {kwhMes != null && (
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 text-muted-foreground">
                Por mês
                {` (estimado · ${String(cfg.horasDia).replace('.', ',')} h/dia)`}
              </span>
              <span className="shrink-0 whitespace-nowrap text-right font-medium text-foreground">
                {kwh(kwhMes)}
                {gastoMes != null && (
                  <span className="ml-1 text-muted-foreground">· {brl(gastoMes)}</span>
                )}
              </span>
            </div>
          )}
          <p className="pt-0.5 text-[11px] leading-snug text-muted-foreground">
            Estimativa com base em dados públicos da internet.
            {baseEhPotencia && ' Calculada pela potência nominal; consulte o manual.'}
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card de modelo — badges e ações variam por domínio                  */
/* ------------------------------------------------------------------ */

/** Configuração da ação primária do card (rótulo + ícone) por domínio. */
function detailAction(domain: EquipmentDomain): { label: string; icon: typeof AlertCircle } {
  switch (domain) {
    case 'compressor':
      return { label: 'Ficha técnica', icon: Cpu };
    case 'controle_remoto':
      return { label: 'Ver detalhes técnicos', icon: Settings2 };
    default:
      // ar_condicionado e linha_branca → códigos de erro.
      return { label: 'Códigos de erro', icon: AlertCircle };
  }
}

function ModelCard({
  model,
  domain,
  brandName,
  onSelectDetail,
  hasErrorCodes,
}: {
  model: EquipmentModel;
  domain: EquipmentDomain;
  brandName: string;
  onSelectDetail: () => void;
  /**
   * Se este modelo tem ≥1 código de erro cadastrado. Consultado nos domínios de
   * códigos de erro (ar_condicionado e linha_branca): quando false, a ação primária
   * vira um estado desabilitado "Códigos de Erro Indisponíveis" (espelha o
   * "Manual Indisponível"). Nos outros domínios é ignorado.
   */
  hasErrorCodes?: boolean;
}) {
  const categoria = model.category?.name ?? null;
  const btu = extrairBtu(model.name);
  const subtitulo = brandName;
  const temManual = Boolean(model.manual_url);
  const temFoto = Boolean(model.image_url);

  // Quais badges/segundo botão o domínio mostra.
  // BTU: AC sempre; compressor só quando o nome traz BTU (herméticos não têm — sem
  // placeholder, o `&& btu` já cuida disso).
  const mostraBtu = domain === 'ar_condicionado' || domain === 'compressor';
  const mostraGas = domain === 'ar_condicionado' || domain === 'compressor';

  // Consumo de energia só faz sentido pra aparelho ligado direto na tomada:
  // AC e linha branca. Compressor e controle remoto não mostram.
  const mostraConsumo = domain === 'ar_condicionado' || domain === 'linha_branca';

  // AC e Linha Branca baixam manual; Compressor baixa "Datasheet" (mesma URL).
  const segundoBotao: 'manual' | 'datasheet' | null =
    domain === 'compressor' ? 'datasheet' : domain === 'controle_remoto' ? null : 'manual';

  // Domínios cuja ação primária é "Códigos de erro" (ar_condicionado e linha_branca).
  // Quando o modelo não tem códigos cadastrados, a ação não some: vira um estado
  // desabilitado "Códigos de Erro Indisponíveis", simétrico ao "Manual Indisponível".
  const isErrorsDomain = detailKind(domain) === 'errors';
  const codigosIndisponiveis = isErrorsDomain && hasErrorCodes !== true;

  const detalhe = detailAction(domain);
  const DetalheIcon = detalhe.icon;

  // Viewer dedicado da foto (igual OS) — abre no clique, fecha fora, baixa, mobile/desktop.
  const [viewerOpen, setViewerOpen] = useState(false);

  const temBadges =
    (mostraBtu && btu) || categoria || (mostraGas && model.refrigerant) || model.code;

  return (
    <div
      // Corpo do card no tema normal (bg-card). Só a faixa da foto no topo é branca
      // fixa nos 2 temas — proposital, pra fotos de aparelho não sumirem no dark.
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      {/* TOPO — foto em destaque, full width, aparelho inteiro (object-contain) */}
      {temFoto ? (
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          aria-label={`Ampliar foto de ${model.name}`}
          className="flex h-44 w-full cursor-pointer items-center justify-center bg-white p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <CatalogImage
            src={model.image_url!}
            alt={model.name}
            containerClassName="h-full w-full"
            className="h-full w-full object-contain"
          />
        </button>
      ) : (
        <div className="flex h-44 w-full flex-col items-center justify-center gap-1 bg-white">
          <PackageSearch className="h-12 w-12 text-neutral-300" />
          <span className="text-xs text-neutral-400">Sem foto</span>
        </div>
      )}

      {/* CORPO — identificação centralizada (tokens de tema) */}
      <div className="p-4">
        <p className="text-center text-base font-semibold leading-snug text-foreground">
          {model.name}
        </p>
        {subtitulo && (
          <p className="mt-0.5 text-center text-sm text-muted-foreground">{subtitulo}</p>
        )}
        {temBadges && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            {mostraBtu && btu && (
              <span className="rounded-md bg-sky-500 px-2 py-0.5 text-xs font-semibold text-white">
                {btu}
              </span>
            )}
            {categoria && (
              <span className="rounded-md bg-violet-500 px-2 py-0.5 text-xs font-semibold text-white">
                {categoria}
              </span>
            )}
            {mostraGas &&
              model.refrigerant &&
              (() => {
                const cor = getRefrigerante(model.refrigerant)?.cor ?? '#6b7280';
                return (
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="rounded-md px-2 py-0.5 text-xs font-semibold"
                      style={{ backgroundColor: cor, color: idealForeground(cor) }}
                    >
                      {model.refrigerant}
                    </span>
                    <RefrigeranteInflamavel refrigId={model.refrigerant} />
                  </span>
                );
              })()}
            {model.code && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Cód.: {model.code}
              </span>
            )}
          </div>
        )}

        {mostraConsumo && <ConsumoEnergia model={model} />}

        {/* Ações diretas — sem modal intermediário (tema normal: outline lê no dark).
            Controle remoto tem só 1 ação (largura cheia); os demais têm 2 botões
            sempre, cada um no seu estado (ativo ou "Indisponível"). */}
        <div
          className={cn(
            'mt-4 grid gap-2',
            segundoBotao ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1',
          )}
        >
          {codigosIndisponiveis ? (
            <div className="flex h-9 items-center justify-center rounded-md bg-destructive px-3 text-center text-xs font-semibold text-white">
              Códigos de Erro Indisponíveis
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={onSelectDetail} className="w-full">
              <DetalheIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">{detalhe.label}</span>
            </Button>
          )}

          {segundoBotao === 'manual' &&
            (temManual ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  baixarManual(
                    model.manual_url!,
                    sanitizarNomeArquivo(`Manual ${model.name} - ${brandName}.pdf`),
                  )
                }
                className="w-full"
              >
                <Download className="h-4 w-4 shrink-0" />
                <span className="truncate">Baixar manual</span>
              </Button>
            ) : (
              <div className="flex h-9 items-center justify-center rounded-md bg-destructive px-3 text-center text-xs font-semibold text-white">
                Manual Indisponível
              </div>
            ))}

          {segundoBotao === 'datasheet' &&
            (temManual ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  baixarManual(
                    model.manual_url!,
                    sanitizarNomeArquivo(`Datasheet ${model.name} - ${brandName}.pdf`),
                  )
                }
                className="w-full"
              >
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate">Datasheet</span>
              </Button>
            ) : (
              <div className="flex h-9 items-center justify-center rounded-md bg-destructive px-3 text-center text-xs font-semibold text-white">
                Datasheet Indisponível
              </div>
            ))}
        </div>
      </div>

      {temFoto && (
        <ImagePreviewModal
          src={model.image_url!}
          alt={model.name}
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tela 3 — códigos de erro do modelo                                  */
/* ------------------------------------------------------------------ */

function CodigosErro({
  model,
  initialCode,
  onBack,
}: {
  model: EquipmentModel;
  initialCode?: string;
  onBack: () => void;
}) {
  const { data: codes = [], isLoading } = useEquipmentErrorCodes(model.id);
  const [filtro, setFiltro] = useState(initialCode ?? '');

  const brandName = model.brand?.name ?? '';
  const tituloTopo = brandName ? `${model.name} - ${brandName}` : model.name;

  // Registra como recente ao abrir o modelo (uma vez por modelo).
  useEffect(() => {
    registrarModeloRecente({
      modelId: model.id,
      modelName: model.name,
      brandName: brandName || 'Marca',
    });
  }, [model.id, model.name, brandName]);

  // Estado de favorito (reativo ao toggle via useToolHistory).
  useToolHistory();
  const favorito = isModeloFavorito(model.id);
  const onToggleFavorito = () =>
    toggleModeloFavorito({
      modelId: model.id,
      modelName: model.name,
      brandName: brandName || 'Marca',
    });

  const filtroNorm = filtro.trim().toLowerCase();
  const filtrados = filtroNorm
    ? codes.filter((c) => c.code.toLowerCase().includes(filtroNorm))
    : codes;

  return (
    <div className="space-y-6 pb-8">
      <Header
        icon={AlertCircle}
        eyebrow="Códigos de erro"
        title={tituloTopo}
        onBack={onBack}
        action={
          <button
            type="button"
            aria-pressed={favorito}
            aria-label={favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            onClick={onToggleFavorito}
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all active:scale-95',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              favorito
                ? 'border-warning/40 bg-warning/10 text-warning'
                : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40',
            )}
          >
            <Star className={cn('h-5 w-5', favorito && 'fill-current')} />
          </button>
        }
      />

      {/* Campo de busca estilo display */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Informe o código de erro no display</p>
        <Input
          type="text"
          placeholder="Ex: E1, F0, P4..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="h-14 text-center text-2xl font-bold uppercase tracking-widest"
        />
      </div>

      {/* Instruções */}
      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-sm font-semibold">Instruções</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Digite o código exibido no painel do equipamento para ver o diagnóstico. Você também pode
          percorrer a lista completa de códigos abaixo.
        </p>
      </div>

      {/* Lista / resultado */}
      {isLoading ? (
        <LoadingBlock />
      ) : codes.length === 0 ? (
        <EmptyState
          title="Sem códigos cadastrados"
          message="Ainda não há códigos de erro registrados para este modelo."
        />
      ) : filtrados.length === 0 ? (
        <EmptyState
          title="Código não encontrado"
          message={`Nenhum código corresponde a "${filtro.trim()}" neste modelo.`}
        />
      ) : (
        <div className="space-y-3">
          {filtrados.map((ec) => (
            <div key={ec.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-primary px-2.5 py-1 text-sm font-bold uppercase tracking-wide text-primary-foreground">
                  {ec.code}
                </span>
                {ec.title && <span className="min-w-0 truncate text-sm font-semibold">{ec.title}</span>}
              </div>

              {ec.description && (
                <p className="mt-3 text-sm leading-relaxed text-foreground/90">{ec.description}</p>
              )}

              {(ec.diagnosis || ec.solution) && (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Diagnóstico
                  </p>
                  {ec.diagnosis && (
                    <p className="mt-0.5 text-sm leading-relaxed text-foreground/90">{ec.diagnosis}</p>
                  )}
                  {ec.solution && (
                    <p className="mt-2 text-sm italic leading-relaxed text-muted-foreground">
                      <span className="font-semibold not-italic text-foreground">Sugestão: </span>
                      {ec.solution}
                    </p>
                  )}
                </div>
              )}

              {ec.component && (
                <div className="mt-3 flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Componente:</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                    {ec.component}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Blocos auxiliares                                                   */
/* ------------------------------------------------------------------ */

function Header({
  icon: Icon,
  title,
  subtitle,
  eyebrow,
  onBack,
  backDesktopOnly,
  action,
}: {
  icon: typeof Boxes;
  title: string;
  subtitle?: string;
  /**
   * Rótulo pequeno acima do título (ex: "Códigos de erro"). Quando presente, o
   * `title` vira o destaque (nome do modelo em alto contraste), igual à ficha do
   * compressor. Ignora `subtitle` nesse modo.
   */
  eyebrow?: string;
  onBack: () => void;
  backDesktopOnly?: boolean;
  /** Ação opcional alinhada à direita (ex: favoritar). */
  action?: ReactNode;
}) {
  return (
    <div className={cn('flex gap-3', eyebrow ? 'items-start' : 'items-center')}>
      <Button
        variant="ghost"
        size="icon"
        className={cn('shrink-0', backDesktopOnly && 'hidden lg:flex')}
        onClick={onBack}
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className={cn('flex min-w-0 flex-1 gap-2', eyebrow ? 'items-start' : 'items-center')}>
        <Icon className={cn('h-6 w-6 text-foreground/70 shrink-0', eyebrow && 'mt-0.5')} />
        <div className="min-w-0">
          {eyebrow ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {eyebrow}
              </p>
              {/* Nome do modelo em destaque (título da página, alto contraste). */}
              <h1 className="text-lg font-semibold leading-snug tracking-tight text-foreground lg:text-2xl">
                {title}
              </h1>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold tracking-tight truncate lg:text-2xl">{title}</h1>
              {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
            </>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <PackageSearch className="h-10 w-10 text-muted-foreground" />
      <p className="text-base font-semibold">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
