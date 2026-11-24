import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, GripVertical, Lock, Pencil, Plus, Star, Trash2, Users, Workflow } from 'lucide-react';
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
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { PipelineAccessDialog } from '@/components/crm/PipelineAccessDialog';
import { StageManagerDialog } from '@/components/crm/StageManagerDialog';
import {
  CrmSettingsDetailEmpty,
  CrmSettingsListDetail,
  CrmSettingsListRow,
} from '@/components/crm/CrmSettingsListDetail';
import { Label } from '@/components/ui/label';
import { useCrmPipelines, type CrmPipeline } from '@/hooks/useCrmPipelines';
import { useCrmPipelineAccess } from '@/hooks/useCrmPipelineAccess';
import { useCrmStages } from '@/hooks/useCrmStages';
import { useLeads } from '@/hooks/useLeads';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

const DEFAULT_COLOR = '#2563EB';

interface PipelineManagerDialogProps {
  /** Chamado com o id do funil recém-criado. A tela usa pra JÁ ABRIR o funil
   *  novo: criar um funil e continuar olhando pro antigo fazia o usuário
   *  cadastrar as etapas no funil errado. */
  onCreated?: (pipelineId: string) => void;
  /** Funil que já abre selecionado quando as configurações são acionadas pela engrenagem da aba. */
  initialPipelineId?: string;
}

interface PipelineFormValues {
  name: string;
  color: string;
  tracksValue: boolean;
}

interface PipelineFormProps {
  title: string;
  initial: PipelineFormValues;
  /** O interruptor de valores só existe na edição: funil novo nasce acompanhando valores. */
  showTracksValue: boolean;
  submitLabel: string;
  hint?: string;
  isPending: boolean;
  onSubmit: (values: PipelineFormValues) => void;
  onCancel: () => void;
}

/**
 * Formulário de funil (criar e editar). Fica FORA do componente principal: um
 * componente declarado dentro do render é recriado a cada atualização e perde
 * o que a pessoa está digitando.
 */
function PipelineForm({ title, initial, showTracksValue, submitLabel, hint, isPending, onSubmit, onCancel }: PipelineFormProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.crm.pipelines;
  const [values, setValues] = useState(initial);
  const submit = () => {
    if (!values.name.trim()) return;
    onSubmit({ ...values, name: values.name.trim() });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="crm-pipeline-name">{t.nameLabel}</Label>
          <Input
            id="crm-pipeline-name"
            autoFocus
            value={values.name}
            onChange={(event) => setValues({ ...values, name: event.target.value })}
            placeholder={t.namePlaceholder}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="crm-pipeline-color">{t.colorLabel}</Label>
          <input
            id="crm-pipeline-color"
            type="color"
            value={values.color}
            onChange={(event) => setValues({ ...values, color: event.target.value })}
            className="block h-10 w-14 cursor-pointer rounded-lg border border-input bg-background p-1"
          />
        </div>
      </div>
      {showTracksValue && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t.tracksValueLabel}</p>
            <p className="text-xs text-muted-foreground">{t.tracksValueHint}</p>
          </div>
          <LabeledSwitch
            value={values.tracksValue ? 'sim' : 'nao'}
            onChange={(next) => setValues({ ...values, tracksValue: next === 'sim' })}
            off={{ value: 'nao', label: t.switchNo }}
            on={{ value: 'sim', label: t.switchYes }}
            aria-label={t.tracksValueLabel}
            className="shrink-0"
          />
        </div>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="ghost" onClick={onCancel}>{t.cancel}</Button>
        <Button onClick={submit} disabled={!values.name.trim() || isPending}>{submitLabel}</Button>
      </div>
    </div>
  );
}

/**
 * Funis do CRM dentro das configurações: lista de funis à esquerda e, à
 * direita, o funil escolhido com suas etapas. Trocar de funil não fecha nada,
 * e as etapas ganham a largura inteira do painel em vez de viverem dentro de
 * uma sanfona recuada.
 */
