import { DateField } from "@/components/ui/date-field";
import { FinancialReviewQueue } from "@/components/admin/FinancialReviewQueue";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  RefreshCw,
  Scale,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { NoticeBanner } from "@/components/ui/NoticeBanner";
import { FilterCheckboxGroup } from "@/components/mobile/FilterCheckboxGroup";
import { cn } from "@/lib/utils";
import { useAdminFinancialCategories } from "@/hooks/useAdminFinancialCategories";
import {
  type LedgerAsaasItem,
  type LedgerStatus,
  useAdminLedgerSummary,
  useAsaasBalance,
  useLedgerAsaas,
  useSyncAsaasLedger,
} from "@/hooks/useAsaasReconciliation";
import { LedgerAsaasList } from "./LedgerAsaasList";
import { AdminReconcileMovementDialog } from "../AdminReconcileMovementDialog";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Centavos: trata diferença < R$0,01 como zero (evita ruído de float).
const isReconciled = (diff: number) => Math.abs(diff) < 0.005;

const STATUS_OPTIONS: { value: LedgerStatus; label: string }[] = [
  { value: "pending_categorization", label: "A categorizar" },
  { value: "auto_categorized", label: "Conferido" },
  { value: "manually_categorized", label: "Categorizado" },
];

/**
 * Aba de Conciliação bancária do Asaas (painel master Auctus).
 *
 * Topo: saldo no Asaas × saldo agregado do ledger, indicador de divergência,
 * última importação e botão de sincronizar.
 * Embaixo: extrato filtrável por status com ação de categorizar.
 */
