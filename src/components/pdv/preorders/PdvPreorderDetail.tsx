import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Barcode,
  Check,
  ClipboardCheck,
  Keyboard,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { NoticeBanner } from "@/components/ui/NoticeBanner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NumericInput,
  parseDecimalInputValue,
} from "@/components/ui/numeric-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { EmptyState } from "@/components/mobile/EmptyState";
import {
  MobilePillTabs,
  type PillTab,
} from "@/components/mobile/MobilePillTabs";
import { Card, CardContent } from "@/components/ui/card";
import { FilterButton } from "@/components/ui/FilterButton";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  PdvCartPanel,
  type PdvCartPanelTexts,
} from "@/components/pdv/PdvCartPanel";
import {
  PdvProductCard,
  type PdvGridProduct,
} from "@/components/pdv/PdvProductCard";
import { PdvShortcutHelpDialog } from "@/components/pdv/PdvShortcutHelpDialog";
import { useLocaleFormatters } from "@/lib/format/hooks";
import { getCurrencySymbol } from "@/lib/format";
import { useMediaBreakpoint } from "@/hooks/use-mobile";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import {
  findPdvGridNeighbor,
  isPdvEditableTarget,
  shouldNavigatePdvCatalogFromSearch,
  type PdvGridDirection,
  type PdvGridItemRect,
} from "@/lib/pdv/keyboard";
import type { CartState } from "@/lib/pdv/cart";
import type { Customer } from "@/types/database";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";
import {
  PdvPreorderDomainError,
  type PdvPreorderDetail as Detail,
  type PdvPreorderMutationResult,
  type PdvPreorderSaveHeader,
  type PdvPreorderSaveItem,
} from "@/hooks/usePdvPreorders";
import { PdvPreorderStatusBadge } from "./PdvPreorderStatusBadge";
import { PdvPreorderReceiptButton } from "./PdvPreorderReceiptButton";

export interface PdvPreorderCatalogItem {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  salePrice: number | null;
  imageUrl?: string | null;
  barcode?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  groupColor?: string | null;
  availableQuantity?: number | null;
  availableByStock?: Array<{ stockId: string; availableQuantity: number }>;
}

export interface PdvPreorderOption {
  id: string;
  name: string;
}

interface EditableLine {
  id: string;
  inventoryId: string | null;
  itemType: "material" | "service" | "free_item";
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  unitFactor: number;
  sortOrder: number;
}

interface SavePayload {
  header: PdvPreorderSaveHeader;
  items: PdvPreorderSaveItem[];
}

interface ValuePayload {
  header: Pick<
    PdvPreorderSaveHeader,
    "customer_id" | "notes" | "discount_amount"
  >;
  items: Array<{
    id: string;
    unit_price: number | null;
    discount_amount: number;
  }>;
}

interface Props {
  detail: Detail | null;
  draftId?: string;
  inventory: PdvPreorderCatalogItem[];
  customers: PdvPreorderOption[];
  stocks: PdvPreorderOption[];
  terminals: Array<PdvPreorderOption & { stockId: string }>;
  canValue: boolean;
  canConvert: boolean;
  canCancel: boolean;
  onBack?: () => void;
  onReload: () => void;
  onSave: (payload: SavePayload) => Promise<PdvPreorderMutationResult>;
  onValue: (payload: ValuePayload) => Promise<PdvPreorderMutationResult>;
  onForward: () => Promise<PdvPreorderMutationResult>;
  onCancel: () => Promise<PdvPreorderMutationResult>;
  onConvert: () => Promise<PdvPreorderMutationResult>;
}

function inputNumber(value: number | null | undefined): string {
  return value == null ? "" : String(value).replace(".", ",");
}

function lineFromDetail(item: Detail["items"][number]): EditableLine {
  return {
    id: item.id,
    inventoryId: item.inventory_id,
    itemType: item.item_type,
    description: item.description,
    quantity: inputNumber(item.quantity),
    unitPrice: inputNumber(item.unit_price),
    discountAmount: inputNumber(item.discount_amount),
    unitFactor: item.unit_factor_snapshot,
    sortOrder: item.sort_order,
  };
}

function newLine(itemType: "service" | "free_item"): EditableLine {
  return {
    id: crypto.randomUUID(),
    inventoryId: null,
    itemType,
    description: "",
    quantity: "1",
    unitPrice: "",
    discountAmount: "0",
    unitFactor: 1,
    sortOrder: 0,
  };
}

