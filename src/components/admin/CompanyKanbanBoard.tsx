import { useState, useRef, useEffect } from 'react';
import { CompanyKanbanCard } from './CompanyKanbanCard';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface CompanyKanbanBoardProps {
  companies: any[];
  origins: any[] | undefined;
  masterUserMap: Map<string, string>;
  salespeople?: any[];
  onEdit: (company: any) => void;
  onDelete: (company: any) => void;
}

const COLUMNS = [
  { id: 'active', title: 'ATIVOS', status: 'active', color: 'bg-emerald-500' },
  { id: 'testing', title: 'TESTANDO', status: 'testing', color: 'bg-amber-500' },
  { id: 'inactive', title: 'INATIVOS', status: 'inactive', color: 'bg-rose-500' },
];

export function CompanyKanbanBoard({ companies, origins, masterUserMap, salespeople, onEdit, onDelete }: CompanyKanbanBoardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [draggedCompanyId, setDraggedCompanyId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const dragImageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const dragImage = document.createElement('div');
    dragImage.id = 'custom-drag-image';
    dragImage.style.cssText = `position:fixed;top:-1000px;left:-1000px;padding:12px 16px;background:linear-gradient(135deg,hsl(var(--primary)),hsl(var(--primary)/0.8));color:white;border-radius:8px;font-size:14px;font-weight:500;box-shadow:0 10px 25px -5px rgba(0,0,0,0.3);z-index:9999;pointer-events:none;display:flex;align-items:center;gap:8px;`;
    document.body.appendChild(dragImage);
    dragImageRef.current = dragImage;
    return () => { if (dragImageRef.current) document.body.removeChild(dragImageRef.current); };
  }, []);

  const getCompaniesByStatus = (status: string) => companies.filter(c => c.subscription_status === status);
  const getTotalValue = (list: any[]) => list.reduce((acc, c) => acc + (c.subscription_value || 0), 0);
  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const handleDragStart = (e: React.DragEvent, company: any) => {
    setDraggedCompanyId(company.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', company.id);
    if (dragImageRef.current) {
      dragImageRef.current.textContent = '';
      const span = document.createElement('span');
      span.textContent = company.name;
      dragImageRef.current.appendChild(span);
      e.dataTransfer.setDragImage(dragImageRef.current, 20, 20);
    }
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    const companyId = e.dataTransfer.getData('text/plain');
    const company = companies.find(c => c.id === companyId);
    if (!company || company.subscription_status === newStatus) { setDraggedCompanyId(null); return; }

    queryClient.setQueryData(['admin-companies'], (old: any[] | undefined) =>
      old?.map(c => c.id === companyId ? { ...c, subscription_status: newStatus } : c)
    );

    try {
      const { error } = await supabase.from('companies').update({ subscription_status: newStatus }).eq('id', companyId);
      if (error) throw error;
      const labels: Record<string, string> = { active: 'Ativo', testing: 'Testando', inactive: 'Inativo' };
      toast({ title: `${company.name} movido para ${labels[newStatus]}` });
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao atualizar status' });
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
    }
    setDraggedCompanyId(null);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
      {COLUMNS.map((column) => {
        const colCompanies = getCompaniesByStatus(column.status);
        const totalValue = getTotalValue(colCompanies);
        const isDragOver = dragOverColumn === column.status;

        return (
          <div
            key={column.id}
            className="w-full"
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverColumn(column.status); }}
            onDragLeave={() => setDragOverColumn(null)}
            onDrop={(e) => handleDrop(e, column.status)}
          >
            <div className="mb-4">
              <div className={cn('h-1 w-full rounded-full mb-3 transition-all', column.color, isDragOver && 'h-2')} />
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm tracking-wide text-foreground">{column.title}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{colCompanies.length} {colCompanies.length === 1 ? 'empresa' : 'empresas'}</span>
                  <span className="text-xs font-medium text-foreground">{formatCurrency(totalValue)}</span>
                </div>
              </div>
            </div>

            <div className={cn('min-h-[200px] rounded-lg transition-all duration-300', isDragOver && 'bg-primary/10 ring-2 ring-primary ring-dashed scale-[1.02]')}>
              <ScrollArea className="h-[calc(100vh-320px)]">
                <div className="space-y-2 sm:space-y-3 pr-2 p-1">
                  {colCompanies.length === 0 ? (
                    <div className={cn('text-center py-12 text-muted-foreground text-sm border-2 border-dashed rounded-lg transition-all', isDragOver && 'border-primary bg-primary/5 text-primary')}>
                      {isDragOver ? 'Solte aqui para mover' : 'Nenhuma empresa'}
                    </div>
                  ) : (
                    colCompanies.map((company) => (
                      <div
                        key={company.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, company)}
                        onDragEnd={() => { setDraggedCompanyId(null); setDragOverColumn(null); }}
                        className={cn('transition-all duration-300 ease-out', draggedCompanyId === company.id && 'opacity-40 scale-95 rotate-1')}
                      >
                        <CompanyKanbanCard
                          company={company}
                          origins={origins}
                          salespeople={salespeople}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          isDragging={draggedCompanyId === company.id}
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
