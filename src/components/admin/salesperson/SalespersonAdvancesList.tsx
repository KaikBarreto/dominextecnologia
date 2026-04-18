import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Wallet } from 'lucide-react';
import { type SalespersonAdvance, useDeleteAdvance } from '@/hooks/useSalespersonData';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

interface Props { advances: SalespersonAdvance[]; }

export function SalespersonAdvancesList({ advances }: Props) {
  const deleteAdvance = useDeleteAdvance();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Wallet className="h-4 w-4" /> Últimos Vales
        </CardTitle>
      </CardHeader>
      <CardContent>
        {advances.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Nenhum vale registrado</div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {advances.slice(0, 20).map((a) => (
              <div key={a.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-destructive">-{fmt(a.amount)}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {format(new Date(a.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    {a.description && ` • ${a.description}`}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => deleteAdvance.mutate(a.id)} disabled={deleteAdvance.isPending} className="hover:bg-destructive hover:text-white">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
