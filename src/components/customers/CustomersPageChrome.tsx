import { useState } from 'react';
import { ClipboardList, Plus, Settings2, Truck, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomers, type CustomerInput } from '@/hooks/useCustomers';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { Button } from '@/components/ui/button';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog';
import { CustomerSettingsDialog } from '@/components/customers/CustomerSettingsDialog';
import { LeadCaptureManagerDialog } from '@/components/customers/LeadCaptureManagerDialog';

export type CustomersMainTab = 'clientes' | 'fornecedores';

interface CustomersPageChromeProps {
  activeTab: CustomersMainTab;
  onTabChange: (tab: CustomersMainTab) => void;
}

/**
 * Cabeçalho da tela Clientes e Fornecedores: título, abas e as ações da tela
 * (Configurar origens, Formulários de captação, Novo Cliente).
 *
 * Existe como componente próprio porque a FICHA de um cliente é outra rota
 * (`/clientes/:id`) e também precisa mostrar esse cabeçalho — sem ele, abrir um
 * cadastro fazia o botão "Novo Cliente" e as abas sumirem da tela. Os diálogos
 * de criar cliente, origens e formulários moram aqui pra as duas rotas os
 * ganharem de graça.
 */
export function CustomersPageChrome({ activeTab, onTabChange }: CustomersPageChromeProps) {
  const isMobile = useIsMobile();
  const { isAdminOrGestor, hasPermission } = useAuth();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.customers;
  const tSuppliers = t.suppliers;
  const { createCustomer } = useCustomers();

  const canCreateCustomer = isAdminOrGestor() || hasPermission('fn:create_customer');

  const [novoOpen, setNovoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leadFormsOpen, setLeadFormsOpen] = useState(false);

  // No celular as ações da tela vivem na toolbar/FAB da própria lista, não aqui.
  const showActions = !isMobile;

  return (
    <>
      <MobilePageHeader
        title={t.title}
        subtitle={t.subtitle}
        icon={Users}
        actions={
          showActions ? (
            <>
              {/* No computador os botões levam rótulo: ícone sozinho vira
                  adivinhação. */}
              <Button variant="outline" onClick={() => setSettingsOpen(true)} title="Configurações">
                <Settings2 className="mr-2 h-4 w-4" />
                Configurações
              </Button>
              {activeTab === 'clientes' && <Button variant="outline" onClick={() => setLeadFormsOpen(true)} title={t.leadFormsFull}>
                <ClipboardList className="mr-2 h-4 w-4" />
                {t.leadFormsFull}
              </Button>}
              {activeTab === 'clientes' && canCreateCustomer && (
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setNovoOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t.newCustomer}
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      {/* Mesmo componente e variante em mobile, tablet e desktop. */}
      <MobilePillTabs
        variant="underline"
        level="screen"
        tabs={[
          { value: 'clientes', label: t.tabLabel, icon: <Users className="h-4 w-4 shrink-0" /> },
          { value: 'fornecedores', label: tSuppliers.tabLabel, icon: <Truck className="h-4 w-4 shrink-0" /> },
        ]}
        activeTab={activeTab}
        onTabChange={(value) => onTabChange(value as CustomersMainTab)}
      />

      <CustomerFormDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        customer={null}
        onSubmit={(data) => createCustomer.mutateAsync(data as CustomerInput)}
        isLoading={createCustomer.isPending}
      />

      <CustomerSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <LeadCaptureManagerDialog open={leadFormsOpen} onOpenChange={setLeadFormsOpen} />
    </>
  );
}
