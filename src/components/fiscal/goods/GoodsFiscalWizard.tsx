import { HorizontalTabBar } from '@/components/ui/HorizontalTabBar';
import { goodsPaymentLabel } from '@/lib/fiscal/pdvNfce';
import {
  goodsFinalConsumerLabel,
  resolveGoodsFinalConsumer,
} from '@/lib/fiscal/goodsFinalConsumer';
import { goodsRejectionGuidance } from '@/lib/fiscal/goodsRejectionGuidance';
import { useAppLocaleContext } from "@/contexts/AppLocaleContext";
import { useEffect, useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  CircleCheck,
  FileInput,
  Loader2,
  PackagePlus,
  Package,
  PencilLine,
  ReceiptText,
  Save,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  FullscreenWizard,
  FullscreenWizardAction,
} from "@/components/ui/FullscreenWizard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { useInventory } from "@/hooks/useInventory";
import { useStocks } from "@/hooks/useStocks";
import { useCustomers } from "@/hooks/useCustomers";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useIsMobile } from "@/hooks/use-mobile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GoodsFiscalItemInput } from "./GoodsFiscalItemInput";
import { CustomerSelectField } from "@/components/customers/CustomerSelectField";
import { SupplierSelectField } from "@/components/financial/SupplierSelectField";
import {
  useGoodsFiscalSourceImport,
  useGoodsFiscalSources,
  useSaveGoodsFiscalDocument,
  type GoodsDirection,
  type GoodsFiscalDraft,
  type GoodsFiscalItem,
  type GoodsFiscalParty,
  type GoodsModel,
  type GoodsSourceType,
} from "@/hooks/useGoodsFiscal";

import { useGoodsFiscalAccess } from "@/hooks/useGoodsFiscalAccess";
import { useGoodsFiscalCatalogs } from "@/hooks/useGoodsFiscalCatalogs";
import { useGoodsFiscalSettings } from "@/hooks/useGoodsFiscalSettings";
import { useFiscalSettings } from "@/hooks/useFiscalSettings";

type Step = "dados" | "itens" | "impostos" | "faturamento" | "transporte" | "opcoes" | "preview";
type PartyEntryMode = "select" | "manual";

const STEPS: Array<{ key: Step; label: string }> = [
  { key: "dados", label: "Dados" },
  { key: "itens", label: "Itens" },
  { key: "impostos", label: "Impostos" },
  { key: "faturamento", label: "Faturamento" },
  { key: "transporte", label: "Transporte" },
  { key: "opcoes", label: "Opções" },
  { key: "preview", label: "Pré-visualização" },
];

const PAYMENT_METHODS = [
  ["01", "Dinheiro"],
  ["03", "Cartão de crédito"],
  ["04", "Cartão de débito"],
  ["17", "Pix"],
  ["18", "Transferência bancária"],
  ["90", "Sem pagamento"],
  ["99", "Outros"],
] as const;

const emptyParty = (): GoodsFiscalParty => ({
  name: "",
  document: "",
  stateRegistration: "",
  email: "",
  address: "",
  addressNumber: "",
  neighborhood: "",
  city: "",
  state: "",
  zipCode: "",
  municipalityCode: "",
});
const newDraft = (model: GoodsModel, direction: GoodsDirection): GoodsFiscalDraft => ({
  id: null,
  model,
  direction,
  stockId: null,
  seriesId: null,
  carrierId: null,
  sourceType: "manual",
  sourceId: null,
  nature:
    direction === "entrada"
      ? "COMPRA DE MERCADORIA"
      : model === 65
        ? "VENDA A CONSUMIDOR"
        : "VENDA DE MERCADORIA",
  party: null,
  items: [],
  payments: [{ method: model === 65 ? "01" : "90", amount: 0, change: 0 }],
  freightMode: 9,
  notes: "",
  finalConsumer: model === 65 || (model === 55 && direction === "saida"),
});

const normalizeFinalConsumer = (draft: GoodsFiscalDraft): GoodsFiscalDraft => ({
  ...draft,
  finalConsumer: resolveGoodsFinalConsumer(draft),
});

const requiredFiscal = (item: GoodsFiscalItem, direction: GoodsDirection) => {
  const required: Array<[unknown, string]> = [
    [item.ncm, "NCM"],
    [item.origin, "origem"],
    [
      direction === "entrada"
        ? item.cfopEntryInternal || item.cfopEntryInterstate
        : item.cfopExitInternal || item.cfopExitInterstate,
      "CFOP",
    ],
    [item.icmsCode, "CST/CSOSN"],
    [item.pisCst, "CST PIS"],
    [item.cofinsCst, "CST COFINS"],
    [item.taxUnit || item.unit, "unidade tributável"],
  ];
  if (
    item.icmsCode &&
    !["40", "41", "50", "102", "103", "300", "400"].includes(item.icmsCode)
  )
    required.push([item.icmsRate, "alíquota de ICMS"]);
  if (
    item.pisCst &&
    !["04", "05", "06", "07", "08", "09", "49"].includes(item.pisCst)
  )
    required.push([item.pisRate, "alíquota de PIS"]);
  if (
    item.cofinsCst &&
    !["04", "05", "06", "07", "08", "09", "49"].includes(item.cofinsCst)
  )
    required.push([item.cofinsRate, "alíquota de COFINS"]);
  const issues = required
    .filter(([value]) => value == null || value === "")
    .map(([, label]) => label);
  if (item.icmsCode === "101")
    issues.push(
      "CSOSN 101 exige crédito do Simples; use um cenário configurado pela contabilidade",
    );
  if (item.icmsCode === "51")
    issues.push(
      "CST 51 exige os valores de diferimento; complete o cenário tributário antes de emitir",
    );
  if (
    item.icmsCode &&
    !["00", "40", "41", "50", "90", "102", "103", "300", "400"].includes(
      item.icmsCode,
    )
  )
    issues.push("CST/CSOSN ainda não coberto por este cenário de emissão");
  if (item.pisCst === "03" || item.cofinsCst === "03")
    issues.push("CST 03 de PIS/COFINS exige alíquota por quantidade");
  return issues;
};

