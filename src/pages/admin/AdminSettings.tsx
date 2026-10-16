import { useState } from 'react';
import { KeyRound, MapPin, Target, UserCog } from 'lucide-react';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import { AdminOriginsTab } from '@/components/admin/AdminOriginsTab';
import { AdminCrmStagesTab } from '@/components/admin/AdminCrmStagesTab';
import { AdminUsersSettings } from '@/components/admin/AdminUsersSettings';
import { AdminWhatsappProxiesTab } from '@/components/admin/AdminWhatsappProxiesTab';

const TABS: SettingsTab[] = [
  { value: 'origens', label: 'Origens', icon: MapPin, group: 'Cadastros' },
  { value: 'etapas-crm', label: 'Etapas do CRM', icon: Target, group: 'Cadastros' },
  { value: 'usuarios', label: 'Usuários Admin', icon: UserCog, group: 'Acesso' },
  { value: 'ips-whatsapp', label: 'IPs do WhatsApp', icon: KeyRound, group: 'Infraestrutura' },
];

export default function AdminSettings() {
  const [tab, setTab] = useState('origens');

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerenciar configurações do painel administrativo</p>
      </div>

      <SettingsSidebarLayout tabs={TABS} activeTab={tab} onTabChange={setTab}>
        {tab === 'origens' && <AdminOriginsTab />}
        {tab === 'etapas-crm' && <AdminCrmStagesTab />}
        {tab === 'usuarios' && <AdminUsersSettings />}
        {tab === 'ips-whatsapp' && <AdminWhatsappProxiesTab />}
      </SettingsSidebarLayout>
    </div>
  );
}
