import { useEffect, useState } from 'react';
import { SlidersHorizontal, Workflow } from 'lucide-react';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import { AdminPipelineManagerDialog } from '@/components/admin/AdminPipelineManagerDialog';
import { AdminStageManagerDialog } from '@/components/admin/AdminStageManagerDialog';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';

export type AdminCrmSettingsSection = 'stages' | 'pipelines';

interface AdminCrmSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string | null;
  pipelineName?: string;
  initialSection?: AdminCrmSettingsSection;
  onPipelineCreated?: (pipelineId: string) => void;
}

const tabs: SettingsTab[] = [
  { value: 'stages', label: 'Estágios', icon: SlidersHorizontal },
  { value: 'pipelines', label: 'Funis', icon: Workflow },
];

export function AdminCrmSettingsDialog({
  open,
  onOpenChange,
  pipelineId,
  pipelineName,
  initialSection = 'stages',
  onPipelineCreated,
}: AdminCrmSettingsDialogProps) {
  const [section, setSection] = useState<AdminCrmSettingsSection>(initialSection);

  useEffect(() => {
    if (open) setSection(initialSection);
  }, [initialSection, open]);

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
        onTabChange={(value) => setSection(value as AdminCrmSettingsSection)}
      >
        <div className="min-h-[500px] rounded-2xl bg-card p-1 sm:p-5">
          {section === 'stages' && (
            <AdminStageManagerDialog
              open={false}
              onOpenChange={() => undefined}
              pipelineId={pipelineId}
              pipelineName={pipelineName}
              embedded
            />
          )}
          {section === 'pipelines' && (
            <AdminPipelineManagerDialog
              open={false}
              onOpenChange={() => undefined}
              onCreated={onPipelineCreated}
              embedded
            />
          )}
        </div>
      </SettingsSidebarLayout>
    </ResponsiveModal>
  );
}
