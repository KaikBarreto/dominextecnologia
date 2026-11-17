import { AdminCategoryPill } from "@/components/admin/financial/AdminCategoryPill";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateField } from "@/components/ui/date-field";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

import { AdminReconcileMovementDialog } from "./AdminReconcileMovementDialog";

type Movement = {
  id: string;
  occurred_at: string;
  amount: number;
  description: string | null;
  allocated_amount: number;
  reconciliation_status: "pending" | "partial" | "reconciled" | "transferred";
};
type Candidate = {
  id: string;
  description: string | null;
  category: string | null;
  transaction_date: string;
  amount: number;
  available: number;
};
type Item = {
  transaction_id?: string;
  category?: string;
  description?: string;
  amount: string;
};
const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBrt = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(
    new Date(value),
  );
const statuses: Record<Movement["reconciliation_status"], string> = {
  pending: "Pendente",
  partial: "Parcial",
  reconciled: "Conciliado",
  transferred: "Transferência",
};

export function AdminBankReconciliation({
  accountId,
  canManage = false,
}: {
  accountId: string;
  canManage?: boolean;
}) {
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reviewTarget, setReviewTarget] = useState<Movement | null>(null);
  const [selected, setSelected] = useState<Movement | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [undoOpen, setUndoOpen] = useState(false);
  function openDetails(m: Movement) {
    setSelected(m);
    setItems([]);
    setRequestId(crypto.randomUUID());
    setCategory(""); setAmount(""); setDescription("");
  }
  const movements = useQuery({
    queryKey: ["admin-bank-movements", accountId, page, status, from, to],
    queryFn: async () => {
      let q = (supabase as any)
        .from("admin_bank_reconciliation_movements")
        .select(
          "id,occurred_at,amount,description,allocated_amount,reconciliation_status",
          { count: "exact" },
        )
        .eq("bank_account_id", accountId)
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false })
        .range(page * 50, page * 50 + 49);
      if (status) q = q.eq("reconciliation_status", status);
      if (from) q = q.gte("occurred_at", `${from}T00:00:00-03:00`);
      if (to) q = q.lt("occurred_at", new Date(new Date(`${to}T00:00:00-03:00`).getTime() + 86400000).toISOString());
      const { data, error, count } = await q;
      if (error) throw error;
      return { items: (data ?? []) as Movement[], count: count ?? 0 };
    },
  });
  useEffect(() => {
    if (movements.data && !movements.isFetching && !movements.isError && page > 0 && page * 50 >= movements.data.count) {
      setPage(Math.max(0, Math.ceil(movements.data.count / 50) - 1));
    }
  }, [movements.data, movements.isFetching, movements.isError, page]);
  const categories = useQuery({
    queryKey: ["admin-bank-classification-categories"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("admin_financial_categories")
        .select("name,label,type,color,icon")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const candidates = useQuery({
    queryKey: ["admin-bank-match-candidates", selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "admin_bank_match_candidates",
        { p_transaction_id: selected!.id },
      );
      if (error) throw error;
      return (data ?? []) as Candidate[];
    },
  });
  const remaining = selected
    ? Math.max(
        0,
        Math.abs(Number(selected.amount)) -
          Number(selected.allocated_amount || 0),
      )
    : 0;
  const invalidate = () =>
    [
      "admin-reconcile-candidates",
      "admin-scheduled-accounts",
      "admin-finance-workspace-transactions",
      "admin-account-candidates",
      "all-admin-transactions",
      "admin-financial-post-snapshot-transactions",
      "admin-financial-transactions-dashboard",
      "admin-bank-movements",
      "admin-bank-accounts",
      "admin-cash-flow",
      "admin-dre-comparison",
      "admin-financial-transactions",
      "admin-financial-transactions-all",
      "admin-bank-statement-summary",
      "admin-bank-match-candidates",
      "admin-bank-transfer-candidates",
    ].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
  const reconcile = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Selecione um movimento.");
      const payload = items.map((i) => ({ ...i, amount: Number(i.amount) }));
      if (!payload.length || payload.length > 20 || payload.some(i => !Number.isFinite(i.amount) || i.amount <= 0))
        throw new Error("Adicione pelo menos uma classificação.");
      const sum = payload.reduce((n, i) => n + i.amount, 0);
      if (!Number.isFinite(sum) || sum <= 0 || sum > remaining + 0.001)
        throw new Error(
          "O rateio deve ser maior que zero e não pode ultrapassar o saldo restante.",
        );
      const id = requestId || crypto.randomUUID();
      setRequestId(id);
      const { error } = await (supabase as any).rpc(
        "admin_reconcile_bank_transaction",
        { p_request_id: id, p_transaction_id: selected.id, p_items: payload },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Movimento conciliado.");
      invalidate();
      setSelected(null);
      setItems([]);
      setRequestId(crypto.randomUUID());
    },
    onError: () =>
      toast.error(
        "Não foi possível salvar a conciliação. Confira saldo, categoria e tente novamente.",
      ),
  });
  const undo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc(
        "admin_unreconcile_bank_transaction",
        { p_transaction_id: id },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conciliação desfeita.");
      invalidate();
      setSelected(null);
      setUndoOpen(false);
    },
    onError: (error) =>
      toast.error(
        /unreconcile_requires_unsettling|settled_plan|scheduled_account_linked/i.test(String((error as { message?: string })?.message ?? ""))
          ? "Este movimento baixou uma conta. Reabra a conta em Contas a pagar/receber antes de desfazer a conciliação."
          : "Não foi possível desfazer; o lançamento pode ter sido alterado.",
      ),
  });
  useEffect(() => {
    setPage(0);
    setSelected(null);
    setReviewTarget(null);
  }, [accountId]);
  const allocatedDraft = items.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0,
  );
  const addCandidate = (c: Candidate) => {
    if (items.length >= 20)
      return toast.error("O rateio aceita no máximo 20 itens.");
    const available = Math.min(
      Number(c.available) - items.filter(i => i.transaction_id === c.id).reduce((sum, i) => sum + Number(i.amount), 0),
      Math.max(0, remaining - allocatedDraft),
    );
    if (available <= 0)
      return toast.error("Todo o saldo deste movimento já foi distribuído.");
    setItems((x) => [
      ...x,
      {
        transaction_id: c.id,
        description: c.description ?? "",
        amount: available.toFixed(2),
      },
    ]);
    setRequestId(crypto.randomUUID());
  };
  const addNew = () => {
    if (items.length >= 20)
      return toast.error("O rateio aceita no máximo 20 itens.");
    if (!category) return toast.error("Escolha uma categoria.");
    const value = Number(amount.replace(/\./g, "").replace(",", "."));
    if (
      !Number.isFinite(value) ||
      value <= 0 ||
      value > remaining - allocatedDraft
    )
      return toast.error("Informe um valor dentro do saldo restante.");
    setItems((x) => [
      ...x,
      { category, description, amount: value.toFixed(2) },
    ]);
    setRequestId(crypto.randomUUID());
    setAmount("");
    setDescription("");
  };
  const transfer = useMutation({
    mutationFn: async (candidate: any) => {
      if (!selected) throw new Error("Selecione um movimento.");
      const { error } = await (supabase as any).rpc(
        "admin_match_bank_transfer",
        {
          p_transaction_id: selected.id,
          p_counterpart_id: candidate.id,
          p_counterpart_source: candidate.source,
        },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transferência conciliada.");
      invalidate();
      setSelected(null);
    },
    onError: (error: Error) => toast.error(error.message.includes("classify_asaas_transfer_first") ? "Primeiro classifique a contrapartida Asaas como transferência entre contas, sem efeito no resultado." : "Não foi possível vincular: confira valor, conta e vínculos existentes."),
  });
  const transfers = useQuery({
    queryKey: ["admin-bank-transfer-candidates", selected?.id],
    enabled: !!selected && canManage,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "admin_bank_transfer_candidates",
        { p_transaction_id: selected!.id },
      );
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const busy = reconcile.isPending || undo.isPending || transfer.isPending;
  const compatibleCategories = useMemo(
    () =>
      categories.data?.filter(
        (c: any) =>
          c.type === (selected && selected.amount > 0 ? "income" : "expense") &&
          !["sale", "first_sale", "renewal", "upgrade"].includes(c.name),
      ) ?? [],
    [categories.data, selected],
  );
  return (
    <section className="space-y-4" aria-label="Conciliação bancária">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Conciliação do extrato</h3>
          <p className="text-sm text-muted-foreground">
            Classifique ou vincule cada movimento importado. O saldo nunca é
            alterado por esta tela.
          </p>
        </div>
        <Select value={(status) || "__all__"} onValueChange={value => {
            setStatus((value === "__all__" ? "" : value));
            setPage(0);
          }}><SelectTrigger aria-label="Filtrar status" className="h-10 rounded-md border bg-white text-zinc-900 px-3"><SelectValue /></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]">
          <SelectItem value="__all__">Todos os status</SelectItem>
          {Object.entries(statuses).map(([id, label]) => (
            <SelectItem key={id} value={id}>
              {label}
            </SelectItem>
          ))}
        </SelectContent></Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 sm:max-w-md">
        <div><Label htmlFor="bank-filter-from">De</Label><DateField id="bank-filter-from" value={from} onChange={(e) => { setFrom(e); setPage(0); }} /></div>
        <div><Label htmlFor="bank-filter-to">Até</Label><DateField id="bank-filter-to" value={to} onChange={(e) => { setTo(e); setPage(0); }} /></div>
      </div>
      {movements.isLoading ? (
        <p role="status">Carregando extrato…</p>
      ) : movements.isError ? (
        <div role="alert">Não foi possível carregar o extrato. <Button variant="outline" onClick={() => movements.refetch()}>Tentar novamente</Button></div>
      ) : (
        <>
          <div className="relative overflow-x-auto rounded-xl border bg-white text-zinc-900">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="p-3">Data</th>
                  <th className="p-3">Movimento</th>
                  <th className="p-3">Valor</th>
                  <th className="p-3">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {movements.data?.items.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="p-3 whitespace-nowrap">
                      {dateBrt(m.occurred_at)}
                    </td>
                    <td className="p-3 max-w-[280px] truncate">
                      {m.description || "Sem descrição"}
                    </td>
                    <td className="p-3 font-medium whitespace-nowrap">
                      {money(Number(m.amount))}
                    </td>
                    <td className="p-3">
                      <span className="rounded-full bg-slate-900 px-2 py-1 text-xs font-medium text-white">
                        {statuses[m.reconciliation_status]}
                      </span>
                    </td>
                    <td className="p-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (canManage && m.reconciliation_status !== "transferred") setReviewTarget(m);
                          else openDetails(m);
                        }}
                      >
                        {canManage && m.reconciliation_status !== "transferred" ? "Conciliar" : "Ver"}
                      </Button>
                    </td>
                  </tr>
                ))}
                {!movements.data?.items.length && (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-6 text-center text-muted-foreground"
                    >
                      Nenhum movimento neste filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>{movements.data?.count ?? 0} movimentos</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!page}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft />
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={(page + 1) * 50 >= (movements.data?.count ?? 0)}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
                <ChevronRight />
              </Button>
            </div>
          </div>
        </>
      )}
      {reviewTarget && (
        <AdminReconcileMovementDialog
          movement={{ ...reviewTarget, source: "bank", direction: reviewTarget.amount > 0 ? "credit" : "debit", amount: Math.abs(reviewTarget.amount), description: reviewTarget.description || "Movimento bancário" }}
          canManage={canManage}
          onClose={() => setReviewTarget(null)}
          advancedLabel="Vincular lançamento ou ratear"
          onAdvanced={() => { setReviewTarget(null); openDetails(reviewTarget); }}
        />
      )}
      <Sheet
        open={!!selected}
        onOpenChange={(open) => !open && !busy && setSelected(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Conciliar movimento</SheetTitle>
            <SheetDescription>
              {selected &&
                `${dateBrt(selected.occurred_at)} · ${selected.description || "Sem descrição"} · ${money(Number(selected.amount))}`}
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="mt-5 space-y-5">
              <div className="rounded-xl bg-slate-950 p-4 text-white">
                <p className="text-xs text-white/70">
                  Saldo disponível para conciliar
                </p>
                <p className="text-2xl font-bold">{money(remaining)}</p>
              </div>
              {!canManage ? (
                <p className="rounded-lg border bg-white text-zinc-900 p-3 text-sm">
                  Você tem acesso de leitura. Peça a alguém com permissão
                  financeira para conciliar.
                </p>
              ) : (
                <fieldset disabled={busy} className="space-y-5">
                  <div>
                    <Label>Vincular a lançamento existente</Label>
                    {candidates.isLoading ? (
                      <p className="mt-2 text-sm">Buscando candidatos…</p>
                    ) : candidates.isError ? (
                      <p role="alert" className="mt-2 text-sm text-red-700">
                        Não foi possível carregar candidatos.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {candidates.data?.map((c) => (
                          <button
                            type="button"
                            key={c.id}
                            onClick={() => addCandidate(c)}
                            className="flex w-full justify-between rounded-lg border bg-white text-zinc-900 p-3 text-left hover:border-slate-900"
                          >
                            <span>
                              {c.description || c.category || "Lançamento"}
                              <small className="block text-muted-foreground">
                                {new Date(
                                  c.transaction_date,
                                ).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                              </small>
                            </span>
                            <strong>{money(Number(c.available))}</strong>
                          </button>
                        ))}
                        {!candidates.data?.length && (
                          <p className="text-sm text-muted-foreground">
                            Nenhum lançamento compatível encontrado.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border bg-white text-zinc-900 p-3">
                    <Label>Nova classificação</Label>
                    <div className="mt-2 grid gap-2">
                      <Select value={category} onValueChange={value => setCategory(value)}><SelectTrigger aria-label="Categoria da classificação" className="h-10 rounded-md border bg-white text-zinc-900 px-3"><SelectValue placeholder="Categoria" /></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]">

                        {compatibleCategories.map((c: any) => (
                          <SelectItem key={c.name} value={c.name}><AdminCategoryPill name={c.name} categories={[c]} /></SelectItem>
                        ))}
                      </SelectContent></Select>
                      <Input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        aria-label="Descrição da classificação" placeholder="Descrição (opcional)"
                      />
                      <Input
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        aria-label="Valor da classificação" placeholder="Valor"
                      />
                      <Button type="button" variant="outline" className="bg-white text-zinc-900 text-black hover:bg-white" onClick={addNew}>
                        Adicionar ao rateio
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {items.map((i, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between rounded-lg border bg-white text-zinc-900 p-3 text-sm"
                      >
                        <span>
                          {i.transaction_id
                            ? "Lançamento existente"
                            : categories.data?.find((c: {name:string;label:string}) => c.name === i.category)?.label ?? i.category}
                        </span>
                        <Input className="w-28" aria-label={`Valor do rateio ${index + 1}`} type="number" min="0.01" step="0.01" value={i.amount} onChange={e => { setItems(x => x.map((item,n) => n === index ? {...item,amount:e.target.value} : item)); setRequestId(crypto.randomUUID()); }} />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setItems((x) => x.filter((_, n) => n !== index)); setRequestId(crypto.randomUUID()); }}
                        >
                          Remover
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="bg-black text-white hover:bg-zinc-800"
                      disabled={!items.length || busy || remaining <= 0 || selected.reconciliation_status === "transferred"}
                      onClick={() => reconcile.mutate()}
                    >
                      {reconcile.isPending ? "Salvando…" : "Salvar conciliação"}
                    </Button>
                    {selected.reconciliation_status !== "pending" && (
                      <Button
                        variant="outline"
                        disabled={undo.isPending}
                        onClick={() => setUndoOpen(true)}
                      >
                        <RotateCcw />
                        Desfazer
                      </Button>
                    )}
                  </div>
                  <div>
                    <Label>Transferência entre contas</Label>
                    {transfers.isLoading ? <p role="status" className="text-sm">Buscando contrapartidas…</p> : transfers.isError ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Transferências indisponíveis no momento.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {!transfers.data?.length && <p className="text-sm text-muted-foreground">Nenhuma contrapartida de mesmo valor em outra conta nos sete dias próximos.</p>}
                        {transfers.data
                          ?.filter(
                            (t: any) =>
                              Math.abs(Number(t.amount)) ===
                              Math.abs(Number(selected.amount)),
                          )
                          .map((t: any) => (
                            <button
                              type="button"
                              key={`${t.source}-${t.id}`}
                              disabled={busy || Number(selected.allocated_amount) > 0 || selected.reconciliation_status === "transferred"}
                              onClick={() => transfer.mutate(t)}
                              className="flex w-full justify-between rounded-lg border bg-white text-zinc-900 p-3 text-left hover:border-slate-900"
                            >
                              <span>
                                <ArrowLeftRight className="mr-2 inline h-4 w-4" />
                                {t.description ||
                                  t.account_name ||
                                  "Contrapartida"}
                                <small className="block text-muted-foreground">
                                  {t.source} ·{" "}
                                  {new Date(t.occurred_at).toLocaleDateString(
                                    "pt-BR", { timeZone: "America/Sao_Paulo" }
                                  )}
                                </small>
                              </span>
                              <strong>{money(Number(t.amount))}</strong>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </fieldset>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
      <AlertDialog open={undoOpen} onOpenChange={setUndoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer conciliação?</AlertDialogTitle>
            <AlertDialogDescription>Lançamentos criados automaticamente serão removidos somente se não tiverem sido alterados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={undo.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" disabled={undo.isPending || !selected} onClick={() => selected && undo.mutate(selected.id)}>Desfazer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
