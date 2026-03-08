import { useState, useEffect } from 'react';
import { Building, SlidersHorizontal, Palette, Loader2, Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SettingsSidebarLayout, SettingsTab } from '@/components/SettingsSidebarLayout';
import { SettingsAppearanceContent } from '@/components/settings/SettingsAppearanceContent';

const settingsTabs: SettingsTab[] = [
  { value: 'empresa', label: 'Empresa', icon: Building },
  { value: 'usabilidade', label: 'Usabilidade', icon: SlidersHorizontal },
  { value: 'aparencia', label: 'Aparência', icon: Palette },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState('empresa');
  const { settings, isLoading, updateSettings } = useCompanySettings();
  const { toast } = useToast();

  const [companyName, setCompanyName] = useState('');
  const [companyDoc, setCompanyDoc] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyCity, setCompanyCity] = useState('');
  const [companyState, setCompanyState] = useState('');
  const [companyZip, setCompanyZip] = useState('');
  const [uploading, setUploading] = useState(false);

  const [usabilitySettings, setUsabilitySettings] = useState(() => {
    try {
      const saved = localStorage.getItem('usability-settings');
      return saved ? JSON.parse(saved) : {
        autoSaveOS: true, confirmDelete: true, showOSValues: true,
        requireSignature: false, compactTables: false, showEquipmentPhotos: true,
      };
    } catch {
      return {
        autoSaveOS: true, confirmDelete: true, showOSValues: true,
        requireSignature: false, compactTables: false, showEquipmentPhotos: true,
      };
    }
  });

  useEffect(() => {
    if (settings) {
      setCompanyName(settings.name || '');
      setCompanyDoc(settings.document || '');
      setCompanyPhone(settings.phone || '');
      setCompanyEmail(settings.email || '');
      setCompanyAddress(settings.address || '');
      setCompanyCity(settings.city || '');
      setCompanyState(settings.state || '');
      setCompanyZip(settings.zip_code || '');
    }
  }, [settings]);

  const handleSaveCompany = () => {
    updateSettings.mutate({
      name: companyName,
      document: companyDoc || undefined,
      phone: companyPhone || undefined,
      email: companyEmail || undefined,
      address: companyAddress || undefined,
      city: companyCity || undefined,
      state: companyState || undefined,
      zip_code: companyZip || undefined,
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const filePath = `company/logo_${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('equipment-files').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('equipment-files').getPublicUrl(filePath);
      updateSettings.mutate({ logo_url: publicUrl });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao enviar logo', description: err.message });
    } finally {
      setUploading(false);
    }
  };

  const updateUsability = (key: string, value: boolean) => {
    const updated = { ...usabilitySettings, [key]: value };
    setUsabilitySettings(updated);
    localStorage.setItem('usability-settings', JSON.stringify(updated));
    toast({ title: 'Preferência salva!' });
  };

  const usabilityItems = [
    { key: 'autoSaveOS', title: 'Salvamento Automático de OS', description: 'Salvar automaticamente rascunhos de ordens de serviço ao editar' },
    { key: 'confirmDelete', title: 'Confirmar Exclusões', description: 'Exibir diálogo de confirmação antes de excluir registros' },
    { key: 'showOSValues', title: 'Exibir Valores nas OS', description: 'Mostrar valores financeiros (mão de obra, peças) nas ordens de serviço' },
    { key: 'requireSignature', title: 'Exigir Assinatura do Cliente', description: 'Tornar obrigatória a assinatura do cliente ao finalizar OS' },
    { key: 'compactTables', title: 'Tabelas Compactas', description: 'Reduzir espaçamento nas tabelas para exibir mais dados por página' },
    { key: 'showEquipmentPhotos', title: 'Fotos de Equipamentos', description: 'Exibir miniaturas de fotos dos equipamentos nas listagens' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'empresa':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5 text-primary" />
                Dados da Empresa
              </CardTitle>
              <CardDescription>Informações da empresa que aparecem em etiquetas e documentos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Logo da Empresa</Label>
                <div className="flex items-center gap-4">
                  {settings?.logo_url ? (
                    <img src={settings.logo_url} alt="Logo" className="h-16 w-16 rounded-lg object-contain border" />
                  ) : (
                    <div className="h-16 w-16 rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground">
                      <Building className="h-6 w-6" />
                    </div>
                  )}
                  <Button variant="outline" size="sm" asChild disabled={uploading}>
                    <label className="cursor-pointer">
                      {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      {uploading ? 'Enviando...' : 'Enviar Logo'}
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    </label>
                  </Button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="company-name">Nome da Empresa</Label>
                  <Input id="company-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Nome da sua empresa" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cnpj">CNPJ/CPF</Label>
                  <Input id="cnpj" value={companyDoc} onChange={(e) => setCompanyDoc(e.target.value)} placeholder="00.000.000/0000-00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} placeholder="(00) 0000-0000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} placeholder="contato@empresa.com" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="address">Endereço</Label>
                  <Input id="address" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} placeholder="Rua, número" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input id="city" value={companyCity} onChange={(e) => setCompanyCity(e.target.value)} placeholder="Cidade" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">Estado</Label>
                  <Input id="state" value={companyState} onChange={(e) => setCompanyState(e.target.value)} placeholder="UF" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zip">CEP</Label>
                  <Input id="zip" value={companyZip} onChange={(e) => setCompanyZip(e.target.value)} placeholder="00000-000" />
                </div>
              </div>
              <Button onClick={handleSaveCompany} disabled={updateSettings.isPending}>
                {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Alterações
              </Button>
            </CardContent>
          </Card>
        );

      case 'usabilidade':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-primary" />
                Usabilidade
              </CardTitle>
              <CardDescription>Preferências de comportamento do sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {usabilityItems.map((item, idx) => (
                <div key={item.key}>
                  <div className="flex items-center justify-between py-4">
                    <div className="space-y-0.5 pr-4">
                      <p className="font-medium text-sm">{item.title}</p>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                    <Switch
                      checked={usabilitySettings[item.key]}
                      onCheckedChange={(checked) => updateUsability(item.key, checked)}
                    />
                  </div>
                  {idx < usabilityItems.length - 1 && <Separator />}
                </div>
              ))}
            </CardContent>
          </Card>
        );

      case 'aparencia':
        return <SettingsAppearanceContent />;

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Gerencie as configurações do sistema</p>
      </div>

      <SettingsSidebarLayout
        tabs={settingsTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {renderContent()}
      </SettingsSidebarLayout>
    </div>
  );
}
