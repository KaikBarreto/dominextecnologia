import { AdminCategoryPill } from "@/components/admin/financial/AdminCategoryPill";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useRef, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarCheck,
  ChevronRight,
  FilePlus2,
  GitBranch,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminFinancialCategories } from "@/hooks/useAdminFinancialCategories";
import {
  accountDate,
  accountError,
  accountMoney,
} from "./adminScheduledAccounts";

export type ReconcileMovement = {
  id: string;
  source: "asaas" | "bank";
  direction: "credit" | "debit";
  amount: number;
  occurred_at: string;
  description: string;
  bank_description?: string;
};
type Candidate = {
  id: string;
  version: number;
  description: string;
  counterparty: string | null;
  category_id: string | null;
  category_label: string | null;
  amount: number;
  due_date: string;
  bank_account_id: string | null;
};
type MatchResult = {
  movement: ReconcileMovement & {
    bank_account_name: string | null;
    classification: {
      classified_amount: number;
      remaining_amount: number;
      category_ids: string[];
      can_create: boolean;
      can_settle?: boolean;
      reason?: string | null;
    };
  };
  candidates: Candidate[];
  already_settled: {
    id: string;
    description: string;
    due_date: string;
    status: string;
  }[];
  total: number;
};
const invalidationKeys = [
  "admin-reconcile-candidates",
  "admin-finance-asaas-page",
  "admin-finance-ledger-summary",
  "admin-scheduled-accounts",
  "admin-finance-workspace-transactions",
  "admin-account-candidates",
  "admin-cash-flow",
  "ledger_movements",
  "admin-ledger-asaas",
  "ledger-asaas",
  "admin-ledger-summary",
  "admin-financial-transactions",
  "admin-financial-transactions-all",
  "financial-items",
  "admin-bank-movements",
  "admin-bank-accounts",
  "admin-bank-match-candidates",
  "admin-bank-statement-summary",
  "reconciliation_pending_queue",
  "admin-dre-comparison",
  "reconciliation_status",
  "reconciliation_status_view",
  "all-admin-transactions",
  "admin-financial-post-snapshot-transactions",
  "admin-financial-transactions-dashboard",
];
function reconciliationError(error: unknown) {
  const message = String((error as { message?: string })?.message ?? "");
  if (
    /existing_classification|partial|classified|category_conflict/i.test(
      message,
    )
  ) {
    return "Este movimento já tem uma classificação. Confira os vínculos existentes; a operação foi cancelada para preservar os lançamentos.";
  }
  if (
    /already_settled|already_linked|not_open|plan_movement|mismatch/i.test(
      message,
    )
  ) {
    return "A conta ou o movimento não estão mais disponíveis para esta baixa. Atualize a consulta e confira valor, direção e conta bancária.";
  }
  return accountError(error);
}
export function AdminReconcileMovementDialog(
  {
    movement,
    canManage,
    onClose,
    onAdvanced,
    advancedLabel = "Ratear ou completar classificação",
    onCommercial,
    onDifference,
    isDivergent = false,
  }: {
    movement: ReconcileMovement;
    canManage: boolean;
    onClose: () => void;
    onAdvanced?: () => void;
    advancedLabel?: string;
    onCommercial?: () => void;
    onDifference?: () => void;
    isDivergent?: boolean;
  },
) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"choose" | "account" | "create">("choose");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState(movement.description);
  const request = useRef(crypto.randomUUID());
  const outgoing = movement.direction === "debit";
  const sourceArgs = {
    p_ledger_id: movement.source === "asaas" ? movement.id : null,
    p_bank_transaction_id: movement.source === "bank" ? movement.id : null,
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const matches = useQuery({
    queryKey: [
      "admin-reconcile-candidates",
      "admin-finance-asaas-page",
      "admin-finance-ledger-summary",
      movement.source,
      movement.id,
      query,
      page,
    ],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "admin_reconciliation_scheduled_account_candidates",
        {
          ...sourceArgs,
          p_search: query || null,
          p_page: page,
          p_page_size: 10,
        },
      );
      if (error) throw error;
      return data as MatchResult;
    },
    placeholderData: keepPreviousData,
  });
  const categories = useAdminFinancialCategories();
  const options = (categories.data ?? []).filter((c) =>
    c.type === (outgoing ? "expense" : "income") &&
    (c as { is_manually_selectable?: boolean }).is_manually_selectable !==
      false &&
    !["sale", "first_sale", "renewal", "upgrade"].includes(c.name)
  );
  const classification = matches.data?.movement.classification;
  const hasClassification = Number(classification?.classified_amount ?? 0) > 0;
  const canSettle = classification?.can_settle !== false &&
    !(hasClassification &&
      (Number(classification?.remaining_amount) > 0 ||
        classification?.category_ids.length !== 1));
  const categoryConflict = hasClassification && !!selected?.category_id &&
    !classification?.category_ids.includes(selected.category_id);
  const alreadySettled = (matches.data?.already_settled.length ?? 0) > 0;
  const invalidate = () =>
    Promise.all(
      invalidationKeys.map((key) => qc.invalidateQueries({ queryKey: [key] })),
    );
  const save = useMutation({
    mutationFn: async () => {
      if (!canManage) throw new Error("permission_denied");
      if (step === "account" && !selected) throw new Error("invalid_plan");
      const args = {
        ...sourceArgs,
        p_request_id: request.current,
        p_category_id: category || null,
        p_description: description.trim() || null,
      };
      const { error } = await (supabase as any).rpc(
        step === "account"
          ? "admin_reconcile_scheduled_account"
          : "admin_create_reconciled_transaction",
        step === "account"
          ? {
            ...args,
            p_plan_id: selected!.id,
            p_expected_version: selected!.version,
          }
          : args,
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidate();
      toast.success(
        step === "account"
          ? "Conta baixada e movimento conciliado"
          : outgoing
          ? "Despesa registrada a partir do movimento"
          : "Receita registrada a partir do movimento",
      );
      onClose();
    },
    onError: () => {
      void invalidate();
    },
  });
  function changeStep(next: typeof step) {
    save.reset();
    setStep(next);
    setSelected(null);
    setCategory("");
    setDescription(movement.description);
    request.current = crypto.randomUUID();
  }
  function selectAccount(account: Candidate) {
    setSelected(account);
    setCategory(hasClassification ? "" : account.category_id ?? "");
    setDescription(account.description);
    save.reset();
    request.current = crypto.randomUUID();
  }
  const title = step === "choose"
    ? "Conciliar movimento"
    : step === "account"
    ? outgoing ? "Baixar conta a pagar" : "Baixar conta a receber"
    : outgoing
    ? "Nova despesa"
    : "Nova receita";
  const ready = !!matches.data && !matches.isError;
  const canSave = canManage && ready && !matches.isFetching &&
    !save.isPending && !isDivergent &&
    (step === "account"
      ? !!selected && canSettle && !categoryConflict && !alreadySettled &&
        (hasClassification || !!category)
      : step === "create" && !!classification?.can_create && !!category);
  return (
    <ResponsiveDialog
      open
      title={title}
      description="Use a movimentação confirmada para registrar o lançamento ou quitar uma conta agendada."
      className="max-w-2xl"
      mobileFullHeight
      dismissible={!save.isPending}
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            disabled={save.isPending}
            className="hover:bg-red-600 hover:text-white"
            onClick={() => step === "choose" ? onClose() : changeStep("choose")}
          >
            {step === "choose" ? "Fechar" : "Voltar"}
          </Button>
          {step !== "choose" && (
            <Button
              className="bg-black text-white hover:bg-zinc-800"
              disabled={!canSave}
              onClick={() => save.mutate()}
            >
              {save.isPending
                ? "Salvando…"
                : step === "account"
                ? "Baixar conta e conciliar"
                : outgoing
                ? "Registrar despesa"
                : "Registrar receita"}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <div
          className={`rounded-xl p-4 text-white ${
            outgoing ? "bg-red-600" : "bg-emerald-700"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm">
              {outgoing
                ? <ArrowUpRight className="h-4 w-4" />
                : <ArrowDownLeft className="h-4 w-4" />}
              {outgoing ? "Saída confirmada" : "Entrada confirmada"}
            </span>
            <strong className="text-xl tabular-nums">
              {accountMoney(Math.abs(movement.amount))}
            </strong>
          </div>
          <p className="mt-2 break-words text-sm">
            {movement.description || "Movimento bancário"}
          </p>
          {movement.bank_description && movement.bank_description !== movement.description && <p className="mt-1 text-sm">No extrato bancário: {movement.bank_description}</p>}
          <p className="mt-1 text-xs">
            {new Date(movement.occurred_at).toLocaleDateString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })} · {matches.data?.movement.bank_account_name ??
              (movement.source === "asaas" ? "Conta Asaas" : "Conta bancária")}
          </p>
        </div>
        {matches.isLoading
          ? <p role="status">Consultando vínculos e contas compatíveis…</p>
          : matches.isError
          ? (
            <div role="alert">
              <p className="text-sm">
                Não foi possível consultar este movimento.
              </p>
              <Button
                variant="outline"
                className="mt-2"
                onClick={() => matches.refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          )
          : (
            <>
              {alreadySettled && (
                <div role="status" className="border-b pb-3">
                  <p className="font-medium">
                    Este movimento já baixou uma conta
                  </p>
                  {matches.data!.already_settled.map((a) => (
                    <p key={a.id} className="mt-1 text-sm">
                      {a.description} · vencimento {accountDate(a.due_date)}
                    </p>
                  ))}
                </div>
              )}
              {hasClassification && (
                <section aria-label="Lançamento existente" className="space-y-2 border-b pb-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold">{outgoing ? "Despesa já registrada no financeiro" : "Receita já registrada no financeiro"}</h3>
                    <strong className="tabular-nums">{accountMoney(Number(classification!.classified_amount))}</strong>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(categories.data ?? []).filter(c => classification!.category_ids.includes(c.id)).map(c => (
                      <AdminCategoryPill key={c.id} name={c.name} categories={[c]} />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {Number(classification!.remaining_amount) > 0
                      ? `Este valor já está contabilizado. Ainda faltam ${accountMoney(Number(classification!.remaining_amount))} para classificar; complete apenas essa diferença.`
                      : "O valor total deste movimento já está contabilizado. Criar outro lançamento duplicaria a receita ou despesa."}
                  </p>
                  {!alreadySettled && canSettle && <p className="text-sm text-muted-foreground">Se este pagamento corresponde a uma conta agendada, use a opção de baixar conta abaixo. Ela vincula o pagamento existente, sem lançar o valor novamente.</p>}
                </section>
              )}
              {!canManage && (
                <p role="status" className="text-sm">
                  Seu perfil permite consultar. A baixa e a classificação exigem
                  permissão para gerenciar o financeiro.
                </p>
              )}
              {movement.direction === "credit" && !onCommercial &&
                !hasClassification && (
                <p className="text-sm text-muted-foreground">
                  Se este recebimento é uma venda ou renovação, confira o
                  pagamento no cadastro da empresa antes de registrar uma
                  receita avulsa.
                </p>
              )}
              {isDivergent && (
                <p
                  role="status"
                  className="rounded-md bg-amber-700 p-3 text-sm text-white"
                >
                  Confira a divergência antes de baixar uma conta ou criar outro
                  lançamento.
                </p>
              )}
              {step === "choose"
                ? (
                  <div className="divide-y">
                    <Choice
                      icon={CalendarCheck}
                      title={outgoing
                        ? "Baixar conta a pagar"
                        : "Baixar conta a receber"}
                      detail={!canSettle
                        ? "Confira a classificação e a natureza do movimento antes da baixa."
                        : alreadySettled
                        ? "Movimento já vinculado a uma conta."
                        : "Encontre a conta agendada e confirme a quitação."}
                      disabled={!canManage || !canSettle || alreadySettled ||
                        isDivergent}
                      onClick={() => changeStep("account")}
                    />
                    <Choice
                      icon={FilePlus2}
                      title={hasClassification ? (outgoing ? "Despesa já registrada" : "Receita já registrada") : (outgoing ? "Nova despesa" : "Nova receita")}
                      detail={classification?.can_create
                        ? "Registrar categoria e descrição usando este movimento."
                        : classification?.reason ===
                            "neutral_movement_not_reconcilable"
                        ? "Este movimento ajusta o caixa e não deve gerar receita ou despesa."
                        : "Não é necessário criar outro lançamento para este mesmo movimento."}
                      disabled={!canManage || !classification?.can_create ||
                        isDivergent}
                      onClick={() => changeStep("create")}
                    />
                    {onCommercial && movement.direction === "credit" && (
                      <Choice
                        icon={Link2}
                        title="Vincular venda ou renovação"
                        detail="Identificar a empresa e conferir o pagamento comercial."
                        disabled={!canManage || hasClassification ||
                          isDivergent}
                        onClick={onCommercial}
                      />
                    )}
                    {onAdvanced && (
                      <Choice
                        icon={GitBranch}
                        title={advancedLabel}
                        detail="Conferir lançamentos existentes e a distribuição por categorias."
                        disabled={!canManage}
                        onClick={onAdvanced}
                      />
                    )}
                    {onDifference && (
                      <Choice
                        icon={GitBranch}
                        title="Conferir valor divergente"
                        detail="Revisar o valor recebido e o contratado."
                        disabled={!canManage}
                        onClick={onDifference}
                      />
                    )}
                  </div>
                )
                : (
                  <>
                    {step === "account" && (
                      <div className="space-y-3">
                        <div>
                          <Label htmlFor="reconcile-account-search">
                            Buscar conta agendada
                          </Label>
                          <Input
                            id="reconcile-account-search"
                            placeholder="Descrição ou favorecido/pagador"
                            value={search}
                            onChange={(e) => {
                              setSelected(null);
                              setSearch(e.target.value);
                            }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Contas em aberto do mesmo valor, direção e conta
                          bancária. Confirme a descrição e o vencimento antes de
                          escolher.
                        </p>
                        {matches.isFetching && (
                          <p role="status" className="text-xs">
                            Atualizando contas compatíveis…
                          </p>
                        )}
                        {!matches.data?.candidates.length
                          ? (
                            <div className="py-4">
                              <p className="font-medium">
                                Nenhuma conta compatível encontrada
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Confira a busca e o agendamento. Valores
                                parciais ou diferentes precisam ser revisados;
                                não serão baixados integralmente.
                              </p>
                            </div>
                          )
                          : (
                            <fieldset className="space-y-2">
                              <legend className="sr-only">
                                Escolher conta para baixar
                              </legend>
                              {matches.data.candidates.map((a) => (
                                <label
                                  key={a.id}
                                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                                    selected?.id === a.id
                                      ? "border-black bg-black text-white"
                                      : "bg-white text-zinc-900"
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name="scheduled-match"
                                    className="mt-1"
                                    checked={selected?.id === a.id}
                                    onChange={() => selectAccount(a)}
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="block break-words font-medium">
                                      {a.description}
                                    </span>
                                    <span className="mt-1 block text-xs">
                                      {a.counterparty
                                        ? `${a.counterparty} · `
                                        : ""}Vence em {accountDate(a.due_date)}
                                    </span>
                                    {a.category_label && (
                                      <span className="block text-xs">
                                        {a.category_label}
                                      </span>
                                    )}
                                  </span>
                                  <strong className="whitespace-nowrap text-sm">
                                    {accountMoney(a.amount)}
                                  </strong>
                                </label>
                              ))}
                            </fieldset>
                          )}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs">
                            {matches.data?.total ?? 0} contas · página {page}
                          </span>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={page === 1 || matches.isFetching}
                              onClick={() => {
                                setSelected(null);
                                setPage((p) => p - 1);
                              }}
                            >
                              Anterior
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={page * 10 >=
                                  (matches.data?.total ?? 0) ||
                                matches.isFetching}
                              onClick={() => {
                                setSelected(null);
                                setPage((p) => p + 1);
                              }}
                            >
                              Próxima
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                    {(step === "create" || selected) && (
                      <div className="space-y-4 border-t pt-4">
                        {!hasClassification
                          ? (
                            <div>
                              <Label htmlFor="reconcile-category">
                                Categoria *
                              </Label>
                              <Select value={category} onValueChange={value => setCategory(value)}><SelectTrigger id="reconcile-category" className="h-10 w-full rounded-md border bg-white px-3 text-sm text-zinc-900"><SelectValue placeholder="Selecione a categoria" /></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]">

                                {options.map((c) => (
                                  <SelectItem key={c.id} value={c.id}><AdminCategoryPill name={c.name} categories={[c]} /></SelectItem>
                                ))}
                              </SelectContent></Select>
                              {categories.isError && (
                                <p
                                  role="alert"
                                  className="mt-2 text-sm text-red-700"
                                >
                                  Categorias indisponíveis.{" "}
                                  <button
                                    className="underline"
                                    onClick={() => categories.refetch()}
                                  >
                                    Tentar novamente
                                  </button>
                                </p>
                              )}
                            </div>
                          )
                          : (
                            <p className="text-sm">
                              A baixa reutiliza o lançamento existente. Uma
                              categoria incompatível com a conta impedirá a
                              confirmação.
                            </p>
                          )}
                        <div>
                          <Label htmlFor="reconcile-description">
                            Descrição do lançamento
                          </Label>
                          <Input
                            id="reconcile-description"
                            maxLength={240}
                            disabled={hasClassification}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                          />
                        </div>
                        {categoryConflict && (
                          <p
                            role="alert"
                            className="rounded-md bg-amber-700 p-3 text-sm text-white"
                          >
                            A categoria da conta é diferente da classificação
                            deste movimento. Revise a conta agendada antes de
                            baixar; o lançamento existente será preservado.
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {step === "account"
                            ? "Ao confirmar, a conta sai do previsto e fica vinculada a este movimento realizado."
                            : "O movimento bancário já existe. A confirmação registra sua classificação no financeiro, sem outra entrada ou saída no caixa."}
                        </p>
                      </div>
                    )}
                  </>
                )}
            </>
          )}
        {save.isError && (
          <p
            role="alert"
            className="rounded-md bg-red-600 p-3 text-sm text-white"
          >
            {reconciliationError(save.error)}
          </p>
        )}
      </div>
    </ResponsiveDialog>
  );
}
function Choice(
  { icon: Icon, title, detail, disabled, onClick }: {
    icon: typeof CalendarCheck;
    title: string;
    detail: string;
    disabled?: boolean;
    onClick: () => void;
  },
) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 py-4 text-left transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="mt-1 block text-sm">{detail}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0" />
    </button>
  );
}
