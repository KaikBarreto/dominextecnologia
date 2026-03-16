import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { ClipboardList, CheckSquare } from 'lucide-react';

interface EntryTypeSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectOS: () => void;
  onSelectTask: () => void;
}

export function EntryTypeSelectorDialog({ open, onOpenChange, onSelectOS, onSelectTask }: EntryTypeSelectorProps) {
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="O que deseja criar?">
      <div className="grid grid-cols-2 gap-4 p-2">
        <button
          onClick={() => { onOpenChange(false); onSelectOS(); }}
          className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-transparent hover:border-primary hover:bg-primary/5 transition-all group"
        >
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <ClipboardList className="h-7 w-7 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-semibold">Ordem de Serviço</p>
            <p className="text-xs text-muted-foreground mt-1">Atendimento técnico com cliente e equipamento</p>
          </div>
        </button>
        <button
          onClick={() => { onOpenChange(false); onSelectTask(); }}
          className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-transparent hover:border-primary hover:bg-primary/5 transition-all group"
        >
          <div className="h-14 w-14 rounded-full bg-violet-500/10 flex items-center justify-center group-hover:bg-violet-500/20 transition-colors">
            <CheckSquare className="h-7 w-7 text-violet-500" />
          </div>
          <div className="text-center">
            <p className="font-semibold">Tarefa</p>
            <p className="text-xs text-muted-foreground mt-1">Atividade interna, reunião ou compromisso</p>
          </div>
        </button>
      </div>
    </ResponsiveModal>
  );
}
