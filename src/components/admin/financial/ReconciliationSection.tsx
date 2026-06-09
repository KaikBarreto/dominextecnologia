import { useMemo, useState } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, CircleDollarSign, Scale } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { cn } from '@/lib/utils';
import { useAdminFinancialCategories } from '@/hooks/useAdminFinancialCategories';
import {
  useAsaasBalance,
  useLedgerAsaas,
  useSyncAsaasLedger,
  type LedgerAsaasItem,
  type LedgerStatus,
} from '@/hooks/useAsaasReconciliation';
import { LedgerAsaasList } from './LedgerAsaasList';
import { CategorizeLedgerModal } from './CategorizeLedgerModal';

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Centavos: trata diferença < R$0,01 como zero (evita ruído de float).
const isReconciled = (diff: number) => Math.abs(diff) < 0.005;

const STATUS_OPTIONS: { value: LedgerStatus; label: string }[] = [
  { value: 'pending_categorization', label: 'A categorizar' },
  { value: 'auto_categorized', label: 'Conferido' },
  { value: 'manually_categorized', label: 'Categorizado' },
];

/**
 * Aba de Conciliação bancária do Asaas (painel master Auctus).
 *
 * Topo: saldo no Asaas × saldo no sistema (créditos − débitos do ledger),
 * indicador de divergência, última sincronização e botão de sincronizar.
 * Embaixo: extrato filtrável por status com ação de categorizar.
 */
export function ReconciliationSection() {
  const [statusFilter, setStatusFilter] = useState<LedgerStatus[]>([]);
  const [categorizeItem, setCategorizeItem] = useState<LedgerAsaasItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: categories = [] } = useAdminFinancialCategories();
  const { data: asaasBalance, isLoading: balanceLoading, isError: balanceError } = useAsaasBalance();
  // Saldo do sistema sempre da base completa (independe do filtro de status).
  const { data: allItems = [], isLoading: ledgerLoading } = useLedgerAsaas();
  const { data: filteredItems = [] } = useLedgerAsaas({ status: statusFilter });
  const sync = useSyncAsaasLedger();

  // Saldo do sistema = soma de créditos − débitos.
  const systemBalance = useMemo(
    () =>
      allItems.reduce(
        (acc, it) => acc + (it.direction === 'credit' ? Number(it.amount) : -Number(it.amount)),
        0,
      ),
    [allItems],
  );

  const diff = (asaasBalance ?? 0) - systemBalance;
  const reconciled = isReconciled(diff);
  const canCompare = !balanceLoading && !balanceError && !ledgerLoading;

  // Última sincronização = movimento mais recente (created_at).
  const lastSync = useMemo(() => {
    if (allItems.length === 0) return null;
    const max = allItems.reduce((m, it) => {
      const ts = new Date(it.created_at).getTime();
      return ts > m ? ts : m;
    }, 0);
    return max > 0 ? new Date(max) : null;
  }, [allItems]);

  const pendingCount = useMemo(
    () => allItems.filter((it) => it.status === 'pending_categorization').length,
    [allItems],
  );

  const openCategorize = (item: LedgerAsaasItem) => {
    setCategorizeItem(item);
    setModalOpen(true);
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Cabeçalho: saldos + divergência + sincronização */}
      <Card className="border-0 shadow-lg overflow-hidden">
        <CardContent className="p-4 lg:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Saldo no Asaas */}
            <div className="rounded-xl border bg-card p-3 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CircleDollarSign className="h-4 w-4" />
                Saldo no Asaas
              </div>
              {balanceLoading ? (
                <Skeleton className="h-7 w-32" />
              ) : balanceError ? (
                <p className="text-sm text-muted-foreground">Indisponível</p>
              ) : (
                <p className="text-xl lg:text-2xl font-bold">{fmt(asaasBalance ?? 0)}</p>
              )}
            </div>

            {/* Saldo no sistema */}
            <div className="rounded-xl border bg-card p-3 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Scale className="h-4 w-4" />
                Saldo no sistema
              </div>
              {ledgerLoading ? (
                <Skeleton className="h-7 w-32" />
              ) : (
                <p className="text-xl lg:text-2xl font-bold">{fmt(systemBalance)}</p>
              )}
            </div>
          </div>

          {/* Indicador de divergência */}
          {canCompare && (
            <div
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium',
                reconciled
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400',
              )}
            >
              {reconciled ? (
                <>
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Conciliado — saldos batem.
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Divergência de {fmt(Math.abs(diff))} entre Asaas e sistema.
                </>
              )}
            </div>
          )}

          {/* Última sincronização + botão */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {lastSync
                ? `Última sincronização: ${format(lastSync, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
                : 'Nenhuma sincronização ainda.'}
            </p>
            <Button
              onClick={() => sync.mutate(undefined)}
              disabled={sync.isPending}
              className="gap-2 w-full sm:w-auto"
            >
              <RefreshCw className={cn('h-4 w-4', sync.isPending && 'animate-spin')} />
              {sync.isPending ? 'Sincronizando...' : 'Sincronizar com Asaas'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filtro por status (multi-seleção; vazio = todos) */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-4 lg:p-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <FilterCheckboxGroup
              label="Status"
              emptyLabel="Todos"
              options={STATUS_OPTIONS}
              selected={statusFilter}
              onChange={(next) => setStatusFilter(next as LedgerStatus[])}
              className="flex-1 max-w-sm"
            />
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-700 dark:text-red-400 self-start sm:self-auto">
                <AlertTriangle className="h-3.5 w-3.5" />
                {pendingCount} a categorizar
              </span>
            )}
          </div>

          <div className="-mx-4 lg:-mx-5">
            <LedgerAsaasList items={filteredItems} categories={categories} onCategorize={openCategorize} />
          </div>
        </CardContent>
      </Card>

      <CategorizeLedgerModal item={categorizeItem} open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
