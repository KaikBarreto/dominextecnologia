import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Search, ShoppingBasket, CheckCircle2, X, ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { EmptyState } from '@/components/mobile/EmptyState';
import { MobilePillTabs, type PillTab } from '@/components/mobile/MobilePillTabs';
import { FilterButton } from '@/components/ui/FilterButton';
import { useMediaBreakpoint } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { fuzzyIncludesAny, cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { todayInTz } from '@/lib/timezone';
import { useToast } from '@/hooks/use-toast';
import { useInventory } from '@/hooks/useInventory';
import { useAccessibleInventoryIds } from '@/hooks/useAccessibleInventoryIds';
import { useStocks } from '@/hooks/useStocks';
import { useMaterialGroups } from '@/hooks/useMaterialGroups';
import { useCustomers } from '@/hooks/useCustomers';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { useBankPermissions } from '@/hooks/useBankPermissions';
import { usePdvCashRegister } from '@/hooks/usePdvCashRegister';
import {
  usePdvSale,
  usePdvCustomerCredit,
  useUploadPdvOrderAttachment,
  type PdvSettleResult,
} from '@/hooks/usePdvSale';
import { readPastedCents } from '@/lib/money-paste-mask';
import { processImageFile } from '@/utils/imageConvert';
import {
  EMPTY_CART,
  addItem,
  clearCart,
  incrementLineQuantity,
  removeItem,
  setCartCustomer,
  setDiscount,
  setLineQuantity,
  type CartProduct,
  type CartState,
} from '@/lib/pdv/cart';
import { PdvProductCard, type PdvGridProduct } from '@/components/pdv/PdvProductCard';
import { PdvCartPanel } from '@/components/pdv/PdvCartPanel';
import { PdvCartSummary } from '@/components/pdv/PdvCartSummary';
import { PdvCartItemsTable } from '@/components/pdv/PdvCartItemsTable';
import { PdvNumpad } from '@/components/pdv/PdvNumpad';
import { PdvSkeleton } from '@/components/pdv/PdvSkeleton';
import { PdvPaymentDialog } from '@/components/pdv/PdvPaymentDialog';
import { PdvQuickQuantityDialog } from '@/components/pdv/PdvQuickQuantityDialog';
import { PdvAdvancedOptionsDialog, type PdvPendingAttachment } from '@/components/pdv/PdvAdvancedOptionsDialog';

/** Breakpoint onde o carrinho deixa de ser painel fixo e vira folha inferior. */
const CART_DRAWER_BREAKPOINT = 768;

/**
 * Teclado numérico na tela é só pro PDV de tablet de balcão (sem teclado
 * físico). No desktop (>=1024, teclado físico sempre presente) ele some —
 * pedido do CEO 2026-10-18. 1024 não é número novo: é o MESMO
 * `MOBILE_BREAKPOINT`/`COMPACT_BREAKPOINT` que o shell já usa pra separar
 * tablet de desktop (`src/hooks/use-mobile.tsx`), então tablet (768-1023,
 * onde o carrinho já é painel fixo) continua com o numpad e só o desktop
 * (>=1024) perde.
 */
const NUMPAD_BREAKPOINT = 1024;

/**
 * Painel do Caixa (onde se abre o caixa). Caminho pt-br escrito literal, mesma
 * convenção do `PDV_SALE_PATH` em `PdvCaixa.tsx`: o registro de rotas é do
 * 🛡️ Plataforma e a lei do i18n de rotas garante que o path pt-br vale em todos
 * os idiomas (o `AppLayout` redireciona pro canônico do idioma do usuário).
 */
const PDV_PANEL_PATH = '/pdv';

/** `3 * <código>` digitado antes do código (manual) ou antes da rajada do leitor. */
function extractMultiplierPrefix(raw: string): { multiplier: number; term: string } {
  const match = raw.match(/^\s*(\d+)\s*[*×]\s*(.*)$/);
  if (!match) return { multiplier: 1, term: raw };
  const multiplier = parseInt(match[1], 10);
  return { multiplier: multiplier > 0 ? multiplier : 1, term: match[2] };
}

/**
 * Assinatura do carrinho. Serve pra saber se o pedido já criado numa tentativa
 * anterior AINDA corresponde ao que está na tela: se o operador mudou item,
 * quantidade, preço, desconto, cliente, local, caixa, a OBSERVAÇÃO do pedido
 * ou a DATA retroativa, a tentativa antiga morre e a próxima finalização cria
 * pedido novo com chave de idempotência nova. Sem isso, um pedido de
 * `aguardando_pagamento` velho seria finalizado com os itens (ou a
 * observação/data) de antes da correção — `createOrder` só roda uma vez por
 * tentativa, então notas/data digitadas DEPOIS da criação do pedido mas ANTES
 * do retry seriam silenciosamente ignoradas sem isto.
 */
function cartSignature(
  cart: CartState,
  stockId: string | null,
  sessionId: string | null,
  notes: string,
  transactionDate: string,
): string {
  return JSON.stringify({
    stock: stockId,
    session: sessionId,
    discount: cart.discount,
    customer: cart.customerId,
    notes,
    transactionDate,
    lines: cart.lines.map((line) => [line.inventoryId, line.quantity, line.unitPrice, line.unitCost]),
  });
}

/** Códigos de aviso que a tela sabe traduzir (`avisos[]` da RPC). */
const KNOWN_SALE_WARNINGS = [
  'local_nao_e_de_loja',
  'cliente_sem_limite_definido',
  'saldo_negativo',
] as const;

type SaleWarningCode = (typeof KNOWN_SALE_WARNINGS)[number];

/**
 * `avisos` vem misturado de propósito: a RPC manda string pura
 * (`'local_nao_e_de_loja'`) e objeto (`{ motivo: 'saldo_negativo', ... }`).
 * Aviso desconhecido é DESCARTADO da tela mas nunca "engolido" em silêncio: a
 * lista completa vai pro console pra aparecer no suporte.
 */
function extractSaleWarnings(avisos: PdvSettleResult['avisos']): SaleWarningCode[] {
  const out: SaleWarningCode[] = [];
  for (const aviso of avisos ?? []) {
    const code = typeof aviso === 'string' ? aviso : String((aviso as { motivo?: string })?.motivo ?? '');
    if ((KNOWN_SALE_WARNINGS as readonly string[]).indexOf(code) >= 0 && out.indexOf(code as SaleWarningCode) < 0) {
      out.push(code as SaleWarningCode);
    }
  }
  return out;
}

/**
 * VENDA de balcão (sub-tela do módulo PDV e Loja) — Onda 1, modo simples.
 *
 * Monta o carrinho (motor puro em `src/lib/pdv/cart.ts`) e FECHA A VENDA de
 * verdade: o carrinho vira `pdv_orders` + `pdv_order_items` e a finalização é
 * a RPC `pdv_settle_order`, que numa transação só cria os lançamentos
 * financeiros (`origin='pdv'`), grava as formas de pagamento, marca o pedido
 * como pago e baixa o estoque pelo Kardex.
 *
 * IDEMPOTÊNCIA: a chave (`client_request_id`) nasce UMA VEZ por tentativa de
 * venda (ver `attemptRef`) e é reaproveitada em todo retry, junto com o
 * `order_id` já criado. Gerar chave nova no retry anularia a proteção e o
 * duplo clique viraria venda dobrada.
 */
export default function Pdv() {
  const navigate = useNavigate();
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.pdv.cashier;
  const { toast } = useToast();
  const isMobileCart = useMediaBreakpoint(CART_DRAWER_BREAKPOINT);
  // true de 0 até 1023px (mobile + tablet) — numpad só aparece aí, nunca no desktop.
  const showNumpad = useMediaBreakpoint(NUMPAD_BREAKPOINT);

  const { items, stockLevelsLoaded, getQuantityForStock, isLoading: inventoryLoading } = useInventory();
  const { accessibleIds, isLoading: accessibleIdsLoading } = useAccessibleInventoryIds();
  const { stocks, isLoading: stocksLoading } = useStocks();
  const { groups, isLoading: groupsLoading } = useMaterialGroups();
  const { customers, isLoading: customersLoading } = useCustomers();
  const { accounts, isLoading: accountsLoading } = useFinancialAccounts();
  const { canUseBankAccounts } = useBankPermissions();
  // Terminal, sessão aberta e cofre vêm do MESMO hook do painel do Caixa
  // (`/pdv`), pra a venda e o painel nunca discordarem sobre qual caixa está
  // aberto nem sobre qual conta é o cofre.
  const {
    terminals,
    session,
    cofre,
    isLoading: cashLoading,
  } = usePdvCashRegister();
  const { createOrder, settleOrder } = usePdvSale();
  const uploadAttachment = useUploadPdvOrderAttachment();

  // Carregamento inicial da tela inteira (catálogo + locais + categorias +
  // clientes) — pedido do CEO 2026-10-18: "carregou e depois vieram as fotos,
  // faça o carregamento de tudo ser amigável com skeletons". Enquanto
  // qualquer um ainda não respondeu, a tela mostra `PdvSkeleton` em vez de um
  // grid/resumo pela metade (ou, pior, o `EmptyState` de "nenhum produto"
  // piscando ANTES do catálogo real chegar — carregando não é vazio).
  //
  // `cashLoading`/`accountsLoading` entram aqui porque a tela diz "caixa
  // fechado" e lista contas de recebimento: sem esperar, o operador veria o
  // aviso de caixa fechado piscar com o caixa ABERTO (carregando não é vazio,
  // nem no dinheiro).
  const isLoadingPdv =
    inventoryLoading ||
    !stockLevelsLoaded ||
    accessibleIdsLoading ||
    stocksLoading ||
    groupsLoading ||
    customersLoading ||
    accountsLoading ||
    cashLoading;

  const pdvStocks = useMemo(() => stocks.filter((s) => s.purpose === 'pdv'), [stocks]);
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedStockId && pdvStocks.length > 0) setSelectedStockId(pdvStocks[0].id);
  }, [pdvStocks, selectedStockId]);

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [cart, setCart] = useState(EMPTY_CART);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [discountCents, setDiscountCents] = useState(0);
  const [paymentOpen, setPaymentOpen] = useState(false);
  // "Opções avançadas" (retrodatar o lançamento + anexar foto, pedido do CEO
  // 2026-10-19) e a observação do pedido, que mora ao lado delas na coluna da
  // direita.
  //
  // `transactionDate` NASCE preenchido com o dia da empresa, não vazio
  // (correção 2026-10-19: campo vazio com placeholder lido como "quebrado" —
  // isto é dinheiro, o operador tem que VER a data que vai ser lançada, não
  // adivinhar por um texto cinza). O servidor só recebe data quando ela é
  // DIFERENTE do dia da empresa (ver `handleFinalizeSale`); igual a hoje
  // continua mandando `null`, caminho feliz intacto.
  const [orderNotes, setOrderNotes] = useState('');
  const [transactionDate, setTransactionDate] = useState(() => todayInTz(timezone));
  // Marca que o OPERADOR escolheu uma data (não é só o relógio correndo).
  // Sem isto, o efeito abaixo (que resincroniza com o dia da empresa quando
  // `timezone` chega do servidor, trocando o fuso-padrão pelo real) pisaria
  // por cima de uma escolha deliberada de data retroativa.
  const transactionDateTouchedRef = useRef(false);
  const [pendingAttachments, setPendingAttachments] = useState<PdvPendingAttachment[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(false);
  // Modal rápido de "quantos?" — só no caminho da BUSCA (ver
  // `PdvQuickQuantityDialog`). `null` = fechado.
  const [quickQuantityProduct, setQuickQuantityProduct] = useState<PdvGridProduct | null>(null);
  const [saleSuccess, setSaleSuccess] = useState<{
    number: number;
    total: number;
    change: number;
    warnings: SaleWarningCode[];
  } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  /**
   * A TENTATIVA DE VENDA em curso. Guarda o pedido já criado e a chave de
   * idempotência, pra o retry reaproveitar os dois. `signature` amarra a
   * tentativa ao carrinho que a originou (ver `cartSignature`).
   */
  const attemptRef = useRef<{ signature: string; orderId: string | null; clientRequestId: string } | null>(
    null,
  );

  const formatCurrency = (value: number) => formatMoney(value, currency, locale);

  // "Hoje" no fuso DA EMPRESA, não no do aparelho — é o teto que o servidor
  // também usa (`public.company_today`) pra recusar data futura em
  // `pdv_settle_order`. O `DatePicker` já trava no `max`; o servidor valida
  // de novo (defesa em profundidade).
  const maxTransactionDate = todayInTz(timezone);

  // `timezone` nasce com o fuso-PADRÃO (`America/Sao_Paulo`, ver
  // `AppLocaleContext`) e troca pelo fuso REAL da empresa quando
  // `company_settings` carrega. Se isso acontecer bem na virada do dia (os
  // dois fusos discordando sobre "hoje"), o campo precisa acompanhar — MAS só
  // enquanto o operador não tiver escolhido uma data com a própria mão.
  useEffect(() => {
    if (!transactionDateTouchedRef.current) setTransactionDate(maxTransactionDate);
  }, [maxTransactionDate]);

  function handleTransactionDateChange(value: string) {
    transactionDateTouchedRef.current = true;
    setTransactionDate(value);
  }

  /**
   * Comprime (sempre, `processImageFile` — "otimizada e comprimida", pedido
   * do CEO) cada foto escolhida e guarda como blob local. NÃO sobe nada pro
   * Storage aqui: o pedido do PDV só existe no banco na hora de finalizar, e
   * o caminho do arquivo (`<company_id>/pdv-orders/<order_id>/...`) exige o
   * `order_id` — ver `handleFinalizeSale`.
   */
  async function handleAttachFiles(files: File[]) {
    setAttachmentBusy(true);
    try {
      const next: PdvPendingAttachment[] = [];
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        const compressed = await processImageFile(file);
        next.push({ id: crypto.randomUUID(), file: compressed, previewUrl: URL.createObjectURL(compressed) });
      }
      if (next.length) setPendingAttachments((prev) => [...prev, ...next]);
    } catch {
      toast({ variant: 'destructive', title: t.toast.attachFailed });
    } finally {
      setAttachmentBusy(false);
    }
  }

  function handleRemoveAttachment(id: string) {
    setPendingAttachments((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  /** Abandona observação, data retroativa e fotos pendentes do rascunho atual. */
  function resetOrderDraftExtras() {
    setOrderNotes('');
    transactionDateTouchedRef.current = false;
    setTransactionDate(maxTransactionDate);
    setPendingAttachments((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
  }

  // Produtos vendáveis, com saldo calculado no local selecionado. Filtra pela
  // RPC get_accessible_inventory_ids ANTES de qualquer soma/exibição — régua
  // do achado B do plano (agregado de tela não pode vazer material de local
  // bloqueado pro usuário).
  const sellableProducts: PdvGridProduct[] = useMemo(() => {
    return items
      .filter((item) => item.is_sellable !== false)
      .filter((item) => accessibleIds.has(item.id))
      .map((item) => ({
        inventoryId: item.id,
        name: item.name,
        imageUrl: item.image_url ?? null,
        unitPrice: item.sale_price ?? 0,
        // SNAPSHOT do custo: vai pra `pdv_order_items.unit_cost` e é o que faz
        // o lucro real do caixa. Ler o custo do catálogo depois da venda daria
        // margem retroativa fantasiosa.
        unitCost: item.cost_price ?? 0,
        availableQuantity: selectedStockId ? getQuantityForStock(item.id, selectedStockId) : 0,
        groupId: item.group_id ?? null,
        barcode: item.barcode ?? null,
      })) as (PdvGridProduct & { groupId: string | null; barcode: string | null; unitCost: number })[];
  }, [items, accessibleIds, selectedStockId, getQuantityForStock]);

  const categoryFiltered = useMemo(() => {
    if (activeCategory === 'all') return sellableProducts;
    return sellableProducts.filter((p: any) => p.groupId === activeCategory);
  }, [sellableProducts, activeCategory]);

  const searchFiltered = useMemo(() => {
    const { term } = extractMultiplierPrefix(search);
    if (!term.trim()) return categoryFiltered;
    return categoryFiltered.filter((p: any) => fuzzyIncludesAny([p.name, p.barcode], term));
  }, [categoryFiltered, search]);

  const categoryTabs: PillTab[] = useMemo(
    () => [
      { value: 'all', label: t.categories.all },
      // `useColorBackground`: pill ativa usa a cor do grupo SATURADA de fundo
      // (igual ao card-herói de conta financeira), nunca o estilo translúcido
      // padrão do MobilePillTabs — que lido no tema claro parece uma pill
      // dessaturada (antipadrão que o CEO cobrou: "verde pálido com texto
      // verde" em vez de "fundo saturado, texto branco").
      ...groups.map((g) => ({
        value: g.id,
        label: g.name,
        accentColor: g.color ?? undefined,
        useColorBackground: true,
      })),
    ],
    [groups, t.categories.all],
  );

  // Teto de pills visíveis antes de empilhar o resto atrás do botão "Filtros"
  // (régua do CEO: "cuidado quando tiver muitos pra não acumular"). MEDIDO
  // de verdade no tenant de teste (8 categorias, rótulos de até ~190px como
  // "Consumíveis e Fixação") com Playwright, não chutado — dois baldes
  // porque o espaço some rápido abaixo de 1024:
  // - tablet (768-1023, `showNumpad` true): no pior caso (768px) a fileira
  //   de pills tem ~302px de conteúdo útil (sem a largura do botão
  //   "Filtros", ~94px + gap). 2 pills (Todos + 1 categoria) cabem sem
  //   cortar texto; a 3ª já estoura.
  // - desktop (>=1024, `showNumpad` false): no pior caso (1024px, a largura
  //   mínima do bucket) sobram ~494px. 3 pills cabem sem cortar; a 4ª já
  //   estoura.
  // Larguras maiores dentro de cada bucket só sobram espaço (aceitável —
  // não é ResizeObserver dinâmico de propósito, ver relatório de UI).
  const MAX_VISIBLE_CATEGORY_TABS = showNumpad ? 2 : 3;
  const visibleCategoryTabs = useMemo(() => {
    if (categoryTabs.length <= MAX_VISIBLE_CATEGORY_TABS) return categoryTabs;
    const head = categoryTabs.slice(0, MAX_VISIBLE_CATEGORY_TABS);
    if (head.some((tb) => tb.value === activeCategory)) return head;
    // A pill ativa ficou escondida atrás do "Filtros" — nunca deixa isso
    // acontecer, senão o operador perde a referência do que está filtrando.
    // Bombeia a pill ativa pro fim da fileira visível, no lugar da última.
    const active = categoryTabs.find((tb) => tb.value === activeCategory);
    return active ? [...head.slice(0, MAX_VISIBLE_CATEGORY_TABS - 1), active] : head;
  }, [categoryTabs, activeCategory]);
  const hiddenCategoryTabs = useMemo(
    () => categoryTabs.filter((tb) => !visibleCategoryTabs.some((v) => v.value === tb.value)),
    [categoryTabs, visibleCategoryTabs],
  );

  function toProduct(p: PdvGridProduct): CartProduct {
    return {
      inventoryId: p.inventoryId,
      name: p.name,
      imageUrl: p.imageUrl,
      unitPrice: p.unitPrice,
      unitCost: (p as PdvGridProduct & { unitCost?: number }).unitCost ?? 0,
      availableQuantity: p.availableQuantity,
    };
  }

  function tryAdd(p: PdvGridProduct, quantity: number) {
    // Item novo no carrinho = venda nova: o aviso da venda anterior sai da
    // tela pra não confundir o troco de quem já foi embora com o desta.
    setSaleSuccess(null);
    const result = addItem(cart, toProduct(p), quantity);
    // `=== false` (não `!result.ok`): sem strictNullChecks neste tsconfig, a
    // negação bare não estreita o discriminated union.
    if (result.ok === false) {
      toast({
        variant: 'destructive',
        title: result.reason === 'out_of_stock' ? t.toast.outOfStock : t.toast.insufficientStock,
      });
      return;
    }
    setCart(result.cart);
  }

  function focusSearch() {
    if (!isMobileCart || !cartDrawerOpen) searchInputRef.current?.focus();
  }

  function handleBarcodeScan(code: string) {
    // A rajada do leitor pode vir depois de um multiplicador digitado à mão
    // ("3 *" + leitura) — o que sobrou no campo ANTES do código escaneado.
    const prefixRaw = search.slice(0, Math.max(0, search.length - code.length));
    const { multiplier } = extractMultiplierPrefix(`${prefixRaw}x`);
    setSearch('');

    const found = sellableProducts.find((p: any) => p.barcode && p.barcode === code);
    if (!found) {
      toast({ variant: 'destructive', title: t.toast.barcodeNotFound });
      return;
    }
    tryAdd(found, multiplier);
    focusSearch();
  }

  useBarcodeScanner({ onScan: handleBarcodeScan, enabled: !confirmClearOpen });

  function handleSearchEnter() {
    const { multiplier, term } = extractMultiplierPrefix(search);
    const cleanTerm = term.trim();
    if (!cleanTerm) return;
    const matches = searchFiltered.length ? searchFiltered : [];
    const direct = sellableProducts.filter((p: any) => fuzzyIncludesAny([p.name, p.barcode], cleanTerm));
    const pool = direct.length ? direct : matches;
    if (pool.length === 1) {
      tryAdd(pool[0], multiplier);
      setSearch('');
      focusSearch();
    } else if (pool.length > 1) {
      // Vários resultados: foca a grade pro operador escolher visualmente.
      gridRef.current?.focus();
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Enter com a busca VAZIA e carrinho cheio abre o pagamento (régua de
      // velocidade do plano): o ciclo "bipa, bipa, Enter" fecha a venda sem
      // tirar a mão do teclado.
      if (!search.trim() && canPay) {
        openPayment();
        return;
      }
      handleSearchEnter();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (search) {
        setSearch('');
      } else if (cart.lines.length > 0) {
        setConfirmClearOpen(true);
      }
      return;
    }
    // +/- só vira atalho de quantidade quando o campo está vazio (senão
    // quebraria a digitação normal de um código/nome que contenha o caractere).
    if ((e.key === '+' || e.key === '-') && search === '' && cart.lines.length > 0) {
      e.preventDefault();
      const lastLine = cart.lines[cart.lines.length - 1];
      setCart(incrementLineQuantity(cart, lastLine.inventoryId, e.key === '+' ? 1 : -1));
    }
  }

  const itemCount = cart.lines.reduce((sum, l) => sum + l.quantity, 0);
  const total = cart.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0) - cart.discount;
  const canPay = cart.lines.length > 0 && total > 0;

  // Terminal da venda: o do caixa aberto (é o turno de quem está vendendo);
  // sem caixa aberto, o primeiro terminal ativo (venda em PIX/cartão/fiado não
  // depende de gaveta).
  const terminalId = session?.terminal_id ?? terminals[0]?.id ?? null;
  const cashSessionId = session?.id ?? null;
  const hasOpenCashSession = !!session;
  const hasCofreAccount = !!cofre?.conta_id;

  /**
   * Contas que podem receber PIX, transferência e cartão. Cartão de CRÉDITO
   * fica fora porque a RPC recusa ("cartão de crédito não recebe venda").
   * A conta do cofre vai pro fim da lista, e nunca é o default: o dinheiro
   * entra lá sozinho, por forma de pagamento, e um PIX apontado pro cofre
   * engordaria o saldo do cofre sem entrar na conferência da gaveta.
   */
  const paymentAccounts = useMemo(
    () =>
      accounts
        .filter((acc) => acc.is_active && acc.type !== 'cartao')
        .slice()
        .sort((a, b) => {
          const aCofre = a.id === cofre?.conta_id ? 1 : 0;
          const bCofre = b.id === cofre?.conta_id ? 1 : 0;
          return aCofre - bCofre;
        })
        .map((acc) => ({ id: acc.id, name: acc.name })),
    [accounts, cofre?.conta_id],
  );

  const { credit: customerCredit } = usePdvCustomerCredit(cart.customerId);
  const customerName = useMemo(
    () => customers.find((c) => c.id === cart.customerId)?.name ?? null,
    [customers, cart.customerId],
  );

  function openPayment() {
    if (!canPay) {
      toast({ variant: 'destructive', title: t.payment.issues.sem_itens });
      return;
    }
    setSaleSuccess(null);
    setCartDrawerOpen(false);
    setPaymentOpen(true);
  }

  /**
   * Finaliza a venda. DOIS passos, e o estado da tentativa sobrevive ao erro:
   *
   *  1) cria o pedido (uma vez por tentativa — retry reaproveita o `order_id`,
   *     senão cada erro de digitação queimaria um número de pedido);
   *  2) chama `pdv_settle_order` com a MESMA `client_request_id` da tentativa.
   *     É isso que faz o duplo clique e o retry de rede serem inofensivos: a
   *     segunda chamada devolve o mesmo resumo com `idempotente: true`.
   *
   * Erro sobe pro diálogo, que mostra o texto PT-BR do servidor via
   * `pdvCashErrorMessage` (nunca `getErrorMessage`, que engoliria a mensagem).
   */
  async function handleFinalizeSale(payments: Parameters<typeof settleOrder.mutateAsync>[0]['payments']) {
    const signature = cartSignature(cart, selectedStockId, cashSessionId, orderNotes, transactionDate);
    let attempt = attemptRef.current;
    if (!attempt || attempt.signature !== signature) {
      attempt = { signature, orderId: null, clientRequestId: crypto.randomUUID() };
      attemptRef.current = attempt;
    }

    if (!attempt.orderId) {
      const orderId = await createOrder.mutateAsync({
        customerId: cart.customerId,
        terminalId,
        stockId: selectedStockId,
        cashSessionId,
        discountAmount: cart.discount,
        notes: orderNotes,
        items: cart.lines.map((line) => ({
          inventoryId: line.inventoryId,
          description: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitCost: line.unitCost,
        })),
      });
      // Gravado ANTES do settle de propósito: se o pagamento falhar, o retry
      // finaliza ESTE pedido em vez de criar outro.
      attempt.orderId = orderId;
    }

    // Fotos pendentes ("Opções avançadas") só podem subir AGORA, porque o
    // caminho no Storage exige `order_id` (que só existe a partir daqui).
    // Remove cada uma do estado assim que sobe com sucesso: se uma falhar no
    // meio da lista, o retry (mesmo attempt.orderId) só tenta de novo as que
    // sobraram, sem duplicar as que já subiram.
    for (const pending of pendingAttachments) {
      try {
        await uploadAttachment.mutateAsync({ orderId: attempt.orderId, file: pending.file });
      } catch {
        throw new Error(t.toast.attachFailed);
      }
      URL.revokeObjectURL(pending.previewUrl);
      setPendingAttachments((prev) => prev.filter((p) => p.id !== pending.id));
    }

    const result = await settleOrder.mutateAsync({
      orderId: attempt.orderId,
      payments,
      clientRequestId: attempt.clientRequestId,
      // Igual ao dia da empresa = `null` (caminho feliz de sempre, byte a
      // byte); só manda data quando o operador de fato escolheu outro dia —
      // o campo agora nasce preenchido com hoje, então "igual a hoje" é o
      // caso comum, não a exceção.
      transactionDate: transactionDate === maxTransactionDate ? null : transactionDate,
    });

    const change = (result.pagamentos ?? []).reduce(
      (sum, pay) => sum + (Number(pay.change_amount) || 0),
      0,
    );

    // Deu certo: a tentativa morre, o carrinho zera e o foco volta pra busca.
    // Balcão é fila — a tela tem que estar pronta pro próximo cliente sem
    // clique extra, então o sucesso é um aviso na tela, não um modal.
    attemptRef.current = null;
    setPaymentOpen(false);
    // `EMPTY_CART`, não `clearCart`: o `clearCart` PRESERVA o cliente de
    // propósito (cancelar o carrinho e remontar pro mesmo cliente é o caso
    // normal), mas depois da venda FECHADA o próximo da fila é outra pessoa.
    // Herdar o cliente aqui faria a próxima venda no fiado cair na ficha de
    // quem já foi embora — erro de dinheiro, não de UI.
    setCart(EMPTY_CART);
    setDiscountCents(0);
    // Observação/data já foram consumidas por este pedido; fotos já subiram
    // no loop acima (a lista já está vazia, mas o revoke+reset é defensivo).
    resetOrderDraftExtras();
    setSaleSuccess({
      number: Number(result.numero) || 0,
      total: Number(result.total) || 0,
      change: Math.round(change * 100) / 100,
      warnings: extractSaleWarnings(result.avisos),
    });
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  // Atalhos de função — teclas não-imprimíveis, o leitor de código nunca as vê.
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F4' || e.key === 'F9') {
        // Com o diálogo aberto o F9 é dele (finalizar), não daqui.
        if (paymentOpen) return;
        e.preventDefault();
        openPayment();
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  });

  /**
   * Teto/chão de linhas do carrinho (coluna dos produtos) — DERIVADO do
   * viewport, não mais cravado em 5 (pedido do CEO 2026-10-19: "a altura de
   * quando tem 5 itens é o padrão, mas se não tiver essa folga, até 3 linhas
   * é aceitável"). Preço do cabeçalho (53px) + cabeçalho da tabela (32px) +
   * cada linha (48,5px), MEDIDOS com Playwright em 2026-10-19 (ver o
   * `h-[328px]` histórico = 5 linhas). `CART_HEIGHT_CLASS` abaixo tem que ter
   * uma entrada (classe Tailwind arbitrária LITERAL, pro JIT escanear) pra
   * cada valor entre `CART_LINES_MIN` e `CART_LINES_MAX`.
   */
  const CART_LINES_MAX = 5;
  const CART_LINES_MIN = 3;
  const CART_HEADER_PX = 53;
  const CART_TABLE_HEADER_PX = 32;
  const CART_ROW_PX = 48.5;
  const CART_HEIGHT_CLASS: Record<number, string> = {
    5: 'h-[328px]',
    4: 'h-[279px]',
    3: 'h-[231px]',
  };
  function cartTableHeightPx(lines: number): number {
    return Math.ceil(CART_HEADER_PX + CART_TABLE_HEADER_PX + lines * CART_ROW_PX);
  }

  /**
   * Piso da grade de produtos — NORMAL (`full`) e COMPACTO (`compact`).
   * Pedido do CEO 2026-10-19 via Tech Lead: notebook (1366×768) não pode
   * mais cair no fallback de rolagem gigante; se nem com cabeçalho
   * comprimido + 3 linhas de carrinho o piso de 260px couber, a grade passa
   * a usar o card COMPACTO (`PdvProductCard compact`) em vez de desistir e
   * deixar o `<main>` rolar.
   *
   * `GRID_FLOOR_FULL_PX` (260) é o valor histórico, sem mudança.
   * `GRID_FLOOR_COMPACT_PX` (150) é CALCULADO a partir da altura teórica do
   * card compacto (~142px, ver o comentário de `compact` em
   * `PdvProductCard.tsx`) + ~8px de margem de segurança — NÃO medido em
   * navegador real. `GRID_FLOOR_CLASS` espelha os dois valores em classe
   * Tailwind LITERAL (pro JIT escanear, mesmo padrão do `CART_HEIGHT_CLASS`
   * acima).
   */
  const GRID_FLOOR_FULL_PX = 260;
  const GRID_FLOOR_COMPACT_PX = 150;
  const GRID_FLOOR_CLASS: Record<'full' | 'compact', string> = {
    full: 'min-h-[260px]',
    compact: 'min-h-[150px]',
  };

  /**
   * Composição de ALTURA FIXA no desktop (pedido do CEO 2026-10-19): a
   * PÁGINA não rola — só a grade e o carrinho rolam por dentro — "a não ser
   * que seja necessário" (se não couber, deixa rolar; nunca corta preço,
   * saldo ou o botão de Finalizar pra caber).
   *
   * Em vez de chutar um offset em `rem` (como `calc(100vh-18rem)` fazia —
   * motivo de 3 rodadas de ajuste de número às cegas), MEDE em tempo real o
   * quanto de viewport já foi consumido ACIMA desta linha (sidebar/topbar +
   * voltar + título + avisos) e QUANTO FALTA pro rodapé do app (`footer`
   * `h-[52px]` fixo nos dois shells de desktop — `SidebarShell`/`TopbarShell`
   * em `AppLayout.tsx`, que eu NÃO toco: é constante conhecida, não chute).
   * O que sobra vira a altura exata da composição; o FLEX interno
   * (`flex-1 min-h-0 overflow-y-auto` na grade e no carrinho) resolve a
   * divisão sozinho — sem outro calc().
   *
   * `100dvh`-aware: usa `window.visualViewport.height` quando existe (não
   * `100vh`, que conta a barra de endereço do mobile — a régua da casa já
   * tropeçou nisso). SÓ desktop (`!isMobileCart`): mobile/tablet continuam
   * com rolagem de página normal, sem este cálculo.
   *
   * ALTURA DO CARRINHO DERIVADA, NÃO CRAVADA (pedido do CEO 2026-10-19):
   * tenta do TETO (5 linhas) ao CHÃO (3), e só então comprime o cabeçalho
   * (some o subtítulo, "Voltar" entra na mesma linha do título) se isso
   * destravar o teto de 5 — nunca o contrário. Pra saber SE comprimir ajuda
   * sem precisar de duas rodadas de re-render (que arriscaria oscilar), mede
   * os DOIS cabeçalhos ao mesmo tempo: o que está ATIVO no fluxo normal
   * (`headerRef`) e a MESMA variante trocada, invisível e fora do fluxo
   * (`headerProbeRef`, `position:absolute` dentro de um `position:relative`
   * — não empurra nada, não conta na altura do pai). A diferença entre os
   * dois é a folga real que a compressão abriria, medida de verdade em vez
   * de chutada.
   *
   * TRAVA 1 (chão é chão, não corte): se nem com 3 linhas (cabeçalho já
   * comprimido) couber, NÃO comprime nada — deixa o `<main>` do AppLayout
   * rolar, como sempre fez. Rolagem é feia; conteúdo escondido é bug.
   *
   * TRAVA 2 (não pula embaixo do dedo): com o carrinho CHEIO, a quantidade de
   * linhas E o card compacto/normal ficam CONGELADOS (só o
   * `desktopCompositionHeight`/cabeçalho reavaliam) — senão a tabela E a
   * grade mudariam de tamanho enquanto o operador trabalha. Só reavalia
   * linhas/card com carrinho VAZIO ou em `resize` (ação explícita do
   * usuário).
   */
  const desktopRowRef = useRef<HTMLDivElement>(null);
  const topControlsRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const headerProbeRef = useRef<HTMLDivElement>(null);
  const [desktopCompositionHeight, setDesktopCompositionHeight] = useState<number | null>(null);
  const [headerCompressed, setHeaderCompressed] = useState(false);
  const [cartLines, setCartLines] = useState(CART_LINES_MAX);
  const [cardCompact, setCardCompact] = useState(false);
  useLayoutEffect(() => {
    if (isMobileCart) {
      setDesktopCompositionHeight(null);
      return;
    }
    const rowEl = desktopRowRef.current;
    const topControlsEl = topControlsRef.current;
    const headerEl = headerRef.current;
    const probeEl = headerProbeRef.current;
    if (!rowEl || !topControlsEl || !headerEl || !probeEl) return;

    // `footer` fixo dos 2 shells de desktop (`AppLayout.tsx`, `SidebarShell`/
    // `TopbarShell`) — constante conhecida, não medida (não temos acesso ao
    // DOM do footer a partir daqui sem acoplar a um seletor frágil).
    const APPLAYOUT_FOOTER_HEIGHT_PX = 52;
    // Chão (não folga visual): o `<main>` do AppLayout tem `overflow-y-auto`
    // próprio + `md:p-6` (24px) de padding em TODOS os lados, inclusive o de
    // baixo — e este `<main>` é SEMPRE o caso (esta lógica só roda em
    // `!isMobileCart`, ou seja, >=768px, onde `md:` já vale). Reservar menos
    // que esses 24px faz o CONTEÚDO colar na borda do padding e o PRÓPRIO
    // `<main>` abrir scroll interno (invisível pro
    // `document.documentElement`, mas visível pro operador) — achado
    // confirmado com um probe estático reproduzindo a cadeia de contenção
    // real (`h-[100dvh]` → `SidebarInset overflow-hidden` → `main
    // overflow-y-auto`) em 2026-10-19: com 16px sobravam 8px de overflow
    // DENTRO do `<main>` em 1920×1080 e 1440×900, mesmo com
    // `document.documentElement` "limpo". 24px fecha a conta exata.
    const BOTTOM_BREATHING_ROOM_PX = 24;
    // `gap-3` do Tailwind = 0.75rem = 12px (root sem alteração de font-size).
    const FLEX_GAP_PX = 12;

    function recompute(allowLinesChange: boolean) {
      if (!rowEl || !topControlsEl || !headerEl || !probeEl) return;

      const rowTop = rowEl.getBoundingClientRect().top;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const availableActive = viewportHeight - rowTop - APPLAYOUT_FOOTER_HEIGHT_PX - BOTTOM_BREATHING_ROOM_PX;

      // `headerEl` é a variante REALMENTE renderizada agora; `probeEl` é a
      // OPOSTA, medida escondida — então, seja qual for o estado atual, os
      // dois dão o par (altura cheia, altura comprimida) sem precisar
      // trocar o estado pra medir o outro lado.
      const activeHeight = headerEl.getBoundingClientRect().height;
      const alternateHeight = probeEl.getBoundingClientRect().height;
      const fullHeight = headerCompressed ? alternateHeight : activeHeight;
      const compressedHeight = headerCompressed ? activeHeight : alternateHeight;
      const savings = Math.max(0, fullHeight - compressedHeight);

      const availableFull = headerCompressed ? availableActive - savings : availableActive;
      const availableCompressed = headerCompressed ? availableActive : availableActive + savings;

      const topControlsHeight = topControlsEl.getBoundingClientRect().height;

      // Carrinho cheio: só reavalia a quantidade ATUAL de linhas E o card
      // ATUAL (congelados), pra tabela/grade não pularem debaixo do dedo do
      // operador (trava 2). Vazio ou resize (ação explícita): testa de novo
      // do teto (5 linhas, card normal) ao chão (3 linhas, card compacto).
      const lineCandidates = allowLinesChange
        ? [CART_LINES_MAX, CART_LINES_MAX - 1, CART_LINES_MIN]
        : [cartLines];
      // Card compacto é o ÚLTIMO recurso (pedido do CEO: só densifica se
      // precisar) — por isso a tentativa `false` (normal) sempre roda
      // primeiro, nas 2 linhas abaixo, pra TODAS as combinações de linhas/
      // cabeçalho antes de sequer considerar o card compacto.
      const compactCandidates = allowLinesChange ? [false, true] : [cardCompact];

      let chosen: {
        lines: number;
        compressed: boolean;
        compact: boolean;
        available: number;
      } | null = null;
      for (const compactTry of compactCandidates) {
        const gridFloor = compactTry ? GRID_FLOOR_COMPACT_PX : GRID_FLOOR_FULL_PX;
        const fixedOverhead = topControlsHeight + FLEX_GAP_PX * 2 + gridFloor;
        for (const lines of lineCandidates) {
          const needed = fixedOverhead + cartTableHeightPx(lines);
          if (availableFull >= needed) {
            chosen = { lines, compressed: false, compact: compactTry, available: availableFull };
            break;
          }
          if (availableCompressed >= needed) {
            chosen = { lines, compressed: true, compact: compactTry, available: availableCompressed };
            break;
          }
        }
        if (chosen) break;
      }

      if (!chosen) {
        // Nem o chão (card compacto, 3 linhas, cabeçalho comprimido) cabe:
        // não comprime/densifica nada, deixa o <main> rolar (trava 1).
        setHeaderCompressed(false);
        setDesktopCompositionHeight(null);
        if (allowLinesChange) {
          setCartLines(CART_LINES_MAX);
          setCardCompact(false);
        }
        return;
      }

      setHeaderCompressed(chosen.compressed);
      setDesktopCompositionHeight(chosen.available);
      if (allowLinesChange) {
        setCartLines(chosen.lines);
        setCardCompact(chosen.compact);
      }
    }

    // Primeira medição do efeito: sempre livre pra escolher linhas (ou o
    // carrinho está vazio, ou é o carregamento inicial da tela).
    recompute(cart.lines.length === 0);

    function handleResize() {
      // Resize é ação EXPLÍCITA do usuário — reavalia linhas mesmo com
      // carrinho cheio (trava 2 permite nesse caso).
      recompute(true);
    }
    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
    // Recalcula quando algo ACIMA/DENTRO da composição muda de altura (aviso
    // de pós-venda aparece/some, pills de categoria mudam de contagem, aviso
    // de caixa fechado aparece/some, o carrinho esvazia) — tudo que desloca
    // `top` ou o orçamento disponível. `isLoadingPdv` é o mais importante:
    // enquanto carrega, a tela inteira é `PdvSkeleton` e os refs NEM EXISTEM
    // no DOM — sem este dep, quando o carregamento termina e a composição de
    // verdade monta, o efeito nunca roda de novo (bug medido 2026-10-19:
    // altura travada nunca chegava a aplicar). `headerCompressed` entra pra
    // manter o closure de `recompute` sincronizado com a variante REALMENTE
    // ativa (sem isso, um resize posterior compararia a variante errada).
    // `cardCompact` entra pelo MESMO motivo que `cartLines`: com a trava 2
    // ativa (`allowLinesChange=false`), o closure precisa ler o valor ATUAL
    // pra congelar (`compactCandidates = [cardCompact]`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isMobileCart,
    isLoadingPdv,
    saleSuccess,
    categoryTabs.length,
    hiddenCategoryTabs.length,
    hasOpenCashSession,
    cart.lines.length,
    headerCompressed,
    cartLines,
    cardCompact,
  ]);

  function handleNumpadDigit(digit: string) {
    setSearch((prev) => prev + digit);
    searchInputRef.current?.focus();
  }
  function handleNumpadMultiplier() {
    setSearch((prev) => `${prev}*`);
    searchInputRef.current?.focus();
  }
  function handleNumpadBackspace() {
    setSearch((prev) => prev.slice(0, -1));
    searchInputRef.current?.focus();
  }

  function handleDiscountChange(raw: string) {
    const digits = raw.replace(/\D/g, '');
    setDiscountCents(parseInt(digits || '0', 10));
    setCart((prev) => setDiscount(prev, parseInt(digits || '0', 10) / 100));
  }
  function handleDiscountPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const cents = readPastedCents(e);
    if (cents == null) return;
    setDiscountCents(cents);
    setCart((prev) => setDiscount(prev, cents / 100));
  }
  const discountDisplay = discountCents
    ? (discountCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  function handleConfirmClearCart() {
    setCart((prev) => clearCart(prev));
    setDiscountCents(0);
    // Observação, data retroativa e fotos pendentes são deste RASCUNHO de
    // pedido, não do cliente (que `clearCart` preserva de propósito) —
    // cancelar o carrinho abandona o rascunho inteiro.
    resetOrderDraftExtras();
    setConfirmClearOpen(false);
    focusSearch();
  }

  const cartPanelProps = {
    cart,
    customers,
    formatCurrency,
    discountDisplay,
    onDiscountChange: handleDiscountChange,
    onDiscountPaste: handleDiscountPaste,
    onIncrement: (id: string, delta: number) => setCart((prev) => incrementLineQuantity(prev, id, delta)),
    onSetQuantity: (id: string, quantity: number) => setCart((prev) => setLineQuantity(prev, id, quantity)),
    onRemove: (id: string) => setCart((prev) => removeItem(prev, id)),
    onCustomerChange: (id: string | null) => setCart((prev) => setCartCustomer(prev, id)),
    onRequestClearCart: () => setConfirmClearOpen(true),
    onRequestPayment: openPayment,
    cashClosed: !hasOpenCashSession,
    onGoToCashPanel: () => navigate(PDV_PANEL_PATH),
    // Enter na edição de quantidade (PdvQuantityStepper) devolve o foco pra
    // busca — mesma régua de velocidade do balcão que já vale pro Enter com
    // 1 resultado de busca.
    onConfirmQuantityEdit: focusSearch,
    notes: orderNotes,
    onNotesChange: setOrderNotes,
    onOpenAdvancedOptions: () => setAdvancedOptionsOpen(true),
    advancedOptionsActive: transactionDate !== maxTransactionDate || pendingAttachments.length > 0,
    texts: {
      title: t.cart.title,
      itemsCount: t.cart.itemsCount,
      empty: t.cart.empty,
      emptyHint: t.cart.emptyHint,
      subtotal: t.cart.subtotal,
      discount: t.cart.discount,
      discountPlaceholder: t.cart.discountPlaceholder,
      total: t.cart.total,
      customerLabel: t.cart.customerLabel,
      customerPlaceholder: t.cart.customerPlaceholder,
      removeLine: t.cart.removeLine,
      clearCart: t.cart.clearCart,
      noPhoto: t.stock.noPhoto,
      quantityEditLabel: t.cart.quantityEditLabel,
      paymentLabel: t.actions.payment,
      paymentShortcut: t.actions.paymentShortcut,
      finalizeLabel: t.actions.finalize,
      finalizeShortcut: t.actions.finalizeShortcut,
      cashClosedTitle: t.cashClosedNotice.title,
      cashClosedDescription: t.cashClosedNotice.description,
      cashClosedAction: t.cashClosedNotice.action,
      notesLabel: t.cart.notesLabel,
      notesPlaceholder: t.cart.notesPlaceholder,
      advancedOptionsTrigger: t.advancedOptions.trigger,
    },
  };

  // Desktop/tablet: resumo (coluna da direita) e itens (tabela, coluna dos
  // produtos) ficam separados — ver `PdvCartSummary`/`PdvCartItemsTable`.
  // Mobile continua intacto com `cartPanelProps` (drawer, PdvCartPanel acima).
  const cartSummaryProps = {
    cart,
    customers,
    formatCurrency,
    discountDisplay,
    onDiscountChange: handleDiscountChange,
    onDiscountPaste: handleDiscountPaste,
    onCustomerChange: cartPanelProps.onCustomerChange,
    onRequestPayment: cartPanelProps.onRequestPayment,
    cashClosed: cartPanelProps.cashClosed,
    onGoToCashPanel: cartPanelProps.onGoToCashPanel,
    notes: cartPanelProps.notes,
    onNotesChange: cartPanelProps.onNotesChange,
    onOpenAdvancedOptions: cartPanelProps.onOpenAdvancedOptions,
    advancedOptionsActive: cartPanelProps.advancedOptionsActive,
    texts: cartPanelProps.texts,
  };
  const cartItemsProps = {
    cart,
    formatCurrency,
    onIncrement: cartPanelProps.onIncrement,
    onSetQuantity: cartPanelProps.onSetQuantity,
    onRemove: cartPanelProps.onRemove,
    onRequestClearCart: cartPanelProps.onRequestClearCart,
    onConfirmQuantityEdit: cartPanelProps.onConfirmQuantityEdit,
    texts: {
      title: t.cart.title,
      itemsCount: t.cart.itemsCount,
      empty: t.cart.empty,
      emptyHint: t.cart.emptyHint,
      removeLine: t.cart.removeLine,
      clearCart: t.cart.clearCart,
      noPhoto: t.stock.noPhoto,
      columnProduct: t.cart.columnProduct,
      columnQuantity: t.cart.columnQuantity,
      quantityEditLabel: t.cart.quantityEditLabel,
      columnUnitPrice: t.cart.columnUnitPrice,
      columnLineTotal: t.cart.columnLineTotal,
    },
  };

  // Título PRÓPRIO da tela de venda + "← Voltar pro caixa" ACIMA do título
  // (correção 2026-10-19: a tela de venda tinha o MESMO cabeçalho do painel
  // do Caixa, parecendo a mesma tela — "Caixa / Venda de balcão..." nos
  // dois). Molde: `Sale.tsx` da EcoSistema ("← Voltar para o caixa" em link
  // discreto acima do `<h1>`). `navigate(PDV_PANEL_PATH)` explícito, não
  // `history.back()`: quem entrou por link direto não tem pra onde voltar.
  const backToCashPanel = (
    <button
      type="button"
      onClick={() => navigate(PDV_PANEL_PATH)}
      className="-mb-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {t.backToCashPanel}
    </button>
  );

  if (isLoadingPdv) {
    return (
      <div className="flex flex-col gap-4">
        {backToCashPanel}
        <PageHeader title={t.title} subtitle={t.subtitle} icon={ShoppingCart} />
        <PdvSkeleton isMobileCart={isMobileCart} showNumpad={showNumpad} />
      </div>
    );
  }

  if (stockLevelsLoaded && pdvStocks.length === 0) {
    return (
      <div className="space-y-6">
        {backToCashPanel}
        <PageHeader title={t.title} subtitle={t.subtitle} icon={ShoppingCart} />
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<ShoppingBasket className="h-12 w-12" />}
              title={t.noLocation.title}
              description={t.noLocation.description}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Cabeçalho CHEIO (padrão) × COMPRIMIDO (subtítulo some, "Voltar" entra na
  // mesma linha do título) — só o desktop troca, via `headerCompressed`
  // medido no `useLayoutEffect` acima. Os DOIS blocos existem sempre: um no
  // fluxo normal (visível) e o outro escondido numa sonda (`headerProbeRef`),
  // só pra medir "quanto esse troca economizaria" sem precisar de uma
  // segunda rodada de render pra decidir.
  const fullHeaderBlock = (
    <div className="flex flex-col gap-4">
      {backToCashPanel}
      <PageHeader title={t.title} subtitle={t.subtitle} icon={ShoppingCart} />
    </div>
  );
  const compactHeaderBlock = (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => navigate(PDV_PANEL_PATH)}
        className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t.backToCashPanel}
      </button>
      <div className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
      <div className="flex min-w-0 items-center gap-2">
        <ShoppingCart className="h-6 w-6 shrink-0 text-foreground/70" />
        <h1 className="truncate text-xl font-bold tracking-tight text-foreground">{t.title}</h1>
      </div>
    </div>
  );

  return (
    // pb generoso no mobile: dá espaço pra barra fixa do carrinho (acima do bottom
    // nav global, ver offset de 96px abaixo) não cobrir o fim da grade.
    <div className={cn('flex flex-col gap-4', isMobileCart && 'pb-44')}>
      <div className="relative">
        <div ref={headerRef}>{headerCompressed ? compactHeaderBlock : fullHeaderBlock}</div>
        {/* Sonda invisível: SEMPRE a variante OPOSTA à visível, pra medir sem
            trocar nada na tela. `position:absolute` tira do fluxo (não
            empurra o que vem depois, não entra na altura do `relative` pai);
            `invisible` tira da pintura/acessibilidade sem deixar de ocupar
            layout (precisa ocupar pra ter altura real pra medir). */}
        <div ref={headerProbeRef} aria-hidden="true" className="invisible pointer-events-none absolute inset-x-0 top-0">
          {headerCompressed ? fullHeaderBlock : compactHeaderBlock}
        </div>
      </div>

      {/* Pós-venda. Fica AQUI (acima da busca, fora do carrinho) de propósito:
          no mobile o resumo vive dentro do drawer, que fecha ao finalizar, e o
          operador perderia justamente o número do pedido e o TROCO. */}
      {saleSuccess && (
        <div className="space-y-2">
          <NoticeBanner
            variant="success"
            icon={CheckCircle2}
            title={t.saleSuccess.title.replace('{number}', String(saleSuccess.number))}
            action={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-success-foreground hover:bg-success-foreground/10"
                onClick={() => setSaleSuccess(null)}
                aria-label={t.saleSuccess.dismiss}
              >
                <X className="h-4 w-4" />
              </Button>
            }
          >
            <span className="font-semibold tabular-nums">
              {t.saleSuccess.total.replace('{value}', formatCurrency(saleSuccess.total))}
              {saleSuccess.change > 0
                ? ` · ${t.saleSuccess.change.replace('{value}', formatCurrency(saleSuccess.change))}`
                : ''}
            </span>
          </NoticeBanner>
          {/* Aviso da RPC aparece, nunca é engolido. */}
          {saleSuccess.warnings.map((code) => (
            <NoticeBanner key={code} variant="warning">
              {t.saleSuccess.warnings[code]}
            </NoticeBanner>
          ))}
        </div>
      )}

      <div
        ref={desktopRowRef}
        className="flex flex-col gap-3 md:flex-row md:items-start"
        style={desktopCompositionHeight != null ? { height: desktopCompositionHeight } : undefined}
      >
        {/* Coluna dos produtos: busca + filtros + grade + carrinho (itens) —
            tudo no mesmo eixo de leitura, de cima pra baixo. Pedido do CEO
            2026-10-18: "o carrinho não tá claro na direita, melhor ele ficar
            na área dos produtos, com os itens incluídos abaixo da grade". No
            mobile (drawer) os itens continuam só no painel deslizante.

            Altura da coluna: `md:h-full`, NÃO mais `calc(100vh-18rem)`
            (correção 2026-10-19 — "pare de chutar número, deixe o flex
            resolver"). A altura REAL vem da MEDIÇÃO em `desktopCompositionHeight`
            (ver o `useLayoutEffect` acima), aplicada como `style` no `<div>`
            pai desta linha — `h-full` aqui só herda esse valor medido. */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 md:h-full">
          {/* `topControlsRef` mede busca+local+pills JUNTOS — é o "overhead
              fixo" que o `useLayoutEffect` acima soma ao chão da grade e à
              altura do carrinho pra decidir quantas linhas cabem. Mantém o
              MESMO `gap-3` que já existia entre busca e pills (visual
              idêntico a antes; só agrupou numa `div` pra dar um ref comum). */}
          <div ref={topControlsRef} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={t.search.placeholder}
                  className="pl-9"
                />
              </div>
              {pdvStocks.length > 1 && (
                <Select value={selectedStockId ?? undefined} onValueChange={setSelectedStockId}>
                  <SelectTrigger className="w-full sm:w-56">
                    <SelectValue placeholder={t.stock.locationLabel} />
                  </SelectTrigger>
                  <SelectContent>
                    {pdvStocks.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {categoryTabs.length > 1 && (
              <div className="flex items-center gap-2">
                <MobilePillTabs
                  tabs={visibleCategoryTabs}
                  activeTab={activeCategory}
                  onTabChange={setActiveCategory}
                  className="min-w-0 flex-1"
                />
                {/* Teto de pills visíveis (régua do CEO: "cuidado pra não
                    acumular"). O resto mora atrás do botão "Filtros" — já
                    reusado da tela de Estoque, mesmo componente/visual. */}
                {hiddenCategoryTabs.length > 0 && (
                  <FilterButton
                    activeCount={hiddenCategoryTabs.some((tb) => tb.value === activeCategory) ? 1 : 0}
                    onClear={() => setActiveCategory('all')}
                    className="shrink-0"
                  >
                    <div className="flex flex-col gap-1">
                      {hiddenCategoryTabs.map((tb) => {
                        const isActive = tb.value === activeCategory;
                        return (
                          <button
                            key={tb.value}
                            type="button"
                            onClick={() => setActiveCategory(tb.value)}
                            className={cn(
                              'flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                              isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                            )}
                          >
                            {tb.accentColor && (
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: tb.accentColor }}
                              />
                            )}
                            {tb.label}
                          </button>
                        );
                      })}
                    </div>
                  </FilterButton>
                )}
              </div>
            )}
          </div>

          {/* Grade: altura contida no desktop/tablet (rola dentro dela) pra
              abrir espaço pro carrinho logo abaixo, no mesmo eixo de leitura.
              No mobile mantém o fluxo natural de página (sem teto).

              `min-h-[260px]`/`min-h-[150px]` (`GRID_FLOOR_CLASS`) é CHÃO, não
              teto: sem ele, a tabela de itens logo abaixo (natural/shrink,
              nunca mais `shrink-0`) comia a altura inteira quando tinha
              conteúdo (EmptyState alto ou várias linhas), e a janela da
              grade podia encolher pra MENOS que um card inteiro — regressão
              medida 2026-10-18 (janela 173px pra um card de 221px, preço
              21px abaixo do corte). 260px é o piso MEDIDO com Playwright no
              caso normal (card cheio); 150px é o piso do card COMPACTO
              (`cardCompact`, ver `GRID_FLOOR_COMPACT_PX` acima) — só entra
              em viewport baixo (notebook 1366×768) onde nem cabeçalho
              comprimido + 3 linhas de carrinho destravam o piso de 260px. */}
          <div
            className={cn(
              'min-h-0',
              !isMobileCart &&
                cn('flex-1 overflow-y-auto pr-1', GRID_FLOOR_CLASS[cardCompact ? 'compact' : 'full']),
            )}
          >
            <div
              ref={gridRef}
              tabIndex={-1}
              className="grid grid-cols-2 gap-2 outline-none min-[768px]:grid-cols-3 min-[1024px]:grid-cols-4 min-[1280px]:grid-cols-5"
            >
              {searchFiltered.length === 0 ? (
                <div className="col-span-full">
                  <EmptyState
                    icon={<Search className="h-10 w-10" />}
                    title={sellableProducts.length === 0 ? t.emptyCatalog.title : t.search.noResults}
                    description={sellableProducts.length === 0 ? t.emptyCatalog.description : undefined}
                  />
                </div>
              ) : (
                searchFiltered.map((p) => (
                  <PdvProductCard
                    key={p.inventoryId}
                    product={p}
                    formatCurrency={formatCurrency}
                    outOfStockLabel={t.stock.outOfStock}
                    availableLabel={t.stock.available}
                    noPhotoLabel={t.stock.noPhoto}
                    compact={cardCompact}
                    onSelect={(product) => {
                      // Modal de quantidade SÓ no caminho da busca: card
                      // clicado com texto digitado na busca é "escolher um
                      // item pela busca" (pedido do CEO 2026-10-18). Grade
                      // sem busca ativa (navegação por toque) continua
                      // direto — ali o toque É o gesto, parar pra perguntar
                      // quantidade mataria a velocidade do balcão.
                      const { term } = extractMultiplierPrefix(search);
                      if (term.trim()) {
                        setQuickQuantityProduct(product);
                        return;
                      }
                      tryAdd(product, 1);
                      focusSearch();
                    }}
                  />
                ))
              )}
            </div>
          </div>

          {/* Itens do carrinho: desceram pra esta coluna, logo abaixo da
              grade (desktop/tablet only — mobile usa o drawer de sempre).

              ALTURA FIXA, não mais `min-h-[104px]` crescendo com o conteúdo
              — pedido original do CEO 2026-10-19 ("a altura de quando tem 5
              itens diferentes"), AJUSTADA no mesmo dia pra ser DERIVADA do
              viewport (teto de 5 linhas, chão de 3 — ver `cartLines` no
              `useLayoutEffect` acima): em telas mais baixas (1366×768) 5
              linhas não cabem sem rolar a página, então a tela aceita até 3.
              MEDIDO com Playwright (getBoundingClientRect): barra "Carrinho N
              itens" = 53px, cabeçalho da tabela = 32px, cada linha = 48,5px
              → `cartTableHeightPx`/`CART_HEIGHT_CLASS`. Fica CONGELADA
              durante a venda (carrinho com item) — nunca muda de linhas
              debaixo do dedo do operador. Passa do teto escolhido: fade +
              chevron por dentro (`PdvScrollFadeContainer`), SEM "ver mais"
              clicável — é scroll puro, então nunca cresce. */}
          {!isMobileCart && (
            <PdvCartItemsTable
              {...cartItemsProps}
              className={cn(CART_HEIGHT_CLASS[cartLines] ?? CART_HEIGHT_CLASS[CART_LINES_MAX], 'shrink-0')}
            />
          )}
        </div>

        {/* Coluna da direita: só o RESUMO (cliente, subtotal, desconto,
            total, aviso, ações). Sem lista de itens — ela desceu pra coluna
            dos produtos. Sem numpad no desktop (fica só no tablet). */}
        {!isMobileCart && (
          <Card className="w-full shrink-0 md:h-full md:w-80 lg:w-96">
            <CardContent className="flex h-full flex-col justify-end p-0">
              <PdvCartSummary {...cartSummaryProps} className="flex-1 overflow-y-auto" />
              {showNumpad && (
                <PdvNumpad
                  onDigit={handleNumpadDigit}
                  onMultiplier={handleNumpadMultiplier}
                  onBackspace={handleNumpadBackspace}
                  onEnter={handleSearchEnter}
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Barra fixa + drawer do carrinho (mobile) */}
      {isMobileCart && (
        <>
          {createPortal(
            <button
              type="button"
              onClick={() => setCartDrawerOpen(true)}
              className="fixed inset-x-0 z-40 flex items-center justify-between gap-3 rounded-t-xl border-t border-border bg-primary px-4 py-3 text-primary-foreground shadow-lg"
              // Portal pro <body>: `MobileTabletShell` envolve o `<Outlet />` com
              // `MobilePullToRefresh`, que aplica `transform: translateY(...)` no
              // wrapper do conteúdo (mesmo com valor 0, parado) — isso cria um
              // containing block novo pra qualquer `position: fixed` descendente,
              // e aí o `bottom` deixa de ser relativo à viewport e passa a ser
              // relativo ao fim do conteúdo da página (medido: barra aparecia a
              // ~6000px do topo). Mesma causa e mesmo remédio já documentados em
              // `FABButton.tsx`. Sem o portal, no mobile o carrinho simplesmente
              // não aparece: toca no produto e nada acontece na tela.
              //
              // Offset medido (não é mais o "96px" copiado sem medir do FAB):
              // `MobileBottomNav` ocupa 98px do rodapé da viewport (medido em
              // devtools, 844px de altura). 96px deixava a barra colada/atrás do
              // nav. 104px dá ~6px de respiro real acima do nav.
              style={{ bottom: 'calc(104px + env(safe-area-inset-bottom))' }}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <ShoppingCart className="h-4 w-4" />
                {/* key={itemCount}: reinicia a animação de entrada a cada mudança
                    de quantidade, pra dar um retorno visual imediato ao operador
                    de que o toque no produto bipou mesmo (sem precisar de toast
                    a cada item, que seria ruído em venda rápida de balcão). */}
                <span key={itemCount} className="animate-in zoom-in-90 duration-200">
                  {t.cart.itemsCount.replace('{count}', String(itemCount))}
                </span>
              </span>
              <span key={total} className="animate-in zoom-in-90 duration-200 text-lg font-extrabold tabular-nums">
                {formatCurrency(total)}
              </span>
            </button>,
            document.body,
          )}

          <Drawer open={cartDrawerOpen} onOpenChange={setCartDrawerOpen}>
            <DrawerContent className="flex max-h-[85dvh] flex-col">
              <DrawerHeader className="sr-only">
                <DrawerTitle>{t.cart.title}</DrawerTitle>
              </DrawerHeader>
              <PdvCartPanel {...cartPanelProps} className="flex-1 overflow-hidden" />
            </DrawerContent>
          </Drawer>
        </>
      )}

      <PdvPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        texts={t.payment}
        total={total}
        itemCount={cart.lines.length}
        customerName={customerName}
        customerCredit={customerCredit}
        accounts={paymentAccounts}
        canUseBankAccounts={canUseBankAccounts}
        hasOpenCashSession={hasOpenCashSession}
        hasCofreAccount={hasCofreAccount}
        onGoToCashPanel={() => navigate(PDV_PANEL_PATH)}
        onConfirm={handleFinalizeSale}
      />

      <PdvAdvancedOptionsDialog
        open={advancedOptionsOpen}
        onOpenChange={setAdvancedOptionsOpen}
        texts={t.advancedOptions}
        transactionDate={transactionDate}
        onTransactionDateChange={handleTransactionDateChange}
        maxDate={maxTransactionDate}
        pendingAttachments={pendingAttachments}
        onAttachFiles={handleAttachFiles}
        onRemoveAttachment={handleRemoveAttachment}
        attaching={attachmentBusy}
      />

      <PdvQuickQuantityDialog
        product={quickQuantityProduct}
        texts={t.quickQuantity}
        onConfirm={(product, quantity) => {
          tryAdd(product, quantity);
          setQuickQuantityProduct(null);
          focusSearch();
        }}
        onCancel={() => {
          setQuickQuantityProduct(null);
          focusSearch();
        }}
      />

      {/* Confirmação de cancelar carrinho (Esc com busca vazia, ou botão de lixeira) */}
      <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.confirmClearCart.title}</AlertDialogTitle>
            <AlertDialogDescription>{t.confirmClearCart.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.confirmClearCart.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmClearCart}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.confirmClearCart.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
