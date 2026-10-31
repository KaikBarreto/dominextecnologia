import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Package,
  ClipboardList,
  CheckCircle,
  AlertCircle,
  Loader2,
  Send,
  ChevronRight,
  ExternalLink,
  Star,
  FileText,
  Paperclip,
  ImageIcon,
  Search,
  Wrench,
  User,
  Users,
  CreditCard,
  Files,
  ReceiptText,
  Lock,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn, fuzzyIncludes } from '@/lib/utils';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { getErrorMessage } from '@/utils/errorMessages';
import DarkVeil from '@/components/ui/DarkVeil';
import PortalUnavailable from '@/components/portal/PortalUnavailable';
import { PublicAppLocaleProvider, useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatDate } from '@/lib/format';
import { detectMachineLocale } from '@/lib/i18n/detectLocale';
import { PublicPortalShell } from '@/components/portal/PublicPortalShell';
import { PortalContactButton } from '@/components/portal/PortalContactButton';
import { idealForeground } from '@/lib/colorContrast';
import {
  type PublicOsRating,
  type PublicNpsConfig,
  type PublicNpsCriterion,
} from '@/hooks/useServiceRatings';
import { OSRatingSurvey } from '@/components/technician/OSRatingSurvey';
import { supabaseAnon } from '@/integrations/supabase/anonClient';
import { buildPmocPortalUrl } from '@/utils/pmocPortalApi';
import { createCustomerPortalTicket } from '@/utils/customerPortalApi';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { EmptyState } from '@/components/mobile/EmptyState';
import { PortalChargesSection } from '@/components/portal/PortalChargesSection';
import { formatOSNumber } from '@/lib/osNumber';
import { PortalDocumentsSection, type PortalDocumentItem } from '@/components/portal/PortalDocumentsSection';
import { PortalUnlockCard } from '@/components/portal/PortalUnlockCard';
import { PartyLabelBadges } from '@/components/customers/PartyLabelBadge';

interface PortalLabel {
  id: string;
  name: string;
  color: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces e constantes
// ─────────────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  name: string;
  company_id: string;
  custom_fields?: Record<string, unknown> | null;
  labels?: PortalLabel[];
}

interface EquipmentAttachment {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
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
  custom_fields?: Record<string, unknown> | null;
  // Campos ampliados pelo dev-database (contrato de dados B)
  capacity?: string | null;
  install_date?: string | null;
  warranty_until?: string | null;
  category?: { name: string; color: string } | null;
  attachments_public?: boolean;
  attachments?: EquipmentAttachment[];
  labels?: PortalLabel[];
}

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
  // Campos entregues pelo dev-database (contrato de dados)
  service_type_name: string | null;
  technician_name: string | null;
  team_name: string | null;
}

interface CompanySettings {
  name: string;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  white_label_enabled?: boolean | null;
  white_label_primary_color?: string | null;
  white_label_logo_url?: string | null;
  white_label_icon_url?: string | null;
  language?: string | null;
  country_code?: string | null;
  currency?: string | null;
  timezone?: string | null;
}

interface PortalContractSummary {
  id: string;
  name: string;
  is_pmoc: boolean;
  status: 'active' | 'paused';
  next_maintenance_date: string | null;
  public_short_code: string | null;
  public_pmoc_token: string | null;
}

interface PortalCharge {
  value: number | null;
  status: string | null;
  due_date: string | null;
  description: string | null;
  billing_type: string | null;
  public_short_code: string | null;
}

interface PortalPayload {
  access?: 'granted' | 'denied' | 'module_unavailable' | 'password_required';
  viewer_can_fill?: boolean;
  company_name?: string | null;
  customer: Customer;
  company_settings: CompanySettings | null;
  equipment: Equipment[];
  service_orders: ServiceOrder[];
  equipment_field_config?: FieldConfig[];
  customer_field_config?: FieldConfig[];
  contracts?: PortalContractSummary[];
  charges?: PortalCharge[];
  invoices?: PortalDocumentItem[];
  documents?: PortalDocumentItem[];
  permissions?: PortalPermissions;
  /**
   * `true` quando o visitante NAO tem sessao e ha pelo menos uma secao atras da
   * senha. Nesse caso o servidor devolve `access: 'granted'` com os blocos
   * protegidos vazios e o bloco `customer` reduzido a `{ id, name }`.
   */
  partial?: boolean;
  /** Chaves de secao visiveis MAS protegidas por senha (so UX; o corte e no servidor). */
  locked_sections?: string[];
}

interface PortalPermissions {
  service_orders: boolean;
  equipment: boolean;
  contracts: boolean;
  charges: boolean;
  invoices: boolean;
  documents: boolean;
  ticket_requests: boolean;
}

const DEFAULT_PORTAL_PERMISSIONS: PortalPermissions = {
  service_orders: true,
  equipment: true,
  contracts: true,
  charges: true,
  invoices: false,
  documents: false,
  ticket_requests: true,
};

// Cores de badge por status (fundo saturado + texto branco, regra Dominex).
const OS_STATUS_STYLE: Record<string, { badgeClass: string }> = {
  pendente: {
    badgeClass: 'bg-warning text-white border-transparent',
  },
  em_andamento: {
    badgeClass: 'bg-primary text-white border-transparent',
  },
  a_caminho: {
    badgeClass: 'bg-indigo-500 text-white border-transparent',
  },
  concluida: {
    badgeClass: 'bg-success text-white border-transparent',
  },
  cancelada: {
    badgeClass: 'bg-destructive text-white border-transparent',
  },
};

const TERMINAL_STATUSES = ['concluida', 'cancelada'];

// Chaves que já são mostradas como campos fixos — não devem ser duplicadas
// via custom_fields, mesmo que existam na config.
const BUILT_IN_FIELD_KEYS: Record<string, keyof Equipment> = {
  brand: 'brand',
  model: 'model',
  serial_number: 'serial_number',
  location: 'location',
  capacity: 'capacity',
  install_date: 'install_date',
  warranty_until: 'warranty_until',
};

// Conjunto de chaves de campo fixo para lookup O(1) na exclusão de duplicação
const BUILT_IN_KEYS_SET = new Set(Object.keys(BUILT_IN_FIELD_KEYS));

// StarRow, OsRateModal e lógica de conversão 5→0-10 foram removidos.
// O portal agora usa OSRatingSurvey (link público) que já carrega critérios
// dinâmicos, escala NPS 0-10 com slider e StarRows com label por tópico.

