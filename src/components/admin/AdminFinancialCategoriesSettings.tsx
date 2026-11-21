import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { assertRowsAffected, NoRowsAffectedError } from "@/lib/supabaseMutation";
import { useAdminFinancialCategories } from "@/hooks/useAdminFinancialCategories";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
const buckets = {
  revenue: "Receita operacional",
  revenue_reduction: "Redutor de receita",
  tax: "Impostos e deduções",
  cpv: "Custos (CPV)",
  opex: "Despesas operacionais",
  non_operating: "Não operacional",
};
export function AdminFinancialCategoriesSettings(
  { canManage }: { canManage: boolean },
) {
  const query = useAdminFinancialCategories();
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const save = useMutation({
    mutationFn: async () => {
      if (!canManage || !form?.label.trim()) {
        throw new Error("Informe o nome da categoria.");
      }
      const payload = {
        label: form.label.trim(),
        color: form.color,
        icon: form.icon || "tag",
        dre_bucket: form.dre_bucket,
        affects_result: form.affects_result,
      };
      let request;
      if (form.id) {
        // RLS barrando não dá erro, só altera zero linhas: conferir.
        assertRowsAffected(
          await (supabase as any).from("admin_financial_categories").update(
            payload,
            { count: "exact" },
          ).eq("id", form.id),
          "update",
        );
        return;
      } else {request = (supabase as any).from("admin_financial_categories")
          .insert({
            ...payload,
            type: form.type,
            name: form.label.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
              .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(
                /^_|_$/g,
                "",
              ) + "_" + crypto.randomUUID().slice(0, 6),
          });}
      const { error } = await request;
      if (error) throw error;
    },
    onSuccess: () => {
      setForm(null);
      void qc.invalidateQueries({ queryKey: ["admin-financial-categories"] });
      toast.success("Categoria salva.");
    },
    onError: (e) =>
      toast.error(
        e instanceof NoRowsAffectedError
          ? e.message
          : "Não foi possível salvar a categoria. Confira os dados e tente novamente.",
      ),
  });
  const remove = useMutation({
    mutationFn: async () => {
      if (!canManage || !deleting || deleting.is_system) {
        throw new Error("Categoria protegida.");
      }
      const used = await (supabase as any).from("admin_financial_transactions")
        .select("id", { count: "exact", head: true }).eq(
          "category",
          deleting.name,
        );
      if (used.error) throw used.error;
      if (used.count) {
        throw new Error(
          "Categoria usada em lançamentos. Preserve o histórico e edite apenas o nome ou a apresentação.",
        );
      }
      // RLS barrando (ou categoria que virou de sistema) não dá erro, só apaga
      // zero linhas: conferir.
      assertRowsAffected(
        await (supabase as any).from(
          "admin_financial_categories",
        ).delete({ count: "exact" }).eq("id", deleting.id).eq("is_system", false),
        "delete",
      );
    },
    onSuccess: () => {
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ["admin-financial-categories"] });
      toast.success("Categoria excluída.");
    },
    onError: (e) =>
      toast.error(
        e.message.includes("Categoria usada") || e instanceof NoRowsAffectedError
          ? e.message
          : "Não foi possível excluir. A categoria pode estar vinculada a uma conta ou lançamento.",
      ),
  });
  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-semibold">Categorias financeiras</h2>
        <p className="text-sm text-muted-foreground">
          Organize os lançamentos e sua posição no DRE. As categorias existentes
          mantêm o histórico.
        </p>
      </header>
      {query.isLoading
        ? <p role="status">Carregando categorias…</p>
        : query.isError
        ? (
          <div role="alert">
            Não foi possível carregar as categorias.<Button
              variant="outline"
              onClick={() => query.refetch()}
            >
              Tentar novamente
            </Button>
          </div>
        )
        : (
          <div className="grid gap-4 xl:grid-cols-2">
            {(["income", "expense"] as const).map((type) => (
              <section key={type} className="rounded-xl border bg-card p-4">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h3 className="font-semibold">
                    {type === "income" ? "Receitas" : "Despesas"}
                  </h3>
                  <Button
                    size="sm"
                    disabled={!canManage}
                    className="bg-black text-white hover:bg-zinc-800"
                    onClick={() =>
                      setForm({
                        type,
                        label: "",
                        color: type === "income" ? "#047857" : "#dc2626",
                        icon: "tag",
                        dre_bucket: type === "income" ? "revenue" : "opex",
                        affects_result: true,
                      })}
                  >
                    <Plus className="mr-1 h-4 w-4" />Nova categoria
                  </Button>
                </div>
                <ul className="divide-y">
                  {(query.data ?? []).filter((c) =>
                    c.type === type
                  ).map((
                    c: any,
                  ) => (
                    <li key={c.id} className="flex items-center gap-3 py-3">
                      <span
                        className="rounded-lg p-2 text-white"
                        style={{ background: c.color || "#52525b" }}
                      >
                        <Tag className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium">
                          {c.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {c.affects_result === false
                            ? "Somente caixa"
                            : buckets[c.dre_bucket as keyof typeof buckets] ||
                              "Classificação do DRE"}
                          {c.is_system ? " · Sistema" : ""}
                        </p>
                      </div>
                      <Button
                        aria-label={`Editar ${c.label}`}
                        variant="ghost"
                        size="icon"
                        disabled={!canManage}
                        onClick={() =>
                          setForm({
                            ...c,
                            dre_bucket: c.dre_bucket ||
                              (type === "income" ? "revenue" : "opex"),
                            affects_result: c.affects_result !== false,
                          })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {!c.is_system && (
                        <Button
                          aria-label={`Excluir ${c.label}`}
                          variant="ghost"
                          size="icon"
                          disabled={!canManage}
                          onClick={() => setDeleting(c)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      {form && (
        <ResponsiveDialog
          open
          title={form.id ? "Editar categoria" : "Nova categoria"}
          onOpenChange={(open) => !open && !save.isPending && setForm(null)}
          dismissible={!save.isPending}
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={save.isPending}
                onClick={() => setForm(null)}
              >
                Cancelar
              </Button>
              <Button
                disabled={!canManage || save.isPending || !form.label.trim()}
                className="bg-black text-white hover:bg-zinc-800"
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Salvando…" : "Salvar categoria"}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <Label htmlFor="admin-category-name">Nome *</Label>
              <Input
                id="admin-category-name"
                value={form.label}
                maxLength={100}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="admin-category-color">Cor</Label>
              <Input
                id="admin-category-color"
                type="color"
                className="h-11 w-24"
                value={form.color || "#52525b"}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.affects_result}
                onChange={(e) =>
                  setForm({ ...form, affects_result: e.target.checked })}
              />Participa do resultado (DRE)
            </label>
            {form.affects_result && (
              <div>
                <Label htmlFor="admin-category-dre">Seção no DRE</Label>
                <Select value={form.dre_bucket} onValueChange={value => setForm({ ...form, dre_bucket: value })}><SelectTrigger id="admin-category-dre" className="h-10 w-full rounded-lg border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]">
                  {Object.entries(buckets).filter(([key]) =>
                    form.type === "income"
                      ? key === "revenue"
                      : key !== "revenue"
                  ).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent></Select>
                <p className="mt-2 text-xs text-muted-foreground">
                  Distribuição de lucros deve permanecer em Não operacional.
                </p>
              </div>
            )}
          </div>
        </ResponsiveDialog>
      )}
      {deleting && (
        <ResponsiveDialog
          open
          title="Excluir categoria?"
          description={`Excluir ${deleting.label}. Categorias usadas no financeiro não podem ser removidas.`}
          dismissible={!remove.isPending}
          onOpenChange={(open) =>
            !open && !remove.isPending && setDeleting(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={remove.isPending}
                onClick={() => setDeleting(null)}
              >
                Cancelar
              </Button>
              <Button
                className="bg-red-600 text-white hover:bg-red-700"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                Excluir categoria
              </Button>
            </div>
          }
        >
          <p className="text-sm">
            Esta ação remove apenas uma categoria sem lançamentos vinculados.
          </p>
        </ResponsiveDialog>
      )}
    </div>
  );
}
