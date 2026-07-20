import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabaseAnon } from '@/integrations/supabase/anonClient';
import { extractShortCode } from '@/utils/prettyLinks';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { CepLookup } from '@/components/CepLookup';
import { cpfCnpjMask, phoneMask, cepMask } from '@/utils/masks';

// -----------------------------------------------------------------------------
// Tipos do contrato do backend (RPC get_lead_capture_form).
// -----------------------------------------------------------------------------
type FieldKey =
  | 'name' | 'customer_type' | 'document' | 'email' | 'phone' | 'celular'
  | 'company_name' | 'nome_fantasia' | 'zip_code' | 'address' | 'address_number'
  | 'neighborhood' | 'complement' | 'city' | 'state' | 'notes';

interface FieldSetting { enabled?: boolean; required?: boolean }

interface FormPayload {
  title: string;
  description: string | null;
  field_config: Partial<Record<FieldKey, FieldSetting>>;
  require_consent: boolean;
  consent_text: string | null;
  is_active: boolean;
  expired: boolean;
}

interface CompanySettingsPayload {
  white_label_enabled?: boolean;
  white_label_primary_color?: string | null;
  white_label_logo_url?: string | null;
  white_label_icon_url?: string | null;
  name?: string | null;
  logo_url?: string | null;
  language?: string | null;
}

interface RpcResult {
  form: FormPayload;
  company_settings: CompanySettingsPayload;
}

// -----------------------------------------------------------------------------
// i18n leve: só o chrome da tela. Rótulos de campo ficam em PT-BR (contexto
// regulatório brasileiro). Idioma vem de company_settings.language.
// -----------------------------------------------------------------------------
type Lang = 'pt-br' | 'en' | 'es' | 'fr';
function normalizeLang(l?: string | null): Lang {
  const v = (l ?? '').toLowerCase();
  if (v.startsWith('en')) return 'en';
  if (v.startsWith('es')) return 'es';
  if (v.startsWith('fr')) return 'fr';
  return 'pt-br';
}

const UI = {
  'pt-br': {
    submit: 'Enviar cadastro', sending: 'Enviando...',
    successTitle: 'Cadastro enviado com sucesso',
    successBody: 'Recebemos seus dados. Em breve entraremos em contato.',
    notFoundTitle: 'Formulário não encontrado',
    notFoundBody: 'Confira o link e tente novamente.',
    unavailableTitle: 'Formulário indisponível',
    unavailableBody: 'Este formulário não está mais disponível.',
    requiredMsg: 'Preencha os campos obrigatórios.',
    consentMsg: 'É preciso aceitar os termos para enviar.',
    consentFallback: 'Autorizo o contato e o tratamento dos meus dados para fins de atendimento, conforme a Lei Geral de Proteção de Dados (LGPD).',
    optional: '(opcional)',
    pf: 'Pessoa física', pj: 'Pessoa jurídica',
  },
  en: {
    submit: 'Submit', sending: 'Sending...',
    successTitle: 'Registration sent successfully',
    successBody: 'We received your details. We will contact you soon.',
    notFoundTitle: 'Form not found',
    notFoundBody: 'Please check the link and try again.',
    unavailableTitle: 'Form unavailable',
    unavailableBody: 'This form is no longer available.',
    requiredMsg: 'Please fill in the required fields.',
    consentMsg: 'You must accept the terms to submit.',
    consentFallback: 'I authorize contact and the processing of my data for service purposes.',
    optional: '(optional)',
    pf: 'Individual', pj: 'Company',
  },
  es: {
    submit: 'Enviar', sending: 'Enviando...',
    successTitle: 'Registro enviado con éxito',
    successBody: 'Recibimos tus datos. Pronto nos pondremos en contacto.',
    notFoundTitle: 'Formulario no encontrado',
    notFoundBody: 'Verifica el enlace e inténtalo de nuevo.',
    unavailableTitle: 'Formulario no disponible',
    unavailableBody: 'Este formulario ya no está disponible.',
    requiredMsg: 'Completa los campos obligatorios.',
    consentMsg: 'Debes aceptar los términos para enviar.',
    consentFallback: 'Autorizo el contacto y el tratamiento de mis datos con fines de atención.',
    optional: '(opcional)',
    pf: 'Persona física', pj: 'Persona jurídica',
  },
  fr: {
    submit: 'Envoyer', sending: 'Envoi...',
    successTitle: 'Inscription envoyée avec succès',
    successBody: 'Nous avons reçu vos informations. Nous vous contacterons bientôt.',
    notFoundTitle: 'Formulaire introuvable',
    notFoundBody: 'Vérifiez le lien et réessayez.',
    unavailableTitle: 'Formulaire indisponible',
    unavailableBody: 'Ce formulaire n`est plus disponible.',
    requiredMsg: 'Veuillez remplir les champs obligatoires.',
    consentMsg: 'Vous devez accepter les conditions pour envoyer.',
    consentFallback: 'J`autorise le contact et le traitement de mes données à des fins de service.',
    optional: '(facultatif)',
    pf: 'Particulier', pj: 'Entreprise',
  },
} as const;

