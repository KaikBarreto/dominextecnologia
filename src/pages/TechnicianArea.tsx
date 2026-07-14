import { useState } from 'react';
import {
  Routes,
  Route,
  useParams,
  useNavigate,
  useSearchParams,
  useLocation,
  Navigate,
} from 'react-router-dom';
import { Home, Lock, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AreaTecnicoIcon } from '@/components/icons/MenuIcons';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { cn } from '@/lib/utils';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { SegmentToolsSwitcher } from '@/components/technician-area/SegmentToolsSwitcher';
import { SegmentLockedScreen } from '@/components/technician-area/SegmentLockedScreen';
import { getTechToolsForSegment, getTeaserToolsForSegment } from '@/config/technicianArea';
import DarkVeilBackground from '@/components/ui/DarkVeilBackground';
import { getSegment } from '@/utils/companySegments';
import { Inicio } from '@/components/technician-area/Inicio';
import { CargaTermica } from '@/components/technician-area/CargaTermica';
import { Conversao, type ConversaoInicial } from '@/components/technician-area/Conversao';
import { Catalogo } from '@/components/technician-area/Catalogo';
import { CalculoCapacitor } from '@/components/technician-area/CalculoCapacitor';
import { CaboEletrico } from '@/components/technician-area/CaboEletrico';
import { Superaquecimento } from '@/components/technician-area/Superaquecimento';
import { ReguaGases } from '@/components/technician-area/ReguaGases';
import { RetrofitGas } from '@/components/technician-area/RetrofitGas';
import { CicloRefrigeracao } from '@/components/technician-area/CicloRefrigeracao';
import { DiluicaoProduto } from '@/components/technician-area/DiluicaoProduto';
import type { ConversaoCategoria } from '@/lib/conversoes';

const TOOLS_BASE = '/area-tecnico';

/** Ferramentas cuja sub-tela tem voltar PRÓPRIO (lista ↔ detalhe). O "Voltar" do
 *  shell some pra elas pra evitar dois botões de voltar (régua CEO). Usado só no
 *  modo EMBEDDED (no modo rota a decisão é por profundidade de rota). */
const TOOLS_WITH_OWN_BACK = new Set<string>(['catalogo']);

type ToolTab =
  | 'inicio'
  | 'catalogo'
  | 'carga-termica'
  | 'conversao'
  | 'calculo-capacitor'
  | 'cabo-eletrico'
  | 'superaquecimento'
  | 'regua-gases'
  | 'retrofit-gas'
  | 'ciclo-refrigeracao'
  | 'diluicao-produto';

/** Slugs de ferramenta válidos (sem 'inicio', que é o index). 'catalogo' tem rota
 *  splat própria (`catalogo/*`), os demais são ferramentas simples. */
const TOOL_SLUGS = new Set<string>([
  'catalogo',
  'carga-termica',
  'conversao',
  'calculo-capacitor',
  'cabo-eletrico',
  'superaquecimento',
  'regua-gases',
  'retrofit-gas',
  'ciclo-refrigeracao',
  'diluicao-produto',
]);

/** Alvo de deep-link ao trocar de aba a partir de Recentes/Favoritos do Início. */
export type ToolNavPayload =
  | { tab: 'conversao'; inicial: { categoria: ConversaoCategoria; de: string; para: string } }
  | { tab: 'catalogo'; modeloInicialId: string };

const VALID_CONVERSAO_CATS: ReadonlySet<string> = new Set<ConversaoCategoria>([
  'pressao',
  'temperatura',
  'potencia',
  'comprimento',
]);

interface TechnicianAreaProps {
  /**
   * `true` quando renderizado EMBUTIDO no overlay da OS (`/os-tecnico/:id`), onde
   * NÃO existe `/area-tecnico/*` na URL. Nesse modo a navegação é por
   * useState interno (comportamento legado, zero regressão). No modo default
   * (rota) usa `<Routes>` + navigate.
   */
  embedded?: boolean;
}

/**
 * "Área do Técnico™" — utilidades de campo 100% client-side / offline.
 * MODO DUPLO:
 *  - rota (default): navegação por URL (`/area-tecnico/<tab>`, `?nicho`).
 *  - embedded (overlay da OS): navegação por estado interno.
 */
export default function TechnicianArea({ embedded = false }: TechnicianAreaProps) {
  return embedded ? <EmbeddedTools /> : <RouteTools />;
}

