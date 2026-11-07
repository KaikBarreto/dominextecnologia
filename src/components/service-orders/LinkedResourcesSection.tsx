import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Car, Wrench, HardHat, Gift, Package, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import { useServiceCostResources } from '@/hooks/useServiceCostResources';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { CostResource, CostResourceCategory } from '@/hooks/useCostResources';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { ContextualCostResourceEditor } from './ContextualCostResourceEditor';

interface LinkedResourcesSectionProps {
  serviceId: string | null;
  serviceHours: number;
  onTotalChange?: (total: number) => void;
  resourcesState?: ReturnType<typeof useServiceCostResources>;
}

const categoryIcons: Record<CostResourceCategory, React.ComponentType<{ className?: string }>> = {
  vehicle: Car,
  tool: Wrench,
  gift: Gift,
  epi: HardHat,
  other: Package,
};

export function LinkedResourcesSection({
  serviceId,
  serviceHours,
  onTotalChange,
  resourcesState,
}: LinkedResourcesSectionProps) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.crm.costModals;
  const fmt = (v: number) => formatMoney(v, currency, locale);
  const fallbackResourcesState = useServiceCostResources(serviceId, serviceHours, {
    enabled: !resourcesState,
  });
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
  } = resourcesState ?? fallbackResourcesState;

  const [expandedCategories, setExpandedCategories] = useState<CostResourceCategory[]>(['vehicle', 'tool', 'epi']);
  const [overrideInputs, setOverrideInputs] = useState<Record<string, string>>({});
  const [editingResource, setEditingResource] = useState<CostResource | null>(null);

  // Notify parent of total changes
  useEffect(() => {
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

  return (<>
    <Card className="border-0 bg-background/80 shadow-sm">
      <CardContent className="p-4 space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">{t.linkedTitle}</p>
          <p className="text-xs text-muted-foreground">
            {t.linkedSubtitle.replace('{hours}', String(serviceHours))}
          </p>
        </div>

        {isLoading ? (
          <div className="py-4 text-center text-sm text-muted-foreground">{t.linkedLoading}</div>
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
                        <span className="font-medium">{t.linkedCategoryLabels[category]}</span>
                        {linkedCount > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {linkedCount > 1
                              ? t.linkedBadgeLinked_other.replace('{count}', String(linkedCount))
                              : t.linkedBadgeLinked_one.replace('{count}', String(linkedCount))}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {linkedCount > 0 && (
                          <span className="text-sm font-medium text-primary">
                            {fmt(categoryTotal)}
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
                          className={`flex flex-col gap-2 rounded-xl p-3 transition-colors ${isLinked ? 'bg-primary text-primary-foreground [&_.text-muted-foreground]:text-primary-foreground/70 [&_.text-foreground]:text-primary-foreground' : 'bg-muted/30 hover:bg-muted/45'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 flex-1 items-start gap-2">
                              <Checkbox
                                id={`resource-${resource.id}`}
                                checked={isLinked}
                                className={isLinked ? 'border-primary-foreground data-[state=checked]:border-primary-foreground data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary' : undefined}
                                onCheckedChange={(checked) => handleToggleResource(resource.id, !!checked)}
                              />
                              <Label htmlFor={`resource-${resource.id}`} className="min-w-0 cursor-pointer break-words leading-relaxed">
                                <span className="font-medium">{resource.name}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  {t.linkedPerHour.replace('{rate}', fmt(hourlyRate))}
                                </span>
                              </Label>
                            </div>
                            <Button type="button" variant="edit-ghost" size="icon" aria-label={`Editar cadastro do recurso ${resource.name}`} title="Editar cadastro do recurso" className={`-mt-1 h-11 w-11 shrink-0 ${isLinked ? 'text-primary-foreground' : ''}`} onClick={() => setEditingResource(resource)}><Pencil className="h-4 w-4" /></Button>
                          </div>

                          {isLinked && (
                            <div className="ml-0 sm:ml-6 flex flex-col gap-2 text-sm">
                              <span className="text-muted-foreground">
                                {serviceHours}h &times; {fmt(hourlyRate)} =&nbsp;
                                <span className={`font-medium ${hasOverride ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                  {fmt(calculatedCost)}
                                </span>
                              </span>
                              <div className="flex items-center gap-2">
                                <Label className="text-xs text-muted-foreground whitespace-nowrap">{t.linkedOverrideLabel}</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  placeholder={t.linkedOverridePlaceholder}
                                  className="w-24 h-7 border-primary-foreground/30 bg-primary-foreground/10 text-xs text-primary-foreground placeholder:text-primary-foreground/50"
                                  value={overrideInputs[resource.id] ?? (linked?.override_value ?? '')}
                                  onChange={(e) => setOverrideInputs(prev => ({ ...prev, [resource.id]: e.target.value }))}
                                  onBlur={() => handleOverrideBlur(resource.id)}
                                />
                                {hasOverride && (
                                  <span className="text-xs font-medium text-primary-foreground">
                                    = {fmt(finalCost)}
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
                      <span className="font-medium">{t.linkedCategoryLabels.gift}</span>
                      <Badge variant="outline" className="text-xs">{t.linkedBadgePerExecution}</Badge>
                      {gifts.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {gifts.length > 1
                            ? t.linkedBadgeLinked_other.replace('{count}', String(gifts.length))
                            : t.linkedBadgeLinked_one.replace('{count}', String(gifts.length))}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {gifts.length > 0 && (
                        <span className="text-sm font-medium text-primary">
                          {fmt(totals.gift)}
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
                        className={`grid grid-cols-[minmax(0,1fr)_2.75rem] items-start gap-3 rounded-xl p-3 transition-colors ${isLinked ? 'bg-primary text-primary-foreground [&_.text-muted-foreground]:text-primary-foreground/70 [&_.text-foreground]:text-primary-foreground' : 'bg-muted/30 hover:bg-muted/45'}`}
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          <Checkbox
                            id={`gift-${resource.id}`}
                            checked={isLinked}
                            className={isLinked ? 'border-primary-foreground data-[state=checked]:border-primary-foreground data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary' : undefined}
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
                          <Label htmlFor={`gift-${resource.id}`} className="min-w-0 cursor-pointer break-words leading-relaxed">
                            <span className="font-medium">{resource.name}</span>
                          </Label>
                        </div>
                        <Button type="button" variant="edit-ghost" size="icon" aria-label={`Editar cadastro do recurso ${resource.name}`} title="Editar cadastro do recurso" className={`-mt-1 h-11 w-11 ${isLinked ? 'text-primary-foreground' : ''}`} onClick={() => setEditingResource(resource)}><Pencil className="h-4 w-4" /></Button>
                        <span className="col-start-1 text-sm font-medium text-foreground">
                          {t.linkedPerExecution.replace('{amount}', fmt(resource.total_monthly_cost ?? 0))}
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
          <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3 shadow-sm">
            <span className="text-sm font-medium text-foreground">{t.linkedTotalLabel}</span>
            <span className="text-lg font-bold text-primary">{fmt(totals.total)}</span>
          </div>
        )}
      </CardContent>
    </Card>
    {editingResource && <ContextualCostResourceEditor resource={editingResource} onClose={() => setEditingResource(null)} />}
  </>);
}
