import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { useProjectPipelines } from '@/hooks/useProjectPipelines';
import type { CrmPipeline } from '@/hooks/useCrmPipelines';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface ProjectPipelineFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Presente = edição. Ausente/null = criação de uma frente nova. */
  pipeline?: CrmPipeline | null;
  /**
   * Chamado só na CRIAÇÃO, com o id da frente recém-criada — a tela de
   * detalhe usa isto pra trocar pra aba "Frentes" e já selecionar o quadro
   * novo (sem isso o usuário cria a frente e não sabe pra onde foi).
   */
  onCreated?: (pipelineId: string) => void;
}

/**
 * Modal de criar/editar uma FRENTE DE TRABALHO (funil de projeto, Onda 1 de
 * "Projetos"). Deliberadamente simples (só nome + cor): a frente nasce com
 * `tracks_value: false` e as 4 etapas padrão já semeadas por
 * `useProjectPipelines.createProjectPipeline` — nada disso é escolha do
 * usuário aqui.
 */
export function ProjectPipelineFormDialog({
  open,
  onOpenChange,
  projectId,
  pipeline,
  onCreated,
}: ProjectPipelineFormDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.projects.detail;
  const tc = MESSAGES[locale].app.common;

  const { createProjectPipeline, updateProjectPipeline } = useProjectPipelines(projectId);
  const isEditing = !!pipeline;

  const [name, setName] = useState('');
  const [color, setColor] = useState('#2563EB');
  const [nameError, setNameError] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (pipeline) {
      setName(pipeline.name);
      setColor(pipeline.color ?? '#2563EB');
    } else {
      setName('');
      setColor('#2563EB');
    }
    setNameError(false);
  }, [open, pipeline]);

  const isPending = createProjectPipeline.isPending || updateProjectPipeline.isPending;

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(true);
      return;
    }

    if (isEditing && pipeline) {
      updateProjectPipeline.mutate(
        { id: pipeline.id, name: trimmedName, color },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      createProjectPipeline.mutate(
        { name: trimmedName, color },
        {
          onSuccess: (created) => {
            onOpenChange(false);
            onCreated?.(created.id);
          },
        },
      );
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? t.frontFormTitleEdit : t.frontFormTitleCreate}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {tc.cancel}
          </Button>
          <Button type="button" onClick={handleSave} disabled={isPending}>
            {isPending ? tc.saving : tc.save}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 px-4 py-2 sm:px-0">
        <div className="space-y-1.5">
          <Label htmlFor="project-front-name">{t.frontFormName}</Label>
          <Input
            id="project-front-name"
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError(false); }}
            placeholder={t.frontFormNamePlaceholder}
            aria-invalid={nameError}
            autoFocus
          />
          {nameError && <p className="text-xs text-destructive">{t.frontFormNameRequired}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>{t.frontFormColor}</Label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      </div>
    </ResponsiveModal>
  );
}
