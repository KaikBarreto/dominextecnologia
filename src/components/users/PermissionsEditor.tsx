import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  SCREEN_CATEGORIES,
  SCREEN_PERMISSIONS,
  getAllPermissionKeys,
  getFunctionsByScreen,
  getOrphanFunctions,
  type FunctionPermission,
  type PermissionPreset,
  type ScreenPermission,
} from '@/hooks/usePermissions';
import {
  filterPermissionActions,
  filterPermissionTree,
  normalizePermissionText,
  type PermissionSearchGroup,
} from './permissionSearch';

// ─────────────────────────────────────────────────────────────────────────────
// Editor de permissões (compartilhado entre "Editar Usuário" e "Cargos").
//
// Estrutura vertical: chips de cargo → busca → uma linha por TELA, com as ações
// daquela tela recolhidas dentro dela.
//
// Decisões que NÃO devem ser desfeitas sem motivo:
//   • O chip de cargo ativo é DERIVADO da seleção (useMemo), nunca guardado em
//     estado. É isso que faz o chip apagar sozinho quando o admin desliga uma
//     permissão, e acender de novo quando ele religa. useEffect intermediário
//     aqui causa remonte/re-render do modal a cada clique.
//   • O Switch fica FORA do CollapsibleTrigger: clicar no switch nunca expande,
//     clicar na linha nunca liga/desliga.
//   • Ação-filha é ligável MESMO com a tela desligada (nada de `disabled`) — o
//     texto explica. Ex.: técnico que edita OS pelo link de campo não precisa da
//     tela de Ordens de Serviço.
//   • Hover em UM retângulo só: o wrapper pinta, o botão interno não.
//   • Sem "marcar todos": esse papel é do chip de cargo.
//   • Sem scroll aninhado: a lista flui no scroll do próprio modal (o
//     ResponsiveModal já rola). A busca fica sticky pra não sumir.
// ─────────────────────────────────────────────────────────────────────────────

export interface PermissionsEditorProps {
  /** Permissões marcadas. Aceita o curinga '*' (acesso total). */
  value: string[];
  onChange: (next: string[]) => void;
  /** Cargos vindos da TABELA `permission_presets` (o usuário cria/edita na tela de Cargos). */
  presets?: PermissionPreset[];
  /** Mostra o chip "Acesso Total" (curinga '*'). Só o formulário de usuário usa. */
  allowFullAccess?: boolean;
  className?: string;
}

type ScreenGroup = PermissionSearchGroup<ScreenPermission, FunctionPermission>;

/** Árvore tela → ações. Estática (vem do catálogo), montada uma vez por módulo. */
const SCREEN_TREE: ScreenGroup[] = SCREEN_PERMISSIONS.map(screen => ({
  screen,
  actions: getFunctionsByScreen(screen.key),
}));

/** Ações sem tela-pai. Hoje vazio, mas o bloco "Geral" existe pra nunca sumir nada. */
const ORPHAN_ACTIONS: FunctionPermission[] = getOrphanFunctions();

const CATEGORY_ORDER = Object.keys(SCREEN_CATEGORIES);

