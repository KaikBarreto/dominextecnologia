import {
  Eye,
  MoreHorizontal,
  PackageCheck,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { PDV_SALES_FLOW_STAGE_META } from "./pdvSalesFlowStage";
import type {
  PdvSalesFlowCardModel,
} from "@/hooks/usePdvSalesFlow";


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
  onCompletePickup?: () => void;
  pickupPending?: boolean;
}

export function PdvSalesFlowCard({
  card,
  onOpen,
  formatMoney,
  selected = false,
  compact = false,
  showStage = true,
  onCompletePickup,
  pickupPending = false,
}: Props) {
  const meta = PDV_SALES_FLOW_STAGE_META[card.stage];
  const TitleIcon = meta.Icon;
  const title = pdvSalesFlowCardTitle(card);
  const operationalCount =
    card.stage === "pickup" || card.stage === "partial"
      ? card.remainingItems
      : card.itemCount;
  const countLabel =
    card.stage === "pickup" || card.stage === "partial"
      ? `${operationalCount} ${operationalCount === 1 ? "material a retirar" : "materiais a retirar"}`
      : `${operationalCount} ${operationalCount === 1 ? "material" : "materiais"}`;
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
    <article data-flow-id={card.flowId} data-flow-stage={card.stage} className={cn('ordercard', selected && 'ring-1 ring-inset ring-primary')}>
      <div className="row between"><button type="button" onClick={() => onOpen(card)} aria-label={`Abrir ${title}`} className="min-w-0 rounded-md text-left outline-none focus-visible:shadow-[inset_0_0_0_2px_hsl(var(--primary))]"><strong>{title}</strong></button><DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="iconbtn !border-0 !bg-transparent" aria-label={`Ações de ${title}`}><MoreHorizontal /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Ações</DropdownMenuLabel><DropdownMenuItem onSelect={() => onOpen(card)}><Eye className="mr-2 h-4 w-4" />{actionLabel}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
      <h3>{card.customerName ?? 'Sem cliente'}</h3>
      <small>{countLabel} · {updatedAt}</small>
      <div className="row between" style={{ marginTop: 14 }}>{showStage && <span className={cn('rounded px-2 py-1 text-[10px] font-bold text-white', meta.badgeClassName)}>{meta.label}</span>}{card.canSeeAmount && card.total != null && formatMoney && <strong className="amount whitespace-nowrap">{formatMoney(card.total)}</strong>}</div>
      <button type="button" className="btn" onClick={() => onOpen(card)} aria-pressed={selected}><TitleIcon />{actionLabel}</button>
      {onCompletePickup && <button type="button" className="btn primary" disabled={pickupPending} onClick={onCompletePickup}>{pickupPending ? <Loader2 className="animate-spin" /> : <PackageCheck />}Marcar como retirado</button>}
    </article>
  );
}
