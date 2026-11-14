import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardCheck,
  Columns3,
  LayoutList,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ListDetailLayout,
  type ListDetailSortOption,
} from "@/components/ui/ListDetailLayout";
import { EmptyState } from "@/components/mobile/EmptyState";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useLocaleFormatters } from "@/lib/format/hooks";
import { usePdvPreorderCatalog } from "@/hooks/usePdvPreorderCatalog";
import {
  usePdvPreorder,
  usePdvPreorderActions,
  usePdvPreorderQueue,
  type PdvPreorderStatus,
} from "@/hooks/usePdvPreorders";
import {
  PdvPreorderDetail,
  type PdvPreorderCatalogItem,
} from "@/components/pdv/preorders/PdvPreorderDetail";
import { PdvPreorderStatusBadge } from "@/components/pdv/preorders/PdvPreorderStatusBadge";
import { PdvPreorderReceiptButton } from "@/components/pdv/preorders/PdvPreorderReceiptButton";
import { PdvSalesFlowBoard } from "@/components/pdv/flow/PdvSalesFlowBoard";
import {
  resolvePdvSalesFlowMode,
  usePdvSalesFlow,
  usePdvSalesFlowOrder,
  type PdvSalesFlowCardModel,
} from "@/hooks/usePdvSalesFlow";
import { usePdvCounterCapability } from "@/hooks/usePdvCounterFlow";
import { PdvDispatchDetail } from "@/components/pdv/dispatch/PdvDispatchDetail";
import {
  derivePdvReturnsAccess,
  usePdvReturnsFeature,
} from "@/hooks/usePdvReturns";
import {
  derivePdvAfterSaleAccess,
  usePdvAfterSaleFeature,
} from "@/hooks/usePdvAfterSale";
import { canLoadPdvPreorderWorkspace } from "@/components/pdv/flow/pdvFlowAccess";
import { cn } from "@/lib/utils";

type QueueFilter = "all" | PdvPreorderStatus;

const FILTERS: Array<{ value: QueueFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "edicao", label: "Em edição" },
  { value: "encaminhado", label: "No caixa" },
  { value: "convertido", label: "Concluídos" },
  { value: "cancelado", label: "Cancelados" },
];

const newestFirst: ListDetailSortOption = {
  value: "updated-desc",
  label: "Atualizados recentemente",
  shortLabel: "Recentes",
  compare: (a, b) => (b.searchText ?? "").localeCompare(a.searchText ?? ""),
};

