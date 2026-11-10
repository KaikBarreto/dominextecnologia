import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { VisitChecklistPanel } from '@/components/technician/VisitChecklistPanel';
import type {
  ChecklistEquipmentGroup,
  ChecklistFormResponse,
} from '@/hooks/useOsActivityChecklist';
import type { FormTemplate, FormQuestion } from '@/types/database';

interface ChecklistPreviewDialogProps {
  templateId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: (FormTemplate & { questions: FormQuestion[] })[];
}

/** Id do equipamento-fantasma da prévia. Nada aqui vai pro banco. */
const EQUIPAMENTO_EXEMPLO = '__previa__';

/**
 * Prévia do checklist COMO ELE APARECE NA ORDEM DE SERVIÇO.
 *
 * Antes isto era uma lista de perguntas com selos de tipo — útil pra conferir
 * o cadastro, mas não respondia a pergunta que o cliente faz de verdade: "como
 * isso vai cair na mão do técnico?". Agora a prévia monta um grupo de checklist
 * de mentira e entrega ao MESMO componente que o técnico usa em campo
 * (`VisitChecklistPanel`), então o que aparece aqui é, pixel a pixel, o que vai
 * aparecer na OS.
 *
 * As respostas vivem só no estado local: fechar o modal joga tudo fora e nada
 * é gravado. É de propósito que os controles fiquem ATIVOS — uma prévia
 * desabilitada não mostra como é responder.
 */
export function ChecklistPreviewDialog({ templateId, open, onOpenChange, templates }: ChecklistPreviewDialogProps) {
  // Respostas de mentira, só pra prévia reagir ao clique como a OS reage.
  const [respostas, setRespostas] = useState<Record<string, ChecklistFormResponse>>({});

  const template = templates.find((t) => t.id === templateId);

  const perguntas = useMemo(
    () => [...(template?.questions ?? [])].sort((a, b) => a.position - b.position),
    [template],
  );

  const grupos: ChecklistEquipmentGroup[] = useMemo(() => {
    if (!template) return [];
    return [
      {
        equipmentId: EQUIPAMENTO_EXEMPLO,
        equipmentName: template.name,
        equipment: null,
        activities: [
          {
            id: `${template.id}__previa`,
            equipment_id: EQUIPAMENTO_EXEMPLO,
            section: null,
            component: null,
            description: template.name,
            guidance: null,
            freq_code: null,
            is_measurement: false,
            unit: null,
            expected_min: null,
            expected_max: null,
            sort_order: 0,
            conformity_status: null,
            measured_value: null,
            activity_photos: null,
            form_template_id: template.id,
          },
        ],
      },
    ];
  }, [template]);

  if (!template) return null;

  const fechar = (aberto: boolean) => {
    if (!aberto) setRespostas({});
    onOpenChange(aberto);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={fechar}
      title={template.name}
      description="Como este checklist aparece para o técnico na Ordem de Serviço"
      className="sm:max-w-3xl"
      footer={
        <Button variant="outline" onClick={() => fechar(false)} className="w-full sm:w-auto">
          Fechar
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/10 p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <p className="text-xs leading-relaxed text-foreground/80">
            Esta é uma prévia: você pode responder para ver como fica, mas{' '}
            <strong>nada é salvo</strong> e nenhuma Ordem de Serviço é criada.
          </p>
        </div>

        {perguntas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma pergunta neste checklist.
          </p>
        ) : (
          <VisitChecklistPanel
            serviceOrderId={EQUIPAMENTO_EXEMPLO}
            groups={grupos}
            onSave={async () => {}}
            formQuestionsByTemplate={{ [template.id]: perguntas }}
            getFormResponse={(_equipmentId, questionId) => respostas[questionId]}
            onSaveFormResponse={async (_equipmentId, questionId, patch) => {
              setRespostas((atual) => ({
                ...atual,
                [questionId]: {
                  question_id: questionId,
                  response_value: patch.response_value ?? atual[questionId]?.response_value ?? null,
                  response_photo_url:
                    patch.response_photo_url ?? atual[questionId]?.response_photo_url ?? null,
                  response_video_url:
                    patch.response_video_url ?? atual[questionId]?.response_video_url ?? null,
                },
              }));
            }}
          />
        )}
      </div>
    </ResponsiveModal>
  );
}
