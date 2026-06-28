import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { QRCodeSVG } from 'qrcode.react';
import { ChevronLeft, ScrollText, Calendar, CheckCircle, Clock, ExternalLink, SkipForward, Repeat, DollarSign, Plus, Loader2, Pencil, Trash2, MoreVertical, RefreshCw, MoreHorizontal, Check, Eye, EyeOff, Copy, ShieldCheck, Printer, Info, FileText, Wrench, ClipboardCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useContractPublicToken, useRegeneratePmocToken, useResolveContractId } from '@/hooks/usePmocPortal';
import { buildPmocPortalUrl } from '@/utils/pmocPortalApi';
import { isUuid, buildSlugSegment } from '@/utils/prettyLinks';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { useTableSort } from '@/hooks/useTableSort';
import { getErrorMessage } from '@/utils/errorMessages';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ContractFormDialog } from '@/components/contracts/ContractFormDialog';
import { ContractEnvironmentsTab } from '@/components/contracts/ContractEnvironmentsTab';
import { ContractMaintenancePlanDocument } from '@/components/contracts/ContractMaintenancePlanDocument';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import { PmocContractDocsTab } from '@/components/pmoc/PmocContractDocsTab';
import { PmocContractCronogramaTab } from '@/components/pmoc/PmocContractCronogramaTab';
import { PmocExecutionHistoryTab } from '@/components/pmoc/PmocExecutionHistoryTab';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useContractDetail, isActiveContractOS } from '@/hooks/useContractDetail';
import { useContracts, getFrequencyLabel, type ContractServiceOrder } from '@/hooks/useContracts';
import { useServiceOrderActivities, freqCodeShortLabel } from '@/hooks/useServiceOrderActivities';
import { osStatusLabels, type OsStatus } from '@/types/database';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { useFinancial } from '@/hooks/useFinancial';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { format, isBefore, parseISO, addMonths, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/utils/currency';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';

/** Parse a YYYY-MM-DD string as a local date (avoids UTC-offset shift) */
function parseLocalDate(dateStr: string): Date {
  return parseISO(dateStr + 'T12:00:00');
}

const STATUS_LABELS: Record<string, { label: string; variant: 'success' | 'outline' | 'destructive' | 'secondary' }> = {
  active: { label: 'Ativo', variant: 'success' },
  paused: { label: 'Pausado', variant: 'outline' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
  expired: { label: 'Expirado', variant: 'secondary' },
};

// Variante de Badge por status REAL da OS. Labels vêm de `osStatusLabels`
// (fonte canônica compartilhada com a tela de Ordens de Serviço). Não há um
// mapa de variante de Badge compartilhado no codebase (DaySchedule usa
// variantes base; TechnicianOS usa semânticas), então fixamos aqui as cores
// semânticas coerentes com o resto do app.
const OS_STATUS_VARIANT: Record<OsStatus, 'success' | 'info' | 'warning' | 'destructive' | 'outline'> = {
  agendada: 'outline',
  pendente: 'outline',
  a_caminho: 'info',
  em_andamento: 'info',
  pausada: 'warning',
  concluida: 'success',
  cancelada: 'destructive',
};

const FREQUENCY_OPTIONS = [
  { value: 'unica', label: 'Única', months: 0 },
  { value: 'mensal', label: 'Mensal', months: 1 },
  { value: 'bimestral', label: 'Bimestral', months: 2 },
  { value: 'trimestral', label: 'Trimestral', months: 3 },
  { value: 'semestral', label: 'Semestral', months: 6 },
  { value: 'anual', label: 'Anual', months: 12 },
];

export default function ContractDetail() {
  const isMobile = useIsMobile();
  const { resolvedTheme } = useTheme();
  // O param da rota pode ser UUID antigo OU `slug-do-nome-<codigo>` (link
  // amigável). `useResolveContractId` devolve sempre o id real do contrato.
  const { id: routeParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { id, isResolving: isResolvingId } = useResolveContractId(routeParam);
  const { contract, isLoading, cancelOccurrenceOs, stats, linkedTransactions, isLoadingTransactions } = useContractDetail(id);
  const { createTransaction } = useFinancial();
  const { accounts } = useFinancialAccounts();
  const { categories } = useFinancialCategories();
  const { settings: companySettings } = useCompanySettings();

  // Aba ativa do contrato. PMOC tem 5 abas; contrato comum tem 3 (Visão Geral
  // + Ocorrências + Financeiro). Default = visão geral. "Ocorrências" e
  // "Financeiro" são abas próprias em TODO contrato (decisão do CEO).
  const [pmocTab, setPmocTab] = useState<'overview' | 'equipamentos' | 'ocorrencias' | 'historico' | 'financeiro' | 'documentos' | 'cronograma'>('overview');

  const { deleteContract, applyFinancialLinksToContractParcels, renewContract } = useContracts();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showReceivableModal, setShowReceivableModal] = useState(false);
  // Documento "Plano de Manutenção" (Fase C) — overlay de impressão. Só contrato
  // comum (PMOC tem a aba Documentos própria). Abre/fecha por estado local.
  const [showMaintenancePlan, setShowMaintenancePlan] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRenewDialog, setShowRenewDialog] = useState(false);
  // Quantos meses estender no clique de "Renovar / Estender" (default 12).
  const [renewExtraMonths, setRenewExtraMonths] = useState(12);
  const [showEditForm, setShowEditForm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [recDescription, setRecDescription] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recDueDate, setRecDueDate] = useState('');
  const [recFrequency, setRecFrequency] = useState('unica');
  const [recInstallments, setRecInstallments] = useState('1');
  const [recAccountId, setRecAccountId] = useState('');
  const [recCategory, setRecCategory] = useState('');
  const [recSaving, setRecSaving] = useState(false);
  // "Aplicar conta/categoria a todas as parcelas" (contratos antigos sem vínculo).
  const [showApplyLinksModal, setShowApplyLinksModal] = useState(false);
  const [applyAccountId, setApplyAccountId] = useState('');
  const [applyCategory, setApplyCategory] = useState('');
  const [applySaving, setApplySaving] = useState(false);
  const [editingRecTransaction, setEditingRecTransaction] = useState<any>(null);
  const [showEditRecModal, setShowEditRecModal] = useState(false);
  const [editRecDescription, setEditRecDescription] = useState('');
  const [editRecAmount, setEditRecAmount] = useState('');
  const [editRecDueDate, setEditRecDueDate] = useState('');
  const [editRecSaving, setEditRecSaving] = useState(false);
  const [showBulkEditPrompt, setShowBulkEditPrompt] = useState(false);
  const [pendingEditData, setPendingEditData] = useState<any>(null);
  const [deletingRecId, setDeletingRecId] = useState<string | null>(null);
  // OS (visita) que o gestor pediu pra cancelar via botão "Pular".
  // Guarda o id da OS até a confirmação no AlertDialog.
  const [cancelingOsId, setCancelingOsId] = useState<string | null>(null);

  // Portal do Contrato — aparece em TODO contrato (PMOC ou não). O token público
  // é gerado pra todo contrato e nunca nulado. PMOC ganha extras (liberação de
  // documentos via aba Documentos); contrato comum tem só QR + link + toggle.
  const { hasRole } = useAuth();
  const isPmoc = (contract as any)?.is_pmoc === true;
  const canRegenerateToken =
    hasRole('admin' as any) || hasRole('gestor' as any) || hasRole('super_admin' as any);
  const { data: publicToken } = useContractPublicToken(id);
  const regenerateToken = useRegeneratePmocToken();
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [downloadingQr, setDownloadingQr] = useState(false);
  // Link amigável do portal: `…/contrato/unidade/<slug>-<codigo>`. Fallback pro
  // token antigo (32hex) quando o código curto ainda não estiver disponível.
  const portalUrl = publicToken?.shortCode
    ? buildPmocPortalUrl({ shortCode: publicToken.shortCode, name: publicToken.name })
    : publicToken?.token
      ? buildPmocPortalUrl(publicToken.token)
      : null;

  // Auto-canonical: assim que o contrato carrega, se a URL interna não estiver
  // no formato bonito (`slug-<codigo>`), reescreve a barra de endereço sem
  // recarregar. Faz QUALQUER link antigo (UUID) virar bonito, sem caçar todos
  // os navigate() espalhados. Links antigos continuam ABRINDO — só normalizamos.
  useEffect(() => {
    const shortCode = (contract as any)?.public_short_code as string | undefined;
    if (!contract || !shortCode || isResolvingId) return;
    const pretty = buildSlugSegment([(contract as any)?.name], shortCode, 'contrato');
    if (routeParam !== pretty) {
      navigate(`/contratos/${pretty}`, { replace: true });
    }
  }, [contract, routeParam, isResolvingId, navigate]);

  // Toggle "Portal Público" (público/privado) — espelha o CustomerDetail.
  // Lê/grava contracts.portal_is_public (cast `as any`: types.ts não regenerado).
  // Default ligado (true) quando ausente/null.
  const [portalIsPublic, setPortalIsPublic] = useState(true);
  const [updatingPortalVisibility, setUpdatingPortalVisibility] = useState(false);
  useEffect(() => {
    if (contract) {
      setPortalIsPublic((contract as any).portal_is_public !== false);
    }
  }, [contract]);

  const handleTogglePortalPublic = async (next: boolean) => {
    if (!id) return;
    const prev = portalIsPublic;
    setPortalIsPublic(next); // otimista
    setUpdatingPortalVisibility(true);
    const { error } = await supabase
      .from('contracts')
      .update({ portal_is_public: next } as any)
      .eq('id', id);
    setUpdatingPortalVisibility(false);
    if (error) {
      setPortalIsPublic(prev); // rollback
      toast({ variant: 'destructive', title: 'Erro ao atualizar portal', description: getErrorMessage(error) });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['contract-detail', id] });
    toast({ title: next ? 'Portal público ativado' : 'Portal agora exige login' });
  };

  const handleCopyPortalLink = async () => {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      toast({ title: 'Link copiado', description: 'Cole onde quiser compartilhar.' });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Não foi possível copiar',
        description: 'Copie manualmente da barra acima.',
      });
    }
  };

  const handlePrintQrCode = async () => {
    if (!id) return;
    setDownloadingQr(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session.session?.access_token;
      if (!accessToken) throw new Error('Sessão expirada. Faça login novamente.');

      const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
      if (!supabaseUrl) throw new Error('Ambiente não configurado.');

      const res = await fetch(
        `${supabaseUrl}/functions/v1/generate-pmoc-qr-pdf?contract_id=${encodeURIComponent(id)}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!res.ok) {
        // Edge function pode ainda não existir (Onda B em fase de Database).
        // Mensagem amigável ao gestor enquanto isso.
        if (res.status === 404) {
          throw new Error('Geração de QR Code em breve. Aguarde a próxima atualização.');
        }
        throw new Error('Não foi possível gerar o PDF.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pmoc-qr-${contract?.name ?? 'contrato'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao gerar QR Code',
        description: getErrorMessage(err),
      });
    } finally {
      setDownloadingQr(false);
    }
  };

  const handleRegenerateToken = async () => {
    if (!id) return;
    try {
      await regenerateToken.mutateAsync(id);
      setShowRegenerateDialog(false);
    } catch {
      // Toast já exibido pelo hook.
    }
  };

  // Sticky bar mobile: aparece quando o header da tela sai do viewport.
  // Sensação de navigation bar nativa iOS (mantém contexto ao rolar).
  const headerSentinelRef = useRef<HTMLDivElement | null>(null);
  const [headerOffscreen, setHeaderOffscreen] = useState(false);
  useEffect(() => {
    if (!isMobile) {
      setHeaderOffscreen(false);
      return;
    }
    const sentinel = headerSentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      ([entry]) => setHeaderOffscreen(!entry.isIntersecting),
      { rootMargin: '0px', threshold: 0 },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [isMobile]);

  // Visitas do contrato = OSs reais ordenadas por scheduled_date asc.
  // "#N" é DERIVADO (index + 1) — não existe occurrence_number em service_orders.
  // Anexamos `occurrence_number` derivado a cada OS pra preservar a UI/sort/print
  // existentes sem reescrever a coluna "#".
  const sortedOccurrences = useMemo<(ContractServiceOrder & { occurrence_number: number })[]>(() => {
    const orders = [...(contract?.service_orders || [])].sort((a, b) => {
      const da = a.scheduled_date ? parseISO(a.scheduled_date).getTime() : 0;
      const db = b.scheduled_date ? parseISO(b.scheduled_date).getTime() : 0;
      return da - db;
    });
    return orders.map((o, i) => ({ ...o, occurrence_number: i + 1 }));
  }, [contract]);
  const { sortedItems: sortedOcc, sortConfig: occSortConfig, handleSort: handleOccSort } = useTableSort(sortedOccurrences);
  const occPagination = useDataPagination(sortedOcc);
  const recPagination = useDataPagination(linkedTransactions || []);

  // Atividades (serviços que cada visita carrega) — só das OSs visíveis na
  // página atual de ocorrências, pra não buscar o contrato inteiro de uma vez.
  // Hook próprio (escopo = OSs deste contrato), nunca via query de useContracts.
  const occVisibleOsIds = useMemo(
    () => occPagination.paginatedItems.map((os) => os.id),
    [occPagination.paginatedItems],
  );
  const { activitiesByOrderId } = useServiceOrderActivities(occVisibleOsIds);

  const { markAsPaid: markTxPaid, deleteTransaction, updateTransaction } = useFinancial();

  const handleOpenEditRec = (t: any) => {
    setEditRecDescription(t.description);
    setEditRecAmount(String(t.amount));
    setEditRecDueDate(t.due_date || '');
    setPendingEditData({ id: t.id, contract_id: id });
    setShowEditRecModal(true);
  };

  const handleSaveEditRec = async (applyToAll: boolean) => {
    if (!pendingEditData) return;
    setEditRecSaving(true);
    try {
      if (applyToAll) {
        const unpaidTxs = (linkedTransactions || []).filter((t: any) => !t.is_paid && t.id !== pendingEditData.id);
        for (const tx of unpaidTxs) {
          await updateTransaction.mutateAsync({ id: tx.id, description: editRecDescription, amount: Number(editRecAmount) } as any);
        }
      }
      await updateTransaction.mutateAsync({ id: pendingEditData.id, description: editRecDescription, amount: Number(editRecAmount), due_date: editRecDueDate || undefined } as any);
      queryClient.invalidateQueries({ queryKey: ['contract-detail'] });
      setShowEditRecModal(false);
      setShowBulkEditPrompt(false);
      toast({ title: applyToAll ? 'Todas as contas atualizadas!' : 'Conta atualizada!' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(err) });
    } finally { setEditRecSaving(false); }
  };

  const handleDeleteRecTransaction = async () => {
    if (!deletingRecId) return;
    try {
      await deleteTransaction.mutateAsync(deletingRecId);
      queryClient.invalidateQueries({ queryKey: ['contract-detail'] });
      setDeletingRecId(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(err) });
    }
  };

  // Opções de conta bancária / caixa (todas ativas). SearchableSelect porque a
  // lista de contas pode crescer.
  const accountOptions = useMemo(
    () => (accounts || [])
      .filter((a: any) => a.is_active !== false)
      .map((a: any) => ({ value: a.id, label: a.name, sublabel: a.bank_name || a.institution_name || undefined })),
    [accounts],
  );

  // Categorias de RECEITA (contas a receber são entrada). Inclui as 'ambos'.
  const receivableCategoryOptions = useMemo(
    () => (categories || [])
      .filter((c: any) => c.is_active !== false && (c.type === 'receita' || c.type === 'ambos'))
      .map((c: any) => ({ value: c.name, label: c.name })),
    [categories],
  );

  const handleCreateReceivable = async () => {
    if (!recDescription || !recAmount || !contract) return;
    setRecSaving(true);
    try {
      const freqOption = FREQUENCY_OPTIONS.find(f => f.value === recFrequency);
      const numInstallments = recFrequency === 'unica' ? 1 : Math.max(1, parseInt(recInstallments) || 1);
      const amount = parseFloat(recAmount);
      const baseDate = recDueDate ? parseISO(recDueDate) : new Date();

      for (let i = 0; i < numInstallments; i++) {
        const dueDate = addMonths(baseDate, i * (freqOption?.months || 0));
        const suffix = numInstallments > 1 ? ` (${i + 1}/${numInstallments})` : '';
        const monthLabel = numInstallments > 1 ? ` - ${format(dueDate, 'MMM/yyyy', { locale: ptBR })}` : '';

        // Grava conta + categoria em TODAS as parcelas (além de cliente/contrato),
        // pra já sair validado no financeiro sem editar parcela a parcela.
        await createTransaction.mutateAsync({
          transaction_type: 'entrada',
          description: `${recDescription}${monthLabel}${suffix}`,
          amount,
          // transaction_date = mês da parcela (não a data da geração), pra a receita realizada cair no mês certo em Movimentações
          transaction_date: format(dueDate, 'yyyy-MM-dd'),
          due_date: format(dueDate, 'yyyy-MM-dd'),
          is_paid: false,
          customer_id: contract.customer_id,
          account_id: recAccountId || null,
          category: recCategory || undefined,
          notes: `Vinculado ao contrato: ${contract.name}`,
          contract_id: id,
        } as any);
      }

      setShowReceivableModal(false);
      setRecDescription('');
      setRecAmount('');
      setRecDueDate('');
      setRecFrequency('unica');
      setRecInstallments('1');
      // Conta/categoria escolhidas ficam memorizadas pro próximo lançamento.
    } finally {
      setRecSaving(false);
    }
  };

  const handleApplyLinksToAllParcels = async () => {
    if (!contract || !id) return;
    if (!applyAccountId && !applyCategory) return;
    setApplySaving(true);
    try {
      await applyFinancialLinksToContractParcels.mutateAsync({
        contractId: id,
        customerId: contract.customer_id,
        accountId: applyAccountId || null,
        category: applyCategory || null,
      });
      queryClient.invalidateQueries({ queryKey: ['contract-detail'] });
      setShowApplyLinksModal(false);
      setApplyAccountId('');
      setApplyCategory('');
    } finally {
      setApplySaving(false);
    }
  };

  const handleToggleBillingInSchedule = async () => {
    if (!contract || !id) return;
    const newValue = !(contract as any).show_billing_in_schedule;
    try {
      await supabase.from('contracts').update({ show_billing_in_schedule: newValue } as any).eq('id', id);
      queryClient.invalidateQueries({ queryKey: ['contract-detail'] });
      queryClient.invalidateQueries({ queryKey: ['contracts-billing-hidden'] });
      toast({ title: newValue ? 'Cobranças visíveis na agenda' : 'Cobranças ocultas da agenda' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(err) });
    }
  };

  const handleDeleteContract = () => {
    if (!contract || !id) return;
    setShowDeleteDialog(false);
    setDeleteConfirmed(false);
    deleteContract.mutate(id);
    navigate('/contratos');
  };

  const handleRenewContract = async () => {
    if (!contract || !id) return;
    setIsRenewing(true);
    try {
      // Renovação assistida: estende o MESMO contrato e gera só o tail novo de
      // visitas (datas após a última existente). Não cria contrato novo nem
      // duplica visitas. O hook centraliza a regra (motor único + idempotência).
      await renewContract.mutateAsync({ id, extraMonths: renewExtraMonths });
      queryClient.invalidateQueries({ queryKey: ['contract-detail', id] });
    } catch {
      // Toast de erro já exibido pelo hook.
    } finally {
      setIsRenewing(false);
      setShowRenewDialog(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Esqueleto no formato dos cards finais — header + 2 cards principais + side. */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-1.5 min-w-0">
            <Skeleton className="h-5 w-2/3 max-w-[260px]" />
            <Skeleton className="h-3 w-1/3 max-w-[180px]" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-48 rounded-2xl lg:rounded-lg" />
            <Skeleton className="h-64 rounded-2xl lg:rounded-lg" />
          </div>
          <Skeleton className="h-64 rounded-2xl lg:rounded-lg" />
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div
        className="flex flex-col items-center justify-center px-6 text-center min-h-[60vh] lg:min-h-[40vh]"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-4">
          <ScrollText className="h-8 w-8" aria-hidden="true" />
        </div>
        <p className="text-muted-foreground mb-4">Contrato não encontrado</p>
        <Button
          variant="outline"
          className="min-h-11 active:scale-95 transition-transform rounded-xl"
          onClick={() => navigate('/contratos')}
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
      </div>
    );
  }

  const statusCfg = STATUS_LABELS[contract.status] || STATUS_LABELS.active;
  const occurrences = sortedOccurrences;
  const items = contract.contract_items || [];

  // "Contrato acabando": ativo e a ÚLTIMA visita (maior scheduled_date) está a
  // ≤30 dias de hoje OU já passou sem nenhuma visita futura. Sinal discreto pra
  // o gestor renovar antes de ficar sem agenda. Comparação por data (Brasil),
  // sem hora, pra não oscilar com fuso.
  const isEndingSoon = (() => {
    if (contract.status !== 'active') return false;
    const lastDated = occurrences
      .filter(o => !!o.scheduled_date)
      .map(o => o.scheduled_date as string)
      .sort()
      .pop();
    if (!lastDated) return false;
    const last = parseLocalDate(lastDated);
    last.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30 = addDays(today, 30);
    return last <= in30;
  })();
  const showBillingInSchedule = (contract as any).show_billing_in_schedule !== false;

  const totalReceivable = (linkedTransactions || []).reduce((sum, t) => sum + Number(t.amount), 0);
  const totalPaid = (linkedTransactions || []).filter(t => t.is_paid).reduce((sum, t) => sum + Number(t.amount), 0);
  // Pendente = previsto - recebido. Atrasado = parcelas NÃO pagas cujo
  // vencimento já passou (timezone Brasil: comparamos só a data, sem hora).
  const totalPending = totalReceivable - totalPaid;
  const todayLocal = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const overdueTransactions = (linkedTransactions || []).filter(
    t => !t.is_paid && t.due_date && isBefore(parseLocalDate(t.due_date), todayLocal),
  );
  const totalOverdue = overdueTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
  const overdueCount = overdueTransactions.length;

  // Onda C — contexto pra pré-preencher templates rich dos docs PMOC.
  // Os campos abaixo vivem em colunas adicionadas pela Onda A/B (RT) — usamos
  // narrowing defensivo via Record genérico até types.ts ser regenerado.
  type RtRelation = { full_name?: string; modality?: string; cft_crea?: string };
  type CustomerExtra = { document?: string; address?: string; city?: string; state?: string };
  // PostgREST join `responsible_technicians:responsible_technician_id (...)` no useContracts
  // resulta no alias PLURAL `responsible_technicians` (não singular). Bug histórico: lia
  // singular → contractRt sempre undefined → banner pintava RT como faltando mesmo
  // existindo no banco. Fix: usar plural (alias real do PostgREST).
  const contractRt = (contract as unknown as { responsible_technicians?: RtRelation }).responsible_technicians;
  const customerExtra = (contract.customers ?? {}) as unknown as CustomerExtra & { name?: string };
  // Onda H+ — endereço completo da empresa em uma string única (espelha o
  // empresaEnderecoFull montado nas edge functions de PDF, pra que o badge
  // [Endereço da Empresa] no editor mostre EXATAMENTE o que sai no PDF).
  const empresaEnderecoFull = [
    companySettings?.address,
    companySettings?.address_number,
    companySettings?.neighborhood,
    companySettings?.complement,
  ]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length > 0)
    .join(', ');

  const pmocTemplateContext = isPmoc
    ? {
        empresa_razao_social: companySettings?.name ?? '',
        empresa_cnpj: companySettings?.document ?? '',
        empresa_endereco: empresaEnderecoFull,
        rt_nome: contractRt?.full_name ?? '',
        rt_modalidade: contractRt?.modality ?? '',
        rt_cft_crea: contractRt?.cft_crea ?? '',
        cidade: companySettings?.city ?? '',
        customer_name: customerExtra.name ?? '',
        customer_document: customerExtra.document ?? '',
        customer_address: [customerExtra.address, customerExtra.city, customerExtra.state]
          .filter(Boolean)
          .join(', '),
        contract_frequency_label: getFrequencyLabel(contract.frequency_type, contract.frequency_value),
        contract_start_date_extenso: format(parseLocalDate(contract.start_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
        // ISO bruto de contracts.created_at — o PmocContractDocsTab deriva
        // dia/mês/ano em PT-BR pras variáveis contrato.criado_{dia,mes,ano}.
        // Cai em string vazia quando o contrato é novo / created_at ausente,
        // o que vira badge vermelho no editor (sinal de "cadastre antes de gerar").
        contract_created_at_iso: (contract as { created_at?: string }).created_at ?? '',
        generated_at_extenso: format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
      }
    : undefined;

  return (
    <div className="space-y-6 overflow-hidden max-w-full w-full">
      {/* Sticky bar mobile-only com nome + status. Aparece quando o header da
          tela (sentinel logo abaixo) sai do viewport. Posicionada `top-16` pra
          ficar logo abaixo do header global do AppLayout (h-16). Visual de
          navigation bar nativa iOS com backdrop blur. */}
      <div
        aria-hidden={!headerOffscreen}
        className={cn(
          'fixed inset-x-0 top-16 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md lg:hidden',
          'transition-all duration-200 ease-out',
          headerOffscreen ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-full opacity-0',
        )}
      >
        <div className="flex items-center gap-2 px-4 py-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 min-h-11 min-w-11 active:scale-95 transition-transform rounded-xl"
            onClick={() => navigate('/contratos')}
            aria-label="Voltar"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">
            {contract.name}
          </p>
          <Badge variant={statusCfg.variant} className="shrink-0">{statusCfg.label}</Badge>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 min-h-11 min-w-11 sm:h-9 sm:w-9 sm:min-h-9 sm:min-w-9 active:scale-95 transition-transform rounded-xl"
          onClick={() => navigate('/contratos')}
          aria-label="Voltar"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-2xl font-bold truncate leading-tight">{contract.name}</h1>
            <Badge variant={statusCfg.variant} className="shrink-0">{statusCfg.label}</Badge>
          </div>
          <p className="text-muted-foreground text-xs sm:text-sm truncate">{contract.customers?.name || 'Cliente'}</p>
        </div>
        {/* Ações do contrato. Desktop (lg+): botões inline visíveis (tem espaço,
            melhora descoberta). Mobile: kebab de 3 pontinhos (espaço curto).
            Mesmos handlers nos dois — só muda a apresentação por breakpoint.
            Cores semânticas por variante do design system: editar=laranja
            (edit-ghost), excluir=vermelho (destructive-ghost). */}
        <div className="shrink-0">
          {/* Desktop: botões inline */}
          <div className="hidden lg:flex items-center gap-2">
            <Button
              variant="edit-ghost"
              size="sm"
              className="active:scale-95 transition-transform"
              onClick={() => setShowEditForm(true)}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Editar contrato
            </Button>
            <Button
              variant="destructive-ghost"
              size="sm"
              className="active:scale-95 transition-transform"
              onClick={() => { setDeleteConfirmed(false); setShowDeleteDialog(true); }}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Excluir contrato
            </Button>
          </div>
          {/* Mobile: kebab de 3 pontinhos */}
          <div className="lg:hidden">
            <RowActionsMenu
              actions={[
                { label: 'Editar contrato', icon: Pencil, variant: 'edit', onClick: () => setShowEditForm(true) },
                { label: 'Excluir contrato', icon: Trash2, variant: 'delete', onClick: () => { setDeleteConfirmed(false); setShowDeleteDialog(true); } },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Sentinel pro IntersectionObserver da sticky bar mobile. Quando esse
          div sai do viewport, a mini bar acima aparece. Altura zero (não
          impacta layout). */}
      <div ref={headerSentinelRef} aria-hidden="true" className="h-px -mt-3 lg:hidden" />

      {/*
        Navegação PMOC: usa o componente canônico SettingsSidebarLayout
        (mesmo de Settings, Quotes, ServiceOrders, Financeiro). Desktop:
        rail vertical à esquerda com fundo primary sólido no ativo. Mobile:
        MobilePillTabs achatado. Só envolve o conteúdo quando isPmoc=true;
        contratos não-PMOC seguem direto pra "Visão Geral" sem nav.
      */}
      {(() => {
        // Abas PMOC (5): Visão Geral, Ocorrências, Financeiro, Documentos, Cronograma.
        const pmocSidebarTabs: SettingsTab[] = [
          { value: 'overview', label: 'Visão Geral', icon: Info },
          { value: 'ocorrencias', label: 'Ocorrências', icon: Repeat },
          { value: 'equipamentos', label: 'Ambientes e Equipamentos', icon: Wrench },
          { value: 'historico', label: 'Histórico PMOC', icon: ClipboardCheck },
          { value: 'financeiro', label: 'Financeiro', icon: DollarSign },
          { value: 'documentos', label: 'Documentos', icon: FileText },
          { value: 'cronograma', label: 'Cronograma', icon: Calendar },
        ];

        // Abas de contrato comum (4): Visão Geral + Ocorrências + Equipamentos + Financeiro.
        const commonSidebarTabs: SettingsTab[] = [
          { value: 'overview', label: 'Visão Geral', icon: Info },
          { value: 'ocorrencias', label: 'Ocorrências', icon: Repeat },
          { value: 'equipamentos', label: 'Ambientes e Equipamentos', icon: Wrench },
          { value: 'financeiro', label: 'Financeiro', icon: DollarSign },
        ];

        const overviewContent = (
          <div className="space-y-6 min-w-0 w-full">
          {/* Aviso "Contrato acabando" — discreto, cor warning por token. Atalho
              direto pro diálogo de renovação. Só quando ativo e ≤30 dias do fim. */}
          {isEndingSoon && (
            <button
              type="button"
              onClick={() => setShowRenewDialog(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-left transition-colors hover:bg-warning/15 active:scale-[0.99] lg:rounded-lg"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning/20 text-warning">
                <Clock className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-warning">Contrato acabando</p>
                <p className="text-xs text-muted-foreground break-words">A última visita está chegando. Toque para renovar e gerar o próximo ciclo.</p>
              </div>
              <RefreshCw className="h-4 w-4 shrink-0 text-warning" />
            </button>
          )}
          <div className="grid gap-6 lg:grid-cols-3 min-w-0 w-full">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6 min-w-0 w-full">
          {/* Info card */}
          <Card className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
            <CardHeader>
              <CardTitle className="flex min-w-0 items-center gap-2 break-words">
                <ScrollText className="h-5 w-5 shrink-0" />
                <span className="min-w-0 break-words">Informações</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 space-y-5">
              <div className="grid min-w-0 grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Cliente</p>
                  <p className="mt-0.5 break-words font-medium">{(contract.customers as any)?.name || '-'}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Frequência</p>
                  <p className="mt-0.5 break-words font-medium">{getFrequencyLabel(contract.frequency_type, contract.frequency_value)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Início</p>
                  <p className="mt-0.5 break-words font-medium">{format(parseLocalDate(contract.start_date), 'dd/MM/yyyy')}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Horizonte</p>
                  <p className="mt-0.5 break-words font-medium">{contract.horizon_months} meses</p>
                </div>
                {contract.notes && (
                  <div className="min-w-0 sm:col-span-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Observações</p>
                    <p className="mt-0.5 break-words">{contract.notes}</p>
                  </div>
                )}
              </div>

              {/* Portal do Contrato — subseção dentro de Informações, separada por linha fina.
                  Aparece em TODO contrato (PMOC ou não), enquanto houver token público. */}
              {publicToken && (
                <div className="space-y-3 border-t pt-5 min-w-0">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-base font-semibold break-words">
                      <ShieldCheck className="h-4 w-4 text-info shrink-0" />
                      Portal do Contrato
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground break-words">
                      Página pública deste contrato para o cliente final. Aparece no QR Code colado no quadro físico.
                    </p>
                  </div>

                  {/* Toggle público/privado (espelha o Portal do Cliente). */}
                  <div className="flex items-start justify-between gap-3 rounded-xl border bg-muted/30 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Portal Público</p>
                      <p className="text-xs text-muted-foreground break-words">
                        {portalIsPublic
                          ? 'Qualquer pessoa com o link vê o portal (somente leitura).'
                          : 'O link exige login da sua empresa para abrir.'}
                      </p>
                    </div>
                    <Switch
                      checked={portalIsPublic}
                      disabled={updatingPortalVisibility}
                      onCheckedChange={handleTogglePortalPublic}
                      aria-label="Portal Público"
                      className="shrink-0"
                    />
                  </div>

                  {portalUrl ? (
                    <a
                      href={portalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-md border bg-muted/40 p-2.5 text-xs font-mono break-all min-w-0 hover:bg-muted/60 hover:text-info transition-colors cursor-pointer"
                    >
                      {portalUrl}
                      <ExternalLink className="h-3 w-3 inline ml-1 shrink-0 opacity-60" />
                    </a>
                  ) : (
                    <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                      Link público em geração. Aguarde alguns instantes.
                    </div>
                  )}

                  {/* QR à esquerda, botões empilhados à direita (desktop). Mobile empilha tudo. */}
                  {portalUrl && (
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center min-w-0">
                      <div
                        className={cn(
                          'inline-flex shrink-0 items-center justify-center self-center rounded-xl p-4 transition-colors sm:self-auto',
                          resolvedTheme === 'dark' ? 'bg-card border border-border' : 'bg-white border border-border',
                        )}
                      >
                        <QRCodeSVG
                          value={portalUrl}
                          size={isMobile ? 130 : 160}
                          bgColor="transparent"
                          fgColor={resolvedTheme === 'dark' ? '#ffffff' : '#000000'}
                          level="M"
                        />
                      </div>

                      <div className="flex w-full flex-col gap-2 sm:flex-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCopyPortalLink}
                          disabled={!portalUrl}
                          className="w-full justify-center min-h-11 sm:min-h-[40px] active:scale-[0.98] transition-transform rounded-xl"
                        >
                          <Copy className="h-3.5 w-3.5 mr-1" />
                          Copiar link
                        </Button>
                        {/* Imprimir QR Code: PDF com layout PMOC (capa legal). Só PMOC. */}
                        {isPmoc && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handlePrintQrCode}
                            disabled={!portalUrl || downloadingQr}
                            className="w-full justify-center min-h-11 sm:min-h-[40px] active:scale-[0.98] transition-transform rounded-xl"
                          >
                            {downloadingQr ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : (
                              <Printer className="h-3.5 w-3.5 mr-1" />
                            )}
                            Imprimir QR Code
                          </Button>
                        )}
                        {canRegenerateToken && (
                          <Button
                            variant="destructive-ghost"
                            size="sm"
                            onClick={() => setShowRegenerateDialog(true)}
                            disabled={!publicToken || regenerateToken.isPending}
                            className="w-full justify-center min-h-11 sm:min-h-[40px] active:scale-[0.98] transition-transform rounded-xl"
                          >
                            <RefreshCw className="h-3.5 w-3.5 mr-1" />
                            Regenerar token
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Right column */}
        <div className="space-y-6 min-w-0 w-full">
          <Card className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
            <CardHeader><CardTitle className="text-base break-words">Resumo</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm min-w-0">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <span className="text-muted-foreground">Frequência</span>
                <span className="min-w-0 break-words text-right font-medium">{getFrequencyLabel(contract.frequency_type, contract.frequency_value)}</span>
              </div>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <span className="text-muted-foreground">Início</span>
                <span className="min-w-0 break-words text-right font-medium">{format(parseLocalDate(contract.start_date), 'dd/MM/yyyy')}</span>
              </div>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <span className="text-muted-foreground">Horizonte</span>
                <span className="min-w-0 break-words text-right font-medium">{contract.horizon_months} meses</span>
              </div>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <span className="text-muted-foreground">Total de ocorrências</span>
                <span className="min-w-0 break-words text-right font-medium">{stats.totalOccurrences}</span>
              </div>
              {stats.nextOccurrence && (
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <span className="text-muted-foreground">Próxima OS</span>
                  <span className="min-w-0 break-words text-right font-medium">{format(parseLocalDate(stats.nextOccurrence.scheduled_date), 'dd/MM/yyyy')}</span>
                </div>
              )}
              <Button variant="outline" className="mt-2 w-full min-h-11 active:scale-[0.98] transition-transform rounded-xl" onClick={() => setShowRenewDialog(true)}>
                <RefreshCw className="mr-2 h-4 w-4" /> Renovar / Estender
              </Button>
              {/* Documento "Plano de Manutenção" (imprimir/PDF). Só contrato comum
                  — PMOC tem a aba Documentos própria com seus documentos legais. */}
              {!isPmoc && (
                <Button variant="outline" className="w-full min-h-11 active:scale-[0.98] transition-transform rounded-xl" onClick={() => setShowMaintenancePlan(true)}>
                  <Printer className="mr-2 h-4 w-4" /> Plano de Manutenção
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
            <CardHeader><CardTitle className="text-base break-words">Progresso</CardTitle></CardHeader>
            <CardContent className="space-y-3 min-w-0">
              <Progress value={stats.progressPercent} className="h-3" />
              <p className="text-center text-sm text-muted-foreground break-words">
                {stats.completedOccurrences} de {stats.totalOccurrences} concluídas ({stats.progressPercent}%)
              </p>
            </CardContent>
          </Card>

        </div>
          </div>
          </div>
        );

        // Aba "Ocorrências" (própria, em todo contrato). Clicar na linha abre o
        // DETALHE da OS vinculada na MESMA aba. Status/atrasada derivam da OS real.
        const occurrencesContent = (
          <Card className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
            <CardHeader>
              <CardTitle className="min-w-0 text-base sm:text-lg break-words">Ocorrências ({occurrences.length})</CardTitle>
            </CardHeader>
            <CardContent className={cn(isMobile ? 'p-3 min-w-0' : 'p-0 min-w-0')}>
              {isMobile ? (
                <div className="space-y-2 min-w-0">
                  {occPagination.paginatedItems.map(os => {
                    // Status REAL da OS (fonte única). Label canônico + variante semântica.
                    const osStatus = os.status as OsStatus;
                    const statusLabel = osStatusLabels[osStatus] ?? os.status;
                    const statusVariant = OS_STATUS_VARIANT[osStatus] ?? 'outline';
                    const occDate = os.scheduled_date ? parseLocalDate(os.scheduled_date) : null;
                    // "Atrasada" = OS ativa (não concluída/cancelada) com data já passada.
                    const isLate = isActiveContractOS(os) && !!occDate && isBefore(occDate, new Date());
                    const isActive = isActiveContractOS(os);
                    const goToOs = () => navigate(`/os-tecnico/${os.id}`);
                    return (
                      <div
                        key={os.id}
                        role="button"
                        tabIndex={0}
                        onClick={goToOs}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToOs(); } }}
                        className={cn(
                          'min-w-0 space-y-2 rounded-xl border p-3 transition-colors',
                          isLate && 'border-warning/50 bg-warning/5',
                          'cursor-pointer active:scale-[0.99] hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-muted-foreground">#{os.occurrence_number}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isLate && <Badge variant="warning" className="shrink-0">Atrasada</Badge>}
                            <Badge variant={statusVariant} className="shrink-0">{statusLabel}</Badge>
                          </div>
                        </div>
                        <div className="flex min-w-0 flex-col items-start gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                          <span className={cn('font-medium break-words', isLate && 'text-warning')}>
                            {occDate ? (
                              <>{format(occDate, 'dd/MM/yyyy')} <span className="font-normal text-muted-foreground">({format(occDate, 'EEE', { locale: ptBR })})</span></>
                            ) : 'Sem data'}
                          </span>
                          <Badge variant="secondary" className="shrink-0 self-start text-xs">OS #{os.order_number}</Badge>
                        </div>
                        {(() => {
                          const acts = activitiesByOrderId.get(os.id) ?? [];
                          if (acts.length === 0) return null;
                          const shown = acts.slice(0, 4);
                          const extra = acts.length - shown.length;
                          return (
                            <div className="min-w-0 space-y-1.5 border-t pt-2">
                              <span className="text-[11px] font-medium text-muted-foreground">
                                {acts.length} {acts.length === 1 ? 'serviço' : 'serviços'} nesta visita
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {shown.map((a) => {
                                  const freq = freqCodeShortLabel(a.freq_code);
                                  return (
                                    <Badge key={a.id} variant="secondary" className="max-w-full gap-1 text-[10px] font-normal">
                                      <span className="truncate">{a.description}</span>
                                      {freq && <span className="shrink-0 text-primary">· {freq}</span>}
                                    </Badge>
                                  );
                                })}
                                {extra > 0 && (
                                  <Badge variant="outline" className="text-[10px] font-normal">+{extra}</Badge>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                        {isActive && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost" size="icon" className="min-h-11 min-w-11 text-muted-foreground hover:text-destructive active:scale-90 transition-transform rounded-xl"
                              title="Pular (cancelar esta visita)"
                              onClick={(e) => { e.stopPropagation(); setCancelingOsId(os.id); }}
                            >
                              <SkipForward className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="min-w-0 overflow-x-auto">
                    <DataTablePagination page={occPagination.page} totalPages={occPagination.totalPages} totalItems={occPagination.totalItems} from={occPagination.from} to={occPagination.to} pageSize={occPagination.pageSize} onPageChange={occPagination.setPage} onPageSizeChange={occPagination.setPageSize} />
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHead sortKey="occurrence_number" sortConfig={occSortConfig} onSort={handleOccSort} className="w-12">#</SortableTableHead>
                        <SortableTableHead sortKey="scheduled_date" sortConfig={occSortConfig} onSort={handleOccSort}>Data</SortableTableHead>
                        <SortableTableHead sortKey="" sortConfig={occSortConfig} onSort={() => {}}>Dia</SortableTableHead>
                        <SortableTableHead sortKey="order_number" sortConfig={occSortConfig} onSort={handleOccSort}>OS</SortableTableHead>
                        <SortableTableHead sortKey="" sortConfig={occSortConfig} onSort={() => {}}>Serviços</SortableTableHead>
                        <SortableTableHead sortKey="status" sortConfig={occSortConfig} onSort={handleOccSort}>Status</SortableTableHead>
                        <SortableTableHead sortKey="" sortConfig={occSortConfig} onSort={() => {}} className="w-[100px]">Ações</SortableTableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {occPagination.paginatedItems.map(os => {
                        const osStatus = os.status as OsStatus;
                        const statusLabel = osStatusLabels[osStatus] ?? os.status;
                        const statusVariant = OS_STATUS_VARIANT[osStatus] ?? 'outline';
                        const occDate = os.scheduled_date ? parseLocalDate(os.scheduled_date) : null;
                        const isLate = isActiveContractOS(os) && !!occDate && isBefore(occDate, new Date());
                        const isActive = isActiveContractOS(os);
                        const goToOs = () => navigate(`/os-tecnico/${os.id}`);

                        return (
                          <TableRow
                            key={os.id}
                            role="button"
                            tabIndex={0}
                            onClick={goToOs}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToOs(); } }}
                            className={cn(
                              isLate && 'bg-warning/5',
                              'cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                            )}
                          >
                            <TableCell className="font-mono text-xs text-muted-foreground">{os.occurrence_number}</TableCell>
                            <TableCell className={cn(isLate && 'text-warning font-medium')}>
                              {occDate ? format(occDate, 'dd/MM/yyyy') : '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {occDate ? format(occDate, 'EEE', { locale: ptBR }) : '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">OS #{os.order_number}</Badge>
                            </TableCell>
                            <TableCell className="max-w-[320px]">
                              {(() => {
                                const acts = activitiesByOrderId.get(os.id) ?? [];
                                if (acts.length === 0) return <span className="text-muted-foreground text-sm">—</span>;
                                const shown = acts.slice(0, 3);
                                const extra = acts.length - shown.length;
                                return (
                                  <div className="flex flex-wrap items-center gap-1">
                                    {shown.map((a) => {
                                      const freq = freqCodeShortLabel(a.freq_code);
                                      return (
                                        <Badge key={a.id} variant="secondary" className="max-w-full gap-1 text-[11px] font-normal">
                                          <span className="truncate">{a.description}</span>
                                          {freq && <span className="shrink-0 text-primary">· {freq}</span>}
                                        </Badge>
                                      );
                                    })}
                                    {extra > 0 && (
                                      <Badge variant="outline" className="text-[11px] font-normal">+{extra}</Badge>
                                    )}
                                  </div>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {isLate && <Badge variant="warning">Atrasada</Badge>}
                                <Badge variant={statusVariant}>{statusLabel}</Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {isActive && (
                                  <Button
                                    variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    title="Pular (cancelar esta visita)"
                                    onClick={(e) => { e.stopPropagation(); setCancelingOsId(os.id); }}
                                  >
                                    <SkipForward className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {!isMobile && <DataTablePagination page={occPagination.page} totalPages={occPagination.totalPages} totalItems={occPagination.totalItems} from={occPagination.from} to={occPagination.to} pageSize={occPagination.pageSize} onPageChange={occPagination.setPage} onPageSizeChange={occPagination.setPageSize} />}
            </CardContent>
          </Card>
        );

        // Aba "Financeiro" (própria, em todo contrato). Recorte SÓ deste contrato
        // (financial_transactions filtradas por contract_id). Mini-resumo no topo
        // (previsto / recebido / pendente / atrasado) + lista das parcelas com
        // status (pago/pendente/atrasado) + ações Nova Receita e Aplicar a todas.
        // NÃO duplica a tela geral de Movimentações — é só o que toca o contrato.
        const financialContent = (
          <div className="space-y-6 min-w-0 w-full">
            {/* Mini-resumo: 4 KPIs do contrato. Grid 2 colunas no mobile, 4 no desktop. */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Card className="min-w-0 rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
                <CardContent className="p-3 sm:p-4 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider truncate">Previsto</p>
                  <p className="mt-1 text-base sm:text-lg font-bold break-words tabular-nums">R$ {formatBRL(totalReceivable)}</p>
                </CardContent>
              </Card>
              <Card className="min-w-0 rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
                <CardContent className="p-3 sm:p-4 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider truncate">Recebido</p>
                  <p className="mt-1 text-base sm:text-lg font-bold text-success break-words tabular-nums">R$ {formatBRL(totalPaid)}</p>
                </CardContent>
              </Card>
              <Card className="min-w-0 rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
                <CardContent className="p-3 sm:p-4 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider truncate">Pendente</p>
                  <p className="mt-1 text-base sm:text-lg font-bold text-warning break-words tabular-nums">R$ {formatBRL(totalPending)}</p>
                </CardContent>
              </Card>
              <Card className={cn(
                'min-w-0 rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm',
                overdueCount > 0 && 'border-destructive/40 bg-destructive/5',
              )}>
                <CardContent className="p-3 sm:p-4 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider truncate">
                    Atrasado{overdueCount > 0 ? ` (${overdueCount})` : ''}
                  </p>
                  <p className={cn(
                    'mt-1 text-base sm:text-lg font-bold break-words tabular-nums',
                    overdueCount > 0 ? 'text-destructive' : 'text-muted-foreground',
                  )}>R$ {formatBRL(totalOverdue)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Lista das parcelas (contas a receber) deste contrato + ações. */}
            <Card className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
              <CardHeader className="flex flex-col items-start justify-between space-y-2 sm:flex-row sm:items-center sm:space-y-0">
                <CardTitle className="flex min-w-0 items-center gap-2 text-base sm:text-lg">
                  <DollarSign className="h-5 w-5 shrink-0" />
                  <span className="min-w-0 break-words">Contas a Receber</span>
                </CardTitle>
                <div className="flex flex-col gap-2 w-full sm:w-auto sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={showBillingInSchedule}
                      onCheckedChange={handleToggleBillingInSchedule}
                      id="billing-schedule-toggle"
                    />
                    <Label htmlFor="billing-schedule-toggle" className="text-xs cursor-pointer whitespace-nowrap">
                      {showBillingInSchedule ? <Eye className="inline h-3.5 w-3.5 mr-1" /> : <EyeOff className="inline h-3.5 w-3.5 mr-1" />}
                      Agenda
                    </Label>
                  </div>
                  {(linkedTransactions || []).length > 0 && (
                    <Button size="sm" variant="outline" className="w-full sm:w-auto min-h-11 sm:min-h-9 active:scale-[0.98] transition-transform rounded-xl" onClick={() => {
                      setApplyAccountId('');
                      setApplyCategory('');
                      setShowApplyLinksModal(true);
                    }}>
                      <RefreshCw className="mr-1 h-4 w-4" /> Aplicar a todas
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="w-full sm:w-auto min-h-11 sm:min-h-9 active:scale-[0.98] transition-transform rounded-xl" onClick={() => {
                    setRecDescription(`Mensalidade - ${contract.name}`);
                    setShowReceivableModal(true);
                  }}>
                    <Plus className="mr-1 h-4 w-4" /> Nova Receita
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="min-w-0">
                {(linkedTransactions || []).length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma conta vinculada a este contrato</p>
                ) : (
                  <div className="space-y-2 min-w-0">
                    {recPagination.paginatedItems.map(t => {
                      // Status da parcela: pago (verde) > atrasado (vermelho) > pendente (neutro).
                      const isOverdue = !t.is_paid && t.due_date && isBefore(parseLocalDate(t.due_date), todayLocal);
                      return (
                      <div key={t.id} className={cn(
                        'space-y-2 rounded-xl border p-3 text-sm min-w-0',
                        isOverdue && 'border-destructive/40 bg-destructive/5',
                      )}>
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{t.description}</p>
                            <p className={cn('break-words text-xs', isOverdue ? 'text-destructive' : 'text-muted-foreground')}>
                              {t.due_date ? `Vence ${format(parseLocalDate(t.due_date), 'dd/MM/yyyy')}` : format(parseLocalDate(t.transaction_date), 'dd/MM/yyyy')}
                            </p>
                          </div>
                          <Badge variant={t.is_paid ? 'success' : isOverdue ? 'destructive' : 'outline'} className="shrink-0">
                            {t.is_paid ? 'Pago' : isOverdue ? 'Atrasado' : 'Pendente'}
                          </Badge>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <span className="font-semibold break-words">R$ {formatBRL(Number(t.amount))}</span>
                          <div className="flex items-center gap-1 self-end sm:self-auto shrink-0">
                            {!t.is_paid && (
                              <Button variant="ghost" size="icon" className="min-h-11 min-w-11 sm:h-7 sm:w-7 sm:min-h-7 sm:min-w-7 text-success active:scale-90 transition-transform rounded-xl" title="Marcar pago" onClick={() => { markTxPaid.mutateAsync(t.id).then(() => queryClient.invalidateQueries({ queryKey: ['contract-detail'] })); }}>
                                <Check className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="min-h-11 min-w-11 sm:h-7 sm:w-7 sm:min-h-7 sm:min-w-7 text-warning active:scale-90 transition-transform rounded-xl" title="Editar" onClick={() => handleOpenEditRec(t)}>
                              <Pencil className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="min-h-11 min-w-11 sm:h-7 sm:w-7 sm:min-h-7 sm:min-w-7 text-destructive active:scale-90 transition-transform rounded-xl" title="Excluir" onClick={() => setDeletingRecId(t.id)}>
                              <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                    <div className="flex flex-col gap-1 border-t pt-2 text-sm sm:flex-row sm:justify-between">
                      <span className="text-muted-foreground break-words">Total: R$ {formatBRL(totalReceivable)}</span>
                      <span className="text-muted-foreground break-words">Recebido: R$ {formatBRL(totalPaid)}</span>
                    </div>
                    <div className="min-w-0 overflow-x-auto">
                      <DataTablePagination page={recPagination.page} totalPages={recPagination.totalPages} totalItems={recPagination.totalItems} from={recPagination.from} to={recPagination.to} pageSize={recPagination.pageSize} onPageChange={recPagination.setPage} onPageSizeChange={recPagination.setPageSize} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

        // "Ocorrências" e "Financeiro" viraram abas próprias em TODO contrato.
        // PMOC tem 5 abas; contrato comum tem 3 (Visão Geral + Ocorrências +
        // Financeiro).
        return (
          <SettingsSidebarLayout
            tabs={isPmoc ? pmocSidebarTabs : commonSidebarTabs}
            activeTab={pmocTab}
            onTabChange={(v) => setPmocTab(v as 'overview' | 'equipamentos' | 'ocorrencias' | 'historico' | 'financeiro' | 'documentos' | 'cronograma')}
          >
            {pmocTab === 'overview' && overviewContent}
            {pmocTab === 'ocorrencias' && occurrencesContent}
            {pmocTab === 'equipamentos' && (
              <ContractEnvironmentsTab contract={contract} />
            )}
            {isPmoc && pmocTab === 'historico' && id && (
              <PmocExecutionHistoryTab contractId={id} isPmoc={isPmoc} />
            )}
            {pmocTab === 'financeiro' && financialContent}
            {isPmoc && pmocTab === 'documentos' && id && (
              <PmocContractDocsTab
                contractId={id}
                templateContext={pmocTemplateContext}
                responsibleTechnicianId={
                  (contract as unknown as { responsible_technician_id?: string | null })
                    .responsible_technician_id ?? null
                }
                portalDocumentsReleased={
                  (contract as unknown as { portal_documents_released?: boolean | null })
                    .portal_documents_released ?? false
                }
              />
            )}
            {isPmoc && pmocTab === 'cronograma' && id && (
              <PmocContractCronogramaTab contractId={id} />
            )}
          </SettingsSidebarLayout>
        );
      })()}

      {/* Receivable modal */}
      <ResponsiveModal open={showReceivableModal} onOpenChange={setShowReceivableModal} title="Nova Conta a Receber">
        <div className="space-y-4 p-1">
          <div>
            <Label>Descrição</Label>
            <Input value={recDescription} onChange={e => setRecDescription(e.target.value)} placeholder="Ex: Mensalidade Março" />
          </div>
          <div>
            <Label>Valor (R$)</Label>
            <Input type="number" step="0.01" value={recAmount} onChange={e => setRecAmount(e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <Label>Conta bancária / caixa</Label>
            <SearchableSelect
              options={accountOptions}
              value={recAccountId}
              onValueChange={setRecAccountId}
              placeholder="Selecione a conta de recebimento"
              searchPlaceholder="Buscar conta..."
            />
            <p className="text-xs text-muted-foreground mt-1">Conta para onde o dinheiro vai. Aplicada a todas as parcelas.</p>
          </div>
          <div>
            <Label>Categoria</Label>
            <SearchableSelect
              options={receivableCategoryOptions}
              value={recCategory}
              onValueChange={setRecCategory}
              placeholder="Selecione a categoria"
              searchPlaceholder="Buscar categoria..."
            />
          </div>
          <div>
            <Label>Data de Vencimento (1ª parcela)</Label>
            <Input type="date" value={recDueDate} onChange={e => setRecDueDate(e.target.value)} />
          </div>
          <div>
            <Label>Recorrência</Label>
            <Select value={recFrequency} onValueChange={setRecFrequency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map(f => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {recFrequency !== 'unica' && (
            <div>
              <Label>Quantidade de parcelas</Label>
              <NumericInput value={recInstallments} onValueChange={setRecInstallments} placeholder="12" />
            </div>
          )}
          <Button className="w-full min-h-11 active:scale-[0.98] transition-transform rounded-xl" onClick={handleCreateReceivable} disabled={recSaving || !recDescription || !recAmount}>
            {recSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            {recFrequency !== 'unica' ? `Criar ${recInstallments || 1} Parcelas` : 'Criar Conta a Receber'}
          </Button>
        </div>
      </ResponsiveModal>

      {/* Aplicar conta/categoria a TODAS as parcelas deste contrato.
          Resolve contratos antigos cujas parcelas nasceram sem vínculo. */}
      <ResponsiveModal open={showApplyLinksModal} onOpenChange={setShowApplyLinksModal} title="Aplicar a todas as parcelas">
        <div className="space-y-4 p-1">
          <p className="text-sm text-muted-foreground">
            Define a conta bancária e/ou categoria em <strong>todas as {(linkedTransactions || []).length} parcelas</strong> deste
            contrato de uma vez. Deixe um campo em branco para não alterá-lo.
          </p>
          <div>
            <Label>Conta bancária / caixa</Label>
            <SearchableSelect
              options={accountOptions}
              value={applyAccountId}
              onValueChange={setApplyAccountId}
              placeholder="Selecione a conta"
              searchPlaceholder="Buscar conta..."
            />
          </div>
          <div>
            <Label>Categoria</Label>
            <SearchableSelect
              options={receivableCategoryOptions}
              value={applyCategory}
              onValueChange={setApplyCategory}
              placeholder="Selecione a categoria"
              searchPlaceholder="Buscar categoria..."
            />
          </div>
          <Button
            className="w-full min-h-11 active:scale-[0.98] transition-transform rounded-xl"
            onClick={handleApplyLinksToAllParcels}
            disabled={applySaving || (!applyAccountId && !applyCategory)}
          >
            {applySaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Aplicar a {(linkedTransactions || []).length} parcela{(linkedTransactions || []).length > 1 ? 's' : ''}
          </Button>
        </div>
      </ResponsiveModal>

      {/* Delete confirmation dialog - requires typing contract name */}
      <AlertDialog open={showDeleteDialog} onOpenChange={(open) => { setShowDeleteDialog(open); if (!open) setDeleteConfirmed(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contrato</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Tem certeza que deseja excluir o contrato <strong>{contract.name}</strong>?</p>
                <p className="text-sm">Serão excluídos junto com o contrato:</p>
                <ul className="text-sm list-disc pl-5 space-y-1">
                  <li>{occurrences.length} ordens de serviço vinculadas</li>
                  <li>{(linkedTransactions || []).filter(t => !t.is_paid).length} cobrança(s) em aberto (contas a receber)</li>
                  <li>{items.length} itens do contrato</li>
                  <li>Alertas de cobrança na agenda</li>
                </ul>
                {(linkedTransactions || []).filter(t => t.is_paid).length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {(linkedTransactions || []).filter(t => t.is_paid).length} recebimento(s) já realizado(s) serão <strong>preservados no caixa</strong> (mantidos no faturamento, sem vínculo com o contrato).
                  </p>
                )}
                <p className="text-sm font-medium text-destructive">Esta ação não pode ser desfeita.</p>
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox
                    id="delete-confirm"
                    checked={deleteConfirmed}
                    onCheckedChange={(v) => setDeleteConfirmed(!!v)}
                  />
                  <Label htmlFor="delete-confirm" className="text-sm cursor-pointer">Tenho certeza que desejo excluir</Label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteContract}
              disabled={isDeleting || !deleteConfirmed}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Excluir tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Renew / Estender — estende ESTE contrato e gera o próximo ciclo de
          visitas (sem criar contrato novo). Mobile = drawer de baixo via
          ResponsiveModal. Escolha de +6 / +12 meses (default 12). */}
      <ResponsiveModal open={showRenewDialog} onOpenChange={setShowRenewDialog} title="Renovar / Estender contrato">
        <div className="space-y-4 p-1">
          <p className="text-sm text-muted-foreground break-words">
            Estende este contrato e gera o próximo ciclo de visitas, continuando de onde a última visita parou. As visitas existentes não são alteradas.
          </p>
          <div className="space-y-2">
            <Label>Estender por</Label>
            <div className="grid grid-cols-2 gap-2">
              {[6, 12].map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={renewExtraMonths === m ? 'default' : 'outline'}
                  className="min-h-11 active:scale-[0.98] transition-transform rounded-xl"
                  onClick={() => setRenewExtraMonths(m)}
                >
                  +{m} meses
                </Button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <p>Horizonte atual: <strong>{contract.horizon_months} meses</strong> → novo: <strong>{contract.horizon_months + renewExtraMonths} meses</strong></p>
            <p>Frequência: {getFrequencyLabel(contract.frequency_type, contract.frequency_value)}</p>
          </div>
          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button variant="outline" className="min-h-11 active:scale-[0.98] transition-transform rounded-xl" onClick={() => setShowRenewDialog(false)} disabled={isRenewing}>
              Cancelar
            </Button>
            <Button className="min-h-11 active:scale-[0.98] transition-transform rounded-xl" onClick={handleRenewContract} disabled={isRenewing}>
              {isRenewing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Renovar +{renewExtraMonths} meses
            </Button>
          </div>
        </div>
      </ResponsiveModal>

      {/* Edit contract */}
      <ContractFormDialog open={showEditForm} onOpenChange={setShowEditForm} editContract={contract} onCreated={(newId) => { if (newId !== id) navigate(`/contratos/${newId}`); else queryClient.invalidateQueries({ queryKey: ['contract-detail'] }); }} />

      {/* Edit receivable modal */}
      <ResponsiveModal open={showEditRecModal} onOpenChange={setShowEditRecModal} title="Editar Conta a Receber">
        <div className="space-y-4 p-1">
          <div><Label>Descrição</Label><Input value={editRecDescription} onChange={e => setEditRecDescription(e.target.value)} /></div>
          <div><Label>Valor (R$)</Label><Input type="number" step="0.01" value={editRecAmount} onChange={e => setEditRecAmount(e.target.value)} /></div>
          <div><Label>Vencimento</Label><Input type="date" value={editRecDueDate} onChange={e => setEditRecDueDate(e.target.value)} /></div>
          <div className="flex flex-col gap-2 pt-2">
            <Button className="min-h-11 active:scale-[0.98] transition-transform rounded-xl" onClick={() => setShowBulkEditPrompt(true)} disabled={editRecSaving}>
              {editRecSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Salvar
            </Button>
          </div>
        </div>
      </ResponsiveModal>

      {/* Bulk edit prompt */}
      <AlertDialog open={showBulkEditPrompt} onOpenChange={setShowBulkEditPrompt}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar alterações</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja alterar apenas esta conta ou todas as contas pendentes vinculadas a este contrato?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={editRecSaving}>Cancelar</AlertDialogCancel>
            <Button variant="outline" disabled={editRecSaving} onClick={() => handleSaveEditRec(false)}>
              {editRecSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Somente esta
            </Button>
            <Button disabled={editRecSaving} onClick={() => handleSaveEditRec(true)}>
              {editRecSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Todas pendentes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regenerate PMOC token (destrutivo: invalida QR Code físico antigo) */}
      <AlertDialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerar token do Portal Público?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Isso invalida QR Codes <strong>já impressos</strong> deste contrato.
                  Clientes que escanearem o QR antigo verão página de erro.
                </p>
                <p className="text-sm">
                  Você precisará imprimir e colar um QR Code novo no quadro físico da unidade.
                </p>
                <p className="text-sm font-medium text-destructive">Tem certeza?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={regenerateToken.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRegenerateToken}
              disabled={regenerateToken.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {regenerateToken.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Regenerar token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancelar visita (botão "Pular") — agora cancela a OS daquela data. */}
      <AlertDialog open={!!cancelingOsId} onOpenChange={(open) => { if (!open) setCancelingOsId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar esta visita?</AlertDialogTitle>
            <AlertDialogDescription>
              A ordem de serviço desta visita será marcada como cancelada e não aparecerá mais como pendente. Você pode reativá-la depois pela tela da OS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelOccurrenceOs.isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (cancelingOsId) cancelOccurrenceOs.mutate(cancelingOsId, { onSuccess: () => setCancelingOsId(null) }); }}
              disabled={cancelOccurrenceOs.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelOccurrenceOs.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <SkipForward className="h-4 w-4 mr-2" />}
              Cancelar visita
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete receivable confirmation */}
      <AlertDialog open={!!deletingRecId} onOpenChange={() => setDeletingRecId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir esta conta a receber?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRecTransaction} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Documento "Plano de Manutenção" — overlay de impressão (contrato comum). */}
      {showMaintenancePlan && contract && (
        <ContractMaintenancePlanDocument
          contract={contract}
          onClose={() => setShowMaintenancePlan(false)}
        />
      )}
    </div>
  );
}