export function ReconciliationSection(
  { canManage = false }: { canManage?: boolean },
) {
  const [view, setView] = useState<"review" | "extract">("review");
  const [direction, setDirection] = useState<"all" | "credit" | "debit">("all");
  const [page, setPage] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<LedgerStatus[]>([]);
  const [categorizeItem, setCategorizeItem] = useState<LedgerAsaasItem | null>(
    null,
  );

  const { data: categories = [] } = useAdminFinancialCategories();
  const {
    data: asaasBalance,
    isLoading: balanceLoading,
    isError: balanceError,
  } = useAsaasBalance();
  // Totais vêm da RPC agregada e não podem depender da página limitada do extrato.
  const {
    data: ledgerSummary,
    isLoading: ledgerLoading,
    isError: ledgerError,
  } = useAdminLedgerSummary();
  const {
    data: ledgerPage,
    isLoading: listLoading,
    isError: listError,
    refetch: reloadList,
  } = useLedgerAsaas({
    status: view === "review" ? ["pending_categorization"] : statusFilter,
    direction: view === "review" && direction !== "all" ? direction : undefined,
    page,
    from,
    to,
  });
  const filteredItems = ledgerPage?.items ?? [];
  const sync = useSyncAsaasLedger();

  const systemBalance = Number(ledgerSummary?.balance ?? 0);

  const diff = (asaasBalance ?? 0) - systemBalance;
  const reconciled = isReconciled(diff);
  const canCompare = !balanceLoading && !balanceError && !ledgerLoading &&
    !ledgerError && ledgerSummary != null && asaasBalance != null;

  const lastImportedAt = ledgerSummary?.last_imported_at ?? null;
  const pendingCount = Number(ledgerSummary?.pending_count ?? 0);

  const openCategorize = (item: LedgerAsaasItem) => {
    if (!canManage) return;
    setCategorizeItem(item);
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      <div
        className="flex gap-1 border-b pb-3"
        role="group"
        aria-label="Visão da conciliação"
      >
        <Button
          variant="ghost"
          aria-pressed={view === "review"}
          className={view === "review"
            ? "bg-black text-white hover:bg-black hover:text-white"
            : ""}
          onClick={() => {
            setView("review");
            setPage(0);
          }}
        >
          Para revisar
        </Button>
        <Button
          variant="ghost"
          aria-pressed={view === "extract"}
          className={view === "extract"
            ? "bg-black text-white hover:bg-black hover:text-white"
            : ""}
          onClick={() => {
            setView("extract");
            setPage(0);
          }}
        >
          Extrato da conta
        </Button>
      </div>
      {view === "review"
        ? (
          <FinancialReviewQueue
            rows={filteredItems.map((item) => ({
              id: item.id,
              description: item.description || "Movimento Asaas",
              occurredAt: item.occurred_at,
              amount: Number(item.amount),
              direction: item.direction,
              reason: item.direction === "credit"
                ? "Recebimento sem vínculo"
                : "Categoria da despesa pendente",
              actionLabel: "Conciliar",
            }))}
            total={ledgerPage?.count ?? 0}
            page={page}
            onPageChange={setPage}
            direction={direction}
            onDirectionChange={(v) => {
              setDirection(v);
              setPage(0);
            }}
            from={from}
            to={to}
            onFromChange={(v) => {
              setFrom(v);
              setPage(0);
            }}
            onToChange={(v) => {
              setTo(v);
              setPage(0);
            }}
            isLoading={listLoading}
            isError={listError}
            onRetry={() => reloadList()}
            canManage={canManage}
            onReview={(row) => {
              const item = filteredItems.find((i) => i.id === row.id);
              if (item) openCategorize(item);
            }}
          />
        )
        : (
          <>
            {/* Conferência do extrato: apoio à conciliação recebida pelo webhook. */}
            <Card className="border-0 shadow-lg overflow-hidden">
              <CardContent className="p-4 lg:p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Saldo no Asaas */}
                  <div className="rounded-xl border bg-card p-3 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CircleDollarSign className="h-4 w-4" />
                      Saldo no Asaas
                    </div>
                    {balanceLoading
                      ? <Skeleton className="h-7 w-32" />
                      : balanceError
                      ? (
                        <p className="text-sm text-muted-foreground">
                          Indisponível
                        </p>
                      )
                      : (
                        <p className="text-xl lg:text-2xl font-bold">
                          {fmt(asaasBalance ?? 0)}
                        </p>
                      )}
                  </div>

                  {/* Saldo no sistema */}
                  <div className="rounded-xl border bg-card p-3 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Scale className="h-4 w-4" />
                      Saldo no sistema
                    </div>
                    {ledgerLoading
                      ? <Skeleton className="h-7 w-32" />
                      : ledgerError
                      ? <p role="alert">Saldo indisponível. Tente atualizar.</p>
                      : (
                        <p className="text-xl lg:text-2xl font-bold">
                          {fmt(systemBalance)}
                        </p>
                      )}
                  </div>
                </div>

                {/* Indicador de divergência */}
                {canCompare && (
                  <NoticeBanner
                    variant={reconciled ? "success" : "destructive"}
                    icon={reconciled ? CheckCircle2 : AlertTriangle}
                  >
                    {reconciled
                      ? "Conciliado — saldos batem."
                      : `Divergência de ${
                        fmt(Math.abs(diff))
                      } entre Asaas e sistema.`}
                  </NoticeBanner>
                )}

                {/* Última importação + botão */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {lastImportedAt
                      ? `Última atualização: ${
                        format(
                          new Date(lastImportedAt),
                          "dd/MM/yyyy 'às' HH:mm",
                          { locale: ptBR },
                        )
                      }`
                      : "Nenhum movimento recebido ainda."}
                  </p>
                  <Button
                    onClick={() => sync.mutate(undefined)}
                    disabled={!canManage || sync.isPending}
                    className="gap-2 w-full sm:w-auto bg-black text-white hover:bg-zinc-800"
                  >
                    <RefreshCw
                      className={cn(
                        "h-4 w-4",
                        sync.isPending && "animate-spin",
                      )}
                    />
                    {sync.isPending
                      ? "Sincronizando..."
                      : "Conferir extrato Asaas"}
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
                    onChange={(next) => {
                      setStatusFilter(next as LedgerStatus[]);
                      setPage(0);
                    }}
                    className="flex-1 max-w-sm"
                  />
                  {pendingCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="gap-1.5 self-start px-3 py-1 sm:self-auto"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {pendingCount} a categorizar
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <Label htmlFor="ledger-from">De</Label>
                    <DateField
                      id="ledger-from"
                      value={from}
                      onChange={(e) => {
                        setFrom(e);
                        setPage(0);
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ledger-to">Até</Label>
                    <DateField
                      id="ledger-to"
                      value={to}
                      min={from}
                      onChange={(e) => {
                        setTo(e);
                        setPage(0);
                      }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {ledgerPage?.count ?? 0}{" "}
                    movimentos no filtro · o saldo considera todo o extrato.
                  </p>
                </div>
                <div className="-mx-4 lg:-mx-5">
                  {listLoading
                    ? <p role="status" className="p-5">Carregando extrato…</p>
                    : listError
                    ? (
                      <div role="alert" className="p-5">
                        Não foi possível carregar o extrato.<Button
                          variant="outline"
                          onClick={() => reloadList()}
                        >
                          Tentar novamente
                        </Button>
                      </div>
                    )
                    : (
                      <LedgerAsaasList
                        items={filteredItems}
                        categories={categories}
                        canManage={canManage}
                        onCategorize={openCategorize}
                      />
                    )}
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-3">
              <Button
                variant="outline"
                disabled={page === 0 || listLoading}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm">
                Página {page + 1} de{" "}
                {Math.max(1, Math.ceil((ledgerPage?.count ?? 0) / 50))}
              </span>
              <Button
                variant="outline"
                disabled={(page + 1) * 50 >= (ledgerPage?.count ?? 0) ||
                  listLoading}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </>
        )}
      {categorizeItem && (
        <AdminReconcileMovementDialog
          movement={{
            ...categorizeItem,
            source: "asaas",
            description: categorizeItem.description || "Movimento Asaas",
          }}
          canManage={canManage}
          onClose={() => setCategorizeItem(null)}
        />
      )}
    </div>
  );
}