export function PdvPreorderDetail({
  detail,
  draftId,
  inventory,
  customers,
  stocks,
  terminals = [],
  canValue,
  canConvert,
  canCancel,
  onBack,
  onReload,
  onSave,
  onValue,
  onForward,
  onCancel,
  onConvert,
}: Props) {
  const { money, locale, currency } = useLocaleFormatters();
  const isMobileCart = useMediaBreakpoint(768);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const preorder = detail?.preorder ?? null;
  const isNew = !preorder && Boolean(draftId);
  const isEditing = isNew || preorder?.status === "edicao";
  const isValuing = preorder?.status === "encaminhado" && canValue;
  const canEditCommercial = isEditing || isValuing;
  const [customerId, setCustomerId] = useState<string>("none");
  const [stockId, setStockId] = useState<string>("none");
  const [targetTerminalId, setTargetTerminalId] = useState<string>("none");
  const [notes, setNotes] = useState("");
  const [orderDiscount, setOrderDiscount] = useState("0");
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeProductIndex, setActiveProductIndex] = useState(0);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<PdvPreorderDomainError | null>(
    null,
  );

  useEffect(() => {
    setCustomerId(preorder?.customer_id ?? "none");
    setStockId(preorder?.stock_id ?? "none");
    setTargetTerminalId(preorder?.target_terminal_id ?? "none");
    setNotes(preorder?.notes ?? "");
    setOrderDiscount(inputNumber(preorder?.discount_amount ?? 0));
    setLines(detail?.items.map(lineFromDetail) ?? []);
    setDirty(false);
    setSaved(false);
    setActionError(null);
  }, [detail, draftId, preorder]);

  const markDirty = () => {
    setDirty(true);
    setSaved(false);
    setActionError(null);
  };

  const missingPrices = lines.filter(
    (line) => parseDecimalInputValue(line.unitPrice) == null,
  ).length;
  const calculatedSubtotal = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const quantity = parseDecimalInputValue(line.quantity) ?? 0;
        const unitPrice = parseDecimalInputValue(line.unitPrice);
        if (unitPrice == null) return sum;
        const discount = parseDecimalInputValue(line.discountAmount) ?? 0;
        return (
          sum +
          Math.max(0, Math.round((quantity * unitPrice - discount) * 100) / 100)
        );
      }, 0),
    [lines],
  );
  const total = Math.max(
    0,
    calculatedSubtotal - (parseDecimalInputValue(orderDiscount) ?? 0),
  );
  const filteredInventory = useMemo(() => {
    const query = catalogQuery.trim().toLocaleLowerCase("pt-BR");
    return inventory.filter((item) => {
      if (activeCategory !== "all" && item.groupId !== activeCategory)
        return false;
      if (!query) return true;
      return `${item.name} ${item.sku ?? ""} ${item.barcode ?? ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(query);
    });
  }, [activeCategory, catalogQuery, inventory]);

  const categoryTabs = useMemo<PillTab[]>(() => {
    const groups = new Map<string, { label: string; accentColor?: string }>();
    inventory.forEach((item) => {
      if (!item.groupId || !item.groupName) return;
      groups.set(item.groupId, {
        label: item.groupName,
        accentColor: item.groupColor ?? undefined,
      });
    });
    return [
      { value: "all", label: "Todos" },
      ...Array.from(groups, ([value, group]) => ({
        value,
        ...group,
        useColorBackground: true,
        forceWhiteForeground: true,
      })),
    ];
  }, [inventory]);
  const visibleCategoryTabs = categoryTabs.slice(0, 6);
  const hiddenCategoryTabs = categoryTabs.slice(6);

  const gridProducts = useMemo<PdvGridProduct[]>(
    () =>
      filteredInventory.map((item) => ({
        inventoryId: item.id,
        name: item.name,
        imageUrl: item.imageUrl ?? null,
        unitPrice: item.salePrice ?? 0,
        unit: item.unit,
        availableQuantity:
          (stockId !== "none"
            ? item.availableByStock?.find((level) => level.stockId === stockId)
                ?.availableQuantity
            : item.availableQuantity) ?? Number.MAX_SAFE_INTEGER,
      })),
    [filteredInventory, stockId],
  );
  const keyboardProducts = useMemo(
    () => gridProducts.filter((product) => product.availableQuantity > 0),
    [gridProducts],
  );
  const activeProductId =
    keyboardProducts[
      Math.min(activeProductIndex, Math.max(0, keyboardProducts.length - 1))
    ]?.inventoryId ?? null;

  useEffect(() => {
    setActiveProductIndex(0);
  }, [catalogQuery, activeCategory]);

  useEffect(() => {
    if (!activeProductId) return;
    const activeButton = Array.from(
      gridRef.current?.querySelectorAll<HTMLElement>(
        "[data-pdv-product-id]",
      ) ?? [],
    ).find(
      (element) => element.dataset.pdvProductId === activeProductId,
    );
    activeButton?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeProductId]);

  const moveProductFocus = useCallback(
    (direction: PdvGridDirection) => {
      if (!activeProductId || !gridRef.current) return;
      const elements = Array.from(
        gridRef.current.querySelectorAll<HTMLButtonElement>(
          "[data-pdv-product-id]:not(:disabled)",
        ),
      );
      const rects: PdvGridItemRect[] = elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            id: element.dataset.pdvProductId ?? "",
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        })
        .filter((rect) => rect.id);
      const nextId = findPdvGridNeighbor(rects, activeProductId, direction);
      if (!nextId) return;
      const nextIndex = keyboardProducts.findIndex(
        (product) => product.inventoryId === nextId,
      );
      if (nextIndex < 0) return;
      setActiveProductIndex(nextIndex);
      window.requestAnimationFrame(() => {
        elements
          .find((element) => element.dataset.pdvProductId === nextId)
          ?.focus();
      });
    },
    [activeProductId, keyboardProducts],
  );

  function handleGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-pdv-product-id]:not(:disabled)",
      );
      const product = keyboardProducts.find(
        (candidate) =>
          candidate.inventoryId === button?.dataset.pdvProductId,
      );
      if (!product) return;
      event.preventDefault();
      addGridProduct(product);
      return;
    }
    const directionByKey: Partial<Record<string, PdvGridDirection>> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    const direction = directionByKey[event.key];
    if (!direction) return;
    event.preventDefault();
    moveProductFocus(direction);
  }

  const cart = useMemo<CartState>(
    () => ({
      customerId: customerId === "none" ? null : customerId,
      discount: parseDecimalInputValue(orderDiscount) ?? 0,
      lines: lines.map((line) => {
        const material = line.inventoryId
          ? inventory.find((item) => item.id === line.inventoryId)
          : null;
        const quantity = parseDecimalInputValue(line.quantity) ?? 0;
        return {
          inventoryId: line.id,
          name:
            line.description ||
            (line.itemType === "service" ? "Novo serviço" : "Novo item"),
          imageUrl: material?.imageUrl ?? null,
          unitPrice: parseDecimalInputValue(line.unitPrice) ?? 0,
          unit: material?.unit ?? "un",
          unitCost: 0,
          quantity,
          discountAmount: parseDecimalInputValue(line.discountAmount) ?? 0,
          availableQuantity: Math.max(
            quantity,
            (stockId !== "none"
              ? material?.availableByStock?.find(
                  (level) => level.stockId === stockId,
                )?.availableQuantity
              : material?.availableQuantity) ?? Number.MAX_SAFE_INTEGER,
          ),
        };
      }),
    }),
    [customerId, inventory, lines, orderDiscount, stockId],
  );

  const customerRecords = useMemo<Customer[]>(
    () =>
      customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        customer_type: "pf",
        created_at: "",
        updated_at: "",
      })),
    [customers],
  );

  function updateLine(id: string, patch: Partial<EditableLine>) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
    markDirty();
  }

  function addMaterial(selectedMaterialId: string) {
    const material = inventory.find((item) => item.id === selectedMaterialId);
    if (!material || lines.some((line) => line.inventoryId === material.id))
      return;
    setLines((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        inventoryId: material.id,
        itemType: "material",
        description: material.name,
        quantity: "1",
        unitPrice: inputNumber(canValue ? null : material.salePrice),
        discountAmount: "0",
        unitFactor: 1,
        sortOrder: current.length,
      },
    ]);
    setCatalogQuery("");
    markDirty();
  }

  function addLooseItem(type: "service" | "free_item") {
    setLines((current) => [
      ...current,
      { ...newLine(type), sortOrder: current.length },
    ]);
    markDirty();
  }

  function removeLine(id: string) {
    setLines((current) => current.filter((line) => line.id !== id));
    markDirty();
  }

  function addGridProduct(product: PdvGridProduct) {
    addMaterial(product.inventoryId);
    setActiveProductIndex(0);
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function setCartQuantity(lineId: string, quantity: number) {
    if (!isEditing) return;
    if (quantity <= 0) {
      removeLine(lineId);
      return;
    }
    updateLine(lineId, { quantity: inputNumber(quantity) });
  }

  function incrementCartLine(lineId: string, delta: number) {
    const line = lines.find((candidate) => candidate.id === lineId);
    if (!line) return;
    const current = parseDecimalInputValue(line.quantity) ?? 0;
    setCartQuantity(
      lineId,
      Math.max(0, Math.round((current + delta) * 1000) / 1000),
    );
  }

  function setCartLineDiscount(lineId: string, amount: number) {
    if (!canEditCommercial) return;
    updateLine(lineId, { discountAmount: inputNumber(amount) });
  }

  function handleBarcode(code: string) {
    if (!isEditing) return;
    const normalized = code.trim().toLocaleLowerCase("pt-BR");
    const item = inventory.find(
      (candidate) =>
        candidate.barcode?.toLocaleLowerCase("pt-BR") === normalized ||
        candidate.sku?.toLocaleLowerCase("pt-BR") === normalized,
    );
    setCatalogQuery("");
    if (!item) {
      setActionError(
        new PdvPreorderDomainError(
          "Código não encontrado no catálogo.",
          "unknown",
        ),
      );
      return;
    }
    addMaterial(item.id);
  }

  useBarcodeScanner({
    onScan: handleBarcode,
    enabled: isEditing && !notesOpen && !shortcutHelpOpen,
  });

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const directionByKey: Partial<Record<string, PdvGridDirection>> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    const direction = directionByKey[event.key];
    if (
      direction &&
      keyboardProducts.length > 0 &&
      shouldNavigatePdvCatalogFromSearch(event.key, catalogQuery)
    ) {
      event.preventDefault();
      moveProductFocus(direction);
      return;
    }
    if (event.key === "Enter" && keyboardProducts.length > 0) {
      event.preventDefault();
      addGridProduct(
        keyboardProducts[
          Math.min(activeProductIndex, keyboardProducts.length - 1)
        ],
      );
      setCatalogQuery("");
      return;
    }
    if (event.key === "Escape") {
      setCatalogQuery("");
      setActiveProductIndex(0);
      return;
    }
    if (
      (event.key === "+" || event.key === "-") &&
      catalogQuery === "" &&
      lines.length > 0
    ) {
      event.preventDefault();
      const lastLine = lines[lines.length - 1];
      incrementCartLine(lastLine.id, event.key === "+" ? 1 : -1);
    }
  }

  function validate(): string | null {
    if (lines.length === 0) return "Adicione pelo menos um item.";
    if (lines.some((line) => !line.description.trim()))
      return "Informe a descrição de todos os itens.";
    if (
      lines.some((line) => (parseDecimalInputValue(line.quantity) ?? 0) <= 0)
    ) {
      return "A quantidade deve ser maior que zero.";
    }
    const discount = parseDecimalInputValue(orderDiscount) ?? 0;
    if (missingPrices === 0 && discount > calculatedSubtotal)
      return "O desconto é maior que o valor dos itens.";
    return null;
  }

  async function runAction(
    name: string,
    action: () => Promise<PdvPreorderMutationResult>,
  ) {
    setBusyAction(name);
    setActionError(null);
    try {
      return await action();
    } catch (error) {
      const mapped =
        error instanceof PdvPreorderDomainError
          ? error
          : new PdvPreorderDomainError(
              "Não foi possível concluir a ação. Tente novamente.",
              "unknown",
            );
      setActionError(mapped);
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  async function submit() {
    const invalid = validate();
    if (invalid) {
      setActionError(new PdvPreorderDomainError(invalid, "unknown"));
      return;
    }
    const items = lines.map((line, index) => ({
      id: line.id,
      inventory_id: line.inventoryId,
      item_type: line.itemType,
      description: line.description.trim(),
      quantity: parseDecimalInputValue(line.quantity) ?? 0,
      unit_price: parseDecimalInputValue(line.unitPrice),
      discount_amount: parseDecimalInputValue(line.discountAmount) ?? 0,
      unit_factor: line.unitFactor,
      sort_order: index,
    }));
    const result = await runAction(isValuing ? "value" : "save", () =>
      isValuing
        ? onValue({
            header: {
              customer_id: customerId === "none" ? null : customerId,
              notes: notes.trim() || null,
              discount_amount: parseDecimalInputValue(orderDiscount) ?? 0,
            },
            items: items.map((item) => ({
              id: item.id,
              unit_price: item.unit_price,
              discount_amount: item.discount_amount,
            })),
          })
        : onSave({
            header: {
              customer_id: customerId === "none" ? null : customerId,
              stock_id: stockId === "none" ? null : stockId,
              target_terminal_id: targetTerminalId === "none" ? null : targetTerminalId,
              operation_mode: "counter",
              notes: notes.trim() || null,
              discount_amount: parseDecimalInputValue(orderDiscount) ?? 0,
            },
            items,
          }),
    );
    if (result) {
      setDirty(false);
      setSaved(true);
    }
  }

  const shouldSave = canEditCommercial && (isNew || dirty);
  const canCreateOrder = preorder?.status === "encaminhado" && canConvert;
  const canForward = preorder?.status === "edicao";
  const showPrimaryAction = shouldSave || canForward || canCreateOrder;
  const primaryLabel = shouldSave
    ? isValuing
      ? "Salvar preços"
      : "Salvar orçamento"
    : canForward
      ? "Enviar ao caixa"
      : "Criar pedido";
  const primaryDisabled =
    Boolean(busyAction) ||
    lines.length === 0 ||
    (canForward && (dirty || !preorder?.target_terminal_id)) ||
    (canCreateOrder && (dirty || missingPrices > 0));

  async function runPrimaryAction() {
    if (shouldSave) {
      await submit();
      return;
    }
    if (canForward) {
      await runAction("forward", onForward);
      return;
    }
    if (canCreateOrder) await runAction("convert", onConvert);
  }

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.altKey ||
        notesOpen
      )
        return;

      const command = event.ctrlKey || event.metaKey;
      const commandKey = event.key.toLowerCase();
      if (command && commandKey === "k") {
        event.preventDefault();
        setShortcutHelpOpen(true);
        return;
      }
      if (command && commandKey === "f") {
        event.preventDefault();
        if (!shortcutHelpOpen) searchInputRef.current?.focus();
        return;
      }
      if (command && event.key === "Enter") {
        event.preventDefault();
        if (
          !shortcutHelpOpen &&
          !busyAction &&
          showPrimaryAction &&
          !primaryDisabled
        )
          void runPrimaryAction();
        return;
      }
      if (
        command &&
        (event.key === "+" || event.key === "-") &&
        lines.length > 0 &&
        isEditing
      ) {
        event.preventDefault();
        const lastLine = lines[lines.length - 1];
        incrementCartLine(lastLine.id, event.key === "+" ? 1 : -1);
        return;
      }
      if (command) return;

      if (event.key === "?" && !isPdvEditableTarget(event.target)) {
        event.preventDefault();
        setShortcutHelpOpen(true);
        return;
      }
      if (shortcutHelpOpen || busyAction) return;

      if (event.key === "F2") {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (event.key === "F3") {
        event.preventDefault();
        const customerTrigger = document.getElementById("pdv-customer");
        customerTrigger?.focus();
        customerTrigger?.click();
      } else if (event.key === "F9" && showPrimaryAction && !primaryDisabled) {
        event.preventDefault();
        void runPrimaryAction();
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

  const currencySymbol = getCurrencySymbol(currency, locale);
  const cartTexts: PdvCartPanelTexts = {
    title: isNew ? "Novo orçamento" : `Orçamento #${preorder?.number ?? ""}`,
    itemsCount: "{count} itens",
    itemsCountOne: "1 item",
    draftHint:
      preorder?.status === "encaminhado"
        ? "no caixa"
        : "rascunho salvo na conta",
    empty: "Nenhum item adicionado",
    emptyHint: "Busque um material ou leia o código para começar.",
    removeLine: "Remover item",
    clearCart: "Limpar orçamento",
    noPhoto: "Sem foto",
    openProductPhoto: "Ver foto de {name} em tela cheia",
    productPhotoViewerDescription:
      "Visualização da foto do material em tela cheia.",
    quantityEditLabel: "Editar quantidade",
    itemDiscount: "Desconto",
    itemDiscountPlaceholder: "0,00",
    customerLabel: "Cliente",
    customerNone: "Venda sem cliente",
    customerPlaceholder: "Selecione o cliente",
    customerSearchPlaceholder: "Buscar cliente",
    customerEmpty: "Nenhum cliente encontrado",
    customerCreate: "Criar cliente",
    subtotal: "Subtotal",
    itemDiscounts: "Descontos nos itens",
    discount: "Desconto geral",
    discountPlaceholder: "0,00",
    total: missingPrices > 0 ? "Total pendente" : "Total",
    paymentLabel: primaryLabel,
    paymentShortcut: "",
    finalizeLabel: primaryLabel,
    finalizeShortcut: "",
    cashClosedTitle: "",
    cashClosedDescription: "",
    cashClosedAction: "",
    advancedOptionsTrigger: "Observações e detalhes",
    discountEditor: {
      add: "Aplicar desconto",
      edit: "Editar desconto",
      close: "Fechar",
      valueMode: "Valor",
      percentageMode: "Percentual",
      valueLabel: "Valor do desconto",
      percentageLabel: "Percentual do desconto",
      invalidNumber: "Informe um número válido.",
      percentageLimit: "O percentual máximo é 100%.",
      valueLimit: "O desconto não pode ultrapassar {value}.",
      itemTotal: "Total do item",
      afterDiscount: "Após desconto",
      cancel: "Cancelar",
      apply: "Aplicar",
      remove: "Remover desconto",
    },
  };

  const cartPanelProps = {
    cart,
    customers: customerRecords,
    formatCurrency: money,
    currencySymbol,
    locale,
    onSetDiscountAmount: (amount: number) => {
      setOrderDiscount(inputNumber(amount));
      markDirty();
    },
    onIncrement: incrementCartLine,
    onSetQuantity: setCartQuantity,
    onSetLineDiscount: setCartLineDiscount,
    onRemove: removeLine,
    onCustomerChange: (id: string | null) => {
      setCustomerId(id ?? "none");
      markDirty();
    },
    onRequestClearCart: () => {
      setLines([]);
      markDirty();
    },
    onRequestPayment: () => void runPrimaryAction(),
    cashClosed: false,
    onGoToCashPanel: () => undefined,
    onConfirmQuantityEdit: () => searchInputRef.current?.focus(),
    onOpenAdvancedOptions: () => setNotesOpen(true),
    advancedOptionsActive: Boolean(notes.trim() || stockId !== "none"),
    advancedOptionsSummary: notes.trim() ? "Observação preenchida" : undefined,
    texts: cartTexts,
    readOnly: !canEditCommercial,
    canFinalizeOverride: showPrimaryAction && !primaryDisabled,
    finalizeIcon: canForward ? (
      <Send className="h-5 w-5" />
    ) : (
      <ClipboardCheck className="h-5 w-5" />
    ),
    hideFinalizeShortcut: true,
    showFinalizeAction: showPrimaryAction,
  };

  if (!preorder && !isNew) {
    return (
      <EmptyState
        icon={<ClipboardCheck className="h-12 w-12" />}
        title="Selecione um orçamento do balcão"
        description="Abra uma linha da fila para conferir os itens e seguir para a próxima etapa."
      />
    );
  }

  const showLineEditor =
    isValuing ||
    (isEditing && lines.some((line) => line.itemType !== "material"));

  return (
    <section
      className={cn("flex min-w-0 flex-col gap-4", isMobileCart && "pb-44")}
      aria-label={
        isNew
          ? "Novo orçamento do balcão"
          : `Orçamento do balcão ${preorder?.number}`
      }
      data-testid="pdv-preorder-sale-workspace"
    >
      <header className="flex items-center gap-4 border-b border-border pb-3">
        <div className="flex min-w-0 flex-1 items-center">
          {onBack && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onBack}
              aria-label="Voltar para a fila"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className={cn(typography.pageTitle, "truncate")}>
                {isNew ? "Criar orçamento" : `Orçamento #${preorder?.number}`}
              </h1>
              {preorder && <PdvPreorderStatusBadge status={preorder.status} />}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              Monte os itens como em uma venda; o pedido só nasce quando o caixa
              concluir.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => searchInputRef.current?.focus()}
        >
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">Buscar material</span>
          <kbd className="rounded border bg-muted px-1 text-[10px] text-muted-foreground">
            F2
          </kbd>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Ações do orçamento"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Ações</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setShortcutHelpOpen(true)}>
              <Keyboard className="mr-2 h-4 w-4" />Atalhos do orçamento
            </DropdownMenuItem>
            {preorder && (
              <PdvPreorderReceiptButton
                appearance="menu-item"
                preorderId={preorder.id}
                customerName={
                  customers.find((customer) => customer.id === preorder.customer_id)
                    ?.name
                }
                inventory={inventory}
                label="Gerar comprovante"
              />
            )}
            {preorder &&
              canCancel &&
              ["edicao", "encaminhado"].includes(preorder.status) && (
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive focus:text-white"
                  disabled={Boolean(busyAction)}
                  onSelect={() => setCancelDialogOpen(true)}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancelar orçamento
                </DropdownMenuItem>
              )}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="hidden min-h-9 items-center gap-2 text-xs text-muted-foreground sm:flex">
          {busyAction === "save" || busyAction === "value" ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Salvando…
            </>
          ) : saved ? (
            <>
              <Check className="h-3.5 w-3.5 text-success" /> Salvo na conta
            </>
          ) : dirty ? (
            "Alterações não salvas"
          ) : null}
        </div>
      </header>

      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar este orçamento do balcão?</AlertDialogTitle>
            <AlertDialogDescription>
              Ele sairá da fila e as reservas ativas serão liberadas pelo servidor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void runAction("cancel", onCancel)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Cancelar orçamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {actionError && (
        <NoticeBanner
          variant={
            actionError.kind === "conflict" ||
            actionError.kind === "reservation"
              ? "warning"
              : "destructive"
          }
          title={
            actionError.kind === "conflict"
              ? "O orçamento foi atualizado em outro dispositivo"
              : undefined
          }
          action={
            actionError.kind === "conflict" ? (
              <button
                type="button"
                className="font-semibold underline"
                onClick={onReload}
              >
                Atualizar
              </button>
            ) : undefined
          }
        >
          {actionError.message}
        </NoticeBanner>
      )}
      {preorder?.status === "encaminhado" && missingPrices > 0 && !canValue && (
        <NoticeBanner variant="warning" title="Faltam preços">
          <strong>Preço pendente</strong>. Há {missingPrices}{" "}
          {missingPrices === 1 ? "item sem preço" : "itens sem preço"}. Um
          operador autorizado precisa preencher os valores antes de criar o
          pedido.
        </NoticeBanner>
      )}
      {preorder?.status === "encaminhado" && !canConvert && (
        <NoticeBanner variant="info">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Seu perfil não transforma
            orçamentos do balcão em pedidos.
          </span>
        </NoticeBanner>
      )}

      <div className="flex flex-col gap-3 md:min-h-[40rem] md:flex-row md:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3 md:h-full">
          {isEditing && (
            <div
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
              data-testid="pdv-preorder-catalog-controls"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Barcode className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    autoFocus
                    type="search"
                    name="pdv-orcamento-busca-produto"
                    role="searchbox"
                    aria-autocomplete="none"
                    inputMode="search"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                    value={catalogQuery}
                    onChange={(event) => {
                      setCatalogQuery(event.target.value);
                      setActiveProductIndex(0);
                    }}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Buscar material por nome, código ou ler etiqueta"
                    className="h-12 pl-10 pr-14 text-base [&::-webkit-search-cancel-button]:appearance-none"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground sm:inline-flex">
                    F2
                  </span>
                </div>
                <Select
                  value={stockId}
                  onValueChange={(value) => {
                    setStockId(value);
                    setTargetTerminalId("none");
                    markDirty();
                  }}
                >
                  <SelectTrigger id="preorder-stock" className="w-full sm:w-56">
                    <SelectValue placeholder="Local de estoque" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Escolher estoque antes de enviar ao caixa</SelectItem>
                    {stocks.map((stock) => (
                      <SelectItem key={stock.id} value={stock.id}>
                        {stock.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={targetTerminalId}
                  onValueChange={(value) => { setTargetTerminalId(value); markDirty(); }}
                >
                  <SelectTrigger className="w-full sm:w-56">
                    <SelectValue placeholder="Caixa de destino" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Escolher caixa de destino</SelectItem>
                    {terminals.filter((terminal) => terminal.stockId === stockId).map((terminal) => (
                      <SelectItem key={terminal.id} value={terminal.id}>{terminal.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                {categoryTabs.length > 1 && (
                  <MobilePillTabs
                    tabs={visibleCategoryTabs}
                    activeTab={activeCategory}
                    onTabChange={(value) => {
                      setActiveCategory(value);
                      setActiveProductIndex(0);
                    }}
                    className="min-w-0 flex-1"
                  />
                )}
                {hiddenCategoryTabs.length > 0 && (
                  <FilterButton
                    activeCount={
                      hiddenCategoryTabs.some(
                        (tab) => tab.value === activeCategory,
                      )
                        ? 1
                        : 0
                    }
                    onClear={() => setActiveCategory("all")}
                    className="shrink-0"
                  >
                    <div className="flex flex-col gap-1">
                      {hiddenCategoryTabs.map((tab) => (
                        <button
                          key={tab.value}
                          type="button"
                          onClick={() => setActiveCategory(tab.value)}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
                            tab.value === activeCategory
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-muted",
                          )}
                        >
                          {tab.accentColor && (
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: tab.accentColor }}
                            />
                          )}
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </FilterButton>
                )}
                <div className="ml-auto flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addLooseItem("service")}
                  >
                    <Plus className="h-4 w-4" /> Serviço
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addLooseItem("free_item")}
                  >
                    <Plus className="h-4 w-4" /> Item livre
                  </Button>
                </div>
              </div>
            </div>
          )}

          {isEditing && (
            <div
              className="min-h-0 flex-1 overflow-y-auto pr-1"
              data-testid="pdv-preorder-product-grid"
            >
              <div
                ref={gridRef}
                tabIndex={-1}
                className="space-y-5 outline-none"
                onKeyDown={handleGridKeyDown}
              >
                {gridProducts.length === 0 ? (
                  <EmptyState
                    icon={<Search className="h-10 w-10" />}
                    title="Nenhum material encontrado"
                    description="Tente outro nome, código ou categoria."
                  />
                ) : (
                  <section aria-labelledby="pdv-preorder-catalog-all">
                    <div className="mb-2 flex items-center gap-2.5">
                      <h2
                        id="pdv-preorder-catalog-all"
                        className="shrink-0 text-sm font-bold text-foreground"
                      >
                        Materiais
                      </h2>
                      <div className="h-px min-w-4 flex-1 bg-border" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 min-[768px]:grid-cols-3 min-[1024px]:grid-cols-4 min-[1280px]:grid-cols-5">
                      {gridProducts.map((product) => (
                        <PdvProductCard
                          key={product.inventoryId}
                          product={product}
                          formatCurrency={money}
                          formatQuantity={(value, unit) =>
                            value === Number.MAX_SAFE_INTEGER
                              ? "Disponível"
                              : `${value} ${unit}`
                          }
                          outOfStockLabel="Sem estoque"
                          availableLabel="{count}"
                          noPhotoLabel="Sem foto"
                          compact={false}
                          imageAspect="square"
                          imageBackdrop="cutout"
                          keyboardActive={
                            activeProductId === product.inventoryId
                          }
                          onKeyboardFocus={() => {
                            const nextIndex = keyboardProducts.findIndex(
                              (candidate) =>
                                candidate.inventoryId === product.inventoryId,
                            );
                            if (nextIndex >= 0)
                              setActiveProductIndex(nextIndex);
                          }}
                          onSelect={addGridProduct}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </div>
          )}

          {showLineEditor && (
            <Card data-testid="pdv-preorder-line-editor">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-bold">
                      {isValuing ? "Preços do orçamento" : "Itens manuais"}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Preço vazio continua pendente; preço zero é uma escolha
                      explícita.
                    </p>
                  </div>
                  {isValuing && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void submit()}
                      disabled={Boolean(busyAction) || !dirty}
                    >
                      <Check className="h-4 w-4" /> Salvar preços
                    </Button>
                  )}
                </div>
                <div className="divide-y divide-border">
                  {lines
                    .filter((line) => isValuing || line.itemType !== "material")
                    .map((line) => {
                      const price = parseDecimalInputValue(line.unitPrice);
                      return (
                        <div
                          key={line.id}
                          className="grid gap-3 py-3 md:grid-cols-[minmax(12rem,1fr)_8rem_9rem_auto] md:items-end"
                        >
                          <div className="space-y-1.5">
                            <Badge
                              variant="outline"
                              className="px-1.5 py-0 text-[10px]"
                            >
                              {line.itemType === "material"
                                ? "Material"
                                : line.itemType === "service"
                                  ? "Serviço"
                                  : "Item livre"}
                            </Badge>
                            <Label
                              htmlFor={`description-${line.id}`}
                              className="sr-only"
                            >
                              Descrição
                            </Label>
                            <Input
                              id={`description-${line.id}`}
                              value={line.description}
                              onChange={(event) =>
                                updateLine(line.id, {
                                  description: event.target.value,
                                })
                              }
                              disabled={
                                !isEditing || line.itemType === "material"
                              }
                              placeholder="Descrição do item"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label
                              htmlFor={`quantity-${line.id}`}
                              className="text-xs"
                            >
                              Quantidade
                            </Label>
                            <NumericInput
                              id={`quantity-${line.id}`}
                              decimal
                              value={line.quantity}
                              onValueChange={(value) =>
                                updateLine(line.id, { quantity: value })
                              }
                              disabled={!isEditing}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label
                              htmlFor={`price-${line.id}`}
                              className="text-xs"
                            >
                              Preço unitário
                            </Label>
                            {canValue && canEditCommercial ? (
                              <NumericInput
                                id={`price-${line.id}`}
                                aria-label="Preço unitário"
                                decimal
                                maxDecimals={2}
                                value={line.unitPrice}
                                onValueChange={(value) =>
                                  updateLine(line.id, { unitPrice: value })
                                }
                                placeholder="Pendente"
                              />
                            ) : (
                              <div className="flex h-10 items-center font-medium tabular-nums">
                                {price == null ? (
                                  <Badge variant="warning">
                                    Preço pendente
                                  </Badge>
                                ) : (
                                  money(price)
                                )}
                              </div>
                            )}
                          </div>
                          {isEditing && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeLine(line.id)}
                              aria-label={`Remover ${line.description || "item"}`}
                              className="hover:bg-destructive hover:text-white"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}

          {!isEditing && !showLineEditor && lines.length === 0 && (
            <EmptyState
              size="compact"
              icon={<ShoppingBag className="h-10 w-10" />}
              title="Nenhum item adicionado"
              description="Este orçamento ainda não tem itens."
            />
          )}
        </div>

        {!isMobileCart && (
          <Card
            className="w-full shrink-0 overflow-hidden border-foreground/15 shadow-none md:h-full md:w-[22rem] lg:w-[25rem] min-[1280px]:w-[30rem]"
            data-testid="pdv-preorder-cart-panel"
          >
            <CardContent className="h-full p-0">
              <PdvCartPanel {...cartPanelProps} />
            </CardContent>
          </Card>
        )}
      </div>

      {isMobileCart && (
        <>
          {createPortal(
            <button
              type="button"
              onClick={() => setCartDrawerOpen(true)}
              className="fixed inset-x-0 z-40 flex items-center justify-between gap-3 rounded-t-xl border-t border-border bg-primary px-4 py-3 text-primary-foreground shadow-lg"
              style={{ bottom: "calc(104px + env(safe-area-inset-bottom))" }}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <ShoppingCart className="h-4 w-4" />
                {cart.lines.length === 1
                  ? "1 item"
                  : `${cart.lines.length} itens`}
              </span>
              <span className="text-lg font-extrabold tabular-nums">
                {missingPrices > 0 ? "Valor pendente" : money(total)}
              </span>
            </button>,
            document.body,
          )}
          <Drawer open={cartDrawerOpen} onOpenChange={setCartDrawerOpen}>
            <DrawerContent className="flex max-h-[85dvh] flex-col">
              <DrawerHeader className="sr-only">
                <DrawerTitle>Orçamento do balcão</DrawerTitle>
              </DrawerHeader>
              <PdvCartPanel
                {...cartPanelProps}
                className="flex-1 overflow-hidden"
              />
            </DrawerContent>
          </Drawer>
        </>
      )}

      <ResponsiveModal
        open={notesOpen}
        onOpenChange={setNotesOpen}
        title="Observações do orçamento"
        footer={
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => setNotesOpen(false)}
          >
            Concluir
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="preorder-notes">Observações para o caixa</Label>
            <Textarea
              id="preorder-notes"
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                markDirty();
              }}
              disabled={!canEditCommercial}
              placeholder="Ex.: separar para retirada no fim da tarde"
              rows={5}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Local escolhido:{" "}
            {stocks.find((stock) => stock.id === stockId)?.name ??
              "definir depois"}
            .
          </p>
        </div>
      </ResponsiveModal>

      <PdvShortcutHelpDialog
        open={shortcutHelpOpen}
        onOpenChange={setShortcutHelpOpen}
        title="Atalhos do orçamento"
        description="Use o teclado para montar o orçamento sem interromper o atendimento."
        closeLabel="Fechar"
        shortcuts={[
          { keys: ["F2"], label: "Focar busca de materiais" },
          { keys: ["F3"], label: "Selecionar cliente" },
          { keys: ["↑", "↓", "←", "→"], label: "Navegar pelos materiais" },
          { keys: ["Enter"], label: "Adicionar material e voltar à busca" },
          { keys: ["+", "−"], label: "Alterar a quantidade do último item" },
          { keys: ["F9"], label: "Concluir a etapa disponível" },
          { keys: ["⌘/Ctrl", "F"], label: "Focar busca de materiais" },
          { keys: ["⌘/Ctrl", "Enter"], label: "Concluir a etapa disponível" },
          { keys: ["⌘/Ctrl", "+/−"], label: "Alterar a quantidade do último item" },
          { keys: ["⌘/Ctrl", "K"], label: "Abrir esta ajuda" },
          { keys: ["Esc"], label: "Limpar a busca" },
          { keys: ["?"], label: "Abrir esta ajuda" },
        ]}
      />
    </section>
  );
}
