import { useState } from 'react';
import { Wrench, Thermometer, ArrowLeftRight, Boxes, Zap, Home, Snowflake, Table2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { cn } from '@/lib/utils';
import { Inicio } from '@/components/technician-tools/Inicio';
import { CargaTermica } from '@/components/technician-tools/CargaTermica';
import { Conversao } from '@/components/technician-tools/Conversao';
import { Equipamentos } from '@/components/technician-tools/Equipamentos';
import { CalculoCapacitor } from '@/components/technician-tools/CalculoCapacitor';
import { Superaquecimento } from '@/components/technician-tools/Superaquecimento';
import { ReguaGases } from '@/components/technician-tools/ReguaGases';
import type { ConversaoCategoria } from '@/lib/conversoes';

type ToolTab =
  | 'inicio'
  | 'equipamentos'
  | 'carga-termica'
  | 'conversao'
  | 'calculo-capacitor'
  | 'superaquecimento'
  | 'regua-gases';

/** Alvo de deep-link ao trocar de aba a partir de Recentes/Favoritos do Início. */
export type ToolNavPayload =
  | { tab: 'conversao'; inicial: { categoria: ConversaoCategoria; de: string; para: string } }
  | { tab: 'equipamentos'; modeloInicialId: string };

interface ToolDef {
  value: ToolTab;
  label: string;
  icon: LucideIcon;
}

const TOOLS: ToolDef[] = [
  { value: 'inicio', label: 'Início', icon: Home },
  { value: 'equipamentos', label: 'Equipamentos', icon: Boxes },
  { value: 'carga-termica', label: 'Carga Térmica', icon: Thermometer },
  { value: 'conversao', label: 'Conversão', icon: ArrowLeftRight },
  { value: 'calculo-capacitor', label: 'Cálculo de Capacitor', icon: Zap },
  { value: 'superaquecimento', label: 'Superaquecimento', icon: Snowflake },
  { value: 'regua-gases', label: 'Régua de Gases', icon: Table2 },
];

interface TechnicianToolsProps {
  /** Esconde o botão de voltar do header (ex: dentro do overlay da OS, que já tem o próprio "Voltar para OS"). */
  hideBack?: boolean;
}

/**
 * "Ferramentas do Técnico" — utilidades de campo 100% client-side / offline.
 * Navegação por abas (estado interno, sem sub-rotas): sidebar vertical no
 * desktop, pills roláveis no mobile. Aba default = Início.
 */
export default function TechnicianTools({ hideBack }: TechnicianToolsProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ToolTab>('inicio');
  // Alvo pendente de deep-link, consumido pela aba destino na 1ª montagem.
  const [pending, setPending] = useState<ToolNavPayload | null>(null);

  /** Início chama isso pra navegar (com ou sem payload de deep-link). */
  const handleNavigate = (tab: ToolTab, payload?: ToolNavPayload) => {
    setPending(payload && payload.tab === tab ? payload : null);
    setActiveTab(tab);
  };

  // Trocar de aba por pills/sidebar (sem deep-link) limpa o alvo pendente.
  const switchTab = (tab: ToolTab) => {
    setPending(null);
    setActiveTab(tab);
  };

  const conversaoInicial =
    pending?.tab === 'conversao' && activeTab === 'conversao' ? pending.inicial : undefined;
  const modeloInicialId =
    pending?.tab === 'equipamentos' && activeTab === 'equipamentos'
      ? pending.modeloInicialId
      : undefined;

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        {!hideBack && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 hidden lg:flex"
            onClick={() => navigate(-1)}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <Wrench className="h-6 w-6 text-foreground/70 shrink-0 lg:h-7 lg:w-7" />
        <h1 className="text-lg font-semibold tracking-tight lg:text-2xl">Ferramentas do Técnico</h1>
      </div>

      {/* Pills (mobile) — escondidas na aba Início, onde os cards já fazem a navegação */}
      {activeTab !== 'inicio' && (
        <div className="lg:hidden">
          <MobilePillTabs
            tabs={TOOLS.map((t) => ({
              value: t.value,
              label: t.label,
              icon: <t.icon className="h-4 w-4" />,
            }))}
            activeTab={activeTab}
            onTabChange={(v) => switchTab(v as ToolTab)}
          />
        </div>
      )}

      {/* Layout desktop: sidebar vertical + conteúdo */}
      <div className="lg:flex lg:gap-6">
        {/* Sidebar (desktop) */}
        <nav className="hidden lg:flex lg:w-56 lg:shrink-0 lg:flex-col lg:gap-1">
          {TOOLS.map((t) => {
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
                <span className="truncate whitespace-nowrap">{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Conteúdo da ferramenta */}
        <div className="min-w-0 flex-1">
          {activeTab === 'inicio' && <Inicio onNavigate={handleNavigate} />}
          {activeTab === 'equipamentos' && (
            <Equipamentos key={modeloInicialId ?? 'browse'} modeloInicialId={modeloInicialId} />
          )}
          {activeTab === 'carga-termica' && <CargaTermica />}
          {activeTab === 'conversao' && (
            <Conversao key={conversaoInicial ? 'deep' : 'browse'} inicial={conversaoInicial} />
          )}
          {activeTab === 'calculo-capacitor' && <CalculoCapacitor />}
          {activeTab === 'superaquecimento' && <Superaquecimento />}
          {activeTab === 'regua-gases' && <ReguaGases />}
        </div>
      </div>
    </div>
  );
}
