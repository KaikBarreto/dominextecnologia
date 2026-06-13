import { useState, useRef, useEffect } from 'react';
import { AdminTask, AdminTaskStatus } from '@/hooks/useAdminTasks';
import { TaskCard } from './TaskCard';
import type { TaskAdminOption } from './TaskCreateDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KanbanColumn {
  id: AdminTaskStatus;
  title: string;
  color: string;
}

const COLUMNS: KanbanColumn[] = [
  { id: 'novo', title: 'A FAZER', color: 'bg-blue-500' },
  { id: 'em_andamento', title: 'EM ANDAMENTO', color: 'bg-amber-500' },
  { id: 'aguardando', title: 'AGUARDANDO', color: 'bg-orange-500' },
  { id: 'resolvido', title: 'RESOLVIDO', color: 'bg-emerald-500' },
];

// Janela de renderização por coluna: monta só as primeiras 50 e cresce de 50
// em 50 — centenas/milhares de cards no DOM que ninguém rola não agregam nada.
const WINDOW_STEP = 50;

const INITIAL_WINDOWS: Record<AdminTaskStatus, number> = {
  novo: WINDOW_STEP,
  em_andamento: WINDOW_STEP,
  aguardando: WINDOW_STEP,
  resolvido: WINDOW_STEP,
};

interface TaskKanbanBoardProps {
  tasks: AdminTask[];
  onStatusChange: (taskId: string, newStatus: AdminTaskStatus) => void;
  onTaskClick: (task: AdminTask) => void;
  /** Mapa user_id -> responsável (salespeople_basic) pra resolver nome/avatar no card. */
  adminByUserId: Map<string, TaskAdminOption>;
  /**
   * Total REAL de resolvidas no servidor (a lista carrega só as N mais
   * recentes). `undefined` = header da coluna Resolvido mostra `columnTasks.length`.
   */
  resolvedTotal?: number;
  /** Existem resolvidas no servidor além das carregadas. */
  hasMoreResolved?: boolean;
  /** Busca +200 resolvidas do servidor. */
  onLoadMoreResolved?: () => void;
  /** Refetch da query principal em voo — estado do botão "Carregar mais". */
  isLoadingMore?: boolean;
  /**
   * Muda quando QUALQUER filtro da tela muda → reseta a janela de 50 de todas
   * as colunas. "Carregar mais" não mexe na chave, então a janela cresce sem resetar.
   */
  filterKey?: string;
}

