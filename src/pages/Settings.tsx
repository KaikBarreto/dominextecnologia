import { useState, useEffect } from 'react';
import { cpfCnpjMask, phoneMask } from '@/utils/masks';
import { Building, SlidersHorizontal, Palette, Loader2, Upload, Trash2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SettingsSidebarLayout, SettingsTab } from '@/components/SettingsSidebarLayout';
import { SettingsAppearanceContent } from '@/components/settings/SettingsAppearanceContent';
import { CepLookup } from '@/components/CepLookup';

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
  const [companyNumber, setCompanyNumber] = useState('');
  const [companyComplement, setCompanyComplement] = useState('');
  const [companyNeighborhood, setCompanyNeighborhood] = useState('');
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
      setCompanyNeighborhood((settings as any).neighborhood || '');
      setCompanyComplement((settings as any).complement || '');
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
    } as any);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'Arquivo muito grande (máx 5MB)' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Apenas imagens são permitidas' });
      return;
    }
    setUploading(true);
    try {
      // Delete old logo if exists
      if (settings?.logo_url) {
        try {
          const oldPath = settings.logo_url.split('/company-logos/')[1];
          if (oldPath) await supabase.storage.from('company-logos').remove([oldPath]);
        } catch {}
      }
      const filePath = `logo_${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('company-logos').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('company-logos').getPublicUrl(filePath);
      updateSettings.mutate({ logo_url: publicUrl });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao enviar logo', description: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (settings?.logo_url) {
      try {
        const path = settings.logo_url.split('/company-logos/')[1];
        if (path) await supabase.storage.from('company-logos').remove([path]);
      } catch {}
      updateSettings.mutate({ logo_url: null } as any);
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
            <CardContent className="space-y-6">
              {/* Logo section */}
              <div className="space-y-2">
                <Label>Logo da Empresa</Label>
                {settings?.logo_url ? (
                  <div className="flex items-center gap-4">
                    <img src={settings.logo_url} alt="Logo" className="h-20 w-20 rounded-lg object-contain border bg-muted" />
                    <div className="flex flex-col gap-2">
                      <Button variant="outline" size="sm" asChild disabled={uploading}>
                        <label className="cursor-pointer">
                          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                          Substituir
                          <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                        </label>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" /> Remover
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover logo?</AlertDialogTitle>
                            <AlertDialogDescription>O logo atual será removido permanentemente.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleRemoveLogo}>Remover</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center justify-center h-28 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors bg-muted/20">
                    {uploading ? (
                      <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                        <span className="text-sm text-muted-foreground">Clique para enviar o logo</span>
                        <span className="text-xs text-muted-foreground">PNG, JPG até 5MB</span>
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploading} />
                  </label>
                )}
              </div>

              <Separator />

              {/* Company info */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome da Empresa</Label>
                  <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Nome da sua empresa" />
                </div>
                <div className="space-y-2">
                  <Label>CNPJ/CPF</Label>
                  <Input value={companyDoc} onChange={e => setCompanyDoc(cpfCnpjMask(e.target.value))} placeholder="00.000.000/0000-00" />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={companyPhone} onChange={e => setCompanyPhone(phoneMask(e.target.value))} placeholder="(00) 0000-0000" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} placeholder="contato@empresa.com" />
                </div>
              </div>

              <Separator />

              {/* Address with CEP lookup */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">Endereço</Label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>CEP</Label>
                    <CepLookup
                      value={companyZip}
                      onChange={setCompanyZip}
                      onAddressFound={(addr) => {
                        setCompanyAddress(addr.logradouro);
                        setCompanyNeighborhood(addr.bairro);
                        setCompanyCity(addr.cidade);
                        setCompanyState(addr.estado);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Logradouro</Label>
                    <Input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} placeholder="Rua, Avenida..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Número</Label>
                    <Input value={companyNumber} onChange={e => setCompanyNumber(e.target.value)} placeholder="Nº" />
                  </div>
                  <div className="space-y-2">
                    <Label>Complemento</Label>
                    <Input value={companyComplement} onChange={e => setCompanyComplement(e.target.value)} placeholder="Sala, Andar..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Bairro</Label>
                    <Input value={companyNeighborhood} onChange={e => setCompanyNeighborhood(e.target.value)} placeholder="Bairro" />
                  </div>
                  <div className="space-y-2">
                    <Label>Cidade</Label>
                    <Input value={companyCity} onChange={e => setCompanyCity(e.target.value)} placeholder="Cidade" />
                  </div>
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <Input value={companyState} onChange={e => setCompanyState(e.target.value)} placeholder="UF" maxLength={2} />
                  </div>
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
