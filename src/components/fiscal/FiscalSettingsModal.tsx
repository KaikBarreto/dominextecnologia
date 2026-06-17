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
import { TaxCodeCombobox } from '@/components/fiscal/TaxCodeCombobox';
import { CepLookup } from '@/components/CepLookup';
import { StateCitySelector } from '@/components/StateCitySelector';

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
const SECTIONS: { value: FiscalSettingsSection; label: string; icon: LucideIcon; step: number }[] = [
  { value: 'empresa', label: 'Empresa', icon: Building2, step: 1 },
  { value: 'certificado', label: 'Certificado A1', icon: Shield, step: 2 },
  { value: 'impostos', label: 'Impostos', icon: Info, step: 3 },
];

const REGIMES = [
  { value: 'simples_nacional', label: 'Simples Nacional' },
  { value: 'lucro_presumido', label: 'Lucro Presumido' },
  { value: 'lucro_real', label: 'Lucro Real' },
  { value: 'mei', label: 'MEI' },
];

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

/** Converte string crua → number ou null (sem prender 0). */
function num(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/** Dias até a validade do certificado. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function FiscalSettingsModal({ open, onOpenChange, initialSection }: FiscalSettingsModalProps) {
  const { settings, isLoading, save, isSaving, invalidate } = useFiscalSettings();
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

  // Ações de onboarding
  const [registering, setRegistering] = useState(false);
  const [checkingCoverage, setCheckingCoverage] = useState(false);
  const [coverageResult, setCoverageResult] = useState<{ pode: boolean; municipio: string | null } | null>(null);

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

  // Salva impostos / ambiente (company_fiscal_settings via useFiscalSettings).
  const handleSave = async () => {
    const payload: Partial<FiscalSettingsEditable> = {
      regime_tributario: form.regime_tributario || null,
      inscricao_municipal: form.inscricao_municipal.trim() || null,
      inscricao_estadual: form.inscricao_estadual.trim() || null,
      codigo_servico_default: form.codigo_servico_default.trim() || null,
      codigo_nbs_default: form.codigo_nbs_default.trim() || null,
      item_lc116: form.item_lc116.trim() || null,
      iss_aliquota: num(form.iss_aliquota),
      municipio_ibge: form.municipio_ibge.trim() || null,
      fiscal_ambiente: form.fiscal_ambiente,
    };
    try {
      await save(payload);
      toast.success('Configurações fiscais salvas.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar as configurações fiscais.');
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
      toast.success('Dados da empresa salvos.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar os dados da empresa.');
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
      toast.error('Selecione o arquivo do certificado.');
      return;
    }
    if (!certPassword.trim()) {
      toast.error('Informe a senha do certificado.');
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
        toast.error(res.message ?? 'Falha ao enviar o certificado.');
        return;
      }
      toast.success(res.message ?? 'Certificado enviado com sucesso.');
      setCertFile(null);
      setCertPassword('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      invalidate();
    } finally {
      setUploadingCert(false);
    }
  };

  const handleRegisterCompany = async () => {
    setRegistering(true);
    try {
      const res = await invokeFisqal('fisqal-register-company');
      if (!res.ok) {
        toast.error(res.message ?? 'Não foi possível ativar a emissão de notas.');
        return;
      }
      toast.success(res.message ?? 'Emissão de notas ativada com sucesso.');
      invalidate();
    } finally {
      setRegistering(false);
    }
  };

  const handleCheckCoverage = async () => {
    const ibge = form.municipio_ibge.trim();
    setCheckingCoverage(true);
    setCoverageResult(null);
    try {
      const res = await invokeFisqal<{ pode_emitir?: boolean; municipio?: string | null }>(
        'fisqal-check-coverage',
        ibge ? { ibge } : undefined,
      );
      if (!res.ok) {
        toast.error(res.message ?? 'Falha ao verificar a cobertura.');
        return;
      }
      const pode = res.data?.pode_emitir === true;
      setCoverageResult({ pode, municipio: res.data?.municipio ?? null });
      if (res.message) (pode ? toast.success : toast.warning)(res.message);
      invalidate();
    } finally {
      setCheckingCoverage(false);
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
      title="Configurações fiscais"
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
                <CheckCircle2 className="h-3.5 w-3.5" /> Apto a emitir
              </Badge>
            )}
          </div>

          {/* Navegação por passos (estilo EcoSistema): grade de abas com nº do
              passo, ícone e indicador de estado (cadeado quando bloqueado /
              check quando concluído). Mobile-first: rótulo encolhe pro ícone. */}
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
                  ? 'Passo 1 de 2: preencha os dados e registre a empresa. Só depois libera o certificado.'
                  : 'Passo 2 de 2: com a empresa já registrada, envie o certificado A1 (.pfx/.p12).'}
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
                  <Label>Razão social / Nome</Label>
                  <Input
                    placeholder="Nome da empresa"
                    value={form.razao_social}
                    onChange={(e) => setForm((p) => ({ ...p, razao_social: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CNPJ</Label>
                  <Input
                    inputMode="numeric"
                    placeholder="00.000.000/0000-00"
                    value={form.cnpj}
                    onChange={(e) => setForm((p) => ({ ...p, cnpj: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Regime tributário</Label>
                  <Select
                    value={form.regime_tributario}
                    onValueChange={(v) => setForm((p) => ({ ...p, regime_tributario: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
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
                  <Label>Inscrição Municipal</Label>
                  <Input
                    value={form.inscricao_municipal}
                    onChange={(e) => setForm((p) => ({ ...p, inscricao_municipal: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Inscrição Estadual</Label>
                  <Input
                    value={form.inscricao_estadual}
                    onChange={(e) => setForm((p) => ({ ...p, inscricao_estadual: e.target.value }))}
                  />
                </div>
              </div>

              {/* Endereço fiscal — CEP preenche logradouro/bairro/cidade/UF +
                  código IBGE do município (sem campo manual de IBGE). */}
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Endereço fiscal</p>
                </div>
                <div className="space-y-2">
                  <Label>CEP</Label>
                  <CepLookup
                    value={form.cep}
                    onChange={(cep) => setForm((p) => ({ ...p, cep }))}
                    onAddressFound={handleAddressFound}
                  />
                  <p className="text-xs text-muted-foreground">
                    Preenche endereço, cidade e o código do município automaticamente.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="space-y-2 sm:col-span-3">
                    <Label>Logradouro</Label>
                    <Input
                      value={form.logradouro}
                      onChange={(e) => setForm((p) => ({ ...p, logradouro: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Número</Label>
                    <Input
                      value={form.numero}
                      onChange={(e) => setForm((p) => ({ ...p, numero: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Complemento</Label>
                    <Input
                      value={form.complemento}
                      onChange={(e) => setForm((p) => ({ ...p, complemento: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Bairro</Label>
                    <Input
                      value={form.bairro}
                      onChange={(e) => setForm((p) => ({ ...p, bairro: e.target.value }))}
                    />
                  </div>
                </div>
                {/* Cidade/UF: o seletor entrega o código IBGE do município, que
                    é o fallback caso o CEP ainda não traga `ibge`. */}
                <div className="space-y-2">
                  <Label>Cidade / UF</Label>
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
                  <p className="text-sm font-medium">Ambiente de emissão de NFS-e</p>
                  <p className="text-xs text-muted-foreground">
                    {form.fiscal_ambiente === 'producao'
                      ? 'Produção: as notas valem de verdade (têm efeito fiscal).'
                      : 'Homologação: notas de teste, sem valor fiscal.'}
                  </p>
                </div>
                <LabeledSwitch
                  value={form.fiscal_ambiente}
                  onChange={(v) => setForm((p) => ({ ...p, fiscal_ambiente: v }))}
                  off={{ value: 'homologacao', label: 'Homologação' }}
                  on={{ value: 'producao', label: 'Produção' }}
                  size="default"
                  aria-label="Ambiente de emissão de NFS-e"
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
                Salvar dados da empresa
              </Button>

              {/* Status do onboarding (realocado da antiga aba "Ativação"). */}
              <div className="flex flex-col gap-2 rounded-lg border p-3">
                <p className="text-sm font-medium">Status da emissão</p>
                <div className="flex items-center gap-2 text-xs">
                  {isRegistered ? (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-warning shrink-0" />
                  )}
                  <span className="text-muted-foreground">
                    Empresa: {isRegistered ? 'registrada' : 'não registrada'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {hasCertificate ? (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-warning shrink-0" />
                  )}
                  <span className="text-muted-foreground">
                    Certificado: {hasCertificate ? 'enviado' : 'pendente'}
                  </span>
                </div>
              </div>

              {/* Registrar empresa na Fisqal (precede o certificado).
                  Edge fisqal-register-company; só depois o certificado é liberado.
                  Botão ÚNICO — não duplicar. */}
              <div className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Registrar empresa para emissão</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {isRegistered
                        ? 'Empresa registrada — já pode subir o certificado.'
                        : 'Salve os dados acima e registre a empresa antes do certificado.'}
                    </p>
                  </div>
                  {isRegistered && <CheckCircle2 className="h-5 w-5 text-success shrink-0" />}
                </div>
                <Button
                  variant="outline"
                  onClick={handleRegisterCompany}
                  disabled={registering}
                  className="w-full sm:w-auto"
                >
                  {registering ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Building2 className="h-4 w-4 mr-2" />}
                  {isRegistered ? 'Atualizar registro da empresa' : 'Registrar empresa'}
                </Button>
              </div>

              {/* Cobertura do município (realocado da antiga aba "Ativação"). */}
              <div className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Cobertura do município</p>
                  <p className="text-xs text-muted-foreground">
                    Confere se o seu município já emite NFS-e pela integração.
                  </p>
                </div>
                {coverageResult && (
                  <Alert
                    className={
                      coverageResult.pode
                        ? 'border-success/40 bg-success/10'
                        : 'border-destructive/40 bg-destructive/10'
                    }
                  >
                    {coverageResult.pode ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    <AlertDescription className="text-xs">
                      {coverageResult.pode
                        ? `${coverageResult.municipio ?? 'Seu município'} já permite emissão de NFS-e.`
                        : `${coverageResult.municipio ?? 'Seu município'} ainda não permite emissão de NFS-e.`}
                    </AlertDescription>
                  </Alert>
                )}
                <Button
                  variant="outline"
                  onClick={handleCheckCoverage}
                  disabled={checkingCoverage}
                  className="w-full sm:w-auto"
                >
                  {checkingCoverage ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MapPin className="h-4 w-4 mr-2" />}
                  Verificar cobertura
                </Button>
              </div>

              {isRegistered && (
                <Button onClick={() => setSection('certificado')} className="w-full sm:w-auto">
                  Próximo: enviar certificado <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          )}

          {/* ---- Seção: Impostos ---- */}
          {section === 'impostos' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Alíquota de ISS (%)</Label>
                  <Input
                    inputMode="decimal"
                    placeholder="Ex: 5"
                    value={form.iss_aliquota}
                    onChange={(e) => setForm((p) => ({ ...p, iss_aliquota: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Código de serviço</Label>
                  <TaxCodeCombobox
                    type="servico"
                    value={form.codigo_servico_default}
                    onSelect={(codigo, item) =>
                      setForm((p) => ({
                        ...p,
                        codigo_servico_default: codigo,
                        // Preenche o item da LC 116 quando o código traz essa info.
                        item_lc116: item?.itemLc116 ? String(item.itemLc116) : p.item_lc116,
                      }))
                    }
                    placeholder="Buscar por código ou descrição..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Digite o código ou parte da descrição para buscar.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Código NBS</Label>
                  <TaxCodeCombobox
                    type="nbs"
                    value={form.codigo_nbs_default}
                    onSelect={(codigo) => setForm((p) => ({ ...p, codigo_nbs_default: codigo }))}
                    placeholder="Digite ao menos 2 caracteres..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Opcional. Busca por código ou descrição (mín. 2 caracteres).
                  </p>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Item da LC 116</Label>
                  <Input
                    placeholder="Ex: 14.01"
                    value={form.item_lc116}
                    onChange={(e) => setForm((p) => ({ ...p, item_lc116: e.target.value }))}
                  />
                </div>
              </div>

              <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto">
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar impostos
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
                    Registre a empresa antes de subir o certificado. Volte ao passo{' '}
                    <button
                      type="button"
                      onClick={() => setSection('empresa')}
                      className="font-semibold underline underline-offset-2"
                    >
                      1. Empresa
                    </button>{' '}
                    e registre a empresa primeiro.
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
                      ? `Certificado vencido em ${formatDate(settings.certificate_expires_at)}. Envie um novo.`
                      : settings.certificate_expires_at
                        ? `Certificado válido até ${formatDate(settings.certificate_expires_at)}${
                            expiringSoon ? ` — vence em ${expiresDays} dia(s).` : '.'
                          }`
                        : 'Certificado enviado.'}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label>Arquivo do certificado</Label>
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
                  {certFile ? certFile.name : 'Selecionar arquivo (.pfx / .p12)'}
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Nome do certificado (opcional)</Label>
                <Input
                  placeholder="Ex: Certificado da empresa"
                  value={certName}
                  onChange={(e) => setCertName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Senha do certificado</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={certPassword}
                    onChange={(e) => setCertPassword(e.target.value)}
                    placeholder="Senha do arquivo .pfx/.p12"
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
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use a senha do próprio certificado, não a senha do sistema.
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
                Enviar certificado
              </Button>
            </div>
          )}

        </div>
      )}
    </ResponsiveModal>
  );
}
