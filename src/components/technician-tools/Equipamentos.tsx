import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Boxes,
  Search,
  Loader2,
  FileText,
  AlertCircle,
  ChevronRight,
  PackageSearch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { cn } from '@/lib/utils';
import {
  useEquipmentBrands,
  useEquipmentModelsByBrand,
  useEquipmentErrorCodes,
  useAllModelsWithBrand,
  useAllErrorCodesWithModel,
  type EquipmentBrand,
  type EquipmentModel,
} from '@/hooks/useEquipmentCatalog';

/** Normaliza texto pra busca: minúsculo + sem acento. */
function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Abre o manual (PDF) — não há viewer dedicado no app, então window.open. */
function abrirManual(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

type View =
  | { kind: 'brands' }
  | { kind: 'models'; brand: EquipmentBrand }
  | { kind: 'errors'; model: EquipmentModel; initialCode?: string };

/**
 * Catálogo de equipamentos de ar-condicionado para consulta em campo.
 * Navegação interna por estado (igual padrão da Conversão): marcas → modelos →
 * códigos de erro. A busca do topo é GLOBAL (marca, modelo, código de erro) e
 * é resolvida client-side dentro da própria tela inicial.
 */
export function Equipamentos() {
  const [view, setView] = useState<View>({ kind: 'brands' });

  if (view.kind === 'models') {
    return (
      <ModelosList
        brand={view.brand}
        onBack={() => setView({ kind: 'brands' })}
        onSelectErrors={(model) => setView({ kind: 'errors', model })}
      />
    );
  }

  if (view.kind === 'errors') {
    return (
      <CodigosErro
        model={view.model}
        initialCode={view.initialCode}
        onBack={() => setView({ kind: 'brands' })}
      />
    );
  }

  return (
    <BrandsList
      onSelectBrand={(brand) => setView({ kind: 'models', brand })}
      onSelectModelErrors={(model, initialCode) => setView({ kind: 'errors', model, initialCode })}
    />
  );
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
  onSelectBrand,
  onSelectModelErrors,
}: {
  onSelectBrand: (brand: EquipmentBrand) => void;
  onSelectModelErrors: (model: EquipmentModel, initialCode?: string) => void;
}) {
  const { data: brands = [], isLoading } = useEquipmentBrands();
  const { data: allModels = [], isLoading: loadingModels } = useAllModelsWithBrand();
  const { data: allErrorCodes = [], isLoading: loadingCodes } = useAllErrorCodesWithModel();

  const [termoRaw, setTermoRaw] = useState('');
  const [termo, setTermo] = useState('');

  // Debounce leve da busca.
  useEffect(() => {
    const id = setTimeout(() => setTermo(termoRaw.trim()), 180);
    return () => clearTimeout(id);
  }, [termoRaw]);

  const q = norm(termo);
  const searching = q.length > 0;

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
  const codeGroups = useMemo<GroupedErrorCode[]>(() => {
    if (!searching) return [];
    const hits = allErrorCodes.filter(
      (ec) =>
        norm(ec.code).includes(q) ||
        norm(ec.title).includes(q) ||
        norm(ec.description).includes(q),
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
  }, [allErrorCodes, q, searching]);

  const loadingSearch = loadingModels || loadingCodes;
  const nadaEncontrado =
    searching && !loadingSearch && modelHits.length === 0 && codeGroups.length === 0;

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight md:text-xl">Equipamentos</h2>
        <p className="text-sm text-muted-foreground md:text-base">Consulte modelos e códigos de erro.</p>
      </div>

      {/* Busca global do catálogo */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por marca, equipamento ou código de erro"
            value={termoRaw}
            onChange={(e) => setTermoRaw(e.target.value)}
            className="h-14 pl-10 text-lg"
          />
        </div>
        {!searching && (
          <p className="text-xs text-muted-foreground">
            Ou selecione uma marca para ver os modelos.
          </p>
        )}
      </div>

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
                {modelHits.map((model) => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    brandName={model.brand?.name ?? 'Marca'}
                    onSelectErrors={() => onSelectModelErrors(model)}
                  />
                ))}
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
      ) : /* BROWSE NORMAL — grid de marcas */ isLoading ? (
        <LoadingBlock />
      ) : brands.length === 0 ? (
        <EmptyState
          title="Catálogo em atualização"
          message="As marcas e modelos para consulta estão sendo cadastrados. Volte em breve."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {brands.map((brand) => (
            <button
              key={brand.id}
              type="button"
              onClick={() => onSelectBrand(brand)}
              className={cn(
                'flex h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-4 text-center shadow-sm transition-all',
                'hover:border-primary/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              )}
            >
              {brand.logo_url ? (
                <img
                  src={brand.logo_url}
                  alt={brand.name}
                  className="max-h-12 max-w-[80%] object-contain"
                  loading="lazy"
                />
              ) : (
                <span className="text-base font-semibold leading-tight text-foreground">
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
  onBack,
  onSelectErrors,
}: {
  brand: EquipmentBrand;
  onBack: () => void;
  onSelectErrors: (model: EquipmentModel) => void;
}) {
  const { data: models = [], isLoading } = useEquipmentModelsByBrand(brand.id);

  return (
    <div className="space-y-6 pb-8">
      <Header icon={Boxes} title="Equipamentos" subtitle={brand.name} onBack={onBack} />

      {isLoading ? (
        <LoadingBlock />
      ) : models.length === 0 ? (
        <EmptyState
          title="Nenhum modelo cadastrado"
          message={`Ainda não há modelos da ${brand.name} no catálogo.`}
        />
      ) : (
        <div className="space-y-3">
          {models.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              brandName={brand.name}
              onSelectErrors={() => onSelectErrors(model)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card de modelo + modal "Selecione"                                  */
/* ------------------------------------------------------------------ */

function ModelCard({
  model,
  brandName,
  onSelectErrors,
}: {
  model: EquipmentModel;
  brandName: string;
  onSelectErrors: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={cn(
          'flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition-all',
          'hover:border-primary/40 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
      >
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
          {model.image_url ? (
            <img
              src={model.image_url}
              alt={model.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <PackageSearch className="h-7 w-7 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold leading-tight">{model.name}</p>
          <p className="truncate text-sm text-muted-foreground">{brandName}</p>
          {model.code && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">Cód.: {model.code}</p>
          )}
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </button>

      <ResponsiveModal open={modalOpen} onOpenChange={setModalOpen} title="Selecione">
        <div className="space-y-3 py-2">
          <button
            type="button"
            onClick={() => {
              setModalOpen(false);
              onSelectErrors();
            }}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 active:scale-[0.99]"
          >
            <AlertCircle className="h-6 w-6 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-base font-semibold">Códigos de Erro</p>
              <p className="text-xs text-muted-foreground">Consultar erros do display</p>
            </div>
          </button>

          <button
            type="button"
            disabled={!model.manual_url}
            onClick={() => {
              if (model.manual_url) {
                setModalOpen(false);
                abrirManual(model.manual_url);
              }
            }}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all',
              model.manual_url
                ? 'hover:border-primary/40 active:scale-[0.99]'
                : 'cursor-not-allowed opacity-50',
            )}
          >
            <FileText className="h-6 w-6 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-base font-semibold">Manuais</p>
              <p className="text-xs text-muted-foreground">
                {model.manual_url ? 'Abrir manual do equipamento' : 'Sem manual disponível'}
              </p>
            </div>
          </button>
        </div>
      </ResponsiveModal>
    </>
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

  const filtroNorm = filtro.trim().toLowerCase();
  const filtrados = filtroNorm
    ? codes.filter((c) => c.code.toLowerCase().includes(filtroNorm))
    : codes;

  return (
    <div className="space-y-6 pb-8">
      <Header icon={AlertCircle} title="Código de Erro" subtitle={tituloTopo} onBack={onBack} />

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
}: {
  icon: typeof Boxes;
  title: string;
  subtitle?: string;
  onBack: () => void;
  backDesktopOnly?: boolean;
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
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-6 w-6 text-foreground/70 shrink-0" />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight truncate lg:text-2xl">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
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
