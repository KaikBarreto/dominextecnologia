import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Car, Wrench, Gift, HardHat, Package, DollarSign } from 'lucide-react';
import { useCostResources, type CostResource, type CostResourceCategory } from '@/hooks/useCostResources';
import { CostResourceCard } from './CostResourceCard';
import { CostResourceFormSheet } from './CostResourceFormSheet';
import { formatBRL } from '@/utils/currency';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';

const CATEGORY_CONFIG: Array<{
  value: CostResourceCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: 'vehicle', label: 'Veículos', icon: Car },
  { value: 'tool', label: 'Ferramentas', icon: Wrench },
  { value: 'gift', label: 'Brindes', icon: Gift },
  { value: 'epi', label: 'EPIs', icon: HardHat },
  { value: 'other', label: 'Outros', icon: Package },
];

export function GlobalCostsTab() {
  const {
    byCategory,
    kpis,
    isLoading,
    createResource,
    updateResource,
    deleteResource,
  } = useCostResources();

  const isMobile = useIsMobile();
  const [activeCategory, setActiveCategory] = useState<CostResourceCategory>('vehicle');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<CostResource | null>(null);

  const handleOpenCreate = () => {
    setEditingResource(null);
    setSheetOpen(true);
  };

  const handleOpenEdit = (resource: CostResource) => {
    setEditingResource(resource);
    setSheetOpen(true);
  };

  const handleDelete = (id: string) => {
    deleteResource.mutate(id);
  };

  const handleSave = (data: {
    name: string;
    monthly_hours: number;
    is_active: boolean;
    notes: string;
    items: Array<{ name: string; value: number; is_monthly: boolean; annual_value?: number | null }>;
  }) => {
    if (editingResource) {
      updateResource.mutate(
        {
          id: editingResource.id,
          ...data,
          items: data.items.map(i => ({
            ...i,
            annual_value: i.annual_value ?? undefined,
          })),
        },
        {
          onSuccess: () => setSheetOpen(false),
        }
      );
    } else {
      createResource.mutate(
        {
          category: activeCategory,
          ...data,
          items: data.items.map(i => ({
            ...i,
            annual_value: i.annual_value ?? undefined,
          })),
        },
        {
          onSuccess: () => setSheetOpen(false),
        }
      );
    }
  };

  const currentResources = byCategory[activeCategory];

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-foreground">Centro de Custos</p>
              <p className="text-sm text-muted-foreground">
                Cadastre veículos, ferramentas e recursos. O custo/hora é rateado automaticamente.
              </p>
            </div>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Recurso
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Custo/hora Veículos</p>
            </div>
            {isLoading ? (
              <Skeleton className="h-6 w-24 mt-1" />
            ) : (
              <p className="text-xl font-bold text-foreground mt-1">
                R$ {formatBRL(kpis.vehicleHourlyCost)}/h
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Custo/hora Ferramentas</p>
            </div>
            {isLoading ? (
              <Skeleton className="h-6 w-24 mt-1" />
            ) : (
              <p className="text-xl font-bold text-foreground mt-1">
                R$ {formatBRL(kpis.toolHourlyCost)}/h
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <HardHat className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Custo/hora EPIs</p>
            </div>
            {isLoading ? (
              <Skeleton className="h-6 w-24 mt-1" />
            ) : (
              <p className="text-xl font-bold text-foreground mt-1">
                R$ {formatBRL(kpis.epiHourlyCost)}/h
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Custo/Brinde</p>
            </div>
            {isLoading ? (
              <Skeleton className="h-6 w-24 mt-1" />
            ) : (
              <p className="text-xl font-bold text-foreground mt-1">
                R$ {formatBRL(kpis.giftMonthlyCost)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Category navigation */}
      <Tabs value={activeCategory} onValueChange={(v) => setActiveCategory(v as CostResourceCategory)}>
        {isMobile ? (
          <Select value={activeCategory} onValueChange={(v) => setActiveCategory(v as CostResourceCategory)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_CONFIG.map(cat => {
                const Icon = cat.icon;
                const count = byCategory[cat.value].length;
                return (
                  <SelectItem key={cat.value} value={cat.value}>
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {cat.label}
                      {count > 0 && (
                        <span className="text-xs text-muted-foreground">({count})</span>
                      )}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        ) : (
          <TabsList className="w-auto flex-wrap h-auto gap-1 p-1">
            {CATEGORY_CONFIG.map(cat => {
              const Icon = cat.icon;
              const count = byCategory[cat.value].length;
              return (
                <TabsTrigger key={cat.value} value={cat.value} className="flex items-center gap-1.5">
                  <Icon className="h-4 w-4" />
                  {cat.label}
                  {count > 0 && (
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">{count}</span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        )}

        {CATEGORY_CONFIG.map(cat => (
          <TabsContent key={cat.value} value={cat.value} className="mt-4">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <Card key={i}>
                    <CardContent className="p-4 space-y-3">
                      <Skeleton className="h-6 w-32" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-8 w-24" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : currentResources.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <DollarSign className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">
                    Nenhum {cat.label.toLowerCase().slice(0, -1)} cadastrado.
                  </p>
                  <Button variant="outline" className="mt-4" onClick={handleOpenCreate}>
                    <Plus className="h-4 w-4 mr-2" />
                    Cadastrar {cat.label.toLowerCase().slice(0, -1)}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {currentResources.map(resource => (
                  <CostResourceCard
                    key={resource.id}
                    resource={resource}
                    onEdit={handleOpenEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Form Sheet */}
      <CostResourceFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        resource={editingResource}
        category={editingResource?.category ?? activeCategory}
        onSave={handleSave}
        isPending={createResource.isPending || updateResource.isPending}
      />
    </div>
  );
}
