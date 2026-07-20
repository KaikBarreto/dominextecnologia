import { useEffect, useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { buildSlugSegment } from '@/utils/prettyLinks';
import {
  LEAD_CAPTURE_FIELDS,
  type LeadCaptureFieldConfig,
  type LeadCaptureFieldKey,
  type LeadCaptureForm,
  type LeadCaptureFormInput,
} from '@/hooks/useLeadCaptureForms';

const FIELD_LABELS: Record<LeadCaptureFieldKey, string> = {
  name: 'Nome',
  customer_type: 'Tipo de cliente (PF/PJ)',
  document: 'CPF / CNPJ',
  email: 'E-mail',
  phone: 'Telefone',
  celular: 'Celular',
  company_name: 'Razão social',
  nome_fantasia: 'Nome fantasia',
  zip_code: 'CEP',
  address: 'Endereço',
  address_number: 'Número',
  neighborhood: 'Bairro',
  complement: 'Complemento',
  city: 'Cidade',
  state: 'Estado (UF)',
  notes: 'Observações',
};

const DEFAULT_CONSENT_TEXT =
  'Autorizo o contato e o tratamento dos meus dados para fins de atendimento, conforme a Lei Geral de Proteção de Dados (LGPD).';

interface LeadCaptureFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: LeadCaptureForm | null;
  onSubmit: (data: LeadCaptureFormInput) => Promise<void> | void;
  isLoading?: boolean;
}

function buildInitialConfig(form: LeadCaptureForm | null): LeadCaptureFieldConfig {
  const cfg = (form?.field_config as LeadCaptureFieldConfig | null) ?? null;
  const result: LeadCaptureFieldConfig = {};
  for (const key of LEAD_CAPTURE_FIELDS) {
    const existing = cfg?.[key];
    if (existing) {
      result[key] = { enabled: !!existing.enabled, required: !!existing.required };
    } else if (!form) {
      // Novo formulário: só "Nome" já vem habilitado e obrigatório.
      result[key] = { enabled: key === 'name', required: key === 'name' };
    } else {
      result[key] = { enabled: false, required: false };
    }
  }
  return result;
}

