import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  Banknote,
  Barcode,
  Check,
  ChevronRight,
  CreditCard,
  DollarSign,
  Eye,
  Minus,
  Moon,
  Paperclip,
  Plus,
  Scale,
  Search,
  Settings2,
  ShoppingCart,
  Store,
  Sun,
  TrendingDown,
  TrendingUp,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { ImagePreviewModal } from "@/components/ui/ImagePreviewModal";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SignedImg } from "@/components/ui/SignedImg";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/PageHeader";
import { PdvCartItemsTable } from "@/components/pdv/PdvCartItemsTable";
import { PdvCartPanel } from "@/components/pdv/PdvCartPanel";
import { PdvCartSummary } from "@/components/pdv/PdvCartSummary";
import {
  PdvProductCard,
  type PdvGridProduct,
} from "@/components/pdv/PdvProductCard";
import { PdvQuantityStepper } from "@/components/pdv/PdvQuantityStepper";
import { PdvPaymentDialog } from "@/components/pdv/PdvPaymentDialog";
import { PdvCashHistoryPanel } from "@/components/pdv/caixa/PdvCashHistoryPanel";
import { PdvCashIndicators } from "@/components/pdv/caixa/PdvCashIndicators";
import { PdvCashSummaryCards } from "@/components/pdv/caixa/PdvCashSummaryCards";
import { useMediaBreakpoint } from "@/hooks/use-mobile";
import {
  addItem,
  computeSubtotal,
  incrementLineQuantity,
  removeItem,
  setCartCustomer,
  setDiscount,
  setLineQuantity,
  type CartState,
} from "@/lib/pdv/cart";
import type { PdvLedgerEntry, SessionResult } from "@/lib/pdv/cash";
import { MESSAGES } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";
import type { Customer } from "@/types/database";

type ReviewScreen = "sale" | "cash";
type ReviewSize = "desktop" | "tablet" | "mobile";
type ReviewVersion = "current" | "proposal";
type ReviewTheme = "light" | "dark";
type DiscountMode = "value" | "percentage";
type DiscountDefinition = { mode: DiscountMode; value: number };
type LineDiscounts = Record<string, DiscountDefinition>;
type PreviewAttachment = { id: string; file: File; progress: number };

const FRAME_SIZE: Record<
  ReviewSize,
  { width: number; height: number; label: string }
> = {
  desktop: { width: 1180, height: 820, label: "Desktop · 1180 px" },
  tablet: { width: 820, height: 980, label: "Tablet · 820 px" },
  mobile: { width: 390, height: 1040, label: "Celular · 390 px" },
};

const products: PdvGridProduct[] = [
  {
    inventoryId: "capacitor-35",
    name: "Capacitor permanente 35µF 440V",
    imageUrl: "/images/capacitores/capacitor.png",
    unitPrice: 48.9,
    availableQuantity: 18,
  },
  {
    inventoryId: "contatora-25",
    name: "Contatora tripolar 25A 220V",
    imageUrl: "/images/contatora.png",
    unitPrice: 89.9,
    availableQuantity: 7,
  },
  {
    inventoryId: "controle-gree",
    name: "Controle remoto universal Gree",
    imageUrl: "/images/gree.png",
    unitPrice: 59.9,
    availableQuantity: 12,
  },
  {
    inventoryId: "cobre-14",
    name: "Tubo de cobre flexível 1/4 — metro",
    imageUrl: null,
    unitPrice: 36.5,
    availableQuantity: 32,
  },
  {
    inventoryId: "gas-r410",
    name: "Fluido refrigerante R410A — recarga",
    imageUrl: null,
    unitPrice: 145,
    availableQuantity: 9,
  },
  {
    inventoryId: "sensor-10k",
    name: "Sensor de temperatura 10K",
    imageUrl: null,
    unitPrice: 24.9,
    availableQuantity: 0,
  },
];

type CatalogGroupId =
  "electrical" | "refrigeration" | "controls" | "consumables";

type CatalogGroup = {
  id: CatalogGroupId;
  label: string;
  filterLabel: string;
  productIds: string[];
};

const catalogGroups: CatalogGroup[] = [
  {
    id: "electrical",
    label: "Componentes elétricos",
    filterLabel: "Elétrica",
    productIds: ["capacitor-35", "contatora-25"],
  },
  {
    id: "refrigeration",
    label: "Refrigeração e instalação",
    filterLabel: "Refrigeração",
    productIds: ["cobre-14", "sensor-10k"],
  },
  {
    id: "controls",
    label: "Controles e automação",
    filterLabel: "Controles",
    productIds: ["controle-gree"],
  },
  {
    id: "consumables",
    label: "Fluidos e consumíveis",
    filterLabel: "Consumíveis",
    productIds: ["gas-r410"],
  },
];

const initialCart: CartState = {
  customerId: "customer-1",
  discount: 10,
  lines: [
    { ...products[0], unitCost: 22, quantity: 2 },
    { ...products[1], unitCost: 49, quantity: 1 },
    { ...products[2], unitCost: 28, quantity: 1 },
  ],
};

const customers: Customer[] = [
  {
    id: "customer-1",
    customer_type: "pf",
    name: "Cliente balcão",
    celular: "(11) 99999-0000",
    is_store_customer: true,
    created_at: "2026-10-19T09:00:00.000Z",
    updated_at: "2026-10-19T09:00:00.000Z",
  },
];

const ledger: PdvLedgerEntry[] = [
  {
    key: "sale-1842",
    id: "sale-1842",
    kind: "venda",
    reference: "#1842",
    label: "Venda no balcão",
    customerName: "Cliente balcão",
    amount: 237.6,
    signedAmount: 237.6,
    methods: ["pix"],
    occurredAt: "2026-10-19T14:32:00.000Z",
    detail: {
      items: [
        {
          description: products[0].name,
          quantity: 2,
          unitPrice: 48.9,
          total: 97.8,
        },
        {
          description: products[1].name,
          quantity: 1,
          unitPrice: 89.9,
          total: 89.9,
        },
        {
          description: products[2].name,
          quantity: 1,
          unitPrice: 59.9,
          total: 59.9,
        },
      ],
      payments: [
        {
          method: "pix",
          amount: 237.6,
          changeAmount: 0,
          accountName: "Banco principal",
        },
      ],
    },
  },
  {
    key: "sale-1841",
    id: "sale-1841",
    kind: "venda",
    reference: "#1841",
    label: "Venda no balcão",
    customerName: null,
    amount: 145,
    signedAmount: 145,
    methods: ["dinheiro"],
    occurredAt: "2026-10-19T13:48:00.000Z",
    detail: {},
  },
  {
    key: "expense-1",
    id: "expense-1",
    kind: "despesa",
    reference: "",
    label: "Material de limpeza",
    customerName: null,
    amount: 42.5,
    signedAmount: -42.5,
    methods: ["dinheiro"],
    occurredAt: "2026-10-19T12:16:00.000Z",
    detail: { category: "Despesas da loja", accountName: "Cofre da loja" },
  },
  {
    key: "bleed-1",
    id: "bleed-1",
    kind: "sangria",
    reference: "",
    label: "Sangria para depósito",
    customerName: null,
    amount: 300,
    signedAmount: -300,
    methods: ["dinheiro"],
    occurredAt: "2026-10-19T11:05:00.000Z",
    detail: {
      fromAccountName: "Gaveta do caixa",
      toAccountName: "Banco principal",
    },
  },
];

