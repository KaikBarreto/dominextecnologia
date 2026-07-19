import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Package, ClipboardList, Plus, Clock, CheckCircle, AlertCircle, Loader2, Send, ChevronRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import { getErrorMessage } from '@/utils/errorMessages';
import dominexLogoWhite from '@/assets/logo-white-horizontal.png';
import DarkVeil from '@/components/ui/DarkVeil';
import PortalUnavailable from '@/components/portal/PortalUnavailable';
import { PublicAppLocaleProvider, useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatDate } from '@/lib/format';
import { detectMachineLocale } from '@/lib/i18n/detectLocale';

/**
 * Converte hex (#RRGGBB ou #RGB) → "H S% L%" pra setar em `--primary` inline.
 * Tinge os `bg-primary`/`text-primary` do portal com a cor white-label do tenant,
 * de forma escopada (sem tocar :root global).
 */
function hexToHsl(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const m = full.match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let H = 0, S = 0;
  if (max !== min) {
    const d = max - min;
    S = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) H = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) H = ((b - r) / d + 2);
    else H = ((r - g) / d + 4);
    H /= 6;
  }
  return `${Math.round(H * 360)} ${Math.round(S * 100)}% ${Math.round(l * 100)}%`;
}

interface Customer {
  id: string;
  name: string;
  company_id: string;
}

interface Equipment {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  location: string | null;
  status: string;
  photo_url: string | null;
  identifier: string | null;
  // Mapa field_key → valor dos campos custom (jsonb). Vem `{}` quando vazio.
  custom_fields?: Record<string, any> | null;
}

// Configuração de campos visíveis da empresa (vem do payload do RPC, ordenada por position).
// Inclui campos built-in (coluna do equipment) E custom (vivem em custom_fields).
interface FieldConfig {
  field_key: string;
  label: string;
  field_type: string;
  position: number;
  options: string[] | null;
}

interface ServiceOrder {
  id: string;
  order_number: number;
  status: string;
  description: string | null;
  scheduled_date: string | null;
  created_at: string;
  os_type: string;
}

interface CompanySettings {
  name: string;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  // White-label (opcionais — RPC get_portal_data pode ainda não devolvê-los).
  white_label_enabled?: boolean | null;
  white_label_primary_color?: string | null;
  white_label_logo_url?: string | null;
  white_label_icon_url?: string | null;
  // Locale da empresa (1.10.0) — portal renderiza no idioma do tenant.
  language?: string | null;
  currency?: string | null;
  timezone?: string | null;
}

