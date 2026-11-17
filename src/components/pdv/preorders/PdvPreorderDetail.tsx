import { PdvCouponControl } from '@/components/pdv/coupons/PdvCouponControl';
import { couponBaseItems } from '@/lib/pdv/couponCart';
import { couponCartSignature, confirmedCouponDiscount, couponCartReady, setCartFinalAmount, setLineFinalAmount, type PdvCartCoupon } from '@/lib/pdv/cart';
import { canCapturePdvCatalogScan } from '@/lib/pdv/catalogKeyboard';
import '@/components/pdv/PdvWorkspace.css';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardCheck,
  Keyboard,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NoticeBanner } from "@/components/ui/NoticeBanner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
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
  type PillTab,
} from "@/components/mobile/MobilePillTabs";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import {
  PdvCartPanel,
  type PdvCartPanelTexts,
} from "@/components/pdv/PdvCartPanel";
import {
  type PdvGridProduct,
} from "@/components/pdv/PdvProductCard";
import { PdvSaleWorkspace } from "@/components/pdv/PdvSaleWorkspace";
import { PdvShortcutHelpDialog } from "@/components/pdv/PdvShortcutHelpDialog";
import { useLocaleFormatters } from "@/lib/format/hooks";
import { getCurrencySymbol } from "@/lib/format";
import { useMediaBreakpoint } from "@/hooks/use-mobile";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useInventoryIdentifiers } from "@/hooks/useInventoryIdentifiers";
import {
  findPdvGridNeighbor,
  isPdvEditableTarget,
  shouldNavigatePdvCatalogFromSearch,
  type PdvGridDirection,
  type PdvGridItemRect,
} from "@/lib/pdv/keyboard";
import type { CartState } from "@/lib/pdv/cart";
import type { Customer } from "@/types/database";
import { toPdvCustomerRecord, type PdvCatalogCustomer } from "@/lib/pdv/catalogCustomer";
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
import { InventoryIdentifierCameraScanner } from "@/components/inventory/identifiers/InventoryIdentifierCameraScanner";

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