export function TaskKanbanBoard({
  tasks,
  onStatusChange,
  onTaskClick,
  adminByUserId,
  resolvedTotal,
  hasMoreResolved,
  onLoadMoreResolved,
  isLoadingMore,
  filterKey,
}: TaskKanbanBoardProps) {
  // Quick resolve usa o mesmo handler de status change — pra type='follow-up'
  // o container intercepta e abre o CompleteTaskModal automaticamente.
  const handleQuickResolve = (taskId: string) => onStatusChange(taskId, 'resolvido');

  const [windowSizes, setWindowSizes] = useState<Record<AdminTaskStatus, number>>(INITIAL_WINDOWS);

  // Reseta SÓ quando os filtros mudam (filterKey). Resetar quando `tasks` muda
  // quebraria o "Carregar mais" das resolvidas (a lista cresce e a janela
  // voltaria pra 50 logo após carregar).
  useEffect(() => {
    setWindowSizes(INITIAL_WINDOWS);
  }, [filterKey]);

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const dragImageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const dragImage = document.createElement('div');
    dragImage.style.cssText = `
      position: fixed; top: -1000px; left: -1000px;
      padding: 10px 14px; background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8));
      color: white; border-radius: 8px; font-size: 13px; font-weight: 500;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3); z-index: 9999; pointer-events: none;
    `;
    document.body.appendChild(dragImage);
    dragImageRef.current = dragImage;
    return () => { document.body.removeChild(dragImage); };
  }, []);

  const handleDragStart = (e: React.DragEvent, task: AdminTask) => {
    setDraggedTaskId(task.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
    if (dragImageRef.current) {
      dragImageRef.current.textContent = task.title;
      e.dataTransfer.setDragImage(dragImageRef.current, 20, 20);
    }
  };

  const handleDrop = (e: React.DragEvent, newStatus: AdminTaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData('text/plain');
    // Drag-and-drop opera no array fonte completo — a janela é só slice de render.
    const task = tasks.find(t => t.id === taskId);
    if (task && task.status !== newStatus) {
      onStatusChange(taskId, newStatus);
    }
    setDraggedTaskId(null);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {COLUMNS.map((column) => {
        const columnTasks = tasks.filter(t => t.status === column.id);
        const isDragOver = dragOverColumn === column.id;
        const isResolvedColumn = column.id === 'resolvido';

        // Janela local: só as primeiras N renderizam. Drag-and-drop opera no
        // array fonte completo — isto é só slice.
        const visibleTasks = columnTasks.slice(0, windowSizes[column.id]);
        const localRemaining = columnTasks.length - visibleTasks.length;

        // Header: Resolvido mostra o total REAL do banco quando disponível; nas
        // demais colunas as pendentes vêm completas do servidor.
        const headerCount =
          isResolvedColumn && resolvedTotal !== undefined ? resolvedTotal : columnTasks.length;

        // Restantes pro rótulo do botão: locais ainda não renderizadas + as que
        // nem foram carregadas do servidor (só na coluna Resolvido).
        const serverRemaining =
          isResolvedColumn && resolvedTotal !== undefined
            ? Math.max(resolvedTotal - columnTasks.length, 0)
            : 0;
        const totalRemaining = localRemaining + serverRemaining;

        const canLoadMoreFromServer = isResolvedColumn && !!hasMoreResolved;
        const showLoadMore = localRemaining > 0 || canLoadMoreFromServer;
        // Spinner só quando o clique disparou fetch no servidor (janela local
        // esgotada) — crescer a janela local é instantâneo.
        const isFetchingMore = isResolvedColumn && !!isLoadingMore && localRemaining === 0;

        const handleLoadMore = () => {
          if (localRemaining > 0) {
            setWindowSizes(prev => ({ ...prev, [column.id]: prev[column.id] + WINDOW_STEP }));
          } else if (canLoadMoreFromServer && onLoadMoreResolved) {
            // Esgotou as carregadas: busca +200 do servidor e já amplia a janela
            // pra que as novas apareçam assim que o refetch terminar.
            onLoadMoreResolved();
            setWindowSizes(prev => ({ ...prev, [column.id]: prev[column.id] + WINDOW_STEP }));
          }
        };

        return (
          <div
            key={column.id}
            onDragOver={(e) => { e.preventDefault(); setDragOverColumn(column.id); }}
            onDragLeave={() => setDragOverColumn(null)}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            <div className="mb-3">
              <div className={cn('h-1 w-full rounded-full mb-2 transition-all', column.color, isDragOver && 'h-2')} />
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xs tracking-wide text-foreground">{column.title}</h3>
                {/* pt-BR: ponto de milhar (ex.: 1.194) */}
                <span className="text-xs text-muted-foreground">{headerCount.toLocaleString('pt-BR')}</span>
              </div>
            </div>

            <div className={cn(
              'min-h-[200px] rounded-lg transition-all duration-300',
              isDragOver && 'bg-primary/10 ring-2 ring-primary ring-dashed scale-[1.01]',
            )}>
              <ScrollArea className="h-[calc(100vh-360px)]">
                <div className="space-y-2 pr-1 p-1">
                  {columnTasks.length === 0 ? (
                    <div className={cn(
                      'text-center py-12 text-muted-foreground text-xs border-2 border-dashed rounded-lg transition-all',
                      isDragOver && 'border-primary bg-primary/5 text-primary',
                    )}>
                      {isDragOver ? 'Solte aqui' : 'Nenhuma tarefa'}
                    </div>
                  ) : (
                    visibleTasks.map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task)}
                        onDragEnd={() => { setDraggedTaskId(null); setDragOverColumn(null); }}
                        className={cn('transition-all', draggedTaskId === task.id && 'opacity-40 scale-95')}
                      >
                        <TaskCard
                          task={task}
                          isDragging={draggedTaskId === task.id}
                          onClick={() => onTaskClick(task)}
                          onQuickResolve={handleQuickResolve}
                          assignee={task.assigned_to ? adminByUserId.get(task.assigned_to) ?? null : null}
                        />
                      </div>
                    ))
                  )}
                  {showLoadMore && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleLoadMore}
                      disabled={isFetchingMore}
                      className="w-full text-xs text-muted-foreground hover:text-foreground"
                    >
                      {isFetchingMore ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          Carregando...
                        </>
                      ) : totalRemaining > 0 ? (
                        // pt-BR com ponto de milhar (ex.: 994 restantes / 1.094 restantes)
                        `Carregar mais (${totalRemaining.toLocaleString('pt-BR')} restantes)`
                      ) : (
                        'Carregar mais'
                      )}
                    </Button>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        );
      })}
    </div>
  );
}
