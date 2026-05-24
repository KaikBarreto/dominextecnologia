import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { QRCodeSVG } from 'qrcode.react';
import { ChevronLeft, ScrollText, Calendar, CheckCircle, Clock, ExternalLink, SkipForward, Repeat, DollarSign, Plus, Loader2, Pencil, Trash2, MoreVertical, RefreshCw, MoreHorizontal, Check, Eye, EyeOff, Copy, ShieldCheck, Printer, Info, FileText } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useContractPublicToken, useRegeneratePmocToken } from '@/hooks/usePmocPortal';
import { buildPmocPortalUrl } from '@/utils/pmocPortalApi';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ContractFormDialog } from '@/components/contracts/ContractFormDialog';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import { PmocContractDocsTab } from '@/components/pmoc/PmocContractDocsTab';
import { PmocContractCronogramaTab } from '@/components/pmoc/PmocContractCronogramaTab';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useContractDetail } from '@/hooks/useContractDetail';
import { useContracts, getFrequencyLabel } from '@/hooks/useContracts';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { useFinancial } from '@/hooks/useFinancial';
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

const OCC_STATUS: Record<string, { label: string; variant: 'success' | 'outline' | 'destructive' | 'secondary' }> = {
  scheduled: { label: 'Agendada', variant: 'outline' },
  completed: { label: 'Concluída', variant: 'success' },
  skipped: { label: 'Pulada', variant: 'secondary' },
  rescheduled: { label: 'Reagendada', variant: 'outline' },
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
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { contract, isLoading, updateOccurrenceStatus, stats, linkedTransactions, isLoadingTransactions } = useContractDetail(id);
  const { createTransaction } = useFinancial();
  const { settings: companySettings } = useCompanySettings();

  // Aba ativa quando contrato é PMOC (Onda C). Default = visão geral.
  const [pmocTab, setPmocTab] = useState<'overview' | 'documentos' | 'cronograma'>('overview');

  const { createContract, deleteContract } = useContracts();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showReceivableModal, setShowReceivableModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRenewDialog, setShowRenewDialog] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [recDescription, setRecDescription] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recDueDate, setRecDueDate] = useState('');
  const [recFrequency, setRecFrequency] = useState('unica');
  const [recInstallments, setRecInstallments] = useState('1');
  const [recSaving, setRecSaving] = useState(false);
  const [eqPage, setEqPage] = useState(1);
  const [editingRecTransaction, setEditingRecTransaction] = useState<any>(null);
  const [showEditRecModal, setShowEditRecModal] = useState(false);
  const [editRecDescription, setEditRecDescription] = useState('');
  const [editRecAmount, setEditRecAmount] = useState('');
  const [editRecDueDate, setEditRecDueDate] = useState('');
  const [editRecSaving, setEditRecSaving] = useState(false);
  const [showBulkEditPrompt, setShowBulkEditPrompt] = useState(false);
  const [pendingEditData, setPendingEditData] = useState<any>(null);
  const [deletingRecId, setDeletingRecId] = useState<string | null>(null);

  // Portal PMOC (Onda B v1.9.1) — só aparece quando is_pmoc=true.
  const { hasRole } = useAuth();
  const isPmoc = (contract as any)?.is_pmoc === true;
  const canRegenerateToken =
    hasRole('admin' as any) || hasRole('gestor' as any) || hasRole('super_admin' as any);
  const { data: publicToken } = useContractPublicToken(isPmoc ? id : null);
  const regenerateToken = useRegeneratePmocToken();
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [downloadingQr, setDownloadingQr] = useState(false);
  const portalUrl = publicToken ? buildPmocPortalUrl(publicToken) : null;

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

  const handleOpenPortal = () => {
    if (!portalUrl) return;
    window.open(portalUrl, '_blank', 'noopener,noreferrer');
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
        description: err.message,
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

  const sortedOccurrences = useMemo(() => 
    (contract?.contract_occurrences || []).sort((a: any, b: any) => a.occurrence_number - b.occurrence_number), 
    [contract]
  );
  const { sortedItems: sortedOcc, sortConfig: occSortConfig, handleSort: handleOccSort } = useTableSort(sortedOccurrences);
  const occPagination = useDataPagination(sortedOcc);
  const recPagination = useDataPagination(linkedTransactions || []);

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
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally { setEditRecSaving(false); }
  };

  const handleDeleteRecTransaction = async () => {
    if (!deletingRecId) return;
    try {
      await deleteTransaction.mutateAsync(deletingRecId);
      queryClient.invalidateQueries({ queryKey: ['contract-detail'] });
      setDeletingRecId(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    }
  };

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
        
        await createTransaction.mutateAsync({
          transaction_type: 'entrada',
          description: `${recDescription}${monthLabel}${suffix}`,
          amount,
          transaction_date: new Date().toISOString().split('T')[0],
          due_date: format(dueDate, 'yyyy-MM-dd'),
          is_paid: false,
          customer_id: contract.customer_id,
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
    } finally {
      setRecSaving(false);
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
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
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
    if (!contract) return;
    setIsRenewing(true);
    try {
      const lastOcc = sortedOccurrences[sortedOccurrences.length - 1];
      const newStartDate = lastOcc
        ? format(addDays(parseISO(lastOcc.scheduled_date), 1), 'yyyy-MM-dd')
        : format(new Date(), 'yyyy-MM-dd');

      const result = await createContract.mutateAsync({
        name: contract.name,
        customer_id: contract.customer_id,
        technician_id: contract.technician_id || null,
        team_id: (contract as any).team_id || null,
        service_type_id: contract.service_type_id || null,
        form_template_id: contract.form_template_id || null,
        status: 'active',
        notes: contract.notes || null,
        frequency_type: contract.frequency_type,
        frequency_value: contract.frequency_value,
        start_date: newStartDate,
        horizon_months: contract.horizon_months,
        // PMOC (Onda A): renovação preserva o flag e o RT do contrato original.
        // Se for PMOC, OSs vão sair via cron diário (não no momento da renovação).
        is_pmoc: (contract as any).is_pmoc === true,
        responsible_technician_id: (contract as any).responsible_technician_id || null,
        items: (contract.contract_items || []).map(i => ({
          equipment_id: i.equipment_id || null,
          item_name: i.item_name,
          item_description: i.item_description || null,
          form_template_id: i.form_template_id || null,
        })),
      });
      toast({ title: 'Contrato renovado com sucesso!' });
      if (result) navigate(`/contratos/${(result as any).id}`);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao renovar', description: err.message });
    } finally {
      setIsRenewing(false);
      setShowRenewDialog(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-muted-foreground">Contrato não encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/contratos')}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
      </div>
    );
  }

  const statusCfg = STATUS_LABELS[contract.status] || STATUS_LABELS.active;
  const occurrences = sortedOccurrences;
  const items = contract.contract_items || [];
  const showBillingInSchedule = (contract as any).show_billing_in_schedule !== false;

  const totalReceivable = (linkedTransactions || []).reduce((sum, t) => sum + Number(t.amount), 0);
  const totalPaid = (linkedTransactions || []).filter(t => t.is_paid).reduce((sum, t) => sum + Number(t.amount), 0);

  // Onda C — contexto pra pré-preencher templates rich dos docs PMOC.
  // Os campos abaixo vivem em colunas adicionadas pela Onda A/B (RT) — usamos
  // narrowing defensivo via Record genérico até types.ts ser regenerado.
  type RtRelation = { full_name?: string; modality?: string; cft_crea?: string };
  type CustomerExtra = { address?: string; city?: string; state?: string };
  // PostgREST join `responsible_technicians:responsible_technician_id (...)` no useContracts
  // resulta no alias PLURAL `responsible_technicians` (não singular). Bug histórico: lia
  // singular → contractRt sempre undefined → banner pintava RT como faltando mesmo
  // existindo no banco. Fix: usar plural (alias real do PostgREST).
  const contractRt = (contract as unknown as { responsible_technicians?: RtRelation }).responsible_technicians;
  const customerExtra = (contract.customers ?? {}) as unknown as CustomerExtra & { name?: string };
  const pmocTemplateContext = isPmoc
    ? {
        empresa_razao_social: companySettings?.name ?? '',
        empresa_cnpj: companySettings?.document ?? '',
        rt_nome: contractRt?.full_name ?? '',
        rt_modalidade: contractRt?.modality ?? '',
        rt_cft_crea: contractRt?.cft_crea ?? '',
        cidade: companySettings?.city ?? '',
        customer_name: customerExtra.name ?? '',
        customer_address: [customerExtra.address, customerExtra.city, customerExtra.state]
          .filter(Boolean)
          .join(', '),
        contract_frequency_label: getFrequencyLabel(contract.frequency_type, contract.frequency_value),
        contract_start_date_extenso: format(parseLocalDate(contract.start_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
        generated_at_extenso: format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
      }
    : undefined;

  return (
    <div className="space-y-6 overflow-hidden max-w-full w-full">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 sm:h-9 sm:w-9" onClick={() => navigate('/contratos')}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-2xl font-bold truncate">{contract.name}</h1>
            <Badge variant={statusCfg.variant} className="shrink-0">{statusCfg.label}</Badge>
          </div>
          <p className="text-muted-foreground text-xs sm:text-sm truncate">{contract.customers?.name || 'Cliente'}</p>
        </div>
        <div className="shrink-0">
          <RowActionsMenu
            actions={[
              { label: 'Editar contrato', icon: Pencil, variant: 'edit', onClick: () => setShowEditForm(true) },
              { label: 'Excluir contrato', icon: Trash2, variant: 'delete', onClick: () => { setDeleteConfirmed(false); setShowDeleteDialog(true); } },
            ]}
          />
        </div>
      </div>

      {/*
        Navegação PMOC: usa o componente canônico SettingsSidebarLayout
        (mesmo de Settings, Quotes, ServiceOrders, Financeiro). Desktop:
        rail vertical à esquerda com fundo primary sólido no ativo. Mobile:
        MobilePillTabs achatado. Só envolve o conteúdo quando isPmoc=true;
        contratos não-PMOC seguem direto pra "Visão Geral" sem nav.
      */}
      {(() => {
        const pmocSidebarTabs: SettingsTab[] = [
          { value: 'overview', label: 'Visão Geral', icon: Info },
          { value: 'documentos', label: 'Documentos', icon: FileText },
          { value: 'cronograma', label: 'Cronograma', icon: Calendar },
        ];

        const overviewContent = (
          <div className="grid gap-6 lg:grid-cols-3 min-w-0 w-full">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6 min-w-0 w-full">
          {/* Info card */}
          <Card className="w-full min-w-0 max-w-full overflow-hidden">
            <CardHeader>
              <CardTitle className="flex min-w-0 items-center gap-2 break-words">
                <ScrollText className="h-5 w-5 shrink-0" />
                <span className="min-w-0 break-words">Informações</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="min-w-0">
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
            </CardContent>
          </Card>

          {/* Equipment */}
          <Card className="w-full min-w-0 max-w-full overflow-hidden">
            <CardHeader>
              <CardTitle className="min-w-0 text-base sm:text-lg break-words">Equipamentos do Contrato ({items.length})</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0">
              {items.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Nenhum equipamento vinculado</p>
              ) : (
                <div className="space-y-2 min-w-0">
                  {items.slice((eqPage - 1) * 5, eqPage * 5).map(item => (
                    <div key={item.id} className="flex min-w-0 flex-col items-start gap-3 rounded-md border p-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium">{item.item_name}</p>
                        {item.item_description && <p className="break-words text-xs text-muted-foreground">{item.item_description}</p>}
                      </div>
                      {item.equipment && (
                        <Badge variant="secondary" className="shrink-0 self-start text-xs sm:self-auto">Equipamento</Badge>
                      )}
                    </div>
                  ))}
                  {items.length > 5 && (
                    <div className="flex flex-col items-start gap-2 border-t pt-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-xs text-muted-foreground">
                        {(eqPage - 1) * 5 + 1}-{Math.min(eqPage * 5, items.length)} de {items.length}
                      </span>
                      <div className="flex w-full gap-2 sm:w-auto">
                        <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => setEqPage(p => p - 1)} disabled={eqPage <= 1}>Anterior</Button>
                        <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => setEqPage(p => p + 1)} disabled={eqPage >= Math.ceil(items.length / 5)}>Próxima</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Receivables */}
          <Card className="w-full min-w-0 max-w-full overflow-hidden">
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
                <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => {
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
                  {recPagination.paginatedItems.map(t => (
                    <div key={t.id} className="space-y-2 rounded-md border p-3 text-sm min-w-0">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{t.description}</p>
                          <p className="break-words text-xs text-muted-foreground">
                            {t.due_date ? `Vence ${format(parseLocalDate(t.due_date), 'dd/MM/yyyy')}` : format(parseLocalDate(t.transaction_date), 'dd/MM/yyyy')}
                          </p>
                        </div>
                        <Badge variant={t.is_paid ? 'success' : 'outline'} className="shrink-0">{t.is_paid ? 'Pago' : 'Pendente'}</Badge>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="font-semibold break-words">R$ {formatBRL(Number(t.amount))}</span>
                        <div className="flex items-center gap-1 self-end sm:self-auto shrink-0">
                          {!t.is_paid && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-success" title="Marcar pago" onClick={() => { markTxPaid.mutateAsync(t.id).then(() => queryClient.invalidateQueries({ queryKey: ['contract-detail'] })); }}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => handleOpenEditRec(t)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Excluir" onClick={() => setDeletingRecId(t.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
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

          {/* Occurrences */}
          <Card className="w-full min-w-0 max-w-full overflow-hidden">
            <CardHeader>
              <CardTitle className="min-w-0 text-base sm:text-lg break-words">Ocorrências ({occurrences.length})</CardTitle>
            </CardHeader>
            <CardContent className={cn(isMobile ? 'p-3 min-w-0' : 'p-0 min-w-0')}>
              {isMobile ? (
                <div className="space-y-2 min-w-0">
                  {occPagination.paginatedItems.map(occ => {
                    const occDate = parseLocalDate(occ.scheduled_date);
                    const isPast = occ.status === 'scheduled' && isBefore(occDate, new Date());
                    const occStatusCfg = OCC_STATUS[occ.status] || OCC_STATUS.scheduled;
                    return (
                      <div key={occ.id} className={cn('min-w-0 space-y-2 rounded-md border p-3', isPast && 'border-warning/50 bg-warning/5')}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-muted-foreground">#{occ.occurrence_number}</span>
                          <Badge variant={occStatusCfg.variant} className="shrink-0">{occStatusCfg.label}</Badge>
                        </div>
                        <div className="flex min-w-0 flex-col items-start gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                          <span className={cn('font-medium break-words', isPast && 'text-warning')}>
                            {format(occDate, 'dd/MM/yyyy')} <span className="font-normal text-muted-foreground">({format(occDate, 'EEE', { locale: ptBR })})</span>
                          </span>
                          {occ.service_orders ? (
                            <Badge variant="secondary" className="shrink-0 self-start text-xs">OS #{occ.service_orders.order_number}</Badge>
                          ) : null}
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          {occ.service_order_id && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                              <a href={`/os-tecnico/${occ.service_order_id}`} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                          {occ.status === 'scheduled' && (
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-warning"
                              title="Pular esta ocorrência"
                              onClick={() => updateOccurrenceStatus.mutate({ id: occ.id, status: 'skipped' })}
                            >
                              <SkipForward className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
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
                        <SortableTableHead sortKey="" sortConfig={occSortConfig} onSort={() => {}}>OS</SortableTableHead>
                        <SortableTableHead sortKey="status" sortConfig={occSortConfig} onSort={handleOccSort}>Status</SortableTableHead>
                        <SortableTableHead sortKey="" sortConfig={occSortConfig} onSort={() => {}} className="w-[100px]">Ações</SortableTableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {occPagination.paginatedItems.map(occ => {
                        const occDate = parseLocalDate(occ.scheduled_date);
                        const isPast = occ.status === 'scheduled' && isBefore(occDate, new Date());
                        const occStatusCfg = OCC_STATUS[occ.status] || OCC_STATUS.scheduled;

                        return (
                          <TableRow key={occ.id} className={cn(isPast && 'bg-warning/5')}>
                            <TableCell className="font-mono text-xs text-muted-foreground">{occ.occurrence_number}</TableCell>
                            <TableCell className={cn(isPast && 'text-warning font-medium')}>
                              {format(occDate, 'dd/MM/yyyy')}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {format(occDate, 'EEE', { locale: ptBR })}
                            </TableCell>
                            <TableCell>
                              {occ.service_orders ? (
                                <Badge variant="secondary">OS #{occ.service_orders.order_number}</Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant={occStatusCfg.variant}>{occStatusCfg.label}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {occ.service_order_id && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                                    <a href={`/os-tecnico/${occ.service_order_id}`} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                  </Button>
                                )}
                                {occ.status === 'scheduled' && (
                                  <Button
                                    variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-warning"
                                    title="Pular esta ocorrência"
                                    onClick={() => updateOccurrenceStatus.mutate({ id: occ.id, status: 'skipped' })}
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
        </div>

        {/* Right column */}
        <div className="space-y-6 min-w-0 w-full">
          <Card className="w-full min-w-0 max-w-full overflow-hidden">
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
              <Button variant="outline" className="mt-2 w-full" onClick={() => setShowRenewDialog(true)}>
                <RefreshCw className="mr-2 h-4 w-4" /> Renovar Contrato
              </Button>
            </CardContent>
          </Card>

          <Card className="w-full min-w-0 max-w-full overflow-hidden">
            <CardHeader><CardTitle className="text-base break-words">Financeiro</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm min-w-0">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <span className="text-muted-foreground">Total a receber</span>
                <span className="min-w-0 break-words text-right font-medium text-success">R$ {formatBRL(totalReceivable)}</span>
              </div>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <span className="text-muted-foreground">Recebido</span>
                <span className="min-w-0 break-words text-right font-medium">R$ {formatBRL(totalPaid)}</span>
              </div>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <span className="text-muted-foreground">Pendente</span>
                <span className="min-w-0 break-words text-right font-medium text-warning">R$ {formatBRL(totalReceivable - totalPaid)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="w-full min-w-0 max-w-full overflow-hidden">
            <CardHeader><CardTitle className="text-base break-words">Progresso</CardTitle></CardHeader>
            <CardContent className="space-y-3 min-w-0">
              <Progress value={stats.progressPercent} className="h-3" />
              <p className="text-center text-sm text-muted-foreground break-words">
                {stats.completedOccurrences} de {stats.totalOccurrences} concluídas ({stats.progressPercent}%)
              </p>
            </CardContent>
          </Card>

          {/* Portal PMOC Público (Onda B v1.9.1) — só pra contratos PMOC. */}
          {isPmoc && (
            <Card className="w-full min-w-0 max-w-full overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base break-words">
                  <ShieldCheck className="h-4 w-4 text-info shrink-0" />
                  Portal Público
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 min-w-0">
                <p className="text-xs text-muted-foreground break-words">
                  Página pública desta unidade para o cliente final. Aparece no QR Code colado no quadro físico.
                </p>

                {portalUrl && (
                  <div className="flex justify-center">
                    <div
                      className={cn(
                        'inline-flex items-center justify-center rounded-xl p-4 transition-colors',
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
                  </div>
                )}

                {portalUrl ? (
                  <div className="rounded-md border bg-muted/40 p-2 text-xs font-mono break-all min-w-0">
                    {portalUrl}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                    Link público em geração. Ative o módulo PMOC ou aguarde o próximo deploy.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyPortalLink}
                    disabled={!portalUrl}
                    className="min-h-[40px]"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copiar link
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenPortal}
                    disabled={!portalUrl}
                    className="min-h-[40px]"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Abrir portal
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrintQrCode}
                    disabled={!portalUrl || downloadingQr}
                    className="col-span-2 min-h-[40px]"
                  >
                    {downloadingQr ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Printer className="h-3.5 w-3.5 mr-1" />
                    )}
                    Imprimir QR Code
                  </Button>
                  {canRegenerateToken && (
                    <Button
                      variant="destructive-ghost"
                      size="sm"
                      onClick={() => setShowRegenerateDialog(true)}
                      disabled={!publicToken || regenerateToken.isPending}
                      className="col-span-2 min-h-[40px]"
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      Regenerar token
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
          </div>
        );

        if (!isPmoc) {
          return overviewContent;
        }

        return (
          <SettingsSidebarLayout
            tabs={pmocSidebarTabs}
            activeTab={pmocTab}
            onTabChange={(v) => setPmocTab(v as 'overview' | 'documentos' | 'cronograma')}
          >
            {pmocTab === 'overview' && overviewContent}
            {pmocTab === 'documentos' && id && (
              <PmocContractDocsTab
                contractId={id}
                templateContext={pmocTemplateContext}
                responsibleTechnicianId={
                  (contract as unknown as { responsible_technician_id?: string | null })
                    .responsible_technician_id ?? null
                }
              />
            )}
            {pmocTab === 'cronograma' && id && (
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
              <Input type="number" min="1" max="60" value={recInstallments} onChange={e => setRecInstallments(e.target.value)} placeholder="12" />
            </div>
          )}
          <Button className="w-full" onClick={handleCreateReceivable} disabled={recSaving || !recDescription || !recAmount}>
            {recSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            {recFrequency !== 'unica' ? `Criar ${recInstallments || 1} Parcelas` : 'Criar Conta a Receber'}
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
                  <li>{occurrences.length} ocorrências</li>
                  <li>{occurrences.filter(o => o.service_order_id).length} ordens de serviço vinculadas</li>
                  <li>{(linkedTransactions || []).length} transações financeiras (contas a receber)</li>
                  <li>{items.length} itens do contrato</li>
                  <li>Alertas de cobrança na agenda</li>
                </ul>
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

      {/* Renew confirmation dialog */}
      <AlertDialog open={showRenewDialog} onOpenChange={setShowRenewDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Renovar contrato</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Será criado um novo contrato com as mesmas configurações:</p>
                <ul className="text-sm list-disc pl-5 space-y-1">
                  <li>Cliente: {contract.customers?.name}</li>
                  <li>Frequência: {getFrequencyLabel(contract.frequency_type, contract.frequency_value)}</li>
                  <li>Horizonte: {contract.horizon_months} meses</li>
                  <li>{items.length} itens</li>
                </ul>
                <p className="text-sm">A data de início será o dia seguinte à última ocorrência do contrato atual.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRenewing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRenewContract} disabled={isRenewing}>
              {isRenewing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Renovar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit contract */}
      <ContractFormDialog open={showEditForm} onOpenChange={setShowEditForm} editContract={contract} onCreated={(newId) => { if (newId !== id) navigate(`/contratos/${newId}`); else queryClient.invalidateQueries({ queryKey: ['contract-detail'] }); }} />

      {/* Edit receivable modal */}
      <ResponsiveModal open={showEditRecModal} onOpenChange={setShowEditRecModal} title="Editar Conta a Receber">
        <div className="space-y-4 p-1">
          <div><Label>Descrição</Label><Input value={editRecDescription} onChange={e => setEditRecDescription(e.target.value)} /></div>
          <div><Label>Valor (R$)</Label><Input type="number" step="0.01" value={editRecAmount} onChange={e => setEditRecAmount(e.target.value)} /></div>
          <div><Label>Vencimento</Label><Input type="date" value={editRecDueDate} onChange={e => setEditRecDueDate(e.target.value)} /></div>
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={() => setShowBulkEditPrompt(true)} disabled={editRecSaving}>
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
    </div>
  );
}
