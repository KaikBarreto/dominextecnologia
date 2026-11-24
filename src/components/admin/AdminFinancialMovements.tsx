import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AdminFinancialMovementForm,
  type AdminMovementCategory,
  type AdminMovementTransaction,
  type AdminMovementType,
} from "./AdminFinancialMovementForm";
import { buildDreCategoryIndex, labelForCategory } from "@/lib/adminDreBuckets";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FinancialTypeBadge, financialAmountClass } from "./FinancialRecordBadges";
import { AdminCategoryPill } from "./financial/AdminCategoryPill";

interface Props {
  transactions: any[];
  categories: AdminMovementCategory[];
  type?: AdminMovementType;
  title?: string;
  compact?: boolean;
  canManage: boolean;
  isLoading?: boolean;
  onCreate: (type: AdminMovementType) => void;
  renderExtraActions?: (transaction: any) => ReactNode;
  onEdit?: (transaction: any) => void;
  onDelete?: (transaction: any) => void;
}
const currency = (value: unknown) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const dateBrt = (value: any) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(
    new Date(
      typeof value === "string"
        ? value
        : value.effective_cash_date ?? value.cash_date ??
          value.transaction_date,
    ),
  );
const manual = (tx: any) =>
  tx?.asaas_transaction_id == null && tx?.reference_type == null;
