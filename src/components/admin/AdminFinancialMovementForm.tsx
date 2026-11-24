import { FinancialSmartDescription } from '@/components/financial/FinancialSmartDescription';
import { AdminCategoryPill } from "@/components/admin/financial/AdminCategoryPill";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, Circle, TrendingDown, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type AdminMovementType = "income" | "expense";
export interface AdminMovementCategory {
  id: string;
  name: string;
  label: string;
  type: AdminMovementType;
  color: string;
  icon: string | null;
  is_manually_selectable?: boolean | null;
}
export interface AdminMovementTransaction {
  id: string;
  type: AdminMovementType;
  category: string;
  amount: number | string;
  description?: string | null;
  transaction_date: string;
  reference_type?: string | null;
  asaas_transaction_id?: string | null;
  [key: string]: any;
}
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: AdminMovementType;
  transaction?: AdminMovementTransaction | null;
  canManage: boolean;
  categories?: AdminMovementCategory[];
}

const calendarDate = (date = new Date()) =>
  new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date) + "T12:00:00",
  );
const brtTimestamp = (date: Date) =>
  new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 15, 0, 0),
  ).toISOString();
const parseAmount = (value: string) =>
  Number(value.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", "."));
const formatAmount = (value: number | string) =>
  Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const manual = (
  tx: Pick<AdminMovementTransaction, "reference_type" | "asaas_transaction_id">,
) => tx.reference_type == null && tx.asaas_transaction_id == null;

export function AdminFinancialMovementForm(
  {
    open,
    onOpenChange,
    defaultType = "income",
    transaction,
    canManage,
    categories: categoriesProp,
  }: Props,
) {
  const queryClient = useQueryClient();
  const requestId = useRef(crypto.randomUUID());
  const lastPayload = useRef("");
  const [type, setType] = useState<AdminMovementType>(defaultType);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(calendarDate());
  const [showErrors, setShowErrors] = useState(false);
  const [duplicates, setDuplicates] = useState<string[] | null>(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const isEditing = Boolean(transaction);
  const { data: fetchedCategories = [] } = useQuery({
    queryKey: ["admin-financial-movement-category-options"],
    enabled: open && !categoriesProp,
    queryFn: async () => {
      const { data, error } = await supabase.from("admin_financial_categories")
        .select("*").order("label");
      if (error) throw error;
      return data as AdminMovementCategory[];
    },
  });
  const allCategories = categoriesProp ?? fetchedCategories;
  useEffect(() => {
    if (!open) return;
    requestId.current = crypto.randomUUID();
    lastPayload.current = "";
    setShowErrors(false);
    setDuplicates(null);
    if (transaction) {
      setType(transaction.type);
      setCategory(transaction.category);
      setAmount(formatAmount(transaction.amount));
      setDescription(transaction.description ?? "");
      setDate(calendarDate(new Date(transaction.transaction_date)));
    } else {
      setType(defaultType);
      setCategory("");
      setAmount("");
      setDescription("");
      setDate(calendarDate());
    }
  }, [open, defaultType, transaction]);
  const allowedCategories = useMemo(
    () =>
      allCategories.filter((item: any) =>
        item.type === type && item.is_active !== false &&
        item.is_manually_selectable !== false &&
        (isEditing ||
          !["sale", "first_sale", "renewal", "upgrade"].includes(item.name))
      ),
    [allCategories, type, isEditing],
  );
  const parsedAmount = parseAmount(amount);
  const invalid = !category || !Number.isFinite(parsedAmount) ||
    parsedAmount <= 0;
  const invalidate = () => {
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
    queryClient.invalidateQueries({
      predicate: (query) =>
        String(query.queryKey[0]).startsWith(
          "admin-financial-transactions-dashboard",
        ),
    });
  };
  const save = useMutation({
    mutationFn: async () => {
      if (!canManage) {
        throw new Error("Você não tem permissão para alterar movimentações.");
      }
      if (
        invalid || !allowedCategories.some((item) => item.name === category)
      ) throw new Error("Confira o valor e a categoria antes de salvar.");
      const payload = JSON.stringify([
        type,
        category,
        parsedAmount,
        description,
        brtTimestamp(date),
      ]);
      if (lastPayload.current && lastPayload.current !== payload) {
        requestId.current = crypto.randomUUID();
      }
      lastPayload.current = payload;
      if (transaction) {
        if (!manual(transaction)) {
          throw new Error(
            "Movimentações automáticas não podem ser alteradas aqui.",
          );
        }
        const { data, error } =
          await (supabase.from("admin_financial_transactions") as any).update({
            type,
            category,
            amount: parsedAmount,
            description: description || null,
            transaction_date: brtTimestamp(date),
          }).eq("id", transaction.id).is("reference_type", null).is(
            "asaas_transaction_id",
            null,
          ).select("id");
        if (error) throw error;
        if (!data?.length) {
          throw new Error(
            "A movimentação não é mais manual e não pode ser alterada aqui.",
          );
        }
      } else {
        const { error } = await supabase.rpc(
          "admin_create_financial_movement",
          {
            p_request_id: requestId.current,
            p_type: type,
            p_category: category,
            p_amount: parsedAmount,
            p_date: brtTimestamp(date),
            p_description: description || null,
            p_awaiting_asaas: false,
          },
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success(
        isEditing ? "Movimentação atualizada" : "Movimentação criada",
      );
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a movimentação",
      ),
  });
  const findDuplicates = async () => {
    if (
      type !== "expense" || !Number.isFinite(parsedAmount) || parsedAmount <= 0
    ) return [];
    const anchor = brtTimestamp(date);
    const from = new Date(new Date(anchor).getTime() - 3 * 86_400_000)
      .toISOString();
    const to = new Date(new Date(anchor).getTime() + 3 * 86_400_000)
      .toISOString();
    const { data, error } = await supabase.from("admin_financial_transactions")
      .select(
        "id,amount,transaction_date,category,description,asaas_transaction_id",
      ).eq("type", "expense").eq("amount", parsedAmount).gte(
        "transaction_date",
        from,
      ).lte("transaction_date", to).order("transaction_date", {
        ascending: false,
      }).limit(20);
    if (error) {
      throw new Error(
        "Não foi possível conferir lançamentos parecidos. Tente novamente.",
      );
    }
    return (data ?? []).filter((item: any) => item.id !== transaction?.id).map((
      item: any,
    ) =>
      `${
        allCategories.find((c) => c.name === item.category)?.label ??
          item.category
      } — ${formatAmount(item.amount)} em ${
        format(new Date(item.transaction_date), "dd/MM/yyyy", { locale: ptBR })
      }`
    );
  };
  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canManage || save.isPending || checkingDuplicates) return;
    if (invalid) {
      setShowErrors(true);
      toast.error("Preencha o valor e selecione uma categoria.");
      return;
    }
    if (isEditing) {
      save.mutate();
      return;
    }
    if (save.isPending || checkingDuplicates) return;
    setCheckingDuplicates(true);
    try {
      const found = await findDuplicates();
      if (found.length) {
        setDuplicates(found);
        return;
      }
      save.mutate();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível conferir duplicidades",
      );
    } finally {
      setCheckingDuplicates(false);
    }
  };
  const selected = allowedCategories.find((item) => item.name === category) ??
    allCategories.find((item) => item.name === category);
  const footer = (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={save.isPending || checkingDuplicates}
        onClick={() => onOpenChange(false)}
        className="flex-1"
      >
        Cancelar
      </Button>
      <Button
        type="submit"
        form="admin-financial-movement-form"
        disabled={!canManage || invalid || save.isPending || checkingDuplicates}
        className="flex-1 bg-black text-white hover:bg-black/90"
      >
        {save.isPending
          ? "Salvando..."
          : checkingDuplicates
          ? "Conferindo..."
          : "Salvar"}
      </Button>
    </div>
  );
  return (
    <>
      <ResponsiveDialog
        open={Boolean(duplicates)}
        onOpenChange={(open) => !open && setDuplicates(null)}
        title="Possível lançamento duplicado"
        description="Se for o mesmo pagamento já lançado pelo extrato, o valor pode ser contado duas vezes."
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setDuplicates(null)}
            >
              Voltar
            </Button>
            <Button
              type="button"
              className="flex-1 bg-black text-white hover:bg-black/90"
              onClick={() => {
                setDuplicates(null);
                save.mutate();
              }}
            >
              Lançar mesmo assim
            </Button>
          </div>
        }
      >
        <ul className="space-y-2 text-sm">
          {duplicates?.map((item) => (
            <li
              key={item}
              className="rounded-lg border bg-white p-3 text-slate-950"
            >
              {item}
            </li>
          ))}
        </ul>
      </ResponsiveDialog>
      <ResponsiveDialog
        open={open}
        dismissible={!save.isPending && !checkingDuplicates}
        onOpenChange={(value) => {
          if (!save.isPending && !checkingDuplicates) onOpenChange(value);
        }}
        title={isEditing ? "Editar movimentação" : "Nova movimentação"}
        description="Vendas e renovações são registradas pelo fluxo comercial."
        footer={footer}
      >
        <form
          id="admin-financial-movement-form"
          onSubmit={submit}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <button
              disabled={!canManage || save.isPending || checkingDuplicates}
              type="button"
              onClick={() => {
                setType("income");
                setCategory("");
              }}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border-2 p-3",
                type === "income"
                  ? "border-emerald-600 bg-emerald-500 text-white"
                  : "bg-white text-slate-950",
              )}
            >
              <TrendingUp className="h-4 w-4" />Receita
            </button>
            <button
              disabled={!canManage || save.isPending || checkingDuplicates}
              type="button"
              onClick={() => {
                setType("expense");
                setCategory("");
              }}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border-2 p-3",
                type === "expense"
                  ? "border-red-600 bg-red-500 text-white"
                  : "bg-white text-slate-950",
              )}
            >
              <TrendingDown className="h-4 w-4" />Despesa
            </button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="movement-description">Descrição</Label>
            <FinancialSmartDescription id="movement-description" value={description} onChange={setDescription} multiline placeholder="Descrição da movimentação"
              enabled={open && !isEditing && canManage} disabled={!canManage || save.isPending || checkingDuplicates}
              scope="admin" context="movement" direction={type==='income'?'entrada':'saida'} values={{category}}
              onPatch={patch=>{if('category' in patch)setCategory(patch.category||'');}} onApplied={()=>document.getElementById('movement-date')?.focus()} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="movement-date">Data</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="movement-date"
                  disabled={!canManage || save.isPending}
                  type="button"
                  variant="outline"
                  className="w-full justify-start font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(date, "dd/MM/yyyy", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(next) => next && setDate(next)}
                  locale={ptBR}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label htmlFor="movement-amount">Valor (R$)</Label>
            <Input
              id="movement-amount"
              disabled={!canManage || save.isPending || checkingDuplicates}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0,00"
              className={cn(
                "text-lg font-medium",
                showErrors &&
                  (!Number.isFinite(parsedAmount) || parsedAmount <= 0) &&
                  "border-destructive",
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="movement-category">Categoria</Label>
            <Select
              value={category}
              onValueChange={setCategory}
              disabled={!canManage || save.isPending || checkingDuplicates}
            >
              <SelectTrigger
                id="movement-category"
                className={cn(showErrors && !category && "border-destructive")}
              >
                <SelectValue placeholder="Selecione uma categoria">{selected && <AdminCategoryPill name={selected.name} categories={[selected]} />}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {allowedCategories.map((item) => (
                  <SelectItem value={item.name} key={item.id}><AdminCategoryPill name={item.name} categories={[item]} /></SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </form>
      </ResponsiveDialog>
    </>
  );
}
