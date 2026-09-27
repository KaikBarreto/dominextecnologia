import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { AdminCrmStagesTab } from '@/components/admin/AdminCrmStagesTab';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string | null;
  pipelineName?: string;
}

export function AdminStageManagerDialog({ open, onOpenChange, pipelineId, pipelineName }: Props) {
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