// ---------------------------------------------------------------------------
// Dados compartilhados de nicho/ferramentas (idêntico nos dois modos).
// ---------------------------------------------------------------------------
function useSegmentNav(selectedSegment: string | null) {
  const { settings } = useCompanySettings();
  const companySegment = settings?.segment ?? null;
  const effectiveSegment = selectedSegment ?? companySegment ?? null;
  const isOwnSegment = !!companySegment && effectiveSegment === companySegment;
  const isLocked = !!effectiveSegment && !isOwnSegment;

  const tools = getTechToolsForSegment(companySegment);
  const teaserTools = getTeaserToolsForSegment(effectiveSegment);
  const navItems = isLocked
    ? teaserTools.map((t) => ({ value: t.id, label: t.label, icon: t.icon, locked: true }))
    : [
        { value: 'inicio', label: 'Início', icon: Home, locked: false },
        ...tools.map((t) => ({ value: t.id, label: t.label, icon: t.icon, locked: false })),
      ];

  return { companySegment, effectiveSegment, isOwnSegment, isLocked, navItems };
}

// ---------------------------------------------------------------------------
// SHELL — header + switcher + sidebar/pills. Renderiza `content` na área central.
// ---------------------------------------------------------------------------
interface ShellProps {
  companySegment: string | null;
  effectiveSegment: string | null;
  isOwnSegment: boolean;
  isLocked: boolean;
  navItems: { value: string; label: string; icon: React.ComponentType<{ className?: string }>; locked: boolean }[];
  activeTab: string;
  /** Largura total (Início / Catálogo) vs. coluna estreita centralizada. */
  isFullWidthTool: boolean;
  /** Mostra o botão "Voltar" do shell (só raiz de ferramenta, nunca catálogo). */
  showBack: boolean;
  onBack: () => void;
  onSwitchTab: (tab: string) => void;
  onSelectSegment: (value: string) => void;
  content: React.ReactNode;
  /**
   * Quando true (exclusivo do modo embedded), renderiza o cabeçalho com DarkVeil
   * full-bleed na cor do segmento selecionado. Modo rota nunca passa esta prop
   * (default false) — zero regressão.
   */
  showSegmentVeil?: boolean;
}