export function PermissionsEditor({
  value,
  onChange,
  presets = [],
  allowFullAccess = false,
  className,
}: PermissionsEditorProps) {
  const { locale } = useAppLocaleContext();
  const te = MESSAGES[locale].app.settings.users.permissionsEditor;

  const [query, setQuery] = useState('');
  const [openScreens, setOpenScreens] = useState<Record<string, boolean>>({});

  const allKeys = useMemo(() => getAllPermissionKeys(), []);

  /** Chaves efetivamente marcadas — o curinga '*' vira a lista completa. */
  const selectedKeys = useMemo(
    () => (value.includes('*') ? allKeys : value),
    [value, allKeys],
  );
  const selected = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const isFullAccess = useMemo(
    () => allKeys.length > 0 && allKeys.every(k => selected.has(k)),
    [allKeys, selected],
  );

  /**
   * Cargo ativo DERIVADO: bate tamanho + conteúdo. Nenhum bate → "Personalizado".
   * (ver comentário do topo — nada de useEffect aqui)
   */
  const activePresetId = useMemo(() => {
    if (isFullAccess) return null;
    const match = presets.find(
      p => p.permissions.length === selectedKeys.length && p.permissions.every(k => selected.has(k)),
    );
    return match?.id ?? null;
  }, [presets, selectedKeys, selected, isFullAccess]);

  const isCustom = !isFullAccess && !activePresetId;
  const showChips = allowFullAccess || presets.length > 0;

  // ── Mutação ───────────────────────────────────────────────────────────────
  const toggleKey = (key: string) => {
    // Sair do "Acesso Total" expande o curinga nas chaves reais pra dar pra
    // desmarcar uma só.
    const base = value.includes('*') ? allKeys : value;
    onChange(base.includes(key) ? base.filter(k => k !== key) : [...base, key]);
  };

  /** Aplicar cargo SUBSTITUI a seleção (não soma). */
  const applyPreset = (preset: PermissionPreset) => onChange([...preset.permissions]);
  const applyFullAccess = () => onChange([...allKeys]);

  // ── Busca ─────────────────────────────────────────────────────────────────
  const searching = normalizePermissionText(query).length > 0;
  const filteredTree = useMemo(() => filterPermissionTree(SCREEN_TREE, query), [query]);
  const filteredOrphans = useMemo(() => filterPermissionActions(ORPHAN_ACTIONS, query), [query]);
  const handleQueryChange = (next: string) => {
    setQuery(next);
    // Buscando, as telas que sobraram abrem sozinhas (senão a ação que casou fica
    // escondida). Zerar o estado explícito evita que uma tela fechada na mão antes
    // da busca engula o resultado.
    setOpenScreens({});
  };

  const hasResults = filteredTree.length > 0 || filteredOrphans.length > 0;

  // ── Linha de ação (filha ou solta no bloco "Geral") ───────────────────────
  const renderAction = (action: FunctionPermission) => (
    <div
      key={action.key}
      className="flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted/60"
    >
      <Switch
        checked={selected.has(action.key)}
        onCheckedChange={() => toggleKey(action.key)}
        aria-label={action.label}
      />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm leading-tight', !selected.has(action.key) && 'text-muted-foreground')}>
          {action.label}
        </p>
        <p className="text-[11px] leading-tight text-muted-foreground">{action.description}</p>
      </div>
    </div>
  );

  // ── Linha de tela ─────────────────────────────────────────────────────────
  const renderScreen = (group: ScreenGroup) => {
    const { screen, actions } = group;
    const ScreenIcon = screen.icon;
    const screenOn = selected.has(screen.key);
    const activeCount = actions.filter(a => selected.has(a.key)).length;

    const head = (
      <>
        {/* Switch FORA do trigger: zona de clique própria. */}
        <Switch
          checked={screenOn}
          onCheckedChange={() => toggleKey(screen.key)}
          aria-label={te.ariaScreenSwitch.replace('{screen}', screen.label)}
        />
      </>
    );

    // Tela sem ações: sem trigger, sem contador, sem seta.
    if (actions.length === 0) {
      return (
        <div key={screen.key} className="rounded-lg bg-muted/30">
          <div className="flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/60">
            {head}
            <div className="flex min-w-0 flex-1 items-center gap-2 px-1 py-0.5">
              <ScreenIcon className={cn('h-4 w-4 shrink-0', screenOn ? 'text-foreground' : 'text-muted-foreground')} />
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-sm font-medium leading-tight', !screenOn && 'text-muted-foreground')}>
                  {screen.label}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{screen.description}</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    const isOpen = openScreens[screen.key] ?? searching;

    return (
      <Collapsible
        key={screen.key}
        open={isOpen}
        onOpenChange={o => setOpenScreens(s => ({ ...s, [screen.key]: o }))}
        className="rounded-lg bg-muted/30 data-[state=open]:bg-muted/50"
      >
        <div className="group/row flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/60">
          {head}
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-label={te.ariaScreenActions.replace('{screen}', screen.label)}
              className="group flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-left"
            >
              <ScreenIcon className={cn('h-4 w-4 shrink-0', screenOn ? 'text-foreground' : 'text-muted-foreground')} />
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-sm font-medium leading-tight', !screenOn && 'text-muted-foreground')}>
                  {screen.label}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{screen.description}</p>
              </div>
              <Badge
                variant="secondary"
                className={cn(
                  'shrink-0 tabular-nums',
                  activeCount > 0 && screenOn ? 'bg-primary/15 text-primary' : 'text-muted-foreground',
                )}
              >
                {activeCount}/{actions.length}
              </Badge>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          {/* ml-9 alinha com a largura do switch da linha-pai; a guia é neutra. */}
          <div className="mb-2 ml-9 mr-2 rounded-lg border-l-2 border-muted-foreground/25 bg-muted/40 px-3 py-2.5">
            <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">{te.actionsTitle}</p>
            {!screenOn && (
              <p className="mb-1 text-[11px] italic text-muted-foreground">{te.screenOffHint}</p>
            )}
            <div className="space-y-0.5">{actions.map(renderAction)}</div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* ── Chips de cargo ─────────────────────────────────────────────────── */}
      {showChips && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {te.quickProfiles}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {allowFullAccess && (
              <button
                type="button"
                onClick={applyFullAccess}
                title={te.fullAccessHint}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  isFullAccess
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-foreground hover:bg-muted',
                )}
              >
                {isFullAccess && <Check className="h-3.5 w-3.5" />}
                {te.fullAccess}
              </button>
            )}
            {presets.map(preset => {
              const active = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  title={preset.description || undefined}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/60 text-foreground hover:bg-muted',
                  )}
                >
                  {active && <Check className="h-3.5 w-3.5" />}
                  {preset.name}
                </button>
              );
            })}
            {isCustom && (
              // Não clicável: só informa que a seleção não bate com nenhum cargo.
              <span className="inline-flex cursor-default items-center rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                {te.custom}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Busca ──────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 -mx-1 bg-background px-1 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            placeholder={te.searchPlaceholder}
            className="pl-9 pr-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => handleQueryChange('')}
              aria-label={te.clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Lista ──────────────────────────────────────────────────────────── */}
      {!hasResults ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <Search className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {te.emptySearch.replace('{query}', query.trim())}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Bloco "Geral": ações sem tela-pai (hoje nenhuma, mas nada some por esquecimento). */}
          {filteredOrphans.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {te.generalGroup}
              </p>
              <div className="space-y-0.5 rounded-lg bg-muted/30 p-1.5">
                {filteredOrphans.map(renderAction)}
              </div>
            </div>
          )}

          {CATEGORY_ORDER.map(catKey => {
            const category = SCREEN_CATEGORIES[catKey];
            const groups = filteredTree.filter(g => g.screen.category === catKey);
            if (groups.length === 0) return null;
            const CategoryIcon = category.icon;
            return (
              <div key={catKey} className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <CategoryIcon className="h-3.5 w-3.5" />
                  {category.label}
                </p>
                <div className="space-y-1">{groups.map(renderScreen)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