export function PipelineManagerDialog({ onCreated, initialPipelineId }: PipelineManagerDialogProps) {
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

  const [selectedId, setSelectedId] = useState<string | null>(initialPipelineId ?? null);
  // No celular, quem chega pela engrenagem de um funil já cai nas etapas dele.
  const [mobileDetailOpen, setMobileDetailOpen] = useState(Boolean(initialPipelineId));
  const [mode, setMode] = useState<'view' | 'edit' | 'create'>('view');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [accessPipelineId, setAccessPipelineId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    if (!initialPipelineId) return;
    setSelectedId(initialPipelineId);
    setMobileDetailOpen(true);
    setMode('view');
  }, [initialPipelineId]);

  // Sem escolha (ou com o escolhido excluído), o painel mostra o funil padrão:
  // um detalhe vazio ao abrir obrigaria um clique a mais em toda visita.
  const selected: CrmPipeline | null =
    pipelines.find((pipeline) => pipeline.id === selectedId)
    ?? pipelines.find((pipeline) => pipeline.is_default)
    ?? pipelines[0]
    ?? null;
  const pipelineCounts = (id: string) => countsByPipeline.get(id) ?? { stages: 0, leads: 0 };
  const countsLine = (id: string) => {
    const counts = pipelineCounts(id);
    return t.pipelines.countsLine
      .replace('{stages}', String(counts.stages))
      .replace('{leads}', String(counts.leads));
  };
  const isRestricted = (id: string) => pipelineAccessRows.some((row) => row.pipeline_id === id);

  const selectPipeline = (id: string) => {
    setSelectedId(id);
    setMode('view');
    setMobileDetailOpen(true);
  };

  const handleCreate = (values: PipelineFormValues) => {
    createPipeline.mutate(
      { name: values.name, color: values.color },
      {
        onSuccess: (created) => {
          setMode('view');
          if (!created?.id) return;
          setSelectedId(created.id);
          onCreated?.(created.id);
        },
      },
    );
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deletePipeline.mutate(deleteId, {
      onSuccess: () => {
        setDeleteId(null);
        setMode('view');
        setMobileDetailOpen(false);
      },
    });
  };

  const applyOrder = (movedId: string, targetIndex: number) => {
    const currentIndex = pipelines.findIndex((pipeline) => pipeline.id === movedId);
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= pipelines.length || currentIndex === targetIndex) return;
    const next = [...pipelines];
    const [moved] = next.splice(currentIndex, 1);
    next.splice(targetIndex, 0, moved);
    reorderPipelines.mutate(next.map((pipeline) => pipeline.id));
  };
  const movePipeline = (id: string, offset: number) =>
    applyOrder(id, pipelines.findIndex((pipeline) => pipeline.id === id) + offset);

  const handleDragStart = (event: React.DragEvent, id: string) => {
    setDraggedId(id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  };
  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };
  const handleDragOver = (event: React.DragEvent, id: string) => {
    event.preventDefault();
    if (draggedId && draggedId !== id) setDragOverId(id);
  };
  const handleDrop = (event: React.DragEvent, targetId: string) => {
    event.preventDefault();
    if (draggedId) applyOrder(draggedId, pipelines.findIndex((pipeline) => pipeline.id === targetId));
    handleDragEnd();
  };

  const list = pipelines.map((pipeline, index) => (
    <CrmSettingsListRow
      key={pipeline.id}
      selected={mode !== 'create' && selected?.id === pipeline.id}
      onSelect={() => selectPipeline(pipeline.id)}
      title={pipeline.name}
      subtitle={countsLine(pipeline.id)}
      draggable
      onDragStart={(event) => handleDragStart(event, pipeline.id)}
      onDragEnd={handleDragEnd}
      onDragOver={(event) => handleDragOver(event, pipeline.id)}
      onDragLeave={() => setDragOverId(null)}
      onDrop={(event) => handleDrop(event, pipeline.id)}
      className={cn(
        draggedId === pipeline.id && 'opacity-50',
        dragOverId === pipeline.id && 'bg-primary/5 ring-2 ring-inset ring-primary',
      )}
      leading={(
        <>
          <GripVertical className="hidden h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing lg:block" />
          <div className="flex shrink-0 flex-col lg:hidden">
            <button type="button" className="p-0.5 disabled:opacity-30" aria-label={`Mover ${pipeline.name} para cima`} disabled={index === 0} onClick={(event) => { event.stopPropagation(); movePipeline(pipeline.id, -1); }}><ChevronUp className="h-3.5 w-3.5" /></button>
            <button type="button" className="p-0.5 disabled:opacity-30" aria-label={`Mover ${pipeline.name} para baixo`} disabled={index === pipelines.length - 1} onClick={(event) => { event.stopPropagation(); movePipeline(pipeline.id, 1); }}><ChevronDown className="h-3.5 w-3.5" /></button>
          </div>
          <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: pipeline.color ?? DEFAULT_COLOR }} />
        </>
      )}
      trailing={(
        <>
          {pipelineCounts(pipeline.id).stages === 0 && (
            <span title={t.pipelines.noStagesBadge}><AlertTriangle className="h-3.5 w-3.5 text-warning" aria-label={t.pipelines.noStagesBadge} /></span>
          )}
          {isRestricted(pipeline.id) && (
            <span title={tAccess.restrictedBadge}><Lock className="h-3.5 w-3.5 text-warning" aria-label={tAccess.restrictedBadge} /></span>
          )}
          {pipeline.is_default && (
            <span title={t.pipelines.defaultBadge}><Star className="h-3.5 w-3.5 fill-primary text-primary" aria-label={t.pipelines.defaultBadge} /></span>
          )}
        </>
      )}
    />
  ));

  const secondaryActions: RowAction[] = selected ? [
    {
      label: t.pipelines.setDefaultAction,
      icon: Star,
      variant: 'default',
      hidden: selected.is_default,
      disabled: setDefaultPipeline.isPending,
      onClick: () => setDefaultPipeline.mutate(selected.id),
    },
    {
      label: tAccess.menuLabel,
      icon: Users,
      variant: 'default',
      hidden: !canManagePipelineAccess,
      onClick: () => setAccessPipelineId(selected.id),
    },
  ] : [];

  let detail: React.ReactNode;
  if (mode === 'create') {
    detail = (
      <PipelineForm
        key="create"
        title={t.pipelines.newPipelineLabel}
        initial={{ name: '', color: DEFAULT_COLOR, tracksValue: true }}
        showTracksValue={false}
        submitLabel={t.pipelines.createAction}
        hint={t.pipelines.createHint}
        isPending={createPipeline.isPending}
        onSubmit={handleCreate}
        onCancel={() => {
          setMode('view');
          if (!selected) setMobileDetailOpen(false);
        }}
      />
    );
  } else if (!selected) {
    detail = (
      <CrmSettingsDetailEmpty
        icon={<Workflow className="h-8 w-8" />}
        title={t.pipelines.emptyTitle}
        description={t.pipelines.emptyDesc}
      >
        <Button size="sm" onClick={() => setMode('create')}><Plus className="mr-1.5 h-4 w-4" />{t.pipelines.newAction}</Button>
      </CrmSettingsDetailEmpty>
    );
  } else if (mode === 'edit') {
    detail = (
      <PipelineForm
        key={`edit-${selected.id}`}
        title={`${t.pipelines.editLabel}: ${selected.name}`}
        initial={{ name: selected.name, color: selected.color ?? DEFAULT_COLOR, tracksValue: selected.tracks_value !== false }}
        showTracksValue
        submitLabel={t.pipelines.saveAction}
        isPending={updatePipeline.isPending}
        onSubmit={(values) => {
          updatePipeline.mutate({ id: selected.id, name: values.name, color: values.color, tracks_value: values.tracksValue });
          setMode('view');
        }}
        onCancel={() => setMode('view')}
      />
    );
  } else {
    detail = (
      <div className="min-w-0 space-y-5">
        <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: selected.color ?? DEFAULT_COLOR }} />
              <h3 className="min-w-0 truncate text-lg font-semibold">{selected.name}</h3>
              {selected.is_default && (
                <Badge className="shrink-0 gap-1 bg-primary text-primary-foreground hover:bg-primary"><Star className="h-3 w-3" />{t.pipelines.defaultBadge}</Badge>
              )}
              {isRestricted(selected.id) && (
                <Badge className="shrink-0 gap-1 bg-warning text-white"><Lock className="h-3 w-3" />{tAccess.restrictedBadge}</Badge>
              )}
              {pipelineCounts(selected.id).stages === 0 && (
                <Badge className="shrink-0 gap-1 bg-warning text-white"><AlertTriangle className="h-3 w-3" />{t.pipelines.noStagesBadge}</Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{countsLine(selected.id)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="edit-ghost" size="sm" onClick={() => setMode('edit')}><Pencil className="mr-1.5 h-4 w-4" />{t.pipelines.editLabel}</Button>
            <Button variant="destructive-ghost" size="sm" onClick={() => setDeleteId(selected.id)}><Trash2 className="mr-1.5 h-4 w-4" />{t.pipelines.deleteLabel}</Button>
            {secondaryActions.some((action) => !action.hidden) && <RowActionsMenu actions={secondaryActions} />}
          </div>
        </div>
        <StageManagerDialog key={selected.id} embedded compact pipelineId={selected.id} pipelineName={selected.name} />
      </div>
    );
  }

  return (
    <>
      <section className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold">{t.pipelines.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.pipelines.subtitle}</p>
        </div>
        <CrmSettingsListDetail
          listTitle={t.pipelines.listTitle}
          count={pipelines.length}
          listAction={(
            <Button
              size="sm"
              aria-label={t.pipelines.newAction}
              onClick={() => {
                setMode('create');
                setMobileDetailOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {t.pipelines.newShort}
            </Button>
          )}
          list={list}
          emptyList={<p className="py-6 text-sm text-muted-foreground">{t.pipelines.emptyTitle}</p>}
          listHint={pipelines.length > 1 ? `${t.pipelines.dragHint}. ${t.pipelines.defaultHint}` : undefined}
          detailOpen={mobileDetailOpen}
          onBack={() => {
            setMode('view');
            setMobileDetailOpen(false);
          }}
          backLabel={t.pipelines.backToList}
        >
          {detail}
        </CrmSettingsListDetail>
      </section>

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
