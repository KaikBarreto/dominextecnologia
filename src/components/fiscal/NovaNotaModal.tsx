import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  CircleCheck,
  Receipt,
  Save,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCustomers } from '@/hooks/useCustomers';
import { useFiscalSettings } from '@/hooks/useFiscalSettings';
import { useNfse, type NfseEmission } from '@/hooks/useNfse';
import { useUserCompany } from '@/hooks/useUserCompany';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { invokeNfse } from '@/utils/nfseEdge';
import { calculateNfseTaxes } from '@/utils/nfseTaxes';
import { NfseQuotaBlockModal, type NfseQuotaBlockInfo } from '@/components/fiscal/NfseQuotaBlockModal';

import { PessoasStep } from './nova-nota/PessoasStep';
import { ServicoStep } from './nova-nota/ServicoStep';
import { ValoresStep } from './nova-nota/ValoresStep';
import { EmitirStep } from './nova-nota/EmitirStep';
import type {
  NfseCustomer,
  NfseServicoState,
  NfseValoresState,
  NfseInitialDraft,
} from './nova-nota/types';

/**
 * NovaNotaModal — stepper de 4 etapas para emissão de NFS-e.
 * Espelha o padrão visual do EcoSistema (abas sublinhadas, barra de resumo
 * fixa, footer com Voltar/Cancelar/Salvar rascunho/Avançar-Emitir).
 *
 * Campos suportados: valorServico, aliquotaIssqn, tribIssqn, tpRetIssqn,
 * valorPis, valorCofins, valorCsll, percentualTribSn.
 * Campos OMITIDOS (não suportados): INSS, IRRF, deduções, descontos.
 *
 * Edges usadas:
 *  - nfse-save-draft (rascunho — upsert por id)
 *  - nfse-emit (emissão — via emissionId ou body completo)
 */

type StepKey = 'pessoas' | 'servico' | 'valores' | 'emitir';

const STEPS: { key: StepKey }[] = [
  { key: 'pessoas' },
  { key: 'servico' },
  { key: 'valores' },
  { key: 'emitir' },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

const emptyServico = (): NfseServicoState => ({
  serviceTypeId: '',
  codigoServico: '',
  codigoTributacaoMunicipal: '',
  codigoNbs: '',
  municipioIncidenciaIbge: '',
  municipioIncidenciaNome: '',
  tribIssqn: '1',
  discriminacao: '',
});

const emptyValores = (): NfseValoresState => ({
  valorServico: 0,
  aliquotaIssqn: 0,
  // '1' = ISS NÃO retido — é o caso da esmagadora maioria das notas. Declarar
  // retenção por default faria toda nota sair dizendo que o cliente reteve ISS.
  tpRetIssqn: '1',
  valorPis: 0,
  valorCofins: 0,
  valorCsll: 0,
  percentualTribSn: 0,
});

export interface NovaNotaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Chamado após emissão bem-sucedida. Recebe a emissão recém-criada pra o pai
   * abrir o detalhe e ligar o polling automático de status.
   */
  onEmitted?: (emission?: NfseEmission | null) => void;
  /** Chamado após salvar um rascunho com sucesso (pra a tela religar a lista/estado). */
  onSaved?: () => void;
  /**
   * Rascunho inicial (Onda 3 — reabrir nota salva).
   * Default undefined = nova nota.
   */
  initialDraft?: NfseInitialDraft;
}