interface GoodsFiscalWizardProps {
  model: GoodsModel;
  direction: GoodsDirection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (result?: Record<string, unknown>) => void;
  onBeforeEmit?: () => void;
  onEmitFailure?: () => void;
  sourceType?: Exclude<GoodsSourceType, 'manual'>;
  sourceId?: string | null;
  documentId?: string | null;
  initialDraft?: GoodsFiscalDraft | null;
  initialNature?: string;
  includeIdentifiedConsumer?: boolean;
}
export function GoodsFiscalWizard(props: GoodsFiscalWizardProps) {
  const access = useGoodsFiscalAccess();
  if (!props.open || !access.allowed) return null;
  return <GoodsFiscalWizardContent key={`${access.scopeId}:${props.model}:${props.direction}:${props.sourceId ?? 'manual'}:${props.documentId ?? 'new'}`} {...props} />;
}
function GoodsFiscalWizardContent({ model, direction, open, onOpenChange, onSaved, onBeforeEmit, onEmitFailure, sourceType, sourceId, documentId, initialDraft, initialNature, includeIdentifiedConsumer = true }: GoodsFiscalWizardProps) {
  const { locale } = useAppLocaleContext();
  const [step, setStep] = useState<Step>("dados");
  const [draft, setDraft] = useState<GoodsFiscalDraft>(() => newDraft(model, direction));
  const [sourceMode, setSourceMode] = useState<"manual" | "import">("manual");
  const [sourceQuery, setSourceQuery] = useState("");
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [partyEntryMode, setPartyEntryMode] = useState<PartyEntryMode>("select");
  const { items: inventory } = useInventory();
  const { defaultStock, isLoading: stocksLoading } = useStocks();
  const { customers } = useCustomers();
  const { suppliers } = useSuppliers();
  const catalogs = useGoodsFiscalCatalogs();
  const { settings } = useGoodsFiscalSettings();
  const { settings: fiscalSettings, isLoading: fiscalSettingsLoading } = useFiscalSettings();
  const isMobile = useIsMobile();
  const sources = useGoodsFiscalSources(
    draft.direction,
    sourceQuery,
    open && sourceMode === "import" && !sourceId,
  );
  const importer = useGoodsFiscalSourceImport();
  const importSourceRef = useRef(importer.mutateAsync);
  importSourceRef.current = importer.mutateAsync;
  const openingDocument = useRef({ id: documentId, draft: initialDraft });
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const saver = useSaveGoodsFiscalDocument();
  const importedSource = draft.sourceType !== 'manual' && !!draft.sourceId;
  const currentIndex = STEPS.findIndex((entry) => entry.key === step);
  const total = useMemo(
    () => draft.items.reduce((sum, item) => sum + item.total, 0),
    [draft.items],
  );
  const fiscalIssues = useMemo(
    () =>
      draft.items.flatMap((item, index) =>
        requiredFiscal(item, draft.direction).map(
          (field) => `Item ${index + 1}: ${field}`,
        ),
      ),
    [draft.items, draft.direction],
  );
  const availableSeries = useMemo(
    () => catalogs.series.filter((entry) => entry.active && (entry.direction === draft.direction || entry.direction === 'ambos')),
    [catalogs.series, draft.direction],
  );
  const selectedSeries = availableSeries.find((entry) => entry.id === draft.seriesId) ?? null;
  const selectedCarrier = catalogs.carriers.find((entry) => entry.id === draft.carrierId) ?? null;

  useEffect(() => {
    if (!open) return;
    setStep("dados");
    setDraft(newDraft(model, direction));
    setSourceMode("manual");
    setSourceQuery("");
    setSelectedSource(null);
    setSelectedPartyId("");
    setPartyEntryMode("select");
    if (initialNature) setDraft(current => ({ ...current, nature: initialNature }));
    const saved = openingDocument.current.draft;
    if (!sourceId && saved?.sourceType === 'manual' && saved.model === model && saved.direction === direction && Array.isArray(saved.items) && Array.isArray(saved.payments)) {
      setDraft(normalizeFinalConsumer({...saved,id:openingDocument.current.id ?? saved.id ?? null}));
      setSelectedPartyId(saved.party?.id ?? '');
      setPartyEntryMode(saved.party && !saved.party.id ? "manual" : "select");
    }
  }, [open, model, direction, initialNature, sourceId]);

  useEffect(() => {
    if (!open || !sourceId || !sourceType) return;
    let active = true;
    setSourceMode('import'); setSelectedSource(sourceId); setSourceLoading(true); setSourceError(null);
    importSourceRef.current({ sourceType, sourceId }).then(imported => {
      if (!active) return;
      const saved = openingDocument.current.draft;
      const restored = saved?.model === model && saved.sourceType === sourceType && saved.sourceId === sourceId && Array.isArray(saved.items) && Array.isArray(saved.payments) ? saved : null;
      const party = restored ? restored.party : includeIdentifiedConsumer ? imported.party : null;
      setDraft(current => normalizeFinalConsumer({ ...current, ...imported, ...restored, id: openingDocument.current.id ?? null, model,
        sourceType, sourceId, direction: imported.direction, party,
        stockId: imported.stockId,
        nature: restored?.nature || initialNature || current.nature }));
      setSelectedPartyId(party?.id ?? '');
      setPartyEntryMode(party && !party.id ? "manual" : "select");
    }).catch(() => { if (active) setSourceError('Não foi possível importar a venda confirmada. Confira seu acesso fiscal e tente novamente.'); })
      .finally(() => { if (active) setSourceLoading(false); });
    return () => { active = false; };
  }, [open, model, sourceId, sourceType, initialNature, includeIdentifiedConsumer]);

  useEffect(() => {
    if (!open || model !== 55 || draft.seriesId || !availableSeries.length) return;
    const configuredId = draft.direction === 'entrada'
      ? settings.nfe.defaultEntrySeriesId
      : settings.nfe.defaultExitSeriesId;
    const preferred = availableSeries.find((entry) => entry.id === configuredId) ?? availableSeries[0];
    setDraft((current) => current.seriesId ? current : { ...current, seriesId: preferred.id });
  }, [open, model, draft.seriesId, draft.direction, availableSeries, settings.nfe.defaultEntrySeriesId, settings.nfe.defaultExitSeriesId]);

  useEffect(() => {
    if (
      !open ||
      fiscalSettingsLoading ||
      draft.environment ||
      openingDocument.current.draft?.environment
    ) return;
    setDraft((current) => current.environment
      ? current
      : { ...current, environment: fiscalSettings.fiscal_ambiente });
  }, [open, fiscalSettingsLoading, fiscalSettings.fiscal_ambiente, draft.environment]);

  useEffect(() => {
    if (!open || draft.stockId || !defaultStock) return;
    setDraft((current) => current.stockId ? current : { ...current, stockId: defaultStock.id });
  }, [open, draft.stockId, defaultStock]);

  const patch = (values: Partial<GoodsFiscalDraft>) =>
    setDraft((current) => ({ ...current, ...values }));
  const patchParty = (values: Partial<GoodsFiscalParty>) =>
    patch({ party: { ...(draft.party ?? emptyParty()), ...values } });

  const selectSource = async (id: string) => {
    const source = sources.data?.find((entry) => entry.sourceId === id);
    if (!source) return;
    setSelectedSource(id);
    try {
      const imported = await importer.mutateAsync(source);
      setDraft((current) => normalizeFinalConsumer({
        ...current,
        ...imported,
        model,
        nature:
          imported.direction === "entrada"
            ? "COMPRA DE MERCADORIA"
            : model === 65
              ? "VENDA A CONSUMIDOR"
              : "VENDA DE MERCADORIA",
        freightMode: 9,
        notes: "",
      }));
      setSelectedPartyId(imported.party?.id ?? "");
      setPartyEntryMode(imported.party && !imported.party.id ? "manual" : "select");
      toast.success(`${source.originLabel} importada para conferência.`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const selectCustomer = (id: string) => {
    setPartyEntryMode("select");
    setSelectedPartyId(id);
    const customer = customers.find((entry) => entry.id === id);
    if (!customer) return;
    patch({
      party: {
        id: customer.id,
        name: customer.company_name || customer.name,
        document: customer.document || "",
        stateRegistration: customer.inscricao_estadual || "",
        email: customer.email || "",
        address: customer.address || "",
        addressNumber: customer.address_number || customer.street_number || "",
        complement: customer.complement || "",
        neighborhood: customer.neighborhood || "",
        city: customer.city || "",
        state: customer.state || "",
        zipCode: customer.zip_code || "",
        municipalityCode: customer.ibge_municipality_code || "",
      },
      finalConsumer: customer.inscricao_estadual
        ? draft.finalConsumer === true
        : true,
    });
  };

  const selectSupplier = (id: string) => {
    setPartyEntryMode("select");
    setSelectedPartyId(id);
    const supplier = suppliers.find((entry) => entry.id === id);
    if (!supplier) return;
    patch({
      party: {
        ...(draft.party ?? emptyParty()),
        id: supplier.id,
        name: supplier.name,
        document: supplier.cpf_cnpj || "",
        email: supplier.email || "",
        address: supplier.address || "",
      },
    });
  };

  useEffect(() => {
    if (!selectedPartyId || draft.party?.id === selectedPartyId) return;
    if (draft.direction === "entrada") {
      const supplier = suppliers.find((entry) => entry.id === selectedPartyId);
      if (!supplier) return;
      setDraft((current) => ({
        ...current,
        party: {
          ...(current.party ?? emptyParty()),
          id: supplier.id,
          name: supplier.name,
          document: supplier.cpf_cnpj || "",
          email: supplier.email || "",
          address: supplier.address || "",
        },
      }));
      return;
    }
    const customer = customers.find((entry) => entry.id === selectedPartyId);
    if (!customer) return;
    setDraft((current) => normalizeFinalConsumer({
      ...current,
      party: {
        id: customer.id,
        name: customer.company_name || customer.name,
        document: customer.document || "",
        stateRegistration: customer.inscricao_estadual || "",
        email: customer.email || "",
        address: customer.address || "",
        addressNumber: customer.address_number || customer.street_number || "",
        complement: customer.complement || "",
        neighborhood: customer.neighborhood || "",
        city: customer.city || "",
        state: customer.state || "",
        zipCode: customer.zip_code || "",
        municipalityCode: customer.ibge_municipality_code || "",
      },
    }));
  }, [customers, suppliers, selectedPartyId, draft.direction, draft.party?.id]);

  const stepError = (): string | null => {
    if (step === "dados" && sourceMode === "import" && !draft.sourceId)
      return "Escolha uma venda ou compra para importar.";
    if (step === "dados" && !draft.stockId)
      return "Selecione o local de estoque da operação.";
    if (step === "dados" && model === 55 && !selectedSeries)
      return "Escolha uma série de NF-e ativa para esta operação.";
    if (
      step === "dados" &&
      model === 55 &&
      (!draft.party?.name.trim() || !draft.party.document.replace(/\D/g, ""))
    )
      return `Informe o ${draft.direction === "entrada" ? "fornecedor" : "cliente"} e o CPF/CNPJ.`;
    if (step === 'dados' && model === 65 && draft.party && ![11,14].includes(draft.party.document.replace(/\D/g,'').length)) return 'Informe um CPF/CNPJ válido ou remova a identificação do consumidor.';
    if (step === "itens" && draft.items.length === 0)
      return "Adicione ao menos um item.";
    if (step === "itens" && fiscalIssues.length)
      return `Complete os dados fiscais dos itens: ${fiscalIssues.slice(0, 3).join("; ")}${fiscalIssues.length > 3 ? "…" : ""}`;
    if (step === "impostos") {
      if (!draft.nature.trim()) return "Informe a natureza da operação.";
    }
    if (step === "faturamento") {
      const paid = draft.payments.reduce(
        (sum, entry) =>
          sum + Number(entry.amount || 0) - Number(entry.change || 0),
        0,
      );
      if (model === 65 && Math.abs(paid - total) > 0.009)
        return "Os pagamentos menos o troco precisam fechar exatamente com o total da NFC-e.";
    }
    return null;
  };

  const next = () => {
    const error = stepError();
    if (error) {
      toast.error(error);
      return;
    }
    setStep(STEPS[Math.min(currentIndex + 1, STEPS.length - 1)].key);
  };
  const back = () => setStep(STEPS[Math.max(0, currentIndex - 1)].key);

  const persist = async (emit: boolean) => {
    if (saver.isPending || sourceLoading || sourceError) return;
    if (emit) {
      if (!draft.stockId) {
        setStep("dados");
        toast.error("Selecione o local de estoque da operação.");
        return;
      }
      if (model === 55 && !selectedSeries) {
        setStep("dados");
        toast.error("Escolha uma série de NF-e ativa para esta operação.");
        return;
      }
      if (model === 65 && draft.party && ![11,14].includes(draft.party.document.replace(/\D/g,'').length)) { setStep('dados'); toast.error('Informe um CPF/CNPJ válido ou remova a identificação do consumidor.'); return; }
      if (
        model === 55 &&
        (!draft.party?.name.trim() || !draft.party.document.replace(/\D/g, ""))
      ) {
        setStep("dados");
        toast.error(`Informe o ${draft.direction === "entrada" ? "fornecedor" : "cliente"} e o CPF/CNPJ.`);
        return;
      }
      if (fiscalIssues.length || !draft.items.length) {
        setStep("itens");
        toast.error("Complete os itens e a classificação fiscal antes de emitir.");
        return;
      }
      if (!draft.nature.trim()) {
        setStep("impostos");
        toast.error("Informe a natureza da operação.");
        return;
      }
      const paid = draft.payments.reduce(
        (sum, entry) => sum + Number(entry.amount || 0) - Number(entry.change || 0),
        0,
      );
      if (model === 65 && Math.abs(paid - total) > 0.009) {
        setStep("faturamento");
        toast.error("Os pagamentos menos o troco precisam fechar com o total da NFC-e.");
        return;
      }
    }
    try {
      if (emit) onBeforeEmit?.();
      const normalizedDraft = normalizeFinalConsumer(draft);
      const response = await saver.mutateAsync({
        draft: normalizedDraft,
        emit,
      });
      setDraft((current) => normalizeFinalConsumer({
        ...current,
        id: response.status === 'rejected'
          ? null
          : typeof response.id === "string"
            ? response.id
            : current.id,
      }));
      if (response.status === 'authorized') toast.success(`${model === 65 ? 'NFC-e' : 'NF-e'} autorizada pela SEFAZ.`);
      else if (response.status === 'rejected') toast.error(goodsRejectionGuidance(response.rejectionCode));
      else if (emit) toast.message('Solicitação fiscal registrada. Acompanhe a situação desta mesma nota.');
      else toast.success('Rascunho salvo.');
      onSaved?.(response);
      if (emit && response.status !== 'rejected') onOpenChange(false);
    } catch (error) {
      if (emit) onEmitFailure?.();
      toast.error((error as Error).message);
    }
  };

  const footer = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="order-2 flex min-w-0 gap-2 sm:order-1">
        {currentIndex > 0 ? (
          <FullscreenWizardAction
            variant="outline"
            onClick={back}
            className="flex-1 sm:flex-none"
          >
            <ArrowLeft className="mr-2 h-5 w-5" />
            Voltar
          </FullscreenWizardAction>
        ) : null}
        <FullscreenWizardAction
          variant="outline"
          onClick={() => persist(false)}
          disabled={saver.isPending || sourceLoading || !!sourceError}
          className="flex-1 sm:flex-none"
        >
          <Save className="mr-2 h-5 w-5" />
          Salvar rascunho
        </FullscreenWizardAction>
      </div>
      <div className="order-1 flex-1 text-left sm:order-2 sm:text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Total da nota
        </p>
        <p className="text-xl font-bold">{formatMoney(total, "BRL", locale)}</p>
      </div>
      <div className="order-3 sm:ml-auto">
        {step === "preview" ? (
          <FullscreenWizardAction
            onClick={() => persist(true)}
            disabled={saver.isPending || sourceLoading || !!sourceError}
            className="w-full sm:w-auto"
          >
            {saver.isPending ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Send className="mr-2 h-5 w-5" />
            )}
            Emitir {model === 65 ? "NFC-e" : "NF-e"}
          </FullscreenWizardAction>
        ) : (
          <FullscreenWizardAction onClick={next} className="w-full sm:w-auto">
            Avançar
            <ArrowRight className="ml-2 h-5 w-5" />
          </FullscreenWizardAction>
        )}
      </div>
    </div>
  );

  return (
    <FullscreenWizard
      open={open}
      onOpenChange={onOpenChange}
      title={`Nova ${model === 65 ? "NFC-e" : "NF-e"}`}
      description={
        model === 65
          ? "Cupom fiscal eletrônico, modelo 65"
          : "Nota fiscal de produtos, modelo 55"
      }
      exitLabel="Sair"
      footer={footer}
      headerActions={
        <div className="flex flex-nowrap items-center justify-end gap-1.5 sm:gap-2">
          <Badge className="border-0 bg-foreground px-2 text-[10px] text-background hover:bg-foreground/90 sm:px-2.5 sm:text-xs">
            {draft.direction === "entrada" ? "Entrada" : "Saída"}
          </Badge>
          <Badge variant="outline" className="hidden sm:inline-flex">
            {model === 65 ? "Modelo 65" : "Modelo 55"}
          </Badge>
          {model === 55 ? (
            <Select
              value={draft.seriesId ?? ""}
              onValueChange={(seriesId) => patch({ seriesId })}
            >
              <SelectTrigger
                aria-label="Série da NF-e"
                className="h-8 w-[92px] gap-1 px-2 text-[11px] font-semibold sm:w-auto sm:min-w-[132px] sm:max-w-[220px] sm:gap-1.5 sm:px-3 sm:text-xs"
              >
                <SelectValue placeholder="Série">
                  {selectedSeries ? (
                    <>
                      <span className="sm:hidden">Série {selectedSeries.series}</span>
                      <span className="hidden max-w-[174px] truncate sm:inline">
                        {selectedSeries.label} · série {selectedSeries.series} · próximo nº {selectedSeries.nextNumber}
                      </span>
                    </>
                  ) : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                {availableSeries.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.label} · série {entry.series} · próximo nº {entry.nextNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select
            value={draft.environment ?? ""}
            onValueChange={(environment) => patch({
              environment: environment === "producao" ? "producao" : "homologacao",
            })}
            disabled={fiscalSettingsLoading}
          >
            <SelectTrigger
              aria-label="Ambiente de emissão"
              className="h-8 w-[126px] px-2 text-[11px] font-semibold sm:w-[138px] sm:px-3 sm:text-xs"
            >
              <SelectValue placeholder="Ambiente">
                {draft.environment === "producao" ? "Produção" : "Homologação"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="producao">Produção</SelectItem>
              <SelectItem value="homologacao">Homologação</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
    >
      <div className="-mx-4 flex items-center justify-between gap-4 bg-muted/35 px-4 py-3 sm:-mx-10 sm:px-10">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total da nota</p>
            <p className="text-lg font-bold tabular-nums">{formatMoney(total, "BRL", locale)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Itens</p>
            <p className="text-lg font-bold tabular-nums">{draft.items.length}</p>
          </div>
        </div>
        {draft.items.length > 0 && fiscalIssues.length === 0 ? (
          <Badge className="gap-1.5 border-0 bg-foreground px-3 py-1.5 text-background">
            <CircleCheck className="h-3.5 w-3.5" />Pronta pra emitir
          </Badge>
        ) : (
          <Badge variant="destructive" className="gap-1.5 px-3 py-1.5">
            {draft.items.length === 0 ? "Inclua os itens" : `${fiscalIssues.length} pendência${fiscalIssues.length === 1 ? "" : "s"}`}
          </Badge>
        )}
      </div>
      <nav
        aria-label="Etapas da nota"
        className="sticky top-0 z-10 -mx-4 border-b bg-background px-4 sm:-mx-10 sm:px-10"
      >
        <HorizontalTabBar asChild>
          <div className="flex min-w-0 gap-1">
            {(isMobile ? STEPS.slice(0, 2) : STEPS).map((entry) => (
              <button
                key={entry.key}
                aria-current={entry.key === step ? 'page' : undefined}
                type="button"
                onClick={() => setStep(entry.key)}
                className={cn(
                  "min-h-14 shrink-0 whitespace-nowrap border-b-[3px] px-4 py-3 text-base font-semibold transition-colors lg:px-6 lg:text-[17px]",
                  entry.key === step
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground",
                )}
              >
                {entry.label}
              </button>
            ))}
            {isMobile ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-current={!["dados", "itens"].includes(step) ? "page" : undefined}
                    className={cn(
                      "ml-auto flex min-h-14 shrink-0 items-center gap-1 whitespace-nowrap border-b-[3px] px-4 py-3 text-base font-semibold",
                      !["dados", "itens"].includes(step)
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground",
                    )}
                  >
                    {STEPS.slice(2).find((entry) => entry.key === step)?.label ?? "Mais opções"}
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {STEPS.slice(2).map((entry) => (
                    <DropdownMenuItem key={entry.key} onSelect={() => setStep(entry.key)} className="text-base">
                      {entry.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </HorizontalTabBar>
      </nav>

      <div className="mx-auto w-full max-w-7xl py-6 sm:py-8">
        {sourceLoading && <p role="status" className="mb-5 flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Importando a venda confirmada…</p>}
        {sourceError && <p role="alert" className="mb-5 text-destructive">{sourceError}</p>}
        {sourceId && !sourceLoading && !sourceError && <p className="mb-5 text-sm text-muted-foreground">Venda concluída importada para conferência. A emissão fiscal não altera o pagamento.</p>}
        {step === "dados" && (
          <section className="space-y-5">
            <header>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                Etapa 1
              </p>
              <h2 className="mt-1 text-2xl font-bold">
                Dados da nota
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Preencha manualmente ou importe uma {draft.direction === "entrada" ? "compra" : "venda"} para evitar redigitação.
              </p>
            </header>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Preenchimento
              </span>
              <Button
                type="button"
                disabled={!!sourceId}
                onClick={() => {
                  setSourceMode("manual");
                  patch({
                    sourceType: "manual",
                    sourceId: null,
                    items: [],
                    party: null,
                  });
                  setSelectedSource(null);
                  setSelectedPartyId("");
                  setPartyEntryMode("select");
                }}
                variant="outline"
                className={cn(
                  "h-10 gap-2 px-4 text-sm font-bold",
                  sourceMode === "manual" &&
                    "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background",
                )}
              >
                <PackagePlus className="h-4 w-4" />
                Preencher manualmente
              </Button>
              <Button
                type="button"
                disabled={!!sourceId}
                onClick={() => {
                  setSourceMode("import");
                  patch({ sourceType: "manual", sourceId: null });
                }}
                variant="outline"
                className={cn(
                  "h-10 gap-2 px-4 text-sm font-bold",
                  sourceMode === "import" &&
                    "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background",
                )}
              >
                <FileInput className="h-4 w-4" />
                Importar {draft.direction === "entrada" ? "compra" : "venda"}
              </Button>
            </div>
            {sourceMode === "import" && !sourceId && (
              <div className="space-y-4">
                <div className="relative max-w-xl">
                  <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                  <Input
                    value={sourceQuery}
                    onChange={(event) => setSourceQuery(event.target.value)}
                    className="pl-10"
                    placeholder={
                      draft.direction === "entrada"
                        ? "Buscar compra ou fornecedor…"
                        : "Buscar venda ou cliente…"
                    }
                  />
                </div>
                {sources.isLoading ? (
                  <div className="flex items-center gap-2 py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Carregando…
                  </div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {sources.data?.map((source) => (
                      <button
                        key={source.sourceId}
                        type="button"
                        onClick={() => selectSource(source.sourceId)}
                        className={cn(
                          "flex items-center gap-4 rounded-2xl border-2 p-4 text-left",
                          selectedSource === source.sourceId
                            ? "border-foreground bg-foreground text-background"
                            : "border-border hover:border-foreground/30",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground text-background",
                            selectedSource === source.sourceId &&
                              "bg-background text-foreground",
                          )}
                        >
                          {source.sourceType === "pdv_sale" ? (
                            <ShoppingCart className="h-5 w-5" />
                          ) : (
                            <ReceiptText className="h-5 w-5" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold">
                            #{source.number} ·{" "}
                            {source.partyName || "Consumidor não identificado"}
                          </span>
                          <span
                            className={cn(
                              "mt-1 block text-sm text-muted-foreground",
                              selectedSource === source.sourceId &&
                                "text-background/75",
                            )}
                          >
                            {source.originLabel} · {source.itemCount} itens
                          </span>
                        </span>
                        <strong className="shrink-0">
                          {formatMoney(source.total, "BRL", locale)}
                        </strong>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!stocksLoading && !draft.stockId ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                Nenhum estoque fiscal está disponível para seu acesso. Configure o estoque principal antes de emitir.
              </p>
            ) : null}
            {model === 55 && availableSeries.length === 0 ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                Nenhuma série ativa atende esta operação. Cadastre uma série em Configurações fiscais antes de emitir.
              </p>
            ) : null}
          </section>
        )}

        {step === "dados" && (
          <section className="mt-6 space-y-5 border-t border-border/60 pt-5">
            <header>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                {draft.direction === "entrada" ? "Fornecedor" : "Destinatário"}
              </p>
              <h2 className="mt-1 text-2xl font-bold">
                {draft.direction === "entrada"
                  ? "Quem forneceu"
                  : "Para quem é a nota"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {model === 65
                  ? "Na NFC-e o consumidor pode ficar sem identificação."
                  : "Confira documento e endereço fiscal antes de avançar."}
              </p>
            </header>
            {(model === 55 || draft.party) && partyEntryMode === "select" ? (
              <div className="space-y-3">
                <Label htmlFor="goods-party-selector" className="font-semibold">
                  {draft.direction === "entrada" ? "Selecionar fornecedor" : "Selecionar cliente"}
                </Label>
                <div className="max-w-3xl [&_button:last-child]:bg-foreground [&_button:last-child]:text-background [&_button:last-child]:hover:bg-foreground/90">
                  {draft.direction === "entrada" ? (
                    <SupplierSelectField
                      id="goods-party-selector"
                      value={selectedPartyId}
                      onValueChange={selectSupplier}
                      suppliers={suppliers}
                      placeholder="Busque pelo nome, CNPJ ou contato..."
                      searchPlaceholder="Buscar fornecedor..."
                      emptyMessage="Nenhum fornecedor encontrado."
                      createAriaLabel="Cadastrar fornecedor"
                    />
                  ) : (
                    <CustomerSelectField
                      id="goods-party-selector"
                      variant="large"
                      value={selectedPartyId}
                      onValueChange={selectCustomer}
                      customers={customers}
                      placeholder="Busque pelo nome, CPF/CNPJ ou contato..."
                      searchPlaceholder="Buscar cliente..."
                      emptyMessage="Nenhum cliente encontrado."
                      requireDocument
                      createLabel="Cadastrar cliente"
                    />
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Os dados fiscais são preenchidos automaticamente pelo cadastro selecionado.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2 border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background"
                    onClick={() => {
                      setPartyEntryMode("manual");
                      setSelectedPartyId("");
                      patch({ party: emptyParty(), finalConsumer: true });
                    }}
                  >
                    <PencilLine className="h-4 w-4" />
                    Preencher manualmente
                  </Button>
                </div>
              </div>
            ) : null}
            {model === 65 && draft.party && <Button type="button" variant="outline" onClick={() => { patch({party:null}); setSelectedPartyId(''); setPartyEntryMode("select"); }}>Usar consumidor não identificado</Button>}
            {model === 65 && !draft.party ? (
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-foreground p-5 text-background">
                <div>
                  <p className="font-bold">Consumidor não identificado</p>
                  <p className="mt-1 text-sm text-background/75">
                    Permitido para este fluxo de NFC-e.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    patch({ party: emptyParty() });
                    setPartyEntryMode("select");
                  }}
                >
                  Identificar consumidor
                </Button>
              </div>
            ) : partyEntryMode === "manual" ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
                  <div>
                    <p className="font-semibold">Preenchimento manual</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Use somente quando o {draft.direction === "entrada" ? "fornecedor" : "cliente"} ainda não estiver cadastrado.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPartyEntryMode("select");
                      setSelectedPartyId("");
                      patch({ party: null, finalConsumer: true });
                    }}
                  >
                    Selecionar {draft.direction === "entrada" ? "fornecedor" : "cliente"} cadastrado
                  </Button>
                </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="goods-party-name">Nome / razão social</Label>
                  <Input
                    id="goods-party-name"
                    value={draft.party?.name ?? ""}
                    onChange={(e) => patchParty({ name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goods-party-document">CPF/CNPJ</Label>
                  <Input
                    id="goods-party-document"
                    inputMode="numeric"
                    value={draft.party?.document ?? ""}
                    onChange={(e) => patchParty({ document: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goods-party-ie">Inscrição estadual</Label>
                  <Input
                    id="goods-party-ie"
                    value={draft.party?.stateRegistration ?? ""}
                    onChange={(e) => {
                      const stateRegistration = e.target.value;
                      patch({
                        party: {
                          ...(draft.party ?? emptyParty()),
                          stateRegistration,
                        },
                        finalConsumer: stateRegistration.replace(/\D/g, "")
                          ? draft.finalConsumer === true
                          : true,
                      });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goods-party-email">E-mail</Label>
                  <Input
                    id="goods-party-email"
                    type="email"
                    value={draft.party?.email ?? ""}
                    onChange={(e) => patchParty({ email: e.target.value })}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="goods-party-address">Logradouro</Label>
                  <Input
                    id="goods-party-address"
                    value={draft.party?.address ?? ""}
                    onChange={(e) => patchParty({ address: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goods-party-number">Número</Label>
                  <Input
                    id="goods-party-number"
                    value={draft.party?.addressNumber ?? ""}
                    onChange={(e) =>
                      patchParty({ addressNumber: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goods-party-neighborhood">Bairro</Label>
                  <Input
                    id="goods-party-neighborhood"
                    value={draft.party?.neighborhood ?? ""}
                    onChange={(e) =>
                      patchParty({ neighborhood: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goods-party-city">Cidade</Label>
                  <Input
                    id="goods-party-city"
                    value={draft.party?.city ?? ""}
                    onChange={(e) => patchParty({ city: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-[1fr_2fr] gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="goods-party-state">UF</Label>
                    <Input
                      id="goods-party-state"
                      maxLength={2}
                      value={draft.party?.state ?? ""}
                      onChange={(e) =>
                        patchParty({ state: e.target.value.toUpperCase() })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="goods-party-city-code">Código IBGE</Label>
                    <Input
                      id="goods-party-city-code"
                      inputMode="numeric"
                      maxLength={7}
                      value={draft.party?.municipalityCode ?? ""}
                      onChange={(e) =>
                        patchParty({ municipalityCode: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
              </div>
            ) : null}
            {model === 55 && draft.direction === "saida" && draft.party && (partyEntryMode === "manual" || !!selectedPartyId || !!draft.party.id) ? (
              <div className="space-y-3" data-qa="nfe-final-consumer-purpose">
                <div>
                  <Label className="text-base font-bold">Finalidade para o destinatário</Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Essa informação define se a compra é para uso próprio ou para continuar a atividade comercial.
                  </p>
                </div>
                {!draft.party.stateRegistration?.replace(/\D/g, "") ? (
                  <div className="flex items-start gap-4 rounded-2xl bg-foreground p-5 text-background">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-background text-foreground">
                      <UserRound className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold">Consumidor final</p>
                        <Badge className="border border-background/30 bg-background/15 text-background hover:bg-background/15">
                          Automático
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-background/75">
                        Como o destinatário não possui inscrição estadual, a NF-e será emitida para uso ou consumo próprio.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      {
                        value: true,
                        title: "Uso ou consumo próprio",
                        description: "O destinatário vai usar o produto e não pretende revendê-lo.",
                        icon: UserRound,
                      },
                      {
                        value: false,
                        title: "Revenda ou industrialização",
                        description: "O produto será revendido, transformado ou usado na produção.",
                        icon: Package,
                      },
                    ].map((option) => {
                      const selected = resolveGoodsFinalConsumer(draft) === option.value;
                      const Icon = option.icon;
                      return (
                        <button
                          key={String(option.value)}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => patch({ finalConsumer: option.value })}
                          className={cn(
                            "flex min-h-32 items-start gap-4 rounded-2xl border-2 p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            selected
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-background hover:border-foreground/30",
                          )}
                        >
                          <span className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground",
                            selected && "bg-background text-foreground",
                          )}>
                            <Icon className="h-5 w-5" />
                          </span>
                          <span>
                            <span className="block font-bold">{option.title}</span>
                            <span className={cn(
                              "mt-1 block text-sm text-muted-foreground",
                              selected && "text-background/75",
                            )}>
                              {option.description}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        )}

        {step === "itens" && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold tracking-tight">Produtos/Itens</h2>
              <span className="text-sm font-medium text-muted-foreground">
                {draft.items.length} item{draft.items.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className={cn("grid items-start gap-6", !isMobile && "xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]")}>
              <div className="min-w-0 border-y border-border/60 py-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                  <PackagePlus className="h-3.5 w-3.5" />
                  Adicionar item
                </div>
                <GoodsFiscalItemInput
                  inventory={inventory}
                  direction={draft.direction}
                  onAddItem={(item) => patch({ items: [...draft.items, item] })}
                />
              </div>
              <div data-qa="nfe-added-items" className="min-w-0 rounded-lg border border-border/60">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Package className="h-3.5 w-3.5" />
                    Itens adicionados
                  </span>
                  <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">{draft.items.length}</span>
                </div>
                {isMobile ? (draft.items.length === 0 ? (
                  <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center">
                    <PackagePlus className="h-10 w-10 text-muted-foreground" />
                    <p className="mt-4 font-bold">Nenhum item adicionado</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Importe um documento ou inclua pelo catálogo.
                    </p>
                  </div>
                ) : (
                  draft.items.map((item, index) => {
                    const missing = requiredFiscal(item, draft.direction);
                    return (
                      <article key={item.id} className="rounded-2xl border p-4">
                        <div className="flex gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-bold">
                                {index + 1}. {item.description}
                              </h3>
                              {missing.length ? (
                                <Badge variant="destructive">
                                  Fiscal incompleto
                                </Badge>
                              ) : (
                                <Badge className="border-0 bg-foreground text-background">
                                  <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                                  Pronto
                                </Badge>
                              )}
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {item.quantity} {item.unit || "UN"} ×{" "}
                              {formatMoney(item.unitPrice, "BRL", locale)}
                            </p>
                            {missing.length ? (
                              <p className="mt-2 text-sm font-medium text-destructive">
                                Faltam: {missing.join(", ")}. Complete no
                                cadastro do material e importe novamente.
                              </p>
                            ) : (
                              <p className="mt-2 text-xs text-muted-foreground">
                                NCM {item.ncm} · CFOP{" "}
                                {draft.direction === "entrada"
                                  ? `${item.cfopEntryInternal}/${item.cfopEntryInterstate}`
                                  : `${item.cfopExitInternal}/${item.cfopExitInterstate}`}{" "}
                                · ICMS {item.icmsCode}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <strong>{formatMoney(item.total, "BRL", locale)}</strong>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="mt-2 block text-destructive"
                              onClick={() =>
                                patch({
                                  items: draft.items.filter(
                                    (entry) => entry.id !== item.id,
                                  ),
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </article>
                    );
                  })
                )) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Material</TableHead><TableHead>NCM</TableHead><TableHead>CFOP</TableHead><TableHead>Qtd</TableHead><TableHead>Vl. Unit.</TableHead><TableHead>Desconto</TableHead><TableHead>Vl. Total</TableHead><TableHead className="w-12" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {draft.items.length === 0 ? (
                          <TableRow><TableCell colSpan={8} className="h-20 text-center text-sm text-muted-foreground">Nenhum item adicionado ainda. Use o bloco “Adicionar item”.</TableCell></TableRow>
                        ) : draft.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="min-w-40 font-medium">{item.description}</TableCell>
                            <TableCell>{item.ncm || "—"}</TableCell>
                            <TableCell>{draft.direction === "entrada" ? item.cfopEntryInternal : item.cfopExitInternal}</TableCell>
                            <TableCell>{item.quantity} {item.unit || "UN"}</TableCell>
                            <TableCell>{formatMoney(item.unitPrice, "BRL", locale)}</TableCell>
                            <TableCell>{formatMoney(item.discount, "BRL", locale)}</TableCell>
                            <TableCell className="font-bold">{formatMoney(item.total, "BRL", locale)}</TableCell>
                            <TableCell><Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => patch({ items: draft.items.filter((entry) => entry.id !== item.id) })}><Trash2 className="h-4 w-4" /></Button></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {(["impostos", "faturamento", "transporte", "opcoes"] as Step[]).includes(step) && (
          <section className="space-y-7">
            <header>
              <p className="text-sm font-semibold uppercase tracking-wide text-foreground">
                Configuração da nota
              </p>
              <h2 className="mt-1 text-2xl font-bold sm:text-3xl">
                {step === "impostos" ? "Impostos" : step === "faturamento" ? "Faturamento" : step === "transporte" ? "Transporte" : "Opções"}
              </h2>
              <p className="mt-2 text-base text-muted-foreground">
                {step === "impostos"
                  ? "Confira a natureza da operação e a classificação fiscal herdada dos materiais."
                  : step === "faturamento"
                    ? "Informe o pagamento; na NFC-e, o valor precisa fechar com o total."
                    : step === "transporte"
                      ? "Defina a responsabilidade pelo frete."
                      : "Inclua observações e informações complementares da nota."}
              </p>
            </header>
            <div className="grid gap-5 lg:grid-cols-2">
              {step === "impostos" && <div className="space-y-2 lg:col-span-2">
                <Label>Natureza da operação</Label>
                <Input
                  value={draft.nature}
                  onChange={(e) => patch({ nature: e.target.value })}
                />
                <p className="text-sm text-muted-foreground">NCM, CFOP, ICMS, PIS e COFINS são validados por item com base na aba fiscal do material.</p>
              </div>}
              {step === "transporte" && <div className="space-y-2 lg:col-span-2 lg:max-w-xl">
                <Label>Modalidade do frete</Label>
                <Select
                  value={String(draft.freightMode)}
                  onValueChange={(value) => patch({
                    freightMode: Number(value),
                    carrierId: value === "9" ? null : draft.carrierId,
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="9">Sem frete</SelectItem>
                    <SelectItem value="0">Por conta do emitente</SelectItem>
                    <SelectItem value="1">Por conta do destinatário</SelectItem>
                  </SelectContent>
                </Select>
                {draft.freightMode !== 9 && model === 55 && (
                  <div className="mt-5 space-y-2">
                    <Label htmlFor="goods-carrier">Transportadora cadastrada</Label>
                    <Select
                      value={draft.carrierId ?? "none"}
                      onValueChange={(carrierId) => patch({ carrierId: carrierId === "none" ? null : carrierId })}
                    >
                      <SelectTrigger id="goods-carrier">
                        <SelectValue placeholder="Sem transportadora informada" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem transportadora informada</SelectItem>
                        {catalogs.carriers.filter((entry) => entry.active).map((entry) => (
                          <SelectItem key={entry.id} value={entry.id}>
                            {entry.name} · {entry.document}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      O cadastro fica associado ao rascunho. Os dados só serão enviados ao motor quando o contrato fiscal de transporte estiver homologado.
                    </p>
                  </div>
                )}
              </div>}
              {step === "faturamento" && !importedSource && <div className="space-y-2">
                <Label>Meio de pagamento</Label>
                <Select
                  value={draft.payments[0]?.method ?? "90"}
                  onValueChange={(method) =>
                    patch({ payments: [{ method, amount: total, change: 0 }] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>}
              {step === "faturamento" && !importedSource && <div className="space-y-2">
                <Label>Valor recebido</Label>
                <Input
                  inputMode="decimal"
                  value={String(draft.payments[0]?.amount || total).replace(
                    ".",
                    ",",
                  )}
                  onChange={(e) =>
                    patch({
                      payments: [
                        {
                          ...(draft.payments[0] ?? { method: "01" }),
                          amount: Number(e.target.value.replace(",", ".")) || 0,
                        },
                      ],
                    })
                  }
                />
              </div>}
              {step === "faturamento" && !importedSource && <div className="space-y-2">
                <Label>Troco</Label>
                <Input
                  inputMode="decimal"
                  value={String(draft.payments[0]?.change ?? 0).replace(
                    ".",
                    ",",
                  )}
                  onChange={(e) =>
                    patch({
                      payments: [
                        {
                          ...(draft.payments[0] ?? {
                            method: "01",
                            amount: total,
                          }),
                          change: Number(e.target.value.replace(",", ".")) || 0,
                        },
                      ],
                    })
                  }
                />
              </div>}
              {step === 'faturamento' && importedSource && <div className="space-y-3 lg:col-span-2" aria-label="Pagamentos da venda confirmada">
                <p className="text-sm text-muted-foreground">Pagamentos importados da venda concluída. O valor recebido inclui o troco informado no caixa.</p>
                <div className="divide-y border-y">{draft.payments.map((payment,index) => <div key={index} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div><p className="font-semibold">{goodsPaymentLabel(payment.method)}</p>{payment.deferred && <p className="text-xs text-muted-foreground">Pagamento a prazo aprovado</p>}{Number(payment.change)>0 && <p className="text-sm text-muted-foreground">Troco: {formatMoney(Number(payment.change),'BRL',locale)}</p>}</div>
                  <p className="font-bold tabular-nums">{formatMoney(payment.amount,'BRL',locale)}</p>
                </div>)}</div>
                <p className="flex flex-wrap justify-between gap-2 font-semibold"><span>Total aplicado à venda</span><span className="tabular-nums">{formatMoney(draft.payments.reduce((sum,p) => sum+p.amount-Number(p.change||0),0),'BRL',locale)}</span></p>
              </div>}
              {step === "opcoes" && <div className="space-y-2 lg:col-span-2">
                <Label>Informações adicionais</Label>
                <Textarea
                  value={draft.notes}
                  onChange={(e) => patch({ notes: e.target.value })}
                  rows={4}
                />
              </div>}
            </div>
          </section>
        )}

        {step === "preview" && (
          <section className="space-y-7">
            <header>
              <p className="text-sm font-semibold uppercase tracking-wide text-foreground">
                Etapa 5
              </p>
              <h2 className="mt-1 text-2xl font-bold sm:text-3xl">
                Revise antes de emitir
              </h2>
              <p className="mt-2 text-base text-muted-foreground">
                A emissão usa o motor fiscal próprio e mantém consulta oficial
                por chave antes de qualquer reenvio.
              </p>
            </header>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="rounded-md border bg-white p-5 text-slate-950 shadow-sm sm:p-8">
                <div className="border-b-2 border-slate-900 pb-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em]">
                    {model === 65
                      ? "DANFC-e — pré-visualização"
                      : "DANFE — pré-visualização"}
                  </p>
                  <h3 className="mt-2 text-xl font-black">
                    {model === 65 ? "NFC-e" : "NF-e"} ·{" "}
                    {draft.direction === "entrada" ? "Entrada" : "Saída"}
                  </h3>
                  <p className="mt-1 text-sm">{draft.nature}</p>
                  {model === 55 && selectedSeries && (
                    <p className="mt-1 text-xs font-semibold">
                      Série {selectedSeries.series} · {selectedSeries.label}
                    </p>
                  )}
                </div>
                <div className="grid border-b border-slate-400 py-4 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase">
                      {draft.direction === "entrada"
                        ? "Fornecedor"
                        : "Destinatário"}
                    </p>
                    <p className="font-semibold">
                      {draft.party?.name || "Consumidor não identificado"}
                    </p>
                    <p className="text-xs">{draft.party?.document}</p>
                  </div>
                  <div className="mt-3 sm:mt-0 sm:text-right">
                    <p className="text-[10px] font-bold uppercase">Ambiente</p>
                    <p className="font-semibold">
                      Definido nas configurações fiscais
                    </p>
                  </div>
                </div>
                <div className="py-4">
                  <p className="mb-3 text-[10px] font-bold uppercase">
                    Produtos / serviços
                  </p>
                  {draft.items.map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-[1fr_auto] gap-3 border-t border-slate-300 py-2 text-sm"
                    >
                      <span>
                        {item.description}
                        <small className="block text-slate-600">
                          {item.quantity} {item.unit || "UN"} ×{" "}
                          {formatMoney(item.unitPrice, "BRL", locale)}
                        </small>
                      </span>
                      <strong>{formatMoney(item.total, "BRL", locale)}</strong>
                    </div>
                  ))}
                </div>
                <div className="border-t-2 border-slate-900 pt-4 text-right">
                  <span className="text-sm font-bold uppercase">
                    Valor total{" "}
                  </span>
                  <strong className="ml-3 text-xl">
                    {formatMoney(total, "BRL", locale)}
                  </strong>
                </div>
              </div>
              <aside className="space-y-4">
                <div className="rounded-2xl bg-foreground p-5 text-background">
                  <ReceiptText className="h-7 w-7" />
                  <h3 className="mt-4 text-lg font-bold">Resumo da emissão</h3>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div>
                      <dt className="text-background/65">
                        Origem
                      </dt>
                      <dd className="font-semibold">
                        {draft.sourceType === "manual"
                          ? "Preenchimento manual"
                          : draft.sourceType === "pdv_sale"
                            ? "Venda do PDV"
                            : draft.sourceType === "pdv_purchase"
                              ? "Compra do caixa/PDV"
                              : "Compra do estoque"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-background/65">
                        Itens
                      </dt>
                      <dd className="font-semibold">{draft.items.length}</dd>
                    </div>
                    {model === 55 && (
                      <div>
                        <dt className="text-background/65">Finalidade</dt>
                        <dd className="font-semibold">{goodsFinalConsumerLabel(draft)}</dd>
                      </div>
                    )}
                    {model === 55 && (
                      <div>
                        <dt className="text-background/65">Série</dt>
                        <dd className="font-semibold">
                          {selectedSeries ? `${selectedSeries.series} · ${selectedSeries.label}` : "Não selecionada"}
                        </dd>
                      </div>
                    )}
                    {model === 55 && (
                      <div>
                        <dt className="text-background/65">Frete</dt>
                        <dd className="font-semibold">
                          {draft.freightMode === 9
                            ? "Sem frete"
                            : draft.freightMode === 0
                              ? "Por conta do emitente"
                              : "Por conta do destinatário"}
                        </dd>
                        {selectedCarrier && <dd className="text-background/75">{selectedCarrier.name}</dd>}
                      </div>
                    )}
                    <div>
                      <dt className="text-background/65">
                        Total
                      </dt>
                      <dd className="text-xl font-bold">
                        {formatMoney(total, "BRL", locale)}
                      </dd>
                    </div>
                  </dl>
                </div>
                {fiscalIssues.length || (model === 55 && !selectedSeries) ? (
                  <div className="rounded-2xl border border-destructive p-4 text-destructive">
                    <p className="font-bold">Emissão bloqueada</p>
                    <p className="mt-1 text-sm">
                      {model === 55 && !selectedSeries
                        ? "Escolha uma série de NF-e ativa para esta operação."
                        : fiscalIssues.slice(0, 4).join("; ")}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border p-4">
                    <div className="flex items-center gap-2 font-bold">
                      <BadgeCheck className="h-5 w-5" />
                      Validações locais concluídas
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      O motor ainda fará schema, assinatura e validação oficial.
                    </p>
                  </div>
                )}
              </aside>
            </div>
          </section>
        )}
      </div>
    </FullscreenWizard>
  );
}
