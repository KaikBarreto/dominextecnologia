import { useEffect, useRef, useState, useCallback } from 'react';
import { Wand2, Plus, Loader2, ImageIcon, X, ScanBarcode, Package, ReceiptText } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SignedImg } from '@/components/ui/SignedImg';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { supabase } from '@/integrations/supabase/client';
import { useInventory, type InventoryItem, type InventoryItemInsert } from '@/hooks/useInventory';
import { useStocks } from '@/hooks/useStocks';
import { useSuppliers } from '@/hooks/useSuppliers';
import { SupplierSelectField } from '@/components/financial/SupplierSelectField';
import { useMaterialGroups } from '@/hooks/useMaterialGroups';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { INVENTORY_UNITS as UNITS } from '@/lib/inventoryUnits';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { tenantFileOptions, currentCompanyId } from '@/utils/tenantStorage';
import { buildStorageFilePath } from '@/utils/storagePath';
import { processImageFile } from '@/utils/imageConvert';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { getErrorMessage } from '@/utils/errorMessages';
import { validateInventoryPmocProduct } from '@/lib/inventoryPmocProduct';
import { InventoryFiscalFields } from './InventoryFiscalFields';
import {
  normalizeMaterialFiscalFields,
  validateMaterialFiscalFields,
  type MaterialFiscalField,
} from '@/lib/fiscal/materialFiscal';
import { InventoryIdentifierCameraScanner } from '@/components/inventory/identifiers/InventoryIdentifierCameraScanner';
import { InventoryIdentifierManager } from '@/components/inventory/identifiers/InventoryIdentifierManager';
import { isInventoryModuleConfirmed, shouldShowInventoryPmoc } from './inventoryFormVisibility';

/** Bucket `inventory-photos`: privado, por empresa. Ver tenantStorage.ts. */
const PHOTO_BUCKET = 'inventory-photos';
/** Mesmo limite e lista de tipos da policy do bucket — validado no client
 *  ANTES do upload, pra nunca devolver o erro cru do servidor pro usuário. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
]);

interface InventoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: InventoryItem | null;
  /** ID do local ativo na tela — usado para ajuste de qty no local correto. */
  activeStockId?: string | null;
  /** Chamado quando o RPC bloqueia por presença com saldo. Recebe o item salvo e
   *  o stockId do primeiro local bloqueado, para que o pai abra a transferência
   *  com a origem correta já pré-selecionada. */
  onOpenTransfer?: (item: InventoryItem, fromStockId: string) => void;
}

/** Número salvo → texto do campo. Vazio quando 0/nulo (nunca "0" travado) e vírgula como separador. */
const toNumericText = (n?: number | null) => (!n ? '' : String(n).replace('.', ','));

const EMPTY_FISCAL_FIELDS: Pick<InventoryItemInsert, MaterialFiscalField> = {
  fiscal_ncm: null,
  fiscal_cest: null,
  fiscal_gtin: null,
  fiscal_origin: null,
  fiscal_cfop_internal: null,
  fiscal_cfop_interstate: null,
  fiscal_cfop_entry_internal: null,
  fiscal_cfop_entry_interstate: null,
  fiscal_cfop_exit_internal: null,
  fiscal_cfop_exit_interstate: null,
  fiscal_icms_code: null,
  fiscal_icms_rate: null,
  fiscal_icms_reduction_rate: null,
  fiscal_pis_cst: null,
  fiscal_cofins_cst: null,
  fiscal_ipi_cst: null,
  fiscal_ipi_rate: null,
  fiscal_pis_rate: null,
  fiscal_cofins_rate: null,
  fiscal_tax_unit: null,
  fiscal_ibs_cbs_cst: null,
};
type InventoryFormTab = 'basic' | 'stock' | 'codes' | 'pmoc' | 'fiscal';

const FORM_COPY = {
  'pt-br': { titleNew: 'Adicionar material', titleEdit: 'Editar material', basic: 'Dados básicos', basicShort: 'Cadastro', stock: 'Estoque e preços', stockShort: 'Estoque', codes: 'Códigos e etiquetas', codesShort: 'Códigos', primaryCode: 'Código principal', primaryPdvHint: 'Use o código da embalagem unitária para localizar este material no caixa.', primaryOptionalHint: 'Opcional para leitor, câmera, inventário ou impressão de etiquetas.', saveForCodes: 'Salve o material para gerar o código interno, cadastrar embalagens, QR Codes e imprimir etiquetas.', pmocDisabled: 'Ative esta opção somente para produtos que precisam constar nos documentos PMOC.' },
  en: { titleNew: 'Add material', titleEdit: 'Edit material', basic: 'Basic details', basicShort: 'Details', stock: 'Inventory and prices', stockShort: 'Inventory', codes: 'Codes and labels', codesShort: 'Codes', primaryCode: 'Primary code', primaryPdvHint: 'Use the unit package code to find this material at checkout.', primaryOptionalHint: 'Optional for scanners, camera, inventory counts, or label printing.', saveForCodes: 'Save the material to generate its internal code, add packages and QR Codes, and print labels.', pmocDisabled: 'Enable this only for products that must appear in PMOC documents.' },
  es: { titleNew: 'Añadir material', titleEdit: 'Editar material', basic: 'Datos básicos', basicShort: 'Registro', stock: 'Existencias y precios', stockShort: 'Existencias', codes: 'Códigos y etiquetas', codesShort: 'Códigos', primaryCode: 'Código principal', primaryPdvHint: 'Usa el código del envase unitario para localizar este material en caja.', primaryOptionalHint: 'Opcional para lector, cámara, inventario o impresión de etiquetas.', saveForCodes: 'Guarda el material para generar su código interno, añadir envases y códigos QR e imprimir etiquetas.', pmocDisabled: 'Activa esta opción solo para productos que deban constar en documentos PMOC.' },
  fr: { titleNew: 'Ajouter un matériel', titleEdit: 'Modifier le matériel', basic: 'Données générales', basicShort: 'Général', stock: 'Stock et prix', stockShort: 'Stock', codes: 'Codes et étiquettes', codesShort: 'Codes', primaryCode: 'Code principal', primaryPdvHint: `Utilisez le code de l'emballage unitaire pour retrouver ce matériel en caisse.`, primaryOptionalHint: `Optionnel pour le lecteur, la caméra, l'inventaire ou l'impression d'étiquettes.`, saveForCodes: `Enregistrez le matériel pour générer son code interne, ajouter des emballages et des QR Codes, puis imprimer des étiquettes.`, pmocDisabled: `Activez cette option uniquement pour les produits qui doivent figurer dans les documents PMOC.` },
} as const;

