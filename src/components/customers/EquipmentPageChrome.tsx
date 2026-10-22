import { useState } from 'react';
import { Boxes, Package, Plus, Settings, Tag } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomers } from '@/hooks/useCustomers';
import { useEquipment } from '@/hooks/useEquipment';
import { useEquipmentCategories } from '@/hooks/useEquipmentCategories';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { Button } from '@/components/ui/button';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { EquipmentFormDialog } from '@/components/customers/EquipmentFormDialog';
import { EquipmentFieldConfigDialog } from '@/components/customers/EquipmentFieldConfigDialog';

export type EquipmentMainTab = 'equipamentos' | 'categorias';

interface EquipmentPageChromeProps {
  activeTab: EquipmentMainTab;
  onTabChange: (tab: EquipmentMainTab) => void;
}

/**
 * Cabeçalho da tela Equipamentos: título, abas (Equipamentos/Categorias) e as
 * ações da tela (Configurar Campos, Novo Equipamento).
 *
 * Mesmo motivo do [CustomersPageChrome]: a ficha de um equipamento é outra rota
 * (`/equipamentos/:id`) e precisa do mesmo cabeçalho — sem ele, abrir um
 * aparelho fazia as abas e o botão "Novo Equipamento" sumirem.
 */
export function EquipmentPageChrome({ activeTab, onTabChange }: EquipmentPageChromeProps) {
  const isMobile = useIsMobile();
  const { isAdminOrGestor, hasPermission } = useAuth();
  const { locale } = useAppLocaleContext();
  const tEq = MESSAGES[locale].app.equipment;
  const { equipment, createEquipment } = useEquipment();
  const { customers } = useCustomers();
  const { categories } = useEquipmentCategories();

  const canManageEquipment = isAdminOrGestor() || hasPermission('fn:manage_equipment');

  const [configOpen, setConfigOpen] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);

  // No celular criar equipamento é o botão flutuante da lista, não aqui.
  const showActions = !isMobile && activeTab === 'equipamentos';

  return (
    <>
      <MobilePageHeader
        title={tEq.title}
        subtitle={tEq.subtitle}
        icon={Boxes}
        actions={
          showActions ? (
            <>
              <Button variant="outline" onClick={() => setConfigOpen(true)} title={tEq.configureFields}>
                <Settings className="mr-2 h-4 w-4" />
                {tEq.configureFields}
              </Button>
              {canManageEquipment && (
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setNovoOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {tEq.newEquipment}
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      <MobilePillTabs
        variant="underline"
        tabs={[
          { value: 'equipamentos', label: tEq.tabEquipment, icon: <Package className="h-4 w-4 shrink-0" /> },
          { value: 'categorias', label: tEq.tabCategories, icon: <Tag className="h-4 w-4 shrink-0" /> },
        ]}
        activeTab={activeTab}
        onTabChange={(value) => onTabChange(value as EquipmentMainTab)}
      />

      <EquipmentFormDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        equipment={null}
        onSubmit={async (data: any) => {
          await createEquipment.mutateAsync(data);
        }}
        customers={customers}
        categories={categories}
        isLoading={createEquipment.isPending}
        equipmentCount={equipment.length}
      />

      <EquipmentFieldConfigDialog open={configOpen} onOpenChange={setConfigOpen} />
    </>
  );
}