// Cores de badge por status (sem label — label vem do i18n dentro do componente).
const OS_STATUS_STYLE: Record<string, { color: string; badgeClass: string }> = {
  pendente: { color: 'bg-warning/10 text-warning border-warning/30', badgeClass: 'bg-warning text-white border-transparent' },
  em_andamento: { color: 'bg-primary/10 text-primary border-primary/30', badgeClass: 'bg-primary text-white border-transparent' },
  a_caminho: { color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30', badgeClass: 'bg-indigo-500 text-white border-transparent' },
  concluida: { color: 'bg-success/10 text-success border-success/30', badgeClass: 'bg-success text-white border-transparent' },
  cancelada: { color: 'bg-destructive/10 text-destructive border-destructive/30', badgeClass: 'bg-destructive text-white border-transparent' },
};

const ACTIVE_STATUSES = ['em_andamento', 'a_caminho', 'pendente'];

// Status terminais (read-only): OS concluída ou cancelada não recebe "Preencher OS".
const TERMINAL_STATUSES = ['concluida', 'cancelada'];

// Payload da RPC get_portal_data. `access`/`viewer_can_fill` são opcionais —
// se a RPC ainda não os devolver, caímos no comportamento atual (fallback gracioso).
interface PortalPayload {
  access?: 'granted' | 'denied' | 'module_unavailable';
  viewer_can_fill?: boolean;
  company_name?: string | null;
  customer: Customer;
  company_settings: CompanySettings | null;
  equipment: Equipment[];
  service_orders: ServiceOrder[];
  equipment_field_config?: FieldConfig[];
}

// field_key built-in → propriedade de topo do objeto Equipment do portal.
const BUILT_IN_FIELD_KEYS: Record<string, keyof Equipment> = {
  brand: 'brand',
  model: 'model',
  serial_number: 'serial_number',
  location: 'location',
};

// ─── Outer shell: carrega dados, resolve locale, envolve no PublicAppLocaleProvider ───

export default function CustomerPortal() {
  const { token } = useParams<{ token: string }>();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [equipmentFieldConfig, setEquipmentFieldConfig] = useState<FieldConfig[]>([]);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);
  const [unavailableCompanyName, setUnavailableCompanyName] = useState<string | null>(null);
  const [viewerCanFill, setViewerCanFill] = useState(false);

  // Carrega TUDO que o portal precisa numa única RPC SECURITY DEFINER que valida
  // o token internamente. Sem leituras anon diretas de tabelas do tenant.
  const loadPortalData = async () => {
    setLoading(true);
    setError(null);
    setAccessDenied(false);
    setModuleUnavailable(false);
    try {
      const { data, error: rpcError } = await supabase
        .rpc('get_portal_data', { p_token: token! });

      if (rpcError || !data) {
        setError('portal_not_found');
        setLoading(false);
        return;
      }

      const payload = data as unknown as PortalPayload;

      if (payload.access === 'module_unavailable') {
        setModuleUnavailable(true);
        setUnavailableCompanyName(payload.company_name ?? null);
        setLoading(false);
        return;
      }

      if (payload.access === 'denied') {
        setAccessDenied(true);
        setViewerCanFill(false);
        setLoading(false);
        return;
      }

      setViewerCanFill(payload.viewer_can_fill === true);
      setCustomer(payload.customer);
      setCompanySettings(payload.company_settings ?? null);
      setEquipment(payload.equipment ?? []);
      setEquipmentFieldConfig(payload.equipment_field_config ?? []);
      setServiceOrders(payload.service_orders ?? []);
    } catch {
      setError('portal_load_error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortalData();
  }, [token]);

  // Realtime: quando uma OS do cliente muda, recarrega o portal pela RPC validada
  // por token (não lemos service_orders direto — RLS sem token).
  useEffect(() => {
    if (!customer?.id) return;
    const channel = supabase
      .channel('portal-os')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_orders', filter: `customer_id=eq.${customer.id}` }, () => {
        loadPortalData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [customer?.id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (moduleUnavailable) {
    return <PortalUnavailable companyName={unavailableCompanyName} />;
  }

  // Portal privado: não temos company_settings ainda → idioma do navegador do visitante.
  if (accessDenied) {
    const machineLocale = detectMachineLocale() ?? 'pt-br';
    const tp = MESSAGES[machineLocale].app.customers.portal;
    const portalPath = `/portal/${token}`;
    return (
      <div className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <DarkVeil hueShift={53} speed={0.5} />
        </div>
        <div className="text-center space-y-6 px-6 relative z-10">
          <div className="mx-auto h-16 w-16 rounded-full bg-white/10 flex items-center justify-center">
            <Package className="h-8 w-8 text-white" />
          </div>
          <h1
            className="text-5xl md:text-7xl font-black leading-none tracking-tighter text-white select-none"
            style={{ fontFamily: "'Lufga', sans-serif", fontWeight: 900 }}
          >
            {tp.privateTitle}
          </h1>
          <div className="space-y-2">
            <p className="text-white/70 text-base max-w-md mx-auto">
              {tp.privateDesc}
            </p>
            <p className="text-white/40 text-sm max-w-md mx-auto">
              {tp.privateHint}
            </p>
          </div>
          <a href={`/login?redirect=${encodeURIComponent(portalPath)}`}>
            <Button size="lg" className="mt-2">{tp.loginBtn}</Button>
          </a>
        </div>
      </div>
    );
  }

  if (error || !customer) {
    const machineLocale = detectMachineLocale() ?? 'pt-br';
    const tp = MESSAGES[machineLocale].app.customers.portal;
    const errorMsg = error === 'portal_not_found'
      ? tp.errorFallback
      : error === 'portal_load_error'
        ? tp.loading
        : tp.errorFallback;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-xl font-bold mb-2">{tp.errorTitle}</h1>
        <p className="text-muted-foreground text-center">{errorMsg}</p>
      </div>
    );
  }

  // Dados carregados: envolve no locale provider da empresa dona do portal.
  return (
    <PublicAppLocaleProvider
      language={companySettings?.language}
      currency={companySettings?.currency}
      timezone={companySettings?.timezone}
    >
      <CustomerPortalContent
        token={token!}
        customer={customer}
        companySettings={companySettings}
        equipment={equipment}
        equipmentFieldConfig={equipmentFieldConfig}
        serviceOrders={serviceOrders}
        viewerCanFill={viewerCanFill}
        onReload={loadPortalData}
      />
    </PublicAppLocaleProvider>
  );
}

// ─── Inner content: consome useAppLocaleContext() para i18n ───

interface ContentProps {
  token: string;
  customer: Customer;
  companySettings: CompanySettings | null;
  equipment: Equipment[];
  equipmentFieldConfig: FieldConfig[];
  serviceOrders: ServiceOrder[];
  viewerCanFill: boolean;
  onReload: () => Promise<void>;
}

function CustomerPortalContent({
  token: _token,
  customer,
  companySettings,
  equipment,
  equipmentFieldConfig,
  serviceOrders,
  viewerCanFill,
  onReload,
}: ContentProps) {
  const [searchParams] = useSearchParams();
  const eqParam = searchParams.get('eq');
  const { toast } = useToast();

  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.customers.portal;

  // Labels de status vindos do i18n (não hardcoded em pt-br).
  const OS_STATUS_LABEL: Record<string, string> = {
    pendente: t.statusPendente,
    em_andamento: t.statusEmAndamento,
    a_caminho: t.statusACaminho,
    concluida: t.statusConcluida,
    cancelada: t.statusCancelada,
  };

  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketDesc, setTicketDesc] = useState('');
  const [ticketEquipmentId, setTicketEquipmentId] = useState('');
  const [ticketSubmitting, setTicketSubmitting] = useState(false);

  const [selectedEquipment, setSelectedEquipment] = useState<string | null>(eqParam);
  const [activeTab, setActiveTab] = useState(eqParam ? 'equipamentos' : 'os');
  const isMobile = useIsMobile();

  const osPagination = useDataPagination(serviceOrders);
  const eqPagination = useDataPagination(equipment);

  const handleSubmitTicket = async () => {
    if (!ticketDesc.trim()) return;
    setTicketSubmitting(true);
    try {
      const company_id = customer.company_id;
      const insertPayload = normalizeOptionalForeignKeys({
        customer_id: customer.id,
        equipment_id: ticketEquipmentId || null,
        description: ticketDesc,
        os_type: 'corretiva',
        status: 'pendente',
        origin: 'portal',
        company_id,
      } as any, ['customer_id', 'equipment_id']);
      const { error } = await supabase.from('service_orders').insert(insertPayload as any);
      if (error) throw error;
      toast({ title: t.ticketSuccess });
      setShowTicketForm(false);
      setTicketDesc('');
      setTicketEquipmentId('');
      await onReload();
    } catch (err: any) {
      toast({ variant: 'destructive', title: t.ticketErrorTitle, description: getErrorMessage(err) });
    } finally {
      setTicketSubmitting(false);
    }
  };

  // White-label escopado: tinge --primary/--primary-foreground só no container do portal.
  const whiteLabelEnabled = !!companySettings?.white_label_enabled;
  const themeOverride = useMemo<React.CSSProperties | undefined>(() => {
    if (!whiteLabelEnabled) return undefined;
    const hsl = hexToHsl(companySettings?.white_label_primary_color);
    if (!hsl) return undefined;
    return {
      ['--primary' as any]: hsl,
      ['--primary-foreground' as any]: '0 0% 100%',
    };
  }, [whiteLabelEnabled, companySettings?.white_label_primary_color]);

  const headerLogo = whiteLabelEnabled
    ? (companySettings?.white_label_logo_url || companySettings?.white_label_icon_url || companySettings?.logo_url)
    : companySettings?.logo_url;

  const selectedEq = equipment.find(e => e.id === selectedEquipment);
  const equipmentOrders = selectedEquipment
    ? serviceOrders.filter(os => (os as any).equipment_id === selectedEquipment)
    : [];

  // Formata valor de campo dinâmico usando locale/timezone da empresa.
  const formatFieldValue = (value: any, fieldType: string): string => {
    if (fieldType === 'boolean') {
      const truthy = value === true || value === 'sim' || value === 'true' || value === 1;
      return truthy ? t.booleanYes : t.booleanNo;
    }
    if (fieldType === 'date') {
      if (!value) return '';
      try {
        return formatDate(String(value), locale, timezone);
      } catch {
        return String(value);
      }
    }
    return String(value);
  };

  const buildDetailRows = (eq: Equipment) => {
    return [...equipmentFieldConfig]
      .sort((a, b) => a.position - b.position)
      .map((fc) => {
        const builtInProp = BUILT_IN_FIELD_KEYS[fc.field_key];
        const rawValue = builtInProp
          ? eq[builtInProp]
          : eq.custom_fields?.[fc.field_key];
        return { fc, rawValue };
      })
      .filter(({ rawValue, fc }) => {
        if (fc.field_type === 'boolean') {
          return rawValue !== null && rawValue !== undefined && rawValue !== '';
        }
        return rawValue !== null && rawValue !== undefined && String(rawValue).trim() !== '';
      });
  };

  return (
    <div className="min-h-screen bg-background text-foreground" style={themeOverride}>
      {/* Header com dados da empresa */}
      <header className="border-b bg-card px-4 py-4">
        <div className="mx-auto max-w-4xl flex items-center gap-3">
          {headerLogo ? (
            <img src={headerLogo} alt="" className="h-10 w-10 lg:h-14 lg:w-14 rounded object-contain" />
          ) : (
            <div className="h-10 w-10 lg:h-14 lg:w-14 rounded bg-primary/10 flex items-center justify-center">
              <Package className="h-5 w-5 lg:h-7 lg:w-7 text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg lg:text-2xl font-bold truncate">{companySettings?.name || t.defaultTitle}</h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              {companySettings?.phone && <span>{companySettings.phone}</span>}
              {companySettings?.email && <span>{companySettings.email}</span>}
              {companySettings?.city && companySettings?.state && (
                <span>{companySettings.city} - {companySettings.state}</span>
              )}
            </div>
          </div>
          <Button size="sm" onClick={() => setShowTicketForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> {t.openTicket}
          </Button>
        </div>
      </header>

      {/* Barra com nome do cliente */}
      <div className="border-b bg-muted/30 px-4 py-2">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm text-muted-foreground">
            {t.greeting} <span className="font-medium text-foreground">{customer.name}</span>
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-4xl p-4 space-y-6">
        {/* OS ativas em destaque */}
        {serviceOrders.filter(os => ACTIVE_STATUSES.includes(os.status)).length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              {t.activeOsTitle}
            </h2>
            {serviceOrders.filter(os => ACTIVE_STATUSES.includes(os.status)).map(os => {
              const style = OS_STATUS_STYLE[os.status] || OS_STATUS_STYLE.pendente;
              const label = OS_STATUS_LABEL[os.status] || os.status;
              const isEnRoute = os.status === 'a_caminho' || os.status === 'em_andamento';
              return (
                <Card key={os.id} className="bg-card border hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-bold">#{String(os.order_number).padStart(6, '0')}</span>
                          <Badge className={cn('text-xs', style.badgeClass)}>
                            {label}
                          </Badge>
                        </div>
                        {os.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{os.description}</p>
                        )}
                        {os.scheduled_date && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {t.scheduledPrefix} {formatDate(os.scheduled_date, locale, timezone)}
                          </p>
                        )}
                      </div>
                      {isEnRoute && (
                        <a href={`${window.location.origin}/os-tecnico/${os.id}?modo=cliente`} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="default" className="gap-1 text-xs">
                            {t.trackBtn}
                          </Button>
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {isMobile ? (
            <MobilePillTabs
              tabs={[
                { value: 'os', label: t.tabOs, icon: <ClipboardList className="h-4 w-4 shrink-0" /> },
                { value: 'equipamentos', label: t.tabEquipment, icon: <Package className="h-4 w-4 shrink-0" /> },
              ]}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          ) : (
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="os">
                <ClipboardList className="h-4 w-4 mr-2" /> {t.tabOs}
              </TabsTrigger>
              <TabsTrigger value="equipamentos">
                <Package className="h-4 w-4 mr-2" /> {t.tabEquipment}
              </TabsTrigger>
            </TabsList>
          )}

          {/* Aba OS */}
          <TabsContent value="os" className="space-y-4 mt-4">
            {serviceOrders.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center py-12">
                  <ClipboardList className="h-10 w-10 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">{t.emptyOs}</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="space-y-3">
                  {osPagination.paginatedItems.map(os => {
                    const style = OS_STATUS_STYLE[os.status] || OS_STATUS_STYLE.pendente;
                    const label = OS_STATUS_LABEL[os.status] || os.status;
                    return (
                      <Card key={os.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-mono text-sm font-bold">#{String(os.order_number).padStart(6, '0')}</span>
                                <Badge className={cn('text-xs', style.badgeClass)}>
                                  {label}
                                </Badge>
                              </div>
                              {os.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2">{os.description}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                {os.scheduled_date
                                  ? `${t.scheduledPrefix} ${formatDate(os.scheduled_date, locale, timezone)}`
                                  : `${t.createdPrefix} ${formatDate(os.created_at, locale, timezone)}`
                                }
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {viewerCanFill && !TERMINAL_STATUSES.includes(os.status) && (
                                <a
                                  href={`${window.location.origin}/os-tecnico/${os.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={t.fillOs}
                                >
                                  <Button size="sm" variant="default" className="gap-1 text-xs">
                                    {t.fillOs}
                                  </Button>
                                </a>
                              )}
                              <a
                                href={`${window.location.origin}/os-tecnico/${os.id}?modo=cliente`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </a>
                              {os.status === 'pendente' && <Clock className="h-5 w-5 text-warning" />}
                              {os.status === 'concluida' && <CheckCircle className="h-5 w-5 text-success" />}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                <DataTablePagination
                  page={osPagination.page} totalPages={osPagination.totalPages}
                  totalItems={osPagination.totalItems} from={osPagination.from}
                  to={osPagination.to} pageSize={osPagination.pageSize}
                  onPageChange={osPagination.setPage} onPageSizeChange={osPagination.setPageSize}
                />
              </>
            )}
          </TabsContent>

          {/* Aba Equipamentos */}
          <TabsContent value="equipamentos" className="space-y-4 mt-4">
            {selectedEquipment && selectedEq ? (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setSelectedEquipment(null)}>
                  {t.backToList}
                </Button>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      {selectedEq.photo_url && (
                        <img src={selectedEq.photo_url} alt="" className="h-12 w-12 rounded object-cover border" />
                      )}
                      <div>
                        <p>{selectedEq.name}</p>
                        <p className="text-sm font-normal text-muted-foreground">
                          {[selectedEq.brand, selectedEq.model].filter(Boolean).join(' - ')}
                        </p>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {equipmentFieldConfig.length > 0 ? (
                      <>
                        {buildDetailRows(selectedEq).map(({ fc, rawValue }) => (
                          <div key={fc.field_key} className="flex justify-between gap-3">
                            <span className="text-muted-foreground">{fc.label}</span>
                            <span className="text-right break-words">
                              {formatFieldValue(rawValue, fc.field_type)}
                            </span>
                          </div>
                        ))}
                        {selectedEq.identifier && (
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">{t.fieldIdentifier}</span>
                            <span className="font-mono text-right break-words">{selectedEq.identifier}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {selectedEq.serial_number && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t.fieldSerialNumber}</span>
                            <span className="font-mono">{selectedEq.serial_number}</span>
                          </div>
                        )}
                        {selectedEq.identifier && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t.fieldIdentifier}</span>
                            <span className="font-mono">{selectedEq.identifier}</span>
                          </div>
                        )}
                        {selectedEq.location && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t.fieldLocation}</span>
                            <span>{selectedEq.location}</span>
                          </div>
                        )}
                      </>
                    )}
                    <Badge variant={selectedEq.status === 'active' ? 'default' : 'secondary'}>
                      {selectedEq.status === 'active' ? t.equipStatusActive : t.equipStatusInactive}
                    </Badge>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t.equipOsHistory}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {equipmentOrders.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">{t.emptyEquipOs}</p>
                    ) : (
                      <div className="space-y-2">
                        {equipmentOrders.map(os => {
                          const style = OS_STATUS_STYLE[os.status] || OS_STATUS_STYLE.pendente;
                          const label = OS_STATUS_LABEL[os.status] || os.status;
                          return (
                            <div key={os.id} className="flex items-center justify-between p-3 rounded-md border text-sm">
                              <div>
                                <span className="font-mono font-bold">#{String(os.order_number).padStart(6, '0')}</span>
                                {os.description && <span className="text-muted-foreground ml-2">{os.description}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={cn('text-xs', style.color)}>{label}</Badge>
                                {viewerCanFill && !TERMINAL_STATUSES.includes(os.status) && (
                                  <a
                                    href={`${window.location.origin}/os-tecnico/${os.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={t.fillOs}
                                  >
                                    <Button size="sm" variant="default" className="h-7 gap-1 text-xs">
                                      {t.fillOs}
                                    </Button>
                                  </a>
                                )}
                                <a href={`${window.location.origin}/os-tecnico/${os.id}?modo=cliente`} target="_blank" rel="noopener noreferrer">
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </Button>
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <>
                {equipment.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center py-12">
                      <Package className="h-10 w-10 text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">{t.emptyEquipment}</p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {eqPagination.paginatedItems.map(eq => (
                        <Card
                          key={eq.id}
                          className="cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => setSelectedEquipment(eq.id)}
                        >
                          <CardContent className="p-4 flex items-center gap-3">
                            {eq.photo_url ? (
                              <img src={eq.photo_url} alt="" className="h-12 w-12 rounded object-cover border shrink-0" />
                            ) : (
                              <div className="h-12 w-12 rounded bg-muted flex items-center justify-center shrink-0">
                                <Package className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{eq.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {[eq.brand, eq.model].filter(Boolean).join(' - ')}
                              </p>
                              {eq.location && (
                                <p className="text-xs text-muted-foreground">{eq.location}</p>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    <DataTablePagination
                      page={eqPagination.page} totalPages={eqPagination.totalPages}
                      totalItems={eqPagination.totalItems} from={eqPagination.from}
                      to={eqPagination.to} pageSize={eqPagination.pageSize}
                      onPageChange={eqPagination.setPage} onPageSizeChange={eqPagination.setPageSize}
                    />
                  </>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Modal de chamado */}
      <ResponsiveModal open={showTicketForm} onOpenChange={setShowTicketForm} title={t.openTicket}>
        <div className="space-y-4 p-1">
          <div>
            <Label>{t.ticketProblemLabel}</Label>
            <Textarea
              value={ticketDesc}
              onChange={e => setTicketDesc(e.target.value)}
              placeholder={t.ticketProblemPlaceholder}
              rows={4}
            />
          </div>
          {equipment.length > 0 && (
            <div>
              <Label>{t.ticketEquipmentLabel}</Label>
              <SearchableSelect
                options={[{ value: 'none', label: t.ticketEquipmentNone }, ...equipment.map(eq => ({ value: eq.id, label: eq.name }))]}
                value={ticketEquipmentId || 'none'}
                onValueChange={v => setTicketEquipmentId(v === 'none' ? '' : v)}
                placeholder={t.ticketEquipmentPlaceholder}
                searchPlaceholder={t.ticketEquipmentSearch}
              />
            </div>
          )}
          <Button className="w-full" onClick={handleSubmitTicket} disabled={ticketSubmitting || !ticketDesc.trim()}>
            {ticketSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            {t.ticketSubmit}
          </Button>
        </div>
      </ResponsiveModal>

      {/* Rodapé Dominex — oculto em white-label */}
      {!whiteLabelEnabled && (
        <footer
          className="mx-auto flex max-w-4xl flex-col items-center gap-1 px-4 pt-8 pb-2"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <img
            src={dominexLogoWhite}
            alt="Dominex"
            className="h-5 object-contain invert dark:invert-0"
          />
          <span className="text-[10px] tracking-wide text-muted-foreground/80">
            www.dominex.app
          </span>
        </footer>
      )}
    </div>
  );
}
