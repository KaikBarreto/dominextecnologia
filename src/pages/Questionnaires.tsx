import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormTemplateManagerDialog } from '@/components/service-orders/FormTemplateManagerDialog';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useServiceTypes } from '@/hooks/useServiceTypes';

export default function QuestionnairesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [allServices, setAllServices] = useState(true);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const { createTemplate, setTemplateServices } = useFormTemplates();
  const { serviceTypes } = useServiceTypes();

  const handleCreate = () => {
    if (!newName.trim()) return;
    createTemplate.mutate({ name: newName }, {
      onSuccess: (data) => {
        if (!allServices && selectedServiceIds.length > 0 && data) {
          setTemplateServices.mutate({ templateId: data.id, serviceTypeIds: selectedServiceIds });
        }
        setNewName('');
        setAllServices(true);
        setSelectedServiceIds([]);
        setCreateOpen(false);
      },
    });
  };

  const toggleServiceId = (id: string) => {
    setSelectedServiceIds(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Questionários</h1>
          <p className="text-muted-foreground">Gerencie modelos e perguntas por tipo de serviço</p>
        </div>
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo questionário
        </Button>
      </div>
      <FormTemplateManagerDialog />

      <ResponsiveModal open={createOpen} onOpenChange={setCreateOpen} title="Novo Questionário">
        <div className="space-y-4">
          <div>
            <Label>Nome do questionário</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex: Checklist de manutenção preventiva"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
              className="mt-1"
            />
          </div>

          <div className="space-y-3">
            <Label>Serviços habilitados</Label>
            <div className="flex items-center gap-2">
              <Switch checked={allServices} onCheckedChange={setAllServices} />
              <Label className="text-sm cursor-pointer">Todos os serviços</Label>
            </div>
            {!allServices && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {serviceTypes.filter(t => t.is_active).map((st) => (
                  <label key={st.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors">
                    <Checkbox
                      checked={selectedServiceIds.includes(st.id)}
                      onCheckedChange={() => toggleServiceId(st.id)}
                    />
                    <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                    {st.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleCreate}
              disabled={!newName.trim() || createTemplate.isPending}
            >
              Criar
            </Button>
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
}
