import { useEffect, useState } from 'react';
import { Workflow } from 'lucide-react';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import { AdminPipelineManagerDialog } from '@/components/admin/AdminPipelineManagerDialog';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';

export type AdminCrmSettingsSection = 'pipelines';

interface AdminCrmSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string | null;
  initialSection?: AdminCrmSettingsSection;
  onPipelineCreated?: (pipelineId: string) => void;
}

const tabs: SettingsTab[] = [
  { value: 'pipelines', label: 'Funis', icon: Workflow },
];

export function AdminCrmSettingsDialog({
  open,
  onOpenChange,
  pipelineId,
  initialSection = 'pipelines',
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
          {section === 'pipelines' && (
            <AdminPipelineManagerDialog
              open={false}
              onOpenChange={() => undefined}
              onCreated={onPipelineCreated}
              initialExpandedPipelineId={pipelineId}
              embedded
            />
          )}
        </div>
      </SettingsSidebarLayout>
    </ResponsiveModal>
  );
}
