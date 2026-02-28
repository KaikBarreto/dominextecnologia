import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormTemplateManagerDialog } from '@/components/service-orders/FormTemplateManagerDialog';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Input } from '@/components/ui/input';
import { useFormTemplates } from '@/hooks/useFormTemplates';

export default function QuestionnairesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const { createTemplate } = useFormTemplates();

  const handleCreate = () => {
    if (!newName.trim()) return;
    createTemplate.mutate({ name: newName }, {
      onSuccess: () => {
        setNewName('');
        setCreateOpen(false);
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Questionários</h1>
          <p className="text-muted-foreground">Gerencie modelos e perguntas por tipo de serviço</p>
        </div>
        <Button
          className="bg-accent text-accent-foreground hover:bg-accent/90"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo questionário
        </Button>
      </div>
      <FormTemplateManagerDialog />

      <ResponsiveModal open={createOpen} onOpenChange={setCreateOpen} title="Novo Questionário">
        <div className="space-y-4">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome do questionário"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || createTemplate.isPending}>
              Criar
            </Button>
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
}
