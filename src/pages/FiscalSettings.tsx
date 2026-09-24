import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Building2, CheckCircle2, AlertCircle, Info, Landmark, Loader2, Shield, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import {
  useFiscalSettings,
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
  // pra `companies` por trigger server-side; a edge de registro lê de lá).
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
 * Espelha o desenho de `ContractSettings`/`SettingsSidebarLayout`: sidebar no
 * desktop, pills no mobile, cada seção com sua barra de ação fixa no rodapé.
 *
 * ⚠️ Dominex é own-row: UMA configuração fiscal por empresa (`useFiscalSettings`).
 * Não tem seletor de CNPJ/multi-emitente — isso existe só no EcoSistema.
 *
 * Ordem do onboarding: registrar a EMPRESA primeiro (dados + endereço + status
 * de cobertura) → subir o CERTIFICADO A1 (precisa do companyId já criado) →
 * ajustar Tributação → cadastrar Serviços (opcional, a qualquer momento).
 */
export default function FiscalSettings() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse;

  const { settings, readyToEmit, isLoading, save, isSaving, invalidate } = useFiscalSettings();
  const {
    settings: companySettings,
    isLoading: isLoadingCompany,
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

  // Erro persistente de registro no provedor (visível até a empresa ser registrada).
  const [registerError, setRegisterError] = useState<{ kind: 'data' | 'platform'; message: string } | null>(null);

  // Resultado da checagem de cobertura do município. `kind: 'not_covered'` = o
  // município respondeu que ainda não emite; `kind: 'error'` = não conseguimos
  // consultar agora. Nunca derruba o salvamento — é sempre informativo.
  const [coverageError, setCoverageError] = useState<{ kind: 'not_covered' | 'error'; message: string } | null>(null);
  const [checkingCoverage, setCheckingCoverage] = useState(false);

  // Limpa o erro de registro quando a empresa já está registrada.
  useEffect(() => {
    if (settings.provider_company_id) setRegisterError(null);
  }, [settings.provider_company_id]);

  // Cobertura confirmada → limpa o aviso.
  useEffect(() => {
    if (settings.pode_emitir) setCoverageError(null);
  }, [settings.pode_emitir]);

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
        // Empresa já registrada → respeita o ambiente salvo. Setup novo (sem
        // registro no provedor) → assume Produção (default do time).
        fiscal_ambiente: settings.provider_company_id ? settings.fiscal_ambiente : 'producao',
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
      if (!ibge) return;
      setCheckingCoverage(true);
      try {
        const res = await invokeNfse<{ pode_emitir?: boolean }>('nfse-check-coverage', { ibge });
        if (!res.ok) {
          const actionable =
            res.unconfigured || res.errorCode === 'missing_ibge' || res.errorCode === 'invalid_ibge';
          const message = (actionable ? res.message : null) ?? t.settings.empresa.coverageCheckError;
          setCoverageError({ kind: 'error', message });
          if (!silent) toast.warning(message);
          return;
        }
        if (res.data?.pode_emitir === true) {
          setCoverageError(null);
          if (!silent) toast.success(t.settings.empresa.coverageOkToast);
        } else {
          setCoverageError({ kind: 'not_covered', message: t.settings.empresa.coverageNotCovered });
          if (!silent) toast.warning(t.settings.empresa.coverageNotCovered);
        }
      } catch {
        setCoverageError({ kind: 'error', message: t.settings.empresa.coverageCheckError });
        if (!silent) toast.warning(t.settings.empresa.coverageCheckError);
      } finally {
        setCheckingCoverage(false);
        invalidate();
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
   * pra `companies`, de onde a edge de registro lê) e os campos fiscais próprios
   * (IM/IE/IBGE/ambiente) em company_fiscal_settings.
   */
  const handleSaveCompany = async () => {
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

      // Após salvar, registra/atualiza a empresa no provedor automaticamente
      // (cria na 1ª vez, atualiza nas demais). Falha aqui NÃO derruba o fluxo.
      try {
        setRegisterError(null);
        const res = await invokeNfse('nfse-register-company');
        if (res.ok) {
          toast.success(t.settings.certificado.toasts.saveSuccess);
          await runCoverageCheck({ silent: true });
        } else {
          const kind = res.errorCode === 'missing_fields' ? 'data' : 'platform';
          const msg = res.message ?? 'erro desconhecido';
          setRegisterError({ kind, message: msg });
          toast.warning(t.settings.certificado.toasts.registerWarning.replace('{error}', msg));
        }
      } catch (regErr) {
        const msg = regErr instanceof Error ? regErr.message : 'erro desconhecido';
        setRegisterError({ kind: 'platform', message: msg });
        toast.warning(t.settings.certificado.toasts.registerWarning.replace('{error}', msg));
      } finally {
        invalidate();
      }
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

  const hasCertificate = !!settings.provider_certificate_id;
  const isRegistered = !!settings.provider_company_id;
  const expiresDays = daysUntil(settings.certificate_expires_at);
  const expiringSoon = expiresDays != null && expiresDays <= 30;
  const expired = expiresDays != null && expiresDays < 0;

  const navTabs: SettingsTab[] = [
    { value: 'empresa', label: `1. ${t.settings.sections.empresa}`, icon: Building2 },
    { value: 'certificado', label: `2. ${t.settings.sections.certificado}`, icon: Shield },
    { value: 'impostos', label: `3. ${t.settings.sections.impostos}`, icon: Landmark },
    { value: 'servicos', label: `4. ${t.settings.sections.servicos}`, icon: Wrench },
  ];

  const anyLoading = isLoading || isLoadingCompany;

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

      {/* Selo de prontidão — verde SÓ quando município liberado + empresa
          registrada + certificado enviado. */}
      <div className="flex flex-wrap items-center gap-2">
        {readyToEmit ? (
          <Badge className="bg-success text-success-foreground gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> {t.settings.readyBadge}
          </Badge>
        ) : (
          <Badge className="bg-warning text-warning-foreground gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> {t.settings.incompleteBadge}
          </Badge>
        )}
      </div>

      {anyLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
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
                isRegistered={isRegistered}
                hasCertificate={hasCertificate}
                podeEmitir={settings.pode_emitir}
                checkingCoverage={checkingCoverage}
                onCheckCoverage={() => runCoverageCheck()}
                coverageError={coverageError}
                registerError={registerError}
                onGoToCertificado={() => setSection('certificado')}
              />
            )}

            {section === 'certificado' && (
              <CertificadoSection
                t={t}
                locale={locale}
                timezone={timezone}
                isRegistered={isRegistered}
                registerError={registerError}
                hasCertificate={hasCertificate}
                certificateExpiresAt={settings.certificate_expires_at}
                expired={expired}
                expiringSoon={expiringSoon}
                expiresDays={expiresDays}
                onGoToEmpresa={() => setSection('empresa')}
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
