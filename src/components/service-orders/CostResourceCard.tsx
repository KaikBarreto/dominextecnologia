import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Pencil, Trash2, Car, Wrench, Gift, HardHat, Package } from 'lucide-react';
import { formatBRL } from '@/utils/currency';
import type { CostResource } from '@/hooks/useCostResources';
import { useCostResourceItems } from '@/hooks/useCostResources';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface CostResourceCardProps {
  resource: CostResource;
  onEdit: (resource: CostResource) => void;
  onDelete: (id: string) => void;
}

const categoryIcons = {
  vehicle: Car,
  tool: Wrench,
  gift: Gift,
  epi: HardHat,
  other: Package,
};

export function CostResourceCard({ resource, onEdit, onDelete }: CostResourceCardProps) {
  const { data: items = [] } = useCostResourceItems(resource.id);
  const Icon = categoryIcons[resource.category] || Package;
  const isGift = resource.category === 'gift';
  const photoUrl = (resource as any).photo_url;

  const totalValue = items.reduce((sum, item) => sum + (item.value || 0), 0);
  const hourlyRate = resource.monthly_hours > 0 ? totalValue / resource.monthly_hours : 0;

  return (
    <Card className="relative">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {photoUrl ? (
              <Avatar className="h-10 w-10 rounded-md">
                <AvatarImage src={photoUrl} alt={resource.name} className="object-cover" />
                <AvatarFallback className="rounded-md bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </AvatarFallback>
              </Avatar>
            ) : (
              <div className="p-1.5 rounded-md bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">{resource.name}</p>
              {resource.notes && (
                <p className="text-xs text-muted-foreground truncate">{resource.notes}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Badge variant={resource.is_active ? 'default' : 'secondary'} className="text-xs">
              {resource.is_active ? 'Ativo' : 'Inativo'}
            </Badge>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(resource)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir {isGift ? 'brinde' : 'recurso'}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação removerá "{resource.name}" e todos os seus {isGift ? 'itens' : 'componentes de custo'}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(resource.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Items */}
        {items.length > 0 && (
          <div className="space-y-1 border-t border-border pt-2">
            {items.map(item => {
              const i = item as any;
              if (isGift && i.total_cost != null && i.total_units != null) {
                const unitCost = i.total_units > 0 ? i.total_cost / i.total_units : 0;
                const qty = i.qty_per_gift ?? 1;
                return (
                  <div key={item.id} className="space-y-0.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground truncate">{item.name}</span>
                      <span className="text-foreground font-medium">R$ {formatBRL(item.value)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pl-1">
                      R$ {formatBRL(unitCost)}/un × {qty} un
                    </p>
                  </div>
                );
              }
              return (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground truncate">
                    {item.name}
                    {!item.is_monthly && <span className="text-xs ml-1">(anual ÷12)</span>}
                  </span>
                  <span className="text-foreground font-medium">R$ {formatBRL(item.value)}</span>
                </div>
              );
            })}
          </div>
        )}

        {items.length === 0 && (
          <div className="text-sm text-muted-foreground italic py-2">
            {isGift ? 'Nenhum item cadastrado' : 'Nenhum componente de custo cadastrado'}
          </div>
        )}

        {/* Footer with totals */}
        <div className="border-t border-border pt-3 space-y-1">
          {isGift ? (
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-primary">Custo/brinde:</span>
              <span className="text-lg font-bold text-primary">R$ {formatBRL(totalValue)}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total mensal:</span>
                <span className="font-semibold text-foreground">R$ {formatBRL(totalValue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Horas mensais:</span>
                <span className="text-foreground">{resource.monthly_hours}h</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-dashed border-border">
                <span className="text-sm font-medium text-primary">Custo/hora:</span>
                <span className="text-lg font-bold text-primary">R$ {formatBRL(hourlyRate)}/h</span>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
