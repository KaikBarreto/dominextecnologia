import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ADMIN_FUNCTION_PERMISSIONS, ADMIN_SCREEN_PERMISSIONS } from '@/hooks/useAdminPermissions';

type Props = { value: string[]; onChange: (next: string[]) => void };

const PRESETS = [
  { key: 'financeiro_consulta', label: 'Financeiro (consulta)', permissions: ['admin_financeiro', 'admin_financeiro_totais'] },
  { key: 'comercial', label: 'Comercial', permissions: ['admin_crm', 'admin_empresas', 'admin_vendedores', 'admin_empresas_criar', 'admin_empresas_editar', 'admin_empresas_pagamento', 'admin_empresas_acesso', 'admin_crm_criar_lead'] },
  { key: 'equipe', label: 'Equipe', permissions: ['admin_vendedores', 'admin_vendedores_ver_todos', 'admin_vendedores_gerenciar'] },
] as const;

export function AdminPermissionsEditor({ value, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const selected = useMemo(() => new Set(value), [value]);
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const toggle = (key: string) => onChange(selected.has(key) ? value.filter((item) => item !== key) : [...value, key]);
  const actionsFor = (screen: string) => ADMIN_FUNCTION_PERMISSIONS.filter((action) =>
    (screen === 'admin_empresas' && action.key.startsWith('admin_empresas_')) ||
    (screen === 'admin_financeiro' && action.key.startsWith('admin_financeiro_')) ||
    (screen === 'admin_vendedores' && action.key.startsWith('admin_vendedores_')) ||
    (screen === 'admin_crm' && action.key.startsWith('admin_crm_')),
  );
  const screens = ADMIN_SCREEN_PERMISSIONS.filter((screen) => !normalizedQuery
    || screen.label.toLocaleLowerCase('pt-BR').includes(normalizedQuery)
    || actionsFor(screen.key).some((action) => action.label.toLocaleLowerCase('pt-BR').includes(normalizedQuery)));

  return <div className="space-y-3">
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Perfis rápidos</p>
      <p className="mt-1 text-xs text-muted-foreground">Aplicar um perfil substitui a seleção atual. Nenhuma permissão é concedida até salvar.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {PRESETS.map((preset) => {
          const active = preset.permissions.length === value.length && preset.permissions.every((permission) => selected.has(permission));
          return <button key={preset.key} type="button" onClick={() => onChange([...preset.permissions])}
            className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium', active ? 'bg-primary text-primary-foreground' : 'border bg-white text-foreground hover:bg-white')}>
            {active && <Check className="h-3.5 w-3.5" />}{preset.label}
          </button>;
        })}
      </div>
    </div>
    <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar tela ou ação" /></div>
    {(selected.has('admin_financeiro') !== selected.has('admin_financeiro_totais')) && <p className="rounded-md border border-border bg-white px-3 py-2 text-xs text-foreground">A leitura financeira exige a tela Financeiro e a ação “Visualizar totais e DRE”. Marque as duas antes de salvar.</p>}
    <div className="space-y-2">
      {screens.map((screen) => {
        const actions = actionsFor(screen.key);
        const visibleActions = normalizedQuery ? actions.filter((action) => action.label.toLocaleLowerCase('pt-BR').includes(normalizedQuery)) : actions;
        const expanded = open[screen.key] ?? Boolean(normalizedQuery);
        const activeActions = actions.filter((action) => selected.has(action.key)).length;
        return <Collapsible key={screen.key} open={expanded} onOpenChange={(next) => setOpen((current) => ({ ...current, [screen.key]: next }))} className="rounded-lg border bg-background">
          <div className="flex items-center gap-2 p-3">
            <Switch checked={selected.has(screen.key)} onCheckedChange={() => toggle(screen.key)} aria-label={`Acesso à tela ${screen.label}`} />
            <CollapsibleTrigger asChild><button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{screen.label}</span>
              {actions.length > 0 && <Badge variant="secondary" className="tabular-nums">{activeActions}/{actions.length}</Badge>}
              {actions.length > 0 && <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />}
            </button></CollapsibleTrigger>
          </div>
          {actions.length > 0 && <CollapsibleContent><div className="mx-3 mb-3 space-y-2 border-l-2 border-border pl-3">
            {visibleActions.map((action) => <div key={action.key} className="flex items-center gap-3 rounded-md py-1"><Switch checked={selected.has(action.key)} onCheckedChange={() => toggle(action.key)} aria-label={action.label} /><span className="text-sm">{action.label}</span></div>)}
          </div></CollapsibleContent>}
        </Collapsible>;
      })}
      {screens.length === 0 && <p className="py-5 text-center text-sm text-muted-foreground">Nenhuma permissão encontrada.</p>}
    </div>
    <p className="text-xs text-muted-foreground">{value.length} permissão(ões) selecionada(s)</p>
  </div>;
}