const FIELD_LABELS: Record<FieldKey, string> = {
  name: 'Nome', customer_type: 'Tipo de cliente', document: 'CPF / CNPJ',
  email: 'E-mail', phone: 'Telefone', celular: 'Celular',
  company_name: 'Razão social', nome_fantasia: 'Nome fantasia',
  zip_code: 'CEP', address: 'Endereço', address_number: 'Número',
  neighborhood: 'Bairro', complement: 'Complemento', city: 'Cidade',
  state: 'Estado (UF)', notes: 'Observações',
};

// Ordem de exibição estável.
const FIELD_ORDER: FieldKey[] = [
  'name', 'customer_type', 'document', 'company_name', 'nome_fantasia',
  'email', 'phone', 'celular', 'zip_code', 'address', 'address_number',
  'neighborhood', 'complement', 'city', 'state', 'notes',
];

// -----------------------------------------------------------------------------
// White-label: aplica a marca DO DONO DO LINK via CSS var, SEM cachear (regra-lei
// #2 / incidente 1.8.4). Espelha applyCompany de TechnicianOS. Cleanup restaura
// do cache do viewer logado (se houver) ou remove — nunca escreve o cache.
// -----------------------------------------------------------------------------
function hexToHsl(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export default function PublicLeadCapture() {
  const { code } = useParams<{ code: string }>();

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<RpcResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [values, setValues] = useState<Partial<Record<FieldKey, string>>>({});
  const [customerType, setCustomerType] = useState<'pf' | 'pj'>('pf');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const honeypotRef = useRef('');

  const shortCode = useMemo(() => extractShortCode(code) ?? code ?? '', [code]);
  const lang = normalizeLang(result?.company_settings?.language);
  const ui = UI[lang];

  // Aplica white-label do dono do link. SEM cachear.
  const applyCompanyBrand = useCallback((cs: CompanySettingsPayload | null) => {
    const root = document.documentElement.style;
    if (cs?.white_label_enabled && cs.white_label_primary_color) {
      const hsl = hexToHsl(cs.white_label_primary_color);
      if (hsl) {
        root.setProperty('--primary', hsl);
        root.setProperty('--ring', hsl);
      }
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabaseAnon.rpc('get_lead_capture_form' as any, {
          p_short_code: shortCode,
        });
        if (!alive) return;
        if (error || !data) {
          setNotFound(true);
          return;
        }
        const parsed = data as unknown as RpcResult;
        setResult(parsed);
        applyCompanyBrand(parsed.company_settings ?? null);
      } catch {
        if (alive) setNotFound(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      // Cleanup: restaura a marca DO VIEWER LOGADO a partir do cache, se houver;
      // nunca escreve o cache (não vaza a marca do dono do link pra outro tenant).
      const root = document.documentElement.style;
      try {
        const cached = localStorage.getItem('__wl_primary');
        if (cached) {
          root.setProperty('--primary', cached);
          root.setProperty('--ring', cached);
        } else {
          root.removeProperty('--primary');
          root.removeProperty('--ring');
        }
      } catch {
        root.removeProperty('--primary');
        root.removeProperty('--ring');
      }
    };
  }, [shortCode, applyCompanyBrand]);

  const form = result?.form ?? null;
  const cs = result?.company_settings ?? null;
  const config = form?.field_config ?? {};

  const enabledFields = FIELD_ORDER.filter((k) => config[k]?.enabled);
  const isRequired = (k: FieldKey) => !!config[k]?.required;

  const setValue = (k: FieldKey, v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  const maskFor = (k: FieldKey, raw: string): string => {
    if (k === 'document') return cpfCnpjMask(raw);
    if (k === 'phone' || k === 'celular') return phoneMask(raw);
    if (k === 'zip_code') return cepMask(raw);
    if (k === 'state') return raw.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase();
    return raw;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setErrorMsg(null);

    // Validação de obrigatórios no client (UX; edge revalida).
    for (const k of enabledFields) {
      if (k === 'customer_type') continue;
      if (isRequired(k) && !(values[k]?.trim())) {
        setErrorMsg(ui.requiredMsg);
        return;
      }
    }
    if (form.require_consent && !consent) {
      setErrorMsg(ui.consentMsg);
      return;
    }

    // Só envia campos habilitados.
    const fields: Record<string, string> = {};
    for (const k of enabledFields) {
      if (k === 'customer_type') { fields.customer_type = customerType; continue; }
      const v = values[k]?.trim();
      if (v) fields[k] = v;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabaseAnon.functions.invoke('lead-capture-submit', {
        body: {
          short_code: shortCode,
          fields,
          consent: form.require_consent ? consent : true,
          honeypot: honeypotRef.current,
        },
      });
      // functions.invoke lança em status !=2xx; a msg PT-BR vem no corpo do erro.
      if (error) {
        let msg = 'Não foi possível enviar. Tente novamente.';
        try {
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch { /* mantém msg padrão */ }
        setErrorMsg(msg);
        return;
      }
      if ((data as any)?.success) {
        setSubmitted(true);
      } else {
        setErrorMsg((data as any)?.error ?? 'Não foi possível enviar. Tente novamente.');
      }
    } catch {
      setErrorMsg('Não foi possível enviar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Estados de tela
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !form) {
    return (
      <CenterCard>
        <AlertCircle className="mb-3 h-12 w-12 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{UI['pt-br'].notFoundTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{UI['pt-br'].notFoundBody}</p>
      </CenterCard>
    );
  }

  if (!form.is_active || form.expired) {
    return (
      <CenterCard>
        <AlertCircle className="mb-3 h-12 w-12 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{ui.unavailableTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ui.unavailableBody}</p>
      </CenterCard>
    );
  }

  if (submitted) {
    return (
      <CenterCard>
        <CheckCircle2 className="mb-3 h-14 w-14 text-emerald-600" />
        <h1 className="text-lg font-semibold">{ui.successTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ui.successBody}</p>
      </CenterCard>
    );
  }

  const brandName = cs?.name ?? '';
  const brandLogo = (cs?.white_label_enabled && cs?.white_label_logo_url) || cs?.logo_url || null;

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-lg">
        <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex flex-col items-center text-center">
            {brandLogo ? (
              <img src={brandLogo} alt={brandName} className="mb-3 h-12 max-w-[180px] object-contain" />
            ) : null}
            <h1 className="text-xl font-bold">{form.title}</h1>
            {form.description ? (
              <p className="mt-1.5 text-sm text-muted-foreground">{form.description}</p>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Honeypot anti-bot: escondido de humanos, preenchido só por bots. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              defaultValue=""
              onChange={(e) => { honeypotRef.current = e.target.value; }}
              style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
            />

            {enabledFields.map((k) => {
              const req = isRequired(k);
              const labelNode = (
                <Label htmlFor={`lcf-${k}`}>
                  {FIELD_LABELS[k]}
                  {req ? <span className="ml-0.5 text-destructive">*</span> : (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">{ui.optional}</span>
                  )}
                </Label>
              );

              if (k === 'customer_type') {
                return (
                  <div key={k} className="space-y-1.5">
                    <Label>{FIELD_LABELS[k]}</Label>
                    <div>
                      <LabeledSwitch
                        value={customerType}
                        onChange={(v) => setCustomerType(v)}
                        off={{ value: 'pf', label: ui.pf }}
                        on={{ value: 'pj', label: ui.pj }}
                        aria-label={FIELD_LABELS[k]}
                      />
                    </div>
                  </div>
                );
              }

              if (k === 'zip_code') {
                return (
                  <div key={k} className="space-y-1.5">
                    {labelNode}
                    <CepLookup
                      value={values.zip_code ?? ''}
                      onChange={(v) => setValue('zip_code', v)}
                      onAddressFound={(addr) => {
                        setValues((prev) => ({
                          ...prev,
                          address: addr.logradouro || prev.address,
                          neighborhood: addr.bairro || prev.neighborhood,
                          city: addr.cidade || prev.city,
                          state: addr.estado || prev.state,
                        }));
                      }}
                    />
                  </div>
                );
              }

              if (k === 'notes') {
                return (
                  <div key={k} className="space-y-1.5">
                    {labelNode}
                    <Textarea
                      id={`lcf-${k}`}
                      value={values.notes ?? ''}
                      onChange={(e) => setValue('notes', e.target.value)}
                      rows={3}
                    />
                  </div>
                );
              }

              const inputMode =
                k === 'document' || k === 'phone' || k === 'celular' ? 'numeric' : undefined;
              const type = k === 'email' ? 'email' : 'text';

              return (
                <div key={k} className="space-y-1.5">
                  {labelNode}
                  <Input
                    id={`lcf-${k}`}
                    type={type}
                    inputMode={inputMode}
                    value={values[k] ?? ''}
                    onChange={(e) => setValue(k, maskFor(k, e.target.value))}
                    required={req}
                  />
                </div>
              );
            })}

            {form.require_consent ? (
              <label className="flex items-start gap-2.5 rounded-lg border p-3">
                <Checkbox
                  checked={consent}
                  onCheckedChange={(v) => setConsent(v === true)}
                  className="mt-0.5"
                />
                <span className="text-xs text-muted-foreground">
                  {form.consent_text?.trim() || ui.consentFallback}
                </span>
              </label>
            ) : null}

            {errorMsg ? (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            ) : null}

            <Button type="submit" className="w-full gap-2" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? ui.sending : ui.submit}
            </Button>
          </form>
        </div>
        {brandName ? (
          <p className="mt-4 text-center text-xs text-muted-foreground">{brandName}</p>
        ) : null}
      </div>
    </div>
  );
}

function CenterCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="flex w-full max-w-md flex-col items-center rounded-2xl border bg-card p-8 text-center shadow-sm">
        {children}
      </div>
    </div>
  );
}
