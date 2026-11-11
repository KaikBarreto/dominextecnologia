import { useEffect, useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { PdvSalesFlowCard } from "./PdvSalesFlowCard";
import { cn } from "@/lib/utils";
import type {
  PdvFulfillmentMode,
  PdvSalesFlowCardModel,
  PdvSalesFlowStage,
} from "@/hooks/usePdvSalesFlow";

interface FlowColumn {
  stage: PdvSalesFlowStage;
  label: string;
  headerClassName: string;
}

const DISPATCH_COLUMNS: FlowColumn[] = [
  { stage: "draft", label: "Orçamento", headerClassName: "bg-slate-700 text-white" },
  { stage: "cash", label: "No caixa", headerClassName: "bg-violet-700 text-white" },
  { stage: "pickup", label: "Aguardando retirada", headerClassName: "bg-blue-600 text-white" },
  { stage: "partial", label: "Retirada parcial", headerClassName: "bg-amber-600 text-white" },
  { stage: "completed", label: "Entregue", headerClassName: "bg-emerald-600 text-white" },
];

const CASHIER_COLUMNS: FlowColumn[] = [
  { stage: "draft", label: "Orçamento", headerClassName: "bg-slate-700 text-white" },
  { stage: "cash", label: "No caixa", headerClassName: "bg-violet-700 text-white" },
  { stage: "completed", label: "Concluído", headerClassName: "bg-emerald-600 text-white" },
];

function pdvSalesFlowColumns(mode: PdvFulfillmentMode): FlowColumn[] {
  return mode === "cashier" ? CASHIER_COLUMNS : DISPATCH_COLUMNS;
}

interface Props {
  cards: PdvSalesFlowCardModel[];
  fulfillmentMode: PdvFulfillmentMode;
  onOpen: (card: PdvSalesFlowCardModel) => void;
  formatMoney: (value: number) => string;
  selectedFlowId?: string | null;
}

export function PdvSalesFlowBoard({
  cards,
  fulfillmentMode,
  onOpen,
  formatMoney,
  selectedFlowId,
}: Props) {
  const columns = useMemo(
    () => pdvSalesFlowColumns(fulfillmentMode),
    [fulfillmentMode],
  );
  const [mobileStage, setMobileStage] = useState<PdvSalesFlowStage>(
    columns[0].stage,
  );

  useEffect(() => {
    if (!columns.some((column) => column.stage === mobileStage)) {
      setMobileStage(columns[0].stage);
    }
  }, [columns, mobileStage]);

  const cardsByStage = useMemo(
    () =>
      new Map(
        columns.map((column) => [
          column.stage,
          cards.filter((card) => card.stage === column.stage),
        ]),
      ),
    [cards, columns],
  );
  const activeColumn =
    columns.find((column) => column.stage === mobileStage) ?? columns[0];
  const activeCards = cardsByStage.get(activeColumn.stage) ?? [];

  return (
    <section aria-label="Fluxo do balcão" className="min-w-0">
      <div className="hidden overflow-x-auto pb-2 md:block">
        <div
          className={cn(
            "grid min-w-full grid-flow-col gap-3",
            fulfillmentMode === "dispatch"
              ? "auto-cols-[minmax(17rem,1fr)]"
              : "auto-cols-[minmax(19rem,1fr)]",
          )}
        >
          {columns.map((column) => (
            <FlowColumnSection
              key={column.stage}
              column={column}
              cards={cardsByStage.get(column.stage) ?? []}
              selectedFlowId={selectedFlowId}
              onOpen={onOpen}
              formatMoney={formatMoney}
            />
          ))}
        </div>
      </div>

      <div className="md:hidden">
        <nav
          aria-label="Etapas do fluxo"
          className="flex gap-5 overflow-x-auto border-b border-border"
        >
          {columns.map((column) => {
            const active = column.stage === activeColumn.stage;
            return (
              <button
                key={column.stage}
                type="button"
                onClick={() => setMobileStage(column.stage)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 border-b-2 pb-2 text-sm font-semibold",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground",
                )}
              >
                {column.label} ({cardsByStage.get(column.stage)?.length ?? 0})
              </button>
            );
          })}
        </nav>

        <div className="mt-3 space-y-2">
          {activeCards.length ? (
            activeCards.map((card) => (
              <PdvSalesFlowCard
                key={card.flowId}
                card={card}
                selected={card.flowId === selectedFlowId}
                onOpen={onOpen}
                formatMoney={formatMoney}
                showStage={false}
              />
            ))
          ) : (
            <FlowEmptyState label={activeColumn.label} compact />
          )}
        </div>
      </div>
    </section>
  );
}

function FlowColumnSection({
  column,
  cards,
  selectedFlowId,
  onOpen,
  formatMoney,
}: {
  column: FlowColumn;
  cards: PdvSalesFlowCardModel[];
  selectedFlowId?: string | null;
  onOpen: (card: PdvSalesFlowCardModel) => void;
  formatMoney: (value: number) => string;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl bg-muted/30">
      <header
        className={cn(
          "flex min-h-12 items-center justify-between gap-3 px-4 py-3",
          column.headerClassName,
        )}
      >
        <h2 className="font-bold">{column.label}</h2>
        <span className="rounded-full border border-white/50 px-2 py-0.5 text-xs font-bold">
          {cards.length}
        </span>
      </header>
      <div className="space-y-2 p-2.5">
        {cards.length ? (
          cards.map((card) => (
            <PdvSalesFlowCard
              key={card.flowId}
              card={card}
              selected={card.flowId === selectedFlowId}
              onOpen={onOpen}
              formatMoney={formatMoney}
              showStage={false}
            />
          ))
        ) : (
          <FlowEmptyState label={column.label} />
        )}
      </div>
    </section>
  );
}

function FlowEmptyState({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-3 text-center text-muted-foreground",
        compact ? "py-12" : "min-h-28 py-6",
      )}
    >
      <Inbox className="mb-2 h-5 w-5" />
      <p className="text-sm">Nenhum atendimento em {label.toLocaleLowerCase("pt-BR")}.</p>
    </div>
  );
}