export interface EditableLine {
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

/** Conteúdo do atendimento, separado dos rascunhos financeiros de venda. */
export interface PdvPreorderEditorSnapshot {
  customerId: string; stockId: string; targetTerminalId: string;
  notes: string; orderDiscount: string; lines: EditableLine[];
  coupon: PdvCartCoupon | null; dirty: boolean; sourceRevision: number | null;
}

/** Projeta somente o contrato conhecido; o backup local nunca é uma fonte de permissão. */
export function projectPdvPreorderEditorSnapshot(value: unknown): PdvPreorderEditorSnapshot | undefined {
  const record = (input: unknown): input is Record<string, unknown> => Boolean(input) && typeof input === "object" && !Array.isArray(input);
  const nonempty = (input: unknown): input is string => typeof input === "string" && input.length > 0;
  if (!record(value) || !nonempty(value.customerId) || !nonempty(value.stockId) || !nonempty(value.targetTerminalId)
    || typeof value.notes !== "string" || typeof value.orderDiscount !== "string" || typeof value.dirty !== "boolean"
    || !(value.sourceRevision === null || (Number.isSafeInteger(value.sourceRevision) && Number(value.sourceRevision) >= 0))
    || !Array.isArray(value.lines)) return undefined;
  const lines: EditableLine[] = [];
  const ids = new Set<string>();
  for (const line of value.lines) {
    if (!record(line) || !nonempty(line.id) || ids.has(line.id)
      || !(line.inventoryId === null || nonempty(line.inventoryId))
      || typeof line.itemType !== "string" || !["material", "service", "free_item"].includes(line.itemType)
      || typeof line.description !== "string" || typeof line.quantity !== "string"
      || typeof line.unitPrice !== "string" || typeof line.discountAmount !== "string"
      || typeof line.unitFactor !== "number" || !Number.isFinite(line.unitFactor) || line.unitFactor <= 0
      || !Number.isSafeInteger(line.sortOrder) || Number(line.sortOrder) < 0) return undefined;
    ids.add(line.id);
    lines.push({id:line.id, inventoryId:line.inventoryId as string | null,
      itemType:line.itemType as EditableLine["itemType"], description:line.description,
      quantity:line.quantity,unitPrice:line.unitPrice,discountAmount:line.discountAmount,
      unitFactor:line.unitFactor,sortOrder:line.sortOrder as number});
  }
  let coupon: PdvCartCoupon | null = null;
  if (value.coupon !== null) {
    const candidate = value.coupon;
    if (!record(candidate) || !nonempty(candidate.id) || typeof candidate.code !== "string"
      || typeof candidate.baseSignature !== "string" || typeof candidate.eligible !== "boolean"
      || !Number.isSafeInteger(candidate.discountCents) || Number(candidate.discountCents) < 0
      || !(candidate.message === undefined || typeof candidate.message === "string")) return undefined;
    coupon = {id:candidate.id,code:candidate.code,baseSignature:candidate.baseSignature,
      eligible:candidate.eligible,discountCents:candidate.discountCents as number,
      ...(candidate.message !== undefined ? {message:candidate.message as string} : {})};
  }
  return {customerId:value.customerId,stockId:value.stockId,targetTerminalId:value.targetTerminalId,
    notes:value.notes,orderDiscount:value.orderDiscount,lines,coupon,dirty:value.dirty,
    sourceRevision:value.sourceRevision as number | null};
}

interface SavePayload {
  header: PdvPreorderSaveHeader;
  items: PdvPreorderSaveItem[];
}

interface ValuePayload {
  header: Pick<
    PdvPreorderSaveHeader,
    "customer_id" | "notes" | "discount_amount" | "coupon_id" | "coupon_discount_cents"
  >;
  items: Array<{
    id: string;
    unit_price: number | null;
    discount_amount: number;
  }>;
}

interface Props {
  detail: Detail | null;
  editorSnapshot?: PdvPreorderEditorSnapshot;
  onEditorSnapshotChange?: (snapshot: PdvPreorderEditorSnapshot, summary?: {total: number; hasMissingPrices: boolean}) => void;
  workspaceHeader?: ReactNode;
  onCloseOrder?: () => void;
  modePreferenceKey?: string;
  draftId?: string;
  preferredStockId?: string | null;
  inventory: PdvPreorderCatalogItem[];
  customers: PdvCatalogCustomer[];
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
  editorSnapshot, onEditorSnapshotChange, workspaceHeader, onCloseOrder, modePreferenceKey,
  draftId,
  preferredStockId,
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
  const identifiers = useInventoryIdentifiers();
  const isMobileCart = useMediaBreakpoint(801);
  const controlsRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [catalogMode, setCatalogMode] = useState<"quick" | "catalog">("quick");
  const [keyboardHighlight, setKeyboardHighlight] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const preorder = detail?.preorder ?? null;
  const isNew = !preorder && Boolean(draftId);
  const isEditing = isNew || preorder?.status === "edicao";
  const isValuing = preorder?.status === "encaminhado" && canValue;
  const canEditCommercial = isEditing || isValuing;
  const initialRouting = useRef((() => {
    const stockId = isNew && !editorSnapshot && stocks.some(stock => stock.id === preferredStockId) ? preferredStockId! : 'none';
    const matches = stockId === 'none' ? [] : terminals.filter(terminal => terminal.stockId === stockId);
    return {stockId, targetTerminalId: matches.length === 1 ? matches[0].id : 'none'};
  })());
  const [customerId, setCustomerId] = useState<string>(editorSnapshot?.customerId ?? preorder?.customer_id ?? "none");
  const [stockId, setStockId] = useState<string>(editorSnapshot?.stockId ?? preorder?.stock_id ?? initialRouting.current.stockId);
  const [targetTerminalId, setTargetTerminalId] = useState<string>(editorSnapshot?.targetTerminalId ?? preorder?.target_terminal_id ?? initialRouting.current.targetTerminalId);
  const [notes, setNotes] = useState(editorSnapshot?.notes ?? preorder?.notes ?? "");
  const [orderDiscount, setOrderDiscount] = useState(editorSnapshot?.orderDiscount ?? inputNumber((preorder?.discount_amount ?? 0) - (preorder?.coupon_discount_amount_v1 ?? 0)));
  const [lines, setLines] = useState<EditableLine[]>(editorSnapshot?.lines ?? detail?.items.map(lineFromDetail) ?? []);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeProductIndex, setActiveProductIndex] = useState(0);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [destinationNeeded, setDestinationNeeded] = useState(false);
  const destinationRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!notesOpen || !destinationNeeded) return; const frame = window.requestAnimationFrame(() => destinationRef.current?.focus()); return () => window.cancelAnimationFrame(frame); }, [notesOpen, destinationNeeded]);
  const [editingLooseLineId, setEditingLooseLineId] = useState<string | null>(null);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [coupon, setCoupon] = useState<PdvCartCoupon | null>(editorSnapshot ? editorSnapshot.coupon : (preorder?.coupon_id ? { id: preorder.coupon_id, code: preorder.coupon_code_v1 ?? "Aplicado", discountCents: Math.round((preorder.coupon_discount_amount_v1 ?? 0) * 100), eligible: (preorder.coupon_discount_amount_v1 ?? 0) > 0, baseSignature: "__saved__" } : null));
  const [dirty, setDirty] = useState(editorSnapshot?.dirty ?? false);
  const [sourceRevision, setSourceRevision] = useState(editorSnapshot?.sourceRevision ?? preorder?.revision ?? null);
  const mountedIdentity = useRef(preorder?.id ?? draftId);
  const initialSnapshot = useRef(editorSnapshot);
  const acceptServerOnReload = useRef(false);
  const [explicitReloadVersion, setExplicitReloadVersion] = useState(0);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const [saved, setSaved] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<PdvPreorderDomainError | null>(
    null,
  );

  useEffect(() => {
    const identity = preorder?.id ?? draftId;
    // Só edição pendente ou atendimento sem documento preservam a base local;
    // backup limpo acompanha os dados autorizados e a revisão atual do servidor.
    if (!acceptServerOnReload.current && mountedIdentity.current === identity && (dirtyRef.current || (!preorder && initialSnapshot.current))) {
      initialSnapshot.current = undefined;
      return;
    }
    acceptServerOnReload.current = false;
    mountedIdentity.current = identity;
    setSourceRevision(preorder?.revision ?? null);
    setCustomerId(preorder?.customer_id ?? "none");
    setStockId(preorder?.stock_id ?? (!preorder && draftId ? initialRouting.current.stockId : "none"));
    setTargetTerminalId(preorder?.target_terminal_id ?? (!preorder && draftId ? initialRouting.current.targetTerminalId : "none"));
    setNotes(preorder?.notes ?? "");
    setOrderDiscount(inputNumber((preorder?.discount_amount ?? 0) - (preorder?.coupon_discount_amount_v1 ?? 0)));
    setCoupon(preorder?.coupon_id ? { id: preorder.coupon_id, code: preorder.coupon_code_v1 ?? 'Aplicado', discountCents: Math.round((preorder.coupon_discount_amount_v1 ?? 0) * 100), eligible: (preorder.coupon_discount_amount_v1 ?? 0) > 0, baseSignature: '__saved__' } : null);
    setLines(detail?.items.map(lineFromDetail) ?? []);
    setDirty(false);
    setSaved(false);
    setActionError(null);
  }, [detail, draftId, preorder, explicitReloadVersion]);

  const snapshotCallback = useRef(onEditorSnapshotChange);
  snapshotCallback.current = onEditorSnapshotChange;


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

  const gridProducts = useMemo<PdvGridProduct[]>(
    () =>
      filteredInventory.map((item) => ({
        inventoryId: item.id,
        name: item.name,
        sku: item.sku,
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
  const visibleProducts = useMemo(() => catalogMode === "quick" && !catalogQuery.trim() ? gridProducts.slice(0, 4) : gridProducts, [catalogMode, catalogQuery, gridProducts]);
  const keyboardProducts = useMemo(
    () => visibleProducts.filter((product) => product.availableQuantity > 0),
    [visibleProducts],
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
      setKeyboardHighlight(true);
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
    () => { const base: CartState = {
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
    }; return { ...base, coupon: coupon ? { ...coupon, baseSignature: coupon.baseSignature === '__saved__' ? couponCartSignature(base) : coupon.baseSignature } : null }; },
    [coupon, customerId, inventory, lines, orderDiscount, stockId],
  );
  const total = Math.max(0, calculatedSubtotal - cart.discount - confirmedCouponDiscount(cart));
  useEffect(() => {
    snapshotCallback.current?.({customerId, stockId, targetTerminalId, notes, orderDiscount, lines, coupon, dirty, sourceRevision}, {total, hasMissingPrices:missingPrices > 0});
  }, [customerId, stockId, targetTerminalId, notes, orderDiscount, lines, coupon, dirty, sourceRevision, total, missingPrices]);
  const couponItems = useMemo(() => couponBaseItems(cart).map(item => ({ ...item, inventory_id: lines.find(line => line.id === item.id)?.inventoryId ?? null })), [cart, lines]);

  const customerRecords = useMemo<Customer[]>(() => customers.map(toPdvCustomerRecord), [customers]);

  function updateLine(id: string, patch: Partial<EditableLine>) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
    markDirty();
  }

  function addMaterial(selectedMaterialId: string, quantity = 1, unitFactor = 1) {
    if (!isEditing) return;
    const material = inventory.find((item) => item.id === selectedMaterialId);
    if (!material) return;
    setLines((current) => {
      const existing = current.find((line) => line.inventoryId === material.id);
      if (existing) {
        const currentQuantity = parseDecimalInputValue(existing.quantity) ?? 0;
        return current.map((line) => line.id === existing.id
          ? { ...line, quantity: inputNumber(currentQuantity + quantity), unitFactor }
          : line);
      }
      return [
        ...current,
        {
          id: crypto.randomUUID(),
          inventoryId: material.id,
          itemType: "material",
          description: material.name,
          quantity: inputNumber(quantity),
          unitPrice: inputNumber(material.salePrice),
          discountAmount: "0",
          unitFactor,
          sortOrder: current.length,
        },
      ];
    });
    setCatalogQuery("");
    markDirty();
  }

  function addLooseItem(type: "service" | "free_item") {
    const item = newLine(type);
    setLines((current) => [...current, { ...item, sortOrder: current.length }]);
    setEditingLooseLineId(item.id);
    markDirty();
  }

  function removeLine(id: string) {
    if (!isEditing) return;
    setLines((current) => current.filter((line) => line.id !== id));
    markDirty();
  }

  function addGridProduct(product: PdvGridProduct) {
    setKeyboardHighlight(false);
    addMaterial(product.inventoryId);
    setActiveProductIndex(0);
    window.requestAnimationFrame(() => { searchInputRef.current?.focus({ preventScroll: true }); searchInputRef.current?.select(); });
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

  function setCartLineFinalAmount(lineId: string, amount: number, mode: 'price' | 'discount') {
    if (!canEditCommercial) return;
    const adjusted = setLineFinalAmount(cart, lineId, amount, mode);
    const line = adjusted.lines.find((candidate) => candidate.inventoryId === lineId);
    if (!line) return;
    updateLine(lineId, {
      unitPrice: inputNumber(line.unitPrice),
      discountAmount: inputNumber(line.discountAmount),
    });
  }

  function setCartTotalFinalAmount(amount: number, mode: 'price' | 'discount') {
    if (!canEditCommercial) return;
    const adjusted = setCartFinalAmount(cart, amount, mode);
    setOrderDiscount(inputNumber(adjusted.discount));
    markDirty();
  }

  async function handleBarcode(code: string) {
    if (!isEditing) return;
    try {
      const resolved = await identifiers.resolve.mutateAsync({ code });
      const normalized = code.trim().toLocaleLowerCase("pt-BR");
      const fallback = resolved ? null : inventory.find(
        (candidate) =>
          candidate.barcode?.toLocaleLowerCase("pt-BR") === normalized ||
          candidate.sku?.toLocaleLowerCase("pt-BR") === normalized,
      );
      const item = inventory.find((candidate) => candidate.id === resolved?.material.id) ?? fallback;
      setCatalogQuery("");
      if (!item) {
        throw new PdvPreorderDomainError("Código não encontrado no catálogo.", "unknown");
      }
      addMaterial(item.id, resolved?.unitFactor ?? 1, resolved?.unitFactor ?? 1);
    } catch (error) {
      setActionError(
        error instanceof PdvPreorderDomainError
          ? error
          : new PdvPreorderDomainError(error instanceof Error ? error.message : "Código não encontrado no catálogo.", "unknown"),
      );
    }
  }

  useBarcodeScanner({
    shouldCaptureTarget: target => canCapturePdvCatalogScan(target, searchInputRef.current),
    onScan: handleBarcode,
    enabled: isEditing && !busyAction && !notesOpen && !shortcutHelpOpen,
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
    if (event.key === "Enter" && keyboardProducts.length === 0 && catalogQuery.trim()) {
      event.preventDefault();
      void handleBarcode(catalogQuery.trim());
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
    if (missingPrices === 0 && !couponCartReady(cart)) return 'Confira o cupom promocional antes de salvar.';
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
              coupon_id: coupon?.id ?? null, coupon_discount_cents: Math.round(confirmedCouponDiscount(cart) * 100),
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
              coupon_id: coupon?.id ?? null, coupon_discount_cents: Math.round(confirmedCouponDiscount(cart) * 100),
            },
            items,
          }),
    );
    if (result) {
      setSourceRevision(result.revision ?? sourceRevision);
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
      : "Gerar pedido";
  const primaryDisabled =
    Boolean(busyAction) ||
    lines.length === 0 ||
    (missingPrices === 0 && !couponCartReady(cart)) ||
    (!shouldSave && (
      (canForward && dirty) ||
      (canCreateOrder && (dirty || missingPrices > 0))
    ));

  async function runPrimaryAction() {
    if (shouldSave) {
      await submit();
      return;
    }
    if (canForward) {
      if (!preorder?.target_terminal_id) {
        setNotesOpen(true);
        setDestinationNeeded(true);
        return;
      }
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
    draftHint: isNew || dirty
      ? "rascunho neste dispositivo"
      : preorder?.status === "encaminhado" ? "no caixa" : "orçamento salvo na conta",
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
    customerNone: "Orçamento sem cliente",
    customerPlaceholder: "Selecione o cliente",
    customerSearchPlaceholder: "Buscar cliente",
    customerEmpty: "Nenhum cliente encontrado",
    customerCreate: "Criar cliente",
    subtotal: "Subtotal",
    itemDiscounts: "Descontos nos itens",
    discount: "Desconto geral",
    discountPlaceholder: "0,00",
    total: missingPrices > 0 ? "Total pendente" : "Total do orçamento",
    amountDue: "Valor do orçamento",
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
    couponContent: <PdvCouponControl cart={cart} baseItems={couponItems} disabled={!canEditCommercial || missingPrices > 0 || Boolean(busyAction)} onChange={next => { setCoupon(next); if (next?.id !== coupon?.id || next?.discountCents !== coupon?.discountCents) markDirty(); }} />,
    layout: "workspace" as const,
    quantityReadOnly: !isEditing,
    onSetUnitPrice: canValue && canEditCommercial ? (id: string, value: string) => updateLine(id, {unitPrice: value}) : undefined,
    lineUnitPriceValue: (id: string) => lines.find(line => line.id === id)?.unitPrice ?? "",
    onEditLineDescription: isEditing ? (id: string) => { const line = lines.find(item => item.id === id); if (line && line.itemType !== "material") { setEditingLooseLineId(id); setNotesOpen(false); } } : undefined,
    customers: customerRecords,
    formatCurrency: money,
    currencySymbol,
    locale,
    modePreferenceKey,
    onSetDiscountAmount: (amount: number) => {
      setOrderDiscount(inputNumber(amount));
      markDirty();
    },
    onIncrement: incrementCartLine,
    onSetQuantity: setCartQuantity,
    onSetLineDiscount: setCartLineDiscount,
    onSetLineFinalAmount: setCartLineFinalAmount,
    onSetCartFinalAmount: setCartTotalFinalAmount,
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
    allowReadOnlyAdvancedOptions: true,
    canFinalizeOverride: showPrimaryAction && !primaryDisabled,
    finalizeIcon: canForward ? (
      <Send className="h-5 w-5" />
    ) : (
      <ClipboardCheck className="h-5 w-5" />
    ),
    hideFinalizeShortcut: true,
    showFinalizeAction: showPrimaryAction,
    onCloseOrder: onCloseOrder ?? onBack,
    hasOrderContent: dirty,
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


  return (
    <section
      className={cn("pdv-preview-sale flex min-w-0 flex-col gap-4", isMobileCart && "pb-44")}
      aria-label={
        isNew
          ? "Novo orçamento do balcão"
          : `Orçamento do balcão ${preorder?.number}`
      }
      data-testid="pdv-preorder-sale-workspace"
    >

      <AlertDialog open={exitDialogOpen} onOpenChange={setExitDialogOpen}><AlertDialogContent className="pdv-dialog"><AlertDialogHeader><AlertDialogTitle>Sair sem salvar as alterações?</AlertDialogTitle><AlertDialogDescription>As alterações deste atendimento ainda não foram salvas na conta.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Continuar editando</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => { setExitDialogOpen(false); onBack?.(); }}>Sair sem salvar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent className="pdv-dialog">
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
                onClick={() => { acceptServerOnReload.current = true; setExplicitReloadVersion(version => version + 1); onReload(); }}
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

      <PdvSaleWorkspace
        hardwareContextKey={JSON.stringify([preorder?.id, draftId, stockId, targetTerminalId])}
        hardwareBlocked={exitDialogOpen || notesOpen || identifiers.resolve.isPending}
        header={workspaceHeader}
        catalog={{ title: isNew ? "Criar orçamento" : `Orçamento #${preorder?.number}`,
          mode: catalogMode, onModeChange: setCatalogMode, search: catalogQuery,
          onSearchChange: value => { setCatalogQuery(value); setActiveProductIndex(0); },
          onSearchKeyDown: handleSearchKeyDown, searchInputRef, gridRef, controlsRef, rowRef,
          onGridKeyDown: handleGridKeyDown, products: visibleProducts,
          disabled: Boolean(busyAction) || !isEditing, activeProductId, keyboardHighlight,
          onProductFocus: id => { const index = keyboardProducts.findIndex(product => product.inventoryId === id); if (index >= 0) setActiveProductIndex(index); setKeyboardHighlight(true); },
          onProductSelect: addGridProduct, formatCurrency: money, exitLabel: "Sair do orçamento",
          footerHint: "↑ ↓ ← → navegar · Enter incluir · / buscar · F9 salvar",
          onExit: () => dirty ? setExitDialogOpen(true) : onBack?.(),
          camera: <InventoryIdentifierCameraScanner triggerVariant="icon" onScan={code => void handleBarcode(code)} disabled={!isEditing || Boolean(busyAction) || identifiers.resolve.isPending} />,
          filters: <>{categoryTabs.map(tab => <button type="button" key={tab.value} className={'chip ' + (activeCategory === tab.value ? 'active' : '')} onClick={() => setActiveCategory(tab.value)}>{tab.label}</button>)}</>,
        }}
        cart={cartPanelProps} mobile={isMobileCart} drawerOpen={cartDrawerOpen}
        onDrawerOpenChange={setCartDrawerOpen} itemCount={cart.lines.length}
        itemCountLabel={cart.lines.length === 1 ? "1 item" : `${cart.lines.length} itens`}
        formattedTotal={missingPrices > 0 ? "Valor pendente" : money(total)} drawerTitle="Orçamento do balcão"
      />

      <ResponsiveModal drawerClassName="pdv-dialog" className="pdv-dialog"
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
          <div className="flex items-center justify-between gap-2"><span className="font-semibold">Orçamento</span>        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 border-0 bg-transparent shadow-none hover:bg-transparent"
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
</div>
          <div className="space-y-2"><Label htmlFor="preorder-stock">Local de estoque</Label><Select value={stockId} disabled={!isEditing} onValueChange={value => {setStockId(value); setTargetTerminalId("none"); markDirty();}}><SelectTrigger id="preorder-stock"><SelectValue placeholder="Escolher estoque" /></SelectTrigger><SelectContent><SelectItem value="none">Escolher estoque</SelectItem>{stocks.map(stock => <SelectItem key={stock.id} value={stock.id}>{stock.name}</SelectItem>)}</SelectContent></Select></div>
          {destinationNeeded && <NoticeBanner variant="warning">Escolha o caixa de destino e salve o orçamento antes de enviar.</NoticeBanner>}
          <div className="space-y-2"><Label htmlFor="preorder-target-terminal">Caixa de destino</Label><Select value={targetTerminalId} disabled={!isEditing} onValueChange={value => {setTargetTerminalId(value); markDirty();}}><SelectTrigger id="preorder-target-terminal" ref={destinationRef}><SelectValue placeholder="Escolher caixa de destino" /></SelectTrigger><SelectContent><SelectItem value="none">Escolher caixa de destino</SelectItem>{terminals.filter(terminal => terminal.stockId === stockId).map(terminal => <SelectItem key={terminal.id} value={terminal.id}>{terminal.name}</SelectItem>)}</SelectContent></Select></div>
          {isEditing && <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => {addLooseItem("service"); setNotesOpen(false);}}><Plus className="h-4 w-4" />Serviço</Button><Button type="button" variant="outline" onClick={() => {addLooseItem("free_item"); setNotesOpen(false);}}><Plus className="h-4 w-4" />Item livre</Button></div>}
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

      <ResponsiveModal open={Boolean(editingLooseLineId)} onOpenChange={open => {if (!open) setEditingLooseLineId(null);}} title="Editar item" footer={<Button onClick={() => setEditingLooseLineId(null)}>Concluir</Button>}><Label htmlFor="preorder-item-description">Descrição</Label><Input id="preorder-item-description" value={lines.find(line => line.id === editingLooseLineId)?.description ?? ""} onChange={event => {if (editingLooseLineId) updateLine(editingLooseLineId, {description: event.target.value});}} /></ResponsiveModal>
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
