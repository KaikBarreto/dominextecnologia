import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, Printer, User, Wrench, Clock, MapPin, Camera, FileSignature, Check, X, Minus, PenTool, Link2, Star, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { PhotoCarousel } from '@/components/ui/PhotoCarousel';
import { cn } from '@/lib/utils';
import { formatSignatureStamp } from '@/lib/signatureStamp';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { supabaseAnon } from '@/integrations/supabase/anonClient';
import type { ServiceOrder, FormQuestion } from '@/types/database';
import { osTypeLabels, getOsTypeLabel } from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { buildServiceOrderShareLink } from '@/utils/shareLinks';
import { ReportHeader, DEFAULT_HEADER_CONFIG } from './ReportHeader';
import type { ReportHeaderConfig } from './ReportHeader';
import { ReportPmocChecklist, pmocGroupKeysFor } from './ReportPmocChecklist';
import { ContractInfoCard } from './ContractInfoCard';
import type { ReportChecklistItem } from './ReportChecklist';
import { OsActionFooter } from './OsDesktopShell';
import dominexLogoWhite from '@/assets/logo-white-horizontal.png';

interface OSPhoto {
  id: string;
  photo_url: string;
  photo_type: string;
  description: string | null;
}

interface FormResponseData {
  id: string;
  question_id: string;
  response_value: string | null;
  response_photo_url: string | null;
  /** Equipamento ao qual a resposta pertence (casa com o grupo de equipamento). */
  equipment_id?: string | null;
  /** Nome real do checklist (template) — usado pra rotular o sub-bloco. */
  template_name?: string | null;
  /** Momento em que a resposta foi gravada — carimbo legal de assinaturas. */
  responded_at?: string | null;
  question: FormQuestion;
}

interface CompanyData {
  name: string;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  logo_url?: string | null;
}

interface EquipmentItem {
  equipment_id: string;
  form_template_id: string | null;
  /**
   * Nome do AMBIENTE do equipamento neste contrato (contract_environments.
   * identificacao), ex.: "1º ANDAR - SALA DO AUGUSTO". null = sem ambiente.
   * Modo anônimo: vem pronto no payload de get_public_os. Modo autenticado:
   * resolvido por query auxiliar em contract_items (mesclado em fetchEquipmentItems).
   */
  environment_name?: string | null;
  equipment: { id: string; name: string; brand: string | null; model: string | null; location: string | null; photo_url: string | null; category: { id: string; name: string; color: string } | null } | null;
  form_template: { id: string; name: string } | null;
}

interface OSReportProps {
  serviceOrder: ServiceOrder & { customer: any; equipment: any; form_template?: any };
  photos: OSPhoto[];
  forceReadOnly?: boolean;
  /**
   * Quando true (layout desktop da tela de OS), além dos botões inline (que
   * passam a `lg:hidden`), renderiza um rodapé de ações FIXO no desktop com os
   * MESMOS handlers (Baixar PDF / Imprimir / Copiar link). Mobile inalterado.
   */
  desktopActionFooter?: boolean;
  /**
   * RELATÓRIO PARCIAL (link público de OS PAUSADA). Quando true:
   * - exibe SÓ os equipamentos/checklists cuja chave está em `visibleEquipmentKeys`
   *   (os 100% preenchidos — cálculo de completude vive em TechnicianOS);
   * - NÃO mostra data de conclusão (check-out), já que a OS não foi concluída.
   * Chave = equipment_id; respostas/itens sem equipamento usam a chave especial
   * `__geral__` (mesma convenção do cálculo em TechnicianOS).
   */
  partialReport?: boolean;
  visibleEquipmentKeys?: Set<string>;
  /**
   * Itens do checklist de CONFORMIDADE PMOC (service_order_activities), já
   * normalizados em TechnicianOS pros dois modos (técnico autenticado e cliente
   * anônimo). Renderizados como a seção CLARA "Checklists da Visita PMOC" DENTRO
   * do card branco, antes dos checklists personalizados. Vazio/ausente = seção
   * não aparece.
   */
  pmocChecklistItems?: ReportChecklistItem[];
  /**
   * Âncora (scroll target) por grupo de equipamento da seção PMOC. Usada pela
   * sidebar EQUIPAMENTOS do desktop pra rolar até cada equipamento.
   */
  pmocAnchorIdForGroup?: (equipmentName: string | null) => string | undefined;
  /**
   * Registra (uma vez) o opener do accordion PMOC pra a página: a sidebar
   * desktop chama `open(groupKey)` ao navegar pra um equipamento, abrindo o
   * accordion dele. groupKey = equipmentName ?? '__geral__' (mesma chave da
   * sidebar). Só desktop. O estado do accordion vive AQUI pra a impressão/PDF
   * poderem forçar tudo aberto sem depender da página.
   */
  registerPmocOpener?: (open: (groupKey: string) => void) => void;
  /**
   * Offset (px) do header fixo da tela de OS. Quando definido, o cabeçalho de
   * cada equipamento do checklist PMOC vira `sticky` e gruda logo ABAIXO do
   * header laranja "OS #..." ao rolar (espelha o `VisitChecklistPanel` da
   * execução). Sem valor = sem sticky (comportamento antigo).
   */
  stickyTopPx?: number;
  /**
   * OS de contrato PMOC. Quando true, o card CONTRATO (dentro do documento)
   * acrescenta a nota "Conforme Lei Federal 13.589/2018" abaixo do nome do
   * contrato. Vem de `showPmocSeal` da página (funciona nos dois modos: técnico
   * autenticado via `useIsPmocOrder` e cliente anônimo via payload público).
   * Substitui o antigo banner azul do topo (fora do documento), centralizando a
   * info de conformidade num único card — que agora também entra no PDF.
   */
  isPmoc?: boolean;
}

const GENERAL_KEY = '__geral__';

// Helper to safely extract joined object (Supabase may return array for some joins)
const unwrapJoin = (val: any) => Array.isArray(val) ? val[0] || null : val;

function ReportImage({ src, alt, className, onClick, wrapperClassName }: { src: string; alt: string; className?: string; onClick?: () => void; wrapperClassName?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div className={wrapperClassName || 'relative inline-block'}>
      {!loaded && !error && (
        <div className={cn('bg-slate-200 animate-pulse rounded-md', className?.replace(/cursor-pointer|hover:opacity-80|transition-opacity/g, '') || 'w-20 h-20')} />
      )}
      <img
        src={src}
        alt={alt}
        className={cn(className, !loaded && 'absolute opacity-0')}
        onClick={onClick}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
      {error && (
        <div className={cn('bg-slate-100 rounded-md flex items-center justify-center text-xs text-slate-400', className?.replace(/cursor-pointer|hover:opacity-80|transition-opacity/g, '') || 'w-20 h-20')}>
          Erro
        </div>
      )}
    </div>
  );
}

