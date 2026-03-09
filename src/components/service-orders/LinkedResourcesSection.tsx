import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Car, Wrench, HardHat, Gift, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { formatBRL } from '@/utils/currency';
import { useServiceCostResources } from '@/hooks/useServiceCostResources';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { CostResource, CostResourceCategory } from '@/hooks/useCostResources';

interface LinkedResourcesSectionProps {
  serviceId: string | null;
  serviceHours: number;
  onTotalChange?: (total: number) => void;
}

const categoryIcons: Record<CostResourceCategory, React.ComponentType<{ className?: string }>> = {
  vehicle: Car,
  tool: Wrench,
  gift: Gift,
  epi: HardHat,
  other: Package,
};

const categoryLabels: Record<CostResourceCategory, string> = {
  vehicle: 'Veículos',
  tool: 'Ferramentas',
  gift: 'Brindes',
  epi: 'EPIs',
  other: 'Outros',
};

export function LinkedResourcesSection({ serviceId, serviceHours, onTotalChange }: LinkedResourcesSectionProps) {
  const {
    linkedResources,
    allResources,
    gifts,
    totals,
    isLoading,
    linkResource,
    unlinkResource,
    updateOverride,
    addGift,
    removeGift,
    isResourceLinked,
  } = useServiceCostResources(serviceId, serviceHours);

  const [expandedCategories, setExpandedCategories] = useState<CostResourceCategory[]>(['vehicle', 'tool', 'epi']);
  const [overrideInputs, setOverrideInputs] = useState<Record<string, string>>({});

  // Notify parent of total changes
  useMemo(() => {
    onTotalChange?.(totals.total);
  }, [totals.total, onTotalChange]);

  // Group resources by category
  const resourcesByCategory = useMemo(() => {
    const groups: Record<CostResourceCategory, CostResource[]> = {
      vehicle: [],
      tool: [],
      gift: [],
      epi: [],
      other: [],
    };

    allResources.forEach(r => {
      if (r.category !== 'gift') {
        groups[r.category].push(r);
      }
    });

    return groups;
  }, [allResources]);

  const toggleCategory = (cat: CostResourceCategory) => {
    setExpandedCategories(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const handleToggleResource = (resourceId: string, checked: boolean) => {
    if (checked) {
      linkResource.mutate({ resourceId });
    } else {
      unlinkResource.mutate(resourceId);
    }
  };

  const handleOverrideBlur = (resourceId: string) => {
    const value = overrideInputs[resourceId];
    if (value !== undefined) {
      const numValue = parseFloat(value);
      updateOverride.mutate({ 
        resourceId, 
        overrideValue: isNaN(numValue) || value === '' ? null : numValue 
      });
    }
  };

  if (!serviceId) {
    return null;
  }

  const categoriesToShow: CostResourceCategory[] = ['vehicle', 'tool', 'epi', 'other'];

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Recursos Vinculados</p>
          <p className="text-xs text-muted-foreground">
            Selecione recursos globais para este serviço. Custo = custo/hora × {serviceHours}h
          </p>
        </div>

        {isLoading ? (
          <div className="py-4 text-center text-sm text-muted-foreground">Carregando recursos...</div>
        ) : (
          <div className="space-y-3">
            {categoriesToShow.map(category => {
              const resources = resourcesByCategory[category];
              if (resources.length === 0) return null;

              const Icon = categoryIcons[category];
              const isExpanded = expandedCategories.includes(category);
              const linkedCount = resources.filter(r => isResourceLinked(r.id)).length;
              const categoryTotal = totals[category as keyof typeof totals] ?? 0;

              return (
                <Collapsible key={category} open={isExpanded} onOpenChange={() => toggleCategory(category)}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between p-2 h-auto">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{categoryLabels[category]}</span>
                        {linkedCount > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {linkedCount} vinculado{linkedCount > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {linkedCount > 0 && (
                          <span className="text-sm font-medium text-primary">
                            R$ {formatBRL(categoryTotal)}
                          </span>
                        )}
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-4 pr-2 pb-2 space-y-2">
                    {resources.map(resource => {
                      const isLinked = isResourceLinked(resource.id);
                      const linked = linkedResources.find(lr => lr.resource_id === resource.id);
                      const hourlyRate = resource.hourly_rate ?? 0;
                      const calculatedCost = hourlyRate * serviceHours;
                      const finalCost = linked?.calculatedCost ?? calculatedCost;
                      const hasOverride = linked?.override_value !== null && linked?.override_value !== undefined;

                      return (
                        <div
                          key={resource.id}
                          className={`flex flex-col gap-2 p-2 rounded-md border ${isLinked ? 'border-primary bg-background' : 'border-border bg-background'}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`resource-${resource.id}`}
                                checked={isLinked}
                                onCheckedChange={(checked) => handleToggleResource(resource.id, !!checked)}
                              />
                              <Label htmlFor={`resource-${resource.id}`} className="cursor-pointer">
                                <span className="font-medium">{resource.name}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  R$ {formatBRL(hourlyRate)}/h
                                </span>
                              </Label>
                            </div>
                          </div>

                          {isLinked && (
                            <div className="ml-0 sm:ml-6 flex flex-col gap-2 text-sm">
                              <span className="text-muted-foreground">
                                {serviceHours}h × R$ {formatBRL(hourlyRate)} = 
                                <span className={`font-medium ml-1 ${hasOverride ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                  R$ {formatBRL(calculatedCost)}
                                </span>
                              </span>
                              <div className="flex items-center gap-2">
                                <Label className="text-xs text-muted-foreground whitespace-nowrap">Sobrescrever:</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  placeholder="Auto"
                                  className="w-24 h-7 text-xs"
                                  value={overrideInputs[resource.id] ?? (linked?.override_value ?? '')}
                                  onChange={(e) => setOverrideInputs(prev => ({ ...prev, [resource.id]: e.target.value }))}
                                  onBlur={() => handleOverrideBlur(resource.id)}
                                />
                                {hasOverride && (
                                  <span className="text-xs font-medium text-primary">
                                    = R$ {formatBRL(finalCost)}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}

            {/* Gifts section */}
            {allResources.filter(r => r.category === 'gift').length > 0 && (
              <Collapsible open={expandedCategories.includes('gift')} onOpenChange={() => toggleCategory('gift')}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-2 h-auto">
                    <div className="flex items-center gap-2">
                      <Gift className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Brindes</span>
                      <Badge variant="outline" className="text-xs">por execução</Badge>
                      {gifts.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {gifts.length} vinculado{gifts.length > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {gifts.length > 0 && (
                        <span className="text-sm font-medium text-primary">
                          R$ {formatBRL(totals.gift)}
                        </span>
                      )}
                      {expandedCategories.includes('gift') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-4 pr-2 pb-2 space-y-2">
                  {allResources.filter(r => r.category === 'gift').map(resource => {
                    const linkedGift = gifts.find(g => g.resource_id === resource.id);
                    const isLinked = !!linkedGift;

                    return (
                      <div
                        key={resource.id}
                        className={`flex items-center justify-between p-2 rounded-md border ${isLinked ? 'border-primary bg-background' : 'border-border bg-background'}`}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`gift-${resource.id}`}
                            checked={isLinked}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                addGift.mutate({
                                  resourceId: resource.id,
                                  name: resource.name,
                                  unitCost: resource.total_monthly_cost ?? 0,
                                  quantity: 1,
                                });
                              } else if (linkedGift) {
                                removeGift.mutate(linkedGift.id);
                              }
                            }}
                          />
                          <Label htmlFor={`gift-${resource.id}`} className="cursor-pointer">
                            <span className="font-medium">{resource.name}</span>
                          </Label>
                        </div>
                        <span className="text-sm font-medium text-foreground">
                          R$ {formatBRL(resource.total_monthly_cost ?? 0)} / execução
                        </span>
                      </div>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}

        {/* Total summary */}
        {totals.total > 0 && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
            <span className="text-sm font-medium text-foreground">Total recursos vinculados</span>
            <span className="text-lg font-bold text-primary">R$ {formatBRL(totals.total)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
