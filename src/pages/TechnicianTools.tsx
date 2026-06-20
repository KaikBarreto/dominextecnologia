import { useState } from 'react';
import { Home, Lock } from 'lucide-react';
import { FerramentasTecnicoIcon } from '@/components/icons/MenuIcons';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { cn } from '@/lib/utils';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { SegmentToolsSwitcher } from '@/components/technician-tools/SegmentToolsSwitcher';
import { SegmentLockedScreen } from '@/components/technician-tools/SegmentLockedScreen';
import { getTechToolsForSegment, getTeaserToolsForSegment } from '@/config/technicianTools';
import { Inicio } from '@/components/technician-tools/Inicio';
import { CargaTermica } from '@/components/technician-tools/CargaTermica';
import { Conversao } from '@/components/technician-tools/Conversao';
import { Equipamentos } from '@/components/technician-tools/Equipamentos';
import { CalculoCapacitor } from '@/components/technician-tools/CalculoCapacitor';
import { CaboEletrico } from '@/components/technician-tools/CaboEletrico';
import { Superaquecimento } from '@/components/technician-tools/Superaquecimento';
import { ReguaGases } from '@/components/technician-tools/ReguaGases';
import { RetrofitGas } from '@/components/technician-tools/RetrofitGas';
import { CicloRefrigeracao } from '@/components/technician-tools/CicloRefrigeracao';
import type { ConversaoCategoria } from '@/lib/conversoes';

type ToolTab =
  | 'inicio'
  | 'equipamentos'
  | 'carga-termica'
  | 'conversao'
  | 'calculo-capacitor'
  | 'cabo-eletrico'
  | 'superaquecimento'
  | 'regua-gases'
  | 'retrofit-gas'
  | 'ciclo-refrigeracao';

/** Alvo de deep-link ao trocar de aba a partir de Recentes/Favoritos do Início. */
export type ToolNavPayload =
  | { tab: 'conversao'; inicial: { categoria: ConversaoCategoria; de: string; para: string } }
  | { tab: 'equipamentos'; modeloInicialId: string };

/**
 * "Ferramentas do Técnico" — utilidades de campo 100% client-side / offline.
 * Navegação por abas (estado interno, sem sub-rotas): sidebar vertical no
 * desktop, pills roláveis no mobile. Aba default = Início.
 * É item-pai do menu (igual Operacional/Gestão), por isso o header não tem voltar.
 */
