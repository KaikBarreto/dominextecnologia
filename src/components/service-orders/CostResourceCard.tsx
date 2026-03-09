import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, Car, Wrench, Gift, HardHat, Package } from 'lucide-react';
import { formatBRL } from '@/utils/currency';
import type { CostResource, CostResourceItem } from '@/hooks/useCostResources';
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

  const totalMonthly = items.reduce((sum, item) => sum + (item.value || 0), 0);
  const hourlyRate = resource.monthly_hours > 0 ? totalMonthly / resource.monthly_hours : 0;

  return (
    <Card className="relative">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-md bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
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
                  <AlertDialogTitle>Excluir recurso?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação removerá "{resource.name}" e todos os seus componentes de custo.
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

        {/* Cost items */}
        {items.length > 0 && (
          <div className="space-y-1 border-t border-border pt-2">
            {items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-muted-foreground truncate">
                  {item.name}
                  {!item.is_monthly && <span className="text-xs ml-1">(anual ÷12)</span>}
                </span>
                <span className="text-foreground font-medium">R$ {formatBRL(item.value)}</span>
              </div>
            ))}
          </div>
        )}

        {items.length === 0 && (
          <div className="text-sm text-muted-foreground italic py-2">
            Nenhum componente de custo cadastrado
          </div>
        )}

        {/* Footer with totals */}
        <div className="border-t border-border pt-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total mensal:</span>
            <span className="font-semibold text-foreground">R$ {formatBRL(totalMonthly)}</span>
          </div>
          {resource.category !== 'gift' && (
            <>
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
          {resource.category === 'gift' && (
            <div className="flex justify-between items-center pt-1 border-t border-dashed border-border">
              <span className="text-sm font-medium text-primary">Custo/execução:</span>
              <span className="text-lg font-bold text-primary">R$ {formatBRL(totalMonthly)}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
