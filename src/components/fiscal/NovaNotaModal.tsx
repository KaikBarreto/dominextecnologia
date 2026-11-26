import { HorizontalTabBar } from '@/components/ui/HorizontalTabBar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { FullscreenWizard, FullscreenWizardAction } from '@/components/ui/FullscreenWizard';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCustomers } from '@/hooks/useCustomers';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import {
  emissaoNacionalObrigatoriaSimples,
  useFiscalSettings,
} from '@/hooks/useFiscalSettings';
import { useNfse, type NfseEmission } from '@/hooks/useNfse';
import { useUserCompany } from '@/hooks/useUserCompany';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { nfseFiscalToday } from '@/lib/fiscal/nfseDates';
import { invokeNfse, nfseOrientationDescription } from '@/utils/nfseEdge';
import { calculateNfseTaxes } from '@/utils/nfseTaxes';
import { NfseQuotaBlockModal, type NfseQuotaBlockInfo } from '@/components/fiscal/NfseQuotaBlockModal';

import { PessoasStep } from './nova-nota/PessoasStep';
import { ServicoStep } from './nova-nota/ServicoStep';
import { ValoresStep } from './nova-nota/ValoresStep';
import { EmitirStep } from './nova-nota/EmitirStep';
import type {
  NfseCustomer,
  NfseIbsCbsState,
  NfseServicoState,
  NfseValoresState,
  NfseInitialDraft,
} from './nova-nota/types';

/**
 * NovaNotaModal — stepper de 4 etapas para emissão de NFS-e.
 * Espelha o padrão visual do EcoSistema (abas sublinhadas, barra de resumo
 * fixa, footer com Voltar/Cancelar/Salvar rascunho/Avançar-Emitir).
 *
 * Contrato canônico: ISS, PIS, COFINS, CSLL, INSS, IRRF, descontos,
 * intermediário e referências técnicas/contratuais.
 *
 * Tomador/intermediário: `customerId` (cadastrado) OU `tomadorAvulso`/
 * `intermediarioAvulso` (digitado na hora, nunca os dois — migration
 * 20260906210000). Endereço do avulso é tudo-ou-nada: incompleto vira 422
 * `invalid_tomador` na emissão (validado no client em `pessoasErrors` antes
 * de deixar emitir). Intermediário segue as mesmas regras de cadastro avulso
 * e isolamento por tenant do tomador.
 *
 * Edges usadas:
 *  - nfse-save-draft (rascunho — upsert por id)
 *  - nfse-emit (emissão — via emissionId ou body completo)
 */

type StepKey = 'pessoas' | 'servico' | 'valores' | 'emitir';

/** Códigos de erro da emissão que dizem respeito à etapa Pessoas (tomador/intermediário). */
const PESSOAS_EMIT_ERROR_CODES = new Set([
  'tomador_ambiguo',
  'missing_customer',
  'invalid_tomador',
  'intermediary_not_found',
  'invalid_intermediary',
]);

const STEPS: { key: StepKey }[] = [
  { key: 'pessoas' },
  { key: 'servico' },
  { key: 'valores' },
  { key: 'emitir' },
];

const emptyServico = (): NfseServicoState => ({
  serviceTypeId: '',
  codigoServico: '',
  codigoTributacaoMunicipal: '',
  codigoNbs: '',
  municipioIncidenciaIbge: '',
  municipioIncidenciaNome: '',
  tribIssqn: '1',
  discriminacao: '',
  documentoResponsabilidadeTecnica: '',
  documentoReferencia: '',
  pedidoB2b: '',
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
  valorInss: 0,
  valorIrrf: 0,
  deducoes: 0,
  descontoCondicionado: 0,
  descontoIncondicionado: 0,
  percentualTribSn: 0,
});

const ibsCbsFromSettings = (
  settings: ReturnType<typeof useFiscalSettings>['settings'],
): NfseIbsCbsState => ({
  ativo: settings.nfse_ibscbs_ativo,
  codigoIndicadorOperacao: settings.nfse_ibscbs_cindop || '',
  cst: settings.nfse_ibscbs_cst || '',
  classificacaoTributaria: settings.nfse_ibscbs_cclasstrib || '',
  consumidorFinal: settings.nfse_ibscbs_indfinal === '1' ? '1' : '0',
  destinatarioDiferente: settings.nfse_ibscbs_inddest === '1' ? '1' : '0',
});

