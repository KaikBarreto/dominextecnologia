import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ReviewRow = {
  id: string;
  description: string;
  occurredAt: string;
  amount: number;
  direction: "credit" | "debit";
  reason: string;
  actionLabel: string;
  secondaryActionLabel?: string;
};

export type FinancialReviewQueueProps = {
  rows: ReviewRow[];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  direction: "all" | "credit" | "debit";
  onDirectionChange: (direction: "all" | "credit" | "debit") => void;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  canManage: boolean;
  onReview: (row: ReviewRow) => void;
  onSecondaryReview?: (row: ReviewRow) => void;
  isFetching?: boolean;
};

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBrt = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(
    new Date(value),
  );
const pageSize = 50;

export function FinancialReviewQueue(props: FinancialReviewQueueProps) {
  const invalidPeriod = !!props.from && !!props.to && props.from > props.to;
  useEffect(() => {
    if (!invalidPeriod && !props.isLoading && !props.isFetching && !props.isError && props.page > 0 && props.page * pageSize >= props.total) {
      props.onPageChange(Math.max(0, Math.ceil(props.total / pageSize) - 1));
    }
  }, [invalidPeriod, props.isLoading, props.isFetching, props.isError, props.page, props.total, props.onPageChange]);
  const hasPrevious = props.page > 0;
  const hasNext = (props.page + 1) * pageSize < props.total;
  return (
    <section
      className="space-y-4"
      aria-label="Revisão financeira"
      aria-busy={props.isLoading || props.isFetching}
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-lg font-semibold">Revisão financeira</h2>
          <p className="text-sm text-muted-foreground">
            Vendas e renovações identificadas são conciliadas automaticamente.
            Revise aqui os recebimentos sem vínculo e as despesas.
          </p>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">
          {props.isLoading
            ? "Carregando pendências..."
            : props.isError || invalidPeriod
            ? ""
            : `${props.total} pendências neste filtro`}
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div
          className="inline-flex w-fit rounded-lg border p-1"
          role="group"
          aria-label="Tipo de movimento"
        >
          {(
            [
              ["all", "Todos"],
              ["credit", "Recebimentos"],
              ["debit", "Despesas"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              aria-pressed={props.direction === value}
              size="sm"
              variant={props.direction === value ? "default" : "ghost"}
              className={props.direction === value
                ? "bg-slate-950 text-white hover:bg-slate-800"
                : ""}
              onClick={() => props.onDirectionChange(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <div>
            <Label htmlFor="financial-review-from">De</Label>
            <Input
              id="financial-review-from"
              aria-label="Data inicial"
              type="date"
              max={props.to || undefined}
              value={props.from}
              onChange={(event) => props.onFromChange(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="financial-review-to">Até</Label>
            <Input
              id="financial-review-to"
              aria-label="Data final"
              type="date"
              min={props.from || undefined}
              value={props.to}
              onChange={(event) => props.onToChange(event.target.value)}
            />
          </div>
        </div>
      </div>
      {invalidPeriod
        ? (
          <p role="alert" className="py-6 text-sm">
            A data final deve ser igual ou posterior à data inicial.
          </p>
        )
        : props.isLoading
        ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from(
              { length: 5 },
              (_, index) => <Skeleton key={index} className="h-14 w-full" />,
            )}
          </div>
        )
        : props.isError
        ? (
          <div className="py-8 text-center">
            <p role="alert" className="text-sm">
              Não foi possível carregar as pendências financeiras.
            </p>
            <Button
              className="mt-3 bg-black text-white hover:bg-zinc-800"
              onClick={props.onRetry}
            >
              Tentar novamente
            </Button>
          </div>
        )
        : !props.rows.length
        ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma pendência neste filtro.
          </p>
        )
        : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Data</th>
                    <th className="py-2 pr-3">Descrição</th>
                    <th className="py-2 pr-3">Motivo</th>
                    <th className="py-2 pr-3 text-right">Valor</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {props.rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-3 pr-3 whitespace-nowrap">
                        {dateBrt(row.occurredAt)}
                      </td>
                      <td className="py-3 pr-3 font-medium">
                        {row.description}
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">
                        {row.reason}
                      </td>
                      <td className="py-3 pr-3 text-right font-medium tabular-nums">
                        {row.direction === "debit" ? "-" : ""}
                        {money(Math.abs(row.amount))}
                      </td>
                      <td className="py-3 text-right">
                        {props.canManage
                          ? (
                            <div className="inline-flex gap-2">
                              <Button
                                size="sm"
                                className="bg-black text-white hover:bg-zinc-800"
                                onClick={() => props.onReview(row)}
                              >
                                {row.actionLabel}
                              </Button>
                              {row.secondaryActionLabel &&
                                  props.onSecondaryReview
                                ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      props.onSecondaryReview?.(row)}
                                  >
                                    {row.secondaryActionLabel}
                                  </Button>
                                )
                                : null}
                            </div>
                          )
                          : (
                            <span className="text-xs text-muted-foreground">
                              Somente leitura
                            </span>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 md:hidden">
              {props.rows.map((row) => (
                <article key={row.id} className="border-b pb-3 last:border-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{row.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {dateBrt(row.occurredAt)} · {row.reason}
                      </p>
                    </div>
                    <p className="shrink-0 font-medium tabular-nums">
                      {row.direction === "debit" ? "-" : ""}
                      {money(Math.abs(row.amount))}
                    </p>
                  </div>
                  {props.canManage
                    ? (
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          className="bg-black text-white hover:bg-zinc-800"
                          onClick={() => props.onReview(row)}
                        >
                          {row.actionLabel}
                        </Button>
                        {row.secondaryActionLabel && props.onSecondaryReview
                          ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => props.onSecondaryReview?.(row)}
                            >
                              {row.secondaryActionLabel}
                            </Button>
                          )
                          : null}
                      </div>
                    )
                    : (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Somente leitura
                      </p>
                    )}
                </article>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!hasPrevious || props.isFetching}
                onClick={() => props.onPageChange(props.page - 1)}
              >
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                Página {props.page + 1}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={!hasNext || props.isFetching}
                onClick={() => props.onPageChange(props.page + 1)}
              >
                Próxima
              </Button>
            </div>
          </>
        )}
    </section>
  );
}
