import { Columns3, LayoutList, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type PdvWorkspaceView = 'list' | 'board' | 'flow';

/** Lista e fluxo têm a mesma ordem e linguagem nas áreas do balcão. */
export function PdvWorkspaceViewToggle({ value, onChange, showBoard = false, showFlow = false }: {
  value: PdvWorkspaceView;
  onChange: (view: PdvWorkspaceView) => void;
  showBoard?: boolean;
  showFlow?: boolean;
}) {
  return <div className="flex flex-wrap gap-2" role="group" aria-label="Visualização dos atendimentos">
    <Button type="button" size="sm" variant={value === 'list' ? 'default' : 'outline'} aria-pressed={value === 'list'} onClick={() => onChange('list')}><LayoutList className="h-4 w-4" />Lista</Button>
    {showBoard && <Button type="button" size="sm" variant={value === 'board' ? 'default' : 'outline'} aria-pressed={value === 'board'} onClick={() => onChange('board')}><Columns3 className="h-4 w-4" />Kanban</Button>}
    {showFlow && <Button type="button" size="sm" variant={value === 'flow' ? 'default' : 'outline'} aria-pressed={value === 'flow'} onClick={() => onChange('flow')}><Workflow className="h-4 w-4" />Fluxo do balcão</Button>}
  </div>;
}
