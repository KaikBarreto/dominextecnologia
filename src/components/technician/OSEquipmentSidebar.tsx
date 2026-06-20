import { Package, CheckCircle2, AlertTriangle, Circle } from 'lucide-react';
import { SignedImg } from '@/components/ui/SignedImg';
import { cn } from '@/lib/utils';

/**
 * Status agregado de UM equipamento na sidebar de navegação da OS (só desktop):
 * - 'ok'        → tudo conforme/concluído (verde / success)
 * - 'pending'   → tem item sem resposta (laranja / warning)
 * - 'issue'     → tem item não-conforme (vermelho / destructive)
 * - 'neutral'   → sem checklist/sem status definido (cinza)
 */
export type OSEquipmentNavStatus = 'ok' | 'pending' | 'issue' | 'neutral';

export interface OSEquipmentNavItem {
  /** Chave única (equipment_id ou sentinela "geral"). */
  key: string;
  /** id da âncora no <main> pra rolar até a seção do equipamento. */
  anchorId: string;
  name: string;
  /** Subtítulo opcional (marca + modelo, ou template). */
  subtitle?: string | null;
  photoUrl?: string | null;
  categoryColor?: string | null;
  status: OSEquipmentNavStatus;
}

const STATUS_META: Record<
  OSEquipmentNavStatus,
  { dot: string; icon: typeof CheckCircle2; iconClass: string }
> = {
  ok: { dot: 'bg-success', icon: CheckCircle2, iconClass: 'text-success' },
  pending: { dot: 'bg-warning', icon: Circle, iconClass: 'text-warning' },
  issue: { dot: 'bg-destructive', icon: AlertTriangle, iconClass: 'text-destructive' },
  neutral: { dot: 'bg-muted-foreground/40', icon: Circle, iconClass: 'text-muted-foreground/50' },
};

interface OSEquipmentSidebarProps {
  items: OSEquipmentNavItem[];
  /** key do item destacado (seção visível / clicada). */
  activeKey?: string | null;
  onSelect: (item: OSEquipmentNavItem) => void;
  /** Altura do header sticky em px, pra alinhar o sticky-top da sidebar. */
  topOffset?: number;
}

/**
 * Sidebar de equipamentos/checklists da OS — EXCLUSIVA DO DESKTOP (lg+).
 * No mobile o componente inteiro fica oculto (`hidden lg:flex`), preservando a
 * pilha vertical de campo. Clique rola suave até a seção do equipamento no
 * conteúdo central. Status agregado vira bolinha + ícone semântico por token.
 */
export function OSEquipmentSidebar({
  items,
  activeKey,
  onSelect,
  topOffset = 0,
}: OSEquipmentSidebarProps) {
  if (items.length === 0) return null;

  return (
    <aside
      className="hidden lg:flex lg:flex-col lg:w-64 shrink-0 lg:sticky lg:self-start overflow-y-auto"
      style={{
        top: topOffset,
        maxHeight: `calc(100vh - ${topOffset}px)`,
      }}
      aria-label="Equipamentos da OS"
    >
      <div className="py-4 pr-1 space-y-1">
        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Equipamentos
        </p>
        {items.map((item) => {
          const meta = STATUS_META[item.status];
          const Icon = meta.icon;
          const isActive = activeKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item)}
              className={cn(
                'w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors',
                isActive
                  ? 'bg-primary/10 ring-1 ring-primary/30'
                  : 'hover:bg-muted/60'
              )}
            >
              <div className="relative shrink-0">
                {item.photoUrl ? (
                  <SignedImg
                    src={item.photoUrl}
                    alt={item.name}
                    className="h-9 w-9 rounded-md object-cover border"
                  />
                ) : (
                  <div
                    className="h-9 w-9 rounded-md flex items-center justify-center border"
                    style={{
                      backgroundColor: item.categoryColor
                        ? `${item.categoryColor}22`
                        : undefined,
                    }}
                  >
                    <Package
                      className="h-4 w-4"
                      style={{ color: item.categoryColor || undefined }}
                    />
                  </div>
                )}
                <span
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background',
                    meta.dot
                  )}
                  aria-hidden
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                {item.subtitle && (
                  <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                )}
              </div>
              <Icon className={cn('h-4 w-4 shrink-0', meta.iconClass)} aria-hidden />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
