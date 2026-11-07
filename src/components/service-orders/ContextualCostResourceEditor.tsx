import type { ComponentProps } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { useCostResources, type CostResource } from '@/hooks/useCostResources';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { CostResourceFormSheet } from './CostResourceFormSheet';

interface ContextualCostResourceEditorProps {
  resource: CostResource;
  onClose: () => void;
}

/** Mesmo editor do cadastro global, montado no contexto do modal que o abriu. */
export function ContextualCostResourceEditor({ resource, onClose }: ContextualCostResourceEditorProps) {
  const { profile, permissions, isAdminOrGestor, hasRole } = useAuth();
  const { updateResource } = useCostResources();
  const canEdit = profile?.company_id === resource.company_id && (
    isAdminOrGestor() || hasRole('super_admin') || permissions.includes('*') || permissions.includes('fn:manage_settings')
  );
  const save: ComponentProps<typeof CostResourceFormSheet>['onSave'] = data => {
    if (!canEdit || updateResource.isPending) return;
    updateResource.mutate({ id: resource.id, ...data }, { onSuccess: onClose });
  };

  if (!canEdit) return <ResponsiveModal open onOpenChange={open => { if (!open) onClose(); }} title="Edição de recurso" footer={<Button variant="cancel" className="w-full" onClick={onClose}>Fechar</Button>}>
    <p className="text-sm leading-relaxed">Você precisa de permissão para gerenciar os cadastros da empresa para editar este recurso.</p>
  </ResponsiveModal>;

  return <CostResourceFormSheet open onOpenChange={open => { if (!open) onClose(); }} resource={resource} category={resource.category} onSave={save} isPending={updateResource.isPending} sharedCatalogNotice />;
}
