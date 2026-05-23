import { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Search as SearchIcon, User as UserIcon, Calendar as CalendarIcon } from 'lucide-react';

import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ServiceOrder } from '@/types/database';
import { getStatusBadgeClass } from '@/components/schedule/EventCard';

/**
 * Modal de busca paginada de OS / tarefas dentro da Agenda.
 *
 * - Busca client-side em cima dos dados já carregados (PWA offline-friendly).
 * - Casa por: número da OS, nome do cliente, descrição, título de tarefa,
 *   técnico atribuído, tipo de serviço.
 * - Paginação simples (10 por página, com "Carregar mais").
 * - Selecionar um resultado fecha o modal e dispara `onSelect`.
 *
 * Quem renderiza esse modal cuida de navegar o calendário (mês/semana/dia)
 * pra data da OS selecionada e abrir o painel de detalhe.
 */

const PAGE_SIZE = 10;

export type AgendaSearchOrder = ServiceOrder & {
  customer?: { name?: string | null } | null;
  equipment?: { name?: string | null } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _assignees?: { id: string; name: string }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service_type?: { name?: string | null; color?: string | null } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _isFinancialEvent?: boolean;
};

export interface OsSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: AgendaSearchOrder[];
  onSelect: (order: AgendaSearchOrder) => void;
}

function normalize(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().trim();
}

function matchesQuery(order: AgendaSearchOrder, query: string): boolean {
  if (!query) return true;
  const q = normalize(query);
  if (!q) return true;

  const haystack: string[] = [];
  if (order.order_number !== undefined && order.order_number !== null) {
    haystack.push(String(order.order_number));
  }
  if (order.customer?.name) haystack.push(order.customer.name);
  if (order.equipment?.name) haystack.push(order.equipment.name);
  if (order.description) haystack.push(order.description);
  const taskTitle = (order as unknown as { task_title?: string }).task_title;
  if (taskTitle) haystack.push(taskTitle);
  const serviceType = order.service_type?.name;
  if (serviceType) haystack.push(serviceType);
  if (order._assignees && order._assignees.length > 0) {
    for (const a of order._assignees) haystack.push(a.name);
  }

  return haystack.some((field) => normalize(field).includes(q));
}

function formatScheduledDate(date: string | null | undefined): string {
  if (!date) return 'Sem data';
  try {
    return format(parseISO(date), "dd 'de' MMM yyyy", { locale: ptBR });
  } catch {
    return date;
  }
}

export function OsSearchDialog({ open, onOpenChange, orders, onSelect }: OsSearchDialogProps) {
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset state quando o modal abre/fecha
  useEffect(() => {
    if (open) {
      // Pequeno atraso para o Dialog/Drawer terminar de animar antes do foco
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
    setQuery('');
    setVisibleCount(PAGE_SIZE);
  }, [open]);

  // Reset paginação ao mudar query
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query]);

  const results = useMemo(() => {
    // Filtramos as instâncias "espelho" de OS retomadas (que aparecem em datas
    // adicionais). A OS canônica continua na lista pelo `scheduled_date` original.
    const seen = new Set<string>();
    const filtered: AgendaSearchOrder[] = [];
    for (const o of orders) {
      const isMirror = (o as unknown as { _resumedDisplay?: boolean })._resumedDisplay;
      const isFinancial = !!o._isFinancialEvent;
      if (isMirror || isFinancial) continue;
      if (seen.has(o.id)) continue;
      if (!matchesQuery(o, query)) continue;
      seen.add(o.id);
      filtered.push(o);
    }
    // Ordena: mais recente primeiro (por scheduled_date desc, depois created_at)
    filtered.sort((a, b) => {
      const aDate = a.scheduled_date || '';
      const bDate = b.scheduled_date || '';
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      const aCreated = (a as unknown as { created_at?: string }).created_at || '';
      const bCreated = (b as unknown as { created_at?: string }).created_at || '';
      return bCreated.localeCompare(aCreated);
    });
    return filtered;
  }, [orders, query]);

  const visibleResults = results.slice(0, visibleCount);
  const hasMore = results.length > visibleCount;

  const handleSelect = (order: AgendaSearchOrder) => {
    onSelect(order);
    onOpenChange(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Buscar OS / Tarefa"
      className="max-w-2xl"
    >
      <div className="space-y-3">
        {/* Input de busca */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Número da OS, cliente, descrição, técnico..."
            className="pl-10 h-10"
            autoFocus
          />
        </div>

        {/* Contador */}
        <div className="text-xs text-muted-foreground">
          {query.trim()
            ? `${results.length} resultado${results.length === 1 ? '' : 's'}`
            : `${orders.length} OS / tarefa${orders.length === 1 ? '' : 's'} no total`}
        </div>

        {/* Lista de resultados */}
        <div className="space-y-2 min-h-[120px]">
          {visibleResults.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-muted-foreground">
              <SearchIcon className="h-6 w-6 mb-2 opacity-60" />
              {query.trim()
                ? 'Nenhuma OS encontrada para essa busca.'
                : 'Comece a digitar para buscar.'}
            </div>
          )}

          {visibleResults.map((order) => {
            const statusBadge = getStatusBadgeClass(order.status, order.scheduled_date);
            const taskTitle = (order as unknown as { task_title?: string }).task_title;
            const isTask = (order as unknown as { entry_type?: string }).entry_type === 'tarefa';
            const customerName = order.customer?.name || 'Sem cliente';
            const assigneesText =
              order._assignees && order._assignees.length > 0
                ? order._assignees.map((a) => a.name).join(', ')
                : null;

            return (
              <button
                key={order.id}
                type="button"
                onClick={() => handleSelect(order)}
                className={cn(
                  'w-full text-left p-3 rounded-lg border bg-card transition-colors',
                  'hover:border-primary/40 hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/30',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono font-semibold text-foreground">
                        {isTask ? 'Tarefa' : `OS #${order.order_number ?? '—'}`}
                      </span>
                      {order.service_type?.name && (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                          style={{ backgroundColor: order.service_type.color || '#64748b' }}
                        >
                          {order.service_type.name}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm font-medium truncate">
                      {isTask ? (taskTitle || 'Tarefa') : customerName}
                    </div>
                    {!isTask && order.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {order.description}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3" />
                        {formatScheduledDate(order.scheduled_date)}
                      </span>
                      {assigneesText && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <UserIcon className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[180px]">{assigneesText}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge className={cn('text-[10px] px-1.5 h-5 shrink-0', statusBadge.className)}>
                    {statusBadge.label}
                  </Badge>
                </div>
              </button>
            );
          })}

          {hasMore && (
            <div className="pt-2 flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                Carregar mais ({results.length - visibleCount} restantes)
              </Button>
            </div>
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
}
