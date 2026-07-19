import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { useSearchParams } from 'react-router-dom';
import { cpfCnpjMask, phoneMask } from '@/utils/masks';
import { Settings as SettingsIcon, Building, SlidersHorizontal, Palette, Loader2, Upload, Trash2, RefreshCw, Paintbrush, Image, FileText, MapPin, Phone, Mail, ClipboardList, ShieldCheck, TableProperties, Camera, PenTool, Calendar, Keyboard, UserCircle, CheckCircle2, Tags, Globe } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getSegment } from '@/utils/companySegments';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { applyWhiteLabelTheme } from '@/hooks/useWhiteLabel';
import { supabase } from '@/integrations/supabase/client';
import { processImageFile } from '@/utils/imageConvert';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { SettingsSidebarLayout, SettingsTab } from '@/components/SettingsSidebarLayout';
import { SettingsAppearanceContent } from '@/components/settings/SettingsAppearanceContent';
import { SettingsShortcutsContent } from '@/components/settings/SettingsShortcutsContent';
import { SettingsRegionalContent } from '@/components/settings/SettingsRegionalContent';
import { CepLookup } from '@/components/CepLookup';
import { StateCitySelector } from '@/components/StateCitySelector';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useUserCompany } from '@/hooks/useUserCompany';
import { useTermsOfService } from '@/hooks/useTermsOfService';
import { formatBrtDateTime } from '@/lib/date-br';
import { ModuleGateModal, MODULE_INFO } from '@/components/ModuleGateModal';
import { ReportHeader, DEFAULT_HEADER_CONFIG } from '@/components/technician/ReportHeader';
import { Slider } from '@/components/ui/slider';
import { DangerZoneCard } from '@/components/settings/DangerZoneCard';
import { TermsOfServiceModal } from '@/components/TermsOfServiceModal';
import { CustomerOriginManagerDialog } from '@/components/customers/CustomerOriginManagerDialog';
import { useCustomerOrigins } from '@/hooks/useCustomerOrigins';
import * as LucideIcons from 'lucide-react';
import type { AppRole } from '@/types/database';

const UsersPage = lazy(() => import('@/pages/Users'));

const ALL_TABS = ['empresa', 'regional', 'usuarios', 'usabilidade', 'atalhos', 'aparencia'];

// Snapshot canônico de `settings` no MESMO shape/ordem do payload salvo
// (buildPayload). Usado em 2 lugares: baseline do auto-save (lastSavedJsonRef)
// e guard anti-eco da hidratação — por isso vive num helper único.
function settingsToJson(settings: any): string {
  return JSON.stringify({
    name: settings.name || '',
    document: settings.document || null,
    phone: settings.phone || null,
    email: settings.email || null,
    address: settings.address || null,
    address_number: settings.address_number || null,
    neighborhood: settings.neighborhood || null,
    complement: settings.complement || null,
    city: settings.city || null,
    state: settings.state || null,
    zip_code: settings.zip_code || null,
    white_label_enabled: !!settings.white_label_enabled,
    white_label_primary_color: settings.white_label_primary_color || '#00C597',
    show_name_in_documents: settings.show_name_in_documents ?? true,
    show_cnpj_in_documents: settings.show_cnpj_in_documents ?? true,
    show_address_in_documents: settings.show_address_in_documents ?? true,
    show_phone_in_documents: settings.show_phone_in_documents ?? true,
    show_email_in_documents: settings.show_email_in_documents ?? true,
    report_header_bg_color: settings.report_header_bg_color || DEFAULT_HEADER_CONFIG.bgColor,
    report_header_text_color: settings.report_header_text_color || DEFAULT_HEADER_CONFIG.textColor,
    report_header_logo_size: settings.report_header_logo_size || DEFAULT_HEADER_CONFIG.logoSize,
    report_header_show_logo_bg: settings.report_header_show_logo_bg ?? DEFAULT_HEADER_CONFIG.showLogoBg,
    report_header_logo_bg_color: settings.report_header_logo_bg_color || DEFAULT_HEADER_CONFIG.logoBgColor,
    report_status_bar_color: settings.report_status_bar_color || DEFAULT_HEADER_CONFIG.statusBarColor,
    report_header_logo_type: settings.report_header_logo_type || DEFAULT_HEADER_CONFIG.logoType,
    segment: settings.segment || null,
  });
}