const cashResult: SessionResult = {
  sold: 1784.3,
  cmv: 746.8,
  grossMargin: 1037.5,
  revenues: 120,
  expenses: 92.5,
  profit: 1065,
  marginPct: 58.1,
  itemsWithoutCost: 0,
};

const t = MESSAGES["pt-br"].app.pdv;
const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );
const number = (value: number, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat("pt-BR", options).format(value);
const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));

const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();

const parsePtBrNumber = (value: string) =>
  Number(value.replace(/\s/g, "").replace(/\./g, "").replace(",", "."));

const formatEditableNumber = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);

const currencySymbol =
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .formatToParts(0)
    .find((part) => part.type === "currency")?.value ?? "BRL";

const getDiscountAmount = (
  baseAmount: number,
  discount?: DiscountDefinition | null,
) => {
  if (!discount) return 0;
  const amount =
    discount.mode === "percentage"
      ? (baseAmount * discount.value) / 100
      : discount.value;
  return Math.min(baseAmount, Math.max(0, amount));
};

/**
 * Laboratório visual do PDV. Tudo nesta rota é local e ilustrativo; a rota só
 * é registrada em `import.meta.env.DEV`, portanto não vira superfície pública.
 */
export default function PdvUiReview() {
  useEffect(() => {
    document.documentElement.dataset.app = "";
    return () => {
      delete document.documentElement.dataset.app;
    };
  }, []);

  if (window.location.pathname.endsWith("/frame")) return <ReviewFrame />;
  return <ReviewLab />;
}

function usePreviewTheme(theme: ReviewTheme) {
  useEffect(() => {
    const root = document.documentElement;
    const hadDarkTheme = root.classList.contains("dark");
    const previousColorScheme = root.style.colorScheme;

    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;

    return () => {
      root.classList.toggle("dark", hadDarkTheme);
      root.style.colorScheme = previousColorScheme;
    };
  }, [theme]);
}

