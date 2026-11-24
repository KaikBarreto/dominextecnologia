import '@/components/pdv/PdvWorkspace.css';
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ClipboardCheck,
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
import { PdvPageSkeleton } from "@/components/pdv/loading/PdvPageSkeleton";
import {
  ListDetailLayout,
  type ListDetailSortOption,
} from "@/components/ui/ListDetailLayout";
import { EmptyState } from "@/components/mobile/EmptyState";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useLocaleFormatters } from "@/lib/format/hooks";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { usePdvPreorderCatalog } from "@/hooks/usePdvPreorderCatalog";
import {
  usePdvPreorder,
  usePdvPreorderActions,
  usePdvPreorderQueue,
  type PdvPreorderStatus,
  type PdvPreorderDetail as PreorderDetail,
} from "@/hooks/usePdvPreorders";
import {
  PdvPreorderDetail,
  type PdvPreorderCatalogItem,
  type PdvPreorderEditorSnapshot,
  projectPdvPreorderEditorSnapshot,
} from "@/components/pdv/preorders/PdvPreorderDetail";
import { PdvPreorderStatusBadge } from "@/components/pdv/preorders/PdvPreorderStatusBadge";
import { usePdvStageReceiptAuto } from "@/hooks/usePdvStageReceiptAuto";
import { PdvPreorderReceiptButton, usePdvPreorderReceiptOpener } from "@/components/pdv/preorders/PdvPreorderReceiptButton";
import { preorderWorkspaceAction } from "@/components/pdv/preorders/preorderWorkspaceAction";
import { pdvFlowCardDestination } from "@/components/pdv/flow/pdvFlowNavigation";
import { PdvWorkspaceViewToggle } from "@/components/pdv/flow/PdvWorkspaceViewToggle";
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
import { FilterButton } from "@/components/ui/FilterButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { usePdvPreorderTabs } from "@/hooks/usePdvPreorderTabs";
import { usePdvAuthorizedQueryScope } from "@/hooks/pdvReportCache";
import { PdvOrderSwitcher } from "@/components/pdv/PdvOrderSwitcher";
import { NoticeBanner } from "@/components/ui/NoticeBanner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPreorderId = searchParams.get("orcamento");
  const requestedWorkspaceTabId = searchParams.get("atendimento");
  const { toast } = useToast();
  const autoReceipt = usePdvStageReceiptAuto();
  const receiptOpener = usePdvPreorderReceiptOpener();
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
  const [filter, setFilter] = useState<QueueFilter>(() => searchParams.get("situacao") === "encaminhado" ? "encaminhado" : "all");
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("orcamento"));
  const [selectedFlowOrderId, setSelectedFlowOrderId] = useState<string | null>(
    null,
  );
  const [draftId, setDraftId] = useState<string | null>(null);
  const [view, setView] = useState<"flow" | "list">("list");
  const [editingDetail, setEditingDetail] = useState(false);
  useEffect(() => { if (requestedPreorderId) { setSelectedId(requestedPreorderId); setDraftId(null); setEditingDetail(false); setView("list"); } }, [requestedPreorderId]);
  const canUsePreorderWorkspace = canLoadPdvPreorderWorkspace({
    adminOrManager: isAdminOrGestor(),
    hasPdvScreen: hasScreenAccess("screen:pdv"),
    hasPdvOrdersScreen: hasScreenAccess("screen:pdv_orders"),
  });

  const authorizedScope = usePdvAuthorizedQueryScope();
  const explicitCashContext = searchParams.get("caixa") ?? searchParams.get("cash_session_id");
  const tabsOwner = useMemo(() => authorizedScope.ready && profile?.company_id && user?.id
    ? { companyId: profile.company_id, userId: user.id, cashSessionId: explicitCashContext }
    : null, [authorizedScope.ready, profile?.company_id, user?.id, explicitCashContext]);
  const tabs = usePdvPreorderTabs<PdvPreorderEditorSnapshot>(tabsOwner, canUsePreorderWorkspace);
  const operationScopeSignature = JSON.stringify([authorizedScope.key, authorizedScope.ready, tabs.storageKey]);
  const operationScope = useRef({ signature: operationScopeSignature });
  if (operationScope.current.signature !== operationScopeSignature) operationScope.current = { signature: operationScopeSignature };
  const operationToken = operationScope.current;
  const isCurrentOperation = () => authorizedScope.ready && operationScope.current === operationToken;

  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null);
  const closeTabConfirmRef = useRef<HTMLButtonElement>(null);
  const previousTabScope = useRef(tabs.storageKey);
  useEffect(() => {
    if (previousTabScope.current === tabs.storageKey) return;
    previousTabScope.current = tabs.storageKey;
    setSelectedId(null); setDraftId(null); setEditingDetail(false); setSelectedFlowOrderId(null); setPendingCloseTabId(null);
  }, [tabs.storageKey]);

  const queue = usePdvPreorderQueue(
    filter === "all" ? null : filter,
    canUsePreorderWorkspace,
  );
  const capability = usePdvCounterCapability();
  const canViewFlow = canUsePreorderWorkspace && capability.data?.counterEnabled === true;
  const activeView = view === 'flow' && canViewFlow ? 'flow' : 'list';
  const flow = usePdvSalesFlow(activeView === 'flow');
  const detail = usePdvPreorder(selectedId);
  const flowOrder = usePdvSalesFlowOrder(selectedFlowOrderId);
  const actions = usePdvPreorderActions();
  const catalog = usePdvPreorderCatalog(canUsePreorderWorkspace);
  const companySettings = useCompanySettings();
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

          </div>
        ),
        actions: (<>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 border-0 bg-transparent shadow-none hover:bg-transparent"
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
</>),
      })),
    [customerName, inventory, money, queue.data],
  );

  const activeDetail = detail.data?.preorder.id === selectedId ? detail.data : null;
  const activeTab = editingDetail ? tabs.active : null;
  const editorSnapshot = projectPdvPreorderEditorSnapshot(activeTab?.editorState);
  const activeRevision = editorSnapshot?.dirty
    ? editorSnapshot.sourceRevision ?? activeTab?.revision ?? activeDetail?.preorder.revision ?? 0
    : Math.max(activeDetail?.preorder.revision ?? 0, activeTab?.revision ?? 0, editorSnapshot?.sourceRevision ?? 0);
  const configuredStockId = companySettings.settings?.company_id === profile?.company_id ? companySettings.settings?.pdv_default_stock_id ?? null : null;
  const preferredStockId = companySettings.isLoading || companySettings.isError || (companySettings.settings && companySettings.settings.company_id !== profile?.company_id) ? null
    : configuredStockId ? stocks.some(stock => stock.id === configuredStockId) ? configuredStockId : null
    : stocks.length === 1 ? stocks[0].id : null;
  const waitingForInitialStock = Boolean(draftId && !editorSnapshot && companySettings.isLoading);
  const activeId = activeTab?.preorderId ?? activeDetail?.preorder.id ?? activeTab?.draftId ?? draftId;
  const workspaceOpen = Boolean(draftId || editingDetail || selectedFlowOrderId);
  const flowCards = flow.data ?? [];
  const fulfillmentMode =
    capability.data?.fulfillmentMode ??
    resolvePdvSalesFlowMode(flowCards, "dispatch");

  function requestId(prefix: string) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  function setWorkspaceAddress(id: string | null) {
    const params = new URLSearchParams(searchParams);
    if (id) { params.set('atendimento', id); params.delete('orcamento'); }
    else params.delete('atendimento');
    setSearchParams(params, { replace: true });
  }

  function selectWorkspaceTab(id: string) {
    const tab = tabs.tabs.find(item => item.id === id);
    if (!tab) return;
    tabs.select(id); setWorkspaceAddress(id); setEditingDetail(true); setSelectedFlowOrderId(null);
    setSelectedId(tab.preorderId); setDraftId(tab.preorderId ? null : tab.draftId);
  }

  function startNew() {
    const tab = tabs.create();
    if (!tab) return;
    setWorkspaceAddress(tab.id); setEditingDetail(true); setSelectedId(null); setSelectedFlowOrderId(null); setDraftId(tab.draftId);
  }

  function openEditor(id: string) {
    const existing = tabs.tabs.find(tab => tab.preorderId === id && !tab.recovered);
    if (existing) { selectWorkspaceTab(existing.id); return; }
    const row = queue.data?.find(item => item.id === id);
    const document = activeDetail?.preorder.id === id ? activeDetail.preorder : row;
    const tab = tabs.create({ preorderId: id, draftId: id, revision: document?.revision ?? null,
      number: document?.number ?? null, customerId: document?.customer_id ?? null, total: document?.total ?? 0, hasContent: true });
    if (!tab) return;
    setWorkspaceAddress(tab.id); setEditingDetail(true); setSelectedFlowOrderId(null); setSelectedId(id); setDraftId(null);
  }

  function closeWorkspaceTab(id: string) {
    const index = tabs.tabs.findIndex(tab => tab.id === id);
    const remaining = tabs.tabs.filter(tab => tab.id !== id);
    const next = remaining[Math.min(index, remaining.length - 1)];
    tabs.close(id);
    if (tabs.activeId !== id) return;
    if (next) selectWorkspaceTab(next.id); else closeDetail();
  }

  function requestCloseWorkspaceTab() {
    if (!activeTab) { closeDetail(); return; }
    if (activeTab.hasContent) setPendingCloseTabId(activeTab.id); else closeWorkspaceTab(activeTab.id);
  }

  function closeDetail() {
    if (requestedWorkspaceTabId) setWorkspaceAddress(null);
    setEditingDetail(false);
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
      setEditingDetail(false);
      setView("list");
      return;
    }
    if (card.stage === "cash") {
      if (card.orderId) { const destination = pdvFlowCardDestination(card, { pdv: canCreate, orders: canUseSharedQueue, dispatch: hasScreenAccess('screen:pdv_dispatch') }); if (destination) navigate(destination); }
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
      const destination = pdvFlowCardDestination(card, { pdv: canCreate, orders: canUseSharedQueue, dispatch: hasScreenAccess('screen:pdv_dispatch') });
      if (destination) navigate(destination);
    }
  }

  const resumedWorkspace = useRef<string | null>(null);
  useEffect(() => {
    if (!requestedWorkspaceTabId) { resumedWorkspace.current = null; return; }
    if (!tabs.ready || !tabs.storageKey) return;
    const identity = `${tabs.storageKey}:${requestedWorkspaceTabId}`;
    if (resumedWorkspace.current === identity) return;
    resumedWorkspace.current = identity;
    const tab = tabs.tabs.find(item => item.id === requestedWorkspaceTabId);
    if (!tab) {
      const params = new URLSearchParams(searchParams); params.delete('atendimento'); setSearchParams(params, { replace: true });
      return;
    }
    tabs.select(tab.id); setEditingDetail(true); setSelectedFlowOrderId(null);
    setSelectedId(tab.preorderId); setDraftId(tab.preorderId ? null : tab.draftId);
  }, [requestedWorkspaceTabId, searchParams, setSearchParams, tabs]);

  const content = (
    <PdvPreorderDetail
      key={activeTab?.id ?? selectedId ?? draftId ?? 'preorder-empty'}
      detail={activeDetail}
      editorSnapshot={editorSnapshot}
      onEditorSnapshotChange={(snapshot, summary) => {
        if (!activeTab) return;
        tabs.update(activeTab.id, { editorState: snapshot, customerId: snapshot.customerId === 'none' ? null : snapshot.customerId,
          total: summary?.total ?? activeTab.total, hasContent: Boolean(snapshot.lines.length || snapshot.customerId !== 'none' || snapshot.notes.trim() || snapshot.coupon),
          ...(!snapshot.dirty && snapshot.sourceRevision != null ? { revision: snapshot.sourceRevision } : {}) });
      }}
      workspaceHeader={<PdvOrderSwitcher
        header orders={tabs.tabs.map(tab => ({ id: tab.id, code: tab.number != null ? `#${tab.number}` : 'Novo',
          customer: customerName.get(tab.customerId ?? '') ?? '', total: tab.total,
          itemCount: projectPdvPreorderEditorSnapshot(tab.editorState)?.lines.length ?? 0, hasContent: tab.hasContent, editing: tab.recovered }))}
        activeId={tabs.activeId ?? ''} formatCurrency={money} operationLabel="Orçamento"
        texts={{ number: 'Orçamento', value: 'Valor', customer: 'Cliente', newOrder: 'Novo orçamento', unnamedCustomer: 'Sem cliente',
          editBadge: 'Versão recuperada', deleteLabel: 'Fechar atendimento', deleteTitle: 'Fechar este orçamento?',
          deleteDescription: 'As alterações ainda não salvas desta aba serão descartadas. O orçamento já salvo continua na lista.', keepOrder: 'Continuar atendimento', confirmDelete: 'Fechar atendimento' }}
        onSelect={selectWorkspaceTab} onCreate={startNew} onDelete={closeWorkspaceTab} onReorder={tabs.reorder}
        orderPreferenceKey={tabs.storageKey ? `${tabs.storageKey}:order` : undefined}
        disabled={actions.save.isPending || actions.value.isPending || actions.assignTerminal.isPending || actions.forward.isPending || actions.convert.isPending || actions.cancel.isPending}
      />}
      onCloseOrder={requestCloseWorkspaceTab}
      modePreferenceKey={user?.id && profile?.company_id
        ? `pdv:value-adjustment-mode:${profile.company_id}:${user.id}`
        : undefined}
      draftId={draftId ?? undefined}
      preferredStockId={preferredStockId}
      inventory={inventory}
      customers={customers}
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
        if (!isCurrentOperation()) return;
        if (!activeId) throw new Error("Orçamento do balcão não selecionado.");
        const saved = await actions.save.mutateAsync({
          preorderId: activeId,
          expectedRevision: activeRevision,
          header,
          items,
          requestId: requestId("save-preorder"),
        });
        if (!isCurrentOperation()) return;
        const result = header.target_terminal_id
          ? await actions.assignTerminal.mutateAsync({
              preorderId: saved.preorder_id,
              expectedRevision: saved.revision ?? activeRevision,
              targetTerminalId: header.target_terminal_id,
              requestId: requestId("route-preorder"),
            })
          : saved;
        if (!isCurrentOperation()) return;
        if (activeTab) tabs.update(activeTab.id, { preorderId: result.preorder_id, revision: result.revision ?? saved.revision ?? activeRevision,
          number: result.number ?? saved.number ?? activeTab.number,
          ...(editorSnapshot ? { editorState: { ...editorSnapshot, dirty: false, sourceRevision: result.revision ?? saved.revision ?? activeRevision } } : {}) });
        if (draftId) { setDraftId(null); setSelectedId(result.preorder_id); }
        toast({ title: "Orçamento do balcão salvo na conta" });
        await flow.refetch();
        return result;
      }}
      onValue={async ({ header, items }) => {
        if (!isCurrentOperation()) return;
        if (!activeId) throw new Error("Orçamento do balcão não selecionado.");
        const result = await actions.value.mutateAsync({
          preorderId: activeId,
          expectedRevision: activeRevision,
          header,
          items,
          requestId: requestId("value-preorder"),
        });
        if (!isCurrentOperation()) return;
        if (activeTab) tabs.update(activeTab.id, { revision: result.revision ?? activeRevision, number: result.number ?? activeTab.number,
          ...(editorSnapshot ? { editorState: { ...editorSnapshot, dirty: false, sourceRevision: result.revision ?? activeRevision } } : {}) });
        toast({ title: "Valorização salva na conta" });
        await flow.refetch();
        return result;
      }}
      onForward={async () => {
        if (!isCurrentOperation()) return;
        if (!activeId) throw new Error("Orçamento do balcão não selecionado.");
        const receiptAttempt = receiptOpener.guardAttempt(autoReceipt.prepare('budget'));
        try {
        const result = await actions.forward.mutateAsync({
          preorderId: activeId,
          expectedRevision: activeRevision,
          requestId: requestId("forward-preorder"),
        });
        if (!isCurrentOperation() || !receiptOpener.isCurrent()) { receiptAttempt.cancel(); return result; }
        if (activeTab) tabs.update(activeTab.id, { revision: result.revision ?? activeRevision,
          ...(editorSnapshot ? { editorState: { ...editorSnapshot, dirty: false, sourceRevision: result.revision ?? activeRevision } } : {}) });
        void receiptAttempt.commit(`budget:${activeId}:${result.revision ?? activeRevision}`, (format, options) => receiptOpener.open(activeId, { ...options, format, inventory, customerName: detail.data?.preorder.customer_id ? customerName.get(detail.data.preorder.customer_id) : null }), detail.data?.preorder.status === "encaminhado" || ("idempotent" in result && result.idempotent === true));
        toast({ title: "Orçamento enviado ao caixa", description: canCreate ? "Você já pode começar o próximo atendimento." : "Acompanhe o atendimento na lista." });
        await flow.refetch();
        if (!isCurrentOperation()) return result;
        if (canCreate) startNew(); else closeDetail();
        return result;
        } catch (error) { receiptAttempt.cancel(); if (receiptOpener.isCurrent()) throw error; return; }
      }}
      onCancel={async () => {
        if (!isCurrentOperation()) return;
        if (!activeId) throw new Error("Orçamento do balcão não selecionado.");
        const result = await actions.cancel.mutateAsync({
          preorderId: activeId,
          expectedRevision: activeRevision,
          requestId: requestId("cancel-preorder"),
        });
        if (!isCurrentOperation()) return;
        toast({ title: "Orçamento do balcão cancelado" });
        await flow.refetch();
        closeDetail();
        return result;
      }}
      onConvert={async () => {
        if (!isCurrentOperation()) return;
        if (!activeId) throw new Error("Orçamento do balcão não selecionado.");
        const result = await actions.convert.mutateAsync({
          preorderId: activeId,
          expectedRevision: activeRevision,
          requestId: requestId("convert-preorder"),
        });
        if (!isCurrentOperation()) return;
        toast({
          title: result.already_converted
            ? "Pedido já estava criado"
            : "Pedido criado com sucesso",
          description: result.order_id
            ? "O atendimento saiu da fila e já está disponível em Pedidos."
            : undefined,
        });
        await flow.refetch();
        if (!isCurrentOperation()) return result;
        if (result.order_id) navigate(hasScreenAccess('screen:pdv') ? `/pdv?fila=1&pedido=${encodeURIComponent(result.order_id)}` : `/pdv/pedidos?pedido=${encodeURIComponent(result.order_id)}`);
        return result;
      }}
    />
  );

  const completedOrderContent = flowOrder.isLoading ? (
    <PdvPageSkeleton variant="detail" label="Carregando pedido concluído" />
  ) : flowOrder.isError || !flowOrder.data ? (
    <div className="space-y-3">
      <Button type="button" variant="cancel-ghost" onClick={closeDetail}><ArrowLeft className="h-4 w-4" />Voltar à lista</Button>
      <EmptyState
        icon={<RefreshCw className="h-12 w-12 text-destructive" />}
        title="Não foi possível abrir o pedido concluído"
        description="Atualize o fluxo e tente novamente. Nenhum dado foi alterado."
        action={{ label: "Tentar novamente", onClick: () => void flowOrder.refetch() }}
      />
    </div>
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
    <div className={cn("pdv-workspace space-y-4", isMobile && "pb-20")} data-pdv-ui>
      {!workspaceOpen && !(isMobile && selectedId) && (
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
              <PdvWorkspaceViewToggle value={activeView} showFlow={canViewFlow} onChange={value => setView(value === 'flow' ? 'flow' : 'list')} />
              {canCreate ? (
                <Button type="button" onClick={startNew}>
                  <Plus className="mr-2 h-4 w-4" /> Criar orçamento
                </Button>
              ) : null}
            </div>
          }
        />
      )}



      {workspaceOpen ? (
        !tabs.ready || catalog.isLoading || waitingForInitialStock ? <PdvPageSkeleton variant="sale" label="Carregando atendimento" /> : catalog.isError ? <EmptyState icon={<RefreshCw className="h-12 w-12 text-destructive" />} title="Não foi possível conferir o catálogo deste atendimento" description="Atualize os dados para continuar. As abas permanecem guardadas." action={{label:'Atualizar',onClick:()=>void catalog.refetch()}} /> : selectedFlowOrderId ? (
          completedOrderContent
        ) : selectedId && detail.isLoading ? (
          <PdvPageSkeleton variant="sale" label="Carregando orçamento" />
        ) : selectedId && detail.isError ? (
          <div className="space-y-3">
            <Button type="button" variant="cancel-ghost" onClick={closeDetail}><ArrowLeft className="h-4 w-4" />Voltar à lista</Button>
            <EmptyState
              icon={<Users className="h-12 w-12 text-destructive" />}
              title="Não foi possível abrir o orçamento do balcão"
              description="Ele pode ter sido atualizado ou seu acesso pode ter mudado."
              action={{ label: "Atualizar", onClick: () => void reloadDetail() }}
            />
          </div>
        ) : (
          content
        )
      ) :
        (activeView === "flow"
          ? flow.isLoading || capability.isLoading
          : queue.isLoading || catalog.isLoading) ? (
<PdvPageSkeleton variant={activeView === "flow" ? "kanban" : "list-detail"} listLeading label="Carregando orçamentos" />
      ) : (activeView === "flow"
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
      ) : activeView === "flow" ? (
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
          listFilters={<FilterButton embedded activeCount={filter === 'all' ? 0 : 1} onClear={() => setFilter('all')}><label className="block space-y-2 text-sm font-semibold">Etapa<Select value={filter} onValueChange={value => { setFilter(value as QueueFilter); closeDetail(); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FILTERS.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></label></FilterButton>}
          sortOptions={[newestFirst]}
          storageKey="pdv-preorders-list"
          searchPlaceholder="Buscar por número ou cliente"
          emptyLabel="Nenhum orçamento nesta etapa"
          mobileDetailOpen={isMobile && Boolean(selectedId)}
          onSelect={(id) => {
            setDraftId(null);
            setEditingDetail(false);
            setSelectedId(id);
          }}
        >
          {selectedId ? detail.isLoading ? <PdvPageSkeleton variant="detail" label="Carregando detalhes do orçamento" /> : detail.isError || !activeDetail ? <div className="space-y-3">{isMobile && <Button type="button" variant="cancel-ghost" onClick={closeDetail}><ArrowLeft className="h-4 w-4" />Voltar à lista</Button>}<EmptyState icon={<RefreshCw className="h-12 w-12 text-destructive" />} title="Não foi possível abrir o orçamento" description="Atualize a lista e tente novamente." action={{ label: 'Atualizar', onClick: () => void reloadDetail() }} /></div> : <PdvPreorderOverview detail={activeDetail} customerName={customerName.get(activeDetail.preorder.customer_id ?? '') ?? 'Sem cliente'} stockName={stocks.find(stock => stock.id === activeDetail.preorder.stock_id)?.name ?? 'Estoque não escolhido'} inventory={inventory} money={money} dateTime={dateTime} onBack={isMobile ? closeDetail : undefined} onEdit={() => openEditor(activeDetail.preorder.id)} workspaceAction={preorderWorkspaceAction(activeDetail.preorder.status, canValue, canConvert)} /> : <EmptyState
            icon={
              <ClipboardCheck className="h-12 w-12 text-muted-foreground" />
            }
            title="Escolha um orçamento"
            description="Abra um item da lista ou crie um novo orçamento do balcão."
          />}
        </ListDetailLayout>
      )}

      {workspaceOpen && tabs.error && <NoticeBanner variant="warning">{tabs.error}</NoticeBanner>}
      <AlertDialog open={pendingCloseTabId !== null} onOpenChange={open => { if (!open) setPendingCloseTabId(null); }}>
        <AlertDialogContent onOpenAutoFocus={event => { event.preventDefault(); closeTabConfirmRef.current?.focus(); }}>
          <AlertDialogHeader><AlertDialogTitle>Fechar este orçamento?</AlertDialogTitle><AlertDialogDescription>As alterações ainda não salvas desta aba serão descartadas. O orçamento já salvo continua na lista.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Continuar atendimento</AlertDialogCancel><AlertDialogAction ref={closeTabConfirmRef} onClick={() => { if (pendingCloseTabId) closeWorkspaceTab(pendingCloseTabId); setPendingCloseTabId(null); }}>Fechar atendimento</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <p className="sr-only" role="status">{workspaceOpen ? tabs.error ? 'Backup local indisponível' : 'Abas deste atendimento guardadas neste dispositivo. Orçamentos salvos são confirmados na conta pelo servidor.' : ''}</p>

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

function PdvPreorderOverview({ detail, customerName, stockName, inventory, money, dateTime, onBack, onEdit, workspaceAction }: { detail: PreorderDetail; customerName: string; stockName: string; inventory: PdvPreorderCatalogItem[]; money: (amount: number) => string; dateTime: (value: string | Date | null | undefined) => string; onBack?: () => void; onEdit: () => void; workspaceAction: string | null }) {
  return <div className="min-w-0 space-y-6 p-1 sm:p-2">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">Orçamento do balcão</p><h2 className="text-2xl font-bold">#{detail.preorder.number}</h2><p className="mt-1 text-sm text-muted-foreground">{customerName}</p></div><PdvPreorderStatusBadge status={detail.preorder.status} /></header>
    <div className="flex flex-wrap items-center gap-2">{onBack && <Button variant="cancel-ghost" onClick={onBack}>Voltar à lista</Button>}{workspaceAction && <Button onClick={onEdit}>{workspaceAction}</Button>}<PdvPreorderReceiptButton preorderId={detail.preorder.id} customerName={customerName} inventory={inventory} /></div>
    <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Estoque</dt><dd className="mt-1 font-medium">{stockName}</dd></div><div><dt className="text-muted-foreground">Atualizado em</dt><dd className="mt-1 font-medium">{dateTime(detail.preorder.updated_at)}</dd></div></dl>
    <section><div className="mb-2 flex items-center justify-between gap-3"><h3 className="font-semibold">Materiais e serviços</h3><strong className="whitespace-nowrap tabular-nums">{detail.preorder.total == null ? 'Preço pendente' : money(detail.preorder.total)}</strong></div><div className="divide-y border-y">{detail.items.map(item => <div key={item.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><p className="font-medium">{item.description}</p><p className="text-xs text-muted-foreground">{item.quantity} × {item.unit_price == null ? 'Preço pendente' : money(item.unit_price)}</p></div><strong className="whitespace-nowrap text-sm tabular-nums">{item.unit_price == null ? 'Pendente' : money(Math.max(0, item.quantity * item.unit_price - item.discount_amount))}</strong></div>)}</div></section>
    {detail.preorder.notes && <section><h3 className="font-semibold">Observações</h3><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{detail.preorder.notes}</p></section>}
  </div>;
}
