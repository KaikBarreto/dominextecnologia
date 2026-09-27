import { useEffect, useMemo, useState } from 'react';
import { Plus, GripVertical, Pencil, Trash2, Check, X, Star, Lock, Users, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { PipelineAccessDialog } from '@/components/crm/PipelineAccessDialog';
import { StageManagerDialog } from '@/components/crm/StageManagerDialog';
import { Label } from '@/components/ui/label';
import { useCrmPipelines, type CrmPipeline } from '@/hooks/useCrmPipelines';
import { useCrmPipelineAccess } from '@/hooks/useCrmPipelineAccess';
import { useCrmStages } from '@/hooks/useCrmStages';
import { useLeads } from '@/hooks/useLeads';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface PipelineManagerDialogProps {
  /** Renderiza o CRUD dentro da área unificada de configurações. */
  embedded?: boolean;
  /** Gatilho embutido (padrão histórico). Omitir quando o diálogo é aberto de
   *  fora, por `open`/`onOpenChange` (botão "+" das abas de funil). */
  children?: React.ReactNode;
  /** Modo controlado. Ausente = o diálogo controla o próprio estado. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Chamado com o id do funil recém-criado. A tela usa pra JÁ ABRIR o funil
   *  novo: criar um funil e continuar olhando pro antigo fazia o usuário
   *  cadastrar as etapas no funil errado. */
  onCreated?: (pipelineId: string) => void;
  /** Funil que deve abrir expandido quando as configurações forem acionadas pela engrenagem da aba. */
  initialExpandedPipelineId?: string;
}

/**
 * CRUD de funis do CRM (Onda D — multi-pipeline). Diálogo IRMÃO do
 * StageManagerDialog, não uma aba dentro dele: funil é um nível acima de
 * etapa (funil CONTÉM etapas), e o StageManagerDialog já passou a operar
 * "dentro" de um funil selecionado — misturar os dois CRUDs no mesmo diálogo
 * obrigaria a navegar entre dois contextos diferentes na mesma tela. Dois
 * botões lado a lado ("Gerenciar Estágios" / "Gerenciar Funis") deixam claro
 * que são coisas diferentes, do jeito que Kommo/RD Station também separam.
 */
export function PipelineManagerDialog({
  embedded = false,
  children,
  open: openProp,
  onOpenChange,
  onCreated,
  initialExpandedPipelineId,
}: PipelineManagerDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.crm;
  const tAccess = t.pipelineAccess;
  const { pipelines, createPipeline, updatePipeline, setDefaultPipeline, deletePipeline, reorderPipelines } =
    useCrmPipelines();
  // Gate da gestão de "quem pode ver" — o MESMO público que a RLS de
  // crm_pipeline_access deixa escrever (public.can_manage_system: admin/gestor
  // ou fn:manage_settings). NÃO é fn:manage_crm: quem só gerencia o CRM não
  // necessariamente administra o sistema. Mostrar o botão pra quem não passa
  // nesse gate levaria a um clique que a RLS recusa em silêncio.
  const { isAdminOrGestor, hasPermission } = useAuth();
  const canManagePipelineAccess = isAdminOrGestor() || hasPermission('fn:manage_settings');
  const { access: pipelineAccessRows } = useCrmPipelineAccess();
  // Contagem por funil: sem isso, a lista é só uma pilha de nomes e o usuário
  // não sabe qual funil tem o quê (nem por que a exclusão é recusada). Os dois
  // hooks já estão carregados pela tela do CRM (mesmo cache do React Query),
  // então não custa round trip novo.
  const { stages } = useCrmStages();
  const { leads } = useLeads();
  const countsByPipeline = useMemo(() => {
    const map = new Map<string, { stages: number; leads: number }>();
    const bump = (id: string | null | undefined, key: 'stages' | 'leads') => {
      if (!id) return;
      const current = map.get(id) ?? { stages: 0, leads: 0 };
      current[key] += 1;
      map.set(id, current);
    };
    stages.forEach((s) => bump(s.pipeline_id, 'stages'));
    leads.forEach((l) => bump((l as { pipeline_id?: string | null }).pipeline_id, 'leads'));
    return map;
  }, [stages, leads]);

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [accessPipelineId, setAccessPipelineId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#2563EB');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedPipelineId, setExpandedPipelineId] = useState<string | null>(initialExpandedPipelineId ?? null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    if (initialExpandedPipelineId) setExpandedPipelineId(initialExpandedPipelineId);
  }, [initialExpandedPipelineId]);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createPipeline.mutate(
      { name: newName.trim(), color: newColor },
      {
        onSuccess: (created) => {
          setNewName('');
          setNewColor('#2563EB');
          setShowCreateForm(false);
          if (created?.id) setExpandedPipelineId(created.id);
          if (created?.id) onCreated?.(created.id);
        },
      },
    );
  };

  const handleDelete = () => {
    if (deleteId) {
      deletePipeline.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== id) setDragOverId(id);
  };
  const handleDragLeave = () => setDragOverId(null);
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const draggedIndex = pipelines.findIndex((p) => p.id === draggedId);
    const targetIndex = pipelines.findIndex((p) => p.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;
    const newOrder = [...pipelines];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, removed);
    reorderPipelines.mutate(newOrder.map((p) => p.id));
    setDraggedId(null);
    setDragOverId(null);
  };

  const movePipeline = (id: string, offset: number) => {
    const currentIndex = pipelines.findIndex((pipeline) => pipeline.id === id);
    const targetIndex = currentIndex + offset;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= pipelines.length) return;
    const next = [...pipelines];
    const [moved] = next.splice(currentIndex, 1);
    next.splice(targetIndex, 0, moved);
    reorderPipelines.mutate(next.map((pipeline) => pipeline.id));
  };

  const Row = ({ pipeline }: { pipeline: CrmPipeline }) => {
    const [name, setName] = useState(pipeline.name);
    const [color, setColor] = useState(pipeline.color ?? '#2563EB');
    const isEditing = editingId === pipeline.id;
    const isDragging = draggedId === pipeline.id;
    const isDragOver = dragOverId === pipeline.id;
    const counts = countsByPipeline.get(pipeline.id) ?? { stages: 0, leads: 0 };

    if (isEditing) {
      return (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-muted/35">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.pipelines.namePlaceholder}
            className="flex-1"
            autoFocus
          />
          <input aria-label="Cor do funil" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-11 cursor-pointer rounded border bg-transparent p-1" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setName(pipeline.name);
              setColor(pipeline.color ?? '#2563EB');
              setEditingId(null);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={!name.trim()}
            onClick={() => {
              updatePipeline.mutate({ id: pipeline.id, name: name.trim(), color });
              setEditingId(null);
            }}
          >
            <Check className="h-4 w-4 text-success" />
          </Button>
        </div>
      );
    }

    return (
      <div className={cn('rounded-xl bg-muted/20 transition-colors', isDragOver && 'ring-2 ring-primary')}>
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, pipeline.id)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, pipeline.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, pipeline.id)}
        className={cn(
          'flex items-center gap-2 px-2 py-3 sm:gap-3 sm:px-3 group',
          isDragging && 'opacity-50',
          isDragOver && 'bg-primary/5',
          !isDragging && !isDragOver && 'hover:bg-muted/30',
        )}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing shrink-0" />
        <div className="flex shrink-0 flex-col md:hidden">
          <button type="button" className="p-0.5 disabled:opacity-30" aria-label={`Mover ${pipeline.name} para cima`} disabled={pipelines[0]?.id === pipeline.id} onClick={() => movePipeline(pipeline.id, -1)}><ChevronUp className="h-3.5 w-3.5" /></button>
          <button type="button" className="p-0.5 disabled:opacity-30" aria-label={`Mover ${pipeline.name} para baixo`} disabled={pipelines[pipelines.length - 1]?.id === pipeline.id} onClick={() => movePipeline(pipeline.id, 1)}><ChevronDown className="h-3.5 w-3.5" /></button>
        </div>
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
          onClick={() => setExpandedPipelineId((current) => current === pipeline.id ? null : pipeline.id)}
          aria-expanded={expandedPipelineId === pipeline.id}
          aria-label={expandedPipelineId === pipeline.id ? `Recolher ${pipeline.name}` : `Expandir ${pipeline.name}`}
        >
          {expandedPipelineId === pipeline.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {/* Nome + o que tem DENTRO do funil. Antes a linha era só o nome: não
            dava pra saber qual funil era qual, nem por que a exclusão era
            recusada (é o funil com etapas/oportunidades que o banco segura). */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{pipeline.name}</p>
          <span className="mt-1 block h-1 w-16 rounded-full" style={{ backgroundColor: pipeline.color ?? '#2563EB' }} />
          <p className="text-xs text-muted-foreground truncate">
            {t.pipelines.countsLine
              .replace('{stages}', String(counts.stages))
              .replace('{leads}', String(counts.leads))}
          </p>
        </div>
        {counts.stages === 0 && (
          <Badge className="bg-warning text-white gap-1 shrink-0">
            <AlertTriangle className="h-3 w-3" />
            {t.pipelines.noStagesBadge}
          </Badge>
        )}
        {pipelineAccessRows.some((a) => a.pipeline_id === pipeline.id) && (
          <Badge className="bg-warning text-white gap-1 shrink-0">
            <Lock className="h-3 w-3" />
            {tAccess.restrictedBadge}
          </Badge>
        )}
        {pipeline.is_default && (
          <Badge className="bg-primary text-white gap-1 shrink-0">
            <Star className="h-3 w-3" />
            {t.pipelines.defaultBadge}
          </Badge>
        )}
        {/* Menu SEMPRE visível no toque: com `opacity-0 + group-hover`,
            editar / quem pode ver / excluir ficavam INALCANÇÁVEIS no celular. */}
        <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
          <RowActionsMenu
            actions={[
              {
                label: t.pipelines.editLabel,
                icon: Pencil,
                variant: 'edit',
                onClick: () => setEditingId(pipeline.id),
              },
              {
                label: t.pipelines.setDefaultAction,
                icon: Star,
                variant: 'default',
                hidden: pipeline.is_default,
                disabled: setDefaultPipeline.isPending,
                onClick: () => setDefaultPipeline.mutate(pipeline.id),
              },
              {
                label: tAccess.menuLabel,
                icon: Users,
                variant: 'default',
                hidden: !canManagePipelineAccess,
                onClick: () => setAccessPipelineId(pipeline.id),
              },
              {
                label: t.pipelines.deleteLabel,
                icon: Trash2,
                variant: 'delete',
                onClick: () => setDeleteId(pipeline.id),
              },
            ]}
          />
        </div>
      </div>
      {expandedPipelineId === pipeline.id && (
        <div className="px-3 pb-4 pt-1 sm:pl-12">
          <StageManagerDialog embedded compact pipelineId={pipeline.id} pipelineName={pipeline.name} />
        </div>
      )}
      </div>
    );
  };

  return (
    <>
      {!embedded && children && <span onClick={() => setOpen(true)}>{children}</span>}
      {embedded ? <section className="space-y-5">
        <div><h2 className="text-xl font-semibold">{t.pipelines.title}</h2><p className="text-sm text-muted-foreground mt-1">{t.pipelines.subtitle}</p></div>
        {!showCreateForm ? (
          <Button variant="outline" onClick={() => setShowCreateForm(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Novo funil
          </Button>
        ) : <div className="space-y-3 rounded-xl bg-muted/35 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2"><Label className="text-sm font-medium">{t.pipelines.newPipelineLabel}</Label><Button variant="ghost" size="icon" onClick={() => setShowCreateForm(false)}><X className="h-4 w-4" /></Button></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t.pipelines.namePlaceholder} className="flex-1 min-w-[170px]" />
            <input aria-label="Cor do novo funil" type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-9 w-11 cursor-pointer rounded border bg-transparent p-1" />
            <Button onClick={handleCreate} disabled={!newName.trim() || createPipeline.isPending} className="gap-2"><Plus className="h-4 w-4" />{t.pipelines.createAction}</Button>
          </div>
        </div>}
        <div className="space-y-2"><p className="text-xs text-muted-foreground">{t.pipelines.dragHint} {t.pipelines.defaultHint}</p>{pipelines.map((pipeline) => <Row key={pipeline.id} pipeline={pipeline} />)}</div>
      </section> : <ResponsiveModal open={open} onOpenChange={setOpen} title={t.pipelines.title}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t.pipelines.subtitle}</p>

          {/* Bloco de criar com RÓTULO: antes era um campo solto com um "+" ao
              lado, e ninguém sabia se aquilo criava ou filtrava. */}
          <div className="space-y-2 p-3 rounded-lg border-2 border-dashed border-muted">
            <Label className="text-sm font-medium">{t.pipelines.newPipelineLabel}</Label>
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t.pipelines.namePlaceholder}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
              />
              <input
                aria-label="Cor do novo funil"
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-9 w-11 cursor-pointer rounded border bg-transparent p-1"
              />
              <Button
                onClick={handleCreate}
                disabled={!newName.trim() || createPipeline.isPending}
                className="gap-2 shrink-0"
              >
                <Plus className="h-4 w-4" />
                {t.pipelines.createAction}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t.pipelines.createHint}</p>
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            <p className="text-xs text-muted-foreground mb-2">
              {t.pipelines.dragHint} {t.pipelines.defaultHint}
            </p>
            {pipelines.map((pipeline) => (
              <Row key={pipeline.id} pipeline={pipeline} />
            ))}
          </div>
        </div>
      </ResponsiveModal>}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.pipelines.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.pipelines.deleteDescNamed.replace(
                '{name}',
                pipelines.find((p) => p.id === deleteId)?.name ?? '',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.pipelines.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {t.pipelines.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PipelineAccessDialog
        pipeline={pipelines.find((p) => p.id === accessPipelineId) ?? null}
        open={!!accessPipelineId}
        onOpenChange={(o) => !o && setAccessPipelineId(null)}
      />
    </>
  );
}
