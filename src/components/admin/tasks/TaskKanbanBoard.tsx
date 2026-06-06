import { useState, useRef, useEffect } from 'react';
import { AdminTask, AdminTaskStatus } from '@/hooks/useAdminTasks';
import { TaskCard } from './TaskCard';
import type { TaskAdminOption } from './TaskCreateDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
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

interface TaskKanbanBoardProps {
  tasks: AdminTask[];
  onStatusChange: (taskId: string, newStatus: AdminTaskStatus) => void;
  onTaskClick: (task: AdminTask) => void;
  /** Mapa user_id -> responsável (salespeople_basic) pra resolver nome/avatar no card. */
  adminByUserId: Map<string, TaskAdminOption>;
}

export function TaskKanbanBoard({ tasks, onStatusChange, onTaskClick, adminByUserId }: TaskKanbanBoardProps) {
  // Quick resolve usa o mesmo handler de status change — pra type='follow-up'
  // o container intercepta e abre o CompleteTaskModal automaticamente.
  const handleQuickResolve = (taskId: string) => onStatusChange(taskId, 'resolvido');

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
                <span className="text-xs text-muted-foreground">{columnTasks.length}</span>
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
                    columnTasks.map((task) => (
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
                </div>
              </ScrollArea>
            </div>
          </div>
        );
      })}
    </div>
  );
}