export function NovaNotaModal({
  open,
  onOpenChange,
  onEmitted,
  onSaved,
  initialDraft,
}: NovaNotaModalProps) {
  const isMobile = useIsMobile();
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse;
  const s = t.stepper;
  const { companyId } = useUserCompany();
  const { customers, isLoading: customersLoading } = useCustomers();
  const { settings, isLoading: settingsLoading } = useFiscalSettings();
  const { invalidate: invalidateNfse } = useNfse();

  // ---- Estado do stepper ----
  const [activeStep, setActiveStep] = useState<StepKey>('pessoas');
  const [loading, setLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  /** ID do rascunho salvo (retornado pela edge). Null = não salvo ainda. */
  const [draftId, setDraftId] = useState<string | null>(null);

  // ---- Estado do formulário ----
  const [dataCompetencia, setDataCompetencia] = useState(todayISO());
  const [regimeApuracao, setRegimeApuracao] = useState('competencia');
  const [tomador, setTomador] = useState<NfseCustomer | null>(null);
  const [intermediario, setIntermediario] = useState<NfseCustomer | null>(null);
  const [servico, setServico] = useState<NfseServicoState>(emptyServico());
  const [valores, setValores] = useState<NfseValoresState>(emptyValores());

  /**
   * Serviços cujo convite de "completar o cadastro" já foi resolvido nesta
   * nota (salvo ou dispensado). Mora aqui, e não na etapa, porque a etapa
   * desmonta ao trocar de aba e o convite voltaria a aparecer. Guardado por id
   * de serviço: trocar de serviço no meio da nota volta a oferecer, pro
   * serviço novo.
   */
  const [gapFillResolved, setGapFillResolved] = useState<string[]>([]);

  // ---- Bloqueio de cota ----
  const [blockInfo, setBlockInfo] = useState<NfseQuotaBlockInfo | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);

  // ---- Defaults da config fiscal ----
  const isSimples = settings.regime_tributario === 'simples_nacional';

  // Pré-preenche campos de defaults a partir das configurações fiscais.
  useEffect(() => {
    if (!open) return;
    if (initialDraft) return; // o rascunho sobrescreve
    if (settings.municipio_ibge && !servico.municipioIncidenciaIbge) {
      setServico((prev) => ({
        ...prev,
        municipioIncidenciaIbge: settings.municipio_ibge ?? '',
      }));
    }
    if (settings.codigo_servico_default && !servico.codigoServico) {
      setServico((prev) => ({
        ...prev,
        codigoServico: settings.codigo_servico_default ?? '',
      }));
    }
    if (settings.codigo_nbs_default && !servico.codigoNbs) {
      setServico((prev) => ({
        ...prev,
        codigoNbs: settings.codigo_nbs_default ?? '',
      }));
    }
    if (settings.iss_aliquota != null && !valores.aliquotaIssqn) {
      setValores((prev) => ({
        ...prev,
        aliquotaIssqn: settings.iss_aliquota ?? 0,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, settings]);

  // ---- Hidratação de rascunho inicial ----
  useEffect(() => {
    if (!open || !initialDraft) return;
    setDraftId(initialDraft.id ?? null);
    if (initialDraft.dataCompetencia) setDataCompetencia(initialDraft.dataCompetencia);
    if (initialDraft.regimeApuracao) setRegimeApuracao(initialDraft.regimeApuracao);
    if (initialDraft.servico) {
      setServico((prev) => ({ ...prev, ...initialDraft.servico }));
    }
    if (initialDraft.valores) {
      setValores((prev) => ({ ...prev, ...initialDraft.valores }));
    }
    // Tomador/intermediário: resolve da lista de customers pelo id
    if (initialDraft.customerId && customers.length) {
      const c = customers.find((x) => x.id === initialDraft.customerId);
      if (c) setTomador(c as unknown as NfseCustomer);
    }
    if (initialDraft.intermediarioCustomerId && customers.length) {
      const c = customers.find((x) => x.id === initialDraft.intermediarioCustomerId);
      if (c) setIntermediario(c as unknown as NfseCustomer);
    }
  }, [open, initialDraft, customers]);

  // ---- Patch helpers ----
  const patchServico = (patch: Partial<NfseServicoState>) =>
    setServico((prev) => ({ ...prev, ...patch }));
  const patchValores = (patch: Partial<NfseValoresState>) =>
    setValores((prev) => ({ ...prev, ...patch }));

  // ---- Cálculo em tempo real (função pura, fonte única) ----
  const taxes = useMemo(
    () =>
      calculateNfseTaxes({
        valorServico: valores.valorServico,
        aliquotaIssqn: valores.aliquotaIssqn,
        tpRetIssqn: valores.tpRetIssqn,
        valorPis: valores.valorPis,
        valorCofins: valores.valorCofins,
        valorCsll: valores.valorCsll,
      }),
    [valores],
  );

  // ---- Validação por etapa ----
  const pessoasErrors = useMemo(() => {
    const e: string[] = [];
    if (!dataCompetencia) e.push(s.pessoas.competencia.required);
    else if (dataCompetencia > todayISO()) e.push(s.pessoas.competencia.futureError);
    if (!tomador) e.push(s.pessoas.tomador.required);
    return e;
  }, [dataCompetencia, tomador, s]);

  const servicoErrors = useMemo(() => {
    const e: string[] = [];
    if (!servico.discriminacao.trim()) e.push(s.servico.discriminacao.required);
    // A emissão recusa a nota sem código de tributação / NBS. Só não exigimos
    // aqui quando a empresa tem padrão salvo, porque a emissão cai nele.
    if (!servico.codigoServico.trim() && !settings.codigo_servico_default) {
      e.push(s.servico.codigos.codigoServico.required);
    }
    if (!servico.codigoNbs.trim() && !settings.codigo_nbs_default) {
      e.push(s.servico.codigos.codigoNbs.required);
    }
    // cTribMun é opcional (em branco herda do tipo de serviço), mas quando
    // preenchido tem que ter exatamente os 3 dígitos do layout.
    const cTribMun = servico.codigoTributacaoMunicipal.trim();
    if (cTribMun && cTribMun.length !== 3) {
      e.push(s.servico.codigos.codigoTributacaoMunicipal.invalid);
    }
    return e;
  }, [servico, s, settings.codigo_servico_default, settings.codigo_nbs_default]);

  const valoresErrors = useMemo(() => {
    const e: string[] = [];
    if (!(valores.valorServico > 0)) e.push(s.valores.valorServico.required);
    // Optante do Simples: o percentual total de tributos é obrigatório na nota
    // (a prefeitura rejeita sem ele). O número é do contador — não estimamos.
    if (isSimples && !(valores.percentualTribSn > 0)) {
      e.push(s.valores.percTribSn.required);
    }
    return e;
  }, [valores, s, isSimples]);

  // Bloqueio de emissão: aponta a peça que está faltando, na ordem do
  // onboarding (registro da empresa → município liberado → certificado A1).
  // `pode_emitir` sozinho só diz que o município é coberto.
  const habilitacaoErrors = useMemo(() => {
    const e: string[] = [];
    if (!settings.provider_company_id) e.push(s.emitir.habilitacaoErrorRegistro);
    else if (!settings.pode_emitir) e.push(s.emitir.habilitacaoErrorMunicipio);
    else if (!settings.provider_certificate_id) e.push(s.emitir.habilitacaoError);
    return e;
  }, [settings.provider_company_id, settings.pode_emitir, settings.provider_certificate_id, s]);

  const habilitacaoWarnings = useMemo(() => {
    const w: string[] = [];
    if (settings.provider_company_id && !settings.inscricao_municipal) {
      w.push('Inscrição Municipal não configurada. A maioria dos municípios exige. Confira nas Configurações Fiscais.');
    }
    return w;
  }, [settings]);

  const allErrors = useMemo(
    () => [...habilitacaoErrors, ...pessoasErrors, ...servicoErrors, ...valoresErrors],
    [habilitacaoErrors, pessoasErrors, servicoErrors, valoresErrors],
  );

  const stepPendencias: Record<StepKey, number> = {
    pessoas: pessoasErrors.length,
    servico: servicoErrors.length,
    valores: valoresErrors.length,
    emitir: habilitacaoErrors.length,
  };

  const totalPendencias = allErrors.length;
  const canEmit = totalPendencias === 0 && valores.valorServico > 0;

  // ---- Navegação ----
  const currentIdx = STEPS.findIndex((s) => s.key === activeStep);
  const isFirstStep = currentIdx <= 0;
  const isLastStep = currentIdx >= STEPS.length - 1;
  const goPrev = () => { if (!isFirstStep) setActiveStep(STEPS[currentIdx - 1].key); };
  const goNext = () => { if (!isLastStep) setActiveStep(STEPS[currentIdx + 1].key); };

  // ---- Indicador de pendência na aba ----
  const renderStepIndicator = (key: StepKey) => {
    const count = stepPendencias[key];
    if (count > 0) {
      return (
        <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
          {count}
        </span>
      );
    }
    if (key === 'pessoas' && !!tomador) {
      return <CircleCheck className="ml-1.5 h-3.5 w-3.5 text-emerald-500" />;
    }
    return null;
  };

  // ---- Dados do prestador p/ revisão ----
  const prestador = useMemo(
    () => ({
      razaoSocial: (settings as any).razao_social ?? null,
      cnpj: (settings as any).cnpj ?? null,
      inscricaoMunicipal: settings.inscricao_municipal,
      cidade: (settings as any).cidade ?? null,
      uf: (settings as any).uf ?? null,
    }),
    [settings],
  );

  // ---- Reset ----
  const resetForm = useCallback(() => {
    setActiveStep('pessoas');
    setDataCompetencia(todayISO());
    setRegimeApuracao('competencia');
    setTomador(null);
    setIntermediario(null);
    setServico(emptyServico());
    setValores(emptyValores());
    setDraftId(null);
    setGapFillResolved([]);
  }, []);

  const hasUnsavedData =
    !!tomador ||
    servico.discriminacao.trim() !== '' ||
    valores.valorServico > 0;

  const handleClose = () => {
    if (hasUnsavedData) {
      setShowCancelConfirm(true);
    } else {
      resetForm();
      onOpenChange(false);
    }
  };

  const handleConfirmClose = () => {
    setShowCancelConfirm(false);
    resetForm();
    onOpenChange(false);
  };

  // ---- Montar body do rascunho ----
  const buildDraftBody = useCallback(() => ({
    ...(draftId ? { id: draftId } : {}),
    customerId: tomador?.id ?? null,
    intermediarioCustomerId: intermediario?.id ?? null,
    dataCompetencia: dataCompetencia || null,
    regimeApuracao: isSimples ? regimeApuracao : null,
    servico: {
      // A ESCOLHA do serviço (não só os códigos que ela preencheu). Mandado
      // SEMPRE, inclusive nulo: é assim que "nenhum serviço" volta a valer ao
      // reabrir o rascunho. Sem isso o seletor abre vazio com os campos cheios.
      serviceTypeId: servico.serviceTypeId || null,
      codigoServico: servico.codigoServico || undefined,
      // Mandado SEMPRE (mesmo vazio): string vazia é como o rascunho volta a
      // herdar o código do tipo de serviço. Com `undefined` a chave sumiria do
      // JSON e o valor antigo ficaria gravado, sem como limpar pela tela.
      codigoTributacaoMunicipal: servico.codigoTributacaoMunicipal,
      codigoNbs: servico.codigoNbs || undefined,
      municipioIncidenciaIbge: servico.municipioIncidenciaIbge || undefined,
      descricao: servico.discriminacao || undefined,
    },
    valores: {
      valorServico: valores.valorServico || undefined,
      aliquotaIssqn: valores.aliquotaIssqn || undefined,
      tribIssqn: servico.tribIssqn || undefined,
      tpRetIssqn: valores.tpRetIssqn || undefined,
      valorPis: valores.valorPis || undefined,
      valorCofins: valores.valorCofins || undefined,
      valorCsll: valores.valorCsll || undefined,
      percentualTribSn: valores.percentualTribSn || undefined,
    },
  }), [draftId, tomador, intermediario, dataCompetencia, isSimples, regimeApuracao, servico, valores]);

  // ---- Trava anti-duplo-toque ----
  const submittingRef = useRef(false);

  const handleSaveDraft = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    try {
      const res = await invokeNfse<{ emission?: { id: string } }>('nfse-save-draft', buildDraftBody());
      if (!res.ok) {
        toast.error(res.message ?? s.toasts.draftError);
        return;
      }
      const id = res.data?.emission?.id ?? null;
      if (id) setDraftId(id);
      toast.success(s.toasts.draftSaved);
      onSaved?.();
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  /**
   * Emite a nota:
   * - Se há draftId: salva o estado atual (upsert) e depois emite por emissionId.
   * - Caso contrário: emite direto com o body completo.
   */
  const handleEmit = async () => {
    if (submittingRef.current) return;
    if (!canEmit) {
      toast.error(s.toasts.fixPendencias);
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    try {
      let emissionIdToUse = draftId;

      // Salva/atualiza o rascunho primeiro (persistência do estado atual).
      const saveRes = await invokeNfse<{ emission?: { id: string } }>(
        'nfse-save-draft',
        buildDraftBody(),
      );
      if (saveRes.ok && saveRes.data?.emission?.id) {
        emissionIdToUse = saveRes.data.emission.id;
        setDraftId(emissionIdToUse);
      }

      // Emite: via emissionId (se rascunho salvo) ou body completo.
      const emitBody = emissionIdToUse
        ? { emissionId: emissionIdToUse }
        : {
            customerId: tomador!.id,
            dataCompetencia: dataCompetencia || undefined,
            servico: {
              descricao: servico.discriminacao,
              ...(servico.codigoServico ? { codigoServico: servico.codigoServico } : {}),
              ...(servico.codigoTributacaoMunicipal
                ? { codigoTributacaoMunicipal: servico.codigoTributacaoMunicipal }
                : {}),
              ...(servico.codigoNbs ? { codigoNbs: servico.codigoNbs } : {}),
              ...(servico.municipioIncidenciaIbge ? { municipioIncidenciaIbge: servico.municipioIncidenciaIbge } : {}),
            },
            // Nomes CANÔNICOS esperados pela emissão: `aliquotaIss` e
            // `percentualTotalTributosSimplesNacional`. Mandar outro nome fazia
            // a alíquota de ISS cair calada no padrão da empresa.
            valores: {
              valorServico: valores.valorServico,
              ...(valores.aliquotaIssqn ? { aliquotaIss: valores.aliquotaIssqn } : {}),
              tribIssqn: servico.tribIssqn,
              tpRetIssqn: valores.tpRetIssqn,
              ...(valores.valorPis ? { valorPis: valores.valorPis } : {}),
              ...(valores.valorCofins ? { valorCofins: valores.valorCofins } : {}),
              ...(valores.valorCsll ? { valorCsll: valores.valorCsll } : {}),
              ...(valores.percentualTribSn
                ? { percentualTotalTributosSimplesNacional: valores.percentualTribSn }
                : {}),
            },
          };

      const emitRes = await invokeNfse<{ emission?: NfseEmission }>('nfse-emit', emitBody);

      if (!emitRes.ok) {
        if (emitRes.errorCode === 'nfse_quota_exceeded') {
          const b = emitRes.errorBody ?? {};
          const nt = b.next_tier as Record<string, unknown> | null | undefined;
          setBlockInfo({
            used: typeof b.used === 'number' ? b.used : 0,
            limit: typeof b.limit === 'number' ? b.limit : 0,
            tier: typeof b.tier === 'number' ? b.tier : 1,
            nextTier: nt
              ? {
                  tier: Number(nt.tier),
                  name: String(nt.name ?? t.newNote.quotaBlock.tierFallback.replace('{tier}', String(nt.tier))),
                  limit: nt.limit == null ? null : Number(nt.limit),
                  price: Number(nt.price ?? 0),
                }
              : null,
          });
          setBlockOpen(true);
          return;
        }
        toast.error(emitRes.message ?? s.toasts.emitError);
        return;
      }

      toast.success(emitRes.message ?? s.toasts.emitSuccess);
      invalidateNfse();
      const created = (emitRes.data?.emission as NfseEmission | undefined) ?? null;
      resetForm();
      onOpenChange(false);
      onEmitted?.(created);
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  // Pós-upgrade de cota: reexecuta a emissão.
  const handleUpgraded = async () => {
    await handleEmit();
  };

  // ---- Lista de customers como NfseCustomer (subconjunto) ----
  const nfseCustomers = useMemo(
    () =>
      customers.map((c): NfseCustomer => ({
        id: c.id,
        name: c.name,
        company_name: c.company_name,
        nome_fantasia: c.nome_fantasia,
        document: c.document,
        address: c.address,
        address_number: c.address_number,
        complement: c.complement,
        neighborhood: c.neighborhood,
        city: c.city,
        state: c.state,
        zip_code: c.zip_code,
        ibge_municipality_code: c.ibge_municipality_code,
        inscricao_municipal: c.inscricao_municipal,
      })),
    [customers],
  );

  // ---- Barra de resumo ----
  const summaryBar = (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-4 py-2.5">
      <div className="flex items-center gap-4 min-w-0">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {s.summary.total}
          </p>
          <p className="text-lg font-bold leading-tight text-emerald-500 dark:text-emerald-400 tabular-nums">
            {formatMoney(taxes.valorLiquido, currency, locale as any)}
          </p>
        </div>
        <Separator orientation="vertical" className="h-8" />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {s.summary.baseIss}
          </p>
          <p className="text-lg font-bold leading-tight text-foreground tabular-nums">
            {formatMoney(taxes.baseCalculo, currency, locale as any)}
          </p>
        </div>
      </div>
      {totalPendencias > 0 ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex cursor-help outline-none">
                <Badge className="gap-1.5 whitespace-nowrap shrink-0 bg-red-600 text-white border-0 py-1.5 px-3">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {s.summary.pendencias.replace('{n}', String(totalPendencias))}
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" className="max-w-[300px]">
              <p className="font-medium mb-1">
                {s.summary.tooltipTitle}
              </p>
              <ul className="text-xs list-disc pl-4 space-y-0.5">
                {allErrors.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <Badge className="gap-1.5 whitespace-nowrap shrink-0 bg-emerald-600 text-white border-0 py-1.5 px-3">
          <CircleCheck className="h-3.5 w-3.5" />
          {s.summary.pronta}
        </Badge>
      )}
    </div>
  );

  // ---- Abas do stepper ----
  const stepTabs = (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide border-b border-border">
      {STEPS.map((step) => (
        <button
          key={step.key}
          type="button"
          onClick={() => setActiveStep(step.key)}
          className={`flex items-center whitespace-nowrap px-4 py-3 text-sm border-b-[3px] transition-colors -mb-[1px] ${
            activeStep === step.key
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-muted-foreground font-semibold hover:text-foreground hover:border-muted-foreground/30'
          }`}
        >
          {(s.tabs as Record<string, string>)[step.key]}
          {renderStepIndicator(step.key)}
        </button>
      ))}
    </div>
  );

  // ---- Conteúdo das etapas ----
  const stepContent = (
    <div className="space-y-4">
      {summaryBar}
      {stepTabs}

      {activeStep === 'pessoas' && (
        <PessoasStep
          customers={nfseCustomers}
          isSimples={isSimples}
          dataCompetencia={dataCompetencia}
          onDataCompetencia={setDataCompetencia}
          regimeApuracao={regimeApuracao}
          onRegimeApuracao={setRegimeApuracao}
          tomador={tomador}
          onTomadorChange={setTomador}
          intermediario={intermediario}
          onIntermediarioChange={setIntermediario}
          errors={pessoasErrors}
        />
      )}

      {activeStep === 'servico' && (
        <ServicoStep
          servico={servico}
          onServicoChange={patchServico}
          onValoresChange={patchValores}
          aliquotaIssqn={valores.aliquotaIssqn}
          gapFillResolved={gapFillResolved}
          onGapFillResolved={(id) =>
            setGapFillResolved((prev) => (prev.includes(id) ? prev : [...prev, id]))
          }
          defaultCodigoServico={settings.codigo_servico_default}
          defaultCodigoNbs={settings.codigo_nbs_default}
          defaultMunicipioIbge={settings.municipio_ibge}
          errors={servicoErrors}
        />
      )}

      {activeStep === 'valores' && (
        <ValoresStep
          valores={valores}
          onChange={patchValores}
          taxes={taxes}
          errors={valoresErrors}
          isSimples={isSimples}
        />
      )}

      {activeStep === 'emitir' && (
        <EmitirStep
          loading={loading}
          prestador={prestador}
          tomador={tomador}
          intermediario={intermediario}
          dataCompetencia={dataCompetencia}
          servico={servico}
          valores={valores}
          taxes={taxes}
          habilitacaoErrors={habilitacaoErrors}
          habilitacaoWarnings={habilitacaoWarnings}
        />
      )}
    </div>
  );

  // ---- Footer ----
  const footerContent = (
    <div
      className={`flex w-full gap-2 ${
        isMobile ? 'flex-col' : 'items-center justify-between'
      }`}
    >
      {/* Esquerda: Voltar (esconde na 1ª etapa) */}
      <div className={isMobile ? 'order-2' : ''}>
        {!isFirstStep && (
          <Button
            variant="outline"
            onClick={goPrev}
            disabled={loading}
            className={isMobile ? 'w-full' : ''}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {s.footer.voltar}
          </Button>
        )}
      </div>

      {/* Direita: Cancelar · Salvar Rascunho · Avançar/Emitir */}
      <div className={`flex gap-2 ${isMobile ? 'flex-col order-1' : 'items-center'}`}>
        <Button
          variant="ghost"
          onClick={handleClose}
          disabled={loading}
          className={`${isMobile ? 'w-full' : ''} text-destructive hover:bg-red-600 hover:text-white`}
        >
          {s.footer.cancelar}
        </Button>
        <Button
          variant="outline"
          onClick={handleSaveDraft}
          disabled={loading}
          // Sem cor cravada: `bg-white` + texto claro do tema escuro deixava o
          // botão branco no branco. O variant outline já resolve claro/escuro.
          className={isMobile ? 'w-full' : ''}
        >
          <Save className="h-4 w-4 mr-2" />
          {s.footer.salvarRascunho}
        </Button>
        {!isLastStep ? (
          <Button
            onClick={goNext}
            disabled={loading}
            className={isMobile ? 'w-full' : ''}
          >
            {s.footer.avancar}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={isMobile ? 'w-full' : ''}>
                  <Button
                    onClick={handleEmit}
                    disabled={loading || !canEmit}
                    className={isMobile ? 'w-full' : ''}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {s.footer.emitir}
                  </Button>
                </span>
              </TooltipTrigger>
              {!canEmit && (
                <TooltipContent>
                  <p>{s.toasts.fixPendencias}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Modal principal — Dialog (desktop) / Drawer (mobile) */}
      {isMobile ? (
        <Drawer
          open={open}
          onOpenChange={(isOpen) => {
            if (!isOpen) handleClose();
          }}
          handleOnly
        >
          <DrawerContent
            className="max-h-[95vh] flex flex-col"
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DrawerHeader className="border-b pb-3 flex-shrink-0">
              <DrawerTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                {s.title}
              </DrawerTitle>
            </DrawerHeader>
            <div className="flex-1 overflow-y-auto px-4 py-4 overscroll-contain">
              {stepContent}
            </div>
            <DrawerFooter className="border-t pt-4 flex-shrink-0 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
              {footerContent}
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog
          open={open}
          onOpenChange={(isOpen) => {
            if (!isOpen) handleClose();
          }}
        >
          <DialogContent
            className="max-w-4xl w-[95vw] h-[92dvh] max-h-[92dvh] flex flex-col min-h-0 overflow-hidden p-0"
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b">
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                {s.title}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
              {stepContent}
            </div>
            <DialogFooter className="gap-2 shrink-0 px-6 py-4 border-t">
              {footerContent}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirmação de cancelamento com dados não salvos */}
      <ResponsiveModal
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title={s.cancelConfirm.title}
        description={s.cancelConfirm.description}
        footer={
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowCancelConfirm(false)}>
              {s.cancelConfirm.back}
            </Button>
            <Button variant="destructive" onClick={handleConfirmClose}>
              {s.cancelConfirm.confirm}
            </Button>
          </div>
        }
      >
        {null}
      </ResponsiveModal>

      {/* Bloqueio de cota (HTTP 402 nfse_quota_exceeded) */}
      <NfseQuotaBlockModal
        open={blockOpen}
        onOpenChange={setBlockOpen}
        info={blockInfo}
        companyId={companyId}
        onUpgraded={handleUpgraded}
      />
    </>
  );
}

export default NovaNotaModal;