// ─────────────────────────────────────────────────────────────────────────────
// Outer shell: carrega dados, resolve locale, envolve no PublicAppLocaleProvider
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tira do payload do portal o que é NOTA INTERNA da equipe. Tarefa mora na
 * mesma tabela da OS (`service_orders`), separada só por `entry_type`. OS
 * antiga pode ter `entry_type` nulo, então o default é tratá-la como OS.
 */
function isInternalTask(order: unknown): boolean {
  const entryType = (order as { entry_type?: string | null } | null)?.entry_type;
  return (entryType ?? 'os') === 'tarefa';
}

function filterOutInternalTasks<T>(orders: T[] | null | undefined): T[] {
  return (orders ?? []).filter((o) => !isInternalTask(o));
}

export default function CustomerPortal() {
  const { token } = useParams<{ token: string }>();
  const sessionKey = `dominex_customer_portal_session_${token ?? ''}`;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [equipmentFieldConfig, setEquipmentFieldConfig] = useState<FieldConfig[]>([]);
  const [customerFieldConfig, setCustomerFieldConfig] = useState<FieldConfig[]>([]);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [contracts, setContracts] = useState<PortalContractSummary[]>([]);
  const [charges, setCharges] = useState<PortalCharge[]>([]);
  const [invoices, setInvoices] = useState<PortalDocumentItem[]>([]);
  const [documents, setDocuments] = useState<PortalDocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);
  const [unavailableCompanyName, setUnavailableCompanyName] = useState<string | null>(null);
  const [viewerCanFill, setViewerCanFill] = useState(false);
  const [permissions, setPermissions] = useState<PortalPermissions>(DEFAULT_PORTAL_PERMISSIONS);
  const [passwordRequired, setPasswordRequired] = useState(false);
  // Secoes visiveis que ainda pedem senha. Payload sem a chave (banco antigo /
  // SQL nao aplicado) => lista vazia => portal se comporta exatamente como hoje.
  const [lockedSections, setLockedSections] = useState<string[]>([]);
  const [sessionToken, setSessionToken] = useState(() => {
    if (typeof window === 'undefined' || !token) return '';
    return window.sessionStorage.getItem(`dominex_customer_portal_session_${token}`) ?? '';
  });

  // Carrega TUDO que o portal precisa numa unica RPC SECURITY DEFINER que valida
  // o token internamente. Sem leituras anon diretas de tabelas do tenant.
  const loadPortalData = useCallback(async (activeSession: string) => {
    setLoading(true);
    setError(null);
    setAccessDenied(false);
    setModuleUnavailable(false);
    setPasswordRequired(false);
    setLockedSections([]);
    try {
      const { data, error: rpcError } = await supabase
        .rpc('get_portal_data', {
          p_token: token!,
          p_session_token: activeSession || null,
        });

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

      if (payload.access === 'password_required') {
        setPasswordRequired(true);
        setViewerCanFill(false);
        setCustomer(null);
        if (activeSession && typeof window !== 'undefined') {
          window.sessionStorage.removeItem(sessionKey);
          setSessionToken('');
        }
        setLoading(false);
        return;
      }

      setViewerCanFill(payload.viewer_can_fill === true);
      setPermissions(payload.permissions ?? DEFAULT_PORTAL_PERMISSIONS);
      // Acesso parcial: o servidor entregou o portal sem as secoes protegidas.
      // `locked_sections` serve so pra marcar o cadeado e oferecer o desbloqueio.
      setLockedSections(
        Array.isArray(payload.locked_sections)
          ? payload.locked_sections.filter((key): key is string => typeof key === 'string')
          : [],
      );
      setCustomer(payload.customer);
      setCompanySettings(payload.company_settings ?? null);
      setEquipment(payload.equipment ?? []);
      setEquipmentFieldConfig(payload.equipment_field_config ?? []);
      setCustomerFieldConfig(payload.customer_field_config ?? []);
      // TAREFA INTERNA NUNCA VAI PRO PORTAL. Tarefa é uma linha de
      // `service_orders` com `entry_type = 'tarefa'` (nota interna da equipe,
      // "lembrar de mandar orçamento"), e estava aparecendo pro cliente final
      // junto das OS. O filtro de verdade é no SQL do `get_portal_data`, que é
      // a fronteira; este aqui é a segunda trava, pra nenhuma tarefa chegar à
      // tela nem por payload antigo em cache nem por realtime.
      setServiceOrders(filterOutInternalTasks(payload.service_orders));
      setContracts(payload.contracts ?? []);
      setCharges(payload.charges ?? []);
      setInvoices(payload.invoices ?? []);
      setDocuments(payload.documents ?? []);
    } catch {
      setError('portal_load_error');
    } finally {
      setLoading(false);
    }
  }, [sessionKey, token]);

  useEffect(() => {
    const storedSession = typeof window !== 'undefined'
      ? window.sessionStorage.getItem(sessionKey) ?? ''
      : '';
    setSessionToken(storedSession);
    void loadPortalData(storedSession);
  }, [loadPortalData, sessionKey]);

  // O formulario de senha vive no PortalUnlockCard (fonte unica de mensagem de
  // erro, lockout e estado de carregando). Aqui so persistimos a sessao e
  // recarregamos o portal — mesmo fluxo do login de tela cheia de sempre.
  const handleUnlocked = useCallback(async (nextSession: string) => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(sessionKey, nextSession);
    }
    setSessionToken(nextSession);
    await loadPortalData(nextSession);
  }, [loadPortalData, sessionKey]);

  const handlePortalLogout = () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(sessionKey);
    }
    setSessionToken('');
    void loadPortalData('');
  };

  // Realtime: quando uma OS do cliente muda, recarrega o portal pela RPC validada
  // por token (nao lemos service_orders direto - RLS sem token).
  useEffect(() => {
    if (!customer?.id) return;
    const channel = supabase
      .channel('portal-os')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_orders', filter: `customer_id=eq.${customer.id}` },
        () => { void loadPortalData(sessionToken); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [customer?.id, loadPortalData, sessionToken]);

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

  if (passwordRequired) {
    // Portal TODO protegido: tela cheia de login, igual a sempre. Sem payload
    // ainda, o idioma vem do navegador (nao temos company_settings aqui).
    const machineLocale = detectMachineLocale() ?? 'pt-br';
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
        <div className="absolute inset-0 z-0">
          <DarkVeil hueShift={53} speed={0.5} />
        </div>
        <PortalUnlockCard
          variant="page"
          token={token!}
          locale={machineLocale}
          onUnlocked={handleUnlocked}
          autoFocus
        />
      </div>
    );
  }

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
            <p className="text-white/70 text-base max-w-md mx-auto">{tp.privateDesc}</p>
            <p className="text-white/40 text-sm max-w-md mx-auto">{tp.privateHint}</p>
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
        ? tp.errorLoadFailed
        : tp.errorFallback;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-xl font-bold mb-2">{tp.errorTitle}</h1>
        <p className="text-muted-foreground text-center">{errorMsg}</p>
      </div>
    );
  }

  return (
    <PublicAppLocaleProvider
      language={companySettings?.language}
      countryCode={companySettings?.country_code}
      currency={companySettings?.currency}
      timezone={companySettings?.timezone}
    >
      <CustomerPortalContent
        token={token!}
        customer={customer}
        companySettings={companySettings}
        equipment={equipment}
        equipmentFieldConfig={equipmentFieldConfig}
        customerFieldConfig={customerFieldConfig}
        serviceOrders={serviceOrders}
        contracts={contracts}
        charges={charges}
        invoices={invoices}
        documents={documents}
        permissions={permissions}
        lockedSections={lockedSections}
        sessionToken={sessionToken}
        viewerCanFill={viewerCanFill}
        onReload={() => loadPortalData(sessionToken)}
        onUnlocked={handleUnlocked}
        onLogout={sessionToken ? handlePortalLogout : undefined}
      />
    </PublicAppLocaleProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inner content: consome useAppLocaleContext() para i18n
// ─────────────────────────────────────────────────────────────────────────────

interface ContentProps {
  token: string;
  customer: Customer;
  companySettings: CompanySettings | null;
  equipment: Equipment[];
  equipmentFieldConfig: FieldConfig[];
  customerFieldConfig: FieldConfig[];
  serviceOrders: ServiceOrder[];
  contracts: PortalContractSummary[];
  charges: PortalCharge[];
  invoices: PortalDocumentItem[];
  documents: PortalDocumentItem[];
  permissions: PortalPermissions;
  /** Secoes visiveis porem protegidas por senha (cadeado + card de desbloqueio). */
  lockedSections: string[];
  sessionToken: string;
  viewerCanFill: boolean;
  onReload: () => Promise<void>;
  onUnlocked: (sessionToken: string) => Promise<void> | void;
  onLogout?: () => void;
}

/**
 * De cada aba de navegacao para a chave de permissao/`locked_sections` que a
 * governa. Usado so pra decidir cadeado e card de desbloqueio (UX): o corte do
 * dado acontece no servidor.
 */
const TAB_PERMISSION_KEY: Record<string, keyof PortalPermissions> = {
  os: 'service_orders',
  equipamentos: 'equipment',
  contratos: 'contracts',
  cobrancas: 'charges',
  'notas-fiscais': 'invoices',
  documentos: 'documents',
};

// Teal padrao Dominex (token --primary ~#00C684). Valor hex pra poder ir inline e
// compativel com idealForeground (que so parseia hex). Mesma constante do PontoPublico
// (ali chama ACCENT_PRIMARY mas usa hsl; aqui hex por compatibilidade com idealForeground).
const PORTAL_ACCENT_PRIMARY = '#00C684';

function CustomerPortalContent({
  token,
  customer,
  companySettings,
  equipment,
  equipmentFieldConfig,
  customerFieldConfig,
  serviceOrders,
  contracts,
  charges,
  invoices,
  documents,
  permissions,
  lockedSections,
  sessionToken,
  viewerCanFill,
  onReload,
  onUnlocked,
  onLogout,
}: ContentProps) {
  const [searchParams] = useSearchParams();
  const eqParam = searchParams.get('eq');
  const { toast } = useToast();

  const { locale, timezone, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.customers.portal;

  const OS_STATUS_LABEL = useMemo<Record<string, string>>(() => ({
    pendente: t.statusPendente,
    em_andamento: t.statusEmAndamento,
    a_caminho: t.statusACaminho,
    concluida: t.statusConcluida,
    cancelada: t.statusCancelada,
  }), [t]);

  // ── Secoes protegidas (acesso parcial) ──
  const lockedSet = useMemo(() => new Set(lockedSections), [lockedSections]);
  const ticketLocked = lockedSet.has('ticket_requests');
  // Cadeado na pilula/sidebar: troca o icone da secao pelo Lock.
  const sectionIcon = useCallback(
    (key: keyof PortalPermissions, icon: ReactNode): ReactNode =>
      (lockedSet.has(key) ? <Lock className="h-4 w-4 shrink-0" /> : icon),
    [lockedSet],
  );

  // ── Estado do modal de chamado ──
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketDesc, setTicketDesc] = useState('');
  const [ticketEquipmentId, setTicketEquipmentId] = useState('');
  const [ticketSubmitting, setTicketSubmitting] = useState(false);

  // ── Estado de avaliacao (OSRatingSurvey unificado) ──
  const [ratingOsId, setRatingOsId] = useState<string | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratedOsIds, setRatedOsIds] = useState<Set<string>>(new Set());
  // Dados carregados da RPC get_public_os para a OS sendo avaliada
  const [ratingData, setRatingData] = useState<{
    rating: PublicOsRating;
    npsConfig: PublicNpsConfig | null;
    npsCriteria: PublicNpsCriterion[];
  } | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);

  // ── Busca nas listas ──
  const [osSearch, setOsSearch] = useState('');
  const [eqSearch, setEqSearch] = useState('');

  // ── Abas e equipamento selecionado ──
  const [selectedEquipment, setSelectedEquipment] = useState<string | null>(eqParam);
  const [activeTab, setActiveTab] = useState(eqParam ? 'equipamentos' : 'os');
  // Sub-aba dentro do detalhe de equipamento
  const [eqSubTab, setEqSubTab] = useState<'overview' | 'history' | 'attachments'>('overview');
  // Imagem selecionada para preview (não abre em nova aba)
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);

  // ── Datasets filtrados pela busca (dataset completo, paginação recalcula sobre o filtrado) ──
  const filteredServiceOrders = useMemo(() => {
    if (!osSearch.trim()) return serviceOrders;
    // A exibição não leva mais zero à esquerda ("#123", não "#000123"), mas
    // quem digitar/colar o formato antigo (ex.: de um e-mail ou documento
    // impresso de antes do sweep que tirou o padding) não pode deixar de
    // achar a OS — em vez de re-preencher o número com zero, tira o zero à
    // esquerda do termo digitado (mantendo um eventual "#" na frente).
    const osSearchNoLeadingZeros = osSearch.replace(/(^#?)0+(?=\d)/, '$1');
    return serviceOrders.filter((os) => {
      const num = formatOSNumber(os.order_number);
      const statusLabel = OS_STATUS_LABEL[os.status] || os.status;
      return (
        fuzzyIncludes(num, osSearchNoLeadingZeros) ||
        fuzzyIncludes(os.description, osSearch) ||
        fuzzyIncludes(statusLabel, osSearch)
      );
    });
  }, [OS_STATUS_LABEL, serviceOrders, osSearch]);

  const filteredEquipment = useMemo(() => {
    if (!eqSearch.trim()) return equipment;
    return equipment.filter((eq) =>
      fuzzyIncludes(eq.name, eqSearch) ||
      fuzzyIncludes(eq.brand, eqSearch) ||
      fuzzyIncludes(eq.model, eqSearch) ||
      fuzzyIncludes(eq.location, eqSearch) ||
      fuzzyIncludes(eq.identifier, eqSearch) ||
      fuzzyIncludes(eq.serial_number, eqSearch),
    );
  }, [equipment, eqSearch]);

  const osPagination = useDataPagination(filteredServiceOrders);
  const eqPagination = useDataPagination(filteredEquipment);

  // ── White-label ──
  // Cor de marca: quando white-label usa a cor da empresa; senao cai no teal
  // padrao Dominex. NUNCA null — sem cor o header ficaria no degrede escuro,
  // ocultando a identidade da empresa. (PontoPublico usa o mesmo padrao.)
  const whiteLabelEnabled = !!companySettings?.white_label_enabled;
  const brandColor = useMemo(() => {
    if (whiteLabelEnabled && companySettings?.white_label_primary_color) {
      return companySettings.white_label_primary_color;
    }
    return PORTAL_ACCENT_PRIMARY;
  }, [whiteLabelEnabled, companySettings?.white_label_primary_color]);

  // Avatar: prefere o icone 1:1 (white_label_icon_url) quando disponivel,
  // pois o logo horizontal fica cortado no circulo do header.
  // Fallback: logo horizontal white-label > logo_url.
  const headerLogo = whiteLabelEnabled
    ? (companySettings?.white_label_icon_url || companySettings?.white_label_logo_url || companySettings?.logo_url)
    : companySettings?.logo_url;

  // Cor do texto sobre o header (calculada a partir da cor de marca, sempre presente).
  const headerTextColor = idealForeground(brandColor);

  // ── Equipamento selecionado ──
  const selectedEq = equipment.find((e) => e.id === selectedEquipment);

  // Reseta sub-aba ao trocar de equipamento
  const handleSelectEquipment = (id: string | null) => {
    setSelectedEquipment(id);
    setEqSubTab('overview');
  };
  const equipmentOrders = selectedEquipment
    ? serviceOrders.filter((os) => (os as unknown as { equipment_id?: string }).equipment_id === selectedEquipment)
    : [];

  const formatFieldValue = (value: unknown, fieldType: string): string => {
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
    return String(value ?? '');
  };

  // Formata uma data ISO (yyyy-MM-dd) para dd/MM/yyyy usando formatDate do projeto.
  const formatDateField = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    try {
      return formatDate(String(raw), locale, timezone);
    } catch {
      return raw;
    }
  };

  // buildFixedRows: campos fixos do equipamento na ordem do EquipmentDetail logado.
  // Exclui `notes` (observacao interna). Retorna apenas os preenchidos.
  const buildFixedRows = (eq: Equipment): { label: string; value: ReactNode }[] => {
    const rows: { label: string; value: ReactNode }[] = [];

    if (eq.category) {
      rows.push({
        label: t.fieldCategory,
        value: (
          <span className="flex items-center gap-2 justify-end">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: eq.category.color }}
            />
            <span className="text-sm font-medium">{eq.category.name}</span>
          </span>
        ),
      });
    }
    if (eq.brand) rows.push({ label: t.fieldBrand, value: <span className="text-sm font-medium">{eq.brand}</span> });
    if (eq.model) rows.push({ label: t.fieldModel, value: <span className="text-sm font-medium">{eq.model}</span> });
    if (eq.serial_number) rows.push({ label: t.fieldSerialNumber, value: <span className="font-mono text-sm font-medium">{eq.serial_number}</span> });
    if (eq.capacity) rows.push({ label: t.fieldCapacity, value: <span className="text-sm font-medium">{eq.capacity}</span> });
    if (eq.location) rows.push({ label: t.fieldLocation, value: <span className="text-sm font-medium">{eq.location}</span> });
    const installDateFmt = formatDateField(eq.install_date);
    if (installDateFmt) rows.push({ label: t.fieldInstallDate, value: <span className="text-sm font-medium">{installDateFmt}</span> });
    const warrantyFmt = formatDateField(eq.warranty_until);
    if (warrantyFmt) rows.push({ label: t.fieldWarrantyUntil, value: <span className="text-sm font-medium">{warrantyFmt}</span> });

    return rows;
  };

  // buildCustomRows: custom_fields visiveis + preenchidos, excluindo chaves ja
  // mostradas como fixas e excluindo `notes` (observacao interna).
  const buildCustomRows = (eq: Equipment): { label: string; value: string }[] => {
    if (!eq.custom_fields || equipmentFieldConfig.length === 0) return [];
    return [...equipmentFieldConfig]
      .sort((a, b) => a.position - b.position)
      .filter((fc) => !BUILT_IN_KEYS_SET.has(fc.field_key) && fc.field_key !== 'notes')
      .map((fc) => {
        const rawValue = eq.custom_fields?.[fc.field_key];
        return { fc, rawValue };
      })
      .filter(({ rawValue, fc }) => {
        if (fc.field_type === 'boolean') {
          return rawValue !== null && rawValue !== undefined && rawValue !== '';
        }
        return rawValue !== null && rawValue !== undefined && String(rawValue).trim() !== '';
      })
      .map(({ fc, rawValue }) => ({
        label: fc.label,
        value: formatFieldValue(rawValue, fc.field_type),
      }));
  };

  const handleSubmitTicket = async () => {
    if (!permissions.ticket_requests || ticketDesc.trim().length < 10) return;
    setTicketSubmitting(true);
    try {
      // Antes daqui havia um INSERT direto em `service_orders`. Desde
      // 18/10/2026 o `anon` não tem INSERT na tabela e o botão devolvia
      // `42501 permission denied for table service_orders` pro cliente final.
      // Agora a criação passa pela RPC SECURITY DEFINER (ver
      // createCustomerPortalTicket), que revalida portal/permissão/assinatura/
      // módulo e resolve customer e company pelo token, sem confiar no client.
      // `sessionToken` é a sessão do portal com senha, a MESMA que autorizou a
      // leitura: sem ela, um portal protegido aceitaria chamado de quem não
      // passou pela senha.
      await createCustomerPortalTicket(token, ticketDesc, sessionToken, ticketEquipmentId);
      toast({ title: t.ticketSuccess });
      setShowTicketForm(false);
      setTicketDesc('');
      setTicketEquipmentId('');
      await onReload();
    } catch (err: unknown) {
      // O cliente final nunca lê código de banco: traduz pelo SQLSTATE da RPC
      // pro idioma do portal, e só cai no genérico quando o erro é outro.
      const code = (err as { code?: string } | null)?.code;
      const description =
        code === '22023'
          ? t.ticketDescMinLength
          : code === '42501'
            ? t.ticketErrorUnavailable
            : getErrorMessage(err);
      toast({ variant: 'destructive', title: t.ticketErrorTitle, description });
    } finally {
      setTicketSubmitting(false);
    }
  };

  // Carrega nps_criteria + rating da RPC publica (anon) e abre o survey
  const openRatingModal = useCallback(async (osId: string) => {
    setRatingOsId(osId);
    setRatingLoading(true);
    setRatingData(null);
    try {
      const { data, error } = await supabaseAnon.rpc('get_public_os', { p_os_id: osId });
      if (error) throw error;
      const payload = data as Record<string, unknown> | null;
      setRatingData({
        rating: (payload?.rating as PublicOsRating | null) ?? {
          is_concluded: true,
          already_rated: false,
          rated_at: null,
          nps_score: null,
          quality_rating: null,
          punctuality_rating: null,
          professionalism_rating: null,
          comment: null,
          rated_by_name: null,
        },
        npsConfig: (payload?.nps_config as PublicNpsConfig | null) ?? null,
        npsCriteria: (payload?.nps_criteria as PublicNpsCriterion[] | null) ?? [],
      });
    } catch {
      // Mesmo sem config carregada, abre com defaults (sem criterios, NPS puro)
      setRatingData({
        rating: {
          is_concluded: true,
          already_rated: false,
          rated_at: null,
          nps_score: null,
          quality_rating: null,
          punctuality_rating: null,
          professionalism_rating: null,
          comment: null,
          rated_by_name: null,
        },
        npsConfig: null,
        npsCriteria: [],
      });
    } finally {
      setRatingLoading(false);
      setRatingOpen(true);
    }
  }, []);

  const handleRated = (osId: string) => {
    setRatedOsIds((prev) => new Set(prev).add(osId));
  };

  // ── Campo de busca de OS ──
  const osSearchBar = (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <Input
        placeholder={t.searchOsPlaceholder}
        className="pl-10"
        value={osSearch}
        onChange={(e) => { setOsSearch(e.target.value); osPagination.setPage(1); }}
      />
    </div>
  );

  // ── Corpo das abas ──
  const osTabContent = (
    <div className="space-y-4">
      {serviceOrders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <ClipboardList className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-muted-foreground">{t.emptyOs}</p>
          </CardContent>
        </Card>
      ) : filteredServiceOrders.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<ClipboardList className="h-8 w-8" />}
          title={t.emptyOsSearch}
        />
      ) : (
        <>
          <div className="space-y-3">
            {osPagination.paginatedItems.map((os) => {
              const style = OS_STATUS_STYLE[os.status] || OS_STATUS_STYLE.pendente;
              const label = OS_STATUS_LABEL[os.status] || os.status;
              const isEnRoute = os.status === 'a_caminho' || os.status === 'em_andamento';
              const isConcluida = os.status === 'concluida';
              const alreadyRated = ratedOsIds.has(os.id);

              return (
                <Card key={os.id}>
                  <CardContent className="p-4">
                    {/* Bloco de informacoes — largura total */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-bold">
                        {formatOSNumber(os.order_number)}
                      </span>
                      <Badge className={cn('text-xs', style.badgeClass)}>
                        {label}
                      </Badge>
                    </div>
                    {os.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {os.description}
                      </p>
                    )}
                    {/* Tipo de servico e responsavel */}
                    {(os.service_type_name || os.technician_name || os.team_name) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                        {os.service_type_name && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Wrench className="h-3.5 w-3.5 shrink-0" />
                            {os.service_type_name}
                          </span>
                        )}
                        {(os.technician_name || os.team_name) && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            {os.technician_name
                              ? <User className="h-3.5 w-3.5 shrink-0" />
                              : <Users className="h-3.5 w-3.5 shrink-0" />}
                            {os.technician_name ?? os.team_name}
                          </span>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {os.scheduled_date
                        ? `${t.scheduledPrefix} ${formatDate(os.scheduled_date, locale, timezone)}`
                        : `${t.createdPrefix} ${formatDate(os.created_at, locale, timezone)}`}
                    </p>

                    {/* Divisor */}
                    <div className="border-t border-border mt-3 pt-3">
                      {/* Linha de acoes */}
                      <div className="flex flex-wrap items-center gap-2">
                        {isEnRoute && (
                          <a
                            href={`${window.location.origin}/os-tecnico/${os.id}?modo=cliente`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button size="sm" variant="default" className="gap-1 text-xs">
                              {t.trackBtn}
                            </Button>
                          </a>
                        )}
                        {viewerCanFill && !TERMINAL_STATUSES.includes(os.status) && (
                          <a
                            href={`${window.location.origin}/os-tecnico/${os.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button size="sm" variant="outline" className="gap-1 text-xs">
                              {t.fillOs}
                            </Button>
                          </a>
                        )}
                        {/* Acao de avaliar OS concluida */}
                        {isConcluida && !alreadyRated && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="group h-8 gap-1 text-xs text-warning hover:bg-warning hover:text-white"
                            onClick={() => openRatingModal(os.id)}
                            disabled={ratingLoading && ratingOsId === os.id}
                          >
                            <Star className="h-3.5 w-3.5 fill-warning text-warning group-hover:fill-white group-hover:text-white" />
                            {t.rateOs}
                          </Button>
                        )}
                        {isConcluida && alreadyRated && (
                          <span className="text-xs text-success flex items-center gap-1">
                            <CheckCircle className="h-3.5 w-3.5" />
                            {t.rateThanks}
                          </span>
                        )}
                        <a
                          href={`${window.location.origin}/os-tecnico/${os.id}?modo=cliente`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                            <ExternalLink className="h-3.5 w-3.5" />
                            {t.eqViewReport}
                          </Button>
                        </a>
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
    </div>
  );

  // ── Subabas do equipamento (espelha o primitivo do EquipmentDetailDialog logado) ──
  const eqSubTabs: { key: typeof eqSubTab; label: string }[] = [
    { key: 'overview', label: t.eqSubTabOverview },
    { key: 'history', label: t.eqSubTabHistory },
    { key: 'attachments', label: t.eqSubTabAttachments },
  ];

  const eqTabContent = selectedEquipment && selectedEq ? (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => handleSelectEquipment(null)}>
        {t.backToList}
      </Button>

      {/* Cabeçalho: foto + nome + status (fora das subabas, fixo no topo) */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3 px-4 py-3">
          {selectedEq.photo_url ? (
            <img src={selectedEq.photo_url} alt="" className="h-12 w-12 rounded-xl object-cover border shrink-0" />
          ) : (
            <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2"><p className="break-words text-sm font-semibold">{selectedEq.name}</p><PartyLabelBadges labels={selectedEq.labels} mode="summary" /></div>
            {(selectedEq.brand || selectedEq.model) && (
              <p className="text-xs text-muted-foreground">
                {[selectedEq.brand, selectedEq.model].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <Badge
            className={cn(
              'shrink-0 text-xs',
              selectedEq.status === 'active'
                ? 'bg-success text-white border-transparent'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {selectedEq.status === 'active' ? t.equipStatusActive : t.equipStatusInactive}
          </Badge>
        </div>
      </div>

      {/* Subabas — mesma convenção de tab do EquipmentDetailDialog logado */}
      <div className="flex gap-1 border-b border-border">
        {eqSubTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setEqSubTab(tab.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
              eqSubTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-aba: Visão geral */}
      {eqSubTab === 'overview' && (() => {
        const fixedRows = buildFixedRows(selectedEq);
        const customRows = buildCustomRows(selectedEq);
        const hasAnyRow = fixedRows.length > 0 || customRows.length > 0 || !!selectedEq.identifier;

        if (!hasAnyRow) return null;

        return (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] divide-y divide-border">
            {/* Campos fixos: categoria, marca, modelo, nº série, capacidade, local, datas */}
            {fixedRows.map((row, i) => (
              <div key={`fixed-${i}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-xs text-muted-foreground shrink-0">{row.label}</span>
                <div className="text-right break-words">{row.value}</div>
              </div>
            ))}
            {/* Identificador (campo de sistema) */}
            {selectedEq.identifier && (
              <div className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="text-xs text-muted-foreground shrink-0">{t.fieldIdentifier}</span>
                <span className="font-mono text-sm text-right break-words font-medium">{selectedEq.identifier}</span>
              </div>
            )}
            {/* Custom fields visiveis e preenchidos (exceto os fixos e notes) */}
            {customRows.map((row, i) => (
              <div key={`custom-${i}`} className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="text-xs text-muted-foreground shrink-0">{row.label}</span>
                <span className="text-sm text-right break-words font-medium">{row.value}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Sub-aba: Histórico */}
      {eqSubTab === 'history' && (
        <div>
          {equipmentOrders.length === 0 ? (
            <EmptyState
              size="compact"
              icon={<ClipboardList className="h-8 w-8" />}
              title={t.emptyEquipOs}
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              {equipmentOrders.map((os) => {
                const style = OS_STATUS_STYLE[os.status] || OS_STATUS_STYLE.pendente;
                const label = OS_STATUS_LABEL[os.status] || os.status;
                return (
                  <div key={os.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <span className="font-mono font-bold">{formatOSNumber(os.order_number)}</span>
                      {os.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{os.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={cn('text-[10px]', style.badgeClass)}>{label}</Badge>
                      {viewerCanFill && !TERMINAL_STATUSES.includes(os.status) && (
                        <a
                          href={`${window.location.origin}/os-tecnico/${os.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button size="sm" variant="default" className="h-7 gap-1 text-xs">
                            {t.fillOs}
                          </Button>
                        </a>
                      )}
                      <a
                        href={`${window.location.origin}/os-tecnico/${os.id}?modo=cliente`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                          <ExternalLink className="h-3.5 w-3.5" />
                          {t.eqViewReport}
                        </Button>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Sub-aba: Anexos */}
      {eqSubTab === 'attachments' && (
        <div>
          {/* Restrição: attachments_public=false ou lista vazia */}
          {(selectedEq.attachments_public === false) ? (
            <EmptyState
              size="compact"
              icon={<Paperclip className="h-8 w-8" />}
              title={t.eqAttachmentsPrivate}
              description={t.eqAttachmentsPrivateDesc}
            />
          ) : !selectedEq.attachments || selectedEq.attachments.length === 0 ? (
            <EmptyState
              size="compact"
              icon={<Paperclip className="h-8 w-8" />}
              title={t.eqAttachmentsEmpty}
              description={t.eqAttachmentsEmptyDesc}
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              {selectedEq.attachments.map((att) => {
                const isImage = att.file_type?.startsWith('image/') ||
                  /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(att.file_name);
                return (
                  <div key={att.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="shrink-0 text-muted-foreground">
                      {isImage
                        ? <ImageIcon className="h-4 w-4" />
                        : <FileText className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{att.file_name}</p>
                      <p className="text-xs text-muted-foreground uppercase">{att.file_type?.split('/')[1] || 'arquivo'}</p>
                    </div>
                    {isImage ? (
                      <button
                        type="button"
                        onClick={() => setPreviewImage({ src: att.file_url, alt: att.file_name })}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label={att.file_name}
                      >
                        <ImageIcon className="h-4 w-4" />
                      </button>
                    ) : (
                      <a
                        href={att.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label={att.file_name}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  ) : (
    <>
      {/* Campo de busca de equipamentos */}
      {equipment.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={t.searchEqPlaceholder}
            className="pl-10"
            value={eqSearch}
            onChange={(e) => { setEqSearch(e.target.value); eqPagination.setPage(1); }}
          />
        </div>
      )}

      {equipment.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <Package className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-muted-foreground">{t.emptyEquipment}</p>
          </CardContent>
        </Card>
      ) : filteredEquipment.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<Package className="h-8 w-8" />}
          title={t.emptyEqSearch}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {eqPagination.paginatedItems.map((eq) => (
              <Card
                key={eq.id}
                className="cursor-pointer overflow-hidden hover:shadow-md transition-shadow"
                onClick={() => handleSelectEquipment(eq.id)}
              >
                {/* Foto colada no topo, embaixo e à esquerda, sempre quadrada. */}
                <CardContent className="flex h-24 items-stretch p-0">
                  {eq.photo_url ? (
                    <img src={eq.photo_url} alt="" className="h-full w-24 shrink-0 object-cover" />
                  ) : (
                    <div className="h-full w-24 bg-muted flex items-center justify-center shrink-0">
                      <Package className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex flex-1 min-w-0 items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex min-w-0 items-center gap-2"><p className="font-medium truncate">{eq.name}</p><PartyLabelBadges labels={eq.labels} mode="summary" /></div>
                      <p className="text-xs text-muted-foreground truncate">
                        {[eq.brand, eq.model].filter(Boolean).join(' - ')}
                      </p>
                      {eq.location && (
                        <p className="text-xs text-muted-foreground truncate">{eq.location}</p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
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
  );

  // ── Conteudo da aba Contratos ──
  const contractsTabContent = (
    <div className="space-y-3">
      {contracts.length === 0 ? null : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] divide-y divide-border">
          {contracts.map((ct) => {
            const portalUrl = buildPmocPortalUrl({
              shortCode: ct.public_short_code,
              name: ct.name,
              token: ct.public_pmoc_token,
            });
            return (
              <a
                key={ct.id}
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t.contractOpen}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold truncate">{ct.name}</span>
                    {ct.is_pmoc && (
                      <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white leading-none shrink-0">
                        {t.contractPmoc}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {ct.next_maintenance_date
                      ? `${t.contractNextMaint}: ${formatDate(ct.next_maintenance_date, locale, timezone)}`
                      : `${t.contractNextMaint}: ${t.contractTbd}`}
                  </p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Secoes de navegacao (mobile: pilulas; desktop: sidebar) ──
  const navSections = useMemo(() => [
    ...(permissions.service_orders
      ? [{ value: 'os', label: t.tabOs, icon: sectionIcon('service_orders', <ClipboardList className="h-4 w-4 shrink-0" />) }]
      : []),
    ...(permissions.equipment
      ? [{ value: 'equipamentos', label: t.tabEquipment, icon: sectionIcon('equipment', <Package className="h-4 w-4 shrink-0" />) }]
      : []),
    // Aba Contratos: so aparece quando o cliente tem ao menos 1 contrato.
    // Protegida sem sessao vem com lista vazia do servidor — por isso o
    // `lockedSet` tambem mantem a aba, senao o cadeado nunca apareceria.
    ...(permissions.contracts && (contracts.length > 0 || lockedSet.has('contracts'))
      ? [{ value: 'contratos', label: t.sectionContracts, icon: sectionIcon('contracts', <FileText className="h-4 w-4 shrink-0" />) }]
      : []),
    // Aba Cobranças: mesma regra (so com cobranca, ou protegida)
    ...(permissions.charges && (charges.length > 0 || lockedSet.has('charges'))
      ? [{ value: 'cobrancas', label: t.sectionCharges, icon: sectionIcon('charges', <CreditCard className="h-4 w-4 shrink-0" />) }]
      : []),
    ...(permissions.invoices
      ? [{ value: 'notas-fiscais', label: t.sectionInvoices, icon: sectionIcon('invoices', <ReceiptText className="h-4 w-4 shrink-0" />) }]
      : []),
    ...(permissions.documents
      ? [{ value: 'documentos', label: t.sectionDocuments, icon: sectionIcon('documents', <Files className="h-4 w-4 shrink-0" />) }]
      : []),
  ], [charges.length, contracts.length, lockedSet, permissions, sectionIcon, t]);

  useEffect(() => {
    if (navSections.length > 0 && !navSections.some((section) => section.value === activeTab)) {
      setActiveTab(navSections[0].value);
    }
  }, [activeTab, navSections]);

  // Aba aberta esta protegida? Entao o corpo dela e o card de desbloqueio.
  const activeTabKey = TAB_PERMISSION_KEY[activeTab];
  const activeIsLocked = !!activeTabKey && lockedSet.has(activeTabKey);
  const customerCustomRows = customerFieldConfig
    .filter((field) => customer.custom_fields?.[field.field_key] !== undefined && customer.custom_fields?.[field.field_key] !== null && customer.custom_fields?.[field.field_key] !== '')
    .sort((a, b) => a.position - b.position)
    .map((field) => ({ label: field.label, value: formatFieldValue(customer.custom_fields?.[field.field_key], field.field_type) }));

  // ── Render principal com PublicPortalShell ──
  return (
    <PublicPortalShell
      brandColor={brandColor}
      logoUrl={headerLogo}
      title={companySettings?.name || t.defaultTitle}
      subtitle={`${t.greeting} ${customer.name}`}
      headerAction={
        <div className="flex items-center gap-1.5">
          <PortalContactButton
            phone={companySettings?.phone}
            email={companySettings?.email}
            textColor={headerTextColor}
          />
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              aria-label={MESSAGES[locale].app.shell.account.logout}
              title={MESSAGES[locale].app.shell.account.logout}
              className="flex h-9 w-9 items-center justify-center rounded-full transition-opacity active:opacity-70"
              style={{ background: 'rgba(255,255,255,0.18)' }}
            >
              <LogOut className="h-4 w-4" style={{ color: headerTextColor }} />
            </button>
          )}
        </div>
      }
      navSections={navSections}
      activeSection={activeTab}
      onSectionChange={setActiveTab}
      footerCtaLabel={permissions.ticket_requests ? t.openTicket : undefined}
      onFooterCta={permissions.ticket_requests
        // Chamado protegido: o CTA abre o desbloqueio, nao o formulario.
        ? () => (ticketLocked ? setShowUnlockModal(true) : setShowTicketForm(true))
        : undefined}
      navLabel={t.sidebarNavLabel}
    >
      {!!customer.labels?.length && <PartyLabelBadges labels={customer.labels} mode="full" className="mb-4" />}
      {customerCustomRows.length > 0 && (
        <Card>
          <CardContent className="p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground/70">Informações</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {customerCustomRows.map((row) => <div key={row.label} className="min-w-0"><p className="text-xs text-muted-foreground">{row.label}</p><p className="break-words text-sm font-medium">{row.value}</p></div>)}
            </div>
          </CardContent>
        </Card>
      )}
      {/* Campo de busca de OS — no topo da aba */}
      {permissions.service_orders && activeTab === 'os' && !activeIsLocked && (
        <div className="mb-4">
          {osSearchBar}
        </div>
      )}

      {/* Conteudo das abas */}
      {navSections.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t.emptySections}
          </CardContent>
        </Card>
      )}
      {/* Secao protegida: card de desbloqueio em vez do conteudo. O dado ja nao
          veio do servidor — isto aqui e so a porta pra quem tem a senha. */}
      {activeIsLocked && (
        <PortalUnlockCard
          variant="inline"
          token={token}
          locale={locale}
          brandColor={brandColor}
          onUnlocked={onUnlocked}
          title={t.lockedSectionTitle}
          description={t.lockedSectionDesc}
          inputId={`portal-unlock-${activeTab}`}
        />
      )}
      {!activeIsLocked && permissions.service_orders && activeTab === 'os' && osTabContent}
      {!activeIsLocked && permissions.equipment && activeTab === 'equipamentos' && eqTabContent}
      {!activeIsLocked && permissions.contracts && activeTab === 'contratos' && contractsTabContent}
      {!activeIsLocked && permissions.charges && activeTab === 'cobrancas' && (
        <PortalChargesSection
          charges={charges}
          t={{
            chargesEmpty: t.chargesEmpty,
            chargeStatusPaid: t.chargeStatusPaid,
            chargeStatusPending: t.chargeStatusPending,
            chargeStatusOverdue: t.chargeStatusOverdue,
            chargeStatusRefunded: t.chargeStatusRefunded,
            chargeStatusOther: t.chargeStatusOther,
            chargeDueLabel: t.chargeDueLabel,
            chargePayBtn: t.chargePayBtn,
          }}
          locale={locale}
          currency={currency ?? 'BRL'}
          timezone={timezone}
        />
      )}
      {!activeIsLocked && permissions.invoices && activeTab === 'notas-fiscais' && (
        <PortalDocumentsSection
          kind="invoice"
          items={invoices}
          portalToken={token}
          sessionToken={sessionToken}
          locale={locale}
          currency={currency ?? 'BRL'}
          timezone={timezone}
        />
      )}
      {!activeIsLocked && permissions.documents && activeTab === 'documentos' && (
        <PortalDocumentsSection
          kind="document"
          items={documents}
          portalToken={token}
          sessionToken={sessionToken}
          locale={locale}
          currency={currency ?? 'BRL'}
          timezone={timezone}
        />
      )}

      {/* Desbloqueio do "Abrir chamado" quando a secao de chamados pede senha.
          Mesmo card da secao protegida: uma fonte so pra erro/lockout. */}
      {permissions.ticket_requests && ticketLocked && (
        <ResponsiveModal
          open={showUnlockModal}
          onOpenChange={setShowUnlockModal}
          title={t.lockedSectionTitle}
        >
          <PortalUnlockCard
            variant="plain"
            token={token}
            locale={locale}
            brandColor={brandColor}
            onUnlocked={async (nextSession) => {
              setShowUnlockModal(false);
              await onUnlocked(nextSession);
            }}
            description={t.lockedTicketDesc}
            inputId="portal-unlock-ticket"
          />
        </ResponsiveModal>
      )}

      {/* Modal de chamado (preservado integralmente) */}
      {permissions.ticket_requests && !ticketLocked && <ResponsiveModal
        open={showTicketForm}
        onOpenChange={(v) => {
          // Modal de criar/editar nao fecha ao clicar fora (regra-lei UI).
          // Aqui so fechamos pelo X ou botao Enviar.
          if (!v && ticketSubmitting) return;
          setShowTicketForm(v);
        }}
        title={t.openTicket}
      >
        <div className="space-y-4 p-1">
          <div>
            <Label>{t.ticketProblemLabel}</Label>
            <Textarea
              value={ticketDesc}
              onChange={(e) => setTicketDesc(e.target.value)}
              placeholder={t.ticketProblemPlaceholder}
              rows={4}
            />
            {ticketDesc.length > 0 && ticketDesc.trim().length < 10 && (
              <p className="mt-1 text-xs text-destructive">{t.ticketDescMinLength}</p>
            )}
          </div>
          {equipment.length > 0 && (
            <div>
              <Label>{t.ticketEquipmentLabel}</Label>
              <SearchableSelect
                options={[
                  { value: 'none', label: t.ticketEquipmentNone },
                  ...equipment.map((eq) => ({
                    value: eq.id,
                    label: eq.name,
                    suffix: <PartyLabelBadges labels={eq.labels} mode="summary" />,
                    selectedSuffix: <PartyLabelBadges labels={eq.labels} mode="compact" />,
                    keywords: eq.labels?.map((label) => label.name),
                  })),
                ]}
                value={ticketEquipmentId || 'none'}
                onValueChange={(v) => setTicketEquipmentId(v === 'none' ? '' : v)}
                placeholder={t.ticketEquipmentPlaceholder}
                searchPlaceholder={t.ticketEquipmentSearch}
              />
            </div>
          )}
          <Button
            className="w-full"
            onClick={handleSubmitTicket}
            disabled={ticketSubmitting || ticketDesc.trim().length < 10}
          >
            {ticketSubmitting
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <Send className="h-4 w-4 mr-2" />}
            {t.ticketSubmit}
          </Button>
        </div>
      </ResponsiveModal>}

      {/* Avaliacao de OS — OSRatingSurvey (mesmo componente do link publico) */}
      {ratingOsId && ratingData && (
        <OSRatingSurvey
          osId={ratingOsId}
          rating={ratingData.rating}
          npsConfig={ratingData.npsConfig}
          criteria={ratingData.npsCriteria}
          open={ratingOpen}
          onOpenChange={(v) => {
            setRatingOpen(v);
            if (!v) setRatingOsId(null);
          }}
          onRated={() => {
            if (ratingOsId) handleRated(ratingOsId);
          }}
        />
      )}

      {/* Spacer para o rodape nao cobrir o ultimo card */}
      <div className="h-4" />

      {/* Viewer de imagem de anexo (nunca abre em nova aba) */}
      {previewImage && (
        <ImagePreviewModal
          src={previewImage.src}
          alt={previewImage.alt}
          open={!!previewImage}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </PublicPortalShell>
  );
}
