import { TrendingUp, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const pipelineStages = [
  { name: 'Lead', count: 0, color: 'bg-muted' },
  { name: 'Proposta', count: 0, color: 'bg-info/20' },
  { name: 'Negociação', count: 0, color: 'bg-warning/20' },
  { name: 'Fechado', count: 0, color: 'bg-success/20' },
];

export default function CRM() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">CRM</h1>
          <p className="text-muted-foreground">Gerencie oportunidades e leads</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nova Oportunidade
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {pipelineStages.map((stage) => (
          <Card key={stage.name} className={stage.color}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{stage.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stage.count}</p>
              <p className="text-xs text-muted-foreground">oportunidades</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Pipeline de Vendas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <TrendingUp className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">Nenhuma oportunidade</h3>
            <p className="text-muted-foreground">
              Clique em "Nova Oportunidade" para começar
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
