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
import { Switch } from '@/components/ui/switch';
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
import { invokeFisqal } from '@/utils/fisqalEdge';
import { TaxCodeCombobox } from '@/components/fiscal/TaxCodeCombobox';

/** Seções internas do modal de configuração fiscal. */
export type FiscalSettingsSection = 'empresa' | 'certificado' | 'impostos' | 'cobertura';

interface FiscalSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Seção aberta inicialmente (deep-link, ex: banner de certificado). */
  initialSection?: FiscalSettingsSection;
}

const SECTIONS: { value: FiscalSettingsSection; label: string; icon: LucideIcon }[] = [
  { value: 'empresa', label: 'Empresa', icon: Building2 },
  { value: 'impostos', label: 'Impostos', icon: Info },
  { value: 'certificado', label: 'Certificado A1', icon: Shield },
  { value: 'cobertura', label: 'Ativação', icon: MapPin },
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
  fiscal_ambiente: 'homologacao',
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
  const [section, setSection] = useState<FiscalSettingsSection>(initialSection ?? 'empresa');
  const [form, setForm] = useState<FiscalForm>(EMPTY_FORM);
  const hydrated = useRef(false);

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
      setForm({
        regime_tributario: settings.regime_tributario || 'simples_nacional',
        inscricao_municipal: settings.inscricao_municipal || '',
        inscricao_estadual: settings.inscricao_estadual || '',
        codigo_servico_default: settings.codigo_servico_default || '',
        codigo_nbs_default: settings.codigo_nbs_default || '',
        item_lc116: settings.item_lc116 || '',
        iss_aliquota: settings.iss_aliquota != null ? String(settings.iss_aliquota) : '',
        municipio_ibge: settings.municipio_ibge || '',
        fiscal_ambiente: settings.fiscal_ambiente,
      });
    }
  }, [isLoading, settings]);

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

          {/* Pills de seção (rolável no mobile) */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSection(s.value)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* ---- Seção: Empresa ---- */}
          {section === 'empresa' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="space-y-2">
                  <Label>Código IBGE do município</Label>
                  <Input
                    inputMode="numeric"
                    placeholder="7 dígitos (ex: 3550308)"
                    value={form.municipio_ibge}
                    onChange={(e) => setForm((p) => ({ ...p, municipio_ibge: e.target.value }))}
                  />
                </div>
              </div>

              {/* Ambiente */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Ambiente de produção</p>
                  <p className="text-xs text-muted-foreground">
                    {form.fiscal_ambiente === 'producao'
                      ? 'As notas serão emitidas de verdade (produção).'
                      : 'Modo homologação: notas de teste, sem valor fiscal.'}
                  </p>
                </div>
                <Switch
                  checked={form.fiscal_ambiente === 'producao'}
                  onCheckedChange={(checked) =>
                    setForm((p) => ({ ...p, fiscal_ambiente: checked ? 'producao' : 'homologacao' }))
                  }
                />
              </div>

              <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto">
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar dados da empresa
              </Button>
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
                    Ative a emissão de notas (aba Ativação) antes de enviar o certificado.
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
                disabled={uploadingCert || !certFile || !certPassword.trim()}
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

          {/* ---- Seção: Ativação (registro + cobertura) ---- */}
          {section === 'cobertura' && (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Ativar emissão de notas</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {isRegistered ? 'Emissão de notas ativada.' : 'Emissão ainda não ativada.'}
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
                  {isRegistered ? 'Atualizar ativação' : 'Ativar emissão de notas'}
                </Button>
              </div>

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
            </div>
          )}
        </div>
      )}
    </ResponsiveModal>
  );
}
