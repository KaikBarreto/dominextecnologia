import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminFinancialCategories } from "@/hooks/useAdminFinancialCategories";
import {
  fetchAdminAsaasPage,
  fetchAdminGatewayBalance,
  fetchAdminLedgerSummary,
  fetchAdminReconciliationCutoff,
} from "@/lib/adminFinancialAdapter";
import { FinancialReviewQueue } from "./FinancialReviewQueue";
import { AdminReconcileMovementDialog } from "./AdminReconcileMovementDialog";
const money = (v: number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function AdminAsaasReconciliation(
  { canManage, onAdvanced, onCommercial, onDifference }: {
    canManage: boolean;
    onAdvanced?: (row: any) => void;
    onCommercial?: (row: any) => void;
    onDifference?: (row: any) => void;
  },
) {
  const qc = useQueryClient();
  const [view, setView] = useState("review");
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const categories = useAdminFinancialCategories();
  const cutoff = useQuery({
    queryKey: ["admin-finance-reconciliation-cutoff"],
    queryFn: fetchAdminReconciliationCutoff,
  });
  const rows = useQuery({
    queryKey: ["admin-finance-asaas-page", {
      page,
      view,
      direction,
      from,
      to,
      status,
      cutoff: cutoff.data,
    }],
    enabled: !cutoff.isLoading && !cutoff.isError &&
      (!from || !to || from <= to),
    queryFn: () =>
      fetchAdminAsaasPage({
        page,
        view,
        direction,
        from,
        to,
        status,
        cutoff: cutoff.data ?? null,
      }),
    refetchInterval: 30000,
  });
  const bank = useQuery({
    queryKey: ["admin-finance-gateway-balance"],
    queryFn: fetchAdminGatewayBalance,
    retry: 1,
  });
  const ledger = useQuery({
    queryKey: ["admin-finance-ledger-summary"],
    queryFn: fetchAdminLedgerSummary,
    retry: 1,
  });
  const sync = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "sync-asaas-ledger",
        { body: {} },
      );
      if (error || data?.error || Number(data?.failed ?? 0) > 0) {
        throw new Error("sync_failed");
      }
    },
    onSuccess: async () => {
      await Promise.all(
        [
          "admin-finance-asaas-page",
          "admin-finance-ledger-summary",
          "admin-finance-gateway-balance",
          "admin-scheduled-accounts",
          "admin-cash-flow",
          "admin-financial-transactions",
          "admin-financial-transactions-all",
          "admin-finance-workspace-transactions",
          "ledger_movements",
          "ledger-asaas",
        ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
      );
      toast.success("Extrato conferido.");
    },
    onError: () =>
      toast.error("Não foi possível conferir o extrato. Tente novamente."),
  });
  useEffect(() => {
    if (
      rows.data && !rows.isFetching && !rows.isError && page > 0 &&
      page * 50 >= rows.data.count
    ) setPage(Math.max(0, Math.ceil(rows.data.count / 50) - 1));
  }, [rows.data, rows.isFetching, rows.isError, page]);
  const reset = (setter: (value: any) => void) => (value: any) => {
    setter(value);
    setPage(0);
  };
  const statusLabel = (
    s: string,
  ) => ({
    pending_categorization: "Pendente",
    partially_categorized: "Parcial",
    manually_categorized: "Classificado",
    auto_categorized: "Automático",
    reconciled: "Conciliado",
  }[s] || s);
  const open = (row: any) => {
    if (canManage) setSelected(row);
  };
  return (
    <div className="space-y-5">
      <div
        role="group"
        aria-label="Visão da conciliação"
        className="flex flex-wrap gap-1 border-b pb-3"
      >
        {[{ id: "review", label: "Para revisar" }, {
          id: "extract",
          label: "Extrato da conta",
        }].map((tab) => (
          <Button
            key={tab.id}
            variant="ghost"
            aria-pressed={view === tab.id}
            className={view === tab.id
              ? "bg-black text-white hover:bg-zinc-800 hover:text-white"
              : ""}
            onClick={() => {
              setView(tab.id);
              setPage(0);
            }}
          >
            {tab.label}
          </Button>
        ))}
      </div>
      {view === "review"
        ? (
          <FinancialReviewQueue
            rows={(rows.data?.items ?? []).map((row) => ({
              id: row.id,
              description: row.description,
              occurredAt: row.occurred_at,
              amount: Number(row.amount),
              direction: row.direction as "credit" | "debit",
              reason: row.divergent
                ? "Valor diferente do contratado"
                : row.status === "partially_categorized"
                ? "Classificação parcial"
                : row.direction === "credit"
                ? "Recebimento sem vínculo"
                : "Categoria da despesa pendente",
              actionLabel: "Conciliar",
            }))}
            total={rows.data?.count ?? 0}
            page={page}
            onPageChange={setPage}
            direction={direction as "all" | "credit" | "debit"}
            onDirectionChange={reset(setDirection)}
            from={from}
            to={to}
            onFromChange={reset(setFrom)}
            onToChange={reset(setTo)}
            isLoading={cutoff.isLoading || rows.isLoading}
            isFetching={rows.isFetching}
            isError={cutoff.isError || rows.isError}
            onRetry={() => {
              void cutoff.refetch();
              void rows.refetch();
            }}
            canManage={canManage}
            onReview={(row) =>
              open(rows.data?.items.find((item) => item.id === row.id))}
          />
        )
        : (
          <>
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Conferência da conta Asaas</h2>
                  <p className="text-sm text-muted-foreground">
                    Os movimentos chegam pelo webhook. Use a conferência para
                    revisar o extrato.
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={!canManage || sync.isPending}
                  onClick={() => sync.mutate()}
                >
                  {sync.isPending ? "Conferindo…" : "Conferir extrato Asaas"}
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[{
                  label: "Saldo disponível no Asaas",
                  value: bank.data,
                  loading: bank.isLoading,
                  error: bank.isError,
                }, {
                  label: "Saldo realizado no sistema",
                  value: ledger.data?.balance,
                  loading: ledger.isLoading,
                  error: ledger.isError,
                }, {
                  label: "Diferença a investigar",
                  value: bank.data != null && ledger.data?.balance != null
                    ? Math.abs(bank.data - Number(ledger.data.balance))
                    : null,
                  loading: bank.isLoading || ledger.isLoading,
                  error: bank.isError || ledger.isError,
                }].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border bg-card p-4"
                  >
                    <p className="text-sm text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="mt-2 text-xl font-semibold tabular-nums">
                      {item.loading
                        ? "Carregando…"
                        : item.error || item.value == null
                        ? "Indisponível"
                        : money(item.value)}
                    </p>
                  </div>
                ))}
              </div>
              {(bank.isError || ledger.isError) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    void bank.refetch();
                    void ledger.refetch();
                  }}
                >
                  Tentar consultar saldos novamente
                </Button>
              )}
            </section>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="asaas-from">De</Label>
                <Input
                  id="asaas-from"
                  type="date"
                  value={from}
                  onChange={(e) => reset(setFrom)(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="asaas-to">Até</Label>
                <Input
                  id="asaas-to"
                  type="date"
                  min={from}
                  value={to}
                  onChange={(e) => reset(setTo)(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="asaas-direction">Direção</Label>
                <select
                  id="asaas-direction"
                  className="block h-10 rounded-lg border bg-background px-3 text-sm"
                  value={direction}
                  onChange={(e) => reset(setDirection)(e.target.value)}
                >
                  <option value="all">Todas</option>
                  <option value="credit">Entradas</option>
                  <option value="debit">Saídas</option>
                </select>
              </div>
              <div>
                <Label htmlFor="asaas-status">Status</Label>
                <select
                  id="asaas-status"
                  className="block h-10 rounded-lg border bg-background px-3 text-sm"
                  value={status}
                  onChange={(e) => reset(setStatus)(e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="pending_categorization">Pendentes</option>
                  <option value="partially_categorized">Parciais</option>
                  <option value="manually_categorized">Classificados</option>
                  <option value="auto_categorized">Automáticos</option>
                </select>
              </div>
            </div>
            {from && to && from > to
              ? <p role="alert">A data inicial deve ser anterior à final.</p>
              : rows.isLoading
              ? <p role="status">Carregando extrato…</p>
              : rows.isError
              ? (
                <div role="alert">
                  Não foi possível carregar o extrato.<Button
                    variant="outline"
                    onClick={() => rows.refetch()}
                  >
                    Tentar novamente
                  </Button>
                </div>
              )
              : (
                <>
                  <div className="relative overflow-x-auto rounded-xl border bg-card">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="p-3">Data</th>
                          <th className="p-3">Descrição e categoria</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Valor</th>
                          <th className="p-3">
                            <span className="sr-only">Ações</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(rows.data?.items ?? []).map((row) => (
                          <tr key={row.id} className="border-b last:border-0">
                            <td className="whitespace-nowrap p-3">
                              {new Date(row.occurred_at).toLocaleDateString(
                                "pt-BR",
                                { timeZone: "America/Sao_Paulo" },
                              )}
                            </td>
                            <td className="min-w-48 max-w-sm p-3">
                              <p className="break-words font-medium">
                                {row.description}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {row.categories.map((name) =>
                                  categories.data?.find((c) =>
                                    c.name === name
                                  )?.label || name
                                ).join(" · ") || "Sem classificação"}
                              </p>
                            </td>
                            <td className="p-3">
                              <span
                                className={`inline-block whitespace-nowrap rounded-full px-2 py-1 text-xs text-white ${
                                  row.status === "pending_categorization" ||
                                    row.status === "partially_categorized"
                                    ? "bg-amber-700"
                                    : "bg-zinc-800"
                                }`}
                              >
                                {statusLabel(row.status)}
                              </span>
                            </td>
                            <td className="whitespace-nowrap p-3 text-right font-semibold tabular-nums">
                              {row.direction === "debit" ? "−" : "+"}
                              {money(Number(row.amount))}
                            </td>
                            <td className="p-3">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!canManage}
                                onClick={() =>
                                  open(row)}
                              >
                                Conciliar
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {!rows.data?.items.length && (
                          <tr>
                            <td
                              colSpan={5}
                              className="p-8 text-center text-muted-foreground"
                            >
                              Nenhum movimento neste filtro.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <span>
                      {rows.data?.count ?? 0} movimentos · Página {page + 1}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        disabled={page === 0 || rows.isFetching}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        disabled={(page + 1) * 50 >= (rows.data?.count ?? 0) ||
                          rows.isFetching}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                </>
              )}
          </>
        )}
      {cutoff.data && !from && (
        <p className="text-xs text-muted-foreground">
          Consulta a partir de{" "}
          {new Date(cutoff.data).toLocaleDateString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}. Use as datas para outro período.
        </p>
      )}
      {selected && (
        <AdminReconcileMovementDialog
          movement={selected}
          canManage={canManage}
          isDivergent={selected.divergent}
          onClose={() => setSelected(null)}
          onAdvanced={onAdvanced &&
              selected.status === "partially_categorized" && !selected.divergent
            ? () => {
              setSelected(null);
              onAdvanced(selected);
            }
            : undefined}
          onCommercial={onCommercial
            ? () => {
              setSelected(null);
              onCommercial(selected);
            }
            : undefined}
          onDifference={onDifference && selected.divergent
            ? () => {
              setSelected(null);
              onDifference(selected);
            }
            : undefined}
        />
      )}
    </div>
  );
}
