import { useRef, useState, useEffect } from 'react';
import { Download, Printer, User, Wrench, Clock, MapPin, Camera, ClipboardCheck, FileSignature, Check, X, PenTool, Link2, Star } from 'lucide-react';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { PhotoCarousel } from '@/components/ui/PhotoCarousel';
import { cn } from '@/lib/utils';
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
import { ReportPmocChecklist } from './ReportPmocChecklist';
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

export function OSReport({ serviceOrder: rawServiceOrder, photos, forceReadOnly = false, desktopActionFooter = false, partialReport = false, visibleEquipmentKeys, pmocChecklistItems, pmocAnchorIdForGroup, registerPmocOpener }: OSReportProps) {
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
  const [openChecklistItems, setOpenChecklistItems] = useState<string[]>([]);
  const printRestoreRef = useRef<string[] | null>(null);
  const pmocPrintRestoreRef = useRef<string[] | null>(null);
  const { toast } = useToast();

  // Chaves de grupo do checklist PMOC (equipmentName ?? '__geral__'), mesma
  // convenção da sidebar. Foto do equipamento por nome — vem de equipmentItems
  // (carregado nos DOIS modos: autenticado via service_order_equipment, anônimo
  // via payload.equipment_items, ambos com photo_url). Sem foto → ícone Wrench.
  const pmocGroupKeys = Array.from(
    new Set((pmocChecklistItems ?? []).map((it) => it.equipment_name ?? GENERAL_KEY))
  );
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

  // Accordion PMOC controlado AQUI: nasce com tudo aberto (igual ao antigo
  // defaultValue). A sidebar desktop abre o grupo via registerPmocOpener; a
  // impressão força tudo aberto (PDF clona+força [data-state]=open, então PDF é
  // seguro independente disto). Reabre p/ todas quando a lista de grupos muda.
  const [openPmocKeys, setOpenPmocKeys] = useState<string[]>([]);
  const pmocKeysSig = pmocGroupKeys.join('|');
  const pmocInitSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (pmocInitSigRef.current === pmocKeysSig) return;
    pmocInitSigRef.current = pmocKeysSig;
    setOpenPmocKeys(pmocGroupKeys);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pmocKeysSig]);

  // Expõe o opener pra a página (sidebar desktop): abre o grupo e mantém os já
  // abertos. Registrado uma vez por instância.
  const registeredOpenerRef = useRef(false);
  useEffect(() => {
    if (registeredOpenerRef.current || !registerPmocOpener) return;
    registeredOpenerRef.current = true;
    registerPmocOpener((groupKey: string) => {
      setOpenPmocKeys((prev) => (prev.includes(groupKey) ? prev : [...prev, groupKey]));
    });
  }, [registerPmocOpener]);

  const beforePhotos = photos.filter(p => p.photo_type === 'antes');
  const duringPhotos = photos.filter(p => p.photo_type === 'durante');
  const afterPhotos = photos.filter(p => p.photo_type === 'depois');

  const checkInLoc = serviceOrder.check_in_location as { lat: number; lng: number } | null;
  const checkOutLoc = serviceOrder.check_out_location as { lat: number; lng: number } | null;

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

  const responsesByTemplate = (() => {
    if (equipmentItems.length <= 1) {
      return [{
        label: serviceOrder.equipment?.name || (serviceOrder.form_template ? serviceOrder.form_template.name : 'Checklist'),
        responses: otherResponses,
      }];
    }

    const groups: { label: string; responses: FormResponseData[]; categoryBadge?: { name: string; color: string } | null }[] = [];
    for (const item of equipmentItems) {
      if (!item.form_template_id) continue;
      // Filter responses scoped to BOTH this equipment AND this template — same equip can
      // appear in multiple rows with different templates, so equipment_id alone is ambiguous.
      const eqResponses = otherResponses.filter(r => {
        const rEqId = (r as any).equipment_id;
        const rTplId = r.question?.template_id;
        if (rEqId) {
          // Scoped response: must match BOTH equipment and template
          return rEqId === item.equipment_id && rTplId === item.form_template_id;
        }
        // Legacy response (no equipment_id): match by template only when the row is standalone
        if (!item.equipment_id) return rTplId === item.form_template_id;
        return false;
      });
      if (eqResponses.length > 0) {
        // When the same equipment has multiple templates, suffix the template name for clarity
        const sameEquipCount = item.equipment_id
          ? equipmentItems.filter(i => i.equipment_id === item.equipment_id && i.form_template_id).length
          : 0;
        const hasMultipleOnSameEquip = sameEquipCount > 1;
        const baseLabel = item.equipment?.name
          ? `${item.equipment.name}${item.equipment.brand ? ` — ${item.equipment.brand} ${item.equipment.model || ''}` : ''}`
          : (item.form_template?.name || 'Checklist');
        const label = hasMultipleOnSameEquip && item.form_template?.name
          ? `${baseLabel} (${item.form_template.name})`
          : baseLabel;
        groups.push({ label, responses: eqResponses, categoryBadge: item.equipment?.category || null });
      }
    }

    const matchedIds = new Set(groups.flatMap(g => g.responses.map(r => r.id)));
    const unmatched = otherResponses.filter(r => !matchedIds.has(r.id));
    if (unmatched.length > 0) {
      // Em vez de um balde "Outros" genérico, nomeia cada checklist pelo NOME do
      // template. O nome vem do mapa template_id → name (montado dos equipamentos)
      // com fallback pra qualquer form_template já visto. Respostas sem template
      // identificável caem num "Outros" residual no fim.
      const templateNames = new Map<string, string>();
      for (const item of equipmentItems) {
        if (item.form_template?.id && item.form_template?.name) {
          templateNames.set(item.form_template.id, item.form_template.name);
        }
      }
      // Respostas avulsas (não casadas com equipamento) costumam pertencer ao
      // checklist GERAL da OS (serviceOrder.form_template) — que não está no mapa
      // acima (esse só varre equipamentos). Sem isso, o nome real some e cai no
      // fallback 'Checklist'. Disponível nos dois modos: autenticado (select) e
      // anônimo (payload de get_public_os via form_template).
      const osTemplate = (serviceOrder.form_template as { id?: string; name?: string } | null) || null;
      if (osTemplate?.id && osTemplate?.name) {
        templateNames.set(osTemplate.id, osTemplate.name);
      }
      const byTemplate = new Map<string, FormResponseData[]>();
      const residual: FormResponseData[] = [];
      for (const r of unmatched) {
        const tplId = r.question?.template_id;
        if (tplId) {
          if (!byTemplate.has(tplId)) byTemplate.set(tplId, []);
          byTemplate.get(tplId)!.push(r);
        } else {
          residual.push(r);
        }
      }
      for (const [tplId, responses] of byTemplate.entries()) {
        groups.push({ label: templateNames.get(tplId) || 'Checklist', responses });
      }
      if (residual.length > 0) groups.push({ label: 'Outros', responses: residual });
    }
    return groups.length > 0 ? groups : [{ label: 'Checklist', responses: otherResponses }];
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

  useEffect(() => {
    const validValues = responsesByTemplate
      .map((group, gi) => (group.responses.some(r => !isResponseEmpty(r)) ? `checklist-${gi}` : null))
      .filter(Boolean) as string[];

    if (validValues.length > 0 && openChecklistItems.length === 0) {
      setOpenChecklistItems(validValues);
    }
  }, [formResponses, equipmentItems.length]);

  useEffect(() => {
    const openAllForPrint = () => {
      printRestoreRef.current = openChecklistItems;
      const validValues = responsesByTemplate
        .map((group, gi) => (group.responses.some(r => !isResponseEmpty(r)) ? `checklist-${gi}` : null))
        .filter(Boolean) as string[];
      setOpenChecklistItems(validValues);
      // PMOC: abre TODOS os grupos pra a impressão capturar o checklist inteiro.
      pmocPrintRestoreRef.current = openPmocKeys;
      setOpenPmocKeys(pmocGroupKeys);
    };

    const restoreAfterPrint = () => {
      if (printRestoreRef.current) {
        setOpenChecklistItems(printRestoreRef.current);
        printRestoreRef.current = null;
      }
      if (pmocPrintRestoreRef.current) {
        setOpenPmocKeys(pmocPrintRestoreRef.current);
        pmocPrintRestoreRef.current = null;
      }
    };

    window.addEventListener('beforeprint', openAllForPrint);
    window.addEventListener('afterprint', restoreAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', openAllForPrint);
      window.removeEventListener('afterprint', restoreAfterPrint);
    };
  }, [openChecklistItems, openPmocKeys, pmocKeysSig, formResponses, equipmentItems.length]);

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
      setEquipmentItems(normalized as unknown as EquipmentItem[]);
    }
  };

  const fetchAllResponses = async () => {
    const { data } = await db
      .from('form_responses')
      .select('id, question_id, response_value, response_photo_url, equipment_id, question:form_questions(*)')
      .eq('service_order_id', serviceOrder.id);
    if (data) {
      const normalized = (data as any[]).map(r => ({
        ...r,
        question: unwrapJoin(r.question),
      }));
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
    printRestoreRef.current = openChecklistItems;
    const allValues = responsesByTemplate
      .map((group, gi) => (group.responses.some(r => !isResponseEmpty(r)) ? `checklist-${gi}` : null))
      .filter(Boolean) as string[];
    setOpenChecklistItems(allValues);
    // PMOC: garante todos os grupos abertos pra impressão (o beforeprint também
    // faz isso, mas abrir aqui evita corrida com o render).
    pmocPrintRestoreRef.current = openPmocKeys;
    setOpenPmocKeys(pmocGroupKeys);
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    setGenerating(true);

    // Open all checklist accordions so content is in the DOM before cloning
    const prevOpen = openChecklistItems;
    const allValues = responsesByTemplate
      .map((group, gi) => (group.responses.some(r => !isResponseEmpty(r)) ? `checklist-${gi}` : null))
      .filter(Boolean) as string[];
    setOpenChecklistItems(allValues);
    // PMOC: abre todos os grupos pro conteúdo entrar no DOM antes do clone.
    const prevPmocOpen = openPmocKeys;
    setOpenPmocKeys(pmocGroupKeys);

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
      setOpenChecklistItems(prevOpen);
      setOpenPmocKeys(prevPmocOpen);
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
      {/* Report content */}
      <div ref={reportRef} className="bg-white text-black rounded-lg overflow-hidden print-report" style={{ fontFamily: "'Montserrat', sans-serif" }}>
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

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Contract info */}
          {contractInfo && (
            <div data-pdf-section className="bg-blue-600 rounded-lg px-4 py-3 flex items-center gap-2">
              <FileSignature className="h-4 w-4 text-white shrink-0" />
              <div>
                <p className="text-xs font-bold text-white/80 uppercase tracking-wider">Contrato</p>
                <p className="text-sm font-semibold text-white">{contractInfo.name}</p>
              </div>
            </div>
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
                            <p className="text-xs text-slate-400 mt-0.5">📍 {item.equipment.location}</p>
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
                        <p className="text-xs text-slate-400 flex items-center gap-0.5 mt-0.5">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="break-all">{checkInLoc.lat.toFixed(6)}, {checkInLoc.lng.toFixed(6)}</span>
                        </p>
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
                        <p className="text-xs text-slate-400 flex items-center gap-0.5 mt-0.5">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="break-all">{checkOutLoc.lat.toFixed(6)}, {checkOutLoc.lng.toFixed(6)}</span>
                        </p>
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

          {/* Checklists da Visita PMOC (conformidade) — seção clara, antes dos
              checklists personalizados. Abre a foto no viewer interno (gallery
              state deste componente), nunca em nova aba. */}
          {pmocChecklistItems && pmocChecklistItems.length > 0 && (
            <ReportPmocChecklist
              items={pmocChecklistItems}
              anchorIdForGroup={pmocAnchorIdForGroup}
              photoUrlForGroup={pmocPhotoUrlForGroup}
              openKeys={openPmocKeys}
              onOpenChange={setOpenPmocKeys}
              onPreviewPhoto={(url, images, index) => {
                setGalleryImages(images && images.length > 1 ? images : []);
                setGalleryIndex(index ?? 0);
                setPreviewImage(url);
              }}
            />
          )}

          {/* Checklist Responses - grouped by equipment (accordions) */}
          {responsesByTemplate.length > 0 && (() => {
            const validGroups = responsesByTemplate.filter(group => group.responses.some(r => !isResponseEmpty(r)));
            if (validGroups.length === 0) return null;
            return (
              <Accordion
                type="multiple"
                value={openChecklistItems}
                onValueChange={setOpenChecklistItems}
                className="w-full space-y-2"
              >
                {validGroups.map((group, gi) => {
                  const nonEmptyResponses = group.responses.filter(r => !isResponseEmpty(r));
                  return (
                    <AccordionItem key={gi} value={`checklist-${gi}`} className="border border-slate-200 rounded-lg overflow-hidden" data-pdf-section>
                      <AccordionTrigger className="hover:no-underline px-3 sm:px-4 py-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                          <ClipboardCheck className="h-3.5 w-3.5" /> {group.label}
                          {(group as any).categoryBadge && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-white normal-case" style={{ backgroundColor: (group as any).categoryBadge.color }}>
                              {(group as any).categoryBadge.name}
                            </span>
                          )}
                          <span className="ml-1 text-slate-400 font-normal normal-case">({nonEmptyResponses.length})</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-3 sm:px-4 pb-3">
                        <div className="space-y-2">
                          {nonEmptyResponses.map((response, idx) => renderResponseItem(response, idx))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            );
          })()}

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
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <PenTool className="h-3.5 w-3.5" /> Assinaturas
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 justify-items-center">
                {(serviceOrder as any).tech_signature && (
                  <div className="flex flex-col items-center text-center">
                    <img src={(serviceOrder as any).tech_signature} alt="Assinatura Técnico" className="h-20 mx-auto border-b-2 border-slate-300 mb-1" />
                    <p className="text-xs text-slate-500 font-semibold">Assinatura do Técnico</p>
                  </div>
                )}
                {(serviceOrder as any).client_signature && (
                  <div className="flex flex-col items-center text-center">
                    <img src={(serviceOrder as any).client_signature} alt="Assinatura Cliente" className="h-20 mx-auto border-b-2 border-slate-300 mb-1" />
                    <p className="text-xs text-slate-500 font-semibold">Assinatura do Cliente</p>
                  </div>
                )}
                {signatureResponses.map(response => (
                  response.response_value && (
                    <div key={response.id} className="flex flex-col items-center text-center">
                      <p className="text-sm font-medium text-slate-700 break-words mb-1.5">{response.question?.question}</p>
                      <img src={response.response_value} alt={response.question?.question} className="h-20 mx-auto border-b-2 border-slate-300 mb-1" />
                      <p className="text-xs text-slate-500 font-semibold">Assinatura</p>
                    </div>
                  )
                ))}
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

      {/* Action buttons at the bottom (mobile/tablet). No desktop com rodapé
          fixo ligado, esconde estes inline pra não duplicar (lg:hidden). */}
      <div className={cn('flex flex-col sm:flex-row gap-2 print:hidden', desktopActionFooter && 'lg:hidden')}>
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
