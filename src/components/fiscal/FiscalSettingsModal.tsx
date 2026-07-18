import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Shield,
  Upload,
  Loader2,
  Save,
  Building2,
  MapPin,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Landmark,
  Eye,
  EyeOff,
  type LucideIcon,
} from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Lock, ArrowRight } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  useFiscalSettings,
  type FiscalAmbiente,
  type FiscalSettingsEditable,
} from '@/hooks/useFiscalSettings';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { invokeFisqal } from '@/utils/fisqalEdge';
import { CepLookup } from '@/components/CepLookup';
import { StateCitySelector } from '@/components/StateCitySelector';
import { formatDate as formatDateLib } from '@/lib/format';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

/** Seções internas do modal de configuração fiscal. */
export type FiscalSettingsSection = 'empresa' | 'certificado' | 'impostos';

interface FiscalSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Seção aberta inicialmente (deep-link, ex: banner de certificado). */
  initialSection?: FiscalSettingsSection;
}

/**
 * Ordem do onboarding segue a doc da Fisqal (§5): registrar a EMPRESA primeiro
 * (precisa dos dados — incluindo status e cobertura, que vivem aqui agora) →
 * subir o CERTIFICADO A1 (precisa do companyId já criado) → impostos. O `step`
 * numera a sequência guiada.
 */
// SECTIONS e REGIMES são construídos dinamicamente dentro do componente
// para receber as traduções do locale ativo (ver FiscalSettingsModal).

