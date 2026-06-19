import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  ClipboardList, 
  MapPin, 
  Clock, 
  User, 
  Phone,
  Play,
  ClipboardCheck,
  PenTool,
  CheckCircle2,
  ArrowLeft,
  Calendar,
  Building2,
  Eye,
  Loader2,
  Navigation,
  Camera,
  Link2,
  Check,
  MapPinned,
  Wrench,
  ShieldCheck,
  Pause,
  Lock,
  Map as MapIcon,
  Maximize2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { SignedImg } from '@/components/ui/SignedImg';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { supabaseAnon } from '@/integrations/supabase/anonClient';
import { trackUsage } from '@/lib/trackUsage';
import { DynamicFormQuestions, type FormValidationResult } from '@/components/technician/DynamicFormQuestions';
import { SignaturePad } from '@/components/SignaturePad';
import { useGeoTracking, recordLocationEvent } from '@/hooks/useTechnicianLocations';
import { OSReport } from '@/components/technician/OSReport';
import { OSRatingSurvey } from '@/components/technician/OSRatingSurvey';
import { RateServiceAffordance } from '@/components/technician/RateServiceAffordance';
import type { PublicOsRating, PublicNpsConfig, PublicNpsCriterion } from '@/hooks/useServiceRatings';
import { useIsPmocOrder } from '@/hooks/useIsPmocOrder';
import { useOsActivityChecklist } from '@/hooks/useOsActivityChecklist';
import { VisitChecklistPanel } from '@/components/technician/VisitChecklistPanel';
import { PmocComplianceBadge } from '@/components/pmoc/PmocComplianceBadge';
import type { ServiceOrder, OsStatus } from '@/types/database';
import { PublicTrackingMap } from '@/components/schedule/PublicTrackingMap';
import { RouteToCustomerMap } from '@/components/schedule/RouteToCustomerMap';
import { buildWazeUrl, buildGoogleMapsDirectionsUrl, buildCustomerAddress, haversineDistance, resolveOsDestination } from '@/utils/geolocation';
import { osStatusLabels, osTypeLabels, getOsTypeLabel } from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { buildServiceOrderShareLink } from '@/utils/shareLinks';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { getErrorMessage } from '@/utils/errorMessages';
import { SpeedDialFAB, type SpeedDialAction } from '@/components/mobile/SpeedDialFAB';
import TechnicianTools from '@/pages/TechnicianTools';
import { Calculator } from 'lucide-react';
import { useCompanySettings } from '@/hooks/useCompanySettings';

interface OSPhoto {
  id: string;
  photo_url: string;
  photo_type: string;
  description: string | null;
  created_at: string;
}

interface EquipmentItem {
  equipment_id: string | null;
  form_template_id: string | null;
  equipment: { id: string; name: string; brand: string | null; model: string | null; location: string | null; photo_url: string | null; category: { id: string; name: string; color: string } | null } | null;
  form_template: { id: string; name: string } | null;
}