/**
 * Campos do endereço avulso que o layout nacional exige QUANDO o bloco de
 * endereço é enviado — espelha `ENDERECO_OBRIGATORIO` de
 * `supabase/functions/_shared/nfse-handlers/common.ts` (mesma ordem, mesmos
 * rótulos). Cliente valida ANTES de mandar pra edge: endereço pela metade só
 * lá vira 422 `invalid_tomador` com uma mensagem tardia.
 */
const ENDERECO_AVULSO_CAMPOS: Array<[keyof NfseCustomer, string]> = [
  ['address', 'logradouro'],
  ['address_number', 'número'],
  ['neighborhood', 'bairro'],
  ['zip_code', 'CEP'],
  ['ibge_municipality_code', 'código IBGE do município (preenchido pela busca do CEP)'],
];

/**
 * `null` = endereço OK pra emitir (todo em branco OU todo preenchido).
 * Array = endereço começado mas incompleto — rótulos PT-BR do que falta.
 */
function enderecoAvulsoIncompleto(party: NfseCustomer): string[] | null {
  const val = (k: keyof NfseCustomer) => (party[k] as string | null | undefined)?.trim();
  const preenchidos = ENDERECO_AVULSO_CAMPOS.filter(([k]) => val(k));
  const faltando = ENDERECO_AVULSO_CAMPOS.filter(([k]) => !val(k));
  const comecouEndereco = preenchidos.length > 0 || !!val('city') || !!val('state') || !!val('complement');
  if (comecouEndereco && faltando.length > 0) {
    return faltando.map(([, rotulo]) => rotulo);
  }
  return null;
}

/**
 * Monta o objeto `tomadorAvulso`/`intermediarioAvulso` do body das edges a
 * partir do `NfseCustomer` em modo manual. `null` quando a parte não está em
 * modo manual (a edge trata `null` explícito como "limpar o avulso" — ver
 * `resolverParte` em `nfse-save-draft`, que exige as DUAS colunas sempre
 * juntas por causa do CHECK de exclusão mútua no banco).
 */