/** Form local — strings cruas pra inputs controlados (evita o "0" preso). */
interface FiscalForm {
  regime_tributario: string;
  inscricao_municipal: string;
  inscricao_estadual: string;
  codigo_servico_default: string;
  codigo_nbs_default: string;
  item_lc116: string;
  iss_aliquota: string;
  municipio_ibge: string;
  fiscal_ambiente: FiscalAmbiente;
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
  codigo_servico_default: '',
  codigo_nbs_default: '',
  item_lc116: '',
  iss_aliquota: '',
  municipio_ibge: '',
  // Default Produção: o cliente final emite nota de verdade. Homologação é opt-in.
  fiscal_ambiente: 'producao',
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

export function FiscalSettingsModal({ open, onOpenChange, initialSection }: FiscalSettingsModalProps) {
  const { settings, isLoading, save, isSaving, invalidate } = useFiscalSettings();
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse;

  const SECTIONS: { value: FiscalSettingsSection; label: string; icon: LucideIcon; step: number }[] = [
    { value: 'empresa', label: t.settings.sections.empresa, icon: Building2, step: 1 },
    { value: 'certificado', label: t.settings.sections.certificado, icon: Shield, step: 2 },
    { value: 'impostos', label: t.settings.sections.impostos, icon: Landmark, step: 3 },
  ];

  const REGIMES = [
    { value: 'simples_nacional', label: t.settings.impostos.regimes.simplesNacional },
    { value: 'lucro_presumido', label: t.settings.impostos.regimes.lucroPresumido },
    { value: 'lucro_real', label: t.settings.impostos.regimes.lucroReal },
    { value: 'mei', label: t.settings.impostos.regimes.mei },
  ];
  const {
    settings: companySettings,
    isLoading: isLoadingCompany,
    updateSettings,
  } = useCompanySettings();
  const [section, setSection] = useState<FiscalSettingsSection>(initialSection ?? 'empresa');
  const [form, setForm] = useState<FiscalForm>(EMPTY_FORM);
  const hydrated = useRef(false);
  const companyHydrated = useRef(false);

  // Certificado
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState('');
  const [certName, setCertName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [uploadingCert, setUploadingCert] = useState(false);

  // Aplica a seção inicial sempre que o modal abre.
  useEffect(() => {
    if (open && initialSection) setSection(initialSection);
  }, [open, initialSection]);

  // Hidrata o form 1x quando os dados chegam.
  useEffect(() => {
    if (!isLoading && !hydrated.current) {
      hydrated.current = true;
      setForm((p) => ({
        ...p,
        regime_tributario: settings.regime_tributario || 'simples_nacional',
        inscricao_municipal: settings.inscricao_municipal || '',
        inscricao_estadual: settings.inscricao_estadual || '',
        codigo_servico_default: settings.codigo_servico_default || '',
        codigo_nbs_default: settings.codigo_nbs_default || '',
        item_lc116: settings.item_lc116 || '',
        iss_aliquota: settings.iss_aliquota != null ? String(settings.iss_aliquota) : '',
        municipio_ibge: settings.municipio_ibge || '',
        // Empresa já registrada → respeita o ambiente salvo. Setup novo (sem
        // companyId Fisqal) → assume Produção (default do time).
        fiscal_ambiente: settings.fisqal_company_id ? settings.fiscal_ambiente : 'producao',
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
        cnpj: companySettings.document || '',
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

  // Salva tributação / ambiente (company_fiscal_settings via useFiscalSettings).
  // Códigos por-nota (ISS, serviço, NBS, LC 116) saíram daqui — passaram a ser
  // definidos no cadastro do serviço e na emissão (outra frente).
  const handleSave = async () => {
    const payload: Partial<FiscalSettingsEditable> = {
      regime_tributario: form.regime_tributario || null,
      inscricao_municipal: form.inscricao_municipal.trim() || null,
      inscricao_estadual: form.inscricao_estadual.trim() || null,
      municipio_ibge: form.municipio_ibge.trim() || null,
      fiscal_ambiente: form.fiscal_ambiente,
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
   * (IM/IE/IBGE/ambiente) em company_fiscal_settings. São tabelas diferentes —
   * por isso dois writes em paralelo.
   */
  const handleSaveCompany = async () => {
    const fiscalPayload: Partial<FiscalSettingsEditable> = {
      regime_tributario: form.regime_tributario || null,
      inscricao_municipal: form.inscricao_municipal.trim() || null,
      inscricao_estadual: form.inscricao_estadual.trim() || null,
      municipio_ibge: form.municipio_ibge.trim() || null,
      fiscal_ambiente: form.fiscal_ambiente,
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

      // Após salvar, registra/atualiza a empresa na Fisqal automaticamente
      // (cria na 1ª vez, atualiza nas demais). Falha aqui NÃO derruba o fluxo:
      // o save já confirmou sucesso, então só avisamos.
      try {
        const res = await invokeFisqal('fisqal-register-company');
        if (!res.ok) {
          toast.warning(
            t.settings.certificado.toasts.registerWarning.replace(
              '{error}',
              res.message ?? 'erro desconhecido',
            ),
          );
        }
      } catch (regErr) {
        toast.warning(
          t.settings.certificado.toasts.registerWarning.replace(
            '{error}',
            regErr instanceof Error ? regErr.message : 'erro desconhecido',
          ),
        );
      } finally {
        // Atualiza isRegistered / status da emissão na UI.
        invalidate();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.settings.certificado.toasts.saveError);
    }
  };

  /**
   * CEP → preenche endereço + código IBGE.
   * O `cep-lookup` está ganhando o campo `ibge` em paralelo; lemos de forma
   * tolerante (`ibge` | `codigo_ibge`). Se não vier, o usuário resolve o IBGE
   * escolhendo a cidade no StateCitySelector (fallback city→IBGE).
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

  const handleCertSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.pfx') && !lower.endsWith('.p12')) {
      toast.error('O certificado deve ser um arquivo .pfx ou .p12.');
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
    setUploadingCert(true);
    try {
      const fd = new FormData();
      fd.append('file', certFile, certFile.name);
      fd.append('password', certPassword);
      fd.append('nome', certName.trim() || certFile.name);
      const res = await invokeFisqal('fisqal-upload-certificate', fd);
      if (!res.ok) {
        toast.error(res.message ?? t.settings.certificado.toasts.uploadError);
        return;
      }
      toast.success(res.message ?? t.settings.certificado.toasts.uploadSuccess);
      setCertFile(null);
      setCertPassword('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      invalidate();
    } finally {
      setUploadingCert(false);
    }
  };

  const hasCertificate = !!settings.fisqal_certificate_id;
  const isRegistered = !!settings.fisqal_company_id;
  const expiresDays = daysUntil(settings.certificate_expires_at);
  const expiringSoon = expiresDays != null && expiresDays <= 30;
  const expired = expiresDays != null && expiresDays < 0;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.settings.title}
      className="sm:max-w-[640px]"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4 py-1">
          {/* Selo "apto a emitir" + navegação de seções */}
          <div className="flex flex-wrap items-center gap-2">
            {settings.pode_emitir && (
              <Badge className="bg-success text-success-foreground gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> {t.settings.readyBadge}
              </Badge>
            )}
          </div>

          {/* Navegação por passos: grade de abas com nº do passo, ícone e
              indicador de estado. Mobile-first: rótulo encolhe pro ícone. */}
          <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-muted/50 p-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.value;
              const locked = s.value === 'certificado' && !isRegistered;
              const done =
                (s.value === 'empresa' && isRegistered) ||
                (s.value === 'certificado' && hasCertificate);
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSection(s.value)}
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-[11px] font-medium transition-colors',
                    active
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                  )}
                >
                  <span className="flex items-center gap-1">
                    <Icon className="h-4 w-4" />
                    {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                    {done && !locked && <CheckCircle2 className="h-3 w-3 text-success" />}
                  </span>
                  <span className="truncate max-w-full">
                    <span className="opacity-60 mr-0.5">{s.step}.</span>
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Dica do passo atual — reforça a ordem empresa → certificado. */}
          {(section === 'empresa' || section === 'certificado') && (
            <Alert className="border-primary/20 bg-muted/40">
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {section === 'empresa'
                  ? t.settings.steps.hintEmpresa
                  : t.settings.steps.hintCertificado}
              </AlertDescription>
            </Alert>
          )}

          {/* ---- Seção: Empresa ---- */}
          {section === 'empresa' && (
            <div className="space-y-4">
              {/* Identidade da empresa — razão social/nome e CNPJ vão pra
                  company_settings (espelham pra `companies`, de onde a edge de
                  registro lê). */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t.settings.empresa.companyName}</Label>
                  <Input
                    placeholder={t.settings.empresa.companyNamePlaceholder}
                    value={form.razao_social}
                    onChange={(e) => setForm((p) => ({ ...p, razao_social: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.settings.empresa.cnpj}</Label>
                  <Input
                    inputMode="numeric"
                    placeholder={t.settings.empresa.cnpjPlaceholder}
                    value={form.cnpj}
                    onChange={(e) => setForm((p) => ({ ...p, cnpj: e.target.value }))}
                  />
                </div>
              </div>

              {/* Endereço fiscal — CEP preenche logradouro/bairro/cidade/UF +
                  código IBGE do município (sem campo manual de IBGE). */}
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">{t.settings.empresa.addressSection}</p>
                </div>
                <div className="space-y-2">
                  <Label>{t.settings.empresa.cep}</Label>
                  <CepLookup
                    value={form.cep}
                    onChange={(cep) => setForm((p) => ({ ...p, cep }))}
                    onAddressFound={handleAddressFound}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t.settings.empresa.cepHint}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="space-y-2 sm:col-span-3">
                    <Label>{t.settings.empresa.street}</Label>
                    <Input
                      value={form.logradouro}
                      onChange={(e) => setForm((p) => ({ ...p, logradouro: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.settings.empresa.number}</Label>
                    <Input
                      value={form.numero}
                      onChange={(e) => setForm((p) => ({ ...p, numero: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{t.settings.empresa.complement}</Label>
                    <Input
                      value={form.complemento}
                      onChange={(e) => setForm((p) => ({ ...p, complemento: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.settings.empresa.neighborhood}</Label>
                    <Input
                      value={form.bairro}
                      onChange={(e) => setForm((p) => ({ ...p, bairro: e.target.value }))}
                    />
                  </div>
                </div>
                {/* Cidade/UF: o seletor entrega o código IBGE do município, que
                    é o fallback caso o CEP ainda não traga `ibge`. */}
                <div className="space-y-2">
                  <Label>{t.settings.empresa.cityUf}</Label>
                  <StateCitySelector
                    selectedState={form.uf}
                    selectedCity={form.cidade}
                    onStateChange={(uf) =>
                      setForm((p) => ({ ...p, uf, cidade: '', municipio_ibge: '' }))
                    }
                    onCityChange={(cidade, ibge) =>
                      setForm((p) => ({
                        ...p,
                        cidade,
                        municipio_ibge: ibge?.trim() ? ibge.trim() : p.municipio_ibge,
                      }))
                    }
                  />
                </div>
              </div>

              {/* Ambiente de emissão — alavanca on/off com rótulo dos dois lados */}
              <div className="flex flex-col gap-2 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{t.settings.empresa.environment}</p>
                  <p className="text-xs text-muted-foreground">
                    {form.fiscal_ambiente === 'producao'
                      ? t.settings.empresa.environmentProduction
                      : t.settings.empresa.environmentHomologation}
                  </p>
                </div>
                <LabeledSwitch
                  value={form.fiscal_ambiente}
                  onChange={(v) => setForm((p) => ({ ...p, fiscal_ambiente: v }))}
                  off={{ value: 'homologacao', label: t.settings.empresa.environmentOff }}
                  on={{ value: 'producao', label: t.settings.empresa.environmentOn }}
                  size="default"
                  aria-label={t.settings.empresa.environment}
                />
              </div>

              <Button
                onClick={handleSaveCompany}
                disabled={isSaving || updateSettings.isPending}
                className="w-full sm:w-auto"
              >
                {isSaving || updateSettings.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {t.settings.empresa.saveBtn}
              </Button>

              {/* Status do onboarding (realocado da antiga aba "Ativação"). */}
              <div className="flex flex-col gap-2 rounded-lg border p-3">
                <p className="text-sm font-medium">{t.settings.empresa.statusSection}</p>
                <div className="flex items-center gap-2 text-xs">
                  {isRegistered ? (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-warning shrink-0" />
                  )}
                  <span className="text-muted-foreground">
                    {isRegistered
                      ? t.settings.empresa.statusCompanyRegistered
                      : t.settings.empresa.statusCompanyPending}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {hasCertificate ? (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-warning shrink-0" />
                  )}
                  <span className="text-muted-foreground">
                    {hasCertificate
                      ? t.settings.empresa.statusCertSent
                      : t.settings.empresa.statusCertPending}
                  </span>
                </div>
              </div>

              {isRegistered && (
                <Button onClick={() => setSection('certificado')} className="w-full sm:w-auto">
                  {t.settings.empresa.nextBtn} <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          )}

          {/* ---- Seção: Tributação ---- */}
          {section === 'impostos' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t.settings.impostos.regime}</Label>
                  <Select
                    value={form.regime_tributario}
                    onValueChange={(v) => setForm((p) => ({ ...p, regime_tributario: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t.settings.impostos.regimePlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIMES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t.settings.impostos.inscricaoMunicipal}</Label>
                  <Input
                    value={form.inscricao_municipal}
                    onChange={(e) => setForm((p) => ({ ...p, inscricao_municipal: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.settings.impostos.inscricaoEstadual}</Label>
                  <Input
                    value={form.inscricao_estadual}
                    onChange={(e) => setForm((p) => ({ ...p, inscricao_estadual: e.target.value }))}
                  />
                </div>
              </div>

              <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto">
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {t.settings.impostos.saveBtn}
              </Button>
            </div>
          )}

          {/* ---- Seção: Certificado A1 ---- */}
          {section === 'certificado' && (
            <div className="space-y-4">
              {!isRegistered && (
                <Alert className="border-warning/40 bg-warning/10">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    {t.settings.certificado.notRegisteredWarning.split('{link}')[0]}
                    <button
                      type="button"
                      onClick={() => setSection('empresa')}
                      className="font-semibold underline underline-offset-2"
                    >
                      {t.settings.certificado.notRegisteredLink}
                    </button>
                    {t.settings.certificado.notRegisteredWarning.split('{link}')[1]}
                  </AlertDescription>
                </Alert>
              )}

              {hasCertificate && (
                <Alert
                  className={
                    expired
                      ? 'border-destructive/40 bg-destructive/10'
                      : expiringSoon
                        ? 'border-warning/40 bg-warning/10'
                        : 'border-success/40 bg-success/10'
                  }
                >
                  {expired || expiringSoon ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <AlertDescription className="text-xs">
                    {expired
                      ? t.settings.certificado.certExpired.replace(
                          '{date}',
                          settings.certificate_expires_at
                            ? formatDateLib(settings.certificate_expires_at, locale, timezone)
                            : '',
                        )
                      : settings.certificate_expires_at
                        ? t.settings.certificado.certValidUntil.replace(
                            '{date}',
                            formatDateLib(settings.certificate_expires_at, locale, timezone),
                          ) +
                          (expiringSoon
                            ? t.settings.certificado.certExpiringSoon.replace(
                                '{days}',
                                String(expiresDays),
                              )
                            : '.')
                        : t.settings.certificado.certSent}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label>{t.settings.certificado.fileLabel}</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pfx,.p12"
                  onChange={handleCertSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!isRegistered}
                  className="w-full justify-start"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {certFile ? certFile.name : t.settings.certificado.fileBtn}
                </Button>
              </div>

              <div className="space-y-2">
                <Label>{t.settings.certificado.nameLabel}</Label>
                <Input
                  placeholder={t.settings.certificado.namePlaceholder}
                  value={certName}
                  onChange={(e) => setCertName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>{t.settings.certificado.passwordLabel}</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={certPassword}
                    onChange={(e) => setCertPassword(e.target.value)}
                    placeholder={t.settings.certificado.passwordPlaceholder}
                    autoComplete="off"
                    disabled={!isRegistered}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={
                      showPassword
                        ? t.settings.certificado.hidePassword
                        : t.settings.certificado.showPassword
                    }
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.settings.certificado.passwordHint}
                </p>
              </div>

              <Button
                onClick={handleUploadCertificate}
                disabled={!isRegistered || uploadingCert || !certFile || !certPassword.trim()}
                className="w-full sm:w-auto"
              >
                {uploadingCert ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Shield className="h-4 w-4 mr-2" />
                )}
                {t.settings.certificado.uploadBtn}
              </Button>
            </div>
          )}

        </div>
      )}
    </ResponsiveModal>
  );
}
