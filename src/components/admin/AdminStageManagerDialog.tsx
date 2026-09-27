import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { AdminCrmStagesTab } from '@/components/admin/AdminCrmStagesTab';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string | null;
  pipelineName?: string;
  embedded?: boolean;
}

export function AdminStageManagerDialog({ open, onOpenChange, pipelineId, pipelineName, embedded = false }: Props) {
  if (embedded) {
    return <AdminCrmStagesTab pipelineId={pipelineId} pipelineName={pipelineName} embedded />;
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={pipelineName ? `Etapas — ${pipelineName}` : 'Etapas do funil'}
      description="As etapas e a ordem abaixo valem somente para este funil."
    >
      <AdminCrmStagesTab pipelineId={pipelineId} pipelineName={pipelineName} embedded />
    </ResponsiveModal>
  );
}