function ReviewLab() {
  const [screen, setScreen] = useState<ReviewScreen>("sale");
  const [size, setSize] = useState<ReviewSize>("desktop");
  const [theme, setTheme] = useState<ReviewTheme>("light");
  const frame = FRAME_SIZE[size];
  usePreviewTheme(theme);

  return (
    <main
      className={cn(
        "min-h-screen bg-muted/40 text-foreground",
        theme === "dark" && "dark",
      )}
    >
      <div className="sticky top-0 z-20 border-b bg-background/95 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[2520px] flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Store className="h-4 w-4" />
              Laboratório local · dados ilustrativos
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Revisão visual do PDV / Caixa
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Mesmo conteúdo operacional, duas hierarquias. O quadro atual
              reutiliza os componentes em produção; a proposta reorganiza o
              fluxo sem alterar regras financeiras.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              value={screen}
              onChange={(value) => setScreen(value as ReviewScreen)}
              items={[
                { value: "sale", label: "Venda" },
                { value: "cash", label: "Caixa" },
              ]}
            />
            <SegmentedControl
              value={size}
              onChange={(value) => setSize(value as ReviewSize)}
              items={Object.entries(FRAME_SIZE).map(([value, config]) => ({
                value,
                label: config.label,
              }))}
            />
            <Button
              type="button"
              variant="outline"
              className="min-w-28 justify-center gap-2 bg-background"
              onClick={() =>
                setTheme((current) =>
                  current === "light" ? "dark" : "light",
                )
              }
              aria-label={`Ativar tema ${theme === "light" ? "escuro" : "claro"}`}
            >
              {theme === "light" ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
              {theme === "light" ? "Tema escuro" : "Tema claro"}
            </Button>
          </div>
        </div>
      </div>

      <section className="overflow-x-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex w-max min-w-full items-start justify-center gap-5">
          <ComparisonFrame
            label="Antes"
            description="Composição atual em produção"
            tone="current"
            screen={screen}
            version="current"
            size={size}
            theme={theme}
            width={frame.width}
            height={frame.height}
          />
          <ComparisonFrame
            label="Depois"
            description="Direção proposta para validação"
            tone="proposal"
            screen={screen}
            version="proposal"
            size={size}
            theme={theme}
            width={frame.width}
            height={frame.height}
          />
        </div>
      </section>
    </main>
  );
}

function SegmentedControl({
  items,
  value,
  onChange,
}: {
  items: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex max-w-full overflow-x-auto rounded-md border bg-muted p-1">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={cn(
            "shrink-0 rounded px-3 py-2 text-xs font-semibold transition-colors",
            value === item.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function ComparisonFrame({
  label,
  description,
  tone,
  screen,
  version,
  size,
  theme,
  width,
  height,
}: {
  label: string;
  description: string;
  tone: ReviewVersion;
  screen: ReviewScreen;
  version: ReviewVersion;
  size: ReviewSize;
  theme: ReviewTheme;
  width: number;
  height: number;
}) {
  const query = new URLSearchParams({ screen, version, theme });
  return (
    <article style={{ width }} className="shrink-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant={tone === "proposal" ? "default" : "secondary"}>
            {label}
          </Badge>
          <span className="text-sm font-semibold">{description}</span>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {FRAME_SIZE[size].label}
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <iframe
          key={`${screen}-${version}-${size}-${theme}`}
          title={`${label}: ${screen}`}
          src={`/__dev/pdv-ui-review/frame?${query.toString()}`}
          style={{ width, height }}
          className="block border-0 bg-background"
        />
      </div>
    </article>
  );
}

function ReviewFrame() {
  const params = new URLSearchParams(window.location.search);
  const screen = params.get("screen") === "cash" ? "cash" : "sale";
  const version = params.get("version") === "proposal" ? "proposal" : "current";
  const theme = params.get("theme") === "dark" ? "dark" : "light";
  const locksSaleToViewport = screen === "sale" && version === "proposal";
  usePreviewTheme(theme);
  return (
    <div
      className={cn(
        "bg-background p-4 text-foreground sm:p-5",
        theme === "dark" && "dark",
        locksSaleToViewport ? "h-screen overflow-hidden" : "min-h-screen",
      )}
    >
      {screen === "sale" ? (
        version === "current" ? (
          <CurrentSale />
        ) : (
          <ProposedSale />
        )
      ) : version === "current" ? (
        <CurrentCash />
      ) : (
        <ProposedCash />
      )}
    </div>
  );
}

function usePreviewCart() {
  const [cart, setCart] = useState<CartState>(initialCart);
  const [notes, setNotes] = useState("Entregar controle já com pilhas.");
  const [discountDisplay, setDiscountDisplay] = useState("10,00");
  const [orderDiscount, setOrderDiscount] = useState<DiscountDefinition | null>(
    {
      mode: "value",
      value: initialCart.discount,
    },
  );
  const [lineDiscounts, setLineDiscounts] = useState<LineDiscounts>({});

  return {
    cart,
    orderDiscount,
    lineDiscounts,
    notes,
    discountDisplay,
    setNotes,
    addProduct: (product: PdvGridProduct) => {
      setCart((current) => addItem(current, product).cart);
    },
    increment: (id: string, delta: number) =>
      setCart((current) => incrementLineQuantity(current, id, delta)),
    setQuantity: (id: string, quantity: number) =>
      setCart((current) => setLineQuantity(current, id, quantity)),
    remove: (id: string) => {
      setCart((current) => removeItem(current, id));
      setLineDiscounts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    },
    clear: () => {
      setCart({ ...initialCart, lines: [], discount: 0 });
      setOrderDiscount(null);
      setLineDiscounts({});
    },
    setCustomer: (id: string | null) =>
      setCart((current) => setCartCustomer(current, id)),
    changeDiscount: (raw: string) => {
      setDiscountDisplay(raw);
      const parsed = Number(raw.replace(/\./g, "").replace(",", ".")) || 0;
      setOrderDiscount(parsed > 0 ? { mode: "value", value: parsed } : null);
      setCart((current) => setDiscount(current, parsed));
    },
    setOrderDiscount: (
      discount: DiscountDefinition | null,
      baseAmount: number,
    ) => {
      const amount = getDiscountAmount(baseAmount, discount);
      setOrderDiscount(discount && discount.value > 0 ? discount : null);
      setDiscountDisplay(formatEditableNumber(amount));
      setCart((current) => setDiscount(current, amount));
    },
    setLineDiscount: (id: string, discount: DiscountDefinition | null) => {
      setLineDiscounts((current) => {
        if (!discount || discount.value <= 0) {
          const next = { ...current };
          delete next[id];
          return next;
        }
        return { ...current, [id]: discount };
      });
    },
  };
}

function ProductSearch() {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          defaultValue=""
          placeholder="Buscar produto ou escanear código de barras"
          className="pl-9"
        />
      </div>
      <Button type="button" variant="outline" className="justify-start sm:w-48">
        <Store className="h-4 w-4" /> Loja principal
      </Button>
    </div>
  );
}

function CategoryTabs({
  quiet = false,
  value,
  onChange,
}: {
  quiet?: boolean;
  value?: "all" | CatalogGroupId;
  onChange?: (value: "all" | CatalogGroupId) => void;
}) {
  const options: Array<{ value: "all" | CatalogGroupId; label: string }> = [
    { value: "all", label: "Todos" },
    ...catalogGroups.map((group) => ({
      value: group.id,
      label: group.filterLabel,
    })),
  ];

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {options.map((option, index) => {
        const selected = value ? value === option.value : index === 0;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange?.(option.value)}
            className={cn(
              "shrink-0 px-3 py-1.5 text-xs font-semibold transition-colors",
              quiet ? "rounded border" : "rounded-full",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ProductGrid({
  onSelect,
  compact = false,
  squareImages = false,
  cutoutImages = false,
  items = products,
}: {
  onSelect: (product: PdvGridProduct) => void;
  compact?: boolean;
  squareImages?: boolean;
  cutoutImages?: boolean;
  items?: PdvGridProduct[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((product) => (
        <PdvProductCard
          key={product.inventoryId}
          product={product}
          formatCurrency={money}
          outOfStockLabel="Sem estoque"
          availableLabel="{count} em estoque"
          noPhotoLabel="Sem foto"
          compact={compact}
          imageAspect={squareImages ? "square" : "landscape"}
          imageBackdrop={cutoutImages ? "cutout" : "blur"}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function ProductCatalogSections({
  groups,
  onSelect,
}: {
  groups: Array<CatalogGroup & { items: PdvGridProduct[] }>;
  onSelect: (product: PdvGridProduct) => void;
}) {
  return (
    <div className="space-y-5 pb-2">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`catalog-section-${group.id}`}>
          <div className="mb-2 flex items-center gap-2.5">
            <h3
              id={`catalog-section-${group.id}`}
              className="shrink-0 text-sm font-bold text-foreground"
            >
              {group.label}
            </h3>
            <div className="h-px min-w-4 flex-1 bg-border" aria-hidden="true" />
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
              {group.items.length}{" "}
              {group.items.length === 1 ? "produto" : "produtos"}
            </span>
          </div>
          <ProductGrid
            items={group.items}
            onSelect={onSelect}
            compact
            squareImages
            cutoutImages
          />
        </section>
      ))}
    </div>
  );
}

function CurrentSale() {
  const isMobile = useMediaBreakpoint(768);
  const cartState = usePreviewCart();
  const texts = {
    title: t.cashier.cart.title,
    itemsCount: t.cashier.cart.itemsCount,
    empty: t.cashier.cart.empty,
    emptyHint: t.cashier.cart.emptyHint,
    subtotal: t.cashier.cart.subtotal,
    discount: t.cashier.cart.discount,
    discountPlaceholder: t.cashier.cart.discountPlaceholder,
    total: t.cashier.cart.total,
    customerLabel: t.cashier.cart.customerLabel,
    customerPlaceholder: t.cashier.cart.customerPlaceholder,
    removeLine: t.cashier.cart.removeLine,
    clearCart: t.cashier.cart.clearCart,
    noPhoto: t.cashier.stock.noPhoto,
    quantityEditLabel: t.cashier.cart.quantityEditLabel,
    paymentLabel: t.cashier.actions.payment,
    paymentShortcut: t.cashier.actions.paymentShortcut,
    finalizeLabel: t.cashier.actions.finalize,
    finalizeShortcut: t.cashier.actions.finalizeShortcut,
    cashClosedTitle: t.cashier.cashClosedNotice.title,
    cashClosedDescription: t.cashier.cashClosedNotice.description,
    cashClosedAction: t.cashier.cashClosedNotice.action,
    notesLabel: t.cashier.cart.notesLabel,
    notesPlaceholder: t.cashier.cart.notesPlaceholder,
    advancedOptionsTrigger: t.cashier.advancedOptions.trigger,
  };
  const shared = {
    cart: cartState.cart,
    customers,
    formatCurrency: money,
    discountDisplay: cartState.discountDisplay,
    onDiscountChange: cartState.changeDiscount,
    onDiscountPaste: () => undefined,
    onCustomerChange: cartState.setCustomer,
    onRequestPayment: () => undefined,
    cashClosed: false,
    onGoToCashPanel: () => undefined,
    notes: cartState.notes,
    onNotesChange: cartState.setNotes,
    onOpenAdvancedOptions: () => undefined,
    advancedOptionsActive: false,
    texts,
  };

  return (
    <div className="flex min-h-[760px] flex-col gap-4">
      <button
        type="button"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para o caixa
      </button>
      <PageHeader
        title="Nova venda"
        subtitle="Monte o carrinho e finalize a venda de balcão"
        icon={ShoppingCart}
      />
      <ProductSearch />
      <CategoryTabs />

      {isMobile ? (
        <div className="space-y-3">
          <ProductGrid onSelect={cartState.addProduct} compact />
          <Card>
            <CardContent className="h-[610px] p-0">
              <PdvCartPanel
                {...shared}
                onIncrement={cartState.increment}
                onSetQuantity={cartState.setQuantity}
                onRemove={cartState.remove}
                onRequestClearCart={cartState.clear}
              />
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_20rem] gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-h-0 flex-col gap-3">
            <div className="min-h-[240px] flex-1 overflow-y-auto pr-1">
              <ProductGrid onSelect={cartState.addProduct} />
            </div>
            <PdvCartItemsTable
              cart={cartState.cart}
              formatCurrency={money}
              onIncrement={cartState.increment}
              onSetQuantity={cartState.setQuantity}
              onRemove={cartState.remove}
              onRequestClearCart={cartState.clear}
              texts={{
                title: texts.title,
                itemsCount: texts.itemsCount,
                empty: texts.empty,
                emptyHint: texts.emptyHint,
                removeLine: texts.removeLine,
                clearCart: texts.clearCart,
                noPhoto: texts.noPhoto,
                columnProduct: t.cashier.cart.columnProduct,
                columnQuantity: t.cashier.cart.columnQuantity,
                quantityEditLabel: texts.quantityEditLabel,
                columnUnitPrice: t.cashier.cart.columnUnitPrice,
                columnLineTotal: t.cashier.cart.columnLineTotal,
              }}
              className="h-[250px] shrink-0"
            />
          </div>
          <Card className="min-h-0">
            <CardContent className="h-full overflow-y-auto p-0">
              <PdvCartSummary {...shared} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function ProposedSale() {
  const cartState = usePreviewCart();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const subtotal = computeSubtotal(cartState.cart);
  const itemDiscountTotal = cartState.cart.lines.reduce((sum, line) => {
    const lineSubtotal = line.unitPrice * line.quantity;
    return (
      sum +
      getDiscountAmount(lineSubtotal, cartState.lineDiscounts[line.inventoryId])
    );
  }, 0);
  const subtotalAfterItems = Math.max(0, subtotal - itemDiscountTotal);
  const orderDiscountAmount = getDiscountAmount(
    subtotalAfterItems,
    cartState.orderDiscount,
  );
  const total = Math.max(0, subtotalAfterItems - orderDiscountAmount);
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState<"all" | CatalogGroupId>("all");
  const visibleGroups = useMemo(() => {
    const term = normalizeSearch(search);
    return catalogGroups
      .filter((group) => activeGroup === "all" || group.id === activeGroup)
      .map((group) => ({
        ...group,
        items: products.filter((product) => {
          if (!group.productIds.includes(product.inventoryId)) return false;
          if (!term) return true;
          return normalizeSearch(
            `${product.name} ${product.inventoryId} ${group.label} ${group.filterLabel}`,
          ).includes(term);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [activeGroup, search]);
  const filteredProducts = useMemo(
    () => visibleGroups.flatMap((group) => group.items),
    [visibleGroups],
  );

  const handleSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Escape") {
      setSearch("");
      return;
    }
    if (event.key !== "Enter" || filteredProducts.length !== 1) return;
    const product = filteredProducts[0];
    if (product.availableQuantity <= 0) return;
    event.preventDefault();
    cartState.addProduct(product);
    setSearch("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <header className="flex items-center border-b pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Voltar ao caixa"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">
              Nova venda
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 font-semibold text-success">
                <span className="h-2 w-2 rounded-full bg-success" /> Caixa
                aberto
              </span>
              <span>Caixa 01</span>
              <span className="inline-flex items-center gap-1.5">
                <Avatar className="h-5 w-5 ring-1 ring-border">
                  <AvatarImage
                    src="/images/dominex-author-avatar.jpg"
                    alt="Foto de perfil de Kaik"
                    className="object-cover"
                  />
                  <AvatarFallback className="bg-primary text-[8px] font-bold text-primary-foreground">
                    KB
                  </AvatarFallback>
                </Avatar>
                Operador: Kaik
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain pr-1 md:grid-cols-[minmax(0,1fr)_22rem] md:overflow-hidden md:pr-0 lg:grid-cols-[minmax(0,1fr)_25rem]">
        <section className="flex min-w-0 flex-col gap-3 md:min-h-0">
          <div className="rounded-lg border bg-card p-3">
            <div className="relative">
              <Barcode className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-foreground" />
              <Input
                autoFocus
                placeholder="Escaneie ou busque produto, código e categoria"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="h-12 border-foreground/20 pl-11 pr-20 text-base"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-11 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Limpar busca"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                F2
              </kbd>
            </div>
            <div className="mt-3">
              <CategoryTabs
                quiet
                value={activeGroup}
                onChange={setActiveGroup}
              />
            </div>
          </div>

          <div className="min-w-0 md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:pr-1">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Catálogo
              </h2>
              {search && (
                <span className="text-xs text-muted-foreground">
                  {filteredProducts.length}{" "}
                  {filteredProducts.length === 1
                    ? "produto encontrado"
                    : "produtos encontrados"}
                </span>
              )}
            </div>
            {visibleGroups.length > 0 ? (
              <ProductCatalogSections
                groups={visibleGroups}
                onSelect={cartState.addProduct}
              />
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center">
                <Search className="mb-3 h-7 w-7 text-muted-foreground" />
                <p className="font-semibold">Nenhum produto encontrado</p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Tente outro nome, código, categoria ou grupo do estoque.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setSearch("");
                    setActiveGroup("all");
                  }}
                >
                  Limpar busca e filtros
                </Button>
              </div>
            )}
          </div>
        </section>

        <ProposedOrderPanel
          cart={cartState.cart}
          onIncrement={cartState.increment}
          onSetQuantity={cartState.setQuantity}
          onRemove={cartState.remove}
          onClear={cartState.clear}
          orderDiscountDefinition={cartState.orderDiscount}
          onDiscountChange={cartState.setOrderDiscount}
          lineDiscounts={cartState.lineDiscounts}
          onLineDiscountChange={cartState.setLineDiscount}
          itemDiscountTotal={itemDiscountTotal}
          orderDiscount={orderDiscountAmount}
          total={total}
          onOpenDetails={() => setDetailsOpen(true)}
          onOpenPayment={() => setPaymentOpen(true)}
        />
      </div>

      <PreviewOrderDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        notes={cartState.notes}
        onNotesChange={cartState.setNotes}
      />

      <PdvPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        texts={t.cashier.payment}
        total={total}
        itemCount={cartState.cart.lines.length}
        customerName="Cliente balcão"
        customerCredit={{ creditLimit: 1000, debt: 120 }}
        accounts={[{ id: "account-preview", name: "Conta principal" }]}
        hasOpenCashSession
        hasCofreAccount
        onGoToCashPanel={() => setPaymentOpen(false)}
        onConfirm={async () => setPaymentOpen(false)}
      />
    </div>
  );
}

function ProposedOrderPanel({
  cart,
  total,
  onIncrement,
  onSetQuantity,
  onRemove,
  onClear,
  orderDiscountDefinition,
  onDiscountChange,
  lineDiscounts,
  onLineDiscountChange,
  itemDiscountTotal,
  orderDiscount,
  onOpenDetails,
  onOpenPayment,
}: {
  cart: CartState;
  total: number;
  onIncrement: (id: string, delta: number) => void;
  onSetQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  orderDiscountDefinition: DiscountDefinition | null;
  onDiscountChange: (
    discount: DiscountDefinition | null,
    baseAmount: number,
  ) => void;
  lineDiscounts: LineDiscounts;
  onLineDiscountChange: (
    id: string,
    discount: DiscountDefinition | null,
  ) => void;
  itemDiscountTotal: number;
  orderDiscount: number;
  onOpenDetails: () => void;
  onOpenPayment: () => void;
}) {
  const count = cart.lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = computeSubtotal(cart);
  const subtotalAfterItems = Math.max(0, subtotal - itemDiscountTotal);
  const itemsViewportRef = useRef<HTMLDivElement>(null);
  const [showBottomFade, setShowBottomFade] = useState(false);
  const [editingLineDiscount, setEditingLineDiscount] = useState<string | null>(
    null,
  );
  const [selectedImage, setSelectedImage] = useState<{
    src: string;
    alt: string;
  } | null>(null);

  const updateBottomFade = () => {
    const viewport = itemsViewportRef.current;
    if (!viewport) return;
    const hasMoreBelow =
      viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 2;
    setShowBottomFade(hasMoreBelow);
  };

  useEffect(() => {
    const viewport = itemsViewportRef.current;
    if (!viewport) return;
    const frame = window.requestAnimationFrame(updateBottomFade);
    const observer = new ResizeObserver(updateBottomFade);
    observer.observe(viewport);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // A quantidade de linhas altera o overflow; quantidade por linha não altera a altura.
  }, [cart.lines.length]);

  return (
    <>
      <Card className="self-start overflow-hidden border-foreground/15 shadow-none md:max-h-full md:overflow-y-auto md:overscroll-contain">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-bold">Pedido atual</h2>
            <p className="text-xs text-muted-foreground">
              {count} itens · venda ainda não finalizada
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="destructive-ghost"
                size="sm"
                disabled={cart.lines.length === 0}
                className="focus-visible:bg-destructive focus-visible:text-destructive-foreground"
              >
                Limpar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpar o pedido atual?</AlertDialogTitle>
                <AlertDialogDescription>
                  Todos os {count} itens serão removidos. Essa ação não pode ser
                  desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Manter pedido</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onClear}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Sim, limpar pedido
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="relative border-b">
          <div
            ref={itemsViewportRef}
            onScroll={updateBottomFade}
            className="h-72 divide-y overflow-y-auto px-4 pb-8"
          >
            {cart.lines.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <ShoppingCart className="mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-semibold">Pedido vazio</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Selecione um produto no catálogo para começar.
                </p>
              </div>
            ) : (
              cart.lines.map((line) => {
                const lineSubtotal = line.unitPrice * line.quantity;
                const lineDiscount = lineDiscounts[line.inventoryId] ?? null;
                const lineDiscountAmount = getDiscountAmount(
                  lineSubtotal,
                  lineDiscount,
                );
                const lineTotal = Math.max(
                  0,
                  lineSubtotal - lineDiscountAmount,
                );

                return (
                  <div key={line.inventoryId} className="flex gap-3 py-3">
                    {line.imageUrl ? (
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedImage({
                            src: line.imageUrl!,
                            alt: line.name,
                          })
                        }
                        className="relative h-12 w-12 shrink-0 cursor-zoom-in overflow-hidden rounded-md bg-muted/50 ring-offset-background transition-shadow hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label={`Ampliar foto de ${line.name}`}
                      >
                        <SignedImg
                          src={line.imageUrl}
                          alt=""
                          className="absolute inset-0 h-full w-full object-contain"
                        />
                      </button>
                    ) : (
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted/50">
                        <SignedImg
                          src={null}
                          alt=""
                          fallbackLabel="Sem foto"
                          className="absolute inset-0 h-full w-full object-contain"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-semibold leading-snug">
                            {line.name}
                          </p>
                          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                            {money(line.unitPrice)} cada
                          </p>
                          <InlineDiscountEditor
                            baseAmount={lineSubtotal}
                            discount={lineDiscount}
                            onApply={(discount) =>
                              onLineDiscountChange(line.inventoryId, discount)
                            }
                            onEditingChange={(editing) =>
                              setEditingLineDiscount((current) =>
                                editing
                                  ? line.inventoryId
                                  : current === line.inventoryId
                                    ? null
                                    : current,
                              )
                            }
                            variant="line"
                            label={`desconto em ${line.name}`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemove(line.inventoryId)}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Remover ${line.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <PdvQuantityStepper
                          size="sm"
                          quantity={line.quantity}
                          availableQuantity={line.availableQuantity}
                          onIncrement={(delta) =>
                            onIncrement(line.inventoryId, delta)
                          }
                          onSetQuantity={(quantity) =>
                            onSetQuantity(line.inventoryId, quantity)
                          }
                          decrementAriaLabel="Diminuir quantidade"
                          incrementAriaLabel="Aumentar quantidade"
                          editAriaLabel="Editar quantidade"
                        />
                        <span className="flex flex-col items-end tabular-nums">
                          {lineDiscountAmount > 0 && (
                            <span className="text-[10px] text-muted-foreground line-through">
                              {money(lineSubtotal)}
                            </span>
                          )}
                          <span className="font-bold">{money(lineTotal)}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {showBottomFade && !editingLineDiscount && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card via-card/65 to-transparent"
            />
          )}
        </div>

        <div className="space-y-3 bg-muted/30 p-4">
          <PreviewCustomerPicker />
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">{money(subtotal)}</span>
            </div>
            {itemDiscountTotal > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Descontos nos itens</span>
                <span className="tabular-nums">
                  − {money(itemDiscountTotal)}
                </span>
              </div>
            )}
            <InlineDiscountEditor
              baseAmount={subtotalAfterItems}
              discount={orderDiscountDefinition}
              onApply={(discount) =>
                onDiscountChange(discount, subtotalAfterItems)
              }
              variant="order"
              label="Desconto do pedido"
              appliedAmount={orderDiscount}
            />
            <div className="flex items-end justify-between border-t pt-2">
              <span className="font-bold">Total</span>
              <span className="text-2xl font-extrabold tabular-nums">
                {money(total)}
              </span>
            </div>
          </div>
          <Button
            type="button"
            className="relative h-14 w-full justify-center px-12 text-lg font-bold"
            disabled={cart.lines.length === 0}
            onClick={onOpenPayment}
          >
            <span className="flex items-center justify-center gap-2">
              <CreditCard className="h-5 w-5" /> Finalizar venda
            </span>
            <kbd className="absolute right-4 rounded border border-current/30 px-1.5 py-0.5 text-[10px]">
              F9
            </kbd>
          </Button>
          <button
            type="button"
            onClick={onOpenDetails}
            className="flex w-full items-center justify-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" /> Observação, data e anexos
          </button>
        </div>
      </Card>

      {selectedImage && (
        <ImagePreviewModal
          src={selectedImage.src}
          alt={selectedImage.alt}
          open
          onClose={() => setSelectedImage(null)}
        />
      )}
    </>
  );
}

function PreviewOrderDetailsDialog({
  open,
  onOpenChange,
  notes,
  onNotesChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [transactionDate, setTransactionDate] = useState("2026-10-19");
  const [attachments, setAttachments] = useState<PreviewAttachment[]>([]);

  useEffect(() => {
    if (!attachments.some((attachment) => attachment.progress < 100)) return;
    const timer = window.setInterval(() => {
      setAttachments((current) =>
        current.map((attachment) => ({
          ...attachment,
          progress: Math.min(100, attachment.progress + 12),
        })),
      );
    }, 180);
    return () => window.clearInterval(timer);
  }, [attachments]);

  const addAttachments = (files: File[]) => {
    const createdAt = Date.now();
    setAttachments((current) => [
      ...current,
      ...files.map((file, index) => ({
        id: `${file.name}-${file.lastModified}-${createdAt}-${index}`,
        file,
        progress: 0,
      })),
    ]);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Observação, data e anexos"
      description="Detalhes opcionais que acompanham esta venda."
      className="sm:max-w-[480px]"
      footer={
        <div className="flex w-full justify-end">
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            Concluir
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="preview-order-notes">Observação do pedido</Label>
          <Textarea
            id="preview-order-notes"
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Ex.: entregar o controle já com pilhas"
            rows={3}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            A observação fica vinculada ao pedido finalizado.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="preview-transaction-date">Data do lançamento</Label>
          <DatePicker
            id="preview-transaction-date"
            value={transactionDate}
            max="2026-10-19"
            onValueChange={setTransactionDate}
          />
          <p className="text-xs text-muted-foreground">
            Use uma data anterior apenas para registrar uma venda retroativa.
          </p>
        </div>

        <div className="space-y-2.5">
          <Label>Fotos do pedido</Label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              addAttachments(
                Array.from(event.dataTransfer.files).filter((file) =>
                  file.type.startsWith("image/"),
                ),
              );
            }}
            className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-foreground/25 bg-muted/30 px-4 py-5 text-center transition-colors hover:border-primary hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm">
              <ArrowUpFromLine className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold">
              Arraste fotos ou clique para selecionar
            </span>
            <span className="mt-1 text-xs text-muted-foreground">
              PNG, JPG ou WebP · vários arquivos de uma vez
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) addAttachments(files);
              event.target.value = "";
            }}
          />

          {attachments.length > 0 && (
            <ul className="space-y-2" aria-label="Fotos adicionadas">
              {attachments.map((attachment) => (
                <li
                  key={attachment.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md border px-3 py-2.5 text-sm"
                >
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">
                        {attachment.file.name}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {attachment.progress < 100
                          ? `${attachment.progress}%`
                          : "Concluído"}
                      </span>
                    </div>
                    <Progress
                      value={attachment.progress}
                      className="mt-1.5 h-1.5"
                    />
                    <span className="mt-1 block text-[10px] text-muted-foreground">
                      {(attachment.file.size / 1024 / 1024).toLocaleString(
                        "pt-BR",
                        {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        },
                      )}{" "}
                      MB
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remover ${attachment.file.name}`}
                    onClick={() =>
                      setAttachments((current) =>
                        current.filter((item) => item.id !== attachment.id),
                      )
                    }
                    className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
}

function InlineDiscountEditor({
  baseAmount,
  discount,
  appliedAmount = getDiscountAmount(baseAmount, discount),
  onApply,
  onEditingChange,
  variant,
  label,
}: {
  baseAmount: number;
  discount: DiscountDefinition | null;
  appliedAmount?: number;
  onApply: (discount: DiscountDefinition | null) => void;
  onEditingChange?: (editing: boolean) => void;
  variant: "line" | "order";
  label: string;
}) {
  const editorRef = useRef<HTMLFormElement>(null);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<DiscountMode>(discount?.mode ?? "value");
  const [draft, setDraft] = useState(() =>
    formatEditableNumber(discount?.value ?? 0),
  );
  const parsed = parsePtBrNumber(draft);
  const isValidNumber = Number.isFinite(parsed) && parsed >= 0;
  const exceedsLimit =
    isValidNumber &&
    (mode === "percentage" ? parsed > 100 : parsed > baseAmount);
  const calculatedDiscount = isValidNumber
    ? mode === "percentage"
      ? (baseAmount * parsed) / 100
      : parsed
    : 0;
  const canApply = baseAmount > 0 && isValidNumber && !exceedsLimit;

  useEffect(() => {
    if (!editing) return;
    const frame = window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editing]);

  const changeEditing = (nextEditing: boolean) => {
    setEditing(nextEditing);
    onEditingChange?.(nextEditing);
  };

  const toggleEditor = () => {
    if (!editing) {
      setMode(discount?.mode ?? "value");
      setDraft(formatEditableNumber(discount?.value ?? 0));
    }
    changeEditing(!editing);
  };

  const changeMode = (nextMode: DiscountMode) => {
    if (nextMode === mode) return;
    const amount =
      isValidNumber && !exceedsLimit ? calculatedDiscount : appliedAmount;
    setMode(nextMode);
    setDraft(
      formatEditableNumber(
        nextMode === "percentage" && baseAmount > 0
          ? (amount / baseAmount) * 100
          : amount,
      ),
    );
  };

  const applyDiscount = () => {
    if (!canApply) return;
    onApply(parsed > 0 ? { mode, value: parsed } : null);
    changeEditing(false);
  };

  return (
    <div className={variant === "order" ? "rounded-sm" : "mt-1"}>
      {variant === "order" ? (
        <button
          type="button"
          disabled={baseAmount <= 0}
          aria-expanded={editing}
          aria-label={`${editing ? "Fechar edição de" : appliedAmount > 0 ? "Editar" : "Adicionar"} ${label}`}
          onClick={toggleEditor}
          className="flex w-full items-center justify-between gap-3 rounded-sm py-0.5 text-left text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          <span>{label}</span>
          <span className="inline-flex shrink-0 items-center gap-2">
            <span className="text-[11px] font-bold text-primary">
              {editing ? "Fechar" : appliedAmount > 0 ? "Editar" : "Adicionar"}
            </span>
            <span className="tabular-nums">− {money(appliedAmount)}</span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          disabled={baseAmount <= 0}
          aria-expanded={editing}
          aria-label={`${editing ? "Fechar edição de" : appliedAmount > 0 ? "Editar" : "Aplicar"} ${label}`}
          onClick={toggleEditor}
          className="text-[11px] font-bold text-primary underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          {editing
            ? "Fechar desconto"
            : appliedAmount > 0
              ? `Editar desconto · − ${money(appliedAmount)}`
              : "Aplicar desconto"}
        </button>
      )}

      {editing && (
        <form
          ref={editorRef}
          className={cn(
            "mt-2.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-end gap-x-2 gap-y-1.5 pb-0.5",
            variant === "line" && "min-w-[14rem]",
          )}
          onSubmit={(event) => {
            event.preventDefault();
            applyDiscount();
          }}
        >
          <div
            className="grid h-9 grid-cols-2 gap-1 rounded bg-muted p-1"
            aria-label={`Tipo de ${label.toLocaleLowerCase("pt-BR")}`}
          >
            <button
              type="button"
              aria-pressed={mode === "value"}
              onClick={() => changeMode("value")}
              className={cn(
                "rounded px-1 py-1 text-[11px] font-semibold transition-colors",
                mode === "value"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Valor
            </button>
            <button
              type="button"
              aria-pressed={mode === "percentage"}
              aria-label="Percentual"
              onClick={() => changeMode("percentage")}
              className={cn(
                "rounded px-1 py-1 text-[11px] font-semibold transition-colors",
                mode === "percentage"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              %
            </button>
          </div>

          <label className="block">
            <span className="sr-only">
              {mode === "value"
                ? "Valor do desconto"
                : "Percentual do desconto"}
            </span>
            <div className="relative">
              {mode === "value" && (
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {currencySymbol}
                </span>
              )}
              <Input
                autoFocus
                inputMode="decimal"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-invalid={!isValidNumber || exceedsLimit}
                className={cn(
                  "h-9 text-sm tabular-nums",
                  mode === "value" ? "pl-11" : "pr-9",
                )}
              />
              {mode === "percentage" && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              )}
            </div>
          </label>

          {(!isValidNumber || exceedsLimit) && (
            <span className="col-span-2 text-xs font-medium text-destructive">
              {!isValidNumber
                ? "Informe um número válido."
                : mode === "percentage"
                  ? "O percentual máximo é 100%."
                  : `O desconto não pode ultrapassar ${money(baseAmount)}.`}
            </span>
          )}

          <div className="flex min-h-8 items-center justify-between gap-1 text-[10px]">
            <span className="text-muted-foreground">
              {variant === "line" ? "Total item" : "Após"}
            </span>
            <span className="font-bold tabular-nums">
              {money(
                Math.max(0, baseAmount - (canApply ? calculatedDiscount : 0)),
              )}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-1 text-[11px]"
              onClick={() => changeEditing(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-8 px-1 text-[11px]"
              disabled={!canApply}
            >
              Aplicar
            </Button>
          </div>

          {appliedAmount > 0 && (
            <Button
              type="button"
              variant="destructive-ghost"
              size="sm"
              className="col-span-2 h-7 w-full text-xs"
              onClick={() => {
                onApply(null);
                changeEditing(false);
              }}
            >
              Remover desconto
            </Button>
          )}
        </form>
      )}
    </div>
  );
}

function PreviewCustomerPicker() {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="flex min-h-14 w-full items-center gap-3 rounded-md border bg-background px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UserRound className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cliente da venda
            </span>
            <span className="block truncate text-sm font-semibold">
              Cliente balcão
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              (11) 99999-0000
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground">
            Alterar <ChevronRight className="h-4 w-4" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0"
      >
        <Command>
          <CommandInput placeholder="Buscar por nome, telefone ou CPF" />
          <CommandList>
            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            <CommandGroup heading="Cliente da venda">
              <CommandItem
                onSelect={() => setOpen(false)}
                className="gap-2 py-2.5"
              >
                <UserRound className="h-4 w-4 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    Cliente balcão
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    (11) 99999-0000
                  </span>
                </span>
                <Check className="h-4 w-4 text-primary" />
              </CommandItem>
              <CommandItem
                onSelect={() => setOpen(false)}
                className="gap-2 py-2.5"
              >
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                <span>Venda sem cliente identificado</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem className="gap-2 py-2.5 text-primary">
                <Plus className="h-4 w-4" />
                Cadastrar novo cliente
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CurrentCash() {
  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title="Caixa"
        subtitle="Dinheiro, receitas, despesas e vendas do balcão"
        icon={ShoppingCart}
      />
      <PdvCashIndicators
        cashTexts={t.cashPanel.cashCard}
        accountTexts={t.cashPanel.accountCard}
        drawerAmount={682.4}
        openedAt="2026-10-19T08:04:00.000Z"
        operatorName="Marina Souza"
        terminalName="Caixa 01"
        cofre={{
          disponivel: 2350,
          reservado: 682.4,
          conta_nome: "Cofre da loja",
          controle_estrito: true,
        }}
        accounts={[
          { id: "1", name: "Banco principal", balance: 12840.55 },
          { id: "2", name: "Mercado Pago", balance: 3420.2 },
          { id: "3", name: "Carteira da loja", balance: 680 },
        ]}
        accountsTotal={16940.75}
        valuesVisible
        onToggleValues={() => undefined}
        onClose={() => undefined}
        onBleed={() => undefined}
        onSupply={() => undefined}
        money={money}
        dateTime={dateTime}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="lg" className="gap-2">
          <ShoppingCart className="h-4 w-4" /> Nova venda
        </Button>
        <Button type="button" variant="outline" size="lg" className="gap-2">
          <Plus className="h-4 w-4" /> Nova receita
        </Button>
        <Button type="button" variant="outline" size="lg" className="gap-2">
          <Minus className="h-4 w-4" /> Nova despesa
        </Button>
      </div>
      <PdvCashSummaryCards
        texts={t.cashPanel.summary}
        result={cashResult}
        valuesVisible
        money={money}
        number={number}
      />
      <PdvCashHistoryPanel
        texts={t.cashPanel.history}
        entries={ledger}
        isLoading={false}
        valuesVisible
        money={money}
        dateTime={dateTime}
        number={number}
        canManageFinance
        canDeleteFinance
        onEdit={() => undefined}
        onDelete={() => undefined}
      />
    </div>
  );
}

function ProposedCash() {
  return (
    <div className="space-y-5 pb-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Banknote className="h-6 w-6" />
            <h1 className="text-2xl font-extrabold tracking-tight">Caixa</h1>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Gestão financeira e movimentações
          </p>
        </div>
      </header>

      <nav
        aria-label="Caixas disponíveis"
        className="flex gap-2 overflow-x-auto border-b pb-2"
      >
        <button
          type="button"
          className="shrink-0 rounded-md bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground"
        >
          Início
        </button>
        <button
          type="button"
          className="shrink-0 rounded-md bg-foreground px-3 py-2 text-xs font-semibold text-background"
        >
          #01 · Caixa 01 · Marina Souza (você)
        </button>
      </nav>

      <div className="flex flex-col gap-4 lg:flex-row">
        <section className="flex flex-col justify-between lg:min-h-[220px] lg:w-[440px] lg:shrink-0">
          <div>
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Banknote className="h-5 w-5" /> Dinheiro em caixa
            </h2>
            <div className="mt-3 flex items-center gap-1">
              <p className="text-4xl font-extrabold tracking-tight tabular-nums lg:text-5xl">
                {money(682.4)}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Ocultar valores"
              >
                <Eye className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Aberto em 19/10/2026 às 08:04
            </p>
            <div className="mt-3 space-y-1.5 text-xs sm:text-sm">
              <LabelValue
                label="Disponível no cofre"
                value={money(2350)}
                horizontal
              />
              <LabelValue
                label="Reservado neste caixa"
                value={money(682.4)}
                horizontal
              />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full uppercase tracking-[0.12em] hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            Fechar caixa
          </Button>
        </section>

        <section className="flex min-w-0 flex-1 flex-col justify-between lg:min-h-[220px] lg:border-l lg:pl-6">
          <div>
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <DollarSign className="h-5 w-5" /> Saldo em conta
            </h2>
            <p className="mt-3 text-3xl font-extrabold tracking-tight tabular-nums lg:text-4xl">
              {money(16940.75)}
            </p>
            <div className="mt-5 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-violet-600 px-2.5 py-1 text-[10px] font-bold text-white">
                Banco principal&nbsp; {money(12840.55)}
              </span>
              <span className="rounded-full bg-orange-500 px-2.5 py-1 text-[10px] font-bold text-white">
                Mercado Pago&nbsp; {money(3420.2)}
              </span>
              <span className="rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-bold text-white">
                Carteira da loja&nbsp; {money(680)}
              </span>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="gap-2 uppercase tracking-[0.1em]">
              <ArrowUpFromLine className="h-4 w-4" /> Sangria
            </Button>
            <Button type="button" variant="outline" className="gap-2 uppercase tracking-[0.1em]">
              <Plus className="h-4 w-4" /> Nova movimentação
            </Button>
          </div>
        </section>
      </div>

      <section aria-label="Ações rápidas do caixa">
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          <EcoCashAction icon={Scale} label="Nova compra" tone="purchase" />
          <EcoCashAction icon={DollarSign} label="Nova venda" tone="sale" />
          <EcoCashAction icon={TrendingDown} label="Nova despesa" tone="expense" />
          <EcoCashAction icon={TrendingUp} label="Nova receita" tone="revenue" />
        </div>
      </section>

      <Button type="button" variant="outline" className="gap-2">
        <UsersRound className="h-4 w-4" />
        Saldo de cliente/fornecedor
        <ChevronRight className="ml-auto h-4 w-4 rotate-90" />
      </Button>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em]">
            Resumo do caixa atual
          </h2>
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Eye className="h-4 w-4" /> Ocultar
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4">
          <CashSummaryValue
            label="Total comprado"
            value={money(cashResult.cmv)}
            className="text-blue-600"
          />
          <CashSummaryValue
            label="Total vendido"
            value={money(cashResult.sold)}
            className="text-green-600"
          />
          <CashSummaryValue
            label="Lucro"
            value={money(cashResult.profit)}
            className="text-orange-600"
            helper={`Margem de ${number(cashResult.marginPct ?? 0, { maximumFractionDigits: 1 })}%`}
          />
          <CashSummaryValue
            label="Despesas"
            value={money(cashResult.expenses)}
            className="text-red-500"
          />
        </div>
      </section>

      <PdvCashHistoryPanel
        texts={t.cashPanel.history}
        entries={ledger}
        isLoading={false}
        valuesVisible
        money={money}
        dateTime={dateTime}
        number={number}
        canManageFinance
        canDeleteFinance
        onEdit={() => undefined}
        onDelete={() => undefined}
      />
    </div>
  );
}

function LabelValue({
  label,
  value,
  horizontal = false,
}: {
  label: string;
  value: string;
  horizontal?: boolean;
}) {
  return (
    <div
      className={cn(horizontal && "flex items-center justify-between gap-3")}
    >
      <p className="text-muted-foreground">{label}</p>
      <p className="font-bold tabular-nums">{value}</p>
    </div>
  );
}

function EcoCashAction({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof Plus;
  label: string;
  tone: "purchase" | "sale" | "expense" | "revenue";
}) {
  const tones = {
    purchase: {
      button: "sm:bg-blue-600 sm:hover:bg-blue-700 dark:sm:bg-blue-700 dark:sm:hover:bg-blue-600",
      icon: "bg-blue-600 dark:bg-blue-700",
    },
    sale: {
      button:
        "sm:bg-emerald-600 sm:hover:bg-emerald-700 dark:sm:bg-emerald-700 dark:sm:hover:bg-emerald-600",
      icon: "bg-emerald-600 dark:bg-emerald-700",
    },
    expense: {
      button: "sm:bg-red-600 sm:hover:bg-red-700 dark:sm:bg-red-700 dark:sm:hover:bg-red-600",
      icon: "bg-red-600 dark:bg-red-700",
    },
    revenue: {
      button: "sm:bg-teal-600 sm:hover:bg-teal-700 dark:sm:bg-teal-700 dark:sm:hover:bg-teal-600",
      icon: "bg-teal-600 dark:bg-teal-700",
    },
  }[tone];

  return (
    <button
      type="button"
      className={cn(
        "flex flex-col items-center gap-1.5 py-2 transition-transform active:scale-95 focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-24 sm:justify-center sm:gap-2 sm:rounded-lg sm:py-0 sm:text-white sm:shadow-sm",
        tones.button,
      )}
    >
      <span
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-sm sm:h-auto sm:w-auto sm:bg-transparent sm:shadow-none",
          tones.icon,
        )}
      >
        <Icon className="h-6 w-6" />
      </span>
      <span className="text-center text-[10px] font-medium leading-tight sm:text-[13px] sm:font-semibold sm:uppercase sm:tracking-[0.12em]">
        {label}
      </span>
    </button>
  );
}

function CashSummaryValue({
  label,
  value,
  helper,
  className,
}: {
  label: string;
  value: string;
  helper?: string;
  className: string;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">
        {label}
      </p>
      <p
        className={cn(
          "whitespace-nowrap text-lg font-extrabold tabular-nums sm:text-2xl",
          className,
        )}
      >
        {value}
      </p>
      {helper && (
        <p className="text-xs font-medium text-muted-foreground">{helper}</p>
      )}
    </div>
  );
}