function buildPessoaAvulsoPayload(party: NfseCustomer | null): Record<string, unknown> | null {
  if (!party || party.partyEntryMode !== 'manual') return null;
  return {
    nome: party.name || undefined,
    documento: party.document || undefined,
    email: party.email || undefined,
    endereco: {
      logradouro: party.address || undefined,
      numero: party.address_number || undefined,
      complemento: party.complement || undefined,
      bairro: party.neighborhood || undefined,
      cidade: party.city || undefined,
      uf: party.state || undefined,
      cep: party.zip_code || undefined,
      ibge: party.ibge_municipality_code || undefined,
    },
  };
}

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
  const navigate = useNavigate();
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse;
  const s = t.stepper;
  const { companyId } = useUserCompany();
  const { customers, isLoading: customersLoading } = useCustomers();
  const { settings } = useFiscalSettings();
  const { settings: companySettings } = useCompanySettings();
  const { invalidate: invalidateNfse } = useNfse();

  // ---- Estado do stepper ----
  const [activeStep, setActiveStep] = useState<StepKey>('pessoas');
  const [loading, setLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  /** ID do rascunho salvo (retornado pela edge). Null = não salvo ainda. */
  const [draftId, setDraftId] = useState<string | null>(null);

  // ---- Estado do formulário ----
  const [dataCompetencia, setDataCompetencia] = useState(() => nfseFiscalToday());
  const [regimeApuracao, setRegimeApuracao] = useState('competencia');
  const [tomador, setTomador] = useState<NfseCustomer | null>(null);
  const [intermediario, setIntermediario] = useState<NfseCustomer | null>(null);
  const [servico, setServico] = useState<NfseServicoState>(emptyServico());
  const [valores, setValores] = useState<NfseValoresState>(emptyValores());
  const [ibsCbs, setIbsCbs] = useState<NfseIbsCbsState>(() => ibsCbsFromSettings(settings));

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
  const nationalEmissionRequiredBySimple = emissaoNacionalObrigatoriaSimples(
    settings.regime_tributario,
    dataCompetencia,
  );

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
    // Percentual de tributos do Simples Nacional: nasce do que o contador
    // salvou em Configurações fiscais > Tributação, e segue editável nesta
    // nota (não sobrescreve o que o usuário já digitou).
    if (settings.percentual_trib_sn != null && !valores.percentualTribSn) {
      setValores((prev) => ({
        ...prev,
        percentualTribSn: settings.percentual_trib_sn ?? 0,
      }));
    }
    setIbsCbs(ibsCbsFromSettings(settings));
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
    if (initialDraft.ibsCbs) {
      setIbsCbs((prev) => ({ ...prev, ...initialDraft.ibsCbs }));
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
  const patchIbsCbs = (patch: Partial<NfseIbsCbsState>) =>
    setIbsCbs((prev) => ({ ...prev, ...patch }));

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
        valorInss: valores.valorInss,
        valorIrrf: valores.valorIrrf,
        deducoes: valores.deducoes,
        descontoIncondicionado: valores.descontoIncondicionado,
      }),
    [valores],
  );

  // ---- Validação por etapa ----
  const pessoasErrors = useMemo(() => {
    const e: string[] = [];
    if (!dataCompetencia) e.push(s.pessoas.competencia.required);
    else if (dataCompetencia > nfseFiscalToday()) e.push(s.pessoas.competencia.futureError);
    if (!tomador) e.push(s.pessoas.tomador.required);

    const tomadorManual = tomador?.partyEntryMode === 'manual';

    if (tomadorManual) {
      if (!tomador?.name?.trim()) e.push(s.pessoas.tomador.manualNameRequired);
      if (!tomador?.document?.trim()) e.push(s.pessoas.tomador.manualDocRequired);
      const faltandoEndereco = enderecoAvulsoIncompleto(tomador);
      if (faltandoEndereco) {
        e.push(
          s.pessoas.manual.enderecoIncompletoTomador.replace(
            '{campos}',
            faltandoEndereco.join(', '),
          ),
        );
      }
    } else if (tomador && !tomador.document?.trim()) {
      // Promovido de aviso pra pendência bloqueante (Tarefa 2): deixar
      // avançar aqui só adiava a quebra pra depois de preencher Serviço e
      // Valores — a nota é recusada na emissão sem CPF/CNPJ do tomador.
      e.push(s.pessoas.tomador.missingDoc);
    }

    if (intermediario?.partyEntryMode === 'manual') {
      if (!intermediario.name?.trim()) {
        e.push(s.pessoas.intermediario.manualNameRequired);
      }
      if (!intermediario.document?.trim()) {
        e.push(s.pessoas.intermediario.manualDocRequired);
      }
      const faltandoEndereco = enderecoAvulsoIncompleto(intermediario);
      if (faltandoEndereco) {
        e.push(
          s.pessoas.manual.enderecoIncompletoIntermediario.replace(
            '{campos}',
            faltandoEndereco.join(', '),
          ),
        );
      }
    } else if (intermediario && !intermediario.document?.trim()) {
      e.push(s.pessoas.intermediario.missingDoc);
    }

    return e;
  }, [dataCompetencia, tomador, intermediario, s]);

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
    if (ibsCbs.ativo) {
      if (!/^\d{6}$/.test(ibsCbs.codigoIndicadorOperacao)) e.push('Informe o cIndOp IBS/CBS com 6 dígitos.');
      if (!/^\d{3}$/.test(ibsCbs.cst)) e.push('Informe o CST IBS/CBS com 3 dígitos.');
      if (!/^\d{6}$/.test(ibsCbs.classificacaoTributaria)) e.push('Informe o cClassTrib IBS/CBS com 6 dígitos.');
    }
    return e;
  }, [servico, ibsCbs, s, settings.codigo_servico_default, settings.codigo_nbs_default]);

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

  // Produção exige cobertura municipal confirmada. Homologação envia a DPS de
  // teste para o Portal dar a resposta definitiva, sempre sem efeito fiscal.
  const certificateExpiresAt = settings.certificate_expires_at
    ? new Date(settings.certificate_expires_at).getTime()
    : Number.NaN;
  const certificateExpired = Number.isFinite(certificateExpiresAt) && certificateExpiresAt <= Date.now();
  const habilitacaoErrors = useMemo(() => {
    const e: string[] = [];
    if (
      settings.fiscal_ambiente === 'producao'
      && !settings.pode_emitir
      && !nationalEmissionRequiredBySimple
    ) {
      e.push(s.emitir.habilitacaoErrorMunicipio);
    }
    else if (!settings.certificado_ref) e.push(s.emitir.habilitacaoError);
    else if (!Number.isFinite(certificateExpiresAt)) e.push(s.emitir.habilitacaoErrorCertValidity);
    else if (certificateExpired) e.push(s.emitir.habilitacaoErrorCertExpired);
    return e;
  }, [settings.fiscal_ambiente, settings.pode_emitir, settings.certificado_ref, certificateExpiresAt, certificateExpired, nationalEmissionRequiredBySimple, s]);

  const habilitacaoTab = settings.fiscal_ambiente === 'producao'
    && !settings.pode_emitir
    && !nationalEmissionRequiredBySimple
    ? 'empresa'
    : 'certificado';

  const habilitacaoWarnings = useMemo(() => {
    const w: string[] = [];
    if (settings.certificado_ref && !settings.inscricao_municipal) {
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
      razaoSocial: companySettings?.name ?? null,
      cnpj: companySettings?.document ?? null,
      inscricaoMunicipal: settings.inscricao_municipal,
      cidade: companySettings?.city ?? null,
      uf: companySettings?.state ?? null,
    }),
    [companySettings, settings.inscricao_municipal],
  );

  // ---- Reset ----
  const resetForm = useCallback(() => {
    setActiveStep('pessoas');
    setDataCompetencia(nfseFiscalToday());
    setRegimeApuracao('competencia');
    setTomador(null);
    setIntermediario(null);
    setServico(emptyServico());
    setValores(emptyValores());
    setIbsCbs(ibsCbsFromSettings(settings));
    setDraftId(null);
    setGapFillResolved([]);
  }, [settings]);

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
    // Tomador/intermediário: cadastrado (id) XOR avulso (digitado na hora) —
    // manda as DUAS chaves sempre juntas (uma delas null) pra edge trocar de
    // modo sem esbarrar no CHECK de exclusão mútua do banco.
    customerId: tomador?.partyEntryMode === 'manual' ? null : (tomador?.id || null),
    tomadorAvulso: buildPessoaAvulsoPayload(tomador),
    intermediarioCustomerId: intermediario?.partyEntryMode === 'manual' ? null : (intermediario?.id || null),
    intermediarioAvulso: buildPessoaAvulsoPayload(intermediario),
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
      documentoResponsabilidadeTecnica: servico.documentoResponsabilidadeTecnica || undefined,
      documentoReferencia: servico.documentoReferencia || undefined,
      pedidoB2b: servico.pedidoB2b || undefined,
    },
    valores: {
      valorServico: valores.valorServico || undefined,
      aliquotaIssqn: valores.aliquotaIssqn || undefined,
      tribIssqn: servico.tribIssqn || undefined,
      tpRetIssqn: valores.tpRetIssqn || undefined,
      valorPis: valores.valorPis || undefined,
      valorCofins: valores.valorCofins || undefined,
      valorCsll: valores.valorCsll || undefined,
      valorInss: valores.valorInss || undefined,
      valorIrrf: valores.valorIrrf || undefined,
      deducoes: valores.deducoes || undefined,
      descontoCondicionado: valores.descontoCondicionado || undefined,
      descontoIncondicionado: valores.descontoIncondicionado || undefined,
      percentualTribSn: valores.percentualTribSn || undefined,
    },
    ibsCbs: {
      ativo: ibsCbs.ativo,
      codigoIndicadorOperacao: ibsCbs.codigoIndicadorOperacao,
      cst: ibsCbs.cst,
      classificacaoTributaria: ibsCbs.classificacaoTributaria,
      consumidorFinal: ibsCbs.consumidorFinal,
      destinatarioDiferente: ibsCbs.destinatarioDiferente,
    },
  }), [draftId, tomador, intermediario, dataCompetencia, isSimples, regimeApuracao, servico, valores, ibsCbs]);

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
   * - Caso contrário: emite direto com o body completo, sem criar um rascunho
   *   intermediário. Além de evitar lixo na lista, isso permite que uma nova
   *   tentativa substitua com segurança uma rejeição anterior com a mesma
   *   chave determinística.
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

      // Rascunho explícito é atualizado antes da emissão. Nota NOVA segue com
      // o body completo abaixo: criar um rascunho aqui fazia a retentativa
      // colidir com a chave da rejeição anterior depois de já falar com o Fisco.
      if (emissionIdToUse) {
        const saveRes = await invokeNfse<{ emission?: { id: string } }>(
          'nfse-save-draft',
          buildDraftBody(),
        );
        if (!saveRes.ok || !saveRes.data?.emission?.id) {
          toast.error(saveRes.message ?? s.toasts.draftError);
          return;
        }
        emissionIdToUse = saveRes.data.emission.id;
        setDraftId(emissionIdToUse);
      }

      // Emite: via emissionId (se rascunho salvo) ou body completo.
      const emitBody = emissionIdToUse
        ? { emissionId: emissionIdToUse }
        : {
            ...(tomador?.partyEntryMode === 'manual'
              ? { tomadorAvulso: buildPessoaAvulsoPayload(tomador) }
              : { customerId: tomador!.id }),
            ...(intermediario
              ? intermediario.partyEntryMode === 'manual'
                ? { intermediarioAvulso: buildPessoaAvulsoPayload(intermediario) }
                : { intermediarioCustomerId: intermediario.id }
              : {}),
            dataCompetencia: dataCompetencia || undefined,
            servico: {
              descricao: servico.discriminacao,
              ...(servico.codigoServico ? { codigoServico: servico.codigoServico } : {}),
              ...(servico.codigoTributacaoMunicipal
                ? { codigoTributacaoMunicipal: servico.codigoTributacaoMunicipal }
                : {}),
              ...(servico.codigoNbs ? { codigoNbs: servico.codigoNbs } : {}),
              ...(servico.municipioIncidenciaIbge ? { municipioIncidenciaIbge: servico.municipioIncidenciaIbge } : {}),
              ...(servico.documentoResponsabilidadeTecnica ? { documentoResponsabilidadeTecnica: servico.documentoResponsabilidadeTecnica } : {}),
              ...(servico.documentoReferencia ? { documentoReferencia: servico.documentoReferencia } : {}),
              ...(servico.pedidoB2b ? { pedidoB2b: servico.pedidoB2b } : {}),
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
              ...(valores.valorInss ? { valorInss: valores.valorInss } : {}),
              ...(valores.valorIrrf ? { valorIrrf: valores.valorIrrf } : {}),
              ...(valores.deducoes ? { deducoes: valores.deducoes } : {}),
              ...(valores.descontoCondicionado ? { descontoCondicionado: valores.descontoCondicionado } : {}),
              ...(valores.descontoIncondicionado ? { descontoIncondicionado: valores.descontoIncondicionado } : {}),
              ...(valores.percentualTribSn
                ? { percentualTotalTributosSimplesNacional: valores.percentualTribSn }
                : {}),
            },
            ibsCbs,
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
        // Erros sobre tomador/intermediário nascem na etapa Pessoas — manda o
        // usuário de volta pra lá em vez de deixá-lo preso na etapa Emitir
        // sem enxergar o campo problemático.
        if (PESSOAS_EMIT_ERROR_CODES.has(emitRes.errorCode ?? '')) {
          setActiveStep('pessoas');
        }
        toast.error(emitRes.message ?? s.toasts.emitError, {
          description: nfseOrientationDescription(emitRes.orientacao),
        });
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

  // ---- Barra de resumo ----
  const summaryBar = (
    <div className="flex flex-col gap-3 rounded-xl border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex w-full min-w-0 items-center gap-4 sm:w-auto">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {s.summary.total}
          </p>
          <p className="text-lg font-bold leading-tight text-emerald-500 dark:text-emerald-400 tabular-nums">
            {formatMoney(taxes.valorLiquido, currency, locale)}
          </p>
        </div>
        <Separator orientation="vertical" className="h-8" />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {s.summary.baseIss}
          </p>
          <p className="text-lg font-bold leading-tight text-foreground tabular-nums">
            {formatMoney(taxes.baseCalculo, currency, locale)}
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
        <Badge className="w-fit gap-1.5 whitespace-nowrap shrink-0 bg-emerald-600 text-white border-0 py-1.5 px-3">
          <CircleCheck className="h-3.5 w-3.5" />
          {s.summary.pronta}
        </Badge>
      )}
    </div>
  );

  // ---- Abas do stepper ----
  const stepTabs = (
    <HorizontalTabBar asChild>
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide border-b border-border">
        {STEPS.map((step) => (
          <button
            key={step.key}
            aria-current={activeStep === step.key ? 'page' : undefined}
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
    </HorizontalTabBar>
  );

  // ---- Conteúdo das etapas ----
  const stepContent = (
    <div className="mx-auto w-full max-w-7xl space-y-6 py-5 sm:py-8">
      {summaryBar}
      {stepTabs}

      <header className="pt-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          Etapa {currentIdx + 1} de {STEPS.length}
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          {(s.tabs as Record<string, string>)[activeStep]}
        </h2>
      </header>

      {activeStep === 'pessoas' && (
        <PessoasStep
          customers={customers}
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
          ibsCbs={ibsCbs}
          onIbsCbsChange={patchIbsCbs}
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
          onFixHabilitacao={() => {
            onOpenChange(false);
            navigate(`/notas-fiscais/configuracoes?tab=${habilitacaoTab}`);
          }}
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
          <FullscreenWizardAction
            variant="outline"
            onClick={goPrev}
            disabled={loading}
            className={isMobile ? 'w-full' : ''}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {s.footer.voltar}
          </FullscreenWizardAction>
        )}
      </div>

      {/* Direita: Cancelar · Salvar Rascunho · Avançar/Emitir */}
      <div className={`flex gap-2 ${isMobile ? 'flex-col order-1' : 'items-center'}`}>
        <FullscreenWizardAction
          variant="ghost"
          onClick={handleClose}
          disabled={loading}
          className={`${isMobile ? 'w-full' : ''} text-destructive hover:bg-red-600 hover:text-white`}
        >
          {s.footer.cancelar}
        </FullscreenWizardAction>
        <FullscreenWizardAction
          variant="outline"
          onClick={handleSaveDraft}
          disabled={loading}
          // Sem cor cravada: `bg-white` + texto claro do tema escuro deixava o
          // botão branco no branco. O variant outline já resolve claro/escuro.
          className={isMobile ? 'w-full' : ''}
        >
          <Save className="h-4 w-4 mr-2" />
          {s.footer.salvarRascunho}
        </FullscreenWizardAction>
        {!isLastStep ? (
          <FullscreenWizardAction
            onClick={goNext}
            disabled={loading}
            className={isMobile ? 'w-full' : ''}
          >
            {s.footer.avancar}
            <ArrowRight className="h-4 w-4 ml-2" />
          </FullscreenWizardAction>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={isMobile ? 'w-full' : ''}>
                  <FullscreenWizardAction
                    onClick={handleEmit}
                    disabled={loading || !canEmit}
                    className={isMobile ? 'w-full' : ''}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {s.footer.emitir}
                  </FullscreenWizardAction>
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
      <FullscreenWizard
        open={open}
        onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}
        title={s.title}
        description="Nota Fiscal de Serviço eletrônica pelo motor fiscal próprio"
        exitLabel="Sair"
        footer={footerContent}
        headerActions={
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Receipt className="h-5 w-5" />
            </span>
            <Badge variant="outline">{settings.fiscal_ambiente === 'producao' ? 'Produção' : 'Homologação'}</Badge>
          </div>
        }
      >
        {stepContent}
      </FullscreenWizard>

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