export default function TechnicianTools() {
  const { settings } = useCompanySettings();
  const companySegment = settings?.segment ?? null;

  // Nicho selecionado no seletor. Começa null pra acompanhar o segmento real da
  // empresa enquanto `settings` carrega async (sem efeito extra). Só vira não-nulo
  // quando o técnico escolhe algo no seletor.
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const effectiveSegment = selectedSegment ?? companySegment ?? null;
  const isOwnSegment = !!companySegment && effectiveSegment === companySegment;
  // Nicho escolhido que a empresa NÃO contratou → vitrine de upsell (sidebar de teasers).
  const isLocked = !!effectiveSegment && !isOwnSegment;

  // Navegação:
  //  - nicho contratado → Início (hub, sempre) + ferramentas REAIS do segmento;
  //  - nicho bloqueado  → só as ferramentas-teaser do nicho (sem Início).
  const tools = getTechToolsForSegment(companySegment);
  const teaserTools = getTeaserToolsForSegment(effectiveSegment);
  const navItems = isLocked
    ? teaserTools.map((t) => ({ value: t.id, label: t.label, icon: t.icon, locked: true }))
    : [
        { value: 'inicio', label: 'Início', icon: Home, locked: false },
        ...tools.map((t) => ({ value: t.id, label: t.label, icon: t.icon, locked: false })),
      ];

  // `activeTab` é string crua: no modo locked guarda o slug do teaser (fora do union
  // ToolTab); no modo contratado guarda um ToolTab. O switch de conteúdo real só
  // roda quando NÃO está locked, então as comparações com ToolTab seguem válidas.
  const [activeTab, setActiveTab] = useState<string>('inicio');
  // Alvo pendente de deep-link, consumido pela aba destino na 1ª montagem.
  const [pending, setPending] = useState<ToolNavPayload | null>(null);

  /** Início chama isso pra navegar (com ou sem payload de deep-link). */
  const handleNavigate = (tab: ToolTab, payload?: ToolNavPayload) => {
    setPending(payload && payload.tab === tab ? payload : null);
    setActiveTab(tab);
  };

  // Trocar de aba por pills/sidebar (sem deep-link) limpa o alvo pendente.
  const switchTab = (tab: string) => {
    setPending(null);
    setActiveTab(tab);
  };

  // Trocar de nicho no seletor: volta o conteúdo pro hub (Início) pra não cair
  // numa aba que não existe no nicho escolhido.
  const handleSelectSegment = (value: string) => {
    setSelectedSegment(value);
    setPending(null);
    setActiveTab('inicio');
  };

  const conversaoInicial =
    pending?.tab === 'conversao' && activeTab === 'conversao' ? pending.inicial : undefined;
  const modeloInicialId =
    pending?.tab === 'equipamentos' && activeTab === 'equipamentos'
      ? pending.modeloInicialId
      : undefined;

  // Início (hub de cards) e Equipamentos (grade do catálogo) precisam de toda a
  // largura no desktop. As demais ferramentas são formulários/visuais estreitos
  // e ficam apertados no monitor largo — limitamos a largura e centralizamos.
  const isFullWidthTool = activeTab === 'inicio' || activeTab === 'equipamentos';

  return (
    <div className="space-y-6 lg:space-y-6">
      {/* Header — hub raiz das Ferramentas (item-pai do menu), sem botão de voltar:
          não há tela "anterior" pra onde retornar. As sub-telas do catálogo têm
          o próprio voltar interno. */}
      <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
        <div className="flex items-center gap-2">
          <FerramentasTecnicoIcon className="h-6 w-6 text-foreground/70 shrink-0 lg:h-7 lg:w-7" />
          <h1 className="text-lg font-semibold tracking-tight lg:text-2xl">Ferramentas do Técnico</h1>
        </div>
        {companySegment && (
          <SegmentToolsSwitcher
            selected={effectiveSegment ?? ''}
            companySegment={companySegment}
            onSelect={handleSelectSegment}
          />
        )}
      </div>

      {/* Pills (mobile) — sempre no modo bloqueado (vitrine de teasers); no nicho
          contratado, escondidas na aba Início onde os cards já navegam. */}
      {(isLocked || (isOwnSegment && activeTab !== 'inicio')) && (
        <div className="lg:hidden">
          <MobilePillTabs
            tabs={navItems.map((t) => ({
              value: t.value,
              label: t.label,
              icon: <t.icon className="h-4 w-4" />,
            }))}
            activeTab={activeTab}
            onTabChange={(v) => switchTab(v)}
          />
        </div>
      )}

      {/* Layout unificado: sidebar vertical + conteúdo. Serve o nicho contratado
          (ferramentas reais) e o nicho bloqueado (teasers + gate de upsell). */}
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
                onClick={() => switchTab(t.value)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <t.icon className="h-5 w-5 shrink-0" />
                <span className="min-w-0 flex-1 break-words text-left leading-tight">{t.label}</span>
                {t.locked && (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Conteúdo. No modo bloqueado é sempre o gate de upsell (qualquer teaser
            só destaca o item). No nicho contratado, formulários/visuais estreitos
            ganham max-width centralizado; catálogo e Início ficam em largura total. */}
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
              {activeTab === 'inicio' && <Inicio onNavigate={handleNavigate} />}
              {activeTab === 'equipamentos' && (
                <Equipamentos key={modeloInicialId ?? 'browse'} modeloInicialId={modeloInicialId} />
              )}
              {activeTab === 'carga-termica' && <CargaTermica />}
              {activeTab === 'conversao' && (
                <Conversao key={conversaoInicial ? 'deep' : 'browse'} inicial={conversaoInicial} />
              )}
              {activeTab === 'calculo-capacitor' && <CalculoCapacitor />}
              {activeTab === 'cabo-eletrico' && <CaboEletrico />}
              {activeTab === 'superaquecimento' && (
                <Superaquecimento onIrParaCiclo={() => switchTab('ciclo-refrigeracao')} />
              )}
              {activeTab === 'regua-gases' && <ReguaGases />}
              {activeTab === 'retrofit-gas' && <RetrofitGas />}
              {activeTab === 'ciclo-refrigeracao' && <CicloRefrigeracao />}
            </>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
