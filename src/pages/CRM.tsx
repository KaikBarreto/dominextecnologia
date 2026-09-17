import { useState, useMemo, useEffect } from 'react';
import { fuzzyIncludes, cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  TrendingUp,
  Plus,
  DollarSign,
  Search,
  X,
  Users,
  Target,
  Settings2,
  Webhook,
  Workflow,
  LayoutList,
  LayoutGrid,
  User,
  Calendar,
  Pencil,
  GripVertical,
  ListChecks,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { FilterButton } from '@/components/ui/FilterButton';
import {
  useLeads,
  type Lead,
  LEAD_SOURCES,
} from '@/hooks/useLeads';
import { useUsers } from '@/hooks/useUsers';
import { useCrmStages } from '@/hooks/useCrmStages';
import { useCrmPipelines } from '@/hooks/useCrmPipelines';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useProfiles } from '@/hooks/useProfiles';
import { collapseRecurringOccurrences } from '@/lib/taskRecurrence';
import { IconPreview } from '@/components/customers/originIcons';
import { LeadFormDialog } from '@/components/crm/LeadFormDialog';
import { LeadDetailModal } from '@/components/crm/LeadDetailModal';
import { LeadCard } from '@/components/crm/LeadCard';
import { StageManagerDialog } from '@/components/crm/StageManagerDialog';
import { PipelineManagerDialog } from '@/components/crm/PipelineManagerDialog';
import { WebhookManagerDialog } from '@/components/crm/WebhookManagerDialog';
import { LossReasonDialog } from '@/components/crm/LossReasonDialog';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { LeadWonRevenueDialog } from '@/components/financial/LeadWonRevenueDialog';
import { useLeadWonRevenuePrompt } from '@/hooks/useLeadWonRevenuePrompt';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ptBR, enUS, es as esLocale, fr as frLocale, type Locale } from 'date-fns/locale';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { StatCarousel, type StatCarouselItem } from '@/components/mobile/StatCarousel';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { FilterCheckboxGroup, type FilterCheckboxOption } from '@/components/mobile/FilterCheckboxGroup';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import type { LocaleCode } from '@/lib/i18n/locales';
import { readPastedCents } from '@/lib/money-paste-mask';

const DATE_FNS_LOCALES: Record<LocaleCode, Locale> = {
  'pt-br': ptBR,
  en: enUS,
  es: esLocale,
  fr: frLocale,
};

// Filtro de valor (min/max) não grava no banco, mas colar "4.550" num
// `<input type="number">` ainda erra o filtro (o navegador lê ponto como
// decimal internacional e vira 4,55 — o mesmo bug do sócio, só que aqui sem o
// dano de mil vezes numa parcela). `readPastedCents` lê o texto como valor de
// verdade antes do navegador decidir sozinho.
function handleMoneyFilterPaste(e: React.ClipboardEvent<HTMLInputElement>, setValue: (v: string) => void) {
  const cents = readPastedCents(e);
  if (cents == null) return;
  setValue(cents ? (cents / 100).toFixed(2) : '');
}

interface Filters {
  search: string;
  source: string[];
  assignedTo: string[];
  minValue: string;
  maxValue: string;
}

type ViewMode = 'list' | 'kanban';

// Sentinela do filtro "Vendedor" pra representar leads sem NENHUM responsável
// (fila compartilhada da correção da Onda C). Reaproveita o mesmo
// FilterCheckboxGroup/FilterSheet já usados pros outros filtros da tela, em
// vez de criar um mecanismo de filtro novo.
const UNASSIGNED_FILTER_VALUE = '__unassigned__';

