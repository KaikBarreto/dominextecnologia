import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cpfCnpjMask, phoneMask } from '@/utils/masks';
import { Building, SlidersHorizontal, Palette, Loader2, Upload, Trash2, RefreshCw, Paintbrush, Image, FileText, MapPin, Phone, Mail, ClipboardList, ShieldCheck, TableProperties, Camera, PenTool } from 'lucide-react';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { supabase } from '@/integrations/supabase/client';
import { processImageFile } from '@/utils/imageConvert';
import { useToast } from '@/hooks/use-toast';
import { SettingsSidebarLayout, SettingsTab } from '@/components/SettingsSidebarLayout';
import { SettingsAppearanceContent } from '@/components/settings/SettingsAppearanceContent';
import { CepLookup } from '@/components/CepLookup';
import { StateCitySelector } from '@/components/StateCitySelector';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';

const settingsTabs: SettingsTab[] = [
  { value: 'empresa', label: 'Empresa', icon: Building },
  { value: 'usabilidade', label: 'Usabilidade', icon: SlidersHorizontal },
  { value: 'aparencia', label: 'Aparência', icon: Palette },
];

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTabState] = useState(() => {
    const tabFromUrl = searchParams.get('tab');
    return tabFromUrl && ['empresa', 'usabilidade', 'aparencia'].includes(tabFromUrl) ? tabFromUrl : 'empresa';
  });
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    setSearchParams({ tab }, { replace: true });
  };
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
  const [wlUploading, setWlUploading] = useState(false);
  const [wlEnabled, setWlEnabled] = useState(false);
  const [wlColor, setWlColor] = useState('#00C597');

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
      setCompanyNeighborhood(settings.neighborhood || '');
      setCompanyComplement(settings.complement || '');
      setWlEnabled(!!settings.white_label_enabled);
      setWlColor(settings.white_label_primary_color || '#00C597');
    }
  }, [settings]);

  const handleSaveCompany = () => {
    updateSettings.mutate({
      name: companyName,
      document: companyDoc || null,
      phone: companyPhone || null,
      email: companyEmail || null,
      address: companyAddress || null,
      neighborhood: companyNeighborhood || null,
      complement: companyComplement || null,
      city: companyCity || null,
      state: companyState || null,
      zip_code: companyZip || null,
      white_label_enabled: wlEnabled,
      white_label_primary_color: wlColor || null,
    } as any);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;
    file = await processImageFile(file);
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

  const handleWlLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;
    file = await processImageFile(file);
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'Arquivo muito grande (máx 5MB)' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Apenas imagens são permitidas' });
      return;
    }
    setWlUploading(true);
    try {
      const currentWlLogo = (settings as any)?.white_label_logo_url;
      if (currentWlLogo) {
        try {
          const oldPath = currentWlLogo.split('/company-logos/')[1];
          if (oldPath) await supabase.storage.from('company-logos').remove([oldPath]);
        } catch {}
      }
      const filePath = `wl_logo_${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('company-logos').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('company-logos').getPublicUrl(filePath);
      updateSettings.mutate({ white_label_logo_url: publicUrl } as any);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao enviar logo', description: err.message });
    } finally {
      setWlUploading(false);
    }
  };

  const handleRemoveWlLogo = () => {
    updateSettings.mutate({ white_label_logo_url: null } as any);
  };

  const handleSaveWhiteLabel = () => {
    updateSettings.mutate({
      white_label_enabled: wlEnabled,
      white_label_primary_color: wlColor || null,
    } as any);
  };

  const updateUsability = (key: string, value: boolean) => {
    const updated = { ...usabilitySettings, [key]: value };
    setUsabilitySettings(updated);
    localStorage.setItem('usability-settings', JSON.stringify(updated));
    toast({ title: 'Preferência salva!' });
  };

  const usabilitySections = [
    {
      title: 'Ordens de Serviço',
      icon: ClipboardList,
      description: 'Comportamentos relacionados às ordens de serviço',
      items: [
        { key: 'autoSaveOS', title: 'Salvamento Automático', description: 'Salvar automaticamente rascunhos de ordens de serviço ao editar' },
        { key: 'showOSValues', title: 'Exibir Valores', description: 'Mostrar valores financeiros (mão de obra, peças) nas ordens de serviço' },
        { key: 'requireSignature', title: 'Exigir Assinatura', description: 'Tornar obrigatória a assinatura do cliente ao finalizar OS' },
      ],
    },
    {
      title: 'Interface',
      icon: TableProperties,
      description: 'Preferências visuais de listagens e tabelas',
      items: [
        { key: 'compactTables', title: 'Tabelas Compactas', description: 'Reduzir espaçamento nas tabelas para exibir mais dados por página' },
        { key: 'showEquipmentPhotos', title: 'Fotos de Equipamentos', description: 'Exibir miniaturas de fotos dos equipamentos nas listagens' },
      ],
    },
    {
      title: 'Segurança',
      icon: ShieldCheck,
      description: 'Confirmações e validações de segurança',
      items: [
        { key: 'confirmDelete', title: 'Confirmar Exclusões', description: 'Exibir diálogo de confirmação antes de excluir registros' },
      ],
    },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'empresa':
        return (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building className="h-5 w-5 text-primary" />
                <CardTitle>Dados da Empresa</CardTitle>
              </div>
              <CardDescription>Informações da empresa que aparecem em etiquetas e documentos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* ========== SEÇÃO: IDENTIDADE VISUAL ========== */}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Image className="h-4 w-4 text-primary" />
                  Identidade Visual
                </h3>
                <p className="text-xs text-muted-foreground">Logo da empresa para documentos e sistema</p>
              </div>

              <div className="pl-0 sm:pl-6">
                {settings?.logo_url ? (
                  <div className="flex items-center gap-4">
                    <img src={settings.logo_url} alt="Logo" className="h-20 w-20 rounded-lg object-contain border bg-white" />
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
                          <Button variant="destructive-ghost" size="sm">
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

              <Separator className="my-6" />

              {/* ========== SEÇÃO: DADOS CADASTRAIS ========== */}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Dados Cadastrais
                </h3>
                <p className="text-xs text-muted-foreground">Razão social, documento e informações oficiais</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pl-0 sm:pl-6">
                <div className="space-y-2">
                  <Label>Nome da Empresa</Label>
                  <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Nome da sua empresa" />
                </div>
                <div className="space-y-2">
                  <Label>CNPJ/CPF</Label>
                  <Input value={companyDoc} onChange={e => setCompanyDoc(cpfCnpjMask(e.target.value))} placeholder="00.000.000/0000-00" />
                </div>
              </div>

              <Separator className="my-6" />

              {/* ========== SEÇÃO: CONTATO ========== */}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" />
                  Contato
                </h3>
                <p className="text-xs text-muted-foreground">Telefone e e-mail da empresa</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pl-0 sm:pl-6">
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={companyPhone} onChange={e => setCompanyPhone(phoneMask(e.target.value))} placeholder="(00) 0000-0000" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} placeholder="contato@empresa.com" />
                </div>
              </div>

              <Separator className="my-6" />

              {/* ========== SEÇÃO: ENDEREÇO ========== */}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Endereço
                </h3>
                <p className="text-xs text-muted-foreground">Localização física da empresa</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pl-0 sm:pl-6">
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
                  <Label>Endereço</Label>
                  <AddressAutocomplete
                    value={companyAddress}
                    onChange={setCompanyAddress}
                    onAddressSelected={(addr) => {
                      setCompanyAddress(addr.logradouro);
                      setCompanyNumber(addr.numero);
                      setCompanyNeighborhood(addr.bairro);
                      setCompanyCity(addr.cidade);
                      setCompanyState(addr.estado);
                      if (addr.cep) {
                        const c = addr.cep.replace(/\D/g, '');
                        setCompanyZip(c.length > 5 ? `${c.slice(0,5)}-${c.slice(5)}` : c);
                      }
                    }}
                    placeholder="Rua, Avenida..."
                  />
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
                  <Label>UF / Cidade</Label>
                  <StateCitySelector
                    selectedState={companyState}
                    selectedCity={companyCity}
                    onStateChange={setCompanyState}
                    onCityChange={setCompanyCity}
                  />
                </div>
              </div>

              <Separator className="my-6" />

              {/* ========== SEÇÃO: WHITE LABEL ========== */}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Paintbrush className="h-4 w-4 text-primary" />
                  White Label
                </h3>
                <p className="text-xs text-muted-foreground">Personalize o sistema com a identidade visual da sua marca</p>
              </div>

              <div className="space-y-4 pl-0 sm:pl-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Ativar White Label</Label>
                    <p className="text-xs text-muted-foreground">Substitui o logo e a cor padrão do sistema</p>
                  </div>
                  <Switch checked={wlEnabled} onCheckedChange={setWlEnabled} />
                </div>

                {wlEnabled && (
                  <>
                    <Separator className="opacity-50" />

                    {/* WL Logo */}
                    <div className="space-y-2">
                      <Label>Logo personalizado</Label>
                      <p className="text-xs text-muted-foreground">
                        {(settings as any)?.white_label_logo_url
                          ? 'Logo personalizado configurado'
                          : settings?.logo_url
                            ? 'Usando o logo da empresa por padrão'
                            : 'Por padrão, será utilizado o logo da empresa acima'}
                      </p>
                      {((settings as any)?.white_label_logo_url || settings?.logo_url) ? (
                        <div className="flex items-center gap-4">
                          <img
                            src={(settings as any)?.white_label_logo_url || settings?.logo_url}
                            alt="WL Logo"
                            className="h-16 w-auto max-w-[200px] rounded-lg object-contain border bg-white p-1"
                          />
                          <div className="flex flex-col gap-2">
                            <Button variant="outline" size="sm" asChild disabled={wlUploading}>
                              <label className="cursor-pointer">
                                {wlUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                Substituir
                                <input type="file" accept="image/*" className="hidden" onChange={handleWlLogoUpload} />
                              </label>
                            </Button>
                            <Button variant="destructive-ghost" size="sm" onClick={handleRemoveWlLogo}>
                              <Trash2 className="mr-2 h-4 w-4" /> Remover
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <label className="cursor-pointer flex flex-col items-center justify-center h-24 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors bg-muted/20">
                          {wlUploading ? (
                            <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                          ) : (
                            <>
                              <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                              <span className="text-xs text-muted-foreground">Enviar logo personalizado (opcional)</span>
                            </>
                          )}
                          <input type="file" accept="image/*" className="hidden" onChange={handleWlLogoUpload} disabled={wlUploading} />
                        </label>
                      )}
                    </div>

                    <Separator className="opacity-50" />

                    {/* WL Color */}
                     <div className="space-y-2">
                      <Label>Cor primária</Label>
                      <p className="text-xs text-muted-foreground">Substitui a cor verde padrão do sistema</p>
                      <div className="flex items-center gap-3">
                        <ColorPicker value={wlColor} onChange={setWlColor} />
                        <div
                          className="h-10 flex-1 rounded-md border"
                          style={{ backgroundColor: wlColor }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-wrap gap-3 pt-4">
                <Button onClick={handleSaveCompany} disabled={updateSettings.isPending}>
                  {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar Dados da Empresa
                </Button>
              </div>
            </CardContent>
          </Card>
        );

      case 'usabilidade':
        return (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-primary" />
                <CardTitle>Usabilidade</CardTitle>
              </div>
              <CardDescription>Preferências de comportamento do sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {usabilitySections.map((section, sIdx) => (
                <div key={section.title}>
                  {sIdx > 0 && <Separator className="my-6" />}

                  {/* Section header */}
                  <div className="space-y-1 mb-4">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <section.icon className="h-4 w-4 text-primary" />
                      {section.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">{section.description}</p>
                  </div>

                  {/* Section items */}
                  <div className="space-y-1 pl-0 sm:pl-6">
                    {section.items.map((item, iIdx) => (
                      <div key={item.key}>
                        <div className="flex items-center justify-between py-3">
                          <div className="space-y-0.5 pr-4">
                            <Label className="text-sm font-medium">{item.title}</Label>
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                          </div>
                          <Switch
                            checked={usabilitySettings[item.key]}
                            onCheckedChange={(checked) => updateUsability(item.key, checked)}
                          />
                        </div>
                        {iIdx < section.items.length - 1 && <Separator className="opacity-50" />}
                      </div>
                    ))}
                  </div>
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
