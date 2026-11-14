import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Eye,
  MoreHorizontal,
  Package,
  PackageCheck,
  PackageOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type {
  PdvSalesFlowCardModel,
  PdvSalesFlowStage,
} from "@/hooks/usePdvSalesFlow";

const STAGE_META: Record<
  PdvSalesFlowStage,
  {
    label: string;
    badgeClassName: string;
    accentClassName: string;
    Icon: typeof ClipboardList;
  }
> = {
  draft: { label: "Orçamento", badgeClassName: "bg-slate-700", accentClassName: "border-l-slate-700", Icon: ClipboardList },
  cash: { label: "No caixa", badgeClassName: "bg-violet-700", accentClassName: "border-l-violet-700", Icon: Banknote },
  pickup: { label: "Aguardando retirada", badgeClassName: "bg-blue-600", accentClassName: "border-l-blue-600", Icon: PackageOpen },
  partial: { label: "Retirada parcial", badgeClassName: "bg-amber-600", accentClassName: "border-l-amber-600", Icon: PackageCheck },
  completed: { label: "Concluído", badgeClassName: "bg-emerald-600", accentClassName: "border-l-emerald-600", Icon: CheckCircle2 },
};

function pdvSalesFlowCardTitle(card: PdvSalesFlowCardModel): string {
  if (card.preorderNumber != null && card.orderNumber != null) {
    return `Orçamento #${card.preorderNumber} → Pedido #${card.orderNumber}`;
  }
  if (card.orderNumber != null) return `Pedido #${card.orderNumber}`;
  if (card.preorderNumber != null) return `Orçamento #${card.preorderNumber}`;
  return "Atendimento do balcão";
}

interface Props {
  card: PdvSalesFlowCardModel;
  onOpen: (card: PdvSalesFlowCardModel) => void;
  formatMoney?: (value: number) => string;
  selected?: boolean;
  compact?: boolean;
  showStage?: boolean;
}

export function PdvSalesFlowCard({
  card,
  onOpen,
  formatMoney,
  selected = false,
  compact = false,
  showStage = true,
}: Props) {
  const meta = STAGE_META[card.stage];
  const TitleIcon = meta.Icon;
  const title = pdvSalesFlowCardTitle(card);
  const operationalCount =
    card.stage === "pickup" || card.stage === "partial"
      ? card.remainingItems
      : card.itemCount;
  const countLabel =
    card.stage === "pickup" || card.stage === "partial"
      ? `${operationalCount} item(ns) restante(s)`
      : `${operationalCount} item(ns)`;
  const actionLabel = card.stage === "draft"
    ? "Abrir orçamento"
    : card.stage === "cash"
      ? "Abrir no caixa"
      : card.stage === "pickup" || card.stage === "partial"
        ? "Abrir retirada"
        : "Abrir atendimento";
  const updatedAt = new Date(card.updatedAt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article
      data-flow-id={card.flowId}
      data-flow-stage={card.stage}
      className={cn(
        "w-full rounded-lg border border-l-4 bg-background shadow-sm transition-shadow hover:shadow-md",
        meta.accentClassName,
        selected && "shadow-md",
      )}
    >
      <div className={cn("space-y-2.5 p-3", compact && "p-2.5")}>
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onOpen(card)}
            aria-label={`Abrir ${title}`}
            aria-pressed={selected}
            className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:shadow-[inset_0_0_0_2px_hsl(var(--primary))]"
          >
            <strong className="flex items-start gap-2 text-lg leading-none">
              <TitleIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="break-words">{title}</span>
            </strong>
          </button>
          <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-1">
            {showStage && (
              <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold text-white", meta.badgeClassName)}>
                {meta.label}
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2" aria-label={`Ações de ${title}`}>
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="text-xs">Ações</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Ações</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => onOpen(card)}>
                  <Eye className="mr-2 h-4 w-4" />{actionLabel}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <p className={cn("truncate text-base font-semibold", card.customerName ? "text-foreground" : "italic text-muted-foreground")}>
          {card.customerName ?? "Sem cliente"}
        </p>

        {card.canSeeAmount && card.total != null && formatMoney ? (
          <p className="whitespace-nowrap text-xl font-bold leading-none text-primary tabular-nums">
            {formatMoney(card.total)}
          </p>
        ) : null}

        <div className="space-y-1 text-sm text-foreground/70">
          <div className="flex min-w-0 items-center gap-1.5">
            <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{card.stockName ?? "Estoque ainda não escolhido"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <PackageCheck className="h-3.5 w-3.5 text-muted-foreground" />{countLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />{updatedAt}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
