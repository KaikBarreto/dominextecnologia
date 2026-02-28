import { useState, useEffect } from 'react';
import { Building, Bell, Shield, Palette, Loader2, Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const tabs = [
  { key: 'empresa', label: 'Empresa', icon: Building },
  { key: 'notificacoes', label: 'Notificações', icon: Bell },
  { key: 'seguranca', label: 'Segurança', icon: Shield },
  { key: 'aparencia', label: 'Aparência', icon: Palette },
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Gerencie as configurações do sistema</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <nav className="lg:w-52 shrink-0">
          <div className="flex lg:flex-col gap-1">
            {tabs.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveTab(item.key)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 text-left w-full',
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="flex-1 min-w-0">
          {activeTab === 'empresa' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Dados da Empresa
                </CardTitle>
                <CardDescription>Informações da empresa que aparecem em etiquetas e documentos</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Logo */}
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
                    <div>
                      <Button variant="outline" size="sm" asChild disabled={uploading}>
                        <label className="cursor-pointer">
                          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                          {uploading ? 'Enviando...' : 'Enviar Logo'}
                          <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                        </label>
                      </Button>
                    </div>
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
          )}

          {activeTab === 'notificacoes' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notificações
                </CardTitle>
                <CardDescription>Configure suas preferências de notificação</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Notificações por email</p>
                    <p className="text-sm text-muted-foreground">Receber atualizações por email</p>
                  </div>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Notificações push</p>
                    <p className="text-sm text-muted-foreground">Receber notificações no navegador</p>
                  </div>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Alertas de estoque</p>
                    <p className="text-sm text-muted-foreground">Avisar quando itens estiverem em baixa</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'seguranca' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Segurança
                </CardTitle>
                <CardDescription>Configurações de segurança da conta</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Senha Atual</Label>
                  <Input id="current-password" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">Nova Senha</Label>
                  <Input id="new-password" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
                  <Input id="confirm-password" type="password" />
                </div>
                <Button>Alterar Senha</Button>
              </CardContent>
            </Card>
          )}

          {activeTab === 'aparencia' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Aparência
                </CardTitle>
                <CardDescription>Personalize a aparência do sistema</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Modo Escuro</p>
                    <p className="text-sm text-muted-foreground">Ativar tema escuro</p>
                  </div>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Menu Compacto</p>
                    <p className="text-sm text-muted-foreground">Reduzir tamanho do menu lateral</p>
                  </div>
                  <Switch />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
