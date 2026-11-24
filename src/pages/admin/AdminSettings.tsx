import { useState } from 'react';
import { KeyRound, MapPin, Target, UserCog, Tags } from 'lucide-react';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import { AdminOriginsTab } from '@/components/admin/AdminOriginsTab';
import { AdminCrmStagesTab } from '@/components/admin/AdminCrmStagesTab';
import { AdminUsersSettings } from '@/components/admin/AdminUsersSettings';
import { AdminWhatsappProxiesTab } from '@/components/admin/AdminWhatsappProxiesTab';
import { BusinessCorePricingSettings } from '@/components/admin/BusinessCorePricingSettings';
import { useAuth } from '@/contexts/AuthContext';

const TABS: SettingsTab[] = [
  { value: 'kits-precos', label: 'Kits e preços', icon: Tags, group: 'Comercial' },
  { value: 'origens', label: 'Origens', icon: MapPin, group: 'Cadastros' },
  { value: 'etapas-crm', label: 'Etapas do CRM', icon: Target, group: 'Cadastros' },
  { value: 'usuarios', label: 'Usuários Admin', icon: UserCog, group: 'Acesso' },
  { value: 'ips-whatsapp', label: 'IPs do WhatsApp', icon: KeyRound, group: 'Infraestrutura' },
];

export default function AdminSettings() {
  const [tab, setTab] = useState('origens');
  const {user, profile, hasRole} = useAuth();
  const canManagePrices = !!user && profile?.user_id === user.id && profile?.is_active === true && hasRole('super_admin');
  const tabs = TABS.filter(item=>item.value!=='kits-precos' || canManagePrices);
  const selectedTab = tabs.some(item=>item.value===tab) ? tab : 'origens';

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerenciar configurações do painel administrativo</p>
      </div>

      <SettingsSidebarLayout tabs={tabs} activeTab={selectedTab} onTabChange={setTab}>
        {selectedTab === 'kits-precos' && <BusinessCorePricingSettings />}
        {selectedTab === 'origens' && <AdminOriginsTab />}
        {selectedTab === 'etapas-crm' && <AdminCrmStagesTab />}
        {selectedTab === 'usuarios' && <AdminUsersSettings />}
        {selectedTab === 'ips-whatsapp' && <AdminWhatsappProxiesTab />}
      </SettingsSidebarLayout>
    </div>
  );
}
