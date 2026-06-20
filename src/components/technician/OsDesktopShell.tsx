import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Package, Check, X, AlertCircle } from 'lucide-react';
import { SignedImg } from '@/components/ui/SignedImg';
import { cn } from '@/lib/utils';

/**
 * Layout DESKTOP dedicado da tela de OS (TechnicianOS + OSReport). TUDO aqui é
 * `lg:` — abaixo de 1024px nada disto aparece e o mobile segue idêntico (a
 * pilha vertical de cards é a fonte da verdade). No desktop a página ganha:
 *  - uma sidebar de equipamentos (status agregado + clique rola até a seção);
 *  - um rodapé de ações fixo sempre visível com os botões do estado atual.
 *
 * Componentes puramente presentacionais: a agregação de status e os handlers
 * vivem na página (que detém os dados/hooks). O rodapé é renderizado via portal
 * no body pra `position: fixed` não ancorar errado sob ancestral transformado
 * (mesmo padrão do SpeedDialFAB e dos overlays fullscreen).
 */

/** Status agregado de um equipamento na sidebar (token semântico). */
export type OsSidebarStatus = 'concluido' | 'pendente' | 'nao_conforme';

export interface OsSidebarItem {
  /** Chave única (equipment_id ou sintética pro item "Geral"). */
  key: string;
  /** Id do elemento-âncora da seção correspondente no conteúdo (scroll target). */
  anchorId: string;
  label: string;
  sublabel?: string | null;
  /** Foto do equipamento (path no bucket → SignedImg). null = ícone Package. */
  photoUrl?: string | null;
  /** Cor da categoria pro fundo do ícone quando não há foto. */
  categoryColor?: string | null;
  status: OsSidebarStatus;
}

const STATUS_META: Record<
  OsSidebarStatus,
  { label: string; icon: typeof Check; dot: string }
> = {
  concluido: { label: 'Concluído', icon: Check, dot: 'bg-success' },
  pendente: { label: 'Pendente', icon: AlertCircle, dot: 'bg-warning' },
  nao_conforme: { label: 'Não-conforme', icon: X, dot: 'bg-destructive' },
};

interface OsEquipmentSidebarProps {
  items: OsSidebarItem[];
  /** Rola suave até a seção do equipamento (e abre o accordion, se a página quiser). */
  onNavigate: (item: OsSidebarItem) => void;
  /**
   * Offset do topo em PIXELS = altura real do header sticky (medida via ref na
   * página). A sidebar começa logo abaixo do header e nunca é coberta por ele.
   */
  topPx: number;
  /**
   * Blocos opcionais renderizados ACIMA da lista de equipamentos (desktop): no
   * fluxo atual recebem Cliente / Técnico / Check-in (versões compactas). null =
   * só a lista de equipamentos.
   */
  header?: ReactNode;
}

/**
 * Sidebar esquerda (desktop) com um item por equipamento + selo de status.
 * `hidden lg:flex` — não existe no mobile. Sticky abaixo do header (offset = altura
 * real do header, em px) com scroll próprio. Quando recebe `header`, mostra também
 * os blocos de contexto (Cliente/Técnico/Check-in) acima dos equipamentos.
 */
export function OsEquipmentSidebar({ items, onNavigate, topPx, header }: OsEquipmentSidebarProps) {
  // Sem equipamentos E sem header de contexto → nada a mostrar.
  if (items.length === 0 && !header) return null;
  return (
    <aside
      className="hidden lg:flex lg:flex-col lg:gap-3 lg:w-80 lg:shrink-0 lg:sticky lg:self-start lg:overflow-y-auto"
      style={{ top: topPx + 16, maxHeight: `calc(100vh - ${topPx + 32}px)` }}
    >
      {header}
      {items.length > 0 && (
      <div className="rounded-lg border border-border bg-card p-2">
        <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Equipamentos
        </p>
        <ul className="space-y-1">
          {items.map((item) => {
            const meta = STATUS_META[item.status];
            const StatusIcon = meta.icon;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onNavigate(item)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
                >
                  {item.photoUrl ? (
                    <SignedImg
                      src={item.photoUrl}
                      alt={item.label}
                      className="h-9 w-9 rounded-md object-cover border shrink-0"
                    />
                  ) : (
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-md shrink-0"
                      style={{ backgroundColor: item.categoryColor || 'hsl(var(--muted))' }}
                    >
                      <Package
                        className={cn('h-4 w-4', item.categoryColor ? 'text-white' : 'text-muted-foreground')}
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                    {item.sublabel && (
                      <p className="truncate text-xs text-muted-foreground">{item.sublabel}</p>
                    )}
                  </div>
                  <span
                    className={cn('flex h-5 w-5 items-center justify-center rounded-full shrink-0', meta.dot)}
                    title={meta.label}
                    aria-label={meta.label}
                  >
                    <StatusIcon className="h-3 w-3 text-white" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      )}
    </aside>
  );
}

interface OsActionFooterProps {
  children: ReactNode;
}

/**
 * Rodapé de ações fixo (desktop). `hidden lg:flex` via portal no body — sempre
 * visível independente da rolagem, acima do conteúdo (z-30) mas abaixo de
 * overlays/modais (z-40/z-60/z-3000). Respeita a safe-area inferior.
 */
export function OsActionFooter({ children }: OsActionFooterProps) {
  const content = (
    <div
      className="fixed inset-x-0 bottom-0 z-30 hidden lg:flex border-t border-border bg-card/95 backdrop-blur shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-3">
        {children}
      </div>
    </div>
  );
  return createPortal(content, document.body);
}
