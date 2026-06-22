import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
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
  MoreVertical,
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
import { useOsActivityChecklist, isTemplateActivityComplete } from '@/hooks/useOsActivityChecklist';
import { VisitChecklistPanel } from '@/components/technician/VisitChecklistPanel';
import {
  EquipmentChecklistHeader,
  equipmentChecklistHeaderClasses,
} from '@/components/technician/EquipmentChecklistHeader';
import { type ReportChecklistItem } from '@/components/technician/ReportChecklist';
import { PmocComplianceBadge } from '@/components/pmoc/PmocComplianceBadge';
import type { ServiceOrder, OsStatus } from '@/types/database';
import { PublicTrackingMap } from '@/components/schedule/PublicTrackingMap';
import { RouteToCustomerMap } from '@/components/schedule/RouteToCustomerMap';
import { buildWazeUrl, buildGoogleMapsDirectionsUrl, buildCustomerAddress, haversineDistance, resolveOsDestination } from '@/utils/geolocation';
import { osTypeLabels, getOsTypeLabel, getOsStatusLabel } from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { buildServiceOrderShareLink } from '@/utils/shareLinks';
import { isUuid, extractShortCode, buildSlugSegment } from '@/utils/prettyLinks';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getErrorMessage } from '@/utils/errorMessages';
import { cn } from '@/lib/utils';
import { SpeedDialFAB, type SpeedDialAction } from '@/components/mobile/SpeedDialFAB';
import { OsEquipmentSidebar, OsActionFooter, type OsSidebarItem, type OsSidebarStatus } from '@/components/technician/OsDesktopShell';
import TechnicianTools from '@/pages/TechnicianTools';
import { FerramentasTecnicoIcon } from '@/components/icons/MenuIcons';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useStickyStuck } from '@/hooks/useStickyStuck';

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
  /**
   * Nome do AMBIENTE do equipamento neste contrato (contract_environments.
   * identificacao). null = sem ambiente. Anônimo: vem pronto no payload de
   * get_public_os; autenticado: resolvido por query auxiliar em contract_items
   * (mesclado em fetchEquipmentItems).
   */
  environment_name?: string | null;
  equipment: { id: string; name: string; brand: string | null; model: string | null; location: string | null; photo_url: string | null; category: { id: string; name: string; color: string } | null } | null;
  form_template: { id: string; name: string } | null;
}

/**
 * Um equipamento do accordion de checklists da OS NORMAL (não-PMOC). Componente
 * próprio pra hospedar o `useStickyStuck` de cada cabeçalho (hooks não rodam
 * dentro de `.map`). Espelha o VisitChecklistItem do PMOC: cabeçalho gruda no
 * topo (logo abaixo do header laranja) enquanto o equipamento ABERTO é rolado,
 * com sombra quando "stuck". Só o equipamento aberto fica sticky (single-open).
 */
