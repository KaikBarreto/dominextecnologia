import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NfseTier } from '@/hooks/useNfseTiers';

/**
 * Grade de módulos do plano Personalizado (painel master Auctus).
 * Reutilizada pelo CompanyFormModal (criar/editar empresa) e pelo
 * GenerateLinkModal (link de afiliado com plano personalizado).
 *
 * Catálogo SEMPRE vem de subscription_modules (nunca hardcode de preço/nome).
 */

// O catálogo não tem flag is_base_module: 'basic' é o módulo raiz incluído em
// TODOS os planos (ver subscription_plans.included_modules). Identificador
// estrutural, não dado de catálogo.
export const BASE_MODULE_CODES = ['basic'];

// 'extra_user' é um adicional por usuário, não um recurso marcável — o limite
// de usuários é controlado pelo campo "Máx. Usuários" (Dominex não soma
// usuário extra no preço, diferente do EcoSistema).
const HIDDEN_MODULE_CODES = ['extra_user'];

export interface SubscriptionModule {
  code: string;
  name: string;
  price: number | null;
  description: string | null;
  type: string | null;
  sort_order: number | null;
}

export function useSubscriptionModules() {
  return useQuery({
    queryKey: ['subscription-modules-active'],
    queryFn: async (): Promise<SubscriptionModule[]> => {
      const { data, error } = await supabase
        .from('subscription_modules')
        .select('code, name, price, description, type, sort_order')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });
}

/** Garante que os módulos base estão sempre presentes na seleção. */
export function withBaseModules(selected: string[]): string[] {
  return Array.from(new Set([...BASE_MODULE_CODES, ...selected]));
}

/**
 * Soma dos preços dos módulos selecionados (base sempre incluso).
 *
 * O módulo de Notas (code `nfe`) tem preço variável por NÍVEL (nfse_tiers).
 * Quando `nfseTiers`/`nfseTier` são informados, o preço do `nfe` vem do nível
 * escolhido; senão cai no preço fixo do catálogo (retrocompatível).
 */
export function sumModulesPrice(
  modules: SubscriptionModule[],
  selected: string[],
  nfseTiers?: NfseTier[],
  nfseTier?: number,
): number {
  const set = new Set(withBaseModules(selected));
  let price = 0;
  for (const m of modules) {
    if (!set.has(m.code)) continue;
    if (m.code === 'nfe' && nfseTiers?.length) {
      const t = nfseTiers.find(x => x.tier === (nfseTier ?? 1));
      price += t?.price ?? (Number(m.price) || 0);
    } else {
      price += Number(m.price) || 0;
    }
  }
  return price;
}

interface ModuleGridProps {
  modules: SubscriptionModule[];
  /** Códigos selecionados (deve incluir os base — use withBaseModules). */
  selected: string[];
  onToggle: (code: string) => void;
  disabled?: boolean;
}

export function ModuleGrid({ modules, selected, onToggle, disabled = false }: ModuleGridProps) {
  const gridModules = modules.filter(m => !HIDDEN_MODULE_CODES.includes(m.code));

  if (gridModules.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum módulo disponível no catálogo.</p>;
  }

  return (
    <div className="space-y-2">
      {gridModules.map(mod => {
        const isBase = BASE_MODULE_CODES.includes(mod.code);
        const isChecked = isBase || selected.includes(mod.code);
        const isLocked = isBase || disabled;
        return (
          <div
            key={mod.code}
            role="checkbox"
            aria-checked={isChecked}
            aria-disabled={isLocked}
            className={cn(
              'flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors select-none',
              isChecked ? 'border-primary bg-primary/5' : 'border-muted',
              isLocked ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer hover:border-primary/50',
            )}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isLocked) onToggle(mod.code);
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  'h-5 w-5 rounded border flex items-center justify-center shrink-0',
                  isChecked ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30',
                )}
              >
                {isChecked && <Check className="h-3.5 w-3.5" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight flex items-center gap-1.5">
                  {mod.name}
                  {isBase && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                </p>
                {mod.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{mod.description}</p>
                )}
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 whitespace-nowrap">
              {isBase
                ? `R$ ${Number(mod.price || 0).toFixed(0)} · sempre incluso`
                : `+ R$ ${Number(mod.price || 0).toFixed(0)}`}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