export default function CRM() {
  const isMobile = useIsMobile();
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.crm;
  const dfLocale = DATE_FNS_LOCALES[locale];
  const { leads, isLoading, updateLead } = useLeads();
  const { users } = useUsers();
  const { stages: allStages, isLoading: stagesLoading, seedDefaultStages, reorderStages } = useCrmStages();
  const { pipelines, isLoading: pipelinesLoading, defaultPipeline } = useCrmPipelines();

  // Onda C — "cada um vê as suas": filtro no client é UX, a RLS (policy
  // "Leads visiveis apenas ao responsavel") já é quem garante a segurança de
  // verdade. Mesma chave que a RLS espelha (public.user_has_permission),
  // pra tela e banco nunca discordarem sobre quem enxerga o quê.
  const { user, hasPermission } = useAuth();
  const canManageCrm = hasPermission('fn:manage_crm');
  const visibleLeads = useMemo(() => {
    if (canManageCrm) return leads;
    const uid = user?.id;
    if (!uid) return [];
    return leads.filter((lead) => {
      if (lead.assigned_to === uid || lead.created_by === uid) return true;
      return (lead.assignees || []).some((a) => a.user_id === uid);
    });
  }, [leads, canManageCrm, user?.id]);

  // Onda D — multi-pipeline: qual funil está selecionado no topo da tela.
  // Persiste por USUÁRIO em localStorage, namespaced pelo user.id — mesmo
  // padrão já usado em useDomiflixAvatar/useDomiflixDisplayName pra
  // preferência que precisa sobreviver ao reload sem exigir uma coluna nova
  // em user_preferences (fora do escopo do D2: mexer em schema é o D1/D3).
  const pipelineStorageKey = user?.id ? `crm_selected_pipeline_${user.id}` : null;
  const [storedPipelineId, setStoredPipelineId] = useState<string | null>(null);
  useEffect(() => {
    if (!pipelineStorageKey) {
      setStoredPipelineId(null);
      return;
    }
    try {
      setStoredPipelineId(localStorage.getItem(pipelineStorageKey));
    } catch {
      setStoredPipelineId(null);
    }
  }, [pipelineStorageKey]);

  // Tap num chip de estágio (StatCarousel, mobile) filtra a lista por aquele
  // estágio. Declarado aqui (antes de selectPipeline) porque trocar de funil
  // precisa limpar esse filtro — senão a lista mobile "trava vazia" mostrando
  // um estágio que só existia no funil anterior.
  const [stageFilter, setStageFilter] = useState<string | null>(null);

  const selectPipeline = (id: string) => {
    setStoredPipelineId(id);
    if (pipelineStorageKey) {
      try {
        localStorage.setItem(pipelineStorageKey, id);
      } catch {
        // Storage indisponível (modo privado/quota) — a seleção some no reload,
        // mas a tela segue funcionando normalmente nesta sessão.
      }
    }
    // Filtro de estágio (lista mobile) pertence ao funil anterior — trocar de
    // funil sem limpar deixaria a lista vazia "sem explicação" pro usuário.
    setStageFilter(null);
  };

  // Funil resolvido: a preferência salva, se ainda pertencer à empresa (pode
  // ter sido excluída); senão o padrão da empresa; senão o primeiro por posição.
  const selectedPipelineId = useMemo(() => {
    if (storedPipelineId && pipelines.some((p) => p.id === storedPipelineId)) return storedPipelineId;
    return defaultPipeline?.id ?? pipelines[0]?.id ?? null;
  }, [storedPipelineId, pipelines, defaultPipeline]);

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) ?? null;

  // Estágios do funil selecionado — nunca os de outro funil da mesma empresa.
  // Fallback pro conjunto todo enquanto nenhum funil foi resolvido ainda
  // (bootstrap raríssimo de empresa sem nenhum funil), pra não esconder o
  // empty-state "Configure seu funil de vendas" atrás de uma lista vazia.
  const stages = useMemo(
    () => (selectedPipelineId ? allStages.filter((s) => s.pipeline_id === selectedPipelineId) : allStages),
    [allStages, selectedPipelineId],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  // Guardamos só o id do lead aberto no modal de detalhe e derivamos o objeto
  // da lista viva (useLeads) — assim, após uma mutação (ex: troca de estágio),
  // o modal reflete o estado novo sem precisar fechar/reabrir.
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const detailLead = useMemo(
    () => visibleLeads.find((l) => l.id === detailLeadId) ?? null,
    [visibleLeads, detailLeadId],
  );

  // Oferta de lançar a receita quando a oportunidade vai pro estágio de ganho.
  // Só a oferta mora aqui; o gate de permissão, a trava de idempotência
  // (leads.won_transaction_id) e o formulário ficam no hook/dialog.
  const leadWonRevenue = useLeadWonRevenuePrompt();

  // Loss reason dialog
  const [lossDialogOpen, setLossDialogOpen] = useState(false);
  const [pendingLossDrop, setPendingLossDrop] = useState<{ leadId: string; stageId: string; leadTitle: string } | null>(null);

  const [filters, setFilters] = useState<Filters>({
    search: '',
    source: [],
    assignedTo: [],
    minValue: '',
    maxValue: '',
  });

  // Mobile-only: alternância List/Kanban. Default mobile = Lista; desktop = Kanban.
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  // ── Onda E2 — terceira superfície da tela: Funil (kanban de sempre) x
  // Tarefas (lista das tarefas vinculadas a oportunidades). Não persiste —
  // reabrir a tela sempre volta pro Funil, que é o uso principal.
  const [pageTab, setPageTab] = useState<'funil' | 'tarefas'>('funil');
  const [taskSearch, setTaskSearch] = useState('');
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState<string[]>([]);

  const { serviceOrders } = useServiceOrders();
  const { data: profiles = [] } = useProfiles();
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p])), [profiles]);

  // DECISÃO (pedida no briefing): a aba Tarefas mostra as tarefas de TODOS os
  // funis da empresa, não só do funil selecionado no topo. Tarefa é uma lista
  // de afazeres transversal (o vendedor quer ver tudo que tem pra fazer hoje,
  // não só do funil que estava aberto por último) — e o próprio plano da Onda
  // E (E0) descreve a aba como "todas as tarefas com lead_id não nulo", sem
  // recorte por funil. `pipelineSelector` some quando pageTab==='tarefas'
  // pra não sugerir um filtro que não existe.
  const visibleLeadIds = useMemo(() => new Set(visibleLeads.map((l) => l.id)), [visibleLeads]);
  const leadTitleMap = useMemo(() => new Map(visibleLeads.map((l) => [l.id, l.title])), [visibleLeads]);
  const opportunityTasks = useMemo(
    () => (serviceOrders as any[]).filter((o) => o.entry_type === 'tarefa' && o.lead_id && visibleLeadIds.has(o.lead_id)),
    [serviceOrders, visibleLeadIds],
  );
  // Mesma função de colapso de série usada no card da oportunidade
  // (LeadDetailModal) — as duas telas nunca podem divergir sobre "qual
  // ocorrência mostrar" de uma mesma série recorrente.
  const collapsedTasks = useMemo(() => collapseRecurringOccurrences(opportunityTasks), [opportunityTasks]);

  const filteredTasks = useMemo(() => {
    return collapsedTasks.filter((task: any) => {
      if (taskSearch) {
        const leadTitle = leadTitleMap.get(task.lead_id) || '';
        const matchesTitle = fuzzyIncludes(task.task_title, taskSearch);
        const matchesLead = fuzzyIncludes(leadTitle, taskSearch);
        if (!matchesTitle && !matchesLead) return false;
      }
      if (taskAssigneeFilter.length > 0) {
        const ids: string[] = task._assignee_user_ids || [];
        if (!taskAssigneeFilter.some((id) => ids.includes(id))) return false;
      }
      return true;
    });
  }, [collapsedTasks, taskSearch, taskAssigneeFilter, leadTitleMap]);

  // Ordena por data, vencidas primeiro: atrasada (não concluída, data < hoje)
  // vem antes de futura/hoje; sem data fica por último.
  const sortedTasks = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const rank = (task: any) => {
      if (!task.scheduled_date) return 2;
      const isDone = task.status === 'concluida';
      return !isDone && task.scheduled_date < today ? 0 : 1;
    };
    return [...filteredTasks].sort((a: any, b: any) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (!a.scheduled_date) return 1;
      if (!b.scheduled_date) return -1;
      return a.scheduled_date.localeCompare(b.scheduled_date);
    });
  }, [filteredTasks]);

  const taskAssigneeOptions: FilterCheckboxOption[] = users.map((u) => ({ value: u.user_id, label: u.full_name }));

  // visibleLeads recortado só pelo funil selecionado (sem os demais filtros).
  // Existe pra distinguir, no empty-state, "este funil não tem NENHUMA
  // oportunidade ainda" de "tem oportunidade, só não bate com o filtro" — se
  // comparasse com visibleLeads (todos os funis), abrir um funil vazio
  // enquanto outro funil tem leads mostraria a mensagem errada.
  const pipelineLeads = useMemo(
    () => (selectedPipelineId ? visibleLeads.filter((lead) => lead.pipeline_id === selectedPipelineId) : visibleLeads),
    [visibleLeads, selectedPipelineId],
  );

  // Apply filters — em cima de visibleLeads (já recortado por permissão),
  // nunca de `leads` cru, senão total/valor no topo mentiriam pra quem não
  // tem fn:manage_crm.
  const filteredLeads = useMemo(() => {
    return visibleLeads.filter(lead => {
      // Onda D — multi-pipeline: só oportunidades do funil selecionado no
      // topo. leads.pipeline_id é mantido por trigger a partir do stage_id
      // (nunca escrito pelo client) — ver migration 20260918100000.
      if (selectedPipelineId && lead.pipeline_id !== selectedPipelineId) return false;
      if (filters.search) {
        const matchesTitle = fuzzyIncludes(lead.title, filters.search);
        const matchesCustomer = fuzzyIncludes(lead.customers?.name, filters.search);
        if (!matchesTitle && !matchesCustomer) return false;
      }
      if (filters.source.length > 0 && !filters.source.includes(lead.source ?? '')) return false;
      if (filters.assignedTo.length > 0) {
        // Considera TODOS os responsáveis (principal + co-responsáveis), não só assigned_to.
        const leadAssigneeIds = lead.assignees?.length
          ? lead.assignees.map((a) => a.user_id)
          : lead.assigned_to
            ? [lead.assigned_to]
            : [];
        const matchesUnassigned =
          filters.assignedTo.includes(UNASSIGNED_FILTER_VALUE) && leadAssigneeIds.length === 0;
        const matchesAssignee = filters.assignedTo.some(
          (id) => id !== UNASSIGNED_FILTER_VALUE && leadAssigneeIds.includes(id),
        );
        if (!matchesUnassigned && !matchesAssignee) return false;
      }
      if (filters.minValue && (lead.value || 0) < parseFloat(filters.minValue)) return false;
      if (filters.maxValue && (lead.value || 0) > parseFloat(filters.maxValue)) return false;
      return true;
    });
  }, [visibleLeads, filters, selectedPipelineId]);

  // Group filtered leads by stage_id — assign leads without stage to the first stage
  const leadsByStage = useMemo(() => {
    const firstStageId = stages.length > 0 ? stages[0].id : null;
    return filteredLeads.reduce((acc, lead) => {
      const stageId = lead.stage_id || firstStageId || 'unassigned';
      if (!acc[stageId]) acc[stageId] = [];
      acc[stageId].push(lead);
      return acc;
    }, {} as Record<string, Lead[]>);
  }, [filteredLeads, stages]);

  // Calculate value by stage
  const valueByStage = useMemo(() => {
    return Object.entries(leadsByStage).reduce((acc, [stageId, stageLeads]) => {
      acc[stageId] = stageLeads.reduce((sum, lead) => sum + (lead.value || 0), 0);
      return acc;
    }, {} as Record<string, number>);
  }, [leadsByStage]);

  // Compute stats from filtered leads (not all leads)
  const filteredStats = useMemo(() => ({
    total: filteredLeads.length,
    totalValue: filteredLeads.reduce((sum, lead) => sum + (lead.value || 0), 0),
  }), [filteredLeads]);

  const activeFiltersCount =
    (filters.search ? 1 : 0) +
    (filters.source.length > 0 ? 1 : 0) +
    (filters.assignedTo.length > 0 ? 1 : 0) +
    (filters.minValue ? 1 : 0) +
    (filters.maxValue ? 1 : 0);

  const clearFilters = () => {
    setFilters({ search: '', source: [], assignedTo: [], minValue: '', maxValue: '' });
  };

  // Opções pros FilterCheckboxGroup.
  const sourceOptions: FilterCheckboxOption[] = LEAD_SOURCES.map((src) => ({
    value: src,
    label: src,
  }));
  const assignedToOptions: FilterCheckboxOption[] = [
    { value: UNASSIGNED_FILTER_VALUE, label: t.filterUnassigned },
    ...users.map((user) => ({ value: user.user_id, label: user.full_name })),
  ];

  // Rótulo do responsável (ou "Sem responsável") pro badge de filtro ativo.
  const getAssignedToLabel = (id: string) =>
    id === UNASSIGNED_FILTER_VALUE
      ? t.filterUnassigned
      : users.find((u) => u.user_id === id)?.full_name || 'N/A';

  const formatCurrency = (value: number) => formatMoney(value, currency, locale);

  const handleEdit = (lead: Lead) => {
    setEditingLead(lead);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditingLead(null);
  };

  const handleLeadClick = (lead: Lead) => {
    setDetailLeadId(lead.id);
    setDetailOpen(true);
  };

  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    e.dataTransfer.setData('leadId', lead.id);
    e.dataTransfer.setData('leadTitle', lead.title);
    e.dataTransfer.effectAllowed = 'move';
  };

  // Arrastar coluna do funil (cabeçalho do estágio) para reordenar — mesmo
  // mecanismo nativo de drag-and-drop usado pra mover cards entre colunas
  // (sem lib extra), só que a área "arrastável" fica restrita ao cabeçalho,
  // então segurar no card continua movendo o card e nunca a coluna.
  // Só habilitado fora do mobile: no board mobile o gesto de segurar e
  // arrastar colide com o scroll horizontal por toque, e o HTML5 drag nativo
  // não é confiável em touch mesmo — reordenar estágio ali fica pra tela de
  // "Gerenciar estágios" (StageManagerDialog), que já tem essa opção.
  const [draggedStageId, setDraggedStageId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  const handleStageDragStart = (e: React.DragEvent, stageId: string) => {
    e.stopPropagation();
    setDraggedStageId(stageId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('stageId', stageId);
  };

  const handleStageDragEnd = () => {
    setDraggedStageId(null);
    setDragOverStageId(null);
  };

  const handleColumnDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedStageId && draggedStageId !== stageId) setDragOverStageId(stageId);
  };

  const handleColumnDrop = async (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const draggedFromEvent = e.dataTransfer.getData('stageId');
    if (draggedFromEvent) {
      setDragOverStageId(null);
      setDraggedStageId(null);
      if (draggedFromEvent === stageId) return;
      const draggedIndex = stages.findIndex((s) => s.id === draggedFromEvent);
      const targetIndex = stages.findIndex((s) => s.id === stageId);
      if (draggedIndex === -1 || targetIndex === -1) return;
      const newOrder = [...stages];
      const [removed] = newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, removed);
      reorderStages.mutate(newOrder.map((s) => s.id));
      return;
    }
    // Não era arrasto de coluna — trata como drop de card (fluxo já existente).
    await handleDrop(e, stageId);
  };

  // Fonte única pra mudança de estágio — usada pelo drag-and-drop do kanban,
  // pelo menu de ações mobile e pelo select do modal de detalhe. Se o estágio
  // destino é de perda (is_lost), abre o LossReasonDialog em vez de gravar direto.
  // `fromModal` fecha o modal de detalhe antes de abrir o LossReasonDialog pra
  // evitar dois Dialogs Radix empilhados (histórico de bug de foco/pointer-events).
  // Se o destino é de ganho (is_won), grava e DEPOIS oferece lançar a receita.
  const requestStageChange = async (
    lead: Lead,
    stageId: string,
    opts?: { fromModal?: boolean },
  ) => {
    const targetStage = stages.find(s => s.id === stageId);
    if (targetStage?.is_lost) {
      if (opts?.fromModal) setDetailOpen(false);
      setPendingLossDrop({ leadId: lead.id, stageId, leadTitle: lead.title });
      setLossDialogOpen(true);
      return;
    }
    await updateLead.mutateAsync({ id: lead.id, stage_id: stageId });

    // Ganhou → oferece lançar a receita. É OFERTA, NUNCA BLOQUEIO: o estágio
    // acima já foi gravado, e `maybeOpen` é no-op silencioso quando o usuário
    // não pode lançar no Financeiro ou quando esta oportunidade já gerou
    // receita. Vale pros três gatilhos que passam por aqui (arrastar no kanban,
    // select do modal de detalhe e menu de ações do mobile).
    if (targetStage?.is_won) {
      await leadWonRevenue.maybeOpen(
        {
          leadId: lead.id,
          leadTitle: lead.title,
          customerId: lead.customer_id,
          customerName: lead.customers?.name ?? null,
          suggestedAmount: lead.value,
        },
        // Fecha o detalhe ANTES de a oferta abrir — dois Dialogs Radix
        // empilhados já deram bug de foco/pointer-events (mesmo cuidado do
        // LossReasonDialog logo acima).
        { beforeOpen: opts?.fromModal ? () => setDetailOpen(false) : undefined },
      );
    }
  };

  const handleDrop = async (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('leadId');
    if (!leadId) return;
    const lead = visibleLeads.find(l => l.id === leadId);
    if (!lead) return;
    await requestStageChange(lead, stageId);
  };

  const handleLossConfirm = async (reason: string, details: string) => {
    if (!pendingLossDrop) return;
    // Acrescenta o motivo às observações existentes em vez de sobrescrever —
    // o usuário pode já ter escrito algo relevante no lead antes de marcá-lo como perdido.
    const currentLead = visibleLeads.find(l => l.id === pendingLossDrop.leadId);
    const reasonLine = `${t.lossNotePrefix} ${reason}${details ? `\n${details}` : ''}`;
    const existingNotes = currentLead?.notes?.trim();
    const notes = existingNotes ? `${existingNotes}\n\n${reasonLine}` : reasonLine;
    await updateLead.mutateAsync({
      id: pendingLossDrop.leadId,
      stage_id: pendingLossDrop.stageId,
      notes,
    });
    setLossDialogOpen(false);
    setPendingLossDrop(null);
  };

  // Mobile-only: ao mudar de stage via menu de ações no MobileListItem.
  const handleMoveToStage = async (lead: Lead, stageId: string) => {
    await requestStageChange(lead, stageId);
  };

  // Modal de detalhe: mudança de estágio via select. Fecha o modal antes de
  // abrir o LossReasonDialog quando o estágio destino é de perda.
  const handleModalStageChange = (lead: Lead, stageId: string) => {
    requestStageChange(lead, stageId, { fromModal: true });
  };

  // Map stage color to style - supports both legacy named colors and hex
  const getStageHeaderStyle = (color: string): { className?: string; style?: React.CSSProperties } => {
    const legacyMap: Record<string, string> = {
      muted: 'bg-muted-foreground',
      info: 'bg-info',
      warning: 'bg-warning',
      success: 'bg-success',
      destructive: 'bg-destructive',
      primary: 'bg-primary',
    };
    if (legacyMap[color]) return { className: legacyMap[color] };
    return { style: { backgroundColor: color } };
  };

  // Hex resolvido para usar nos chips do StatCarousel.
  const getStageHexFallback = (color: string): string => {
    const legacyMap: Record<string, string> = {
      muted: '#6b7280',
      info: '#0ea5e9',
      warning: '#f59e0b',
      success: '#22c55e',
      destructive: '#ef4444',
      primary: '#2563eb',
    };
    return legacyMap[color] || color || '#6b7280';
  };

  // Stat items pro StatCarousel: 1 chip por stage (count), com cor do stage.
  // Tap no chip filtra leads daquela stage (na view list só mostra essa stage).
  const statItems: StatCarouselItem[] = stages.map((stage) => ({
    key: stage.id,
    label: stage.name,
    count: leadsByStage[stage.id]?.length || 0,
    icon: <TrendingUp className="h-4 w-4" />,
    accentColor: getStageHexFallback(stage.color),
    active: stageFilter === stage.id,
    onClick: () => setStageFilter(stageFilter === stage.id ? null : stage.id),
  }));

  // Lista mobile final: aplica stageFilter por cima dos filtros.
  const mobileListLeads = useMemo(() => {
    if (!stageFilter) return filteredLeads;
    const firstStageId = stages.length > 0 ? stages[0].id : null;
    return filteredLeads.filter((lead) => (lead.stage_id || firstStageId) === stageFilter);
  }, [filteredLeads, stageFilter, stages]);

  // Conteúdo do FilterSheet (mobile) — origem, vendedor, faixa de valor, view toggle.
  const filterSheetContent = (
    <div className="space-y-4">
      <FilterCheckboxGroup
        label={t.filterOrigin}
        options={sourceOptions}
        selected={filters.source}
        onChange={(next) => setFilters((prev) => ({ ...prev, source: next }))}
        emptyLabel={t.filterOriginAll}
      />

      <FilterCheckboxGroup
        label={t.filterSalesperson}
        options={assignedToOptions}
        selected={filters.assignedTo}
        onChange={(next) => setFilters((prev) => ({ ...prev, assignedTo: next }))}
        emptyLabel={t.filterSalespersonAll}
      />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t.filterMinValue}</label>
          <Input
            type="number"
            placeholder={t.filterMinPlaceholder}
            value={filters.minValue}
            onChange={(e) => setFilters(prev => ({ ...prev, minValue: e.target.value }))}
            onPaste={(e) => handleMoneyFilterPaste(e, (v) => setFilters(prev => ({ ...prev, minValue: v })))}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t.filterMaxValue}</label>
          <Input
            type="number"
            placeholder={t.filterMaxPlaceholder}
            value={filters.maxValue}
            onChange={(e) => setFilters(prev => ({ ...prev, maxValue: e.target.value }))}
            onPaste={(e) => handleMoneyFilterPaste(e, (v) => setFilters(prev => ({ ...prev, maxValue: v })))}
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t.filterView}</label>
        <div className="flex rounded-lg border overflow-hidden w-fit">
          <button
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm transition-colors',
              viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
            )}
            onClick={() => setViewMode('list')}
            type="button"
          >
            <LayoutList className="h-4 w-4" /> {t.viewList}
          </button>
          <button
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm transition-colors',
              viewMode === 'kanban' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
            )}
            onClick={() => setViewMode('kanban')}
            type="button"
          >
            <LayoutGrid className="h-4 w-4" /> {t.viewKanban}
          </button>
        </div>
      </div>

      <div className="pt-2 border-t space-y-2">
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t.filterConfig}</label>
        <StageManagerDialog
          pipelineId={selectedPipelineId ?? undefined}
          pipelineName={pipelines.length > 1 ? selectedPipeline?.name : undefined}
        >
          <Button variant="outline" className="w-full justify-start gap-2" type="button">
            <Settings2 className="h-4 w-4" />
            {t.manageStages}
          </Button>
        </StageManagerDialog>
        <PipelineManagerDialog>
          <Button variant="outline" className="w-full justify-start gap-2" type="button">
            <Workflow className="h-4 w-4" />
            {t.managePipelines}
          </Button>
        </PipelineManagerDialog>
        <WebhookManagerDialog>
          <Button variant="outline" className="w-full justify-start gap-2" type="button">
            <Webhook className="h-4 w-4" />
            {t.configWebhooks}
          </Button>
        </WebhookManagerDialog>
      </div>
    </div>
  );

  // Resumo (chip mobile): primeira stage "won" e primeira stage neutra
  const wonStage = stages.find(s => s.is_won);
  const neutralStage = stages.find(s => !s.is_won && !s.is_lost);

  // Resumo (header mobile) — total e valor total como dois chips de destaque.
  const summaryRow = (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-2xl border bg-primary text-white p-3 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-white/70">{t.totalLeads}</p>
          {isLoading ? (
            <Skeleton className="h-7 w-12 mt-1 bg-white/20" />
          ) : (
            <p className="text-2xl font-bold leading-none mt-1">{filteredStats.total}</p>
          )}
        </div>
        <Target className="h-5 w-5 opacity-80 shrink-0" />
      </div>
      <div className="rounded-2xl border bg-success text-white p-3 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-white/70">{t.totalValue}</p>
          {isLoading ? (
            <Skeleton className="h-7 w-20 mt-1 bg-white/20" />
          ) : (
            <p className="text-lg font-bold leading-tight mt-1 truncate">{formatCurrency(filteredStats.totalValue)}</p>
          )}
        </div>
        <DollarSign className="h-5 w-5 opacity-80 shrink-0" />
      </div>
    </div>
  );

  // ------------------------------------------------------------------
  // KANBAN — mesmo bloco usado em mobile e desktop.
  // No mobile, scroll horizontal preservado.
  // ------------------------------------------------------------------
  const kanbanBlock = (
    <div className="overflow-hidden">
      {!isMobile && (
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-5 w-5" />
          <h2 className="text-lg font-semibold">{t.pipeline}</h2>
          {filteredLeads.length !== pipelineLeads.length && (
            <Badge variant="outline" className="ml-2">
              {t.xOfY.replace('{filtered}', String(filteredLeads.length)).replace('{total}', String(pipelineLeads.length))}
            </Badge>
          )}
        </div>
      )}

      {(isLoading || stagesLoading || pipelinesLoading) ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="min-w-[280px] flex-shrink-0">
              <Skeleton className="h-8 w-full mb-4" />
              <div className="space-y-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : stages.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<Settings2 className="h-12 w-12" />}
              title={t.emptyStagesTitle}
              description={t.emptyStagesDesc}
              action={{
                label: seedDefaultStages.isPending ? t.creatingStages : t.startDefaultStages,
                onClick: () => {
                  if (seedDefaultStages.isPending) return;
                  seedDefaultStages.mutate(selectedPipelineId ?? undefined);
                },
              }}
            />
            <div className="flex justify-center">
              <StageManagerDialog
                pipelineId={selectedPipelineId ?? undefined}
                pipelineName={pipelines.length > 1 ? selectedPipeline?.name : undefined}
              >
                <Button variant="outline" size="sm" className="gap-2">
                  <Settings2 className="h-4 w-4" />
                  {t.customizeStages}
                </Button>
              </StageManagerDialog>
            </div>
          </CardContent>
        </Card>
      ) : filteredLeads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <TrendingUp className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">
              {pipelineLeads.length === 0 ? t.emptyOpportunities : t.emptySearch}
            </h3>
            <p className="text-muted-foreground max-w-sm">
              {pipelineLeads.length === 0 ? t.emptyOpportunitiesDesc : t.emptySearchDesc}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto pb-4 -mx-1 px-1">
          <div className="flex items-stretch gap-3 sm:gap-4" style={{ minWidth: `${stages.length * 280}px` }}>
            {stages.map((stage) => (
              <div
                key={stage.id}
                className={cn(
                  'w-[260px] sm:w-[300px] flex-shrink-0 flex flex-col transition-opacity',
                  draggedStageId === stage.id && 'opacity-50',
                )}
                onDragOver={(e) => handleColumnDragOver(e, stage.id)}
                onDragLeave={() => setDragOverStageId((prev) => (prev === stage.id ? null : prev))}
                onDrop={(e) => handleColumnDrop(e, stage.id)}
              >
                <div
                  className={cn(
                    'rounded-t-lg p-3 text-white shrink-0',
                    !isMobile && 'cursor-grab active:cursor-grabbing',
                    dragOverStageId === stage.id && 'ring-2 ring-inset ring-white',
                    getStageHeaderStyle(stage.color).className,
                  )}
                  style={getStageHeaderStyle(stage.color).style}
                  draggable={!isMobile}
                  onDragStart={(e) => handleStageDragStart(e, stage.id)}
                  onDragEnd={handleStageDragEnd}
                  title={!isMobile ? t.stages.dragHint : undefined}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {!isMobile && <GripVertical className="h-3.5 w-3.5 text-white/60 shrink-0" />}
                      {stage.icon && <IconPreview name={stage.icon} className="h-3.5 w-3.5 shrink-0" />}
                      <span className="font-semibold text-sm truncate">{stage.name}</span>
                    </div>
                    <span className="text-xs font-medium bg-white/20 px-2 py-0.5 rounded-full shrink-0">
                      {leadsByStage[stage.id]?.length || 0}
                    </span>
                  </div>
                  {/* Sempre renderizada (mesmo em R$ 0,00) — senão a coluna some essa
                      linha e o cabeçalho fica mais baixo que os vizinhos. */}
                  <p className="text-sm font-semibold mt-1.5 text-white/90">
                    {formatCurrency(valueByStage[stage.id] || 0)}
                  </p>
                </div>

                <ScrollArea className="h-[450px] rounded-b-lg border border-t-0 bg-card">
                  <div className="space-y-3 p-3">
                    {(leadsByStage[stage.id] || []).map((lead) => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lead)}
                        className="cursor-grab active:cursor-grabbing"
                      >
                        <LeadCard
                          lead={lead}
                          onClick={() => handleLeadClick(lead)}
                        />
                      </div>
                    ))}
                    {(leadsByStage[stage.id]?.length || 0) === 0 && (
                      <EmptyState
                        size="compact"
                        icon={<TrendingUp className="h-10 w-10" />}
                        title={t.emptyStageTitle}
                      />
                    )}
                  </div>
                </ScrollArea>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ------------------------------------------------------------------
  // LISTA MOBILE — uma linha por lead, ações no menu de 3 pontos
  // (mover para estágio, editar, excluir é fora de escopo).
  // ------------------------------------------------------------------
  const mobileListBlock = (
    <>
      {isLoading || stagesLoading || pipelinesLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full" />
          ))}
        </div>
      ) : mobileListLeads.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="h-12 w-12" />}
          title={pipelineLeads.length === 0 ? t.emptyOpportunities : t.emptySearch}
          description={pipelineLeads.length === 0 ? t.emptyMobileLeadDesc : t.emptyMobileDesc}
        />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          {mobileListLeads.map((lead) => {
            const currentStage = stages.find(s => s.id === lead.stage_id) || stages[0];
            const stageHex = currentStage ? getStageHexFallback(currentStage.color) : '#6b7280';

            // Ações: editar + mover para cada outra stage.
            const moveActions: ItemAction[] = stages
              .filter((s) => s.id !== currentStage?.id)
              .map((s) => ({
                key: `move-${s.id}`,
                label: t.moveTo.replace('{stage}', s.name),
                icon: (
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: getStageHexFallback(s.color) }}
                  />
                ),
                onClick: () => handleMoveToStage(lead, s.id),
              }));

            const itemActions: ItemAction[] = [
              {
                key: 'edit',
                label: t.detail.edit,
                icon: <Pencil className="h-4 w-4" />,
                variant: 'edit',
                onClick: () => handleEdit(lead),
              },
              ...moveActions,
            ];

            return (
              <MobileListItem
                key={lead.id}
                onClick={() => handleLeadClick(lead)}
                actions={itemActions}
                leading={
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: stageHex }}
                  >
                    <TrendingUp className="h-5 w-5" />
                  </div>
                }
                title={
                  <span className="truncate">{lead.title}</span>
                }
                subtitle={
                  <div className="flex items-center gap-2 flex-wrap">
                    {lead.customers?.name && (
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {lead.customers.name}
                      </span>
                    )}
                    {lead.value && lead.value > 0 ? (
                      <span className="inline-flex items-center gap-1 text-primary font-medium">
                        <DollarSign className="h-3 w-3" />
                        {formatCurrency(lead.value)}
                      </span>
                    ) : null}
                    {lead.expected_close_date && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(lead.expected_close_date), 'dd/MM', { locale: dfLocale })}
                      </span>
                    )}
                  </div>
                }
                trailing={
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-2 py-0.5 whitespace-nowrap text-white border-0"
                    style={{ backgroundColor: stageHex }}
                  >
                    {currentStage?.name || '—'}
                  </Badge>
                }
              />
            );
          })}
        </div>
      )}
    </>
  );

  // ------------------------------------------------------------------
  // SELETOR DE FUNIL — Onda D (multi-pipeline). Só aparece quando a empresa
  // tem MAIS DE UM funil; empresa com um funil só (a maioria) nunca vê isso.
  // Mobile reusa o padrão de pills roláveis com fade nas bordas (MobilePillTabs,
  // já usado em FinanceContas/SettingsSidebarLayout); desktop usa o mesmo
  // padrão visual que esses lugares usam fora do mobile: botões pill num flex
  // que quebra linha (a empresa raramente tem mais funis do que cabe numa
  // linha, e diferente da Agenda/Financeiro no mobile não precisa de scroll
  // horizontal porque o desktop tem largura de sobra).
  // ------------------------------------------------------------------
  const pipelineSelector = pipelines.length > 1 && (
    isMobile ? (
      <MobilePillTabs
        tabs={pipelines.map((p) => ({ value: p.id, label: p.name }))}
        activeTab={selectedPipelineId ?? ''}
        onTabChange={selectPipeline}
      />
    ) : (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t.pipelineSelectorLabel}
        </span>
        {pipelines.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => selectPipeline(p.id)}
            className={cn(
              'inline-flex items-center h-9 px-3.5 rounded-full text-sm font-medium transition-all',
              selectedPipelineId === p.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted',
            )}
          >
            {p.name}
          </button>
        ))}
      </div>
    )
  );

  // ------------------------------------------------------------------
  // ALTERNÂNCIA FUNIL ↔ TAREFAS — Onda E2, terceira superfície da tela.
  // Mesmo padrão visual do seletor de funil acima (pills roláveis no mobile,
  // pills num flex que quebra linha no desktop) — não inventa mecanismo novo.
  // ------------------------------------------------------------------
  const mainTabs = isMobile ? (
    <MobilePillTabs
      tabs={[
        { value: 'funil', label: t.mainTabFunnel },
        { value: 'tarefas', label: t.mainTabTasks },
      ]}
      activeTab={pageTab}
      onTabChange={(v) => setPageTab(v as 'funil' | 'tarefas')}
    />
  ) : (
    <div className="flex items-center gap-2">
      {(['funil', 'tarefas'] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => setPageTab(tab)}
          className={cn(
            'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-medium transition-all',
            pageTab === tab
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted',
          )}
        >
          {tab === 'funil' ? <TrendingUp className="h-3.5 w-3.5" /> : <ListChecks className="h-3.5 w-3.5" />}
          {tab === 'funil' ? t.mainTabFunnel : t.mainTabTasks}
        </button>
      ))}
    </div>
  );

  // ------------------------------------------------------------------
  // ABA TAREFAS — Onda E2. Lista (não kanban) das tarefas vinculadas a
  // oportunidades, com busca, filtro por responsável e ordenação por data
  // (vencidas primeiro). Mesmo bloco pra mobile e desktop.
  // ------------------------------------------------------------------
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const tasksBlock = (
    <div className="space-y-4">
      <div className={cn('flex gap-2', isMobile ? 'flex-col' : 'flex-row items-center')}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t.tasks.searchPlaceholder}
            className="pl-10"
            value={taskSearch}
            onChange={(e) => setTaskSearch(e.target.value)}
          />
        </div>
        {isMobile ? (
          <FilterSheet
            triggerLabel="Filtros"
            activeCount={taskAssigneeFilter.length}
            onClear={() => setTaskAssigneeFilter([])}
          >
            <FilterCheckboxGroup
              label={t.tasks.filterAssignee}
              options={taskAssigneeOptions}
              selected={taskAssigneeFilter}
              onChange={setTaskAssigneeFilter}
              emptyLabel={t.tasks.filterAssigneeAll}
            />
          </FilterSheet>
        ) : (
          <FilterButton activeCount={taskAssigneeFilter.length} onClear={() => setTaskAssigneeFilter([])}>
            <FilterCheckboxGroup
              label={t.tasks.filterAssignee}
              options={taskAssigneeOptions}
              selected={taskAssigneeFilter}
              onChange={setTaskAssigneeFilter}
              emptyLabel={t.tasks.filterAssigneeAll}
            />
          </FilterButton>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full" />
          ))}
        </div>
      ) : sortedTasks.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-12 w-12" />}
          title={collapsedTasks.length === 0 ? t.tasks.emptyTitle : t.tasks.emptySearch}
          description={collapsedTasks.length === 0 ? t.tasks.emptyDesc : t.tasks.emptySearchDesc}
        />
      ) : (
        <div className="rounded-xl border bg-card divide-y overflow-hidden">
          {sortedTasks.map((task: any) => {
            const isDone = task.status === 'concluida';
            const isOverdue = !isDone && !!task.scheduled_date && task.scheduled_date < todayStr;
            const assigneeIds: string[] = task._assignee_user_ids || [];
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => {
                  setDetailLeadId(task.lead_id);
                  setDetailOpen(true);
                }}
                className="w-full text-left flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
              >
                {isDone ? (
                  <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium truncate', isDone && 'line-through text-muted-foreground')}>
                    {task.task_title}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 min-w-0 truncate max-w-[220px]">
                      <TrendingUp className="h-3 w-3 shrink-0" />
                      <span className="truncate">{leadTitleMap.get(task.lead_id) || t.noStage}</span>
                    </span>
                    {task._isRecurring && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal shrink-0">
                        {t.tasks.recurringBadge}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {assigneeIds.length > 0 && (
                    <span className="hidden sm:inline-flex items-center -space-x-1.5">
                      {assigneeIds.slice(0, 3).map((uid) => {
                        const p = profileMap.get(uid);
                        return (
                          <Avatar key={uid} className="h-6 w-6 border border-background">
                            <AvatarImage src={p?.avatar_url || undefined} />
                            <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                              {p?.full_name?.charAt(0)?.toUpperCase() || '?'}
                            </AvatarFallback>
                          </Avatar>
                        );
                      })}
                    </span>
                  )}
                  <Badge
                    variant={isOverdue ? 'destructive' : isDone ? 'success' : 'muted'}
                    className="text-[10px] px-2 py-0.5 whitespace-nowrap"
                  >
                    {task.scheduled_date
                      ? format(new Date(`${task.scheduled_date}T12:00:00`), 'dd/MM', { locale: dfLocale })
                      : t.tasks.noDate}
                    {isOverdue ? ` · ${t.tasks.overdueBadge}` : ''}
                  </Badge>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------
  if (isMobile) {
    return (
      <div className="space-y-4 pb-24 min-w-0">
        <MobilePageHeader
          title={t.title}
          subtitle={t.subtitleMobile}
          icon={TrendingUp}
        />

        {mainTabs}

        {pageTab === 'tarefas' ? (
          tasksBlock
        ) : (
          <>
            {pipelineSelector}

            {summaryRow}

            {/* Busca + filtros */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t.searchPlaceholderMobile}
                  className="pl-10 h-10"
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                />
              </div>
              <FilterSheet
                triggerLabel="Filtros"
                activeCount={activeFiltersCount + (viewMode === 'list' ? 0 : 0)}
                onClear={clearFilters}
              >
                {filterSheetContent}
              </FilterSheet>
            </div>

            {/* StatCarousel — 1 chip por stage; tap filtra (apenas view lista). */}
            {stages.length > 0 && viewMode === 'list' && (
              <StatCarousel items={statItems} loading={isLoading || stagesLoading || pipelinesLoading} />
            )}

            {/* Indicador da stage filtrada (mobile lista) */}
            {viewMode === 'list' && stageFilter && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  {t.stageFilterLabel}: {stages.find(s => s.id === stageFilter)?.name}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => setStageFilter(null)} />
                </Badge>
              </div>
            )}

            {/* Conteúdo */}
            {viewMode === 'list' ? mobileListBlock : kanbanBlock}
          </>
        )}

        {pageTab === 'funil' && (
          <FABButton
            icon={<Plus className="h-5 w-5" />}
            label={t.newOpportunityShort}
            onClick={() => setDialogOpen(true)}
          />
        )}

        {/* Dialogs */}
        <LeadFormDialog
          open={dialogOpen}
          onOpenChange={handleDialogClose}
          lead={editingLead}
          presetPipelineId={selectedPipelineId}
        />
        <LeadDetailModal
          open={detailOpen}
          onOpenChange={setDetailOpen}
          lead={detailLead}
          onEdit={(lead) => {
            setDetailOpen(false);
            handleEdit(lead);
          }}
          onStageChange={handleModalStageChange}
        />
        <LossReasonDialog
          open={lossDialogOpen}
          onOpenChange={(open) => {
            setLossDialogOpen(open);
            if (!open) setPendingLossDrop(null);
          }}
          onConfirm={handleLossConfirm}
          leadTitle={pendingLossDrop?.leadTitle}
        />
        {/* Oferta de receita da oportunidade ganha (CRM → Financeiro).
            Fica fora do modal de detalhe de propósito: a oferta também
            nasce do arrastar no kanban e do menu de ações do mobile. */}
        <LeadWonRevenueDialog {...leadWonRevenue.dialogProps} />
      </div>
    );
  }

  // ------------------------------------------------------------------
  // DESKTOP — layout original 100% preservado.
  // ------------------------------------------------------------------
  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        icon={TrendingUp}
        actions={
          <>
            <StageManagerDialog
              pipelineId={selectedPipelineId ?? undefined}
              pipelineName={pipelines.length > 1 ? selectedPipeline?.name : undefined}
            >
              <Button variant="outline" size="icon" title={t.manageStages}>
                <Settings2 className="h-4 w-4" />
              </Button>
            </StageManagerDialog>
            <PipelineManagerDialog>
              <Button variant="outline" size="icon" title={t.managePipelines}>
                <Workflow className="h-4 w-4" />
              </Button>
            </PipelineManagerDialog>
            <WebhookManagerDialog>
              <Button variant="outline" size="icon" title={t.configWebhooks}>
                <Webhook className="h-4 w-4" />
              </Button>
            </WebhookManagerDialog>
            <Button onClick={() => setDialogOpen(true)} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="h-4 w-4" />
              {t.newOpportunity}
            </Button>
          </>
        }
      />

      {mainTabs}

      {pageTab === 'tarefas' ? (
        tasksBlock
      ) : (
      <>
      {pipelineSelector}

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-0 bg-primary text-white">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col items-center text-center gap-2 sm:flex-row sm:justify-between sm:text-left">
              <div className="min-w-0 w-full">
                <p className="text-sm text-white/70">{t.totalLeads}</p>
                {isLoading ? <Skeleton className="h-8 w-12 mt-1 bg-white/20" /> : <p className="text-2xl sm:text-3xl font-bold">{filteredStats.total}</p>}
              </div>
              <div className="rounded-full bg-white/20 p-3 shrink-0 hidden sm:flex"><Target className="h-6 w-6" /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-success text-white">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col items-center text-center gap-2 sm:flex-row sm:justify-between sm:text-left">
              <div className="min-w-0 w-full">
                <p className="text-sm text-white/70">{t.totalValue}</p>
                {isLoading ? <Skeleton className="h-8 w-24 mt-1 bg-white/20" /> : <p className="text-xl sm:text-2xl font-bold truncate">{formatCurrency(filteredStats.totalValue)}</p>}
              </div>
              <div className="rounded-full bg-white/20 p-3 shrink-0 hidden sm:flex"><DollarSign className="h-6 w-6" /></div>
            </div>
          </CardContent>
        </Card>

        {wonStage && (
          <Card key={wonStage.id} className="border-0 bg-info text-white">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col items-center text-center gap-2 sm:flex-row sm:justify-between sm:text-left">
                <div className="min-w-0 w-full">
                  <p className="text-sm text-white/70 truncate">{wonStage.name}</p>
                  {isLoading ? <Skeleton className="h-8 w-24 mt-1 bg-white/20" /> : <p className="text-xl sm:text-2xl font-bold truncate">{formatCurrency(valueByStage[wonStage.id] || 0)}</p>}
                </div>
                <div className="rounded-full bg-white/20 p-3 shrink-0 hidden sm:flex"><TrendingUp className="h-6 w-6" /></div>
              </div>
            </CardContent>
          </Card>
        )}

        {neutralStage && (
          <Card key={neutralStage.id} className="border-0 bg-warning text-white">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col items-center text-center gap-2 sm:flex-row sm:justify-between sm:text-left">
                <div className="min-w-0 w-full">
                  <p className="text-sm text-white/70 truncate">{neutralStage.name}</p>
                  {isLoading ? <Skeleton className="h-8 w-24 mt-1 bg-white/20" /> : <p className="text-xl sm:text-2xl font-bold truncate">{formatCurrency(valueByStage[neutralStage.id] || 0)}</p>}
                </div>
                <div className="rounded-full bg-white/20 p-3 shrink-0 hidden sm:flex"><Users className="h-6 w-6" /></div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t.searchPlaceholder}
            className="pl-10"
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
          />
        </div>

        <FilterButton
          activeCount={activeFiltersCount}
          onClear={clearFilters}
        >
          <FilterCheckboxGroup
            label={t.filterOrigin}
            options={sourceOptions}
            selected={filters.source}
            onChange={(next) => setFilters((prev) => ({ ...prev, source: next }))}
            emptyLabel={t.filterOriginAll}
          />

          <FilterCheckboxGroup
            label={t.filterSalesperson}
            options={assignedToOptions}
            selected={filters.assignedTo}
            onChange={(next) => setFilters((prev) => ({ ...prev, assignedTo: next }))}
            emptyLabel={t.filterSalespersonAll}
          />

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>{t.filterMinValue}</Label>
              <Input
                type="number"
                placeholder={t.filterMinPlaceholder}
                value={filters.minValue}
                onChange={(e) => setFilters(prev => ({ ...prev, minValue: e.target.value }))}
                onPaste={(e) => handleMoneyFilterPaste(e, (v) => setFilters(prev => ({ ...prev, minValue: v })))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t.filterMaxValue}</Label>
              <Input
                type="number"
                placeholder={t.filterMaxPlaceholder}
                value={filters.maxValue}
                onChange={(e) => setFilters(prev => ({ ...prev, maxValue: e.target.value }))}
                onPaste={(e) => handleMoneyFilterPaste(e, (v) => setFilters(prev => ({ ...prev, maxValue: v })))}
              />
            </div>
          </div>
        </FilterButton>
      </div>

      {/* Active Filters Display */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.source.length > 0 && (
            <Badge className="gap-1 bg-foreground text-background">
              {t.badgeOrigin}:{' '}
              {filters.source.length === 1
                ? filters.source[0]
                : t.badgeSelected_other.replace('{count}', String(filters.source.length))}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setFilters(prev => ({ ...prev, source: [] }))} />
            </Badge>
          )}
          {filters.assignedTo.length > 0 && (
            <Badge className="gap-1 bg-foreground text-background">
              {t.badgeSalesperson}:{' '}
              {filters.assignedTo.length === 1
                ? getAssignedToLabel(filters.assignedTo[0])
                : t.badgeSelectedM_other.replace('{count}', String(filters.assignedTo.length))}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setFilters(prev => ({ ...prev, assignedTo: [] }))} />
            </Badge>
          )}
          {filters.minValue && (
            <Badge className="gap-1 bg-foreground text-background">
              {t.badgeMin}: {formatCurrency(parseFloat(filters.minValue))}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setFilters(prev => ({ ...prev, minValue: '' }))} />
            </Badge>
          )}
          {filters.maxValue && (
            <Badge className="gap-1 bg-foreground text-background">
              {t.badgeMax}: {formatCurrency(parseFloat(filters.maxValue))}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setFilters(prev => ({ ...prev, maxValue: '' }))} />
            </Badge>
          )}
        </div>
      )}

      {kanbanBlock}
      </>
      )}

      <LeadFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        lead={editingLead}
        presetPipelineId={selectedPipelineId}
      />
      <LeadDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        lead={detailLead}
        onEdit={(lead) => {
          setDetailOpen(false);
          handleEdit(lead);
        }}
        onStageChange={handleModalStageChange}
      />
      <LossReasonDialog
        open={lossDialogOpen}
        onOpenChange={(open) => {
          setLossDialogOpen(open);
          if (!open) setPendingLossDrop(null);
        }}
        onConfirm={handleLossConfirm}
        leadTitle={pendingLossDrop?.leadTitle}
      />
      {/* Oferta de receita da oportunidade ganha (CRM → Financeiro).
          Fica fora do modal de detalhe de propósito: a oferta também
          nasce do arrastar no kanban e do menu de ações do mobile. */}
      <LeadWonRevenueDialog {...leadWonRevenue.dialogProps} />
    </div>
  );
}