export default function Settings() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings;

  const settingsTabs: SettingsTab[] = [
    { value: 'empresa', label: t.page.tabs.empresa, icon: Building },
    { value: 'regional', label: t.page.tabs.regional, icon: Globe },
    { value: 'usuarios', label: t.page.tabs.usuarios, icon: UserCircle },
    { value: 'usabilidade', label: t.page.tabs.usabilidade, icon: SlidersHorizontal },
    { value: 'atalhos', label: t.page.tabs.atalhos, icon: Keyboard },
    { value: 'aparencia', label: t.page.tabs.aparencia, icon: Palette },
  ];

  const { hasScreenAccess, hasRole } = useAuth();
  const { hasModule } = useCompanyModules();
  const { companyId } = useUserCompany();
  // Gate da Zona de Perigo: admin do tenant OR super_admin Auctus.
  // Backend rechecka via RPC SECURITY DEFINER (regra-lei #1 — filtro client é UX).
  const canResetSystem = hasRole('admin') || hasRole('super_admin' as AppRole);
  const [wlGateOpen, setWlGateOpen] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [originManagerOpen, setOriginManagerOpen] = useState(false);
  const { origins: customerOrigins, seedDefaultOrigins } = useCustomerOrigins();
  const { acceptedAt: termsAcceptedAt } = useTermsOfService();
  const termsAcceptedLabel = formatBrtDateTime(termsAcceptedAt);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTabState] = useState(() => {
    const tabFromUrl = searchParams.get('tab');
    return tabFromUrl && ALL_TABS.includes(tabFromUrl) ? tabFromUrl : 'empresa';
  });

  const visibleTabs = settingsTabs.filter(t => {
    if (t.value === 'usuarios') return hasScreenAccess('screen:users');
    // Regional: aba visível para TODOS (qualquer usuário muda o próprio idioma).
    // Dentro da aba, campos da empresa (idioma padrão, moeda, fuso) continuam
    // bloqueados para não-admin via canResetSystem repassado ao componente.
    if (t.value === 'regional') return true;
    return true;
  });
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    setSearchParams({ tab }, { replace: true });
  };
  // canSave: query terminou e o usuário é de tenant com empresa — mesmo sem
  // linha em company_settings (o hook auto-cria via INSERT no primeiro save).
  // super_admin fica canSave=false e o auto-save continua morto pra ele.
  const { settings, isLoading, updateSettings, canSave } = useCompanySettings();
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
  const [companySegment, setCompanySegment] = useState('');
  const [uploading, setUploading] = useState(false);
  const [wlUploading, setWlUploading] = useState(false);
  const [wlEnabled, setWlEnabled] = useState(false);
  const [wlColor, setWlColor] = useState('#00C597');
  const [wlIconUploading, setWlIconUploading] = useState(false);
  const [showNameInDocs, setShowNameInDocs] = useState(true);
  const [showCnpjInDocs, setShowCnpjInDocs] = useState(true);
  const [showAddressInDocs, setShowAddressInDocs] = useState(true);
  const [showPhoneInDocs, setShowPhoneInDocs] = useState(true);
  const [showEmailInDocs, setShowEmailInDocs] = useState(true);
  const [reportBgColor, setReportBgColor] = useState(DEFAULT_HEADER_CONFIG.bgColor);
  const [reportTextColor, setReportTextColor] = useState(DEFAULT_HEADER_CONFIG.textColor);
  const [reportLogoSize, setReportLogoSize] = useState(DEFAULT_HEADER_CONFIG.logoSize);
  const [reportShowLogoBg, setReportShowLogoBg] = useState(DEFAULT_HEADER_CONFIG.showLogoBg);
  const [reportLogoBgColor, setReportLogoBgColor] = useState(DEFAULT_HEADER_CONFIG.logoBgColor);
  const [reportStatusBarColor, setReportStatusBarColor] = useState(DEFAULT_HEADER_CONFIG.statusBarColor);
  const [reportLogoType, setReportLogoType] = useState<'full' | 'icon'>(DEFAULT_HEADER_CONFIG.logoType);

  const [usabilitySettings, setUsabilitySettings] = useState<Record<string, boolean>>(() => {
    // Defaults canônicos. Chave nova ausente no localStorage do usuário resolve
    // para o default via merge — sem backfill. `saveOSPhotosToDevice` nasce ligado.
    const USABILITY_DEFAULTS = {
      autoSaveOS: true, confirmDelete: true, showOSValues: true,
      requireSignature: false, compactTables: false, showEquipmentPhotos: true,
      showHolidays: true, saveOSPhotosToDevice: true,
    };
    try {
      const saved = localStorage.getItem('usability-settings');
      const parsed = saved ? JSON.parse(saved) : null;
      return { ...USABILITY_DEFAULTS, ...(parsed || {}) };
    } catch {
      return { ...USABILITY_DEFAULTS };
    }
  });

  useEffect(() => {
    if (settings) {
      // Guard anti-eco: se o `settings` que chegou é exatamente o payload que
      // acabamos de salvar (cache atualizado pelo onSuccess da mutation), não
      // re-hidrata — re-hidratar aqui engoliria caracteres digitados enquanto
      // a requisição do save estava em voo. Rollback de erro passa pelo guard
      // (o `previous` restaurado difere do payload que falhou) e reverte normal.
      if (settingsLoadedRef.current && settingsToJson(settings) === lastSavedJsonRef.current) {
        return;
      }
      isHydratingRef.current = true;
      setCompanyName(settings.name || '');
      setCompanyDoc(settings.document || '');
      setCompanyPhone(settings.phone || '');
      setCompanyEmail(settings.email || '');
      setCompanyAddress(settings.address || '');
      setCompanyNumber(settings.address_number || '');
      setCompanyCity(settings.city || '');
      setCompanyState(settings.state || '');
      setCompanyZip(settings.zip_code || '');
      setCompanyNeighborhood(settings.neighborhood || '');
      setCompanyComplement(settings.complement || '');
      setCompanySegment((settings as any).segment || '');
      setWlEnabled(!!settings.white_label_enabled);
      setWlColor(settings.white_label_primary_color || '#00C597');
      setShowNameInDocs(settings.show_name_in_documents ?? true);
      setShowCnpjInDocs(settings.show_cnpj_in_documents ?? true);
      setShowAddressInDocs(settings.show_address_in_documents ?? true);
      setShowPhoneInDocs(settings.show_phone_in_documents ?? true);
      setShowEmailInDocs(settings.show_email_in_documents ?? true);
      setReportBgColor((settings as any).report_header_bg_color || DEFAULT_HEADER_CONFIG.bgColor);
      setReportTextColor((settings as any).report_header_text_color || DEFAULT_HEADER_CONFIG.textColor);
      setReportLogoSize((settings as any).report_header_logo_size || DEFAULT_HEADER_CONFIG.logoSize);
      setReportShowLogoBg((settings as any).report_header_show_logo_bg ?? DEFAULT_HEADER_CONFIG.showLogoBg);
      setReportLogoBgColor((settings as any).report_header_logo_bg_color || DEFAULT_HEADER_CONFIG.logoBgColor);
      setReportStatusBarColor((settings as any).report_status_bar_color || DEFAULT_HEADER_CONFIG.statusBarColor);
      setReportLogoType((settings as any).report_header_logo_type || DEFAULT_HEADER_CONFIG.logoType);
      // Schedule end of hydration after React finishes batching
      requestAnimationFrame(() => {
        isHydratingRef.current = false;
      });
    }
  }, [settings]);

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsLoadedRef = useRef(false);
  const isHydratingRef = useRef(false);
  const lastSavedJsonRef = useRef<string>('');
  // Selo de status do auto-save (a tela inteira salva, não só a aba Empresa).
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    applyWhiteLabelTheme(wlEnabled, wlColor);
  }, [wlEnabled, wlColor]);

  const buildPayload = useCallback(() => ({
    name: companyName,
    document: companyDoc || null,
    phone: companyPhone || null,
    email: companyEmail || null,
    address: companyAddress || null,
    address_number: companyNumber || null,
    neighborhood: companyNeighborhood || null,
    complement: companyComplement || null,
    city: companyCity || null,
    state: companyState || null,
    zip_code: companyZip || null,
    white_label_enabled: wlEnabled,
    white_label_primary_color: wlColor || null,
    show_name_in_documents: showNameInDocs,
    show_cnpj_in_documents: showCnpjInDocs,
    show_address_in_documents: showAddressInDocs,
    show_phone_in_documents: showPhoneInDocs,
    show_email_in_documents: showEmailInDocs,
    report_header_bg_color: reportBgColor,
    report_header_text_color: reportTextColor,
    report_header_logo_size: reportLogoSize,
    report_header_show_logo_bg: reportShowLogoBg,
    report_header_logo_bg_color: reportLogoBgColor,
    report_status_bar_color: reportStatusBarColor,
    report_header_logo_type: reportLogoType,
    segment: companySegment || null,
  }), [companyName, companyDoc, companyPhone, companyEmail, companyAddress, companyNumber, companyNeighborhood, companyComplement, companyCity, companyState, companyZip, wlEnabled, wlColor, showNameInDocs, showCnpjInDocs, showAddressInDocs, showPhoneInDocs, showEmailInDocs, reportBgColor, reportTextColor, reportLogoSize, reportShowLogoBg, reportLogoBgColor, reportStatusBarColor, reportLogoType, companySegment]);

  useEffect(() => {
    // O gate do auto-save abre quando dá pra salvar (canSave), não quando
    // `settings` é truthy — empresa sem linha em company_settings também
    // precisa conseguir salvar (o hook cria a linha via INSERT).
    // canSave é false pra super_admin: o auto-save continua morto pra ele.
    if (!canSave) return;
    settingsLoadedRef.current = true;
    if (!settings) {
      // Sem linha ainda: baseline = estado atual do form (defaults vazios).
      // Assim só uma edição REAL do usuário dispara o INSERT de auto-criação;
      // sem isso, o mount salvaria um payload vazio e atropelaria o backfill
      // server-side que preenche a linha a partir de `companies`.
      if (!lastSavedJsonRef.current) {
        lastSavedJsonRef.current = JSON.stringify(buildPayload());
      }
      return;
    }
    lastSavedJsonRef.current = settingsToJson(settings);
    // buildPayload muda a cada keystroke, mas o único ramo que o usa (sem
    // linha) é protegido por `!lastSavedJsonRef.current` — roda uma vez só;
    // o ramo com settings apenas re-escreve o mesmo baseline (idempotente).
  }, [settings, canSave, buildPayload]);

  const debouncedSave = useCallback(() => {
    if (!settingsLoadedRef.current || isHydratingRef.current) return;
    // Marca "sujo" assim que algo muda; o indicador reflete na hora.
    const dirty = JSON.stringify(buildPayload()) !== lastSavedJsonRef.current;
    setIsDirty(dirty);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (!dirty) return;
    autoSaveTimerRef.current = setTimeout(() => {
      const payload = buildPayload();
      const json = JSON.stringify(payload);
      if (json === lastSavedJsonRef.current) { setIsDirty(false); return; }
      lastSavedJsonRef.current = json;
      setIsDirty(false);
      updateSettings.mutate(payload as any);
    }, 800);
  }, [buildPayload, updateSettings]);

  useEffect(() => {
    debouncedSave();
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [debouncedSave]);

  // Flush imediato do save pendente (blur de campo / saída da tela).
  // Não pode ser chamado no cleanup do efeito de debounce (roda a cada render
  // e mataria o debounce); só em onBlur e no unmount real.
  const flushSave = useCallback(() => {
    if (!settingsLoadedRef.current || isHydratingRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const payload = buildPayload();
    const json = JSON.stringify(payload);
    if (json === lastSavedJsonRef.current) return;
    lastSavedJsonRef.current = json;
    setIsDirty(false);
    // Fire-and-forget: a requisição HTTP sai mesmo se o componente desmontar.
    updateSettings.mutate(payload as any);
  }, [buildPayload, updateSettings]);

  // Ref sempre apontando pra versão mais recente de flushSave, pra usar no
  // efeito de unmount (deps vazias) sem capturar uma closure obsoleta.
  const flushRef = useRef(flushSave);
  flushRef.current = flushSave;
  useEffect(() => () => { flushRef.current?.(); }, []);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;
    file = await processImageFile(file);
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: t.company.visualIdentity.errorFileSize });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: t.company.visualIdentity.errorFileType });
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
      toast({ variant: 'destructive', title: t.company.visualIdentity.errorUpload, description: getErrorMessage(err) });
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
      toast({ variant: 'destructive', title: t.company.visualIdentity.errorFileSize });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: t.company.visualIdentity.errorFileType });
      return;
    }
    setWlUploading(true);
    try {
      const currentWlLogo = settings?.white_label_logo_url;
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
      updateSettings.mutate({ white_label_logo_url: publicUrl });
    } catch (err: any) {
      toast({ variant: 'destructive', title: t.company.visualIdentity.errorUpload, description: getErrorMessage(err) });
    } finally {
      setWlUploading(false);
    }
  };

  const handleRemoveWlLogo = () => {
    updateSettings.mutate({ white_label_logo_url: null });
  };

  const handleWlIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;
    file = await processImageFile(file);
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: t.company.visualIdentity.errorFileSize });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: t.company.visualIdentity.errorFileType });
      return;
    }
    setWlIconUploading(true);
    try {
      const currentIcon = settings?.white_label_icon_url;
      if (currentIcon) {
        try {
          const oldPath = currentIcon.split('/company-logos/')[1];
          if (oldPath) await supabase.storage.from('company-logos').remove([oldPath]);
        } catch {}
      }
      const filePath = `wl_icon_${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('company-logos').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('company-logos').getPublicUrl(filePath);
      updateSettings.mutate({ white_label_icon_url: publicUrl });
    } catch (err: any) {
      toast({ variant: 'destructive', title: t.company.visualIdentity.errorIconUpload, description: getErrorMessage(err) });
    } finally {
      setWlIconUploading(false);
    }
  };

  const handleRemoveWlIcon = () => {
    updateSettings.mutate({ white_label_icon_url: null });
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
    toast({ title: t.usability.preferenceSaved });
  };

  const usabilitySections = [
    {
      title: t.usability.sections.os.title,
      icon: ClipboardList,
      description: t.usability.sections.os.description,
      items: [
        { key: 'autoSaveOS', title: t.usability.sections.os.autoSaveOS.title, description: t.usability.sections.os.autoSaveOS.description },
        { key: 'showOSValues', title: t.usability.sections.os.showOSValues.title, description: t.usability.sections.os.showOSValues.description },
        { key: 'requireSignature', title: t.usability.sections.os.requireSignature.title, description: t.usability.sections.os.requireSignature.description },
        { key: 'saveOSPhotosToDevice', title: t.usability.sections.os.saveOSPhotosToDevice.title, description: t.usability.sections.os.saveOSPhotosToDevice.description },
      ],
    },
    {
      title: t.usability.sections.interface.title,
      icon: TableProperties,
      description: t.usability.sections.interface.description,
      items: [
        { key: 'compactTables', title: t.usability.sections.interface.compactTables.title, description: t.usability.sections.interface.compactTables.description },
        { key: 'showEquipmentPhotos', title: t.usability.sections.interface.showEquipmentPhotos.title, description: t.usability.sections.interface.showEquipmentPhotos.description },
      ],
    },
    {
      title: t.usability.sections.security.title,
      icon: ShieldCheck,
      description: t.usability.sections.security.description,
      items: [
        { key: 'confirmDelete', title: t.usability.sections.security.confirmDelete.title, description: t.usability.sections.security.confirmDelete.description },
      ],
    },
    {
      title: t.usability.sections.schedule.title,
      icon: Calendar,
      description: t.usability.sections.schedule.description,
      items: [
        { key: 'showHolidays', title: t.usability.sections.schedule.showHolidays.title, description: t.usability.sections.schedule.showHolidays.description },
      ],
    },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'empresa':
        return (
          <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building className="h-5 w-5 text-primary" />
                <CardTitle>{t.company.cardTitle}</CardTitle>
              </div>
              <CardDescription>{t.company.cardDescription}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* ========== SEÇÃO: IDENTIDADE VISUAL ========== */}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Image className="h-4 w-4 text-primary" />
                  {t.company.visualIdentity.sectionTitle}
                </h3>
                <p className="text-xs text-muted-foreground">{t.company.visualIdentity.sectionDescription}</p>
              </div>

              <div className="pl-0 sm:pl-6">
                {settings?.logo_url ? (
                  <div className="flex items-center gap-4">
                    <img src={settings.logo_url} alt="Logo" className="h-20 w-20 rounded-lg object-contain border bg-white" />
                    <div className="flex flex-col gap-2">
                      <Button variant="outline" size="sm" asChild disabled={uploading}>
                        <label className="cursor-pointer">
                          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                          {t.company.visualIdentity.replace}
                          <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                        </label>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive-ghost" size="sm">
                            <Trash2 className="mr-2 h-4 w-4" /> {t.company.visualIdentity.remove}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t.company.visualIdentity.removeLogoTitle}</AlertDialogTitle>
                            <AlertDialogDescription>{t.company.visualIdentity.removeLogoDesc}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{MESSAGES[locale].app.common.cancel}</AlertDialogCancel>
                            <AlertDialogAction onClick={handleRemoveLogo}>{t.company.visualIdentity.remove}</AlertDialogAction>
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
                        <span className="text-sm text-muted-foreground">{t.company.visualIdentity.uploadPrompt}</span>
                        <span className="text-xs text-muted-foreground">{t.company.visualIdentity.uploadHint}</span>
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
                  {t.company.registrationData.sectionTitle}
                </h3>
                <p className="text-xs text-muted-foreground">{t.company.registrationData.sectionDescription}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pl-0 sm:pl-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{t.company.registrationData.companyName}</Label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">{t.company.registrationData.showInDocs}</span>
                      <Switch checked={showNameInDocs} onCheckedChange={setShowNameInDocs} className="scale-75" />
                    </div>
                  </div>
                  <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder={t.company.registrationData.companyNamePlaceholder} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{t.company.registrationData.cnpj}</Label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">{t.company.registrationData.showInDocs}</span>
                      <Switch checked={showCnpjInDocs} onCheckedChange={setShowCnpjInDocs} className="scale-75" />
                    </div>
                  </div>
                  <Input value={companyDoc} onChange={e => setCompanyDoc(cpfCnpjMask(e.target.value))} placeholder={t.company.registrationData.cnpjPlaceholder} />
                </div>
              </div>

              <div className="space-y-2 pl-0 sm:pl-6">
                <Label>{t.company.registrationData.segment}</Label>
                {/* Somente-leitura: o segmento define quais ferramentas/recursos
                    aparecem e só pode ser alterado pela Dominex. O usuário vê
                    qual é, mas não troca aqui. */}
                {(() => {
                  const seg = getSegment(companySegment);
                  const Icon = seg?.icon;
                  return (
                    <div className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                      {Icon && <Icon className="h-4 w-4 shrink-0" style={{ color: seg!.color }} />}
                      <span className={seg ? 'text-foreground' : 'text-muted-foreground'}>
                        {seg ? seg.label : t.company.registrationData.segmentNotDefined}
                      </span>
                    </div>
                  );
                })()}
                <p className="text-xs text-muted-foreground">{t.company.registrationData.segmentHint}</p>
              </div>

              <Separator className="my-6" />

              {/* ========== SEÇÃO: CONTATO ========== */}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" />
                  {t.company.contact.sectionTitle}
                </h3>
                <p className="text-xs text-muted-foreground">{t.company.contact.sectionDescription}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pl-0 sm:pl-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{t.company.contact.phone}</Label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">{t.company.contact.showInDocs}</span>
                      <Switch checked={showPhoneInDocs} onCheckedChange={setShowPhoneInDocs} className="scale-75" />
                    </div>
                  </div>
                  <Input value={companyPhone} onChange={e => setCompanyPhone(phoneMask(e.target.value))} placeholder={t.company.contact.phonePlaceholder} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{t.company.contact.email}</Label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">{t.company.contact.showInDocs}</span>
                      <Switch checked={showEmailInDocs} onCheckedChange={setShowEmailInDocs} className="scale-75" />
                    </div>
                  </div>
                  <Input type="email" value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} placeholder={t.company.contact.emailPlaceholder} />
                </div>
              </div>

              <Separator className="my-6" />

              {/* ========== SEÇÃO: ENDEREÇO ========== */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    {t.company.address.sectionTitle}
                  </h3>
                  <p className="text-xs text-muted-foreground">{t.company.address.sectionDescription}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">{t.company.address.showInDocs}</span>
                  <Switch checked={showAddressInDocs} onCheckedChange={setShowAddressInDocs} className="scale-75" />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pl-0 sm:pl-6">
                <div className="space-y-2">
                  <Label>{t.company.address.zip}</Label>
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
                  <Label>{t.company.address.street}</Label>
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
                    placeholder={t.company.address.streetPlaceholder}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.company.address.number}</Label>
                  <Input value={companyNumber} onChange={e => setCompanyNumber(e.target.value)} placeholder={t.company.address.numberPlaceholder} />
                </div>
                <div className="space-y-2">
                  <Label>{t.company.address.complement}</Label>
                  <Input value={companyComplement} onChange={e => setCompanyComplement(e.target.value)} placeholder={t.company.address.complementPlaceholder} />
                </div>
                <div className="space-y-2">
                  <Label>{t.company.address.neighborhood}</Label>
                  <Input value={companyNeighborhood} onChange={e => setCompanyNeighborhood(e.target.value)} placeholder={t.company.address.neighborhoodPlaceholder} />
                </div>
                <div className="space-y-2">
                  <Label>{t.company.address.stateCity}</Label>
                  <StateCitySelector
                    selectedState={companyState}
                    selectedCity={companyCity}
                    onStateChange={setCompanyState}
                    onCityChange={setCompanyCity}
                  />
                </div>
              </div>

              {hasModule('white_label') ? (
              <>
              <Separator className="my-6" />

              {/* ========== SEÇÃO: WHITE LABEL ========== */}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Paintbrush className="h-4 w-4 text-primary" />
                  {t.company.whiteLabelSection.sectionTitle}
                </h3>
                <p className="text-xs text-muted-foreground">{t.company.whiteLabelSection.sectionDescription}</p>
              </div>
              </>
              ) : (
              <>
              <Separator className="my-6" />
              <div
                className="flex items-center justify-between p-4 rounded-lg border border-dashed border-muted-foreground/30 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setWlGateOpen(true)}
              >
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Paintbrush className="h-4 w-4 text-muted-foreground" />
                    {t.company.whiteLabelSection.sectionTitle}
                  </h3>
                  <p className="text-xs text-muted-foreground">{t.company.whiteLabelSection.moduleUnavailable}</p>
                </div>
                <Badge variant="secondary">{t.company.whiteLabelSection.hire}</Badge>
              </div>
              <ModuleGateModal
                open={wlGateOpen}
                onOpenChange={setWlGateOpen}
                moduleName={MODULE_INFO.white_label.name}
                moduleDescription={MODULE_INFO.white_label.description}
                modulePrice={MODULE_INFO.white_label.price}
                moduleCode="white_label"
              />
              </>
              )}

              {hasModule('white_label') && <div className="space-y-4 pl-0 sm:pl-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">{t.company.whiteLabelSection.enableLabel}</Label>
                    <p className="text-xs text-muted-foreground">{t.company.whiteLabelSection.enableDescription}</p>
                  </div>
                  <Switch checked={wlEnabled} onCheckedChange={setWlEnabled} />
                </div>

                {wlEnabled && (
                  <>
                    <Separator className="opacity-50" />

                    {/* WL Logo + Icon side by side on desktop */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {/* WL Logo */}
                      <div className="space-y-2">
                        <Label>{t.company.whiteLabelSection.fullLogo}</Label>
                        <p className="text-xs text-muted-foreground">
                          {settings?.white_label_logo_url
                            ? t.company.whiteLabelSection.fullLogoConfigured
                            : settings?.logo_url
                              ? t.company.whiteLabelSection.fullLogoUsingCompany
                              : t.company.whiteLabelSection.fullLogoFallback}
                        </p>
                        {(settings?.white_label_logo_url || settings?.logo_url) ? (
                          <div className="flex items-center gap-4">
                            <img
                              src={settings?.white_label_logo_url || settings?.logo_url}
                              alt="WL Logo"
                              className="h-16 w-auto max-w-[200px] rounded-lg object-contain border bg-white p-1"
                              crossOrigin="anonymous"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <div className="flex flex-col gap-2">
                              <Button variant="outline" size="sm" asChild disabled={wlUploading}>
                                <label className="cursor-pointer">
                                  {wlUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                  {t.company.visualIdentity.replace}
                                  <input type="file" accept="image/*" className="hidden" onChange={handleWlLogoUpload} />
                                </label>
                              </Button>
                              <Button variant="destructive-ghost" size="sm" onClick={handleRemoveWlLogo}>
                                <Trash2 className="mr-2 h-4 w-4" /> {t.company.visualIdentity.remove}
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
                                <span className="text-xs text-muted-foreground">{t.company.whiteLabelSection.uploadLogoPrompt}</span>
                              </>
                            )}
                            <input type="file" accept="image/*" className="hidden" onChange={handleWlLogoUpload} disabled={wlUploading} />
                          </label>
                        )}
                      </div>

                      {/* WL Icon */}
                      <div className="space-y-2">
                        <Label>{t.company.whiteLabelSection.icon}</Label>
                        <p className="text-xs text-muted-foreground">
                          {t.company.whiteLabelSection.iconDescription}
                        </p>
                        {settings?.white_label_icon_url ? (
                          <div className="flex items-center gap-4">
                            <img
                              src={settings.white_label_icon_url}
                              alt="WL Icon"
                              className="h-14 w-14 rounded-lg object-contain border bg-white p-1"
                              crossOrigin="anonymous"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <div className="flex flex-col gap-2">
                              <Button variant="outline" size="sm" asChild disabled={wlIconUploading}>
                                <label className="cursor-pointer">
                                  {wlIconUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                  {t.company.visualIdentity.replace}
                                  <input type="file" accept="image/*" className="hidden" onChange={handleWlIconUpload} />
                                </label>
                              </Button>
                              <Button variant="destructive-ghost" size="sm" onClick={handleRemoveWlIcon}>
                                <Trash2 className="mr-2 h-4 w-4" /> {t.company.visualIdentity.remove}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <label className="cursor-pointer flex flex-col items-center justify-center h-20 w-20 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors bg-muted/20">
                            {wlIconUploading ? (
                              <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                            ) : (
                              <>
                                <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                                <span className="text-[10px] text-muted-foreground text-center">{t.company.whiteLabelSection.uploadIconPrompt}</span>
                              </>
                            )}
                            <input type="file" accept="image/*" className="hidden" onChange={handleWlIconUpload} disabled={wlIconUploading} />
                          </label>
                        )}
                      </div>
                    </div>

                    <Separator className="opacity-50" />

                    {/* WL Color */}
                     <div className="space-y-2">
                      <Label>{t.company.whiteLabelSection.primaryColor}</Label>
                      <p className="text-xs text-muted-foreground">{t.company.whiteLabelSection.primaryColorDescription}</p>
                      <div className="flex items-center gap-3">
                        <ColorPicker value={wlColor} onChange={setWlColor} />
                        <div
                          className="h-10 flex-1 rounded-md border"
                          style={{ backgroundColor: wlColor }}
                        />
                      </div>
                    </div>

                    <Separator className="opacity-50" />

                    {/* Report Header Customization */}
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">{t.company.whiteLabelSection.reportHeader}</Label>
                        <p className="text-xs text-muted-foreground">
                          {t.company.whiteLabelSection.reportHeaderDescription}
                        </p>
                      </div>

                      {/* Live Preview */}
                      <div className="rounded-lg border overflow-hidden shadow-sm">
                        <ReportHeader
                          company={{
                            name: companyName || 'Nome da Empresa',
                            document: companyDoc || '00.000.000/0001-00',
                            phone: companyPhone || '(00) 00000-0000',
                            email: companyEmail || 'contato@empresa.com',
                            address: companyAddress || 'Rua Exemplo',
                            city: companyCity || 'Cidade',
                            state: companyState || 'UF',
                            zip_code: companyZip || '00000-000',
                            logo_url: settings?.white_label_logo_url || settings?.logo_url || undefined,
                            icon_url: settings?.white_label_icon_url || undefined,
                          }}
                          config={{
                            bgColor: reportBgColor,
                            textColor: reportTextColor,
                            logoSize: reportLogoSize,
                            showLogoBg: reportShowLogoBg,
                            logoBgColor: reportLogoBgColor,
                            statusBarColor: reportStatusBarColor,
                            logoType: reportLogoType,
                          }}
                          isPreview
                        />
                      </div>

                      {/* Controls */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">{t.company.whiteLabelSection.reportBgColor}</Label>
                          <div className="flex items-center gap-3">
                            <ColorPicker value={reportBgColor} onChange={setReportBgColor} />
                            <div className="h-8 flex-1 rounded-md border" style={{ backgroundColor: reportBgColor }} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">{t.company.whiteLabelSection.reportTextColor}</Label>
                          <div className="flex items-center gap-3">
                            <ColorPicker value={reportTextColor} onChange={setReportTextColor} />
                            <div className="h-8 flex-1 rounded-md border" style={{ backgroundColor: reportTextColor }} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">{t.company.whiteLabelSection.reportStatusBarColor}</Label>
                          <div className="flex items-center gap-3">
                            <ColorPicker value={reportStatusBarColor} onChange={setReportStatusBarColor} />
                            <div className="h-8 flex-1 rounded-md border" style={{ backgroundColor: reportStatusBarColor }} />
                          </div>
                        </div>
                        <div className="space-y-2">
                           <Label className="text-xs">{t.company.whiteLabelSection.reportLogoSize.replace('{size}', String(reportLogoSize))}</Label>
                          <Slider
                            value={[reportLogoSize]}
                            onValueChange={([v]) => setReportLogoSize(v)}
                            min={40}
                            max={reportLogoType === 'full' ? 300 : 140}
                            step={4}
                            className="mt-2"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label className="text-xs">{t.company.whiteLabelSection.reportLogoBg}</Label>
                            <p className="text-[11px] text-muted-foreground">{t.company.whiteLabelSection.reportLogoBgDescription}</p>
                          </div>
                          <Switch checked={reportShowLogoBg} onCheckedChange={setReportShowLogoBg} />
                        </div>
                        {reportShowLogoBg && (
                          <div className="flex items-center gap-2">
                            <Label className="text-xs whitespace-nowrap">{t.company.whiteLabelSection.reportLogoBgColor}</Label>
                            <ColorPicker value={reportLogoBgColor} onChange={setReportLogoBgColor} />
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">{t.company.whiteLabelSection.reportLogoType}</Label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant={reportLogoType === 'full' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setReportLogoType('full')}
                            className="flex-1"
                          >
                            {t.company.whiteLabelSection.reportLogoTypeFull}
                          </Button>
                          <Button
                            type="button"
                            variant={reportLogoType === 'icon' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setReportLogoType('icon')}
                            className="flex-1"
                          >
                            {t.company.whiteLabelSection.reportLogoTypeIcon}
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {reportLogoType === 'icon' ? t.company.whiteLabelSection.reportLogoTypeHintIcon : t.company.whiteLabelSection.reportLogoTypeHintFull}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>}

            </CardContent>
          </Card>

          {/* ========== DOCUMENTOS LEGAIS ========== */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  {t.company.legalDocs.sectionTitle}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t.company.legalDocs.sectionDescription}
                </p>
              </div>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setTermsModalOpen(true)}
              >
                <FileText className="h-4 w-4" />
                {t.company.legalDocs.viewTerms}
              </Button>
              {termsAcceptedLabel && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-500 shrink-0" />
                  {t.company.legalDocs.acceptedAt.replace('{date}', termsAcceptedLabel)}
                </p>
              )}
            </CardContent>
          </Card>

          <TermsOfServiceModal
            open={termsModalOpen}
            onOpenChange={setTermsModalOpen}
            readOnly
          />

          {/* Zona de Perigo — apenas admin do tenant OR super_admin Auctus.
              Backend rechecka via RPC SECURITY DEFINER. */}
          {canResetSystem && (
            <DangerZoneCard
              companyName={settings?.name ?? ''}
              companyId={companyId ?? ''}
            />
          )}
          </div>
        );

      case 'regional':
        return <SettingsRegionalContent isAdmin={canResetSystem} />;

      case 'usabilidade':
        return (
          <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-primary" />
                <CardTitle>{t.usability.cardTitle}</CardTitle>
              </div>
              <CardDescription>{t.usability.cardDescription}</CardDescription>
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

          {/* Origens — catálogo compartilhado por Clientes e CRM */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Tags className="h-5 w-5 text-primary" />
                    <CardTitle>{t.usability.origins.cardTitle}</CardTitle>
                  </div>
                  <CardDescription>
                    {t.usability.origins.cardDescription}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => setOriginManagerOpen(true)}>
                  {t.usability.origins.manage}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {customerOrigins.length === 0 ? (
                <div className="flex flex-col items-start gap-3 py-2">
                  <p className="text-sm text-muted-foreground">
                    {t.usability.origins.empty}
                  </p>
                  <Button
                    size="sm"
                    onClick={() => { if (!seedDefaultOrigins.isPending) seedDefaultOrigins.mutate(); }}
                    disabled={seedDefaultOrigins.isPending}
                  >
                    {seedDefaultOrigins.isPending ? t.usability.origins.seedLoading : t.usability.origins.seedButton}
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border divide-y">
                  {customerOrigins.map((o) => {
                    const OriginIcon = (LucideIcons as any)[o.icon] || Tags;
                    return (
                      <div key={o.id} className="flex items-center gap-3 px-3 py-2.5">
                        <div
                          className="h-6 w-6 rounded-md flex items-center justify-center shrink-0"
                          style={{ backgroundColor: o.color }}
                        >
                          <OriginIcon className="h-3.5 w-3.5 text-white" />
                        </div>
                        <span className="flex-1 text-sm font-medium truncate">{o.name}</span>
                        {!o.is_active && (
                          <span className="text-xs text-muted-foreground">{t.usability.origins.inactive}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          </div>
        );

      case 'atalhos':
        return <SettingsShortcutsContent />;

      case 'aparencia':
        return <SettingsAppearanceContent />;

      case 'usuarios':
        return (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
            <UsersPage />
          </Suspense>
        );

      default:
        return null;
    }
  };

  // Selo discreto de status do auto-save (a tela inteira salva, não só Empresa).
  // Cor de sucesso via token semântico do design system (text-success).
  const saveStatus = (() => {
    if (updateSettings.isPending) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t.saveStatus.saving}
        </span>
      );
    }
    if (isDirty) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
          {t.saveStatus.unsaved}
        </span>
      );
    }
    if (settingsLoadedRef.current) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {t.saveStatus.saved}
        </span>
      );
    }
    return null;
  })();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.page.title}
        subtitle={t.page.subtitle}
        icon={SettingsIcon}
        actions={saveStatus}
      />

      {/* onBlur no container captura o blur dos inputs filhos (bubbles) e faz
          flush imediato do save pendente — digitar e sair de um campo grava na
          hora, sem esperar o debounce nem arriscar perda ao trocar de aba. */}
      <div onBlur={flushSave}>
        <SettingsSidebarLayout
          tabs={visibleTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        >
          {renderContent()}
        </SettingsSidebarLayout>
      </div>

      <CustomerOriginManagerDialog open={originManagerOpen} onOpenChange={setOriginManagerOpen} />
    </div>
  );
}
