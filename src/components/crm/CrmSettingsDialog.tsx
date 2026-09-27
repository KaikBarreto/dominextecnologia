import { useEffect, useState } from 'react';
import { SlidersHorizontal, Webhook, Workflow } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import { StageManagerDialog } from '@/components/crm/StageManagerDialog';
import { PipelineManagerDialog } from '@/components/crm/PipelineManagerDialog';
import { WebhookManagerDialog } from '@/components/crm/WebhookManagerDialog';

type CrmSettingsSection = 'stages' | 'pipelines' | 'webhooks';

interface CrmSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId?: string;
  pipelineName?: string;
  onPipelineCreated?: (pipelineId: string) => void;
  initialSection?: CrmSettingsSection;
}

const tabs: SettingsTab[] = [
  { value: 'stages', label: 'Estágios', icon: SlidersHorizontal },
  { value: 'pipelines', label: 'Funis', icon: Workflow },
  { value: 'webhooks', label: 'Webhooks', icon: Webhook },
];

export function CrmSettingsDialog({
  open,
  onOpenChange,
  pipelineId,
  pipelineName,
  onPipelineCreated,
  initialSection = 'stages',
}: CrmSettingsDialogProps) {
  const [section, setSection] = useState<CrmSettingsSection>('stages');

  useEffect(() => {
    if (open) setSection(initialSection);
  }, [open, initialSection]);

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Configurações do CRM/Kanban"
      className="sm:max-w-[1050px]"
    >
      <SettingsSidebarLayout
        tabs={tabs}
        activeTab={section}
        onTabChange={(value) => setSection(value as CrmSettingsSection)}
      >
        <div className="min-h-[520px] rounded-2xl bg-card p-1 sm:p-5">
          {section === 'stages' && (
            <StageManagerDialog embedded pipelineId={pipelineId} pipelineName={pipelineName} />
          )}
          {section === 'pipelines' && (
            <PipelineManagerDialog embedded onCreated={onPipelineCreated} />
          )}
          {section === 'webhooks' && <WebhookManagerDialog embedded />}
        </div>
      </SettingsSidebarLayout>
    </ResponsiveModal>
  );
}