function ToolsShell({
  companySegment,
  effectiveSegment,
  isOwnSegment,
  isLocked,
  navItems,
  activeTab,
  isFullWidthTool,
  showBack,
  onBack,
  onSwitchTab,
  onSelectSegment,
  content,
  showSegmentVeil = false,
}: ShellProps) {
  // Cor do veil: segmento selecionado > segmento da empresa > verde Dominex.
  const veilColor =
    getSegment(effectiveSegment)?.color ??
    getSegment(companySegment)?.color ??
    '#00C597';

  // Miolo do cabeçalho — reutilizado tanto no modo veil quanto no modo padrão.
  // `withVeil` alterna as cores de texto para branco forçado (legibilidade sobre fundo escuro colorido).
  const headerInner = (withVeil: boolean) => (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-2">
        <AreaTecnicoIcon
          className={cn(
            'h-6 w-6 shrink-0 lg:h-7 lg:w-7',
            withVeil ? 'text-white/90' : 'text-foreground/70',
          )}
        />
        <h1
          className={cn(
            'text-lg font-semibold tracking-tight lg:text-2xl',
            withVeil && 'text-white',
          )}
        >
          Área do Técnico™
        </h1>
      </div>
      {companySegment && (
        <SegmentToolsSwitcher
          selected={effectiveSegment ?? ''}
          companySegment={companySegment}
          onSelect={onSelectSegment}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-6 lg:space-y-6">
      {/* Header — hub raiz das Ferramentas. Título em cima, seletor de nicho
          EMBAIXO (empilhado) em todas as larguras — mobile e desktop (régua
          CEO: no desktop o select fica abaixo do título, não ao lado). */}
      {showSegmentVeil ? (
        /* Faixa full-bleed com DarkVeil na cor do segmento. As margens negativas
           compensam o padding lateral do container pai (p-5 / sm:p-6) e o
           marginTop negativo sobe até o topo, cobrindo o paddingTop do overlay
           (incluindo safe-area-inset-top). O overflow-hidden garante que o veil
           não vaze para fora da faixa do cabeçalho. */
        <div
          className="relative -mx-5 overflow-hidden sm:-mx-6"
          style={{ marginTop: 'calc(-1 * max(1.25rem, env(safe-area-inset-top)))' }}
        >
          {/* Camada 1: DarkVeil animado na cor do segmento */}
          <div className="absolute inset-0">
            <DarkVeilBackground accentColor={veilColor} speed={1.2} forceWebGL />
          </div>
          {/* Camada 2: scrim leve pra garantir legibilidade do título sobre o veil */}
          <div aria-hidden className="absolute inset-0 bg-black/25" />
          {/* Camada 3: conteúdo do header. paddingTop com folga extra (safe-area +
              2rem) — respiro maior no topo ao abrir o overlay, sem descolar o veil
              do topo (o marginTop negativo do container continua chegando na borda). */}
          <div
            className="relative z-10 px-5 pb-5 sm:px-6"
            style={{ paddingTop: 'calc(env(safe-area-inset-top) + 2rem)' }}
          >
            {headerInner(true)}
          </div>
        </div>
      ) : (
        headerInner(false)
      )}

      {/* Pills (mobile). */}
      {(isLocked || (isOwnSegment && activeTab !== 'inicio')) && (
        <div className="lg:hidden">
          <MobilePillTabs
            tabs={navItems.map((t) => ({
              value: t.value,
              label: t.label,
              icon: <t.icon className="h-4 w-4" />,
            }))}
            activeTab={activeTab}
            onTabChange={(v) => onSwitchTab(v)}
          />
        </div>
      )}

      {(isOwnSegment || isLocked) && (
        <div className="lg:flex lg:gap-6">
          {/* Sidebar (desktop) */}
          <nav className="hidden lg:flex lg:w-56 lg:shrink-0 lg:flex-col lg:gap-1">
            {navItems.map((t) => {
              const isActive = activeTab === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => onSwitchTab(t.value)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <t.icon className="h-5 w-5 shrink-0" />
                  <span className="min-w-0 flex-1 break-words text-left leading-tight">{t.label}</span>
                  {t.locked && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                </button>
              );
            })}
          </nav>

          {/* Conteúdo */}
          <div
            className={cn(
              'min-w-0 flex-1',
              !isLocked && !isFullWidthTool && 'mx-auto w-full max-w-4xl',
            )}
          >
            {isLocked ? (
              <SegmentLockedScreen segment={effectiveSegment!} />
            ) : (
              <>
                {showBack && (
                  <div className="mb-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={onBack}
                      className="-ml-2 h-9 gap-1 px-2 text-muted-foreground hover:text-foreground"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Voltar
                    </Button>
                  </div>
                )}
                {content}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MODO ROTA (default) — navegação por URL.
// ---------------------------------------------------------------------------
function RouteTools() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nicho = searchParams.get('nicho');
  const selectedSegment = nicho;

  const { companySegment, effectiveSegment, isOwnSegment, isLocked, navItems } =
    useSegmentNav(selectedSegment);

  // Preserva ?nicho quando travado (vitrine de upsell navega entre teasers).
  const withNicho = (path: string) =>
    isLocked && nicho ? `${path}?nicho=${encodeURIComponent(nicho)}` : path;

  const goTab = (tab: string, payload?: ToolNavPayload) => {
    // Deep-link de modelo (Recentes/Favoritos) → abre direto o detalhe no catálogo.
    if (payload?.tab === 'catalogo' && tab === 'catalogo') {
      navigate(`${TOOLS_BASE}/catalogo/ar_condicionado/modelo/${payload.modeloInicialId}`);
      return;
    }
    if (tab === 'inicio') {
      navigate(withNicho(TOOLS_BASE));
    } else {
      navigate(withNicho(`${TOOLS_BASE}/${tab}`));
    }
  };

  const handleSelectSegment = (value: string) => {
    if (value === companySegment) navigate(TOOLS_BASE);
    else navigate(`${TOOLS_BASE}?nicho=${encodeURIComponent(value)}`);
  };

  return (
    <Routes>
      <Route
        index
        element={
          <RouteShellFrame
            activeTab="inicio"
            companySegment={companySegment}
            effectiveSegment={effectiveSegment}
            isOwnSegment={isOwnSegment}
            isLocked={isLocked}
            navItems={navItems}
            onSwitchTab={goTab}
            onSelectSegment={handleSelectSegment}
            content={<Inicio onNavigate={(id, payload) => goTab(id, payload)} />}
          />
        }
      />
      <Route
        path=":toolId/*"
        element={
          <RouteToolFrame
            companySegment={companySegment}
            effectiveSegment={effectiveSegment}
            isOwnSegment={isOwnSegment}
            isLocked={isLocked}
            navItems={navItems}
            onSwitchTab={goTab}
            onSelectSegment={handleSelectSegment}
            goTab={goTab}
          />
        }
      />
      {/* Rota desconhecida sob /area-tecnico → volta ao hub. */}
      <Route path="*" element={<Navigate to={TOOLS_BASE} replace />} />
    </Routes>
  );
}

/** Frame do index (Início) e telas sem ferramenta específica. */
function RouteShellFrame(props: {
  activeTab: string;
  companySegment: string | null;
  effectiveSegment: string | null;
  isOwnSegment: boolean;
  isLocked: boolean;
  navItems: ShellProps['navItems'];
  onSwitchTab: (tab: string) => void;
  onSelectSegment: (value: string) => void;
  content: React.ReactNode;
}) {
  return (
    <ToolsShell
      companySegment={props.companySegment}
      effectiveSegment={props.effectiveSegment}
      isOwnSegment={props.isOwnSegment}
      isLocked={props.isLocked}
      navItems={props.navItems}
      activeTab={props.activeTab}
      isFullWidthTool={props.activeTab === 'inicio' || props.activeTab === 'catalogo'}
      showBack={false}
      onBack={() => {}}
      onSwitchTab={props.onSwitchTab}
      onSelectSegment={props.onSelectSegment}
      content={props.content}
    />
  );
}

/** Frame de uma ferramenta (`:toolId`). Deriva o conteúdo do slug + query. */
function RouteToolFrame(props: {
  companySegment: string | null;
  effectiveSegment: string | null;
  isOwnSegment: boolean;
  isLocked: boolean;
  navItems: ShellProps['navItems'];
  onSwitchTab: (tab: string) => void;
  onSelectSegment: (value: string) => void;
  goTab: (tab: string) => void;
}) {
  const { toolId } = useParams<{ toolId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  // Slug desconhecido → volta ao hub (preserva ?nicho se travado).
  if (!toolId || !TOOL_SLUGS.has(toolId)) {
    const nicho = searchParams.get('nicho');
    const dest = props.isLocked && nicho ? `${TOOLS_BASE}?nicho=${encodeURIComponent(nicho)}` : TOOLS_BASE;
    return <Navigate to={dest} replace />;
  }

  const activeTab = toolId;
  const isFullWidthTool = activeTab === 'catalogo';

  // Voltar do shell (régua CEO: nunca dois "Voltar"):
  // - Ferramentas simples: mostra na raiz delas.
  // - Catálogo: mostra SÓ na raiz (`catalogo` ou `catalogo/:tab`); nas telas
  //   profundas (marca/modelo/gas) o próprio Header da tela já tem o voltar, então
  //   o shell esconde o dele. Profundidade derivada do pathname.
  let showBack = !props.isLocked;
  if (activeTab === 'catalogo') {
    // Segmentos após ".../catalogo": 0 = redirect, 1 = subaba (raiz), 2+ = profunda.
    const afterCatalogo = location.pathname.split('/catalogo/')[1] ?? '';
    const segs = afterCatalogo.split('/').filter(Boolean);
    const isCatalogRoot = segs.length <= 1; // só a subaba (ou nada)
    showBack = !props.isLocked && isCatalogRoot;
  }

  // Deep-link de conversão por query (?cat&de&para).
  const cat = searchParams.get('cat');
  const de = searchParams.get('de');
  const para = searchParams.get('para');
  const conversaoInicial: ConversaoInicial | undefined =
    activeTab === 'conversao' && cat && VALID_CONVERSAO_CATS.has(cat) && de && para
      ? { categoria: cat as ConversaoCategoria, de, para }
      : undefined;

  let content: React.ReactNode = null;
  switch (activeTab) {
    case 'catalogo':
      content = <Catalogo />;
      break;
    case 'carga-termica':
      content = <CargaTermica />;
      break;
    case 'conversao':
      content = (
        <Conversao key={conversaoInicial ? 'deep' : 'browse'} inicial={conversaoInicial} />
      );
      break;
    case 'calculo-capacitor':
      content = <CalculoCapacitor />;
      break;
    case 'cabo-eletrico':
      content = <CaboEletrico />;
      break;
    case 'superaquecimento':
      content = (
        <Superaquecimento onIrParaCiclo={() => navigate(`${TOOLS_BASE}/ciclo-refrigeracao`)} />
      );
      break;
    case 'regua-gases':
      content = <ReguaGases />;
      break;
    case 'retrofit-gas':
      content = <RetrofitGas />;
      break;
    case 'ciclo-refrigeracao':
      content = <CicloRefrigeracao />;
      break;
    case 'diluicao-produto':
      content = <DiluicaoProduto />;
      break;
  }

  return (
    <ToolsShell
      companySegment={props.companySegment}
      effectiveSegment={props.effectiveSegment}
      isOwnSegment={props.isOwnSegment}
      isLocked={props.isLocked}
      navItems={props.navItems}
      activeTab={activeTab}
      isFullWidthTool={isFullWidthTool}
      showBack={showBack}
      onBack={() => navigate(TOOLS_BASE)}
      onSwitchTab={props.onSwitchTab}
      onSelectSegment={props.onSelectSegment}
      content={content}
    />
  );
}

// ---------------------------------------------------------------------------
// MODO EMBEDDED (overlay da OS) — navegação por estado interno (legado).
// NÃO usa Router (a URL é /os-tecnico/:id). Zero regressão.
// ---------------------------------------------------------------------------
function EmbeddedTools() {
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const { companySegment, effectiveSegment, isOwnSegment, isLocked, navItems } =
    useSegmentNav(selectedSegment);

  const [activeTab, setActiveTab] = useState<string>('inicio');
  const [pending, setPending] = useState<ToolNavPayload | null>(null);

  const handleNavigate = (tab: ToolTab, payload?: ToolNavPayload) => {
    setPending(payload && payload.tab === tab ? payload : null);
    setActiveTab(tab);
  };

  const switchTab = (tab: string) => {
    setPending(null);
    setActiveTab(tab);
  };

  const handleSelectSegment = (value: string) => {
    setSelectedSegment(value);
    setPending(null);
    setActiveTab('inicio');
  };

  const conversaoInicial =
    pending?.tab === 'conversao' && activeTab === 'conversao' ? pending.inicial : undefined;
  const modeloInicialId =
    pending?.tab === 'catalogo' && activeTab === 'catalogo'
      ? pending.modeloInicialId
      : undefined;

  const isFullWidthTool = activeTab === 'inicio' || activeTab === 'catalogo';
  const showBack =
    activeTab !== 'inicio' && !isLocked && !TOOLS_WITH_OWN_BACK.has(activeTab);

  let content: React.ReactNode = null;
  if (activeTab === 'inicio') content = <Inicio onNavigate={handleNavigate} />;
  else if (activeTab === 'catalogo')
    content = (
      <Catalogo key={modeloInicialId ?? 'browse'} embedded modeloInicialId={modeloInicialId} />
    );
  else if (activeTab === 'carga-termica') content = <CargaTermica />;
  else if (activeTab === 'conversao')
    content = <Conversao key={conversaoInicial ? 'deep' : 'browse'} inicial={conversaoInicial} />;
  else if (activeTab === 'calculo-capacitor') content = <CalculoCapacitor />;
  else if (activeTab === 'cabo-eletrico') content = <CaboEletrico />;
  else if (activeTab === 'superaquecimento')
    content = <Superaquecimento onIrParaCiclo={() => switchTab('ciclo-refrigeracao')} />;
  else if (activeTab === 'regua-gases') content = <ReguaGases />;
  else if (activeTab === 'retrofit-gas') content = <RetrofitGas />;
  else if (activeTab === 'ciclo-refrigeracao') content = <CicloRefrigeracao />;
  else if (activeTab === 'diluicao-produto') content = <DiluicaoProduto />;

  return (
    <ToolsShell
      companySegment={companySegment}
      effectiveSegment={effectiveSegment}
      isOwnSegment={isOwnSegment}
      isLocked={isLocked}
      navItems={navItems}
      activeTab={activeTab}
      isFullWidthTool={isFullWidthTool}
      showBack={showBack}
      onBack={() => switchTab('inicio')}
      onSwitchTab={switchTab}
      onSelectSegment={handleSelectSegment}
      content={content}
      showSegmentVeil
    />
  );
}
