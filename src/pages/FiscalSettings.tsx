import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Building2, CheckCircle2, AlertCircle, AlertTriangle, Info, Landmark, Loader2, MapPin, RefreshCw, Shield, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import {
  useFiscalSettings,
  isFiscalReadyToEmit,
  normalizeRegApTribSN,
  type FiscalAmbiente,
  type FiscalSettingsEditable,
  type RegApTribSN,
} from '@/hooks/useFiscalSettings';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useCertificateCustodyConsent } from '@/hooks/useCertificateCustodyConsent';
import { useFiscalCertificateAuditInvalidator } from '@/hooks/useFiscalCertificateAudit';
import { invokeNfse } from '@/utils/nfseEdge';
import { supabase } from '@/integrations/supabase/client';
import { type CnpjData } from '@/components/customers/CnpjDocumentInput';
import { cnpjMask, cepMask } from '@/utils/masks';
import { formatDate as formatDateLib } from '@/lib/format';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { FISCAL_SCREEN_PERMISSION } from '@/components/fiscal/fiscalPermissions';
import { EmpresaSection } from '@/components/fiscal/EmpresaSection';
import { CertificadoSection } from '@/components/fiscal/CertificadoSection';
import { ImpostosSection } from '@/components/fiscal/ImpostosSection';
import { ServicosSection } from '@/components/fiscal/ServicosSection';

export { FISCAL_SCREEN_PERMISSION };

/** Seções da tela de Configurações fiscais. */
export type FiscalSettingsSection = 'empresa' | 'certificado' | 'impostos' | 'servicos';

function normalizeSection(raw: string | null): FiscalSettingsSection {
  return raw === 'certificado' || raw === 'impostos' || raw === 'servicos' ? raw : 'empresa';
}

/** Form local — strings cruas pra inputs controlados (evita o "0" preso). */
interface FiscalForm {
  regime_tributario: string;
  inscricao_municipal: string;
  inscricao_estadual: string;
  municipio_ibge: string;
  fiscal_ambiente: FiscalAmbiente;
  reg_ap_trib_sn: RegApTribSN;
  percentual_trib_sn: string;
  // Identidade/endereço da empresa — salvos em company_settings (espelhados
  // pra `companies` por trigger server-side).
  razao_social: string;
  cnpj: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
}

const EMPTY_FORM: FiscalForm = {
  regime_tributario: 'simples_nacional',
  inscricao_municipal: '',
  inscricao_estadual: '',
  municipio_ibge: '',
  // Default Produção: o cliente final emite nota de verdade. Homologação é opt-in.
  fiscal_ambiente: 'producao',
  reg_ap_trib_sn: '1',
  percentual_trib_sn: '',
  razao_social: '',
  cnpj: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
};

/** Dias até a validade do certificado. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/**
 * Converte string PT-BR (vírgula decimal) pra number, ou `null` se vazio/inválido
 * — espelha `fromDisplayBR` do `ValoresStep` (nova nota), mas devolve `null` em
 * vez de `0` porque aqui o campo é opcional (default, não obrigatório na nota).
 */