export function OSReport({ serviceOrder: rawServiceOrder, photos, forceReadOnly = false, desktopActionFooter = false, partialReport = false, visibleEquipmentKeys, pmocChecklistItems, pmocAnchorIdForGroup, registerPmocOpener, stickyTopPx, isPmoc = false }: OSReportProps) {
  // No modo cliente, usar cliente anônimo para que a RLS avalie como `anon`
  // (e nao como o usuario logado de outra empresa).
  const db = forceReadOnly ? supabaseAnon : supabase;
  // Apply snapshot fallback for deleted entities
  const snapshot = (rawServiceOrder as any).snapshot_data;
  const serviceOrder = {
    ...rawServiceOrder,
    customer: rawServiceOrder.customer || snapshot?.customer || null,
    equipment: rawServiceOrder.equipment || snapshot?.equipment || null,
    form_template: rawServiceOrder.form_template || snapshot?.form_template || null,
    service_type: (rawServiceOrder as any).service_type || snapshot?.service_type || null,
  };

  // Assinatura estável do conjunto de chaves visíveis (modo parcial) pra usar
  // como dependência de efeito sem disparar refetch a cada render (Set é nova
  // referência sempre). Ordenado pra ser determinístico.
  const visibleKeysSig = visibleEquipmentKeys ? Array.from(visibleEquipmentKeys).sort().join(',') : '';

  const reportRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [formResponses, setFormResponses] = useState<FormResponseData[]>([]);
  const [ratingData, setRatingData] = useState<any>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [equipmentItems, setEquipmentItems] = useState<EquipmentItem[]>([]);
  const [contractInfo, setContractInfo] = useState<{ name: string; id: string } | null>(null);
  const [headerConfig, setHeaderConfig] = useState<ReportHeaderConfig>(DEFAULT_HEADER_CONFIG);
  const [isWhiteLabel, setIsWhiteLabel] = useState(false);
  const [technicianInfo, setTechnicianInfo] = useState<{ full_name: string; photo_url: string | null } | null>(null);
  // Single-open UNIFICADO no relatório: uma só chave aberta cruzando os DOIS
  // accordions (checklist PMOC + checklists personalizados). As chaves são
  // únicas entre os grupos: PMOC usa `equipmentName ?? '__geral__'`,
  // personalizados usam `checklist-${gi}`. Abrir qualquer um fecha o anterior.
  // `null` = tudo fechado. Espelha o `openExecKey` da execução (TechnicianOS).
  const [openReportKey, setOpenReportKey] = useState<string | null>(null);
  // PDF/Imprimir: quando true, os DOIS accordions abrem TODAS as suas chaves
  // direto (ignora o single-open), pra a saída sair completa. Restaurado depois.
  const [forcedAllOpen, setForcedAllOpen] = useState(false);
  // Restore do force-open do PDF/Imprimir (guarda a única chave aberta).
  const printRestoreRef = useRef<string | null>(null);
  const printRestoreSetRef = useRef<boolean>(false);
  const { toast } = useToast();

  // Chaves de grupo do checklist PMOC (equipmentName ?? '__geral__'), mesma
  // convenção da sidebar. Foto do equipamento por nome — vem de equipmentItems
  // (carregado nos DOIS modos: autenticado via service_order_equipment, anônimo
  // via payload.equipment_items, ambos com photo_url). Sem foto → ícone Wrench.
  // Deriva as chaves de grupo PMOC da MESMA fonte/ordem que o
  // `ReportPmocChecklist` usa pra renderizar (groupItems: ordena por sort_order e
  // empurra "Geral" pro fim). Assim `pmocGroupKeys[0]` é IDÊNTICO ao `value` do
  // primeiro `AccordionItem` renderizado — sem isso o default (single-open) não
  // casava com o item renderizado e nada abria. Continua sendo só o conjunto de
  // chaves (PMOC abre/fecha pelo `value`), mas agora na ordem real de render.
  const pmocGroupKeys = pmocGroupKeysFor(pmocChecklistItems ?? []);
  const pmocPhotoByName = (() => {
    const map = new Map<string, string | null>();
    for (const it of equipmentItems) {
      const name = it.equipment?.name;
      if (name && !map.has(name)) map.set(name, it.equipment?.photo_url ?? null);
    }
    return map;
  })();
  const pmocPhotoUrlForGroup = (equipmentName: string | null): string | null =>
    equipmentName ? pmocPhotoByName.get(equipmentName) ?? null : null;

  // Ambiente do equipamento por NOME (groupKey = equipment_name). Vem de
  // equipmentItems nos DOIS modos (anônimo: payload.equipment_items já traz
  // environment_name; autenticado: resolvido em fetchEquipmentItems). Mostrado no
  // cabeçalho do grupo do checklist ao lado do nome do equipamento, em fonte leve.
  const environmentByName = (() => {
    const map = new Map<string, string | null>();
    for (const it of equipmentItems) {
      const name = it.equipment?.name;
      if (name && !map.has(name)) map.set(name, it.environment_name ?? null);
    }
    return map;
  })();
  const environmentForGroup = (equipmentName: string | null): string | null =>
    equipmentName ? environmentByName.get(equipmentName) ?? null : null;

  // Tipo/categoria do equipamento por NOME (groupKey). Vem de equipmentItems nos
  // DOIS modos (category aninhada no equipment). Renderiza o badge saturado no
  // cabeçalho do grupo, igual ao preenchimento. Sem categoria → não mostra badge.
  const categoryByName = (() => {
    const map = new Map<string, { name: string; color: string | null } | null>();
    for (const it of equipmentItems) {
      const name = it.equipment?.name;
      if (name && !map.has(name)) map.set(name, it.equipment?.category ?? null);
    }
    return map;
  })();
  const categoryForGroup = (equipmentName: string | null): { name: string; color: string | null } | null =>
    equipmentName ? categoryByName.get(equipmentName) ?? null : null;

  // Resolve o id de âncora (scroll target) de uma chave de grupo do relatório.
  // Agora TODO grupo (PMOC e/ou personalizado) é um AccordionItem do
  // ReportPmocChecklist, cujo id = `os-report-eq-${encodeURIComponent(key)}`
  // (key = equipment_name ?? '__geral__'). Anchor única pra qualquer grupo.
  const reportAnchorIdForKey = (key: string): string =>
    `os-report-eq-${encodeURIComponent(key)}`;

  // Leva o cabeçalho do checklist recém-aberto pro topo (logo abaixo do header
  // fixo da tela de OS, offset = stickyTopPx) DEPOIS do reflow do single-open
  // (os outros fecham e o layout encolhe). Só desktop tem sticky/sidebar, mas o
  // scroll vale nos dois (no mobile stickyTopPx vem indefinido → offset 0, ainda
  // assim leva o cabeçalho pro topo da viewport). Não rola quando key é null
  // (fechou) — quem chama já filtra isso.
  const scrollReportHeaderToTop = (key: string) => {
    const run = () => {
      const el = document.getElementById(reportAnchorIdForKey(key));
      if (!el) return;
      // Mede DEPOIS da expansão/colapso do single-open: os irmãos animam fechando
      // e o aberto crescendo por ~200ms (Radix Accordion). Medir antes fixa um
      // alvo que ainda vai se mover e a rolagem para na ÚLTIMA pergunta.
      const top = el.getBoundingClientRect().top + window.scrollY - (stickyTopPx ?? 0);
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    };
    // Espera o fim da animação (0.2s) + reflow antes de medir/rolar.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(run, 260);
      });
    });
  };
  // Abertura PELO USUÁRIO (clique no cabeçalho do checklist na lista): seta a
  // chave única (single-open) e, se abriu de fato, rola pro topo. Fechar (null)
  // NÃO rola. NÃO usar no default inicial nem no force-open do PDF/Imprimir.
  const handleReportUserOpen = (key: string | null) => {
    setOpenReportKey(key);
    if (key) scrollReportHeaderToTop(key);
  };

  // Expõe o opener pra a página (sidebar desktop): abre o grupo clicado (single-
  // open, fecha o anterior) E rola até a 1ª pergunta — MESMO caminho do clique no
  // cabeçalho do accordion (handleReportUserOpen → scrollReportHeaderToTop, que
  // mede depois da animação e para o cabeçalho no topo). A sidebar não faz mais
  // o scroll antigo (que competia e podia parar na última pergunta).
  const handleReportUserOpenRef = useRef(handleReportUserOpen);
  handleReportUserOpenRef.current = handleReportUserOpen;
  const registeredOpenerRef = useRef(false);
  useEffect(() => {
    if (registeredOpenerRef.current || !registerPmocOpener) return;
    registeredOpenerRef.current = true;
    registerPmocOpener((groupKey: string) => {
      handleReportUserOpenRef.current(groupKey);
    });
  }, [registerPmocOpener]);

  const beforePhotos = photos.filter(p => p.photo_type === 'antes');
  const duringPhotos = photos.filter(p => p.photo_type === 'durante');
  const afterPhotos = photos.filter(p => p.photo_type === 'depois');

  // Geo do check-in/out: jsonb estendido com endereço conciso opcional
  // (reverse geocode no momento da captura — sem migration).
  const checkInLoc = serviceOrder.check_in_location as { lat: number; lng: number; address?: string } | null;
  const checkOutLoc = serviceOrder.check_out_location as { lat: number; lng: number; address?: string } | null;

  const signatureResponses = formResponses.filter(r => r.question?.question_type === 'signature');
  const otherResponses = formResponses.filter(r => r.question?.question_type !== 'signature');

  const isResponseEmpty = (response: FormResponseData): boolean => {
    const val = response.response_value;
    const photo = response.response_photo_url;
    // A response is empty only if BOTH value and photo are missing
    const hasValue = val && val.trim() !== '' && val.trim() !== '-';
    const hasPhoto = !!photo;
    if (response.question?.question_type === 'signature') return !val;
    return !hasValue && !hasPhoto;
  };

  // ── Checklists PERSONALIZADOS por equipamento ────────────────────────────────
  // Agora vivem DENTRO do accordion do equipamento (depois das seções PMOC), em
  // vez de num accordion top-level separado. Estrutura:
  //   groupKey (= equipment_name ?? '__geral__')  →  [{ templateName, responses }]
  // groupKey casa com a chave de grupo do PMOC (groupKeyForName), pra mesclar no
  // mesmo accordion. Respostas sem equipment_id → grupo '__geral__'.

  // Resolve o NOME do equipamento (= groupKey do PMOC) a partir do equipment_id.
  const equipmentNameById = (() => {
    const map = new Map<string, string>();
    for (const it of equipmentItems) {
      if (it.equipment_id && it.equipment?.name && !map.has(it.equipment_id)) {
        map.set(it.equipment_id, it.equipment.name);
      }
    }
    return map;
  })();

  // Nome real do checklist (template) por id de template — fallback pro caso de
  // alguma resposta vir sem `template_name` (ex.: legado). Varre equipamentos +
  // template geral da OS.
  const templateNameById = (() => {
    const map = new Map<string, string>();
    for (const it of equipmentItems) {
      if (it.form_template?.id && it.form_template?.name) map.set(it.form_template.id, it.form_template.name);
    }
    const osTpl = (serviceOrder.form_template as { id?: string; name?: string } | null) || null;
    if (osTpl?.id && osTpl?.name) map.set(osTpl.id, osTpl.name);
    return map;
  })();

  // Nome do checklist pra uma resposta: prioriza `template_name` (vem pronto nos
  // dois modos), depois o mapa por template_id, por fim 'Checklist'.
  const checklistNameFor = (r: FormResponseData): string =>
    r.template_name
    || (r.question?.template_id ? templateNameById.get(r.question.template_id) : undefined)
    || 'Checklist';

  // Map groupKey → sub-blocos { templateName, responses }, só com respostas não
  // vazias e excluindo assinaturas (que têm seção própria mais abaixo).
  const personalizedByGroup = (() => {
    const groups = new Map<string, Map<string, FormResponseData[]>>();
    for (const r of otherResponses) {
      if (isResponseEmpty(r)) continue;
      const eqId = r.equipment_id ?? null;
      const groupKey = (eqId && equipmentNameById.get(eqId)) || GENERAL_KEY;
      const tplName = checklistNameFor(r);
      if (!groups.has(groupKey)) groups.set(groupKey, new Map());
      const byTpl = groups.get(groupKey)!;
      if (!byTpl.has(tplName)) byTpl.set(tplName, []);
      byTpl.get(tplName)!.push(r);
    }
    // Materializa preservando ordem de inserção (templates na ordem que apareceram).
    const out = new Map<string, { templateName: string; responses: FormResponseData[] }[]>();
    for (const [groupKey, byTpl] of groups.entries()) {
      out.set(groupKey, Array.from(byTpl.entries()).map(([templateName, responses]) => ({ templateName, responses })));
    }
    return out;
  })();



  useEffect(() => {
    if (forceReadOnly) {
      // Modo cliente (anon): UMA RPC SECURITY DEFINER traz tudo desta OS.
      // Substitui as leituras anon diretas que enumeravam todas as OSs.
      fetchPublicReport();
    } else {
      // Modo autenticado: leituras diretas, como antes.
      fetchCompany();
      fetchAllResponses();
      fetchRating();
      fetchEquipmentItems();
      fetchTechnician();
      if ((serviceOrder as any).contract_id) fetchContract((serviceOrder as any).contract_id);
    }
    // visibleKeysSig: assinatura estável do conjunto de chaves visíveis no modo
    // parcial — refaz o fetch/filtragem quando o cálculo de completude chega.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceOrder.id, forceReadOnly, partialReport, visibleKeysSig]);

  // Chaves de grupo UNIFICADAS do relatório: cada equipamento é UM accordion que
  // contém as seções PMOC + a seção "Checklists Personalizados". Começa pelas
  // chaves PMOC (na ordem de render) e acrescenta os grupos que SÓ têm
  // personalizados (sem item PMOC), com '__geral__' sempre por último.
  const reportGroupKeys = (() => {
    const keys: string[] = [...pmocGroupKeys];
    const seen = new Set(keys);
    for (const groupKey of personalizedByGroup.keys()) {
      if (groupKey === GENERAL_KEY) continue;
      if (!seen.has(groupKey)) { seen.add(groupKey); keys.push(groupKey); }
    }
    // '__geral__' (respostas sem equipamento) vai pro fim — só se houver e ainda
    // não estiver na lista (pode já ter vindo do PMOC).
    if (personalizedByGroup.has(GENERAL_KEY) && !seen.has(GENERAL_KEY)) keys.push(GENERAL_KEY);
    return keys;
  })();
  const reportGroupKeysSig = reportGroupKeys.join('|');

  // Default UNIFICADO: abre o PRIMEIRO grupo do relatório. Reaplica quando a
  // composição de grupos muda (nova chave inicial) e nada foi aberto à mão.
  const firstReportKey = reportGroupKeys[0] ?? null;
  const reportInitSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (reportInitSigRef.current === reportGroupKeysSig) return;
    reportInitSigRef.current = reportGroupKeysSig;
    if (firstReportKey) setOpenReportKey(firstReportKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportGroupKeysSig]);

  useEffect(() => {
    const openAllForPrint = () => {
      // Guarda a única chave aberta e força TODOS os accordions (PMOC +
      // personalizados) abertos — a saída impressa sai completa. O flag evita
      // sobrescrever o restore se beforeprint disparar mais de uma vez.
      if (!printRestoreSetRef.current) {
        printRestoreRef.current = openReportKey;
        printRestoreSetRef.current = true;
      }
      setForcedAllOpen(true);
    };

    const restoreAfterPrint = () => {
      if (printRestoreSetRef.current) {
        setForcedAllOpen(false);
        setOpenReportKey(printRestoreRef.current);
        printRestoreRef.current = null;
        printRestoreSetRef.current = false;
      }
    };

    window.addEventListener('beforeprint', openAllForPrint);
    window.addEventListener('afterprint', restoreAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', openAllForPrint);
      window.removeEventListener('afterprint', restoreAfterPrint);
    };
  }, [openReportKey]);

  // Aplica o branding white-label (estado + header config) a partir do registro
  // de company_settings. Reusado pelo modo autenticado e pelo modo público.
  const applyCompanyData = (data: any | null) => {
    setCompany(null);
    setIsWhiteLabel(false);
    setHeaderConfig(DEFAULT_HEADER_CONFIG);
    if (!data) return;
    setCompany(data);
    const d = data as any;
    const wlEnabled = !!d.white_label_enabled;
    setIsWhiteLabel(wlEnabled);
    setHeaderConfig(wlEnabled ? {
      bgColor: d.report_header_bg_color || DEFAULT_HEADER_CONFIG.bgColor,
      textColor: d.report_header_text_color || DEFAULT_HEADER_CONFIG.textColor,
      logoSize: d.report_header_logo_size || DEFAULT_HEADER_CONFIG.logoSize,
      showLogoBg: d.report_header_show_logo_bg ?? DEFAULT_HEADER_CONFIG.showLogoBg,
      logoBgColor: d.report_header_logo_bg_color || DEFAULT_HEADER_CONFIG.logoBgColor,
      statusBarColor: d.report_status_bar_color || DEFAULT_HEADER_CONFIG.statusBarColor,
      logoType: d.report_header_logo_type || DEFAULT_HEADER_CONFIG.logoType,
    } : DEFAULT_HEADER_CONFIG);
  };

  // MODO CLIENTE (anon): toda a leitura do relatório passa por UMA RPC
  // SECURITY DEFINER (`get_public_os`) que recebe só o id e devolve aquela OS.
  const fetchPublicReport = async () => {
    const { data, error } = await supabaseAnon.rpc('get_public_os', { p_os_id: serviceOrder.id });
    if (error || !data) return;
    const payload = data as any;

    // company white-label
    applyCompanyData(payload.company_settings || null);

    // No relatório PARCIAL (OS pausada) só passam os equipamentos/checklists
    // 100% preenchidos — a chave de pertencimento vem pronta de TechnicianOS.
    const keep = (key: string) => !partialReport || (visibleEquipmentKeys?.has(key) ?? false);

    // form_responses + question(form_questions.*) join — mesmo formato do select direto
    const responses = (payload.form_responses || [])
      .filter((r: any) => keep(r.equipment_id ?? GENERAL_KEY))
      .map((r: any) => ({
        ...r,
        question: unwrapJoin(r.question),
      }));
    const sorted = responses.sort((a: any, b: any) => (a.question?.position ?? 0) - (b.question?.position ?? 0));
    setFormResponses(sorted);

    // rating
    setRatingData(payload.rating || null);

    // equipment_items (já com category aninhada no payload)
    setEquipmentItems(
      ((payload.equipment_items || []) as any[]).filter((it) => keep(it.equipment_id ?? GENERAL_KEY)) as unknown as EquipmentItem[]
    );

    // technician (full_name, avatar_url) com fallback de snapshot
    if (payload.technician) {
      setTechnicianInfo({ full_name: payload.technician.full_name, photo_url: payload.technician.avatar_url });
    } else if (snapshot?.technician) {
      setTechnicianInfo({ full_name: snapshot.technician.full_name, photo_url: snapshot.technician.avatar_url });
    }

    // contract (id, name) com fallback de snapshot
    if (payload.contract) {
      setContractInfo(payload.contract);
    } else if (snapshot?.contract) {
      setContractInfo(snapshot.contract);
    }
  };

  const fetchTechnician = async () => {
    let userId = serviceOrder.technician_id;
    if (!userId) {
      const { data: assignees } = await db.from('service_order_assignees').select('user_id').eq('service_order_id', serviceOrder.id).limit(1);
      userId = (assignees as any)?.[0]?.user_id;
    }
    if (!userId) return;
    const { data } = await db.from('profiles').select('full_name, avatar_url').eq('user_id', userId).maybeSingle();
    if (data) {
      setTechnicianInfo({ full_name: data.full_name, photo_url: data.avatar_url });
    } else if (snapshot?.technician) {
      // Fallback to snapshot if profile was deleted
      setTechnicianInfo({ full_name: snapshot.technician.full_name, photo_url: snapshot.technician.avatar_url });
    }
  };

  const fetchRating = async () => {
    const { data } = await db.from('service_ratings').select('*').eq('service_order_id', serviceOrder.id).maybeSingle();
    if (data) setRatingData(data);
  };

  const fetchCompany = async () => {
    const companyId = (serviceOrder as any).company_id || snapshot?.company?.id || null;
    if (!companyId) return;

    // Reset antes de buscar para nao mostrar branding de outra empresa
    // caso a fetch falhe ou o componente seja reaproveitado entre OSs.
    setCompany(null);
    setIsWhiteLabel(false);
    setHeaderConfig(DEFAULT_HEADER_CONFIG);

    const { data } = await db
      .from('company_settings')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle();
    if (data) applyCompanyData(data);
  };

  const fetchContract = async (contractId: string) => {
    const { data } = await db.from('contracts').select('id, name').eq('id', contractId).maybeSingle();
    if (data) {
      setContractInfo(data);
    } else if (snapshot?.contract) {
      setContractInfo(snapshot.contract);
    }
  };

  const fetchEquipmentItems = async () => {
    const { data } = await db
      .from('service_order_equipment')
      .select(`
        equipment_id,
        form_template_id,
        equipment:equipment(id, name, brand, model, location, photo_url, category:equipment_categories(id, name, color)),
        form_template:form_templates(id, name)
      `)
      .eq('service_order_id', serviceOrder.id);
    if (data) {
      const normalized = (data as any[]).map(item => ({
        ...item,
        equipment: unwrapJoin(item.equipment),
        form_template: unwrapJoin(item.form_template),
      }));
      // Also unwrap nested category inside equipment
      normalized.forEach(item => {
        if (item.equipment && item.equipment.category) {
          item.equipment.category = unwrapJoin(item.equipment.category);
        }
      });

      // Ambiente por equipamento (modo autenticado): o anônimo já recebe
      // `environment_name` pronto no payload de get_public_os; aqui resolvemos via
      // contract_items (equipment_id → contract_environments.identificacao) e
      // mesclamos no item — mesmo dado, mesmo shape nos dois modos. Sem contrato
      // ou sem ambiente: campo fica null e o cabeçalho não mostra " | ambiente".
      const contractId = (serviceOrder as any).contract_id || null;
      if (contractId) {
        const equipmentIds = Array.from(
          new Set(normalized.map((it: any) => it.equipment_id).filter(Boolean))
        );
        if (equipmentIds.length > 0) {
          const { data: ciRows } = await db
            .from('contract_items')
            .select('equipment_id, sort_order, environment:contract_environments(identificacao)')
            .eq('contract_id', contractId)
            .in('equipment_id', equipmentIds);
          if (ciRows) {
            // equipment_id → environment_name (1º ambiente por sort_order; ignora
            // linhas sem ambiente, igual o subselect do get_public_os).
            const envByEqId = new Map<string, string>();
            const sorted = [...(ciRows as any[])].sort(
              (a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity)
            );
            for (const row of sorted) {
              const eqId = row.equipment_id;
              const env = unwrapJoin(row.environment);
              const name = env?.identificacao ?? null;
              if (eqId && name && !envByEqId.has(eqId)) envByEqId.set(eqId, name);
            }
            normalized.forEach((it: any) => {
              it.environment_name = it.equipment_id ? envByEqId.get(it.equipment_id) ?? null : null;
            });
          }
        }
      }

      setEquipmentItems(normalized as unknown as EquipmentItem[]);
    }
  };

  const fetchAllResponses = async () => {
    const { data } = await db
      .from('form_responses')
      .select('id, question_id, response_value, response_photo_url, equipment_id, responded_at, question:form_questions(*, template:form_templates(id, name))')
      .eq('service_order_id', serviceOrder.id);
    if (data) {
      const normalized = (data as any[]).map(r => {
        const question = unwrapJoin(r.question);
        // Nome real do checklist (template) vem do join question→form_templates.
        // Fallback NULL: agrupamento usa 'Checklist' como rótulo genérico.
        const template = question ? unwrapJoin((question as any).template) : null;
        return {
          ...r,
          question,
          template_name: r.template_name ?? template?.name ?? null,
        };
      });
      const sorted = normalized.sort((a, b) => (a.question?.position ?? 0) - (b.question?.position ?? 0));
      setFormResponses(sorted);
    }
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handleCopyLink = () => {
    const url = buildServiceOrderShareLink({
      shortCode: (serviceOrder as any).public_short_code,
      customerName: serviceOrder.customer?.name,
      serviceName: (serviceOrder as any).service_type?.name,
      osId: serviceOrder.id,
    });
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: 'Link copiado!' });
    }).catch(() => {
      toast({ variant: 'destructive', title: 'Erro ao copiar link' });
    });
  };

  const handlePrint = () => {
    // Força todos os accordions (PMOC + personalizados) abertos pra impressão.
    // O beforeprint também faz isso, mas abrir aqui evita corrida com o render.
    if (!printRestoreSetRef.current) {
      printRestoreRef.current = openReportKey;
      printRestoreSetRef.current = true;
    }
    setForcedAllOpen(true);
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    setGenerating(true);

    // Abre TODOS os accordions (PMOC + personalizados) pro conteúdo entrar no
    // DOM antes do clone. Guarda a única chave aberta pra restaurar depois.
    const prevOpen = openReportKey;
    setForcedAllOpen(true);

    // Wait for React to render the open accordions
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 200))));

    try {
      const { generateReportPDF } = await import('@/utils/pdfPageRenderer');
      const orderNum = String(serviceOrder.order_number).padStart(6, '0');
      const companyName = company?.name ? ` | ${company.name}` : '';
      await generateReportPDF(reportRef.current, `OS-${orderNum}${companyName}.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
      toast({ variant: 'destructive', title: 'Erro ao gerar PDF', description: 'Não foi possível montar o relatório em PDF. Tente novamente.' });
    } finally {
      setForcedAllOpen(false);
      setOpenReportKey(prevOpen);
      setGenerating(false);
    }
  };

  const renderResponseItem = (response: FormResponseData, idx: number) => {
    if (isResponseEmpty(response)) return null;

    const hasTextValue = response.response_value && response.response_value.trim() !== '' && response.response_value.trim() !== '-';
    const hasPhoto = !!response.response_photo_url;

    return (
      <div key={response.id} className="flex items-start gap-2 py-2 border-b border-slate-100 last:border-0">
        <span className="text-xs font-bold text-slate-400 mt-0.5 min-w-[20px]">{idx + 1}.</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700 break-words">{response.question?.question}</p>
          <div className="mt-1 space-y-2">
            {response.question?.question_type === 'boolean' ? (
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${response.response_value === 'true' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {response.response_value === 'true' ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {response.response_value === 'true' ? 'Sim' : 'Não'}
              </span>
            ) : response.question?.question_type === 'conformidade' ? (
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                response.response_value === 'Conforme' ? 'bg-emerald-600 text-white'
                  : response.response_value === 'Não Conforme' ? 'bg-red-600 text-white'
                  : 'bg-slate-500 text-white'
              }`}>
                {response.response_value === 'Conforme' ? <Check className="h-3 w-3" /> : response.response_value === 'Não Conforme' ? <X className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                {response.response_value || 'N/A'}
              </span>
            ) : (
              <>
                {hasTextValue && (
                  response.response_value!.includes('|||') ? (
                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                      {response.response_value!.split('|||').filter(Boolean).map((val, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          <Check className="h-3 w-3" />
                          {val.trim()}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 break-words">{response.response_value}</p>
                  )
                )}
                {hasPhoto && (() => {
                  const urls = response.response_photo_url!.split(',').filter(Boolean).map(u => u.trim());
                  const openFullscreen = (i: number) => { setGalleryImages(urls); setGalleryIndex(i); setPreviewImage(urls[i]); };
                  return (
                    <>
                      {/* Mobile-tela: carrossel (foto grande, swipe). Escondido no desktop e SEMPRE no print
                          pra impressão/PDF nunca perder foto — o grid abaixo cobre esses casos. */}
                      <div className="md:hidden print:hidden">
                        <PhotoCarousel
                          urls={urls}
                          onOpen={openFullscreen}
                          renderImage={(url, alt, imgClassName) => (
                            <ReportImage src={url} alt={alt} className={imgClassName} wrapperClassName="block w-full h-full" />
                          )}
                        />
                      </div>
                      {/* Desktop-tela + SEMPRE no print: grid com TODAS as fotos visíveis (como antes). */}
                      <div className="hidden md:flex print:flex flex-wrap gap-2">
                        {urls.map((url, i) => (
                          <ReportImage key={i} src={url} alt="Resposta" className="w-20 h-20 object-cover rounded-md border cursor-pointer hover:opacity-80 transition-opacity" onClick={() => openFullscreen(i)} />
                        ))}
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
    <div className="space-y-4">
      {/* Report content.
          IMPORTANTE: o `reportRef` NÃO pode ter `overflow-hidden` — um ancestral
          com overflow:hidden vira o contêiner de recorte do `position: sticky` e
          quebra os cabeçalhos grudentos dos checklists (PMOC + personalizados). O
          arredondamento das pontas vem do `rounded-lg` (canto externo) + um
          wrapper de clip SÓ no cabeçalho colorido (sibling do conteúdo, não
          ancestral do sticky). PDF/Imprimir não dependem de sticky. */}
      <div ref={reportRef} className="bg-white text-black rounded-lg print-report" style={{ fontFamily: "'Montserrat', sans-serif" }}>
        {/* Wrapper de clip do cabeçalho: arredonda só as pontas de cima sem criar
            um overflow-clip que alcance o conteúdo (sticky) abaixo. */}
        <div className="overflow-hidden rounded-t-lg">
          <ReportHeader
            company={company ? {
              ...company,
              icon_url: isWhiteLabel ? (company as any).white_label_icon_url : undefined,
              logo_url: isWhiteLabel ? (company.logo_url || (company as any).white_label_logo_url) : company.logo_url,
            } : null}
            orderNumber={String(serviceOrder.order_number).padStart(6, '0')}
            osType={getOsTypeLabel(serviceOrder)}
            checkOutTime={!partialReport && serviceOrder.check_out_time ? format(new Date(serviceOrder.check_out_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : null}
            config={headerConfig}
          />
        </div>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Contract info — card único e neutro (mesmo padrão de CLIENTE /
              EQUIPAMENTO / EXECUÇÃO). Mostra o nome do contrato e, quando PMOC,
              a nota de conformidade "Lei Federal 13.589/2018" como linha
              secundária discreta (sem fundo azul). Substituiu os dois cards
              azuis antigos (banner do topo + card de contrato). Entra no PDF. */}
          {contractInfo && (
            <ContractInfoCard name={contractInfo.name} isPmoc={isPmoc} tone="document" />
          )}

          {/* Client & Equipment */}
          <div className="grid grid-cols-1 gap-4 max-w-full overflow-hidden">
            <div data-pdf-section className="border border-slate-200 rounded-lg p-3 sm:p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Cliente
              </h3>
              <div className="flex gap-3">
                {serviceOrder.customer?.photo_url && (
                  <button
                    type="button"
                    className="w-24 h-24 sm:w-28 sm:h-28 overflow-hidden rounded-lg border border-slate-200 shrink-0 transition-opacity hover:opacity-80"
                    onClick={() => setPreviewImage(serviceOrder.customer.photo_url)}
                  >
                    <img
                      src={serviceOrder.customer.photo_url}
                      alt={serviceOrder.customer.name}
                      className="w-full h-full object-cover"
                    />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{serviceOrder.customer?.name}</p>
                  {serviceOrder.customer?.document && (
                    <p className="text-xs text-slate-500">{serviceOrder.customer.document}</p>
                  )}
                  {serviceOrder.customer?.phone && (
                    <p className="text-sm text-slate-600">{serviceOrder.customer.phone}</p>
                  )}
                  {serviceOrder.customer?.address && (
                    <p className="text-sm text-slate-500 mt-1">
                      {serviceOrder.customer.address}
                      {serviceOrder.customer.city && `, ${serviceOrder.customer.city}`}
                      {serviceOrder.customer.state && ` - ${serviceOrder.customer.state}`}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Equipment(s) - show all from junction or fallback (dedupe equipment_id) */}
            {(() => {
              // Same equipment may appear in N rows with different templates;
              // collapse to a single visual card per equipment for this section.
              const uniqueEquipmentItems: EquipmentItem[] = [];
              const seenEqIds = new Set<string>();
              for (const item of equipmentItems) {
                if (!item.equipment_id || !item.equipment) continue;
                if (seenEqIds.has(item.equipment_id)) continue;
                seenEqIds.add(item.equipment_id);
                uniqueEquipmentItems.push(item);
              }
              return uniqueEquipmentItems.length > 0 ? (
                <div data-pdf-section className="border border-slate-200 rounded-lg p-3 sm:p-4">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Wrench className="h-3.5 w-3.5" /> Equipamento(s)
                    <span className="ml-auto text-slate-400 font-normal">{uniqueEquipmentItems.length}</span>
                  </h3>
                  {(() => {
                    const renderEquipmentItem = (item: EquipmentItem) => item.equipment && (
                      <div key={item.equipment_id} className="flex items-start gap-3">
                        {item.equipment.photo_url && (
                          <img
                            src={item.equipment.photo_url}
                            alt={item.equipment.name}
                            className="h-14 w-14 rounded-lg object-cover border cursor-pointer shrink-0"
                            onClick={() => setPreviewImage(item.equipment!.photo_url)}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-slate-900">{item.equipment.name}</p>
                            {item.equipment.category && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: item.equipment.category.color }}>
                                {item.equipment.category.name}
                              </span>
                            )}
                          </div>
                          {item.equipment.brand && (
                            <p className="text-sm text-slate-600">{item.equipment.brand} {item.equipment.model}</p>
                          )}
                          {item.equipment.location && (
                            <p className="text-xs text-slate-400 mt-0.5">{item.equipment.location}</p>
                          )}
                        </div>
                      </div>
                    );

                    if (uniqueEquipmentItems.length > 3) {
                      return (
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value="equipments" className="border-0">
                            <AccordionTrigger className="hover:no-underline py-2 text-sm text-slate-600">
                              Ver {uniqueEquipmentItems.length} equipamentos
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-3">
                                {uniqueEquipmentItems.map(renderEquipmentItem)}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      );
                    }
                    return (
                      <div className="space-y-3">
                        {uniqueEquipmentItems.map(renderEquipmentItem)}
                      </div>
                    );
                  })()}
                </div>
              ) : !partialReport && serviceOrder.equipment && (
              <div data-pdf-section className="border border-slate-200 rounded-lg p-3 sm:p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5" /> Equipamento(s)
                </h3>
                <p className="font-semibold text-slate-900">{serviceOrder.equipment.name}</p>
                <p className="text-sm text-slate-600">
                  {serviceOrder.equipment.brand} {serviceOrder.equipment.model}
                </p>
                {serviceOrder.equipment.serial_number && (
                  <p className="text-xs text-slate-400 mt-1">S/N: {serviceOrder.equipment.serial_number}</p>
                )}
                {serviceOrder.equipment.location && (
                  <p className="text-xs text-slate-400">Local: {serviceOrder.equipment.location}</p>
                )}
              </div>
            );
            })()}
          </div>

          {/* Description */}
          {serviceOrder.status !== 'concluida' && serviceOrder.status !== 'cancelada' && (serviceOrder.description || (serviceOrder as any).service_type) && (
            <div data-pdf-section className="border border-slate-200 rounded-lg p-3 sm:p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Descrição do Chamado</h3>
              {(serviceOrder as any).service_type && (
                <p className="text-sm font-semibold text-slate-800 mb-1">{(serviceOrder as any).service_type.name}</p>
              )}
              {serviceOrder.description && (
                <p className="text-sm text-slate-700">{serviceOrder.description}</p>
              )}
            </div>
          )}

          {/* Check-in / Check-out */}
          {(serviceOrder.check_in_time || serviceOrder.check_out_time) && (
            <div data-pdf-section className="border border-slate-200 rounded-lg p-3 sm:p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Execução
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {serviceOrder.check_in_time && (
                  <div className="flex items-start gap-3">
                    {technicianInfo?.photo_url && (
                      <button
                        type="button"
                        className="w-12 h-12 rounded-full overflow-hidden border border-slate-200 shrink-0 mt-0.5 transition-opacity hover:opacity-80"
                        onClick={() => setPreviewImage(technicianInfo.photo_url!)}
                      >
                        <img
                          src={technicianInfo.photo_url}
                          alt={technicianInfo.full_name}
                          className="w-full h-full rounded-full object-cover"
                        />
                      </button>
                    )}
                    <div>
                      <p className="text-xs text-slate-400 font-semibold">CHECK-IN</p>
                      {technicianInfo && (
                        <p className="text-sm font-semibold text-slate-700">{technicianInfo.full_name}</p>
                      )}
                      <p className="text-sm font-medium text-slate-800">
                        {format(new Date(serviceOrder.check_in_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                      {checkInLoc && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          {checkInLoc.address && (
                            <p className="flex items-start gap-0.5">
                              <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                              <span className="break-words">{checkInLoc.address}</span>
                            </p>
                          )}
                          <p className={checkInLoc.address ? 'opacity-70 pl-3.5 break-all' : 'flex items-center gap-0.5 break-all'}>
                            {!checkInLoc.address && <MapPin className="h-3 w-3 shrink-0" />}
                            {checkInLoc.lat.toFixed(6)}, {checkInLoc.lng.toFixed(6)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {!partialReport && serviceOrder.check_out_time && (
                  <div className="flex items-start gap-3">
                    {technicianInfo?.photo_url && (
                      <button
                        type="button"
                        className="w-12 h-12 rounded-full overflow-hidden border border-slate-200 shrink-0 mt-0.5 transition-opacity hover:opacity-80"
                        onClick={() => setPreviewImage(technicianInfo.photo_url!)}
                      >
                        <img
                          src={technicianInfo.photo_url}
                          alt={technicianInfo.full_name}
                          className="w-full h-full rounded-full object-cover"
                        />
                      </button>
                    )}
                    <div>
                      <p className="text-xs text-slate-400 font-semibold">CHECK-OUT</p>
                      {technicianInfo && (
                        <p className="text-sm font-semibold text-slate-700">{technicianInfo.full_name}</p>
                      )}
                      <p className="text-sm font-medium text-slate-800">
                        {format(new Date(serviceOrder.check_out_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                      {checkOutLoc && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          {checkOutLoc.address && (
                            <p className="flex items-start gap-0.5">
                              <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                              <span className="break-words">{checkOutLoc.address}</span>
                            </p>
                          )}
                          <p className={checkOutLoc.address ? 'opacity-70 pl-3.5 break-all' : 'flex items-center gap-0.5 break-all'}>
                            {!checkOutLoc.address && <MapPin className="h-3 w-3 shrink-0" />}
                            {checkOutLoc.lat.toFixed(6)}, {checkOutLoc.lng.toFixed(6)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {!partialReport && serviceOrder.check_in_time && serviceOrder.check_out_time && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-500">
                    <strong>Duração:</strong>{' '}
                    {(() => {
                      const diff = new Date(serviceOrder.check_out_time).getTime() - new Date(serviceOrder.check_in_time).getTime();
                      const hours = Math.floor(diff / 3600000);
                      const minutes = Math.floor((diff % 3600000) / 60000);
                      return `${hours}h ${minutes}min`;
                    })()}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Photos */}
          {photos.length > 0 && (
            <div data-pdf-section className="border border-slate-200 rounded-lg p-3 sm:p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5" /> Registro Fotográfico ({photos.length} fotos)
              </h3>
              {[
                { label: 'Antes', items: beforePhotos },
                { label: 'Durante', items: duringPhotos },
                { label: 'Depois', items: afterPhotos },
              ].filter(g => g.items.length > 0).map(group => (
                <div key={group.label} className="mb-3 last:mb-0">
                  <p className="text-xs font-semibold text-slate-600 mb-2 uppercase">{group.label}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {group.items.map(photo => (
                      <img
                        key={photo.id}
                        src={photo.photo_url}
                        alt={photo.photo_type}
                        className="w-full aspect-square object-cover rounded-md border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setPreviewImage(photo.photo_url)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Checklists por equipamento: cada equipamento é UM accordion com as
              seções de conformidade PMOC + a seção "Checklists Personalizados"
              (respostas do questionário daquele equipamento, agrupadas pelo nome
              real do template). Respostas sem equipamento caem no grupo
              "Geral / Local". Fotos abrem no viewer interno, nunca em nova aba. */}
          {(((pmocChecklistItems && pmocChecklistItems.length > 0) || personalizedByGroup.size > 0)) && (
            <ReportPmocChecklist
              isPmoc={isPmoc}
              items={pmocChecklistItems ?? []}
              groupOrder={reportGroupKeys}
              personalizedByGroup={personalizedByGroup}
              renderResponse={renderResponseItem}
              anchorIdForGroup={pmocAnchorIdForGroup}
              photoUrlForGroup={pmocPhotoUrlForGroup}
              environmentForGroup={environmentForGroup}
              categoryForGroup={categoryForGroup}
              stickyTopPx={stickyTopPx}
              forceAllSectionsOpen={forcedAllOpen}
              openKeys={
                forcedAllOpen
                  ? reportGroupKeys
                  : openReportKey
                    ? [openReportKey]
                    : []
              }
              onOpenChange={(keys) => {
                // Single-open unificado: a chave recém-aberta é a que não estava
                // antes; se nada, fechou tudo (null). Accordion `type="multiple"`
                // mas só passamos 0-1 chave — pegamos a última (a que abriu).
                const next = keys.find((k) => k !== openReportKey) ?? (keys.length ? keys[keys.length - 1] : null);
                handleReportUserOpen(next);
              }}
              onPreviewPhoto={(url, images, index) => {
                setGalleryImages(images && images.length > 1 ? images : []);
                setGalleryIndex(index ?? 0);
                setPreviewImage(url);
              }}
            />
          )}

          {/* Service Details */}
          {serviceOrder.status !== 'concluida' && serviceOrder.status !== 'cancelada' && (serviceOrder.diagnosis || serviceOrder.solution || serviceOrder.notes) && (
            <div data-pdf-section className="border border-slate-200 rounded-lg p-3 sm:p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <FileSignature className="h-3.5 w-3.5" /> Detalhes do Serviço
              </h3>
              <div className="space-y-3">
                {serviceOrder.diagnosis && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Diagnóstico</p>
                    <p className="text-sm text-slate-700 mt-0.5 break-words">{serviceOrder.diagnosis}</p>
                  </div>
                )}
                {serviceOrder.solution && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Solução Aplicada</p>
                    <p className="text-sm text-slate-700 mt-0.5 break-words">{serviceOrder.solution}</p>
                  </div>
                )}
                {serviceOrder.notes && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Observações</p>
                    <p className="text-sm text-slate-700 mt-0.5 break-words">{serviceOrder.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Financial Summary */}
          {(serviceOrder.labor_value || serviceOrder.parts_value || serviceOrder.total_value) && (
            <div data-pdf-section className="border border-slate-200 rounded-lg p-3 sm:p-4 bg-slate-50">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Resumo Financeiro</h3>
              <div className="space-y-1 text-sm">
                {serviceOrder.labor_hours && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Horas Trabalhadas</span>
                    <span className="font-medium text-slate-800">{serviceOrder.labor_hours}h</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-600">Mão de Obra</span>
                  <span className="font-medium text-slate-800">{formatCurrency(serviceOrder.labor_value)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Peças / Materiais</span>
                  <span className="font-medium text-slate-800">{formatCurrency(serviceOrder.parts_value)}</span>
                </div>
                <Separator className="my-2 bg-slate-300" />
                <div className="flex justify-between text-base">
                  <span className="font-bold text-slate-900">Total</span>
                  <span className="font-bold text-slate-900">{formatCurrency(serviceOrder.total_value)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Signatures */}
          {(signatureResponses.length > 0 || (serviceOrder as any).tech_signature || (serviceOrder as any).client_signature) && (
            <div data-pdf-section className="border border-slate-200 rounded-lg p-3 sm:p-4">
              {/* Seção de assinaturas é centralizada de propósito (título + conteúdo) — decisão CEO. */}
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center justify-center text-center gap-1.5">
                <PenTool className="h-3.5 w-3.5" /> Assinaturas
              </h3>
              <div className="flex flex-wrap justify-center gap-4">
                {(serviceOrder as any).tech_signature && (() => {
                  // Carimbo SÓ com data/hora + LOCAL (sem nome — decisão CEO).
                  // Local prefere o endereço conciso e cai pra coordenada.
                  const loc = ((serviceOrder as any).tech_signed_location as { lat: number; lng: number; address?: string } | null)
                    ?? checkOutLoc ?? checkInLoc;
                  const stamp = formatSignatureStamp({
                    // OS antiga (sem tech_signature_at): cai pro check-out/check-in.
                    at: (serviceOrder as any).tech_signature_at
                      ?? serviceOrder.check_out_time
                      ?? serviceOrder.check_in_time,
                    geo: loc,
                    address: loc?.address,
                  });
                  return (
                    <div className="flex flex-col items-center text-center">
                      <img src={(serviceOrder as any).tech_signature} alt="Assinatura Técnico" className="h-20 mx-auto border-b-2 border-slate-300 mb-1" />
                      <p className="text-xs text-slate-500 font-semibold">Assinatura do Técnico</p>
                      {stamp && <p className="text-[10px] leading-snug text-slate-500 break-words mt-0.5 max-w-[16rem]">{stamp}</p>}
                    </div>
                  );
                })()}
                {(serviceOrder as any).client_signature && (() => {
                  // Carimbo SÓ com data/hora + LOCAL (sem nome — decisão CEO).
                  const loc = ((serviceOrder as any).client_signed_location as { lat: number; lng: number; address?: string } | null)
                    ?? checkOutLoc ?? checkInLoc;
                  const stamp = formatSignatureStamp({
                    at: (serviceOrder as any).client_signature_at
                      ?? serviceOrder.check_out_time
                      ?? serviceOrder.check_in_time,
                    geo: loc,
                    address: loc?.address,
                  });
                  return (
                    <div className="flex flex-col items-center text-center">
                      <img src={(serviceOrder as any).client_signature} alt="Assinatura Cliente" className="h-20 mx-auto border-b-2 border-slate-300 mb-1" />
                      <p className="text-xs text-slate-500 font-semibold">Assinatura do Cliente</p>
                      {stamp && <p className="text-[10px] leading-snug text-slate-500 break-words mt-0.5 max-w-[16rem]">{stamp}</p>}
                    </div>
                  );
                })()}
                {signatureResponses.map(response => {
                  if (!response.response_value) return null;
                  // Carimbo das assinaturas vindas de perguntas (signature): só
                  // data/hora (responded_at) + geo. Nome de quem assinou NÃO é
                  // registrado nem exibido (decisão CEO).
                  // Sem responded_at não há o que carimbar de útil aqui.
                  const respLoc = checkOutLoc ?? checkInLoc;
                  const stamp = response.responded_at
                    ? formatSignatureStamp({
                        at: response.responded_at,
                        geo: respLoc,
                        address: respLoc?.address,
                      })
                    : null;
                  return (
                    <div key={response.id} className="flex flex-col items-center text-center">
                      <p className="text-sm font-medium text-slate-700 break-words mb-1.5">{response.question?.question}</p>
                      <img src={response.response_value} alt={response.question?.question} className="h-20 mx-auto border-b-2 border-slate-300 mb-1" />
                      <p className="text-xs text-slate-500 font-semibold">Assinatura</p>
                      {stamp && <p className="text-[10px] leading-snug text-slate-500 break-words mt-0.5 max-w-[16rem]">{stamp}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* NPS / Rating Section */}
          {ratingData && ratingData.rated_at && (
            <div data-pdf-section className="border border-slate-200 rounded-lg p-3 sm:p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5" /> Avaliação do Cliente
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div>
                  <p className="text-2xl font-bold text-slate-800">{ratingData.nps_score}</p>
                  <p className="text-xs text-slate-500">NPS (0-10)</p>
                </div>
                <div>
                  <div className="flex justify-center gap-0.5">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} className={`h-4 w-4 ${s <= (ratingData.quality_rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Qualidade</p>
                </div>
                <div>
                  <div className="flex justify-center gap-0.5">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} className={`h-4 w-4 ${s <= (ratingData.punctuality_rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Pontualidade</p>
                </div>
                <div>
                  <div className="flex justify-center gap-0.5">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} className={`h-4 w-4 ${s <= (ratingData.professionalism_rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Profissionalismo</p>
                </div>
              </div>
              {ratingData.comment && (
                <div className="mt-3 p-2 bg-slate-50 rounded text-sm text-slate-700 italic">
                  "{ratingData.comment}"
                  {ratingData.rated_by_name && <span className="block text-xs text-slate-500 mt-1">— {ratingData.rated_by_name}</span>}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div data-pdf-section className="text-center text-xs text-slate-400 pt-4 border-t border-slate-200">
            <p>Relatório gerado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
            {company?.name && <p className="mt-0.5">{company.name}</p>}
          </div>

        </div>
      </div>

      {/* Ações do relatório (mobile/tablet). Quando NÃO há rodapé fixo desktop
          ligado (uso fora da tela de OS), mantém os botões inline. Com o rodapé
          fixo ligado (tela de OS), o mobile usa o rodapé FIXO abaixo (lg:hidden
          aqui evita duplicar). */}
      {!desktopActionFooter && (
        <div className="flex flex-col sm:flex-row gap-2 print:hidden">
          <Button onClick={handleDownloadPDF} disabled={generating} className="flex-1">
            <Download className="h-4 w-4 mr-2" />
            {generating ? 'Gerando PDF...' : 'Baixar PDF'}
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>
          <Button variant="outline" onClick={handleCopyLink}>
            <Link2 className="h-4 w-4 mr-2" />
            Copiar Link
          </Button>
        </div>
      )}

      {/* Rodapé FIXO MOBILE do relatório (faixa baixa, mesmo padrão do rodapé de
          execução): "Baixar PDF" em destaque verde + 3-pontinhos com Imprimir e
          Copiar Link. Via portal pra `position: fixed` não ancorar sob ancestral
          transformado. lg:hidden (no desktop vale o OsActionFooter). Sem ações de
          Finalizar/Pausar — relatório é só leitura, vale também no modo cliente. */}
      {desktopActionFooter && createPortal(
        <div
          className="fixed inset-x-0 bottom-0 z-30 lg:hidden bg-zinc-900 text-white border-t border-zinc-800 shadow-[0_-4px_16px_rgba(0,0,0,0.25)] print:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-center gap-2 px-3 py-2.5">
            <Button
              className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
              size="lg"
              onClick={handleDownloadPDF}
              disabled={generating}
            >
              <Download className="h-4 w-4 mr-2" />
              {generating ? 'Gerando PDF...' : 'Baixar PDF'}
            </Button>
            {/* modal={false}: não trava o scroll do body (consistente com o rodapé
                de execução; evita qualquer salto de layout ao abrir). */}
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
              <DropdownMenuContent side="top" align="end" className="mb-2 min-w-[12rem]">
                <DropdownMenuItem onClick={handleCopyLink}>
                  <Link2 className="h-4 w-4 mr-2" />
                  Copiar Link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePrint}>
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>,
        document.body,
      )}

      {/* Rodapé de ações fixo (desktop) — MESMOS handlers, sem duplicar lógica. */}
      {desktopActionFooter && (
        <OsActionFooter>
          <Button onClick={handleDownloadPDF} disabled={generating} className="flex-1">
            <Download className="h-4 w-4 mr-2" />
            {generating ? 'Gerando PDF...' : 'Baixar PDF'}
          </Button>
          <Button variant="outline" onClick={handlePrint} className="flex-1">
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>
          <Button variant="outline" onClick={handleCopyLink} className="flex-1">
            <Link2 className="h-4 w-4 mr-2" />
            Copiar Link
          </Button>
        </OsActionFooter>
      )}

      {/* Dominex branding (only when no white label) — outside report */}
      {!isWhiteLabel && (
        <div className="flex flex-col items-center gap-1 py-3 print:hidden">
          <img src={dominexLogoWhite} alt="Dominex" className="h-5 object-contain invert dark:invert-0" />
          <span className="text-[10px] text-muted-foreground/80 tracking-wide">www.dominex.app</span>
        </div>
      )}
    </div>

      <ImagePreviewModal
        src={previewImage || ''}
        open={!!previewImage}
        onClose={() => { setPreviewImage(null); setGalleryImages([]); }}
        images={galleryImages.length > 1 ? galleryImages : undefined}
        currentIndex={galleryIndex}
        onNavigate={(i) => { setGalleryIndex(i); setPreviewImage(galleryImages[i]); }}
      />
    </>
  );
}