export default function TechnicianOS() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const forceReadOnly = searchParams.get('modo') === 'cliente';
  // No modo cliente usamos cliente anônimo para que a RLS avalie como `anon`,
  // mesmo que haja sessão de outro usuário/empresa persistida no navegador.
  const db = forceReadOnly ? supabaseAnon : supabase;
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [serviceOrder, setServiceOrder] = useState<(ServiceOrder & { customer: any; equipment: any; form_template?: any }) | null>(null);
  const [rating, setRating] = useState<PublicOsRating | null>(null);
  // Config de NPS + flag de habilitação vindas de get_public_os (modo cliente).
  const [surveyEnabled, setSurveyEnabled] = useState(false);
  const [npsConfig, setNpsConfig] = useState<PublicNpsConfig | null>(null);
  // Critérios de estrela dinâmicos (ativos da empresa) vindos de get_public_os.
  const [npsCriteria, setNpsCriteria] = useState<PublicNpsCriterion[]>([]);
  // Contrato da OS no modo público (vem de get_public_os). No modo autenticado
  // o `useIsPmocOrder` resolve isso; no anônimo a RLS bloqueia o hook, então
  // derivamos o selo PMOC daqui: { id, name, is_pmoc, pmoc_legal_compliance_text }.
  const [publicContract, setPublicContract] = useState<
    { id: string; name: string; is_pmoc?: boolean | null; pmoc_legal_compliance_text?: string | null } | null
  >(null);
  // Estado CONTROLADO do drawer de avaliação (a página detém o open pra poder
  // reabrir via affordance). `ratingSurveyOpen` começa null = "ainda não
  // decidido"; resolvido na 1ª render do bloco concluída pra abrir sozinho
  // quando aplicável sem reabrir após o cliente fechar.
  const [ratingSurveyOpen, setRatingSurveyOpen] = useState<boolean | null>(null);
  // Vira true quando o cliente envia (ou já tinha avaliado): esconde affordance.
  const [ratingDone, setRatingDone] = useState(false);
  const [photos, setPhotos] = useState<OSPhoto[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [equipmentItems, setEquipmentItems] = useState<EquipmentItem[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [publicFormResponses, setPublicFormResponses] = useState<any[]>([]);
  const [technicianProfile, setTechnicianProfile] = useState<{ full_name: string; avatar_url: string | null } | null>(null);

  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);
  const [checkInLocation, setCheckInLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [checkOutLocation, setCheckOutLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [trackingLinkCopied, setTrackingLinkCopied] = useState(false);
  
  const [formValidations, setFormValidations] = useState<Record<string, FormValidationResult>>({});
  
  const allFormsValid = Object.values(formValidations).every(v => v.isValid);
  const allMissingQuestions = Object.values(formValidations).flatMap(v => v.missingQuestions);
  
  const [techSignature, setTechSignature] = useState<string | null>(null);
  const [clientSignature, setClientSignature] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  // Onda D v1.9.x — classificação de conformidade PMOC.
  // Só aparece quando a OS é PMOC (`useIsPmocOrder`). Notas são obrigatórias
  // se status é 'parcial' ou 'nao_conforme'.
  const { isPmoc: isPmocOrder } = useIsPmocOrder(id);
  // Checklist da visita (snapshot do plano PMOC/manutenção). Só preenche quando
  // a OS foi gerada por contrato com plano; OS avulsa volta vazia (RLS anon
  // também devolve vazio no modo cliente → painel não aparece).
  const {
    groups: checklistGroups,
    hasActivities: hasChecklist,
    saveActivity: saveChecklistActivity,
    rollup: checklistRollup,
  } = useOsActivityChecklist(isAuthenticated === true ? id : undefined);
  type PmocConformity = 'conforme' | 'parcial' | 'nao_conforme';
  const [conformityStatus, setConformityStatus] = useState<PmocConformity | ''>('');
  const [conformityNotes, setConformityNotes] = useState<string>('');
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  // Origem (posição atual do técnico) pro mapa de rota até o cliente no a_caminho.
  // null = ainda não resolvida ou GPS indisponível (mapa degrada, botões seguem).
  const [techOrigin, setTechOrigin] = useState<{ lat: number; lng: number } | null>(null);
  // Throttle do techOrigin ao vivo: guarda a última origem usada e quando ela foi
  // aplicada, pra só recomputar a rota OSRM quando o técnico se moveu de verdade.
  const lastOriginRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastOriginAtRef = useRef<number>(0);

  // Overlay fullscreen das Ferramentas do Técnico (atalho a partir do FAB).
  // A tela de OS NÃO desmonta: ao fechar, o técnico volta exatamente onde estava.
  const [toolsOpen, setToolsOpen] = useState(false);
  const [routeFullscreen, setRouteFullscreen] = useState(false);
  // Copia o link público de acompanhamento e mostra toast (link gerado já copia no ato).
  const handleCopyTrackingLink = async () => {
    if (!id) return;
    try {
      const link = buildServiceOrderShareLink(id);
      await navigator.clipboard.writeText(link);
      setTrackingLinkCopied(true);
      toast({ title: 'Link copiado!' });
      setTimeout(() => setTrackingLinkCopied(false), 2000);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Não foi possível copiar o link', description: getErrorMessage(error) });
    }
  };
  // Fecha o mapa em tela cheia com Esc.
  useEffect(() => {
    if (!routeFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRouteFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [routeFullscreen]);
  // "Ferramentas do Técnico" é exclusiva do segmento Refrigeração e Climatização.
  // Enquanto settings carrega (undefined/null), showTools é false → atalho oculto.
  const { settings } = useCompanySettings();
  const showTools = settings?.segment === 'refrigeracao';
  const speedDialActions: SpeedDialAction[] = [
    {
      icon: Link2,
      label: 'Copiar o link público da OS (cliente)',
      onClick: handleCopyTrackingLink,
    },
    ...(showTools
      ? [{
          icon: Calculator,
          label: 'Ferramentas do Técnico',
          onClick: () => setToolsOpen(true),
        } as SpeedDialAction]
      : []),
  ];

  // Helper to safely extract joined object (Supabase may return array for some joins)
  const unwrapJoin = (val: any) => Array.isArray(val) ? val[0] || null : val;

  // Check if user is authenticated
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setIsAuthenticated(forceReadOnly ? false : !!data.user);
    });
  }, [forceReadOnly]);

  const fetchFormResponses = async () => {
    if (!id) return;
    const { data } = await db
      .from('form_responses')
      .select('id, question_id, response_value, response_photo_url, equipment_id, question:form_questions(id, question, question_type, options, description, position, template_id)')
      .eq('service_order_id', id);
    if (data) {
      // Normalize: unwrap question join (may be array in some PostgREST versions)
      const normalized = (data as any[]).map(r => ({
        ...r,
        question: unwrapJoin(r.question),
      }));
      setPublicFormResponses(normalized);
    }
  };

  const fetchTechnicianProfile = useCallback(async () => {
    if (!id) return;
    // Try technician_id first, then fall back to first assignee
    const { data: so } = await db.from('service_orders').select('technician_id').eq('id', id).maybeSingle();
    let userId = (so as any)?.technician_id;
    if (!userId) {
      const { data: assignees } = await db
        .from('service_order_assignees')
        .select('user_id')
        .eq('service_order_id', id)
        .limit(1);
      userId = (assignees as any)?.[0]?.user_id;
    }
    if (userId) {
      const { data: profile } = await db.from('profiles').select('full_name, avatar_url').eq('user_id', userId).maybeSingle();
      if (profile) setTechnicianProfile(profile);
    }
  }, [id]);
  const fetchEquipmentItems = async () => {
    try {
      const { data, error } = await db
        .from('service_order_equipment')
        .select(`
          equipment_id,
          form_template_id,
          equipment:equipment(id, name, brand, model, location, photo_url, category:equipment_categories(id, name, color)),
          form_template:form_templates(id, name)
        `)
        .eq('service_order_id', id);
      
      if (error) throw error;
      setEquipmentItems((data || []) as unknown as EquipmentItem[]);
    } catch (error) {
      console.error('Error fetching equipment items:', error);
    }
  };

  // Aplica o branding white-label (estado + cor primária via CSS var).
  // SEMPRE reseta antes — não permite vazar nome/logo/cor entre OSes/empresas
  // (regra-lei #2 — white-label não vaza entre tenants).
  const applyCompany = useCallback((data: any | null) => {
    setCompany(null);
    if (!data) return;

    setCompany(data);

    // Apply white label primary color to CSS custom property for this page
    if (data.white_label_enabled && data.white_label_primary_color) {
      const hex = data.white_label_primary_color;
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (result) {
        let r = parseInt(result[1], 16) / 255;
        let g = parseInt(result[2], 16) / 255;
        let b = parseInt(result[3], 16) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;
        if (max !== min) {
          const d2 = max - min;
          s = l > 0.5 ? d2 / (2 - max - min) : d2 / (max + min);
          switch (max) {
            case r: h = ((g - b) / d2 + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d2 + 2) / 6; break;
            case b: h = ((r - g) / d2 + 4) / 6; break;
          }
        }
        const hsl = `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
        document.documentElement.style.setProperty('--primary', hsl);
        document.documentElement.style.setProperty('--ring', hsl);
      }
    }
  }, []);

  const fetchCompany = useCallback(async (companyId?: string | null) => {
    const resolvedCompanyId = companyId || null;
    if (!resolvedCompanyId) {
      applyCompany(null);
      return;
    }

    const { data } = await db
      .from('company_settings')
      .select('*')
      .eq('company_id', resolvedCompanyId)
      .maybeSingle();

    applyCompany(data || null);
  }, [applyCompany, db]);

  // MODO CLIENTE (anon): toda a leitura passa por UMA RPC SECURITY DEFINER
  // (`get_public_os`) que recebe só o id e devolve aquela OS. Substitui as
  // leituras anon diretas que enumeravam todas as OSs de todas as empresas.
  const fetchPublicOS = useCallback(async (opts?: { isPoll?: boolean }): Promise<void> => {
    if (!id) return;
    try {
      const { data, error } = await supabaseAnon.rpc('get_public_os', { p_os_id: id });
      if (error) throw error;
      if (!data) {
        setServiceOrder(null);
        return;
      }
      const payload = data as any;

      // service_order + joins que a página lê direto do objeto
      const so = {
        ...payload.service_order,
        customer: payload.customer || null,
        equipment: payload.equipment || null,
        form_template: payload.form_template || null,
        service_type: payload.service_type || null,
      };
      setServiceOrder(so as any);
      // Contrato (pra selo de conformidade PMOC no modo público). Backend
      // adiciona is_pmoc + pmoc_legal_compliance_text ao objeto contract.
      // `payload` já é `any`, então o acesso não introduz novo cast.
      setPublicContract(payload.contract || null);
      setCheckInTime(so.check_in_time ?? null);
      setCheckOutTime(so.check_out_time ?? null);
      setCheckInLocation((so.check_in_location as any) ?? null);
      setCheckOutLocation((so.check_out_location as any) ?? null);
      const existingPmocStatus = so.pmoc_conformity_status as
        | 'conforme' | 'parcial' | 'nao_conforme' | null | undefined;
      if (existingPmocStatus) setConformityStatus(existingPmocStatus);
      const existingPmocNotes = so.pmoc_conformity_notes as string | null | undefined;
      if (existingPmocNotes) setConformityNotes(existingPmocNotes);

      // photos (os_photos.*) já ordenadas por created_at asc no servidor
      setPhotos((payload.photos || []) as OSPhoto[]);

      // equipment_items (service_order_equipment + joins)
      setEquipmentItems((payload.equipment_items || []) as unknown as EquipmentItem[]);

      // form_responses + question join (espelha o select da página)
      setPublicFormResponses(payload.form_responses || []);

      // technician profile (full_name, avatar_url)
      setTechnicianProfile(payload.technician || null);

      // rating (NPS/estrelas) — shape SEM token; usado no bloco "carona" de
      // avaliação que aparece no modo cliente quando a OS está concluída.
      setRating((payload.rating as PublicOsRating | null) || null);

      // survey_enabled + nps_config (pergunta/estrelas) — controlam o bloco de
      // avaliação no modo cliente. get_public_os sempre devolve defaults.
      setSurveyEnabled(payload.survey_enabled === true);
      setNpsConfig((payload.nps_config as PublicNpsConfig | null) || null);
      setNpsCriteria((payload.nps_criteria as PublicNpsCriterion[] | null) || []);

      // company white-label — só na carga inicial (o reset interno causaria
      // flicker do logo a cada poll; o branding não muda durante a OS).
      if (!opts?.isPoll) applyCompany(payload.company_settings || null);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar OS',
        description: getErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  }, [id, toast, applyCompany]);

  const fetchServiceOrder = useCallback(async () => {
    try {
      const { data, error } = await db
        .from('service_orders')
        .select(`
          *,
          customer:customers(id, name, phone, address, city, state, document, photo_url, latitude, longitude),
          equipment:equipment(id, name, brand, model, serial_number, location, capacity),
          form_template:form_templates(id, name),
          service_type:service_types(id, name, color)
        `)
        .eq('id', id)
        .maybeSingle();

      // PGRST116 with "0 rows" leaks through some supabase-js versions despite
      // .maybeSingle() — treat it as a clean not-found, never as a UI error.
      if (error && error.code !== 'PGRST116') throw error;
      if (!data) {
        setServiceOrder(null);
        return;
      }

      setServiceOrder(data as any);
      setCheckInTime(data.check_in_time);
      setCheckOutTime(data.check_out_time);
      setCheckInLocation(data.check_in_location as any);
      setCheckOutLocation(data.check_out_location as any);
      // Onda D v1.9.x — hidrata classificação PMOC se já existir (re-abertura
      // da tela após salvar offline e antes de finalizar)
      const existingPmocStatus = (data as any)?.pmoc_conformity_status as
        | 'conforme'
        | 'parcial'
        | 'nao_conforme'
        | null
        | undefined;
      if (existingPmocStatus) setConformityStatus(existingPmocStatus);
      const existingPmocNotes = (data as any)?.pmoc_conformity_notes as string | null | undefined;
      if (existingPmocNotes) setConformityNotes(existingPmocNotes);
      await fetchCompany((data as any).company_id);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar OS',
        description: getErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  }, [id, toast, fetchCompany]);

  useEffect(() => {
    // Espera a resolução do estado de auth pra escolher o caminho de leitura.
    if (!id || isAuthenticated === null) return;
    if (isAuthenticated === false) {
      // Modo cliente/público (anon): UMA RPC SECURITY DEFINER carrega tudo.
      fetchPublicOS();
    } else {
      // Modo autenticado (técnico): leituras diretas, como antes.
      fetchServiceOrder();
      fetchPhotos();
      fetchEquipmentItems();
      fetchFormResponses();
      fetchTechnicianProfile();
    }
    return () => {
      document.documentElement.style.removeProperty('--primary');
      document.documentElement.style.removeProperty('--ring');
    };
  }, [id, isAuthenticated, fetchPublicOS, fetchServiceOrder, fetchTechnicianProfile]);

  // Modo cliente (anon): sem realtime (as policies anon caem). Atualização "ao
  // vivo" via polling leve da RPC a cada ~20s, só enquanto a aba está visível.
  useEffect(() => {
    if (!id || isAuthenticated !== false) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') fetchPublicOS({ isPoll: true });
      }, 20000);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchPublicOS({ isPoll: true }); // refresh imediato ao voltar pra aba
        start();
      } else {
        stop();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [id, isAuthenticated, fetchPublicOS]);

  // Modo autenticado: realtime nativo (técnico logado lê as tabelas direto).
  useEffect(() => {
    if (!id || isAuthenticated !== true) return;

    const channel = db
      .channel(`os-realtime-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_orders', filter: `id=eq.${id}` },
        () => { fetchServiceOrder(); fetchTechnicianProfile(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'form_responses', filter: `service_order_id=eq.${id}` },
        () => { fetchFormResponses(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'os_photos', filter: `service_order_id=eq.${id}` },
        () => { fetchPhotos(); }
      )
      .subscribe();

    return () => { db.removeChannel(channel); };
  }, [id, isAuthenticated, fetchServiceOrder, fetchTechnicianProfile]);

  // Reflete o rollup de conformidade do checklist da visita na OS em tempo real,
  // conforme o técnico marca conforme/não-conforme. Idempotente: só grava quando
  // o rollup difere do que já está em service_orders.pmoc_conformity_status.
  // Não roda se a OS já foi concluída (status final não se reabre por aqui).
  useEffect(() => {
    if (isAuthenticated !== true || !id || !hasChecklist || !checklistRollup) return;
    if (serviceOrder?.status === 'concluida' || serviceOrder?.status === 'cancelada') return;
    if ((serviceOrder as any)?.pmoc_conformity_status === checklistRollup) return;
    supabase
      .from('service_orders')
      .update({ pmoc_conformity_status: checklistRollup })
      .eq('id', id)
      .then(({ error }) => {
        if (!error) {
          setServiceOrder((prev) =>
            prev ? ({ ...prev, pmoc_conformity_status: checklistRollup } as any) : prev
          );
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAuthenticated, hasChecklist, checklistRollup, serviceOrder?.status, (serviceOrder as any)?.pmoc_conformity_status]);

  const fetchPhotos = async () => {
    try {
      const { data, error } = await db
        .from('os_photos')
        .select('*')
        .eq('service_order_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setPhotos(data || []);
    } catch (error: any) {
      console.error('Error fetching photos:', error);
    }
  };

  const getCurrentLocation = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Seu navegador não suporta geolocalização. Use um navegador atualizado.'));
        return;
      }

      const successHandler = (position: GeolocationPosition) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      };

      const buildMessage = (code: number, isFallback: boolean): string => {
        switch (code) {
          case 1 /* PERMISSION_DENIED */:
            return 'Você precisa permitir o acesso à localização para registrar o serviço. Abra as configurações do navegador, libere a localização para este site e tente novamente.';
          case 2 /* POSITION_UNAVAILABLE */:
            return isFallback
              ? 'Não conseguimos obter sua localização nem pelo GPS, nem pelas redes próximas. Verifique se o GPS do aparelho está ligado, se você tem sinal de internet, e tente sair pra um local mais aberto.'
              : 'Não conseguimos obter sua localização agora. Verifique se o GPS do aparelho está ligado e se você tem sinal.';
          case 3 /* TIMEOUT */:
            return isFallback
              ? 'A localização demorou demais pra responder, mesmo tentando GPS e redes próximas. Tente sair pra um local mais aberto e finalize a OS daqui a alguns segundos.'
              : 'A localização demorou demais para responder. Tente de novo daqui a alguns segundos.';
          default:
            return 'Não foi possível obter sua localização. Verifique permissão e GPS, e tente novamente.';
        }
      };

      // Tentativa 1: GPS preciso, sem cache
      navigator.geolocation.getCurrentPosition(
        successHandler,
        (errorHighAccuracy: GeolocationPositionError) => {
          // Fail-fast: permissão negada nunca melhora com retry
          if (errorHighAccuracy.code === errorHighAccuracy.PERMISSION_DENIED) {
            reject(new Error(buildMessage(errorHighAccuracy.code, false)));
            return;
          }

          // Tentativa 2: low accuracy (cell tower / wifi) com cache de 60s
          navigator.geolocation.getCurrentPosition(
            successHandler,
            (errorLowAccuracy: GeolocationPositionError) => {
              // Se a 2ª tentativa também falhou, usa o código da 2ª tentativa
              // (mais informativo — TIMEOUT no fallback significa que nem GPS
              // nem rede deram conta no tempo combinado).
              reject(new Error(buildMessage(errorLowAccuracy.code, true)));
            },
            { enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 }
          );
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  };

  // Periodic geo tracking while OS is em_andamento or a_caminho
  const isTracking = (serviceOrder?.status === 'em_andamento' || serviceOrder?.status === 'a_caminho' || serviceOrder?.status === 'pausada') && isAuthenticated === true;

  // Status atual em ref pra o callback de posição (estável) saber se ainda estamos
  // em "a_caminho" sem virar dependência que re-subscreve o watcher.
  const aCaminhoRef = useRef(false);
  aCaminhoRef.current = serviceOrder?.status === 'a_caminho';

  // A cada tick do GPS (reusa o MESMO watchPosition do tracking), atualiza a origem
  // da rota só quando o técnico andou ~50m OU passaram >=15s desde a última origem.
  // Esse throttle é o que evita recomputar a rota OSRM a cada leitura do GPS.
  const MIN_MOVE_KM = 0.05; // ~50 metros
  const MIN_INTERVAL_MS = 15_000; // 15 segundos
  const handleLivePosition = useCallback((lat: number, lng: number) => {
    if (!aCaminhoRef.current) return;
    const now = Date.now();
    const last = lastOriginRef.current;
    if (last) {
      const movedKm = haversineDistance(last.lat, last.lng, lat, lng);
      if (movedKm < MIN_MOVE_KM && now - lastOriginAtRef.current < MIN_INTERVAL_MS) {
        return; // não mexeu o suficiente nem passou tempo bastante
      }
    }
    lastOriginRef.current = { lat, lng };
    lastOriginAtRef.current = now;
    setTechOrigin({ lat, lng });
  }, []);

  // Reusa o watcher de tracking pra alimentar a origem ao vivo (sem 2º GPS watch).
  useGeoTracking(id, isTracking, handleLivePosition);

  // Seed inicial da origem ao entrar em "a_caminho" (o watchPosition do tracking
  // pode levar alguns segundos pro 1º tick). Falha de GPS/permissão não bloqueia:
  // o mapa degrada e os botões de navegação seguem funcionando por endereço.
  // Ao SAIR do a_caminho, zera a origem e o estado de throttle.
  useEffect(() => {
    if (serviceOrder?.status !== 'a_caminho' || isAuthenticated !== true) {
      lastOriginRef.current = null;
      lastOriginAtRef.current = 0;
      setTechOrigin(null);
      return;
    }
    let cancelled = false;
    getCurrentLocation()
      .then((loc) => {
        if (cancelled) return;
        // Só semeia se o watcher ao vivo ainda não tiver dado o 1º tick.
        if (!lastOriginRef.current) {
          lastOriginRef.current = loc;
          lastOriginAtRef.current = Date.now();
          setTechOrigin(loc);
        }
      })
      .catch(() => { /* GPS negado/indisponível: mapa some, sem flood de toast */ });
    return () => { cancelled = true; };
    // getCurrentLocation é estável (sem deps externas relevantes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceOrder?.status, isAuthenticated]);

  const handleCheckIn = async () => {
    try {
      const location = await getCurrentLocation();
      const now = new Date().toISOString();
      
      const { error } = await supabase
        .from('service_orders')
        .update({
          check_in_time: now,
          check_in_location: location,
          status: 'em_andamento',
        })
        .eq('id', id);

      if (error) throw error;

      if (id) {
        recordLocationEvent(id, location.lat, location.lng, 'check_in');
      }

      setCheckInTime(now);
      setCheckInLocation(location);
      setServiceOrder((prev) => prev ? { ...prev, status: 'em_andamento' as OsStatus, check_in_time: now } : null);
      
      toast({ title: 'Check-in realizado com sucesso!' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro no check-in',
        description: getErrorMessage(error),
      });
    }
  };

  const handleFinishOS = async () => {
    if (!allFormsValid) {
      toast({
        variant: 'destructive',
        title: 'Campos obrigatórios pendentes',
        description: `Preencha os campos: ${allMissingQuestions.slice(0, 3).join(', ')}${allMissingQuestions.length > 3 ? '...' : ''}`,
      });
      return;
    }

    if ((serviceOrder as any)?.require_tech_signature && !techSignature) {
      toast({ variant: 'destructive', title: 'Assinatura do técnico obrigatória' });
      return;
    }
    if ((serviceOrder as any)?.require_client_signature && !clientSignature) {
      toast({ variant: 'destructive', title: 'Assinatura do cliente obrigatória' });
      return;
    }

    // Onda D v1.9.x — validação de conformidade PMOC
    if (isPmocOrder) {
      if (!conformityStatus) {
        toast({
          variant: 'destructive',
          title: 'Classificação PMOC obrigatória',
          description: 'Selecione conforme, parcial ou não-conforme antes de finalizar.',
        });
        return;
      }
      if ((conformityStatus === 'parcial' || conformityStatus === 'nao_conforme') && !conformityNotes.trim()) {
        toast({
          variant: 'destructive',
          title: 'Notas obrigatórias',
          description: 'Descreva o que foi observado para classificação parcial ou não-conforme.',
        });
        return;
      }
    }

    setFinishing(true);
    try {
      const location = await getCurrentLocation();
      const now = new Date().toISOString();

      const updateData: any = {
        check_out_time: now,
        check_out_location: location,
        status: 'concluida',
      };
      if (techSignature) updateData.tech_signature = techSignature;
      if (clientSignature) updateData.client_signature = clientSignature;

      // Onda D v1.9.x — persiste classificação de conformidade PMOC.
      // Colunas service_orders.pmoc_conformity_status / pmoc_conformity_notes
      // são adicionadas pela migration da Onda D; updateData é any, então
      // não precisa de @ts-expect-error aqui.
      if (isPmocOrder && conformityStatus) {
        updateData.pmoc_conformity_status = conformityStatus;
        updateData.pmoc_conformity_notes = conformityNotes.trim() || null;
      }

      // Rollup automático do checklist da visita: se a OS carrega atividades do
      // plano e o técnico não classificou manualmente, deriva o status de
      // conformidade da OS a partir das respostas (não-conforme se alguma
      // atividade for não-conforme; conforme se todas conformes; senão parcial).
      if (hasChecklist && checklistRollup && !updateData.pmoc_conformity_status) {
        updateData.pmoc_conformity_status = checklistRollup;
      }

      const { error } = await supabase
        .from('service_orders')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      // Instrumentação MVP — fire-and-forget, não bloqueia UX
      trackUsage('os_completion', { os_id: id });

      if (id) {
        const { error: ratingError } = await supabase
          .from('service_ratings')
          .insert({ service_order_id: id })
          .select('id')
          .maybeSingle();

        if (ratingError && ratingError.code !== '23505') {
          throw ratingError;
        }
      }

      if (id) {
        recordLocationEvent(id, location.lat, location.lng, 'check_out');
      }

      setCheckOutTime(now);
      setCheckOutLocation(location);
      setServiceOrder((prev) => prev ? { ...prev, status: 'concluida' as OsStatus, check_out_time: now } : null);
      
      toast({ title: 'OS finalizada com sucesso!' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao finalizar OS',
        description: getErrorMessage(error),
      });
    } finally {
      setFinishing(false);
    }
  };

  // Selo de conformidade PMOC (Lei Federal 13.589/2018). No modo cliente (anon)
  // o hook `useIsPmocOrder` não passa na RLS, então derivamos do payload público.
  const isPublicMode = forceReadOnly;
  const isPmocPublic = publicContract?.is_pmoc === true;
  const showPmocSeal = isPublicMode ? isPmocPublic : isPmocOrder;

  if (loading || isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!serviceOrder) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">OS não encontrada</h2>
            <p className="text-muted-foreground">Verifique o link e tente novamente.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusBadgeVariant: Record<OsStatus, 'warning' | 'info' | 'success' | 'destructive'> = {
    agendada: 'info',
    pendente: 'warning',
    a_caminho: 'info',
    em_andamento: 'info',
    pausada: 'warning',
    concluida: 'success',
    cancelada: 'destructive',
  };

  // Show report mode for completed OS
  if (serviceOrder.status === 'concluida') {
    return (
      <div className="min-h-screen bg-background">
        <div className="z-10 bg-primary text-primary-foreground p-3 sm:p-4 shadow-lg print:hidden">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-base sm:text-lg font-bold truncate">OS #{String(serviceOrder.order_number).padStart(6, '0')}</h1>
              <p className="text-xs sm:text-sm opacity-90">Relatório de Serviço</p>
            </div>
            <Badge variant={statusBadgeVariant[serviceOrder.status]}>
              {osStatusLabels[serviceOrder.status]}
            </Badge>
          </div>
        </div>
        <div
          className="max-w-2xl mx-auto p-3 sm:p-4 space-y-4"
          // Folga inferior pro rodapé fixo (mobile) / FAB (desktop) de avaliar
          // não cobrir o fim do relatório quando o affordance está visível.
          style={
            !ratingDone && rating && !rating.already_rated
              ? { paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }
              : undefined
          }
        >
          {showPmocSeal && (
            <PmocComplianceBadge variant="ribbon" withTooltip />
          )}
          {/* Carona da avaliação: só no modo cliente, OS concluída e com a
              pesquisa habilitada pela empresa (survey_enabled). Ainda sem
              avaliação → formulário; já avaliada → aviso enxuto de sucesso.
              Estado do drawer controlado aqui pra o affordance reabrir. */}
          {forceReadOnly && id && rating && rating.is_concluded && surveyEnabled && (
            <>
              <OSRatingSurvey
                osId={id}
                rating={rating}
                npsConfig={npsConfig}
                criteria={npsCriteria}
                // 1ª render: abre sozinho quando ainda não avaliado.
                open={ratingSurveyOpen ?? rating.already_rated !== true}
                onOpenChange={setRatingSurveyOpen}
                onRated={() => {
                  setRatingDone(true);
                  setRatingSurveyOpen(false);
                }}
              />
              {/* Affordance de reabrir: só quando há avaliação pendente E o
                  drawer está fechado. Some se já avaliado ou drawer aberto. */}
              {!ratingDone &&
                !rating.already_rated &&
                ratingSurveyOpen === false && (
                  <RateServiceAffordance onClick={() => setRatingSurveyOpen(true)} />
                )}
            </>
          )}
          <OSReport serviceOrder={serviceOrder} photos={photos} forceReadOnly={forceReadOnly} />
          {isPublicMode && isPmocPublic && (
            <PmocComplianceBadge variant="footer" className="pt-2" />
          )}
        </div>
      </div>
    );
  }

  // PUBLIC READ-ONLY MODE for non-authenticated users
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-primary text-primary-foreground">
          <div className="max-w-2xl mx-auto p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {company?.logo_url ? (
                    <img src={company.logo_url} alt="Logo" className="h-10 w-10 sm:h-12 sm:w-12 rounded object-contain bg-white p-1 shrink-0" />
                  ) : (
                    <Building2 className="h-5 w-5 opacity-70 shrink-0" />
                  )}
                  <span className="text-sm opacity-80 truncate">{company?.name || ''}</span>
                </div>
              </div>
              <Badge variant={statusBadgeVariant[serviceOrder.status]} className="shrink-0">
                {osStatusLabels[serviceOrder.status]}
              </Badge>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-1">
              <div>
                <h1 className="text-lg sm:text-xl font-bold">OS #{String(serviceOrder.order_number).padStart(6, '0')}</h1>
                <p className="text-xs sm:text-sm opacity-80">{getOsTypeLabel(serviceOrder)}</p>
              </div>
              {serviceOrder.scheduled_date && (
                <div className="flex items-center gap-1.5 text-xs sm:text-sm opacity-80">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {format(new Date(serviceOrder.scheduled_date + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                    {serviceOrder.scheduled_time && ` ${String(serviceOrder.scheduled_time).slice(0, 5)}`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
          {showPmocSeal && (
            <PmocComplianceBadge variant="ribbon" withTooltip />
          )}
          {/* Realtime indicator */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <Eye className="h-4 w-4 text-primary shrink-0" />
            <span>Acompanhamento em tempo real</span>
            <span className="relative flex h-2 w-2 ml-auto">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
          </div>

          {/* Technician info - show from a_caminho onwards */}
          {technicianProfile && (serviceOrder.status === 'a_caminho' || serviceOrder.status === 'em_andamento') && (
            <div className="flex items-center gap-3 text-sm bg-muted/50 rounded-lg px-3 py-2">
              {technicianProfile.avatar_url ? (
                <SignedImg
                  src={technicianProfile.avatar_url}
                  alt={technicianProfile.full_name}
                  className="h-10 w-10 rounded-full object-cover border cursor-pointer"
                  onClick={() => setPreviewPhoto(technicianProfile.avatar_url)}
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Técnico responsável</p>
                <p className="font-medium text-foreground">{technicianProfile.full_name}</p>
              </div>
            </div>
          )}

          {/* Check-in / Check-out with technician info */}
          {(checkInTime || checkOutTime) && (
            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Execução</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {checkInTime && (
                    <div className="flex items-start gap-3">
                      {technicianProfile?.avatar_url ? (
                        <SignedImg
                          src={technicianProfile.avatar_url}
                          alt={technicianProfile.full_name}
                          className="w-10 h-10 rounded-full object-cover border shrink-0 mt-0.5 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setPreviewPhoto(technicianProfile.avatar_url)}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-muted-foreground font-semibold">CHECK-IN</p>
                        {technicianProfile && (
                          <p className="text-sm font-semibold text-foreground">{technicianProfile.full_name}</p>
                        )}
                        <p className="text-sm font-medium text-foreground">
                          {format(new Date(checkInTime), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                        {checkInLocation && (
                          <p className="text-xs text-muted-foreground flex items-center gap-0.5 mt-0.5">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="break-all">{checkInLocation.lat.toFixed(6)}, {checkInLocation.lng.toFixed(6)}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {checkOutTime && (
                    <div className="flex items-start gap-3">
                      {technicianProfile?.avatar_url ? (
                        <SignedImg
                          src={technicianProfile.avatar_url}
                          alt={technicianProfile.full_name}
                          className="w-10 h-10 rounded-full object-cover border shrink-0 mt-0.5 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setPreviewPhoto(technicianProfile.avatar_url)}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-muted-foreground font-semibold">CHECK-OUT</p>
                        {technicianProfile && (
                          <p className="text-sm font-semibold text-foreground">{technicianProfile.full_name}</p>
                        )}
                        <p className="text-sm font-medium text-foreground">
                          {format(new Date(checkOutTime), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                        {checkOutLocation && (
                          <p className="text-xs text-muted-foreground flex items-center gap-0.5 mt-0.5">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="break-all">{checkOutLocation.lat.toFixed(6)}, {checkOutLocation.lng.toFixed(6)}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {checkInTime && checkOutTime && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      <strong>Duração:</strong>{' '}
                      {(() => {
                        const diff = new Date(checkOutTime).getTime() - new Date(checkInTime).getTime();
                        const hours = Math.floor(diff / 3600000);
                        const minutes = Math.floor((diff % 3600000) / 60000);
                        return `${hours}h ${minutes}min`;
                      })()}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Client Info with photo */}
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cliente</span>
              </div>
              <div className="flex items-start gap-3">
                {serviceOrder.customer?.photo_url && (
                  <SignedImg
                    src={serviceOrder.customer.photo_url}
                    alt={serviceOrder.customer.name}
                    className="h-12 w-12 rounded-full object-cover border cursor-pointer shrink-0"
                    onClick={() => setPreviewPhoto(serviceOrder.customer.photo_url)}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold break-words">{serviceOrder.customer?.name}</p>
                  {serviceOrder.customer?.phone && (
                    <p className="text-sm text-muted-foreground mt-0.5">{serviceOrder.customer.phone}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Description hidden from public view - only visible to technician */}

          {/* Equipment list - read only (dedupe by equipment_id; same equip may appear in N rows with diff templates) */}
          {(() => {
            const uniqueEquipmentItems: EquipmentItem[] = [];
            const seenEqIds = new Set<string>();
            for (const item of equipmentItems) {
              if (!item.equipment_id || !item.equipment) continue;
              if (seenEqIds.has(item.equipment_id)) continue;
              seenEqIds.add(item.equipment_id);
              uniqueEquipmentItems.push(item);
            }
            if (uniqueEquipmentItems.length === 0) return null;
            return (
              <Card>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Wrench className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Equipamento{uniqueEquipmentItems.length > 1 ? 's' : ''}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{uniqueEquipmentItems.length}</span>
                  </div>
                  {uniqueEquipmentItems.length > 3 ? (
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="equipments" className="border-0">
                        <AccordionTrigger className="hover:no-underline py-2 text-sm text-primary">
                          Ver {uniqueEquipmentItems.length} equipamentos
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3">
                            {uniqueEquipmentItems.map(item => item.equipment && (
                              <div key={item.equipment_id} className="flex items-start gap-3 text-sm">
                                {item.equipment.photo_url ? (
                                  <SignedImg
                                    src={item.equipment.photo_url}
                                    alt={item.equipment.name}
                                    className="h-14 w-14 rounded-lg object-cover border cursor-pointer shrink-0"
                                    onClick={() => setPreviewPhoto(item.equipment!.photo_url)}
                                  />
                                ) : null}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-medium">{item.equipment.name}</p>
                                    {(item.equipment as any).category && (
                                      <Badge className="text-[10px] text-white border-0" style={{ backgroundColor: (item.equipment as any).category.color }}>
                                        {(item.equipment as any).category.name}
                                      </Badge>
                                    )}
                                  </div>
                                  {item.equipment.brand && <p className="text-muted-foreground text-xs">{item.equipment.brand} {item.equipment.model}</p>}
                                  {item.equipment.location && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <MapPinned className="h-3 w-3 shrink-0" />
                                      {item.equipment.location}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  ) : (
                    <div className="space-y-3">
                      {uniqueEquipmentItems.map(item => item.equipment && (
                        <div key={item.equipment_id} className="flex items-start gap-3 text-sm">
                          {item.equipment.photo_url ? (
                            <SignedImg
                              src={item.equipment.photo_url}
                              alt={item.equipment.name}
                              className="h-14 w-14 rounded-lg object-cover border cursor-pointer shrink-0"
                              onClick={() => setPreviewPhoto(item.equipment!.photo_url)}
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium">{item.equipment.name}</p>
                              {(item.equipment as any).category && (
                                <Badge className="text-[10px] text-white border-0" style={{ backgroundColor: (item.equipment as any).category.color }}>
                                  {(item.equipment as any).category.name}
                                </Badge>
                              )}
                            </div>
                            {item.equipment.brand && <p className="text-muted-foreground text-xs">{item.equipment.brand} {item.equipment.model}</p>}
                            {item.equipment.location && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <MapPinned className="h-3 w-3 shrink-0" />
                                {item.equipment.location}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Status info */}
          <Card>
            <CardContent className="p-3 sm:p-4 text-center">
              <Badge variant={statusBadgeVariant[serviceOrder.status]} className="text-base px-4 py-1">
                {osStatusLabels[serviceOrder.status]}
              </Badge>
              <p className="text-sm text-muted-foreground mt-2">
                {serviceOrder.status === 'pendente' && 'Aguardando início do atendimento'}
                {serviceOrder.status === 'a_caminho' && 'Técnico a caminho...'}
                {serviceOrder.status === 'em_andamento' && 'Técnico em atendimento...'}
                {serviceOrder.status === 'cancelada' && 'Esta OS foi cancelada'}
              </p>
            </CardContent>
          </Card>

          {/* Live tracking map for public viewers when a_caminho */}
          {serviceOrder.status === 'a_caminho' && (
            <PublicTrackingMap serviceOrderId={serviceOrder.id} />
          )}

          {/* Real-time questionnaire responses grouped by (equipment_id, template_id) */}
          {publicFormResponses.length > 0 && (() => {
            // Index by composite key — same equipment may have multiple templates
            const itemByPair = new Map<string, EquipmentItem>();
            equipmentItems.forEach(item => {
              if (item.equipment_id && item.form_template_id) {
                itemByPair.set(`${item.equipment_id}::${item.form_template_id}`, item);
              }
            });

            // Group responses by composite (equipment_id, template_id) so the same
            // equipment can appear in multiple questionnaire cards.
            const groupedByEquipment = new Map<string, { equipment: EquipmentItem | null; responses: typeof publicFormResponses; totalQuestions: number }>();

            publicFormResponses.forEach(r => {
              const eqId = r.equipment_id;
              const templateId = r.question?.template_id || 'unknown';

              let groupKey: string;
              let equipmentItem: EquipmentItem | null = null;

              if (eqId) {
                groupKey = `${eqId}::${templateId}`;
                equipmentItem = itemByPair.get(groupKey)
                  || equipmentItems.find(item => item.equipment_id === eqId)
                  || null;
              } else {
                // Legacy / standalone: group by template_id only
                groupKey = `template-${templateId}`;
                equipmentItem = equipmentItems.find(item => item.form_template_id === templateId) || null;
              }

              if (!groupedByEquipment.has(groupKey)) {
                groupedByEquipment.set(groupKey, {
                  equipment: equipmentItem,
                  responses: [],
                  totalQuestions: 0,
                });
              }
              groupedByEquipment.get(groupKey)!.responses.push(r);
            });

            // Count total questions per group
            groupedByEquipment.forEach((group) => {
              group.totalQuestions = group.responses.length;
            });

            const groups = Array.from(groupedByEquipment.entries());
            const hasMultipleGroups = groups.length > 1 && groups.some(([, g]) => g.equipment);

            if (hasMultipleGroups) {
              return (
                <Card>
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <ClipboardCheck className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Checklists</span>
                    </div>
                    <Accordion type="multiple" className="w-full">
                      {groups.map(([groupKey, group]) => {
                        const answered = group.responses.filter(r => r.response_value || r.response_photo_url).length;
                        const total = group.totalQuestions;
                        const isComplete = answered === total && total > 0;
                        const pending = total - answered;
                        // Show template name as subtitle when the same equipment has multiple templates
                        const eqId = group.equipment?.equipment_id;
                        const sameEquipCount = eqId
                          ? equipmentItems.filter(i => i.equipment_id === eqId).length
                          : 0;
                        const hasMultipleOnSameEquip = sameEquipCount > 1;
                        return (
                          <AccordionItem key={groupKey} value={groupKey} className="border-b last:border-0">
                            <AccordionTrigger className="hover:no-underline py-3 gap-2 min-w-0 overflow-hidden">
                              <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
                                {group.equipment?.equipment?.photo_url ? (
                                  <SignedImg
                                    src={group.equipment.equipment.photo_url}
                                    alt={group.equipment.equipment.name}
                                    className="h-8 w-8 rounded-md object-cover shrink-0 border"
                                  />
                                ) : (
                                  <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                                    <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-sm truncate">
                                      {group.equipment?.equipment?.name || group.equipment?.form_template?.name || 'Checklist'}
                                    </p>
                                    {(group.equipment?.equipment as any)?.category && (
                                      <Badge className="text-[10px] shrink-0 text-white border-0" style={{ backgroundColor: (group.equipment!.equipment as any).category.color }}>
                                        {(group.equipment!.equipment as any).category.name}
                                      </Badge>
                                    )}
                                  </div>
                                  {hasMultipleOnSameEquip && group.equipment?.form_template?.name && (
                                    <p className="text-xs font-medium text-primary truncate">
                                      {group.equipment.form_template.name}
                                    </p>
                                  )}
                                  {group.equipment?.equipment?.brand && (
                                    <p className="text-xs text-muted-foreground truncate">
                                      {group.equipment.equipment.brand} {group.equipment.equipment.model}
                                    </p>
                                  )}
                                  {group.equipment?.equipment?.location && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <MapPinned className="h-3 w-3 shrink-0" />
                                      <span className="truncate">{group.equipment.equipment.location}</span>
                                    </p>
                                  )}
                                </div>
                                {isComplete ? (
                                  <Badge variant="success" className="gap-1 shrink-0 text-xs">
                                    <Check className="h-3 w-3" /> {answered}/{total}
                                  </Badge>
                                ) : (
                                  <Badge variant={pending === total ? 'secondary' : 'warning'} className="text-xs shrink-0">
                                    {answered}/{total}
                                  </Badge>
                                )}
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-3 pt-1">
                                {group.responses
                                  .sort((a: any, b: any) => (a.question?.position || 0) - (b.question?.position || 0))
                                  .map((r: any) => {
                                    const val = typeof r.response_value === 'string' ? r.response_value : null;
                                    return (
                                      <div key={r.id} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
                                        <p className="text-xs font-medium text-muted-foreground">{r.question?.question || 'Pergunta'}</p>
                                        {val ? (
                                          <p className="text-sm mt-0.5">
                                            {val === 'true' ? '✅ Sim' : val === 'false' ? '❌ Não' : val.includes('|||') ? (
                                              val.split('|||').map((v: string, i: number) => (
                                                <Badge key={i} variant="secondary" className="mr-1 mt-1 text-xs">{v}</Badge>
                                              ))
                                            ) : val}
                                          </p>
                                        ) : (
                                          <p className="text-xs text-muted-foreground/60 mt-0.5 italic">Aguardando resposta...</p>
                                        )}
                                        {r.response_photo_url && (() => {
                                          const urls = r.response_photo_url!.split(',').filter(Boolean).map((u: string) => u.trim());
                                          return (
                                            <div className="flex flex-wrap gap-2 mt-1">
                                              {urls.map((url: string, i: number) => (
                                                <SignedImg key={i} src={url} alt="Foto da resposta" className="rounded h-24 w-24 sm:h-32 sm:w-32 object-cover cursor-pointer" onClick={() => { setGalleryImages(urls); setGalleryIndex(i); setPreviewPhoto(url); }} />
                                              ))}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    );
                                  })}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  </CardContent>
                </Card>
              );
            }

            // Single template / no equipment grouping - flat view
            return (
              <Card>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ClipboardCheck className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Respostas do Checklist</span>
                    {(() => {
                      const answered = publicFormResponses.filter(r => r.response_value || r.response_photo_url).length;
                      const total = publicFormResponses.length;
                      return (
                        <Badge variant={answered === total ? 'success' : 'secondary'} className="text-xs ml-auto">
                          {answered}/{total}
                        </Badge>
                      );
                    })()}
                  </div>
                  <div className="space-y-3">
                    {publicFormResponses
                      .sort((a, b) => (a.question?.position || 0) - (b.question?.position || 0))
                      .map(r => {
                        const val = typeof r.response_value === 'string' ? r.response_value : null;
                        return (
                          <div key={r.id} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
                            <p className="text-xs font-medium text-muted-foreground">{r.question?.question || 'Pergunta'}</p>
                            {val ? (
                              <p className="text-sm mt-0.5">
                                {val === 'true' ? '✅ Sim' : val === 'false' ? '❌ Não' : val.includes('|||') ? (
                                  val.split('|||').map((v: string, i: number) => (
                                    <Badge key={i} variant="secondary" className="mr-1 mt-1 text-xs">{v}</Badge>
                                  ))
                                ) : val}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground/60 mt-0.5 italic">Aguardando resposta...</p>
                            )}
                            {r.response_photo_url && (() => {
                              const urls = r.response_photo_url!.split(',').filter(Boolean).map((u: string) => u.trim());
                              return (
                                <div className="flex flex-wrap gap-2 mt-1">
                                  {urls.map((url: string, i: number) => (
                                    <SignedImg key={i} src={url} alt="Foto da resposta" className="rounded h-24 w-24 sm:h-32 sm:w-32 object-cover cursor-pointer" onClick={() => { setGalleryImages(urls); setGalleryIndex(i); setPreviewPhoto(url); }} />
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Photos */}
          {photos.length > 0 && (
            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Camera className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fotos</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {photos.map(photo => (
                    <SignedImg
                      key={photo.id}
                      src={photo.photo_url}
                      alt={photo.description || ''}
                      className="rounded-lg object-cover aspect-square w-full cursor-pointer"
                      onClick={() => setPreviewPhoto(photo.photo_url)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {isPublicMode && isPmocPublic && (
            <PmocComplianceBadge variant="footer" className="pt-2" />
          )}
        </div>

        {/* Photo preview modal */}
        <ImagePreviewModal
          src={previewPhoto || ''}
          alt="Foto"
          open={!!previewPhoto}
          onClose={() => { setPreviewPhoto(null); setGalleryImages([]); }}
          images={galleryImages.length > 1 ? galleryImages : undefined}
          currentIndex={galleryIndex}
          onNavigate={(i) => { setGalleryIndex(i); setPreviewPhoto(galleryImages[i]); }}
        />
      </div>
    );
  }

  // AUTHENTICATED MODE - full interactive
  const isCheckedIn = !!checkInTime;
  const isPending = serviceOrder.status === 'pendente' || serviceOrder.status === 'agendada';
  const isACaminho = serviceOrder.status === 'a_caminho';
  const isPaused = serviceOrder.status === 'pausada';

  const handleEnRoute = async () => {
    try {
      const location = await getCurrentLocation();
      
      // Record location FIRST so the tracking map can find it
      if (id) {
        await recordLocationEvent(id, location.lat, location.lng, 'en_route');
      }

      const { error } = await supabase
        .from('service_orders')
        .update({ status: 'a_caminho' })
        .eq('id', id);

      if (error) throw error;

      setServiceOrder((prev) => prev ? { ...prev, status: 'a_caminho' as OsStatus } : null);
      toast({ title: 'Status atualizado: A Caminho!' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar status',
        description: getErrorMessage(error),
      });
    }
  };

  // Atalhos de navegação até o destino (a_caminho). Prioridade: endereço de
  // serviço da OS (coord salva → endereço de serviço) → cliente (coord → endereço).
  const osDestination = resolveOsDestination(serviceOrder, serviceOrder.customer);
  const isServiceAddress = osDestination.source === 'os';
  const destAddress = osDestination.address;
  const destLat = osDestination.coords?.lat ?? null;
  const destLng = osDestination.coords?.lng ?? null;
  const hasCustomerCoords = destLat != null && destLng != null && Number.isFinite(destLat) && Number.isFinite(destLng);
  // Mantido pra compat com referências antigas no JSX abaixo.
  const custLat = destLat;
  const custLng = destLng;

  const openWaze = () => {
    const url = hasCustomerCoords
      ? buildWazeUrl(destLat as number, destLng as number)
      : destAddress
      ? `https://waze.com/ul?q=${encodeURIComponent(destAddress)}&navigate=yes`
      : null;
    if (!url) {
      toast({ variant: 'destructive', title: 'Sem endereço para abrir a navegação.' });
      return;
    }
    window.open(url, '_blank', 'noopener');
  };

  const openGoogleMaps = () => {
    let url: string | null = null;
    if (techOrigin && destAddress) {
      url = buildGoogleMapsDirectionsUrl(techOrigin.lat, techOrigin.lng, destAddress);
    } else if (destAddress) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destAddress)}`;
    } else if (hasCustomerCoords) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`;
    }
    if (!url) {
      toast({ variant: 'destructive', title: 'Sem endereço para abrir a navegação.' });
      return;
    }
    window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground">
        <div className="max-w-2xl mx-auto p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3 mb-3">
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10 shrink-0" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {company?.logo_url ? (
                  <img src={company.logo_url} alt="Logo" className="h-10 w-10 sm:h-12 sm:w-12 rounded object-contain bg-white p-1 shrink-0" />
                ) : (
                  <Building2 className="h-5 w-5 opacity-70 shrink-0" />
                )}
                <span className="text-sm opacity-80 truncate">{company?.name || ''}</span>
              </div>
            </div>
            <Badge variant={statusBadgeVariant[serviceOrder.status]} className="shrink-0">
              {osStatusLabels[serviceOrder.status]}
            </Badge>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-1">
            <div>
              <h1 className="text-lg sm:text-xl font-bold">OS #{String(serviceOrder.order_number).padStart(6, '0')}</h1>
              <p className="text-xs sm:text-sm opacity-80">{getOsTypeLabel(serviceOrder)}</p>
            </div>
            {serviceOrder.scheduled_date && (
              <div className="flex items-center gap-1.5 text-xs sm:text-sm opacity-80">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {format(new Date(serviceOrder.scheduled_date + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                  {serviceOrder.scheduled_time && ` ${String(serviceOrder.scheduled_time).slice(0, 5)}`}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
        {showPmocSeal && (
          <PmocComplianceBadge variant="ribbon" withTooltip />
        )}
        {/* Rota até o cliente — só quando "a caminho" */}
        {isACaminho && (
          <Card className="border-indigo-200 overflow-hidden">
            <div className="bg-indigo-50 border-b border-indigo-100 px-3 py-2 flex items-center gap-2 text-sm font-medium text-indigo-700">
              <MapPinned className="h-4 w-4 shrink-0" />
              Rota até o cliente
            </div>
            <CardContent className="p-0">
              {/* Mapa: some com elegância se nem origem nem destino resolverem */}
              <div className="relative">
                <RouteToCustomerMap
                  origin={techOrigin}
                  customerCoords={hasCustomerCoords ? { lat: custLat as number, lng: custLng as number } : null}
                  customer={serviceOrder.customer}
                  destAddress={destAddress}
                />
                {(techOrigin || hasCustomerCoords) && (
                  <button
                    type="button"
                    onClick={() => setRouteFullscreen(true)}
                    aria-label="Ampliar mapa"
                    className="absolute bottom-3 right-3 z-[400] flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-2 text-sm font-medium text-indigo-700 shadow-md active:scale-95 transition"
                  >
                    <Maximize2 className="h-4 w-4" />
                    Ampliar
                  </button>
                )}
              </div>
              <div className="p-3 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  onClick={openWaze}
                >
                  <Navigation className="h-4 w-4 mr-2" />
                  Waze
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  onClick={openGoogleMaps}
                >
                  <MapIcon className="h-4 w-4 mr-2" />
                  Google Maps
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mapa da rota em tela cheia — preview maior, navegação segue no Waze/Google */}
        {isACaminho && routeFullscreen && (
          <div
            className="fixed inset-0 z-[3000] bg-background flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="Mapa da rota em tela cheia"
          >
            {/* Topo: respeita o status bar do iPhone */}
            <div
              className="flex items-center justify-between gap-2 px-3 pb-2 bg-indigo-600 text-white shrink-0"
              style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <MapPinned className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium truncate">Rota até o cliente</span>
              </div>
              <button
                type="button"
                onClick={() => setRouteFullscreen(false)}
                aria-label="Fechar mapa"
                className="flex items-center justify-center h-9 w-9 rounded-full bg-white/20 active:scale-95 transition shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Mapa preenche o espaço disponível */}
            <div className="flex-1 min-h-0">
              <RouteToCustomerMap
                origin={techOrigin}
                customerCoords={hasCustomerCoords ? { lat: custLat as number, lng: custLng as number } : null}
                customer={serviceOrder.customer}
                destAddress={destAddress}
                fullHeight
              />
            </div>

            {/* Botões de navegação — respeita a barra inferior do iPhone */}
            <div
              className="grid grid-cols-2 gap-2 px-3 pt-3 bg-background border-t shrink-0"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
              <Button
                type="button"
                variant="outline"
                className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                onClick={openWaze}
              >
                <Navigation className="h-4 w-4 mr-2" />
                Waze
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                onClick={openGoogleMaps}
              >
                <MapIcon className="h-4 w-4 mr-2" />
                Google Maps
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: En Route or Check-in */}
        {(isPending || isACaminho) && (
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {isPending ? <Navigation className="h-4 w-4 text-primary" /> : <Play className="h-4 w-4 text-primary" />}
                {isPending ? 'Ir para o Atendimento' : 'Iniciar Atendimento'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {isPending && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Informe ao cliente que você está a caminho ou faça o check-in ao chegar.
                  </p>
                  <Button className="w-full bg-indigo-500 hover:bg-indigo-600 text-white" size="lg" onClick={handleEnRoute}>
                    <Navigation className="h-4 w-4 mr-2" />
                    A Caminho
                  </Button>
                </>
              )}
              {isACaminho && (
                <p className="text-sm text-muted-foreground">
                  Chegou no local? Faça o check-in para iniciar.
                </p>
              )}
              <Button className="w-full" size="lg" onClick={handleCheckIn} variant={isPending ? 'outline' : 'default'}>
                <Play className="h-4 w-4 mr-2" />
                Fazer Check-in
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Resume from paused */}
        {isPaused && (
          <Card className="border-amber-600/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-amber-600">
                <Pause className="h-4 w-4" />
                OS Pausada
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Esta OS foi pausada. Retome o atendimento para continuar o preenchimento.
              </p>
              <Button className="w-full" size="lg" onClick={async () => {
                try {
                  const { error } = await supabase
                    .from('service_orders')
                    .update({ status: 'em_andamento' })
                    .eq('id', id);
                  if (error) throw error;
                  setServiceOrder((prev) => prev ? { ...prev, status: 'em_andamento' as OsStatus } : null);
                  toast({ title: 'OS retomada com sucesso!' });
                } catch (error: any) {
                  toast({ variant: 'destructive', title: 'Erro ao retomar OS', description: getErrorMessage(error) });
                }
              }}>
                <Play className="h-4 w-4 mr-2" />
                Retomar OS
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Check-in timestamp */}
        {isCheckedIn && (
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-xs sm:text-sm">
                  Check-in: {format(new Date(checkInTime!), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
              {checkInLocation && (
                <span className="text-xs opacity-70 sm:ml-auto flex items-center gap-0.5">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {checkInLocation.lat.toFixed(4)}, {checkInLocation.lng.toFixed(4)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Client Info */}
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cliente</span>
            </div>
            <p className="font-semibold break-words">{serviceOrder.customer?.name}</p>
            {serviceOrder.customer?.document && (
              <p className="text-xs text-muted-foreground mt-0.5">{serviceOrder.customer.document}</p>
            )}
            {serviceOrder.customer?.phone && (
              <a href={`tel:${serviceOrder.customer.phone}`} className="flex items-center gap-1.5 text-sm text-primary mt-1">
                <Phone className="h-3 w-3 shrink-0" />
                {serviceOrder.customer.phone}
              </a>
            )}
            {serviceOrder.customer?.address && (
              <p className="text-sm text-muted-foreground flex items-start gap-1.5 mt-1">
                <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                <span className="break-words">
                  {serviceOrder.customer.address}
                  {serviceOrder.customer.city && `, ${serviceOrder.customer.city}`}
                  {serviceOrder.customer.state && ` - ${serviceOrder.customer.state}`}
                </span>
              </p>
            )}
            {isServiceAddress && destAddress && (
              <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                  <MapPinned className="h-3.5 w-3.5 shrink-0" />
                  Endereço deste serviço
                </div>
                <p className="text-sm text-foreground flex items-start gap-1.5 mt-1">
                  <MapPin className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                  <span className="break-words">{destAddress}</span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  O atendimento é neste local, diferente do endereço cadastrado do cliente.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Description & Notes */}
        {serviceOrder.description && (
          <Card>
            <CardContent className="p-3 sm:p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Descrição do Serviço</p>
              <p className="text-sm break-words">{serviceOrder.description}</p>
            </CardContent>
          </Card>
        )}
        {serviceOrder.notes && (
          <Card>
            <CardContent className="p-3 sm:p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Observações</p>
              <p className="text-sm break-words">{serviceOrder.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Questionnaires - Multi equipment from junction table (accordion) */}
        {isCheckedIn && equipmentItems.length > 0 && (
          <Card>
            <CardHeader className="pb-2 px-3 sm:px-6">
              <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl font-semibold">
                <ClipboardCheck className="h-5 w-5 text-primary shrink-0" />
                Checklists
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3">
              {isPaused && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-warning">
                  <Lock className="h-4 w-4 mt-0.5 shrink-0" />
                  <p className="text-sm font-medium">
                    OS pausada — retome o atendimento para preencher os checklists.
                  </p>
                </div>
              )}
              <Accordion type="multiple" className={`w-full ${isPaused ? 'opacity-60 cursor-not-allowed' : ''}`}>
                {equipmentItems.map((item, idx) => {
                  if (!item.form_template_id) return null;
                  // Composite key — same equipment can carry multiple templates
                  const itemKey = item.equipment_id
                    ? `${item.equipment_id}::${item.form_template_id}`
                    : `standalone-${item.form_template_id}-${idx}`;
                  const validation = formValidations[itemKey];
                  const isComplete = validation && validation.isValid;
                  const pendingCount = validation ? validation.missingQuestions.length : 0;
                  // When multiple templates share the same equipment, show template name as subtitle
                  const sameEquipCount = item.equipment_id
                    ? equipmentItems.filter(i => i.equipment_id === item.equipment_id).length
                    : 0;
                  const hasMultipleOnSameEquip = sameEquipCount > 1;
                  return (
                    <AccordionItem key={itemKey} value={itemKey} className="border-b last:border-0">
                      <AccordionTrigger className="hover:no-underline py-3 gap-2 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
                          {item.equipment?.photo_url ? (
                            <SignedImg
                              src={item.equipment.photo_url}
                              alt={item.equipment.name}
                              className="h-10 w-10 rounded-md object-cover shrink-0 cursor-pointer border"
                              onClick={(e) => { e.stopPropagation(); setPreviewPhoto(item.equipment!.photo_url); }}
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                              <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="font-medium text-sm truncate">
                                {item.equipment?.name || item.form_template?.name || 'Checklist'}
                              </p>
                              {item.equipment?.category && (
                                <Badge className="text-[10px] shrink-0 text-white border-0" style={{ backgroundColor: item.equipment.category.color }}>
                                  {item.equipment.category.name}
                                </Badge>
                              )}
                            </div>
                            {hasMultipleOnSameEquip && item.form_template?.name && (
                              <p className="text-xs font-medium text-primary truncate">
                                {item.form_template.name}
                              </p>
                            )}
                            {item.equipment?.brand && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {item.equipment.brand} {item.equipment.model}
                              </p>
                            )}
                            {item.equipment?.location && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <MapPinned className="h-3 w-3 shrink-0" />
                                <span className="truncate">{item.equipment.location}</span>
                              </p>
                            )}
                            {!item.equipment && item.form_template && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {item.form_template.name}
                              </p>
                            )}
                          </div>
                          {isComplete ? (
                            <Badge variant="success" className="gap-1 shrink-0">
                              <Check className="h-3 w-3" /> Concluído
                            </Badge>
                          ) : pendingCount > 0 ? (
                            <Badge variant="destructive" className="text-xs shrink-0">
                              {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
                            </Badge>
                          ) : null}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <DynamicFormQuestions
                          serviceOrderId={id!}
                          templateId={item.form_template_id!}
                          equipmentId={item.equipment_id || undefined}
                          readOnly={isPaused}
                          onValidationChange={(result) => setFormValidations(prev => ({ ...prev, [itemKey]: result }))}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </CardContent>
          </Card>
        )}

        {/* Checklist da visita (PMOC/manutenção) — só quando a OS tem atividades
            do plano (gerada por contrato). OS avulsa não renderiza nada aqui. */}
        {isCheckedIn && hasChecklist && (
          <VisitChecklistPanel
            serviceOrderId={serviceOrder.id}
            groups={checklistGroups}
            readOnly={isPaused}
            onSave={saveChecklistActivity}
          />
        )}

        {/* Fallback: single questionnaire from OS (legacy / no junction data) */}
        {isCheckedIn && equipmentItems.length === 0 && serviceOrder.form_template_id && (
          <Card>
            <CardHeader className="pb-3 px-3 sm:px-6">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base flex-wrap">
                <ClipboardCheck className="h-4 w-4 text-primary shrink-0" />
                <span className="break-words">
                  {serviceOrder.equipment ? (
                    <>
                      {serviceOrder.equipment.name}
                      {serviceOrder.equipment.brand && ` — ${serviceOrder.equipment.brand} ${serviceOrder.equipment.model || ''}`}
                    </>
                  ) : (
                    serviceOrder.form_template?.name || 'Checklist'
                  )}
                </span>
                {formValidations['legacy'] && !formValidations['legacy'].isValid && (
                  <Badge variant="destructive" className="text-xs">
                    {formValidations['legacy'].missingQuestions.length} pendente{formValidations['legacy'].missingQuestions.length > 1 ? 's' : ''}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              {isPaused && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-warning">
                  <Lock className="h-4 w-4 mt-0.5 shrink-0" />
                  <p className="text-sm font-medium">
                    OS pausada — retome o atendimento para preencher os checklists.
                  </p>
                </div>
              )}
              <div className={isPaused ? 'opacity-60 cursor-not-allowed' : ''}>
                <DynamicFormQuestions
                  serviceOrderId={id!}
                  templateId={serviceOrder.form_template_id}
                  readOnly={isPaused}
                  onValidationChange={(result) => setFormValidations(prev => ({ ...prev, legacy: result }))}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Signatures */}
        {isCheckedIn && ((serviceOrder as any)?.require_tech_signature || (serviceOrder as any)?.require_client_signature) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <PenTool className="h-4 w-4 text-primary" />
                Assinaturas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(serviceOrder as any)?.require_tech_signature && (
                <SignaturePad
                  value={techSignature}
                  onChange={setTechSignature}
                  label="Assinatura do Técnico"
                  disabled={isPaused}
                />
              )}
              {(serviceOrder as any)?.require_client_signature && (
                <SignaturePad
                  value={clientSignature}
                  onChange={setClientSignature}
                  label="Assinatura do Cliente"
                  disabled={isPaused}
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* Onda D v1.9.x — Classificação de Conformidade PMOC.
            Só aparece quando OS pertence a contrato PMOC. Bloqueia finalizar
            se status='parcial'|'nao_conforme' sem notas. */}
        {isCheckedIn && !isPaused && isPmocOrder && (
          <Card className="border-info/30">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-info/10 px-2.5 py-1 text-xs font-medium text-info">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  PMOC
                </span>
                <CardTitle className="text-base">Classificação de Conformidade PMOC</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Esta OS pertence a contrato PMOC. Indique a conformidade com a Lei 13.589/2018:
              </p>
              <RadioGroup
                value={conformityStatus}
                onValueChange={(v) => setConformityStatus(v as PmocConformity)}
              >
                <label
                  htmlFor="conformity-conforme"
                  className="flex items-center gap-3 rounded-md border border-success/30 bg-card px-3 py-3 cursor-pointer min-h-[44px]"
                >
                  <RadioGroupItem value="conforme" id="conformity-conforme" />
                  <span className="text-sm font-medium text-success">
                    Conforme — tudo dentro do esperado
                  </span>
                </label>
                <label
                  htmlFor="conformity-parcial"
                  className="flex items-center gap-3 rounded-md border border-warning/30 bg-card px-3 py-3 cursor-pointer min-h-[44px]"
                >
                  <RadioGroupItem value="parcial" id="conformity-parcial" />
                  <span className="text-sm font-medium text-warning">
                    Parcial — alguma medida fora da faixa, mas operacional
                  </span>
                </label>
                <label
                  htmlFor="conformity-nao-conforme"
                  className="flex items-center gap-3 rounded-md border border-destructive/30 bg-card px-3 py-3 cursor-pointer min-h-[44px]"
                >
                  <RadioGroupItem value="nao_conforme" id="conformity-nao-conforme" />
                  <span className="text-sm font-medium text-destructive">
                    Não-conforme — problema técnico a registrar
                  </span>
                </label>
              </RadioGroup>
              <div className="space-y-1.5">
                <Label htmlFor="conformity-notes" className="text-xs">
                  Notas de conformidade
                  {(conformityStatus === 'parcial' || conformityStatus === 'nao_conforme') && (
                    <span className="text-destructive ml-1">*</span>
                  )}
                </Label>
                <Textarea
                  id="conformity-notes"
                  value={conformityNotes}
                  onChange={(e) => setConformityNotes(e.target.value)}
                  placeholder="Descreva o que foi observado..."
                  rows={3}
                  className="text-sm"
                />
                {(conformityStatus === 'parcial' || conformityStatus === 'nao_conforme') && (
                  <p className="text-xs text-muted-foreground">
                    Obrigatório quando a classificação é parcial ou não-conforme.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Finish & Pause OS buttons */}
        {isCheckedIn && !isPaused && (
          <div className="pb-6 space-y-2">
            <Button 
              className="w-full bg-success hover:bg-success/90 text-success-foreground" 
              size="lg"
              onClick={handleFinishOS}
              disabled={finishing}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {finishing ? 'Finalizando...' : 'Finalizar OS'}
            </Button>
            <Button 
              variant="outline"
              className="w-full border-amber-600/30 text-amber-600 hover:bg-amber-600 hover:text-white" 
              size="lg"
              onClick={async () => {
                try {
                  const { error } = await supabase
                    .from('service_orders')
                    .update({ status: 'pausada' } as any)
                    .eq('id', id);
                  if (error) throw error;
                  setServiceOrder((prev) => prev ? { ...prev, status: 'pausada' as OsStatus } : null);
                  toast({ title: 'OS pausada com sucesso!' });
                } catch (error: any) {
                  toast({ variant: 'destructive', title: 'Erro ao pausar OS', description: getErrorMessage(error) });
                }
              }}
            >
              <Pause className="h-4 w-4 mr-2" />
              Pausar OS
            </Button>
          </div>
        )}
      </div>

      {/* Equipment photo preview */}
      <ImagePreviewModal
        src={previewPhoto || ''}
        alt="Equipamento"
        open={!!previewPhoto}
        onClose={() => { setPreviewPhoto(null); setGalleryImages([]); }}
        images={galleryImages.length > 1 ? galleryImages : undefined}
        currentIndex={galleryIndex}
        onNavigate={(i) => { setGalleryIndex(i); setPreviewPhoto(galleryImages[i]); }}
      />

      {/* FAB speed-dial (canto inferior esquerdo) — atalho pras Ferramentas do Técnico */}
      <SpeedDialFAB actions={speedDialActions} side="left" />

      {/* Overlay fullscreen: mesmo componente da tela de Ferramentas do Técnico.
          A OS continua montada por baixo (toolsOpen é estado local), então o
          técnico volta exatamente onde estava. A navegação interna virou estado
          (abas), então não precisa mais de router dedicado. */}
      {toolsOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-background">
          <div
            className="flex items-center gap-2 border-b border-border bg-background px-3 pb-2 shrink-0"
            style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
          >
            <Button variant="ghost" size="sm" onClick={() => setToolsOpen(false)} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Voltar para OS
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-3 sm:p-4">
            <TechnicianTools />
          </div>
        </div>
      )}
    </div>
  );
}
