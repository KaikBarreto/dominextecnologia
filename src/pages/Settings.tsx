import { useState, useEffect } from 'react';
import { Building, Palette, Loader2, Upload, SlidersHorizontal } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const tabs = [
  { key: 'empresa', label: 'Empresa', icon: Building },
  { key: 'usabilidade', label: 'Usabilidade', icon: SlidersHorizontal },
  { key: 'aparencia', label: 'Aparência', icon: Palette },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState('empresa');
  const { settings, isLoading, updateSettings } = useCompanySettings();
  const { toast } = useToast();

  // Company form
  const [companyName, setCompanyName] = useState('');
  const [companyDoc, setCompanyDoc] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyCity, setCompanyCity] = useState('');
  const [companyState, setCompanyState] = useState('');
  const [companyZip, setCompanyZip] = useState('');
  const [uploading, setUploading] = useState(false);


  // Appearance
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [compactMenu, setCompactMenu] = useState(() => localStorage.getItem('compactMenu') === 'true');

  // Usability toggles (persisted to localStorage)
  const [usabilitySettings, setUsabilitySettings] = useState(() => {
    const saved = localStorage.getItem('usability-settings');
    return saved ? JSON.parse(saved) : {
      autoSaveOS: true,
      confirmDelete: true,
      showOSValues: true,
      requireSignature: false,
      compactTables: false,
      showEquipmentPhotos: true,
    };
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

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast({ variant: 'destructive', title: 'Senha deve ter pelo menos 6 caracteres' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ variant: 'destructive', title: 'As senhas não coincidem' });
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: 'Senha alterada com sucesso!' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao alterar senha', description: err.message });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDarkModeToggle = (checked: boolean) => {
    setDarkMode(checked);
    if (checked) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleCompactMenuToggle = (checked: boolean) => {
    setCompactMenu(checked);
    localStorage.setItem('compactMenu', String(checked));
  };

  const updateUsability = (key: string, value: boolean) => {
    const updated = { ...usabilitySettings, [key]: value };
    setUsabilitySettings(updated);
    localStorage.setItem('usability-settings', JSON.stringify(updated));
    toast({ title: 'Preferência salva!' });
  };

  const usabilityItems = [
    {
      key: 'autoSaveOS',
      title: 'Salvamento Automático de OS',
      description: 'Salvar automaticamente rascunhos de ordens de serviço ao editar',
    },
    {
      key: 'confirmDelete',
      title: 'Confirmar Exclusões',
      description: 'Exibir diálogo de confirmação antes de excluir registros',
    },
    {
      key: 'showOSValues',
      title: 'Exibir Valores nas OS',
      description: 'Mostrar valores financeiros (mão de obra, peças) nas ordens de serviço',
    },
    {
      key: 'requireSignature',
      title: 'Exigir Assinatura do Cliente',
      description: 'Tornar obrigatória a assinatura do cliente ao finalizar OS',
    },
    {
      key: 'compactTables',
      title: 'Tabelas Compactas',
      description: 'Reduzir espaçamento nas tabelas para exibir mais dados por página',
    },
    {
      key: 'showEquipmentPhotos',
      title: 'Fotos de Equipamentos',
      description: 'Exibir miniaturas de fotos dos equipamentos nas listagens',
    },
  ];

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
          {/* EMPRESA */}
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

          {/* USABILIDADE */}
          {activeTab === 'usabilidade' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SlidersHorizontal className="h-5 w-5" />
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
          )}

          {/* SEGURANÇA */}
          {activeTab === 'seguranca' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Dados da Conta
                  </CardTitle>
                  <CardDescription>Informações do seu perfil de usuário</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Nome</Label>
                      <Input value={profile?.full_name || ''} disabled className="bg-muted" />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input value={user?.email || ''} disabled className="bg-muted" />
                    </div>
                    <div className="space-y-2">
                      <Label>Telefone</Label>
                      <Input value={profile?.phone || 'Não informado'} disabled className="bg-muted" />
                    </div>
                    <div className="space-y-2">
                      <Label>Conta criada em</Label>
                      <Input value={user?.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : ''} disabled className="bg-muted" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Alterar Senha</CardTitle>
                  <CardDescription>Defina uma nova senha para sua conta</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Nova Senha</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type={showNewPass ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowNewPass(!showNewPass)}
                      >
                        {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        type={showConfirmPass ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repita a nova senha"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowConfirmPass(!showConfirmPass)}
                      >
                        {showConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button onClick={handleChangePassword} disabled={changingPassword}>
                    {changingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Alterar Senha
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* APARÊNCIA */}
          {activeTab === 'aparencia' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Aparência
                </CardTitle>
                <CardDescription>Personalize a aparência do sistema</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium text-sm">Modo Escuro</p>
                    <p className="text-sm text-muted-foreground">Ativar tema escuro no sistema</p>
                  </div>
                  <Switch checked={darkMode} onCheckedChange={handleDarkModeToggle} />
                </div>
                <Separator />
                <div className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium text-sm">Menu Compacto</p>
                    <p className="text-sm text-muted-foreground">Reduzir tamanho do menu lateral</p>
                  </div>
                  <Switch checked={compactMenu} onCheckedChange={handleCompactMenuToggle} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
