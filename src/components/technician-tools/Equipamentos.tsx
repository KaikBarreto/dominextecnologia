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
} from 'lucide-react';
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
  useAllModelsWithBrand,
  useAllErrorCodesWithModel,
  type EquipmentBrand,
  type EquipmentModel,
  type EquipmentDomain,
} from '@/hooks/useEquipmentCatalog';
import { CompressorFicha } from './CompressorFicha';
import { RemoteConfig } from './RemoteConfig';
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
import { getRefrigerante } from '@/lib/refrigerantes';
import { idealForeground } from '@/lib/colorContrast';

/**
 * Marcas mais conhecidas de COMPRESSORES, em ordem de prioridade.
 * No domínio 'compressor' essas marcas aparecem primeiro na lista (nesta ordem);
 * as demais seguem a ordenação padrão do catálogo (sort/name) como desempate.
 * Comparação por nome normalizado (minúsculo, sem acento).
 */
const MARCAS_PRIORITARIAS_COMPRESSOR = ['gree', 'embraco', 'lg', 'samsung'];

/** Normaliza texto pra busca: minúsculo + sem acento. */
function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
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

type View =
  | { kind: 'brands' }
  | { kind: 'models'; brand: EquipmentBrand }
  | { kind: 'errors'; model: EquipmentModel; initialCode?: string; brand?: EquipmentBrand }
  | { kind: 'compressor'; model: EquipmentModel; brand?: EquipmentBrand }
  | {
      kind: 'compressor-xref';
      model: EquipmentModel;
      /** Para onde o "voltar" volta (a tela de origem do cross-ref). */
      back: View;
    }
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

  // Cross-reference "Compressor típico": id do compressor a abrir + view de origem
  // (pra onde o voltar retorna). Resolvido por hook AQUI no topo (nunca dentro do
  // card), e a View do compressor abre quando o modelo chega.
  const [compressorXref, setCompressorXref] = useState<{ id: string; back: View } | null>(null);
  const { data: compressorXrefModel, isLoading: loadingXref } = useEquipmentModel(
    compressorXref?.id,
  );
  useEffect(() => {
    if (compressorXref && compressorXrefModel) {
      setView({ kind: 'compressor-xref', model: compressorXrefModel, back: compressorXref.back });
      setCompressorXref(null);
    }
  }, [compressorXref, compressorXrefModel]);

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

  // Enquanto resolve o compressor típico (cross-ref), mostra loading.
  if (compressorXref && loadingXref) {
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
        onAbrirCompressor={(id) =>
          setCompressorXref({ id, back: { kind: 'models', brand: view.brand } })
        }
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

  if (view.kind === 'compressor-xref') {
    const back = view.back;
    return <CompressorFicha model={view.model} typical onBack={() => setView(back)} />;
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
      <BrandsList
        domain={domain}
        onSelectBrand={(brand) => setView({ kind: 'models', brand })}
        onSelectModelDetail={(model) => setView({ kind: detailKind(domain), model })}
        onSelectModelErrors={(model, initialCode) => setView({ kind: 'errors', model, initialCode })}
        onAbrirCompressor={(id) => setCompressorXref({ id, back: { kind: 'brands' } })}
      />
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
  onAbrirCompressor,
}: {
  domain: EquipmentDomain;
  onSelectBrand: (brand: EquipmentBrand) => void;
  /** Ação primária do card (erros / ficha / configurar, conforme o domínio). */
  onSelectModelDetail: (model: EquipmentModel) => void;
  onSelectModelErrors: (model: EquipmentModel, initialCode?: string) => void;
  /** Abre o compressor típico (cross-ref) a partir do id mapeado no modelo. */
  onAbrirCompressor: (compressorModelId: string) => void;
}) {
  const { data: brands = [], isLoading } = useEquipmentBrands(domain);

  // No domínio Compressores, as marcas mais conhecidas vêm primeiro (ordem do
  // array); o resto preserva a ordenação que veio do hook (sort/name) como
  // desempate. Nos demais domínios mantém a ordem original do hook.
  const brandsOrdenadas = useMemo(() => {
    if (domain !== 'compressor') return brands;
    const prioridade = (b: EquipmentBrand) => {
      const idx = MARCAS_PRIORITARIAS_COMPRESSOR.indexOf(norm(b.name));
      return idx === -1 ? MARCAS_PRIORITARIAS_COMPRESSOR.length : idx;
    };
    // Sort estável: itens com mesma prioridade mantêm a ordem original.
    return brands
      .map((b, i) => ({ b, i }))
      .sort((a, c) => prioridade(a.b) - prioridade(c.b) || a.i - c.i)
      .map((x) => x.b);
  }, [brands, domain]);

  const { data: allModels = [], isLoading: loadingModels } = useAllModelsWithBrand(domain);
  const { data: allErrorCodes = [], isLoading: loadingCodes } = useAllErrorCodesWithModel();

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

  const activeFilterCount = selectedBtus.length + selectedTypes.length;
  const filtering = !searching && activeFilterCount > 0;

  // Modelos que casam com os filtros ativos (todas as marcas).
  const filteredModels = useMemo(() => {
    if (!filtering) return [];
    const matched = allModels.filter(
      (m) =>
        (selectedBtus.length === 0 || selectedBtus.includes(String(btuNumero(m.name)))) &&
        (selectedTypes.length === 0 || selectedTypes.includes(m.category?.name ?? '')),
    );
    return ordenarPorBtu(matched);
  }, [allModels, filtering, selectedBtus, selectedTypes]);

  const limparFiltros = () => {
    setSelectedBtus([]);
    setSelectedTypes([]);
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
          <h2 className="text-base font-semibold tracking-tight md:text-xl">Equipamentos</h2>
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
                      onSelectDetail={() => onSelectModelDetail(model)}
                      onAbrirCompressor={onAbrirCompressor}
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
                  onSelectDetail={() => onSelectModelDetail(model)}
                  onAbrirCompressor={onAbrirCompressor}
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
                <img
                  src={brand.logo_url}
                  alt={brand.name}
                  className="max-h-12 max-w-[85%] object-contain"
                  loading="lazy"
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
  onAbrirCompressor,
}: {
  brand: EquipmentBrand;
  domain: EquipmentDomain;
  onBack: () => void;
  onSelectBrand: (brand: EquipmentBrand) => void;
  onSelectDetail: (model: EquipmentModel) => void;
  /** Abre o compressor típico (cross-ref) a partir do id mapeado no modelo. */
  onAbrirCompressor: (compressorModelId: string) => void;
}) {
  const { data: models = [], isLoading } = useEquipmentModelsByBrand(brand.id, domain);
  const { data: brands = [] } = useEquipmentBrands(domain);

  // Carrossel de marcas: a marca atual fica no centro, vizinhas espiam nas
  // laterais. Snapar/tocar numa marca diferente troca a marca ativa (onSelectBrand).
  const [api, setApi] = useState<CarouselApi>();
  const brandIndex = useMemo(
    () => Math.max(0, brands.findIndex((b) => b.id === brand.id)),
    [brands, brand.id],
  );
  const [selectedSnap, setSelectedSnap] = useState(brandIndex);

  // Ao snapar numa marca diferente, troca a marca ativa (guard por id evita loop).
  useEffect(() => {
    if (!api) return;
    const onSelect = () => {
      const idx = api.selectedScrollSnap();
      setSelectedSnap(idx);
      const novaMarca = brands[idx];
      if (novaMarca && novaMarca.id !== brand.id) onSelectBrand(novaMarca);
    };
    api.on('select', onSelect);
    return () => {
      api.off('select', onSelect);
    };
  }, [api, brands, brand.id, onSelectBrand]);

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

  const activeFilterCount = selectedBtus.length + selectedTypes.length;
  const limparFiltros = () => {
    setSelectedBtus([]);
    setSelectedTypes([]);
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
      return buscaOk && btuOk && tipoOk;
    });
    return ordenarPorBtu(filtrados);
  }, [models, q, selectedBtus, selectedTypes]);

  const semResultado =
    !isLoading && models.length > 0 && modelosVisiveis.length === 0;

  return (
    <div className="space-y-6 pb-8">
      <Header icon={Boxes} title="Equipamentos" subtitle={brand.name} onBack={onBack} />

      {/* Carrossel de marcas: a atual no centro, vizinhas espiando nas laterais.
          Deslizar/tocar numa marca troca a marca ativa (mostra os modelos dela). */}
      {brands.length > 1 ? (
        <Carousel
          opts={{ align: 'center', startIndex: brandIndex }}
          setApi={setApi}
          className="-mx-1"
        >
          <CarouselContent>
            {brands.map((b, i) => {
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
                      <img
                        src={b.logo_url}
                        alt={b.name}
                        className="max-h-16 max-w-[80%] object-contain"
                        loading="lazy"
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
            <img
              src={brand.logo_url}
              alt={brand.name}
              className="max-h-16 max-w-[60%] object-contain"
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
              onSelectDetail={() => onSelectDetail(model)}
              onAbrirCompressor={onAbrirCompressor}
            />
          ))}
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
      return { label: 'Como configurar', icon: Settings2 };
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
  onAbrirCompressor,
}: {
  model: EquipmentModel;
  domain: EquipmentDomain;
  brandName: string;
  onSelectDetail: () => void;
  /** Abre o compressor típico (cross-ref) a partir do id mapeado no modelo. */
  onAbrirCompressor: (compressorModelId: string) => void;
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

  // Cross-ref: máquinas (AC/linha branca) podem ter um compressor típico mapeado.
  const compressorTipicoId =
    (domain === 'ar_condicionado' || domain === 'linha_branca') && model.compressor_model_id
      ? model.compressor_model_id
      : null;
  // AC e Linha Branca baixam manual; Compressor baixa "Datasheet" (mesma URL).
  const segundoBotao: 'manual' | 'datasheet' | null =
    domain === 'compressor' ? 'datasheet' : domain === 'controle_remoto' ? null : 'manual';

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
          <img
            src={model.image_url!}
            alt={model.name}
            className="h-full w-full object-contain"
            loading="lazy"
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
                  <span
                    className="rounded-md px-2 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: cor, color: idealForeground(cor) }}
                  >
                    {model.refrigerant}
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

        {/* Ações diretas — sem modal intermediário (tema normal: outline lê no dark).
            Controle remoto tem só 1 ação (ocupa a largura cheia). */}
        <div className={cn('mt-4 grid gap-2', segundoBotao ? 'grid-cols-2' : 'grid-cols-1')}>
          <Button variant="outline" size="sm" onClick={onSelectDetail} className="w-full">
            <DetalheIcon className="h-4 w-4" />
            {detalhe.label}
          </Button>

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
                <Download className="h-4 w-4" />
                Baixar manual
              </Button>
            ) : (
              <div className="flex items-center justify-center rounded-md bg-destructive px-2 py-2 text-xs font-semibold text-white">
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
                <FileText className="h-4 w-4" />
                Datasheet
              </Button>
            ) : (
              <div className="flex items-center justify-center rounded-md bg-destructive px-2 py-2 text-xs font-semibold text-white">
                Datasheet Indisponível
              </div>
            ))}
        </div>

        {/* Cross-ref: compressor TÍPICO desta capacidade (não o exato).
            Só aparece em máquinas (AC/linha branca) com mapeamento. */}
        {compressorTipicoId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAbrirCompressor(compressorTipicoId)}
            className="mt-2 w-full"
          >
            <CompressorGlyph className="h-4 w-4" />
            Compressor
          </Button>
        )}
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
        title="Código de Erro"
        subtitle={tituloTopo}
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
  onBack,
  backDesktopOnly,
  action,
}: {
  icon: typeof Boxes;
  title: string;
  subtitle?: string;
  onBack: () => void;
  backDesktopOnly?: boolean;
  /** Ação opcional alinhada à direita (ex: favoritar). */
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button
        variant="ghost"
        size="icon"
        className={cn('shrink-0', backDesktopOnly && 'hidden lg:flex')}
        onClick={onBack}
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Icon className="h-6 w-6 text-foreground/70 shrink-0" />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight truncate lg:text-2xl">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
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