function OsEquipmentAccordionItem({
  item,
  itemKey,
  serviceOrderId,
  stickyTopPx,
  isOpen,
  readOnly,
  isComplete,
  pendingCount,
  hasMultipleOnSameEquip,
  environmentName,
  onPreviewPhoto,
  onValidationChange,
}: {
  item: EquipmentItem;
  itemKey: string;
  serviceOrderId: string;
  stickyTopPx?: number;
  isOpen: boolean;
  readOnly: boolean;
  isComplete: boolean;
  pendingCount: number;
  hasMultipleOnSameEquip: boolean;
  /** Ambiente do equipamento (contrato) ou, na ausência, o local cadastrado. */
  environmentName: string | null;
  onPreviewPhoto: (url: string) => void;
  onValidationChange: (result: FormValidationResult) => void;
}) {
  // SÓ o equipamento ABERTO fica sticky (mesmo critério do PMOC) — evita
  // empilhamento de cabeçalhos sobrepostos e briga de z-index.
  const stickyOn = isOpen && stickyTopPx !== undefined;
  const { sentinelRef, isStuck } = useStickyStuck(stickyOn ? stickyTopPx : undefined);
  // Mesmo padrão visual do PMOC (foto colada/altura cheia, tipografia, full-bleed
  // no stuck): cabeçalho compartilhado + classes compartilhadas.
  const headerCls = equipmentChecklistHeaderClasses(stickyOn, isStuck);
  const brandModel = [item.equipment?.brand, item.equipment?.model].filter(Boolean).join(' ');

  return (
    <AccordionItem value={itemKey} id={`os-eq-${itemKey}`} className="border-b last:border-0 scroll-mt-28">
      {/* Sentinel do sticky: 0px logo acima do cabeçalho (detecta stuck). */}
      <div ref={sentinelRef} aria-hidden className="h-0" />
      <AccordionTrigger
        className={headerCls.trigger}
        headerClassName={headerCls.header}
        // `-1px` no top: gruda 1px ATRÁS do header laranja (z-20 cobre o equipamento
        // z-10) pra fechar qualquer costura sub-pixel entre as duas barras.
        headerStyle={stickyOn ? { top: stickyTopPx - 1 } : undefined}
      >
        <EquipmentChecklistHeader
          photo={item.equipment?.photo_url ?? null}
          name={item.equipment?.name || item.form_template?.name || 'Checklist'}
          category={item.equipment?.category ?? null}
          // Subtítulo (nome do checklist) só quando o mesmo equipamento tem vários.
          subtitle={hasMultipleOnSameEquip && item.form_template?.name ? item.form_template.name : undefined}
          brandModel={brandModel}
          environmentName={environmentName}
          onPreviewPhoto={onPreviewPhoto}
          statusBadge={
            isComplete ? (
              <Badge variant="success" className="gap-1 shrink-0">
                <Check className="h-3 w-3" /> Concluído
              </Badge>
            ) : pendingCount > 0 ? (
              <Badge variant="destructive" className="text-xs shrink-0">
                {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
              </Badge>
            ) : null
          }
        />
      </AccordionTrigger>
      <AccordionContent>
        <DynamicFormQuestions
          serviceOrderId={serviceOrderId}
          templateId={item.form_template_id!}
          equipmentId={item.equipment_id || undefined}
          readOnly={readOnly}
          onValidationChange={onValidationChange}
        />
      </AccordionContent>
    </AccordionItem>
  );
}

export default function TechnicianOS() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const forceReadOnly = searchParams.get('modo') === 'cliente';
  // No modo cliente usamos cliente anônimo para que a RLS avalie como `anon`,
  // mesmo que haja sessão de outro usuário/empresa persistida no navegador.
  const db = forceReadOnly ? supabaseAnon : supabase;
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [serviceOrder, setServiceOrder] = useState<(ServiceOrder & { customer: any; equipment: any; form_template?: any }) | null>(null);
  // UUID REAL da OS — fonte ÚNICA e estável pra TODA escrita/consulta keyed por
  // id da OS (`.eq('id', ...)`, `service_order_id`, RPCs por uuid). A URL pode vir
  // como slug amigável (`slug-do-nome-<codigo>`) — só o CARREGAMENTO resolve o slug
  // (via get_public_os_by_code / public_short_code). As mutações NÃO podem usar o
  // `id` cru (slug) ou o Postgres rejeita com 22P02. Após o load, a OS traz o uuid
  // real no payload; quando a URL já é UUID, vale de imediato. Null = OS ainda não
  // carregada → ações de escrita ficam gated (já dependem da OS carregada).
  const resolvedOsId = serviceOrder?.id ?? (isUuid(id ?? '') ? id ?? null : null);
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
  // Checklist da visita no MODO ANÔNIMO: a RLS bloqueia service_order_activities
  // pro anon, então as atividades já vêm no payload da RPC get_public_os (chave
  // `activities`) no shape firme de ReportChecklistItem.
  const [publicActivities, setPublicActivities] = useState<ReportChecklistItem[]>([]);
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
  // Modal de finalização quando a OS PMOC tem itens do checklist sem resposta.
  // `pendingChecklistCount` guarda quantos faltam; o modal abre quando > 0 ao
  // tentar finalizar. `markingChecklist` trava os botões durante o bulk update.
  const [checklistGapOpen, setChecklistGapOpen] = useState(false);
  const [pendingChecklistCount, setPendingChecklistCount] = useState(0);
  const [markingChecklist, setMarkingChecklist] = useState(false);
  // Finalização PARCIAL: a OS vira pausada + partial_finish=true (marcada como
  // "Parcialmente Concluída", aparece nas OS pausadas até ser concluída de
  // verdade). NÃO valida obrigatórios — é intencionalmente incompleta.
  const [partialConfirmOpen, setPartialConfirmOpen] = useState(false);
  const [finishingPartial, setFinishingPartial] = useState(false);

  // Onda D v1.9.x — classificação de conformidade PMOC.
  // Só aparece quando a OS é PMOC (`useIsPmocOrder`). Notas são obrigatórias
  // se status é 'parcial' ou 'nao_conforme'.
  const { isPmoc: isPmocOrder } = useIsPmocOrder(resolvedOsId);
  // Checklist da visita (snapshot do plano PMOC/manutenção). Só preenche quando
  // a OS foi gerada por contrato com plano; OS avulsa volta vazia (RLS anon
  // também devolve vazio no modo cliente → painel não aparece).
  const {
    activities: checklistActivities,
    groups: checklistGroups,
    hasActivities: hasChecklist,
    saveActivity: saveChecklistActivity,
    rollup: checklistRollup,
    refetch: refetchChecklist,
    formQuestionsByTemplate: checklistFormQuestions,
    getFormResponse: getChecklistFormResponse,
    saveFormResponse: saveChecklistFormResponse,
  } = useOsActivityChecklist(isAuthenticated === true ? resolvedOsId ?? undefined : undefined);
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

  // Altura REAL do header sticky (desktop), medida via ref. A sidebar de
  // equipamentos usa essa altura como offset de topo pra começar logo ABAIXO do
  // header e nunca ser coberta por ele (o header é z-20; a sidebar fica abaixo
  // disso no fluxo). ResizeObserver acompanha mudança de altura (ex.: logo carrega,
  // status muda de linha). Default 96px = palpite seguro antes da 1ª medição.
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(96);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    // Mede com getBoundingClientRect().height (fracionário) e arredonda pra CIMA.
    // `offsetHeight` trunca pra inteiro: se o header laranja renderiza 60,5px (comum
    // com env(safe-area-inset-top) + line-heights), offsetHeight=60 e o cabeçalho do
    // equipamento grudava 0,5px ABAIXO da base real → vão sub-pixel visível no mobile.
    // `ceil` garante que o `top` nunca cai DENTRO do laranja (sem vão, sem invasão).
    const measure = () => setHeaderHeight(Math.ceil(el.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // Remede ao trocar de modo (report/público/autenticado montam headers distintos).
  }, [serviceOrder?.status, isAuthenticated]);

  // Overlay fullscreen das Ferramentas do Técnico (atalho a partir do FAB).
  // A tela de OS NÃO desmonta: ao fechar, o técnico volta exatamente onde estava.
  const [toolsOpen, setToolsOpen] = useState(false);
  const [routeFullscreen, setRouteFullscreen] = useState(false);
  // Accordion da EXECUÇÃO (single-open): UMA chave aberta por vez, COMPARTILHADA
  // entre o accordion de "Checklists" (questionários) e o da "Visita PMOC". Abrir
  // um equipamento/checklist fecha todos os outros (decisão CEO 1.14.x). As chaves
  // são únicas entre os dois accordions, então um único estado coordena ambos.
  // Default: nada aberto (igual ao mobile) — depois inicializado com o 1º grupo PMOC.
  const [openExecKey, setOpenExecKey] = useState<string | null>(null);
  // Opener do accordion PMOC do RELATÓRIO (vive dentro do OSReport). A sidebar
  // desktop do relatório o chama pra abrir o equipamento ao navegar. Registrado
  // pelo OSReport via registerPmocOpener. Só desktop.
  const reportPmocOpenerRef = useRef<((groupKey: string) => void) | null>(null);
  // Espelho de headerHeight num ref pra os callbacks memoizados de scroll lerem o
  // valor atual sem precisar re-criar (e sem fechar sobre um valor velho).
  const headerHeightRef = useRef(headerHeight);
  useEffect(() => { headerHeightRef.current = headerHeight; }, [headerHeight]);

  // Leva o cabeçalho do checklist aberto pro topo (logo abaixo do header laranja
  // fixo). Chama DEPOIS do reflow do single-open (os outros fecham e o layout
  // encolhe) via requestAnimationFrame. A chave pode pertencer a qualquer um dos
  // dois accordions (questionários `os-eq-...` ou visita PMOC `os-pmoc-...`).
  const scrollExecHeaderToTop = useCallback((key: string) => {
    const run = () => {
      const el =
        document.getElementById(`os-eq-${key}`) ||
        document.getElementById(`os-pmoc-${key}`);
      if (!el) return;
      // Mede DEPOIS da expansão/colapso: o single-open anima os irmãos fechando
      // (accordion-up) e o aberto crescendo (accordion-down) por ~200ms; medir
      // antes disso fixa um alvo que ainda vai se mover e a rolagem para na
      // última pergunta. Medimos só quando o layout estabilizou.
      const top =
        el.getBoundingClientRect().top + window.scrollY - headerHeightRef.current;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    };
    // Espera o fim da animação do Radix Accordion (0.2s). setTimeout 260ms cobre
    // a animação + reflow; dois rAFs garantem que o DOM já trocou de estado antes
    // de armar o timer.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(run, 260);
      });
    });
  }, []);
  // Abertura de checklist PELO USUÁRIO (clique no próprio cabeçalho da lista):
  // troca a chave aberta (single-open: fecha os demais) e, se abriu de fato (key
  // não-nula), rola o cabeçalho pro topo. Fechar (key null) NÃO rola. NÃO usar no
  // default inicial nem no force-open do PDF — só na ação do técnico/cliente.
  const handleExecUserOpen = useCallback((key: string | null) => {
    setOpenExecKey(key);
    if (key) scrollExecHeaderToTop(key);
  }, [scrollExecHeaderToTop]);

  // Navega (scroll suave) até uma seção estática da sidebar desktop. Usada SÓ no
  // modo público read-only (card "os-public-equipments", que não é accordion).
  // Nos modos com accordion (execução/relatório) usa-se handleExecUserOpen /
  // o opener do OSReport (abre + rola pra 1ª pergunta), não esta.
  const scrollToAnchor = useCallback((anchorId: string, accordionKey?: string) => {
    const el = document.getElementById(anchorId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Single-open: abrir esse fecha os demais (questionários + visita PMOC).
    if (accordionKey) setOpenExecKey(accordionKey);
  }, []);
  // Inicializa o accordion da visita PMOC com o 1º equipamento aberto (demais
  // fechados) — replica o defaultValue do VisitChecklistPanel. Só seta a primeira
  // vez que os grupos chegam, pra não reabrir o que o técnico já fechou.
  const visitKeysInitRef = useRef(false);
  useEffect(() => {
    if (visitKeysInitRef.current) return;
    if (checklistGroups.length === 0) return;
    visitKeysInitRef.current = true;
    setOpenExecKey(checklistGroups[0].equipmentId ?? '__local__');
  }, [checklistGroups]);
  // Copia o link público de acompanhamento e mostra toast (link gerado já copia no ato).
  const handleCopyTrackingLink = async () => {
    if (!id) return;
    try {
      const link = buildServiceOrderShareLink({
        shortCode: (serviceOrder as any)?.public_short_code,
        customerName: serviceOrder?.customer?.name,
        serviceName: (serviceOrder as any)?.service_type?.name,
        osId: serviceOrder?.id ?? id,
      });
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
  // FAB é EXCLUSIVO de "Ferramentas do Técnico" (função única, ícone de ferramenta
  // — não 3 pontinhos). Copiar link público mudou pro 3-pontinhos do rodapé.
  const speedDialActions: SpeedDialAction[] = [
    {
      icon: FerramentasTecnicoIcon,
      label: 'Ferramentas do Técnico',
      onClick: () => setToolsOpen(true),
      bare: true,
    },
  ];

  // Helper to safely extract joined object (Supabase may return array for some joins)
  const unwrapJoin = (val: any) => Array.isArray(val) ? val[0] || null : val;

  // Resolve o estado de auth ANTES de escolher o caminho de leitura.
  // Regras:
  // - `?modo=cliente` → sempre modo público (anon), com ou sem sessão.
  // - sem `?modo=cliente` E SEM sessão (ex: cliente final abrindo o link puro
  //   em guia anônima) → redireciona pra MESMA URL com `?modo=cliente`
  //   (preserva demais query params, REPLACE pra não criar loop nem sujar o
  //   histórico). Mantemos `isAuthenticated = null` durante o redirect pra a
  //   tela ficar no loading e NÃO disparar o fetch autenticado que falharia.
  // - sem `?modo=cliente` E COM sessão (técnico logado) → modo autenticado.
  useEffect(() => {
    if (forceReadOnly) {
      setIsAuthenticated(false);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        setIsAuthenticated(true);
        return;
      }
      // Sem sessão e sem `modo=cliente`: cai no modo público preservando params.
      const params = new URLSearchParams(searchParams);
      params.set('modo', 'cliente');
      navigate({ search: `?${params.toString()}` }, { replace: true });
      // Não seta isAuthenticated: a tela segue no loading até a nova URL
      // remontar o efeito com forceReadOnly === true.
    });
    return () => { active = false; };
  }, [forceReadOnly, searchParams, navigate]);

  const fetchFormResponses = async () => {
    if (!resolvedOsId) return;
    const { data } = await db
      .from('form_responses')
      .select('id, question_id, response_value, response_photo_url, equipment_id, question:form_questions(id, question, question_type, options, description, position, template_id)')
      .eq('service_order_id', resolvedOsId);
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
    if (!resolvedOsId) return;
    // Try technician_id first, then fall back to first assignee
    const { data: so } = await db.from('service_orders').select('technician_id').eq('id', resolvedOsId).maybeSingle();
    let userId = (so as any)?.technician_id;
    if (!userId) {
      const { data: assignees } = await db
        .from('service_order_assignees')
        .select('user_id')
        .eq('service_order_id', resolvedOsId)
        .limit(1);
      userId = (assignees as any)?.[0]?.user_id;
    }
    if (userId) {
      const { data: profile } = await db.from('profiles').select('full_name, avatar_url').eq('user_id', userId).maybeSingle();
      if (profile) setTechnicianProfile(profile);
    }
  }, [resolvedOsId, db]);
  const fetchEquipmentItems = async () => {
    if (!resolvedOsId) return;
    try {
      const { data, error } = await db
        .from('service_order_equipment')
        .select(`
          equipment_id,
          form_template_id,
          equipment:equipment(id, name, brand, model, location, photo_url, category:equipment_categories(id, name, color)),
          form_template:form_templates(id, name)
        `)
        .eq('service_order_id', resolvedOsId);

      if (error) throw error;
      const items = (data || []) as unknown as EquipmentItem[];

      // Ambiente por equipamento (modo autenticado): o anônimo já recebe
      // `environment_name` pronto do payload de get_public_os. Aqui resolvemos via
      // contract_items (equipment_id → contract_environments.identificacao) e
      // mesclamos — mesmo dado/shape nos dois modos. Sem contrato/ambiente: null.
      const contractId = (serviceOrder as any)?.contract_id || null;
      const equipmentIds = Array.from(
        new Set(items.map((it) => it.equipment_id).filter(Boolean) as string[])
      );
      if (contractId && equipmentIds.length > 0) {
        const { data: ciRows } = await db
          .from('contract_items')
          .select('equipment_id, sort_order, environment:contract_environments(identificacao)')
          .eq('contract_id', contractId)
          .in('equipment_id', equipmentIds);
        if (ciRows) {
          const envByEqId = new Map<string, string>();
          const sorted = [...(ciRows as any[])].sort(
            (a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity)
          );
          for (const row of sorted) {
            const eqId = row.equipment_id;
            const env = Array.isArray(row.environment) ? row.environment[0] : row.environment;
            const name = env?.identificacao ?? null;
            if (eqId && name && !envByEqId.has(eqId)) envByEqId.set(eqId, name);
          }
          items.forEach((it) => {
            it.environment_name = it.equipment_id ? envByEqId.get(it.equipment_id) ?? null : null;
          });
        }
      }

      setEquipmentItems(items);
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

  // "Embeleza" a barra de endereço: se a OS foi aberta por UUID antigo (ou slug
  // diferente), reescreve a URL para `slug-do-nome-<codigo>` preservando a query
  // (`?modo=cliente` etc.) sem recarregar a página. Só roda quando temos o
  // `public_short_code` em mãos; nunca inventa. UUID antigo continua resolvendo.
  const canonicalizeUrl = useCallback(
    (shortCode?: string | null, customerName?: string | null, serviceName?: string | null) => {
      if (!shortCode) return;
      const segment = buildSlugSegment([customerName, serviceName], shortCode, 'os');
      const target = `/os-tecnico/${segment}`;
      if (location.pathname === target) return;
      navigate(`${target}${location.search}`, { replace: true });
    },
    [navigate, location.pathname, location.search],
  );

  // MODO CLIENTE (anon): toda a leitura passa por UMA RPC SECURITY DEFINER
  // (`get_public_os`) que recebe só o id e devolve aquela OS. Substitui as
  // leituras anon diretas que enumeravam todas as OSs de todas as empresas.
  const fetchPublicOS = useCallback(async (opts?: { isPoll?: boolean }): Promise<void> => {
    if (!id) return;
    try {
      // Resolve por UUID antigo OU por código curto do slug amigável.
      // get_public_os_by_code casa pela coluna `public_short_code` e delega pro
      // mesmo payload de get_public_os; ambos retornam NULL se não encontrar.
      const { data, error } = isUuid(id)
        ? await supabaseAnon.rpc('get_public_os', { p_os_id: id })
        : await supabaseAnon.rpc('get_public_os_by_code', {
            p_code: extractShortCode(id) ?? '',
          });
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
      // Auto-canonical: o payload (to_jsonb da OS) já traz `public_short_code`,
      // e customer/service_type vêm nos joins — então embelezamos a URL também
      // no modo anônimo. Só na carga inicial pra não brigar com o poll.
      if (!opts?.isPoll) {
        canonicalizeUrl(
          so.public_short_code,
          payload.customer?.name,
          payload.service_type?.name,
        );
      }
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

      // activities (checklist da visita) — já no shape firme de ReportChecklistItem.
      // RLS bloqueia a tabela pro anon, então só chegam por aqui.
      setPublicActivities(
        ((payload.activities || []) as any[]).map((a) => ({
          id: a.id,
          equipment_id: a.equipment_id ?? null,
          equipment_name: a.equipment_name ?? null,
          description: a.description ?? '',
          section: a.section ?? null,
          component: a.component ?? null,
          guidance: a.guidance ?? null,
          conformity_status: a.conformity_status ?? null,
          is_measurement: a.is_measurement === true,
          measured_value: a.measured_value ?? null,
          unit: a.unit ?? null,
          expected_min: a.expected_min ?? null,
          expected_max: a.expected_max ?? null,
          sort_order: a.sort_order ?? 0,
          // Forward-compat: o payload público ainda não traz freq_code (precisa de
          // migration no get_public_os). Sem ele, o cabeçalho de tipo de visita
          // simplesmente não aparece no modo cliente — sem quebrar.
          freq_code: a.freq_code ?? null,
          photos: Array.isArray(a.photos) ? a.photos.filter(Boolean) : [],
          form_template_id: a.form_template_id ?? null,
        })) as ReportChecklistItem[]
      );

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
  }, [id, toast, applyCompany, canonicalizeUrl]);

  const fetchServiceOrder = useCallback(async () => {
    try {
      // Resolve por UUID antigo (`id`) OU por código curto do slug amigável
      // (`public_short_code`). `public_short_code` entra no select pra termos o
      // código em mãos no auto-canonical abaixo.
      let query = db
        .from('service_orders')
        .select(`
          *,
          public_short_code,
          customer:customers(id, name, phone, address, city, state, document, photo_url, latitude, longitude),
          equipment:equipment(id, name, brand, model, serial_number, location, capacity),
          form_template:form_templates(id, name),
          service_type:service_types(id, name, color)
        `);
      query = isUuid(id)
        ? query.eq('id', id!)
        : query.eq('public_short_code', extractShortCode(id) ?? '');
      const { data, error } = await query.maybeSingle();

      // PGRST116 with "0 rows" leaks through some supabase-js versions despite
      // .maybeSingle() — treat it as a clean not-found, never as a UI error.
      if (error && error.code !== 'PGRST116') throw error;
      if (!data) {
        setServiceOrder(null);
        return;
      }

      setServiceOrder(data as any);
      // Auto-canonical: embeleza a barra de endereço pra slug-<codigo>,
      // preservando a query string. UUID antigo continua resolvendo a OS.
      canonicalizeUrl(
        (data as any).public_short_code,
        (data as any).customer?.name,
        (data as any).service_type?.name,
      );
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
  }, [id, toast, fetchCompany, db, canonicalizeUrl]);

  useEffect(() => {
    // Espera a resolução do estado de auth pra escolher o caminho de leitura.
    if (!id || isAuthenticated === null) return;
    if (isAuthenticated === false) {
      // Modo cliente/público (anon): UMA RPC SECURITY DEFINER carrega tudo.
      fetchPublicOS();
    } else {
      // Modo autenticado (técnico): só o carregamento da OS aqui — ele resolve o
      // slug amigável e seta o uuid real (serviceOrder.id). As leituras laterais
      // (fotos/equipamentos/respostas/perfil) são keyed por uuid e rodam no efeito
      // abaixo, disparado quando `resolvedOsId` fica disponível (UUID antigo já
      // vale de imediato; slug só após a OS carregar).
      fetchServiceOrder();
    }
    return () => {
      document.documentElement.style.removeProperty('--primary');
      document.documentElement.style.removeProperty('--ring');
    };
  }, [id, isAuthenticated, fetchPublicOS, fetchServiceOrder]);

  // Leituras laterais do modo autenticado, keyed pelo UUID REAL da OS. Roda assim
  // que `resolvedOsId` existe (imediato pra UUID; pós-load pra slug amigável),
  // evitando o 22P02 que ocorreria se consultassem o slug cru.
  useEffect(() => {
    if (isAuthenticated !== true || !resolvedOsId) return;
    fetchPhotos();
    fetchEquipmentItems();
    fetchFormResponses();
    fetchTechnicianProfile();
    // fetchPhotos/fetchEquipmentItems/fetchFormResponses são estáveis o bastante
    // (sem deps externas que mudem fora de resolvedOsId/db); fetchTechnicianProfile
    // já depende de resolvedOsId. contractId entra na dep pra fetchEquipmentItems
    // re-resolver o ambiente quando o contrato da OS chega DEPOIS (URL = UUID cru,
    // serviceOrder ainda null na 1ª passada) — sem isso o ambiente não viria.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, resolvedOsId, (serviceOrder as any)?.contract_id, fetchTechnicianProfile]);

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
  // Os filtros são por coluna UUID — precisam do uuid REAL da OS (slug amigável
  // nunca casaria o filtro). Por isso o canal só sobe quando `resolvedOsId` existe.
  useEffect(() => {
    if (!resolvedOsId || isAuthenticated !== true) return;

    const channel = db
      .channel(`os-realtime-${resolvedOsId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_orders', filter: `id=eq.${resolvedOsId}` },
        () => { fetchServiceOrder(); fetchTechnicianProfile(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'form_responses', filter: `service_order_id=eq.${resolvedOsId}` },
        () => { fetchFormResponses(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'os_photos', filter: `service_order_id=eq.${resolvedOsId}` },
        () => { fetchPhotos(); }
      )
      .subscribe();

    return () => { db.removeChannel(channel); };
  }, [resolvedOsId, isAuthenticated, fetchServiceOrder, fetchTechnicianProfile]);

  // Reflete o rollup de conformidade do checklist da visita na OS em tempo real,
  // conforme o técnico marca conforme/não-conforme. Idempotente: só grava quando
  // o rollup difere do que já está em service_orders.pmoc_conformity_status.
  // Não roda se a OS já foi concluída (status final não se reabre por aqui).
  useEffect(() => {
    if (isAuthenticated !== true || !resolvedOsId || !hasChecklist || !checklistRollup) return;
    if (serviceOrder?.status === 'concluida' || serviceOrder?.status === 'cancelada') return;
    if ((serviceOrder as any)?.pmoc_conformity_status === checklistRollup) return;
    supabase
      .from('service_orders')
      .update({ pmoc_conformity_status: checklistRollup })
      .eq('id', resolvedOsId)
      .then(({ error }) => {
        if (!error) {
          setServiceOrder((prev) =>
            prev ? ({ ...prev, pmoc_conformity_status: checklistRollup } as any) : prev
          );
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedOsId, isAuthenticated, hasChecklist, checklistRollup, serviceOrder?.status, (serviceOrder as any)?.pmoc_conformity_status]);

  const fetchPhotos = async () => {
    if (!resolvedOsId) return;
    try {
      const { data, error } = await db
        .from('os_photos')
        .select('*')
        .eq('service_order_id', resolvedOsId)
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
  useGeoTracking(resolvedOsId ?? undefined, isTracking, handleLivePosition);

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
        .eq('id', resolvedOsId);

      if (error) throw error;

      if (resolvedOsId) {
        recordLocationEvent(resolvedOsId, location.lat, location.lng, 'check_in');
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

    // OS PMOC com checklist: se ainda há itens sem resposta, NÃO finaliza direto.
    // Abre o modal mostrando quantos faltam (voltar e preencher OU marcar
    // restantes como Conforme e concluir). OS comum não passa por aqui.
    if (isPmocOrder && hasChecklist) {
      // Atividades de conformidade ainda em branco.
      const conformityBlanks = checklistActivities.filter(
        (a) => !a.form_template_id && !a.conformity_status
      ).length;
      // Checklists personalizados (form_template) com perguntas OBRIGATÓRIAS
      // ainda sem resposta — contam como pendência (não podem ser auto-marcadas).
      const templateBlanks = checklistActivities.filter((a) => {
        if (!a.form_template_id) return false;
        const qs = checklistFormQuestions[a.form_template_id] ?? [];
        return !isTemplateActivityComplete(qs, (qid) =>
          getChecklistFormResponse(a.equipment_id ?? null, qid)
        );
      }).length;
      const blanks = conformityBlanks + templateBlanks;
      if (blanks > 0) {
        setPendingChecklistCount(blanks);
        setChecklistGapOpen(true);
        return;
      }
    }

    await proceedFinishOS();
  };

  // Conclusão efetiva da OS (após validações e, quando aplicável, a decisão do
  // modal de checklist em branco). Isolada pra ser reusada pelo modal.
  const proceedFinishOS = async () => {
    setFinishing(true);
    try {
      const location = await getCurrentLocation();
      const now = new Date().toISOString();

      const updateData: any = {
        check_out_time: now,
        check_out_location: location,
        status: 'concluida',
        // Conclusão de verdade limpa a marca de finalização parcial (caso a OS
        // tenha passado por "Finalizar Parcialmente" antes).
        partial_finish: false,
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
        .eq('id', resolvedOsId);

      if (error) throw error;

      // Instrumentação MVP — fire-and-forget, não bloqueia UX
      trackUsage('os_completion', { os_id: resolvedOsId });

      if (resolvedOsId) {
        const { error: ratingError } = await supabase
          .from('service_ratings')
          .insert({ service_order_id: resolvedOsId })
          .select('id')
          .maybeSingle();

        if (ratingError && ratingError.code !== '23505') {
          throw ratingError;
        }
      }

      if (resolvedOsId) {
        recordLocationEvent(resolvedOsId, location.lat, location.lng, 'check_out');
      }

      setCheckOutTime(now);
      setCheckOutLocation(location);
      setServiceOrder((prev) => prev ? { ...prev, status: 'concluida' as OsStatus, check_out_time: now, partial_finish: false } as any : null);

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

  // Escolha (b) do modal: marca TODOS os itens em branco como 'conforme' (bulk
  // update server-side, idempotente) e então conclui a OS. O conteúdo é de
  // responsabilidade do técnico/RT — facilidade de preenchimento, não auditoria.
  const handleMarkRestAndFinish = async () => {
    if (!resolvedOsId) return;
    setMarkingChecklist(true);
    try {
      // Só atividades de CONFORMIDADE em branco viram 'conforme'. Atividades de
      // checklist personalizado (form_template_id) não têm conformidade — não são
      // tocadas (suas perguntas continuam por conta do técnico).
      const { error } = await supabase
        .from('service_order_activities')
        .update({ conformity_status: 'conforme' })
        .eq('service_order_id', resolvedOsId)
        .is('conformity_status', null)
        .is('form_template_id', null);
      if (error) throw error;
      // Recarrega o checklist pra o rollup refletir 'conforme' nas atividades
      // que estavam em branco (proceedFinishOS deriva pmoc_conformity_status do rollup).
      await refetchChecklist();
      setChecklistGapOpen(false);
      setPendingChecklistCount(0);
      await proceedFinishOS();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível concluir',
        description: getErrorMessage(error),
      });
    } finally {
      setMarkingChecklist(false);
    }
  };

  // Selo de conformidade PMOC (Lei Federal 13.589/2018). No modo cliente (anon)
  // o hook `useIsPmocOrder` não passa na RLS, então derivamos do payload público.
  const isPublicMode = forceReadOnly;
  const isPmocPublic = publicContract?.is_pmoc === true;
  const showPmocSeal = isPublicMode ? isPmocPublic : isPmocOrder;

  // RELATÓRIO PARCIAL (link público de OS PAUSADA).
  // Quando a OS está pausada e o cliente abre o link, mostramos o relatório de
  // serviço como se estivesse concluído — porém SEM data de conclusão e exibindo
  // SÓ os equipamentos/checklists 100% preenchidos. Equipamento parcial ou em
  // branco some inteiro; ao retomar e concluir, tudo volta a aparecer.
  const isPausedPublicReport = isPublicMode && serviceOrder?.status === 'pausada';

  // Conjunto de equipamentos 100% completos no modo parcial. Chave = equipment_id
  // (atividade/resposta sem equipamento usa a chave especial '__geral__').
  // Completo = TODAS as atividades do checklist da visita respondidas
  // (conformity_status preenchido; e medição preenchida quando is_measurement)
  // E TODAS as perguntas OBRIGATÓRIAS do formulário respondidas (valor ou foto).
  // Itens opcionais não bloqueiam.
  const GENERAL_KEY = '__geral__';
  const partialCompleteKeys: Set<string> = (() => {
    const keys = new Set<string>();
    if (!isPausedPublicReport) return keys;

    // Universo de chaves candidatas (equipamentos com checklist e/ou formulário).
    const candidateKeys = new Set<string>();
    for (const a of publicActivities) candidateKeys.add(a.equipment_id ?? GENERAL_KEY);
    for (const r of publicFormResponses) candidateKeys.add(r.equipment_id ?? GENERAL_KEY);

    for (const key of candidateKeys) {
      const acts = publicActivities.filter((a) => (a.equipment_id ?? GENERAL_KEY) === key);
      const resps = publicFormResponses.filter((r) => (r.equipment_id ?? GENERAL_KEY) === key);

      // Sem nenhum item → não é "completo" (não aparece).
      if (acts.length === 0 && resps.length === 0) continue;

      // "Sem nenhuma resposta" também não aparece: exige ao menos UMA resposta
      // de fato (conformidade marcada ou resposta de formulário preenchida).
      const hasAnyAnswer =
        acts.some((a) => !!a.conformity_status) ||
        resps.some((r: any) => {
          const val = typeof r.response_value === 'string' ? r.response_value.trim() : '';
          return (val !== '' && val !== '-') || !!r.response_photo_url;
        });
      if (!hasAnyAnswer) continue;

      // Checklist da visita: toda atividade de CONFORMIDADE precisa de status;
      // medição exige valor numérico. Atividades de checklist PERSONALIZADO
      // (form_template_id) NÃO têm conformidade — sua completude é avaliada pelas
      // perguntas obrigatórias (requiredFormComplete abaixo), então são ignoradas
      // aqui pra não bloquear o equipamento eternamente.
      const activitiesComplete = acts.every((a) => {
        if ((a as any).form_template_id) return true;
        if (!a.conformity_status) return false;
        if (a.is_measurement && (a.measured_value === null || a.measured_value === undefined)) return false;
        return true;
      });

      // Formulário: só as perguntas OBRIGATÓRIAS travam. Resposta = valor não
      // vazio OU foto. Perguntas opcionais são ignoradas.
      const requiredFormComplete = resps.every((r: any) => {
        const required = r.question?.is_required === true;
        if (!required) return true;
        const val = typeof r.response_value === 'string' ? r.response_value.trim() : '';
        const hasValue = val !== '' && val !== '-';
        const hasPhoto = !!r.response_photo_url;
        return hasValue || hasPhoto;
      });

      if (activitiesComplete && requiredFormComplete) keys.add(key);
    }
    return keys;
  })();

  // Checklist da visita normalizado pro RELATÓRIO (read-only). Os dois modos
  // convergem pro MESMO shape (ReportChecklistItem):
  // - anônimo: já vem pronto do payload (publicActivities);
  // - autenticado: adaptado de checklistGroups (equipmentName resolvido) +
  //   activity_photos (CSV → array).
  const reportChecklistItems: ReportChecklistItem[] = isPublicMode
    ? (isPausedPublicReport
        ? publicActivities.filter(
            (a) =>
              !a.form_template_id && partialCompleteKeys.has(a.equipment_id ?? GENERAL_KEY)
          )
        : publicActivities.filter((a) => !a.form_template_id))
    : checklistGroups.flatMap((group) =>
        // Atividades de checklist PERSONALIZADO (form_template_id) não são itens
        // de conformidade — saem do relatório de conformidade (suas respostas
        // aparecem na seção de checklists/perguntas).
        group.activities
          .filter((a) => !a.form_template_id)
          .map((a) => ({
          id: a.id,
          equipment_id: a.equipment_id,
          equipment_name: group.equipmentId ? group.equipmentName : null,
          description: a.description,
          section: a.section,
          component: a.component,
          guidance: a.guidance,
          conformity_status: a.conformity_status,
          is_measurement: a.is_measurement,
          measured_value: a.measured_value,
          unit: a.unit,
          expected_min: a.expected_min,
          expected_max: a.expected_max,
          sort_order: a.sort_order,
          freq_code: a.freq_code,
          photos: (a.activity_photos || '').split(',').map((u) => u.trim()).filter(Boolean),
        }))
      );

  // Âncora estável (scroll target) por nome de equipamento no RELATÓRIO/público.
  // Espelha a chave de grupo do ReportChecklist (equipmentName ?? '__geral__').
  const reportGroupAnchorId = (equipmentName: string | null) =>
    `os-report-eq-${encodeURIComponent(equipmentName ?? '__geral__')}`;

  // Itens da sidebar desktop do RELATÓRIO/público: um por equipamento do
  // checklist da visita. Status agregado: vermelho se algum não-conforme;
  // laranja se algum sem resposta; verde se tudo respondido sem não-conforme.
  const reportSidebarItems: OsSidebarItem[] = (() => {
    // Foto/categoria do equipamento por NOME (a chave do grupo é o nome).
    // equipmentItems traz photo_url + category nos dois modos (autenticado via
    // service_order_equipment; anônimo via payload.equipment_items).
    const metaByName = new Map<string, { photoUrl: string | null; categoryColor: string | null }>();
    for (const it of equipmentItems) {
      const nm = it.equipment?.name;
      if (nm && !metaByName.has(nm)) {
        metaByName.set(nm, {
          photoUrl: it.equipment?.photo_url ?? null,
          categoryColor: it.equipment?.category?.color ?? null,
        });
      }
    }
    const byName = new Map<string, ReportChecklistItem[]>();
    for (const it of reportChecklistItems) {
      const key = it.equipment_name ?? '__geral__';
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push(it);
    }
    return Array.from(byName.entries()).map(([key, group]) => {
      const naoConforme = group.some((a) => a.conformity_status === 'nao_conforme');
      const pending = group.some((a) => !a.conformity_status);
      const status: OsSidebarStatus = naoConforme ? 'nao_conforme' : pending ? 'pendente' : 'concluido';
      const name = key === '__geral__' ? 'Geral / Local' : key;
      const meta = key === '__geral__' ? undefined : metaByName.get(key);
      return {
        key,
        anchorId: reportGroupAnchorId(key === '__geral__' ? null : key),
        label: name,
        sublabel: `${group.length} item${group.length > 1 ? 's' : ''}`,
        photoUrl: meta?.photoUrl ?? null,
        categoryColor: meta?.categoryColor ?? null,
        status,
      };
    });
  })();

  // Itens da sidebar desktop do modo PÚBLICO (OS ainda em andamento). Um por
  // equipamento (dedupe por equipment_id). Status agregado combinando:
  //  - atividades do checklist da visita (publicActivities): não-conforme manda;
  //  - respostas do formulário (publicFormResponses): pendente se alguma vazia.
  // Âncora = card de equipamentos (id fixo). Sem dado essencial faltando: o que
  // o payload não traz simplesmente não vira item.
  const publicSidebarItems: OsSidebarItem[] = (() => {
    const seen = new Set<string>();
    const items: OsSidebarItem[] = [];
    for (const it of equipmentItems) {
      if (!it.equipment_id || !it.equipment) continue;
      if (seen.has(it.equipment_id)) continue;
      seen.add(it.equipment_id);
      const acts = publicActivities.filter((a) => a.equipment_id === it.equipment_id);
      const resps = publicFormResponses.filter((r) => r.equipment_id === it.equipment_id);
      const naoConforme = acts.some((a) => a.conformity_status === 'nao_conforme');
      const actPending = acts.some((a) => !a.conformity_status);
      const respPending = resps.some((r) => !r.response_value && !r.response_photo_url);
      const hasAny = acts.length > 0 || resps.length > 0;
      const status: OsSidebarStatus = naoConforme
        ? 'nao_conforme'
        : !hasAny || actPending || respPending
          ? 'pendente'
          : 'concluido';
      items.push({
        key: it.equipment_id,
        anchorId: 'os-public-equipments',
        label: it.equipment.name,
        sublabel: it.equipment.model || it.equipment.brand || null,
        photoUrl: it.equipment.photo_url,
        categoryColor: it.equipment.category?.color || null,
        status,
      });
    }
    return items;
  })();

  // Ambiente por equipment_id (contract_environments.identificacao) pro cabeçalho
  // do checklist da EXECUÇÃO (VisitChecklistPanel). Vem de equipmentItems — modo
  // autenticado resolve via contract_items em fetchEquipmentItems. Map montado uma
  // vez por render; null quando o equipamento não tem ambiente.
  const environmentByEquipmentId = (() => {
    const map = new Map<string, string | null>();
    for (const it of equipmentItems) {
      if (it.equipment_id && !map.has(it.equipment_id)) {
        map.set(it.equipment_id, it.environment_name ?? null);
      }
    }
    return (equipmentId: string | null): string | null =>
      equipmentId ? map.get(equipmentId) ?? null : null;
  })();

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

  // Modo RELATÓRIO: OS concluída (qualquer modo) OU OS pausada vista pelo link
  // público (relatório parcial — só equipamentos 100% prontos, sem data de
  // conclusão). Técnico autenticado numa OS pausada continua no modo de execução.
  if (serviceOrder.status === 'concluida' || isPausedPublicReport) {
    return (
      <div className="min-h-screen bg-background lg:flex lg:flex-col">
        <div
          ref={headerRef}
          className="sticky top-0 z-20 bg-primary text-primary-foreground p-3 sm:p-4 shadow-lg print:hidden"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div className="max-w-2xl mx-auto lg:max-w-screen-2xl lg:px-8 flex items-center gap-3">
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-base sm:text-lg font-bold truncate">OS #{String(serviceOrder.order_number).padStart(6, '0')}</h1>
              <p className="text-xs sm:text-sm opacity-90">Relatório de Serviço</p>
            </div>
            <Badge variant={statusBadgeVariant[serviceOrder.status]}>
              {getOsStatusLabel(serviceOrder.status, (serviceOrder as any).partial_finish)}
            </Badge>
          </div>
        </div>
        <div className="lg:grid lg:grid-cols-[20rem_minmax(0,1fr)_20rem] lg:gap-4 lg:px-8 lg:w-full lg:max-w-screen-2xl lg:mx-auto lg:items-start lg:pt-4">
          <OsEquipmentSidebar
            items={reportSidebarItems}
            onNavigate={(item) => {
              // Abre o accordion do equipamento E rola até a 1ª pergunta — o
              // opener registrado pelo OSReport já usa handleReportUserOpen →
              // scrollReportHeaderToTop (mede depois da animação, para o cabeçalho
              // no topo). Sem scrollToAnchor concorrente (parava na última).
              // item.key = equipment_name ?? '__geral__' = groupKey do relatório.
              reportPmocOpenerRef.current?.(item.key);
            }}
            topPx={headerHeight + 16}
          />
        <main
          className={cn(
            'w-full max-w-2xl lg:max-w-3xl mx-auto p-3 sm:p-4 space-y-4 lg:pb-24',
            // Folga base no MOBILE pro rodapé FIXO do relatório (Baixar PDF + 3
            // pontinhos) não cobrir o fim do conteúdo. Desktop usa lg:pb-24.
            'pb-[calc(4.5rem_+_env(safe-area-inset-bottom))]',
          )}
          // Folga extra quando o affordance de avaliar aparece (empilha acima do
          // rodapé fixo no mobile).
          style={
            !ratingDone && rating && !rating.already_rated
              ? { paddingBottom: 'calc(env(safe-area-inset-bottom) + 8rem)' }
              : undefined
          }
        >
          {/* O selo de conformidade PMOC do RELATÓRIO deixou de ser um banner
              azul separado aqui — agora vive como nota dentro do card CONTRATO
              do próprio relatório (OSReport, prop isPmoc), num único card neutro
              que também entra no PDF. */}
          {/* Carona da avaliação: só no modo cliente, OS concluída e com a
              pesquisa habilitada pela empresa (survey_enabled). Ainda sem
              avaliação → formulário; já avaliada → aviso enxuto de sucesso.
              Estado do drawer controlado aqui pra o affordance reabrir. */}
          {forceReadOnly && id && rating && rating.is_concluded && surveyEnabled && (
            <>
              <OSRatingSurvey
                osId={resolvedOsId ?? id!}
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
          {/* O checklist de conformidade PMOC (read-only) agora vive DENTRO do
              card branco do relatório, como a seção "Checklists da Visita PMOC".
              Threade os itens + âncora pro OSReport (vale nos dois modos: técnico
              autenticado e cliente anônimo). Foto abre no viewer interno do
              OSReport, nunca em nova aba. */}
          <OSReport
            serviceOrder={serviceOrder}
            photos={photos}
            forceReadOnly={forceReadOnly}
            desktopActionFooter
            partialReport={isPausedPublicReport}
            visibleEquipmentKeys={partialCompleteKeys}
            pmocChecklistItems={reportChecklistItems}
            pmocAnchorIdForGroup={reportGroupAnchorId}
            registerPmocOpener={(open) => { reportPmocOpenerRef.current = open; }}
            stickyTopPx={headerHeight}
            isPmoc={showPmocSeal}
          />
          {isPublicMode && isPmocPublic && (
            <PmocComplianceBadge variant="footer" className="pt-2" />
          )}
        </main>
        {/* Spacer (col 3): equilibra a sidebar à esquerda pra o main centralizar no viewport. */}
        <div className="hidden lg:block" aria-hidden />
        </div>

        {/* Viewer de foto do checklist (nunca abre em nova aba) */}
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

  // PUBLIC READ-ONLY MODE for non-authenticated users
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background lg:flex lg:flex-col">
        <div className="bg-primary text-primary-foreground">
          <div className="max-w-2xl mx-auto lg:max-w-screen-2xl lg:px-8 p-3 sm:p-4">
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
                {getOsStatusLabel(serviceOrder.status, (serviceOrder as any).partial_finish)}
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

        <div className="lg:grid lg:grid-cols-[20rem_minmax(0,1fr)_20rem] lg:gap-4 lg:px-8 lg:w-full lg:max-w-screen-2xl lg:mx-auto lg:items-start lg:pt-4">
          <OsEquipmentSidebar
            items={publicSidebarItems}
            onNavigate={(item) => scrollToAnchor(item.anchorId)}
            topPx={16}
          />
        <main className="w-full max-w-2xl lg:max-w-3xl mx-auto p-3 sm:p-4 space-y-3 sm:space-y-4 lg:pb-24">
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
              <Card id="os-public-equipments" className="scroll-mt-6">
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
                {getOsStatusLabel(serviceOrder.status, (serviceOrder as any).partial_finish)}
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

          {/* Real-time checklist responses grouped by (equipment_id, template_id) */}
          {publicFormResponses.length > 0 && (() => {
            // Index by composite key — same equipment may have multiple templates
            const itemByPair = new Map<string, EquipmentItem>();
            equipmentItems.forEach(item => {
              if (item.equipment_id && item.form_template_id) {
                itemByPair.set(`${item.equipment_id}::${item.form_template_id}`, item);
              }
            });

            // Group responses by composite (equipment_id, template_id) so the same
            // equipment can appear in multiple checklist cards.
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
        </main>
        {/* Spacer (col 3): equilibra a sidebar à esquerda pra o main centralizar no viewport. */}
        <div className="hidden lg:block" aria-hidden />
        </div>

        {/* Rodapé de ações fixo (desktop) — link público da OS. */}
        <OsActionFooter>
          <Button variant="outline" className="flex-1" onClick={handleCopyTrackingLink}>
            {trackingLinkCopied ? <Check className="h-4 w-4 mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
            {trackingLinkCopied ? 'Link copiado!' : 'Copiar link'}
          </Button>
        </OsActionFooter>

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

  // Pausar/retomar extraídos pra reuso entre os botões inline (mobile) e o
  // rodapé de ações fixo (desktop) — mesma lógica, sem duplicar.
  const handlePauseOS = async () => {
    try {
      const { error } = await supabase
        .from('service_orders')
        .update({ status: 'pausada' } as any)
        .eq('id', resolvedOsId);
      if (error) throw error;
      setServiceOrder((prev) => prev ? { ...prev, status: 'pausada' as OsStatus } : null);
      toast({ title: 'OS pausada com sucesso!' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro ao pausar OS', description: getErrorMessage(error) });
    }
  };
  const handleResumeOS = async () => {
    try {
      const { error } = await supabase
        .from('service_orders')
        .update({ status: 'em_andamento' })
        .eq('id', resolvedOsId);
      if (error) throw error;
      setServiceOrder((prev) => prev ? { ...prev, status: 'em_andamento' as OsStatus } : null);
      toast({ title: 'OS retomada com sucesso!' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro ao retomar OS', description: getErrorMessage(error) });
    }
  };

  // Finalização PARCIAL — marca a OS como "Parcialmente Concluída": vira pausada
  // + partial_finish=true. NÃO valida obrigatórios/assinatura/PMOC (é
  // intencionalmente incompleta); o progresso já é auto-salvo. Não faz check-out.
  // A marca persiste até a conclusão real (proceedFinishOS limpa partial_finish).
  const handleFinishPartially = async () => {
    setFinishingPartial(true);
    try {
      const { error } = await supabase
        .from('service_orders')
        .update({ status: 'pausada', partial_finish: true } as any)
        .eq('id', resolvedOsId);
      if (error) throw error;
      setServiceOrder((prev) => prev ? { ...prev, status: 'pausada' as OsStatus, partial_finish: true } as any : null);
      setPartialConfirmOpen(false);
      toast({ title: 'OS finalizada parcialmente' });
      navigate(-1);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro ao finalizar parcialmente', description: getErrorMessage(error) });
    } finally {
      setFinishingPartial(false);
    }
  };

  // Itens da sidebar desktop (modo autenticado): um por checklist de equipamento
  // (mesma chave do accordion). Status: pendente até check-in; depois deriva das
  // validações do form + conformidade do checklist da visita por equipamento.
  // Itens da junção que realmente carregam questionário (form template).
  // Em visita PMOC os equipamentos vêm sem questionário (a rotina vem do
  // "Checklist da visita"), então o card "Checklists" não deve aparecer.
  const questionnaireItems = equipmentItems.filter((i) => i.form_template_id);

  const interactiveSidebarItems: OsSidebarItem[] = (() => {
    if (!isCheckedIn) return [];
    const items: OsSidebarItem[] = [];
    const seen = new Set<string>();
    equipmentItems.forEach((item, idx) => {
      if (!item.form_template_id) return;
      const itemKey = item.equipment_id
        ? `${item.equipment_id}::${item.form_template_id}`
        : `standalone-${item.form_template_id}-${idx}`;
      if (seen.has(itemKey)) return;
      seen.add(itemKey);
      const validation = formValidations[itemKey];
      const formPending = validation ? !validation.isValid : true;
      // Conformidade do checklist da visita pro mesmo equipamento (se houver).
      const grp = item.equipment_id
        ? checklistGroups.find((g) => g.equipmentId === item.equipment_id)
        : undefined;
      const naoConforme = grp?.activities.some((a) => a.conformity_status === 'nao_conforme');
      const status: OsSidebarStatus = naoConforme
        ? 'nao_conforme'
        : formPending
          ? 'pendente'
          : 'concluido';
      items.push({
        key: itemKey,
        anchorId: `os-eq-${itemKey}`,
        label: item.equipment?.name || item.form_template?.name || 'Checklist',
        sublabel: item.equipment?.model || item.equipment?.brand || item.form_template?.name || null,
        photoUrl: item.equipment?.photo_url,
        categoryColor: item.equipment?.category?.color || null,
        status,
      });
    });

    // Visita PMOC: equipamentos não vêm de questionários e sim do checklist da
    // visita (checklistGroups). Monta um item por grupo, com a MESMA chave estável
    // do accordion do VisitChecklistPanel (`equipmentId ?? '__local__'`) pra o
    // clique abrir o checklist certo. Status = mesmo critério do badge do painel.
    if (hasChecklist) {
      checklistGroups.forEach((group) => {
        const groupKey = group.equipmentId ?? '__local__';
        if (seen.has(groupKey)) return;
        seen.add(groupKey);
        const total = group.activities.length;
        // "Feita": conformidade marcada OU checklist personalizado com todas as
        // perguntas obrigatórias respondidas.
        const answered = group.activities.filter((a) => {
          if (a.form_template_id) {
            const qs = checklistFormQuestions[a.form_template_id] ?? [];
            return isTemplateActivityComplete(qs, (qid) =>
              getChecklistFormResponse(a.equipment_id ?? null, qid)
            );
          }
          return !!a.conformity_status;
        }).length;
        const naoConforme = group.activities.some((a) => {
          if (a.form_template_id) {
            const qs = checklistFormQuestions[a.form_template_id] ?? [];
            return qs.some(
              (q) =>
                q.question_type === 'boolean' &&
                getChecklistFormResponse(a.equipment_id ?? null, q.id)?.response_value === 'false'
            );
          }
          return a.conformity_status === 'nao_conforme';
        });
        const status: OsSidebarStatus = naoConforme
          ? 'nao_conforme'
          : answered === total && total > 0
            ? 'concluido'
            : 'pendente';
        items.push({
          key: groupKey,
          anchorId: `os-pmoc-${groupKey}`,
          label: group.equipmentName,
          sublabel:
            [group.equipment?.brand, group.equipment?.model].filter(Boolean).join(' ') || null,
          photoUrl: group.equipment?.photo_url ?? null,
          categoryColor: group.equipment?.category?.color ?? null,
          status,
        });
      });
    }

    return items;
  })();

  const handleEnRoute = async () => {
    try {
      const location = await getCurrentLocation();
      
      // Record location FIRST so the tracking map can find it
      if (resolvedOsId) {
        await recordLocationEvent(resolvedOsId, location.lat, location.lng, 'en_route');
      }

      const { error } = await supabase
        .from('service_orders')
        .update({ status: 'a_caminho' })
        .eq('id', resolvedOsId);

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
  // Só há rota pra mostrar se existe um destino (coord do cliente/OS ou endereço).
  const hasRouteDestination = hasCustomerCoords || !!destAddress;

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

  // Bloco ÚNICO de contexto renderizado na LATERAL no desktop (acima dos
  // equipamentos): Cliente → Técnico → Execução (Check-in/out) → Descrição do
  // serviço, em UMA borda só, com seções separadas por divisor. No mobile estes
  // dados seguem no fluxo central (os cards correspondentes são `lg:hidden`).
  const sidebarContextBlocks = (
    <div className="rounded-lg border border-border bg-card divide-y divide-border">
      {/* Cliente */}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <User className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Cliente</span>
        </div>
        <p className="font-semibold text-sm break-words">{serviceOrder.customer?.name}</p>
        {serviceOrder.customer?.phone && (
          <a href={`tel:${serviceOrder.customer.phone}`} className="flex items-center gap-1.5 text-xs text-primary mt-1">
            <Phone className="h-3 w-3 shrink-0" />
            {serviceOrder.customer.phone}
          </a>
        )}
        {(isServiceAddress && destAddress ? destAddress : serviceOrder.customer?.address) && (
          <p className="text-xs text-muted-foreground flex items-start gap-1.5 mt-1">
            <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="break-words">
              {isServiceAddress && destAddress
                ? destAddress
                : `${serviceOrder.customer?.address}${serviceOrder.customer?.city ? `, ${serviceOrder.customer.city}` : ''}${serviceOrder.customer?.state ? ` - ${serviceOrder.customer.state}` : ''}`}
            </span>
          </p>
        )}
      </div>

      {/* Técnico */}
      {technicianProfile && (
        <div className="p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Wrench className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Técnico</span>
          </div>
          <div className="flex items-center gap-2.5">
            {technicianProfile.avatar_url ? (
              <SignedImg
                src={technicianProfile.avatar_url}
                alt={technicianProfile.full_name}
                className="h-9 w-9 rounded-full object-cover border shrink-0 cursor-pointer"
                onClick={() => setPreviewPhoto(technicianProfile.avatar_url)}
              />
            ) : (
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-primary" />
              </div>
            )}
            <p className="font-medium text-sm break-words min-w-0">{technicianProfile.full_name}</p>
          </div>
        </div>
      )}

      {/* Execução (Check-in / Check-out) */}
      {(checkInTime || checkOutTime) && (
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Execução</span>
          </div>
          {checkInTime && (
            <div>
              <p className="text-[11px] text-muted-foreground font-semibold">CHECK-IN</p>
              <p className="text-xs font-medium text-foreground">
                {format(new Date(checkInTime), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          )}
          {checkOutTime && (
            <div>
              <p className="text-[11px] text-muted-foreground font-semibold">CHECK-OUT</p>
              <p className="text-xs font-medium text-foreground">
                {format(new Date(checkOutTime), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Descrição do serviço */}
      {serviceOrder.description && (
        <div className="p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Descrição do serviço</p>
          <p className="text-sm break-words">{serviceOrder.description}</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background lg:flex lg:flex-col">
      {/* Header fixo no topo: o botão Voltar fica sempre acessível ao rolar */}
      <div
        ref={headerRef}
        className="sticky top-0 z-20 bg-primary text-primary-foreground shadow-md"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-2xl mx-auto lg:max-w-screen-2xl lg:px-8 p-3 sm:p-4">
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
              {getOsStatusLabel(serviceOrder.status, (serviceOrder as any).partial_finish)}
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

      <div className="lg:grid lg:grid-cols-[20rem_minmax(0,1fr)_20rem] lg:gap-4 lg:px-8 lg:w-full lg:max-w-screen-2xl lg:mx-auto lg:items-start lg:pt-4">
        <OsEquipmentSidebar
          items={interactiveSidebarItems}
          // Abre o accordion do equipamento E rola até a 1ª pergunta (mesmo
          // caminho do clique no cabeçalho): handleExecUserOpen → setOpenExecKey +
          // scrollExecHeaderToTop (mede depois da animação, para o cabeçalho no
          // topo). item.key casa com a chave única dos dois accordions (os-eq-* /
          // os-pmoc-*). Sem o scrollIntoView antigo concorrente.
          onNavigate={(item) => handleExecUserOpen(item.key)}
          topPx={headerHeight + 16}
          header={sidebarContextBlocks}
        />
      <main
        className={cn(
          'w-full max-w-2xl lg:max-w-3xl mx-auto p-3 sm:p-4 space-y-3 sm:space-y-4 lg:pb-24',
          // Reserva espaço no MOBILE pro rodapé fixo (faixa preta) não cobrir o
          // conteúdo — só quando o rodapé existe (execução/pausada). No desktop
          // o lg:pb-24 prevalece (rodapé desktop é o OsActionFooter).
          (isCheckedIn || isPaused) && 'pb-[calc(5.5rem_+_env(safe-area-inset-bottom))]',
        )}
      >
        {showPmocSeal && (
          <PmocComplianceBadge variant="ribbon" withTooltip />
        )}
        {/* Rota até o cliente — só quando "a caminho" e há destino (coord ou endereço) */}
        {isACaminho && hasRouteDestination && (
          <Card className="border-indigo-600/30 overflow-hidden">
            <div className="bg-indigo-600 border-b border-indigo-700 px-3 py-2 flex items-center gap-2 text-sm font-medium text-white">
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
                  className="w-full border-transparent bg-indigo-600 text-white hover:bg-indigo-700"
                  onClick={openWaze}
                >
                  <Navigation className="h-4 w-4 mr-2" />
                  Waze
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-transparent bg-indigo-600 text-white hover:bg-indigo-700"
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
        {isACaminho && hasRouteDestination && routeFullscreen && (
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
                className="w-full border-transparent bg-indigo-600 text-white hover:bg-indigo-700"
                onClick={openWaze}
              >
                <Navigation className="h-4 w-4 mr-2" />
                Waze
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full border-transparent bg-indigo-600 text-white hover:bg-indigo-700"
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
                  <Button className="w-full lg:hidden bg-indigo-500 hover:bg-indigo-600 text-white" size="lg" onClick={handleEnRoute}>
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
              <Button className="w-full lg:hidden" size="lg" onClick={handleCheckIn} variant={isPending ? 'outline' : 'default'}>
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
              {/* Retomar no mobile vive no rodapé fixo (faixa preta) abaixo. */}
            </CardContent>
          </Card>
        )}

        {/* Check-in timestamp — no desktop migra pra lateral (sidebarContextBlocks) */}
        {isCheckedIn && (
          <div className="space-y-2 lg:hidden">
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

        {/* Client Info — no desktop migra pra lateral (sidebarContextBlocks) */}
        <Card className="lg:hidden">
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

        {/* Descrição do Serviço — no desktop migra pra lateral (sidebarContextBlocks) */}
        {serviceOrder.description && (
          <Card className="lg:hidden">
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

        {/* Checklists - Multi equipment from junction table (accordion) */}
        {isCheckedIn && questionnaireItems.length > 0 && (
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
              <Accordion
                type="single"
                collapsible
                value={openExecKey ?? ''}
                onValueChange={(v) => handleExecUserOpen(v || null)}
                className={`w-full ${isPaused ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
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
                  // Ambiente do equipamento (igual ao PMOC): ambiente do contrato
                  // quando existe; senão o local cadastrado no equipamento.
                  const environmentName =
                    environmentByEquipmentId(item.equipment_id) ||
                    item.equipment?.location ||
                    null;
                  return (
                    <OsEquipmentAccordionItem
                      key={itemKey}
                      item={item}
                      itemKey={itemKey}
                      serviceOrderId={resolvedOsId!}
                      stickyTopPx={headerHeight}
                      isOpen={openExecKey === itemKey}
                      readOnly={isPaused}
                      isComplete={!!isComplete}
                      pendingCount={pendingCount}
                      hasMultipleOnSameEquip={hasMultipleOnSameEquip}
                      environmentName={environmentName}
                      onPreviewPhoto={setPreviewPhoto}
                      onValidationChange={(result) => setFormValidations(prev => ({ ...prev, [itemKey]: result }))}
                    />
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
            onPreviewPhoto={setPreviewPhoto}
            environmentByEquipmentId={environmentByEquipmentId}
            openKey={openExecKey}
            onOpenChange={handleExecUserOpen}
            stickyTopPx={headerHeight}
            formQuestionsByTemplate={checklistFormQuestions}
            getFormResponse={getChecklistFormResponse}
            onSaveFormResponse={saveChecklistFormResponse}
          />
        )}

        {/* Fallback: single checklist from OS (legacy / no junction data) */}
        {isCheckedIn && questionnaireItems.length === 0 && serviceOrder.form_template_id && (
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
                  serviceOrderId={resolvedOsId!}
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
              {/* Assinaturas sempre centralizadas (título + pad), desktop e mobile. */}
              {(serviceOrder as any)?.require_tech_signature && (
                <div className="w-full max-w-md mx-auto text-center [&_p]:text-center [&_button]:mx-auto">
                  <SignaturePad
                    value={techSignature}
                    onChange={setTechSignature}
                    label="Assinatura do Técnico"
                    disabled={isPaused}
                  />
                </div>
              )}
              {(serviceOrder as any)?.require_client_signature && (
                <div className="w-full max-w-md mx-auto text-center [&_p]:text-center [&_button]:mx-auto">
                  <SignaturePad
                    value={clientSignature}
                    onChange={setClientSignature}
                    label="Assinatura do Cliente"
                    disabled={isPaused}
                  />
                </div>
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

        {/* Finalizar/Pausar no mobile: consolidados no rodapé fixo abaixo
            (faixa preta). Nada inline aqui pra não duplicar a mesma ação. */}
      </main>
      {/* Spacer (col 3): equilibra a sidebar à esquerda pra o main centralizar no viewport. */}
      <div className="hidden lg:block" aria-hidden />
      </div>

      {/* Rodapé de ações fixo (desktop) — botões do estado atual, mesmos handlers. */}
      {(isPending || isACaminho) && (
        <OsActionFooter>
          {isPending && (
            <Button className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white" onClick={handleEnRoute}>
              <Navigation className="h-4 w-4 mr-2" />
              A Caminho
            </Button>
          )}
          <Button className="flex-1" onClick={handleCheckIn} variant={isPending ? 'outline' : 'default'}>
            <Play className="h-4 w-4 mr-2" />
            Fazer Check-in
          </Button>
        </OsActionFooter>
      )}
      {isPaused && (
        <OsActionFooter>
          <Button className="flex-1" onClick={handleResumeOS}>
            <Play className="h-4 w-4 mr-2" />
            Retomar OS
          </Button>
        </OsActionFooter>
      )}
      {isCheckedIn && !isPaused && (
        <OsActionFooter>
          <Button
            className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
            onClick={handleFinishOS}
            disabled={finishing}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {finishing ? 'Finalizando...' : 'Finalizar OS'}
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-warning/40 text-warning hover:bg-warning hover:text-white"
            onClick={() => setPartialConfirmOpen(true)}
            disabled={finishingPartial}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Finalizar Parcialmente
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0" aria-label="Mais ações">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="mb-2 min-w-[12rem]">
              <DropdownMenuItem onClick={handlePauseOS} className="text-warning focus:text-warning">
                <Pause className="h-4 w-4 mr-2" />
                Pausar OS
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopyTrackingLink}>
                <Link2 className="h-4 w-4 mr-2" />
                Copiar link do cliente
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </OsActionFooter>
      )}

      {/* Rodapé fixo MOBILE (faixa preta, estilo do header) — só na execução
          (em andamento) ou pausada. Ação primária + menu de 3 pontinhos com as
          demais. Reusa os handlers existentes (idempotentes). Some no desktop
          (lg:hidden) e nunca no relatório/modo cliente (este return é só o
          caminho autenticado/execução). */}
      {(isCheckedIn || isPaused) && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 lg:hidden bg-zinc-900 text-white border-t border-zinc-800 shadow-[0_-4px_16px_rgba(0,0,0,0.25)]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-center gap-2 px-3 py-2.5">
            {isPaused ? (
              <Button
                className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
                size="lg"
                onClick={handleResumeOS}
              >
                <Play className="h-4 w-4 mr-2" />
                Retomar OS
              </Button>
            ) : (
              <>
                {/* Ação primária: ocupa mais espaço (flex-[2]) e size lg. */}
                <Button
                  className="flex-[2] bg-success hover:bg-success/90 text-success-foreground"
                  size="lg"
                  onClick={handleFinishOS}
                  disabled={finishing}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {finishing ? 'Finalizando...' : 'Finalizar OS'}
                </Button>
                {/* Ação secundária: laranja saturado com texto branco, MESMA
                    altura do primário (size lg). Mais estreito (flex-1 vs
                    flex-[2]), mas "Finalizar OS" verde segue como destaque. */}
                <Button
                  className="flex-1 bg-warning text-white hover:bg-warning/90"
                  size="lg"
                  onClick={() => setPartialConfirmOpen(true)}
                  disabled={finishingPartial}
                >
                  Finalizar Parcial
                </Button>
              </>
            )}
            {/* modal={false}: NÃO trava o scroll do body (react-remove-scroll). Sem
                isso, abrir o menu tirava o anchor do cabeçalho sticky do
                equipamento (o lock muda o container de rolagem e o
                IntersectionObserver perdia o stuck) — o cabeçalho sumia. */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-11 w-11 text-white hover:bg-white/10"
                  aria-label="Mais ações"
                >
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              {/* Ferramentas NÃO entram aqui: vivem só no FAB de Ferramentas. */}
              <DropdownMenuContent side="top" align="end" className="mb-2 min-w-[12rem]">
                {!isPaused ? (
                  <DropdownMenuItem onClick={handlePauseOS} className="text-warning focus:text-warning">
                    <Pause className="h-4 w-4 mr-2" />
                    Pausar OS
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={handleFinishOS}
                    disabled={finishing}
                    className="text-success focus:text-success"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Finalizar OS
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleCopyTrackingLink}>
                  <Link2 className="h-4 w-4 mr-2" />
                  Copiar link do cliente
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

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

      {/* Modal: OS PMOC com itens do checklist sem resposta ao finalizar.
          Mobile vira drawer de baixo (ResponsiveModal). Voltar = não finaliza;
          marcar restantes como Conforme = bulk update + conclui. */}
      <ResponsiveModal
        open={checklistGapOpen}
        onOpenChange={(o) => { if (!markingChecklist) setChecklistGapOpen(o); }}
        title="Checklist incompleto"
        footer={
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:flex-1"
              disabled={markingChecklist}
              onClick={() => setChecklistGapOpen(false)}
            >
              Voltar e preencher
            </Button>
            <Button
              className="w-full sm:flex-1 bg-success hover:bg-success/90 text-success-foreground"
              disabled={markingChecklist}
              onClick={handleMarkRestAndFinish}
            >
              {markingChecklist
                ? 'Concluindo...'
                : `Marcar ${pendingChecklistCount} como Conforme e concluir`}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 py-1">
          <p className="text-sm text-foreground">
            Faltam <strong>{pendingChecklistCount}</strong> item{pendingChecklistCount > 1 ? 's' : ''} do
            checklist sem resposta. Você pode voltar e preencher, ou marcar
            {' '}{pendingChecklistCount > 1 ? `os ${pendingChecklistCount} restantes` : 'o restante'}
            {' '}como <strong>Conforme</strong> para concluir agora.
          </p>
          <p className="text-xs text-muted-foreground">
            Isto é apenas uma facilidade de preenchimento: o conteúdo é de
            responsabilidade do técnico e do responsável técnico, e o sistema não
            se responsabiliza pelo que for preenchido.
          </p>
        </div>
      </ResponsiveModal>

      {/* Modal: confirmação de finalização PARCIAL. Mobile vira drawer de baixo
          (ResponsiveModal). A OS fica marcada como "Parcialmente Concluída" e
          aparece nas OS pausadas até ser concluída de verdade. */}
      <ResponsiveModal
        open={partialConfirmOpen}
        onOpenChange={(o) => { if (!finishingPartial) setPartialConfirmOpen(o); }}
        title="Finalizar parcialmente?"
        footer={
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:flex-1"
              disabled={finishingPartial}
              onClick={() => setPartialConfirmOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              className="w-full sm:flex-1 bg-warning hover:bg-warning/90 text-white"
              disabled={finishingPartial}
              onClick={handleFinishPartially}
            >
              {finishingPartial ? 'Finalizando...' : 'Finalizar Parcialmente'}
            </Button>
          </div>
        }
      >
        <div className="space-y-2 py-1">
          <p className="text-sm text-foreground">
            A OS ficará marcada como <strong>Parcialmente Concluída</strong> e
            aparecerá nas OS pausadas até ser concluída de verdade.
          </p>
          <p className="text-xs text-muted-foreground">
            O que você já preencheu fica salvo. Você pode retomar e concluir
            quando terminar o serviço.
          </p>
        </div>
      </ResponsiveModal>

      {/* FAB EXCLUSIVO de Ferramentas do Técnico (canto inferior esquerdo, ícone de
          ferramenta — não 3 pontinhos). Função única → toque abre direto. Fica
          MAIS ACIMA quando o rodapé fixo mobile (faixa preta) aparece, pra não
          sobrepor. Só renderiza quando há ferramentas (segmento refrigeração) e
          fica oculto enquanto o overlay das Ferramentas está aberto. */}
      {showTools && !toolsOpen && (
        <SpeedDialFAB
          actions={speedDialActions}
          side="left"
          mainIcon={FerramentasTecnicoIcon}
          ariaLabel="Ferramentas do Técnico"
          directWhenSingle
          bottomOffsetPx={isCheckedIn || isPaused ? 84 : 0}
        />
      )}

      {/* Overlay fullscreen: mesmo componente da tela de Ferramentas do Técnico.
          A OS continua montada por baixo (toolsOpen é estado local), então o
          técnico volta exatamente onde estava. A navegação interna virou estado
          (abas), então não precisa mais de router dedicado. */}
      {toolsOpen && (
        // z-50 (não z-[60]): os dropdowns das ferramentas (Select/Popover) são
        // portados pro <body> no z-50 padrão. Com o overlay em z-[60] eles
        // abriam ATRÁS dele (overlay opaco) e sumiam. Igualando em z-50, os
        // portais — que vêm depois no DOM (body > #root) — pintam por cima,
        // mesmo arranjo de Dialog+Select já usado no app. Mobile-first, sem
        // regressão no modo rota.
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          {/* Conteúdo das ferramentas. Padding inferior reserva espaço pro rodapé
              sticky "Voltar para OS" (b-0) não tampar o último item ao rolar. */}
          <div
            className="flex-1 overflow-auto p-5 pb-24 sm:p-6 sm:pb-28"
            style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}
          >
            <TechnicianTools embedded />
          </div>
          {/* Rodapé sticky vermelho saturado (régua: ação saturada + texto/ícone
              brancos). Largura cheia + safe-area inferior. */}
          <div
            className="shrink-0 border-t border-border bg-background px-3 py-2.5"
            style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
          >
            <Button
              size="lg"
              onClick={() => setToolsOpen(false)}
              className="w-full gap-2 bg-destructive text-white hover:bg-destructive/90"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para OS
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
