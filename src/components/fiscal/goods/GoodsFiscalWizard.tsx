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

type Step = "dados" | "itens" | "impostos" | "faturamento" | "transporte" | "opcoes" | "preview";

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
  sourceType: "manual",
  sourceId: null,
  nature:
    direction === "entrada"
      ? "COMPRA DE MERCADORIA"
      : model === 65
        ? "VENDA A CONSUMIDOR"
        : "VENDA DE MERCADORIA",
  party: model === 65 ? null : emptyParty(),
  items: [],
  payments: [{ method: model === 65 ? "01" : "90", amount: 0, change: 0 }],
  freightMode: 9,
  notes: "",
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
  return <GoodsFiscalWizardContent key={`${access.scopeId}:${props.model}:${props.direction}:${props.sourceId ?? 'manual'}`} {...props} />;
}
function GoodsFiscalWizardContent({ model, direction, open, onOpenChange, onSaved, sourceType, sourceId, documentId, initialDraft, initialNature, includeIdentifiedConsumer = true }: GoodsFiscalWizardProps) {
  const { locale } = useAppLocaleContext();
  const [step, setStep] = useState<Step>("dados");
  const [draft, setDraft] = useState<GoodsFiscalDraft>(() => newDraft(model, direction));
  const [sourceMode, setSourceMode] = useState<"manual" | "import">("manual");
  const [sourceQuery, setSourceQuery] = useState("");
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const { items: inventory } = useInventory();
  const { customers } = useCustomers();
  const { suppliers } = useSuppliers();
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

  useEffect(() => {
    if (!open) return;
    setStep("dados");
    setDraft(newDraft(model, direction));
    setSourceMode("manual");
    setSourceQuery("");
    setSelectedSource(null);
    setSelectedPartyId("");
    if (initialNature) setDraft(current => ({ ...current, nature: initialNature }));
  }, [open, model, direction, initialNature]);

  useEffect(() => {
    if (!open || !sourceId || !sourceType) return;
    let active = true;
    setSourceMode('import'); setSelectedSource(sourceId); setSourceLoading(true); setSourceError(null);
    importSourceRef.current({ sourceType, sourceId }).then(imported => {
      if (!active) return;
      const saved = openingDocument.current.draft;
      const restored = saved?.model === model && saved.sourceType === sourceType && saved.sourceId === sourceId && Array.isArray(saved.items) && Array.isArray(saved.payments) ? saved : null;
      const party = restored ? restored.party : includeIdentifiedConsumer ? imported.party : null;
      setDraft(current => ({ ...current, ...imported, ...restored, id: openingDocument.current.id ?? null, model,
        sourceType, sourceId, direction: imported.direction, party,
        nature: restored?.nature || initialNature || current.nature }));
      setSelectedPartyId(party?.id ?? '');
    }).catch(() => { if (active) setSourceError('Não foi possível importar a venda confirmada. Confira seu acesso fiscal e tente novamente.'); })
      .finally(() => { if (active) setSourceLoading(false); });
    return () => { active = false; };
  }, [open, model, sourceId, sourceType, initialNature, includeIdentifiedConsumer]);

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
      setDraft((current) => ({
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
      toast.success(`${source.originLabel} importada para conferência.`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const selectCustomer = (id: string) => {
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
    });
  };

  const selectSupplier = (id: string) => {
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
    setDraft((current) => ({
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
      const response = await saver.mutateAsync({
        draft,
        emit,
      });
      if (typeof response.id === "string") patch({ id: response.id });
      if (response.status === 'authorized') toast.success(`${model === 65 ? 'NFC-e' : 'NF-e'} autorizada pela SEFAZ.`);
      else if (response.status === 'rejected') toast.error('Documento rejeitado. Confira a situação e corrija as pendências fiscais.');
      else if (emit) toast.message('Solicitação fiscal registrada. Acompanhe a situação desta mesma nota.');
      else toast.success('Rascunho salvo.');
      onSaved?.(response);
      if (emit) onOpenChange(false);
    } catch (error) {
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
        <div className="flex items-center gap-2">
          <Badge className="border-0 bg-primary text-primary-foreground hover:bg-primary/90">
            {draft.direction === "entrada" ? "Entrada" : "Saída"}
          </Badge>
          <Badge variant="outline">
            {model === 65 ? "Modelo 65" : "Modelo 55"}
          </Badge>
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
          <Badge className="gap-1.5 border-0 bg-primary px-3 py-1.5 text-primary-foreground">
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
        className="sticky top-0 z-10 -mx-4 overflow-x-auto border-b bg-background px-4 sm:-mx-10 sm:px-10"
      >
        <div className="flex min-w-max gap-1">
          {(isMobile ? STEPS.slice(0, 2) : STEPS).map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setStep(entry.key)}
              className={cn(
                "min-h-14 border-b-[3px] px-4 py-3 text-base font-semibold transition-colors lg:px-6 lg:text-[17px]",
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
                  className={cn(
                    "ml-auto flex min-h-14 items-center gap-1 whitespace-nowrap border-b-[3px] px-4 py-3 text-base font-semibold",
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
      </nav>

      <div className="mx-auto w-full max-w-7xl py-6 sm:py-8">
        {sourceLoading && <p role="status" className="mb-5 flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Importando a venda confirmada…</p>}
        {sourceError && <p role="alert" className="mb-5 text-destructive">{sourceError}</p>}
        {sourceId && !sourceLoading && !sourceError && <p className="mb-5 text-sm text-muted-foreground">Venda concluída importada para conferência. A emissão fiscal não altera o pagamento.</p>}
        {step === "dados" && (
          <section className="space-y-7">
            <header>
              <p className="text-sm font-semibold uppercase tracking-wide text-foreground">
                Etapa 1
              </p>
              <h2 className="mt-1 text-2xl font-bold sm:text-3xl">
                Dados da nota
              </h2>
              <p className="mt-2 max-w-3xl text-base text-muted-foreground">
                Preencha manualmente ou importe uma {draft.direction === "entrada" ? "compra" : "venda"} para evitar redigitação.
              </p>
            </header>
            <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-4">
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
                    party: model === 65 ? null : emptyParty(),
                  });
                  setSelectedSource(null);
                  setSelectedPartyId("");
                }}
                variant="outline"
                className={cn(
                  "h-10 gap-2 px-4 text-sm font-bold",
                  sourceMode === "manual" &&
                    "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
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
                    "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
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
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:border-foreground/30",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground",
                            selectedSource === source.sourceId &&
                              "bg-primary-foreground text-primary",
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
                                "text-primary-foreground/75",
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
          </section>
        )}

        {step === "dados" && (
          <section className="mt-8 space-y-7 border-t border-border/60 pt-7">
            <header>
              <p className="text-sm font-semibold uppercase tracking-wide text-foreground">
                {draft.direction === "entrada" ? "Fornecedor" : "Destinatário"}
              </p>
              <h2 className="mt-1 text-2xl font-bold sm:text-3xl">
                {draft.direction === "entrada"
                  ? "Quem forneceu"
                  : "Para quem é a nota"}
              </h2>
              <p className="mt-2 text-base text-muted-foreground">
                {model === 65
                  ? "Na NFC-e o consumidor pode ficar sem identificação."
                  : "Confira documento e endereço fiscal antes de avançar."}
              </p>
            </header>
            {model === 55 || draft.party ? (
              <div className="space-y-3">
                <Label htmlFor="goods-party-selector" className="font-semibold">
                  {draft.direction === "entrada" ? "Selecionar fornecedor" : "Selecionar cliente"}
                </Label>
                <div className="max-w-3xl [&_button:last-child]:bg-primary [&_button:last-child]:text-primary-foreground [&_button:last-child]:hover:bg-primary/90">
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
                <p className="text-sm text-muted-foreground">
                  Os dados fiscais abaixo são preenchidos pelo cadastro e continuam editáveis para conferência.
                </p>
              </div>
            ) : null}
            {model === 65 && draft.party && <Button type="button" variant="outline" onClick={() => { patch({party:null}); setSelectedPartyId(''); }}>Usar consumidor não identificado</Button>}
            {model === 65 && !draft.party ? (
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-primary p-5 text-primary-foreground">
                <div>
                  <p className="font-bold">Consumidor não identificado</p>
                  <p className="mt-1 text-sm text-primary-foreground/75">
                    Permitido para este fluxo de NFC-e.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => patch({ party: emptyParty() })}
                >
                  Identificar consumidor
                </Button>
              </div>
            ) : (
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
                    onChange={(e) =>
                      patchParty({ stateRegistration: e.target.value })
                    }
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
            )}
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
                                <Badge className="border-0 bg-primary text-primary-foreground">
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
                  onValueChange={(value) =>
                    patch({ freightMode: Number(value) })
                  }
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
              </div>}
              {step === "faturamento" && <div className="space-y-2">
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
              {step === "faturamento" && <div className="space-y-2">
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
              {step === "faturamento" && <div className="space-y-2">
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
                <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
                  <ReceiptText className="h-7 w-7" />
                  <h3 className="mt-4 text-lg font-bold">Resumo da emissão</h3>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div>
                      <dt className="text-primary-foreground/65">
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
                      <dt className="text-primary-foreground/65">
                        Itens
                      </dt>
                      <dd className="font-semibold">{draft.items.length}</dd>
                    </div>
                    <div>
                      <dt className="text-primary-foreground/65">
                        Total
                      </dt>
                      <dd className="text-xl font-bold">
                        {formatMoney(total, "BRL", locale)}
                      </dd>
                    </div>
                  </dl>
                </div>
                {fiscalIssues.length ? (
                  <div className="rounded-2xl border border-destructive p-4 text-destructive">
                    <p className="font-bold">Emissão bloqueada</p>
                    <p className="mt-1 text-sm">
                      {fiscalIssues.slice(0, 4).join("; ")}
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