export default function PdvPreorders() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { dateTime, money } = useLocaleFormatters();
  const {
    user,
    profile,
    roles,
    permissions,
    isAdminOrGestor,
    hasPermission,
    hasPermissionRecord,
    hasScreenAccess,
  } = useAuth();
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFlowOrderId, setSelectedFlowOrderId] = useState<string | null>(
    null,
  );
  const [draftId, setDraftId] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "list">("board");
  const canUsePreorderWorkspace = canLoadPdvPreorderWorkspace({
    adminOrManager: isAdminOrGestor(),
    hasPdvScreen: hasScreenAccess("screen:pdv"),
    hasPdvOrdersScreen: hasScreenAccess("screen:pdv_orders"),
  });

  const queue = usePdvPreorderQueue(
    filter === "all" ? null : filter,
    canUsePreorderWorkspace,
  );
  const flow = usePdvSalesFlow();
  const capability = usePdvCounterCapability();
  const detail = usePdvPreorder(selectedId);
  const flowOrder = usePdvSalesFlowOrder(selectedFlowOrderId);
  const actions = usePdvPreorderActions();
  const catalog = usePdvPreorderCatalog(canUsePreorderWorkspace);
  const customers = useMemo(
    () => catalog.data?.customers ?? [],
    [catalog.data?.customers],
  );
  const stocks = useMemo(
    () => catalog.data?.stocks ?? [],
    [catalog.data?.stocks],
  );
  const returnsFeature = usePdvReturnsFeature(profile?.company_id);
  const afterSaleFeature = usePdvAfterSaleFeature(profile?.company_id);
  const privilegedAfterSale = isAdminOrGestor() || roles.includes("super_admin");
  const returnsAccess = derivePdvReturnsAccess({
    featureEnabled: returnsFeature.data === true,
    privileged: privilegedAfterSale,
    hasPermissionRecord,
    permissions,
  });
  const afterSaleAccess = derivePdvAfterSaleAccess({
    featureEnabled: afterSaleFeature.data === true,
    privileged: privilegedAfterSale,
    hasPermissionRecord,
    permissions,
  });

  // Capacidade sensível é fail-closed também na apresentação: fallback legado
  // de `hasPermission` não oferece botão que o servidor recusará.
  const canCreate = hasScreenAccess("screen:pdv");
  const canUseSharedQueue = hasScreenAccess("screen:pdv_orders");
  const canValue =
    isAdminOrGestor() ||
    (canUseSharedQueue &&
      hasPermissionRecord &&
      hasPermission("fn:value_pdv_preorder"));
  const canConvert =
    isAdminOrGestor() ||
    (canUseSharedQueue &&
      hasPermissionRecord &&
      hasPermission("fn:convert_pdv_preorder"));

  const customerName = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer.name])),
    [customers],
  );

  const inventory = useMemo<PdvPreorderCatalogItem[]>(
    () =>
      (catalog.data?.materials ?? [])
        .filter((item) => !item.archived_at)
        .map((item) => ({
          id: item.id,
          name: item.name,
          sku: item.sku ?? null,
          unit: item.unit || "un",
          salePrice: item.sale_price ?? null,
          imageUrl: item.image_url,
          barcode: item.barcode,
          groupId: item.group?.id ?? null,
          groupName: item.group?.name ?? null,
          groupColor: item.group?.color ?? null,
          availableByStock: item.available_by_stock.map((level) => ({
            stockId: level.stock_id,
            availableQuantity: level.available_quantity,
          })),
        })),
    [catalog.data?.materials],
  );

  const listItems = useMemo(
    () =>
      (queue.data ?? []).map((preorder) => ({
        id: preorder.id,
        title: `Orçamento do balcão #${preorder.number}`,
        subtitle: [
          preorder.customer_id
            ? (customerName.get(preorder.customer_id) ?? "Cliente")
            : "Sem cliente",
          preorder.total == null ? "Valor pendente" : null,
        ]
          .filter(Boolean)
          .join(" · "),
        searchText: `${preorder.updated_at} ${customerName.get(preorder.customer_id ?? "") ?? ""} ${preorder.number}`,
        leading: (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-background font-semibold tabular-nums">
            {preorder.number}
          </div>
        ),
        trailing: (
          <div className="flex flex-col items-end gap-1">
            <PdvPreorderStatusBadge status={preorder.status} />
            {preorder.total != null && (
              <span className="whitespace-nowrap text-xs font-semibold tabular-nums">
                {money(preorder.total)}
              </span>
            )}
            <span onClick={(event) => event.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Ações do orçamento ${preorder.number}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Ações</DropdownMenuLabel>
                  <PdvPreorderReceiptButton
                    appearance="menu-item"
                    preorderId={preorder.id}
                    customerName={
                      preorder.customer_id
                        ? customerName.get(preorder.customer_id)
                        : null
                    }
                    inventory={inventory}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </div>
        ),
      })),
    [customerName, inventory, money, queue.data],
  );

  const activeDetail = detail.data ?? null;
  const activeRevision = activeDetail?.preorder.revision ?? 0;
  const activeId = activeDetail?.preorder.id ?? draftId;
  const detailOpen = Boolean(selectedId || selectedFlowOrderId || draftId);
  const flowCards = flow.data ?? [];
  const fulfillmentMode =
    capability.data?.fulfillmentMode ??
    resolvePdvSalesFlowMode(flowCards, "dispatch");

  function requestId(prefix: string) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  function startNew() {
    setSelectedId(null);
    setSelectedFlowOrderId(null);
    setDraftId(crypto.randomUUID());
  }

  function closeDetail() {
    setSelectedId(null);
    setSelectedFlowOrderId(null);
    setDraftId(null);
    void flow.refetch();
  }

  async function reloadDetail() {
    await Promise.all([detail.refetch(), queue.refetch(), flow.refetch()]);
  }

  function openFlowCard(card: PdvSalesFlowCardModel) {
    if (
      card.preorderId &&
      (card.stage === "draft" ||
        (card.stage === "cash" && !card.orderId))
    ) {
      setDraftId(null);
      setSelectedFlowOrderId(null);
      setSelectedId(card.preorderId);
      return;
    }
    if (card.stage === "cash") {
      navigate("/pdv?aba=pedidos");
      return;
    }
    if (card.stage === "completed" && card.fulfillmentMode === "cashier") {
      if (card.orderId) {
        setSelectedId(null);
        setDraftId(null);
        setSelectedFlowOrderId(card.orderId);
      }
      return;
    }
    if (card.orderId) {
      navigate(`/pdv/expedicao?pedido=${encodeURIComponent(card.orderId)}`);
    }
  }

  const content = (
    <PdvPreorderDetail
      detail={activeDetail}
      draftId={draftId ?? undefined}
      inventory={inventory}
      customers={customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
      }))}
      stocks={stocks.map((stock) => ({ id: stock.id, name: stock.name }))}
      terminals={(catalog.data?.terminals ?? []).map((terminal) => ({
        id: terminal.id, name: terminal.name, stockId: terminal.stock_id,
      }))}
      canValue={canValue}
      canConvert={canConvert}
      canCancel={Boolean(
        isAdminOrGestor() ||
        (activeDetail &&
          (activeDetail.preorder.created_by === user?.id ||
            activeDetail.preorder.assigned_to === user?.id)),
      )}
      onBack={closeDetail}
      onReload={() => void reloadDetail()}
      onSave={async ({ header, items }) => {
        if (!activeId) throw new Error("Orçamento do balcão não selecionado.");
        const saved = await actions.save.mutateAsync({
          preorderId: activeId,
          expectedRevision: activeRevision,
          header,
          items,
          requestId: requestId("save-preorder"),
        });
        const result = header.target_terminal_id
          ? await actions.assignTerminal.mutateAsync({
              preorderId: saved.preorder_id,
              expectedRevision: saved.revision ?? activeRevision,
              targetTerminalId: header.target_terminal_id,
              requestId: requestId("route-preorder"),
            })
          : saved;
        if (draftId) {
          setDraftId(null);
          setSelectedId(result.preorder_id);
        }
        toast({ title: "Orçamento do balcão salvo na conta" });
        await flow.refetch();
        return result;
      }}
      onValue={async ({ header, items }) => {
        if (!activeId) throw new Error("Orçamento do balcão não selecionado.");
        const result = await actions.value.mutateAsync({
          preorderId: activeId,
          expectedRevision: activeRevision,
          header,
          items,
          requestId: requestId("value-preorder"),
        });
        toast({ title: "Valorização salva na conta" });
        await flow.refetch();
        return result;
      }}
      onForward={async () => {
        if (!activeId) throw new Error("Orçamento do balcão não selecionado.");
        const result = await actions.forward.mutateAsync({
          preorderId: activeId,
          expectedRevision: activeRevision,
          requestId: requestId("forward-preorder"),
        });
        toast({ title: "Orçamento do balcão enviado ao caixa" });
        await flow.refetch();
        return result;
      }}
      onCancel={async () => {
        if (!activeId) throw new Error("Orçamento do balcão não selecionado.");
        const result = await actions.cancel.mutateAsync({
          preorderId: activeId,
          expectedRevision: activeRevision,
          requestId: requestId("cancel-preorder"),
        });
        toast({ title: "Orçamento do balcão cancelado" });
        await flow.refetch();
        return result;
      }}
      onConvert={async () => {
        if (!activeId) throw new Error("Orçamento do balcão não selecionado.");
        const result = await actions.convert.mutateAsync({
          preorderId: activeId,
          expectedRevision: activeRevision,
          requestId: requestId("convert-preorder"),
        });
        toast({
          title: result.already_converted
            ? "Pedido já estava criado"
            : "Pedido criado com sucesso",
          description: result.order_id
            ? "O atendimento saiu da fila e já está disponível em Pedidos."
            : undefined,
        });
        await flow.refetch();
        return result;
      }}
    />
  );

  const completedOrderContent = flowOrder.isLoading ? (
    <div className="space-y-4">
      <Skeleton className="h-16" />
      <Skeleton className="h-72" />
    </div>
  ) : flowOrder.isError || !flowOrder.data ? (
    <EmptyState
      icon={<RefreshCw className="h-12 w-12 text-destructive" />}
      title="Não foi possível abrir o pedido concluído"
      description="Atualize o fluxo e tente novamente. Nenhum dado foi alterado."
      action={{ label: "Tentar novamente", onClick: () => void flowOrder.refetch() }}
    />
  ) : (
    <PdvDispatchDetail
      detail={flowOrder.data}
      canDeliver={false}
      returnsAccess={returnsAccess}
      afterSaleAccess={afterSaleAccess}
      onBack={closeDetail}
      onReload={() => void Promise.all([flowOrder.refetch(), flow.refetch()])}
    />
  );

  return (
    <div className={cn("space-y-4", isMobile && "pb-20")} data-pdv-ui>
      {!detailOpen && (
        <PageHeader
          title="Orçamentos"
          subtitle={
            fulfillmentMode === "dispatch"
              ? "Acompanhe o atendimento do orçamento até a retirada."
              : "Acompanhe o atendimento do orçamento até a conclusão no caixa."
          }
          icon={ClipboardCheck}
          actions={
            <div className="flex flex-wrap gap-2">
              {canUsePreorderWorkspace ? (
                <Button
                  type="button"
                  size="sm"
                  variant={view === "list" ? "default" : "outline"}
                  onClick={() => setView("list")}
                >
                  <LayoutList className="h-4 w-4" /> Lista
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant={view === "board" ? "default" : "outline"}
                onClick={() => setView("board")}
              >
                <Columns3 className="h-4 w-4" /> Kanban
              </Button>
              {canCreate ? (
                <Button type="button" onClick={startNew}>
                  <Plus className="mr-2 h-4 w-4" /> Criar orçamento
                </Button>
              ) : null}
            </div>
          }
        />
      )}

      {!detailOpen && view === "list" && (
        <nav
          className="flex gap-5 overflow-x-auto border-b border-border"
          aria-label="Etapas dos orçamentos do balcão"
        >
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setFilter(item.value);
                closeDetail();
              }}
              className={cn(
                "shrink-0 border-b-2 px-0.5 pb-2 text-sm font-medium transition-colors",
                filter === item.value
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              aria-current={filter === item.value ? "page" : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}

      {detailOpen ? (
        selectedFlowOrderId ? (
          completedOrderContent
        ) : selectedId && detail.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-72" />
            <Skeleton className="h-[36rem] w-full" />
          </div>
        ) : selectedId && detail.isError ? (
          <EmptyState
            icon={<Users className="h-12 w-12 text-destructive" />}
            title="Não foi possível abrir o orçamento do balcão"
            description="Ele pode ter sido atualizado ou seu acesso pode ter mudado."
            action={{ label: "Atualizar", onClick: () => void reloadDetail() }}
          />
        ) : (
          content
        )
      ) :
        (view === "board"
          ? flow.isLoading || capability.isLoading
          : queue.isLoading || catalog.isLoading) ? (
        <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
          <Skeleton className="h-[32rem] w-full" />
        </div>
      ) : (view === "board"
          ? flow.isError || capability.isError
          : queue.isError || catalog.isError) ? (
        <EmptyState
          icon={<RefreshCw className="h-12 w-12 text-destructive" />}
          title="Não foi possível carregar o fluxo do balcão"
          description="Verifique sua conexão. Nenhum dado foi alterado."
          action={{
            label: "Tentar novamente",
            onClick: () =>
              void Promise.all([
                queue.refetch(),
                flow.refetch(),
                catalog.refetch(),
              ]),
          }}
        />
      ) : view === "board" ? (
        <PdvSalesFlowBoard
          cards={flowCards}
          fulfillmentMode={fulfillmentMode}
          onOpen={openFlowCard}
          formatMoney={money}
        />
      ) : (
        <ListDetailLayout
          items={listItems}
          selectedId={selectedId ?? undefined}
          listTitle="Orçamentos do balcão"
          listDescription="Atendimentos salvos na conta da empresa"
          listHeaderAction={
            canCreate ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={startNew}
                aria-label="Criar orçamento do balcão"
                title="Criar orçamento do balcão"
              >
                <Plus className="h-4 w-4" />
              </Button>
            ) : undefined
          }
          sortOptions={[newestFirst]}
          storageKey="pdv-preorders-list"
          searchPlaceholder="Buscar por número ou cliente"
          emptyLabel="Nenhum orçamento nesta etapa"
          mobileDetailOpen={false}
          onSelect={(id) => {
            setDraftId(null);
            setSelectedId(id);
          }}
        >
          <EmptyState
            icon={
              <ClipboardCheck className="h-12 w-12 text-muted-foreground" />
            }
            title="Escolha um orçamento"
            description="Abra um item da lista ou crie um novo orçamento do balcão."
          />
        </ListDetailLayout>
      )}

      <p className="sr-only">
        Última atualização da fila:{" "}
        {queue.dataUpdatedAt
          ? dateTime(new Date(queue.dataUpdatedAt))
          : "ainda não carregada"}
        .
      </p>
    </div>
  );
}