const PAGE_SIZE = 12;
const csvCell = (value: unknown) => {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};
export function AdminFinancialMovements(
  {
    transactions,
    categories,
    type,
    title,
    compact = false,
    canManage,
    isLoading,
    onCreate,
    renderExtraActions,
    onEdit,
    onDelete,
  }: Props,
) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminMovementTransaction | null>(null);
  const [pendingDelete, setPendingDelete] = useState<any | null>(null);
  const index = useMemo(() => buildDreCategoryIndex(categories), [categories]);
  const visible = useMemo(
    () =>
      transactions.filter((tx) =>
        (!type || tx.type === type) &&
        (category === "all" || tx.category === category) &&
        `${tx.description ?? ""} ${labelForCategory(tx.category, index)}`
          .toLocaleLowerCase("pt-BR").includes(
            search.toLocaleLowerCase("pt-BR"),
          )
      ),
    [transactions, type, category, search, index],
  );
  const categoryTotals = useMemo(
    () =>
      visible.reduce<Record<string, number>>((total, tx) => {
        const key = tx.category || "sem_categoria";
        total[key] = (total[key] || 0) + Number(tx.amount || 0);
        return total;
      }, {}),
    [visible],
  );
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const rows = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  const remove = useMutation({
    mutationFn: async (tx: any) => {
      if (!canManage) {
        throw new Error("Você não tem permissão para excluir movimentações.");
      }
      if (!manual(tx)) {
        throw new Error(
          "Movimentações automáticas não podem ser excluídas aqui.",
        );
      }
      const { data, error } =
        await (supabase.from("admin_financial_transactions") as any).delete()
          .eq("id", tx.id).is("reference_type", null).is(
            "asaas_transaction_id",
            null,
          ).select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error(
          "A movimentação não é mais manual e não pode ser excluída aqui.",
        );
      }
    },
    onSuccess: () => {
      [
        "admin-financial-transactions",
        "admin-financial-transactions-all",
        "all-admin-transactions",
        "admin-financial-post-snapshot-transactions",
        "ledger_movements",
        "reconciliation_status",
        "reconciliation_status_view",
        "admin-finance-asaas-page",
        "admin-finance-ledger-summary",
        "admin-finance-workspace-transactions",
      ].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      toast.success("Movimentação excluída");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Não foi possível excluir",
      ),
  });
  const actions = (tx: any) => (
    <div className="flex items-center justify-end gap-1">
      {renderExtraActions?.(tx)}
      {canManage && manual(tx) && (
        <>
          <Button
            aria-label="Editar movimentação"
            size="icon"
            variant="ghost"
            onClick={() => onEdit ? onEdit(tx) : setEditing(tx)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            aria-label="Excluir movimentação"
            size="icon"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              remove.reset();
              setPendingDelete(tx);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
  const heading = title ??
    (type === "income"
      ? "Receitas"
      : type === "expense"
      ? "Despesas"
      : "Histórico de movimentações");
  const exportCsv = () => {
    const csv = [
      ["Data", "Descrição", "Categoria", "Tipo", "Valor"],
      ...visible.map((
        tx,
      ) => [
        dateBrt(tx),
        tx.description ?? "",
        labelForCategory(tx.category, index),
        tx.type === "income" ? "Receita" : "Despesa",
        Number(tx.amount || 0).toFixed(2).replace(".", ","),
      ]),
    ].map((row) => row.map(csvCell).join(";")).join("\r\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${
      heading.toLowerCase().replace(/[^a-z0-9]+/gi, "-") || "movimentacoes"
    }.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="space-y-4 rounded-2xl bg-white p-4 text-slate-950 shadow-sm [--background:0_0%_100%] [--foreground:240_10%_4%] [--muted-foreground:240_5%_35%] dark:bg-white dark:text-slate-950 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{heading}</h2>
          <p className="text-sm text-slate-600">
            {visible.length} lançamento{visible.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />Exportar CSV
          </Button>
          {canManage && type && (
            <Button
              className="bg-black text-white hover:bg-black/90"
              onClick={() => onCreate(type)}
            >
              <Plus className="mr-2 h-4 w-4" />Nova{" "}
              {type === "income" ? "receita" : "despesa"}
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar descrição ou categoria"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={category}
          onValueChange={(value) => {
            setCategory(value);
            setPage(1);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Todas as categorias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.filter((item) => !type || item.type === type).map((
              item,
            ) => (
              <SelectItem key={item.id} value={item.name}><AdminCategoryPill name={item.name} categories={[item]} /></SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(categoryTotals).map(([key, total]) => (
            <span
              key={key}
              className="rounded-full border bg-white px-3 py-1 text-xs font-medium"
            >
              {labelForCategory(key, index)}: {currency(total)}
            </span>
          ))}
        </div>
      )}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr>
              <th className="p-3">Data</th>
              <th className="p-3">Descrição</th>
              <th className="p-3">Categoria</th>
              <th className="p-3">Tipo</th>
              <th className="p-3 text-right">Valor</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center text-muted-foreground"
                  >
                    Carregando movimentações...
                  </td>
                </tr>
              )
              : rows.map((tx) => (
                <tr key={tx.id} className="border-b last:border-0">
                  <td className="p-3 whitespace-nowrap">{dateBrt(tx)}</td>
                  <td className="p-3">{tx.description || "—"}</td>
                  <td className="p-3"><AdminCategoryPill name={tx.category} categories={categories} size="sm" /></td>
                  <td className="p-3"><FinancialTypeBadge type={tx.type} /></td>
                  <td className={"p-3 text-right " + financialAmountClass(tx.type)}>
                    {tx.type === "income" ? "+" : "−"}
                    {currency(tx.amount)}
                  </td>
                  <td className="p-3">{actions(tx)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 md:hidden">
        {isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Carregando movimentações...
          </p>
        )}
        {rows.map((tx) => (
          <article key={tx.id} className="rounded-xl border p-3">
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-medium">
                  {tx.description || labelForCategory(tx.category, index)}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><span>{dateBrt(tx)}</span><AdminCategoryPill name={tx.category} categories={categories} size="sm" /><FinancialTypeBadge type={tx.type} /></div>
              </div>
              <p
                className={financialAmountClass(tx.type)}
              >
                {tx.type === "income" ? "+" : "−"}
                {currency(tx.amount)}
              </p>
            </div>
            <div className="mt-1">{actions(tx)}</div>
          </article>
        ))}
      </div>
      {!isLoading && !rows.length && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma movimentação encontrada.
        </p>
      )}
      <div className="flex items-center justify-between border-t pt-4 text-sm">
        <span>Página {safePage} de {pages}</span>
        <div className="flex gap-2">
          <Button
            size="icon"
            variant="outline"
            disabled={safePage <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            disabled={safePage >= pages}
            onClick={() => setPage((value) => value + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <AdminFinancialMovementForm
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        transaction={editing}
        defaultType={editing?.type ?? type ?? "income"}
        canManage={canManage}
        categories={categories}
      />
      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) =>
          !open && !remove.isPending && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir movimentação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove apenas o lançamento manual selecionado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {remove.isError && (
              <p role="alert" className="text-sm text-red-600">
                Não foi possível excluir. Confira sua conexão e tente novamente.
              </p>
            )}
            <AlertDialogCancel disabled={remove.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!canManage || remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (event) => {
                event.preventDefault();
                if (!canManage || remove.isPending || !pendingDelete) return;
                try {
                  if (onDelete) await onDelete(pendingDelete);
                  else await remove.mutateAsync(pendingDelete);
                  setPendingDelete(null);
                } catch {
                  /* Mantém a confirmação aberta para tentar novamente. */
                }
              }}
            >
              {remove.isPending ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