/** Converte ISO (com timezone) para o valor de <input type="datetime-local">. */
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LeadCaptureFormDialog({
  open,
  onOpenChange,
  form,
  onSubmit,
  isLoading,
}: LeadCaptureFormDialogProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState('geral');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');
  const [requireConsent, setRequireConsent] = useState(true);
  const [consentText, setConsentText] = useState('');
  const [fieldConfig, setFieldConfig] = useState<LeadCaptureFieldConfig>(buildInitialConfig(null));

  useEffect(() => {
    if (!open) return;
    setTab('geral');
    setTitle(form?.title ?? '');
    setDescription(form?.description ?? '');
    setIsActive(form?.is_active ?? true);
    setExpiresAt(isoToLocalInput(form?.expires_at));
    setRequireConsent(form?.require_consent ?? true);
    setConsentText(form?.consent_text ?? '');
    setFieldConfig(buildInitialConfig(form));
  }, [open, form]);

  const setField = (key: LeadCaptureFieldKey, patch: Partial<{ enabled: boolean; required: boolean }>) => {
    setFieldConfig((prev) => {
      const current = prev[key] ?? { enabled: false, required: false };
      const next = { ...current, ...patch };
      // required só faz sentido quando o campo está habilitado.
      if (!next.enabled) next.required = false;
      return { ...prev, [key]: next };
    });
  };

  const handleCopyLink = () => {
    if (!form?.short_code) {
      toast({
        variant: 'destructive',
        title: 'Salve o formulário primeiro',
        description: 'O link é gerado depois que o formulário é criado.',
      });
      return;
    }
    const segment = buildSlugSegment([form.title], form.short_code, 'cadastro');
    const url = `${window.location.origin}/cadastro/${segment}`;
    navigator.clipboard?.writeText(url).then(
      () => toast({ title: 'Link gerado e copiado!' }),
      () => toast({ title: 'Link gerado', description: url }),
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setTab('geral');
      toast({ variant: 'destructive', title: 'Informe um título para o formulário' });
      return;
    }
    // Garante ao menos um campo habilitado.
    const anyEnabled = Object.values(fieldConfig).some((f) => f?.enabled);
    if (!anyEnabled) {
      setTab('campos');
      toast({ variant: 'destructive', title: 'Habilite ao menos um campo do formulário' });
      return;
    }

    const cleanConfig: LeadCaptureFieldConfig = {};
    for (const key of LEAD_CAPTURE_FIELDS) {
      const f = fieldConfig[key];
      if (f?.enabled) cleanConfig[key] = { enabled: true, required: !!f.required };
    }

    await onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      field_config: cleanConfig,
      is_active: isActive,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      require_consent: requireConsent,
      consent_text: requireConsent ? consentText.trim() || null : null,
    });
    onOpenChange(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={form ? 'Editar formulário' : 'Novo formulário de captação'}
      description="Compartilhe um link público para o cliente se cadastrar sozinho."
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          {form?.short_code ? (
            <Button type="button" variant="outline" onClick={handleCopyLink} className="gap-2">
              <Link2 className="h-4 w-4" />
              Gerar e copiar link
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={handleSave} disabled={isLoading} className="gap-2">
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      }
    >
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="campos">Campos</TabsTrigger>
          <TabsTrigger value="lgpd">LGPD</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="lcf-title">Título</Label>
            <Input
              id="lcf-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Cadastro de novos clientes"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lcf-desc">Descrição (opcional)</Label>
            <Textarea
              id="lcf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Texto que aparece no topo do formulário público"
              rows={3}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Formulário ativo</p>
              <p className="text-xs text-muted-foreground">Desative para pausar os cadastros sem apagar o link.</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Formulário ativo" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lcf-expires">Expira em (opcional)</Label>
            <Input
              id="lcf-expires"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Depois dessa data o link deixa de aceitar cadastros.</p>
          </div>
        </TabsContent>

        <TabsContent value="campos" className="pt-2">
          <p className="mb-3 text-xs text-muted-foreground">
            Escolha quais campos aparecem no formulário e quais são obrigatórios.
          </p>
          <div className="rounded-xl border bg-card">
            {LEAD_CAPTURE_FIELDS.map((key, idx) => {
              const f = fieldConfig[key] ?? { enabled: false, required: false };
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between gap-3 px-3 py-3 ${idx > 0 ? 'border-t' : ''}`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{FIELD_LABELS[key]}</span>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>Exibir</span>
                      <Switch
                        checked={f.enabled}
                        onCheckedChange={(v) => setField(key, { enabled: v })}
                        aria-label={`Exibir ${FIELD_LABELS[key]}`}
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>Obrigatório</span>
                      <Switch
                        checked={f.required}
                        disabled={!f.enabled}
                        onCheckedChange={(v) => setField(key, { required: v })}
                        aria-label={`${FIELD_LABELS[key]} obrigatório`}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="lgpd" className="space-y-4 pt-2">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Exigir consentimento</p>
              <p className="text-xs text-muted-foreground">
                O cliente precisa marcar a caixa de aceite antes de enviar (recomendado).
              </p>
            </div>
            <Switch checked={requireConsent} onCheckedChange={setRequireConsent} aria-label="Exigir consentimento" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lcf-consent">Texto do consentimento</Label>
            <Textarea
              id="lcf-consent"
              value={consentText}
              onChange={(e) => setConsentText(e.target.value)}
              placeholder={DEFAULT_CONSENT_TEXT}
              rows={3}
              disabled={!requireConsent}
            />
            <p className="text-xs text-muted-foreground">
              Se ficar em branco, usamos um texto padrão de aceite conforme a LGPD.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </ResponsiveModal>
  );
}