function percentualTribSnFromDisplay(s: string): number | null {
  const clean = s.trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Configurações Fiscais (NFS-e) — tela própria (era modal até a 1.25.x).
 * Espelha o desenho de `ContractSettings`/`SettingsSidebarLayout`: abas
 * underline roláveis, cada seção com sua barra de ação fixa no rodapé.
 *
 * ⚠️ Dominex é own-row: UMA configuração fiscal por empresa (`useFiscalSettings`).
 * Não tem seletor de CNPJ/multi-emitente — isso existe só no EcoSistema.
 *
 * Para emitir: dados fiscais salvos + município no Padrão Nacional + A1 válido.
 */
export default function FiscalSettings() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse;

  const {
    settings,
    isLoading,
    isError,
    refetch: refetchFiscal,
    save,
    isSaving,
    invalidate,
  } = useFiscalSettings();
  const {
    settings: companySettings,
    isLoading: isLoadingCompany,
    isError: isCompanyError,
    refetch: refetchCompany,
    updateSettings,
  } = useCompanySettings();

  const [section, setSectionState] = useState<FiscalSettingsSection>(() =>
    normalizeSection(searchParams.get('tab')),
  );
  const setSection = useCallback(
    (next: FiscalSettingsSection) => {
      setSectionState(next);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('tab', next);
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const [form, setForm] = useState<FiscalForm>(EMPTY_FORM);
  const setField = useCallback((patch: Partial<FiscalForm>) => {
    setForm((p) => ({ ...p, ...patch }));
  }, []);
  const hydrated = useRef(false);
  const companyHydrated = useRef(false);
  /** Garante que o auto-backfill do IBGE rode no máximo 1x por carregamento da tela. */
  const ibgeBackfilledRef = useRef(false);

  // Resultado da checagem de cobertura do município. `kind: 'not_covered'` = o
  // município respondeu que ainda não emite; `kind: 'error'` = não conseguimos
  // consultar agora. Nunca derruba o salvamento — é sempre informativo.
  const [coverageError, setCoverageError] = useState<{ kind: 'not_covered' | 'error'; message: string } | null>(null);
  const [checkingCoverage, setCheckingCoverage] = useState(false);
  // `null` usa o valor persistido; `false` bloqueia durante/falha da consulta;
  // uma string identifica o IBGE efetivamente confirmado nesta sessão. Assim
  // uma cobertura antiga nunca continua verde depois de trocar o município.
  const [coverageConfirmedInSession, setCoverageConfirmedInSession] = useState<string | false | null>(null);

  // Certificado
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState('');
  const [certName, setCertName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [uploadingCert, setUploadingCert] = useState(false);
  /**
   * Consentimento específico de custódia (Seção 12 dos Termos). Começa SEMPRE
   * desmarcado: aceite tácito não vale para guarda de chave privada de
   * terceiro. Ver `useCertificateCustodyConsent`.
   */
  const [consentChecked, setConsentChecked] = useState(false);
  const { recordConsent, isRecordingConsent } = useCertificateCustodyConsent();
  const refreshCertificateAudit = useFiscalCertificateAuditInvalidator();

  // Hidrata o form 1x quando os dados chegam.
  useEffect(() => {
    if (!isLoading && !hydrated.current) {
      hydrated.current = true;
      setForm((p) => ({
        ...p,
        regime_tributario: settings.regime_tributario || 'simples_nacional',
        inscricao_municipal: settings.inscricao_municipal || '',
        inscricao_estadual: settings.inscricao_estadual || '',
        municipio_ibge: settings.municipio_ibge || '',
        fiscal_ambiente: settings.fiscal_ambiente,
        reg_ap_trib_sn: normalizeRegApTribSN(settings.reg_ap_trib_sn),
        percentual_trib_sn:
          settings.percentual_trib_sn != null ? String(settings.percentual_trib_sn).replace('.', ',') : '',
      }));
    }
  }, [isLoading, settings]);

  // Hidrata os campos de identidade/endereço (company_settings) 1x.
  useEffect(() => {
    if (!isLoadingCompany && companySettings && !companyHydrated.current) {
      companyHydrated.current = true;
      setForm((p) => ({
        ...p,
        razao_social: companySettings.name || '',
        // Salvo só com dígitos no banco; exibe mascarado (regra do CEO).
        cnpj: companySettings.document ? cnpjMask(companySettings.document) : '',
        cep: companySettings.zip_code || '',
        logradouro: companySettings.address || '',
        numero: companySettings.address_number || '',
        complemento: companySettings.complement || '',
        bairro: companySettings.neighborhood || '',
        cidade: companySettings.city || '',
        uf: companySettings.state || '',
      }));
    }
  }, [isLoadingCompany, companySettings]);

  // Auto-backfill do código IBGE: quando ambas as hidratações já rodaram, o
  // IBGE ainda está vazio mas o CEP está disponível, consulta silenciosamente
  // a edge `cep-lookup` e preenche `municipio_ibge` em memória — sem toast,
  // sem auto-save.
  const backfillIbge = useCallback(async (cep: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('cep-lookup', { body: { cep } });
      if (error || !data) return;
      const ibge = data.ibge ?? data.codigo_ibge;
      const ibgeStr = ibge != null ? String(ibge).trim() : '';
      if (ibgeStr) setForm((p) => ({ ...p, municipio_ibge: ibgeStr }));
    } catch {
      // Falha silenciosa: o usuário pode resolver via StateCitySelector.
    }
  }, []);

  useEffect(() => {
    if (isLoading || isLoadingCompany) return;
    if (!hydrated.current || !companyHydrated.current) return;
    if (ibgeBackfilledRef.current) return;

    setForm((p) => {
      if (p.municipio_ibge.trim()) {
        ibgeBackfilledRef.current = true;
        return p;
      }
      const cepDigits = p.cep.replace(/\D/g, '');
      if (cepDigits.length === 8) {
        ibgeBackfilledRef.current = true;
        void backfillIbge(cepDigits);
      }
      return p;
    });
  }, [isLoading, isLoadingCompany, backfillIbge]);

  /** Optante do Simples Nacional — condiciona o campo de apuração de tributos. */
  const isSimples = form.regime_tributario === 'simples_nacional';

  /**
   * Verifica se o município do endereço fiscal já emite NFS-e no padrão nacional.
   * É essa checagem que libera o selo "Apto a emitir". Nunca lança: qualquer
   * falha vira mensagem informativa na tela.
   */
  const runCoverageCheck = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const ibge = form.municipio_ibge.trim();
      if (!ibge) return 'skipped' as const;
      setCoverageConfirmedInSession(false);
      setCheckingCoverage(true);
      try {
        const res = await invokeNfse<{ pode_emitir?: boolean }>('nfse-check-coverage', { ibge });
        if (!res.ok) {
          const actionable =
            res.unconfigured || res.errorCode === 'missing_ibge' || res.errorCode === 'invalid_ibge';
          const message = (actionable ? res.message : null) ?? t.settings.empresa.coverageCheckError;
          setCoverageError({ kind: 'error', message });
          if (!silent) toast.warning(message);
          return 'error' as const;
        }
        if (res.data?.pode_emitir === true) {
          setCoverageConfirmedInSession(ibge);
          setCoverageError(null);
          if (!silent) toast.success(t.settings.empresa.coverageOkToast);
          return 'ready' as const;
        } else {
          setCoverageConfirmedInSession(false);
          setCoverageError({ kind: 'not_covered', message: t.settings.empresa.coverageNotCovered });
          if (!silent) toast.warning(t.settings.empresa.coverageNotCovered);
          return 'not_covered' as const;
        }
      } catch {
        setCoverageConfirmedInSession(false);
        setCoverageError({ kind: 'error', message: t.settings.empresa.coverageCheckError });
        if (!silent) toast.warning(t.settings.empresa.coverageCheckError);
        return 'error' as const;
      } finally {
        setCheckingCoverage(false);
        await invalidate();
      }
    },
    [form.municipio_ibge, t, invalidate],
  );

  // Salva tributação / ambiente (company_fiscal_settings via useFiscalSettings).
  const handleSave = async () => {
    const payload: Partial<FiscalSettingsEditable> = {
      regime_tributario: form.regime_tributario || null,
      inscricao_municipal: form.inscricao_municipal.trim() || null,
      inscricao_estadual: form.inscricao_estadual.trim() || null,
      municipio_ibge: form.municipio_ibge.trim() || null,
      fiscal_ambiente: form.fiscal_ambiente,
      reg_ap_trib_sn: isSimples ? form.reg_ap_trib_sn : '1',
      percentual_trib_sn: percentualTribSnFromDisplay(form.percentual_trib_sn),
    };
    try {
      await save(payload);
      toast.success(t.settings.impostos.toasts.saveSuccess);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.settings.impostos.toasts.saveError);
    }
  };

  /**
   * Salva os dados da EMPRESA: identidade/endereço em company_settings (espelha
   * pra `companies`, usados pelo motor fiscal) e os campos fiscais próprios
   * (IM/IE/IBGE/ambiente) em company_fiscal_settings.
   */
  const handleSaveCompany = async () => {
    const requiredMissing =
      !form.razao_social.trim() ||
      form.cnpj.replace(/\D/g, '').length !== 14 ||
      !form.inscricao_municipal.trim() ||
      form.cep.replace(/\D/g, '').length !== 8 ||
      !form.logradouro.trim() ||
      !form.cidade.trim() ||
      !form.uf.trim() ||
      !form.municipio_ibge.trim();
    if (requiredMissing) {
      toast.error(t.settings.empresa.requiredFields);
      return;
    }

    const fiscalPayload: Partial<FiscalSettingsEditable> = {
      regime_tributario: form.regime_tributario || null,
      inscricao_municipal: form.inscricao_municipal.trim() || null,
      inscricao_estadual: form.inscricao_estadual.trim() || null,
      municipio_ibge: form.municipio_ibge.trim() || null,
      fiscal_ambiente: form.fiscal_ambiente,
      reg_ap_trib_sn: isSimples ? form.reg_ap_trib_sn : '1',
    };
    try {
      await Promise.all([
        updateSettings.mutateAsync({
          name: form.razao_social.trim(),
          document: form.cnpj.replace(/\D/g, '') || null,
          zip_code: form.cep.replace(/\D/g, '') || null,
          address: form.logradouro.trim() || null,
          address_number: form.numero.trim() || null,
          complement: form.complemento.trim() || null,
          neighborhood: form.bairro.trim() || null,
          city: form.cidade.trim() || null,
          state: form.uf || null,
        }),
        save(fiscalPayload),
      ]);

      toast.success(t.settings.certificado.toasts.saveSuccess);
      await runCoverageCheck({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.settings.certificado.toasts.saveError);
    }
  };

  /**
   * CEP → preenche endereço + código IBGE.
   */
  const handleAddressFound = (data: {
    logradouro?: string;
    bairro?: string;
    cidade?: string;
    estado?: string;
    uf?: string;
    ibge?: string | number;
    codigo_ibge?: string | number;
  }) => {
    const ibge = data.ibge ?? data.codigo_ibge;
    setForm((p) => ({
      ...p,
      logradouro: data.logradouro || p.logradouro,
      bairro: data.bairro || p.bairro,
      cidade: data.cidade || p.cidade,
      uf: data.uf || data.estado || p.uf,
      municipio_ibge: ibge != null && String(ibge).trim() ? String(ibge).trim() : p.municipio_ibge,
    }));
  };

  /**
   * CNPJ (BrasilAPI) → pré-preenche razão social e endereço fiscal. Só
   * preenche campo VAZIO — empresa já cadastrada não pode ter endereço
   * trocado por baixo dos panos ao reabrir esta tela.
   */
  const handleCnpjDataFound = useCallback(
    (data: CnpjData) => {
      let shouldBackfillIbge = false;
      let backfillZip = '';
      setForm((p) => {
        const next = { ...p };
        if (data.razaoSocial && !p.razao_social.trim()) next.razao_social = data.razaoSocial;
        const cepWasEmpty = !p.cep.trim();
        if (data.zipCode && cepWasEmpty) next.cep = cepMask(data.zipCode);
        if (data.address && !p.logradouro.trim()) next.logradouro = data.address;
        if (data.addressNumber && !p.numero.trim()) next.numero = data.addressNumber;
        if (data.complement && !p.complemento.trim()) next.complemento = data.complement;
        if (data.neighborhood && !p.bairro.trim()) next.bairro = data.neighborhood;
        if (data.city && !p.cidade.trim()) next.cidade = data.city;
        if (data.state && !p.uf.trim()) next.uf = data.state;
        if (data.zipCode && cepWasEmpty && !p.municipio_ibge.trim()) {
          shouldBackfillIbge = true;
          backfillZip = data.zipCode;
        }
        return next;
      });
      if (shouldBackfillIbge) void backfillIbge(backfillZip);
    },
    [backfillIbge],
  );

  const handleCertSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.pfx') && !lower.endsWith('.p12')) {
      toast.error(t.settings.certificado.toasts.invalidFile);
      return;
    }
    setCertFile(file);
    if (!certName) setCertName(file.name);
  };

  const handleUploadCertificate = async () => {
    if (!certFile) {
      toast.error(t.settings.certificado.toasts.noFile);
      return;
    }
    if (!certPassword.trim()) {
      toast.error(t.settings.certificado.toasts.noPassword);
      return;
    }
    if (!consentChecked) {
      toast.error(t.settings.certificado.toasts.consentRequired);
      return;
    }
    setUploadingCert(true);
    try {
      // A ORDEM IMPORTA: a autorização é registrada ANTES de o arquivo sair
      // daqui. Se o registro falhar, abortamos o envio.
      try {
        await recordConsent();
      } catch {
        toast.error(t.settings.certificado.toasts.consentError);
        return;
      }

      const fd = new FormData();
      fd.append('file', certFile, certFile.name);
      fd.append('password', certPassword);
      fd.append('nome', certName.trim() || certFile.name);
      const res = await invokeNfse('nfse-upload-certificate', fd);
      if (!res.ok) {
        toast.error(res.message ?? t.settings.certificado.toasts.uploadError);
        return;
      }
      toast.success(res.message ?? t.settings.certificado.toasts.uploadSuccess);
      setCertFile(null);
      setCertPassword('');
      setConsentChecked(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      invalidate();
      void refreshCertificateAudit();
    } finally {
      setUploadingCert(false);
    }
  };

  const hasCertificate = !!settings.certificado_ref;
  const expiresAt = settings.certificate_expires_at
    ? new Date(settings.certificate_expires_at).getTime()
    : Number.NaN;
  const expiresDays = daysUntil(settings.certificate_expires_at);
  const expired = hasCertificate && Number.isFinite(expiresAt) && expiresAt <= Date.now();
  const expiringSoon = !expired && expiresDays != null && expiresDays <= 30;
  const certificateReady = hasCertificate && Number.isFinite(expiresAt) && expiresAt > Date.now();
  const currentIbge = form.municipio_ibge.trim();
  const persistedIbge = settings.municipio_ibge?.trim() ?? '';
  const municipalityReady =
    typeof coverageConfirmedInSession === 'string'
      ? coverageConfirmedInSession === currentIbge
      : coverageConfirmedInSession === false
        ? false
        : !!currentIbge && currentIbge === persistedIbge && settings.pode_emitir;
  const readyToEmit = isFiscalReadyToEmit({ ...settings, pode_emitir: municipalityReady });

  const navTabs: SettingsTab[] = [
    { value: 'empresa', label: t.settings.sections.empresa, icon: Building2 },
    { value: 'certificado', label: t.settings.sections.certificado, icon: Shield },
    { value: 'impostos', label: t.settings.sections.impostos, icon: Landmark },
    { value: 'servicos', label: t.settings.sections.servicos, icon: Wrench },
  ];

  const anyLoading = isLoading || isLoadingCompany;
  const loadError = isError || isCompanyError;

  return (
    <div className={cn('space-y-4 min-w-0 w-full max-w-full overflow-x-hidden', isMobile && 'pb-24')}>
      <div className="mb-1">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 -ml-2 text-muted-foreground"
          onClick={() => navigate('/notas-fiscais')}
        >
          <ArrowLeft className="h-4 w-4" />
          {t.settings.back}
        </Button>
      </div>

      <MobilePageHeader title={t.settings.title} subtitle={t.settings.pageSubtitle} icon={Shield} />

      {!anyLoading && !loadError && (
        <div className="rounded-lg border border-border p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {readyToEmit ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-warning" />
            )}
            <span>{readyToEmit ? t.settings.readyBadge : t.settings.incompleteBadge}</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <MapPin className={`h-4 w-4 shrink-0 ${municipalityReady ? 'text-success' : 'text-warning'}`} />
              <span className="min-w-0 flex-1 text-muted-foreground">
                {municipalityReady
                  ? t.settings.empresa.statusCoverageOk
                  : t.settings.empresa.statusCoveragePending}
              </span>
              {!municipalityReady && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={checkingCoverage}
                  onClick={() => {
                    if (form.municipio_ibge.trim()) void runCoverageCheck();
                    else setSection('empresa');
                  }}
                >
                  {checkingCoverage ? <Loader2 className="h-4 w-4 animate-spin" /> : t.settings.empresa.checkCoverageShort}
                </Button>
              )}
            </div>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <Shield className={`h-4 w-4 shrink-0 ${certificateReady ? 'text-success' : 'text-warning'}`} />
              <span className="min-w-0 flex-1 text-muted-foreground">
                {certificateReady && settings.certificate_expires_at
                  ? t.settings.certificado.certValidUntil.replace(
                      '{date}',
                      formatDateLib(settings.certificate_expires_at, locale, timezone),
                    )
                  : hasCertificate && expired
                    ? t.settings.certificado.certExpired.replace(
                        '{date}',
                        formatDateLib(settings.certificate_expires_at!, locale, timezone),
                      )
                    : hasCertificate
                      ? t.settings.certificado.certValidityUnknown
                      : t.settings.empresa.statusCertPending}
              </span>
              {!certificateReady && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setSection('certificado')}>
                  {hasCertificate ? t.settings.certificado.replaceBtn : t.settings.certificado.uploadBtn}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {anyLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-border p-6 text-center space-y-3">
          <AlertTriangle className="mx-auto h-7 w-7 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">{t.settings.loadErrorTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.settings.loadError}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void Promise.all([refetchFiscal(), refetchCompany()])}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {t.settings.retryBtn}
          </Button>
        </div>
      ) : (
        <SettingsSidebarLayout tabs={navTabs} activeTab={section} onTabChange={(v) => setSection(v as FiscalSettingsSection)}>
          <div className="space-y-4">
            {/* Dica do passo atual — reforça a ordem empresa → certificado. */}
            {(section === 'empresa' || section === 'certificado') && (
              <Alert className="border-primary/20 bg-muted/40">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {section === 'empresa' ? t.settings.steps.hintEmpresa : t.settings.steps.hintCertificado}
                </AlertDescription>
              </Alert>
            )}

            {section === 'empresa' && (
              <EmpresaSection
                t={t}
                form={form}
                onChange={setField}
                onAddressFound={handleAddressFound}
                onCnpjDataFound={handleCnpjDataFound}
                onSave={handleSaveCompany}
                saving={isSaving || updateSettings.isPending}
                checkingCoverage={checkingCoverage}
                onCheckCoverage={() => runCoverageCheck()}
                coverageError={coverageError}
                onGoToCertificado={() => setSection('certificado')}
              />
            )}

            {section === 'certificado' && (
              <CertificadoSection
                t={t}
                locale={locale}
                timezone={timezone}
                hasCertificate={hasCertificate}
                certificateExpiresAt={settings.certificate_expires_at}
                expired={expired}
                expiringSoon={expiringSoon}
                expiresDays={expiresDays}
                fileInputRef={fileInputRef}
                certFile={certFile}
                certName={certName}
                onCertNameChange={setCertName}
                certPassword={certPassword}
                onCertPasswordChange={setCertPassword}
                showPassword={showPassword}
                onToggleShowPassword={() => setShowPassword((s) => !s)}
                onCertSelect={handleCertSelect}
                consentChecked={consentChecked}
                onConsentChange={setConsentChecked}
                uploadingCert={uploadingCert}
                isRecordingConsent={isRecordingConsent}
                onUpload={handleUploadCertificate}
              />
            )}

            {section === 'impostos' && (
              <ImpostosSection t={t} form={form} onChange={setField} onSave={handleSave} saving={isSaving} />
            )}

            {section === 'servicos' && <ServicosSection t={t} />}
          </div>
        </SettingsSidebarLayout>
      )}
    </div>
  );
}
