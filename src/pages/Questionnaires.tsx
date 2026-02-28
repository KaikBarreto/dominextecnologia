import { FormTemplateManagerDialog } from '@/components/service-orders/FormTemplateManagerDialog';

export default function QuestionnairesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Questionários</h1>
        <p className="text-muted-foreground">Gerencie modelos e perguntas por tipo de serviço</p>
      </div>
      <FormTemplateManagerDialog />
    </div>
  );
}
