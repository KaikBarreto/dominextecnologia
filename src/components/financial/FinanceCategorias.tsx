import { useState, useCallback, useMemo } from 'react';
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Settings as SettingsIcon, Lock, GripVertical, ChevronUp, ChevronDown, ChevronRight, Tag, CornerUpLeft, ListTree } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFinancialCategories, type FinancialCategory } from '@/hooks/useFinancialCategories';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { CategoryFormDialog } from './CategoryFormDialog';
import { getCategoryIcon } from './categoryIcons';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { FABButton } from '@/components/mobile/FABButton';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { groupByDre, shouldGroupByDre, getDreGroupKey, type DreGroup } from '@/lib/dre-groups';
import { canRenameCategory, findCategoryNameConflict } from '@/lib/finance-system-categories';
import { buildCategoryTree } from '@/lib/category-tree';

type CategoryGroup = 'receitas' | 'despesas';

// A régua de grupo do DRE vive em `src/lib/dre-groups.ts` — compartilhada com o
// select de categoria do lançamento, pra as duas telas agruparem igual.
type DespesaGroup = DreGroup<FinancialCategory>;

export function FinanceCategorias() {
  const { categories, isLoading, createCategory, updateCategory, deleteCategory, reorderCategories } = useFinancialCategories();
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const fin = MESSAGES[locale].app.finance;
  const tsub = fin.categories.subcategories;
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FinancialCategory | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [defaultType, setDefaultType] = useState<string>('entrada');
  // Pai pré-selecionado ao criar ("Adicionar subcategoria"). `null` = categoria raiz.
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  // Grupo (chave DRE, ou 'flat' quando a lista não está agrupada) de onde o
  // drag começou/está passando por cima — usado só pra travar drop cross-grupo.
  const [dragGroupKey, setDragGroupKey] = useState<string | null>(null);
  const [dragOverGroupKey, setDragOverGroupKey] = useState<string | null>(null);
  const [mobileGroup, setMobileGroup] = useState<CategoryGroup>('receitas');
  // Categorias PAI abertas, por id. Vazio = tudo recolhido, que é o estado de
  // quem não usa subcategoria (e aí nada na tela muda em relação a antes).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /**
   * Árvore pai → filhas montada UMA vez, em memória, sobre a lista que o hook
   * já traz inteira (`select('*')` por empresa, no máximo algumas dezenas de
   * linhas). Nenhuma consulta nova, nenhuma contagem desnormalizada, nenhum
   * N+1 — ver `src/lib/category-tree.ts`.
   */
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);

  const receitas = categories.filter((c) => c.type === 'entrada' || c.type === 'ambos');
  const despesas = categories.filter((c) => c.type === 'saida' || c.type === 'ambos');
  // Só as RAÍZES entram na grade/lista: a filha é desenhada dentro do pai.
  // Assim nenhuma categoria aparece duas vezes na tela.
  const receitaRoots = receitas.filter((c) => !c.parent_id || !tree.byId.has(c.parent_id));
  const despesaRoots = despesas.filter((c) => !c.parent_id || !tree.byId.has(c.parent_id));

  /**
   * 🔴 Hierarquia × grupo do DRE, a regra desta tela:
   *
   * o grupo do DRE agrupa apenas as RAÍZES. A filha aparece SEMPRE debaixo do
   * pai, mesmo quando o `dre_group` dela é outro (o cliente classifica assim de
   * propósito: `Salários, Administrativo` é opex e `Salários, Ajudantes` é cmv).
   * Não existem duas árvores aninhadas: cada categoria aparece uma vez só.
   *
   * O preço disso é que uma filha pode estar sob um pai de CSP e mesmo assim
   * entrar em OPEX no resultado. A tela não esconde isso: a filha de grupo
   * diferente leva um selo com o grupo dela, e o bloco expandido explica a
   * regra em uma linha (`dreMixedHint`).
   */
  const despesaGroups: DespesaGroup[] = groupByDre(despesaRoots, {
    impostos: fin.categoryForm.dreGroups.impostos,
    cmv: fin.categoryForm.dreGroups.cmv,
    opex: fin.categoryForm.dreGroups.opex,
    outros: fin.categoryForm.dreGroups.outros,
  });

  // Requisito 3: só desenha divisória quando há 2+ grupos com item. Empresa
  // que nunca classificou (quase tudo em 'opex') continua vendo lista plana.
  const shouldGroupDespesas = shouldGroupByDre(despesaGroups);

  // Contagem do divisor conta a raiz MAIS as filhas dela: assim a soma dos
  // grupos continua batendo com o total do cabeçalho da seção.
  const groupCount = (roots: FinancialCategory[]) =>
    roots.reduce((acc, r) => acc + 1 + tree.childrenOf(r.id).length, 0);

  const handleSubmit = async (data: any) => {
    if (editing) {
      // `previous_name` é o que permite cascatear o rename pros lançamentos que
      // já guardam o nome antigo; `is_system` é o que trava tipo e grupo do DRE.
      await updateCategory.mutateAsync({
        ...data,
        id: editing.id,
        is_system: editing.is_system,
        previous_name: editing.name,
      });
    } else {
      await createCategory.mutateAsync(data);
      // Criou subcategoria: abre o pai, senão ela nasce escondida e parece que
      // nada aconteceu.
      if (data?.parent_id) {
        setExpandedIds((prev) => new Set(prev).add(data.parent_id));
      }
    }
    setEditing(null);
    setDefaultParentId(null);
    setFormOpen(false);
  };

  /**
   * Duas categorias com o mesmo nome ficariam indistinguíveis na lista e no
   * DRE, e a cascata do rename juntaria o histórico das duas num nome só, sem
   * volta. Vale inclusive entre filhas de pais DIFERENTES: o lançamento guarda
   * o nome em texto, então "Combustível" em dois pais tornaria a DRE ambígua.
   * O banco também recusa (índice único por empresa).
   */
  const validateCategoryName = (name: string, type: string): string | null => {
    const conflict = findCategoryNameConflict(categories, { id: editing?.id, name, type });
    return conflict ? fin.categories.nameConflict : null;
  };

  /**
   * Categoria de sistema passou a ser editável em NOME, cor e ícone — mas só a
   * que o lançamento automático encontra por PAPEL (`canRenameCategory`).
   * Tipo e grupo do DRE continuam travados sempre: é por eles que o papel é
   * identificado e é neles que a categoria se apoia no resultado. A trava vive
   * no formulário e também no hook.
   *
   * As outras de sistema ('Impostos e Taxas', 'Pagamento de Fatura',
   * 'Transferência entre contas', linhas de CSP) seguem com cadeado, porque
   * ainda são procuradas pelo nome literal — aqui ou dentro do banco.
   */
  const handleEdit = (cat: FinancialCategory) => {
    if (!canRenameCategory(categories, cat)) {
      toast({ title: fin.categories.systemEditWarning });
      return;
    }
    setEditing(cat);
    setDefaultParentId(null);
    setFormOpen(true);
  };

  const handleNew = (type: string) => {
    setEditing(null);
    setDefaultType(type);
    setDefaultParentId(null);
    setFormOpen(true);
  };

  /** "Adicionar subcategoria": nasce com o pai fixo e o tipo dele. */
  const handleNewChild = (parent: FinancialCategory) => {
    setEditing(null);
    setDefaultType(parent.type);
    setDefaultParentId(parent.id);
    setFormOpen(true);
  };

  /**
   * Solta a filha do pai: ela vira categoria RAIZ, com nome, grupo do DRE e
   * histórico intactos (o lançamento guarda o nome, não o vínculo). É o mesmo
   * efeito de excluir o pai, só que de propósito.
   */
  const handlePromote = async (cat: FinancialCategory) => {
    await updateCategory.mutateAsync({
      id: cat.id,
      name: cat.name,
      type: cat.type,
      color: cat.color,
      icon: cat.icon ?? 'Tag',
      dre_group: cat.dre_group ?? 'opex',
      parent_id: null,
      is_system: cat.is_system,
      previous_name: cat.name,
    });
  };

  const handleAskDelete = (cat: FinancialCategory) => {
    if (cat.is_system) {
      toast({ title: fin.categories.systemDeleteWarning });
      return;
    }
    setDeleteId(cat.id);
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteCategory.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const handleDragStart = useCallback((idx: number, groupKey: string) => {
    setDragIdx(idx);
    setDragGroupKey(groupKey);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number, groupKey: string) => {
    e.preventDefault();
    setDragOverIdx(idx);
    setDragOverGroupKey(groupKey);
  }, []);

  /**
   * `fullList` é a fonte da verdade do sort_order (todas as despesas, ou
   * todas as receitas — nunca só o grupo). `groupItems` é o subconjunto
   * visualmente arrastado (as RAÍZES de um grupo do DRE, ou as raízes da lista
   * inteira quando ela não está agrupada).
   *
   * Exemplo: fullList = [A(impostos), B(cmv), C(cmv), D(cmv), E(opex)],
   * grupo cmv = [B, C, D] ocupando as posições globais 1,2,3. Arrastar D
   * (idx local 2) pra idx local 0 dá [D, B, C]; reinserido nas MESMAS
   * posições globais 1,2,3 → fullList vira [A, D, B, C, E]. Só então
   * renumeramos sort_order 0..4. A(0) e E(4) nunca se movem.
   *
   * Subcategoria não é arrastável: ela ocupa a posição que já tem em
   * `fullList` e é pulada pelo mapeamento (não está em `groupIds`).
   */
  const handleDrop = useCallback((fullList: FinancialCategory[], groupItems: FinancialCategory[], idx: number, groupKey: string) => {
    const originIdx = dragIdx;
    const originGroup = dragGroupKey;
    setDragIdx(null);
    setDragOverIdx(null);
    setDragGroupKey(null);
    setDragOverGroupKey(null);
    // Bloqueia reordenar entre grupos diferentes: não reclassifica a categoria.
    if (originIdx === null || originGroup !== groupKey || originIdx === idx) return;

    const reorderedGroup = [...groupItems];
    const [moved] = reorderedGroup.splice(originIdx, 1);
    reorderedGroup.splice(idx, 0, moved);

    const groupIds = new Set(groupItems.map((c) => c.id));
    let cursor = 0;
    const fullReordered = fullList.map((cat) => (groupIds.has(cat.id) ? reorderedGroup[cursor++] : cat));

    const updates = fullReordered.map((c, i) => ({ id: c.id, sort_order: i }));
    reorderCategories.mutate(updates);
  }, [dragIdx, dragGroupKey, reorderCategories]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
    setDragGroupKey(null);
    setDragOverGroupKey(null);
  }, []);

  // Reorder via setas (mobile) — substitui drag-drop. Mesma regra: só reordena
  // dentro do grupo (groupItems), renumerando sempre o array completo (fullList).
  const moveCategory = useCallback((fullList: FinancialCategory[], groupItems: FinancialCategory[], idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= groupItems.length) return;

    const reorderedGroup = [...groupItems];
    const [moved] = reorderedGroup.splice(idx, 1);
    reorderedGroup.splice(targetIdx, 0, moved);

    const groupIds = new Set(groupItems.map((c) => c.id));
    let cursor = 0;
    const fullReordered = fullList.map((cat) => (groupIds.has(cat.id) ? reorderedGroup[cursor++] : cat));

    const updates = fullReordered.map((c, i) => ({ id: c.id, sort_order: i }));
    reorderCategories.mutate(updates);
  }, [reorderCategories]);

  // ─── Ações de uma linha (mesmas no card e no item mobile) ──────────────────
  const rowActions = (cat: FinancialCategory) => {
    const isSystem = cat.is_system;
    const canRename = canRenameCategory(categories, cat);
    const isChild = !!cat.parent_id && tree.byId.has(cat.parent_id);
    const actions: { label: string; icon: any; variant: 'edit' | 'delete' | 'default'; onClick: () => void }[] = [];
    if (!isSystem || canRename) {
      actions.push({ label: fin.categories.actions.edit, icon: Pencil, variant: 'edit', onClick: () => handleEdit(cat) });
    }
    // Só RAIZ ganha filha: o banco recusa neto (hierarquia de dois níveis).
    if (!isChild) {
      actions.push({ label: tsub.addAction, icon: ListTree, variant: 'default', onClick: () => handleNewChild(cat) });
    } else {
      actions.push({ label: tsub.promoteAction, icon: CornerUpLeft, variant: 'default', onClick: () => void handlePromote(cat) });
    }
    if (!isSystem) {
      actions.push({ label: fin.categories.actions.delete, icon: Trash2, variant: 'delete', onClick: () => setDeleteId(cat.id) });
    }
    return actions;
  };

  /**
   * Selo do grupo do DRE da FILHA, só quando ele difere do grupo do pai.
   * Saturado com texto branco (nada de contorno dessaturado). É a resposta
   * visual pra a pergunta "por que essa está aqui e no OPEX do resultado?".
   */
  const childDreBadge = (child: FinancialCategory, parent: FinancialCategory) => {
    if (child.type === 'entrada' || parent.type === 'entrada') return null;
    const childKey = getDreGroupKey(child);
    if (childKey === getDreGroupKey(parent)) return null;
    return (
      <Badge className="bg-primary text-primary-foreground hover:bg-primary border-0 text-[10px] px-1.5 py-0 font-medium shrink-0">
        {fin.categoryForm.dreGroups[childKey]}
      </Badge>
    );
  };

  const hasMixedDreGroups = (parent: FinancialCategory, children: readonly FinancialCategory[]) =>
    parent.type !== 'entrada' && children.some((c) => getDreGroupKey(c) !== getDreGroupKey(parent));

  // ─── DESKTOP: grade de cards enxutos, com drag-drop escopado a um grupo ────
  //
  // Grade em vez de pilha porque a empresa do cliente tem 42 categorias de
  // despesa: empilhadas em linha única viravam uma rolagem enorme. O card é
  // deliberadamente enxuto (ícone, nome, contagem de filhas) — é grade pra
  // caber mais, não card grande.
  //
  // ⚠️ Expansível dentro de grade: o card cresce NA PRÓPRIA CÉLULA. Com
  // `items-start` os vizinhos não esticam e nada muda de lugar: a linha só
  // fica mais alta. Foi a escolha em vez de `col-span-full` (que abre buraco
  // quando o card expandido não é o primeiro da linha) e em vez de popover
  // (que tira o conteúdo do fluxo e some com a afordância de "expandiu aqui").
  // A lista de filhas é limitada em altura pra um pai com muitas filhas não
  // esticar a linha inteira.
  // `minmax` em vez de `sm:/lg:/xl:grid-cols-N`: com Receita e Despesa lado a
  // lado (ver layout desktop abaixo), cada seção passou a ter METADE da
  // largura da tela, e breakpoint de viewport não sabe disso — daria 4 cards
  // por linha numa coluna que não tem espaço pra 4. `auto-fill` conta o
  // espaço de verdade do próprio grid (cheio quando a seção está empilhada,
  // pela metade quando está lado a lado) e decide sozinho quantos cards de
  // ~220 a ~460px cabem por linha — 1 na faixa "tela média", 2 a 3 em tela
  // larga, sem card esticando feio quando sobra pouco item na linha.
  const renderCategoryGrid = (fullList: FinancialCategory[], groupItems: FinancialCategory[], groupKey: string) => (
    <div className="grid gap-2.5 items-start" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 460px))' }}>
      {groupItems.map((cat, idx) => {
        const Icon = getCategoryIcon(cat.icon);
        const isSystem = cat.is_system;
        const canRename = canRenameCategory(categories, cat);
        const isDragging = dragIdx === idx && dragGroupKey === groupKey;
        const isDragOver = dragOverIdx === idx && dragOverGroupKey === groupKey && dragGroupKey === groupKey;
        const children = tree.childrenOf(cat.id);
        const hasChildren = children.length > 0;
        const isOpen = hasChildren && expandedIds.has(cat.id);
        return (
          <div
            key={cat.id}
            draggable={!isSystem}
            onDragStart={() => handleDragStart(idx, groupKey)}
            onDragOver={(e) => handleDragOver(e, idx, groupKey)}
            onDrop={() => handleDrop(fullList, groupItems, idx, groupKey)}
            onDragEnd={handleDragEnd}
            className={cn(
              'group rounded-xl border border-border px-3 py-2.5 transition-all duration-200',
              'hover:shadow-md hover:border-primary/20 hover:bg-accent/30',
              isDragging && 'opacity-40 scale-95',
              isDragOver && 'border-primary border-dashed bg-primary/5',
              !isSystem && 'cursor-grab active:cursor-grabbing',
            )}
          >
            <div
              className={cn('flex items-center gap-2 min-w-0', hasChildren && 'cursor-pointer')}
              onClick={hasChildren ? () => toggleExpanded(cat.id) : undefined}
              role={hasChildren ? 'button' : undefined}
              tabIndex={hasChildren ? 0 : undefined}
              aria-expanded={hasChildren ? isOpen : undefined}
              aria-label={hasChildren ? (isOpen ? tsub.collapseAria : tsub.expandAria).replace('{category}', cat.name) : undefined}
              onKeyDown={hasChildren ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(cat.id); }
              } : undefined}
            >
              {/* Espaço da alça reservado mesmo quando não existe (categoria de
                  sistema não é arrastável): sem isso o ícone dela nasce mais à
                  esquerda que o dos vizinhos e a grade fica desalinhada. */}
              <div className="flex h-4 w-4 items-center justify-center shrink-0">
                {!isSystem && (
                  <GripVertical className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                )}
              </div>
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 shadow-sm"
                style={{ backgroundColor: cat.color }}
              >
                <Icon className="h-4 w-4 text-white" />
              </div>
              {/* `min-w-0` é o que segura nome longo em card estreito: sem ele
                  o flex item usa a largura do texto e estoura a célula. */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-medium text-sm truncate" title={cat.name}>{cat.name}</span>
                  {isSystem && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent>{canRename ? fin.categories.systemRenameableTooltip : fin.categories.systemTooltip}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {hasChildren && (
                  <span className="block text-[11px] text-muted-foreground leading-tight">
                    {children.length === 1
                      ? tsub.countOne
                      : tsub.count.replace('{count}', String(children.length))}
                  </span>
                )}
              </div>
              {hasChildren && (
                isOpen
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              {(!isSystem || canRename) && (
                <div
                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <RowActionsMenu actions={rowActions(cat)} />
                </div>
              )}
            </div>

            {isOpen && (
              <div className="mt-2 border-t border-border/60 pt-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pb-1">
                  {tsub.sectionLabel}
                </p>
                <div className="space-y-0.5 max-h-56 overflow-y-auto">
                  {children.map((child) => {
                    const ChildIcon = getCategoryIcon(child.icon);
                    return (
                      <div key={child.id} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-muted/50 min-w-0">
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded-md shrink-0"
                          style={{ backgroundColor: child.color }}
                        >
                          <ChildIcon className="h-3 w-3 text-white" />
                        </span>
                        <span className="text-xs truncate min-w-0 flex-1" title={child.name}>{child.name}</span>
                        {childDreBadge(child, cat)}
                        <RowActionsMenu actions={rowActions(child)} />
                      </div>
                    );
                  })}
                </div>
                {hasMixedDreGroups(cat, children) && (
                  <p className="text-[10px] text-muted-foreground leading-snug pt-1.5">
                    {tsub.dreMixedHint}
                  </p>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-7 w-full justify-start px-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => handleNewChild(cat)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {tsub.addAction}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // ─── MOBILE: item com MobileListItem + setas ↑↓ ────────────────────────────
  // Mobile continua em LINHAS (não em grade): a grade é resposta pro volume no
  // desktop. `fullList` é a fonte de verdade do sort_order; `groupItems` são as
  // RAÍZES do grupo em que o item está renderizado. Primeiro/último item do
  // GRUPO não pode sair dele.
  const renderMobileItem = (cat: FinancialCategory, idx: number, groupItems: FinancialCategory[], fullList: FinancialCategory[]) => {
    const Icon = getCategoryIcon(cat.icon);
    const isSystem = cat.is_system;
    const isFirst = idx === 0;
    const isLast = idx === groupItems.length - 1;
    const children = tree.childrenOf(cat.id);
    const hasChildren = children.length > 0;
    const isOpen = hasChildren && expandedIds.has(cat.id);

    const actions: ItemAction[] = [];
    if (!isSystem && !isFirst) {
      actions.push({
        key: 'move-up',
        label: fin.categories.actions.moveUp,
        icon: <ChevronUp className="h-4 w-4" />,
        onClick: () => moveCategory(fullList, groupItems, idx, -1),
      });
    }
    if (!isSystem && !isLast) {
      actions.push({
        key: 'move-down',
        label: fin.categories.actions.moveDown,
        icon: <ChevronDown className="h-4 w-4" />,
        onClick: () => moveCategory(fullList, groupItems, idx, 1),
      });
    }
    if (!isSystem || canRenameCategory(categories, cat)) {
      actions.push({
        key: 'edit',
        label: fin.categories.actions.edit,
        icon: <Pencil className="h-4 w-4" />,
        variant: 'edit' as const,
        onClick: () => handleEdit(cat),
      });
    }
    actions.push({
      key: 'add-child',
      label: tsub.addAction,
      icon: <ListTree className="h-4 w-4" />,
      onClick: () => handleNewChild(cat),
    });
    if (!isSystem) {
      actions.push({
        key: 'delete',
        label: fin.categories.actions.delete,
        icon: <Trash2 className="h-4 w-4" />,
        variant: 'destructive' as const,
        onClick: () => handleAskDelete(cat),
      });
    }

    return (
      <div key={cat.id}>
        <MobileListItem
          actions={actions}
          onClick={hasChildren ? () => toggleExpanded(cat.id) : undefined}
          leading={
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full shrink-0 shadow-sm"
              style={{ backgroundColor: cat.color }}
            >
              <Icon className="h-5 w-5 text-white" />
            </div>
          }
          title={cat.name}
          subtitle={
            // `div` (não `span`): o Badge do design system renderiza um div, e
            // div dentro de span é aninhamento inválido.
            <div className="flex items-center gap-1.5 flex-wrap">
              {isSystem && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                  <Lock className="h-2.5 w-2.5" />
                  {fin.categories.system}
                </Badge>
              )}
              {hasChildren && (
                <span className="text-[11px] text-muted-foreground">
                  {children.length === 1 ? tsub.countOne : tsub.count.replace('{count}', String(children.length))}
                </span>
              )}
            </div>
          }
          trailing={hasChildren ? (
            isOpen
              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : undefined}
        />
        {isOpen && (
          // Aninhado em 390px: o nível é sinalizado por FUNDO + barra lateral,
          // não só por recuo — recuo sozinho fica ilegível em tela estreita.
          <div className="bg-muted/30 border-l-2 border-primary/40 pl-2">
            {children.map((child) => {
              const ChildIcon = getCategoryIcon(child.icon);
              const childActions: ItemAction[] = [];
              if (!child.is_system || canRenameCategory(categories, child)) {
                childActions.push({
                  key: 'edit',
                  label: fin.categories.actions.edit,
                  icon: <Pencil className="h-4 w-4" />,
                  variant: 'edit' as const,
                  onClick: () => handleEdit(child),
                });
              }
              childActions.push({
                key: 'promote',
                label: tsub.promoteAction,
                icon: <CornerUpLeft className="h-4 w-4" />,
                onClick: () => void handlePromote(child),
              });
              if (!child.is_system) {
                childActions.push({
                  key: 'delete',
                  label: fin.categories.actions.delete,
                  icon: <Trash2 className="h-4 w-4" />,
                  variant: 'destructive' as const,
                  onClick: () => handleAskDelete(child),
                });
              }
              return (
                <MobileListItem
                  key={child.id}
                  actions={childActions}
                  leading={
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full shrink-0"
                      style={{ backgroundColor: child.color }}
                    >
                      <ChildIcon className="h-4 w-4 text-white" />
                    </div>
                  }
                  title={child.name}
                  subtitle={childDreBadge(child, cat) ?? undefined}
                />
              );
            })}
            {hasMixedDreGroups(cat, children) && (
              <p className="px-3 py-2 text-[11px] text-muted-foreground leading-snug">
                {tsub.dreMixedHint}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  // Divisória discreta reutilizada no desktop e no mobile: nome do grupo do
  // DRE + contagem, sem card, sem travessão.
  const renderGroupDivider = (label: string, count: number) => (
    <div className="flex items-center gap-2 px-0.5 pb-3 pt-6 first:pt-0">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
        {label} <span className="normal-case font-normal text-muted-foreground/70">({count})</span>
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );

  // ─── MOBILE: lista completa, plana ou agrupada por DRE ─────────────────────
  const renderMobileList = (fullList: FinancialCategory[], roots: FinancialCategory[], groups: DespesaGroup[] | null) => {
    if (roots.length === 0) {
      return (
        <EmptyState
          size="compact"
          icon={<Tag className="h-10 w-10" />}
          title={mobileGroup === 'receitas' ? fin.categories.empty.noRevenueMobile : fin.categories.empty.noExpenseMobile}
          description={fin.categories.empty.mobileDescription}
          action={{
            label: fin.categories.empty.newAction,
            onClick: () => handleNew(mobileGroup === 'receitas' ? 'entrada' : 'saida'),
          }}
        />
      );
    }

    if (!groups) {
      return (
        <div className="rounded-xl border bg-card overflow-hidden">
          {roots.map((cat, idx) => renderMobileItem(cat, idx, roots, fullList))}
        </div>
      );
    }

    return (
      <div>
        {groups.map((g) => (
          <div key={g.key}>
            {renderGroupDivider(g.label, groupCount(g.items))}
            <div className="rounded-xl border bg-card overflow-hidden">
              {g.items.map((cat, idx) => renderMobileItem(cat, idx, g.items, fullList))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const categoryFormDialog = (
    <CategoryFormDialog
      open={formOpen}
      onOpenChange={(open) => {
        if (!open) setDefaultParentId(null);
        setFormOpen(open);
      }}
      category={editing}
      initialType={defaultType}
      initialParentId={defaultParentId}
      categories={categories}
      onSubmit={handleSubmit}
      validateName={validateCategoryName}
      isLoading={createCategory.isPending || updateCategory.isPending}
    />
  );

  const deletingCategory = deleteId ? tree.byId.get(deleteId) ?? null : null;
  const deletingChildren = deletingCategory ? tree.childrenOf(deletingCategory.id) : [];

  const deleteDialog = (
    <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{fin.categories.deleteDialog.title}</AlertDialogTitle>
          {/* Excluir o pai NÃO apaga a filha (o banco faz `SET NULL`): ela vira
              categoria normal. O aviso muda de texto pra isso não ser surpresa. */}
          <AlertDialogDescription>
            {deletingChildren.length > 0
              ? fin.categories.deleteDialog.descriptionWithChildren
              : fin.categories.deleteDialog.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{fin.categories.deleteDialog.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {fin.categories.deleteDialog.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // ─── MOBILE LAYOUT ─────────────────────────────────────────────────────────
  if (isMobile) {
    const activeFull = mobileGroup === 'receitas' ? receitas : despesas;
    const activeRoots = mobileGroup === 'receitas' ? receitaRoots : despesaRoots;
    const defaultTypeForNew = mobileGroup === 'receitas' ? 'entrada' : 'saida';

    return (
      <div className="space-y-4 pb-24">
        <div className="flex items-center gap-3 rounded-xl bg-muted p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary shrink-0">
            <SettingsIcon className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">{fin.categories.header.title}</h2>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {fin.categories.header.subtitle}
            </p>
          </div>
        </div>

        <MobilePillTabs
          tabs={[
            { value: 'receitas', label: `${fin.categories.tabs.revenue} (${receitas.length})`, icon: <TrendingUp className="h-3.5 w-3.5" /> },
            { value: 'despesas', label: `${fin.categories.tabs.expense} (${despesas.length})`, icon: <TrendingDown className="h-3.5 w-3.5" /> },
          ]}
          activeTab={mobileGroup}
          onTabChange={(v) => setMobileGroup(v as CategoryGroup)}
        />

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : (
          renderMobileList(activeFull, activeRoots, mobileGroup === 'despesas' && shouldGroupDespesas ? despesaGroups : null)
        )}

        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label={fin.categories.fabLabel}
          onClick={() => handleNew(defaultTypeForNew)}
        />

        {categoryFormDialog}
        {deleteDialog}
      </div>
    );
  }

  // ─── DESKTOP LAYOUT ────────────────────────────────────────────────────────
  // Receita e Despesa lado a lado a partir de `xl` (1280px de viewport — é
  // onde a tela deixa de ser "média": abaixo disso as duas seções empilham,
  // cada uma com a largura toda, igual era antes). Lado a lado, cada seção
  // fica com METADE da largura; é o próprio grid de cards (`renderCategoryGrid`,
  // via `auto-fill`) que decide sozinho se cabe 1, 2 ou 3 por linha ali dentro
  // — não é um breakpoint fixo de coluna, que não sabe que a seção encolheu.
  return (
    <div className="space-y-6">
      {isLoading ? (
        <div className="p-6 space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2 items-start">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success shrink-0">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold">{fin.categories.sections.revenueTitle}</h3>
                  <p className="text-xs text-muted-foreground truncate">{receitas.length} {fin.categories.sections.countSuffix} · {fin.categories.sections.reorderHint}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleNew('entrada')} className="shrink-0">
                <Plus className="mr-1 h-4 w-4" />
                {fin.categories.sections.newButton}
              </Button>
            </div>
            {receitaRoots.length === 0 ? (
              <EmptyState
                size="compact"
                icon={<Tag className="h-10 w-10" />}
                title={fin.categories.empty.noRevenueTitle}
                description={fin.categories.empty.noRevenueDescription}
                action={{ label: fin.categories.actions.new, onClick: () => handleNew('entrada') }}
              />
            ) : renderCategoryGrid(receitas, receitaRoots, 'flat')}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive shrink-0">
                  <TrendingDown className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold">{fin.categories.sections.expenseTitle}</h3>
                  <p className="text-xs text-muted-foreground truncate">{despesas.length} {fin.categories.sections.countSuffix} · {fin.categories.sections.reorderHint}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleNew('saida')} className="shrink-0">
                <Plus className="mr-1 h-4 w-4" />
                {fin.categories.sections.newButton}
              </Button>
            </div>
            {despesaRoots.length === 0 ? (
              <EmptyState
                size="compact"
                icon={<Tag className="h-10 w-10" />}
                title={fin.categories.empty.noExpenseTitle}
                description={fin.categories.empty.noExpenseDescription}
                action={{ label: fin.categories.actions.new, onClick: () => handleNew('saida') }}
              />
            ) : shouldGroupDespesas ? (
              <div>
                {despesaGroups.map((g) => (
                  <div key={g.key}>
                    {renderGroupDivider(g.label, groupCount(g.items))}
                    {renderCategoryGrid(despesas, g.items, g.key)}
                  </div>
                ))}
              </div>
            ) : renderCategoryGrid(despesas, despesaRoots, 'flat')}
          </div>
        </div>
      )}

      {categoryFormDialog}
      {deleteDialog}
    </div>
  );
}
