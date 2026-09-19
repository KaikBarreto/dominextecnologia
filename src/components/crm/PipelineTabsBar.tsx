import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { cn } from '@/lib/utils';
import type { CrmPipeline } from '@/hooks/useCrmPipelines';
import type { RowAction, RowActionVariant } from '@/components/ui/RowActionsMenu';

const variantClasses: Record<RowActionVariant, string> = {
  default:
    'focus:bg-primary focus:text-primary-foreground hover:bg-primary hover:text-primary-foreground data-[highlighted]:bg-primary data-[highlighted]:text-primary-foreground',
  edit:
    'focus:bg-warning focus:text-white hover:bg-warning hover:text-white data-[highlighted]:bg-warning data-[highlighted]:text-white',
  delete:
    'focus:bg-destructive focus:text-white hover:bg-destructive hover:text-white data-[highlighted]:bg-destructive data-[highlighted]:text-white',
};

interface PipelineTabsBarProps {
  pipelines: CrmPipeline[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Cria funil novo (botão "+" à direita das abas). */
  onCreate: () => void;
  /** Itens do menu da engrenagem daquele funil. */
  menuActions: (pipeline: CrmPipeline) => RowAction[];
  /** Mobile = pills roláveis (régua do projeto); desktop = abas quadradas. */
  mobile: boolean;
  configureLabel: string;
  createLabel: string;
  /** Rótulo acessível da faixa de abas (ex: "Funil"). */
  listLabel: string;
  className?: string;
}

/**
 * Abas de funil do CRM, à direita do título (que é o NOME do funil atual).
 *
 * DESKTOP: abas QUADRADAS (pedido explícito do CEO: "sem arredondamento"),
 * com indicador de ativo por borda inferior. A engrenagem de cada aba aparece
 * no HOVER.
 *
 * MOBILE: hover NÃO EXISTE. Em vez de inventar long-press (gesto invisível,
 * sem affordance), a engrenagem fica SEMPRE VISÍVEL na aba ATIVA — tocar numa
 * aba inativa primeiro a seleciona, e aí a engrenagem dela aparece. Isso
 * mantém uma engrenagem só na tela (não polui 8 abas com 8 ícones) e nenhum
 * caminho fica inalcançável no toque. O container é o `MobilePillTabs` já
 * existente (pills roláveis com âncora à esquerda e fade nas bordas — régua do
 * projeto), usando o slot `renderSuffix`, que existe exatamente pra pendurar
 * ícone de ação na pill sem aninhar <button> dentro de <button>.
 *
 * Muitos funis não estouram a faixa: as abas rolam na horizontal com fade nas
 * bordas, e o "+" fica FORA da área rolável (sempre alcançável).
 */
export function PipelineTabsBar({
  pipelines,
  selectedId,
  onSelect,
  onCreate,
  menuActions,
  mobile,
  configureLabel,
  createLabel,
  listLabel,
  className,
}: PipelineTabsBarProps) {
  // Qual engrenagem está com o menu aberto — o ícone não pode sumir embaixo do
  // próprio menu quando o mouse sai da aba.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const updateFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 1);
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateFades, { passive: true });
    const ro = new ResizeObserver(updateFades);
    ro.observe(el);
    updateFades();
    return () => {
      el.removeEventListener('scroll', updateFades);
      ro.disconnect();
    };
  }, [updateFades, pipelines.length]);

  // Mesma máscara do MobilePillTabs (superfície-agnóstica): borda transparente
  // só do lado que tem conteúdo escondido.
  const maskStyle: React.CSSProperties = (() => {
    if (showLeft && showRight) {
      const g = 'linear-gradient(to right, transparent 0, black 20px, black calc(100% - 20px), transparent 100%)';
      return { WebkitMaskImage: g, maskImage: g };
    }
    if (showLeft) {
      const g = 'linear-gradient(to right, transparent 0, black 20px)';
      return { WebkitMaskImage: g, maskImage: g };
    }
    if (showRight) {
      const g = 'linear-gradient(to left, transparent 0, black 20px)';
      return { WebkitMaskImage: g, maskImage: g };
    }
    return {};
  })();

  const gearFor = (pipeline: CrmPipeline, isActive: boolean, forMobile: boolean) => {
    const actions = menuActions(pipeline).filter((a) => !a.hidden);
    if (actions.length === 0) return null;
    const isOpen = openMenuId === pipeline.id;
    return (
      <DropdownMenu
        open={isOpen}
        onOpenChange={(o) => setOpenMenuId(o ? pipeline.id : null)}
        modal={false}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={configureLabel}
            title={configureLabel}
            data-pipeline-gear={pipeline.id}
            onClick={(e) => {
              e.stopPropagation();
              // Engrenagem de aba inativa também troca de funil: configurar um
              // funil que não está na tela deixaria o usuário perdido.
              if (!isActive) onSelect(pipeline.id);
            }}
            className={cn(
              'inline-flex items-center justify-center shrink-0 transition-opacity',
              forMobile
                ? 'h-7 w-7 rounded-full hover:bg-black/10'
                : 'h-7 w-7 rounded-none hover:bg-muted',
              // Mobile: só na aba ativa. Desktop: no hover da aba, e sempre na
              // ativa e enquanto o menu dela estiver aberto.
              !forMobile && !isActive && !isOpen && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            )}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[200px]">
          {actions.map((action, i) => {
            const Icon = action.icon;
            return (
              <DropdownMenuItem
                key={i}
                disabled={action.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  action.onClick(e);
                  setOpenMenuId(null);
                }}
                className={cn('gap-2 cursor-pointer', variantClasses[action.variant ?? 'default'])}
              >
                <Icon className="h-4 w-4" />
                <span>{action.label}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const createButton = (
    <button
      type="button"
      onClick={onCreate}
      aria-label={createLabel}
      title={createLabel}
      data-pipeline-create="true"
      className={cn(
        'inline-flex items-center justify-center shrink-0 h-9 w-9 border text-muted-foreground',
        'hover:bg-muted hover:text-foreground transition-colors',
        mobile ? 'rounded-full' : 'rounded-none',
      )}
    >
      <Plus className="h-4 w-4" />
    </button>
  );

  if (mobile) {
    return (
      <div className={cn('flex items-center gap-2 min-w-0', className)}>
        <div className="min-w-0 flex-1">
          <MobilePillTabs
            className="-ml-3 mr-0"
            tabs={pipelines.map((p) => ({ value: p.id, label: p.name }))}
            activeTab={selectedId ?? ''}
            onTabChange={onSelect}
            renderSuffix={(tab, isActive) => {
              if (!isActive) return null;
              const pipeline = pipelines.find((p) => p.id === tab.value);
              return pipeline ? gearFor(pipeline, true, true) : null;
            }}
          />
        </div>
        {createButton}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1 min-w-0', className)}>
      <div
        ref={scrollRef}
        role="tablist"
        aria-label={listLabel}
        style={maskStyle}
        className="flex items-end gap-1 min-w-0 overflow-x-auto scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {pipelines.map((p) => {
          const isActive = selectedId === p.id;
          return (
            <div
              key={p.id}
              className={cn(
                'group shrink-0 flex items-center gap-0.5 pr-1 border-b-2 transition-colors',
                isActive ? 'border-primary' : 'border-transparent hover:border-muted-foreground/30',
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                data-pipeline-tab={p.id}
                onClick={() => onSelect(p.id)}
                className={cn(
                  'h-9 px-2.5 rounded-none text-sm font-medium whitespace-nowrap transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {p.name}
              </button>
              {gearFor(p, isActive, false)}
            </div>
          );
        })}
      </div>
      {createButton}
    </div>
  );
}
