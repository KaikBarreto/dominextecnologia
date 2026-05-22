import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Car, Wrench, Gift, HardHat, Package, DollarSign, Pencil, Trash2 } from 'lucide-react';
import { useCostResources, type CostResource, type CostResourceCategory } from '@/hooks/useCostResources';
import { CostResourceCard } from './CostResourceCard';
import { CostResourceFormSheet } from './CostResourceFormSheet';
import { formatBRL } from '@/utils/currency';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { StatCarousel, type StatCarouselItem } from '@/components/mobile/StatCarousel';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const CATEGORY_CONFIG: Array<{
  value: CostResourceCategory;
  label: string;
  labelSingular: string;
  icon: React.ComponentType<{ className?: string }>;
  hex: string;
}> = [
  { value: 'vehicle', label: 'Veículos', labelSingular: 'veículo', icon: Car, hex: '#0ea5e9' },
  { value: 'tool', label: 'Ferramentas', labelSingular: 'ferramenta', icon: Wrench, hex: '#f59e0b' },
  { value: 'gift', label: 'Brindes', labelSingular: 'brinde', icon: Gift, hex: '#ec4899' },
  { value: 'epi', label: 'EPIs', labelSingular: 'EPI', icon: HardHat, hex: '#22c55e' },
  { value: 'other', label: 'Outros', labelSingular: 'recurso', icon: Package, hex: '#64748b' },
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
  const [pendingDelete, setPendingDelete] = useState<CostResource | null>(null);

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
    photo_url?: string | null;
    items: Array<{ name: string; value: number; is_monthly: boolean; annual_value?: number | null }>;
  }) => {
    if (editingResource) {
      updateResource.mutate(
        {
          id: editingResource.id,
          ...data,
          photo_url: data.photo_url,
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
          photo_url: data.photo_url,
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
  const activeCfg = CATEGORY_CONFIG.find(c => c.value === activeCategory) ?? CATEGORY_CONFIG[0];

  // KPIs como chips do StatCarousel no mobile.
  const statItems: StatCarouselItem[] = useMemo(
    () => [
      {
        key: 'vehicle',
        label: 'Veículos/h',
        count: `R$ ${formatBRL(kpis.vehicleHourlyCost)}` as unknown as number,
        icon: <Car className="h-4 w-4" />,
        accentColor: '#0ea5e9',
      },
      {
        key: 'tool',
        label: 'Ferramentas/h',
        count: `R$ ${formatBRL(kpis.toolHourlyCost)}` as unknown as number,
        icon: <Wrench className="h-4 w-4" />,
        accentColor: '#f59e0b',
      },
      {
        key: 'epi',
        label: 'EPIs/h',
        count: `R$ ${formatBRL(kpis.epiHourlyCost)}` as unknown as number,
        icon: <HardHat className="h-4 w-4" />,
        accentColor: '#22c55e',
      },
      {
        key: 'gift',
        label: 'Brinde',
        count: `R$ ${formatBRL(kpis.giftCostPerUnit)}` as unknown as number,
        icon: <Gift className="h-4 w-4" />,
        accentColor: '#ec4899',
      },
    ],
    [kpis],
  );

  // Ações por recurso (mobile dropdown + swipe).
  const buildItemActions = (resource: CostResource): ItemAction[] => [
    {
      key: 'edit',
      label: 'Editar',
      icon: <Pencil className="h-4 w-4" />,
      variant: 'edit',
      onClick: () => handleOpenEdit(resource),
    },
    {
      key: 'delete',
      label: 'Excluir',
      icon: <Trash2 className="h-4 w-4" />,
      variant: 'destructive',
      onClick: () => setPendingDelete(resource),
    },
  ];

  return (
    <div className={cn('space-y-4', isMobile && 'pb-24')}>
      {/* Header — mantém Card no desktop. No mobile, only subtitle (sem botão, vira FAB). */}
      {isMobile ? (
        <div className="px-1">
          <p className="text-base font-semibold text-foreground">Centro de Custos</p>
          <p className="text-xs text-muted-foreground">
            Cadastre veículos, ferramentas e recursos. O custo/hora é rateado automaticamente.
          </p>
        </div>
      ) : (
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
      )}

      {/* KPIs — StatCarousel no mobile, grid de Cards no desktop. */}
      {isMobile ? (
        <StatCarousel items={statItems} loading={isLoading} />
      ) : (
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
                  R$ {formatBRL(kpis.giftCostPerUnit)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Category navigation — Select no mobile (já era), Tabs no desktop. */}
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
              isMobile ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
              )
            ) : currentResources.length === 0 ? (
              isMobile ? (
                <EmptyState
                  icon={<DollarSign className="h-12 w-12" />}
                  title={`Nenhum ${cat.labelSingular} cadastrado`}
                  description={`Toque em "Novo ${cat.labelSingular}" para começar.`}
                  action={{
                    label: `Cadastrar ${cat.labelSingular}`,
                    onClick: handleOpenCreate,
                  }}
                />
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <DollarSign className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">
                      Nenhum {cat.labelSingular} cadastrado.
                    </p>
                    <Button variant="outline" className="mt-4" onClick={handleOpenCreate}>
                      <Plus className="h-4 w-4 mr-2" />
                      Cadastrar {cat.labelSingular}
                    </Button>
                  </CardContent>
                </Card>
              )
            ) : isMobile ? (
              <div className="rounded-xl border bg-card overflow-hidden">
                {currentResources.map(resource => {
                  const Icon = cat.icon;
                  const photoUrl = resource.photo_url;
                  const totalMonthly = Number(resource.total_monthly_cost ?? 0);
                  const hourlyRate = Number(resource.hourly_rate ?? 0);
                  const isGift = resource.category === 'gift';

                  return (
                    <MobileListItem
                      key={resource.id}
                      onClick={() => handleOpenEdit(resource)}
                      actions={buildItemActions(resource)}
                      leading={
                        photoUrl ? (
                          <Avatar className="h-10 w-10 rounded-full">
                            <AvatarImage src={photoUrl} alt={resource.name} className="object-cover" />
                            <AvatarFallback
                              className="rounded-full text-white"
                              style={{ backgroundColor: cat.hex }}
                            >
                              <Icon className="h-5 w-5" />
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <div
                            className="flex h-10 w-10 items-center justify-center rounded-full text-white"
                            style={{ backgroundColor: cat.hex }}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                        )
                      }
                      title={
                        <div className="flex items-center gap-2">
                          <span className="truncate">{resource.name}</span>
                          {!resource.is_active && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              Inativo
                            </Badge>
                          )}
                        </div>
                      }
                      subtitle={
                        <div className="flex items-center gap-2 flex-wrap">
                          {isGift ? (
                            <span className="font-semibold text-foreground">
                              R$ {formatBRL(totalMonthly)}/un
                            </span>
                          ) : (
                            <>
                              <span className="font-semibold text-foreground">
                                R$ {formatBRL(hourlyRate)}/h
                              </span>
                              <span>•</span>
                              <span>R$ {formatBRL(totalMonthly)}/mês</span>
                            </>
                          )}
                        </div>
                      }
                    />
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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

      {/* FAB Novo Recurso (mobile) com label contextual da categoria atual. */}
      {isMobile && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label={`Novo ${activeCfg.labelSingular}`}
          onClick={handleOpenCreate}
        />
      )}

      {/* Form Sheet */}
      <CostResourceFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        resource={editingResource}
        category={editingResource?.category ?? activeCategory}
        onSave={handleSave}
        isPending={createResource.isPending || updateResource.isPending}
      />

      {/* Confirmação de exclusão (compartilhada com o swipe/dropdown mobile). */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(v) => { if (!v) setPendingDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {pendingDelete?.category === 'gift' ? 'brinde' : 'recurso'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>
                  Esta ação removerá "{pendingDelete.name}" e todos os seus{' '}
                  {pendingDelete.category === 'gift' ? 'itens' : 'componentes de custo'}.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) handleDelete(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