export function InventoryFormDialog({ open, onOpenChange, item, activeStockId, onOpenTransfer }: InventoryFormDialogProps) {
  const { locale } = useAppLocaleContext();
  const ui = FORM_COPY[locale];
  const t = MESSAGES[locale].app.inventory.formDialog;
  const { toast } = useToast();
  const { createItem, updateItem, getMinQuantityForStock, getQuantityForStock, updateStockLevelMinQuantity, getPresenceForStock, setInventoryPresence, stockLevelsLoaded } = useInventory();
  const { stocks, isLoading: stocksLoading } = useStocks();
  const { suppliers } = useSuppliers();
  const { groups, createGroup } = useMaterialGroups();
  const { hasModule, isLoading: modulesLoading } = useCompanyModules();
  // Fail-closed: recursos próprios do PDV só aparecem depois que a fonte
  // canônica de módulos terminou de carregar e confirmou o acesso.
  const pdvEnabled = isInventoryModuleConfirmed(modulesLoading, hasModule('pdv'));
  const showPmocSection = shouldShowInventoryPmoc({
    modulesLoading,
    contractsAllowed: hasModule('contracts'),
    item,
  });
  const isEditing = !!item;
  const quantityBaseRef = useRef(0);
  const quantityChangedRef = useRef(false);

  const [formData, setFormData] = useState<Partial<InventoryItemInsert>>({
    name: '', sku: '', category: '', group_id: null, description: '', quantity: 0, unit: 'un', cost_price: 0, sale_price: 0, supplier_id: null,
    is_pmoc_product: false, pmoc_manufacturer: null, pmoc_anvisa_registration: null,
    pmoc_batch_number: null, pmoc_manufactured_on: null, pmoc_expires_on: null,
    ...EMPTY_FISCAL_FIELDS,
  });
  const [isSkuGenerating, setIsSkuGenerating] = useState(false);
  // Quick-create de grupo de material (botão "+" ao lado do seletor).
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');

  // ── Foto (bucket privado inventory-photos) ─────────────────────────────
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  // Pasta do item NOVO ainda sem id: um uuid de sessão (a policy exige
  // `<company_id>/<algo>/<arquivo>`, e o plano permite uuid quando o
  // inventory_id ainda não existe). Reaproveitado se o usuário troca a foto
  // mais de uma vez antes de salvar; sorteado de novo a cada abertura "Novo".
  const newItemPhotoFolderRef = useRef(crypto.randomUUID());

  // ── Código de barras: texto + is_sellable (PDV) ─────────────────────────
  const [barcode, setBarcode] = useState('');
  const [isSellable, setIsSellable] = useState(true);
  const [activeTab, setActiveTab] = useState<InventoryFormTab>('basic');
  const codesExpanded = activeTab === 'codes';
  const nameInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const pmocManufacturerRef = useRef<HTMLInputElement>(null);
  const pmocAnvisaRef = useRef<HTMLInputElement>(null);
  const pmocManufacturedOnRef = useRef<HTMLInputElement>(null);
  const pmocExpiresOnRef = useRef<HTMLInputElement>(null);

  // O cadastro sempre abre nos dados básicos. Códigos continuam disponíveis
  // para inventário/etiquetas, mas só capturam leitor quando a aba é escolhida.
  useEffect(() => {
    if (!open) return;
    setActiveTab('basic');
  }, [open, item?.id]);

  // Leitor USB (pistola): ativo só enquanto este diálogo está aberto e o
  // quick-create de grupo (dialog aninhado) não está. onScan sobrescreve o
  // campo e devolve o foco pra ele — "quem consome é dono de limpar o
  // próprio estado", conforme o contrato do hook.
  useBarcodeScanner({
    enabled: open && codesExpanded && !groupFormOpen,
    onScan: (code) => {
      setBarcode(code);
      barcodeInputRef.current?.focus();
    },
  });

  // Texto CRU dos campos numéricos (quantidade e preços). O número em formData segue
  // sendo o que vai pro save; este espelho existe porque um input controlado por NUMBER
  // engole o separador no meio da digitação: "17," volta pra 17, o campo re-renderiza
  // "17" e o usuário, digitando 17,99 naturalmente, acabava salvando 1799.
  // Régua: guardar string crua no estado, parsear só no uso — igual ao stockMinQtyMap.
  const [numericText, setNumericText] = useState<Record<'quantity' | 'cost_price' | 'sale_price', string>>({
    quantity: '', cost_price: '', sale_price: '',
  });

  // Estado de mínimo por estoque: { [stockId]: string (raw numeric) }
  const [stockMinQtyMap, setStockMinQtyMap] = useState<Record<string, string>>({});

  // Estado de presença por estoque: { [stockId]: boolean } — default true para todos
  const [stockPresenceMap, setStockPresenceMap] = useState<Record<string, boolean>>({});

  // Trava de hidratação: presença/mínimo só são lidos do banco DEPOIS de
  // stockLevels (fonte de verdade) e stocks terem carregado — nunca a partir
  // do default permissivo de getPresenceForStock (true quando o level ainda
  // não chegou). `hydratedRef` garante UMA hidratação por abertura, pra um
  // refetch em background não sobrescrever o que o usuário já mexeu na tela.
  // `stocksHydrated` (estado, não ref) é o que a UI usa pra alternar entre
  // skeleton/controles desabilitados e a lista real, e pra travar o Salvar.
  const hydratedRef = useRef(false);
  const [stocksHydrated, setStocksHydrated] = useState(false);
  const stocksSectionReady = stockLevelsLoaded && !stocksLoading;

  const getNextSequentialSku = async (): Promise<string> => {
    const { data, error } = await supabase.from('inventory').select('sku, created_at').is('customer_id', null).ilike('sku', 'EST-%').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    let max = 0;
    for (const row of data ?? []) {
      const match = (row.sku ?? '').match(/^EST-(\d+)$/);
      if (match) { const n = Number(match[1]); if (Number.isFinite(n)) max = Math.max(max, n); }
    }
    return `EST-${String(max + 1).padStart(3, '0')}`;
  };

  const applyAutoSku = async () => {
    setIsSkuGenerating(true);
    try { const sku = await getNextSequentialSku(); setFormData(prev => ({ ...prev, sku })); }
    catch (e) { console.error('Erro ao gerar SKU automático', e); }
    finally { setIsSkuGenerating(false); }
  };

  // Inicializa o mapa de mínimos por estoque (edição: lê do hook; criação: vazio)
  const initStockMinMap = useCallback(() => {
    if (item) {
      const map: Record<string, string> = {};
      for (const s of stocks) {
        const min = getMinQuantityForStock(item.id, s.id);
        map[s.id] = min != null ? String(min) : '';
      }
      setStockMinQtyMap(map);
    } else {
      const map: Record<string, string> = {};
      for (const s of stocks) { map[s.id] = ''; }
      setStockMinQtyMap(map);
    }
  }, [item, stocks, getMinQuantityForStock]);

  // Inicializa o mapa de presença (edição: lê do hook; criação: todos marcados por padrão)
  const initStockPresenceMap = useCallback(() => {
    const map: Record<string, boolean> = {};
    for (const s of stocks) {
      // Na criação, todos presentes por padrão. Na edição, lê o estado real.
      map[s.id] = item ? getPresenceForStock(item.id, s.id) : true;
    }
    setStockPresenceMap(map);
  }, [item, stocks, getPresenceForStock]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (item) {
        setFormData({
          name: item.name, sku: item.sku || '', category: item.category || '', group_id: item.group_id || null,
          description: item.description || '', quantity: 0, unit: item.unit || 'un',
          cost_price: item.cost_price || 0, sale_price: item.sale_price || 0, supplier_id: item.supplier_id ?? null,
          is_pmoc_product: item.is_pmoc_product,
          pmoc_manufacturer: item.pmoc_manufacturer,
          pmoc_anvisa_registration: item.pmoc_anvisa_registration,
          pmoc_batch_number: item.pmoc_batch_number,
          pmoc_manufactured_on: item.pmoc_manufactured_on,
          pmoc_expires_on: item.pmoc_expires_on,
          fiscal_ncm: item.fiscal_ncm,
          fiscal_cest: item.fiscal_cest,
          fiscal_gtin: item.fiscal_gtin,
          fiscal_origin: item.fiscal_origin,
          fiscal_cfop_internal: item.fiscal_cfop_internal,
          fiscal_cfop_interstate: item.fiscal_cfop_interstate,
          fiscal_cfop_entry_internal: item.fiscal_cfop_entry_internal,
          fiscal_cfop_entry_interstate: item.fiscal_cfop_entry_interstate,
          fiscal_cfop_exit_internal: item.fiscal_cfop_exit_internal,
          fiscal_cfop_exit_interstate: item.fiscal_cfop_exit_interstate,
          fiscal_icms_code: item.fiscal_icms_code,
          fiscal_icms_rate: item.fiscal_icms_rate,
          fiscal_icms_reduction_rate: item.fiscal_icms_reduction_rate,
          fiscal_pis_cst: item.fiscal_pis_cst,
          fiscal_cofins_cst: item.fiscal_cofins_cst,
          fiscal_ipi_cst: item.fiscal_ipi_cst,
          fiscal_ipi_rate: item.fiscal_ipi_rate,
          fiscal_pis_rate: item.fiscal_pis_rate,
          fiscal_cofins_rate: item.fiscal_cofins_rate,
          fiscal_tax_unit: item.fiscal_tax_unit,
          fiscal_ibs_cbs_cst: item.fiscal_ibs_cbs_cst,
        });
        setNumericText({
          quantity: '',
          cost_price: toNumericText(item.cost_price),
          sale_price: toNumericText(item.sale_price),
        });
        setPhotoUrl(item.image_url || '');
        setBarcode(item.barcode || '');
        setIsSellable(item.is_sellable ?? true);
        return;
      }
      setFormData({
        name: '', sku: '', category: '', group_id: null, description: '', quantity: 0, unit: 'un',
        cost_price: 0, sale_price: 0, supplier_id: null, is_pmoc_product: false,
        pmoc_manufacturer: null, pmoc_anvisa_registration: null, pmoc_batch_number: null,
        pmoc_manufactured_on: null, pmoc_expires_on: null,
        ...EMPTY_FISCAL_FIELDS,
      });
      setNumericText({ quantity: '', cost_price: '', sale_price: '' });
      setPhotoUrl('');
      setBarcode('');
      setIsSellable(true);
      newItemPhotoFolderRef.current = crypto.randomUUID();
      if (!open) return;
      try {
        setIsSkuGenerating(true);
        const sku = await getNextSequentialSku();
        if (!cancelled) setFormData(prev => ({ ...prev, sku }));
      } catch (e) { console.error('Erro ao gerar SKU automático', e); }
      finally { if (!cancelled) setIsSkuGenerating(false); }
    };
    run();
    return () => { cancelled = true; };
  }, [item, open]);

  // Zera a trava de hidratação a cada abertura (ou troca de item) — a próxima
  // passagem pelo efeito abaixo hidrata de novo, do zero.
  useEffect(() => {
    hydratedRef.current = false;
    quantityChangedRef.current = false;
    setStocksHydrated(false);
  }, [open, item, activeStockId]);

  // Hidrata presença + mínimo por estoque UMA VEZ por abertura, e só quando
  // stocksSectionReady (stockLevels e stocks já carregados) — nunca antes.
  // É a correção do bug: sem essa trava, abrir o modal antes da query de
  // stockLevels resolver fazia getPresenceForStock cair no default permissivo
  // (true) pra todo local, e um refetch posterior nunca re-hidratava o mapa —
  // o usuário salvava presença errada por cima da configuração real.
  useEffect(() => {
    if (!open) return;
    if (hydratedRef.current) return;
    if (!stocksSectionReady) return;
    initStockMinMap();
    initStockPresenceMap();
    const localQuantity = item && activeStockId ? getQuantityForStock(item.id, activeStockId) : 0;
    quantityBaseRef.current = localQuantity;
    setFormData((previous) => ({ ...previous, quantity: localQuantity }));
    setNumericText((previous) => ({ ...previous, quantity: toNumericText(localQuantity) }));
    hydratedRef.current = true;
    setStocksHydrated(true);
    // initStockMinMap/initStockPresenceMap mudam de identidade a cada render
    // (dependem de getPresenceForStock/getMinQuantityForStock, recriadas a
    // cada chamada de useInventory()) — não entram nas deps pra não disparar
    // o efeito em todo render; o gate real é open + stocksSectionReady, com
    // hydratedRef travando a segunda execução.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stocksSectionReady, item, activeStockId]);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    // Trava dura: nunca deixa salvar presença/mínimo em cima de um mapa não
    // hidratado (cobre também o Enter dentro do <form>, que dispara o submit
    // sem passar pelo botão Salvar fora dele).
    if (!stocksHydrated) return;
    if (!formData.name?.trim()) {
      setActiveTab('basic');
      window.requestAnimationFrame(() => nameInputRef.current?.reportValidity());
      return;
    }
    let savedItemId: string | null = null;

    const fiscalValidationError = validateMaterialFiscalFields(formData);
    if (fiscalValidationError) {
      setActiveTab('fiscal');
      toast({ variant: 'destructive', title: 'Revise os dados fiscais', description: fiscalValidationError });
      return;
    }

    const pmocValidationError = validateInventoryPmocProduct({
      isPmocProduct: formData.is_pmoc_product === true,
      manufacturer: formData.pmoc_manufacturer,
      anvisaRegistration: formData.pmoc_anvisa_registration,
      batchNumber: formData.pmoc_batch_number,
      manufacturedOn: formData.pmoc_manufactured_on,
      expiresOn: formData.pmoc_expires_on,
    });
    if (pmocValidationError) {
      setActiveTab('pmoc');
      window.requestAnimationFrame(() => {
        const target = {
          manufacturer_required: pmocManufacturerRef,
          anvisa_required: pmocAnvisaRef,
          expiration_required: pmocExpiresOnRef,
          manufacture_after_expiration: pmocManufacturedOnRef,
        }[pmocValidationError];
        target.current?.focus();
      });
      toast({
        variant: 'destructive',
        title: t.pmocValidation.title,
        description: t.pmocValidation[pmocValidationError],
      });
      return;
    }

    // Normaliza SKU e código de barras: vazio/só espaços → null, para não
    // colidir com os índices únicos parciais (company_id, sku) / (company_id, barcode).
    const normalized = {
      ...formData,
      sku: formData.sku?.trim() ? formData.sku.trim() : null,
      barcode: barcode.trim() ? barcode.trim() : null,
      image_url: photoUrl || null,
      is_pmoc_product: formData.is_pmoc_product === true,
      pmoc_manufacturer: formData.pmoc_manufacturer?.trim() || null,
      pmoc_anvisa_registration: formData.pmoc_anvisa_registration?.trim() || null,
      pmoc_batch_number: formData.pmoc_batch_number?.trim() || null,
      pmoc_manufactured_on: formData.pmoc_manufactured_on || null,
      pmoc_expires_on: formData.pmoc_expires_on || null,
      // is_sellable só é editável com o módulo PDV; sem o módulo, nunca
      // sobrescreve o default (true) da coluna com um estado que a tela nem mostrou.
      ...(pdvEnabled ? { is_sellable: isSellable } : {}),
      ...normalizeMaterialFiscalFields(formData),
    };

    if (isEditing && item) {
      // Cadastro e preço não reenviam saldo; somente a edição explícita ajusta o local.
      const { quantity, ...catalogFields } = normalized;
      await updateItem.mutateAsync({
        id: item.id,
        ...catalogFields,
        ...(activeStockId && quantityChangedRef.current ? {
          quantity,
          previousQuantity: quantityBaseRef.current,
          activeStockId,
        } : {}),
      });
      savedItemId = item.id;
    } else {
      // Extrai a quantidade inicial do formData — ela NÃO vai no payload do catálogo
      // (quantity fica 0 na tabela; o saldo real nasce pela RPC de entrada no hook).
      const { quantity: initialQty, ...catalogFields } = normalized;
      const created = await createItem.mutateAsync({
        ...(catalogFields as InventoryItemInsert),
        initialQuantity: initialQty ?? 0,
        activeStockId: activeStockId ?? null,
      });
      savedItemId = created?.id ?? null;
    }

    // Grava min_quantity por estoque (somente locais que têm valor informado).
    if (savedItemId) {
      for (const s of stocks) {
        const rawMin = stockMinQtyMap[s.id] ?? '';
        const minVal = rawMin.trim() === '' ? null : (parseFloat(rawMin.replace(',', '.')) || 0);
        if (isEditing) {
          const prevMin = getMinQuantityForStock(savedItemId, s.id);
          if (minVal !== prevMin) {
            await updateStockLevelMinQuantity.mutateAsync({ inventoryId: savedItemId, stockId: s.id, minQuantity: minVal });
          }
        } else if (minVal !== null) {
          await updateStockLevelMinQuantity.mutateAsync({ inventoryId: savedItemId, stockId: s.id, minQuantity: minVal });
        }
      }

      // Grava presença por estoque (locais marcados). Só considera chaves que
      // EXISTEM no mapa — ausente do mapa nunca é tratado como presente (era
      // exatamente esse default cego que corrompia a presença real).
      const presentStockIds = stocks
        .filter((s) => s.id in stockPresenceMap && stockPresenceMap[s.id] === true)
        .map((s) => s.id);
      try {
        const presenceChanged = !item || stocks.some((stock) =>
          stockPresenceMap[stock.id] !== getPresenceForStock(item.id, stock.id));
        if (presenceChanged) {
          await setInventoryPresence.mutateAsync({ inventoryId: savedItemId, stockIds: presentStockIds });
        }
      } catch (err: unknown) {
        const msg = String((err as Error).message ?? '');
        if (msg.includes('presence_has_balance')) {
          // Extrai os nomes dos locais bloqueados do token: presence_has_balance: nome1, nome2
          const afterToken = msg.split('presence_has_balance:')[1] ?? '';
          const blockedNames = afterToken.trim() || '?';
          toast({
            variant: 'destructive',
            title: t.presenceError.title.replace('{names}', blockedNames),
            description: `${t.presenceError.description} ${t.presenceError.transfer}.`,
          });
          // Se o pai forneceu callback de transferência, tenta abrir com o local correto
          if (onOpenTransfer && savedItemId) {
            // Encontra o primeiro stock cujo nome aparece nos bloqueados
            const blockedStock = stocks.find((s) => blockedNames.includes(s.name));
            if (blockedStock) {
              // Monta um InventoryItem mínimo para o dialog de transferência
              const transferItem = item ?? { id: savedItemId, name: formData.name ?? '', sku: formData.sku ?? null, unit: formData.unit ?? 'un' } as InventoryItem;
              onOpenChange(false);
              onOpenTransfer(transferItem, blockedStock.id);
              return;
            }
          }
          // Não fechar o modal quando não há callback — deixa o usuário corrigir
          return;
        }
        throw err;
      }
    }

    onOpenChange(false);
  };

  const handleChange = (field: keyof InventoryItemInsert, value: string | number | boolean | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePmocProductChange = (enabled: boolean) => {
    setFormData((prev) => ({
      ...prev,
      is_pmoc_product: enabled,
      ...(enabled ? {} : {
        pmoc_manufacturer: null,
        pmoc_anvisa_registration: null,
        pmoc_batch_number: null,
        pmoc_manufactured_on: null,
        pmoc_expires_on: null,
      }),
    }));
  };

  // Atualiza o texto exibido E o número salvo. O texto é a fonte do que aparece na tela
  // (preserva "17," durante a digitação); o número é derivado dele.
  const handleNumericChange = (field: 'quantity' | 'cost_price' | 'sale_price', raw: string) => {
    setNumericText(prev => ({ ...prev, [field]: raw }));
    handleChange(field, raw.trim() === '' ? 0 : (parseFloat(raw.replace(',', '.')) || 0));
  };

  /**
   * Upload da foto do item pro bucket privado `inventory-photos`.
   * Valida tipo ANTES de processar (HEIC/HEIF entra aqui como válido e sai
   * convertido em JPEG por `processImageFile`) e tamanho DEPOIS de comprimir
   * (é o que de fato sobe). O caminho começa com o company_id — exigência da
   * policy — seguido do id do item (ou de um uuid de sessão, pra item ainda
   * não salvo).
   */
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const looksHeic = /\.(heic|heif)$/i.test(file.name);
    if (!ALLOWED_PHOTO_MIME.has(file.type) && !looksHeic) {
      toast({ variant: 'destructive', title: t.fields.photoErrorType });
      return;
    }

    setUploadingPhoto(true);
    try {
      const processed = await processImageFile(file);
      if (processed.size > MAX_PHOTO_BYTES) {
        toast({ variant: 'destructive', title: t.fields.photoErrorSize });
        return;
      }

      const companyId = await currentCompanyId();
      if (!companyId) throw new Error('Empresa não encontrada para o usuário.');

      const folderId = item?.id || newItemPhotoFolderRef.current;
      const path = buildStorageFilePath({ folder: `${companyId}/${folderId}`, fileName: processed.name });

      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, processed, await tenantFileOptions({ contentType: processed.type || undefined }));
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
      setPhotoUrl(publicUrl);
    } catch (err) {
      toast({ variant: 'destructive', title: t.fields.photoErrorUpload, description: getErrorMessage(err) });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = () => setPhotoUrl('');

  const allPresent = stocks.length > 0 && stocks.every((s) => stockPresenceMap[s.id] !== false);
  const nonePresent = stocks.length > 0 && stocks.every((s) => stockPresenceMap[s.id] === false);

  const handleMarkAll = () => {
    const map: Record<string, boolean> = {};
    for (const s of stocks) { map[s.id] = true; }
    setStockPresenceMap(map);
  };

  const handleUnmarkAll = () => {
    const map: Record<string, boolean> = {};
    for (const s of stocks) { map[s.id] = false; }
    setStockPresenceMap(map);
  };

  const isPending = createItem.isPending || updateItem.isPending || updateStockLevelMinQuantity.isPending || setInventoryPresence.isPending;
  const modalTitle = isEditing ? ui.titleEdit : ui.titleNew;

  return (
    <>
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={modalTitle}
      className="sm:!max-w-[1040px]"
      drawerClassName="h-[90dvh]"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1" disabled={isPending}>{t.cancel}</Button>
          <Button onClick={handleSubmit} disabled={isPending || !stocksHydrated} className="flex-1">
            {isPending ? t.saving : t.save}
          </Button>
        </div>
      }
    >
      <form id="inventory-material-form" onSubmit={handleSubmit}>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as InventoryFormTab)}>
          <TabsList variant="underline" wrapperClassName="sticky top-0 z-10 bg-background" className="w-full">
            <TabsTrigger value="basic" variant="underline"><span className="sm:hidden">{ui.basicShort}</span><span className="hidden sm:inline">{ui.basic}</span></TabsTrigger>
            <TabsTrigger value="stock" variant="underline"><span className="sm:hidden">{ui.stockShort}</span><span className="hidden sm:inline">{ui.stock}</span></TabsTrigger>
            <TabsTrigger value="codes" variant="underline"><span className="sm:hidden">{ui.codesShort}</span><span className="hidden sm:inline">{ui.codes}</span></TabsTrigger>
            {showPmocSection && <TabsTrigger value="pmoc" variant="underline">PMOC</TabsTrigger>}
            <TabsTrigger value="fiscal" variant="underline"><ReceiptText className="mr-2 h-4 w-4" />Fiscal</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="mt-0 space-y-5 pt-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)]">
              <div className="space-y-2">
                <Label htmlFor="inventory-material-name">{t.fields.name}</Label>
                <Input id="inventory-material-name" ref={nameInputRef} value={formData.name} onChange={(e) => handleChange('name', e.target.value)} placeholder={t.fields.namePlaceholder} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inventory-material-sku">{t.fields.sku}</Label>
                <div className="flex items-center gap-2">
                  <Input id="inventory-material-sku" className="min-w-0 flex-1" value={formData.sku || ''} onChange={(e) => handleChange('sku', e.target.value)} placeholder={t.fields.skuPlaceholder} />
                  <Button type="button" variant="outline" size="sm" className="h-10 shrink-0 px-3" onClick={applyAutoSku} disabled={isEditing || isSkuGenerating}>
                    <Wand2 className="mr-1 h-4 w-4" />{isSkuGenerating ? t.fields.skuGenerating : t.fields.skuAuto}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t.fields.skuHint}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t.fields.group}</Label>
                <div className="flex h-10 items-center rounded-md border border-input bg-background ring-offset-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
                  <SearchableSelect
                    value={formData.group_id ?? ''}
                    onValueChange={(value) => handleChange('group_id', value || null)}
                    onSearchChange={setGroupSearchQuery}
                    placeholder={t.fields.groupPlaceholder}
                    searchPlaceholder={t.fields.groupSearchPlaceholder}
                    className="h-10 min-w-0 flex-1 justify-between rounded-none rounded-l-md border-0 bg-transparent px-3 font-normal text-foreground shadow-none hover:bg-transparent hover:text-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                    options={groups.map((g) => ({
                      value: g.id,
                      label: g.name,
                      icon: <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: g.color ?? '#6B7280' }} />,
                    }))}
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => setGroupFormOpen(true)} className="h-10 w-10 shrink-0 rounded-none rounded-r-md border-l border-input text-muted-foreground hover:bg-primary hover:text-primary-foreground focus-visible:ring-0 focus-visible:ring-offset-0" aria-label={t.fields.groupCreateAlways}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="inventory-supplier">{t.fields.supplier}</Label>
                <SupplierSelectField id="inventory-supplier" suppliers={suppliers} value={formData.supplier_id || ''} onValueChange={(id) => handleChange('supplier_id', id || null)} placeholder={t.fields.supplierPlaceholder} searchPlaceholder={t.fields.supplierSearchPlaceholder} emptyMessage={t.fields.supplierEmpty} createAriaLabel={t.fields.supplierCreateAriaLabel} />
                {!formData.supplier_id && item?.supplier && <p className="text-xs text-muted-foreground">{t.fields.supplierLegacy.replace('{name}', item.supplier)}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inventory-material-description">{t.fields.description}</Label>
              <Textarea id="inventory-material-description" value={formData.description || ''} onChange={(e) => handleChange('description', e.target.value)} placeholder={t.fields.descriptionPlaceholder} rows={3} />
            </div>

            <section className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center">
              <button type="button" onClick={() => photoUrl && setPhotoViewerOpen(true)} disabled={uploadingPhoto || !photoUrl} className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-input bg-muted disabled:cursor-default" aria-label={t.fields.photo}>
                {photoUrl ? <SignedImg src={photoUrl} alt={formData.name || t.fields.photo} className="h-20 w-20 object-cover" /> : <ImageIcon className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />}
                {uploadingPhoto && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Loader2 className="h-5 w-5 animate-spin text-white" /></div>}
                {photoUrl && !uploadingPhoto && <span role="button" tabIndex={0} aria-label={t.fields.photoRemove} onClick={(e) => { e.stopPropagation(); handleRemovePhoto(); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); handleRemovePhoto(); } }} className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"><X className="h-3 w-3" /></span>}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t.fields.photo}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t.fields.photoHint}</p>
              </div>
              <label className={uploadingPhoto ? 'pointer-events-none opacity-60' : undefined}>
                <Button type="button" variant="outline" size="sm" asChild disabled={uploadingPhoto}><span>{photoUrl ? t.fields.photoChange : t.fields.photoAdd}</span></Button>
                <input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
              </label>
            </section>
          </TabsContent>

          <TabsContent value="stock" className="mt-0 space-y-6 pt-5">
            {pdvEnabled && (
              <div className="flex items-start justify-between gap-4 border-b pb-5">
                <div>
                  <p className="text-sm font-semibold">{t.fields.isSellable}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t.fields.isSellableHint}</p>
                </div>
                <LabeledSwitch value={isSellable ? 'on' : 'off'} onChange={(v) => setIsSellable(v === 'on')} off={{ value: 'off', label: t.fields.isSellableOff }} on={{ value: 'on', label: t.fields.isSellableOn }} aria-label={t.fields.isSellable} />
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inventory-local-quantity">{t.fields.quantity}</Label>
                <NumericInput id="inventory-local-quantity" decimal value={numericText.quantity} disabled={!activeStockId || !stocksHydrated} onValueChange={(v) => { quantityChangedRef.current = true; handleNumericChange('quantity', v); }} />
                <p className="text-xs text-muted-foreground">{activeStockId
                  ? `Saldo em ${stocks.find((stock) => stock.id === activeStockId)?.name ?? 'local selecionado'}. Preços e cadastro valem para todos os locais.`
                  : 'Cadastro e preços valem para todos os locais. Para alterar quantidades, use Registrar entrada ou Registrar saída e escolha o local.'}</p>
              </div>
              <div className="space-y-2">
                <Label>{t.fields.unit}</Label>
                <Select value={formData.unit || 'un'} onValueChange={(value) => handleChange('unit', value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{UNITS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-2">
                <Label>{t.fields.costPrice}</Label>
                <NumericInput decimal maxDecimals={2} value={numericText.cost_price} onValueChange={(v) => handleNumericChange('cost_price', v)} />
                <p className="text-xs text-muted-foreground">{t.fields.priceHint}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="inventory-sale-price">{t.fields.salePrice}</Label>
                <NumericInput id="inventory-sale-price" decimal maxDecimals={2} value={numericText.sale_price} onValueChange={(v) => handleNumericChange('sale_price', v)} />
                <p className="text-xs text-muted-foreground">{t.fields.priceHint}</p>
              </div>
            </div>

            {stocks.length > 0 && (
              <div className="space-y-3 border-t pt-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div><Label className="text-sm font-semibold">{t.fields.minQtyPerStockLabel}</Label><p className="mt-0.5 text-xs text-muted-foreground">{t.fields.minQtyPerStockHint}</p></div>
                  {stocks.length > 1 && <div className="flex shrink-0 items-center gap-1.5"><Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleMarkAll} disabled={!stocksHydrated || allPresent}>{t.fields.markAll}</Button><Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleUnmarkAll} disabled={!stocksHydrated || nonePresent}>{t.fields.unmarkAll}</Button></div>}
                </div>
                {stocksHydrated ? (
                  <div className="divide-y border-y">
                    {stocks.map((s) => {
                      const isPresent = stockPresenceMap[s.id] !== false;
                      return <div key={s.id} className="flex items-center gap-3 py-3"><Checkbox id={`presence-${s.id}`} checked={isPresent} onCheckedChange={(checked) => setStockPresenceMap((prev) => ({ ...prev, [s.id]: !!checked }))} className="shrink-0" /><div className="min-w-0 flex-1"><label htmlFor={`presence-${s.id}`} className="block cursor-pointer truncate text-sm font-medium">{s.name}</label>{s.is_default && <p className="text-xs text-muted-foreground">{t.fields.minQtyDefaultBadge}</p>}</div><div className="w-28 shrink-0"><NumericInput decimal value={stockMinQtyMap[s.id] ?? ''} onValueChange={(v) => setStockMinQtyMap((prev) => ({ ...prev, [s.id]: v }))} placeholder={t.fields.minQtyPlaceholder} className="h-8 text-sm" disabled={!isPresent} /></div></div>;
                    })}
                  </div>
                ) : (
                  <div className="divide-y border-y">{stocks.map((s) => <div key={s.id} className="flex items-center gap-3 py-3"><Skeleton className="h-4 w-4 shrink-0 rounded-sm" /><div className="min-w-0 flex-1"><Skeleton className="h-4 w-32" /></div><Skeleton className="h-8 w-28 shrink-0 rounded-md" /></div>)}</div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="codes" className="mt-0 space-y-5 pt-5">
            <div>
              <h3 className="text-sm font-semibold">{ui.primaryCode}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{pdvEnabled ? ui.primaryPdvHint : ui.primaryOptionalHint}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventory-barcode">{t.fields.barcode}</Label>
              <div className="flex gap-2">
                <Input id="inventory-barcode" ref={barcodeInputRef} value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder={t.fields.barcodePlaceholder} className="flex-1" inputMode="text" autoComplete="off" data-form-type="other" />
                <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => barcodeInputRef.current?.focus()} aria-label={t.fields.barcodeScanButton} title={t.fields.barcodeScanButton}><ScanBarcode className="h-4 w-4" /></Button>
              </div>
              <p className="text-xs text-muted-foreground">{t.fields.barcodeScanHint}</p>
              <InventoryIdentifierCameraScanner className="pt-1" onScan={(code) => { setBarcode(code); barcodeInputRef.current?.focus(); }} disabled={isPending} />
            </div>
            {isEditing && item ? <InventoryIdentifierManager inventoryId={item.id} embedded /> : <p className="border-t pt-4 text-sm text-muted-foreground">{ui.saveForCodes}</p>}
          </TabsContent>

          {showPmocSection && (
            <TabsContent value="pmoc" className="mt-0 space-y-5 pt-5">
              <div className="flex items-start justify-between gap-4 border-b pb-5">
                <div><p className="text-sm font-semibold">{t.fields.isPmocProduct}</p><p className="mt-1 text-xs text-muted-foreground">{t.fields.isPmocProductHint}</p></div>
                <LabeledSwitch value={formData.is_pmoc_product ? 'on' : 'off'} onChange={(value) => handlePmocProductChange(value === 'on')} off={{ value: 'off', label: t.fields.isPmocProductOff }} on={{ value: 'on', label: t.fields.isPmocProductOn }} aria-label={t.fields.isPmocProduct} />
              </div>
              {formData.is_pmoc_product ? (
                <div className="space-y-4">
                  <div><p className="text-sm font-semibold">{t.fields.pmocSectionTitle}</p><p className="mt-1 text-xs text-muted-foreground">{t.fields.pmocSectionHint}</p></div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2"><Label htmlFor="inventory-pmoc-manufacturer">{t.fields.pmocManufacturer}</Label><Input id="inventory-pmoc-manufacturer" ref={pmocManufacturerRef} value={formData.pmoc_manufacturer || ''} onChange={(event) => handleChange('pmoc_manufacturer', event.target.value)} placeholder={t.fields.pmocManufacturerPlaceholder} required /></div>
                    <div className="space-y-2"><Label htmlFor="inventory-pmoc-anvisa">{t.fields.pmocAnvisaRegistration}</Label><Input id="inventory-pmoc-anvisa" ref={pmocAnvisaRef} value={formData.pmoc_anvisa_registration || ''} onChange={(event) => handleChange('pmoc_anvisa_registration', event.target.value)} placeholder={t.fields.pmocAnvisaRegistrationPlaceholder} required /></div>
                    <div className="space-y-2"><Label htmlFor="inventory-pmoc-batch">{t.fields.pmocBatchNumber}</Label><Input id="inventory-pmoc-batch" value={formData.pmoc_batch_number || ''} onChange={(event) => handleChange('pmoc_batch_number', event.target.value)} placeholder={t.fields.pmocBatchNumberPlaceholder} /></div>
                    <div className="space-y-2"><Label htmlFor="inventory-pmoc-manufactured-on">{t.fields.pmocManufacturedOn}</Label><Input id="inventory-pmoc-manufactured-on" ref={pmocManufacturedOnRef} type="date" value={formData.pmoc_manufactured_on || ''} onChange={(event) => handleChange('pmoc_manufactured_on', event.target.value || null)} /></div>
                    <div className="space-y-2"><Label htmlFor="inventory-pmoc-expires-on">{t.fields.pmocExpiresOn}</Label><Input id="inventory-pmoc-expires-on" ref={pmocExpiresOnRef} type="date" value={formData.pmoc_expires_on || ''} onChange={(event) => handleChange('pmoc_expires_on', event.target.value || null)} required /><p className="text-xs text-muted-foreground">{t.fields.pmocExpiresOnHint}</p></div>
                  </div>
                </div>
              ) : <p className="text-sm text-muted-foreground">{ui.pmocDisabled}</p>}
            </TabsContent>
          )}
          <TabsContent value="fiscal" className="mt-0 pt-5"><InventoryFiscalFields value={formData} onChange={(field, value) => handleChange(field, value)} /></TabsContent>
        </Tabs>
      </form>
    </ResponsiveModal>

    {/* Quick-create de grupo — auto-seleciona o grupo novo no campo que abriu. */}
    <QuickGroupDialog
      open={groupFormOpen}
      onOpenChange={setGroupFormOpen}
      initialName={groupSearchQuery}
      createGroup={createGroup}
      onCreated={(id) => handleChange('group_id', id)}
      title={t.fields.groupCreateAlways}
      nameLabel={t.fields.groupNameLabel}
      namePlaceholder={t.fields.groupNamePlaceholder}
      colorLabel={t.fields.groupColorLabel}
      submitLabel={t.save}
      cancelLabel={t.cancel}
    />

    {/* Viewer dedicado da foto — nunca abrir em nova aba (régua de UI). */}
    {photoUrl && (
      <ImagePreviewModal
        src={photoUrl}
        alt={formData.name || t.fields.photo}
        open={photoViewerOpen}
        onClose={() => setPhotoViewerOpen(false)}
      />
    )}
    </>
  );
}

interface QuickGroupDialogProps {
  open: boolean;
  initialName: string;
  onOpenChange: (open: boolean) => void;
  createGroup: ReturnType<typeof useMaterialGroups>['createGroup'];
  onCreated: (id: string) => void;
  title: string;
  nameLabel: string;
  namePlaceholder: string;
  colorLabel: string;
  submitLabel: string;
  cancelLabel: string;
}

const DEFAULT_GROUP_COLOR = '#6B7280';

/**
 * Quick-create MÍNIMO de grupo de material, aberto pelo botão "+" do seletor
 * de Grupo. Só nome (obrigatório) + cor — o CRUD completo continua em
 * Configurações (`InventorySettingsDialog`), essa é só a criação rápida.
 *
 * Radix Dialog controlado por prop `open` NÃO sincroniza estado na abertura
 * por código (só em fechamento por interação do usuário) — por isso o reset
 * dos campos mora num `useEffect([open, initialName])`, nunca no handler que
 * abre o dialog. Mesmo padrão do `QuickOriginDialog`.
 */
function QuickGroupDialog({
  open,
  initialName,
  onOpenChange,
  createGroup,
  onCreated,
  title,
  nameLabel,
  namePlaceholder,
  colorLabel,
  submitLabel,
  cancelLabel,
}: QuickGroupDialogProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(DEFAULT_GROUP_COLOR);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setColor(DEFAULT_GROUP_COLOR);
    }
  }, [open, initialName]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const created = await createGroup.mutateAsync({ name: trimmed, color });
      if (created) onCreated(created.id);
      onOpenChange(false);
    } catch {
      // O hook já dispara o toast de erro — mantém o dialog aberto pro usuário tentar de novo.
    }
  };

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={title}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">{nameLabel}</Label>
          <Input
            placeholder={namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">{colorLabel}</Label>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="destructive-ghost"
            onClick={() => onOpenChange(false)}
            disabled={createGroup.isPending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={createGroup.isPending || !name.trim()}
          >
            {createGroup.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
